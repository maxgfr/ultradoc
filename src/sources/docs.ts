import { join } from "node:path";
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import type { RunContext, SourceResult, EvidenceItem } from "../types.js";
import { readText } from "../walk.js";
import { buildMatcher } from "../util.js";
import { envInt } from "../config.js";
import { fetchAndExtract, excerptsFromText, nearestHeading } from "./fetch.js";

type RawItem = Omit<EvidenceItem, "id">;

// Ranking boosts for in-repo docs: an entry-point doc (README/guide/…) and one
// inside the canonical docs tree outrank scattered .md files.
const DOCS_ENTRY_BOOST = 1.2;
const DOCS_ROOT_BOOST = 1.5;

// How long a cached external-docs page is trusted before a refetch (a docs site
// updates, and the page is keyed by URL only). Overridable; default one week.
function extdocsTtlMs(): number {
  return envInt("ULTRADOC_EXTDOCS_TTL_HOURS", 168) * 3600_000;
}

// Fetch an external docs page, caching the extracted text per repo under
// .ultradoc/extdocs/. The page content depends only on the URL (not the
// question), so this turns repeated questions about the same repo into a single
// network fetch — the excerpting still runs per-question on the cached text. The
// cache expires after a TTL so an updated page is eventually refetched; if the
// refetch fails, the stale copy is served rather than losing the docs entirely.
// Exported for testing.
export async function getDocText(repoDir: string, url: string): Promise<{ text: string; note?: string }> {
  const dir = join(repoDir, ".ultradoc", "extdocs");
  // .v2: the extraction format changed (heading markers) — older cached text
  // would silently lack section context.
  const file = join(dir, url.replace(/[^a-z0-9]+/gi, "_").slice(0, 100) + ".v2.txt");
  let cached: string | undefined;
  let fresh = false;
  try {
    if (existsSync(file)) {
      cached = readFileSync(file, "utf8");
      fresh = Date.now() - statSync(file).mtimeMs < extdocsTtlMs();
    }
  } catch {
    /* fall through to a live fetch */
  }
  if (cached !== undefined && fresh) return { text: cached };

  const res = await fetchAndExtract(url);
  if (res.text) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, res.text);
    } catch {
      /* caching is best-effort */
    }
    return res;
  }
  // Refetch failed — fall back to the stale copy rather than dropping the docs.
  if (cached !== undefined) return { text: cached, note: `served a stale cached copy of ${url} (refetch failed)` };
  return res;
}

// The `docs` source. Searches the repo's own documentation (README, docs/**,
// *.md/*.rst …) for the question's keywords and returns prose excerpts. When a
// `--docs-url` is given, the external page is fetched, extracted and searched
// too — so the answer quotes the real documentation, not a memorized API.
export async function docsSource(ctx: RunContext): Promise<SourceResult> {
  const notes: string[] = [];
  const matcher = buildMatcher(ctx.options.question);
  const items: RawItem[] = [];

  const scored: { rel: string; score: number; anchor: number; lines: string[] }[] = [];
  for (const rel of ctx.index.docFiles) {
    // --package scope: only this package's own docs (its README etc.).
    if (ctx.scopeDir && !rel.startsWith(ctx.scopeDir + "/")) continue;
    // Skip docs that ship inside test fixtures, examples, or vendored deps —
    // e.g. a bundled third-party lib's README is never the answer to a question
    // about the host project.
    if (/(^|\/)(tests?|__tests__|spec|specs|fixtures?|examples?|vendor|node_modules|third[-_]?party|deps?|bower_components)\//i.test(rel)) continue;
    const content = readText(join(ctx.repoDir, rel));
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    let bestLine = -1;
    let bestHits = 0;
    const covered = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const here = matcher.matchLine(lines[i]!);
      for (const c of here) covered.add(c);
      if (here.size > bestHits) {
        bestHits = here.size;
        bestLine = i;
      }
    }
    if (covered.size === 0) continue;
    // Boost the canonical docs tree (discovered once at index time) and the
    // usual entry-point docs, so real documentation outranks scattered .md.
    const inDocsRoot = ctx.index.docsRoot ? rel.startsWith(ctx.index.docsRoot + "/") : false;
    const boost = (/readme|getting|guide|usage|tutorial/i.test(rel) ? DOCS_ENTRY_BOOST : 1) * (inDocsRoot ? DOCS_ROOT_BOOST : 1);
    scored.push({ rel, score: covered.size * 3 * boost + bestHits * 0.5, anchor: bestLine, lines });
  }

  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
  for (const d of scored.slice(0, ctx.options.perSource)) {
    const start = Math.max(0, d.anchor - 4);
    const end = Math.min(d.lines.length, d.anchor + 14);
    // Carry the section title so the agent sees which part of the doc the
    // excerpt comes from ("README.md § Retry behaviour"), markdown files only.
    const heading = /\.(md|mdx)$/i.test(d.rel) ? nearestHeading(d.lines, d.anchor) : undefined;
    items.push({
      source: "docs",
      title: heading ? `${d.rel} § ${heading} (in-repo docs)` : `${d.rel} (in-repo docs)`,
      ref: d.rel,
      location: `${d.rel}:${start + 1}-${end}`,
      score: Number(d.score.toFixed(3)),
      snippet: d.lines.slice(start, end).join("\n"),
      url: ctx.repoRef.isLocal ? undefined : `${ctx.repoRef.webUrl}/blob/${ctx.index.commit ?? "HEAD"}/${d.rel}`,
      meta: heading ? { heading } : undefined,
    });
  }

  // External official docs: an explicit --docs-url wins; otherwise fall back to
  // the URL auto-discovered from the repo's own README/manifests at index time.
  const docsUrl = ctx.options.docsUrl ?? ctx.index.docsUrl;
  if (docsUrl) {
    const discovered = !ctx.options.docsUrl;
    const { text, note } = await getDocText(ctx.repoDir, docsUrl);
    if (note) notes.push(note);
    if (text) {
      const label = discovered ? `Official docs (auto-discovered) — ${docsUrl}` : `Official docs — ${docsUrl}`;
      const ext = excerptsFromText(text, docsUrl, label, "docs", ctx.options.question, ctx.options.perSource);
      items.push(...ext);
      if (discovered) notes.push(`Auto-discovered official docs from the repo: ${docsUrl}`);
      if (ext.length === 0) notes.push("Fetched the docs URL but found no keyword matches in it.");
    }
  }

  if (items.length === 0) notes.push("No in-repo documentation matched the question's keywords.");
  return { source: "docs", items, notes };
}

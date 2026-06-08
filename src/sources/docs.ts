import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { RunContext, SourceResult, EvidenceItem } from "../types.js";
import { readText } from "../walk.js";
import { keywords as extractKeywords } from "../util.js";
import { fetchAndExtract, excerptsFromText } from "./fetch.js";

type RawItem = Omit<EvidenceItem, "id">;

// Fetch an external docs page, caching the extracted text per repo under
// .ultradoc/extdocs/. The page content depends only on the URL (not the
// question), so this turns repeated questions about the same repo into a single
// network fetch — the excerpting still runs per-question on the cached text.
async function getDocText(repoDir: string, url: string): Promise<{ text: string; note?: string }> {
  const dir = join(repoDir, ".ultradoc", "extdocs");
  const file = join(dir, url.replace(/[^a-z0-9]+/gi, "_").slice(0, 100) + ".txt");
  try {
    if (existsSync(file)) return { text: readFileSync(file, "utf8") };
  } catch {
    /* fall through to a live fetch */
  }
  const res = await fetchAndExtract(url);
  if (res.text) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, res.text);
    } catch {
      /* caching is best-effort */
    }
  }
  return res;
}

// The `docs` source. Searches the repo's own documentation (README, docs/**,
// *.md/*.rst …) for the question's keywords and returns prose excerpts. When a
// `--docs-url` is given, the external page is fetched, extracted and searched
// too — so the answer quotes the real documentation, not a memorized API.
export async function docsSource(ctx: RunContext): Promise<SourceResult> {
  const notes: string[] = [];
  const kws = extractKeywords(ctx.options.question).map((k) => k.toLowerCase());
  const items: RawItem[] = [];

  const scored: { rel: string; score: number; anchor: number; lines: string[] }[] = [];
  for (const rel of ctx.index.docFiles) {
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
      const low = lines[i]!.toLowerCase();
      let here = 0;
      for (const kw of kws) if (low.includes(kw)) {
        here++;
        covered.add(kw);
      }
      if (here > bestHits) {
        bestHits = here;
        bestLine = i;
      }
    }
    if (covered.size === 0) continue;
    // Boost the canonical docs tree (discovered once at index time) and the
    // usual entry-point docs, so real documentation outranks scattered .md.
    const inDocsRoot = ctx.index.docsRoot ? rel.startsWith(ctx.index.docsRoot + "/") : false;
    const boost = (/readme|getting|guide|usage|tutorial/i.test(rel) ? 1.2 : 1) * (inDocsRoot ? 1.5 : 1);
    scored.push({ rel, score: covered.size * 3 * boost + bestHits * 0.5, anchor: bestLine, lines });
  }

  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
  for (const d of scored.slice(0, ctx.options.perSource)) {
    const start = Math.max(0, d.anchor - 4);
    const end = Math.min(d.lines.length, d.anchor + 14);
    items.push({
      source: "docs",
      title: `${d.rel} (in-repo docs)`,
      ref: d.rel,
      location: `${d.rel}:${start + 1}-${end}`,
      score: Number(d.score.toFixed(3)),
      snippet: d.lines.slice(start, end).join("\n"),
      url: ctx.repoRef.isLocal ? undefined : `${ctx.repoRef.webUrl}/blob/${ctx.index.commit ?? "HEAD"}/${d.rel}`,
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

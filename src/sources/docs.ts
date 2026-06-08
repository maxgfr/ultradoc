import { join } from "node:path";
import type { RunContext, SourceResult, EvidenceItem } from "../types.js";
import { readText } from "../walk.js";
import { keywords as extractKeywords } from "../util.js";
import { fetchAndExtract, excerptsFromText } from "./fetch.js";

type RawItem = Omit<EvidenceItem, "id">;

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
    const boost = /readme|getting|guide|usage|tutorial/i.test(rel) ? 1.2 : 1;
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

  // Optional external official-docs page.
  if (ctx.options.docsUrl) {
    const { text, note } = await fetchAndExtract(ctx.options.docsUrl);
    if (note) notes.push(note);
    if (text) {
      const ext = excerptsFromText(
        text,
        ctx.options.docsUrl,
        `Official docs — ${ctx.options.docsUrl}`,
        "docs",
        ctx.options.question,
        ctx.options.perSource,
      );
      items.push(...ext);
      if (ext.length === 0) notes.push("Fetched the docs URL but found no keyword matches in it.");
    }
  }

  if (items.length === 0) notes.push("No in-repo documentation matched the question's keywords.");
  return { source: "docs", items, notes };
}

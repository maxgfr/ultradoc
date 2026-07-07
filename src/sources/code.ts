import type { RunContext, SourceResult, StructuralIndex } from "../types.js";
import { LIMITS } from "../config.js";
import { searchCode } from "../index/search.js";
import { semanticSearch } from "../index/semantic.js";
import { rrf } from "../util.js";

// Honest coverage notes when the index was capped, so a partial answer on a huge
// repo is never silent.
export function indexCoverageNotes(index: StructuralIndex): string[] {
  const notes: string[] = [];
  if (index.stats?.truncated) {
    notes.push(`Index capped at ${LIMITS.maxFiles} files — some of this repo was not indexed. Raise ULTRADOC_MAX_FILES for full coverage.`);
  }
  if (index.stats?.symbolCapHits) {
    notes.push(
      `${index.stats.symbolCapHits} file(s) hit the ${LIMITS.symbolsPerFile}-symbol cap. Raise ULTRADOC_MAX_SYMBOLS_PER_FILE if a symbol seems missing.`,
    );
  }
  return notes;
}

// The `code` source: deterministic lexical + structural search (Tier 1). When
// `--semantic` is on and the local stack is reachable, its vector hits are
// fused in via Reciprocal Rank Fusion; otherwise Tier 1 stands alone.
export async function codeSource(ctx: RunContext): Promise<SourceResult> {
  const lexical = searchCode(ctx.repoDir, ctx.repoRef, ctx.index, ctx.options.question, ctx.options.perSource, ctx.scopeDir);
  const coverage = indexCoverageNotes(ctx.index);

  // Typed fallback signals so meta.json can say *why* a run was slow or
  // lexical-only, without string-sniffing the notes.
  const fallbacks: string[] = [];
  if (lexical.fallback === "js-scan") {
    fallbacks.push("code: ripgrep missing — used the built-in JS scanner");
  }

  if (!ctx.options.semantic) {
    return { source: "code", items: lexical.items, notes: [...coverage, ...lexical.notes], fallbacks };
  }

  const sem = await semanticSearch(ctx);
  // Semantic chunks cover the whole repo; honor a --package scope here too.
  if (ctx.scopeDir) sem.items = sem.items.filter((it) => it.ref.startsWith(ctx.scopeDir + "/"));
  if (!sem.available) {
    fallbacks.push("code: semantic backend unavailable — lexical only");
    return {
      source: "code",
      items: lexical.items,
      notes: [...coverage, ...lexical.notes, ...sem.notes],
      fallbacks,
    };
  }

  // Fuse the two rankings by location so neither modality alone decides the
  // result. Keep the richer (lexical) evidence object for each fused key.
  const byKey = new Map<string, SourceResult["items"][number]>();
  for (const it of [...lexical.items, ...sem.items]) {
    const key = it.ref + "@" + (it.location ?? "");
    if (!byKey.has(key)) byKey.set(key, it);
  }
  const fused = rrf([lexical.items, sem.items], (it) => it.ref + "@" + (it.location ?? ""));
  const ranked = [...byKey.values()]
    .map((it) => ({ it, s: fused.get(it.ref + "@" + (it.location ?? "")) ?? 0 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, ctx.options.perSource)
    .map(({ it, s }) => ({ ...it, score: Number(s.toFixed(4)) }));

  return {
    source: "code",
    items: ranked,
    notes: [...coverage, ...lexical.notes, ...sem.notes, "Fused lexical + semantic results (RRF)."],
    fallbacks,
  };
}

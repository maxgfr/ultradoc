import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EvidenceItem, RunContext } from "../../types.js";
import { CACHE_DIR_NAME } from "../../config.js";
import { readText } from "../../walk.js";
import { deserializeEmbeddings, intDot, serializeEmbeddings, type EmbeddingIndex, type RepoScan } from "../../vendor/codeindex-engine.mjs";
import { repoScan } from "../scan.js";
import { codeItem, expandWindow, symbolLabel, symbolsByFile } from "../excerpt.js";

// The vector half of `--semantic`, shared by every keyless tier. A tier only
// has to say how to embed: how an index is built from the scan, and how the
// question is turned into a query vector. Ranking, persistence and turning a
// hit into citable evidence are the same either way.

export interface Encoder {
  /** Names the persisted artifact, so switching tiers rebuilds rather than mixing. */
  tier: "static" | "endpoint";
  buildIndex(scan: RepoScan): Promise<EmbeddingIndex>;
  encodeQuery(query: string): Promise<Int8Array>;
  /** One line for the dossier notes: what searched, and what it can and cannot see. */
  describe(): string;
}

export interface SemanticResult {
  available: boolean;
  items: Omit<EvidenceItem, "id">[];
  notes: string[];
}

function artifactPath(repoDir: string): string {
  return join(repoDir, CACHE_DIR_NAME, "embeddings.bin");
}
function markerPath(repoDir: string): string {
  return join(repoDir, CACHE_DIR_NAME, "embeddings.json");
}

// Reuse the persisted index while the clone sits at the same commit and the same
// tier built it. Anything else rebuilds — a vector index from another commit
// points at lines that have moved.
function loadPersisted(ctx: RunContext, enc: Encoder): EmbeddingIndex | undefined {
  try {
    const marker = JSON.parse(readFileSync(markerPath(ctx.repoDir), "utf8")) as { commit?: string; tier?: string };
    if (marker.tier !== enc.tier || marker.commit !== (ctx.index.commit ?? "HEAD")) return undefined;
    return deserializeEmbeddings(readFileSync(artifactPath(ctx.repoDir)));
  } catch {
    return undefined;
  }
}

function persist(ctx: RunContext, enc: Encoder, index: EmbeddingIndex): void {
  try {
    mkdirSync(dirname(artifactPath(ctx.repoDir)), { recursive: true });
    writeFileSync(artifactPath(ctx.repoDir), serializeEmbeddings(index));
    writeFileSync(markerPath(ctx.repoDir), JSON.stringify({ commit: ctx.index.commit ?? "HEAD", tier: enc.tier, modelId: index.modelId }));
  } catch {
    // A read-only tree still answers; persistence only saves the next run's work.
  }
}

// Rank the embedded units against the question. Deliberately NOT the engine's
// `searchSemantic`: that one already fuses in its own lexical ranking, and
// `codeSource` fuses this result with ultradoc's lexical search — going through
// it would count the lexical signal twice and quietly bias the dossier toward
// keyword matches, which is exactly what `--semantic` exists to escape.
function rankRecords(index: EmbeddingIndex, queryVec: Int8Array, limit: number): { file: string; symbol?: string; line?: number; score: number }[] {
  const scored: { file: string; symbol?: string; line?: number; score: number }[] = [];
  for (const r of index.records) {
    const score = intDot(queryVec, r.vec);
    if (score <= 0) continue;
    scored.push({ file: r.file, symbol: r.symbol, line: r.line, score });
  }
  scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  // One item per file: several symbols of the same file scoring alike would
  // otherwise spend the whole per-source budget on one file.
  const seen = new Set<string>();
  return scored.filter((s) => !seen.has(s.file) && seen.add(s.file)).slice(0, limit);
}

export async function vectorSearch(ctx: RunContext, enc: Encoder): Promise<SemanticResult> {
  const notes: string[] = [];
  const scan = repoScan(ctx.repoDir);

  let index = loadPersisted(ctx, enc);
  if (!index) {
    index = await enc.buildIndex(scan);
    if (!index.records.length) {
      return { available: false, items: [], notes: ["Semantic mode unavailable (nothing embeddable in this repo); used Tier-1 lexical + structural search."] };
    }
    persist(ctx, enc, index);
  }

  const queryVec = await enc.encodeQuery(ctx.options.question);
  const hits = rankRecords(index, queryVec, ctx.options.perSource);
  const symsByFile = symbolsByFile(ctx.index.symbols);

  const items: Omit<EvidenceItem, "id">[] = [];
  for (const hit of hits) {
    const content = readText(join(ctx.repoDir, hit.file));
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    // Anchor on the matching declaration when the unit was one, so the excerpt
    // is the symbol rather than the top of a file that happened to score.
    const sym = hit.symbol ? symsByFile.get(hit.file)?.find((s) => s.name === hit.symbol) : undefined;
    const anchor = sym?.line ?? hit.line ?? 1;
    const end = sym?.endLine ?? anchor + 18;
    const w = expandWindow(lines, Math.max(1, anchor - 1), Math.min(lines.length, end), anchor);
    items.push(
      codeItem({
        ref: ctx.repoRef,
        index: ctx.index,
        rel: hit.file,
        lines,
        start: w.start,
        end: w.end,
        label: sym ? `${symbolLabel(sym)} (semantic match)` : "semantic match",
        score: hit.score,
        meta: { semantic: true, tier: enc.tier, ...(hit.symbol ? { symbol: hit.symbol } : {}) },
      }),
    );
  }

  notes.push(enc.describe());
  return { available: true, items, notes };
}

export function embeddingsExist(repoDir: string): boolean {
  return existsSync(artifactPath(repoDir));
}

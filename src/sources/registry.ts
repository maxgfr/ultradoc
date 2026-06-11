import type { RunContext, SourceResult, SourceKind, EvidenceItem } from "../types.js";
import { SOURCE_ORDER } from "../dossier.js";
import { codeSource } from "./code.js";
import { docsSource } from "./docs.js";
import { releasesSource } from "./releases.js";
import { historySource } from "./history.js";
import { issuesSource, prsSource } from "./issues.js";
import { discussionsSource } from "./discussions.js";
import { stackoverflowSource } from "./stackoverflow.js";
import { webSource } from "./web.js";

type Handler = (ctx: RunContext) => Promise<SourceResult>;

// Registry of retrieval sources. Each is independent and returns ranked
// evidence + honest notes; the dossier assembles them. Sources run
// concurrently — code search is CPU-bound while issues/PRs/web/SO are
// network-bound, so overlapping them cuts wall-clock.
const HANDLERS: Record<SourceKind, Handler> = {
  code: codeSource,
  docs: docsSource,
  release: releasesSource,
  history: historySource,
  issue: issuesSource,
  pr: prsSource,
  discussion: discussionsSource,
  so: stackoverflowSource,
  web: webSource,
};

type RawItem = Omit<EvidenceItem, "id">;

function srcRank(s: SourceKind): number {
  const i = SOURCE_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
}

function normSnippet(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function lineRange(location?: string): { a: number; b: number } | undefined {
  const m = location?.match(/:(\d+)-(\d+)$/);
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a <= b ? { a, b } : undefined;
}

// Is `a` the copy to keep over its duplicate `b`? Doc files belong to the docs
// source (the README excerpt must survive there, not as a down-weighted code
// hit); otherwise the canonical source order wins, then the higher score.
function keeperOver(a: RawItem, b: RawItem, docFiles: Set<string>): boolean {
  const aDocs = a.source === "docs" && docFiles.has(a.ref);
  const bDocs = b.source === "docs" && docFiles.has(b.ref);
  if (aDocs !== bDocs) return aDocs;
  if (srcRank(a.source) !== srcRank(b.source)) return srcRank(a.source) < srcRank(b.source);
  if (a.score !== b.score) return a.score > b.score;
  return a.ref.localeCompare(b.ref) <= 0;
}

// Drop cross-source duplicates so the same evidence can't burn two sources'
// budgets: (a) identical normalized snippets (e.g. the same external page
// excerpted by both `docs` and `web`), (b) same file with excerpt line ranges
// overlapping ≥ 60% (e.g. `code` and `docs` both quoting one README section).
export function dedupeAcrossSources(
  results: SourceResult[],
  docFiles: Set<string>,
): { results: SourceResult[]; dropped: number } {
  const all = results.flatMap((res) => res.items.map((item) => ({ res, item })));
  const droppedItems = new Set<RawItem>();

  // (a) snippet identity
  const bySnippet = new Map<string, { res: SourceResult; item: RawItem }>();
  for (const e of all) {
    const key = normSnippet(e.item.snippet);
    if (!key) continue;
    const prev = bySnippet.get(key);
    if (!prev) {
      bySnippet.set(key, e);
    } else if (keeperOver(e.item, prev.item, docFiles)) {
      droppedItems.add(prev.item);
      bySnippet.set(key, e);
    } else {
      droppedItems.add(e.item);
    }
  }

  // (b) same-ref excerpt overlap across sources
  const byRef = new Map<string, { res: SourceResult; item: RawItem }[]>();
  for (const e of all) {
    if (droppedItems.has(e.item)) continue;
    const group = byRef.get(e.item.ref);
    if (group) group.push(e);
    else byRef.set(e.item.ref, [e]);
  }
  for (const group of byRef.values()) {
    for (let i = 0; i < group.length; i++) {
      const a = group[i]!;
      if (droppedItems.has(a.item)) continue;
      const ra = lineRange(a.item.location);
      if (!ra) continue;
      for (let j = i + 1; j < group.length; j++) {
        const b = group[j]!;
        if (droppedItems.has(b.item) || a.res.source === b.res.source) continue;
        const rb = lineRange(b.item.location);
        if (!rb) continue;
        const inter = Math.min(ra.b, rb.b) - Math.max(ra.a, rb.a) + 1;
        const union = Math.max(ra.b, rb.b) - Math.min(ra.a, rb.a) + 1;
        if (inter > 0 && inter / union >= 0.6) {
          droppedItems.add(keeperOver(a.item, b.item, docFiles) ? b.item : a.item);
        }
      }
    }
  }

  return {
    results: results.map((r) => ({ ...r, items: r.items.filter((it) => !droppedItems.has(it)) })),
    dropped: droppedItems.size,
  };
}

export async function runSources(ctx: RunContext): Promise<SourceResult[]> {
  const cap = ctx.options.perSource;
  const tasks = ctx.options.sources.map(async (kind): Promise<SourceResult> => {
    const handler = HANDLERS[kind];
    if (!handler) return { source: kind, items: [], notes: [`Unknown source "${kind}".`] };
    const t0 = Date.now();
    try {
      const res = await handler(ctx);
      return { ...res, ms: Date.now() - t0 };
    } catch (e) {
      return { source: kind, items: [], notes: [`${kind} source failed: ${(e as Error).message}`], ms: Date.now() - t0 };
    }
  });
  const raw = await Promise.all(tasks);

  // Dedup before capping, so a duplicate can't burn a slot another item needs.
  const { results, dropped } = dedupeAcrossSources(raw, new Set(ctx.index.docFiles));
  if (dropped > 0 && results.length > 0) {
    results[0]!.notes.push(`Dropped ${dropped} cross-source duplicate evidence item(s).`);
  }

  // Enforce the per-source cap uniformly (best-scored first) so one chatty
  // source can't dominate the dossier.
  return results.map((r) => ({
    ...r,
    items: [...r.items].sort((a, b) => b.score - a.score).slice(0, cap),
  }));
}

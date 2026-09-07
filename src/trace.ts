import type { EvidenceItem, RunContext } from "./types.js";
import { deriveIdentifiers } from "./drill-plan.js";
import { symbolEvidence } from "./index/symbols.js";
import { searchCode } from "./index/search.js";
import { indexCoverageNotes } from "./sources/code.js";
import { assignIds } from "./dossier.js";
import { looksLikeTestFile } from "./util.js";

export interface TraceBudget {
  maxDepth: number;
  maxSymbols: number;
  maxEvidence: number;
  maxChars: number;
}

export interface TraceResult {
  seeds: string[];
  evidence: EvidenceItem[];
  notes: string[];
  budget: TraceBudget;
  visited: string[];
  characters: number;
}

export const TRACE_DEFAULTS: TraceBudget = { maxDepth: 2, maxSymbols: 6, maxEvidence: 18, maxChars: 20000 };
const TRACE_LIMITS: TraceBudget = { maxDepth: 4, maxSymbols: 20, maxEvidence: 100, maxChars: 200000 };

// One retrieval interface owns seed resolution, caller traversal, test quotas
// and honest budget cuts. Existing symbol excerpts remain ordinary code
// evidence, validated by the same citation checker as ask/symbol.
export function traceEvidence(ctx: RunContext, name?: string, asked: Partial<TraceBudget> = {}): TraceResult {
  const budget = { ...TRACE_DEFAULTS, ...asked };
  for (const key of Object.keys(budget) as (keyof TraceBudget)[]) {
    const min = key === "maxDepth" ? 0 : 1;
    if (!Number.isSafeInteger(budget[key]) || budget[key] < min || budget[key] > TRACE_LIMITS[key]) {
      throw new Error(`Invalid trace budget ${key}: expected an integer ${min}..${TRACE_LIMITS[key]}`);
    }
  }
  const inScope = (file: string) => !ctx.scopeDir || file.startsWith(`${ctx.scopeDir}/`);
  const declared = ctx.index.symbols.filter((s) => inScope(s.file) && !looksLikeTestFile(s.file));
  let seeds = name ? [name] : deriveIdentifiers(ctx.options.question).idents.filter((n) => declared.some((s) => s.name === n));
  const notes = indexCoverageNotes(ctx.index);
  if (!seeds.length) {
    const hits = searchCode(ctx.repoDir, ctx.repoRef, ctx.index, ctx.options.question, budget.maxSymbols, ctx.scopeDir);
    notes.push(...hits.notes);
    seeds = hits.items.flatMap((item) => {
      if (looksLikeTestFile(item.ref)) return [];
      if (typeof item.meta?.symbol === "string") return [item.meta.symbol];
      const region = item.location?.match(/:(\d+)-(\d+)$/);
      return region ? declared.filter((s) => s.file === item.ref && s.line >= Number(region[1]) && s.line <= Number(region[2])).map((s) => s.name) : [];
    });
  }
  seeds = [...new Set(seeds)];
  if (seeds.length > budget.maxSymbols) notes.push(`Seed budget: selected ${budget.maxSymbols} of ${seeds.length} declarations.`);
  seeds = seeds.slice(0, budget.maxSymbols);
  const queue = seeds.map((symbol) => ({ symbol, depth: 0 }));
  const visited = new Set<string>();
  const locations = new Set<string>();
  const items: Omit<EvidenceItem, "id">[] = [];
  let characters = 0;
  let skipped = 0;
  let depthCut = false;
  while (queue.length && visited.size < budget.maxSymbols && items.length < budget.maxEvidence) {
    const current = queue.shift()!;
    if (visited.has(current.symbol)) continue;
    visited.add(current.symbol);
    const roles = ["definition", "caller", "test"] as const;
    const groups = roles.map((role) => {
      if (current.depth >= budget.maxDepth && role !== "definition") return [];
      const result = symbolEvidence(ctx, current.symbol, { max: budget.maxEvidence, role });
      notes.push(...result.notes);
      return result.items;
    });
    // A declaration with several definitions is a lead, not a resolved graph
    // node. Include its evidence but do not guess which implementation to follow.
    const ambiguous = groups[0]!.length > 1;
    if (ambiguous) notes.push(`Multiple definitions for ${current.symbol}; automatic caller expansion stopped at this ambiguous name.`);
    const width = Math.max(...groups.map((g) => g.length));
    for (let i = 0; i < width; i++) {
      for (let roleIndex = 0; roleIndex < roles.length; roleIndex++) {
        const item = groups[roleIndex]![i];
        if (!item) continue;
        const role = roles[roleIndex]!;
        const key = `${role}:${item.location}`;
        if (locations.has(key)) continue;
        if (items.length >= budget.maxEvidence || characters + item.snippet.length > budget.maxChars) {
          skipped++;
          continue;
        }
        locations.add(key);
        items.push({ ...item, meta: { ...item.meta, traceRole: role, traceSymbol: current.symbol, traceDepth: current.depth } });
        characters += item.snippet.length;
        if (role !== "caller") continue;
        if (current.depth + 1 >= budget.maxDepth) {
          depthCut = true;
          continue;
        }
        if (ambiguous || item.meta?.confidence === "unique-name") continue;
        const caller = item.meta?.callerSymbol;
        if (typeof caller === "string" && !visited.has(caller)) queue.push({ symbol: caller, depth: current.depth + 1 });
      }
    }
  }
  if (queue.length) notes.push(`Traversal budget reached; ${queue.length} queued symbol(s) were not expanded.`);
  if (skipped) notes.push(`Evidence/character budget omitted ${skipped} excerpt(s); raise --max-evidence or --max-chars to retrieve more.`);
  if (depthCut || budget.maxDepth === 0) notes.push(`Caller depth budget ${budget.maxDepth} reached; deeper callers were not explored.`);
  if (!seeds.length) notes.push("No declaration resolved from the question; try --name or a more specific code query.");
  if (!items.some((i) => i.meta?.traceRole === "test"))
    notes.push("No test call retrieved within this trace budget; this does not prove the behavior is untested.");
  if (ctx.index.stats?.astTier === false) notes.push("Caller expansion needs AST symbol spans; regex-tier evidence may stop after the first hop.");
  return {
    seeds,
    evidence: assignIds([{ source: "code", items, notes: [] }]),
    notes: [...new Set(notes)],
    budget,
    visited: [...visited],
    characters,
  };
}

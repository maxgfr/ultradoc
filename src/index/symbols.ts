import { join } from "node:path";
import type { EvidenceItem, RunContext } from "../types.js";
import { readText } from "../walk.js";
import { looksLikeTestFile } from "../util.js";
import { findReferences, findSymbol } from "../vendor/codeindex-engine.mjs";
import { repoScan } from "./scan.js";
import { codeItem, enclosingSymbol, expandWindow, symbolLabel, symbolsByFile } from "./excerpt.js";

// The `symbol` drill: everything the repo knows about ONE named declaration —
// where it is defined, what its body is, and every place that calls it.
//
// Lexical search answers "where does this word appear"; that is a poor proxy
// for "where is this used", because the word also appears in prose, in
// unrelated identifiers and in the import that merely names it. The engine's
// scan resolves the real thing: declarations from the symbol table, call sites
// from extracted call expressions.
//
// Items come out as ordinary `code` evidence with `file:start-end` locations,
// so `check` re-validates them against the pinned clone exactly like any other
// code excerpt — no new source kind, no second validation path.

type RawItem = Omit<EvidenceItem, "id">;

// Definitions first, then call sites, then the rest. Scores only order the
// dossier; they are not comparable across sources.
const DEF_SCORE = 100;
const CALL_SCORE = 60;

export interface SymbolResult {
  items: RawItem[];
  notes: string[];
}

// A call site the engine could only match by name — the callee is not reachable
// through any import it could resolve. Real often enough to keep, uncertain
// enough that an answer must not rest on it silently.
const UNCORROBORATED = "unique-name";

export function symbolEvidence(ctx: RunContext, name: string, opts: { max?: number } = {}): SymbolResult {
  const max = opts.max ?? ctx.options.perSource;
  const notes: string[] = [];
  const items: RawItem[] = [];
  const scan = repoScan(ctx.repoDir);
  const inScope = (rel: string) => !ctx.scopeDir || rel.startsWith(`${ctx.scopeDir}/`);
  const symsByFile = symbolsByFile(ctx.index.symbols);

  const lineCache = new Map<string, string[] | undefined>();
  const linesOf = (rel: string): string[] | undefined => {
    if (!lineCache.has(rel)) {
      const content = readText(join(ctx.repoDir, rel));
      lineCache.set(rel, content ? content.split(/\r?\n/) : undefined);
    }
    return lineCache.get(rel);
  };

  const defs = findSymbol(scan, name, { maxResults: max }).filter((d) => inScope(d.file));
  if (!defs.length) {
    // Say what the repo does have rather than returning an empty result that
    // reads like "this symbol does not exist".
    const near = findSymbol(scan, name, { substring: true, maxResults: 8 })
      .filter((d) => inScope(d.file))
      .map((d) => `${d.name} (${d.file}:${d.line})`);
    notes.push(
      near.length
        ? `No declaration named "${name}". Similar names in this repo: ${near.join(", ")}.`
        : `No declaration named "${name}" — check the spelling, or drill with \`code --q "${name}"\` if it is not a declared symbol (a config key, a string literal, a callback property).`,
    );
  }

  for (const def of defs) {
    if (items.length >= max) break;
    const lines = linesOf(def.file);
    if (!lines) continue;
    // The declaration's real span when the AST tier resolved one; otherwise the
    // same fallback window the code search uses.
    const end = def.endLine ?? def.line + 18;
    const w = expandWindow(lines, Math.max(1, def.line - 1), Math.min(lines.length, end), def.line);
    items.push(
      codeItem({
        ref: ctx.repoRef,
        index: ctx.index,
        rel: def.file,
        lines,
        start: w.start,
        end: w.end,
        label: `${symbolLabel(def)} (definition)`,
        score: DEF_SCORE,
        meta: {
          symbol: def.name,
          definition: true,
          exported: def.exported,
          ...(def.endLine !== undefined && (w.start > def.line || w.end < def.endLine) ? { symbolSpan: `${def.line}-${def.endLine}` } : {}),
        },
      }),
    );
  }

  const refs = findReferences(scan, name);
  // Implementation callers before test callers. A widely-used helper has far
  // more call sites than fit the budget, and a question about how it is used is
  // answered by the code that ships, not by the suite that exercises it — hono's
  // `compose` has 37 call sites, and file order alone shows only its test file.
  const callers = refs.callSites
    .filter((c) => inScope(c.file))
    .sort((a, b) => Number(looksLikeTestFile(a.file)) - Number(looksLikeTestFile(b.file)) || a.file.localeCompare(b.file) || a.line - b.line);
  let uncorroborated = 0;
  for (const site of callers) {
    if (items.length >= max) break;
    const lines = linesOf(site.file);
    if (!lines) continue;
    const w = expandWindow(lines, Math.max(1, site.line - 2), Math.min(lines.length, site.line + 4), site.line);
    const host = enclosingSymbol(symsByFile.get(site.file) ?? [], site.line);
    if (site.confidence === UNCORROBORATED) uncorroborated++;
    items.push(
      codeItem({
        ref: ctx.repoRef,
        index: ctx.index,
        rel: site.file,
        lines,
        start: w.start,
        end: w.end,
        label: host ? `calls ${name} — from ${symbolLabel(host)}` : `calls ${name}`,
        score: CALL_SCORE,
        meta: {
          symbol: name,
          callSite: true,
          callLine: site.line,
          // "corroborated" means an import path ties this file to the
          // declaration; "unique-name" means only the name matched.
          ...(site.confidence ? { confidence: site.confidence } : {}),
        },
      }),
    );
  }

  if (defs.length && !callers.length) {
    notes.push(`No call site for "${name}" in this repo — it may be public API called from outside, invoked dynamically, or dead.`);
  }
  if (uncorroborated) {
    notes.push(
      `${uncorroborated} of ${callers.length} call site(s) matched on name alone (no import ties the caller to this declaration) — treat those as leads to confirm, not as evidence.`,
    );
  }
  if (callers.length > items.filter((i) => i.meta?.callSite).length) {
    notes.push(`Showing ${items.filter((i) => i.meta?.callSite).length} of ${callers.length} call site(s); raise --per-source for more.`);
  }
  if (ctx.index.stats?.astTier === false) {
    notes.push("Built without the tree-sitter grammars: methods nested in classes are invisible and call sites include matches inside comments and strings.");
  }
  const otherFiles = refs.referencingFiles.filter((f) => inScope(f) && !items.some((i) => i.ref === f));
  if (otherFiles.length) {
    notes.push(`Also mentioned (not a call) in: ${otherFiles.slice(0, 8).join(", ")}${otherFiles.length > 8 ? `, +${otherFiles.length - 8} more` : ""}.`);
  }

  return { items, notes };
}

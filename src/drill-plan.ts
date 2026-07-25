import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceKind } from "./types.js";

// ---------------------------------------------------------------------------
// The retrieval fan-out plan. `ask` already runs one broad seed retrieval; the
// playbook then says to drill {remaining query variants} × {drill sources}.
// This module derives that matrix DETERMINISTICALLY from the question (no LLM,
// no timestamps) and persists it as <run>/drill-plan.json so `orchestrate` can
// fan the drill cells out to explorer subagents — or a sequential agent can
// walk them one by one. Each cell maps to ONE read-only single-source CLI call
// (`code|issues|prs|… --repo … --q …`), which prints evidence and writes
// nothing.
// ---------------------------------------------------------------------------

/** Every source the single-source drill commands can hit, in canonical order. */
export const DRILL_SOURCES: SourceKind[] = ["code", "docs", "release", "history", "issue", "pr", "discussion", "so", "web"];

/** SourceKind → the CLI drill command that retrieves it (read-only). */
export const DRILL_COMMAND: Record<SourceKind, string> = {
  code: "code",
  docs: "docs",
  release: "releases",
  history: "history",
  issue: "issues",
  pr: "prs",
  discussion: "discussions",
  so: "so",
  web: "web",
};

/** Hard cap so a wordy question can't explode the fan-out. */
export const MAX_DRILL_CELLS = 24;

/** What a cell drills with. The first three are query wordings; `symbol` is a
 * different kind of lookup — a declaration to resolve, not a query to search. */
export type DrillVariant = "prose" | "identifier" | "literal" | "symbol";

/** One drill cell: `<DRILL_COMMAND[source]> --repo <plan.repo> --q "<query>"`,
 * except a `symbol` cell, which runs `symbol --repo <plan.repo> --name <query>`. */
export interface DrillCell {
  id: string; // "D1", "D2", …
  variant: DrillVariant;
  query: string;
  source: SourceKind;
}

/** How many identifiers from the question get a `symbol` cell. The question
 * rarely names more than a couple of real declarations, and each cell costs a
 * scan of the tree. */
export const MAX_SYMBOL_CELLS = 3;

export interface DrillPlan {
  question: string;
  repo: string; // the --repo value the drills must reuse (same clone+index cache)
  ref?: string;
  pkg?: string;
  askedSources: SourceKind[]; // what the seed ask already covered
  cells: DrillCell[];
}

// Identifier-shaped tokens: snake_case / dotted, camelCase, SCREAMING_SNAKE.
// Deliberately NOT bare acronyms ("API", "CLI") — those are prose, not symbols.
const IDENT_RE = /\b[A-Za-z][A-Za-z0-9]*(?:[_.][A-Za-z0-9]+)+\b|\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]+)+[a-zA-Z0-9]*\b|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
// `code spans` are identifiers by declaration; "quoted strings" are literals
// (error messages, config values) worth a pickaxe-style exact drill.
const CODE_SPAN_RE = /`([^`\n]+)`/g;
// The single-quote branch requires word boundaries so contractions/possessives
// ("what's", "Rust's") don't pair across words into nonsense literal queries
// that burn drill cells at the cap.
const QUOTED_RE = /"([^"\n]{3,})"|(?<![A-Za-z])'([^'\n]{3,})'(?![A-Za-z])/g;

/** The identifier-shaped tokens a question names, in order: the contents of code
 * spans first (identifiers by declaration), then camelCase/snake_case/SCREAMING
 * tokens found in the remaining prose. `rest` is the question with code spans
 * removed, so the literal pass doesn't re-match them. */
export function deriveIdentifiers(question: string): { idents: string[]; rest: string } {
  const idents: string[] = [];
  const seen = new Set<string>();
  const push = (tok: string) => {
    const t = tok.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      idents.push(t);
    }
  };
  // Strip code spans out first so their contents aren't double-matched, then
  // scan the remaining prose for identifier-shaped tokens.
  let rest = question;
  for (const m of question.matchAll(CODE_SPAN_RE)) {
    push(m[1]!);
    rest = rest.replace(m[0]!, " ");
  }
  const noQuotes = rest.replace(QUOTED_RE, " ");
  for (const m of noQuotes.matchAll(IDENT_RE)) push(m[0]!);
  return { idents, rest };
}

/** The 1–3 query variants of a question, playbook-style: the prose as asked,
 * the identifier forms the codebase probably uses, any quoted literal. */
export function deriveVariants(question: string): { variant: DrillVariant; query: string }[] {
  const out: { variant: DrillVariant; query: string }[] = [{ variant: "prose", query: question }];
  const { idents, rest } = deriveIdentifiers(question);
  if (idents.length) out.push({ variant: "identifier", query: idents.join(" ") });

  const literals: string[] = [];
  for (const m of rest.matchAll(QUOTED_RE)) {
    const lit = (m[1] ?? m[2])!.trim();
    if (lit && !literals.includes(lit)) literals.push(lit);
  }
  if (literals.length) out.push({ variant: "literal", query: literals.join(" ") });

  return out;
}

/** Build the {variant × source} drill matrix, skipping the prose × already-asked
 * cells (the seed `ask` covered those), capped at MAX_DRILL_CELLS. */
export function buildDrillPlan(opts: { question: string; repo: string; ref?: string; pkg?: string; askedSources: SourceKind[] }): DrillPlan {
  const cells: DrillCell[] = [];
  let n = 0;
  // One symbol cell per identifier the question names, FIRST: resolving a
  // declaration and its callers settles "where is X used" outright, where the
  // lexical cells can only rank files that mention the word. They carry their
  // own bound (MAX_SYMBOL_CELLS) and do NOT spend the query-cell budget —
  // otherwise adding them would silently drop drills off the tail of the
  // matrix, trading coverage the cap was never meant to trade.
  for (const ident of deriveIdentifiers(opts.question).idents.slice(0, MAX_SYMBOL_CELLS)) {
    cells.push({ id: `D${++n}`, variant: "symbol", query: ident, source: "code" });
  }
  let queryCells = 0;
  for (const v of deriveVariants(opts.question)) {
    for (const source of DRILL_SOURCES) {
      if (v.variant === "prose" && opts.askedSources.includes(source)) continue;
      if (queryCells >= MAX_DRILL_CELLS) break;
      queryCells++;
      cells.push({ id: `D${++n}`, variant: v.variant, query: v.query, source });
    }
  }
  return {
    question: opts.question,
    repo: opts.repo,
    ...(opts.ref ? { ref: opts.ref } : {}),
    ...(opts.pkg ? { pkg: opts.pkg } : {}),
    askedSources: opts.askedSources,
    cells,
  };
}

/** Persist the plan beside the dossier; `orchestrate` reads it as the drill
 * phase's worklist. Returns the written path. */
export function writeDrillPlan(dir: string, plan: DrillPlan): string {
  const p = join(dir, "drill-plan.json");
  writeFileSync(p, JSON.stringify(plan, null, 2));
  return p;
}

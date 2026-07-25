import type { CodeSymbol, EvidenceItem, RepoRef, StructuralIndex } from "../types.js";

// How a region of a source file becomes a citable evidence item. Everything
// that decides an excerpt's boundaries, its label and its `location` string
// lives here, because `check` re-opens the pinned clone and compares the stored
// snippet against exactly those lines — if two producers disagreed on how a
// window is cut, the mismatch would surface as a grounding failure rather than
// as the bug it is.

export const MAX_EXCERPT_LINES = 30; // hard cap on one excerpt
export const EXCERPT_PAD = 8; // how far an excerpt may grow past the hit region

// Grow an excerpt window to natural boundaries: extend each side until a blank
// line (paragraph/function boundary) or EXCERPT_PAD lines, never shrinking the
// seed region; then cap at MAX_EXCERPT_LINES, keeping the anchor in view.
// start/end/anchor are 1-based inclusive line numbers.
export function expandWindow(lines: string[], start: number, end: number, anchor: number): { start: number; end: number } {
  const blank = (n: number) => /^\s*$/.test(lines[n - 1] ?? "");
  let s = Math.max(1, start);
  let e = Math.min(lines.length, end);
  while (s > 1 && start - s < EXCERPT_PAD && !blank(s - 1)) s--;
  while (e < lines.length && e - end < EXCERPT_PAD && !blank(e + 1)) e++;
  if (e - s + 1 > MAX_EXCERPT_LINES) {
    let ns = Math.max(s, anchor - Math.floor(MAX_EXCERPT_LINES / 3));
    let ne = ns + MAX_EXCERPT_LINES - 1;
    if (ne > e) {
      ne = e;
      ns = ne - MAX_EXCERPT_LINES + 1;
    }
    s = ns;
    e = ne;
  }
  return { start: s, end: e };
}

// The innermost declaration whose span contains `line`. Only the AST tier
// records `endLine`, so on a regex-tier index this returns undefined and the
// caller falls back to a generic label rather than guessing at containment.
export function enclosingSymbol(fileSyms: CodeSymbol[], line: number): CodeSymbol | undefined {
  let best: CodeSymbol | undefined;
  for (const s of fileSyms) {
    if (s.endLine === undefined || s.line > line || s.endLine < line) continue;
    if (!best || s.endLine - s.line < best.endLine! - best.line) best = s;
  }
  return best;
}

// How a symbol reads in an excerpt title, qualified by its parent so a method
// is `method HttpClient.request`, not a bare `method request`.
export function symbolLabel(s: Pick<CodeSymbol, "kind" | "name" | "parent">): string {
  return s.parent ? `${s.kind} ${s.parent}.${s.name}` : `${s.kind} ${s.name}`;
}

// Declarations grouped per file, so an excerpt can be labelled with the symbol
// it sits inside.
export function symbolsByFile(symbols: CodeSymbol[]): Map<string, CodeSymbol[]> {
  const byFile = new Map<string, CodeSymbol[]>();
  for (const s of symbols) {
    const arr = byFile.get(s.file);
    if (arr) arr.push(s);
    else byFile.set(s.file, [s]);
  }
  return byFile;
}

// Build one code evidence item from a resolved line window. The snippet is the
// literal slice of those lines — never a reconstruction — so `check`'s
// re-validation against the pinned clone compares like with like.
export function codeItem(args: {
  ref: RepoRef;
  index: StructuralIndex;
  rel: string;
  lines: string[];
  start: number;
  end: number;
  label: string;
  score: number;
  meta?: Record<string, unknown>;
}): Omit<EvidenceItem, "id"> {
  const { ref, index, rel, lines, start, end, label, score, meta } = args;
  return {
    source: "code",
    title: `${rel} — ${label}`,
    ref: rel,
    location: `${rel}:${start}-${end}`,
    score: Number(score.toFixed(3)),
    snippet: lines.slice(start - 1, end).join("\n"),
    url: ref.isLocal ? undefined : `${ref.webUrl}/blob/${index.commit ?? "HEAD"}/${rel}#L${start}-L${end}`,
    ...(meta ? { meta } : {}),
  };
}

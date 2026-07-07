import { statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { EvidenceItem, StructuralIndex, CodeSymbol, RepoRef } from "../types.js";
import { sh, have, rrf, foldTerm, subtokens, buildMatcher, matcherFromTokens, type KeywordMatcher } from "../util.js";
import { walk, readText } from "../walk.js";
import { LIMITS } from "../config.js";
import { bm25 } from "./bm25.js";

type RawItem = Omit<EvidenceItem, "id">;

interface FileHits {
  rel: string;
  matchedKw: Set<string>;
  kwCounts: Map<string, number>; // keyword -> hit count in this file (tf for BM25)
  lines: { line: number; text: string }[];
}

// One coherent excerpt within a file: a contiguous (after merging nearby hits)
// region of lines that matched, plus how many distinct keywords it covered.
interface Region {
  start: number;
  end: number;
  anchor: number;
  kwCount: number;
}

const MAX_KEYWORDS = 8;
const MAX_EXCERPT_LINES = 30; // hard cap on one excerpt
const EXCERPT_PAD = 8; // how far an excerpt may grow past the hit region

// Named ranking constants (previously scattered magic numbers). Tuning these
// changes result ordering — the offline evals (evals/run.mjs) guard against a
// regression.
export const RANKING = {
  BM25_K1: 1.2,
  // b=0.3: code corpora mix tiny config files with huge implementation files,
  // and full-strength length normalization (b=0.75) buries the big files where
  // the answer lives (e.g. matomo's js/piwik.js).
  BM25_B: 0.3,
  LOW_SIGNAL_PENALTY: 0.45, // tests/docs/examples down-weight
  STEM_EXACT_BOOST: 1.3, // file stem == a query keyword (retry.ts for "retry")
  STEM_SUBTOKEN_BOOST: 1.15, // file stem shares a subtoken with a keyword
  EXPORTED_BOOST: 1.5, // an exported symbol outranks a private one
  SCORE_SCALE: 1000, // readability of the reported score; ordering unchanged
  // Per-file contribution of its 1st/2nd/3rd best-matching symbol, so a file
  // that defines several relevant symbols outranks one with a single weak match.
  SYMBOL_DECAY: [1, 0.5, 0.25],
} as const;

// Lexical search via ripgrep (`rg --json`), one call with the matcher's
// patterns OR-ed together (accent-insensitive classes over escaped literals —
// hence no -F). Hits are attributed back to canonical keywords, so "Réessais"
// and "retry" in the text both count toward the keyword the user typed.
function rgSearch(root: string, matcher: KeywordMatcher, scope?: string): Map<string, FileHits> {
  const args = [
    "--json",
    "-i",
    "--max-count",
    "40",
    "--max-filesize",
    "1M",
    "-g",
    "!**/.ultradoc/**",
    "-g",
    "!**/node_modules/**",
    "-g",
    "!**/{dist,build,vendor}/**",
    // Lockfiles are machine-generated noise (walk skips them for the index, but
    // ripgrep scans the tree directly, so exclude them here too).
    "-g",
    "!**/*.lock",
    "-g",
    "!**/package-lock.json",
    "-g",
    "!**/npm-shrinkwrap.json",
    "-g",
    "!**/pnpm-lock.yaml",
    "-g",
    "!**/yarn.lock",
    "-g",
    "!**/go.sum",
  ];
  if (scope) args.push("-g", `${scope}/**`);
  for (const p of matcher.patterns) args.push("-e", p.source);
  // Pass the scoped subtree as the search path so ripgrep never traverses
  // sibling packages of a big monorepo (the glob alone still lets rg walk the
  // whole tree). rel is computed against `root`, so paths stay repo-relative.
  args.push(scope ? join(root, scope) : root);

  const res = sh("rg", args, { timeoutMs: 60_000 });
  const byFile = new Map<string, FileHits>();
  if (!res.ok && !res.stdout) return byFile;

  for (const raw of res.stdout.split("\n")) {
    if (!raw) continue;
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      continue;
    }
    if (evt.type !== "match") continue;
    const abs: string = evt.data?.path?.text ?? "";
    if (!abs) continue;
    // Use path.relative (not string slicing) so a sibling dir whose name is a
    // prefix of root — e.g. root=/x/abc, abs=/x/abc-backup/f — doesn't produce a
    // bogus "-backup/f". Anything outside root is dropped.
    const rel = relative(root, abs).split(sep).join("/");
    if (!rel || rel.startsWith("..")) continue;
    const lineNo: number = evt.data?.line_number ?? 0;
    const text: string = (evt.data?.lines?.text ?? "").replace(/\n$/, "");
    let fh = byFile.get(rel);
    if (!fh) {
      fh = { rel, matchedKw: new Set(), kwCounts: new Map(), lines: [] };
      byFile.set(rel, fh);
    }
    for (const sm of evt.data?.submatches ?? []) {
      const canonical = matcher.canonicalOf(sm.match?.text ?? "");
      if (canonical) {
        fh.matchedKw.add(canonical);
        fh.kwCounts.set(canonical, (fh.kwCounts.get(canonical) ?? 0) + 1);
      }
    }
    fh.lines.push({ line: lineNo, text: text.slice(0, 400) });
  }
  return byFile;
}

// Pure-JS fallback when ripgrep isn't installed: scan walked files for the
// keywords. Slower on huge repos but keeps the tool functional everywhere.
// The scope matters here even though searchCode filters afterwards: walk caps
// at 8000 files, so an unscoped walk of a big monorepo could exhaust the cap
// before ever reaching the requested package.
function jsSearch(root: string, matcher: KeywordMatcher, scope?: string): Map<string, FileHits> {
  const byFile = new Map<string, FileHits>();
  const res = matcher.patterns.map((p) => ({ re: new RegExp(p.source, "i"), canonical: p.canonical }));
  const base = scope ? join(root, scope) : root;
  for (const f of walk(base, { maxFiles: LIMITS.jsScanFiles })) {
    const rel = scope ? `${scope}/${f.rel}` : f.rel;
    const content = readText(f.abs);
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    let fh: FileHits | undefined;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const matched: string[] = [];
      for (const p of res) if (p.re.test(line)) matched.push(p.canonical);
      if (matched.length) {
        if (!fh) {
          fh = { rel, matchedKw: new Set(), kwCounts: new Map(), lines: [] };
          byFile.set(rel, fh);
        }
        for (const m of matched) {
          fh.matchedKw.add(m);
          fh.kwCounts.set(m, (fh.kwCounts.get(m) ?? 0) + 1);
        }
        if (fh.lines.length < 40) fh.lines.push({ line: i + 1, text: line.slice(0, 400) });
      }
    }
  }
  return byFile;
}

// Merge nearby hit lines (within `gap`) into regions and score each region by
// how many distinct keywords it covers.
function regionsFor(fh: FileHits, matcher: KeywordMatcher, gap = 8): Region[] {
  const sorted = [...fh.lines].sort((a, b) => a.line - b.line);
  const regions: Region[] = [];
  let cur: { start: number; end: number; lines: { line: number; text: string }[] } | null = null;
  for (const h of sorted) {
    if (cur && h.line - cur.end <= gap) {
      cur.end = h.line;
      cur.lines.push(h);
    } else {
      if (cur) regions.push(scoreRegion(cur, matcher));
      cur = { start: h.line, end: h.line, lines: [h] };
    }
  }
  if (cur) regions.push(scoreRegion(cur, matcher));
  return regions;
}

function scoreRegion(cur: { start: number; end: number; lines: { line: number; text: string }[] }, matcher: KeywordMatcher): Region {
  const covered = new Set<string>();
  let anchor = cur.start;
  let best = -1;
  for (const h of cur.lines) {
    const here = matcher.matchLine(h.text);
    for (const c of here) covered.add(c);
    if (here.size > best) {
      best = here.size;
      anchor = h.line;
    }
  }
  return { start: cur.start, end: cur.end, anchor, kwCount: covered.size };
}

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

// Score one declared symbol by name similarity to the query keywords. Exact
// name matches and exported symbols score highest — this is what lets "what does
// retryRequest do?" jump straight to the definition.
function scoreSymbol(sym: CodeSymbol, matcher: KeywordMatcher): number {
  const name = foldTerm(sym.name);
  let s = 0;
  for (const ek of matcher.expanded) {
    // Best variant wins per keyword. Subtokens count at half weight so a
    // generic identifier part ("get", "page") can't dominate the typed term.
    let best = 0;
    for (const v of ek.variants) {
      const vt = foldTerm(v.text);
      let vs = 0;
      if (name === vt) vs = 6;
      else if (name.startsWith(vt) || vt.startsWith(name)) vs = 3;
      else if (name.includes(vt) || vt.includes(name)) vs = 1.5;
      if (v.kind === "subtoken") vs *= 0.5;
      if (vs > best) best = vs;
    }
    s += best;
  }
  if (s === 0) return 0;
  return sym.exported ? s * RANKING.EXPORTED_BOOST : s;
}

// Rank each file by its best-matching symbols. A file's score sums its top few
// symbol scores under SYMBOL_DECAY, so a file defining several relevant symbols
// outranks one with a single weak match. `sym` is the top symbol, used to anchor
// the excerpt at its definition.
function symbolScores(index: StructuralIndex, matcher: KeywordMatcher): Map<string, { score: number; sym: CodeSymbol }> {
  const perFile = new Map<string, { score: number; sym: CodeSymbol }[]>();
  for (const sym of index.symbols) {
    const s = scoreSymbol(sym, matcher);
    if (s === 0) continue;
    const arr = perFile.get(sym.file) ?? [];
    arr.push({ score: s, sym });
    perFile.set(sym.file, arr);
  }
  const byFile = new Map<string, { score: number; sym: CodeSymbol }>();
  for (const [file, arr] of perFile) {
    arr.sort((a, b) => b.score - a.score);
    let fileScore = 0;
    for (let i = 0; i < arr.length && i < RANKING.SYMBOL_DECAY.length; i++) fileScore += arr[i]!.score * RANKING.SYMBOL_DECAY[i]!;
    byFile.set(file, { score: fileScore, sym: arr[0]!.sym });
  }
  return byFile;
}

// Deterministic Tier-1 code search: fuse lexical file hits with structural
// symbol matches, then emit one evidence excerpt per top file (anchored at the
// matching symbol's definition when there is one, else the densest region).
export function searchCode(
  root: string,
  ref: RepoRef,
  index: StructuralIndex,
  question: string,
  perSource: number,
  scope?: string, // repo-relative dir (a workspace package) to restrict to
): { items: RawItem[]; notes: string[]; fallback?: "js-scan" } {
  const notes: string[] = [];
  const inScope = (rel: string) => !scope || rel.startsWith(scope + "/");
  let matcher = buildMatcher(question, MAX_KEYWORDS);
  if (matcher.expanded.length === 0) {
    notes.push("No distinctive keywords in the question; code search may be weak.");
    matcher = matcherFromTokens(question.split(/\s+/), MAX_KEYWORDS);
  }
  if (matcher.expanded.length === 0) return { items: [], notes };

  const usedRg = have("rg");
  if (!usedRg) notes.push("ripgrep not found — used the slower built-in scanner.");
  const lexical = usedRg ? rgSearch(root, matcher, scope) : jsSearch(root, matcher, scope);
  const symbols = symbolScores(index, matcher);

  // The scope filter applies here so symbol-only hits respect it too (the rg
  // glob is just an optimization).
  const files = new Set<string>([...lexical.keys(), ...symbols.keys()].filter(inScope));

  // Lexical ranking is BM25 over canonical keywords. ripgrep already provides
  // everything it needs with no stored term index: per-file term counts
  // (kwCounts) and exact document frequencies — rg returns every file matching
  // any keyword, so df is the corpus df. Doc length uses file size / 5 as a
  // token proxy, computed only for the candidates (a few hundred stat calls).
  const canonicals = matcher.canonicals;
  const df = new Map<string, number>();
  for (const fh of lexical.values()) {
    for (const kw of fh.kwCounts.keys()) df.set(kw, (df.get(kw) ?? 0) + 1);
  }
  const candidates = [...files]
    .filter((rel) => lexical.has(rel))
    .map((rel) => {
      let len = 1000;
      try {
        len = Math.max(1, statSync(join(root, rel)).size / 5);
      } catch {
        /* keep the default */
      }
      return { key: rel, tf: lexical.get(rel)!.kwCounts, len };
    });
  const lexScores = bm25(candidates, canonicals, Math.max(index.fileCount, lexical.size), df, RANKING.BM25_K1, RANKING.BM25_B);

  // Fuse the BM25 ranking with the symbol-index ranking via RRF — the same
  // scale-free fusion the semantic tier uses — then apply the low-signal
  // penalty on the fused score.
  const lexRank = [...lexScores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([rel]) => rel);
  const symRank = [...symbols.entries()]
    .filter(([rel]) => files.has(rel))
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .map(([rel]) => rel);
  const fused = rrf([lexRank, symRank], (rel) => rel);

  // Files better served by the `docs` source (README, changelog, docs/**, *.md)
  // — down-weight them in CODE search so a keyword-dense changelog can't
  // out-rank the actual implementation. (Without this, e.g. express's
  // History.md beat lib/router on a routing question.) Same for tests,
  // fixtures, examples and benchmarks: they still surface, just below real
  // implementation code.
  const docSet = new Set(index.docFiles);
  const canonSet = new Set(canonicals);
  const scored: { rel: string; score: number; fh?: FileHits; sym?: CodeSymbol }[] = [];
  for (const rel of files) {
    const base = fused.get(rel) ?? 0;
    if (base <= 0) continue;
    const lowSignal = /(^|\/)(test|tests|__tests__|spec|specs|fixtures?|examples?|benchmark|benchmarks)\//i.test(rel) || docSet.has(rel);
    // A file literally named after a query keyword (retry.ts for "retry") is a
    // strong relevance signal BM25 can't see. Applied after the low-signal
    // penalty so tests/retry.test.ts still ranks below src/retry.ts
    // (0.45 × 1.3 < 1).
    const stem = (rel.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
    const stemParts = [foldTerm(stem), ...subtokens(stem).map(foldTerm)];
    const nameBoost = canonSet.has(stemParts[0]!) ? RANKING.STEM_EXACT_BOOST : stemParts.some((p) => canonSet.has(p)) ? RANKING.STEM_SUBTOKEN_BOOST : 1;
    const score = base * RANKING.SCORE_SCALE * (lowSignal ? RANKING.LOW_SIGNAL_PENALTY : 1) * nameBoost;
    scored.push({ rel, score, fh: lexical.get(rel), sym: symbols.get(rel)?.sym });
  }
  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));

  const items: RawItem[] = [];
  for (const f of scored) {
    if (items.length >= perSource) break;
    const content = readText(join(root, f.rel));
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    const { start, end, label } = excerptFor(lines, matcher, f.sym, f.fh);
    const url = ref.isLocal ? undefined : `${ref.webUrl}/blob/${index.commit ?? "HEAD"}/${f.rel}#L${start}-L${end}`;
    items.push({
      source: "code",
      title: `${f.rel} — ${label}`,
      ref: f.rel,
      location: `${f.rel}:${start}-${end}`,
      score: Number(f.score.toFixed(3)),
      snippet: lines.slice(start - 1, end).join("\n"),
      url,
      meta: { matchedKeywords: f.fh ? [...f.fh.matchedKw] : [], symbol: f.sym?.name },
    });
  }

  return { items, notes, fallback: usedRg ? undefined : "js-scan" };
}

// Choose the excerpt window for one result: a matching symbol definition wins
// (anchored at its line); else the densest lexical region; else the file head.
// The seed window grows to natural (blank-line) boundaries, capped at
// MAX_EXCERPT_LINES. Returns 1-based inclusive line numbers + a label.
function excerptFor(lines: string[], matcher: KeywordMatcher, sym?: CodeSymbol, fh?: FileHits): { start: number; end: number; label: string } {
  if (sym) {
    const w = expandWindow(lines, Math.max(1, sym.line - 1), Math.min(lines.length, sym.line + 18), sym.line);
    return { start: w.start, end: w.end, label: `${sym.kind} ${sym.name}` };
  }
  if (fh) {
    const region = regionsFor(fh, matcher).sort((a, b) => b.kwCount - a.kwCount || a.start - b.start)[0]!;
    const w = expandWindow(lines, region.start, region.end, region.anchor);
    return { start: w.start, end: w.end, label: "match" };
  }
  return { start: 1, end: Math.min(lines.length, 20), label: "match" };
}

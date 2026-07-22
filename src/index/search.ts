import { statSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceItem, StructuralIndex, CodeSymbol, RepoRef } from "../types.js";
import { have, rrf, foldTerm, subtokens, escapeRegExp, buildMatcher, matcherFromTokens, accentPattern, type KeywordMatcher } from "../util.js";
import { grepRepo } from "../vendor/codeindex-engine.mjs";
import { readText } from "../walk.js";
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
  // Call-site awareness: how many identifier keywords are probed as call
  // targets, the score of a distant call-site excerpt relative to its file's
  // primary excerpt, and how close a call region must be to the definition to
  // fold into one excerpt instead of a second item.
  CALLSITE_MAX_NAMES: 4,
  CALLSITE_SECOND_ITEM_FACTOR: 0.95,
  CALLSITE_MERGE_GAP: 12,
  // Rare-literal guarantee: a query keyword matching in at most RARE_TERM_DF
  // files is a near-unique literal (error string, regex fragment, data-file
  // entry) — its holder must surface even when rank fusion buries it, and at
  // most RARE_PIN_MAX holders may displace normally-ranked items.
  RARE_TERM_DF: 3,
  RARE_PIN_MAX: 2,
} as const;

// Old rg --max-count semantics the flood-rescue pass is built around: only the
// first N matching lines of a file are reported (and attributed).
const MAX_LINES_PER_FILE = 40;

// Lexical search via the engine's grepRepo — ripgrep when it is on PATH, the
// engine's pure-JS scanner otherwise, with identical hits either way (the
// engine asserts backend parity). One call with the matcher's patterns OR-ed
// together (accent-insensitive classes over escaped literals). Hits are
// attributed back to canonical keywords, so "Réessais" and "retry" in the text
// both count toward the keyword the user typed. The engine applies the same
// ignore rules as the walker (junk dirs, lockfiles, binaries, .gitignore); the
// ultradoc-specific cache dir is filtered here, like in walk.ts.
function lexicalSearch(root: string, matcher: KeywordMatcher, scope?: string): Map<string, FileHits> {
  const byFile = new Map<string, FileHits>();
  if (!matcher.patterns.length) return byFile;
  const pattern = matcher.patterns.map((p) => `(?:${p.source})`).join("|");
  const hits = grepRepo(root, pattern, {
    ignoreCase: true,
    maxHits: Number.MAX_SAFE_INTEGER,
    globs: scope ? [`${scope}/**`] : undefined,
  });
  const res = matcher.patterns.map((p) => ({ re: new RegExp(p.source, "gi"), canonical: p.canonical }));
  for (const h of hits) {
    if (h.file === ".ultradoc" || h.file.startsWith(".ultradoc/")) continue;
    let fh = byFile.get(h.file);
    if (!fh) {
      fh = { rel: h.file, matchedKw: new Set(), kwCounts: new Map(), lines: [] };
      byFile.set(h.file, fh);
    }
    // grepRepo returns hits sorted by (file, line), so "the first N stored
    // lines" are the file's N first matching lines, like rg --max-count.
    if (fh.lines.length >= MAX_LINES_PER_FILE) continue;
    for (const p of res) {
      const n = (h.text.match(p.re) ?? []).length;
      if (n > 0) {
        fh.matchedKw.add(p.canonical);
        fh.kwCounts.set(p.canonical, (fh.kwCounts.get(p.canonical) ?? 0) + n);
      }
    }
    fh.lines.push({ line: h.line, text: h.text.slice(0, 400) });
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

// Query keywords worth probing as call targets: identifier-shaped (camelCase or
// snake_case) or exactly a declared symbol name. Deliberately strict so a prose
// keyword ("config", "signal") never triggers the pass — those queries stay
// byte-identical to before. Capped at CALLSITE_MAX_NAMES.
export function callableNames(matcher: KeywordMatcher, index: StructuralIndex): string[] {
  const declared = new Set(index.symbols.map((s) => foldTerm(s.name)));
  const out: string[] = [];
  for (const ek of matcher.expanded) {
    if (out.length >= RANKING.CALLSITE_MAX_NAMES) break;
    const orig = ek.original;
    if (!/^[A-Za-z_$][\w$]*$/.test(orig)) continue;
    const identifierShaped = /[a-z][A-Z]/.test(orig) || orig.includes("_");
    if ((identifierShaped || declared.has(foldTerm(orig))) && !out.includes(orig)) out.push(orig);
  }
  return out;
}

// Lines in a file that INVOKE one of the probed names — `name(`, `name?.(` or
// `obj.name(`. Declaration lines (from the symbol index) are excluded so a
// function's own definition isn't mistaken for a call site. A type annotation
// like `onRetry?: (…) => void` never matches (there is no `(` right after the
// name), so an option-callback property surfaces only at its invocation.
function callSiteHits(fh: FileHits, compiled: { name: string; re: RegExp }[], declLines: Set<number>): { lines: number[]; name?: string } {
  const lines = new Set<number>();
  const counts = new Map<string, number>();
  for (const h of fh.lines) {
    if (declLines.has(h.line)) continue;
    for (const c of compiled) {
      if (c.re.test(h.text)) {
        lines.add(h.line);
        counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
        break;
      }
    }
  }
  const name = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return { lines: [...lines].sort((a, b) => a - b), name };
}

// Merge sorted line numbers into contiguous regions (gap-tolerant).
function mergeLines(sorted: number[], gap: number): { start: number; end: number }[] {
  const regions: { start: number; end: number }[] = [];
  let cur: { start: number; end: number } | null = null;
  for (const l of sorted) {
    if (cur && l - cur.end <= gap) cur.end = l;
    else {
      if (cur) regions.push(cur);
      cur = { start: l, end: l };
    }
  }
  if (cur) regions.push(cur);
  return regions;
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
  const lexical = lexicalSearch(root, matcher, scope);
  const symbols = symbolScores(index, matcher);

  // Call-site pass: when the query names an identifier, rank the files that
  // INVOKE it (not just declare it) and remember the invocation lines so the
  // excerpt can include a call site. No extra search — call lines are already
  // among the lexical hits (the callee name is a query keyword).
  const names = callableNames(matcher, index);
  const callHits = new Map<string, { lines: number[]; name?: string }>();
  let callRank: string[] = [];
  if (names.length) {
    const compiled = names.map((n) => ({ name: n, re: new RegExp(`\\b${escapeRegExp(n)}\\s*(?:\\?\\.)?\\s*\\(`) }));
    const nameSet = new Set(names.map(foldTerm));
    const declByFile = new Map<string, Set<number>>();
    for (const s of index.symbols) {
      if (!nameSet.has(foldTerm(s.name))) continue;
      const set = declByFile.get(s.file) ?? new Set<number>();
      set.add(s.line);
      declByFile.set(s.file, set);
    }
    for (const [rel, fh] of lexical) {
      if (!inScope(rel)) continue;
      const hit = callSiteHits(fh, compiled, declByFile.get(rel) ?? new Set());
      if (hit.lines.length) callHits.set(rel, hit);
    }
    callRank = [...callHits.entries()].sort((a, b) => b[1].lines.length - a[1].lines.length || a[0].localeCompare(b[0])).map(([rel]) => rel);
  }

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

  // Flood rescue: the per-file line cap (rg --max-count / jsSearch equivalent)
  // can be consumed entirely by a generic keyword before a rare literal's line
  // is ever reported ("bot" matches thousands of lines of device-detector's
  // bots.yml before the one line holding the queried literal), leaving the rare
  // keyword unattributed — df 0, invisible to ranking AND to the rare-literal
  // pin below. For every canonical that looks near-unique (df ≤ RARE_TERM_DF)
  // and has a direct (non-subtoken) variant, run one dedicated pass restricted
  // to those direct variants — near-unique literals match little, so this is
  // cheap — merge the hits, and recompute df on the corrected data.
  const missed = matcher.expanded.filter((ek) => (df.get(ek.canonical) ?? 0) <= RANKING.RARE_TERM_DF && ek.variants.some((v) => v.kind !== "subtoken"));
  if (missed.length) {
    let merged = false;
    // One search per canonical — sharing an invocation would share its per-file
    // line cap too, and a flooding sibling ("bot") would starve the literal the
    // pass exists to recover.
    for (const ek of missed) {
      const rescueMatcher: KeywordMatcher = {
        ...matcher,
        expanded: [ek],
        canonicals: [ek.canonical],
        patterns: ek.variants.filter((v) => v.kind !== "subtoken").map((v) => ({ source: accentPattern(v.text), canonical: ek.canonical })),
      };
      const extra = lexicalSearch(root, rescueMatcher, scope);
      for (const [rel, fh] of extra) {
        if (!inScope(rel)) continue;
        const cur = lexical.get(rel);
        if (!cur) {
          lexical.set(rel, fh);
          files.add(rel);
          merged = true;
          continue;
        }
        for (const kw of fh.matchedKw) cur.matchedKw.add(kw);
        // max, not sum: the first pass may already have counted part of these hits.
        for (const [kw, n] of fh.kwCounts) cur.kwCounts.set(kw, Math.max(cur.kwCounts.get(kw) ?? 0, n));
        const seen = new Set(cur.lines.map((l) => l.line));
        for (const l of fh.lines) if (!seen.has(l.line)) cur.lines.push(l);
        merged = true;
      }
    }
    if (merged) {
      df.clear();
      for (const fh of lexical.values()) {
        for (const kw of fh.kwCounts.keys()) df.set(kw, (df.get(kw) ?? 0) + 1);
      }
    }
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
  // A third rank list (call sites) joins the fusion only when it has entries, so
  // a query with no identifier keyword produces a bit-identical ranking.
  const fused = rrf(callRank.length ? [lexRank, symRank, callRank] : [lexRank, symRank], (rel) => rel);

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
    const call = callHits.get(f.rel);
    const windows = excerptWindows(lines, matcher, f.sym, f.fh, call?.lines ?? []);
    for (let wi = 0; wi < windows.length; wi++) {
      if (items.length >= perSource) break;
      const win = windows[wi]!;
      const score = wi === 0 ? f.score : f.score * RANKING.CALLSITE_SECOND_ITEM_FACTOR;
      const label = win.callSite ? `call site${call?.name ? ` (${call.name})` : ""}` : win.label;
      const url = ref.isLocal ? undefined : `${ref.webUrl}/blob/${index.commit ?? "HEAD"}/${f.rel}#L${win.start}-L${win.end}`;
      items.push({
        source: "code",
        title: `${f.rel} — ${label}`,
        ref: f.rel,
        location: `${f.rel}:${win.start}-${win.end}`,
        score: Number(score.toFixed(3)),
        snippet: lines.slice(win.start - 1, win.end).join("\n"),
        url,
        meta: { matchedKeywords: f.fh ? [...f.fh.matchedKw] : [], symbol: f.sym?.name, ...(win.callSite ? { callSite: true } : {}) },
      });
    }
  }

  // Rare-literal guarantee (grep semantics): a canonical keyword that matches
  // in at most RARE_TERM_DF files is a near-unique literal — an error string, a
  // regex fragment, a data-file entry — and is very likely the evidence the
  // query is really after. Rank fusion alone can bury its holder: RRF is
  // rank-based, so a file with no symbols (data .yml/.json/…) collects from the
  // lexical list only, while symbol-bearing files matching generic subtokens of
  // the query collect from both lists and overtake the sole holder of the exact
  // literal (e.g. device-detector's regexes/bots.yml losing to setClientHints).
  // Pin the best holder of each such keyword, dropping the weakest normal items
  // to stay within perSource — and say so in the notes, never silently.
  const pins: { f: (typeof scored)[number]; kw: string; n: number; res: RegExp[] }[] = [];
  for (const kw of canonicals) {
    if (pins.length >= RANKING.RARE_PIN_MAX) break;
    const n = df.get(kw) ?? 0;
    if (n < 1 || n > RANKING.RARE_TERM_DF) continue;
    // Match the LITERAL itself, not its subtokens: "ZmEu" expands to "zm"/"eu"
    // variants that match almost any line, which would both fake coverage and
    // wreck the anchor below. Subtoken-only keywords can't be anchored precisely.
    const direct = matcher.expanded.find((ek) => ek.canonical === kw)?.variants.filter((v) => v.kind !== "subtoken") ?? [];
    if (!direct.length) continue;
    const res = direct.map((v) => new RegExp(accentPattern(v.text), "i"));
    // Already represented? Only when an emitted EXCERPT covers the literal —
    // the holder file surfacing with a window anchored elsewhere (its densest
    // generic-keyword region) does not ground a claim about the literal.
    const covered = items.some((i) => i.snippet.split(/\r?\n/).some((ln) => res.some((re) => re.test(ln))));
    if (covered) continue;
    const best = scored.find((f) => f.fh?.matchedKw.has(kw) && !pins.some((p) => p.f.rel === f.rel));
    if (!best) continue;
    pins.push({ f: best, kw, n, res });
  }
  if (pins.length) {
    items.length = Math.max(0, Math.min(items.length, perSource - pins.length));
    for (const { f, kw, n, res } of pins) {
      const content = readText(join(root, f.rel));
      if (!content) continue;
      const lines = content.split(/\r?\n/);
      // Anchor the excerpt on the rare literal's own hit line — the densest
      // keyword region of a big data file usually lies elsewhere. Test the
      // FULL line from the file: stored hit text is truncated (400 chars) and
      // a literal deep inside a huge data line (ZmEu at char ~1450 of
      // bots.yml's Generic Bot regex) would never match the stored prefix.
      const anchor =
        f.fh!.lines.find((l) => {
          const full = lines[l.line - 1] ?? l.text;
          return res.some((re) => re.test(full));
        })?.line ?? f.fh!.lines[0]!.line;
      const w = expandWindow(lines, Math.max(1, anchor - 2), Math.min(lines.length, anchor + 4), anchor);
      const url = ref.isLocal ? undefined : `${ref.webUrl}/blob/${index.commit ?? "HEAD"}/${f.rel}#L${w.start}-L${w.end}`;
      items.push({
        source: "code",
        title: `${f.rel} — rare-term match (${kw})`,
        ref: f.rel,
        location: `${f.rel}:${w.start}-${w.end}`,
        score: Number(f.score.toFixed(3)),
        snippet: lines.slice(w.start - 1, w.end).join("\n"),
        url,
        meta: { matchedKeywords: [...f.fh!.matchedKw], pinnedRareTerm: kw },
      });
      notes.push(`Query term "${kw}" matches only ${n} file(s); pinned ${f.rel} into the results.`);
    }
  }

  return { items, notes, fallback: usedRg ? undefined : "js-scan" };
}

type ExcerptWindow = { start: number; end: number; label: string; callSite?: boolean };

// Choose the excerpt window(s) for one result. The PRIMARY window is unchanged:
// a matching symbol definition wins (anchored at its line); else the densest
// lexical region; else the file head. When the query surfaced call sites in this
// file, the best call region either folds into the primary window (if it is
// within CALLSITE_MERGE_GAP and the merged span fits) or becomes a SECOND
// excerpt — so a call site far from the definition is never lost. Returns 1 or 2
// windows with 1-based inclusive line numbers.
export function excerptWindows(
  lines: string[],
  matcher: KeywordMatcher,
  sym: CodeSymbol | undefined,
  fh: FileHits | undefined,
  callLines: number[],
): ExcerptWindow[] {
  let primary: ExcerptWindow;
  if (sym) {
    const w = expandWindow(lines, Math.max(1, sym.line - 1), Math.min(lines.length, sym.line + 18), sym.line);
    primary = { start: w.start, end: w.end, label: `${sym.kind} ${sym.name}` };
  } else if (fh) {
    const region = regionsFor(fh, matcher).sort((a, b) => b.kwCount - a.kwCount || a.start - b.start)[0]!;
    const w = expandWindow(lines, region.start, region.end, region.anchor);
    primary = { start: w.start, end: w.end, label: "match" };
  } else {
    primary = { start: 1, end: Math.min(lines.length, 20), label: "match" };
  }
  if (!callLines.length) return [primary];

  const sorted = [...new Set(callLines)].sort((a, b) => a - b);
  const regions = mergeLines(sorted, RANKING.CALLSITE_MERGE_GAP);
  const best = regions
    .map((r) => ({ r, count: sorted.filter((l) => l >= r.start && l <= r.end).length }))
    .sort((a, b) => b.count - a.count || a.r.start - b.r.start)[0]!.r;

  // Distance between the call region and the primary window (0 if they overlap).
  const gap = best.start > primary.end ? best.start - primary.end : primary.start > best.end ? primary.start - best.end : 0;
  const mergedStart = Math.min(primary.start, best.start);
  const mergedEnd = Math.max(primary.end, best.end);
  if (gap <= RANKING.CALLSITE_MERGE_GAP && mergedEnd - mergedStart + 1 <= MAX_EXCERPT_LINES) {
    const w = expandWindow(lines, mergedStart, mergedEnd, sym?.line ?? best.start);
    return [{ start: w.start, end: w.end, label: primary.label }];
  }
  const cw = expandWindow(lines, best.start, best.end, best.start);
  return [primary, { start: cw.start, end: cw.end, label: "call site", callSite: true }];
}

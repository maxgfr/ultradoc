import { statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { EvidenceItem, StructuralIndex, CodeSymbol, RepoRef } from "../types.js";
import { sh, have, keywords as extractKeywords, escapeRegExp, rrf } from "../util.js";
import { walk, readText } from "../walk.js";
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
const CONTEXT = 3; // lines of context shown around a region

// Lexical search via ripgrep (`rg --json`), one call with several literal
// patterns OR-ed together. Returns per-file matched keywords + hit lines.
function rgSearch(root: string, kws: string[], scope?: string): Map<string, FileHits> {
  const args = [
    "--json", "-i", "-F", "--max-count", "40", "--max-filesize", "1M",
    "-g", "!**/.ultradoc/**", "-g", "!**/node_modules/**", "-g", "!**/{dist,build,vendor}/**",
    // Lockfiles are machine-generated noise (walk skips them for the index, but
    // ripgrep scans the tree directly, so exclude them here too).
    "-g", "!**/*.lock", "-g", "!**/package-lock.json", "-g", "!**/npm-shrinkwrap.json",
    "-g", "!**/pnpm-lock.yaml", "-g", "!**/yarn.lock", "-g", "!**/go.sum",
  ];
  if (scope) args.push("-g", `${scope}/**`);
  for (const kw of kws) args.push("-e", kw);
  args.push(root);

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
      const m = (sm.match?.text ?? "").toLowerCase();
      if (m) {
        fh.matchedKw.add(m);
        fh.kwCounts.set(m, (fh.kwCounts.get(m) ?? 0) + 1);
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
function jsSearch(root: string, kws: string[], scope?: string): Map<string, FileHits> {
  const byFile = new Map<string, FileHits>();
  const res = kws.map((k) => new RegExp(escapeRegExp(k), "i"));
  const base = scope ? join(root, scope) : root;
  for (const f of walk(base, { maxFiles: 8000 })) {
    const rel = scope ? `${scope}/${f.rel}` : f.rel;
    const content = readText(f.abs);
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    let fh: FileHits | undefined;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const matched: string[] = [];
      for (let k = 0; k < kws.length; k++) if (res[k]!.test(line)) matched.push(kws[k]!.toLowerCase());
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
function regionsFor(fh: FileHits, kws: string[], gap = 8): Region[] {
  const sorted = [...fh.lines].sort((a, b) => a.line - b.line);
  const regions: Region[] = [];
  let cur: { start: number; end: number; lines: { line: number; text: string }[] } | null = null;
  for (const h of sorted) {
    if (cur && h.line - cur.end <= gap) {
      cur.end = h.line;
      cur.lines.push(h);
    } else {
      if (cur) regions.push(scoreRegion(cur, kws));
      cur = { start: h.line, end: h.line, lines: [h] };
    }
  }
  if (cur) regions.push(scoreRegion(cur, kws));
  return regions;
}

function scoreRegion(
  cur: { start: number; end: number; lines: { line: number; text: string }[] },
  kws: string[],
): Region {
  const covered = new Set<string>();
  let anchor = cur.start;
  let best = -1;
  for (const h of cur.lines) {
    let here = 0;
    for (const kw of kws) if (h.text.toLowerCase().includes(kw.toLowerCase())) {
      covered.add(kw.toLowerCase());
      here++;
    }
    if (here > best) {
      best = here;
      anchor = h.line;
    }
  }
  return { start: cur.start, end: cur.end, anchor, kwCount: covered.size };
}

// Rank declared symbols by name similarity to the query keywords. Exact name
// matches and exported symbols score highest — this is what lets "what does
// retryRequest do?" jump straight to the definition.
function symbolScores(index: StructuralIndex, kws: string[]): Map<string, { score: number; sym: CodeSymbol }> {
  const lowered = kws.map((k) => k.toLowerCase());
  const byFile = new Map<string, { score: number; sym: CodeSymbol }>();
  for (const sym of index.symbols) {
    const name = sym.name.toLowerCase();
    let s = 0;
    for (const kw of lowered) {
      if (name === kw) s += 6;
      else if (name.startsWith(kw) || kw.startsWith(name)) s += 3;
      else if (name.includes(kw) || kw.includes(name)) s += 1.5;
    }
    if (s === 0) continue;
    if (sym.exported) s *= 1.5;
    const key = sym.file;
    const prev = byFile.get(key);
    if (!prev || s > prev.score) byFile.set(key, { score: s, sym });
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
): { items: RawItem[]; notes: string[] } {
  const notes: string[] = [];
  const inScope = (rel: string) => !scope || rel.startsWith(scope + "/");
  let kws = extractKeywords(question).slice(0, MAX_KEYWORDS);
  if (kws.length === 0) {
    notes.push("No distinctive keywords in the question; code search may be weak.");
    kws = question.split(/\s+/).filter(Boolean).slice(0, MAX_KEYWORDS);
  }
  if (kws.length === 0) return { items: [], notes };

  const usedRg = have("rg");
  if (!usedRg) notes.push("ripgrep not found — used the slower built-in scanner.");
  const lexical = usedRg ? rgSearch(root, kws, scope) : jsSearch(root, kws, scope);
  const symbols = symbolScores(index, kws);

  // The scope filter applies here so symbol-only hits respect it too (the rg
  // glob is just an optimization).
  const files = new Set<string>([...lexical.keys(), ...symbols.keys()].filter(inScope));

  // Lexical ranking is BM25. ripgrep already provides everything it needs with
  // no stored term index: per-file term counts (kwCounts) and exact document
  // frequencies — rg returns every file matching any keyword, so df is the
  // corpus df. Doc length uses file size / 5 as a token proxy, computed only
  // for the candidates (a few hundred stat calls at most).
  const lowered = kws.map((k) => k.toLowerCase());
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
  // b=0.3: code corpora mix tiny config files with huge implementation files,
  // and the full-strength length normalization (b=0.75) buries exactly the big
  // files where the answer lives (e.g. matomo's js/piwik.js).
  const lexScores = bm25(candidates, lowered, Math.max(index.fileCount, lexical.size), df, 1.2, 0.3);

  // Fuse the BM25 ranking with the symbol-index ranking via RRF — the same
  // scale-free fusion the semantic tier uses — then apply the low-signal
  // penalty on the fused score.
  const lexRank = [...lexScores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([rel]) => rel);
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
  const scored: { rel: string; score: number; fh?: FileHits; sym?: CodeSymbol }[] = [];
  for (const rel of files) {
    const base = fused.get(rel) ?? 0;
    if (base <= 0) continue;
    const lowSignal =
      /(^|\/)(test|tests|__tests__|spec|specs|fixtures?|examples?|benchmark|benchmarks)\//i.test(rel) ||
      docSet.has(rel);
    // ×1000 only for readability of the reported score; ordering is unchanged.
    const score = base * 1000 * (lowSignal ? 0.45 : 1);
    scored.push({ rel, score, fh: lexical.get(rel), sym: symbols.get(rel)?.sym });
  }
  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));

  const items: RawItem[] = [];
  for (const f of scored) {
    if (items.length >= perSource) break;
    const content = readText(join(root, f.rel));
    if (!content) continue;
    const lines = content.split(/\r?\n/);

    // Pick the excerpt anchor: a matching symbol definition wins; else the
    // densest lexical region; else the first line.
    let start: number;
    let end: number;
    let label: string;
    if (f.sym) {
      start = Math.max(1, f.sym.line - 1);
      end = Math.min(lines.length, f.sym.line + 18);
      label = `${f.sym.kind} ${f.sym.name}`;
    } else if (f.fh) {
      const region = regionsFor(f.fh, kws).sort((a, b) => b.kwCount - a.kwCount || a.start - b.start)[0]!;
      start = Math.max(1, region.start - CONTEXT);
      end = Math.min(lines.length, region.end + CONTEXT);
      label = "match";
    } else {
      start = 1;
      end = Math.min(lines.length, 20);
      label = "match";
    }

    const excerpt = lines.slice(start - 1, end).join("\n");
    const url = ref.isLocal
      ? undefined
      : `${ref.webUrl}/blob/${index.commit ?? "HEAD"}/${f.rel}#L${start}-L${end}`;
    items.push({
      source: "code",
      title: `${f.rel} — ${label}`,
      ref: f.rel,
      location: `${f.rel}:${start}-${end}`,
      score: Number(f.score.toFixed(3)),
      snippet: excerpt,
      url,
      meta: { matchedKeywords: f.fh ? [...f.fh.matchedKw] : [], symbol: f.sym?.name },
    });
  }

  return { items, notes };
}

import { spawnSync } from "node:child_process";

// Result of a subprocess call. `ok` is true on exit code 0 with the binary
// found; `missing` is true when the binary isn't on PATH (so callers can fall
// back gracefully instead of crashing — e.g. no ripgrep, no gh, no docker).
export interface ShResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  missing: boolean;
}

// Run a command synchronously. Sync keeps the CLI simple and deterministic
// (mirrors how the engine is structured); the work is I/O-bound git/rg/gh calls
// where parallelism buys little. `input` feeds stdin; `maxBuffer` is generous
// for large `rg --json` / `git log` output.
export function sh(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): ShResult {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 120_000,
    maxBuffer: 64 * 1024 * 1024,
    env: opts.env ?? process.env,
  });
  const missing = !!res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT";
  return {
    ok: !res.error && res.status === 0,
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? (res.error ? String(res.error.message) : ""),
    missing,
  };
}

// Is a binary available on PATH? Cached because we probe the same few tools
// (rg, gh, git, docker) repeatedly within a run.
const whichCache = new Map<string, boolean>();
export function have(cmd: string): boolean {
  const cached = whichCache.get(cmd);
  if (cached !== undefined) return cached;
  const probe = sh(process.platform === "win32" ? "where" : "which", [cmd]);
  const found = probe.ok && probe.stdout.trim().length > 0;
  whichCache.set(cmd, found);
  return found;
}

// Turn an arbitrary repo identifier into a filesystem-safe cache slug, e.g.
// "github.com/expressjs/express" -> "github.com-expressjs-express".
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// Truncate a string to a max length with an ellipsis marker, for snippets.
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n… [truncated ${s.length - max} chars]`;
}

// Escape a string for safe inclusion as a literal inside a RegExp.
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Pull the meaningful keywords out of a natural-language question: lowercase,
// split on non-word chars, drop stopwords and very short tokens, dedupe. Used
// to drive lexical search and symbol ranking deterministically (no LLM).
const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","do","does","did","how","what",
  "why","when","where","which","who","whom","this","that","these","those","of","in","on","to",
  "for","with","and","or","but","if","then","else","than","as","at","by","from","into","about",
  "it","its","i","you","we","they","he","she","there","here","can","could","should","would",
  "will","shall","may","might","must","have","has","had","not","no","yes","so","such","only",
  "any","some","all","get","set","use","used","using","work","works","working","handle","handled",
  "happen","happens","default","value","values","please","explain","tell","me","my","our",
  // French question scaffolding — questions about French-language repos are a
  // supported use case, and short function words otherwise eat the keyword
  // budget and substring-match everywhere ("est" hits "request", "test", …).
  "le","la","les","de","des","du","un","une","est","sont","que","qui","quoi","quel","quelle",
  "quels","quelles","pour","dans","avec","entre","sur","par","pas","plus","et","ou","où","ce",
  "cette","ces","se","sa","son","ses","leur","leurs","comment","pourquoi","quand","fait","faire",
  "peut","doit","être","avoir","il","elle","nous","vous","ils","elles","au","aux","si","ne",
]);

export function keywords(question: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // \p{L}\p{N} (not [A-Za-z0-9]) so accented tokens survive whole: "stratégie"
  // must stay one keyword, not split into "strat"+"gie" at the accent.
  for (const raw of question.split(/[^\p{L}\p{N}_]+/u)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    // Keep identifiers as-is (camelCase/snake_case often carry the real signal),
    // but filter generic English stopwords and 1-char noise.
    if (raw.length < 2) continue;
    if (STOPWORDS.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(raw);
  }
  return out;
}

// Keywords ordered by how *distinctive* they are, most-specific first. Numbers
// (status codes like 429), camelCase/snake_case identifiers, and long tokens
// carry more signal than short generic words. Narrow search APIs (GitHub/GitLab
// issue search, StackOverflow) AND their terms, so feeding them the few most
// specific keywords — rather than the first N — dramatically improves recall.
export function rankedKeywords(question: string): string[] {
  const base = keywords(question);
  const score = (raw: string): number => {
    let s = 0;
    if (/\d/.test(raw)) s += 3;
    if (/[A-Z]/.test(raw) && !/^[A-Z0-9]+$/.test(raw)) s += 2; // camelCase/PascalCase
    if (/_/.test(raw)) s += 2;
    if (raw.length >= 8) s += 1.5;
    else if (raw.length >= 5) s += 0.5;
    return s;
  };
  return base
    .map((k, i) => ({ k, s: score(k), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.k);
}

// ---------------------------------------------------------------------------
// Keyword expansion: fold accents and plurals, split identifiers into
// subtokens, and compile accent-insensitive patterns — so "quelle stratégie de
// réessai" finds "strategie", "retries" finds "retry", and "retryBackoff"
// finds computeBackoff(). Everything stays deterministic (no LLM, no deps).
// ---------------------------------------------------------------------------

// Accent classes per base letter (Latin-1 + Latin Extended-A). Used both to
// strip accents (char → base) and to build accent-insensitive regex classes
// (base → class). Includes non-decomposable letters NFD can't handle (ø, ł, đ).
const ACCENT_CLASSES: Record<string, string> = {
  a: "aàáâãäåāăą",
  c: "cçćĉċč",
  d: "dďđ",
  e: "eèéêëēĕėęě",
  g: "gĝğġģ",
  i: "iìíîïĩīĭįı",
  l: "lĺļľŀł",
  n: "nñńņň",
  o: "oòóôõöøōŏő",
  r: "rŕŗř",
  s: "sśŝşš",
  t: "tţťŧ",
  u: "uùúûüũūŭůűų",
  y: "yýÿŷ",
  z: "zźżž",
};
const BASE_OF = new Map<string, string>();
for (const [base, cls] of Object.entries(ACCENT_CLASSES)) {
  for (const ch of cls) BASE_OF.set(ch, base);
}

function baseChar(ch: string): string {
  const known = BASE_OF.get(ch);
  if (known) return known;
  const stripped = ch.normalize("NFD").replace(/\p{M}+/gu, "");
  return stripped.length === 1 ? stripped : ch;
}

// Strip accents: "réessai" → "reessai". Per-char so ø/ł/đ work too.
export function deaccent(s: string): string {
  let out = "";
  for (const ch of s) out += baseChar(ch);
  return out;
}

// Plural-only suffix fold (no ing/ed — "string"→"str" class of damage). The
// folded form is only ever an *additional* search variant, so a conservative
// miss costs nothing; the original token is always searched as well.
function foldPlural(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && /(?:[sxz]|[cs]h)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !/(?:ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}

// Canonical form of a term: lowercase, accent-stripped, plural-folded. This is
// the key tf/df/coverage are counted under, so "Réessais" and "reessai" both
// attribute to the same canonical.
export function foldTerm(raw: string): string {
  return foldPlural(deaccent(raw.toLowerCase()));
}

// Split an identifier-shaped token into its meaningful parts:
// "retryBackoff" → ["retry","backoff"], "MAX_RETRY_COUNT" → ["max","retry","count"].
// Returns [] when there's nothing to split (single word). Parts shorter than
// 3 chars or that are stopwords carry no signal and are dropped.
export function subtokens(raw: string): string[] {
  const spaced = raw
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2") // camelCase boundary
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2") // HTTPServer → HTTP Server
    .replace(/(\p{L})(\p{N})/gu, "$1 $2") // letter→digit boundary
    .replace(/(\p{N})(\p{L})/gu, "$1 $2"); // digit→letter boundary
  const parts = spaced.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parts.length < 2) return [];
  const out: string[] = [];
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower.length < 3 || STOPWORDS.has(lower)) continue;
    if (!out.includes(lower)) out.push(lower);
    if (out.length >= 4) break;
  }
  return out;
}

export interface KeywordVariant {
  text: string;
  kind: "original" | "folded" | "subtoken";
}

export interface ExpandedKeyword {
  canonical: string; // foldTerm(original) — the key for tf/df/coverage
  original: string;
  variants: KeywordVariant[];
}

// Expand question keywords into search variants under a fixed budget:
// `max` canonical keywords, MAX_PATTERNS total patterns, filled in priority
// order (originals, then folded forms that differ, then subtokens) so variant
// generation can never starve the distinctive original terms.
const MAX_PATTERNS = 24;
const VARIANT_PRIORITY: Record<KeywordVariant["kind"], number> = { original: 0, folded: 1, subtoken: 2 };

export function expandTokens(tokens: string[], max = 8): ExpandedKeyword[] {
  const byCanonical = new Map<string, ExpandedKeyword>();
  for (const raw of tokens) {
    if (byCanonical.size >= max) break;
    const canonical = foldTerm(raw);
    if (!canonical || byCanonical.has(canonical)) continue;
    const plain = deaccent(raw.toLowerCase());
    const variants: KeywordVariant[] = [{ text: raw.toLowerCase(), kind: "original" }];
    if (canonical !== plain) variants.push({ text: canonical, kind: "folded" });
    // ies→y is the English fold ("retries"→"retry"); French plurals just drop
    // the s ("stratégies"→"stratégie"), so search that form too.
    if (plain.length > 4 && plain.endsWith("ies")) variants.push({ text: plain.slice(0, -1), kind: "folded" });
    for (const sub of subtokens(raw)) variants.push({ text: sub, kind: "subtoken" });
    byCanonical.set(canonical, { canonical, original: raw, variants });
  }
  // Enforce the global pattern budget across keywords, best variants first.
  const all = [...byCanonical.values()].flatMap((ek, kwIdx) =>
    ek.variants.map((v) => ({ ek, v, kwIdx })),
  );
  all.sort((a, b) => VARIANT_PRIORITY[a.v.kind] - VARIANT_PRIORITY[b.v.kind] || a.kwIdx - b.kwIdx);
  const seen = new Set<string>();
  const kept = new Set<KeywordVariant>();
  for (const { v } of all) {
    if (kept.size >= MAX_PATTERNS) break;
    const key = deaccent(v.text);
    if (seen.has(key)) continue; // same pattern text across keywords — search once
    seen.add(key);
    kept.add(v);
  }
  for (const ek of byCanonical.values()) ek.variants = ek.variants.filter((v) => kept.has(v));
  return [...byCanonical.values()];
}

// Accent-insensitive regex source for a variant: each base letter becomes its
// accent class ("delai" → "d[eèéêë…]lai"), so plain-typed queries match
// accented text and vice versa. Everything else is escaped literally — with
// `rg -F` dropped, this keeps search semantics literal.
export function accentPattern(text: string): string {
  let out = "";
  for (const ch of text) {
    const cls = ACCENT_CLASSES[baseChar(ch)];
    out += cls ? `[${cls}]` : escapeRegExp(ch);
  }
  return out;
}

// One matcher per question, shared by every lexical consumer (code search,
// docs, web excerpts) so "does this line match?" has a single definition.
export interface KeywordMatcher {
  expanded: ExpandedKeyword[];
  canonicals: string[];
  // Regex sources to hand to ripgrep / the JS scanner, with the canonical each
  // pattern attributes to.
  patterns: { source: string; canonical: string }[];
  // Map a matched span (as reported by rg submatches) back to its canonical.
  canonicalOf(span: string): string | undefined;
  // Which canonicals does this line of text cover?
  matchLine(line: string): Set<string>;
}

function makeMatcher(expanded: ExpandedKeyword[]): KeywordMatcher {
  // Variant-text → canonical. On collisions (a standalone keyword "retry" vs a
  // subtoken "retry" of "retryBackoff") the more direct kind wins, so spans
  // attribute to the keyword the user actually typed.
  const canonicalByVariant = new Map<string, { canonical: string; prio: number }>();
  const patterns: { source: string; canonical: string }[] = [];
  const regexes: { re: RegExp; canonical: string }[] = [];
  for (const ek of expanded) {
    for (const v of ek.variants) {
      const key = foldTerm(v.text);
      const prio = VARIANT_PRIORITY[v.kind];
      const prev = canonicalByVariant.get(key);
      if (!prev || prio < prev.prio) canonicalByVariant.set(key, { canonical: ek.canonical, prio });
      const source = accentPattern(v.text);
      patterns.push({ source, canonical: ek.canonical });
      regexes.push({ re: new RegExp(source, "i"), canonical: ek.canonical });
    }
  }
  return {
    expanded,
    canonicals: expanded.map((e) => e.canonical),
    patterns,
    canonicalOf: (span) => canonicalByVariant.get(foldTerm(span))?.canonical,
    matchLine: (line) => {
      const hit = new Set<string>();
      for (const { re, canonical } of regexes) {
        if (!hit.has(canonical) && re.test(line)) hit.add(canonical);
      }
      return hit;
    },
  };
}

export function buildMatcher(question: string, max = 8): KeywordMatcher {
  return makeMatcher(expandTokens(keywords(question), max));
}

// Fallback matcher for questions with no distinctive keywords: search the raw
// whitespace tokens as-is (still accent-folded for attribution consistency).
export function matcherFromTokens(tokens: string[], max = 8): KeywordMatcher {
  return makeMatcher(expandTokens(tokens.filter(Boolean), max));
}

// Reciprocal Rank Fusion: merge several ranked lists into one robust ranking
// without needing comparable scores across lists. `k` damps the contribution of
// low ranks. Returns keys ordered best-first with a fused score.
export function rrf<T>(
  lists: T[][],
  keyOf: (item: T) => string,
  k = 60,
): Map<string, number> {
  const score = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, idx) => {
      const key = keyOf(item);
      score.set(key, (score.get(key) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return score;
}

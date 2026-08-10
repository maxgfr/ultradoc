import { spawnSync } from "node:child_process";

// Atomic writes now come from the vendored webindex engine.
//
// Adopted with v1.15.0. The implementation was byte-for-byte this one — temp
// sibling, rename, unlink on failure, pid+counter suffix — and this repo was the
// only one of eight that had noticed it was needed. Making it the engine's
// default means `writeArtifact` is atomic everywhere, so the other seven stop
// racing their own manifests without anyone porting anything.
export { writeFileAtomic } from "./engine.js";

// Running a local command now comes from the vendored webindex engine.
//
// Adopted with v1.14.0. The copy that was here differed in two ways, and both
// were defects rather than policy:
//
//   - `status: number | null`. The engine always reports a number — 127 for a
//     binary that is not there, 124 for one it killed — so a caller printing
//     "exit ${status}" can no longer print "exit null".
//   - the 120s default, which is genuinely this repo's: its shell calls include
//     clones and full-history fetches of large repositories. It is declared as
//     `ULTRADOC_SH_TIMEOUT_MS` in src/engine.ts rather than hardcoded here.
//
// `missing` is now optional rather than always present, which no call site in
// this repo reads either way.
export { type ShResult, sh, have } from "./engine.js";

// Truncate a string to a max length with an ellipsis marker, for snippets.
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n… [truncated ${s.length - max} chars]`;
}

// Escape a string for safe inclusion as a literal inside a RegExp.
// Test, spec, example, fixture and benchmark files — their code is not what a
// question about the project is usually asking about. Catches both the
// directory conventions and the per-language BASENAME ones (foo_test.go,
// test_foo.py, foo.test.ts, foo.spec.js, index.test-d.ts), which a
// directory-only rule misses (hono's `src/compose.test.ts` sits in `src/`).
// Used to rank such files down, never to hide them.
export function looksLikeTestFile(rel: string): boolean {
  if (/(^|\/)(tests?|__tests__|specs?|fixtures?|examples?|benchmarks?|e2e)\//i.test(rel)) return true;
  const base = (rel.split("/").pop() ?? "").toLowerCase();
  return /[._-](test|spec)(-d)?\.\w+$/.test(base) || /^(test|conftest)[_.]/.test(base);
}

// Keyword extraction, accent-insensitive matching and the RegExp escape now live
// in the vendored webindex engine. Every function here was byte-for-byte the
// engine's once comments are ignored; the only real difference was two extra
// stopwords, which src/engine.ts now declares as extraStopwords — so this skill
// keeps its exact vocabulary while running the shared implementation.
//
// Re-exported so every existing `from "./util.js"` keeps resolving.
export {
  escapeRegExp,
  keywords,
  rankedKeywords,
  deaccent,
  foldTerm,
  subtokens,
  expandTokens,
  accentPattern,
  buildMatcher,
  matcherFromTokens,
  isStopword,
  type KeywordVariant,
  type ExpandedKeyword,
  type KeywordMatcher,
  // Adopted with webindex v1.13. `rrf` was byte-identical to the engine's,
  // `slugify` was one of three copies that disagreed about length and
  // normalisation — which for an on-disk cache key means one repository under
  // three names — and `mapLimit` was the third copy of bounded concurrency.
  slugify,
  rrf,
  mapLimit,
} from "./engine.js";

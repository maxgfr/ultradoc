import type { CodeSymbol } from "../types.js";
import { extToLang, extractSymbols as engineExtractSymbols, languageOf as engineLanguageOf } from "../vendor/codeindex-engine.mjs";
import { jsTs } from "./js-ts.js";

// Symbol extraction, delegated to the vendored codeindex engine for every
// language EXCEPT JavaScript/TypeScript. The engine's per-language rule sets
// (python, go, ruby, java, rust, csharp, php, swift, kotlin, c, lua, shell,
// elixir, scala) are byte-for-byte the ones that used to live here, so the
// delegation changes nothing.
//
// JS/TS stays local (re-verified at the v2.11.0 re-pin — engine gap, reported
// upstream, still open for this function). Most of the original 2.0.1-era gap
// closed at v2.10.0: the engine's own extractor now matches ultradoc's for
// CommonJS named exports (`exports.foo = …`), `module.exports = { … }` object
// exports, and anonymous default exports named after the file stem, and it
// also marks the ORIGINAL declaration exported on `export default Foo;` (it
// additionally emits a redundant separate `default` symbol, which is
// harmless).
//
// v2.11.0 shipped "emit symbols for export aliases" (EXTRACTOR_VERSION 7),
// fixing `export { a, b as c }` to mirror `c`'s kind from `b`'s local
// declaration (re-export-from and unresolvable aliases get kind "reexport").
// Re-verified directly against the vendored engine.mjs: that fix lives ONLY
// in `extractReexports`, an internal helper reachable exclusively through the
// public `extractCode(rel, ext, content): CodeInfo` function — NOT through
// the plain `extractSymbols(rel, ext, content): CodeSymbol[]` this file
// calls. Calling engine `extractSymbols` directly on `export { Beta as
// PublicBeta }` still returns no `PublicBeta` symbol at all, v2.10.0 and
// v2.11.0 alike. Adopting the fix would mean switching this file's JS/TS path
// (or, since extractCode's `ast ? ast.symbols : extractSymbols(...)` prefers
// AST output over the regex extractor whenever a grammar is loaded, possibly
// every language currently delegated here) from `extractSymbols` to
// `extractCode(...).symbols`, discarding or threading through the extra
// `CodeInfo` fields (summary/refs/pkg/idents/calls/importedNames) — a real
// architecture change, not a drop-in, and out of scope for this re-pin. So:
// jsTs/common.ts stay, unchanged, until that migration is deliberately taken
// on. Once `extractSymbols` itself covers alias cloning (or ultradoc adopts
// `extractCode`), this file becomes a pure re-export.

const JS_TS_EXTS = new Set(jsTs.exts);

// Extract declared symbols from one file. Returns [] for languages without a
// dedicated extractor (their content is still fully searchable via ripgrep).
export function extractSymbols(rel: string, ext: string, content: string): CodeSymbol[] {
  if (JS_TS_EXTS.has(ext)) {
    try {
      return jsTs.extract(rel, content);
    } catch {
      return [];
    }
  }
  return engineExtractSymbols(rel, ext, content);
}

// Human-readable language label for an extension (used for the language
// histogram), falling back to the broad table for non-extracted languages.
export function languageOf(ext: string): string {
  return JS_TS_EXTS.has(ext) ? jsTs.lang : engineLanguageOf(ext);
}

export { extToLang };

import type { CodeSymbol } from "../types.js";
import { extToLang, extractSymbols as engineExtractSymbols, languageOf as engineLanguageOf } from "../vendor/codeindex-engine.mjs";
import { jsTs } from "./js-ts.js";

// Symbol extraction, delegated to the vendored codeindex engine for every
// language EXCEPT JavaScript/TypeScript. The engine's per-language rule sets
// (python, go, ruby, java, rust, csharp, php, swift, kotlin, c, lua, shell,
// elixir, scala) are byte-for-byte the ones that used to live here, so the
// delegation changes nothing.
//
// JS/TS stays local (re-verified at the v2.10.0 re-pin — engine gap, reported
// upstream). Most of the original 2.0.1-era gap has since closed: the
// engine's own extractor now matches ultradoc's for CommonJS named exports
// (`exports.foo = …`), `module.exports = { … }` object exports, and anonymous
// default exports named after the file stem, and it now also marks the
// ORIGINAL declaration exported on `export default Foo;` (it additionally
// emits a redundant separate `default` symbol, which is harmless). The one
// gap that remains: for `export { a, b as c }`, the engine's applyExportLists
// marks `a` and `b` exported but does NOT add a symbol for the alias `c` —
// ultradoc's local common.ts does (see applyExportLists there), which is
// required for "what does this module export as c" lookups. Once the engine
// clones alias symbols too, jsTs and common.ts can be deleted and this file
// becomes a pure re-export.

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

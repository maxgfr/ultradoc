import type { CodeSymbol } from "../types.js";
import { extToLang, extractSymbols as engineExtractSymbols, languageOf as engineLanguageOf } from "../vendor/codeindex-engine.mjs";
import { jsTs } from "./js-ts.js";

// Symbol extraction, delegated to the vendored codeindex engine for every
// language EXCEPT JavaScript/TypeScript. The engine's per-language rule sets
// (python, go, ruby, java, rust, csharp, php, swift, kotlin, c, lua, shell,
// elixir, scala) are byte-for-byte the ones that used to live here, so the
// delegation changes nothing. JS/TS stays local because ultradoc's extractor
// is richer than the engine's (engine gap, reported upstream): CommonJS named
// exports (`exports.foo = …`), `export { a, b as c }` lists incl. aliases,
// `module.exports = { … }` object exports, anonymous default exports named
// after the file stem, and marking the ORIGINAL declaration exported on
// `export default Foo;` (the engine emits a separate `default` symbol
// instead). Once the engine covers those, jsTs and common.ts can be deleted
// and this file becomes a pure re-export.

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

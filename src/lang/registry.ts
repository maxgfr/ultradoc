import type { CodeSymbol } from "../types.js";
import { extToLang, extractSymbols as engineExtractSymbols, languageOf as engineLanguageOf } from "../vendor/codeindex-engine.mjs";
import { jsTs } from "./js-ts.js";

// Symbol extraction, delegated to the vendored codeindex engine for every
// language EXCEPT JavaScript/TypeScript. The engine's per-language rule sets
// (python, go, ruby, java, rust, csharp, php, swift, kotlin, c, lua, shell,
// elixir, scala) are byte-for-byte the ones that used to live here, so the
// delegation changes nothing.
//
// JS/TS stays local (re-verified at the v2.11.1 re-pin — engine gap, reported
// upstream, still open for ultradoc's needs). Most of the original 2.0.1-era
// gap closed at v2.10.0: the engine's own extractor now matches ultradoc's
// for CommonJS named exports (`exports.foo = …`), `module.exports = { … }`
// object exports, and anonymous default exports named after the file stem.
//
// v2.11.1 made `extractSymbols` itself (this exact function, no longer just
// the richer `extractCode`) emit a symbol for `export { a, b as c }`'s alias
// `c`, mirroring `b`'s kind — closing the gap reported after v2.10.0/v2.11.0.
// Tried adopting it for real: swapped this function to call
// `engineExtractSymbols` unconditionally (dropping the JS_TS_EXTS branch
// below) and ran the full suite. tests/lang.test.ts + tests/golden-index.test.ts
// surfaced three concrete diffs against the golden fixture, not zero:
//   1. Aliases now cite the `export { … }` STATEMENT's own line/signature
//      (e.g. `start` from `export { boot as start }` → line 10, signature
//      `"export { start }"`) instead of the ORIGINAL declaration's line/
//      signature (local: line 3, `"function boot(port: number): number {"}`).
//      For ultradoc, whose whole purpose is citing real source lines, this is
//      a real precision loss, not a wash — reverted the experiment over it.
//   2. Bare `export { x } from "./other.js"` (no local declaration) now
//      yields a new symbol kind:"reexport" where ultradoc previously recorded
//      nothing for it (deliberately: "a re-export of another module's
//      symbols, which don't live in this file").
//   3. `export default Foo;` gets a redundant second `kind:"default"` entry
//      alongside the original declaration (already marked exported) —
//      harmless but inflates the symbol count (16 -> 17 on the golden
//      fixture).
// (1) alone is reason enough not to force this: it degrades citation quality
// for aliased exports, which is the one thing ultradoc cannot regress on.
// jsTs/common.ts stay local until the engine's alias symbol reuses the
// original declaration's site instead of the export statement's.

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

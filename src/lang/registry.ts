import type { CodeSymbol } from "../types.js";
import { extToLang, extractSymbols as engineExtractSymbols, languageOf as engineLanguageOf } from "../vendor/codeindex-engine.mjs";

// Symbol extraction, delegated entirely to the vendored codeindex engine for
// every language, including JavaScript/TypeScript.
//
// JS/TS stayed local through v2.11.1 over one gap: the engine's alias symbol
// for `export { orig as alias }` cited the export STATEMENT's own line/
// signature instead of the original declaration's — a real citation-precision
// loss. Issue #9 (fixed at v2.12.0) makes the engine reuse the original
// declaration's line/endLine for the alias (it still emits its own synthetic
// signature, e.g. `"export { start }"`, rather than cloning the declaration's).
// That closes the gap ultradoc cared about. Two related engine behaviors are
// ACCEPTED by product decision as of this re-pin (real, typed facts about the
// file, not defects): a `kind:"reexport"` symbol for bare
// `export { x } from "…"` re-exports, and a second `kind:"default"` entry
// alongside an already-exported `export default Identifier;` declaration.
// jsTs/common.ts are gone; see git history for the local extractor this
// replaced.

// Extract declared symbols from one file. Returns [] for languages without a
// dedicated extractor (their content is still fully searchable via ripgrep).
export function extractSymbols(rel: string, ext: string, content: string): CodeSymbol[] {
  return engineExtractSymbols(rel, ext, content);
}

// Human-readable language label for an extension (used for the language
// histogram), falling back to the broad table for non-extracted languages.
export function languageOf(ext: string): string {
  return engineLanguageOf(ext);
}

export { extToLang };

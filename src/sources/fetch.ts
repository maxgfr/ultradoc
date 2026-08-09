import type { EvidenceItem } from "../types.js";
import { excerptWindows } from "../engine.js";

type RawItem = Omit<EvidenceItem, "id">;

// HTTP and extraction — public surface.
//
// The implementation lives in the vendored webindex engine as of v1.14.0. This
// file stays as the import path the sources already use, and keeps the one
// function that is genuinely this skill's: turning a page into EVIDENCE.
//
// This was the largest fork in the repo and the last to go. The divergence was
// real, not accidental, and it has been resolved in the engine's favour on every
// point — each of these is a behaviour change worth naming:
//
//   - bodies are decoded per the response's own charset. A Windows-1252 docs
//     page used to arrive with every accented character replaced by U+FFFD, be
//     cached that way, and be quoted into a dossier that way.
//   - extraction narrows to the main content region before stripping tags, so a
//     sidebar, a version switcher and a cookie dialog stop landing in excerpts.
//   - the entity table is roughly ten times larger — the Latin-1 accented
//     letters especially — and each reference is decoded exactly once, so
//     `&amp;lt;` stays the literal "&lt;" a page documenting markup meant.
//   - a PDF is recognised from a `/pdf/<id>` route, not only a `.pdf` suffix.
//   - unclosed `<li>` and `<td>` break onto their own lines, so a list or a
//     table row is no longer one long line to the excerpt scanner.
//
// One thing to know at the call sites: the engine reports the built-in reader as
// an ABSENT `extractor` rather than the string "native". `page-cache.ts`
// normalises it, because that value is part of its cache filename.
export {
  DEAD_LINK_STATUS,
  PDF_URL_RE,
  type ExtractResult,
  type HttpResult,
  detectRateLimited,
  fetchAndExtract,
  htmlToText,
  httpGet,
  httpJson,
  nearestHeading,
  parseRetryAfter,
  readCapped,
  readCappedBytes,
  sleep,
} from "../engine.js";

/**
 * Turn fetched page text into ranked evidence excerpts around the question's
 * keywords. Returned as `docs` evidence (the external official documentation).
 *
 * The SCANNING half — score lines, widen the best into windows, keep them from
 * overlapping — is `excerptWindows` in the engine, shared with the other skills
 * that were each doing it slightly differently. What stays here is the part that
 * is this product's and could not be shared: what an excerpt IS, and that a
 * documentation excerpt carries the section it came from.
 *
 * Adopting the engine's scanner changed one thing on purpose. Windows used to be
 * de-duplicated by bucketing line numbers into blocks of twelve, which let two
 * near-identical excerpts survive when they straddled a bucket boundary; they
 * are now rejected on range OVERLAP, which is the property that was actually
 * wanted.
 */
export function excerptsFromText(text: string, url: string, title: string, source: EvidenceItem["source"], question: string, perSource: number): RawItem[] {
  // At most 2 excerpts per document, so the per-source budget spans several
  // distinct pages rather than many slices of one.
  const perDoc = Math.min(2, Math.max(1, perSource));
  return excerptWindows(text, question, { perDoc }).map((w) => ({
    source,
    title: w.heading ? `${title} § ${w.heading}` : title,
    ref: url,
    location: `${url}#~${w.start + 1}`,
    score: Number((w.score + 1).toFixed(3)),
    snippet: w.snippet,
    url,
    meta: w.heading ? { heading: w.heading } : undefined,
  }));
}

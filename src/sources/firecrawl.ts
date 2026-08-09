// The optional self-hosted Firecrawl client — public surface.
//
// The implementation lives in the vendored webindex engine as of v1.14.0. The
// engine's client was already a superset of this one; the reason it was not
// adopted was that this repo's `fetch.ts` consumed it, and `fetch.ts` was itself
// forked — so they had to swap together or not at all. They swapped together.
//
// What the engine's adds, beyond being one copy instead of three:
//
//   - it decides whether the thing answering on :3002 IS Firecrawl. 3002 is a
//     common dev port, so a Vite app squatting it answers 200 and every page
//     extraction then POSTs to something that 404s — while `doctor` cheerfully
//     reports "firecrawl answering". A false positive there is invisible.
//     The check is skipped when the user NAMED the instance, which is what this
//     copy's `firecrawlPinned` distinction was already reaching for.
//   - `/search` and `/scrape` report WHY they produced nothing, so a dossier note
//     can say "rate-limited" rather than the caller guessing "unreachable".
import { env } from "../engine.js";

export {
  FIRECRAWL_DEFAULT_BASE,
  apiPrefix,
  firecrawlBase,
  mapScrapeResponse,
  mapSearchResponse,
  probeFirecrawl,
  resetFirecrawlProbeCache as resetFirecrawlMemo,
  scrapeViaFirecrawl,
  searchViaFirecrawl,
  type FirecrawlOptions,
  type FirecrawlScrape as FirecrawlPage,
} from "../engine.js";

// Extractor identities. Local on purpose: they are part of the page-cache
// filename (see sources/page-cache.ts), because Firecrawl markdown and
// regex-stripped text are DIFFERENT documents for the same URL and must never
// share a cache entry. The engine reports the built-in reader as an ABSENT
// extractor rather than this string, so page-cache.ts normalises it — which is
// why the constant has to keep existing here.
export const EXTRACTOR_FIRECRAWL = "firecrawl";
export const EXTRACTOR_NATIVE = "native";

/**
 * Did the user ASK for this base (flag or env), or is it just the default?
 *
 * An explicit choice that turns out to be unreachable earns a dossier note; the
 * silent default does not, exactly as `--web-engine searxng` does versus `auto`.
 * The engine now makes the same distinction internally — it is what decides
 * whether a scrape returns a `why` — so this is kept only for the call site in
 * fetch.ts that phrases ultradoc's own version of that note.
 */
export function firecrawlPinned(opts: { firecrawl?: string } = {}): boolean {
  return Boolean(opts.firecrawl?.trim() || env("FIRECRAWL"));
}

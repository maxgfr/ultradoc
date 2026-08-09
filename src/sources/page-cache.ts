import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheRoot, extdocsTtlMs } from "../config.js";
import { type ExtractResult, fetchAndExtract } from "./fetch.js";
import { EXTRACTOR_FIRECRAWL, EXTRACTOR_NATIVE, type FirecrawlOptions, firecrawlBase, probeFirecrawl } from "./firecrawl.js";

// One cache for every fetched page — the external docs URL and the web source's
// discovered pages alike. A page's text depends only on its URL and on WHICH
// extractor produced it, never on the question, so repeated questions about the
// same repo cost one fetch. That matters much more now: a Firecrawl scrape
// renders the page in a browser and is far more expensive than a raw GET.

// `v3` is the extraction-FORMAT generation (bumped when the shape of the stored
// text changes); the extractor id after it is the extractor IDENTITY. Both are
// in the filename on purpose: without the id, a week-old regex-stripped copy
// would shadow Firecrawl for the whole TTL after you start the stack, and the
// upgrade would look like it did nothing.
const CACHE_GEN = "v3";

// The on-disk name for (url, extractor). Exported so tests can assert the key.
export function pageCacheFile(dir: string, url: string, extractor: string): string {
  return join(dir, `${url.replace(/[^a-z0-9]+/gi, "_").slice(0, 100)}.${CACHE_GEN}-${extractor}.txt`);
}

// The shared-cache subdirectory holding URL-keyed pages. Exported because
// cache.ts must both skip it when listing repos AND clear it on `clean --all`;
// a second literal in that file is exactly how the two drift apart.
export const PAGES_DIR = "pages";

// Web pages are not repo-specific, and `web --url` runs with no clone at all —
// so they cache under the shared cache root rather than beside a checkout.
export function webPageCacheDir(): string {
  return join(cacheRoot(), PAGES_DIR);
}

// This module keys its files on a plain extractor STRING, because the name goes
// into a path and a rung the engine does not know about would still have to be
// spellable. The engine's `ExtractResult` is narrower — a fixed union, with the
// built-in reader spelled as absence — so a value crossing back into one of its
// shapes is widened here rather than at four call sites.
const asExtractor = (id: string) => id as ExtractResult["extractor"];

// Which extractor THIS run will use, decided before the fetch so the cache can
// be looked up under the right key. The probe is memoised per process, so this
// costs one 2s probe per run at most.
export async function plannedExtractor(opts: FirecrawlOptions = {}): Promise<string> {
  const base = firecrawlBase(opts);
  if (!base) return EXTRACTOR_NATIVE;
  return (await probeFirecrawl(base)) ? EXTRACTOR_FIRECRAWL : EXTRACTOR_NATIVE;
}

// Fetch `url` through the cache in `dir`. A fresh entry for the extractor this
// run would use is served as-is; otherwise the page is refetched and stored
// under the extractor that ACTUALLY produced the text (a Firecrawl attempt that
// fell back writes the native entry, so the next run retries Firecrawl rather
// than inheriting a downgraded copy). If the refetch fails, the stale copy is
// served with a note rather than losing the page entirely.
export async function cachedPageText(dir: string, url: string, opts: FirecrawlOptions = {}): Promise<ExtractResult> {
  const planned = await plannedExtractor(opts);
  const file = pageCacheFile(dir, url, planned);
  let cached: string | undefined;
  let fresh = false;
  try {
    if (existsSync(file)) {
      cached = readFileSync(file, "utf8");
      fresh = Date.now() - statSync(file).mtimeMs < extdocsTtlMs();
    }
  } catch {
    /* fall through to a live fetch */
  }
  if (cached !== undefined && fresh) return { text: cached, extractor: asExtractor(planned), finalUrl: url, status: 200 };

  const res = await fetchAndExtract(url, opts);
  if (res.text) {
    // The engine reports the built-in reader as an ABSENT extractor rather than
    // the string "native", and this value is part of the cache FILENAME — so it
    // is normalised here, at the one place that turns it into a path.
    const actual = res.extractor ?? EXTRACTOR_NATIVE;
    const out = actual === planned ? file : pageCacheFile(dir, url, actual);
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(out, res.text);
    } catch {
      /* caching is best-effort */
    }
    return res;
  }
  // Refetch failed — fall back to the stale copy rather than dropping the page.
  if (cached !== undefined)
    return { text: cached, extractor: asExtractor(planned), finalUrl: url, status: 200, note: `served a stale cached copy of ${url} (refetch failed)` };
  return res;
}

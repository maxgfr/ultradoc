import { envStr, extdocsTtlMs } from "../config.js";
import { httpGet, httpJson } from "./fetch.js";

// A self-hosted, KEYLESS Firecrawl (`ultradoc firecrawl up`, profile `extract`)
// used as a content-cleaning layer in front of the built-in regex HTML stripper:
// it renders the page in a real browser and returns main-content markdown. That
// buys two things the stripper cannot give — no nav/sidebar/cookie chrome in the
// excerpts, and text at all from a JS-rendered docs page.
//
// Everything here degrades instead of throwing. `probeFirecrawl` decides once
// per process whether the stack is even there; a failed scrape returns an error
// string that the caller turns into a dossier note before falling back. No
// exception ever escapes to an `ask`.

// `ultradoc firecrawl up` publishes the API on 3002.
export const FIRECRAWL_DEFAULT_BASE = "http://localhost:3002";

// Extractor identities. They are part of the page-cache filename (see
// sources/page-cache.ts), because Firecrawl markdown and regex-stripped text are
// DIFFERENT documents for the same URL and must never share a cache entry.
export const EXTRACTOR_FIRECRAWL = "firecrawl";
export const EXTRACTOR_NATIVE = "native";

// 2s: the probe runs before the first fetch of a run, and a machine with no
// Firecrawl must not pay for it. A refused connection returns immediately.
const PROBE_TIMEOUT_MS = 2_000;
// Firecrawl's own per-page budget (sent as `timeout`), plus headroom for the
// HTTP call around it — a browser render of a heavy docs page is not fast.
const SCRAPE_TIMEOUT_MS = 30_000;
const SCRAPE_HTTP_TIMEOUT_MS = 45_000;
const SEARCH_TIMEOUT_MS = 20_000;

// Where the base URL comes from, in precedence order:
//   --firecrawl <url>  >  ULTRADOC_FIRECRAWL  >  http://localhost:3002
// The literal value "off" (either source) disables Firecrawl entirely.
export interface FirecrawlOptions {
  firecrawl?: string;
}

// The resolved base URL, or null when Firecrawl is switched off.
export function firecrawlBase(opts: FirecrawlOptions = {}): string | null {
  const raw = (opts.firecrawl?.trim() || envStr("ULTRADOC_FIRECRAWL", FIRECRAWL_DEFAULT_BASE)).trim();
  if (!raw || raw.toLowerCase() === "off") return null;
  return raw.replace(/\/+$/, "");
}

// Did the user ASK for this base (flag or env), or is it just the default? An
// explicit choice that turns out to be unreachable earns a dossier note; the
// silent default does not, exactly as `--web-engine searxng` does versus `auto`.
export function firecrawlPinned(opts: FirecrawlOptions = {}): boolean {
  return Boolean(opts.firecrawl?.trim() || process.env.ULTRADOC_FIRECRAWL?.trim());
}

// Optional bearer token, so the same client can point at Firecrawl Cloud.
// Never needed self-hosted (USE_DB_AUTHENTICATION=false).
function authHeaders(): Record<string, string> {
  const key = process.env.ULTRADOC_FIRECRAWL_KEY?.trim();
  return key ? { authorization: `Bearer ${key}` } : {};
}

const probes = new Map<string, Promise<boolean>>();
const prefixes = new Map<string, string>();

// Is the stack answering? `GET /` returns 200 `{"message":"Firecrawl API",…}`,
// but ANY HTTP status counts as up — a reverse proxy in front may answer 404 or
// 502 on the root while /v2/scrape works. Only status 0 (connection refused,
// DNS failure, timeout) means down. Memoised per base for the process: one
// probe per run is enough, and the fallback path has to stay cheap.
export function probeFirecrawl(base: string): Promise<boolean> {
  let p = probes.get(base);
  if (!p) {
    p = httpGet(`${base}/`, { timeoutMs: PROBE_TIMEOUT_MS })
      .then((r) => r.status > 0)
      .catch(() => false);
    probes.set(base, p);
  }
  return p;
}

// Which API generation to speak. 2.10.5 serves both /v1 and /v2; /v2 is the
// current one, so it is tried first and a 404 pins /v1 for the rest of the
// process. Memoised per base — no extra request is spent discovering it.
export function apiPrefix(base: string): string {
  return prefixes.get(base) ?? "/v2";
}

// Test seam: forget the memoised probe results and API prefixes.
export function resetFirecrawlMemo(): void {
  probes.clear();
  prefixes.clear();
}

export interface FirecrawlPage {
  markdown: string;
  title?: string;
  sourceURL?: string;
  statusCode?: number;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

// PURE. Map a /scrape response body to the fields ultradoc needs, or null when
// there is nothing usable: an explicit `success: false`, a missing `data`, or
// empty markdown. Exported so the mapping is unit-tested against a fixture
// rather than against a live container.
export function mapScrapeResponse(json: unknown): FirecrawlPage | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  if (root.success === false) return null;
  const data = root.data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const markdown = typeof d.markdown === "string" ? d.markdown.trim() : "";
  if (!markdown) return null;
  const meta = (typeof d.metadata === "object" && d.metadata ? d.metadata : {}) as Record<string, unknown>;
  const status = Number(meta.statusCode);
  return {
    markdown,
    title: str(meta.title),
    sourceURL: str(meta.sourceURL) ?? str(meta.url),
    statusCode: Number.isFinite(status) ? status : undefined,
  };
}

// PURE. Map a /search response body to result URLs. Also exported for testing.
export function mapSearchResponse(json: unknown, n: number): string[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  if (root.success === false) return [];
  const data = root.data;
  // `data.web` is the documented shape; a bare array is accepted so a future
  // response envelope does not silently return "no results".
  const web = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown> | null)?.web)
      ? ((data as Record<string, unknown>).web as unknown[])
      : [];
  const urls: string[] = [];
  for (const row of web) {
    const url = str((row as Record<string, unknown> | null)?.url);
    if (url && /^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    if (urls.length >= n) break;
  }
  return urls;
}

// POST to {base}{prefix}{path}, retrying once on /v1 when /v2 answers 404 (the
// route is absent, not the page). Keyless unless ULTRADOC_FIRECRAWL_KEY is set.
async function post(base: string, path: string, body: unknown, timeoutMs: number): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const headers = authHeaders();
  const prefix = apiPrefix(base);
  let r = await httpJson("POST", `${base}${prefix}${path}`, body, { timeoutMs, headers });
  if (r.status === 404 && prefix === "/v2") {
    prefixes.set(base, "/v1");
    r = await httpJson("POST", `${base}/v1${path}`, body, { timeoutMs, headers });
  } else if (r.ok) {
    prefixes.set(base, prefix);
  }
  return r;
}

// Scrape ONE url into markdown. Single /scrape calls only — /batch/scrape is an
// async job that has to be polled, which buys nothing for the handful of pages
// a dossier grounds. `maxAge` lets Firecrawl serve its own cached render, so a
// repeated question about the same repo does not re-render the page.
export async function scrapeViaFirecrawl(url: string, opts: FirecrawlOptions = {}): Promise<{ page: FirecrawlPage | null; error?: string }> {
  const base = firecrawlBase(opts);
  if (!base) return { page: null, error: "firecrawl is off" };
  const body = {
    url,
    formats: ["markdown"],
    onlyMainContent: true,
    blockAds: true,
    removeBase64Images: true,
    maxAge: extdocsTtlMs(),
    timeout: SCRAPE_TIMEOUT_MS,
  };
  const r = await post(base, "/scrape", body, SCRAPE_HTTP_TIMEOUT_MS);
  if (!r.ok) return { page: null, error: r.error ?? `HTTP ${r.status}` };
  const page = mapScrapeResponse(r.data);
  return page ? { page } : { page: null, error: "no markdown in the response" };
}

// Keyless web discovery through Firecrawl's own /search, which cascades
// Fire-Engine → SearXNG → DuckDuckGo server-side. Returns null (never throws)
// when the stack is down or the search came back empty, so `discover` can note
// it and move on.
export async function searchViaFirecrawl(query: string, n: number, opts: FirecrawlOptions = {}): Promise<string[] | null> {
  const base = firecrawlBase(opts);
  if (!base) return null;
  if (!(await probeFirecrawl(base))) return null;
  const r = await post(base, "/search", { query, limit: n, sources: ["web"] }, SEARCH_TIMEOUT_MS);
  if (!r.ok) return null;
  const urls = mapSearchResponse(r.data, n);
  return urls.length ? urls : null;
}

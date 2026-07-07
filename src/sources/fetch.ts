import type { EvidenceItem } from "../types.js";
import { buildMatcher } from "../util.js";

type RawItem = Omit<EvidenceItem, "id">;

const UA = "ultradoc/0.x (+https://github.com/maxgfr/ultradoc)";

export interface HttpResult {
  ok: boolean;
  status: number;
  body: string;
  contentType: string;
  error?: string;
  rateLimited?: boolean; // 429, or 403 with x-ratelimit-remaining: 0 (GitHub)
  retryAfterMs?: number; // parsed Retry-After, capped
}

export interface HttpGetOptions {
  timeoutMs?: number;
  accept?: string;
  maxBytes?: number;
  headers?: Record<string, string>; // extra request headers (e.g. authorization)
  retries?: number; // opt-in bounded retries for transient failures (default 0)
}

// Bounded, jittered retry policy. GET is idempotent, so retrying transient
// failures is safe; 403 is NEVER retried (on GitHub it means rate-limited, and
// retrying only burns the remaining quota faster).
const RETRY_MAX = 2;
const RETRY_BASE_MS = 500;
const RETRY_AFTER_CAP_MS = 10_000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// A GitHub-style rate-limit signal: an explicit 429, or a 403 with the
// remaining-quota header at 0 (how the unauthenticated search API reports it).
function detectRateLimited(status: number, headers: Headers): boolean {
  if (status === 429) return true;
  return status === 403 && headers.get("x-ratelimit-remaining") === "0";
}

// Parse a Retry-After header (delta-seconds or HTTP-date) into a capped ms delay.
function parseRetryAfter(headers: Headers): number | undefined {
  const h = headers.get("retry-after");
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(Math.max(0, secs) * 1000, RETRY_AFTER_CAP_MS);
  const when = Date.parse(h);
  if (Number.isFinite(when)) return Math.min(Math.max(0, when - Date.now()), RETRY_AFTER_CAP_MS);
  return undefined;
}

// Stream a fetch Response body, keeping at most `max` bytes and cancelling the
// rest the moment the cap is crossed — so a huge (or never-ending) page is
// bounded instead of fully buffered into memory. Falls back to a one-shot read
// on platforms that expose no readable stream.
export async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, max).toString("utf8");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    const remaining = max - total;
    if (chunk.length >= remaining) {
      chunks.push(chunk.subarray(0, remaining));
      // We have everything we'll keep; abort the rest of the transfer.
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }
  return Buffer.concat(chunks).toString("utf8");
}

// One GET attempt: times out, sends a UA (+ any extra headers), and bounds the
// body so a huge page can't blow up memory — rejects early on an oversized
// declared Content-Length, otherwise streams and stops at maxBytes. Surfaces a
// rate-limit signal and any Retry-After hint for the caller/retry loop.
async function httpGetOnce(url: string, opts: HttpGetOptions): Promise<HttpResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  const max = opts.maxBytes ?? 4 * 1024 * 1024;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: opts.accept ?? "*/*", ...(opts.headers ?? {}) },
    });
    const contentType = res.headers.get("content-type") ?? "";
    const rateLimited = detectRateLimited(res.status, res.headers);
    const retryAfterMs = parseRetryAfter(res.headers);
    // Don't even start streaming a body the server says is over the cap.
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > max) {
      ctrl.abort();
      return { ok: false, status: res.status, body: "", contentType, error: `response too large: ${declared} bytes > ${max} cap`, rateLimited, retryAfterMs };
    }
    const body = await readCapped(res, max);
    return { ok: res.ok, status: res.status, body, contentType, rateLimited, retryAfterMs };
  } catch (e) {
    return { ok: false, status: 0, body: "", contentType: "", error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

// Minimal HTTP GET on top of Node's built-in fetch (Node ≥18) — no
// dependencies. With `opts.retries` (default 0), retries transient failures
// (network error, 429/502/503/504) with a jittered backoff that honours
// Retry-After; a 403 is returned immediately (rate limit — never retried).
export async function httpGet(url: string, opts: HttpGetOptions = {}): Promise<HttpResult> {
  const retries = Math.max(0, Math.min(opts.retries ?? 0, RETRY_MAX));
  let res = await httpGetOnce(url, opts);
  for (let attempt = 0; attempt < retries; attempt++) {
    if (res.ok || res.status === 403) return res;
    if (res.status !== 0 && !RETRYABLE_STATUS.has(res.status)) return res;
    const backoff = Math.min(RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 250), RETRY_AFTER_CAP_MS);
    await sleep(res.retryAfterMs ?? backoff);
    res = await httpGetOnce(url, opts);
  }
  return res;
}

// JSON request/response helper for the local vector backend (Qdrant / Ollama).
// Returns parsed JSON or an error; never throws. Local-only, keyless.
export async function httpJson(
  method: string,
  url: string,
  body?: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": UA },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: undefined, error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&copy;": "©",
};

// Extract readable text from an HTML page. Zero-dep and intentionally simple:
// drop script/style/head/nav/footer, turn block tags into newlines, strip the
// rest, decode common entities, collapse whitespace. Good enough to ground an
// answer in the prose of a docs page without pulling in a DOM library.
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|head|nav|footer|svg)[\s\S]*?<\/\1>/gi, " ");
  // Keep heading structure as markdown markers so excerpts can carry their
  // section title ("§ Configuration") instead of an anonymous text window.
  s = s.replace(/<h([1-6])(?:\s[^>]*)?>/gi, (_m, n) => "\n" + "#".repeat(Number(n)) + " ");
  s = s.replace(/<\/(p|div|section|article|li|tr|h[1-6]|pre|blockquote|br)>/gi, "\n");
  s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&#(\d+);/g, (_m, n) => {
    try {
      return String.fromCodePoint(Number(n));
    } catch {
      return " ";
    }
  });
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

// Fetch a URL and return its readable text (HTML stripped to prose). Used by
// the external-docs and web sources.
export async function fetchAndExtract(url: string): Promise<{ text: string; note?: string }> {
  const res = await httpGet(url, { accept: "text/html,text/plain,*/*", retries: 2 });
  if (!res.ok) {
    return { text: "", note: `Could not fetch ${url} (status ${res.status}${res.error ? ", " + res.error : ""}).` };
  }
  const isHtml = /html/i.test(res.contentType) || /^\s*</.test(res.body);
  const text = isHtml ? htmlToText(res.body) : res.body;
  return { text };
}

// The markdown section heading an anchor line sits under, ignoring
// heading-lookalikes inside fenced code blocks. `anchor` is a 0-based index.
export function nearestHeading(lines: string[], anchor: number): string | undefined {
  let heading: string | undefined;
  let inFence = false;
  for (let i = 0; i <= anchor && i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) heading = m[1]!.trim();
  }
  return heading;
}

// Turn fetched page text into ranked evidence excerpts around the question's
// keywords. Returned as `docs` evidence (the external official documentation).
export function excerptsFromText(text: string, url: string, title: string, source: EvidenceItem["source"], question: string, perSource: number): RawItem[] {
  const lines = text.split("\n");
  const matcher = buildMatcher(question);
  const hits: { idx: number; cov: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cov = matcher.matchLine(lines[i]!).size;
    if (cov > 0) hits.push({ idx: i, cov });
  }
  hits.sort((a, b) => b.cov - a.cov || a.idx - b.idx);

  const items: RawItem[] = [];
  const seen = new Set<number>();
  const take = hits.length ? hits : [{ idx: 0, cov: 0 }];
  // At most 2 excerpts per document, so the per-source budget spans several
  // distinct pages rather than many slices of one.
  const perDoc = Math.min(2, Math.max(1, perSource));
  for (const h of take) {
    if (items.length >= perDoc) break;
    const block = Math.floor(h.idx / 12);
    if (seen.has(block)) continue;
    seen.add(block);
    const start = Math.max(0, h.idx - 3);
    const end = Math.min(lines.length, h.idx + 12);
    const snippet = lines.slice(start, end).join("\n").slice(0, 1500);
    if (!snippet.trim()) continue;
    const heading = nearestHeading(lines, h.idx);
    items.push({
      source,
      title: heading ? `${title} § ${heading}` : title,
      ref: url,
      location: `${url}#~${start + 1}`,
      score: Number((h.cov + 1).toFixed(3)),
      snippet,
      url,
      meta: heading ? { heading } : undefined,
    });
  }
  return items;
}

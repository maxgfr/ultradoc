import type { RunContext, SourceResult, EvidenceItem, WebEngine } from "../types.js";
import { keywords } from "../util.js";
import { httpGet, fetchAndExtract, excerptsFromText } from "./fetch.js";

type RawItem = Omit<EvidenceItem, "id">;

const SEARXNG_BASE = process.env.ULTRADOC_SEARXNG || "http://localhost:8888";

// Discovery via a LOCAL SearXNG instance (keyless, self-hosted, brought up by
// `ultradoc semantic up`). Returns null when unreachable so we fall through.
async function viaSearxng(query: string, n: number): Promise<string[] | null> {
  const url = `${SEARXNG_BASE.replace(/\/$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
  const r = await httpGet(url, { accept: "application/json", timeoutMs: 8000 });
  if (!r.ok) return null;
  try {
    const data = JSON.parse(r.body);
    const urls = (data.results ?? []).map((x: any) => x.url).filter(Boolean);
    return urls.slice(0, n);
  } catch {
    return null;
  }
}

// Pure parser for a DuckDuckGo HTML result page: pull up to `n` result anchors
// (`result__a`) and decode each real target out of DDG's `uddg=` redirector.
// Exported so it can be unit-tested against fixture HTML without the network.
// Matches any result anchor regardless of attribute order, then pulls href out
// separately — HTML attribute order is arbitrary, so a single
// class-before-href pattern silently breaks if DDG reorders them.
export function parseDuckDuckGoResults(html: string, n: number): string[] {
  const urls: string[] = [];
  const tagRe = /<a\b[^>]*\bresult__a\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) && urls.length < n) {
    const href0 = /\bhref="([^"]+)"/.exec(m[0]);
    if (!href0) continue;
    let href = href0[1]!;
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) {
      try {
        href = decodeURIComponent(uddg[1]!);
      } catch {
        /* keep raw */
      }
    }
    if (/^https?:\/\//.test(href) && !/duckduckgo\.com/.test(href)) urls.push(href);
  }
  return urls;
}

// Discovery by scraping the DuckDuckGo HTML endpoint (keyless, no Docker). DDG
// wraps result links through a redirector carrying the real URL in `uddg`.
async function viaDuckDuckGo(query: string, n: number): Promise<string[] | null> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const r = await httpGet(url, { accept: "text/html", timeoutMs: 12000, retries: 2 });
  if (!r.ok || !r.body) return null;
  const urls = parseDuckDuckGoResults(r.body, n);
  return urls.length ? urls : null;
}

// Resolve candidate URLs for a query under the chosen engine policy. `auto`
// tries SearXNG, then DuckDuckGo. The `claude` engine (and the all-failed case)
// returns no URLs and signals the orchestrator/model to use its built-in
// WebSearch and feed URLs back via `ultradoc web --url`.
async function discover(query: string, engine: WebEngine, n: number): Promise<{ urls: string[]; via: string; notes: string[] }> {
  const notes: string[] = [];
  if (engine === "searxng" || engine === "auto") {
    const s = await viaSearxng(query, n);
    if (s?.length) return { urls: s, via: "searxng", notes };
    if (engine === "searxng") notes.push(`SearXNG unreachable at ${SEARXNG_BASE}. Run \`ultradoc semantic up\`.`);
  }
  if (engine === "ddg" || engine === "auto") {
    const d = await viaDuckDuckGo(query, n);
    if (d?.length) return { urls: d, via: "duckduckgo", notes };
    if (engine === "ddg") notes.push("DuckDuckGo returned no results.");
  }
  if (engine === "claude" || engine === "auto") {
    notes.push(
      "No keyless engine returned results. Use your built-in WebSearch to find URLs, " + "then ground them with `ultradoc web --repo <repo> --url <url>`.",
    );
  }
  return { urls: [], via: "none", notes };
}

// Fetch a set of URLs and turn each into grounded web evidence. Shared by the
// `web` discovery flow and the `ultradoc web --url` drill-down.
export async function webFetchUrls(urls: string[], question: string, perSource: number): Promise<{ items: RawItem[]; notes: string[] }> {
  const items: RawItem[] = [];
  const notes: string[] = [];
  for (const url of urls.slice(0, Math.max(1, Math.ceil(perSource / 2)))) {
    const { text, note } = await fetchAndExtract(url);
    if (note) notes.push(note);
    if (!text) continue;
    const ex = excerptsFromText(text, url, `Web — ${url}`, "web", question, perSource);
    items.push(
      ...(ex.length
        ? ex
        : [
            {
              source: "web" as const,
              title: `Web — ${url}`,
              ref: url,
              location: url,
              score: 0,
              snippet: text.slice(0, 800),
              url,
            },
          ]),
    );
  }
  return { items, notes };
}

// The `web` source: discover candidate pages (keyless, layered) then fetch and
// extract them into grounded evidence.
export async function webSource(ctx: RunContext): Promise<SourceResult> {
  const kws = keywords(ctx.options.question).slice(0, 8).join(" ");
  const project = ctx.repoRef.repo ?? "";
  const query = `${project} ${kws}`.trim();
  if (!query) return { source: "web", items: [], notes: ["No keywords to search the web."] };

  const { urls, via, notes } = await discover(query, ctx.options.webEngine, ctx.options.perSource);
  if (urls.length === 0) return { source: "web", items: [], notes };

  const fetched = await webFetchUrls(urls, ctx.options.question, ctx.options.perSource);
  return {
    source: "web",
    items: fetched.items,
    notes: [`Web discovery via ${via}.`, ...notes, ...fetched.notes],
  };
}

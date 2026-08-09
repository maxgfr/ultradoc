import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiPrefix,
  firecrawlBase,
  firecrawlPinned,
  mapScrapeResponse,
  mapSearchResponse,
  probeFirecrawl,
  resetFirecrawlMemo,
  scrapeViaFirecrawl,
} from "../src/sources/firecrawl.js";
import { fetchAndExtract } from "../src/sources/fetch.js";

// A real /v2/scrape body, trimmed to the fields the client reads. The point of
// keeping it verbatim is that mapScrapeResponse is tested against the SHAPE
// Firecrawl actually returns, not against the shape we wish it returned.
const SCRAPE_FIXTURE = {
  success: true,
  data: {
    markdown: "# Upgrade to Express v5\n\nExpress 5 removes the `app.del()` alias.",
    metadata: {
      title: "Upgrade to Express v5",
      description: "Migration guide",
      language: "en",
      sourceURL: "https://expressjs.com/en/guide/migrating-5.html",
      url: "https://expressjs.com/en/guide/migrating-5.html",
      statusCode: 200,
      contentType: "text/html",
    },
  },
};

const SEARCH_FIXTURE = {
  success: true,
  data: {
    web: [
      { url: "https://expressjs.com/en/guide/migrating-5.html", title: "Migrating to v5", description: "…", markdown: null },
      { url: "https://github.com/expressjs/express/releases", title: "Releases", description: "…", markdown: null },
    ],
  },
};

// Build a fetch Response stand-in carrying a JSON body (what httpJson reads).
function jsonRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// …and one carrying an HTML body (what httpGet reads).
function htmlRes(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "text/html" }),
    body: null, // forces readCapped's arrayBuffer fallback
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  } as unknown as Response;
}

const prevBase = process.env.ULTRADOC_FIRECRAWL;
const prevKey = process.env.ULTRADOC_FIRECRAWL_KEY;

beforeEach(() => {
  resetFirecrawlMemo();
  delete process.env.ULTRADOC_FIRECRAWL;
  delete process.env.ULTRADOC_FIRECRAWL_KEY;
});
afterEach(() => {
  vi.restoreAllMocks();
  resetFirecrawlMemo();
  if (prevBase === undefined) delete process.env.ULTRADOC_FIRECRAWL;
  else process.env.ULTRADOC_FIRECRAWL = prevBase;
  if (prevKey === undefined) delete process.env.ULTRADOC_FIRECRAWL_KEY;
  else process.env.ULTRADOC_FIRECRAWL_KEY = prevKey;
});

describe("firecrawlBase resolution", () => {
  it("defaults to the self-hosted localhost stack", () => {
    expect(firecrawlBase()).toBe("http://localhost:3002");
    expect(firecrawlPinned()).toBe(false);
  });

  it("prefers the flag over the env var and strips a trailing slash", () => {
    process.env.ULTRADOC_FIRECRAWL = "http://env:3002";
    expect(firecrawlBase({ firecrawl: "http://flag:3002/" })).toBe("http://flag:3002");
    expect(firecrawlBase()).toBe("http://env:3002");
    expect(firecrawlPinned()).toBe(true);
  });

  it('treats the literal "off" as disabled, from either source', () => {
    expect(firecrawlBase({ firecrawl: "off" })).toBeNull();
    process.env.ULTRADOC_FIRECRAWL = "OFF";
    expect(firecrawlBase()).toBeNull();
  });
});

describe("mapScrapeResponse (pure)", () => {
  it("maps a real /scrape body to markdown + metadata", () => {
    const page = mapScrapeResponse(SCRAPE_FIXTURE);
    expect(page).not.toBeNull();
    expect(page!.markdown).toContain("Upgrade to Express v5");
    expect(page!.title).toBe("Upgrade to Express v5");
    expect(page!.sourceURL).toBe("https://expressjs.com/en/guide/migrating-5.html");
    expect(page!.statusCode).toBe(200);
  });

  it("falls back to metadata.url when sourceURL is absent", () => {
    const page = mapScrapeResponse({ success: true, data: { markdown: "x", metadata: { url: "https://a/b" } } });
    expect(page!.sourceURL).toBe("https://a/b");
  });

  it("returns null on success:false, missing data, empty markdown, or junk", () => {
    expect(mapScrapeResponse({ success: false, data: { markdown: "ignored" } })).toBeNull();
    expect(mapScrapeResponse({ success: true })).toBeNull();
    expect(mapScrapeResponse({ success: true, data: { markdown: "   " } })).toBeNull();
    expect(mapScrapeResponse({ success: true, data: { markdown: 42 } })).toBeNull();
    expect(mapScrapeResponse(null)).toBeNull();
    expect(mapScrapeResponse("nope")).toBeNull();
  });

  it("tolerates a response with no metadata at all", () => {
    const page = mapScrapeResponse({ success: true, data: { markdown: "body" } });
    expect(page).toEqual({ markdown: "body", title: undefined, sourceURL: undefined, statusCode: undefined });
  });
});

describe("mapSearchResponse (pure)", () => {
  it("pulls result URLs out of data.web", () => {
    // The engine returns rich hits (url + title + description) and does NOT cap:
    // capping is the caller's, because how many results a run wants is a policy
    // and a mapper that silently drops rows cannot be reused by a caller that
    // wanted them. src/sources/web.ts slices.
    expect(mapSearchResponse(SEARCH_FIXTURE).map((h) => h.url)).toEqual([
      "https://expressjs.com/en/guide/migrating-5.html",
      "https://github.com/expressjs/express/releases",
    ]);
  });

  it("returns nothing on a failed or shapeless response", () => {
    expect(mapSearchResponse({ success: false, data: { web: [{ url: "https://x" }] } })).toEqual([]);
    expect(mapSearchResponse({ success: true, data: {} })).toEqual([]);
    expect(mapSearchResponse(undefined)).toEqual([]);
  });

  it("drops an entry with no usable URL", () => {
    const json = { success: true, data: { web: [{ url: "https://a" }, { title: "no url" }, {}] } };
    expect(mapSearchResponse(json).map((h) => h.url)).toEqual(["https://a"]);
  });
});

describe("probeFirecrawl", () => {
  it("accepts a non-HTML answer as up, and memoises it for the process", async () => {
    // A proxy's 404 or an older build's JSON root still proves Firecrawl is
    // behind it. What is NOT accepted any more is an HTML page with no Firecrawl
    // marker — see the next case.
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(404, {}));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeFirecrawl("http://fc:3002")).toBe(true);
    expect(await probeFirecrawl("http://fc:3002")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // memoised, not re-probed
  });

  it("refuses somebody else's app squatting the port", async () => {
    // 3002 is a common dev port. A Vite app answering 200 there used to count as
    // "firecrawl answering": every page extraction then POSTed to something that
    // 404s, paying a wasted round-trip before falling back, while doctor reported
    // the stack as up. A false positive here is invisible, which is why it is
    // worse than a false negative.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlRes(200, "<html><title>Vite App</title></html>")));
    expect(await probeFirecrawl("http://squatted:3002")).toBe(false);
  });

  it("trusts an instance the user NAMED, proxy or not", async () => {
    // Pointing --firecrawl somewhere is a statement about what lives there, and
    // it may legitimately sit behind a proxy that masks the root.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlRes(200, "<html>a reverse proxy landing page</html>")));
    expect(await probeFirecrawl("http://proxied:3002", true)).toBe(true);
  });

  it("is down when the connection is refused (no status at all)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3002")));
    expect(await probeFirecrawl("http://dead:3002")).toBe(false);
  });
});

describe("scrapeViaFirecrawl", () => {
  it("posts a single /v2/scrape with the main-content options and maps the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, SCRAPE_FIXTURE));
    vi.stubGlobal("fetch", fetchMock);
    const r = await scrapeViaFirecrawl("https://expressjs.com/en/guide/migrating-5.html", { firecrawl: "http://fc:3002" });
    expect(r.data!.markdown).toContain("Express 5");
    // Call 0 is the availability probe, which the engine runs before it will
    // POST anything. The scrape is the one after it.
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("http://fc:3002/v2/scrape");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ formats: ["markdown"], onlyMainContent: true, blockAds: true, removeBase64Images: true });
    expect(body.maxAge).toBeGreaterThan(0);
    // Keyless self-hosted: no Authorization header is sent.
    expect((init as RequestInit).headers).not.toHaveProperty("authorization");
  });

  it("falls back to /v1 when /v2 answers 404, and pins it for later calls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(200, {})) // the probe
      .mockResolvedValueOnce(jsonRes(404, { error: "Not Found" }))
      .mockResolvedValue(jsonRes(200, SCRAPE_FIXTURE));
    vi.stubGlobal("fetch", fetchMock);
    const r = await scrapeViaFirecrawl("https://x/y", { firecrawl: "http://old:3002" });
    expect(r.data).toBeDefined();
    // Call 0 is the probe; the versioned POSTs follow it.
    expect(fetchMock.mock.calls[1]![0]).toBe("http://old:3002/v2/scrape");
    expect(fetchMock.mock.calls[2]![0]).toBe("http://old:3002/v1/scrape");
    expect(apiPrefix("http://old:3002")).toBe("/v1");
  });

  it("sends a bearer token when one is configured (Firecrawl Cloud)", async () => {
    process.env.ULTRADOC_FIRECRAWL_KEY = "fc-secret";
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, SCRAPE_FIXTURE));
    vi.stubGlobal("fetch", fetchMock);
    await scrapeViaFirecrawl("https://x/y", { firecrawl: "https://api.firecrawl.dev" });
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toMatchObject({ authorization: "Bearer fc-secret" });
  });

  it("reports an error instead of throwing when the API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(500, { success: false })));
    const r = await scrapeViaFirecrawl("https://x/y", { firecrawl: "http://fc:3002" });
    expect(r.data).toBeUndefined();
    expect(r.why).toMatch(/500/);
  });
});

describe("fetchAndExtract — Firecrawl first, native fallback", () => {
  it("returns Firecrawl markdown when the stack is up", async () => {
    const fetchMock = vi.fn(async (url: string) => (url.endsWith("/scrape") ? jsonRes(200, SCRAPE_FIXTURE) : htmlRes(200, '{"message":"Firecrawl API"}')));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchAndExtract("https://x/y", { firecrawl: "http://fc:3002" });
    expect(r.extractor).toBe("firecrawl");
    expect(r.text).toContain("Upgrade to Express v5");
    expect(r.note).toBeUndefined();
  });

  it("uses the built-in extractor with a note when Firecrawl is up but fails on the page", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/scrape")) return jsonRes(200, { success: false, error: "browser crashed" });
      if (url === "http://fc:3002/") return htmlRes(200, "ok");
      return htmlRes(200, "<html><nav>menu</nav><p>real prose</p></html>");
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchAndExtract("https://x/y", { firecrawl: "http://fc:3002" });
    // Absent, not "native": the engine reports the built-in reader by saying
    // nothing, and page-cache.ts is the one place that normalises it back into a
    // filename component.
    expect(r.extractor).toBeUndefined();
    expect(r.text).toContain("real prose");
    expect(r.note).toMatch(/Firecrawl returned no markdown for https:\/\/x\/y/);
  });

  it("falls back silently-but-notedly when a PINNED Firecrawl is down", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "http://dead:3002/") throw new Error("connect ECONNREFUSED");
      return htmlRes(200, "<html><p>still answered</p></html>");
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchAndExtract("https://x/y", { firecrawl: "http://dead:3002" });
    // Absent, not "native": the engine reports the built-in reader by saying
    // nothing, and page-cache.ts is the one place that normalises it back into a
    // filename component.
    expect(r.extractor).toBeUndefined();
    expect(r.text).toContain("still answered");
    expect(r.note).toMatch(/Firecrawl not reachable at http:\/\/dead:3002/);
  });

  it("says nothing when the DEFAULT base is down — a machine without the stack is not a degraded run", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "http://localhost:3002/") throw new Error("connect ECONNREFUSED");
      return htmlRes(200, "<html><p>plain page</p></html>");
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchAndExtract("https://x/y");
    // Absent, not "native": the engine reports the built-in reader by saying
    // nothing, and page-cache.ts is the one place that normalises it back into a
    // filename component.
    expect(r.extractor).toBeUndefined();
    expect(r.note).toBeUndefined();
  });

  it("never probes when Firecrawl is off", async () => {
    const fetchMock = vi.fn(async (_url: string) => htmlRes(200, "<html><p>direct</p></html>"));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchAndExtract("https://x/y", { firecrawl: "off" });
    // Absent, not "native": the engine reports the built-in reader by saying
    // nothing, and page-cache.ts is the one place that normalises it back into a
    // filename component.
    expect(r.extractor).toBeUndefined();
    // One call: the page itself. No probe, so `off` costs nothing.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://x/y");
  });
});

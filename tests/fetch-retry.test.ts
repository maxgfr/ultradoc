import { afterEach, describe, expect, it, vi } from "vitest";
import { httpGet } from "../src/sources/fetch.js";

// Build a minimal fetch Response stand-in with the fields httpGet reads.
function res(status: number, body = "", headers: Record<string, string> = {}): Response {
  const h = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: h,
    body: null, // forces readCapped's arrayBuffer fallback
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("httpGet retry policy", () => {
  it("retries a 503 then succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200, "ok"));
    vi.stubGlobal("fetch", fetchMock);
    const r = await httpGet("https://x/api", { retries: 2 });
    expect(r.ok).toBe(true);
    expect(r.body).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries a 403 (rate limit — retrying burns quota)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(403, "", { "x-ratelimit-remaining": "0" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await httpGet("https://x/api", { retries: 2 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.rateLimited).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps at 3 attempts (2 retries) for a persistent 503", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(503));
    vi.stubGlobal("fetch", fetchMock);
    const r = await httpGet("https://x/api", { retries: 2 });
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry when retries is 0 (default)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(503));
    vi.stubGlobal("fetch", fetchMock);
    await httpGet("https://x/api");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("flags a 429 as rateLimited", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(429));
    vi.stubGlobal("fetch", fetchMock);
    const r = await httpGet("https://x/api");
    expect(r.rateLimited).toBe(true);
  });

  it("passes custom headers through to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, "ok"));
    vi.stubGlobal("fetch", fetchMock);
    await httpGet("https://x/api", { headers: { authorization: "Bearer T" } });
    const passed = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((passed.headers as Record<string, string>).authorization).toBe("Bearer T");
  });
});

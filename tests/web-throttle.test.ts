import { afterEach, describe, expect, it, vi } from "vitest";
import { discover } from "../src/sources/web.js";

function res(body: string, contentType = "application/json") {
  return {
    ok: true,
    status: 200,
    body: null,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  } as unknown as Response;
}

// SearXNG answers 200 with an EMPTY result list when its own upstreams have
// throttled it, naming them in `unresponsive_engines`. Reporting that as a query
// with no hits sends you rewording a question that was fine — or restarting a
// container that is running.
describe("SearXNG throttling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("names the throttled upstream engines and says it is transient", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        res(
          JSON.stringify({
            results: [],
            unresponsive_engines: [
              ["brave", "Suspended: too many requests"],
              ["duckduckgo", "CAPTCHA"],
            ],
          }),
        ),
      ),
    );
    const r = await discover("anything", "searxng", 5);
    expect(r.urls).toHaveLength(0);
    const note = r.notes.join(" ");
    expect(note).toMatch(/throttling this instance/i);
    expect(note).toMatch(/transient/i);
    expect(note).toContain("brave (Suspended: too many requests)");
  });

  // Previously `null` (unreachable) and `[]` (reachable, nothing back) produced
  // the same "unreachable — run `ultradoc semantic up`" note.
  it("distinguishes an empty answer from an unreachable instance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(JSON.stringify({ results: [] }))),
    );
    const empty = await discover("anything", "searxng", 5);
    expect(empty.notes.join(" ")).toContain("SearXNG returned no results.");
    expect(empty.notes.join(" ")).not.toMatch(/unreachable/i);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const down = await discover("anything", "searxng", 5);
    expect(down.notes.join(" ")).toMatch(/unreachable/i);
  });
});

// The last step of the cascade is host-agnostic: it tells the agent to use its
// own web search. `claude` is the deprecated name of that engine.
describe("host engine", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["host", "claude"] as const)("%s skips keyless discovery and emits the generic hint", async (engine) => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("no network expected");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const r = await discover("anything", engine, 5);
    expect(r.urls).toHaveLength(0);
    expect(r.via).toBe("none");
    expect(fetchSpy).not.toHaveBeenCalled();
    const note = r.notes.join(" ");
    expect(note).toContain("the agent's built-in web search");
    expect(note).not.toMatch(/WebSearch/);
  });
});

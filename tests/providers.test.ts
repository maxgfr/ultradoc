import { afterEach, describe, expect, it, vi } from "vitest";
import { rerank, github } from "../src/providers/github.js";
import { providerFor } from "../src/providers/registry.js";
import * as util from "../src/util.js";
import type { EvidenceItem, RepoRef } from "../src/types.js";

type RawItem = Omit<EvidenceItem, "id">;

const item = (ref: string, title: string, snippet: string, score = 1): RawItem => ({
  source: "pr",
  title,
  ref,
  snippet,
  score,
});

describe("github rerank", () => {
  it("ranks items by how many query keywords they mention", () => {
    const items = [
      item("pr#1", "Added documentation for goal attribution", "docs only", 1),
      item("pr#2", "Force cookieless tracking option", "adds cookieless tracking consent", 1),
      item("pr#3", "Tracker tweak", "minor tracking change", 1),
    ];
    const ranked = ["cookieless", "tracking", "consent", "tracker"];
    const out = rerank(items, ranked);
    expect(out[0]!.ref).toBe("pr#2"); // covers cookieless+tracking+consent
    expect(out[out.length - 1]!.ref).toBe("pr#1"); // covers none
  });

  it("breaks coverage ties by GitHub score", () => {
    const items = [item("pr#1", "tracking a", "x", 2), item("pr#2", "tracking b", "y", 9)];
    const out = rerank(items, ["tracking"]);
    expect(out[0]!.ref).toBe("pr#2");
  });
});

describe("providerFor", () => {
  it("selects github, gitlab, or the generic fallback by host", () => {
    expect(providerFor("github.com").name).toBe("github");
    expect(providerFor("gitlab.com").name).toBe("gitlab");
    expect(providerFor("bitbucket.org").name).toBe("generic");
  });
});

describe("github rate-limit short-circuit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stops after the first rate-limited response instead of firing the full burst", async () => {
    // Force the REST path (no gh CLI), then make every request rate-limited.
    vi.spyOn(util, "have").mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ "x-ratelimit-remaining": "0" }),
      body: null,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const ref: RepoRef = { raw: "o/r", host: "github.com", owner: "o", repo: "r", isLocal: false, slug: "o-r" };
    const out = await github.search(ref, "how does cookieless tracking consent work", "issue", 6);

    expect(out.items).toEqual([]);
    expect(out.notes.join(" ")).toMatch(/rate-limited/i);
    // A single rate-limited precise query ends the whole search (no 12-call burst).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

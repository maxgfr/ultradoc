import { afterEach, describe, expect, it, vi } from "vitest";
import { gitlab } from "../src/providers/gitlab.js";
import { gitea } from "../src/providers/gitea.js";
import { providerFor } from "../src/providers/registry.js";
import type { RepoRef } from "../src/types.js";

// Build a fetch mock that returns `payloads` in sequence (one per HTTP call).
function mockFetchSequence(payloads: unknown[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const p of payloads) {
    fn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: null,
      arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(p)).buffer,
    } as unknown as Response);
  }
  // Any further calls → empty array.
  fn.mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    body: null,
    arrayBuffer: async () => new TextEncoder().encode("[]").buffer,
  } as unknown as Response);
  return fn;
}

afterEach(() => vi.restoreAllMocks());

describe("providerFor host routing", () => {
  it("routes codeberg / gitea / forgejo hosts to the gitea provider", () => {
    expect(providerFor("codeberg.org").name).toBe("gitea");
    expect(providerFor("gitea.example.com").name).toBe("gitea");
    expect(providerFor("forgejo.example.org").name).toBe("gitea");
    expect(providerFor("gitlab.com").name).toBe("gitlab");
    expect(providerFor("bitbucket.org").name).toBe("generic");
  });
});

describe("gitlab provider", () => {
  const ref: RepoRef = { raw: "g/p", host: "gitlab.com", owner: "g", repo: "p", isLocal: false, slug: "gitlab.com-g-p" };

  it("maps merge requests and scores them by rank", async () => {
    const mrs = [
      {
        iid: 7,
        title: "retry backoff on 429",
        state: "opened",
        web_url: "https://gitlab.com/g/p/-/merge_requests/7",
        description: "adds backoff",
        updated_at: "2024",
      },
      { iid: 3, title: "unrelated", state: "merged", web_url: "https://gitlab.com/g/p/-/merge_requests/3", description: "x", updated_at: "2023" },
    ];
    vi.stubGlobal("fetch", mockFetchSequence([mrs]));
    const out = await gitlab.search(ref, "retry backoff", "pr", 6);
    expect(out.items.map((i) => i.ref)).toEqual(["pr#7", "pr#3"]);
    expect(out.items[0]!.title.startsWith("!7")).toBe(true); // MR marker
    // withRankScores gives a strictly-descending score (no more all-zero).
    expect(out.items[0]!.score).toBeGreaterThan(out.items[1]!.score);
  });

  it("relaxes to a broader query when the precise one is empty", async () => {
    // First precise attempt (top-3) empty, second (top-2) empty, broad finds one.
    const fetchMock = mockFetchSequence([[], [], [{ iid: 1, title: "found", state: "opened", web_url: "u", description: "d" }]]);
    vi.stubGlobal("fetch", fetchMock);
    const out = await gitlab.search(ref, "alpha beta gamma", "issue", 6);
    expect(out.items.map((i) => i.ref)).toEqual(["issue#1"]);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("gitea provider", () => {
  const ref: RepoRef = { raw: "o/r", host: "codeberg.org", owner: "o", repo: "r", isLocal: false, slug: "codeberg.org-o-r" };

  it("maps Gitea issues and scores them by rank", async () => {
    const issues = [
      {
        number: 12,
        title: "cache eviction bug",
        state: "open",
        html_url: "https://codeberg.org/o/r/issues/12",
        body: "evicts too early",
        labels: [{ name: "bug" }],
        updated_at: "2024",
      },
    ];
    vi.stubGlobal("fetch", mockFetchSequence([issues]));
    const out = await gitea.search(ref, "cache eviction", "issue", 6);
    expect(out.items[0]!.ref).toBe("issue#12");
    expect(out.items[0]!.title.startsWith("#12")).toBe(true);
    expect(out.items[0]!.snippet).toContain("labels: bug");
    expect(out.items[0]!.score).toBeGreaterThan(0);
  });

  it("reports a note (no items) on an API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 404, headers: new Headers(), body: null, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response),
    );
    const out = await gitea.search(ref, "anything here", "issue", 6);
    expect(out.items).toEqual([]);
    expect(out.notes.join(" ")).toMatch(/unavailable/i);
  });
});

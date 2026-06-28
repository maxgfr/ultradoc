import { describe, it, expect, vi } from "vitest";
import { discussionItems, discussionsSource } from "../src/sources/discussions.js";
import type { RunContext, StructuralIndex } from "../src/types.js";

// Force the no-gh path so the source's graceful skip is testable offline.
vi.mock("../src/util.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/util.js")>();
  return { ...mod, have: () => false };
});

describe("discussionItems (GraphQL mapper)", () => {
  it("maps Discussion nodes to evidence items", () => {
    const items = discussionItems([
      {
        number: 42,
        title: "How to configure the heartbeat?",
        url: "https://github.com/o/r/discussions/42",
        bodyText: "I want to tune the ping interval.",
        updatedAt: "2024-05-01T00:00:00Z",
        category: { name: "Q&A" },
        answer: { bodyText: "Set heartBeatTimer in the tracker config." },
      },
      { not: "a discussion" },
    ]);
    expect(items).toHaveLength(1);
    const it42 = items[0]!;
    expect(it42.ref).toBe("discussion#42");
    expect(it42.title).toContain("[Q&A]");
    expect(it42.snippet).toContain("accepted answer");
    expect(it42.snippet).toContain("heartBeatTimer");
    expect(it42.meta?.answered).toBe(true);
  });
});

describe("discussionsSource", () => {
  const ctx: RunContext = {
    repoRef: {
      raw: "https://github.com/o/r",
      host: "github.com",
      owner: "o",
      repo: "r",
      webUrl: "https://github.com/o/r",
      isLocal: false,
      slug: "github-com-o-r",
    },
    repoDir: "/nonexistent",
    index: { docFiles: [], symbols: [], packages: [] } as unknown as StructuralIndex,
    options: {
      repo: "o/r",
      question: "heartbeat ping",
      sources: ["discussion"],
      semantic: false,
      webEngine: "auto",
      perSource: 6,
      json: false,
      refresh: false,
    },
  };

  it("skips with an honest note when the gh CLI is unavailable", async () => {
    const res = await discussionsSource(ctx);
    expect(res.items).toEqual([]);
    expect(res.notes.join(" ")).toMatch(/gh CLI/);
  });

  it("declines non-GitHub hosts", async () => {
    const res = await discussionsSource({
      ...ctx,
      repoRef: { ...ctx.repoRef, host: "gitlab.com" },
    });
    expect(res.items).toEqual([]);
    expect(res.notes.join(" ")).toMatch(/only available for GitHub/i);
  });
});

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { changelogSections, githubReleaseItems, releasesSource } from "../src/sources/releases.js";
import { buildIndex } from "../src/index/structural.js";
import { resolveRepo } from "../src/clone.js";
import type { RunContext } from "../src/types.js";

const LIB = resolve("tests/fixtures/sample-lib");

function ctxFor(question: string): RunContext {
  const repoRef = resolveRepo(LIB);
  return {
    repoRef,
    repoDir: LIB,
    index: buildIndex(LIB, repoRef.slug),
    options: {
      repo: LIB,
      question,
      sources: ["release"],
      semantic: false,
      webEngine: "auto",
      perSource: 6,
      json: false,
      refresh: true,
    },
  };
}

describe("changelogSections", () => {
  it("splits a changelog into version sections", () => {
    const sections = changelogSections("CHANGELOG.md", "# Changelog\n\n## [2.0.0] - 2024-06-01\n- Big.\n\n## v1.1\n- Small.\n\n1.0.0 / 2023-01-01\n- First.\n");
    expect(sections.map((s) => s.version)).toEqual(["2.0.0", "1.1", "1.0.0"]);
    expect(sections[0]!.lines.join("\n")).toContain("Big.");
  });
});

describe("releasesSource (offline changelog half)", () => {
  it("surfaces the changelog section that introduced the behavior", async () => {
    const res = await releasesSource(ctxFor("when was the retry backoff added?"));
    expect(res.items.length).toBeGreaterThan(0);
    const top = res.items[0]!;
    expect(top.ref).toBe("release:0.2.0");
    expect(top.snippet).toContain("backoff");
    expect(top.location).toMatch(/^CHANGELOG\.md:\d+-\d+$/);
  });

  it("notes honestly when nothing matches", async () => {
    const res = await releasesSource(ctxFor("zxqv unrelated nonsense"));
    expect(res.items).toEqual([]);
    expect(res.notes.join(" ")).toMatch(/no changelog section matched/i);
  });
});

describe("githubReleaseItems (REST mapper)", () => {
  const canned = [
    {
      tag_name: "v5.2.0",
      name: "v5.2.0",
      published_at: "2024-04-02T10:00:00Z",
      html_url: "https://github.com/o/r/releases/tag/v5.2.0",
      body: "## What's new\n- Heartbeat ping interval is now configurable.",
    },
    {
      tag_name: "v5.1.0",
      name: "v5.1.0",
      published_at: "2024-02-02T10:00:00Z",
      html_url: "https://github.com/o/r/releases/tag/v5.1.0",
      body: "- Unrelated fixes only.",
    },
  ];

  it("keeps only releases whose notes mention the keywords", () => {
    const items = githubReleaseItems(canned, ["heartbeat", "ping"]);
    expect(items).toHaveLength(1);
    expect(items[0]!.ref).toBe("release:v5.2.0");
    expect(items[0]!.url).toContain("/releases/tag/v5.2.0");
    expect(items[0]!.title).toContain("2024-04-02");
  });
});

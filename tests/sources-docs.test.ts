import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { docsSource } from "../src/sources/docs.js";
import { htmlToText, nearestHeading, excerptsFromText } from "../src/sources/fetch.js";
import { resolveRepo } from "../src/clone.js";
import { buildIndex } from "../src/index/structural.js";
import type { RunContext } from "../src/types.js";

function ctxFor(repo: string, question: string): RunContext {
  const repoRef = resolveRepo(repo);
  return {
    repoRef,
    repoDir: repo,
    index: buildIndex(repo, repoRef.slug),
    options: {
      repo,
      question,
      sources: ["docs"],
      semantic: false,
      webEngine: "auto",
      perSource: 6,
      json: false,
      refresh: true,
    },
  };
}

describe("nearestHeading", () => {
  const lines = ["# Title", "intro", "## Section A", "```", "# not a heading (code)", "```", "inside section A", "## Section B", "inside section B"];
  it("returns the closest preceding heading", () => {
    expect(nearestHeading(lines, 6)).toBe("Section A");
    expect(nearestHeading(lines, 8)).toBe("Section B");
    expect(nearestHeading(lines, 1)).toBe("Title");
  });
  it("ignores heading-lookalikes inside fenced code blocks", () => {
    expect(nearestHeading(lines, 4)).toBe("Section A");
  });
  it("returns undefined when no heading precedes the anchor", () => {
    expect(nearestHeading(["no headings here"], 0)).toBeUndefined();
  });
});

describe("htmlToText headings", () => {
  it("keeps h1-h6 structure as markdown markers", () => {
    const text = htmlToText('<h2 class="x">Configuration</h2><p>set the option</p>');
    expect(text).toContain("## Configuration");
  });
});

describe("excerptsFromText", () => {
  it("carries the section heading into the title and meta", () => {
    const text = "# Guide\nintro\n## Retry policy\nthe client retries on 429";
    const items = excerptsFromText(text, "https://x.test/docs", "Docs", "docs", "how does retry work on 429?", 6);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.title).toBe("Docs § Retry policy");
    expect(items[0]!.meta?.heading).toBe("Retry policy");
  });
});

describe("docsSource headings", () => {
  it("titles in-repo markdown excerpts with their section heading", async () => {
    const res = await docsSource(ctxFor(resolve("tests/fixtures/sample-lib"), "how does the retry backoff work?"));
    const readme = res.items.find((i) => i.ref === "README.md");
    expect(readme).toBeDefined();
    expect(readme!.title).toContain("§ Retry and backoff");
    expect(readme!.meta?.heading).toBe("Retry and backoff");
  });
});

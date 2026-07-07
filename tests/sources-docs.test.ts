import { afterEach, describe, it, expect, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { docsSource, getDocText } from "../src/sources/docs.js";
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

describe("external-docs cache TTL", () => {
  const url = "https://docs.test/guide";
  let repoDir: string;
  let cacheFile: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
  });

  function seedCache(text: string): void {
    repoDir = mkdtempSync(join(tmpdir(), "ud-extdocs-"));
    const dir = join(repoDir, ".ultradoc", "extdocs");
    mkdirSync(dir, { recursive: true });
    cacheFile = join(dir, url.replace(/[^a-z0-9]+/gi, "_").slice(0, 100) + ".v2.txt");
    writeFileSync(cacheFile, text);
  }

  it("serves a fresh cached copy without hitting the network", async () => {
    seedCache("cached guide body");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await getDocText(repoDir, url);
    expect(r.text).toBe("cached guide body");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refetches once the cached copy is older than the TTL", async () => {
    seedCache("stale body");
    const old = Date.now() / 1000 - 200 * 3600; // 200h ago, past the 168h default
    utimesSync(cacheFile, old, old);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      body: null,
      arrayBuffer: async () => new TextEncoder().encode("<p>fresh body</p>").buffer,
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const r = await getDocText(repoDir, url);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.text).toContain("fresh body");
  });

  it("falls back to the stale copy with a note when the refetch fails", async () => {
    seedCache("stale but usable");
    const old = Date.now() / 1000 - 200 * 3600;
    utimesSync(cacheFile, old, old);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 503, headers: new Headers(), body: null, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response),
    );
    const r = await getDocText(repoDir, url);
    expect(r.text).toBe("stale but usable");
    expect(r.note).toMatch(/stale cached copy/i);
  });
});

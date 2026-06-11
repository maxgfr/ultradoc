import { describe, it, expect } from "vitest";
import { dedupeAcrossSources } from "../src/sources/registry.js";
import type { SourceResult, EvidenceItem } from "../src/types.js";

type RawItem = Omit<EvidenceItem, "id">;

function item(over: Partial<RawItem> & Pick<RawItem, "source" | "ref" | "snippet">): RawItem {
  return { title: over.ref, score: 1, ...over };
}

function res(source: SourceResult["source"], items: RawItem[]): SourceResult {
  return { source, items, notes: [] };
}

describe("dedupeAcrossSources", () => {
  it("keeps one copy of an identical snippet across sources", () => {
    const docs = res("docs", [item({ source: "docs", ref: "https://x.test/p", snippet: "Same  excerpt\nhere" })]);
    const web = res("web", [item({ source: "web", ref: "https://x.test/p", snippet: "same excerpt here" })]);
    const { results, dropped } = dedupeAcrossSources([docs, web], new Set());
    expect(dropped).toBe(1);
    expect(results.find((r) => r.source === "docs")!.items).toHaveLength(1);
    expect(results.find((r) => r.source === "web")!.items).toHaveLength(0);
  });

  it("collapses overlapping excerpts of the same file across sources", () => {
    const code = res("code", [
      item({ source: "code", ref: "README.md", location: "README.md:10-20", snippet: "a" }),
    ]);
    const docs = res("docs", [
      item({ source: "docs", ref: "README.md", location: "README.md:12-22", snippet: "b" }),
    ]);
    const { results, dropped } = dedupeAcrossSources([code, docs], new Set(["README.md"]));
    expect(dropped).toBe(1);
    // README is a doc file — the docs-source copy must survive.
    expect(results.find((r) => r.source === "docs")!.items).toHaveLength(1);
    expect(results.find((r) => r.source === "code")!.items).toHaveLength(0);
  });

  it("keeps non-overlapping excerpts of the same file", () => {
    const code = res("code", [
      item({ source: "code", ref: "src/a.ts", location: "src/a.ts:1-10", snippet: "a" }),
    ]);
    const docs = res("docs", [
      item({ source: "docs", ref: "src/a.ts", location: "src/a.ts:50-60", snippet: "b" }),
    ]);
    const { dropped } = dedupeAcrossSources([code, docs], new Set());
    expect(dropped).toBe(0);
  });

  it("never dedups within one source (two windows of one page)", () => {
    const docs = res("docs", [
      item({ source: "docs", ref: "https://x.test/p", location: "https://x.test/p#~1", snippet: "first window" }),
      item({ source: "docs", ref: "https://x.test/p", location: "https://x.test/p#~40", snippet: "second window" }),
    ]);
    const { dropped } = dedupeAcrossSources([docs], new Set());
    expect(dropped).toBe(0);
  });

  it("prefers the earlier canonical source for non-doc files", () => {
    const code = res("code", [
      item({ source: "code", ref: "src/a.ts", location: "src/a.ts:1-10", snippet: "x" }),
    ]);
    const web = res("web", [
      item({ source: "web", ref: "src/a.ts", location: "src/a.ts:2-11", snippet: "y", score: 99 }),
    ]);
    const { results } = dedupeAcrossSources([code, web], new Set());
    expect(results.find((r) => r.source === "code")!.items).toHaveLength(1);
    expect(results.find((r) => r.source === "web")!.items).toHaveLength(0);
  });
});

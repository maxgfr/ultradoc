import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";
import { buildIndex } from "../src/index/structural.js";
import { searchCode } from "../src/index/search.js";
import { resolveRepo } from "../src/clone.js";
import type { StructuralIndex } from "../src/types.js";

const FIXTURE = resolve("tests/fixtures/sample-lib");
const REF = resolveRepo("tests/fixtures/sample-lib");

describe("structural index", () => {
  let idx: StructuralIndex;
  beforeAll(() => {
    idx = buildIndex(FIXTURE, REF.slug);
  });

  it("counts files and classifies docs", () => {
    expect(idx.fileCount).toBeGreaterThan(0);
    expect(idx.docFiles).toContain("README.md");
    expect(idx.configFiles).toContain("package.json");
  });

  it("extracts the library's public symbols", () => {
    const names = new Set(idx.symbols.map((s) => s.name));
    expect(names.has("retryRequest")).toBe(true);
    expect(names.has("computeBackoff")).toBe(true);
    expect(names.has("HttpClient")).toBe(true);
  });
});

describe("code search (Tier 1)", () => {
  it("ranks the defining file first and returns located snippets", () => {
    const idx = buildIndex(FIXTURE, REF.slug);
    const { items } = searchCode(FIXTURE, REF, idx, "how does the retry backoff work", 6);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.ref).toBe("src/retry.ts");
    for (const it of items) {
      expect(it.source).toBe("code");
      expect(it.location).toMatch(/:\d+-\d+$/);
      expect(it.snippet.length).toBeGreaterThan(0);
    }
  });

  it("finds a symbol by exact name", () => {
    const idx = buildIndex(FIXTURE, REF.slug);
    const { items } = searchCode(FIXTURE, REF, idx, "computeBackoff", 6);
    expect(items.some((it) => it.ref === "src/retry.ts")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { chunkText, chunkFile } from "../src/index/semantic.js";

describe("chunkText", () => {
  it("splits content into overlapping line windows", () => {
    const content = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`).join("\n");
    const chunks = chunkText("a.ts", content, false, { windowLines: 60, overlap: 12 });
    expect(chunks.length).toBeGreaterThan(1);
    // windows advance by (window - overlap) = 48 lines
    expect(chunks[0]).toMatchObject({ rel: "a.ts", start: 1, isDoc: false });
    expect(chunks[1]!.start).toBe(49);
    // overlap means chunk 2 starts before chunk 1 ends
    expect(chunks[1]!.start).toBeLessThan(chunks[0]!.end);
  });

  it("skips trivially short content and caps per file", () => {
    expect(chunkText("a.ts", "   ", false)).toEqual([]);
    const big = Array.from({ length: 5000 }, (_, i) => `x${i}`).join("\n");
    expect(chunkText("a.ts", big, false, { maxPerFile: 5 }).length).toBeLessThanOrEqual(5);
  });
});

describe("chunkFile (symbol-boundary chunking)", () => {
  // A file with two functions; symbol start-lines mark each definition.
  const body = [
    "import x from 'y';", // 1
    "", // 2
    "export function alpha() {", // 3
    "  const a = 1;", // 4
    "  return a + 2;", // 5
    "}", // 6
    "", // 7
    "export function beta() {", // 8
    "  const b = 3;", // 9
    "  return b + 4;", // 10
    "}", // 11
  ].join("\n");

  it("gives each symbol its own chunk without splitting its body", () => {
    const chunks = chunkFile("m.ts", body, false, [3, 8]);
    // One chunk starts at alpha (line 3), another at beta (line 8).
    expect(chunks.some((c) => c.start === 3)).toBe(true);
    const alpha = chunks.find((c) => c.start === 3)!;
    // alpha's whole body (through line 6/7) is in one chunk, not split at 8.
    expect(alpha.end).toBeLessThan(8);
    expect(alpha.text).toContain("return a + 2;");
    const beta = chunks.find((c) => c.start === 8)!;
    expect(beta.text).toContain("return b + 4;");
  });

  it("falls back to fixed-window chunking for docs and symbol-less files", () => {
    const doc = Array.from({ length: 120 }, (_, i) => `prose line ${i + 1}`).join("\n");
    const asDoc = chunkFile("README.md", doc, true, []);
    const asWindow = chunkText("README.md", doc, true);
    expect(asDoc).toEqual(asWindow);
  });
});

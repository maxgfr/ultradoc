import { describe, it, expect } from "vitest";
import { chunkText } from "../src/index/semantic.js";

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

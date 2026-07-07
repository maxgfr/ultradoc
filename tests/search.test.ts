import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIndex } from "../src/index/structural.js";
import { searchCode, RANKING } from "../src/index/search.js";
import { resolveRepo } from "../src/clone.js";

function repoWith(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ud-search-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("RANKING constants", () => {
  it("exposes the documented ranking knobs", () => {
    expect(RANKING.BM25_B).toBe(0.3);
    expect(RANKING.LOW_SIGNAL_PENALTY).toBe(0.45);
    expect(RANKING.SYMBOL_DECAY).toEqual([1, 0.5, 0.25]);
  });
});

describe("top-K symbol ranking", () => {
  it("ranks a file defining several matching symbols above one with a single match", () => {
    // Two files with the SAME lexical footprint; only the symbol count differs.
    const { dir, cleanup } = repoWith({
      "src/multi.ts": "export function retryRequest() {}\nexport function retryBackoff() {}\n",
      "src/single.ts": "export function retryRequest() {}\nexport const unrelatedThing = 1;\n",
    });
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    const { items } = searchCode(dir, ref, idx, "retry request backoff", 4);
    expect(items[0]!.ref).toBe("src/multi.ts");
    cleanup();
  });
});

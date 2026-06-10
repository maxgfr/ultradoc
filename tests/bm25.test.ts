import { describe, it, expect } from "vitest";
import { bm25, type Bm25Doc } from "../src/index/bm25.js";

function doc(key: string, tf: Record<string, number>, len: number): Bm25Doc {
  return { key, tf: new Map(Object.entries(tf)), len };
}

describe("bm25", () => {
  it("ranks a rare term above a common one (idf ordering)", () => {
    const df = new Map([
      ["rare", 2],
      ["common", 900],
    ]);
    const docs = [doc("hits-rare", { rare: 3 }, 100), doc("hits-common", { common: 3 }, 100)];
    const s = bm25(docs, ["rare", "common"], 1000, df);
    expect(s.get("hits-rare")!).toBeGreaterThan(s.get("hits-common")!);
  });

  it("prefers the shorter doc at equal term frequency (length normalization)", () => {
    const df = new Map([["term", 10]]);
    const docs = [doc("short", { term: 4 }, 50), doc("long", { term: 4 }, 5000)];
    const s = bm25(docs, ["term"], 1000, df);
    expect(s.get("short")!).toBeGreaterThan(s.get("long")!);
  });

  it("saturates term frequency instead of growing linearly", () => {
    const df = new Map([["term", 10]]);
    const docs = [doc("tf1", { term: 1 }, 100), doc("tf10", { term: 10 }, 100), doc("tf100", { term: 100 }, 100)];
    const s = bm25(docs, ["term"], 1000, df);
    const gainLow = s.get("tf10")! - s.get("tf1")!;
    const gainHigh = s.get("tf100")! - s.get("tf10")!;
    expect(gainLow).toBeGreaterThan(gainHigh);
  });

  it("is safe on unseen terms and empty inputs", () => {
    const s = bm25([doc("a", { x: 1 }, 10)], ["missing"], 100, new Map());
    expect(s.has("a")).toBe(false);
    expect(bm25([], ["x"], 100, new Map()).size).toBe(0);
  });

  it("is deterministic", () => {
    const df = new Map([
      ["a", 5],
      ["b", 50],
    ]);
    const docs = [doc("one", { a: 2, b: 1 }, 80), doc("two", { b: 4 }, 120)];
    const s1 = bm25(docs, ["a", "b"], 500, df);
    const s2 = bm25(docs, ["a", "b"], 500, df);
    expect([...s1.entries()]).toEqual([...s2.entries()]);
  });
});

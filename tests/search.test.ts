import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildIndex } from "../src/index/structural.js";
import { searchCode, RANKING, callableNames } from "../src/index/search.js";
import { buildMatcher } from "../src/util.js";
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
    expect(RANKING.CALLSITE_MAX_NAMES).toBe(4);
    expect(RANKING.CALLSITE_SECOND_ITEM_FACTOR).toBe(0.95);
    expect(RANKING.CALLSITE_MERGE_GAP).toBe(12);
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

describe("callableNames (call-site probe gate)", () => {
  it("returns only identifier-shaped or declared query terms", () => {
    const { dir, cleanup } = repoWith({
      "src/a.ts": "export function loadConfig() {}\nexport function renderPage() {}\n",
    });
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    // Prose words never trigger the call-site pass.
    expect(callableNames(buildMatcher("how is the config loaded?"), idx)).toEqual([]);
    // camelCase query terms do.
    expect(callableNames(buildMatcher("where is renderPage called?"), idx)).toContain("renderPage");
    // A plain word that exactly names a declared symbol counts too.
    expect(callableNames(buildMatcher("what does loadConfig do?"), idx)).toContain("loadConfig");
    cleanup();
  });

  it("accepts snake_case identifiers", () => {
    const { dir, cleanup } = repoWith({ "src/a.ts": "export const x = 1;\n" });
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    expect(callableNames(buildMatcher("where is retry_request called?"), idx)).toContain("retry_request");
    cleanup();
  });
});

describe("call-site aware retrieval", () => {
  it("ranks the calling file for a call-shaped query and covers the invocation line", () => {
    const { dir, cleanup } = repoWith({
      "src/def.ts": "export function fireCallback(n: number): void {\n  console.log(n);\n}\n",
      "src/caller.ts": "import { fireCallback } from './def.js';\nexport function run() {\n  fireCallback(1);\n}\n",
      "src/decoy.ts": "// a comment mentioning fireCallback without calling it\nexport const z = 1;\n",
    });
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    const { items } = searchCode(dir, ref, idx, "where is fireCallback called?", 6);
    const caller = items.find((i) => i.ref === "src/caller.ts");
    expect(caller).toBeDefined();
    expect(items.slice(0, 2).map((i) => i.ref)).toContain("src/caller.ts");
    // The emitted excerpt for the caller covers the invocation line (3).
    const covers = items.filter((i) => i.ref === "src/caller.ts").some((i) => i.snippet.includes("fireCallback(1)"));
    expect(covers).toBe(true);
    cleanup();
  });

  it("merges a nearby call site into the definition excerpt", () => {
    const body = ["export function make(): void {}", "", "// use it right below", "make();", ""].join("\n");
    const { dir, cleanup } = repoWith({ "src/near.ts": body });
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    const { items } = searchCode(dir, ref, idx, "where is make called?", 6);
    const near = items.filter((i) => i.ref === "src/near.ts");
    // One item whose window spans both the definition and the nearby call.
    expect(near.some((i) => i.snippet.includes("export function make") && i.snippet.includes("make();"))).toBe(true);
    cleanup();
  });

  it("emits a second call-site item when the invocation is far from the anchored symbol", () => {
    const filler = Array.from({ length: 40 }, (_, i) => `  const v${i} = ${i};`).join("\n");
    const body = [
      "export interface Options {",
      "  onRetry?: (attempt: number, delayMs: number) => void;",
      "}",
      "",
      "export function run(opts: Options): void {",
      filler,
      "  opts.onRetry?.(1, 200);",
      "}",
    ].join("\n");
    const { dir, cleanup } = repoWith({ "src/far.ts": body });
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    const { items } = searchCode(dir, ref, idx, "when is onRetry invoked?", 6);
    const far = items.filter((i) => i.ref === "src/far.ts");
    // The invocation line is captured in some emitted excerpt for the file.
    expect(far.some((i) => i.snippet.includes("onRetry?.(1, 200)"))).toBe(true);
    // And that excerpt is flagged as a call site (not anchored on the type line).
    expect(far.some((i) => i.meta?.callSite === true)).toBe(true);
    cleanup();
  });

  it("respects the --package scope for call sites", () => {
    const { dir, cleanup } = repoWith({
      "packages/api/src/a.ts": "export function ping() {}\nping();\n",
      "packages/web/src/b.ts": "export function ping() {}\nping();\n",
    });
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    const { items } = searchCode(dir, ref, idx, "where is ping called?", 6, "packages/api");
    expect(items.every((i) => i.ref.startsWith("packages/api/"))).toBe(true);
    cleanup();
  });

  it("leaves prose-query ranking unchanged (no callable names)", () => {
    // Same fixture as the symbol-ranking test; the call pass must not fire.
    const { dir, cleanup } = repoWith({
      "src/multi.ts": "export function retryRequest() {}\nexport function retryBackoff() {}\n",
      "src/single.ts": "export function retryRequest() {}\nexport const unrelatedThing = 1;\n",
    });
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    // "retry request backoff" — retryRequest/retryBackoff are declared symbols,
    // so the pass MAY fire, but neither file calls them (declaration-only), so
    // the top result is unchanged.
    const { items } = searchCode(dir, ref, idx, "retry request backoff", 4);
    expect(items[0]!.ref).toBe("src/multi.ts");
    cleanup();
  });
});

describe("rare-literal guarantee", () => {
  // Real-world repro (matomo-org/device-detector): the only file containing the
  // query literal is a big data .yml with no symbols. RRF fusion is rank-based,
  // so the data file collects from the lexical list only, while symbol-bearing
  // code files matching generic subtokens of the query collect from both lists
  // — and the sole holder of the exact literal drops out of the results.
  function repoWithBuriedLiteral(): { dir: string; cleanup: () => void } {
    const filler = Array.from({ length: 400 }, (_, i) => `- regex: 'SomeBot${i}'\n  name: 'Some Bot ${i}'`).join("\n");
    const files: Record<string, string> = {
      "regexes/bots.yml": `${filler}\n- regex: 'zorkuscrawler|client-probe'\n  name: 'Generic Bot'\n`,
    };
    for (let i = 0; i < 5; i++) {
      files[`src/client-${i}.ts`] = `export function parseClientHints${i}() {}\nexport function clientParser${i}() {}\n// client hints parser helpers\n`;
    }
    return repoWith(files);
  }

  it("pins the symbol-less data file holding a near-unique query literal", () => {
    const { dir, cleanup } = repoWithBuriedLiteral();
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    const { items, notes } = searchCode(dir, ref, idx, "zorkuscrawler client hints parser", 4);
    expect(items.length).toBeLessThanOrEqual(4);
    const holder = items.find((i) => i.ref === "regexes/bots.yml");
    expect(holder).toBeDefined();
    // The excerpt must contain the literal itself, not an arbitrary dense region.
    expect(holder!.snippet).toContain("zorkuscrawler");
    // The pin is announced, never silent.
    expect(notes.some((n) => n.includes("zorkuscrawler"))).toBe(true);
    cleanup();
  });

  it("rescues a rare literal whose file is flooded by a generic keyword (per-file match cap)", () => {
    // Every filler line matches "bot", so ripgrep's per-file line cap is
    // consumed long before the literal's line is reached — the first pass never
    // attributes the rare keyword at all (df 0) and the pin cannot fire without
    // the rescue pass.
    const { dir, cleanup } = repoWithBuriedLiteral();
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    const { items, notes } = searchCode(dir, ref, idx, "zorkuscrawler bot client hints parser", 4);
    // The flooded file may ALSO surface normally (huge "bot" tf) with a window
    // anchored on its dense head — the guarantee is that some excerpt grounds
    // the literal itself.
    const holders = items.filter((i) => i.ref === "regexes/bots.yml");
    expect(holders.length).toBeGreaterThan(0);
    expect(holders.some((h) => h.snippet.includes("zorkuscrawler"))).toBe(true);
    expect(notes.some((n) => n.includes("zorkuscrawler"))).toBe(true);
    cleanup();
  });

  it("anchors the pinned excerpt on the literal itself, not on a subtoken match", () => {
    // "ZorkusEu" expands to subtokens "zorkus"/"eu"; every filler line contains
    // "eu" (Euro), so a subtoken-based anchor would land on line 1 and the
    // excerpt would not show the literal (real-world case: ZmEu in bots.yml).
    const filler = Array.from({ length: 400 }, (_, i) => `- regex: 'EuroBot${i}'\n  name: 'Euro Bot ${i}'`).join("\n");
    const files: Record<string, string> = {
      "regexes/bots.yml": `${filler}\n- regex: 'ZorkusEu'\n  name: 'Generic Bot'\n`,
    };
    for (let i = 0; i < 5; i++) {
      files[`src/client-${i}.ts`] = `export function parseClientHints${i}() {}\nexport function clientParser${i}() {}\n// client hints parser helpers\n`;
    }
    const { dir, cleanup } = repoWith(files);
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    const { items } = searchCode(dir, ref, idx, "ZorkusEu bot client hints parser", 4);
    const holders = items.filter((i) => i.ref === "regexes/bots.yml");
    expect(holders.some((h) => h.snippet.includes("ZorkusEu"))).toBe(true);
    cleanup();
  });

  it("does not pin when the holder already surfaces on its own", () => {
    const { dir, cleanup } = repoWith({
      "src/retry.ts": "export function retryBackoff() {}\n// zorkuscrawler appears here\n",
      "src/other.ts": "export const nothing = 1;\n",
    });
    const ref = resolveRepo(dir);
    const idx = buildIndex(dir, ref.slug);
    const { items, notes } = searchCode(dir, ref, idx, "zorkuscrawler retry backoff", 4);
    expect(items.some((i) => i.ref === "src/retry.ts")).toBe(true);
    expect(notes.some((n) => n.includes("pinned"))).toBe(false);
    cleanup();
  });
});

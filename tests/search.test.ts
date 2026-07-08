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

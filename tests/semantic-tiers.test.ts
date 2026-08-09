import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildContext } from "../src/ask.js";
import { semanticSearch, hasStaticModel } from "../src/index/semantic/index.js";
import { codeSource } from "../src/sources/code.js";
import type { AskOptions, RunContext, SemanticTier } from "../src/types.js";

const LIB = resolve("tests/fixtures/sample-lib");

function contextFor(dir: string, over: Partial<AskOptions> = {}): Promise<RunContext> {
  return buildContext({
    repo: dir,
    question: "which helper works out how long to wait before trying again",
    sources: ["code"],
    semantic: true,
    webEngine: "auto",
    perSource: 6,
    json: false,
    refresh: false,
    ...over,
  });
}

describe("semantic tier cascade", () => {
  // Point the cache root at an empty dir so the machine's own pulled model (if
  // any) can't decide the outcome of the "nothing available" cases.
  const saved = process.env.ULTRADOC_CACHE_DIR;
  const savedEndpoint = process.env.CODEINDEX_EMBED_ENDPOINT;
  let empty: string;
  beforeEach(() => {
    empty = mkdtempSync(join(tmpdir(), "ud-cache-"));
    process.env.ULTRADOC_CACHE_DIR = empty;
    process.env.CODEINDEX_EMBED_ENDPOINT = "";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ULTRADOC_CACHE_DIR;
    else process.env.ULTRADOC_CACHE_DIR = saved;
    if (savedEndpoint === undefined) delete process.env.CODEINDEX_EMBED_ENDPOINT;
    else process.env.CODEINDEX_EMBED_ENDPOINT = savedEndpoint;
    rmSync(empty, { recursive: true, force: true });
  });

  it("off short-circuits without probing any backend", async () => {
    const res = await semanticSearch(await contextFor(LIB, { semanticTier: "off" }));
    expect(res.available).toBe(false);
    expect(res.notes.join(" ")).toContain("--semantic-tier off");
  });

  it("names the command that enables the tier the user asked for", async () => {
    const res = await semanticSearch(await contextFor(LIB, { semanticTier: "static" }));
    expect(res.available).toBe(false);
    // Unavailable is fine; unexplained is not.
    expect(res.notes.join(" ")).toContain("semantic pull");
  });

  it("points at the endpoint variable when that tier was requested", async () => {
    const res = await semanticSearch(await contextFor(LIB, { semanticTier: "endpoint" }));
    expect(res.available).toBe(false);
    expect(res.notes.join(" ")).toContain("CODEINDEX_EMBED_ENDPOINT");
  });

  it("an explicit tier never silently falls through to another one", async () => {
    for (const tier of ["static", "endpoint"] as SemanticTier[]) {
      const res = await semanticSearch(await contextFor(LIB, { semanticTier: tier }));
      expect(res.available).toBe(false);
    }
  });

  it("a repo with nothing to search still answers on the lexical tier", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ud-empty-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
    const res = await codeSource(await contextFor(dir, { semanticTier: "static" }));
    // The degradation is reported, and the source still returns its items.
    expect(res.fallbacks).toContain("code: semantic backend unavailable — lexical only");
    expect(res.source).toBe("code");
    rmSync(dir, { recursive: true, force: true });
  });
});

// Needs the ~21 MB model asset (`ultradoc semantic pull`), which CI does not
// have. Skipped rather than faked: the point is the real ranking.
describe("static tier (requires a pulled model)", () => {
  // skipIf, not an early return: a silently-passing test would report coverage
  // this suite does not have.
  it.skipIf(!hasStaticModel())("surfaces a declaration the question never names", async () => {
    const q = "which helper works out how long to wait before trying again";

    const lexical = await codeSource(await contextFor(LIB, { question: q, semanticTier: "off" }));
    const withVectors = await codeSource(await contextFor(LIB, { question: q, semanticTier: "static" }));

    // The question says neither "backoff" nor "delay", so the lexical tier has
    // no term to match the declaration on.
    expect(lexical.items.some((i) => i.meta?.symbol === "computeBackoff")).toBe(false);
    expect(withVectors.items.some((i) => i.meta?.symbol === "computeBackoff")).toBe(true);
  });
});

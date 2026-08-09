import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContext } from "../src/ask.js";
import { symbolEvidence } from "../src/index/symbols.js";
import { snippetMatches } from "../src/check.js";
import type { AskOptions, RunContext } from "../src/types.js";

function repoWith(files: Record<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ud-symbol-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function contextFor(dir: string, over: Partial<AskOptions> = {}): Promise<RunContext> {
  return buildContext({
    repo: dir,
    question: "",
    sources: ["code"],
    semantic: false,
    webEngine: "auto",
    perSource: 6,
    json: false,
    refresh: false,
    ...over,
  });
}

const LIB = {
  "src/retry.ts": ["export function retryRequest(n: number): number {", "  return n + 1;", "}", "", "export function unused(): void {}"].join("\n"),
  "src/client.ts": ["import { retryRequest } from './retry.js';", "", "export function get(): number {", "  return retryRequest(1);", "}"].join("\n"),
  "docs/guide.md": "# Guide\n\nThe retryRequest helper retries a request.\n",
};

describe("symbol drill", () => {
  it("returns the declaration and every call site as code evidence", async () => {
    const { dir, cleanup } = repoWith(LIB);
    const { items } = symbolEvidence(await contextFor(dir), "retryRequest");

    const def = items.find((i) => i.meta?.definition)!;
    expect(def.ref).toBe("src/retry.ts");
    expect(def.snippet).toContain("export function retryRequest");
    expect(def.title).toContain("(definition)");

    const call = items.find((i) => i.meta?.callSite)!;
    expect(call.ref).toBe("src/client.ts");
    expect(call.snippet).toContain("retryRequest(1)");
    // The import line names the symbol but is not an invocation.
    expect(call.meta?.callLine).toBe(4);

    // Ordinary `code` evidence with a file:start-end location, so it validates
    // through the same path as any other code excerpt.
    for (const it of items) {
      expect(it.source).toBe("code");
      expect(it.location).toMatch(/^[^:]+:\d+-\d+$/);
    }
    cleanup();
  });

  it("emits snippets `check` re-validates against the tree", async () => {
    const { dir, cleanup } = repoWith(LIB);
    const { items } = symbolEvidence(await contextFor(dir), "retryRequest");
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      const [, rel, start, end] = it.location!.match(/^(.+):(\d+)-(\d+)$/)!;
      const lines = readFileSync(join(dir, rel!), "utf8").split(/\r?\n/);
      // The grounding contract: what the dossier stores IS what the file holds.
      expect(snippetMatches(it.snippet, lines, Number(start), Number(end)).ok).toBe(true);
    }
    cleanup();
  });

  it("names the caller a call site sits inside when spans are known", async () => {
    const { dir, cleanup } = repoWith(LIB);
    const ctx = await contextFor(dir);
    // The suite runs on the regex tier, which reports no endLine; graft the span
    // the AST tier would give `get()` so containment can be resolved.
    ctx.index.symbols = ctx.index.symbols.map((s) => (s.name === "get" ? { ...s, endLine: 5 } : s));
    const { items } = symbolEvidence(ctx, "retryRequest");
    expect(items.find((i) => i.meta?.callSite)!.title).toContain("from function get");
    cleanup();
  });

  it("points at near-matching names instead of returning a bare empty result", async () => {
    const { dir, cleanup } = repoWith(LIB);
    const { items, notes } = symbolEvidence(await contextFor(dir), "retryReq");
    expect(items).toHaveLength(0);
    expect(notes.join(" ")).toContain("retryRequest");
    cleanup();
  });

  it("says so when a declaration has no call site at all", async () => {
    const { dir, cleanup } = repoWith(LIB);
    const { items, notes } = symbolEvidence(await contextFor(dir), "unused");
    expect(items.some((i) => i.meta?.definition)).toBe(true);
    expect(items.some((i) => i.meta?.callSite)).toBe(false);
    expect(notes.join(" ")).toMatch(/no call site/i);
    cleanup();
  });

  it("reports mentions that are not calls, so a doc reference is not mistaken for usage", async () => {
    const { dir, cleanup } = repoWith(LIB);
    const { notes } = symbolEvidence(await contextFor(dir), "retryRequest");
    expect(notes.join(" ")).toContain("docs/guide.md");
    cleanup();
  });

  it("shows implementation callers before test callers", async () => {
    const { dir, cleanup } = repoWith({
      "src/util.ts": "export function ping(): void {}\n",
      // Alphabetically first, so file order alone would put the test first.
      "src/aaa.test.ts": "import { ping } from './util.js';\nping();\n",
      "src/zzz.ts": "import { ping } from './util.js';\nping();\n",
    });
    const calls = symbolEvidence(await contextFor(dir), "ping").items.filter((i) => i.meta?.callSite);
    expect(calls.map((i) => i.ref)).toEqual(["src/zzz.ts", "src/aaa.test.ts"]);
    cleanup();
  });

  it("honours --package scoping", async () => {
    const { dir, cleanup } = repoWith({
      "package.json": JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
      "packages/api/package.json": JSON.stringify({ name: "@x/api" }),
      "packages/api/src/a.ts": "export function ping(): void {}\nping();\n",
      "packages/web/package.json": JSON.stringify({ name: "@x/web" }),
      "packages/web/src/b.ts": "export function ping(): void {}\nping();\n",
    });
    const { items } = symbolEvidence(await contextFor(dir, { pkg: "@x/api" }), "ping");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.ref.startsWith("packages/api/"))).toBe(true);
    cleanup();
  });
});

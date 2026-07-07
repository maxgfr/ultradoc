import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildIndex, loadIndex, ensureIndex } from "../src/index/structural.js";
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

  it("records coverage stats and a top-level dir histogram", () => {
    expect(idx.stats).toBeDefined();
    expect(idx.stats!.truncated).toBe(false);
    expect(idx.topDirs).toBeDefined();
    expect(idx.topDirs!.src).toBeGreaterThan(0);
  });
});

describe("index caching", () => {
  it("marks the index truncated when the file cap is hit", () => {
    // The cap is checked per-directory, so the first dir's files land before the
    // walk stops; the point is that truncation is reported, not silent.
    const idx = buildIndex(FIXTURE, REF.slug, { maxFiles: 1 });
    expect(idx.stats!.truncated).toBe(true);
    const full = buildIndex(FIXTURE, REF.slug);
    expect(idx.fileCount).toBeLessThan(full.fileCount);
  });

  it("rebuilds a persisted index once the repo HEAD moves", () => {
    const repo = mkdtempSync(join(tmpdir(), "ultradoc-commit-"));
    const git = (args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
    git(["init", "-q"]);
    git(["config", "user.email", "t@t.t"]);
    git(["config", "user.name", "t"]);
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
    git(["add", "."]);
    git(["commit", "-q", "-m", "one"]);
    const ref = resolveRepo(repo);
    const first = buildIndex(repo, ref.slug); // persists index.json at commit #1
    expect(loadIndex(repo)?.commit).toBe(first.commit);

    // A second commit moves HEAD; the persisted index is now stale.
    writeFileSync(join(repo, "src", "b.ts"), "export const b = 2;\n");
    git(["add", "."]);
    git(["commit", "-q", "-m", "two"]);
    expect(loadIndex(repo)).toBeUndefined(); // commit mismatch → rebuild

    const rebuilt = ensureIndex(repo, ref.slug);
    expect(rebuilt.commit).not.toBe(first.commit);
    expect(rebuilt.symbols.some((s) => s.name === "b")).toBe(true);
    rmSync(repo, { recursive: true, force: true });
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

  it("folds plural queries onto singular text", () => {
    const idx = buildIndex(FIXTURE, REF.slug);
    // "backoffs" never appears in the fixture — only "backoff" does.
    const { items } = searchCode(FIXTURE, REF, idx, "how are backoffs computed", 6);
    expect(items[0]!.ref).toBe("src/retry.ts");
  });

  it("reaches definitions via identifier subtokens", () => {
    const idx = buildIndex(FIXTURE, REF.slug);
    // No symbol is named retryBackoff; retry + backoff subtokens must carry it.
    const { items } = searchCode(FIXTURE, REF, idx, "retryBackoff", 6);
    expect(items[0]!.ref).toBe("src/retry.ts");
  });

  it("boosts a file literally named after a query keyword", () => {
    // Two files with identical content: only the basename differentiates them.
    // Without the boost the alphabetically-first file wins the RRF tie.
    const repo = mkdtempSync(join(tmpdir(), "ultradoc-nameboost-"));
    mkdirSync(join(repo, "src"), { recursive: true });
    const body = "// tokenize the input line by line\nconst sep = /\\s+/;\n";
    writeFileSync(join(repo, "src", "alpha.ts"), body);
    writeFileSync(join(repo, "src", "parser.ts"), body);
    const ref = resolveRepo(repo);
    const idx = buildIndex(repo, ref.slug);
    const { items } = searchCode(repo, ref, idx, "how does the parser tokenize input", 4);
    expect(items[0]!.ref).toBe("src/parser.ts");
    rmSync(repo, { recursive: true, force: true });
  });

  it("caps excerpts at 30 lines", () => {
    const idx = buildIndex(FIXTURE, REF.slug);
    const { items } = searchCode(FIXTURE, REF, idx, "how does the retry backoff work", 6);
    for (const it of items) {
      expect(it.snippet.split("\n").length).toBeLessThanOrEqual(30);
      const [, a, b] = it.location!.match(/:(\d+)-(\d+)$/)!;
      expect(Number(b) - Number(a) + 1).toBeLessThanOrEqual(30);
    }
  });
});

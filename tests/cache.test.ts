import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheRoot } from "../src/config.js";
import { cacheStatus, cacheClean, formatCacheStatus } from "../src/cache.js";
import { PAGES_DIR } from "../src/sources/page-cache.js";
import { MODELS_DIR } from "../src/index/semantic/model.js";

let root: string;
const prev = process.env.ULTRADOC_CACHE_DIR;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ud-cache-"));
  process.env.ULTRADOC_CACHE_DIR = root;
});
afterEach(() => {
  if (prev === undefined) delete process.env.ULTRADOC_CACHE_DIR;
  else process.env.ULTRADOC_CACHE_DIR = prev;
  rmSync(root, { recursive: true, force: true });
});

function fakeRepo(slug: string, bytes = 100): void {
  const dir = join(root, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "blob"), "x".repeat(bytes));
}

function fakePages(bytes = 100): void {
  const dir = join(root, PAGES_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "https_example_com.v3-firecrawl.txt"), "x".repeat(bytes));
}

function fakeModel(bytes = 100): void {
  const dir = join(root, MODELS_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "model.json"), "x".repeat(bytes));
}

describe("cacheRoot env override", () => {
  it("honors ULTRADOC_CACHE_DIR", () => {
    expect(cacheRoot()).toBe(root);
  });
});

describe("cacheStatus / cacheClean", () => {
  it("lists cached repos with sizes and totals", () => {
    fakeRepo("github.com-a-b", 300);
    fakeRepo("github.com-c-d", 100);
    const s = cacheStatus();
    expect(s.root).toBe(root);
    expect(s.repos.map((r) => r.slug).sort()).toEqual(["github.com-a-b", "github.com-c-d"]);
    expect(s.repos[0]!.slug).toBe("github.com-a-b"); // largest first
    expect(s.totalBytes).toBeGreaterThanOrEqual(400);
  });

  it("ignores the materialized compose dir", () => {
    fakeRepo("github.com-a-b");
    mkdirSync(join(root, "compose"), { recursive: true });
    expect(cacheStatus().repos.map((r) => r.slug)).toEqual(["github.com-a-b"]);
  });

  it("clean --all removes every repo", () => {
    fakeRepo("github.com-a-b");
    fakeRepo("github.com-c-d");
    const { removed } = cacheClean({ all: true });
    expect(removed.length).toBe(2);
    expect(cacheStatus().repos).toEqual([]);
  });

  it("clean --repo removes only the matching slug", () => {
    fakeRepo("github.com-sindresorhus-ky");
    fakeRepo("github.com-expressjs-express");
    const { removed } = cacheClean({ repo: "sindresorhus/ky" });
    expect(removed).toEqual(["github.com-sindresorhus-ky"]);
    expect(existsSync(join(root, "github.com-expressjs-express"))).toBe(true);
  });

  // The page cache is keyed by URL, so no per-repo removal ever touches it.
  // Before this was wired up, `clean --all` left extracted pages behind for the
  // whole 168 h TTL — including pages produced by an extractor since turned off.
  it("reports the page cache separately from repos", () => {
    fakeRepo("github.com-a-b");
    fakePages(250);
    const s = cacheStatus();
    expect(s.repos.map((r) => r.slug)).toEqual(["github.com-a-b"]);
    expect(s.pagesBytes).toBeGreaterThan(0);
    expect(s.totalBytes).toBe(100);
  });

  it("clean --all also clears the page cache", () => {
    fakeRepo("github.com-a-b");
    fakePages();
    const { removed } = cacheClean({ all: true });
    expect(removed).toContain(PAGES_DIR);
    expect(existsSync(join(root, PAGES_DIR))).toBe(false);
    expect(cacheStatus().pagesBytes).toBe(0);
  });

  it("clean --repo leaves the page cache alone", () => {
    fakeRepo("github.com-sindresorhus-ky");
    fakePages();
    cacheClean({ repo: "sindresorhus/ky" });
    expect(existsSync(join(root, PAGES_DIR))).toBe(true);
  });

  // The static model used to be listed as a repo named "models", so `status`
  // invented a phantom repo and `clean --all` swept a ~20 MB checksum-verified
  // download without ever naming it.
  it("does not mistake the model directory for a repo", () => {
    fakeRepo("github.com-a-b");
    fakeModel(500);
    const s = cacheStatus();
    expect(s.repos.map((r) => r.slug)).toEqual(["github.com-a-b"]);
    expect(s.modelsBytes).toBeGreaterThan(0);
    expect(s.totalBytes).toBe(100);
    expect(formatCacheStatus(s)).toContain("semantic pull");
  });

  it("clean --all still drops the model, and names it", () => {
    fakeModel();
    const { removed } = cacheClean({ all: true });
    expect(removed).toContain(MODELS_DIR);
    expect(existsSync(join(root, MODELS_DIR))).toBe(false);
  });

  it("clean --repo leaves the model alone", () => {
    fakeRepo("github.com-sindresorhus-ky");
    fakeModel();
    cacheClean({ repo: "sindresorhus/ky" });
    expect(existsSync(join(root, MODELS_DIR))).toBe(true);
  });
});

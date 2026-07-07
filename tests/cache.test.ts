import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheRoot } from "../src/config.js";
import { cacheStatus, cacheClean } from "../src/cache.js";

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
});

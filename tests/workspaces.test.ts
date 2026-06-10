import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { discoverWorkspaces, resolvePackage } from "../src/index/workspaces.js";
import { buildIndex } from "../src/index/structural.js";
import { searchCode } from "../src/index/search.js";
import { resolveRepo } from "../src/clone.js";

const MONO = resolve("tests/fixtures/sample-mono");
const MONO_REF = resolveRepo("tests/fixtures/sample-mono");

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ultradoc-ws-"));
}

describe("discoverWorkspaces", () => {
  it("expands yarn/npm workspaces globs and reads package names", () => {
    const pkgs = discoverWorkspaces(MONO);
    expect(pkgs.map((p) => p.dir).sort()).toEqual(["packages/api", "packages/web"]);
    const web = pkgs.find((p) => p.dir === "packages/web")!;
    expect(web.name).toBe("@sample/web");
    expect(web.description).toBe("Web frontend");
  });

  it("supports the object form of package.json workspaces", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ workspaces: { packages: ["libs/*"] } }));
    mkdirSync(join(dir, "libs", "one"), { recursive: true });
    writeFileSync(join(dir, "libs", "one", "package.json"), JSON.stringify({ name: "one" }));
    expect(discoverWorkspaces(dir)).toEqual([
      { name: "one", dir: "libs/one", description: undefined },
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads pnpm-workspace.yaml package globs", () => {
    const dir = tmp();
    writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n  - \"!apps/skipme\"\n");
    mkdirSync(join(dir, "apps", "site"), { recursive: true });
    writeFileSync(join(dir, "apps", "site", "package.json"), JSON.stringify({ name: "site" }));
    mkdirSync(join(dir, "apps", "skipme"), { recursive: true });
    writeFileSync(join(dir, "apps", "skipme", "package.json"), JSON.stringify({ name: "skipme" }));
    const pkgs = discoverWorkspaces(dir);
    expect(pkgs.map((p) => p.name)).toEqual(["site"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads Cargo workspace members", () => {
    const dir = tmp();
    writeFileSync(join(dir, "Cargo.toml"), '[workspace]\nmembers = ["crates/core", "crates/cli"]\n');
    for (const m of ["core", "cli"]) {
      mkdirSync(join(dir, "crates", m), { recursive: true });
      writeFileSync(join(dir, "crates", m, "Cargo.toml"), `[package]\nname = "${m}"\n`);
    }
    const pkgs = discoverWorkspaces(dir);
    expect(pkgs.map((p) => p.name).sort()).toEqual(["cli", "core"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty list for a single-package repo", () => {
    expect(discoverWorkspaces(resolve("tests/fixtures/sample-lib"))).toEqual([]);
  });
});

describe("resolvePackage", () => {
  const pkgs = discoverWorkspaces(MONO);

  it("matches an exact package name", () => {
    expect(resolvePackage(pkgs, "@sample/web")?.dir).toBe("packages/web");
  });

  it("matches a short name (suffix after the scope)", () => {
    expect(resolvePackage(pkgs, "web")?.dir).toBe("packages/web");
  });

  it("matches a directory path", () => {
    expect(resolvePackage(pkgs, "packages/api")?.name).toBe("@sample/api");
  });

  it("returns undefined for an unknown package", () => {
    expect(resolvePackage(pkgs, "nope")).toBeUndefined();
  });
});

describe("monorepo-aware index + scoped code search", () => {
  it("records discovered workspace packages in the structural index", () => {
    const idx = buildIndex(MONO, MONO_REF.slug);
    expect(idx.packages.map((p) => p.name).sort()).toEqual(["@sample/api", "@sample/web"]);
  });

  it("scopes code search to one package while keeping repo-rooted paths", () => {
    const idx = buildIndex(MONO, MONO_REF.slug);
    const all = searchCode(MONO, MONO_REF, idx, "renderPage", 6);
    expect(new Set(all.items.map((i) => i.ref)).size).toBeGreaterThan(1);

    const scoped = searchCode(MONO, MONO_REF, idx, "renderPage", 6, "packages/api");
    expect(scoped.items.length).toBeGreaterThan(0);
    for (const it of scoped.items) {
      expect(it.ref.startsWith("packages/api/")).toBe(true);
    }
  });
});

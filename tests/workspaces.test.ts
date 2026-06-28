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
    expect(discoverWorkspaces(dir)).toEqual([{ name: "one", dir: "libs/one", description: undefined }]);
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

  it("parses Cargo workspaces regardless of key order, with multiline members and exclude", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "Cargo.toml"),
      [
        "[workspace]",
        'resolver = "2"',
        "members = [",
        '  "crates/core",',
        '  "crates/cli", # tooling',
        "]",
        'exclude = ["crates/skipme"]',
        "",
        "[workspace.dependencies]",
        'serde = { version = "1" }',
      ].join("\n"),
    );
    for (const m of ["core", "cli", "skipme"]) {
      mkdirSync(join(dir, "crates", m), { recursive: true });
      writeFileSync(join(dir, "crates", m, "Cargo.toml"), `[package]\nname = "${m}"\n`);
    }
    expect(
      discoverWorkspaces(dir)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["cli", "core"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("discovers uv workspace members from pyproject.toml", () => {
    const dir = tmp();
    writeFileSync(join(dir, "pyproject.toml"), '[project]\nname = "root"\n\n[tool.uv.workspace]\nmembers = ["packages/*"]\nexclude = ["packages/skipme"]\n');
    mkdirSync(join(dir, "packages", "mylib"), { recursive: true });
    writeFileSync(join(dir, "packages", "mylib", "pyproject.toml"), '[project]\nname = "mylib"\ndescription = "A lib"\n');
    mkdirSync(join(dir, "packages", "skipme"), { recursive: true });
    writeFileSync(join(dir, "packages", "skipme", "pyproject.toml"), '[project]\nname = "skipme"\n');
    const pkgs = discoverWorkspaces(dir);
    expect(pkgs.map((p) => p.name)).toEqual(["mylib"]);
    expect(pkgs[0]!.description).toBe("A lib");
    rmSync(dir, { recursive: true, force: true });
  });

  it("discovers Composer path repositories", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "composer.json"),
      JSON.stringify({
        repositories: [
          { type: "path", url: "packages/*" },
          { type: "vcs", url: "https://example.com/x.git" },
        ],
      }),
    );
    mkdirSync(join(dir, "packages", "lib"), { recursive: true });
    writeFileSync(join(dir, "packages", "lib", "composer.json"), JSON.stringify({ name: "acme/lib" }));
    expect(discoverWorkspaces(dir).map((p) => p.name)).toEqual(["acme/lib"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("discovers Maven modules and reads their artifactIds (ignoring <parent>)", () => {
    const dir = tmp();
    writeFileSync(join(dir, "pom.xml"), "<project>\n  <modules>\n    <module>app</module>\n    <module>lib/core</module>\n  </modules>\n</project>");
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(join(dir, "app", "pom.xml"), "<project><parent><artifactId>parent-pom</artifactId></parent><artifactId>my-app</artifactId></project>");
    mkdirSync(join(dir, "lib", "core"), { recursive: true });
    writeFileSync(join(dir, "lib", "core", "pom.xml"), "<project><artifactId>core</artifactId></project>");
    expect(
      discoverWorkspaces(dir)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["core", "my-app"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("discovers Gradle includes in settings.gradle (Groovy DSL)", () => {
    const dir = tmp();
    writeFileSync(join(dir, "settings.gradle"), "rootProject.name = 'demo'\ninclude ':app', ':lib:core'\n");
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(join(dir, "app", "build.gradle"), "plugins {}\n");
    mkdirSync(join(dir, "lib", "core"), { recursive: true });
    writeFileSync(join(dir, "lib", "core", "build.gradle"), "plugins {}\n");
    expect(
      discoverWorkspaces(dir)
        .map((p) => p.dir)
        .sort(),
    ).toEqual(["app", "lib/core"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("discovers Gradle includes in settings.gradle.kts (Kotlin DSL)", () => {
    const dir = tmp();
    writeFileSync(join(dir, "settings.gradle.kts"), 'rootProject.name = "demo"\ninclude(":svc")\n');
    mkdirSync(join(dir, "svc"), { recursive: true });
    writeFileSync(join(dir, "svc", "build.gradle.kts"), "plugins {}\n");
    expect(discoverWorkspaces(dir).map((p) => p.dir)).toEqual(["svc"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("expands nested glob patterns like packages/*/plugins/*", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ workspaces: ["packages/*/plugins/*"] }));
    mkdirSync(join(dir, "packages", "host", "plugins", "auth"), { recursive: true });
    writeFileSync(join(dir, "packages", "host", "plugins", "auth", "package.json"), JSON.stringify({ name: "auth-plugin" }));
    expect(discoverWorkspaces(dir).map((p) => p.name)).toEqual(["auth-plugin"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("expands partial wildcards within a segment, like libs-*", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ workspaces: ["libs-*"] }));
    mkdirSync(join(dir, "libs-a"), { recursive: true });
    writeFileSync(join(dir, "libs-a", "package.json"), JSON.stringify({ name: "a" }));
    mkdirSync(join(dir, "other"), { recursive: true });
    writeFileSync(join(dir, "other", "package.json"), JSON.stringify({ name: "other" }));
    expect(discoverWorkspaces(dir).map((p) => p.name)).toEqual(["a"]);
    rmSync(dir, { recursive: true, force: true });
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

  it("returns undefined when a short name matches several packages", () => {
    const ambiguous = [
      { name: "@a/core", dir: "packages/a-core", description: undefined },
      { name: "@b/core", dir: "packages/b-core", description: undefined },
    ];
    expect(resolvePackage(ambiguous, "core")).toBeUndefined();
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

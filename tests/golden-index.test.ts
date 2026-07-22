import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex } from "../src/index/structural.js";
import { renderOverview } from "../src/overview.js";
import type { RepoRef, StructuralIndex } from "../src/types.js";

// Golden snapshots of the load-bearing indexing artifacts (index.json and the
// cached OVERVIEW.md) on a purpose-built fixture, captured BEFORE the vendored
// codeindex engine replaces the walker / symbol extraction / workspace
// discovery. Every diff a later change introduces here must be adjudicated
// explicitly (see docs/MIGRATION.md in the codeindex repo): acceptable diffs
// are better-ignore-rules file-set changes and strictly richer resolution;
// anything else needs investigation before the snapshot is updated.
//
// The fixture deliberately exercises the known engine behavior differences:
// - a .gitignored file (`generated.txt`): ultradoc's walker indexes it today,
//   a gitignore-honoring walker will not;
// - a workspace monorepo (npm workspaces with package descriptions);
// - JS/TS export forms beyond single-line declarations (export lists with
//   `as` aliases, CommonJS exports, anonymous and identifier default exports).

function writeFixture(dir: string): void {
  const files: Record<string, string> = {
    ".gitignore": "generated.txt\n",
    "generated.txt": "temporary build artifact\nretry backoff notes\n",
    "package.json": JSON.stringify({ name: "golden-mono", private: true, workspaces: ["packages/*"], description: "Golden fixture monorepo" }, null, 2),
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }, null, 2),
    "README.md": [
      "# golden-mono",
      "",
      "A tiny fixture monorepo used to snapshot the structural index.",
      "",
      "It has two workspace packages and one gitignored file.",
    ].join("\n"),
    "docs/guide.md": ["# Guide", "", "How the alpha server retries requests."].join("\n"),
    "packages/alpha/package.json": JSON.stringify({ name: "@golden/alpha", description: "Alpha service" }, null, 2),
    "packages/alpha/src/server.ts": [
      'import { route } from "./routes.js";',
      "",
      "function boot(port: number): number {",
      "  return route(port);",
      "}",
      "function shutdown(): void {}",
      "export function handleRequest(req: string): string {",
      "  return req;",
      "}",
      "export { boot as start, shutdown };",
      "",
    ].join("\n"),
    "packages/alpha/src/routes.ts": ["export const route = (port: number): number => port;", "const helper = (x: number): number => x;", ""].join("\n"),
    "packages/alpha/src/model.ts": [
      "export interface User {",
      "  id: string;",
      "}",
      "export type UserId = string;",
      "class Repo {}",
      "export default Repo;",
      "",
    ].join("\n"),
    "packages/alpha/src/createApp.ts": ["export default function () {", "  return 1;", "}", ""].join("\n"),
    "packages/alpha/src/deep.ts": ["function internalOnly(): void {}", ""].join("\n"),
    "packages/beta/package.json": JSON.stringify({ name: "@golden/beta", description: "Beta legacy lib" }, null, 2),
    "packages/beta/src/util.js": [
      "function build() {}",
      "function helper() {}",
      "exports.render = function () {};",
      "module.exports = { build, helper };",
      "",
    ].join("\n"),
    "packages/beta/src/legacy.js": ["module.exports.parse = function () {};", ""].join("\n"),
    "packages/beta/src/index.js": ["export function betaMain() {}", ""].join("\n"),
  };
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
}

// Strip the run-dependent fields and sort everything whose order depends on
// filesystem walk order, so the snapshot is stable across machines and only
// changes when the artifact's CONTENT changes.
function normalize(idx: StructuralIndex): Omit<StructuralIndex, "root" | "builtAt"> {
  const { root: _root, builtAt: _builtAt, ...rest } = idx;
  return {
    ...rest,
    languages: Object.fromEntries(Object.entries(idx.languages).sort(([a], [b]) => a.localeCompare(b))),
    topDirs: idx.topDirs ? Object.fromEntries(Object.entries(idx.topDirs).sort(([a], [b]) => a.localeCompare(b))) : undefined,
    symbols: [...idx.symbols].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name)),
  };
}

const REF: RepoRef = { raw: "golden-fixture", host: "local", isLocal: true, slug: "golden-fixture", repo: "golden-fixture" };

describe("golden: structural index and overview", () => {
  it("snapshots index.json on the golden fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "ud-golden-"));
    try {
      writeFixture(dir);
      const idx = buildIndex(dir, "golden-fixture");
      expect(normalize(idx)).toMatchSnapshot();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("snapshots the rendered overview on the golden fixture", () => {
    const dir = mkdtempSync(join(tmpdir(), "ud-golden-"));
    try {
      writeFixture(dir);
      const idx = buildIndex(dir, "golden-fixture");
      const markdown = renderOverview({ ...idx, builtAt: "<builtAt>" }, REF, dir);
      expect(markdown).toMatchSnapshot();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps its own .ultradoc cache dir out of a rebuild", () => {
    const dir = mkdtempSync(join(tmpdir(), "ud-golden-"));
    try {
      writeFixture(dir);
      const first = normalize(buildIndex(dir, "golden-fixture"));
      // buildIndex persisted .ultradoc/index.json into the tree; a rebuild must
      // not index the cache dir itself.
      const second = normalize(buildIndex(dir, "golden-fixture"));
      expect(second).toEqual(first);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

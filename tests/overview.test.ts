import { describe, it, expect } from "vitest";
import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildIndex } from "../src/index/structural.js";
import { renderOverview, ensureOverview, overviewPath } from "../src/overview.js";
import { resolveRepo } from "../src/clone.js";

const LIB = resolve("tests/fixtures/sample-lib");
const LIB_REF = resolveRepo("tests/fixtures/sample-lib");
const MONO = resolve("tests/fixtures/sample-mono");
const MONO_REF = resolveRepo("tests/fixtures/sample-mono");

describe("renderOverview", () => {
  it("renders a deterministic project digest with the public API", () => {
    const idx = buildIndex(LIB, LIB_REF.slug);
    const md = renderOverview(idx, LIB_REF, LIB);
    expect(md).toContain("# sample-lib");
    expect(md).toContain("## Public API");
    expect(md).toContain("retryRequest");
    expect(md).toContain("## Documentation");
    expect(md).toContain("README.md");
  });

  it("lists workspace packages for a monorepo", () => {
    const idx = buildIndex(MONO, MONO_REF.slug);
    const md = renderOverview(idx, MONO_REF, MONO);
    expect(md).toContain("## Workspace packages");
    expect(md).toContain("@sample/web");
    expect(md).toContain("packages/api");
    expect(md).toContain("Web frontend");
    // Badge images are noise, not prose — the About section must skip them.
    expect(md).not.toContain("![Badge]");
    expect(md).toContain("A tiny workspace monorepo fixture");
    // Public API is grouped per package so scoped follow-ups are easy.
    expect(md).toContain("renderPage");
  });
});

describe("ensureOverview", () => {
  it("writes OVERVIEW.md beside the index and reuses it on the next call", () => {
    const path = overviewPath(LIB);
    rmSync(path, { force: true });
    const idx = buildIndex(LIB, LIB_REF.slug);

    const first = ensureOverview(idx, LIB_REF, LIB);
    expect(first.cached).toBe(false);
    expect(existsSync(first.path)).toBe(true);
    expect(first.path).toBe(path);

    const second = ensureOverview(idx, LIB_REF, LIB);
    expect(second.cached).toBe(true);
    expect(second.markdown).toBe(first.markdown);

    const forced = ensureOverview(idx, LIB_REF, LIB, { refresh: true });
    expect(forced.cached).toBe(false);
    // Other test files build indexes on this fixture concurrently — only remove
    // the file this test owns.
    rmSync(path, { force: true });
  });
});

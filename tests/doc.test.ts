import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runDoc, buildOutline, detectProjectTraits, DEFAULT_DOC_SOURCES } from "../src/doc.js";
import { checkRun } from "../src/check.js";
import { buildIndex } from "../src/index/structural.js";
import type { AskOptions, StructuralIndex } from "../src/types.js";

function baseOpts(out: string): AskOptions {
  return {
    repo: resolve("tests/fixtures/sample-lib"),
    question: "",
    sources: DEFAULT_DOC_SOURCES,
    semantic: false,
    webEngine: "auto",
    perSource: 6,
    json: false,
    refresh: true,
    out,
  };
}

describe("detectProjectTraits + adaptive outline", () => {
  it("detects a CLI by its package.json bin and adds a Commands section", () => {
    const dir = resolve("tests/fixtures/sample-cli");
    const index = buildIndex(dir, "sample-cli");
    const traits = detectProjectTraits(dir, index);
    expect(traits.isCli).toBe(true);
    const titles = buildOutline(index, "sample-cli", undefined, traits).map((s) => s.title);
    expect(titles).toContain("Commands");
  });

  it("detects a library by its exported symbols (no Commands section)", () => {
    const dir = resolve("tests/fixtures/sample-lib");
    const index = buildIndex(dir, "sample-lib");
    const traits = detectProjectTraits(dir, index);
    expect(traits.isLib).toBe(true);
    expect(traits.isCli).toBe(false);
    const titles = buildOutline(index, "sample-lib", undefined, traits).map((s) => s.title);
    expect(titles).toContain("Public API");
    expect(titles).not.toContain("Commands");
  });
});

describe("buildOutline", () => {
  it("produces a deterministic single-repo outline grounded on real symbols", () => {
    const index = buildIndex(resolve("tests/fixtures/sample-lib"), "test-sample");
    const outline = buildOutline(index, "sample-lib");
    const titles = outline.map((s) => s.title);
    expect(titles).toEqual(["Overview", "Installation & usage", "Public API", "Configuration", "Architecture & internals"]);
    // Ids are stable and ordered.
    expect(outline.map((s) => s.id)).toEqual(["S1", "S2", "S3", "S4", "S5"]);
    // The API section is grounded on the project's actual exported identifiers.
    const api = outline.find((s) => s.title === "Public API")!;
    expect(api.query).toMatch(/retryRequest|HttpClient|RetryOptions/);
    expect(api.sources).toContain("code");
  });

  it("grounds the API query on real exports, not test/example symbols", () => {
    // Regression: doc's API query was polluted by TestX / test_x identifiers
    // (foo_test.go, test_foo.py) that rank high only because test files are
    // symbol-dense — they are not the public API.
    const index = {
      slug: "x",
      root: "/x",
      builtAt: "",
      fileCount: 4,
      languages: {},
      symbols: [
        { name: "TestRetry", kind: "function", file: "client_test.go", line: 1, exported: true, lang: "go" },
        { name: "TestServe", kind: "function", file: "tests/server.go", line: 1, exported: true, lang: "go" },
        { name: "test_pool", kind: "function", file: "test_pool.py", line: 1, exported: true, lang: "python" },
        { name: "__init__", kind: "function", file: "client.go", line: 2, exported: true, lang: "go" },
        { name: "_private", kind: "function", file: "client.go", line: 3, exported: true, lang: "go" },
        { name: "RetryClient", kind: "type", file: "client.go", line: 4, exported: true, lang: "go" },
        { name: "NewClient", kind: "function", file: "client.go", line: 5, exported: true, lang: "go" },
      ],
      docFiles: [],
      configFiles: [],
      packages: [],
      schemaVersion: 1,
    } as unknown as StructuralIndex;
    const api = buildOutline(index, "mylib").find((s) => s.title === "Public API")!;
    expect(api.query).toMatch(/RetryClient|NewClient/);
    expect(api.query).not.toMatch(/TestRetry|TestServe|test_pool/);
    expect(api.query).not.toMatch(/__init__|_private/);
  });
});

describe("runDoc (offline integration)", () => {
  it("scaffolds a grounded doc whose sections map to real evidence, and check validates DOC.md", async () => {
    const out = mkdtempSync(join(tmpdir(), "ultradoc-doc-"));
    const r = await runDoc(baseOpts(out));

    // The scaffold writes the worklist + a single merged evidence set.
    for (const f of ["evidence.json", "EVIDENCE.md", "DOC.plan.json", "DOC.todo.md", "meta.json"]) {
      expect(existsSync(join(out, f))).toBe(true);
    }
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.plan.sections.length).toBe(5);

    // Every section's evidenceIds resolve to a real id in the merged set, and at
    // least one section is actually grounded.
    const ids = new Set(r.evidence.map((e) => e.id));
    for (const s of r.plan.sections) for (const id of s.evidenceIds) expect(ids.has(id)).toBe(true);
    expect(r.plan.sections.some((s) => s.evidenceIds.length > 0)).toBe(true);
    // Code AND docs both surface in a code+docs doc.
    expect(r.evidence.some((e) => e.source === "code")).toBe(true);
    expect(r.evidence.some((e) => e.source === "docs")).toBe(true);

    // A DOC.md citing real ids passes check (which auto-detects DOC.md when no
    // ANSWER.md is present). It must cover every planned section heading.
    const cite = r.evidence
      .slice(0, 2)
      .map((e) => `[${e.id}]`)
      .join(" ");
    const body = r.plan.sections.map((s) => `## ${s.title}\nA grounded claim ${cite}.`).join("\n\n");
    writeFileSync(join(out, "DOC.md"), `# doc\n\n${body}\n`);
    const ok = checkRun(out);
    expect(ok.ok).toBe(true);
    expect(ok.dangling).toEqual([]);

    // A fabricated id fails it, exactly like an ANSWER.md.
    writeFileSync(join(out, "DOC.md"), `# doc\n\nFabricated claim [E9999].\n`);
    const bad = checkRun(out);
    expect(bad.ok).toBe(false);
    expect(bad.dangling).toContain("E9999");

    rmSync(out, { recursive: true, force: true });
  });

  it("reports the overridden sources in meta, not the section defaults", async () => {
    const out = mkdtempSync(join(tmpdir(), "ultradoc-doc-src-"));
    const r = await runDoc(baseOpts(out), { sourcesOverride: ["docs"] });
    // Every retrieved item is from the override...
    expect(r.evidence.every((e) => e.source === "docs")).toBe(true);
    // ...and meta.json advertises exactly that, not the code+docs defaults.
    const meta = JSON.parse(readFileSync(join(out, "meta.json"), "utf8")) as { sources: string[] };
    expect(meta.sources).toEqual(["docs"]);
    rmSync(out, { recursive: true, force: true });
  });
});

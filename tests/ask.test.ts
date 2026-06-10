import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runAsk } from "../src/ask.js";
import { checkRun } from "../src/check.js";
import { resolveRepo } from "../src/clone.js";
import { buildIndex } from "../src/index/structural.js";
import { docsSource } from "../src/sources/docs.js";
import type { AskOptions, RunContext } from "../src/types.js";

// End-to-end, fully offline: clone (local path), index, retrieve from code+docs,
// write a dossier, then validate a grounded answer against it.
describe("runAsk (offline integration)", () => {
  it("produces a dossier and a passing citation check", async () => {
    const out = mkdtempSync(join(tmpdir(), "ultradoc-ask-"));
    const opts: AskOptions = {
      repo: resolve("tests/fixtures/sample-lib"),
      question: "how does the retry backoff work?",
      sources: ["code", "docs"],
      semantic: false,
      webEngine: "auto",
      perSource: 6,
      json: false,
      refresh: true,
      out,
    };
    const r = await runAsk(opts);

    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.evidence.some((e) => e.source === "code")).toBe(true);
    expect(r.evidence.some((e) => e.source === "docs")).toBe(true);
    expect(existsSync(join(out, "evidence.json"))).toBe(true);
    expect(existsSync(join(out, "EVIDENCE.md"))).toBe(true);

    // The retry source should be retrievable as the top code evidence.
    const code = r.evidence.filter((e) => e.source === "code");
    expect(code[0]!.ref).toBe("src/retry.ts");

    // A grounded answer citing real ids must pass the check.
    const cited = code[0]!.id;
    writeFileSync(join(out, "ANSWER.md"), `Backoff doubles each attempt [${cited}].`);
    const check = checkRun(out);
    expect(check.ok).toBe(true);

    rmSync(out, { recursive: true, force: true });
  });

  it("scopes retrieval to one workspace package with pkg", async () => {
    const out = mkdtempSync(join(tmpdir(), "ultradoc-ask-"));
    const opts: AskOptions = {
      repo: resolve("tests/fixtures/sample-mono"),
      question: "how is a page rendered (renderPage)?",
      sources: ["code"],
      pkg: "api",
      semantic: false,
      webEngine: "auto",
      perSource: 6,
      json: false,
      refresh: true,
      out,
    };
    const r = await runAsk(opts);
    expect(r.evidence.length).toBeGreaterThan(0);
    for (const e of r.evidence.filter((x) => x.source === "code")) {
      expect(e.ref.startsWith("packages/api/")).toBe(true);
    }
    expect(r.meta.pkg).toBe("@sample/api");
    rmSync(out, { recursive: true, force: true });
  });

  // --docs-url is intentionally NOT scope-filtered: the external page is the
  // project's official documentation, while --package only narrows in-repo docs.
  it("keeps the external --docs-url while scoping in-repo docs to the package", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ultradoc-docsurl-"));
    writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "mono", workspaces: ["packages/*"] }));
    writeFileSync(join(repo, "README.md"), "# Mono\nrenderPage is also mentioned at the root.");
    mkdirSync(join(repo, "packages", "api"), { recursive: true });
    writeFileSync(join(repo, "packages", "api", "package.json"), JSON.stringify({ name: "@t/api" }));
    writeFileSync(join(repo, "packages", "api", "README.md"), "# API\nrenderPage renders a page.");

    // Pre-seed the extdocs cache so no network fetch happens.
    const url = "https://example.com/docs";
    const cacheDir = join(repo, ".ultradoc", "extdocs");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, url.replace(/[^a-z0-9]+/gi, "_").slice(0, 100) + ".txt"),
      "External docs: renderPage takes a layout option.",
    );

    const repoRef = resolveRepo(repo);
    const ctx: RunContext = {
      repoRef,
      repoDir: repo,
      index: buildIndex(repo, repoRef.slug),
      options: {
        repo,
        question: "how does renderPage work?",
        sources: ["docs"],
        docsUrl: url,
        semantic: false,
        webEngine: "auto",
        perSource: 6,
        json: false,
        refresh: true,
      },
      scopePkg: { name: "@t/api", dir: "packages/api", description: undefined },
      scopeDir: "packages/api",
    };
    const res = await docsSource(ctx);

    const inRepo = res.items.filter((i) => !/^https?:/.test(i.ref));
    expect(inRepo.length).toBeGreaterThan(0);
    for (const i of inRepo) expect(i.ref.startsWith("packages/api/")).toBe(true);
    expect(res.items.some((i) => i.ref === url || i.url === url)).toBe(true);

    rmSync(repo, { recursive: true, force: true });
  });

  it("fails loudly on an unknown package, listing what exists", async () => {
    const opts: AskOptions = {
      repo: resolve("tests/fixtures/sample-mono"),
      question: "anything",
      sources: ["code"],
      pkg: "nope",
      semantic: false,
      webEngine: "auto",
      perSource: 6,
      json: false,
      refresh: true,
    };
    await expect(runAsk(opts)).rejects.toThrow(/@sample\/web/);
  });
});

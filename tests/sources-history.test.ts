import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { historySource } from "../src/sources/history.js";
import { ensureHistoryDepth, resolveRepo } from "../src/clone.js";
import { sh } from "../src/util.js";
import type { RunContext, StructuralIndex } from "../src/types.js";

let repo: string;

function git(...args: string[]): void {
  const res = sh("git", ["-C", repo, ...args]);
  if (!res.ok) throw new Error(`git ${args.join(" ")} failed: ${res.stderr}`);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "ultradoc-hist-"));
  sh("git", ["init", "-q", repo]);
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(repo, "lib.ts"), "export const VERSION = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "initial commit");
  writeFileSync(
    join(repo, "lib.ts"),
    "export const VERSION = 1;\nexport function retryBackoff(attempt: number): number {\n  return 2 ** attempt;\n}\n",
  );
  git("add", "-A");
  git("commit", "-q", "-m", "feat: add retryBackoff helper");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

function ctxFor(question: string): RunContext {
  return {
    repoRef: resolveRepo(repo),
    repoDir: repo,
    index: { docFiles: [], symbols: [], packages: [] } as unknown as StructuralIndex,
    options: {
      repo, question, sources: ["history"],
      semantic: false, webEngine: "auto", perSource: 6, json: false, refresh: false,
    },
  };
}

describe("historySource", () => {
  it("finds the commit that introduced a symbol via pickaxe", async () => {
    const res = await historySource(ctxFor("when was retryBackoff added?"));
    expect(res.items.length).toBeGreaterThan(0);
    const top = res.items[0]!;
    expect(top.ref).toMatch(/^commit:[0-9a-f]+$/);
    expect(top.title).toContain("add retryBackoff helper");
    expect(top.snippet).toContain("retryBackoff");
  });

  it("reports honestly when nothing in the history matches", async () => {
    const res = await historySource(ctxFor("zxqv unrelated nonsense"));
    expect(res.items).toEqual([]);
    expect(res.notes.join(" ")).toMatch(/no commit history matched/i);
  });
});

describe("ensureHistoryDepth", () => {
  it("is a no-op on a full (non-shallow) repo", () => {
    const r = ensureHistoryDepth(repo);
    expect(r.ok).toBe(true);
    expect(r.note).toBeUndefined();
  });

  it("reports a non-git directory honestly", () => {
    const dir = mkdtempSync(join(tmpdir(), "ultradoc-nogit-"));
    const r = ensureHistoryDepth(dir);
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/not a git/i);
    rmSync(dir, { recursive: true, force: true });
  });
});

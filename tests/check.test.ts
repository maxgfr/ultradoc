import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRun } from "../src/check.js";
import type { EvidenceItem } from "../src/types.js";

const EVIDENCE: EvidenceItem[] = [
  { id: "E1", source: "code", title: "retry", ref: "src/retry.ts", location: "src/retry.ts:1-10", score: 1, snippet: "..." },
  { id: "E2", source: "pr", title: "pr", ref: "pr#5", score: 1, snippet: "..." },
];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ultradoc-check-"));
  writeFileSync(join(dir, "evidence.json"), JSON.stringify(EVIDENCE));
});

function answer(body: string): void {
  writeFileSync(join(dir, "ANSWER.md"), body);
}

describe("checkRun", () => {
  it("passes when every citation resolves", () => {
    answer("Backoff doubles each attempt [E1]. A PR changes this [E2].");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.dangling).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails on a dangling citation", () => {
    answer("It uses a secret algo [E99].");
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.dangling).toContain("E99");
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when there are no citations", () => {
    answer("It just works.");
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/no citations/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves a typed alias against an evidence ref", () => {
    answer("See the open PR [pr#5].");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.resolved).toContain("pr#5");
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves a well-formed typed code alias", () => {
    answer("The backoff lives in [code:src/retry.ts].");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.resolved).toContain("code:src/retry.ts");
    rmSync(dir, { recursive: true, force: true });
  });

  it("does NOT accept a malformed typed citation with trailing garbage", () => {
    // Without the end anchor this would slip through and falsely resolve via the
    // 'src/retry.ts' substring — the grounding hole the `$` anchor closes.
    answer("It uses [code:src/retry.ts and also magic].");
    const r = checkRun(dir);
    expect(r.citations).not.toContain("code:src/retry.ts and also magic");
    expect(r.ok).toBe(false); // no valid citation remains → ungrounded
    rmSync(dir, { recursive: true, force: true });
  });

  it("ignores markdown links (not citations)", () => {
    answer("See [the docs](https://example.com) and evidence [E1].");
    const r = checkRun(dir);
    expect(r.citations).toEqual(["E1"]);
    expect(r.ok).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("errors when ANSWER.md is missing", () => {
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/No ANSWER\.md/);
    rmSync(dir, { recursive: true, force: true });
  });
});

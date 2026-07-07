import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRun } from "../src/check.js";
import type { EvidenceItem } from "../src/types.js";

const EVIDENCE: EvidenceItem[] = [
  { id: "E1", source: "code", title: "retry", ref: "src/retry.ts", location: "src/retry.ts:1-10", score: 1, snippet: "..." },
  { id: "E2", source: "pr", title: "pr", ref: "pr#5", score: 1, snippet: "..." },
  { id: "E3", source: "release", title: "rel", ref: "release:v1.2.0", score: 1, snippet: "..." },
  { id: "E4", source: "history", title: "commit", ref: "commit:abc1234", location: "abc1234", score: 1, snippet: "..." },
  { id: "E5", source: "discussion", title: "disc", ref: "discussion#42", score: 1, snippet: "..." },
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

  it("resolves release, commit and discussion aliases", () => {
    answer("Added in [release:v1.2.0] by [commit:abc1234], discussed in [discussion#42].");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.resolved).toEqual(expect.arrayContaining(["release:v1.2.0", "commit:abc1234", "discussion#42"]));
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails on a dangling discussion citation", () => {
    answer("Someone said so [discussion#999].");
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.dangling).toContain("discussion#999");
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

  it("validates DOC.md when no ANSWER.md is present (the `doc` flow)", () => {
    writeFileSync(join(dir, "DOC.md"), "A grounded section [E1].");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.resolved).toContain("E1");
    rmSync(dir, { recursive: true, force: true });
  });

  it("prefers ANSWER.md over DOC.md when both exist", () => {
    writeFileSync(join(dir, "ANSWER.md"), "From the answer [E1].");
    writeFileSync(join(dir, "DOC.md"), "Fabricated [E99].");
    const r = checkRun(dir); // ANSWER.md (E1) is validated; DOC.md's E99 ignored
    expect(r.ok).toBe(true);
    expect(r.dangling).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("honors an explicit --answer override", () => {
    writeFileSync(join(dir, "ANSWER.md"), "From the answer [E1].");
    writeFileSync(join(dir, "DOC.md"), "Fabricated [E99].");
    const r = checkRun(dir, { answerFile: "DOC.md" });
    expect(r.ok).toBe(false);
    expect(r.dangling).toContain("E99");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("checkRun — claim coverage gate", () => {
  it("fails when most claims are uncited (one real [E1] + paragraphs of memory)", () => {
    answer(
      [
        "The backoff doubles each attempt [E1].",
        "",
        "The client also automatically retries on DNS resolution failures.",
        "",
        "It transparently reconnects dropped websockets after a network partition.",
        "",
        "The default retry ceiling is thirty seconds in production deployments.",
      ].join("\n"),
    );
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/claim\(s\) cite evidence/i);
    expect(r.coverage?.cited).toBe(1);
    expect(r.coverage?.claims).toBe(4);
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes a fully cited answer and reports 100% coverage", () => {
    answer("The backoff doubles each attempt [E1].\n\nAn open PR revisits this behaviour [pr#5].");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.coverage?.ratio).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not fail a 2-claim answer on ratio alone", () => {
    answer("The backoff doubles each attempt [E1].\n\nThis is an entirely uncited second sentence about something.");
    const r = checkRun(dir);
    // 2 claims, one uncited → below 0.7, but the gate only applies at >=3 claims.
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/cite no evidence/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("--strict fails on any uncited claim", () => {
    answer("The backoff doubles each attempt [E1].\n\nThis is an entirely uncited second sentence about something.");
    const r = checkRun(dir, { strict: true });
    expect(r.ok).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("a citation only inside a code fence does not count and warns", () => {
    answer("The retry logic is shown below and does the right thing here.\n\n```\nsee [E1]\n```");
    const r = checkRun(dir);
    expect(r.citations).not.toContain("E1"); // fenced, excluded from grounding
    expect(r.fencedOnly).toContain("E1");
    expect(r.ok).toBe(false); // no grounding citation remains
    expect(r.warnings.join(" ")).toMatch(/code fences/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("--strict turns a fence-only citation into an error", () => {
    answer("A grounded claim about the backoff behaviour [E1].\n\n```\nalso [E2]\n```");
    const r = checkRun(dir, { strict: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/code fences/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("a bare-word code alias no longer resolves against a partial path", () => {
    // E1 lives at src/retry.ts; [code:retry] must NOT resolve to it anymore.
    answer("The backoff lives in [code:retry].");
    const r = checkRun(dir);
    expect(r.dangling).toContain("code:retry");
    expect(r.ok).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("warns when the dossier commit differs from the repo HEAD", () => {
    // A tiny git repo whose HEAD moves after the dossier was built.
    const git = (args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });
    git(["init", "-q"]);
    git(["config", "user.email", "t@t.t"]);
    git(["config", "user.name", "t"]);
    writeFileSync(join(dir, "f.txt"), "one");
    git(["add", "."]);
    git(["commit", "-q", "-m", "one"]);
    writeFileSync(join(dir, "meta.json"), JSON.stringify({ commit: "0000000000000000000000000000000000000000", repoDir: dir }));
    answer("Grounded claim about the backoff behaviour here [E1].");
    const r = checkRun(dir);
    expect(r.warnings.join(" ")).toMatch(/citations may have drifted/i);
    rmSync(dir, { recursive: true, force: true });
  });
});

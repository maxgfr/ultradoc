import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkRun, snippetMatches, REVALIDATION } from "../src/check.js";
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

  it("fails a DOC.md that is missing a planned section", () => {
    writeFileSync(
      join(dir, "DOC.plan.json"),
      JSON.stringify({
        sections: [
          { id: "S1", title: "Overview" },
          { id: "S2", title: "Commands" },
        ],
      }),
    );
    writeFileSync(join(dir, "DOC.md"), "# Doc\n\n## Overview\nA grounded overview of the tool [E1].");
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/missing planned section\(s\): Commands/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes a DOC.md whose headings cover every planned section", () => {
    writeFileSync(
      join(dir, "DOC.plan.json"),
      JSON.stringify({
        sections: [
          { id: "S1", title: "Overview" },
          { id: "S2", title: "Commands" },
        ],
      }),
    );
    writeFileSync(join(dir, "DOC.md"), "# Doc\n\n## Overview\nGrounded overview here [E1].\n\n## Commands\nThe command surface is documented here [pr#5].");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
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

// A claim whose ONLY support is an issue/PR describes tracker state at a point
// in time — the behavior may have been fixed since (the faithfulness-vs-
// correctness blind spot). check surfaces it; the skeptic cross-checks it.
describe("checkRun — issue/PR-only grounding lint", () => {
  it("warns when a claim's only support is an issue or PR", () => {
    answer("The library throws a TypeError when the callback option is null [E2].");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/only .*issue\/PR/i);
    expect(r.warnings.join(" ")).toMatch(/cross-check/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not warn when the claim is corroborated by code or a release", () => {
    answer("The library throws a TypeError when the callback option is null [E2] [E1].\n\nThe fix shipped in the next minor release [E2] [E3].");
    const r = checkRun(dir);
    expect(r.warnings.join(" ")).not.toMatch(/only .*issue\/PR/i);
    rmSync(dir, { recursive: true, force: true });
  });
});

// The shipped example is the canonical artifact users copy — it must survive
// the strictest gate.
describe("shipped example dossier", () => {
  it("passes check --strict", () => {
    const r = checkRun(resolve("assets/example-dossier"), { strict: true });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

// The wrong-line / fabricated-snippet gate (eval L02b/T22): `check` re-opens
// every code/docs excerpt in the pinned clone and fails when the cited lines
// no longer carry the stored snippet. Resolvability is no longer guaranteed
// only at build time.
describe("checkRun — evidence re-validation against the pinned clone", () => {
  const RETRY_LINES = [
    "export interface RetryOptions {",
    "  maxRetries: number;",
    "  baseDelayMs: number;",
    "}",
    "",
    "export function computeBackoff(attempt: number): number {",
    "  return 200 * 2 ** attempt;",
    "}",
    "",
    "export function retryRequest(fn: () => Promise<unknown>, opts: RetryOptions) {",
    "  let attempt = 0;",
    "  return fn();",
    "}",
  ];
  const cleanups: string[] = [];
  afterEach(() => {
    for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  // A real pinned clone + a dossier whose E1 excerpt is an exact slice of it,
  // exactly as `ask` builds them.
  function makePinnedRun(opts: { lines?: [number, number]; location?: string; crlf?: boolean } = {}): {
    repo: string;
    run: string;
    evidence: EvidenceItem[];
    rewrite: (mutate: (ev: EvidenceItem[]) => void) => void;
  } {
    const repo = mkdtempSync(join(tmpdir(), "ud-reval-repo-"));
    const run = mkdtempSync(join(tmpdir(), "ud-reval-run-"));
    cleanups.push(repo, run);
    const git = (args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
    mkdirSync(join(repo, "src"), { recursive: true });
    const eol = opts.crlf ? "\r\n" : "\n";
    writeFileSync(join(repo, "src/retry.ts"), RETRY_LINES.join(eol) + eol);
    git(["init", "-q"]);
    git(["config", "user.email", "t@t.t"]);
    git(["config", "user.name", "t"]);
    git(["add", "."]);
    git(["commit", "-q", "-m", "pin"]);
    const head = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"]).toString().trim();
    const [s, e] = opts.lines ?? [6, 8];
    const evidence: EvidenceItem[] = [
      {
        id: "E1",
        source: "code",
        title: "retry",
        ref: "src/retry.ts",
        location: opts.location ?? `src/retry.ts:${s}-${e}`,
        score: 1,
        snippet: RETRY_LINES.slice(s - 1, e).join("\n"),
      },
    ];
    writeFileSync(join(run, "evidence.json"), JSON.stringify(evidence));
    writeFileSync(join(run, "meta.json"), JSON.stringify({ commit: head, repoDir: repo }));
    writeFileSync(join(run, "ANSWER.md"), "The backoff doubles the delay on every retry attempt [E1].");
    const rewrite = (mutate: (ev: EvidenceItem[]) => void) => {
      mutate(evidence);
      writeFileSync(join(run, "evidence.json"), JSON.stringify(evidence));
    };
    return { repo, run, evidence, rewrite };
  }

  it("passes when the cited snippet matches the pinned clone", () => {
    const { run } = makePinnedRun();
    const r = checkRun(run);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.revalidation).toMatchObject({ attempted: 1, validated: 1, failures: [] });
  });

  it("fails when the location's line range was corrupted (wrong-line citation)", () => {
    const { run, rewrite } = makePinnedRun();
    rewrite((ev) => {
      ev[0]!.location = "src/retry.ts:1-3"; // snippet still lines 6-8
    });
    const r = checkRun(run);
    expect(r.ok).toBe(false);
    expect(r.revalidation!.failures[0]!.reason).toBe("snippet-mismatch");
    expect(r.errors.join(" ")).toMatch(/does not match those lines/);
  });

  it("fails when the stored snippet was fabricated", () => {
    const { run, rewrite } = makePinnedRun();
    rewrite((ev) => {
      ev[0]!.snippet = "export function computeBackoff(attempt: number): number {\n  return attempt; // fabricated\n}";
    });
    const r = checkRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/does not match those lines/);
  });

  it("fails when the line range exceeds the file", () => {
    const { run, rewrite } = makePinnedRun();
    rewrite((ev) => {
      ev[0]!.location = "src/retry.ts:100-140";
    });
    const r = checkRun(run);
    expect(r.ok).toBe(false);
    expect(r.revalidation!.failures[0]!.reason).toBe("range-out-of-bounds");
    expect(r.errors.join(" ")).toMatch(/out of bounds/);
  });

  it("fails when the cited path escapes the pinned clone", () => {
    const { run, rewrite } = makePinnedRun();
    rewrite((ev) => {
      ev[0]!.location = "../../../etc/passwd:1-2";
    });
    const r = checkRun(run);
    expect(r.ok).toBe(false);
    expect(r.revalidation!.failures[0]!.reason).toBe("escapes-repo");
  });

  it("accepts a single-line location like path:6", () => {
    const { run } = makePinnedRun({ lines: [6, 6], location: "src/retry.ts:6" });
    const r = checkRun(run);
    expect(r.ok).toBe(true);
    expect(r.revalidation).toMatchObject({ attempted: 1, validated: 1 });
  });

  it("re-validates a CRLF file transparently", () => {
    const { run } = makePinnedRun({ crlf: true });
    const r = checkRun(run);
    expect(r.ok).toBe(true);
    expect(r.revalidation).toMatchObject({ attempted: 1, validated: 1 });
  });

  it("skips with a warning (not an error) when the clone's HEAD moved", () => {
    const { repo, run, rewrite } = makePinnedRun();
    rewrite((ev) => {
      ev[0]!.snippet = "totally fabricated after the fact";
    });
    writeFileSync(join(repo, "src/retry.ts"), "export const rewritten = true;\n");
    execFileSync("git", ["-C", repo, "add", "."], { stdio: "pipe" });
    execFileSync("git", ["-C", repo, "commit", "-q", "-m", "moved"], { stdio: "pipe" });
    const r = checkRun(run);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/may have drifted/);
    expect(r.warnings.join(" ")).toMatch(/re-validation skipped/);
  });

  it("warns (not fails) when the recorded clone was evicted", () => {
    const { run, rewrite } = makePinnedRun();
    void rewrite;
    const gone = join(tmpdir(), `ud-gone-${Date.now()}`);
    writeFileSync(join(run, "meta.json"), JSON.stringify({ commit: "abc1234", repoDir: gone }));
    const r = checkRun(run);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/no longer exists/);
  });

  it("fails on a corrupted excerpt even when that item is uncited", () => {
    const { run, evidence, rewrite } = makePinnedRun();
    void evidence;
    rewrite((ev) => {
      ev.push({
        id: "E2",
        source: "code",
        title: "uncited",
        ref: "src/retry.ts",
        location: "src/retry.ts:1-4",
        score: 0.5,
        snippet: "a snippet nobody sliced from this file",
      });
    });
    const r = checkRun(run); // ANSWER.md cites only E1
    expect(r.ok).toBe(false);
    expect(r.revalidation!.failures.map((f) => f.id)).toEqual(["E2"]);
  });

  it("skips items with no location and URL-backed docs items", () => {
    const { run, rewrite } = makePinnedRun();
    rewrite((ev) => {
      ev.push(
        { id: "E2", source: "code", title: "no-loc", ref: "src/retry.ts", score: 0.5, snippet: "..." },
        { id: "E3", source: "docs", title: "external", ref: "https://example.com/guide", location: "https://example.com/guide#~1", score: 0.4, snippet: "..." },
      );
    });
    const r = checkRun(run);
    expect(r.ok).toBe(true);
    expect(r.revalidation).toMatchObject({ attempted: 1, validated: 1 });
  });

  it("reports the skipped gate on a hand-built dossier with no meta.json", () => {
    // The classic unit fixture: evidence + answer, no pinned clone at all.
    answer("Backoff doubles each attempt [E1].");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.revalidation?.skipped).toMatch(/meta\.json/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("snippetMatches (excerpt fuzzy-match)", () => {
  const FILE = ["function a() {", "  return 1;", "}", "", "function b() {", "  return 2;", "}"];

  it("accepts an exact slice", () => {
    expect(snippetMatches("function a() {\n  return 1;\n}", FILE, 1, 3).ok).toBe(true);
  });

  it("accepts whitespace/CRLF-normalized equality", () => {
    expect(snippetMatches("function a() {\r\n\treturn 1;\r\n}", FILE, 1, 3).ok).toBe(true);
  });

  it("rejects a single corrupted line in an un-clipped snippet", () => {
    const r = snippetMatches("function a() {\n  return 42;\n}", FILE, 1, 3);
    expect(r.ok).toBe(false);
    expect(r.matched).toBeLessThan(r.total);
    expect(r.total).toBe(3);
  });

  it("rejects an un-clipped snippet aimed at the wrong lines", () => {
    expect(snippetMatches("function a() {\n  return 1;\n}", FILE, 5, 7).ok).toBe(false);
  });

  it(`accepts a clipped snippet when ≥${REVALIDATION.SNIPPET_MATCH_MIN * 100}% of its lines re-match in order`, () => {
    const stored = "function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n… [truncated 12 chars]";
    expect(snippetMatches(stored, FILE, 1, 7).ok).toBe(true);
  });

  it("rejects a clipped snippet whose lines mostly diverge", () => {
    const stored = "function z() {\n  return 9;\n}\nnope\n… [truncated 12 chars]";
    expect(snippetMatches(stored, FILE, 1, 7).ok).toBe(false);
  });
});

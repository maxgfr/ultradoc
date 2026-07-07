import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

// End-to-end coverage for EVERY ultradoc subcommand, driven in-process through
// the exported run(argv). This is the "test all the skills" suite: it exercises
// the real CLI dispatch + wiring, not just the individual modules. Network is
// disabled (global fetch stubbed to throw) so the network-backed sources
// (so/web/releases) are forced down their graceful-degradation path and the
// suite stays deterministic and offline.

const LIB = resolve("tests/fixtures/sample-lib");
const MONO = resolve("tests/fixtures/sample-mono");

// A sentinel thrown in place of process.exit so a command that exits can be
// observed instead of tearing down the test runner.
class ExitSignal extends Error {
  constructor(public code: number) {
    super(`exit:${code}`);
  }
}

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Set when run() rejected with a non-exit error (e.g. buildContext threw). */
  error?: Error;
}

// Run a command in-process, capturing stdout/stderr and translating both
// process.exit(code) and a thrown error into an inspectable result.
async function runCli(argv: string[]): Promise<CliResult> {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  const origExit = process.exit;
  let exitCode = 0;
  let error: Error | undefined;
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number) => {
    throw new ExitSignal(code ?? 0);
  }) as typeof process.exit;
  try {
    await run(argv);
  } catch (e) {
    if (e instanceof ExitSignal) exitCode = e.code;
    else error = e as Error;
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    process.exit = origExit;
  }
  return { stdout: out.join(""), stderr: err.join(""), exitCode, error };
}

let root: string;
let gitRepo: string;

function git(dir: string, ...args: string[]): void {
  execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ultradoc-e2e-"));
  // A self-contained git fixture so history/releases have real commits to find
  // (the checked-in fixtures live inside ultradoc's own repo and would report
  // the parent repo's history).
  gitRepo = join(root, "git-fixture");
  mkdirSync(join(gitRepo, "src"), { recursive: true });
  execFileSync("git", ["init", "-q", gitRepo], { stdio: "pipe" });
  git(gitRepo, "config", "user.email", "test@example.com");
  git(gitRepo, "config", "user.name", "Test");
  writeFileSync(join(gitRepo, "README.md"), "# demo lib\n\nA tiny demo library.\n");
  writeFileSync(join(gitRepo, "package.json"), JSON.stringify({ name: "demo", version: "0.1.0" }, null, 2));
  writeFileSync(join(gitRepo, "src/retry.ts"), "export function retry() {\n  // v1\n}\n");
  git(gitRepo, "add", "-A");
  git(gitRepo, "commit", "-q", "-m", "initial commit");
  writeFileSync(join(gitRepo, "src/retry.ts"), "export function retryBackoff(attempt: number) {\n  return 2 ** attempt;\n}\n");
  git(gitRepo, "add", "-A");
  git(gitRepo, "commit", "-q", "-m", "feat: add retryBackoff helper");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  // Belt-and-braces: never let a run leave a dossier cache inside a fixture.
  for (const f of [LIB, MONO]) rmSync(join(f, ".ultradoc"), { recursive: true, force: true });
});

// Disable the network for the whole suite: any httpGet-backed source degrades
// to an honest note instead of reaching the internet.
const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = (async () => {
    throw new Error("network disabled in tests");
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function outDir(name: string): string {
  const d = join(root, `${name}-${Math.floor(performance.now() * 1000)}`);
  mkdirSync(d, { recursive: true });
  return d;
}

// Build a real evidence dossier for the check/verify tests.
async function makeDossier(): Promise<{ dir: string; firstId: string }> {
  const dir = outDir("dossier");
  const r = await runCli(["ask", "--repo", LIB, "--q", "retry backoff", "--sources", "code,docs", "--out", dir]);
  expect(r.exitCode).toBe(0);
  const evidence = JSON.parse(readFileSync(join(dir, "evidence.json"), "utf8")) as Array<{ id: string }>;
  expect(evidence.length).toBeGreaterThan(0);
  return { dir, firstId: evidence[0]!.id };
}

describe("ask (multi-source dossier)", () => {
  it("retrieves code+docs and writes evidence.json + EVIDENCE.md", async () => {
    const dir = outDir("ask");
    const r = await runCli(["ask", "--repo", LIB, "--q", "how does retry backoff work?", "--sources", "code,docs", "--out", dir]);
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeUndefined();
    expect(r.stderr).toMatch(/evidence item\(s\)/);
    expect(existsSync(join(dir, "evidence.json"))).toBe(true);
    expect(existsSync(join(dir, "EVIDENCE.md"))).toBe(true);
    const evidence = JSON.parse(readFileSync(join(dir, "evidence.json"), "utf8"));
    expect(Array.isArray(evidence)).toBe(true);
    expect(evidence.length).toBeGreaterThan(0);
  });

  it("supports --json with {dir, meta}", async () => {
    const dir = outDir("ask-json");
    const r = await runCli(["ask", "--repo", LIB, "--q", "retry", "--sources", "code", "--out", dir, "--json"]);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.dir).toBeTruthy();
    expect(parsed.meta.sources).toContain("code");
  });

  it("scopes retrieval to a monorepo package", async () => {
    const dir = outDir("ask-mono");
    const r = await runCli(["ask", "--repo", MONO, "--q", "server", "--sources", "code", "--package", "api", "--out", dir]);
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeUndefined();
  });
});

describe("drill commands (print evidence, write nothing)", () => {
  it("code prints a code-only evidence dossier (text)", async () => {
    const r = await runCli(["code", "--repo", LIB, "--q", "retry backoff"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("# Evidence dossier");
    expect(r.stdout).toMatch(/Sources:\*\* code/);
  });

  it("code --json prints a raw evidence array", async () => {
    const r = await runCli(["code", "--repo", LIB, "--q", "retry", "--json"]);
    expect(r.exitCode).toBe(0);
    const items = JSON.parse(r.stdout);
    expect(Array.isArray(items)).toBe(true);
    expect(items[0]).toHaveProperty("id");
    expect(items[0]).toHaveProperty("source", "code");
  });

  it("docs drills into documentation", async () => {
    const r = await runCli(["docs", "--repo", LIB, "--q", "usage"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Sources:\*\* docs/);
  });

  // Every network-backed source must degrade gracefully offline: exit 0, no
  // throw, still emits a dossier (evidence may be empty with an honest note).
  for (const cmd of ["issues", "prs", "releases", "discussions", "so", "web"]) {
    it(`${cmd} degrades gracefully with no network`, async () => {
      const r = await runCli([cmd, "--repo", LIB, "--q", "retry backoff exponential"]);
      expect(r.error).toBeUndefined();
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("# Evidence dossier");
    });
  }

  it("history finds the commit that introduced a symbol (real git repo)", async () => {
    const r = await runCli(["history", "--repo", gitRepo, "--q", "retryBackoff"]);
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeUndefined();
    expect(r.stdout).toContain("# Evidence dossier");
  });

  it("web --url degrades gracefully when the page can't be fetched", async () => {
    const r = await runCli(["web", "--repo", LIB, "--url", "https://example.com/docs/retry"]);
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeUndefined();
    expect(r.stdout).toContain("# Evidence dossier");
  });
});

describe("overview (cached repo digest)", () => {
  it("generates an OVERVIEW.md and reuses it on the second run", async () => {
    const out = join(outDir("ov"), "OVERVIEW.md");
    const first = await runCli(["overview", "--repo", LIB, "--out", out, "--json"]);
    expect(first.exitCode).toBe(0);
    const p1 = JSON.parse(first.stdout);
    expect(p1.cached).toBe(false);
    expect(existsSync(out)).toBe(true);
    expect(typeof p1.fileCount).toBe("number");

    const second = await runCli(["overview", "--repo", LIB, "--out", out, "--json"]);
    const p2 = JSON.parse(second.stdout);
    expect(p2.cached).toBe(true);
  });

  it("text output names the file and repo", async () => {
    const out = join(outDir("ov2"), "OVERVIEW.md");
    const r = await runCli(["overview", "--repo", LIB, "--out", out]);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toMatch(/overview/);
  });
});

describe("index (structural stats)", () => {
  it("reports file/symbol counts (text)", async () => {
    const r = await runCli(["index", "--repo", LIB]);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toMatch(/indexed/);
    expect(r.stderr).toMatch(/files:/);
  });

  it("--json exposes the structural index", async () => {
    const r = await runCli(["index", "--repo", LIB, "--json"]);
    expect(r.exitCode).toBe(0);
    const idx = JSON.parse(r.stdout);
    expect(idx.fileCount).toBeGreaterThan(0);
    expect(Array.isArray(idx.symbols) || typeof idx.symbols === "number").toBe(true);
    expect(idx.languages).toBeTruthy();
  });

  it("discovers workspace packages in a monorepo", async () => {
    const r = await runCli(["index", "--repo", MONO, "--json"]);
    expect(r.exitCode).toBe(0);
    const idx = JSON.parse(r.stdout);
    expect(idx.packages.length).toBeGreaterThanOrEqual(2);
  });
});

describe("doc (grounded reference-doc scaffold)", () => {
  it("scaffolds sections + evidence and writes a worklist", async () => {
    const dir = outDir("doc");
    const r = await runCli(["doc", "--repo", LIB, "--out", dir]);
    expect(r.exitCode).toBe(0);
    expect(r.error).toBeUndefined();
    expect(r.stderr).toMatch(/doc scaffold/);
    expect(existsSync(join(dir, "evidence.json"))).toBe(true);
  });

  it("--json exposes the plan with sections", async () => {
    const dir = outDir("doc-json");
    const r = await runCli(["doc", "--repo", LIB, "--out", dir, "--json"]);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.plan.sections.length).toBeGreaterThan(0);
  });
});

describe("check (citation grounding gate)", () => {
  it("passes when every citation resolves", async () => {
    const { dir, firstId } = await makeDossier();
    writeFileSync(join(dir, "ANSWER.md"), `# Answer\n\nThe retry logic backs off exponentially [${firstId}].\n`);
    const r = await runCli(["check", "--run", dir]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/grounded/);
  });

  it("fails on a dangling citation", async () => {
    const { dir } = await makeDossier();
    writeFileSync(join(dir, "ANSWER.md"), "# Answer\n\nInvented fact [E999].\n");
    const r = await runCli(["check", "--run", dir]);
    expect(r.exitCode).toBe(1);
  });

  it("fails when there is no answer file", async () => {
    const { dir } = await makeDossier();
    const r = await runCli(["check", "--run", dir]);
    expect(r.exitCode).toBe(1);
  });

  it("fails with a clear message when --run is missing", async () => {
    const r = await runCli(["check"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/missing --run/);
  });
});

describe("verify (adversarial claim↔evidence gate)", () => {
  it("emits a worklist for an answer with citations", async () => {
    const { dir, firstId } = await makeDossier();
    writeFileSync(join(dir, "ANSWER.md"), `# Answer\n\nRetry doubles the delay each attempt [${firstId}].\n`);
    const r = await runCli(["verify", "--run", dir]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(dir, "VERIFY.todo.json"))).toBe(true);
  });

  it("passes when applied verdicts all support the claims", async () => {
    const { dir, firstId } = await makeDossier();
    writeFileSync(join(dir, "ANSWER.md"), `# Answer\n\nRetry doubles the delay each attempt [${firstId}].\n`);
    await runCli(["verify", "--run", dir]);
    const todo = JSON.parse(readFileSync(join(dir, "VERIFY.todo.json"), "utf8"));
    const pairs = todo.pairs.map((p: Record<string, unknown>) => ({ ...p, verdict: "supported", note: "" }));
    writeFileSync(join(dir, "verdicts.json"), JSON.stringify({ pairs }));
    const r = await runCli(["verify", "--apply", join(dir, "verdicts.json"), "--run", dir]);
    expect(r.exitCode).toBe(0);
  });

  it("fails when an applied verdict refutes a claim", async () => {
    const { dir, firstId } = await makeDossier();
    writeFileSync(join(dir, "ANSWER.md"), `# Answer\n\nRetry doubles the delay each attempt [${firstId}].\n`);
    await runCli(["verify", "--run", dir]);
    const todo = JSON.parse(readFileSync(join(dir, "VERIFY.todo.json"), "utf8"));
    const pairs = todo.pairs.map((p: Record<string, unknown>) => ({ ...p, verdict: "refuted", note: "contradicted" }));
    writeFileSync(join(dir, "verdicts.json"), JSON.stringify({ pairs }));
    const r = await runCli(["verify", "--apply", join(dir, "verdicts.json"), "--run", dir]);
    expect(r.exitCode).toBe(1);
  });

  // Regression: a dossier dir with no evidence.json used to leak a raw Node
  // ENOENT ("open '.../evidence.json'"); it now mirrors check's friendly guard.
  it("fails with an actionable message when evidence.json is missing", async () => {
    const dir = outDir("verify-noev");
    const r = await runCli(["verify", "--run", dir]);
    expect(r.error).toBeDefined();
    expect(r.error?.message).toMatch(/No evidence\.json/);
    expect(r.error?.message).not.toMatch(/ENOENT/);
  });

  it("--apply fails with an actionable message when the verdicts file is missing", async () => {
    const { dir } = await makeDossier();
    const r = await runCli(["verify", "--apply", join(dir, "does-not-exist.json"), "--run", dir]);
    expect(r.error).toBeDefined();
    expect(r.error?.message).toMatch(/No verdicts file/);
    expect(r.error?.message).not.toMatch(/ENOENT/);
  });
});

describe("semantic (optional docker stack)", () => {
  it("rejects an unknown action without touching docker", async () => {
    const r = await runCli(["semantic", "frobnicate"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/unknown action/);
  });
});

describe("cache (persistent clone/index cache)", () => {
  it("reports status as text and JSON", async () => {
    const text = await runCli(["cache", "status"]);
    expect(text.exitCode).toBe(0);
    const json = await runCli(["cache", "status", "--json"]);
    expect(json.exitCode).toBe(0);
    expect(() => JSON.parse(json.stdout)).not.toThrow();
  });

  // Guard the destructive path's argument requirement WITHOUT ever wiping the
  // user's real cache (no `clean --all` here — it would delete live data).
  it("clean refuses to run without --all or --repo", async () => {
    const r = await runCli(["cache", "clean"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--all or --repo/);
  });

  it("rejects an unknown cache action", async () => {
    const r = await runCli(["cache", "frobnicate"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/unknown cache action/);
  });
});

describe("argument + usage errors", () => {
  it("exits 1 on an unknown command", async () => {
    const r = await runCli(["frobnicate"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/unknown command/);
  });

  it("exits 1 when ask is missing --q", async () => {
    const r = await runCli(["ask", "--repo", LIB]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/missing --q/);
  });

  it("exits 1 when a drill command is missing --repo", async () => {
    const r = await runCli(["code", "--q", "retry"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/missing --repo/);
  });

  it("exits 1 on an unknown --sources value", async () => {
    const r = await runCli(["ask", "--repo", LIB, "--q", "x", "--sources", "bogus"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/unknown source/);
  });

  it("rejects a --package that matches no workspace", async () => {
    const dir = outDir("badpkg");
    const r = await runCli(["ask", "--repo", MONO, "--q", "x", "--sources", "code", "--package", "does-not-exist", "--out", dir]);
    // buildContext throws for an unmatched package; run() rejects (the CLI
    // wrapper turns this into an exit-1 message).
    expect(r.error).toBeDefined();
    expect(r.error?.message).toMatch(/does-not-exist|does not match/);
  });
});

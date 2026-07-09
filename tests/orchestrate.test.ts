import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { Script } from "node:vm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { runDoc } from "../src/doc.js";
import { assignIds, writeDossier } from "../src/dossier.js";
import { buildDrillPlan, writeDrillPlan } from "../src/drill-plan.js";
import { BATCH_SIZE, PHASES, SMALL_WORKLIST, listPhases, orchestrateRun } from "../src/orchestrate.js";
import type { DossierMeta, EvidenceItem } from "../src/types.js";
import { runVerify } from "../src/verify.js";

const ENGINE = "/opt/skills/ultradoc/scripts/ultradoc.mjs";
const LIB = resolve("tests/fixtures/sample-lib");

// Disable the network for the whole suite (same guard as e2e-commands): every
// engine call used to build fixtures must be offline-deterministic.
const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = (async () => {
    throw new Error("network disabled in tests");
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function codeItems(n: number): Omit<EvidenceItem, "id">[] {
  return Array.from({ length: n }, (_, i) => ({
    source: "code" as const,
    title: `retry helper ${i + 1}`,
    ref: `src/retry${i + 1}.ts`,
    location: `src/retry${i + 1}.ts:1-3`,
    score: n - i,
    snippet: `export function retry${i + 1}(attempt: number) {\n  return 2 ** attempt; // item ${i + 1}\n}`,
  }));
}

function dossierMeta(n: number): DossierMeta {
  return {
    question: "how does retry backoff work?",
    repo: LIB,
    host: "local",
    sources: ["code"],
    semantic: false,
    evidenceCount: n,
    builtAt: "2026-07-09T00:00:00.000Z",
    notes: [],
  };
}

/** A run dir whose VERIFY.todo.json was written by the REAL engine writer chain
 * (writeDossier → ANSWER.md → runVerify), exactly like the pipeline. */
function makeVerifyRun(n: number): string {
  const dir = mkdtempSync(join(tmpdir(), "udoc-orch-"));
  const evidence = assignIds([{ source: "code", items: codeItems(n), notes: [] }]);
  writeDossier(dir, evidence, dossierMeta(n));
  const claims = evidence.map((e, i) => `- The retry helper number ${i + 1} doubles the delay on every attempt of the run [${e.id}].`);
  writeFileSync(join(dir, "ANSWER.md"), `# Answer\n\n${claims.join("\n")}\n`);
  runVerify(dir);
  return dir;
}

type DrillSize = "big" | "small" | "empty";
/** Adds an engine-written drill-plan.json (the writer `ask` uses) to a run dir. */
function addDrillPlan(dir: string, size: DrillSize): void {
  const opts = {
    big: {
      question: 'why does `retryBackoff` throw "request timed out" after MAX_RETRIES?',
      askedSources: ["code", "issue", "pr", "docs"] as const,
    },
    small: {
      question: "how does the retry logic work?",
      askedSources: ["code", "docs", "release", "history", "issue", "pr", "discussion"] as const,
    },
    empty: {
      question: "how does the retry logic work?",
      askedSources: ["code", "docs", "release", "history", "issue", "pr", "discussion", "so", "web"] as const,
    },
  }[size];
  writeDrillPlan(dir, buildDrillPlan({ question: opts.question, repo: LIB, askedSources: [...opts.askedSources] }));
}

/** The common fixture: verify + drill worklists ready, doc not scaffolded. */
function makeRun(opts: { verify?: number; drill?: DrillSize } = {}): string {
  const dir = opts.verify !== undefined ? makeVerifyRun(opts.verify) : mkdtempSync(join(tmpdir(), "udoc-orch-"));
  if (opts.drill) addDrillPlan(dir, opts.drill);
  return dir;
}

const wf = (run: string, phase: string) => join(run, "orchestration", `${phase}.workflow.mjs`);
const readWf = (run: string, phase: string) => readFileSync(wf(run, phase), "utf8");
const stable = (src: string, run: string) => src.replaceAll(run, "<RUN>").replaceAll(ENGINE, "<ENGINE>");
const verifyIds = (run: string): string[] => {
  const todo = JSON.parse(readFileSync(join(run, "VERIFY.todo.json"), "utf8")) as { pairs: { claimId: string; evidenceId: string }[] };
  return todo.pairs.map((p) => `${p.claimId}:${p.evidenceId}`);
};

describe("orchestrate — listPhases", () => {
  it("reports all three phases not ready on an empty run, naming the producing command", () => {
    const run = makeRun();
    const phases = listPhases(run, ENGINE);
    expect(phases.map((p) => p.name)).toEqual(["drill", "verify", "doc"]);
    for (const p of phases) {
      expect(p.ready).toBe(false);
      expect(p.items).toBe(0);
      expect(p.prerequisite).toContain(ENGINE);
    }
    expect(phases[0]!.prerequisite).toContain("ask --repo");
    expect(phases[1]!.prerequisite).toContain("verify --run");
    expect(phases[2]!.prerequisite).toContain("doc --repo");
  });

  it("reports ready phases with real item counts and absolute worklist paths", () => {
    const run = makeRun({ verify: 5, drill: "big" });
    const phases = listPhases(run, ENGINE);
    const drill = phases.find((p) => p.name === "drill")!;
    const verify = phases.find((p) => p.name === "verify")!;
    const plan = JSON.parse(readFileSync(join(run, "drill-plan.json"), "utf8")) as { cells: unknown[] };
    expect(drill).toMatchObject({ ready: true, items: plan.cells.length });
    expect(verify).toMatchObject({ ready: true, items: 5 });
    expect(phases.find((p) => p.name === "doc")!.ready).toBe(false);
    for (const p of phases) expect(isAbsolute(p.worklist)).toBe(true);
  });
});

describe("orchestrate — emitted workflow", () => {
  it("emits one workflow per ready phase, plus contracts and the runbook", () => {
    const run = makeRun({ verify: 5, drill: "big" });
    const res = orchestrateRun(run, ENGINE);
    expect(res.exitCode).toBe(0);
    expect(existsSync(wf(run, "drill"))).toBe(true);
    expect(existsSync(wf(run, "verify"))).toBe(true);
    expect(existsSync(wf(run, "doc"))).toBe(false); // not scaffolded → not emitted
    expect(existsSync(join(run, "orchestration", "RUNBOOK.md"))).toBe(true);
    expect(existsSync(join(run, "orchestration", "agents", "explorer.md"))).toBe(true);
    expect(existsSync(join(run, "orchestration", "agents", "skeptic.md"))).toBe(true);
    expect(existsSync(join(run, "orchestration", "agents", "section-writer.md"))).toBe(true);
  });

  it("parses as JavaScript the way the Workflow harness evaluates it (meta export + async body)", () => {
    const run = makeRun({ verify: 5, drill: "big" });
    orchestrateRun(run, ENGINE);
    for (const phase of ["drill", "verify"]) {
      const [metaLine, ...body] = readWf(run, phase).split("\n");
      expect(() => new Script(metaLine!.replace("export const meta =", "const meta ="))).not.toThrow();
      expect(() => new Script(`(async () => {\n${body.join("\n")}\n})`)).not.toThrow();
    }
  });

  it("meta is a pure JSON literal on line 1 (name, description, phases)", () => {
    const run = makeRun({ verify: 5 });
    orchestrateRun(run, ENGINE);
    const first = readWf(run, "verify").split("\n")[0]!;
    expect(first.startsWith("export const meta = ")).toBe(true);
    const meta = JSON.parse(first.replace("export const meta = ", "")) as { name: string; description: string; phases: unknown[] };
    expect(meta.name).toBe("ultradoc-verify");
    expect(meta.description.length).toBeGreaterThan(0);
    expect(Array.isArray(meta.phases)).toBe(true);
  });

  it("never contains Date.now / Math.random / new Date (forbidden under the Workflow tool)", () => {
    const run = makeRun({ verify: 5, drill: "big" });
    orchestrateRun(run, ENGINE);
    for (const phase of ["drill", "verify"]) {
      const src = readWf(run, phase);
      expect(src).not.toContain("Date.now(");
      expect(src).not.toContain("Math.random(");
      expect(src).not.toContain("new Date(");
    }
  });

  it("injects absolute RUN/ENGINE/WORKLIST constants matching the run", () => {
    const run = makeRun({ verify: 2 });
    orchestrateRun(run, ENGINE);
    const src = readWf(run, "verify");
    for (const name of ["RUN", "ENGINE", "WORKLIST"]) {
      const m = src.match(new RegExp(`const ${name} = "([^"]+)"`));
      expect(m, `const ${name} missing`).not.toBeNull();
      expect(isAbsolute(m![1]!)).toBe(true);
    }
    expect(src).toContain(JSON.stringify(join(run, "VERIFY.todo.json")));
    expect(src).toContain(JSON.stringify(ENGINE));
  });

  it("injects the REAL current worklist ids — a doctored worklist shows up on re-emit", () => {
    const run = makeRun({ verify: 4 });
    orchestrateRun(run, ENGINE);
    for (const id of verifyIds(run)) expect(readWf(run, "verify")).toContain(id);
    expect(readWf(run, "verify")).not.toContain("C99:E99");
    const todoPath = join(run, "VERIFY.todo.json");
    const todo = JSON.parse(readFileSync(todoPath, "utf8")) as { pairs: Record<string, unknown>[] };
    todo.pairs.push({ ...todo.pairs[0]!, claimId: "C99", evidenceId: "E99" });
    writeFileSync(todoPath, JSON.stringify(todo, null, 2));
    orchestrateRun(run, ENGINE);
    expect(readWf(run, "verify")).toContain("C99:E99");
  });

  it("is deterministic — two runs over the same state emit byte-identical artifacts", () => {
    const run = makeRun({ verify: 5, drill: "big" });
    orchestrateRun(run, ENGINE);
    const snapshot = () => ["drill", "verify"].map((p) => readWf(run, p)).join("\0") + readFileSync(join(run, "orchestration", "RUNBOOK.md"), "utf8");
    const first = snapshot();
    orchestrateRun(run, ENGINE);
    expect(snapshot()).toBe(first);
  });

  it("batches large worklists and dispatches one agent per batch", () => {
    const run = makeRun({ verify: 20 });
    orchestrateRun(run, ENGINE);
    const src = readWf(run, "verify");
    const m = src.match(/const BATCHES = (\[.*?\])\n/s);
    expect(m).not.toBeNull();
    const batches = JSON.parse(m![1]!) as string[][];
    expect(batches.length).toBe(Math.ceil(20 / BATCH_SIZE));
    expect(batches.flat().length).toBe(20);
    expect(batches.flat()).toEqual(verifyIds(run));
    expect(src).toContain("pipeline(BATCHES");
    expect(src).toContain("agentType: 'general-purpose'");
    expect(src).toContain("schema: SCHEMA");
  });

  it("small worklist (≤ SMALL_WORKLIST) → single agent + an eco notice", () => {
    const run = makeRun({ verify: 2 });
    const res = orchestrateRun(run, ENGINE);
    const m = readWf(run, "verify").match(/const BATCHES = (\[.*?\])\n/s);
    expect((JSON.parse(m![1]!) as string[][]).length).toBe(1);
    expect(res.notices.some((n) => n.includes("--eco"))).toBe(true);
    expect(SMALL_WORKLIST).toBeLessThan(BATCH_SIZE);
  });

  it("an empty worklist is skipped with a notice, not emitted", () => {
    const run = makeRun({ verify: 2, drill: "empty" });
    const res = orchestrateRun(run, ENGINE);
    expect(res.exitCode).toBe(0);
    expect(existsSync(wf(run, "drill"))).toBe(false);
    expect(existsSync(wf(run, "verify"))).toBe(true);
    expect(res.notices.some((n) => n.includes("drill") && n.includes("empty"))).toBe(true);
  });

  it("every contract('<role>') referenced by a workflow has its agents/<role>.md", () => {
    const run = makeRun({ verify: 5, drill: "big" });
    orchestrateRun(run, ENGINE);
    const agents = readdirSync(join(run, "orchestration", "agents")).map((f) => f.replace(/\.md$/, ""));
    for (const phase of ["drill", "verify"]) {
      const refs = [...readWf(run, phase).matchAll(/contract\('([a-z-]+)'/g)].map((m) => m[1]!);
      expect(refs.length).toBeGreaterThan(0);
      for (const r of refs) expect(agents).toContain(r);
    }
  });

  it("workflows return fragments and never contain a write step (--apply stays with the orchestrator)", () => {
    const run = makeRun({ verify: 5, drill: "big" });
    orchestrateRun(run, ENGINE);
    for (const phase of ["drill", "verify"]) {
      const src = readWf(run, phase);
      expect(src).toMatch(/^return \{/m);
      // --apply may appear only in comments (the orchestrator's next step), never as executed code.
      const code = src
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      expect(code).not.toContain("--apply");
    }
  });

  it("the drill workflow fans out the plan's real cell ids to the explorer", () => {
    const run = makeRun({ drill: "big" });
    orchestrateRun(run, ENGINE);
    const src = readWf(run, "drill");
    const plan = JSON.parse(readFileSync(join(run, "drill-plan.json"), "utf8")) as { cells: { id: string }[] };
    const m = src.match(/const BATCHES = (\[.*?\])\n/s);
    expect((JSON.parse(m![1]!) as string[][]).flat()).toEqual(plan.cells.map((c) => c.id));
    expect(src).toContain("contract('explorer'");
    expect(src).toContain("'ITEMS=' + batch.join(',')");
  });
});

describe("orchestrate — doc phase (real doc scaffold)", () => {
  let docRun: string;
  beforeAll(async () => {
    // A private copy of the fixture so this suite never races others on the
    // shared <fixture>/.ultradoc cache dir.
    const root = mkdtempSync(join(tmpdir(), "udoc-orch-doc-"));
    const lib = join(root, "sample-lib");
    cpSync(LIB, lib, { recursive: true });
    docRun = join(root, "doc-run");
    globalThis.fetch = (async () => {
      throw new Error("network disabled in tests");
    }) as typeof fetch;
    await runDoc({
      repo: lib,
      question: "",
      sources: ["code", "docs"],
      out: docRun,
      semantic: false,
      webEngine: "auto",
      perSource: 6,
      json: false,
      refresh: false,
    });
    globalThis.fetch = realFetch;
  }, 60_000);

  it("lists the doc phase ready with the plan's real section ids", () => {
    const phases = listPhases(docRun, ENGINE);
    const doc = phases.find((p) => p.name === "doc")!;
    const plan = JSON.parse(readFileSync(join(docRun, "DOC.plan.json"), "utf8")) as { sections: { id: string }[] };
    expect(doc.ready).toBe(true);
    expect(doc.items).toBe(plan.sections.length);
    expect(doc.ids).toEqual(plan.sections.map((s) => s.id));
    expect(doc.worklist).toBe(join(docRun, "DOC.plan.json"));
  });

  it("emits a harness-parseable doc workflow dispatching the section-writer", () => {
    const res = orchestrateRun(docRun, ENGINE, { phase: "doc" });
    expect(res.exitCode).toBe(0);
    const src = readWf(docRun, "doc");
    const [metaLine, ...body] = src.split("\n");
    expect(JSON.parse(metaLine!.replace("export const meta = ", "")).name).toBe("ultradoc-doc");
    expect(() => new Script(`(async () => {\n${body.join("\n")}\n})`)).not.toThrow();
    expect(src).toContain("contract('section-writer'");
    expect(src).toContain(JSON.stringify(join(docRun, "DOC.plan.json")));
    expect(src).not.toContain("Date.now(");
  });
});

describe("orchestrate — contracts & runbook", () => {
  it("every emitted contract carries the one-writer footer and returns structured output", () => {
    const run = makeRun({ verify: 2, drill: "big" });
    orchestrateRun(run, ENGINE);
    const dir = join(run, "orchestration", "agents");
    const files = readdirSync(dir);
    expect(files.sort()).toEqual(["explorer.md", "section-writer.md", "skeptic.md"]);
    for (const f of files) {
      const md = readFileSync(join(dir, f), "utf8");
      expect(md).toContain("Return, don't write");
      expect(md).toContain("The orchestrator is the sole writer");
      expect(md).toContain("orchestration/out/");
    }
  });

  it("skeptic encodes the adversarial verdicts; explorer the lean-return triage contract", () => {
    const run = makeRun({ verify: 2, drill: "big" });
    orchestrateRun(run, ENGINE);
    const skeptic = readFileSync(join(run, "orchestration", "agents", "skeptic.md"), "utf8");
    for (const v of ["supported", "partial", "refuted", "unsupported"]) expect(skeptic).toContain(v);
    expect(skeptic).toMatch(/HARSHER/i);
    expect(skeptic).toMatch(/cross-check/i);
    const explorer = readFileSync(join(run, "orchestration", "agents", "explorer.md"), "utf8");
    expect(explorer).toMatch(/max ~?8/i);
    expect(explorer).toMatch(/never return the raw dossier/i);
    expect(explorer).toContain("drill-plan.json");
    const writer = readFileSync(join(run, "orchestration", "agents", "section-writer.md"), "utf8");
    expect(writer).toContain("[E#]");
    expect(writer).toContain("DOC.md");
  });

  it("the runbook covers every phase with concrete paths and the phase status", () => {
    const run = makeRun({ verify: 5 });
    orchestrateRun(run, ENGINE);
    const rb = readFileSync(join(run, "orchestration", "RUNBOOK.md"), "utf8");
    expect(rb).toContain(join(run, "VERIFY.todo.json"));
    expect(rb).toContain(join(run, "drill-plan.json"));
    expect(rb).toContain(join(run, "DOC.plan.json"));
    expect(rb).toContain("verify --apply");
    expect(rb).toContain(ENGINE);
    for (const role of ["explorer.md", "skeptic.md", "section-writer.md"]) expect(rb).toContain(role);
  });

  it("golden shape (paths normalized)", () => {
    const run = makeRun({ verify: 4, drill: "big" });
    orchestrateRun(run, ENGINE);
    expect(stable(readWf(run, "verify"), run)).toMatchSnapshot("verify.workflow.mjs");
    expect(stable(readFileSync(join(run, "orchestration", "agents", "skeptic.md"), "utf8"), run)).toMatchSnapshot("skeptic.md");
    expect(stable(readFileSync(join(run, "orchestration", "RUNBOOK.md"), "utf8"), run)).toMatchSnapshot("RUNBOOK.md");
  });
});

describe("orchestrate — eco mode & phase gating", () => {
  it("--eco emits RUNBOOK + contracts only, no workflow scripts", () => {
    const run = makeRun({ verify: 5, drill: "big" });
    const res = orchestrateRun(run, ENGINE, { eco: true });
    expect(res.exitCode).toBe(0);
    expect(existsSync(join(run, "orchestration", "RUNBOOK.md"))).toBe(true);
    expect(existsSync(join(run, "orchestration", "agents", "skeptic.md"))).toBe(true);
    expect(existsSync(wf(run, "drill"))).toBe(false);
    expect(existsSync(wf(run, "verify"))).toBe(false);
  });

  it("--phase on a not-ready phase exits 2 and names the producing command", () => {
    const run = makeRun({ drill: "big" });
    const res = orchestrateRun(run, ENGINE, { phase: "verify" });
    expect(res.exitCode).toBe(2);
    expect(res.errors.some((e) => e.includes("verify --run"))).toBe(true);
    expect(existsSync(wf(run, "verify"))).toBe(false);
  });

  it("--phase restricts emission to that phase", () => {
    const run = makeRun({ verify: 5, drill: "big" });
    const res = orchestrateRun(run, ENGINE, { phase: "verify" });
    expect(res.exitCode).toBe(0);
    expect(existsSync(wf(run, "verify"))).toBe(true);
    expect(existsSync(wf(run, "drill"))).toBe(false);
  });

  it("an unknown phase exits 2 naming the valid ones", () => {
    const run = makeRun({ verify: 2 });
    const res = orchestrateRun(run, ENGINE, { phase: "nope" });
    expect(res.exitCode).toBe(2);
    expect(res.errors.some((e) => PHASES.every((p) => e.includes(p)))).toBe(true);
  });

  it("a missing run dir exits 2", () => {
    const res = orchestrateRun(join(tmpdir(), "udoc-does-not-exist-xyz"), ENGINE);
    expect(res.exitCode).toBe(2);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

// In-process CLI harness (same pattern as e2e-commands.test.ts): capture
// stdout/stderr and translate process.exit into an inspectable code.
class ExitSignal extends Error {
  constructor(public code: number) {
    super(`exit:${code}`);
  }
}
async function runCli(argv: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  const origExit = process.exit;
  let exitCode = 0;
  process.stdout.write = ((c: unknown) => {
    out.push(String(c));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((c: unknown) => {
    err.push(String(c));
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number) => {
    throw new ExitSignal(code ?? 0);
  }) as typeof process.exit;
  try {
    await run(argv);
  } catch (e) {
    if (e instanceof ExitSignal) exitCode = e.code;
    else throw e;
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    process.exit = origExit;
  }
  return { stdout: out.join(""), stderr: err.join(""), exitCode };
}

describe("orchestrate — CLI wiring", () => {
  it("orchestrate without --run exits 2", async () => {
    const r = await runCli(["orchestrate"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/--run/);
  });

  it("orchestrate --run <dir> --list prints the phases JSON and exits 0", async () => {
    const run = makeRun({ verify: 2 });
    const r = await runCli(["orchestrate", "--run", run, "--list"]);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout) as { phases: { name: string; ready: boolean }[] };
    expect(parsed.phases.map((p) => p.name)).toEqual([...PHASES]);
  });

  it("a full run emits and exits 0; --eco emits no workflow", async () => {
    const run = makeRun({ verify: 5 });
    const r = await runCli(["orchestrate", "--run", run]);
    expect(r.exitCode).toBe(0);
    expect(existsSync(wf(run, "verify"))).toBe(true);
    const eco = makeRun({ verify: 5 });
    const r2 = await runCli(["orchestrate", "--run", eco, "--eco"]);
    expect(r2.exitCode).toBe(0);
    expect(existsSync(wf(eco, "verify"))).toBe(false);
    expect(existsSync(join(eco, "orchestration", "RUNBOOK.md"))).toBe(true);
  });

  it("orchestrate --run <missing dir> exits 2", async () => {
    const r = await runCli(["orchestrate", "--run", join(tmpdir(), "udoc-does-not-exist-xyz")]);
    expect(r.exitCode).toBe(2);
  });
});

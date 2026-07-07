import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runVerify, applyVerdicts } from "../src/verify.js";
import { checkRun } from "../src/check.js";
import type { EvidenceItem } from "../src/types.js";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "ud-verify-"));
}

function dossier(dir: string, evidence: EvidenceItem[], answer: string): void {
  writeFileSync(join(dir, "evidence.json"), JSON.stringify(evidence, null, 2));
  writeFileSync(join(dir, "ANSWER.md"), answer);
}

const EVIDENCE: EvidenceItem[] = [
  { id: "E1", source: "code", title: "retry.ts", ref: "src/retry.ts", score: 1, snippet: "exponential backoff doubles the delay each attempt" },
  { id: "E2", source: "docs", title: "README", ref: "README.md", score: 0.8, snippet: "the client retries idempotent requests" },
];

const ANSWER = `# Retries
## Mechanism
The client uses exponential backoff that doubles each attempt [E1].
## Scope
Only idempotent requests are retried [E2].`;

// Fill the worklist verdicts by evidenceId and apply them.
function writeVerdicts(dir: string, map: Record<string, string>): string {
  const todo = JSON.parse(readFileSync(join(dir, "VERIFY.todo.json"), "utf8"));
  const pairs = todo.pairs.map((p: any) => ({ ...p, verdict: map[p.evidenceId] ?? "supported", note: "" }));
  const f = join(dir, "verdicts.json");
  writeFileSync(f, JSON.stringify({ pairs }));
  return f;
}

describe("runVerify (worklist)", () => {
  it("extracts one claim↔evidence pair per cited [E#] and writes the worklist", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    const r = runVerify(dir);
    expect(r.pairs.length).toBe(2);
    expect(r.pairs.map((p) => p.evidenceId).sort()).toEqual(["E1", "E2"]);
    expect(r.pairs[0]!.digest.length).toBeGreaterThan(0);
    expect(r.pairs.map((p) => p.claimId)).toEqual(["C1", "C2"]);
    expect(existsSync(join(dir, "VERIFY.todo.json"))).toBe(true);
    expect(existsSync(join(dir, "VERIFY.md"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("ignores a [E#] hidden in inline code (parser hardening)", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, "# X\nA real grounded claim about backoff here [E1].\n\nA line mentioning `[E2]` only in code.");
    const r = runVerify(dir);
    expect(r.pairs.map((p) => p.evidenceId)).toEqual(["E1"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists uncited claims in the worklist without adding pairs", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, "# X\n## A\nThe client uses exponential backoff [E1].\n## B\nThis whole sentence has no citation whatsoever here.");
    const r = runVerify(dir);
    expect(r.pairs.map((p) => p.evidenceId)).toEqual(["E1"]);
    expect(r.uncitedClaims.length).toBe(1);
    expect(r.uncitedClaims[0]!.claim).toMatch(/no citation whatsoever/);
    const md = readFileSync(join(dir, "VERIFY.md"), "utf8");
    expect(md).toMatch(/Uncited claims/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("caps the worklist at maxVerify", () => {
    const dir = scratch();
    const ev: EvidenceItem[] = [0, 1, 2].map((i) => ({
      id: `E${i + 1}`,
      source: "code",
      title: `f${i}`,
      ref: `f${i}.ts`,
      score: 1 - i * 0.1,
      snippet: `snippet ${i}`,
    }));
    dossier(dir, ev, "# X\n## A\nClaim one here [E1].\n## B\nClaim two here [E2].\n## C\nClaim three here [E3].");
    const r = runVerify(dir, { maxVerify: 2 });
    expect(r.pairs.length).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("applyVerdicts (semantic gate)", () => {
  function setup(): string {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    runVerify(dir);
    return dir;
  }

  it("passes when every claim has a supporting evidence item", () => {
    const dir = setup();
    const r = applyVerdicts(dir, writeVerdicts(dir, { E1: "supported", E2: "partial" }));
    expect(r.ok).toBe(true);
    expect(existsSync(join(dir, "VERIFY.json"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when a cited evidence item refutes the claim", () => {
    const dir = setup();
    const r = applyVerdicts(dir, writeVerdicts(dir, { E1: "refuted", E2: "supported" }));
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.verdict === "refuted")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when a claim's only cited evidence is unsupported", () => {
    const dir = setup();
    const r = applyVerdicts(dir, writeVerdicts(dir, { E1: "unsupported", E2: "supported" }));
    expect(r.ok).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("check --semantic composition", () => {
  it("folds VERIFY.json into the gate: plain check passes, semantic fails", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    runVerify(dir);
    expect(checkRun(dir).ok).toBe(true); // mechanical passes
    applyVerdicts(dir, writeVerdicts(dir, { E1: "unsupported", E2: "supported" }));
    const sem = checkRun(dir, { semantic: true });
    expect(sem.ok).toBe(false);
    expect(sem.semantic?.ok).toBe(false);
    expect(checkRun(dir).ok).toBe(true); // plain check unchanged
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs the full verify→apply→check --semantic gate on a DOC.md (the `doc` flow)", () => {
    const dir = scratch();
    // A `doc` run writes DOC.md, not ANSWER.md — verify/check must auto-detect it.
    writeFileSync(join(dir, "evidence.json"), JSON.stringify(EVIDENCE, null, 2));
    writeFileSync(join(dir, "DOC.md"), ANSWER);
    const wl = runVerify(dir);
    expect(wl.pairs.map((p) => p.evidenceId).sort()).toEqual(["E1", "E2"]);
    expect(checkRun(dir).ok).toBe(true); // mechanical passes on DOC.md
    applyVerdicts(dir, writeVerdicts(dir, { E1: "refuted", E2: "supported" }));
    expect(checkRun(dir, { semantic: true }).ok).toBe(false); // semantic catches the refuted claim
    rmSync(dir, { recursive: true, force: true });
  });

  it("warns (does not fail) when --semantic is set but no VERIFY.json exists", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    const r = checkRun(dir, { semantic: true });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ").toLowerCase()).toContain("verify");
    rmSync(dir, { recursive: true, force: true });
  });
});

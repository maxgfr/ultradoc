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

  // Behavior claims grounded in an issue/PR must be checked against CURRENT
  // code — a closed issue can describe behavior a later release reversed.
  it("marks issue/PR-grounded pairs for a current-source cross-check", () => {
    const dir = scratch();
    const ev: EvidenceItem[] = [
      { id: "E1", source: "code", title: "retry.ts", ref: "src/retry.ts", score: 1, snippet: "backoff doubles" },
      { id: "E2", source: "issue", title: "null callback throws", ref: "issue#36", score: 0.9, snippet: "passing null throws a TypeError" },
    ];
    dossier(dir, ev, "# X\nThe backoff doubles each attempt [E1].\n\nPassing a null callback throws a TypeError [E2].");
    const r = runVerify(dir);
    const byId = new Map(r.pairs.map((p) => [p.evidenceId, p] as const));
    expect(byId.get("E2")!.crossCheck).toBe(true);
    expect(byId.get("E1")!.crossCheck).toBeUndefined();
    const md = readFileSync(join(dir, "VERIFY.md"), "utf8");
    expect(md).toMatch(/cross-check against CURRENT code/i);
    const todo = JSON.parse(readFileSync(join(dir, "VERIFY.todo.json"), "utf8"));
    expect(todo.pairs.find((p: any) => p.evidenceId === "E2").crossCheck).toBe(true);
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

  // Gate-integrity fail-open (adversarial review): check --semantic re-reduced
  // the stored verdicts[] but never confirmed they belong to the CURRENT answer.
  // A claim ADDED after `verify --apply` (a stale ledger) therefore slipped the
  // gate — it had no verdict, and the old verdicts still reduced to ok. The
  // VERIFY.json must be BOUND to the exact answer it adjudicated.
  it("fails closed when a claim is added to the answer after verify (stale ledger)", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    runVerify(dir);
    applyVerdicts(dir, writeVerdicts(dir, { E1: "supported", E2: "supported" }));
    expect(checkRun(dir, { semantic: true }).ok).toBe(true); // the verified answer passes
    // Append a NEW claim citing a real, resolvable evidence id — but do NOT re-verify.
    writeFileSync(join(dir, "ANSWER.md"), `${ANSWER}\n## Extra\nBackoff was later removed entirely [E1].`);
    const r = checkRun(dir, { semantic: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/answer|stale|changed|different|re-run verify/i);
    // --allow-unverified is the explicit escape hatch, mirroring the missing-VERIFY case.
    expect(checkRun(dir, { semantic: true, allowUnverified: true }).ok).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails closed when a verified claim's meaning is flipped but its citation kept", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    runVerify(dir);
    applyVerdicts(dir, writeVerdicts(dir, { E1: "supported", E2: "supported" }));
    expect(checkRun(dir, { semantic: true }).ok).toBe(true);
    // Reverse C1's claim while keeping [E1] — the recorded "supported" verdict is now stale.
    const flipped = ANSWER.replace("uses exponential backoff that doubles each attempt", "never uses backoff and retries instantly");
    expect(flipped).not.toBe(ANSWER);
    writeFileSync(join(dir, "ANSWER.md"), flipped);
    expect(checkRun(dir, { semantic: true }).ok).toBe(false);
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

  // BREAKING (v2): --semantic without VERIFY.json used to warn and exit 0 — a
  // green exit while the support gate was silently inactive. It now fails
  // closed; --allow-unverified restores the warn-and-pass explicitly.
  it("fails closed when --semantic is set but no VERIFY.json exists", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    const r = checkRun(dir, { semantic: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/VERIFY\.json/);
    expect(r.errors.join(" ")).toMatch(/--allow-unverified/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("--allow-unverified downgrades a missing VERIFY.json to a warning", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    const r = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ").toLowerCase()).toContain("verify");
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails closed when VERIFY.json is unreadable", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    writeFileSync(join(dir, "VERIFY.json"), "{ not json");
    const r = checkRun(dir, { semantic: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/unreadable/i);
    rmSync(dir, { recursive: true, force: true });
  });

  // Family P0-1: the gate must re-reduce ok from verdicts[], never trust the
  // persisted summary — a doctored `ok: true` over refuted verdicts cannot pass.
  it("re-reduces the gate from verdicts[] — a doctored ok:true cannot pass", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    runVerify(dir);
    applyVerdicts(dir, writeVerdicts(dir, { E1: "refuted", E2: "supported" }));
    const doctored = JSON.parse(readFileSync(join(dir, "VERIFY.json"), "utf8"));
    doctored.ok = true;
    doctored.failures = [];
    doctored.refuted = 0;
    writeFileSync(join(dir, "VERIFY.json"), JSON.stringify(doctored, null, 2));
    const r = checkRun(dir, { semantic: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/refuted or unsupported/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("treats a VERIFY.json without verdicts[] as unverified (fail-closed)", () => {
    const dir = scratch();
    dossier(dir, EVIDENCE, ANSWER);
    writeFileSync(
      join(dir, "VERIFY.json"),
      JSON.stringify({ ok: true, pairs: 2, adjudicated: 2, supported: 2, partial: 0, refuted: 0, unsupported: 0, failures: [], unadjudicated: [] }),
    );
    expect(checkRun(dir, { semantic: true }).ok).toBe(false);
    const relaxed = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(relaxed.ok).toBe(true);
    expect(relaxed.warnings.join(" ").toLowerCase()).toContain("verdict");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("applyVerdicts — fail-closed fold (orchestrate-round review)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ud-apply-"));
  const row = (over: Record<string, unknown> = {}) => ({
    claimId: "C1",
    claim: "x",
    evidenceId: "E1",
    ref: "src/a.ts:1",
    source: "code",
    digest: "d",
    verdict: "supported",
    note: "ok",
    ...over,
  });
  const save = (data: unknown) => {
    const p = join(dir, `verdicts-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(p, JSON.stringify(data));
    return p;
  };

  it("accepts the emitted skeptic fragment key { verdicts: [...] }", () => {
    const r = applyVerdicts(dir, save({ verdicts: [row()] }));
    expect(r.supported).toBe(1);
  });

  it("hard-errors on an empty or key-less verdicts file instead of passing 0/0", () => {
    expect(() => applyVerdicts(dir, save({ verdicts: [] }))).toThrow(/no verdict rows/i);
    expect(() => applyVerdicts(dir, save({ something: [row()] }))).toThrow(/no verdict rows/i);
  });

  it("hard-errors on an invalid verdict token instead of silently unadjudicating it", () => {
    expect(() => applyVerdicts(dir, save({ pairs: [row({ verdict: "REFUTED!!" })] }))).toThrow(/invalid verdict/i);
  });

  it("hard-errors when rows are dropped for missing ids", () => {
    expect(() => applyVerdicts(dir, save({ pairs: [row(), { verdict: "supported" }] }))).toThrow(/missing claimId/i);
  });

  it("a null/absent verdict stays a legitimate unadjudicated row (not an error)", () => {
    const r = applyVerdicts(dir, save({ pairs: [row({ verdict: null })] }));
    expect(r.unadjudicated.length).toBeGreaterThan(0);
  });
});

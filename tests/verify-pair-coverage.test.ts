import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyVerdicts, runVerify, VERIFY_MAX } from "../src/verify.js";
import { checkRun } from "../src/check.js";
import type { EvidenceItem, Verdict } from "../src/types.js";

// `check --semantic`'s coverage gate compared the worklist's expected CLAIM ids
// against the ledger's adjudicated claim ids. A claim citing [E1] [E2] therefore
// counted as covered once E1 alone was adjudicated — the E2 row (the one that
// refutes it) could simply be dropped and the gate stayed green. Coverage must
// be per (claimId, evidenceId) PAIR, and only a valid verdict token counts.

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "ud-paircov-"));
}

const EVIDENCE: EvidenceItem[] = [
  { id: "E1", source: "web", title: "Retry guide", ref: "https://example.org/retry", score: 1, snippet: "The client always retries connection errors." },
  {
    id: "E2",
    source: "code",
    title: "client.ts",
    ref: "src/client.ts",
    score: 0.9,
    snippet: "connection errors are retried only when the request is idempotent",
  },
];

const CLAIM = "The client always retries connection errors. [E1] [E2]";
const ANSWER = `# Retry\n\n${CLAIM}\n`;

function dossier(): string {
  const dir = scratch();
  writeFileSync(join(dir, "evidence.json"), JSON.stringify(EVIDENCE, null, 2));
  writeFileSync(join(dir, "ANSWER.md"), ANSWER);
  runVerify(dir);
  return dir;
}

// Adjudicate the written worklist, mapping evidenceId → verdict. `null` drops the
// row entirely (the dropped-pair exploit); anything else is written verbatim.
function apply(dir: string, map: Record<string, string | null>): void {
  const todo = JSON.parse(readFileSync(join(dir, "VERIFY.todo.json"), "utf8"));
  const pairs = todo.pairs
    .filter((p: { evidenceId: string }) => map[p.evidenceId] !== null)
    .map((p: Record<string, unknown>) => ({ ...p, verdict: map[p.evidenceId as never] ?? "supported", note: "adjudicated" }));
  const f = join(dir, "verdicts.json");
  writeFileSync(f, JSON.stringify({ pairs }));
  applyVerdicts(dir, f);
}

// Rewrite the persisted ledger's verdict rows in place — the hand-tamper path
// `applyVerdicts`'s row validation never sees.
function tamper(dir: string, fn: (rows: Verdict[]) => Verdict[]): void {
  const p = join(dir, "VERIFY.json");
  const j = JSON.parse(readFileSync(p, "utf8"));
  j.verdicts = fn(j.verdicts as Verdict[]);
  writeFileSync(p, JSON.stringify(j, null, 2));
}

const gate = (dir: string) => checkRun(dir, { semantic: true, strict: true });

describe("check --semantic coverage is per claim↔evidence PAIR", () => {
  it("retains a supplied current refutation beyond the required coverage cap", () => {
    const dir = scratch();
    const evidence = Array.from({ length: VERIFY_MAX + 1 }, (_, i) => ({ ...EVIDENCE[0]!, id: `E${i + 1}`, score: VERIFY_MAX + 1 - i }));
    writeFileSync(join(dir, "evidence.json"), JSON.stringify(evidence));
    writeFileSync(join(dir, "ANSWER.md"), `${CLAIM.split(" [E1]")[0]} ${evidence.map((e) => `[${e.id}]`).join(" ")}`);
    const worklist = runVerify(dir, { maxVerify: VERIFY_MAX + 1 });
    const file = join(dir, "verdicts.json");
    writeFileSync(file, JSON.stringify(worklist.pairs.map((p) => ({ ...p, verdict: p.evidenceId === `E${VERIFY_MAX + 1}` ? "refuted" : "supported" }))));
    applyVerdicts(dir, file);
    expect(gate(dir).ok).toBe(false);
    expect(gate(dir).errors.join(" ")).toMatch(/refuted or unsupported/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("a foreign supporting row cannot rescue unsupported current pairs", () => {
    const dir = dossier();
    apply(dir, { E1: "unsupported", E2: "unsupported" });
    tamper(dir, (rows) => [...rows, { ...rows[0]!, evidenceId: "E9", verdict: "supported" }]);
    expect(gate(dir).ok).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("GREEN: passes when every cited pair of the claim is adjudicated", () => {
    const dir = dossier();
    apply(dir, { E1: "supported", E2: "supported" });
    const r = gate(dir);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("RED: fails when the claim's second cited pair (C1,E2) is dropped from the ledger", () => {
    const dir = dossier();
    apply(dir, { E1: "supported", E2: null });
    const r = gate(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/E2/);
    expect(r.errors.join(" ")).toMatch(/adjudicat/i);
    // The mechanical gate alone stays green — this is an additive semantic rule.
    expect(checkRun(dir, { strict: true }).ok).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("RED: fails when (C1,E2) is adjudicated `refuted` (the dropped row's real verdict)", () => {
    const dir = dossier();
    apply(dir, { E1: "supported", E2: "refuted" });
    const r = gate(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/refuted or unsupported/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("RED: a foreign evidenceId cannot stand in for the expected pair", () => {
    const dir = dossier();
    apply(dir, { E1: "supported", E2: "supported" });
    // Relabel C1's E2 row to an evidence id the answer never cites: the pair
    // count is unchanged, but (C1,E2) is no longer adjudicated.
    tamper(dir, (rows) => rows.map((v) => (v.evidenceId === "E2" ? { ...v, evidenceId: "E9" } : v)));
    const r = gate(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/E2/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("RED: a row filed under the wrong claimId cannot cover the expected pair", () => {
    const dir = dossier();
    apply(dir, { E1: "supported", E2: "supported" });
    tamper(dir, (rows) => rows.map((v) => (v.evidenceId === "E2" ? { ...v, claimId: "C7" } : v)));
    const r = gate(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/C1/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("RED: an invalid (truthy) verdict token does not count as adjudicated", () => {
    const dir = dossier();
    apply(dir, { E1: "supported", E2: "supported" });
    tamper(dir, (rows) => rows.map((v) => (v.evidenceId === "E2" ? { ...v, verdict: "SUPPORTED!!" as never } : v)));
    const r = gate(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/E2/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("RED: a null verdict token does not count as adjudicated", () => {
    const dir = dossier();
    apply(dir, { E1: "supported", E2: "supported" });
    tamper(dir, (rows) => rows.map((v) => (v.evidenceId === "E2" ? { ...v, verdict: null as never } : v)));
    const r = gate(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/E2/);
    rmSync(dir, { recursive: true, force: true });
  });
});

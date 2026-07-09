import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClaimEvidencePair, EvidenceItem, Verdict, VerdictKind, VerifyResult } from "./types.js";
import { extractClaimUnits, citedEvidenceIds, resolveAnswerPath } from "./check.js";
import { stripInlineCode } from "./citations.js";
import { LIMITS } from "./config.js";

// Bounds the verification loop (claim↔evidence pairs adjudicated per run).
export const VERIFY_MAX = LIMITS.verifyPairs;
const VALID_VERDICTS: VerdictKind[] = ["supported", "partial", "refuted", "unsupported"];

export interface VerifyWorklist {
  run: string;
  pairs: ClaimEvidencePair[];
  uncitedClaims: { claimId: string; claim: string }[]; // claims with no citation — cite or delete
}

// Minimum length for an uncited claim to be worth flagging (mirrors the check
// coverage exemption for short transitions).
const MIN_UNCITED_LEN = 25;

// Flatten ANSWER.md's claim units into individual claim strings: a text unit is
// one claim; each list item is its own claim.
function claimStrings(text: string): string[] {
  const out: string[] = [];
  for (const u of extractClaimUnits(text)) {
    if (u.kind === "text") out.push(u.text);
    else for (const it of u.items) out.push(it);
  }
  return out;
}

// Phase A — build the claim↔evidence verification worklist. For every claim in
// ANSWER.md that cites a real evidence item, emit one pair per cited item with
// the item's snippet as the digest, so a skeptic agent judges whether the source
// actually SUPPORTS the claim. Deterministic; the JUDGEMENT is the agent's.
// Capped at maxVerify (highest-score evidence first). Writes VERIFY.todo.json
// (machine worklist) + VERIFY.md (human checklist).
export function runVerify(dir: string, opts: { maxVerify?: number; answerFile?: string } = {}): VerifyWorklist {
  const evidencePath = join(dir, "evidence.json");
  if (!existsSync(evidencePath)) throw new Error(`No evidence.json in ${dir} — run \`ultradoc ask\` first.`);
  const evidence: EvidenceItem[] = JSON.parse(readFileSync(evidencePath, "utf8"));
  const byId = new Map(evidence.map((e) => [e.id, e] as const));
  const answerPath = resolveAnswerPath(dir, opts.answerFile);
  if (!answerPath) throw new Error(`No ${opts.answerFile ?? "ANSWER.md or DOC.md"} in ${dir} — write the answer first.`);
  const answer = readFileSync(answerPath, "utf8");

  const pairs: (ClaimEvidencePair & { score: number })[] = [];
  const uncitedClaims: { claimId: string; claim: string }[] = [];
  let claimNo = 0;
  for (const claim of claimStrings(answer)) {
    const ids = citedEvidenceIds(claim, evidence);
    claimNo++;
    const claimId = `C${claimNo}`;
    if (!ids.length) {
      // An uncited claim can never be adjudicated (no evidence to weigh), so it
      // is not a verify pair — but surface it so it isn't silently accepted.
      // Length gates on the code-stripped form (mirrors claimCoverage).
      if (stripInlineCode(claim).trim().length >= MIN_UNCITED_LEN) uncitedClaims.push({ claimId, claim: claim.trim().slice(0, 400) });
      continue;
    }
    for (const id of ids) {
      const e = byId.get(id);
      if (!e) continue;
      pairs.push({
        claimId,
        claim: claim.trim().slice(0, 400),
        evidenceId: id,
        ref: e.ref,
        source: e.source,
        digest: (e.snippet || e.title || e.ref).slice(0, 600),
        ...(e.source === "issue" || e.source === "pr" ? { crossCheck: true } : {}),
        score: e.score,
      });
    }
  }

  // Cap deterministically: highest-score evidence first, stable by claim/id.
  const max = Math.max(1, Math.floor(opts.maxVerify ?? VERIFY_MAX));
  const kept =
    pairs.length > max
      ? pairs
          .slice()
          .sort((a, b) => b.score - a.score || a.claimId.localeCompare(b.claimId) || a.evidenceId.localeCompare(b.evidenceId))
          .slice(0, max)
      : pairs;
  const worklist: VerifyWorklist = { run: dir, pairs: kept.map(({ score, ...rest }) => rest), uncitedClaims };

  const todo = {
    run: dir,
    pairs: worklist.pairs.map((p) => ({ ...p, verdict: null as VerdictKind | null, note: "" })),
    uncitedClaims,
  };
  writeFileSync(join(dir, "VERIFY.todo.json"), JSON.stringify(todo, null, 2));
  writeFileSync(join(dir, "VERIFY.md"), renderWorklistMd(worklist, pairs.length, kept.length));
  return worklist;
}

function renderWorklistMd(wl: VerifyWorklist, total: number, kept: number): string {
  const out: string[] = [];
  out.push(`# Verification worklist`);
  out.push("");
  out.push(
    `For each pair, open the cited evidence and judge whether it **supports** the claim. ` +
      `In \`VERIFY.todo.json\`, set each \`verdict\` to one of supported · partial · refuted · unsupported, ` +
      `add a short \`note\`, save it (e.g. as \`verdicts.json\`), then run ` +
      `\`ultradoc verify --apply verdicts.json --run <dir>\`.`,
  );
  if (wl.pairs.some((p) => p.crossCheck)) {
    out.push("");
    out.push(
      `Pairs flagged **⚠ cross-check** are grounded in an issue/PR — a tracker thread describes ` +
        `behavior at a point in time. Judge them by cross-check against CURRENT code: if the current ` +
        `source contradicts the claim, mark it refuted (or partial with a temporal qualifier citing the fixing release).`,
    );
  }
  if (kept < total) out.push(`\n_Showing ${kept} of ${total} pair(s) — capped at the highest-score evidence._`);
  out.push("");
  for (const p of wl.pairs) {
    out.push(`## ${p.claimId} · ${p.evidenceId} (${p.source} · ${p.ref})${p.crossCheck ? " · ⚠ cross-check" : ""}`);
    out.push(`**Claim:** ${p.claim}`);
    out.push(`**Cited evidence:** ${p.digest}`);
    out.push(`**Verdict:** _____ · **Note:** _____`);
    out.push("");
  }
  if (wl.uncitedClaims.length) {
    out.push(`## Uncited claims — cite or delete`);
    out.push("");
    out.push(`These claim(s) cite no evidence, so verify cannot adjudicate them. Cite an evidence id or remove the claim (\`check\` fails on low coverage):`);
    out.push("");
    for (const u of wl.uncitedClaims) out.push(`- **${u.claimId}:** ${u.claim}`);
    out.push("");
  }
  return out.join("\n");
}

// Phase B — read an agent-filled verdicts file (a `{ pairs: Verdict[] }` object,
// a `{ verdicts: Verdict[] }` object — the shape the orchestrate-emitted skeptic
// fragments return — or a bare `Verdict[]` array), validate it FAIL-CLOSED,
// reduce it to a VerifyResult, and persist VERIFY.json (the gate result + the
// full list, which `check --semantic` and `render` read).
export function applyVerdicts(dir: string, verdictsPath: string): VerifyResult {
  if (!existsSync(verdictsPath)) {
    throw new Error(`No verdicts file at ${verdictsPath} — adjudicate VERIFY.todo.json and save it as verdicts.json first.`);
  }
  const raw = JSON.parse(readFileSync(verdictsPath, "utf8"));
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.pairs) ? raw.pairs : Array.isArray(raw?.verdicts) ? raw.verdicts : [];
  // Fail closed: a file that yields no rows means the fold never engaged —
  // exiting green here would silently discard the whole adjudication.
  if (list.length === 0) {
    throw new Error(`${verdictsPath}: no verdict rows found — expected a bare array, { pairs: [...] } or { verdicts: [...] } with at least one row.`);
  }
  const problems: string[] = [];
  const verdicts: Verdict[] = [];
  for (const [i, v] of (list as any[]).entries()) {
    if (!v || typeof v.claimId !== "string" || typeof v.evidenceId !== "string") {
      problems.push(`row ${i + 1}: missing claimId/evidenceId`);
      continue;
    }
    // An explicit-but-unknown token is a typo, not an un-adjudication: hard-error
    // beats silently downgrading a "REFUTED!!" to a warning-level unadjudicated.
    if (v.verdict != null && !VALID_VERDICTS.includes(v.verdict)) {
      problems.push(`row ${i + 1} (${v.claimId}:${v.evidenceId}): invalid verdict "${String(v.verdict)}" — expected ${VALID_VERDICTS.join("|")} or null`);
      continue;
    }
    const verdict = VALID_VERDICTS.includes(v.verdict) ? (v.verdict as VerdictKind) : (undefined as unknown as VerdictKind);
    verdicts.push({
      claimId: v.claimId,
      claim: typeof v.claim === "string" ? v.claim : "",
      evidenceId: v.evidenceId,
      ref: typeof v.ref === "string" ? v.ref : "",
      source: v.source,
      digest: typeof v.digest === "string" ? v.digest : "",
      verdict,
      note: typeof v.note === "string" ? v.note : "",
    });
  }
  if (problems.length) {
    throw new Error(`${verdictsPath}: ${problems.length} malformed row(s) — fix them and re-apply (fail-closed):\n  - ${problems.join("\n  - ")}`);
  }
  const result = reduceVerdicts(verdicts);
  writeFileSync(join(dir, "VERIFY.json"), JSON.stringify({ ...result, verdicts }, null, 2));
  return result;
}

// Fold per-pair verdicts into a pass/fail. A claim FAILS if a cited evidence
// item REFUTES it, or if every one of its fully-adjudicated cited items is
// `unsupported` (nothing actually backs the claim). Pairs still missing a
// verdict are reported as unadjudicated (a warning, not a failure).
export function reduceVerdicts(verdicts: Verdict[]): VerifyResult {
  const counts: Record<VerdictKind, number> = { supported: 0, partial: 0, refuted: 0, unsupported: 0 };
  for (const v of verdicts) if (v.verdict && counts[v.verdict] !== undefined) counts[v.verdict]++;

  const byClaim = new Map<string, Verdict[]>();
  for (const v of verdicts) {
    const group = byClaim.get(v.claimId) ?? [];
    group.push(v);
    byClaim.set(v.claimId, group);
  }

  const failures: VerifyResult["failures"] = [];
  const unadjudicated: string[] = [];
  for (const [claimId, group] of byClaim) {
    const adjudicated = group.filter((g) => !!g.verdict);
    if (adjudicated.length < group.length) unadjudicated.push(claimId);
    const refuted = adjudicated.find((g) => g.verdict === "refuted");
    const hasSupport = adjudicated.some((g) => g.verdict === "supported" || g.verdict === "partial");
    if (refuted) {
      failures.push({ claimId, evidenceId: refuted.evidenceId, verdict: "refuted", note: refuted.note });
    } else if (adjudicated.length === group.length && adjudicated.length > 0 && !hasSupport) {
      const u = adjudicated.find((g) => g.verdict === "unsupported") ?? adjudicated[0]!;
      failures.push({ claimId, evidenceId: u.evidenceId, verdict: u.verdict, note: u.note });
    }
  }

  return {
    ok: failures.length === 0,
    pairs: verdicts.length,
    adjudicated: verdicts.filter((v) => !!v.verdict).length,
    supported: counts.supported,
    partial: counts.partial,
    refuted: counts.refuted,
    unsupported: counts.unsupported,
    failures,
    unadjudicated,
  };
}

export function formatVerifyReport(r: VerifyResult): string {
  const lines: string[] = [];
  lines.push(`ultradoc verify: ${r.adjudicated}/${r.pairs} pair(s) adjudicated`);
  lines.push(`  supported: ${r.supported} · partial: ${r.partial} · refuted: ${r.refuted} · unsupported: ${r.unsupported}`);
  for (const f of r.failures.slice(0, 12)) {
    lines.push(`  ✗ ${f.claimId} (${f.evidenceId}): ${f.verdict}${f.note ? " — " + f.note : ""}`);
  }
  if (r.unadjudicated.length) {
    lines.push(`  ⚠ ${r.unadjudicated.length} claim(s) not fully adjudicated: ${r.unadjudicated.join(", ")}`);
  }
  lines.push(r.ok ? `  ✓ every claim is backed by a cited evidence item` : `  ✗ some claims are refuted or unsupported`);
  return lines.join("\n");
}

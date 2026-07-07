import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isCitation, resolveAlias, SHAPE, TOKEN_RE } from "./citations.js";
import type { CheckResult, EvidenceItem, VerifyResult } from "./types.js";

// Re-exported so existing consumers (verify.ts, tests) keep one import site.
export { type ClaimUnit, citationTokensIn, citedEvidenceIds, extractClaimUnits } from "./citations.js";

// The grounded answer a dossier validates. `ask` writes ANSWER.md; `doc` writes
// DOC.md. With no explicit name we prefer ANSWER.md, then DOC.md — so `check`
// and `verify` cover both flows with no required flag. Returns null when neither
// (nor an explicit answerFile) exists.
export function resolveAnswerPath(dir: string, answerFile?: string): string | null {
  if (answerFile) {
    const p = join(dir, answerFile);
    return existsSync(p) ? p : null;
  }
  for (const name of ["ANSWER.md", "DOC.md"]) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function resolves(tok: string, evidence: EvidenceItem[], ids: Set<string>, refs: Set<string>): boolean {
  if (SHAPE.id.test(tok)) return ids.has(tok);
  // An exact ref match resolves regardless of shape ("issue#123", "so:678",
  // "release:v1.2", "commit:abc123" …).
  if (refs.has(tok)) return true;
  // Typed alias: match the payload against an item of the same source.
  return resolveAlias(tok, evidence).length > 0;
}

// Fold the resolved semantic-verification record (VERIFY.json) into a check
// result when `--semantic` is requested. Strictly additive: it can only ADD a
// failure (a refuted/unsupported claim), never relax the mechanical gate.
// Missing VERIFY.json warns (run `verify` first) but never fails.
function applySemantic(dir: string, result: CheckResult): void {
  const p = join(dir, "VERIFY.json");
  if (!existsSync(p)) {
    result.warnings.push("--semantic: no VERIFY.json — run `verify` then `verify --apply <verdicts.json>` first; semantic gate skipped.");
    return;
  }
  try {
    const sem = JSON.parse(readFileSync(p, "utf8")) as VerifyResult;
    result.semantic = sem;
    if (!sem.ok) {
      result.ok = false;
      result.errors.push(`Semantic verification failed: ${sem.failures.length} claim(s) refuted or unsupported by their cited evidence (see VERIFY.json).`);
    }
    if (sem.unadjudicated?.length) {
      result.warnings.push(`${sem.unadjudicated.length} claim(s) not fully adjudicated by verify.`);
    }
  } catch (e) {
    result.warnings.push(`--semantic: VERIFY.json is unreadable (${(e as Error).message}).`);
  }
}

// Validate that an answer is grounded: every citation in ANSWER.md must resolve
// to a real evidence item from evidence.json. This is the mechanical guard
// against the model answering from memory — an ungrounded or fabricated
// citation fails the check (non-zero exit). With `opts.semantic`, ALSO folds in
// the VERIFY.json verdicts (fails on a refuted/unsupported claim) — additive:
// plain `check` (no opts) is byte-for-byte unchanged.
export function checkRun(dir: string, opts: { semantic?: boolean; answerFile?: string } = {}): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const answerPath = resolveAnswerPath(dir, opts.answerFile);
  const evidencePath = join(dir, "evidence.json");

  if (!existsSync(evidencePath)) {
    return {
      ok: false,
      citations: [],
      resolved: [],
      dangling: [],
      uncited: [],
      errors: [`No evidence.json in ${dir} — run \`ultradoc ask\` first.`],
      warnings: [],
    };
  }
  let evidence: EvidenceItem[];
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as EvidenceItem[];
  } catch (e) {
    return {
      ok: false,
      citations: [],
      resolved: [],
      dangling: [],
      uncited: [],
      errors: [`evidence.json is unreadable: ${(e as Error).message}`],
      warnings: [],
    };
  }

  if (!answerPath) {
    const which = opts.answerFile ?? "ANSWER.md or DOC.md";
    return {
      ok: false,
      citations: [],
      resolved: [],
      dangling: [],
      uncited: evidence.map((e) => e.id),
      errors: [`No ${which} in ${dir} — write the grounded answer there, then re-run check.`],
      warnings: [],
    };
  }

  const answer = readFileSync(answerPath, "utf8");
  const ids = new Set(evidence.map((e) => e.id));
  const refs = new Set(evidence.map((e) => e.ref));

  const citations: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(answer))) {
    const tok = m[1]!.trim();
    if (!isCitation(tok) || seen.has(tok)) continue;
    seen.add(tok);
    citations.push(tok);
  }

  const resolved: string[] = [];
  const dangling: string[] = [];
  for (const c of citations) {
    if (resolves(c, evidence, ids, refs)) resolved.push(c);
    else dangling.push(c);
  }

  const citedIds = new Set(resolved.filter((c) => SHAPE.id.test(c)));
  const uncited = evidence.map((e) => e.id).filter((id) => !citedIds.has(id));

  if (citations.length === 0) {
    errors.push(`${basename(answerPath)} contains no citations — a grounded answer must cite evidence ids like [E1].`);
  }
  if (dangling.length) {
    errors.push(`Dangling citation(s) not in evidence.json: ${dangling.join(", ")}`);
  }
  if (citations.length > 0 && citedIds.size === 0) {
    warnings.push("No evidence ids were cited (only typed aliases). Prefer citing ids like [E1].");
  } else if (uncited.length) {
    warnings.push(`${uncited.length} evidence item(s) were not cited (informational).`);
  }

  const result: CheckResult = {
    ok: errors.length === 0,
    citations,
    resolved,
    dangling,
    uncited,
    errors,
    warnings,
  };
  if (opts.semantic) applySemantic(dir, result);
  return result;
}

export function formatCheckReport(r: CheckResult, dir: string): string {
  const lines: string[] = [];
  lines.push(`ultradoc check: ${dir}`);
  lines.push(`  citations: ${r.citations.length} · resolved: ${r.resolved.length} · dangling: ${r.dangling.length}`);
  if (r.semantic) {
    const s = r.semantic;
    lines.push(`  semantic: supported ${s.supported} · partial ${s.partial} · refuted ${s.refuted} · unsupported ${s.unsupported}`);
    for (const f of s.failures.slice(0, 8)) lines.push(`  ✗ semantic ${f.claimId} (${f.evidenceId}): ${f.verdict}`);
  }
  for (const e of r.errors) lines.push(`  ✗ ${e}`);
  for (const w of r.warnings) lines.push(`  ⚠ ${w}`);
  lines.push(r.ok ? `  ✓ answer is grounded — every citation resolves to evidence` : `  ✗ answer is NOT grounded`);
  return lines.join("\n");
}

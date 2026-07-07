import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { claimCoverage, codeMask, collectCitations, resolveAlias, SHAPE } from "./citations.js";
import { headCommit } from "./clone.js";
import type { CheckResult, DocPlan, DossierMeta, EvidenceItem, VerifyResult } from "./types.js";

// Re-exported so existing consumers (verify.ts, tests) keep one import site.
export { type ClaimUnit, citationTokensIn, citedEvidenceIds, extractClaimUnits } from "./citations.js";

// A grounded answer must carry a citation on at least this fraction of its claim
// units. Below it, `check` fails: the guard against "one real [E1] + paragraphs
// of memory". 0.7 (not 1.0) tolerates a doc's transition/intro prose; `--strict`
// raises it to 1.0 for `ask` answers where every sentence should be grounded.
export const COVERAGE_MIN_DEFAULT = 0.7;

export interface CheckOptions {
  semantic?: boolean;
  answerFile?: string;
  coverageMin?: number; // grounding threshold (default COVERAGE_MIN_DEFAULT)
  strict?: boolean; // coverageMin = 1.0 and fence-only citations become errors
}

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

// Warn (never fail) when the dossier's meta.json records a commit that no longer
// matches the indexed clone's HEAD: line-anchored citations like
// `src/foo.ts:12-40` may have drifted. Best-effort — silent if meta/repoDir/git
// are unavailable.
function staleDossierWarning(dir: string): string | undefined {
  try {
    const metaPath = join(dir, "meta.json");
    if (!existsSync(metaPath)) return undefined;
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as DossierMeta;
    if (!meta.commit) return undefined;
    // Prefer the recorded repoDir; else walk up from the dossier to a repo root
    // (runs are persisted under <repoDir>/.ultradoc/runs/<id>).
    const repoDir = meta.repoDir && existsSync(meta.repoDir) ? meta.repoDir : dossierRepoDir(dir);
    if (!repoDir) return undefined;
    const head = headCommit(repoDir);
    if (head && head !== meta.commit) {
      return `dossier was built at ${meta.commit} but the tree is now at ${head} — line-anchored citations may have drifted; re-run \`ask\`.`;
    }
  } catch {
    /* meta unreadable — no guard */
  }
  return undefined;
}

// Markdown ATX headings in the answer, outside code fences (so a `#` inside a
// fenced code block isn't mistaken for a section heading).
function headingsOf(answer: string): string[] {
  const lines = answer.split("\n");
  const fenced = codeMask(lines);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[i]!);
    if (m) out.push(m[1]!.trim().toLowerCase());
  }
  return out;
}

// When validating a DOC.md whose run has a DOC.plan.json, every planned section
// title must appear as a heading — a doc that silently drops a planned section
// isn't complete. Returns an error message when sections are missing.
function missingDocSections(dir: string, answerPath: string, answer: string): string | undefined {
  if (basename(answerPath) !== "DOC.md") return undefined;
  const planPath = join(dir, "DOC.plan.json");
  if (!existsSync(planPath)) return undefined;
  let plan: DocPlan;
  try {
    plan = JSON.parse(readFileSync(planPath, "utf8")) as DocPlan;
  } catch {
    return undefined;
  }
  const headings = headingsOf(answer);
  const missing = (plan.sections ?? []).map((s) => s.title).filter((title) => !headings.some((h) => h.includes(title.toLowerCase())));
  if (missing.length) return `DOC.md is missing planned section(s): ${missing.join(", ")}. Write each section from DOC.todo.md or drop it from the plan.`;
  return undefined;
}

// Walk up from a dossier dir to the repo root it was written under, recognizing
// the <repoDir>/.ultradoc/runs/<id> (and .ultradoc/doc) layout.
function dossierRepoDir(dir: string): string | undefined {
  let d = dir;
  for (let i = 0; i < 6; i++) {
    if (basename(d) === ".ultradoc") return dirname(d);
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return undefined;
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

// Validate that an answer is grounded. Two guards: (1) every citation resolves
// to a real evidence item (no fabricated citation), and (2) the prose is
// COVERED — enough claim units carry a citation that the answer can't be mostly
// uncited memory around a single real reference. Fails (non-zero exit) on a
// dangling citation, no citations, or coverage below the threshold. With
// `opts.semantic`, ALSO folds in the VERIFY.json verdicts.
export function checkRun(dir: string, opts: CheckOptions = {}): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const coverageMin = opts.strict ? 1 : (opts.coverageMin ?? COVERAGE_MIN_DEFAULT);

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

  // Grounding citations come from claim units only; tokens found solely inside
  // code fences/inline code don't count (A3 — one shared tokenizer for check and
  // verify), and are surfaced separately.
  const { tokens: citations, fencedOnly } = collectCitations(answer);

  const resolved: string[] = [];
  const dangling: string[] = [];
  for (const c of citations) {
    if (resolves(c, evidence, ids, refs)) resolved.push(c);
    else dangling.push(c);
  }

  const citedIds = new Set(resolved.filter((c) => SHAPE.id.test(c)));
  const uncited = evidence.map((e) => e.id).filter((id) => !citedIds.has(id));
  const coverage = claimCoverage(answer, evidence);

  if (citations.length === 0) {
    errors.push(`${basename(answerPath)} contains no citations — a grounded answer must cite evidence ids like [E1].`);
  }
  if (dangling.length) {
    errors.push(`Dangling citation(s) not in evidence.json: ${dangling.join(", ")}`);
  }
  // Coverage gate: fail when too much prose is uncited. At the default threshold
  // this skips 1–2 claim answers (the no-citations error already covers those,
  // which shouldn't fail on a ratio); --strict demands every claim be cited
  // regardless of count.
  if (coverage.ratio < coverageMin && (opts.strict || coverage.claims >= 3)) {
    const pct = Math.round(coverage.ratio * 100);
    errors.push(
      `Only ${coverage.cited}/${coverage.claims} claim(s) cite evidence (${pct}% < ${Math.round(coverageMin * 100)}% required) — ` +
        `ground each claim in an evidence id or run \`check --coverage-min\` lower if this is intentional.`,
    );
  }
  if (coverage.ratio < 1 && coverage.uncited.length) {
    const shown = coverage.uncited
      .slice(0, 5)
      .map((u) => `"${u}"`)
      .join("; ");
    warnings.push(`${coverage.claims - coverage.cited} claim(s) cite no evidence (coverage ${Math.round(coverage.ratio * 100)}%): ${shown}`);
  }
  if (fencedOnly.length) {
    const msg = `${fencedOnly.length} citation-like token(s) appear only inside code fences and do not ground any claim: ${fencedOnly.join(", ")}`;
    if (opts.strict) errors.push(msg);
    else warnings.push(msg);
  }
  const missingSections = missingDocSections(dir, answerPath, answer);
  if (missingSections) errors.push(missingSections);
  if (citations.length > 0 && citedIds.size === 0) {
    warnings.push("No evidence ids were cited (only typed aliases). Prefer citing ids like [E1].");
  } else if (uncited.length) {
    warnings.push(`${uncited.length} evidence item(s) were not cited (informational).`);
  }
  const stale = staleDossierWarning(dir);
  if (stale) warnings.push(stale);

  const result: CheckResult = {
    ok: errors.length === 0,
    citations,
    resolved,
    dangling,
    uncited,
    errors,
    warnings,
    coverage,
    fencedOnly,
  };
  if (opts.semantic) applySemantic(dir, result);
  return result;
}

export function formatCheckReport(r: CheckResult, dir: string): string {
  const lines: string[] = [];
  lines.push(`ultradoc check: ${dir}`);
  lines.push(`  citations: ${r.citations.length} · resolved: ${r.resolved.length} · dangling: ${r.dangling.length}`);
  if (r.coverage) {
    lines.push(`  coverage:  ${r.coverage.cited}/${r.coverage.claims} claim(s) cited (${Math.round(r.coverage.ratio * 100)}%)`);
  }
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

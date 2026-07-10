import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve as resolvePath, sep } from "node:path";
import { citedEvidenceIds, claimCoverage, codeMask, collectCitations, extractClaimUnits, resolveAlias, SHAPE } from "./citations.js";
import { headCommit, sameCommit } from "./clone.js";
import type { CheckResult, DocPlan, DossierMeta, EvidenceItem, RevalidationFailure, RevalidationStats, VerifyResult } from "./types.js";
// Import cycle with verify.ts (which reuses check's claim parsing) — safe: both
// sides only call the other's functions at run time, never during module init.
import { buildWorklist, reduceVerdicts } from "./verify.js";

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
  allowUnverified?: boolean; // --semantic without VERIFY.json warns instead of failing
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

// Tunables for the excerpt re-validation gate (exported for tests).
export const REVALIDATION = {
  // Clipped snippets only: fraction of stored lines that must re-match in order.
  // Un-clipped code/docs snippets are exact slices at build time, so anything
  // short of exact equality is corruption/staleness there.
  SNIPPET_MATCH_MIN: 0.8,
  // Failing items detailed individually per run (then "… and N more").
  MAX_REPORTED: 5,
} as const;

// The dossier's pinned clone, resolved once: drift detection and excerpt
// re-validation both need meta.json + the clone's HEAD.
interface PinnedClone {
  meta?: DossierMeta;
  repoDir?: string; // existing directory only
  recordedRepoDir?: string; // as written in meta.json (for the eviction message)
  head?: string;
  headMatches: boolean;
  staleWarning?: string;
}

// Best-effort: silent when meta/repoDir/git are unavailable — but the caller
// surfaces a skip whenever there were excerpts to validate.
function pinnedClone(dir: string): PinnedClone {
  const pin: PinnedClone = { headMatches: false };
  try {
    const metaPath = join(dir, "meta.json");
    if (!existsSync(metaPath)) return pin;
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as DossierMeta;
    pin.meta = meta;
    if (!meta.commit) return pin;
    pin.recordedRepoDir = meta.repoDir;
    // Prefer the recorded repoDir; else walk up from the dossier to a repo root
    // (runs are persisted under <repoDir>/.ultradoc/runs/<id>).
    const repoDir = meta.repoDir && existsSync(meta.repoDir) ? meta.repoDir : dossierRepoDir(dir);
    if (!repoDir) return pin;
    pin.repoDir = repoDir;
    const head = headCommit(repoDir);
    if (!head) return pin;
    pin.head = head;
    if (sameCommit(head, meta.commit)) {
      pin.headMatches = true;
    } else {
      pin.staleWarning = `dossier was built at ${meta.commit} but the tree is now at ${head} — line-anchored citations may have drifted; re-run \`ask\`.`;
    }
  } catch {
    /* meta unreadable — no guard */
  }
  return pin;
}

// Marker appended by clip() when a snippet was truncated at build time.
const CLIP_MARKER_RE = /\n?… \[truncated \d+ chars\]$/;

// Whether a stored evidence snippet still matches fileLines[start-1..end-1].
// Primary test: exact equality of the whitespace-normalized line sequences
// (in-repo code/docs snippets are exact slices at build time — any divergence
// at the same commit is corruption). Snippets carrying the clip() marker get an
// in-order subsequence fallback: ≥ SNIPPET_MATCH_MIN of the stored lines must
// re-match, the last one by prefix (it may have been cut mid-line).
export function snippetMatches(stored: string, fileLines: string[], start: number, end: number): { ok: boolean; matched: number; total: number } {
  const norm = (l: string) => l.replace(/\s+/g, " ").trim();
  const clipped = CLIP_MARKER_RE.test(stored);
  const storedLines = stored
    .replace(CLIP_MARKER_RE, "")
    .split(/\r?\n/)
    .map(norm)
    .filter((l) => l !== "");
  const windowLines = fileLines
    .slice(start - 1, end)
    .map(norm)
    .filter((l) => l !== "");
  const total = storedLines.length;
  if (total === 0) return { ok: true, matched: 0, total: 0 };
  if (storedLines.join("\n") === windowLines.join("\n")) return { ok: true, matched: total, total };
  let matched = 0;
  let w = 0;
  for (let s = 0; s < storedLines.length; s++) {
    const last = clipped && s === storedLines.length - 1;
    while (w < windowLines.length) {
      const win = windowLines[w]!;
      w++;
      if (last ? win.startsWith(storedLines[s]!) : storedLines[s] === win) {
        matched++;
        break;
      }
    }
  }
  const ok = clipped && matched >= Math.ceil(total * REVALIDATION.SNIPPET_MATCH_MIN);
  return { ok, matched, total };
}

// "path:12" or "path:12-30" — the only location shapes that name repo lines.
const FILE_LOC_RE = /^(.+?):(\d+)(?:-(\d+))?$/;

// Re-open every code/docs excerpt against the pinned clone and fail on any that
// no longer resolves: a citation whose excerpt does not exist at the pinned
// commit is the same fabrication class as a dangling [E99]. ALL code/docs items
// are validated (cited or not) — evidence.json is the artifact every downstream
// consumer trusts (verify digests, EVIDENCE.md). Re-validation only runs when
// the clone's HEAD still matches the dossier commit; other states skip with a
// warning naming the gate (never silently when there was work to do).
function revalidateEvidence(pin: PinnedClone, evidence: EvidenceItem[], errors: string[], warnings: string[]): RevalidationStats {
  const stats: RevalidationStats = { attempted: 0, validated: 0, failures: [] };
  const candidates = evidence.filter(
    (e) => (e.source === "code" || e.source === "docs") && !!e.location && !/^https?:\/\//.test(e.ref) && !/^https?:\/\//.test(e.location as string),
  );
  if (!pin.meta?.commit) {
    stats.skipped = "no pinned clone recorded in meta.json";
    return stats; // hand-assembled dossier: nothing claims a clone — stay quiet
  }
  if (!pin.repoDir) {
    stats.skipped = `the recorded clone ${pin.recordedRepoDir ?? "(unknown)"} no longer exists`;
    if (candidates.length) {
      warnings.push(
        `evidence re-validation skipped: the recorded clone ${pin.recordedRepoDir ?? "(unknown)"} no longer exists (cache evicted?) — ` +
          `cited snippets cannot be checked; re-run \`ask\` to rebuild the dossier.`,
      );
    }
    return stats;
  }
  if (!pin.head) {
    stats.skipped = "the recorded clone is not a git tree";
    return stats; // best-effort, mirrors the drift warning's silence here
  }
  if (!pin.headMatches) {
    stats.skipped = `the clone moved from ${pin.meta.commit} to ${pin.head}`;
    if (candidates.length) {
      warnings.push(
        `evidence re-validation skipped: the clone moved from ${pin.meta.commit} to ${pin.head} — ` +
          `line-anchored snippets cannot be checked against a different tree.`,
      );
    }
    return stats;
  }

  const repoRoot = resolvePath(pin.repoDir);
  for (const item of candidates) {
    const m = FILE_LOC_RE.exec(item.location as string);
    if (!m) continue; // not a file:line shape (defensive; URL forms already excluded)
    const start = Number(m[2]);
    const end = m[3] ? Number(m[3]) : start;
    stats.attempted++;
    const fail = (reason: RevalidationFailure["reason"], detail: string) => {
      stats.failures.push({ id: item.id, ref: item.ref, location: item.location as string, reason, detail });
    };
    const abs = resolvePath(repoRoot, m[1]!);
    if (abs !== repoRoot && !abs.startsWith(repoRoot + sep)) {
      fail("escapes-repo", "the cited path resolves outside the pinned clone");
      continue;
    }
    if (!existsSync(abs)) {
      fail("missing-file", `file not found in the pinned clone (${repoRoot} @ ${pin.meta.commit})`);
      continue;
    }
    let lines: string[];
    try {
      lines = readFileSync(abs, "utf8").split(/\r?\n/);
    } catch (e) {
      fail("missing-file", `file is unreadable (${(e as Error).message})`);
      continue;
    }
    if (start < 1 || end < start || end > lines.length) {
      fail("range-out-of-bounds", `line range is out of bounds (file has ${lines.length} line(s) at ${pin.meta.commit})`);
      continue;
    }
    const r = snippetMatches(item.snippet, lines, start, end);
    if (r.ok) stats.validated++;
    else
      fail(
        "snippet-mismatch",
        `stored snippet does not match those lines (${r.matched}/${r.total} line(s) match); the dossier is stale or was modified — re-run \`ask\` and re-cite`,
      );
  }

  for (const f of stats.failures.slice(0, REVALIDATION.MAX_REPORTED)) {
    const src = evidence.find((e) => e.id === f.id)?.source ?? "code";
    errors.push(`[${f.id}] ${src} ${f.location} — ${f.detail}.`);
  }
  if (stats.failures.length > REVALIDATION.MAX_REPORTED) {
    errors.push(`… and ${stats.failures.length - REVALIDATION.MAX_REPORTED} more failing excerpt(s).`);
  }
  if (stats.failures.length) {
    errors.push(
      `${stats.failures.length} evidence excerpt(s) no longer match the pinned clone at ${pin.meta.commit} — citations built on them are not grounded.`,
    );
  }
  return stats;
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

// A stable fingerprint of an answer's *cited* claim structure: for every claim
// unit that carries a citation, its normalized text plus the sorted set of
// evidence ids it cites. Binds a VERIFY.json to the exact answer it adjudicated
// so `check --semantic` can fail closed when a claim was added, removed, or
// reworded since `verify --apply` — a stale ledger must never validate a
// changed answer. The claim iteration mirrors verify's (one unit per text
// block, one per list item) so both sides fingerprint the same claims.
export function answerClaimSignature(answer: string, evidence: EvidenceItem[]): string {
  const parts: string[] = [];
  for (const u of extractClaimUnits(answer)) {
    for (const part of u.kind === "text" ? [u.text] : u.items) {
      const ids = citedEvidenceIds(part, evidence);
      if (!ids.length) continue;
      const text = part.replace(/\s+/g, " ").trim();
      parts.push(`${text}::${[...new Set(ids)].sort().join(",")}`);
    }
  }
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 32);
}

// Fold the resolved semantic-verification record (VERIFY.json) into a check
// result when `--semantic` is requested. It can only ADD a failure, never relax
// the mechanical gate — and it FAILS CLOSED: a passing semantic exit must mean
// the support gate actually engaged, so a missing/unreadable VERIFY.json (or
// one recording no verdicts) is an error unless --allow-unverified explicitly
// downgrades it to a warning. The pass/fail is re-reduced from verdicts[] so a
// doctored `ok: true` summary cannot pass the gate.
function applySemantic(dir: string, result: CheckResult, answer: string, evidence: EvidenceItem[], allowUnverified = false, answerFile?: string): void {
  const p = join(dir, "VERIFY.json");
  const unverified = (what: string): void => {
    const fix = "run `verify` then `verify --apply <verdicts.json>` first";
    if (allowUnverified) {
      result.warnings.push(`--semantic: ${what} — ${fix}; semantic gate skipped (--allow-unverified).`);
    } else {
      result.ok = false;
      result.errors.push(`--semantic: ${what} — ${fix}, or pass --allow-unverified to skip the semantic gate explicitly.`);
    }
  };
  if (!existsSync(p)) {
    unverified("no VERIFY.json");
    return;
  }
  let sem: VerifyResult;
  try {
    sem = JSON.parse(readFileSync(p, "utf8")) as VerifyResult;
  } catch (e) {
    unverified(`VERIFY.json is unreadable (${(e as Error).message})`);
    return;
  }
  if (!Array.isArray(sem.verdicts) || sem.verdicts.length === 0) {
    unverified("VERIFY.json records no verdicts");
    return;
  }
  // The ledger must be BOUND to the answer it adjudicated. Recompute the current
  // answer's cited-claim fingerprint and fail closed if it differs (a claim
  // added, removed, or reworded since `verify --apply`) — otherwise a stale
  // VERIFY.json would validate a changed answer, and a claim inserted after
  // verification would carry no verdict yet still pass the re-reduced gate.
  const currentSig = answerClaimSignature(answer, evidence);
  if (typeof sem.answerSig !== "string" || sem.answerSig.length === 0) {
    unverified("VERIFY.json is not bound to an answer (missing answerSig) — re-run `verify --apply` so the gate can confirm it matches the current answer");
    return;
  }
  if (sem.answerSig !== currentSig) {
    unverified("ANSWER.md changed since `verify --apply` (a claim was added, removed, or reworded) — the VERIFY.json ledger no longer covers the current answer; re-run `verify` and `verify --apply`");
    return;
  }
  // Every claim the answer cites must still carry an adjudicated verdict. A
  // claim whose rows were deleted (or dropped by an incomplete fold) leaves the
  // answer partly unverified — reduceVerdicts is blind to a claim with no rows,
  // so fail closed rather than silently pass it.
  //
  // TRUSTLESS: re-derive the expected cited-claim set from the CURRENT answer +
  // evidence using verify's exact worklist derivation (`buildWorklist`) — same
  // claim granularity, claimId numbering, and cap. The persisted `claims[]` is
  // only a diagnostic and is NOT trusted: an attacker who deletes a claim's
  // verdict rows can also delete its id from claims[], and answerSig stays valid
  // when ANSWER.md is untouched, so a trusted claims[] check is fail-open.
  //
  // Cap trade-off (mirrors ultrasearch's default-cap re-derivation): the
  // re-derivation uses verify's DEFAULT cap because `check` cannot know a custom
  // maxVerify passed to `verify`. The default-cap path reproduces `runVerify`'s
  // worklist exactly (deterministic), so there is no false-fail on the common
  // capped run; a run capped with a smaller custom maxVerify may report claims
  // here it intentionally excluded — re-verify at the default cap or pass
  // --allow-unverified.
  let expectedClaims: string[] = [];
  try {
    expectedClaims = [...new Set(buildWorklist(dir, { answerFile }).worklist.pairs.map((p) => p.claimId))];
  } catch {
    expectedClaims = [];
  }
  if (expectedClaims.length) {
    const adjudicatedClaims = new Set(sem.verdicts.filter((v) => !!v.verdict).map((v) => v.claimId));
    const missing = expectedClaims.filter((c) => !adjudicatedClaims.has(c));
    if (missing.length) {
      unverified(
        `VERIFY.json is missing an adjudicated verdict for ${missing.length} cited claim(s) (${missing.join(", ")}) — the ledger does not cover the whole answer; re-run \`verify\` and \`verify --apply\``,
      );
      return;
    }
  }
  const reduced = reduceVerdicts(sem.verdicts);
  result.semantic = { ...reduced, verdicts: sem.verdicts };
  // A green semantic exit must mean the gate ENGAGED: rows whose verdicts were
  // all dropped/absent leave 0 adjudications — that is a bypass, not a pass.
  if (reduced.adjudicated === 0) {
    unverified("VERIFY.json contains rows but 0 adjudicated verdicts — the support gate never engaged (re-run verify --apply with valid verdict tokens)");
    return;
  }
  if (!reduced.ok) {
    result.ok = false;
    result.errors.push(`Semantic verification failed: ${reduced.failures.length} claim(s) refuted or unsupported by their cited evidence (see VERIFY.json).`);
  }
  if (reduced.unadjudicated?.length) {
    result.warnings.push(`${reduced.unadjudicated.length} claim(s) not fully adjudicated by verify.`);
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
  // Faithfulness lint: a claim whose ONLY support is an issue/PR cites tracker
  // state at a point in time — the behavior may have been fixed since. Warn so
  // the answer cross-checks current source or cites the code/fixing release.
  const byId = new Map(evidence.map((e) => [e.id, e] as const));
  const issueOnly: string[] = [];
  let issueOnlyCount = 0;
  for (const u of extractClaimUnits(answer)) {
    for (const part of u.kind === "text" ? [u.text] : u.items) {
      const cited = citedEvidenceIds(part, evidence)
        .map((id) => byId.get(id))
        .filter((e): e is EvidenceItem => !!e);
      if (cited.length && cited.every((e) => e.source === "issue" || e.source === "pr")) {
        issueOnlyCount++;
        if (issueOnly.length < 3) issueOnly.push(`"${part.trim().slice(0, 120)}"`);
      }
    }
  }
  if (issueOnlyCount) {
    warnings.push(
      `${issueOnlyCount} claim(s) are grounded only in issue/PR evidence — a tracker thread describes behavior at a point in time; ` +
        `cross-check the current source and cite the code or the fixing release alongside: ${issueOnly.join("; ")}`,
    );
  }
  const missingSections = missingDocSections(dir, answerPath, answer);
  if (missingSections) errors.push(missingSections);
  if (citations.length > 0 && citedIds.size === 0) {
    warnings.push("No evidence ids were cited (only typed aliases). Prefer citing ids like [E1].");
  } else if (uncited.length) {
    warnings.push(`${uncited.length} evidence item(s) were not cited (informational).`);
  }
  const pin = pinnedClone(dir);
  if (pin.staleWarning) warnings.push(pin.staleWarning);
  const revalidation = revalidateEvidence(pin, evidence, errors, warnings);

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
    revalidation,
  };
  if (opts.semantic) applySemantic(dir, result, answer, evidence, opts.allowUnverified, opts.answerFile);
  return result;
}

export function formatCheckReport(r: CheckResult, dir: string): string {
  const lines: string[] = [];
  lines.push(`ultradoc check: ${dir}`);
  lines.push(`  citations: ${r.citations.length} · resolved: ${r.resolved.length} · dangling: ${r.dangling.length}`);
  if (r.coverage) {
    lines.push(`  coverage:  ${r.coverage.cited}/${r.coverage.claims} claim(s) cited (${Math.round(r.coverage.ratio * 100)}%)`);
  }
  if (r.revalidation) {
    const v = r.revalidation;
    if (v.skipped) {
      // The no-meta case stays quiet: a hand-assembled dossier claims no clone.
      if (v.skipped !== "no pinned clone recorded in meta.json") lines.push(`  evidence:  re-validation skipped (${v.skipped})`);
    } else if (v.attempted > 0) {
      lines.push(`  evidence:  re-validated ${v.validated}/${v.attempted} code/docs excerpt(s) against the pinned clone`);
    }
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

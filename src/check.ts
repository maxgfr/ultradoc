import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, EvidenceItem, VerifyResult } from "./types.js";

// A bracketed token is a citation when it is NOT a markdown link ("](" after
// it) and matches one of the citation shapes:
//   [E12]                 canonical evidence id
//   [issue#123] [pr#45] [discussion#7]   typed issue / PR / discussion alias
//   [so:678]              StackOverflow question alias
//   [code:path] [docs:x] [web:x] [release:v1.2] [commit:abc123]   typed aliases
const TOKEN_RE = /\[([^\]\n]+)\](?!\()/g;
const SHAPE = {
  id: /^E\d+$/,
  numbered: /^(issue|pr|discussion)#\d+$/,
  soref: /^so:\S+$/,
  typed: /^(code|docs|web|so|release|commit|history|discussion):\S+$/,
};

// Typed-alias prefixes that differ from the SourceKind they cite: history
// items carry refs like "commit:<sha>".
const TYPED_SOURCE: Record<string, string> = { commit: "history" };

function isCitation(tok: string): boolean {
  return SHAPE.id.test(tok) || SHAPE.numbered.test(tok) || SHAPE.soref.test(tok) || SHAPE.typed.test(tok);
}

function resolves(tok: string, evidence: EvidenceItem[], ids: Set<string>, refs: Set<string>): boolean {
  if (SHAPE.id.test(tok)) return ids.has(tok);
  // An exact ref match resolves regardless of shape ("issue#123", "so:678",
  // "release:v1.2", "commit:abc123" …).
  if (refs.has(tok)) return true;
  // Typed alias: match the payload against an item of the same source.
  const colon = tok.indexOf(":");
  if (colon > 0) {
    const prefix = tok.slice(0, colon);
    const payload = tok.slice(colon + 1);
    const source = TYPED_SOURCE[prefix] ?? prefix;
    return evidence.some(
      (e) =>
        e.source === source &&
        (e.ref.includes(payload) ||
          payload.includes(e.ref) ||
          (e.location?.includes(payload) ?? false) ||
          (e.url?.includes(payload) ?? false)),
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Claim-unit parsing + citation→evidence mapping. Used by `verify` to pair each
// claim in ANSWER.md with the evidence it cites, so an agent can judge support.
// Additive: `checkRun` below is unchanged.
// ---------------------------------------------------------------------------
export type ClaimUnit = { kind: "text"; text: string } | { kind: "list"; items: string[] };

function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}
function stripInlineCode(line: string): string {
  return line.replace(/`[^`\n]*`/g, " ");
}
function codeMask(lines: string[]): boolean[] {
  const mask = new Array(lines.length).fill(false);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i]!)) {
      mask[i] = true;
      inFence = !inFence;
      continue;
    }
    mask[i] = inFence;
  }
  return mask;
}
function isHeadingOrRule(t: string): boolean {
  return /^#{1,6}\s/.test(t) || /^([-*_])\1{2,}$/.test(t);
}
function isTableSeparator(line: string): boolean {
  return /\|/.test(line) && /^[\s:|-]+$/.test(line.trim()) && /-/.test(line);
}
function isTableRow(line: string): boolean {
  return /\|/.test(line.trim()) && !isTableSeparator(line);
}
function tableCells(line: string): string {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()).join(" ");
}
function isListItem(line: string): boolean {
  return /^\s*([-*+]|\d+\.)\s+\S/.test(line);
}

// Split ANSWER.md into claim units: a text block / table row is one claim; a
// list group yields one claim per item. Code fences and HTML comments are
// excluded (a citation in code/comment can't ground a claim); headings/rules are
// structure. Mirrors how the grounded report is read.
export function extractClaimUnits(text: string): ClaimUnit[] {
  const lines = stripHtmlComments(text).split("\n");
  const code = codeMask(lines);
  const units: ClaimUnit[] = [];
  let prose: string[] = [];
  const flush = () => {
    if (prose.length) units.push({ kind: "text", text: prose.join(" ") });
    prose = [];
  };
  let i = 0;
  while (i < lines.length) {
    if (code[i]) {
      flush();
      i++;
      continue;
    }
    const line = stripInlineCode(lines[i]!);
    const t = line.trim();
    if (t === "" || isHeadingOrRule(t) || isTableSeparator(line)) {
      flush();
      i++;
      continue;
    }
    if (isTableRow(line)) {
      flush();
      units.push({ kind: "text", text: tableCells(line) });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const dequoted = line.replace(/^\s*>\s?/, "").trim();
      if (dequoted) prose.push(dequoted);
      i++;
      continue;
    }
    if (isListItem(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && !code[i]) {
        const l = stripInlineCode(lines[i]!);
        const tt = l.trim();
        if (tt === "" || isHeadingOrRule(tt) || isTableSeparator(l) || isTableRow(l)) break;
        if (isListItem(l)) items.push(l.replace(/^\s*([-*+]|\d+\.)\s+/, "").trim());
        else if (items.length) items[items.length - 1] += " " + tt;
        else items.push(tt);
        i++;
      }
      units.push({ kind: "list", items });
      continue;
    }
    prose.push(line);
    i++;
  }
  flush();
  return units;
}

// The citation tokens within a claim (inline code stripped, so a [E#] in
// backticks is not a citation).
export function citationTokensIn(text: string): string[] {
  const masked = stripInlineCode(text);
  const out: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(masked))) {
    const tok = m[1]!.trim();
    if (isCitation(tok) && !out.includes(tok)) out.push(tok);
  }
  return out;
}

// The evidence ids a claim cites: a canonical [E#] directly, plus a typed alias
// (issue#123, code:path, …) resolved to the matching item(s). Mirrors the
// resolution `checkRun` uses, so the worklist and the gate agree.
export function citedEvidenceIds(text: string, evidence: EvidenceItem[]): string[] {
  const ids = new Set(evidence.map((e) => e.id));
  const out: string[] = [];
  const push = (id: string) => {
    if (!out.includes(id)) out.push(id);
  };
  for (const tok of citationTokensIn(text)) {
    if (SHAPE.id.test(tok)) {
      if (ids.has(tok)) push(tok);
      continue;
    }
    for (const e of evidence) if (e.ref === tok) push(e.id);
    const colon = tok.indexOf(":");
    if (colon > 0) {
      const prefix = tok.slice(0, colon);
      const payload = tok.slice(colon + 1);
      const source = TYPED_SOURCE[prefix] ?? prefix;
      for (const e of evidence) {
        if (
          e.source === source &&
          (e.ref.includes(payload) ||
            payload.includes(e.ref) ||
            (e.location?.includes(payload) ?? false) ||
            (e.url?.includes(payload) ?? false))
        ) {
          push(e.id);
        }
      }
    }
  }
  return out;
}

// Fold the resolved semantic-verification record (VERIFY.json) into a check
// result when `--semantic` is requested. Strictly additive: it can only ADD a
// failure (a refuted/unsupported claim), never relax the mechanical gate.
// Missing VERIFY.json warns (run `verify` first) but never fails.
function applySemantic(dir: string, result: CheckResult): void {
  const p = join(dir, "VERIFY.json");
  if (!existsSync(p)) {
    result.warnings.push(
      "--semantic: no VERIFY.json — run `verify` then `verify --apply <verdicts.json>` first; semantic gate skipped.",
    );
    return;
  }
  try {
    const sem = JSON.parse(readFileSync(p, "utf8")) as VerifyResult;
    result.semantic = sem;
    if (!sem.ok) {
      result.ok = false;
      result.errors.push(
        `Semantic verification failed: ${sem.failures.length} claim(s) refuted or unsupported by their cited evidence (see VERIFY.json).`,
      );
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
export function checkRun(dir: string, opts: { semantic?: boolean } = {}): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const answerPath = join(dir, "ANSWER.md");
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
      ok: false, citations: [], resolved: [], dangling: [], uncited: [],
      errors: [`evidence.json is unreadable: ${(e as Error).message}`],
      warnings: [],
    };
  }

  if (!existsSync(answerPath)) {
    return {
      ok: false,
      citations: [],
      resolved: [],
      dangling: [],
      uncited: evidence.map((e) => e.id),
      errors: [`No ANSWER.md in ${dir} — write the grounded answer there, then re-run check.`],
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
    errors.push("ANSWER.md contains no citations — a grounded answer must cite evidence ids like [E1].");
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

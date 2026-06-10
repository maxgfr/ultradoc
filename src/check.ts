import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, EvidenceItem } from "./types.js";

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

// Validate that an answer is grounded: every citation in ANSWER.md must resolve
// to a real evidence item from evidence.json. This is the mechanical guard
// against the model answering from memory — an ungrounded or fabricated
// citation fails the check (non-zero exit).
export function checkRun(dir: string): CheckResult {
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

  return {
    ok: errors.length === 0,
    citations,
    resolved,
    dangling,
    uncited,
    errors,
    warnings,
  };
}

export function formatCheckReport(r: CheckResult, dir: string): string {
  const lines: string[] = [];
  lines.push(`ultradoc check: ${dir}`);
  lines.push(`  citations: ${r.citations.length} · resolved: ${r.resolved.length} · dangling: ${r.dangling.length}`);
  for (const e of r.errors) lines.push(`  ✗ ${e}`);
  for (const w of r.warnings) lines.push(`  ⚠ ${w}`);
  lines.push(r.ok ? `  ✓ answer is grounded — every citation resolves to evidence` : `  ✗ answer is NOT grounded`);
  return lines.join("\n");
}

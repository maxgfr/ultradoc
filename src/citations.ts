import type { EvidenceItem } from "./types.js";

// A bracketed token is a citation when it is NOT a markdown link ("](" after
// it) and matches one of the citation shapes:
//   [E12]                 canonical evidence id
//   [issue#123] [pr#45] [discussion#7]   typed issue / PR / discussion alias
//   [so:678]              StackOverflow question alias
//   [code:path] [docs:x] [web:x] [release:v1.2] [commit:abc123]   typed aliases
export const TOKEN_RE = /\[([^\]\n]+)\](?!\()/g;
export const SHAPE = {
  id: /^E\d+$/,
  numbered: /^(issue|pr|discussion)#\d+$/,
  soref: /^so:\S+$/,
  typed: /^(code|docs|web|so|release|commit|history|discussion):\S+$/,
};

// Typed-alias prefixes that differ from the SourceKind they cite: history
// items carry refs like "commit:<sha>".
export const TYPED_SOURCE: Record<string, string> = { commit: "history" };

export function isCitation(tok: string): boolean {
  return SHAPE.id.test(tok) || SHAPE.numbered.test(tok) || SHAPE.soref.test(tok) || SHAPE.typed.test(tok);
}

// Resolve a typed-alias token ("code:path", "issue:123", …) to the evidence
// item(s) it cites. The ONE resolution used by both the `check` gate and the
// `verify` worklist, so the two always agree on what a citation points at.
export function resolveAlias(tok: string, evidence: EvidenceItem[]): EvidenceItem[] {
  const colon = tok.indexOf(":");
  if (colon <= 0) return [];
  const prefix = tok.slice(0, colon);
  const payload = tok.slice(colon + 1);
  const source = TYPED_SOURCE[prefix] ?? prefix;
  return evidence.filter(
    (e) =>
      e.source === source &&
      (e.ref.includes(payload) || payload.includes(e.ref) || (e.location?.includes(payload) ?? false) || (e.url?.includes(payload) ?? false)),
  );
}

// ---------------------------------------------------------------------------
// Claim-unit parsing + citation→evidence mapping. Used by `verify` to pair each
// claim in ANSWER.md with the evidence it cites, so an agent can judge support,
// and by `check` to gate on citation resolution.
// ---------------------------------------------------------------------------
export type ClaimUnit = { kind: "text"; text: string } | { kind: "list"; items: string[] };

export function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}
export function stripInlineCode(line: string): string {
  return line.replace(/`[^`\n]*`/g, " ");
}
export function codeMask(lines: string[]): boolean[] {
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
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim())
    .join(" ");
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
// (issue#123, code:path, …) resolved to the matching item(s). Shares
// `resolveAlias` with the `check` gate, so the worklist and the gate agree.
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
    for (const e of resolveAlias(tok, evidence)) push(e.id);
  }
  return out;
}

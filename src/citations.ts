import type { CoverageStats, EvidenceItem } from "./types.js";

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

// Strip a trailing line range (":12" or ":12-40") from a path payload/ref so a
// `[code:src/foo.ts:12-40]` alias compares path-to-path against `src/foo.ts`.
function stripLineSuffix(p: string): string {
  return p.replace(/:\d+(-\d+)?$/, "");
}

// A `code:`/`docs:` alias resolves only when the payload is a full path or a
// trailing path SEGMENT of the item — never a bare substring. `[code:index]`
// no longer matches `src/index/search.ts`; `[code:foo.ts]` still matches
// `src/foo.ts` (segment) and `[code:src/foo.ts:12-40]` matches its location.
function matchPath(e: EvidenceItem, payload: string): boolean {
  const bare = stripLineSuffix(payload);
  if (!bare) return false;
  for (const c of [e.ref, e.location]) {
    if (!c) continue;
    const cBare = stripLineSuffix(c);
    if (cBare === bare || cBare.endsWith("/" + bare)) return true;
  }
  return false;
}

// A `release:` alias matches the tag exactly, tolerating one leading `v` on
// either side (`release:1.2` ⇔ ref `release:v1.2`).
function matchRelease(ref: string, payload: string): boolean {
  const tag = ref.startsWith("release:") ? ref.slice("release:".length) : ref;
  const norm = (s: string) => s.replace(/^v/i, "");
  return tag === payload || norm(tag) === norm(payload);
}

// A `commit:`/`history:` alias resolves by sha-prefix (either direction) against
// the item's `commit:<sha>` ref — an abbreviated sha cites its full commit.
function matchCommit(items: EvidenceItem[], payload: string): EvidenceItem[] {
  if (!/^[0-9a-f]{7,}$/i.test(payload)) return [];
  return items.filter((e) => {
    const sha = e.ref.startsWith("commit:") ? e.ref.slice("commit:".length) : e.ref;
    if (!/^[0-9a-f]{7,}$/i.test(sha)) return false;
    return sha.startsWith(payload) || payload.startsWith(sha);
  });
}

// A `web:` alias matches the item's url/ref exactly, ignoring the scheme and a
// trailing slash (`web:qdrant.tech/docs` ⇔ `https://qdrant.tech/docs`).
function matchWeb(e: EvidenceItem, payload: string): boolean {
  const bare = (u: string) => u.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const p = bare(payload);
  for (const c of [e.ref, e.url]) {
    if (!c) continue;
    if (c === payload || bare(c) === p) return true;
  }
  return false;
}

// Resolve a typed-alias token ("code:path", "release:v1", …) to the evidence
// item(s) it cites. The ONE resolution used by both the `check` gate and the
// `verify` worklist, so the two always agree on what a citation points at.
// Strict per prefix: a payload must match a path segment, an exact number, an
// exact tag, or a sha prefix — never a loose bidirectional substring (which let
// vague aliases like `[code:index]` resolve against unrelated evidence).
export function resolveAlias(tok: string, evidence: EvidenceItem[]): EvidenceItem[] {
  const colon = tok.indexOf(":");
  if (colon <= 0) return [];
  const prefix = tok.slice(0, colon);
  const payload = tok.slice(colon + 1);
  const source = TYPED_SOURCE[prefix] ?? prefix;
  const same = evidence.filter((e) => e.source === source);
  switch (prefix) {
    case "code":
    case "docs":
      return same.filter((e) => matchPath(e, payload));
    case "discussion":
      return /^\d+$/.test(payload) ? same.filter((e) => e.ref === `discussion#${payload}`) : [];
    case "so":
      return /^\d+$/.test(payload) ? same.filter((e) => e.ref === `so:${payload}`) : [];
    case "release":
      return same.filter((e) => matchRelease(e.ref, payload));
    case "commit":
    case "history":
      return matchCommit(same, payload);
    case "web":
      return same.filter((e) => matchWeb(e, payload));
    default:
      return [];
  }
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
// Structure DETECTION runs on the inline-code-stripped form (a pipe or [E#]
// inside backticks is not structure), but the STORED text keeps the original
// spans so downstream warnings echo the claim verbatim (`makeRetriable` must
// not vanish from an uncited-claim excerpt).
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
    const raw = lines[i]!;
    const line = stripInlineCode(raw);
    const t = line.trim();
    if (t === "" || isHeadingOrRule(t) || isTableSeparator(line)) {
      flush();
      i++;
      continue;
    }
    if (isTableRow(line)) {
      flush();
      units.push({ kind: "text", text: tableCells(raw) });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const dequoted = raw.replace(/^\s*>\s?/, "").trim();
      if (dequoted) prose.push(dequoted);
      i++;
      continue;
    }
    if (isListItem(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && !code[i]) {
        const rawL = lines[i]!;
        const l = stripInlineCode(rawL);
        const tt = l.trim();
        if (tt === "" || isHeadingOrRule(tt) || isTableSeparator(l) || isTableRow(l)) break;
        if (isListItem(l)) items.push(rawL.replace(/^\s*([-*+]|\d+\.)\s+/, "").trim());
        else if (items.length) items[items.length - 1] += " " + rawL.trim();
        else items.push(rawL.trim());
        i++;
      }
      units.push({ kind: "list", items });
      continue;
    }
    prose.push(raw);
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

// ---------------------------------------------------------------------------
// Citation collection + claim coverage. `check` uses these to enforce that an
// answer's prose is GROUNDED (every claim ties to evidence), not merely that its
// citations resolve — closing the "one real [E1] + paragraphs of memory" hole.
// ---------------------------------------------------------------------------

export interface CollectedCitations {
  // Citation tokens that ground a claim: found in claim units, with code fences
  // and inline code excluded (a `[E1]` in a fence can't ground prose).
  tokens: string[];
  // Citation-shaped tokens that appear ONLY inside fences/inline code — they
  // look like citations but ground nothing. Warned about; errors under --strict.
  fencedOnly: string[];
}

// Split an answer's citations into grounding tokens vs fence-only tokens. The
// grounding set is what `check` resolves against evidence; fence-only tokens are
// surfaced so a citation buried in a code block doesn't silently "count".
export function collectCitations(text: string): CollectedCitations {
  const tokens: string[] = [];
  for (const u of extractClaimUnits(text)) {
    const parts = u.kind === "text" ? [u.text] : u.items;
    for (const part of parts) for (const t of citationTokensIn(part)) if (!tokens.includes(t)) tokens.push(t);
  }
  const all: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text))) {
    const tok = m[1]!.trim();
    if (isCitation(tok) && !all.includes(tok)) all.push(tok);
  }
  return { tokens, fencedOnly: all.filter((t) => !tokens.includes(t)) };
}

// Claim units shorter than this (after trimming) are exempt from the coverage
// count — transitions like "In short:" or "This has two parts:" carry no claim.
const MIN_CLAIM_LEN = 25;

// Measure how much of an answer's prose is grounded: the fraction of countable
// claim units that carry a citation. A dangling citation still counts as an
// attempt here (it's caught separately as a hard error); what this catches is
// UNCITED prose — sentences asserting facts with no evidence at all.
export function claimCoverage(text: string, _evidence: EvidenceItem[]): CoverageStats {
  const claims: string[] = [];
  for (const u of extractClaimUnits(text)) {
    if (u.kind === "text") claims.push(u.text);
    else for (const it of u.items) claims.push(it);
  }
  let counted = 0;
  let cited = 0;
  const uncited: string[] = [];
  for (const c of claims) {
    const trimmed = c.trim();
    // Length counts on the code-stripped form so a line of pure inline code or
    // a short transition dressed in backticks stays exempt; the echoed text
    // keeps the original spans.
    if (stripInlineCode(trimmed).trim().length < MIN_CLAIM_LEN) continue;
    counted++;
    if (citationTokensIn(trimmed).length > 0) cited++;
    else if (uncited.length < 8) uncited.push(trimmed.slice(0, 160));
  }
  return { claims: counted, cited, ratio: counted === 0 ? 1 : cited / counted, uncited };
}

import type { CoverageStats, EvidenceItem } from "./types.js";

// A bracketed token is a citation when it is NOT a markdown link ("](" after
// it) and matches one of the citation shapes:
//   [E12]                 canonical evidence id
//   [issue#123] [pr#45] [discussion#7]   typed issue / PR / discussion alias
//   [so:678]              StackOverflow question alias
//   [code:path] [docs:x] [web:x] [release:v1.2] [commit:abc123]   typed aliases
// The reading is the engine's as of webindex v1.15.0; the SHAPES below are
// ultradoc's, and the engine deliberately refuses to guess them.
export { TOKEN_RE, stripHtmlComments, stripInlineCode, codeMask } from "./engine.js";
import {
  citationTokensIn as engineCitationTokens,
  type ClaimUnit,
  codeMask,
  collectCitations as engineCollectCitations,
  extractClaimUnits as engineClaimUnits,
  stripHtmlComments,
  stripInlineCode,
  TOKEN_RE,
} from "./engine.js";
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
// A claim unit is the engine's as of webindex v1.15.0. The flag this file used
// to carry — "sits under an Unknowns heading" — is expressed through the
// engine's generic `section` tag, so the engine never learns what an unknown is
// while this file keeps deciding.
export type { ClaimUnit } from "./engine.js";

/** Whether a unit sits in a declared-unknowns section. */
export function isDeclaredUnknown(u: ClaimUnit): boolean {
  return u.section === UNKNOWNS_SECTION;
}

const UNKNOWNS_SECTION = "unknown";

function isHeadingOrRule(t: string): boolean {
  return /^#{1,6}\s/.test(t) || /^([-*_])\1{2,}$/.test(t);
}
// A heading that opens a declared-unknowns section. Everything under it, until
// the next heading, states what the evidence does NOT settle — the one kind of
// sentence a grounded answer must contain and can never cite. Without this,
// `check --strict` and "always state the unknowns" contradict each other, and
// the agent resolves the contradiction by dropping the unknowns.
const UNKNOWNS_HEADING_RE = /^#{1,6}\s+(unknowns?|not settled|open questions?|gaps?)\b/i;
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

/**
 * Split ANSWER.md into claim units.
 *
 * The parser is the engine's; the four reading decisions below are ultradoc's,
 * and each is a real choice the engine refuses to make for a caller:
 *
 *   blockquotes "prose"   a quotation here is part of the surrounding claim,
 *                         not a claim of its own.
 *   keepInlineCode        the STORED text keeps its spans so an uncited-claim
 *                         warning can echo the claim verbatim (`makeRetriable`
 *                         must not vanish from the excerpt). Structure
 *                         DETECTION still runs on the stripped form, so a pipe
 *                         or an [E#] inside backticks is never read as markup.
 *   skipTableHeader false every table row is a claim here.
 *   sectionTag            an "Unknowns" heading opens a region that states what
 *                         the evidence does NOT settle — the one kind of
 *                         sentence a grounded answer must contain and can never
 *                         cite. Without it `check --strict` and "always state
 *                         the unknowns" contradict each other, and the agent
 *                         resolves that by dropping the unknowns.
 */
export function claimUnitsOf(text: string): ClaimUnit[] {
  return engineClaimUnits(text, {
    blockquotes: "prose",
    keepInlineCode: true,
    skipTableHeader: false,
    sectionTag: (heading) => (UNKNOWNS_HEADING_RE.test(heading) ? UNKNOWNS_SECTION : undefined),
  });
}

/**
 * The citation tokens within a claim.
 *
 * The scan is the engine's; `isCitation` is ultradoc's, and the engine has no
 * default for it on purpose — [E12], [issue#45] and [code:src/foo.ts] are
 * citations to this tool and prose to every other one.
 */
export function citationsIn(text: string): string[] {
  return engineCitationTokens(text, isCitation);
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
  for (const tok of citationsIn(text)) {
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

/**
 * Split an answer's citations into the ones that ground a claim and the ones
 * that only look like it.
 *
 * The second list is the useful half: a token living solely inside a fence or
 * inline code reads as grounding to someone skimming the file and grounds
 * nothing. What to DO about it stays with `check`.
 */
export function collectCitationTokens(text: string): CollectedCitations {
  const { grounding, inertOnly } = engineCollectCitations(text, isCitation, {
    blockquotes: "prose",
    keepInlineCode: true,
    skipTableHeader: false,
    sectionTag: (heading) => (UNKNOWNS_HEADING_RE.test(heading) ? UNKNOWNS_SECTION : undefined),
  });
  return { tokens: grounding, fencedOnly: inertOnly };
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
  const unknowns: string[] = [];
  for (const u of claimUnitsOf(text)) {
    // A declared unknown asserts the ABSENCE of evidence; requiring it to cite
    // evidence would make "state your unknowns" and `--strict` mutually
    // exclusive, and the unknowns would be what gets dropped. Exempted, but
    // counted and reported — an exemption nobody can see is a loophole.
    const sink = isDeclaredUnknown(u) ? unknowns : claims;
    if (u.kind === "text") sink.push(u.text);
    else for (const it of u.items) sink.push(it);
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
    if (citationsIn(trimmed).length > 0) cited++;
    else if (uncited.length < 8) uncited.push(trimmed.slice(0, 160));
  }
  let declaredUnknowns = 0;
  const unknownsWithCitations: string[] = [];
  for (const u of unknowns) {
    const trimmed = u.trim();
    if (stripInlineCode(trimmed).trim().length < MIN_CLAIM_LEN) continue;
    declaredUnknowns++;
    // An "unknown" that cites evidence is not an unknown — it is a claim parked
    // where the coverage gate cannot see it. Surface it rather than exempt it
    // silently.
    if (citationsIn(trimmed).length > 0 && unknownsWithCitations.length < 5) unknownsWithCitations.push(trimmed.slice(0, 160));
  }
  return { claims: counted, cited, ratio: counted === 0 ? 1 : cited / counted, uncited, declaredUnknowns, unknownsWithCitations };
}

// Single source of truth for the version the CLI/bundle reports. Kept in
// lockstep with package.json and SKILL.md by scripts/sync-version.mjs during a
// semantic-release run. Do not edit by hand outside a release.
export const VERSION = "1.8.0";

// Every retrieval source the dossier can draw from. The model cites evidence by
// id; `source` lets the dossier group items and lets `check` validate citation
// kinds.
export type SourceKind = "code" | "docs" | "release" | "history" | "issue" | "pr" | "discussion" | "so" | "web";

export const ALL_SOURCES: readonly SourceKind[] = ["code", "docs", "release", "history", "issue", "pr", "discussion", "so", "web"];

// A single piece of grounded evidence. `id` is stable within a run ("E1", "E2",
// …) and is what the model cites in ANSWER.md. `ref` is a short provenance
// token (e.g. "src/foo.ts", "issue#123", "so:456"); `url` is the clickable
// source when one exists.
export interface EvidenceItem {
  id: string;
  source: SourceKind;
  title: string;
  ref: string;
  location?: string;
  score: number;
  snippet: string;
  url?: string;
  meta?: Record<string, unknown>;
}

// Where a repo lives and how to reach it. Produced by resolveRepo(); the slug
// keys the on-disk cache at /tmp/ultradoc/<slug>.
export interface RepoRef {
  raw: string;
  host: string; // github.com | gitlab.com | bitbucket.org | "local" | "generic"
  owner?: string;
  repo?: string;
  cloneUrl?: string;
  webUrl?: string;
  isLocal: boolean;
  slug: string;
}

// A symbol extracted deterministically from source (no LLM). Feeds the
// structural index and the symbol-ranking half of code search.
export interface CodeSymbol {
  name: string;
  kind: string; // function | class | method | const | type | interface | enum | struct | trait | def
  file: string; // relative to repo root
  line: number; // 1-based
  signature?: string;
  exported: boolean;
  lang: string;
}

// One package of a workspace monorepo (yarn/npm/pnpm/lerna workspaces, Cargo
// workspace, go.work). Discovered deterministically at index time so questions
// can be scoped to a package with --package.
export interface WorkspacePackage {
  name: string; // manifest name (e.g. "@scope/web"), else the dir basename
  dir: string; // package root, posix path relative to the repo root
  description?: string;
}

// The deterministic, zero-dep index built from a clone. Persisted to
// <repoDir>/.ultradoc/index.json and reused across questions about the repo.
export interface StructuralIndex {
  slug: string;
  root: string; // absolute path of the indexed tree
  commit?: string;
  builtAt: string;
  fileCount: number;
  languages: Record<string, number>; // lang -> file count
  symbols: CodeSymbol[];
  docFiles: string[]; // README, docs/**, *.md, *.mdx, *.rst …
  configFiles: string[]; // package.json, pyproject.toml, go.mod …
  docsRoot?: string; // canonical in-repo docs folder, e.g. "docs" (discovered)
  docsUrl?: string; // official external docs URL discovered from README/manifests
  packages: WorkspacePackage[]; // workspace packages ([] for a single-package repo)
  topDirs?: Record<string, number>; // top-level dir -> file count (for the overview layout)
  stats?: IndexStats; // coverage honesty: whether caps truncated the index
  schemaVersion: number;
}

// Honest signal that the index is partial: the file cap truncated the walk, or
// some files hit the per-file symbol cap. Surfaced as retrieval notes so a
// partial answer on a huge repo is never silent.
export interface IndexStats {
  truncated: boolean; // the maxFiles cap was hit
  symbolCapHits: number; // files whose symbols were capped
}

// Which web-discovery engine to use; "auto" tries searxng → ddg → claude.
export type WebEngine = "auto" | "searxng" | "ddg" | "claude";

// Resolved options for a single `ask` (or single-source) run.
export interface AskOptions {
  repo: string;
  question: string;
  sources: SourceKind[];
  ref?: string;
  docsUrl?: string;
  pkg?: string; // scope retrieval to one workspace package (name or dir)
  out?: string;
  semantic: boolean;
  webEngine: WebEngine;
  perSource: number; // cap on evidence items kept per source
  json: boolean;
  refresh: boolean; // force re-clone / re-index
}

// What a source module returns: ranked evidence (ids assigned later by the
// dossier) plus optional notes surfaced honestly in EVIDENCE.md (e.g. "no
// issues API for this host", "semantic mode unavailable, used lexical").
export interface SourceResult {
  source: SourceKind;
  items: Omit<EvidenceItem, "id">[];
  notes: string[];
  ms?: number; // wall-clock spent in this source (set by the registry)
  fallbacks?: string[]; // degraded paths taken, e.g. "code: ripgrep missing — used the built-in JS scanner"
}

// Context handed to every source module for a run.
export interface RunContext {
  repoRef: RepoRef;
  repoDir: string; // absolute path to the clone (or local repo)
  index: StructuralIndex;
  options: AskOptions;
  scopePkg?: WorkspacePackage; // resolved --package, when given
  scopeDir?: string; // its dir, repo-relative — sources restrict to this subtree
  setupTimings?: { cloneMs: number; indexMs: number }; // measured by buildContext
}

// Per-phase wall-clock for a run. ~0ms clone/index means the cache was warm —
// that's signal (the agent can tell a 30s JS-fallback scan from a 1s rg run).
export interface PhaseTimings {
  cloneMs: number;
  indexMs: number;
  totalMs: number;
  sources: Partial<Record<SourceKind, number>>;
}

export interface DossierMeta {
  question: string;
  repo: string;
  host: string;
  ref?: string;
  commit?: string;
  repoDir?: string; // absolute path of the indexed clone — lets `check` detect a moved HEAD
  pkg?: string; // resolved workspace package name when the run was scoped
  sources: SourceKind[];
  semantic: boolean;
  evidenceCount: number;
  builtAt: string;
  notes: string[];
  timings?: PhaseTimings;
  fallbacks?: string[]; // degraded paths taken during retrieval ([] when none)
}

// ---------------------------------------------------------------------------
// Documentation generation (`ultradoc doc`). The engine retrieves a grounded
// dossier per outline section and emits a fill-in worklist; the model writes the
// cited prose into DOC.md, which `check` validates exactly like an ANSWER.md.
// ---------------------------------------------------------------------------
export interface DocSection {
  id: string; // "S1", "S2", …
  title: string; // section heading written into DOC.md
  query: string; // retrieval query the engine grounded this section on
  sources: SourceKind[]; // sources retrieved for this section
  evidenceIds: string[]; // ids (E#) of the section's deduped, best-scored evidence
}

// The documentation plan written to DOC.plan.json: the outline plus, per
// section, the global evidence ids the model should cite when writing DOC.md.
export interface DocPlan {
  repo: string;
  host: string;
  commit?: string;
  pkg?: string; // resolved workspace package when scoped with --package
  builtAt: string;
  sections: DocSection[];
}

// How much of an answer's prose is grounded. `check` fails when too many claim
// units carry no citation — the guard against "one real [E1] + paragraphs of
// memory" that citation-resolution alone cannot catch.
export interface CoverageStats {
  claims: number; // countable claim units (short transitions excluded)
  cited: number; // units carrying ≥1 citation token
  ratio: number; // cited/claims; 1 when claims === 0
  uncited: string[]; // first 8 uncited claim texts, clipped
}

export interface CheckResult {
  ok: boolean;
  citations: string[]; // grounding citation tokens found in ANSWER.md
  resolved: string[]; // those that map to a real evidence id
  dangling: string[]; // cited but absent from evidence.json
  uncited: string[]; // evidence ids never cited (informational)
  errors: string[];
  warnings: string[];
  coverage?: CoverageStats; // claim-coverage stats (additive)
  fencedOnly?: string[]; // citation-shaped tokens found only inside code fences
  semantic?: VerifyResult; // populated only by `check --semantic` (folds VERIFY.json)
}

// ---------------------------------------------------------------------------
// Semantic claim verification. The mechanical `check` proves a citation
// RESOLVES to an evidence item; `verify` asks whether that item actually
// SUPPORTS the claim. `verify` (Phase A) emits ClaimEvidencePair[] — a
// deterministic worklist; an agent fills a Verdict per pair; `verify --apply` /
// `check --semantic` (Phase B) then FAIL on a refuted/unsupported claim. This
// extends the citation-resolution gate to a citation-support gate.
// ---------------------------------------------------------------------------
export type VerdictKind = "supported" | "partial" | "refuted" | "unsupported";

// A claim-unit paired with one evidence item it cites + a claim-relevant digest
// of that item, for an agent to adjudicate.
export interface ClaimEvidencePair {
  claimId: string; // "C1", "C2", …
  claim: string; // the claim-unit text (capped)
  evidenceId: string; // the cited [E#]
  ref: string; // the evidence item's provenance token (src/foo.ts, issue#123…)
  source: SourceKind;
  digest: string; // the cited item's snippet (claim-relevant)
}

// A ClaimEvidencePair with the agent's judgement filled in.
export interface Verdict extends ClaimEvidencePair {
  verdict: VerdictKind;
  note: string;
}

// Outcome of folding the adjudicated verdicts back in. `ok` is false when any
// claim is refuted/unsupported. `unadjudicated` lists pairs still missing a
// verdict (warn, not fail). `verdicts` carries the full list for `render`.
export interface VerifyResult {
  ok: boolean;
  pairs: number;
  adjudicated: number;
  supported: number;
  partial: number;
  refuted: number;
  unsupported: number;
  failures: { claimId: string; evidenceId: string; verdict: VerdictKind; note: string }[];
  unadjudicated: string[];
  verdicts?: Verdict[];
}

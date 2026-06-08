// Single source of truth for the version the CLI/bundle reports. Kept in
// lockstep with package.json and SKILL.md by scripts/sync-version.mjs during a
// semantic-release run. Do not edit by hand outside a release.
export const VERSION = "1.1.0";

// Every retrieval source the dossier can draw from. The model cites evidence by
// id; `source` lets the dossier group items and lets `check` validate citation
// kinds.
export type SourceKind = "code" | "issue" | "pr" | "docs" | "so" | "web";

export const ALL_SOURCES: readonly SourceKind[] = [
  "code",
  "issue",
  "pr",
  "docs",
  "so",
  "web",
];

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
  schemaVersion: number;
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
}

// Context handed to every source module for a run.
export interface RunContext {
  repoRef: RepoRef;
  repoDir: string; // absolute path to the clone (or local repo)
  index: StructuralIndex;
  options: AskOptions;
}

export interface DossierMeta {
  question: string;
  repo: string;
  host: string;
  ref?: string;
  commit?: string;
  sources: SourceKind[];
  semantic: boolean;
  evidenceCount: number;
  builtAt: string;
  notes: string[];
}

export interface CheckResult {
  ok: boolean;
  citations: string[]; // every citation token found in ANSWER.md
  resolved: string[]; // those that map to a real evidence id
  dangling: string[]; // cited but absent from evidence.json
  uncited: string[]; // evidence ids never cited (informational)
  errors: string[];
  warnings: string[];
}

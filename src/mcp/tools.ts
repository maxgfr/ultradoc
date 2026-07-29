import { SOURCE_TOKENS } from "../sources/kinds.js";
import { ANNOTATIONS_SINCE, RICH_TOOLS_SINCE, type JsonSchema, type JsonSchemaProp, type ProtocolVersion } from "./protocol.js";

// What the server advertises. Pure data — nothing here imports the retrieval
// pipeline, so the declarations can be asserted in a test without cloning
// anything. handlers.ts is where these names become work.

export interface ToolDecl {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  title?: string;
  outputSchema?: JsonSchema;
  annotations?: Record<string, boolean>;
}

// Every spelling parseSourceList accepts, so a model that writes "issues"
// instead of "issue" is not rejected by schema validation for a token the
// engine would have understood.
const SOURCE_ENUM = Object.keys(SOURCE_TOKENS).sort();

const repoProp: JsonSchemaProp = {
  type: "string",
  description: "The repository: a git URL, owner/repo, or an absolute local path.",
};
const refProp: JsonSchemaProp = { type: "string", description: "Branch or tag to pin the clone to (default: the repo's default branch)." };
const pkgProp: JsonSchemaProp = { type: "string", description: "Scope retrieval to one workspace package of a monorepo (package name or directory)." };
const refreshProp: JsonSchemaProp = { type: "boolean", description: "Re-clone and re-index instead of reusing the cache." };
const perSourceProp: JsonSchemaProp = { type: "number", description: "Max evidence items kept per source (default 6)." };
const semanticProp: JsonSchemaProp = {
  type: "boolean",
  description:
    "Add vector retrieval on top of the lexical tier, for questions whose wording won't match the code's. Falls back to lexical with a note when no backend is reachable.",
};
const docsUrlProp: JsonSchemaProp = {
  type: "string",
  description:
    "An official documentation URL to fetch and ground against, for when the repo's own docs are thin. Auto-discovered from the README when omitted.",
};
const sourcesProp: JsonSchemaProp = {
  type: "array",
  items: { type: "string" },
  enum: SOURCE_ENUM,
  description: "Which sources to retrieve from. Default: code, issue, pr, docs. Add 'web'/'so' only when the answer is unlikely to be in the repo.",
};

// The cache note every repo-touching tool carries. These tools write a clone
// and an index into ultradoc's own cache directory and nothing else — which is
// why they are annotated read-only. Said out loud so the boundary is visible to
// whoever reads the tool list.
const CACHE_NOTE = "Clones and indexes into ultradoc's own cache; the first call on a new repo takes 10-60s, later calls are fast.";

export const TOOLS: ToolDecl[] = [
  {
    name: "ultradoc_search",
    title: "Search a repository's real sources",
    description:
      "Answer a precise question about an open-source project from its REAL sources rather than memory. Clones the repo, indexes it, and retrieves ranked, " +
      "citable evidence across code, issues, PRs, docs, release notes, git history, discussions, StackOverflow and the web. Start here. Returns evidence " +
      "without writing anything — use ultradoc_ask when you want a persisted dossier you can validate with ultradoc_check. " +
      CACHE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        repo: repoProp,
        question: { type: "string", description: "The precise question, in natural language. Keywords are extracted from it to drive retrieval." },
        sources: sourcesProp,
        per_source: perSourceProp,
        package: pkgProp,
        ref: refProp,
        semantic: semanticProp,
        docs_url: docsUrlProp,
        refresh: refreshProp,
      },
      required: ["repo", "question"],
    },
  },
  {
    name: "ultradoc_overview",
    title: "Map a repository",
    description:
      "Get a cached markdown digest of a repository: workspace packages, directory layout, the most central modules, the public API surface and where the " +
      "docs live. Read this first when you don't yet know how a repo is organised. Navigation only — never cite it; cite what ultradoc_search returns. " +
      CACHE_NOTE,
    inputSchema: {
      type: "object",
      properties: { repo: repoProp, ref: refProp, refresh: refreshProp },
      required: ["repo"],
    },
  },
  {
    name: "ultradoc_symbol",
    title: "Resolve a symbol and its call sites",
    description:
      "Resolve ONE named symbol in a repository: its declaration with the real body span, every call site labelled with the function it sits in, and the " +
      "files where the name is only mentioned. This is the tool for 'where is X used', 'who calls X', 'is X dead code'. " +
      CACHE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        repo: repoProp,
        name: { type: "string", description: "The exact symbol name (function, class, method, type, const)." },
        max: { type: "number", description: "Max evidence items to return (default 12)." },
        package: pkgProp,
        ref: refProp,
      },
      required: ["repo", "name"],
    },
  },
  {
    name: "ultradoc_read",
    title: "Read a file from the pinned clone",
    description:
      "Read a file, or a line range of one, from the repository at the exact commit ultradoc indexed. Use it to widen a snippet that ultradoc_search " +
      "returned, or to read a dossier file (EVIDENCE.md, meta.json) that ultradoc_ask wrote. Reads are confined to the clone and to ultradoc's cache — " +
      "anything else is your own file tool's job. " +
      CACHE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        repo: repoProp,
        path: {
          type: "string",
          description:
            "Repo-relative path (e.g. 'src/index.ts'), or an absolute path inside the clone or a dossier — such as the evidence_md that ultradoc_ask returns.",
        },
        start_line: { type: "number", description: "First line to return, 1-based (default 1)." },
        end_line: { type: "number", description: "Last line to return, inclusive (default: end of file, capped)." },
        ref: refProp,
      },
      required: ["repo", "path"],
    },
    outputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        commit: { type: "string" },
        start_line: { type: "number" },
        end_line: { type: "number" },
        total_lines: { type: "number" },
        truncated: { type: "boolean" },
        content: { type: "string" },
      },
      required: ["path", "start_line", "end_line", "total_lines", "truncated", "content"],
    },
  },
  {
    name: "ultradoc_fetch",
    title: "Fetch web pages as evidence",
    description:
      "Fetch specific URLs and turn each into ranked, citable excerpts. Needs no repository. Use it for a page you already have the URL of; to DISCOVER " +
      "pages, call ultradoc_search with sources including 'web'. Pages go through a shared cache, so refetching the same URL is cheap.",
    inputSchema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" }, description: "Absolute http(s) URLs to fetch." },
        question: { type: "string", description: "What you're looking for — used to pick and rank the excerpts returned from each page." },
        per_source: perSourceProp,
      },
      required: ["urls"],
    },
  },
  {
    name: "ultradoc_ask",
    title: "Build a grounded evidence dossier",
    description:
      "Run the full retrieval pipeline and WRITE an evidence dossier to disk: EVIDENCE.md (numbered items you cite as [E1], [E2]) plus evidence.json and " +
      "meta.json. Returns the dossier directory, not the evidence — read EVIDENCE.md with ultradoc_read, write your answer citing [E#], then validate it " +
      "with ultradoc_check. Use ultradoc_search instead when you just want evidence back and don't need the citation gate. " +
      CACHE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        repo: repoProp,
        question: { type: "string", description: "The precise question the dossier is built to answer." },
        sources: sourcesProp,
        per_source: perSourceProp,
        package: pkgProp,
        ref: refProp,
        semantic: semanticProp,
        docs_url: docsUrlProp,
        refresh: refreshProp,
        out: { type: "string", description: "Absolute directory to write the dossier to (default: a timestamped dir inside the clone's cache)." },
      },
      required: ["repo", "question"],
    },
  },
  {
    name: "ultradoc_check",
    title: "Validate an answer's citations",
    description:
      "The grounding gate. Given a dossier from ultradoc_ask and an answer that cites [E#], prove every citation resolves to real retrieved evidence and " +
      "that enough of the prose is cited at all. Pass the answer inline as answer_text. A result with ok:false is a real verdict, not a tool failure — " +
      "read `errors` and `dangling`, fix the answer, and check again.",
    inputSchema: {
      type: "object",
      properties: {
        run_dir: { type: "string", description: "The dossier directory returned by ultradoc_ask." },
        answer_text: { type: "string", description: "The answer to validate, citing evidence as [E1], [E2]. Preferred over answer_file." },
        answer_file: { type: "string", description: "Filename inside run_dir to validate instead (default: ANSWER.md, then DOC.md)." },
        strict: { type: "boolean", description: "Require every claim to carry a citation, and treat fence-only citations as errors." },
        coverage_min: { type: "number", description: "Minimum share of claims that must be cited, 0..1 (default 0.7)." },
        semantic: { type: "boolean", description: "Also fold in the verdicts from ultradoc_verify, failing on refuted or unsupported claims." },
        allow_unverified: { type: "boolean", description: "With semantic, warn instead of failing when no verdicts have been recorded yet." },
      },
      required: ["run_dir"],
    },
  },
  {
    name: "ultradoc_verify",
    title: "Build a claim-support worklist",
    description:
      "Go past 'the citation resolves' to 'the evidence actually supports the claim'. Emits a deterministic claim-by-evidence worklist from a dossier and " +
      "its answer, for you to adjudicate each pair as supported / partial / refuted / unsupported. Writes VERIFY.md and VERIFY.todo.json into the dossier. " +
      "Record the verdicts with the CLI (`ultradoc verify --run <dir> --apply <verdicts.json>`), then re-run ultradoc_check with semantic:true.",
    inputSchema: {
      type: "object",
      properties: {
        run_dir: { type: "string", description: "The dossier directory returned by ultradoc_ask." },
        answer_file: { type: "string", description: "Filename inside run_dir to verify (default: ANSWER.md, then DOC.md)." },
        max_verify: { type: "number", description: "Cap on the number of claim/evidence pairs emitted." },
      },
      required: ["run_dir"],
    },
  },
  {
    name: "ultradoc_doc",
    title: "Scaffold grounded reference documentation",
    description:
      "SLOW: builds one evidence dossier per outline section. Generates a whole-repo reference-doc scaffold — an outline adapted to the project type, a " +
      "grounded dossier per section, an architecture diagram and a DOC.todo worklist you fill into a cited DOC.md, which ultradoc_check then validates. " +
      "Expect tens of seconds to minutes on a large repo. " +
      CACHE_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        repo: repoProp,
        package: pkgProp,
        sources: sourcesProp,
        per_source: perSourceProp,
        ref: refProp,
        semantic: semanticProp,
        docs_url: docsUrlProp,
        refresh: refreshProp,
        out: { type: "string", description: "Absolute directory to write the scaffold to (default: inside the clone's cache)." },
      },
      required: ["repo"],
    },
  },
  {
    name: "ultradoc_cache",
    title: "Inspect the clone cache",
    description: "Report what ultradoc has cached on disk: each cloned repo, its size and commit, plus the shared page and model caches. Read-only.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

// Registered only when the server is started with --allow-write. A destructive
// tool sitting in an otherwise read-only server is how an auto-approving agent
// deletes a multi-gigabyte clone cache it did not create.
export const WRITE_TOOLS: ToolDecl[] = [
  {
    name: "ultradoc_cache_clean",
    title: "Delete cached clones",
    description:
      "DESTRUCTIVE: permanently deletes cached clones, indexes and dossiers from disk. Pass repo to drop one, or all:true to drop everything. Anything " +
      "not yet read out of a dossier is lost. Re-cloning is the only way back.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Drop just this repository's cache entry." },
        all: { type: "boolean", description: "Drop every cached repo, plus the page and model caches." },
      },
      required: [],
    },
  },
];

// Behavioural hints clients use to decide what needs a confirmation prompt.
//
// The read-only line is drawn at the USER'S environment, not at ultradoc's
// cache: `search`, `overview`, `symbol` and `read` all write a clone and an
// index under the cache root, and marking them destructive would make every
// call prompt and the server unusable. What they never touch is anything the
// user made. Tools that produce artifacts the user is told to open, or that
// take a destination path from the caller, are not read-only.
export const TOOL_META: Record<string, { write?: boolean; destructive?: boolean; idempotent?: boolean; openWorld?: boolean }> = {
  ultradoc_search: { openWorld: true },
  ultradoc_overview: { openWorld: true },
  ultradoc_symbol: { openWorld: true },
  ultradoc_read: { openWorld: true },
  ultradoc_fetch: { openWorld: true },
  ultradoc_ask: { write: true, destructive: false, idempotent: false, openWorld: true },
  ultradoc_check: { openWorld: false },
  ultradoc_verify: { write: true, destructive: false, idempotent: true, openWorld: false },
  ultradoc_doc: { write: true, destructive: false, idempotent: false, openWorld: true },
  ultradoc_cache: { openWorld: false },
  ultradoc_cache_clean: { write: true, destructive: true, idempotent: true, openWorld: false },
};

export function annotationsFor(name: string): Record<string, boolean> | undefined {
  const meta = TOOL_META[name];
  if (!meta) return undefined;
  return {
    readOnlyHint: !meta.write,
    ...(meta.write ? { destructiveHint: meta.destructive === true, idempotentHint: meta.idempotent === true } : {}),
    openWorldHint: meta.openWorld === true,
  };
}

export interface ToolsForOptions {
  defaultRepo?: string;
  allowWrite?: boolean;
}

// The tool list as one client should see it: gated on what the server was
// started with, and on how new the negotiated protocol is.
export function toolsFor(protocolVersion: ProtocolVersion, opts: ToolsForOptions = {}): ToolDecl[] {
  const base = opts.allowWrite ? [...TOOLS, ...WRITE_TOOLS] : TOOLS;
  const withAnnotations = protocolVersion >= ANNOTATIONS_SINCE;
  const withRich = protocolVersion >= RICH_TOOLS_SINCE;

  return base.map((t) => {
    const decl: ToolDecl = {
      name: t.name,
      description: t.description,
      // A destructive delete never inherits a repo the caller didn't name.
      inputSchema: t.name === "ultradoc_cache_clean" ? t.inputSchema : applyDefaultRepo(t.inputSchema, opts.defaultRepo),
    };
    if (withRich && t.title) decl.title = t.title;
    if (withRich && t.outputSchema) decl.outputSchema = t.outputSchema;
    if (withAnnotations) {
      const a = annotationsFor(t.name);
      if (a) decl.annotations = a;
    }
    return decl;
  });
}

// With a server-level default repo, `repo` stops being required and its
// description names the default — so a client can call every tool with no repo
// argument at all.
function applyDefaultRepo(schema: JsonSchema, defaultRepo?: string): JsonSchema {
  const existing = schema.properties.repo;
  if (!defaultRepo || !existing) return schema;
  return {
    type: "object",
    properties: {
      ...schema.properties,
      repo: { ...existing, description: `${existing.description} Optional — defaults to ${defaultRepo}.` },
    },
    required: schema.required.filter((r) => r !== "repo"),
  };
}

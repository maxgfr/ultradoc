# ultradoc — architecture & internals

`ultradoc` is a zero-dependency Node CLI (`scripts/ultradoc.mjs`, bundled from
`src/` by tsup) plus a `skills/ultradoc/SKILL.md` that orchestrates an agent. The engine does
the retrieval **with code**; the model only reasons over retrieved evidence and
writes a **citation-checked** answer.

## Design principles

1. **Grounded, not remembered.** Answers come from freshly retrieved code /
   issues / PRs / docs / web — never the model's parametric memory. Enforced by
   `ultradoc check` (every citation must resolve to retrieved evidence).
2. **Deterministic core, zero deps, no keys.** The shipped bundle has no runtime
   dependencies and needs no API keys. Heavy/optional pieces (vector search,
   metasearch, page extraction) live in local Docker containers reached over
   HTTP, so the bundle stays pure — and each is a separate compose profile, so
   starting one never drags in the others.
3. **Honest degradation.** A host with no issues API, an unreachable semantic
   stack, a failed fetch, a capped index — each is noted in the dossier rather
   than silently pretended away. Those notes head `EVIDENCE.md` and are echoed
   by `ask`, because they bound what the evidence below them can support: at the
   bottom they were read after the claims they should have constrained.

## Module map (`src/`)

```
cli.ts            parseArgs (loud on unknown flags) + subcommand dispatch
ask.ts            orchestrator: buildContext → runSources → writeDossier
types.ts          shared types + VERSION (synced on release)
config.ts         cacheRoot() + envInt/envStr + LIMITS (all ULTRADOC_* overrides)
clone.ts          resolveRepo (any git URL) + ensureClone (persistent cache) + origin
cache.ts          `cache status|clean`: inspect/clear the persistent cache
walk.ts           ignore-aware file walk + safe text reader (walkDetailed reports truncation)
util.ts           sh/have, keywords + rankedKeywords, slugify, RRF, mapLimit
overview.ts       cached markdown digest of a repo (packages, layout, API, docs)
index/
  scan.ts         the engine's full repo scan, memoised per tree (symbols, calls, imports)
  structural.ts   build/load the commit-validated index (languages, symbols, callSites, stats)
  workspaces.ts   monorepo package discovery (yarn/npm/pnpm/lerna/Cargo/go.work/uv/Composer/Maven/Gradle)
  search.ts       ripgrep (+ JS fallback) fused with symbol ranking → excerpts (RANKING consts)
  excerpt.ts      how a line window becomes a citable item (shared by search + symbol)
  symbols.ts      `symbol`: one declaration, its body, its call sites, its mentions
  modules.ts      the module graph ranked by centrality (overview + doc outline)
  semantic/       the vector tiers: static model · HTTP endpoint · Qdrant/Docker + control
                  (control.ts maps ultradoc's two commands onto the engine's stack:
                   semantic = qdrant+ollama+searxng, firecrawl = the extraction stack)
lang/             per-language symbol extractors (registry by extension)
providers/        issue/PR APIs per host (github, gitlab, gitea, generic) + shared helpers + registry
sources/          one module per evidence source (code, docs, issues, …) + fetch (bounded retries)
  fetch.ts        httpGet/httpJson + htmlToText + the fetchAndExtract seam (Firecrawl → stripper)
  firecrawl.ts    keyless self-hosted Firecrawl client: probe, /scrape, /search, pure mappers
  page-cache.ts   the URL+extractor-keyed cache shared by the docs URL and web pages
dossier.ts        assign ids, render EVIDENCE.md (retrieval notes FIRST), persist the run
doc.ts            `doc`: project-type-adaptive outline → a dossier per section → DOC.todo worklist
citations.ts      citation tokenization, strict alias resolution, claim coverage (shared by check/verify)
check.ts          validate ANSWER.md/DOC.md citations + claim coverage (the grounding guarantee)
verify.ts         claim↔evidence worklist + the semantic support gate (check --semantic)
repo-lock.ts      withRepoLock: serialize cache work per repo (ensureClone/ensureIndex race)
mcp/              the MCP server — a second front-end over the same library
  protocol.ts     version negotiation, arg validation, response cap, Origin check (pure)
  tools.ts        the tool declarations + annotations (pure data, no pipeline imports)
  handlers.ts     tool name → library call; the JSON→AskOptions mapper that THROWS
  resources.ts    SKILL.md + references/*.md under skill://, read off disk (pure)
  prompts.ts      the workflows as prompts — contract, tool sequence, gate (pure)
  server.ts       the JSON-RPC core, transport-agnostic (replies via a send callback)
  stdio.ts        newline-delimited JSON on stdin/stdout + the stdout-purity guard
  http.ts         stateless Streamable HTTP on node:http (POST /mcp, loopback)
```

### Why three primitives

`tools` alone ships the ENGINE. It does not ship the method — answer only from
retrieved evidence, cite every claim, treat a failed `check` as a verdict — which
inside Claude Code arrives as SKILL.md and nowhere else arrives at all. So the
same payload is served two more ways: `resources` expose SKILL.md and every
`references/*.md` under `skill://`, and `prompts` expose the workflows as
ready-to-run instructions naming the exact tool sequence.

`resources.ts` resolves the payload from its own module directory, trying three
layouts in order: `<payload>/SKILL.md` (installed skill), then
`<repo>/skills/ultradoc/SKILL.md` (repo-root bundle), then one level higher (the
source tree, which is what the test suite runs as). A build with no payload
beside it serves an empty resource list rather than refusing to start — missing
documentation must not cost you the tools. Containment on `resources/read` is
checked against the **realpath**, so a symlink out of `references/` is refused
even though its path string normalises cleanly; this server can be reached over
HTTP.

`prompts.ts` imports the tool declarations purely so a test can assert that
every `ultradoc_*` name a prompt tells the model to call is actually declared —
the failure being a tool rename that leaves the prompts describing a sequence no
host can follow, while still reading perfectly well.

## Data flow

```
AskOptions
  → buildContext: resolveRepo → ensureClone → ensureIndex (StructuralIndex)
      --package resolves against the index's workspace packages → scopeDir
  → runSources (concurrent): code | docs | issue | pr | so | web → SourceResult[]
      each capped to --per-source, best-scored first; code/docs/semantic
      restricted to scopeDir when --package was given
  → assignIds: flatten → E1,E2,… in canonical source order
  → writeDossier: EVIDENCE.md + evidence.json + meta.json
      (default location: <repoDir>/.ultradoc/runs/<id>, unless --out)
[model] reads EVIDENCE.md → writes ANSWER.md citing ids
  → checkRun: every citation resolves? else non-zero exit
  → (optional) runVerify → agent verdicts → check --semantic: every citation supports?
```

`cli.ts` and `mcp/handlers.ts` are peer front-ends over this, not layers: both
marshal options and call `buildContext` → `runSources` → `writeDossier`. The MCP
server never spawns the CLI, and `mcp/` never imports `cli.ts` — whose `fail()`
calls `process.exit`, which in a long-lived server would turn one bad argument
into a dead session. What the two shared (`SOURCE_TOKENS`, `DEFAULT_SOURCES`)
moved to `sources/kinds.ts`, where `parseSourceList` *returns* its error and each
front-end decides whether that means an exit or a thrown `ToolError`.

## Retrieval, in detail

### Tier 1 — deterministic code search (`index/search.ts`)
- **Lexical:** one `rg --json` call with the question's keywords as literal
  patterns (pure-JS scan if ripgrep is absent). Per-file term counts and hit
  lines are collected; files are ranked with **BM25** (`index/bm25.ts`) — rg
  returns every matching file, so document frequencies are exact and no term
  index has to be stored. `b=0.3` softens length normalization, since the
  answer in a code corpus often lives in the biggest file.
- **Structural:** the symbol index (`index/structural.ts` + `lang/*`) is ranked
  by name similarity to the keywords; exported symbols weigh more.
- **Call sites:** a query naming an identifier also ranks the files that INVOKE
  it, resolved from the index's `callSites` (extracted call expressions, so on
  the AST tier a mention inside a comment or a string is not a call). Names the
  index cannot cover — a callback property like `opts.onRetry?.()` is invoked but
  never declared — fall back to a regex over the lexical hits.
- **Fusion:** the BM25, symbol and call-site rankings fuse via RRF (same fusion
  as the semantic tier), with a penalty for test/fixture/doc paths.
- **Excerpts (`index/excerpt.ts`):** anchored on the matching symbol and spanning
  its **real body** when the AST tier resolved an `endLine`, else the densest
  matching region; clipped at 30 lines, recording the declaration's true extent
  as `meta.symbolSpan` when it had to. Each is labelled with the declaration it
  belongs to (`in function retryRequest`, `call site in Hono.#dispatch`). Output:
  `file:line-range` snippets with GitHub blob URLs — the same construction
  `symbol` uses, because `check` re-validates both against the pinned clone.

### Keyword selection (`util.ts`)
`keywords()` strips stopwords; `rankedKeywords()` orders by distinctiveness
(numbers like `429`, identifiers, long tokens first). Narrow search APIs AND
their terms, so providers feed them the few most-specific keywords and apply
**progressive relaxation** (3 → 2 → each top term) to avoid over-constraining to
zero — see `providers/github.ts`.

### Sources (`sources/*`)
- `code` — Tier 1 (+ optional semantic fusion via RRF).
- `docs` — in-repo README/docs/** keyword search + optional `--docs-url` fetch.
- `release` — version sections of the repo's CHANGELOG (offline) + GitHub
  releases API (keyless) — "when was X added/changed".
- `history` — `git log -S/-G` (pickaxe) on the clone; the first call on a
  remote repo converts the shallow partial clone to full history once.
- `issue` / `pr` — provider APIs (keyless), with progressive relaxation.
- `discussion` — GitHub Discussions via `gh api graphql` (skips honestly
  without the gh CLI).
- `so` — keyless StackExchange API.
- `web` — layered keyless discovery (SearXNG → DuckDuckGo → WebSearch hint, plus
  the explicit-only `firecrawl` engine) then fetch + extraction.

### Page extraction (`sources/fetch.ts`, `sources/firecrawl.ts`, `sources/page-cache.ts`)

`fetchAndExtract(url)` is the single seam every fetched page goes through — the
external docs URL, the auto-discovered docs URL, and each `web` result. Two
layers, in order:

1. **Firecrawl** (optional, self-hosted, keyless — compose profile `extract`,
   `ultradoc firecrawl up`). One `POST /v2/scrape` per page with
   `formats: ["markdown"]`, `onlyMainContent: true` and `maxAge` set to the
   page-cache TTL, so Firecrawl can serve its own cached render. The page is
   rendered in a real browser, which is why it beats the regex stripper on
   nav/cookie chrome and is the only thing that extracts a JS-rendered docs page
   at all. `/batch/scrape` is deliberately unused (async job + polling, no
   payoff for a handful of pages).
2. **`htmlToText`** — the zero-dep regex stripper. Always present, always the
   fallback.

The stack is probed once per process (`GET /`, 2 s; any HTTP status means up,
only a refused connection or timeout means down), so a machine without it pays
2 s per run at most and never a note — an uninstalled optional stack is not a
degraded run. Firecrawl reachable **but failing on a page**, or a base pinned
explicitly (`--firecrawl` / `ULTRADOC_FIRECRAWL`) and unreachable, both fall back
to layer 2 *with* a dossier note naming what happened. Nothing here throws.

Extracted text is cached by **URL + extractor id**, not URL alone
(`<clone>/.ultradoc/extdocs/<slug>.v3-<extractor>.txt` for the docs URL,
`<cache>/pages/` for web pages, TTL `ULTRADOC_EXTDOCS_TTL_HOURS`, default 168 h).
The extractor is in the key because Firecrawl markdown and regex-stripped text
are different documents: without it, a week-old native copy would shadow
Firecrawl for the whole TTL after you start the stack. `webFetchUrls` shares the
cache — a browser render is far too expensive to repeat on every run.

Because the extractor decides the text, it decides the `"<url>#~<line>"` soft
anchors in `web`/`docs` evidence: turning Firecrawl on or off invalidates the
anchors of dossiers written under the other extractor.

### Tier 2 — semantic (`index/semantic/`, optional)
Three keyless backends behind one cascade (`--semantic-tier auto` = endpoint →
static → docker). The **static** and **endpoint** tiers embed symbol names,
signatures and file summaries via the vendored engine's model, persisting the
index at `.ultradoc/embeddings.bin` per commit and tier — no container. The
**docker** tier chunks code+docs at symbol boundaries, embeds each chunk via a
local Ollama model and upserts into a per-repo Qdrant collection; it is the only
one that embeds real content, so it is the one that answers "why is it designed
this way". Results fuse with lexical via RRF in `sources/code.ts`. No backend →
`available: false` + a note naming what would enable one → transparent Tier-1
fallback. See `skills/ultradoc/references/semantic-setup.md`.

Ranking deliberately bypasses the engine's `searchSemantic`, which fuses in its
own lexical ranking: `sources/code.ts` already fuses with ultradoc's lexical
search, and going through it would count that signal twice.

## Monorepos (`index/workspaces.ts`)

Workspace packages are discovered deterministically at index time from the
repo's own manifests — `package.json` `workspaces` (array or object form),
`pnpm-workspace.yaml`, `lerna.json`, Cargo `[workspace] members`/`exclude`,
`go.work`, `pyproject.toml` `[tool.uv.workspace]`, Composer path repositories,
Maven `<modules>`, Gradle `settings.gradle(.kts)` includes — with glob
expansion (`packages/*`, `apps/**`, nested `packages/*/plugins/*`, partial
`libs-*`) and per-package name/description
read from each package's manifest. They are cached in the `StructuralIndex`
(`packages`). `--package <name|dir>` resolves (full name → dir → short name →
unique substring) and scopes code, docs and semantic retrieval to that subtree;
an unresolvable name throws, listing the packages that exist.

## The repo overview (`overview.ts`)

`ultradoc overview` renders a deterministic markdown digest of the repo —
About (README prose), workspace packages, layout, **core modules** (ranked by
PageRank over the import graph, so the map leads with what the rest of the repo
depends on rather than with the biggest directory), exported API surface grouped
per package, documentation map — and caches it at
`<repoDir>/.ultradoc/OVERVIEW.md`, keyed by commit (a marker comment in the
file). Repeated questions about the same repo reuse the clone, the index *and*
the overview; the model reads one file to orient instead of re-retrieving. The
overview is navigation, not evidence: `check` still requires citations to
resolve to a dossier.

## Documentation generation (`doc.ts`)

`ultradoc doc` turns the retrieve → cite → verify loop into a whole-repo
reference document. A deterministic outline (overview, install/usage, public API
— or one section per workspace package — configuration, architecture, then one
section per central subsystem from the module graph) is grounded
one section at a time: each runs the same `runSources` retrieval on a
section-specific query, and the results merge into a single `evidence.json` with
global `[E#]` ids (deduped across sections). The engine writes `DOC.plan.json` +
a `DOC.todo.md` worklist (per section: its evidence ids and snippets); the model
writes the cited `DOC.md`, which `check`/`verify` validate exactly like an
`ANSWER.md`. The API section's query is seeded from the repo's real exported
symbols (test/example and private/dunder symbols excluded). A deterministic
Mermaid module diagram is written beside it as `ARCHITECTURE.mmd` — navigation,
like `OVERVIEW.md`, never citable. Persisted under `<repoDir>/.ultradoc/doc/`.

## The grounding guarantee (`check.ts`, `verify.ts`)

`ANSWER.md` (or a `doc` run's `DOC.md`) citations (`[E1]`, `[pr#5]`,
`[code:path]`, …) are parsed (markdown links are ignored) and resolved against
`evidence.json`. The structural check **fails** on:
- any dangling citation (e.g. a fabricated `[E99]`), or
- an answer with no citations at all, or
- claim coverage below `--coverage-min` (default 0.7; `--strict` = every claim).

Non-zero exit ⇒ ungrounded ⇒ the model must retrieve more and rewrite.

**The unknowns exemption.** A grounded answer must state what the evidence does
*not* settle, and such a sentence can never carry a citation — so counting it as
uncited prose made `--strict` and "state your unknowns" mutually exclusive, and
the unknowns were what an agent dropped to get a green gate. Prose under a
heading matching `Unknowns`/`Not settled`/`Open questions`/`Gaps` (until the next
heading) is therefore exempt from claim coverage, and `verify` does not list it
as an uncited claim. The exemption is guarded rather than silent: `check` prints
`unknowns: N declared`, an "unknown" that *cites* evidence is reported as a claim
in the wrong section (an error under `--strict`), and an answer whose declared
unknowns outnumber its graded claims is warned about.

A second, **semantic** layer (`verify.ts`) closes the gap where a citation
*resolves* but does not actually *support* the claim: `verify --run <dir>` emits
a claim↔evidence worklist (`VERIFY.todo.json`); an agent — or skeptic subagents
in parallel — adjudicates each pair `supported · partial · refuted · unsupported`;
then `verify --apply <verdicts.json>` + `check --semantic` **fail** on any refuted
or wholly-unsupported claim, on top of the resolution gate (never relaxing it).
Together they prevent memory-based answers from passing as grounded ones.

## Extending

- **A language:** contribute the extractor upstream to the
  [codeindex engine](https://github.com/maxgfr/codeindex) and re-pin the vendored
  copy (`node scripts/sync-engine.mjs --ref <tag>`); only the richer JS/TS
  extractor lives locally in `src/lang/`.
- **A code host:** add `src/providers/<host>.ts` implementing `search()` and
  register it in `src/providers/registry.ts`.
- **A source:** add `src/sources/<x>.ts` returning a `SourceResult` and wire it
  into `src/sources/registry.ts` + the `SourceKind` union.
- **An MCP tool:** declare it in `src/mcp/tools.ts` (schema + a `TOOL_META`
  row), handle it in `src/mcp/handlers.ts`, and add its annotation line to the
  matrix in `tests/mcp-tools.test.ts` — which asserts tool by tool, so a new
  tool with no expected row fails rather than sliding in unannotated.
- **An MCP prompt:** add a `PromptDecl` to `PROMPTS` in `src/mcp/prompts.ts` and
  a renderer for it. `tests/mcp-prompts.test.ts` then holds it to the shape every
  prompt must have — it states the core rule, names only declared tools, and
  ends at `ultradoc_check` — so a workflow that lists tools without the protocol
  fails rather than shipping.
- **A skill reference:** drop the `.md` into `skills/ultradoc/references/`. It is
  served as a resource automatically; nothing has to be registered.

## The MCP server

`ultradoc mcp` serves the same library as typed tools. It lives inside the
single CLI entry point on purpose: a second `bin` would mean a second committed
bundle threaded through `copy-bundle.mjs`, `verify-skill-bundle.mjs` and
`check:build`'s explicit path list, and buys nothing. `skills/ultradoc/` is
untouched — MCP is a host-integration surface, not skill guidance, and the
skill's always-loaded token budget should not pay for something no skill
invocation uses.

Hand-written JSON-RPC, no `@modelcontextprotocol/sdk`: design principle 2 says
the bundle has zero runtime dependencies, and the surface needed here is small.
The vendored engine ships the same shape at
`src/vendor/codeindex-engine.mjs:11407` for its own tools; `src/mcp/` is that
shape retargeted, not a reuse of it.

**Stateless HTTP.** No `Mcp-Session-Id` is issued. Every tool call carries its
own `repo` and arguments, so a session would hold nothing — and issuing one buys
a class of interop bugs (echo-back, expiry, 404-then-reinitialize, DELETE
semantics) for no capability. A server instance is created per HTTP request, so
two overlapping requests on different protocol versions cannot read each other's.
No SSE: nothing sends server-initiated messages, and `GET /mcp` answers 405,
which is the spec's way of saying so.

**`readOnlyHint` is drawn at the user's environment, not at ultradoc's cache.**
`search`, `overview`, `symbol` and `read` all write a clone and an index under
the cache root; annotating them destructive would make every call prompt and the
server unusable. They touch nothing the user made. `ask`, `doc` and `verify`
produce artifacts the user is told to open, so they are not read-only.
`cache_clean` is destructive and is not even registered without `--allow-write`.

**Error semantics.** `isError` means the tool could not run; anything ultradoc
can *report* is a result. So: an unknown tool or a schema violation is a
JSON-RPC `-32602` (a client bug, not something the model should reason around);
a repo that won't clone or a path outside the tree is an `isError` result the
caller can act on; and a degraded source, zero evidence, or `checkRun` returning
`ok: false` are **successful** results. That last one matters — `cli.ts` exits 1
on it, and mapping that to `isError` would tell the model the grounding gate is
broken when it just did its job.

**Two known limits, both worth stating out loud.** `sh()` is `spawnSync`, so
during a `git clone` the event loop is frozen: the server answers nothing, not
even `ping`, and no timeout can preempt it. The real fix is forking a worker
process per call; it is a follow-up, not a v1 requirement. And `withRepoLock`
(`src/repo-lock.ts`) only serializes within one process — the cross-process race
is covered by the atomic `writeFileAtomic` in `util.ts` for `index.json` and
`OVERVIEW.md`, while `ensureClone` itself remains a gap.

## Release

Mirrors the `reconstruct` pipeline: `semantic-release` on push to `main` reads
Conventional Commits, computes the next version, runs `scripts/sync-version.mjs`
to sync it across `package.json` / `src/types.ts` / `skills/ultradoc/SKILL.md` / `CHANGELOG.md`,
rebuilds the committed bundle, and cuts a GitHub Release. CI
(`.github/workflows/ci.yml`) gates on typecheck + tests + reproducible bundle
(`check:build`) + an offline smoke run, with a Node-18 floor job for the
zero-dep bundle.

## PDF sources

A `.pdf` URL or an `application/pdf` response goes through an **extractor
ladder** (in the vendored webindex engine, behind `src/sources/pdf.ts`): `npx @firecrawl/pdf-inspector@1` → `npx @firecrawl/anydoc@0.1` (the PDF on stdin,
in a child process) → the self-hosted Firecrawl → `pdftotext` → a built-in
dependency-free reader — stopping at the first rung whose output passes a
quality gate, and REFUSING rather than quoting a PDF none of them could read.

**Office documents** — `.docx`/`.doc`/`.odt`/`.rtf`, `.pptx`/`.ppt`/`.odp`,
`.xlsx`/`.xls`/`.ods`, `.epub`, `.csv` — go through their own two-rung ladder
(in the vendored webindex engine, behind `src/sources/doc.ts`): `npx @firecrawl/anydoc@0.1` (the bytes on stdin, converted to
GitHub-Flavored Markdown) → the self-hosted Firecrawl. Same gate, same refusal.

The refusal is the point: these are ZIP and OLE containers, so the fall-through
this replaced did not degrade the evidence, it fabricated it — a `.docx` was
quoted as documentation, as kilobytes of replacement characters, silently. anydoc needs
Node 20+, so an unavailable converter is a normal outcome rather than a
misconfiguration; `ULTRADOC_DOC_ENGINE=none` disables the ladder.

**Scanned PDFs** — no text layer at all, so every rung above fails — are
rescued by a final OCR rung: [`copyable-pdf`](https://github.com/maxgfr/copyable-pdf)
+ `tesseract`, when both are installed. It is last because it is the only
expensive one (~2.7s per page at 300 DPI) and is budgeted per process
(`ULTRADOC_OCR_MAX`, default 3, `0` disables). Both binaries are checked before
the tool is spawned: asked for a missing tesseract, copyable-pdf offers to run
`brew install` / `sudo apt-get install -y` and waits on stdin, and a research
run must never install a system package as a side effect.

Without it a PDF body was returned verbatim: its bytes decoded as UTF-8, cached,
and quoted as documentation. The gate rejects text laced with C0/C1 control
bytes or U+FFFD at ANY length — the built-in reader can emit 16 MB of
image-stream garbage for a 12 MB paper, which every length-limited check waves
through. The winning rung becomes the extractor identity, so it is part of the
page-cache key.

`ULTRADOC_NO_NPX=1` drops the npx rung; `ULTRADOC_PDF_ENGINE=<rung>` pins one.


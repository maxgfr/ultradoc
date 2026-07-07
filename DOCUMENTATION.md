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
   metasearch) live in local Docker containers reached over HTTP, so the bundle
   stays pure.
3. **Honest degradation.** A host with no issues API, an unreachable semantic
   stack, a failed fetch — each is noted in the dossier rather than silently
   pretended away.

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
  structural.ts   build/load the commit-validated index (languages, symbols, docs, stats)
  workspaces.ts   monorepo package discovery (yarn/npm/pnpm/lerna/Cargo/go.work/uv/Composer/Maven/Gradle)
  search.ts       ripgrep (+ JS fallback) fused with symbol ranking → excerpts (RANKING consts)
  semantic.ts     optional Qdrant + local-embeddings client; symbol-boundary chunks; Docker control
  compose.ts      embedded docker-compose stack, materialized into the cache dir
lang/             per-language symbol extractors (registry by extension)
providers/        issue/PR APIs per host (github, gitlab, gitea, generic) + shared helpers + registry
sources/          one module per evidence source (code, docs, issues, …) + fetch (bounded retries)
dossier.ts        assign ids, render EVIDENCE.md, persist the run (<repoDir>/.ultradoc/runs/)
doc.ts            `doc`: project-type-adaptive outline → a dossier per section → DOC.todo worklist
citations.ts      citation tokenization, strict alias resolution, claim coverage (shared by check/verify)
check.ts          validate ANSWER.md/DOC.md citations + claim coverage (the grounding guarantee)
verify.ts         claim↔evidence worklist + the semantic support gate (check --semantic)
```

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
- **Fusion:** the BM25 and symbol rankings fuse via RRF (same fusion as the
  semantic tier), with a penalty for test/fixture/doc paths; each excerpt is
  anchored at the matching symbol's definition when there is one, else the
  densest region. Output: `file:line-range` snippets with GitHub blob URLs.

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
- `web` — layered keyless discovery (SearXNG → DuckDuckGo → WebSearch hint) then
  fetch + HTML→text extraction.

### Tier 2 — semantic (`index/semantic.ts`, optional)
Chunks code+docs, embeds each chunk via a local Ollama model, upserts into a
per-repo Qdrant collection (cached by commit), and vector-searches the question.
Results fuse with lexical via RRF in `sources/code.ts`. Unreachable stack →
`available: false` → transparent Tier-1 fallback. See
`skills/ultradoc/references/semantic-setup.md`.

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
About (README prose), workspace packages, layout, exported API surface grouped
per package, documentation map — and caches it at
`<repoDir>/.ultradoc/OVERVIEW.md`, keyed by commit (a marker comment in the
file). Repeated questions about the same repo reuse the clone, the index *and*
the overview; the model reads one file to orient instead of re-retrieving. The
overview is navigation, not evidence: `check` still requires citations to
resolve to a dossier.

## Documentation generation (`doc.ts`)

`ultradoc doc` turns the retrieve → cite → verify loop into a whole-repo
reference document. A deterministic outline (overview, install/usage, public API
— or one section per workspace package — configuration, architecture) is grounded
one section at a time: each runs the same `runSources` retrieval on a
section-specific query, and the results merge into a single `evidence.json` with
global `[E#]` ids (deduped across sections). The engine writes `DOC.plan.json` +
a `DOC.todo.md` worklist (per section: its evidence ids and snippets); the model
writes the cited `DOC.md`, which `check`/`verify` validate exactly like an
`ANSWER.md`. The API section's query is seeded from the repo's real exported
symbols (test/example and private/dunder symbols excluded). Persisted under
`<repoDir>/.ultradoc/doc/`.

## The grounding guarantee (`check.ts`, `verify.ts`)

`ANSWER.md` (or a `doc` run's `DOC.md`) citations (`[E1]`, `[pr#5]`,
`[code:path]`, …) are parsed (markdown links are ignored) and resolved against
`evidence.json`. The structural check **fails** on:
- any dangling citation (e.g. a fabricated `[E99]`), or
- an answer with no citations at all.

Non-zero exit ⇒ ungrounded ⇒ the model must retrieve more and rewrite.

A second, **semantic** layer (`verify.ts`) closes the gap where a citation
*resolves* but does not actually *support* the claim: `verify --run <dir>` emits
a claim↔evidence worklist (`VERIFY.todo.json`); an agent — or skeptic subagents
in parallel — adjudicates each pair `supported · partial · refuted · unsupported`;
then `verify --apply <verdicts.json>` + `check --semantic` **fail** on any refuted
or wholly-unsupported claim, on top of the resolution gate (never relaxing it).
Together they prevent memory-based answers from passing as grounded ones.

## Extending

- **A language:** add `src/lang/<x>.ts` (regex rules via `scan`) and register it
  in `src/lang/registry.ts`.
- **A code host:** add `src/providers/<host>.ts` implementing `search()` and
  register it in `src/providers/registry.ts`.
- **A source:** add `src/sources/<x>.ts` returning a `SourceResult` and wire it
  into `src/sources/registry.ts` + the `SourceKind` union.

## Release

Mirrors the `reconstruct` pipeline: `semantic-release` on push to `main` reads
Conventional Commits, computes the next version, runs `scripts/sync-version.mjs`
to sync it across `package.json` / `src/types.ts` / `skills/ultradoc/SKILL.md` / `CHANGELOG.md`,
rebuilds the committed bundle, and cuts a GitHub Release. CI
(`.github/workflows/ci.yml`) gates on typecheck + tests + reproducible bundle
(`check:build`) + an offline smoke run, with a Node-18 floor job for the
zero-dep bundle.

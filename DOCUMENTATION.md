# ultradoc — architecture & internals

`ultradoc` is a zero-dependency Node CLI (`scripts/ultradoc.mjs`, bundled from
`src/` by tsup) plus a `SKILL.md` that orchestrates an agent. The engine does
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
clone.ts          resolveRepo (any git URL) + ensureClone (/tmp cache) + origin
walk.ts           ignore-aware file walk + safe text reader
util.ts           sh/have, keywords + rankedKeywords, slugify, RRF
index/
  structural.ts   build/load the deterministic index (languages, symbols, docs)
  search.ts       ripgrep (+ JS fallback) fused with symbol ranking → excerpts
  semantic.ts     optional Qdrant + local-embeddings client; Docker control
lang/             per-language symbol extractors (registry by extension)
providers/        issue/PR APIs per host (github, gitlab, generic) + registry
sources/          one module per evidence source (code, docs, issues, …) + fetch
dossier.ts        assign ids, render EVIDENCE.md, persist the run
check.ts          parse + validate ANSWER.md citations (the grounding guarantee)
```

## Data flow

```
AskOptions
  → buildContext: resolveRepo → ensureClone → ensureIndex (StructuralIndex)
  → runSources (concurrent): code | docs | issue | pr | so | web → SourceResult[]
      each capped to --per-source, best-scored first
  → assignIds: flatten → E1,E2,… in canonical source order
  → writeDossier: EVIDENCE.md + evidence.json + meta.json
[model] reads EVIDENCE.md → writes ANSWER.md citing ids
  → checkRun: every citation resolves? else non-zero exit
```

## Retrieval, in detail

### Tier 1 — deterministic code search (`index/search.ts`)
- **Lexical:** one `rg --json` call with the question's keywords as literal
  patterns (pure-JS scan if ripgrep is absent). Per-file matched-keyword sets and
  hit lines are collected and merged into regions.
- **Structural:** the symbol index (`index/structural.ts` + `lang/*`) is ranked
  by name similarity to the keywords; exported symbols weigh more.
- **Fusion:** a combined per-file score (lexical coverage + density + symbol
  bonus, with a small penalty for test/fixture paths) picks top files; each
  excerpt is anchored at the matching symbol's definition when there is one, else
  the densest region. Output: `file:line-range` snippets with GitHub blob URLs.

### Keyword selection (`util.ts`)
`keywords()` strips stopwords; `rankedKeywords()` orders by distinctiveness
(numbers like `429`, identifiers, long tokens first). Narrow search APIs AND
their terms, so providers feed them the few most-specific keywords and apply
**progressive relaxation** (3 → 2 → each top term) to avoid over-constraining to
zero — see `providers/github.ts`.

### Sources (`sources/*`)
- `code` — Tier 1 (+ optional semantic fusion via RRF).
- `docs` — in-repo README/docs/** keyword search + optional `--docs-url` fetch.
- `issue` / `pr` — provider APIs (keyless), with progressive relaxation.
- `so` — keyless StackExchange API.
- `web` — layered keyless discovery (SearXNG → DuckDuckGo → WebSearch hint) then
  fetch + HTML→text extraction.

### Tier 2 — semantic (`index/semantic.ts`, optional)
Chunks code+docs, embeds each chunk via a local Ollama model, upserts into a
per-repo Qdrant collection (cached by commit), and vector-searches the question.
Results fuse with lexical via RRF in `sources/code.ts`. Unreachable stack →
`available: false` → transparent Tier-1 fallback. See
`references/semantic-setup.md`.

## The grounding guarantee (`check.ts`)

`ANSWER.md` citations (`[E1]`, `[pr#5]`, `[code:path]`, …) are parsed (markdown
links are ignored) and resolved against `evidence.json`. The check **fails** on:
- any dangling citation (e.g. a fabricated `[E99]`), or
- an answer with no citations at all.

Non-zero exit ⇒ ungrounded ⇒ the model must retrieve more and rewrite. This is
the mechanism that prevents memory-based answers from passing as grounded ones.

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
to sync it across `package.json` / `src/types.ts` / `SKILL.md` / `CHANGELOG.md`,
rebuilds the committed bundle, and cuts a GitHub Release. CI
(`.github/workflows/ci.yml`) gates on typecheck + tests + reproducible bundle
(`check:build`) + an offline smoke run, with a Node-18 floor job for the
zero-dep bundle.

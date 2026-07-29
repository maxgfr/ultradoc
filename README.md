<div align="center">

# ultradoc

**Answer ultra-precise questions about any open-source project from its _real_ source code, issues, PRs, docs and the web — grounded retrieval, not the model's memory.**

A [skills.sh](https://skills.sh) agent skill + a zero-dependency CLI.

```
npx skills add maxgfr/ultradoc
```

</div>

---

Ask things like *"In this library, does `retryRequest()` back off on 429, and is
there an open PR changing that?"* — and get a precise, **cited** answer drawn from
the actual repository **at a specific commit**, its issues, its open PRs, its
docs, and the web. Not from an LLM's stale, hallucination-prone memory of how the
library worked two years ago.

## Why this exists

LLMs answer questions about libraries from memory. That memory is frequently
out of date, and sometimes invents APIs that never existed. `ultradoc` flips the
flow:

1. **Retrieve first, with code** — clone the repo, index it (ripgrep + a symbol
   index, optionally local vector search), and pull evidence from code, issues,
   PRs, docs, StackOverflow and the web.
2. **Answer only from evidence** — the model writes an answer where every claim
   **cites** a retrieved snippet.
3. **Verify grounding mechanically** — `ultradoc check` *fails the answer* if any
   citation doesn't resolve to something actually retrieved.

The model literally cannot fall back on memory, because an uncited or fabricated
claim won't pass the check.

## What it looks like

```bash
node scripts/ultradoc.mjs ask \
  --repo https://github.com/psf/requests \
  --q "how does a Session manage connection pooling?"
# → clones + indexes (≈2s), retrieves across code/issues/PRs/docs,
#   writes an evidence dossier, and prints where it is.
```

The dossier's top code hit is the real implementation:

```
[E1] src/requests/sessions.py:394-413 — class Session
  ...the Session holds a pool of HTTPAdapter mounts keyed by URL prefix...
```

You then write `ANSWER.md` citing the evidence, and prove it's grounded:

```bash
node scripts/ultradoc.mjs check --run <dossier-dir>   # add --strict for ask answers
#   citations: 3 · resolved: 3 · dangling: 0
#   coverage:  3/3 claim(s) cited (100%)
#   ✓ answer is grounded — every citation resolves to evidence
```

`check` fails on a fabricated citation **and** when too much prose is uncited
(the coverage gate) — so an answer can't be mostly memory around one real
reference. `--strict` requires every claim to be cited. What the evidence does
*not* settle goes under an `## Unknowns` heading, which is exempt from coverage
(an unknown cites nothing by construction) but reported, so honesty never costs
a green gate and the section can't become a parking lot for uncited prose.

A fabricated `[E99]` or an answer with no citations → **non-zero exit**.

## Proven across 10 real repositories

Indexing + code/docs retrieval, fresh clone each time, on a laptop — a mix of
well-known, lesser-known, and deliberately-odd repos across 5 languages:

| Repo | Lang | Files | Symbols | Clone+index | Top code hit for a real question |
|------|------|------:|--------:|------------:|----------------------------------|
| `expressjs/express` | JS | 213 | 123 | ~1s | `lib/application.js` (routing/middleware) |
| `fastapi/fastapi` | Py | 2,735 | 5,348 | ~6s | `fastapi/param_functions.py` (dependencies) |
| `gin-gonic/gin` | Go | 130 | 1,492 | ~1s | route tree matching |
| `psf/requests` | Py | 131 | 801 | ~2s | `src/requests/sessions.py` (pooling) |
| `vuejs/core` | TS | 697 | 2,947 | ~3s | `packages/reactivity/src/dep.ts` (tracking) |
| `sindresorhus/ky` | TS | 65 | 146 | ~1s | retry/backoff core |
| `tj/commander.js` | JS | 219 | 145 | ~2s | `lib/option.js` (option parsing) |
| `sharkdp/bat` | Rust | 899 | 1,449 | ~2s | `src/assets.rs` (syntax detection) |
| `charmbracelet/bubbletea` | Go | 192 | 834 | ~2s | `tea.go` (the Update loop) |
| `kelseyhightower/nocode` | — | 5 | 0 | ~1s | graceful on an essentially empty repo |

Top hits land on the actual implementation, not changelogs or examples. Shallow,
filtered clones keep even a 2,700-file monorepo at a few seconds.

Separately stress-tested across **15 more repositories in 13+ languages**
(`axios`, `zod`, `fzf`, `mdBook`, `sinatra`, `guzzle`, `Alamofire`, `okhttp`,
`serilog`, `ecto`, `pydantic`, `svelte`, `ohmyzsh`, `tldr`, `neovim`) — every
one indexed and answered without a crash, with symbol-aware retrieval landing on
the right layer (e.g. `Alamofire` → `Validation.swift`, `neovim` → `event/loop.h`,
`serilog` → `Core/Logger.cs`).

## How it works

```
question + repo URL
  → clone any git URL into a persistent per-user cache (shallow; `ultradoc cache status`)
  → index deterministically: ripgrep + a per-language symbol index
      (optional Tier 2: local vector search — Qdrant + Ollama, in Docker, no key)
  → retrieve evidence: code · issues · PRs · docs · releases · git history · discussions · StackOverflow · web
      (fetched pages extracted by the built-in stripper, or by a local Firecrawl when it's up)
  → write an evidence dossier (EVIDENCE.md + evidence.json), persisted under
      <clone>/.ultradoc/runs/ — a stable, commit-pinned knowledge base
  → the model writes a CITED answer (ANSWER.md)
  → `ultradoc check` verifies every citation resolves   ← the grounding guarantee
  → (optional) `ultradoc verify` + `check --semantic` adversarially confirm each
      citation actually SUPPORTS its claim               ← the semantic gate
```

Two retrieval tiers:

- **Tier 1 — deterministic (default).** ripgrep ranked with BM25, fused (RRF)
  with a structural symbol index (functions, classes, exports, …) across
  **15 languages** — JS/TS, Python, Go, Ruby, Java, Rust, C#, PHP, Swift,
  Kotlin, C/C++, Lua, Shell, Elixir, Scala. Zero dependencies, no keys,
  offline, reproducible.
- **Tier 2 — semantic (optional).** Fully-local vector search, in two flavours.
  A **static** model (`ultradoc semantic pull`, ~21 MB, **no container**) embeds
  symbol names and signatures, so "which helper works out how long to wait
  before trying again" finds `computeBackoff`. A **Docker** stack (Qdrant +
  `nomic-embed-text`, `ultradoc semantic up`) embeds the real *content* of code
  and docs, which is what answers "why is it designed this way". No key, nothing
  leaves your machine; both fuse with Tier 1 via Reciprocal Rank Fusion and fall
  back to Tier 1 automatically when neither is available.

## No API keys, anywhere

| Source | How (all keyless / free) |
|--------|--------------------------|
| Code | `git clone` (any host) + ripgrep + symbol index |
| Issues / PRs | GitHub via your existing `gh` login (or public REST, optional `GITHUB_TOKEN`); GitLab & Gitea/Forgejo/Codeberg public REST |
| Docs | in-repo README/docs/** + an optional `--docs-url` fetch |
| StackOverflow | the keyless StackExchange API |
| Web | local SearXNG → DuckDuckGo scrape → your built-in WebSearch (whatever's available) |
| Page extraction | a built-in zero-dep HTML stripper, optionally upgraded by a local self-hosted **Firecrawl** (`ultradoc firecrawl up`) — keyless, falls back automatically |
| Semantic | a local static model (no container) or local Docker (Qdrant + Ollama) — no key, no data leaves the machine |

## Commands

| Command | What it does |
|---------|--------------|
| `ask` | Retrieve from all selected sources → write an evidence dossier |
| `code` / `issues` / `prs` / `docs` / `releases` / `history` / `discussions` / `so` | Drill into one source (prints evidence) |
| `web` | Keyless web discovery (SearXNG → DuckDuckGo → WebSearch) + fetch |
| `symbol --name <sym>` | Resolve one declaration: its real body, every call site with the caller it sits in, and where else it is only mentioned — for "where is X used / who calls X / is X dead" |
| `overview` | Generate a cached markdown digest of the repo (packages, layout, core modules, public API, docs map) |
| `doc` | Generate a grounded **reference doc**: a section outline + a dossier per section + a `DOC.todo` worklist you fill into a cited `DOC.md` |
| `check --run <dir>` | Validate `ANSWER.md`/`DOC.md` citations **and** claim coverage against the dossier (`--strict` requires every claim cited; `--semantic` folds in `verify`'s verdicts) |
| `verify --run <dir>` | Emit a claim↔evidence worklist for adversarial support-checking, then gate on refuted/unsupported claims |
| `index` | Build/print the structural index for a repo |
| `semantic pull` | Fetch the local static embedding model (no container needed) |
| `semantic up\|down\|status` | Manage the optional local Docker stack (Qdrant + Ollama + SearXNG) |
| `firecrawl up\|down\|status` | Manage the optional self-hosted Firecrawl stack (page extraction, keyless) |
| `cache status\|clean` | Inspect or clear the persistent clone/index cache |
| `mcp` | Serve everything above over the Model Context Protocol (see below) |

`node scripts/ultradoc.mjs --help` for every flag. Useful ones: `--sources
code,issues,prs,docs,releases,history,discussions,web,so`, `--ref <branch>`
(pin a version), `--package <name|dir>` (scope a monorepo), `--docs-url <url>`,
`--semantic`, `--firecrawl off`.

## Use it as an MCP server

The skill shells out to the CLI and parses its output. An MCP server skips both:
your agent calls ultradoc as typed tools, with JSON schemas in and structured
results out. Same engine, same cache, no wrapper.

```bash
# stdio — the default, and what Claude Code / Claude Desktop / Cursor expect
claude mcp add ultradoc -- node /abs/path/to/scripts/ultradoc.mjs mcp

# or over HTTP, on loopback
node scripts/ultradoc.mjs mcp --transport http --port 7337
claude mcp add --transport http ultradoc http://127.0.0.1:7337/mcp
```

Claude Desktop (`claude_desktop_config.json`) and Cursor (`.cursor/mcp.json`):

```jsonc
// Claude Desktop takes stdio servers only — a remote URL here will not work.
{ "mcpServers": { "ultradoc": { "command": "node", "args": ["/abs/path/to/scripts/ultradoc.mjs", "mcp"] } } }
// Cursor, HTTP:
{ "mcpServers": { "ultradoc": { "url": "http://127.0.0.1:7337/mcp" } } }
```

Ten tools. `ultradoc_search` is the one to reach for first:

| Tool | What it does |
|------|--------------|
| `ultradoc_search` | Ranked, citable evidence across code/issues/PRs/docs/releases/history/discussions/SO/web. Writes nothing |
| `ultradoc_overview` | Cached repo digest — packages, layout, core modules, public API, docs map |
| `ultradoc_symbol` | One declaration + its real body + every call site with the caller it sits in |
| `ultradoc_read` | A file, or a line range, at the exact commit ultradoc indexed |
| `ultradoc_fetch` | Fetch specific URLs into ranked excerpts. Needs no repo |
| `ultradoc_ask` | The full pipeline → an evidence dossier on disk; returns its directory |
| `ultradoc_check` | The grounding gate: pass your answer as `answer_text`, every `[E#]` must resolve |
| `ultradoc_verify` | Claim↔evidence worklist for adversarial support-checking |
| `ultradoc_doc` | Reference-doc scaffold: outline + a dossier per section (slow) |
| `ultradoc_cache` | What is cached on disk |

The retrieval tools take the same knobs as the CLI: `sources`, `per_source`,
`package` (monorepo scoping), `ref` (pin a version), `docs_url`, and `semantic`
(opt-in vector retrieval, degrading to lexical with a note when no backend is up).

Pass `--repo <url|path>` at startup to dedicate the server to one project —
`repo` then becomes optional on every tool. `--allow-write` additionally exposes
`ultradoc_cache_clean`, which deletes cached clones; it is off by default so an
auto-approving agent cannot reach it.

Three things worth knowing:

- **The first call on a new repo clones and indexes it** — 10-60s depending on
  size. Every later call on the same repo is fast, and `ultradoc_search`,
  `ultradoc_symbol` and `ultradoc_read` are sub-second once it is warm.
- **During that clone the server answers nothing**, not even `ping`. ultradoc
  shells out to `git` synchronously, so the process is blocked until it
  returns. Once warm this never shows up again, and a slow tool call otherwise
  never blocks a fast one.
- **The HTTP transport binds `127.0.0.1` and refuses anything else** unless you
  pass `--allow-remote`. This server clones arbitrary git URLs and reads local
  files; an exposed port is a fetch-anything primitive for whoever finds it.
  Browser `Origin`s are checked for the same reason.

## Cleaner text out of web & docs pages (optional)

Fetched pages (a `--docs-url`, the auto-discovered official docs, a `web`
result) are turned into text by a built-in zero-dependency HTML stripper. Start
the optional **self-hosted Firecrawl** and they come back as main-content
markdown rendered in a real browser instead — no nav/sidebar/cookie chrome in
the excerpts, and JS-rendered docs pages yield text at all:

```bash
node scripts/ultradoc.mjs firecrawl up        # keyless; compose profile `extract`
node scripts/ultradoc.mjs firecrawl down
```

Keyless by construction (`USE_DB_AUTHENTICATION=false`) and **never required**:
with the stack down every page falls back to the built-in extractor, and a page
Firecrawl failed on falls back with an honest dossier note. It is deliberately
its own compose profile — ~3 GB of images that `semantic up` must not drag in.
`--firecrawl off` (or `ULTRADOC_FIRECRAWL=off`) opts out; `--web-engine
firecrawl` additionally routes discovery through its keyless `/search`. See
[`docker/firecrawl/README.md`](./docker/firecrawl/README.md).

## Monorepos

Workspace monorepos (yarn/npm/pnpm workspaces, lerna, Cargo workspaces,
`go.work`, uv workspaces, Composer path repositories, Maven `<modules>`,
Gradle `include`) are detected at index time — each package's name, path and
description land in the index. Nested globs like `packages/*/plugins/*` work
too. Scope any question to one package:

```bash
node scripts/ultradoc.mjs ask \
  --repo https://github.com/socialgouv/code-du-travail-numerique \
  --q "comment l'indemnité de licenciement est-elle calculée ?" \
  --package modeles-social
# → every code/docs evidence item comes from packages/code-du-travail-modeles/
```

`--package` accepts the full name (`@socialgouv/modeles-social`), a short name
(`modeles-social`), or the directory. A wrong name fails loudly and lists the
packages that exist.

## Generate a whole-repo documentation

Beyond one-off questions, `ultradoc doc` produces a **grounded reference document**
for an entire repo (or one package) — the same retrieve → cite → verify loop,
fanned out over a section outline:

```bash
node scripts/ultradoc.mjs doc --repo https://github.com/sindresorhus/p-retry
# → builds an outline (overview · install · public API · configuration · architecture),
#   grounds a dossier per section into one evidence.json, and writes a DOC.todo.md
#   worklist under <clone>/.ultradoc/doc/.
```

The engine retrieves; you write each section into `DOC.md`, citing `[E#]` for every
claim, then `ultradoc check --run <dir>` (and `verify`) validate it exactly like an
answer — so the doc cannot drift into memory-based prose. In a monorepo,
`--package <name|dir>` scopes the doc to one package.

## Ask many questions without re-indexing

The clone and the structural index are already cached per repo. For multi-question
sessions, `overview` additionally writes a **cached markdown digest** —
what the project is, its workspace packages, layout, exported API surface and
documentation map:

```bash
node scripts/ultradoc.mjs overview --repo https://github.com/socialgouv/code-du-travail-numerique
# → <cache>/<slug>/.ultradoc/OVERVIEW.md  (reused while the commit is unchanged)
```

An agent reads `OVERVIEW.md` once to orient itself (and pick a `--package`),
then answers each question from a fresh evidence dossier. The overview is a
navigation map, not citable evidence — `check` still enforces that answers cite
retrieved evidence.

## Install as a skill

```
npx skills add maxgfr/ultradoc
```

Then ask your agent a precise question about a named open-source project — the
skill drives the retrieve → cite → verify loop for you, and refuses to answer
from memory.

## Development

```bash
pnpm install
pnpm test            # vitest — unit + offline integration (454 tests)
pnpm run typecheck
pnpm run build       # bundles src/ → scripts/ultradoc.mjs (committed, zero-dep)
pnpm run check:build # asserts the committed bundle is reproducible
```

The shipped `scripts/ultradoc.mjs` is a single dependency-free bundle that runs
on Node ≥ 18 with no install. See [`DOCUMENTATION.md`](./DOCUMENTATION.md) for the
architecture and [`references/`](./skills/ultradoc/references) for the agent playbooks.

MIT licensed.

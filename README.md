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
node scripts/ultradoc.mjs check --run <dossier-dir>
#   citations: 3 · resolved: 3 · dangling: 0
#   ✓ answer is grounded — every citation resolves to evidence
```

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
  → clone any git URL into /tmp (cached, shallow)
  → index deterministically: ripgrep + a per-language symbol index
      (optional Tier 2: local vector search — Qdrant + Ollama, in Docker, no key)
  → retrieve evidence: code · issues · PRs · docs · StackOverflow · web
  → write an evidence dossier (EVIDENCE.md + evidence.json)
  → the model writes a CITED answer (ANSWER.md)
  → `ultradoc check` verifies every citation resolves   ← the grounding guarantee
```

Two retrieval tiers:

- **Tier 1 — deterministic (default).** ripgrep + a structural symbol index
  (functions, classes, exports, …) across **15 languages** — JS/TS, Python, Go,
  Ruby, Java, Rust, C#, PHP, Swift, Kotlin, C/C++, Lua, Shell, Elixir, Scala.
  Zero dependencies, no keys, offline, reproducible.
- **Tier 2 — semantic (optional).** Fully-local vector search — Qdrant + a local
  embedding model (`nomic-embed-text`) — started with `ultradoc semantic up`. No
  key, nothing leaves your machine. Fuses with Tier 1 via Reciprocal Rank Fusion,
  and falls back to Tier 1 automatically if the stack isn't running.

## No API keys, anywhere

| Source | How (all keyless / free) |
|--------|--------------------------|
| Code | `git clone` (any host) + ripgrep + symbol index |
| Issues / PRs | GitHub via your existing `gh` login (or public REST); GitLab public REST |
| Docs | in-repo README/docs/** + an optional `--docs-url` fetch |
| StackOverflow | the keyless StackExchange API |
| Web | local SearXNG → DuckDuckGo scrape → your built-in WebSearch (whatever's available) |
| Semantic | local Docker (Qdrant + Ollama) — no key, no data leaves the machine |

## Commands

| Command | What it does |
|---------|--------------|
| `ask` | Retrieve from all selected sources → write an evidence dossier |
| `code` / `issues` / `prs` / `docs` / `so` | Drill into one source (prints evidence) |
| `web` | Keyless web discovery (SearXNG → DuckDuckGo → WebSearch) + fetch |
| `overview` | Generate a cached markdown digest of the repo (packages, layout, public API, docs map) |
| `check --run <dir>` | Validate ANSWER.md citations against the dossier |
| `index` | Build/print the structural index for a repo |
| `semantic up\|down\|status` | Manage the optional local Docker stack |

`node scripts/ultradoc.mjs --help` for every flag. Useful ones: `--sources
code,issues,prs,docs,web,so`, `--ref <branch>` (pin a version), `--package
<name|dir>` (scope a monorepo), `--docs-url <url>`, `--semantic`.

## Monorepos

Workspace monorepos (yarn/npm/pnpm workspaces, lerna, Cargo workspaces,
`go.work`) are detected at index time — each package's name, path and
description land in the index. Scope any question to one package:

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

## Ask many questions without re-indexing

The clone and the structural index are already cached per repo. For multi-question
sessions, `overview` additionally writes a **cached markdown digest** —
what the project is, its workspace packages, layout, exported API surface and
documentation map:

```bash
node scripts/ultradoc.mjs overview --repo https://github.com/socialgouv/code-du-travail-numerique
# → /tmp/ultradoc/<slug>/.ultradoc/OVERVIEW.md  (reused while the commit is unchanged)
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
pnpm test            # vitest (43 tests)
pnpm run typecheck
pnpm run build       # bundles src/ → scripts/ultradoc.mjs (committed, zero-dep)
pnpm run check:build # asserts the committed bundle is reproducible
```

The shipped `scripts/ultradoc.mjs` is a single dependency-free bundle that runs
on Node ≥ 18 with no install. See [`DOCUMENTATION.md`](./DOCUMENTATION.md) for the
architecture and [`references/`](./references) for the agent playbooks.

MIT licensed.

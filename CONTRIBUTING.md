# Contributing to ultradoc

Thanks for helping make `ultradoc` better!

## Development setup

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build        # bundles src/ → scripts/ultradoc.mjs
pnpm run check:build  # asserts the committed bundle matches source
pnpm run eval         # offline retrieval evals (fixtures, deterministic)
```

Node ≥ 18. The published `scripts/ultradoc.mjs` is a **zero-runtime-dependency**
bundle — keep it that way. Anything heavy (vector DB, embeddings, metasearch)
belongs in the engine's container stack and is reached over HTTP, never imported.

## Conventions

- **Conventional Commits.** `feat:` → minor, `fix:` → patch, `feat!:`/`BREAKING
  CHANGE` → major. semantic-release derives the version from these.
- **Always rebuild the bundle** when you touch `src/`: run `pnpm run build` and
  commit the updated `scripts/ultradoc.mjs`. CI fails if it's stale
  (`check:build`).
- **Add a test** for new behavior (`vitest`, in `tests/`). Network-dependent
  sources should be exercised offline or with mocked HTTP.
- **Ranking changes need eval evidence.** Run `pnpm run eval` (must stay 100%)
  and `pnpm run eval:network` before/after, and report the recall/MRR delta
  (see `evals/README.md`).
- Match the surrounding style: focused modules, comments that explain *why*.

## Where things live

- A new language extractor → upstream in the [codeindex engine](https://github.com/maxgfr/codeindex)
  (vendored under `src/vendor/`, re-pinned via `scripts/sync-engine.mjs`); only
  the richer JS/TS extractor lives locally in `src/lang/`.
- A new code host (issues/PRs) → `src/providers/` (+ register).
- A new evidence source → `src/sources/` (+ register in `sources/registry.ts`).
- Docs/playbooks the skill reads → `references/`.

See [`DOCUMENTATION.md`](./DOCUMENTATION.md) for the architecture.

## The vendored engines

Two engines are vendored under `src/vendor/`, each pinned by tag and SHA-256 and
inlined by tsup so the skill still ships as one file with no install:

- **codeindex** — the code you have locally.
- **webindex** — the web: HTTP, extraction, the PDF and office ladders, ranking,
  forges and package registries, the container stack, and the whole MCP protocol.

**Everything in `src/` reaches webindex through `src/engine.ts` — never
`src/vendor/*` directly.** That module calls `configure()` once, so you cannot
obtain an engine function without first importing the module that configured it.

Three scripts keep it honest, all wired into `check:build`:

| Script | What it refuses |
|---|---|
| `sync-engine.mjs --check` | A **tampered** vendor (bytes differ from the pin) or a **stale** one (pinned below `minRef`). The second matters because tsup inlines the bundle: a stale pin ships old behaviour with every test green. |
| `verify-engine-usage.mjs` | A local declaration that **shadows** an engine export — exported or not — unless it is argued for in `engine-forks.json`. Also a drop below the usage floor. |
| `verify-skill-bundle.mjs` | A skill directory that would not install. |

Two rules that are easy to get wrong:

- **Adopting an engine export and bumping `minRef` happen in the SAME commit.**
  Deleting a local copy while pinned to a release that lacks its replacement
  builds green and ships broken.
- **`engine-forks.json` is a ratchet.** Entries may leave, never arrive — each
  one carries the argument for why that fork still exists. A fork that no longer
  matches anything also fails, so the list cannot rot.

To pull a new engine release: `node scripts/sync-engine.mjs --ref vX.Y.Z`, then
`pnpm run check:build`.

## Pull requests

- Keep PRs focused. Describe the behavior change and how you verified it.
- Ensure `pnpm run typecheck && pnpm test && pnpm run check:build` all pass.

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
belongs in `docker-compose.yml` and is reached over HTTP, never imported.

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

- A new language extractor → `src/lang/` (+ register in `lang/registry.ts`).
- A new code host (issues/PRs) → `src/providers/` (+ register).
- A new evidence source → `src/sources/` (+ register in `sources/registry.ts`).
- Docs/playbooks the skill reads → `references/`.

See [`DOCUMENTATION.md`](./DOCUMENTATION.md) for the architecture.

## Pull requests

- Keep PRs focused. Describe the behavior change and how you verified it.
- Ensure `pnpm run typecheck && pnpm test && pnpm run check:build` all pass.

# Retrieval evals

Repeatable acceptance tests for ultradoc's retrieval quality. Each case runs a
real `ask` and asserts that the expected evidence surfaces — and how high it
ranks. This is what guards ranking changes (e.g. scoring tweaks) against
regressions: run before and after, compare `evals/last-run.json`.

```bash
pnpm run eval            # offline suite — fixtures only, deterministic, CI-blocking
pnpm run eval:network    # real repos — drifts with upstream, report-only
node evals/run.mjs --suite all --filter express --json
```

## Case schema

Cases live in `evals/cases/<suite>/*.json` (a file holds one case or an array):

```json
{
  "id": "lib-retry-backoff-code",
  "repo": "tests/fixtures/sample-lib",
  "question": "how does the retry backoff work?",
  "args": { "sources": "code,docs", "package": null, "perSource": 6 },
  "expect": [
    { "source": "code", "refIncludes": "src/retry.ts", "topN": 3 }
  ],
  "minItems": 2
}
```

- `args` maps to CLI flags (`sources`, `package`, `perSource`, `docsUrl`, `ref`).
- `expect[]` — each entry must surface in the dossier:
  - `refIncludes` (substring of the evidence `ref`) or `refPattern`
    (case-insensitive regex);
  - `source` restricts the pool to one source's items;
  - `topN` requires the match within the first N items of that pool (items are
    already ranked by score).
- `minItems` — minimum total evidence items (default 1; `0` asserts only that
  the run does not crash).

## Metrics

- **recall** — share of `expect` entries found anywhere in the dossier.
- **recall@N** — found within their `topN`.
- **MRR** — mean reciprocal rank of the first match (1.0 = always ranked first).

The last run's full results are written to `evals/last-run.json` (gitignored).

## Guidelines for network cases

Upstream repos evolve, so keep expectations drift-tolerant: prefer `refPattern`
and directory prefixes (`^lib/`) over exact file paths, and assert that *an*
issue matches (`issue#\\d+`) rather than a specific number. Network failures are
report-only — the suite never breaks CI.

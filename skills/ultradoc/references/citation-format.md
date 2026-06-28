# Citation format

Every factual claim in `ANSWER.md` must be followed by a citation that resolves
to an item in the run's `evidence.json`. `ultradoc check` parses these and fails
the answer if any citation is dangling or if there are none at all. This is the
mechanical guard that keeps answers grounded in retrieved evidence rather than
the model's memory.

## Canonical form — evidence ids (preferred)

Cite the bracketed id shown for each item in `EVIDENCE.md`:

```
Retries use exponential backoff that doubles each attempt and is capped [E1].
Jitter is applied by default to avoid a thundering herd [E1]. An open PR is
reworking the retry predicate [E7].
```

- One or more ids per sentence/claim: `[E1]`, `[E1][E4]`.
- Ids are stable within a run (`E1`, `E2`, …) and assigned in source order.

## Typed aliases (also accepted)

When it reads more naturally you may cite the underlying reference directly:

| Alias | Resolves against | Example |
|-------|------------------|---------|
| `[issue#123]` | an evidence item with `ref` `issue#123` | `…as reported [issue#123].` |
| `[pr#456]` | an evidence item with `ref` `pr#456` | `…being changed [pr#456].` |
| `[discussion#42]` | a GitHub Discussions evidence item | `…per the maintainer [discussion#42].` |
| `[so:11227809]` | a StackOverflow evidence item | `…per the accepted answer [so:11227809].` |
| `[code:path]` | a code item whose ref/location contains `path` | `…in [code:src/retry.ts].` |
| `[docs:x]` `[web:x]` | a docs/web item whose ref/url contains `x` | `…[docs:retry-backoff].` |
| `[release:v1.2.0]` | a release/changelog evidence item | `…added in [release:v1.2.0].` |
| `[commit:abc1234]` | a git-history evidence item | `…introduced by [commit:abc1234].` |

Prefer evidence ids — they are unambiguous and let `check` confirm coverage.

## Rules `check` enforces

- An answer with **no** citations fails.
- Any citation that does not resolve to `evidence.json` fails (a fabricated
  `[E99]`, a `[pr#5]` that wasn't retrieved, etc.).
- Markdown links `[text](url)` are **not** citations and are ignored.
- Uncited evidence is fine (informational warning only) — you needn't use it all.

## Semantic verification (beyond resolution)

`check` proves a citation *resolves* to an evidence item; it does not prove the
item *supports* the claim. `verify` closes that gap:

- `verify --run <dir>` pairs every (claim, cited evidence) with the item's
  snippet (`VERIFY.todo.json` / `VERIFY.md`).
- You adjudicate each: `supported` · `partial` · `unsupported` · `refuted`
  (+ a short note), and save the filled file.
- `verify --apply <verdicts.json>` then `check --semantic` **fail** when a
  claim's cited evidence refutes it, or when every cited item is unsupported —
  on top of the resolution gate, never relaxing it.

## Good practice

- Pin version-sensitive claims to the commit in `meta.json`.
- If the evidence doesn't support a claim, don't make it — retrieve more or state
  the unknown explicitly.

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
| `[code:path]` | a code item at that **full path or a trailing path segment** | `…in [code:src/retry.ts]` or `[code:retry.ts]`. |
| `[docs:path]` | a docs item at that path (segment) | `…[docs:docs/guide.md].` |
| `[web:url]` | a web item at that url (scheme/trailing-slash ignored) | `…[web:qdrant.tech/docs].` |
| `[release:v1.2.0]` | a release item with that tag (a leading `v` is optional) | `…added in [release:v1.2.0].` |
| `[commit:abc1234]` | a git-history item whose sha starts with that prefix (≥7 hex) | `…introduced by [commit:abc1234].` |

Typed aliases are matched **strictly**: a path must be a full path or a trailing
segment (`[code:index]` does **not** resolve `src/index/search.ts` — write
`[code:search.ts]` or the id), a number/tag/sha must match exactly. When in
doubt, cite the evidence id.

## Rules `check` enforces

- An answer with **no** citations fails.
- Any citation that does not resolve to `evidence.json` fails (a fabricated
  `[E99]`, a `[pr#5]` that wasn't retrieved, a vague `[code:foo]`, etc.).
- **Coverage:** most claim units must carry a citation. `check` fails when the
  cited fraction drops below `--coverage-min` (default 0.7); `check --strict`
  requires **every** claim to be cited (use it for `ask` answers — docs prose may
  keep the default). This is what stops "one real `[E1]` + paragraphs of memory".
- A citation that appears **only inside a code fence** or inline code does not
  ground a claim (warned; an error under `--strict`).
- Markdown links `[text](url)` are **not** citations and are ignored.
- Uncited evidence is fine (informational warning only) — you needn't use it all.
- **Excerpt re-validation:** when `meta.json` records a clone whose HEAD still
  matches the dossier's commit, every code/docs item's `path:start-end` must
  exist in that clone and the stored snippet must match those lines. A corrupted
  or stale dossier **fails**; a moved HEAD or an evicted clone downgrades to a
  warning naming the skipped gate (re-run `ask` to rebuild). This catches a
  real-file-but-wrong-line citation, which resolution alone cannot.
- **Issue/PR-only grounding:** a claim whose only support is an issue or PR is
  warned — a tracker thread describes behavior at a point in time; cross-check
  the current source and cite the code or the fixing release alongside.

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
- `check --semantic` is **fail-closed**: with no `VERIFY.json` (or one recording
  no verdicts) it exits non-zero, so a passing semantic exit always means the
  support gate actually ran. Pass `--allow-unverified` to skip it explicitly.
  The gate re-reduces pass/fail from the verdict list, so a hand-edited
  `ok: true` over refuted verdicts cannot slip through.

## Good practice

- Pin version-sensitive claims to the commit in `meta.json`.
- If the evidence doesn't support a claim, don't make it — retrieve more or state
  the unknown explicitly.

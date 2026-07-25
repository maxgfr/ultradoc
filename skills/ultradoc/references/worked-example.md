# One run, end to end

A real (abridged) run of the whole loop, so the shape of a passing answer is
never a guess. Question: *"How does the retry backoff work, and which HTTP
statuses are retried?"*

## 1 · Retrieve

```
node scripts/ultradoc.mjs ask --repo <url> \
  --q "how does the retry backoff work, and which HTTP statuses are retried" \
  --sources code,docs
```

```
ultradoc: 6 evidence item(s) for "how does the retry backoff work…"
  repo:     <url> @ 4f2a91c (github)
  sources:  code: 5 · docs: 1
  dossier:  <clone>/.ultradoc/runs/run-20260608-113619
  next:     read …/EVIDENCE.md, write ANSWER.md (cite [E#]), then:
            ultradoc check --run …/run-20260608-113619
```

No `notes:` block ⇒ nothing bounded this run. Had one appeared, it would be read
first (`reading-evidence.md`).

## 2 · Read and triage

```
### [E1] src/retry.ts — interface RetryOptions
ref: `src/retry.ts` · loc: `src/retry.ts:1-19` · score: 20.5

export const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 5, baseDelayMs: 200, maxDelayMs: 10_000, jitter: true,
};
// Compute the exponential backoff delay for a given attempt. The delay doubles
// each attempt (2^attempt * base), is capped at maxDelayMs, and — when jitter
// is enabled — is randomized in [delay/2, delay] …
export function computeBackoff(attempt: number, opts: RetryOptions): number {
```

`[E1]` is symbol-anchored and its body names the mechanism → **cite it**. `[E6]`
(the README section) documents the same policy → cite alongside, as
docs-agree-with-code. `[E4]` is `package.json` — a keyword coincidence →
**discard**, do not cite.

## 3 · Write `ANSWER.md` (in the run folder)

```markdown
# How does the retry backoff work, and which HTTP statuses are retried?

**Backoff is exponential with optional jitter.** `computeBackoff` doubles the
delay each attempt (`baseDelayMs * 2 ** attempt`), capped at `maxDelayMs`; when
`jitter` is enabled it randomizes the result into `[delay/2, delay]` to avoid a
thundering herd of clients retrying in lockstep [E1]. The defaults are
`maxRetries: 5`, `baseDelayMs: 200`, `maxDelayMs: 10_000`, `jitter: true` [E1].

**Only transient failures are retried.** `isRetryable` returns true for a
network-level `0`, `429` (rate limit), and any `5xx`; every other `4xx` is
treated as permanent and is not retried [E1].

The README documents the same policy in prose [E6].

## Unknowns

Whether `Retry-After` is honoured — no code or doc in the repo mentions it.

<!-- Verified against commit 4f2a91c. -->
```

Lead line answers the question **and cites** — `--strict` counts it like any
other claim. One claim per sentence. Identifiers and defaults quoted verbatim
from the excerpt, not paraphrased. The `## Unknowns` heading is exempt from the
coverage gate, and the commit pin sits in an HTML comment (`check` ignores
comments; a bare "Verified against …" sentence would fail `--strict` as uncited).

## 4 · Structural gate

```
$ node scripts/ultradoc.mjs check --run <run> --strict
ultradoc check: <run>
  citations: 2 · resolved: 2 · dangling: 0
  coverage:  3/3 claim(s) cited (100%)
  evidence:  re-validated 6/6 code/docs excerpt(s) against the pinned clone
  ⚠ 4 evidence item(s) were not cited (informational).
  ✓ answer is grounded — every citation resolves to evidence
```

Uncited *items* are fine. Uncited *claims* are not — that is what `--strict`
catches. `re-validated N/N` is the line to look for: it means every cited
excerpt still matches the pinned clone line-for-line. If it says *skipped*, the
strongest structural gate did not run (`reading-evidence.md`).

## 5 · Support gate

```
$ node scripts/ultradoc.mjs verify --run <run>
```

`VERIFY.md` pairs each claim with the snippet it cites:

```
## C2 · E1 (code · src/retry.ts)
**Claim:** The defaults are `maxRetries: 5`, `baseDelayMs: 200`, …
**Cited evidence:** export const DEFAULT_RETRY: RetryOptions = { maxRetries: 5, …
**Verdict:** _____ · **Note:** _____
```

Judge as a skeptic — `unsupported` unless the digest *literally* backs the claim.
Collect every verdict into **one** `verdicts.json`:

```json
{ "pairs": [
  { "claimId": "C2", "evidenceId": "E1", "verdict": "supported",
    "note": "DEFAULT_RETRY literally lists all four values" }
] }
```

```
$ node scripts/ultradoc.mjs verify --apply verdicts.json --run <run>
$ node scripts/ultradoc.mjs check --semantic --run <run>
```

A `partial` verdict is not a failure to hide — it is an instruction to weaken the
claim to what the snippet actually says, then re-verify.

## 6 · Present

> Retries use **exponential backoff with jitter**. `computeBackoff` doubles the
> delay each attempt (`baseDelayMs * 2 ** attempt`), caps it at `maxDelayMs`, and
> randomizes it into `[delay/2, delay]` when `jitter` is on (default) —
> [src/retry.ts:1-19](https://github.com/…/blob/4f2a91c/src/retry.ts#L1-L19).
> Defaults: `maxRetries: 5`, `baseDelayMs: 200`, `maxDelayMs: 10_000`.
> Only transient failures retry: network errors, `429`, and `5xx`; other `4xx`
> are permanent. The README documents the same policy.
>
> Verified against commit `4f2a91c` (`check --strict` + `check --semantic` pass).
> Not settled by the evidence: whether `Retry-After` is honoured — no code or doc
> in the repo mentions it.

The unknown is stated, not filled. That last paragraph is the part a memory-based
answer never has.

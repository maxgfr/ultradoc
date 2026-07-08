# How does the retry backoff work, and which HTTP statuses are retried?

**Backoff is exponential with optional jitter.** `computeBackoff` doubles the
delay each attempt (`baseDelayMs * 2 ** attempt`), capped at `maxDelayMs`; when
`jitter` is enabled it randomizes the result into `[delay/2, delay]` to avoid a
thundering herd of clients retrying in lockstep [E1]. The defaults are
`maxRetries: 5`, `baseDelayMs: 200`, `maxDelayMs: 10_000`, `jitter: true` [E1].

**Only transient failures are retried.** `isRetryable` returns true for a
network-level `0`, `429` (rate limit), and any `5xx`; every other `4xx` is
treated as permanent and is not retried [E1]. `retryRequest` loops until either a
non-retryable status or `maxRetries` is reached, sleeping `computeBackoff(attempt)`
between tries and reporting the attempt count [E1].

The README documents the same policy in prose — exponential backoff that doubles
and is capped, jitter on by default, and retries limited to network errors,
`429`, and `5xx` [E6].

<!-- Verified against the indexed `sample-lib` fixture. Every claim above is
grounded in the cited evidence (`ultradoc check --strict` passes). -->


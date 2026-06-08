# Evidence dossier

**Question:** How does the retry backoff work, and which HTTP statuses are retried?
**Repo:** tests/fixtures/sample-lib · **host:** local
**Sources:** code, docs · **semantic:** off · **built:** 2026-06-08T11:36:19.635Z

> Ground every claim in the answer in this evidence. Cite items by id, e.g. `[E1]`. Do not assert anything you cannot tie to an item below. Write the answer to `ANSWER.md` in this folder, then run `ultradoc check`.

## Code

### [E1] src/retry.ts — interface RetryOptions
ref: `src/retry.ts` · loc: `src/retry.ts:1-19` · score: 20.5

```
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 5,
  baseDelayMs: 200,
  maxDelayMs: 10_000,
  jitter: true,
};

// Compute the exponential backoff delay for a given attempt. The delay doubles
// each attempt (2^attempt * base), is capped at maxDelayMs, and — when jitter
// is enabled — is randomized in [delay/2, delay] to avoid thundering-herd
// retries hammering the server in lockstep.
export function computeBackoff(attempt: number, opts: RetryOptions): number {
```

### [E2] src/client.ts — class HttpClient
ref: `src/client.ts` · loc: `src/client.ts:8-25` · score: 16.7

```
// A tiny HTTP client that wraps every GET in the retry/backoff policy.
export class HttpClient {
  private baseUrl: string;
  private retry: RetryOptions;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.retry = { ...DEFAULT_RETRY, ...opts.retry };
  }

  async get(path: string): Promise<{ status: number; value: string; attempts: number }> {
    return retryRequest(async () => {
      const res = await fetch(`${this.baseUrl}${path}`);
      return { status: res.status, value: await res.text() };
    }, this.retry);
  }
}

```

### [E3] src/index.ts — match
ref: `src/index.ts` · loc: `src/index.ts:1-9` · score: 11.8

```
export { HttpClient } from "./client.js";
export {
  retryRequest,
  computeBackoff,
  isRetryable,
  DEFAULT_RETRY,
  type RetryOptions,
} from "./retry.js";

```

### [E4] package.json — match
ref: `package.json` · loc: `package.json:1-7` · score: 9.4

```
{
  "name": "sample-lib",
  "version": "1.0.0",
  "description": "A tiny HTTP client with retry + exponential backoff, used as an ultradoc test fixture.",
  "type": "module",
  "main": "src/index.ts"
}
```

### [E5] README.md — match
ref: `README.md` · loc: `README.md:1-25` · score: 8.55

```
# sample-lib

A tiny HTTP client with automatic retries.

## Retry and backoff

Failed requests are retried with **exponential backoff**. The delay starts at
`baseDelayMs` and doubles on every attempt (`2^attempt * base`), capped at
`maxDelayMs`. When `jitter` is enabled (the default), the delay is randomized
between half and the full computed value to avoid a thundering herd of clients
retrying in lockstep.

Only transient failures are retried: network errors, HTTP `429` (rate limit),
and `5xx` responses. Other `4xx` statuses are considered permanent and are not
retried.

```ts
import { HttpClient } from "sample-lib";

const client = new HttpClient({
  baseUrl: "https://api.example.com",
  retry: { maxRetries: 5, baseDelayMs: 200, maxDelayMs: 10_000, jitter: true },
});

const res = await client.get("/users");
```

## Documentation

### [E6] README.md (in-repo docs)
ref: `README.md` · loc: `README.md:1-18` · score: 19

```
# sample-lib

A tiny HTTP client with automatic retries.

## Retry and backoff

Failed requests are retried with **exponential backoff**. The delay starts at
`baseDelayMs` and doubles on every attempt (`2^attempt * base`), capped at
`maxDelayMs`. When `jitter` is enabled (the default), the delay is randomized
between half and the full computed value to avoid a thundering herd of clients
retrying in lockstep.

Only transient failures are retried: network errors, HTTP `429` (rate limit),
and `5xx` responses. Other `4xx` statuses are considered permanent and are not
retried.

```ts
import { HttpClient } from "sample-lib";
```

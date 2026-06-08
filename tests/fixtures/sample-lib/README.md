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
console.log(res.status, res.attempts);
```

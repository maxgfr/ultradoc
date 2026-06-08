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
  const exp = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt);
  if (!opts.jitter) return exp;
  return exp / 2 + Math.random() * (exp / 2);
}

// Whether an HTTP status should be retried: network-level 0, 429 (rate limit),
// and 5xx. 4xx other than 429 are treated as permanent.
export function isRetryable(status: number): boolean {
  return status === 0 || status === 429 || (status >= 500 && status < 600);
}

// Retry an async request with exponential backoff. Stops after maxRetries or on
// a non-retryable status, returning the last result either way.
export async function retryRequest<T>(
  fn: () => Promise<{ status: number; value: T }>,
  opts: RetryOptions = DEFAULT_RETRY,
): Promise<{ status: number; value: T; attempts: number }> {
  let attempt = 0;
  let last: { status: number; value: T };
  do {
    last = await fn();
    if (!isRetryable(last.status)) break;
    if (attempt >= opts.maxRetries) break;
    await sleep(computeBackoff(attempt, opts));
    attempt++;
  } while (true);
  return { ...last, attempts: attempt + 1 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

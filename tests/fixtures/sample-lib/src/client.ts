import { retryRequest, DEFAULT_RETRY, type RetryOptions } from "./retry.js";

export interface ClientOptions {
  baseUrl: string;
  retry?: Partial<RetryOptions>;
}

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

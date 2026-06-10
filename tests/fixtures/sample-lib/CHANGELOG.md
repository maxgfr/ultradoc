# Changelog

## [0.3.0] - 2024-05-01

- Add a request timeout option to the client.

## [0.2.0] - 2024-03-10

- Add exponential retry backoff with jitter (`computeBackoff`).
- Cap the backoff delay at `maxDelayMs`.

## [0.1.0] - 2024-01-15

- Initial release: HTTP client with basic retries.

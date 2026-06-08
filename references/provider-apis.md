# Provider APIs (issues & PRs) — keyless

Cloning is provider-agnostic (plain `git clone` of any public URL). Only
issues/PRs need a host API. `ultradoc` selects a provider by the repo's host and
queries it **without requiring any API key**. Hosts with no public API degrade
honestly (the dossier says so) rather than pretending a search happened.

## GitHub (`github.com` and Enterprise)

- **Preferred:** the `gh` CLI (`gh api search/issues`). This reuses the user's
  existing `gh` authentication — no new key — and gets authenticated rate limits.
  Install/login: `gh auth login`.
- **Fallback:** the public REST search endpoint
  `https://api.github.com/search/issues`, unauthenticated. Works for public
  repos at a low rate (~10 search req/min); fine for a handful of queries.
- **Query shape:** `repo:<owner>/<repo> type:issue|pr <keywords>`, sorted by
  recently updated.
- **Progressive relaxation:** GitHub free-text search ANDs its terms, so a query
  with many keywords over-constrains to zero. `ultradoc` tries the 3 most
  *distinctive* keywords, then 2, then each top keyword on its own, taking the
  first non-empty result. (A very specific term like `429` may have zero PRs
  while `retry` matches — the fallbacks catch that.)

## GitLab (`gitlab.com`, self-managed)

- Public REST v4, unauthenticated read of public projects.
- Project addressed by URL-encoded full path, so **subgroups** work:
  `/api/v4/projects/<group%2Fsub%2Frepo>/issues` and `/merge_requests`.
- `search=<keywords>`, ordered by `updated_at`.

## Other hosts (Bitbucket, Gitea, bare URLs, …)

- No issue/PR API is queried. The code is still cloned and indexed; the dossier
  notes that issues/PRs are not retrievable for that host. To add a host, drop a
  new provider in `src/providers/` and register it (same registry pattern as the
  language extractors).

## Local checkouts

A question asked against a local path (`--repo /path/to/checkout`) still pulls
issues/PRs: `ultradoc` reads the checkout's `origin` remote and routes to the
matching provider.

## StackOverflow

Not a git host, but retrieved the same keyless way via the StackExchange API —
see `web-discovery.md` and `src/sources/stackoverflow.ts`. Anonymous access is
rate-limited (page ≤ 25, ~1 req/min); an optional `STACK_PAT` env var raises the
limit but is never required.

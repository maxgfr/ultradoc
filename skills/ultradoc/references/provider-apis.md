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
  repos at a low rate (~10 search req/min); fine for a handful of queries. Set
  `GITHUB_TOKEN` (optional) to lift that limit. A rate-limited response
  short-circuits the relaxation loop (with a note) instead of burning quota.
- **Query shape:** `repo:<owner>/<repo> type:issue|pr <keywords>`, sorted by
  recently updated.
- **Progressive relaxation:** GitHub free-text search ANDs its terms, so a query
  with many keywords over-constrains to zero. `ultradoc` tries the 3 most
  *distinctive* keywords, then 2, then each top keyword on its own, taking the
  first non-empty result. (A very specific term like `429` may have zero PRs
  while `retry` matches — the fallbacks catch that.)

## GitHub Releases (`releases` source)

- Keyless REST: `GET /repos/{owner}/{repo}/releases?per_page=20` (60 req/h
  unauthenticated; one request per ask). `gh api` is preferred when logged in.
- Release notes are filtered by the question's keywords; the repo's own
  CHANGELOG is parsed offline regardless of host, so non-GitHub repos still get
  version evidence.

## GitHub Discussions (`discussions` source)

- GraphQL only — **no keyless access**, so this source requires the `gh` CLI
  (`gh auth login`). Without it, the source skips with an honest note.
- `search(type: DISCUSSION)` with the same progressive keyword relaxation as
  issues/PRs; the accepted answer (when any) is included in the snippet.

## Git history (`history` source)

- Not an API at all: `git log -S/-G` (pickaxe) on the local clone — zero
  network for local repos. Remote clones are `--depth 1 --filter=blob:none`,
  which pickaxe can't use, so the first `history` call fetches full history
  once (`fetch --refetch --unshallow`); on failure it degrades with a note.

## GitLab (`gitlab.com`, self-managed)

- Public REST v4, unauthenticated read of public projects (optional `GITLAB_TOKEN`
  sent as `PRIVATE-TOKEN` to read private projects / lift limits).
- Project addressed by URL-encoded full path, so **subgroups** work:
  `/api/v4/projects/<group%2Fsub%2Frepo>/issues` and `/merge_requests`.
- `search=<keywords>`, ordered by `updated_at`, with the **same progressive
  relaxation** as GitHub (top-3 → top-2 → pooled single terms) and a
  keyword-coverage rerank — GitLab's `search` is substring-ish, so ANDing many
  keywords over-constrains. Results are re-scored by rank (GitLab exposes none).

## Gitea / Forgejo / Codeberg

- Stable keyless REST v1: `GET /api/v1/repos/{owner}/{repo}/issues?q=&type=issues|pulls&state=all`.
- Auto-selected for `codeberg.org` and any host whose domain contains
  `gitea`/`forgejo`. Same relaxation ladder + coverage rerank + rank scoring as
  GitLab.

## Other hosts (Bitbucket, bare URLs, …)

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

## Firecrawl (self-hosted extraction + search)

- **Not a provider** in the issues/PRs sense — a local service ultradoc speaks
  HTTP to (`src/sources/firecrawl.ts`), started with `ultradoc firecrawl up`.
- **Keyless.** `USE_DB_AUTHENTICATION=false` disables auth, so no
  `Authorization` header is sent. `ULTRADOC_FIRECRAWL_KEY` exists only so the
  same client can point at Firecrawl **Cloud**; it is never needed self-hosted.
- **Endpoints used:** `GET /` (2 s liveness probe, memoised per run),
  `POST {/v2|/v1}/scrape` (one page per call, `formats: ["markdown"]`,
  `onlyMainContent: true`, `maxAge` = the page-cache TTL) and — only under
  `--web-engine firecrawl` — `POST {/v2|/v1}/search`. `/v2` is tried first and a
  404 pins `/v1` for the process. `/batch/scrape` is deliberately unused: it is
  an async job that must be polled, which buys nothing for the handful of pages
  a dossier grounds.
- **Failure is a note, never an error.** Unreachable ⇒ the built-in HTML
  extractor; a per-page failure ⇒ the built-in extractor plus a dossier note.
  See `web-discovery.md`.

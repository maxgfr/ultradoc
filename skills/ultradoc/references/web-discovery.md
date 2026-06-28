# Web discovery — layered & keyless

For questions the repo, issues, PRs and in-repo docs can't fully answer
(conceptual topics, cross-library comparisons, external official docs), the
`web` source finds and grounds pages. Discovery is **layered and entirely
keyless/free** — `ultradoc` uses whatever is available, in this order. Fetching
and text extraction of the chosen URLs is always done by the script.

## The layers (`--web-engine auto`, the default)

1. **SearXNG (local, Docker).** If a SearXNG instance is reachable (default
   `http://localhost:8888`, override with `ULTRADOC_SEARXNG`), it's queried over
   HTTP (`/search?format=json`). Self-hosted metasearch, no key, nothing leaves
   the machine. Brought up by `ultradoc semantic up` (see `semantic-setup.md`).
2. **DuckDuckGo HTML (no Docker).** Scrapes `html.duckduckgo.com/html` and
   decodes the real URLs from DDG's redirector. Autonomous and keyless; a bit
   fragile if DDG changes its markup.
3. **Claude WebSearch (harness).** If neither keyless engine returns results,
   the source emits a note telling you to use your built-in **WebSearch** to find
   URLs, then ground them with:
   ```
   node scripts/ultradoc.mjs web --repo <repo> --url <url1,url2,...>
   ```

## Pinning an engine

`--web-engine searxng|ddg|claude|auto`:
- `searxng` — only the local instance (errors with a hint if it's down).
- `ddg` — only DuckDuckGo scraping.
- `claude` — skip keyless discovery; just emit the WebSearch hint (use when you
  want to drive discovery yourself and feed `--url`).
- `auto` (default) — SearXNG → DuckDuckGo → WebSearch hint.

## Fetching specific pages

You can always ground an exact page without discovery:
```
node scripts/ultradoc.mjs web --repo <repo> --q "<question>" --url https://docs.example.com/page
```
The page is fetched, stripped to readable text, and excerpted around the
question's keywords into `web` evidence you can cite.

## StackOverflow

Handled by the separate `so` source via the keyless StackExchange API — see
`provider-apis.md`.

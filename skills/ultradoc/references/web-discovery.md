# Web discovery — layered & keyless

For questions the repo, issues, PRs and in-repo docs can't fully answer
(conceptual topics, cross-library comparisons, external official docs), the
`web` source finds and grounds pages. Discovery is **layered and entirely
keyless/free** — `ultradoc` uses whatever is available, in this order. Fetching
and text extraction of the chosen URLs is always done by the script.

Discovery (which URLs) and **extraction** (what text comes out of them) are
separate concerns: see *Extraction* at the bottom for the Firecrawl layer, which
applies to every fetched page whatever engine found it.

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

`--web-engine searxng|ddg|claude|firecrawl|auto`:
- `searxng` — only the local instance (errors with a hint if it's down).
- `ddg` — only DuckDuckGo scraping.
- `claude` — skip keyless discovery; just emit the WebSearch hint (use when you
  want to drive discovery yourself and feed `--url`).
- `firecrawl` — the self-hosted Firecrawl's own `/search` (keyless; it cascades
  to SearXNG then DuckDuckGo **server-side**). Needs `ultradoc firecrawl up`;
  with the stack down it degrades with a note and returns nothing.
- `auto` (default) — SearXNG → DuckDuckGo → WebSearch hint. **Unchanged**:
  `firecrawl` is explicit-only, because its cascade ends at the same two engines
  `auto` already reaches directly, without needing a container.

## Fetching specific pages

You can always ground an exact page without discovery:
```
node scripts/ultradoc.mjs web --repo <repo> --q "<question>" --url https://docs.example.com/page
```
The page is fetched, extracted to readable text, and excerpted around the
question's keywords into `web` evidence you can cite.

## Extraction — Firecrawl, then the built-in stripper

Every page ultradoc fetches (a `--docs-url`, an auto-discovered docs page, a web
result) goes through the same two-layer extractor:

1. **Self-hosted Firecrawl** (`ultradoc firecrawl up`, keyless, `localhost:3002`).
   Renders the page in a real browser and returns **main-content markdown**.
2. **The built-in HTML stripper** (zero-dep regex). Always available, always the
   fallback.

**What layer 1 actually buys, measured** — 14 varied documentation pages against
layer 2: median **235 ms → 693 ms** per page (**≈3× slower**) for **~30 % fewer**
navigation-chrome markers overall. That average hides the shape: 3 of 13 pages
improved clearly, 9 were unchanged, 1 got slightly worse. Where it wins it wins
big — nav preambles of 10, 13 and 29 lines collapsing to 0 — and it wins outright
on pages layer 2 cannot read: genuinely client-rendered SPAs, consent walls,
anti-bot interstitials. Many framework docs sites are server-rendered, and layer
2 handles those perfectly well.

So the honest guidance is: bring the stack up when a repo's docs site is fighting
you, not as a permanent tax on every `ask`. `--firecrawl off` opts out per run.

The stack is probed once per run (2 s). Down, or not installed ⇒ layer 2, no
note (a machine without the container is not a degraded run). Up but failing on
a page ⇒ layer 2 **with a note** naming what happened. Pinned explicitly
(`--firecrawl <url>` or `ULTRADOC_FIRECRAWL`) and unreachable ⇒ layer 2 with a
note. Extraction never blocks an answer.

```
node scripts/ultradoc.mjs firecrawl up            # ~3 GB, 5 containers, profile `extract`
node scripts/ultradoc.mjs firecrawl status|down
node scripts/ultradoc.mjs ask --repo <url> --q "…" --firecrawl off   # opt out for one run
```

Fetched pages are cached by **URL + extractor** (`ULTRADOC_EXTDOCS_TTL_HOURS`,
default 168 h) — external docs beside the clone, web pages under the shared
cache root. The extractor is part of the key on purpose: otherwise a week-old
regex-stripped copy would shadow Firecrawl for the whole TTL after you start the
stack.

> Changing the extractor changes the text, and therefore the `#~<line>` soft
> anchors in `web`/`docs` evidence. Dossiers written before the switch will not
> re-resolve against a Firecrawl-extracted page — re-run `ask` rather than
> re-checking an old run.

`docker/firecrawl/README.md` covers the containers, the smoke test and the
tunables.

## StackOverflow

Handled by the separate `so` source via the keyless StackExchange API — see
`provider-apis.md`.

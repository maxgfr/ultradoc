# Self-hosted Firecrawl — the `extract` profile

A local, **keyless** content-cleaning service. `ultradoc` sends it a URL and gets
back main-content markdown, instead of running the built-in regex HTML stripper
(`src/sources/fetch.ts`) over the raw page. That matters twice: nav/sidebar/cookie
chrome stops polluting the excerpts, and a JS-rendered docs page yields text at
all — the stripper sees an empty `<div id="app">`.

## Keyless by construction

`USE_DB_AUTHENTICATION=false` (in `firecrawl.env`) disables auth, so no
`Authorization` header is sent or required. `/search` is keyless too: Firecrawl
cascades Fire-Engine → SearXNG (`SEARXNG_ENDPOINT`, pointed at the `searxng`
service in the same compose file) → DuckDuckGo.

If you would rather point the same client at Firecrawl Cloud, set
`ULTRADOC_FIRECRAWL=https://api.firecrawl.dev` and `ULTRADOC_FIRECRAWL_KEY=fc-…`;
the key is sent as a bearer token and is never needed self-hosted.

## What it costs

Five containers (api + playwright + redis + rabbitmq + postgres), ~3 GB of
images, ~4 GB of RAM under load. That is why it lives in its **own** profile and
is deliberately **not** part of `--profile all` — `ultradoc semantic up` must
stay cheap.

## Up / down / status

```bash
node scripts/ultradoc.mjs firecrawl up       # docker compose --profile extract up -d --wait
node scripts/ultradoc.mjs firecrawl status
node scripts/ultradoc.mjs firecrawl down
```

`up` pulls first on a generous budget (`ULTRADOC_DOCKER_PULL_TIMEOUT_MS`), then
waits for every healthcheck. Run it alongside the `search` profile so `/search`
has SearXNG behind it:

```bash
docker compose --profile search --profile extract up -d --wait
```

## Smoke test

```bash
curl -s http://localhost:3002/ | head -c 80
# {"message":"Firecrawl API",...}

curl -s -X POST http://localhost:3002/v2/scrape \
  -H 'content-type: application/json' \
  -d '{"url":"https://expressjs.com/en/guide/migrating-5.html","formats":["markdown"],"onlyMainContent":true}' \
  | head -c 300
```

## When it is down

Nothing breaks. `ultradoc` probes `GET /` once per run (2 s); a refused
connection means it never asks again and every page goes through the built-in
extractor. The dossier says so in its retrieval notes whenever the base was
pinned explicitly, and a page that Firecrawl accepted-but-failed always falls
back with a note naming what happened. Extraction is a quality layer, never a
dependency.

`ULTRADOC_FIRECRAWL=off` disables it outright, without stopping the containers.

## Admin

The queue dashboard is at `http://localhost:3002/admin/CHANGEME/queues` — change
`BULL_AUTH_KEY` in `firecrawl.env` if that bothers you.

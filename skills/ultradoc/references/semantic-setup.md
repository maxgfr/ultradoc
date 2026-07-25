# Semantic mode & local web search (optional, fully local, no key)

Tier-1 retrieval (ripgrep + a structural symbol index) is the default and needs
nothing. **Semantic mode** (`--semantic`) adds vector search for questions whose
wording won't lexically match the code. Everything runs locally — **no API key,
no data leaves your machine** — and the published `ultradoc.mjs` bundle stays
dependency-free.

## Which tier answers which question

Three keyless backends. They differ in what they embed, which decides what they
can find — not just in how hard they are to set up.

| Tier | Enable with | Embeds | Answers |
|------|-------------|--------|---------|
| `static` | `semantic pull` (~21 MB, once per machine, **no container**) | symbol names, signatures, file summaries | *which declaration is this about* |
| `endpoint` | `CODEINDEX_EMBED_ENDPOINT=<url>` | same units, your model | same, with a model you control |
| `docker` | `semantic up` (Qdrant + Ollama) | the **real content** of code and docs, in 60-line chunks | *why is it built this way*, rationale, prose |

`--semantic-tier auto` (the default) tries `endpoint` → `static` → `docker`, so
the backend that needs no infrastructure runs first. Any tier can be forced:
`--semantic-tier docker`, `--semantic-tier static`, `--semantic-tier off`. An
explicitly requested tier never silently falls through to another one — it fails
with a note naming what would enable it.

**Choosing deliberately.** The keyless tiers embed a symbol's *name and
signature*, so "which helper works out how long to wait before trying again"
finds `computeBackoff` — a question no lexical wording reaches. They do **not**
embed implementation prose, so "why was retry built around a jittered backoff"
is beyond them by construction; that needs `docker`, whose chunks contain the
actual code and docs. When the static tier runs, its dossier note says exactly
this, so a thin result is never mistaken for an absent answer.

## The static tier (no container)

```
node scripts/ultradoc.mjs semantic pull                     # once per machine
node scripts/ultradoc.mjs ask --repo <url> --q "..." --semantic
```

`pull` fetches the model published by the vendored codeindex engine into
ultradoc's cache root (`<cache>/models/model.json`) and verifies its sha256
before writing anything — a silently wrong model would produce plausible but
meaningless rankings. `semantic status` reports whether it is present.

The per-repo embedding index is built on the first `--semantic` question and
persisted next to the clone (`.ultradoc/embeddings.bin`, ~589 KB on hono),
keyed by commit and tier, so only that first question pays for it.

## The Docker tier (strongest)

```
node scripts/ultradoc.mjs semantic up                       # qdrant + ollama + searxng
node scripts/ultradoc.mjs ask --repo <url> --q "..." --semantic --semantic-tier docker
node scripts/ultradoc.mjs semantic down
```

`docker-compose.yml` defines three services:

| Service | Image | Port | Role |
|---------|-------|------|------|
| `qdrant` | `qdrant/qdrant` | 6333 | vector database (Apache-2.0) |
| `ollama` | `ollama/ollama` | 11434 | local embedding model server |
| `searxng` | `searxng/searxng` | 8888 | keyless metasearch for `web` discovery |

Default embedding model: **`nomic-embed-text`** (137M, CPU-friendly, strong on
specific code lookups). Override with `ULTRADOC_EMBED_MODEL`.

`semantic up` runs `docker compose --profile all up -d` then
`ollama pull nomic-embed-text`. To start a subset directly:

```
docker compose --profile semantic up -d     # qdrant + ollama only
docker compose --profile search up -d       # searxng only
```

On the first `docker`-tier run for a repo, ultradoc chunks the code + docs at
symbol boundaries, embeds each chunk via Ollama, and upserts the vectors into a
per-repo Qdrant collection (`ultradoc_<slug>`). A marker
(`.ultradoc/semantic.json`) records the commit so later runs reuse the index.

**SearXNG is worth `semantic up` on its own**: it is what the `web` source uses
for keyless discovery, independently of which vector tier you run.

## Any embedding server (the `endpoint` tier)

Point `CODEINDEX_EMBED_ENDPOINT` at any server exposing the engine's embed API —
for example the HuggingFace Text-Embeddings-Inference CPU image:

```
docker run -p 8756:80 ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
  --model-id BAAI/bge-small-en-v1.5
export CODEINDEX_EMBED_ENDPOINT=http://localhost:8756
```

ultradoc probes it before use; unreachable means the cascade moves on.

## Fallback is always safe

With no backend available, `--semantic` logs a note naming the command that
would enable one and **falls back to Tier-1**. The answer is never blocked, and
a degraded run always says so in the dossier notes.

## Environment overrides

| Var | Default | Meaning |
|-----|---------|---------|
| `CODEINDEX_EMBED_ENDPOINT` | — | embedding server for the `endpoint` tier |
| `ULTRADOC_QDRANT` | `http://localhost:6333` | Qdrant base URL |
| `ULTRADOC_OLLAMA` | `http://localhost:11434` | embedding server base URL |
| `ULTRADOC_EMBED_MODEL` | `nomic-embed-text` | Docker-tier embedding model id |
| `ULTRADOC_MAX_CHUNKS` | `800` | cap on chunks embedded per repo (Docker tier) |
| `ULTRADOC_SEARXNG` | `http://localhost:8888` | SearXNG base URL for `web` |
| `ULTRADOC_CACHE_DIR` | per-user cache | also where the static model is stored |

# Semantic mode & local web search (optional, fully local, no key)

Tier-1 retrieval (ripgrep + a structural symbol index) is the default and needs
nothing. **Semantic mode** adds vector search for fuzzier, conceptual questions
where the wording won't lexically match the code. Everything runs in local
Docker containers — **no API key, no data leaves your machine**. The published
`ultradoc.mjs` bundle stays dependency-free; it only speaks HTTP to localhost.

## The stack

`docker-compose.yml` defines three services:

| Service | Image | Port | Role |
|---------|-------|------|------|
| `qdrant` | `qdrant/qdrant` | 6333 | vector database (Apache-2.0) |
| `ollama` | `ollama/ollama` | 11434 | local embedding model server |
| `searxng` | `searxng/searxng` | 8888 | keyless metasearch for `web` discovery |

Default embedding model: **`nomic-embed-text`** (137M, CPU-friendly, strong on
specific code lookups). Override with `ULTRADOC_EMBED_MODEL`.

## Start / stop

```
node scripts/ultradoc.mjs semantic up       # starts all three, pulls the model
node scripts/ultradoc.mjs semantic status   # docker compose ps
node scripts/ultradoc.mjs semantic down      # stops everything
```

`semantic up` runs `docker compose --profile all up -d` and then
`ollama pull nomic-embed-text`. To start a subset directly:

```
docker compose --profile semantic up -d     # qdrant + ollama only
docker compose --profile search up -d        # searxng only
```

## Use it

```
node scripts/ultradoc.mjs ask --repo <url> --q "..." --semantic
```

On the first `--semantic` run for a repo, ultradoc chunks the code + docs, embeds
each chunk via Ollama, and upserts the vectors into a per-repo Qdrant collection
(`ultradoc_<slug>`). A marker (`.ultradoc/semantic.json`) records the commit so
later runs reuse the index instead of re-embedding. Vector hits are fused with
the lexical results via Reciprocal Rank Fusion, so semantic mode only ever adds
signal.

If the stack isn't running (or the model isn't pulled), `--semantic` logs a note
and **falls back to Tier-1** — the answer is never blocked.

## Alternatives (no Ollama)

You can point at any local embedding endpoint. The HuggingFace
**Text-Embeddings-Inference (TEI)** CPU image is a drop-in option:

```
docker run -p 11434:80 ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
  --model-id BAAI/bge-small-en-v1.5
```

Then set `ULTRADOC_OLLAMA`/`ULTRADOC_EMBED_MODEL` to match your endpoint, or
adapt `src/index/semantic.ts`'s `embed()` to the API shape.

## Environment overrides

| Var | Default | Meaning |
|-----|---------|---------|
| `ULTRADOC_QDRANT` | `http://localhost:6333` | Qdrant base URL |
| `ULTRADOC_OLLAMA` | `http://localhost:11434` | embedding server base URL |
| `ULTRADOC_EMBED_MODEL` | `nomic-embed-text` | embedding model id |
| `ULTRADOC_MAX_CHUNKS` | `800` | cap on chunks embedded per repo |
| `ULTRADOC_SEARXNG` | `http://localhost:8888` | SearXNG base URL for `web` |

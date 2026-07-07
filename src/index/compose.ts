import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cacheRoot } from "../config.js";

// The optional local Docker stack, embedded so `ultradoc semantic up|down|status`
// works from ANY install location (npx skills add, npm, a curled bundle) — not
// just a dev checkout where docker-compose.yml sits beside the source. The repo
// files (docker-compose.yml, docker/searxng/settings.yml) remain the editable
// source of truth; tests/compose.test.ts fails if these copies drift from them.

export const COMPOSE_YAML = `# Optional, fully-local, no-API-key stack for ultradoc's semantic mode and web
# search. Start it with \`ultradoc semantic up\` (or \`docker compose --profile all
# up -d\`). The published bundle stays dependency-free — it only speaks HTTP to
# these containers on localhost; nothing here is required for Tier-1 retrieval.
#
# Profiles let you start subsets:
#   --profile semantic  → qdrant + ollama (vector search)
#   --profile search    → searxng (web discovery)
#   --profile all       → everything
name: ultradoc

services:
  # Vector database — Apache-2.0, self-hosted, no key.
  qdrant:
    image: qdrant/qdrant:latest
    container_name: ultradoc-qdrant
    ports:
      - "6333:6333"
    volumes:
      - ultradoc_qdrant:/qdrant/storage
    restart: unless-stopped
    profiles: ["semantic", "all"]

  # Local embedding server — no key, no data leaves the machine. Pull the model
  # once: \`docker compose exec ollama ollama pull nomic-embed-text\`
  # (\`ultradoc semantic up\` does this for you).
  ollama:
    image: ollama/ollama:latest
    container_name: ultradoc-ollama
    ports:
      - "11434:11434"
    volumes:
      - ultradoc_ollama:/root/.ollama
    restart: unless-stopped
    profiles: ["semantic", "all"]

  # Self-hosted metasearch for keyless web discovery. JSON output is enabled in
  # docker/searxng/settings.yml so the engine can be queried programmatically.
  searxng:
    image: searxng/searxng:latest
    container_name: ultradoc-searxng
    ports:
      - "8888:8080"
    environment:
      - SEARXNG_BASE_URL=http://localhost:8888/
    volumes:
      - ./docker/searxng:/etc/searxng:rw
    restart: unless-stopped
    profiles: ["search", "all"]

volumes:
  ultradoc_qdrant:
  ultradoc_ollama:
`;

export const SEARXNG_SETTINGS_YAML = `# Minimal SearXNG config for ultradoc's keyless web discovery. The important
# bit is enabling the JSON output format so \`ultradoc web\` can query it
# programmatically (\`/search?format=json\`). Change the secret_key for anything
# beyond local use.
use_default_settings: true

server:
  secret_key: "ultradoc-dev-secret-change-me"
  limiter: false
  image_proxy: false

search:
  safe_search: 0
  autocomplete: ""
  formats:
    - html
    - json
`;

// Materialize the compose stack under <cacheRoot>/compose/ (rewriting only when
// content changed, so an upgrade refreshes it) and return the compose file path.
// The searxng settings keep their ./docker/searxng relative volume path, so the
// embedded YAML stays byte-identical to the repo file.
export function ensureComposeMaterialized(): string {
  const base = join(cacheRoot(), "compose");
  const composePath = join(base, "docker-compose.yml");
  const settingsPath = join(base, "docker", "searxng", "settings.yml");
  writeIfChanged(composePath, COMPOSE_YAML);
  writeIfChanged(settingsPath, SEARXNG_SETTINGS_YAML);
  return composePath;
}

function writeIfChanged(path: string, content: string): void {
  try {
    if (existsSync(path) && readFileSync(path, "utf8") === content) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  } catch {
    /* best-effort — semanticControl surfaces docker errors if the path is unusable */
  }
}

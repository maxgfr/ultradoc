import { sh, have } from "../../util.js";
import { ensureComposeMaterialized } from "../compose.js";
import { EMBED_MODEL } from "./qdrant.js";

// Lifecycle of the optional local Docker stack (Qdrant + Ollama + SearXNG).
// Separate from retrieval: `semantic up|down|status` manage containers, they do
// not search. SearXNG lives in the same compose file because web discovery
// needs it regardless of which embedding tier is in use.

// Materialize the compose stack from the bundle into the cache dir and return
// its path. Always uses the embedded copy so `semantic up|down|status` works
// from any install location (skills add, npm, curled bundle) — not just a dev
// checkout where docker-compose.yml happens to sit beside the source.
function composeFile(): string {
  return ensureComposeMaterialized();
}

// Generous default budget for pulling the stack images. The Ollama image alone
// is >1.6GB, so on a first run `up` would routinely blow past a short timeout
// while Docker is still downloading. Overridable per invocation via
// ULTRADOC_DOCKER_PULL_TIMEOUT_MS (read at call time, not module load).
const DEFAULT_DOCKER_PULL_TIMEOUT_MS = 1_200_000; // 20 min
function dockerPullTimeoutMs(): number {
  const raw = Number(process.env.ULTRADOC_DOCKER_PULL_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DOCKER_PULL_TIMEOUT_MS;
}

// Injectable dependencies so `semantic up|down|status` orchestration is unit
// testable without a real Docker daemon; both default to the real helpers.
export interface SemanticControlDeps {
  run?: typeof sh;
  has?: typeof have;
}

// Control the optional local Docker stack (Qdrant + embeddings + SearXNG).
export function semanticControl(action: string, deps: SemanticControlDeps = {}): { message: string; code: number } {
  const run = deps.run ?? sh;
  const has = deps.has ?? have;
  if (!["up", "down", "status"].includes(action)) {
    return { message: `ultradoc semantic: unknown action "${action}" (use: up | down | status)`, code: 1 };
  }
  if (!has("docker")) {
    return { message: "ultradoc semantic: docker not found. Install Docker, then retry. See references/semantic-setup.md.", code: 1 };
  }
  const file = composeFile();

  if (action === "down") {
    const r = run("docker", ["compose", "-f", file, "--profile", "all", "down"], { timeoutMs: 120_000 });
    return { message: r.ok ? "ultradoc semantic: stack stopped." : `ultradoc semantic: down failed.\n${r.stderr}`, code: r.ok ? 0 : 1 };
  }

  if (action === "status") {
    const r = run("docker", ["compose", "-f", file, "ps"], { timeoutMs: 30_000 });
    return { message: r.ok ? r.stdout || "ultradoc semantic: no services running." : `ultradoc semantic: status failed.\n${r.stderr}`, code: 0 };
  }

  // up
  // Pull the images FIRST, on a generous env-configurable budget: the Ollama
  // image alone is >1.6GB and routinely exceeds `up`'s short timeout on a cold
  // machine. Once cached, `up -d` finds them locally and stays fast. A genuine
  // pull failure exits non-zero with a clear, actionable message — no crash,
  // no unbounded hang (the timeout is always finite).
  const imagePull = run("docker", ["compose", "-f", file, "--profile", "all", "pull"], { timeoutMs: dockerPullTimeoutMs() });
  if (!imagePull.ok) {
    return {
      message: `ultradoc semantic: pulling the stack images failed (large images can be slow — raise ULTRADOC_DOCKER_PULL_TIMEOUT_MS, currently ${dockerPullTimeoutMs()}ms).\n${imagePull.stderr}`,
      code: 1,
    };
  }

  const up = run("docker", ["compose", "-f", file, "--profile", "all", "up", "-d"], { timeoutMs: 300_000 });
  if (!up.ok) return { message: `ultradoc semantic: up failed.\n${up.stderr}`, code: 1 };
  // Pull the embedding model (idempotent; needed before embeddings work).
  const pull = run("docker", ["compose", "-f", file, "exec", "-T", "ollama", "ollama", "pull", EMBED_MODEL], { timeoutMs: 600_000 });
  const lines = [
    "ultradoc semantic: stack is up (Qdrant :6333 · Ollama :11434 · SearXNG :8888).",
    pull.ok ? `  model:  ${EMBED_MODEL} ready` : `  model:  pull '${EMBED_MODEL}' yourself: docker compose -f ${file} exec ollama ollama pull ${EMBED_MODEL}`,
    '  use:    ultradoc ask --repo <url> --q "..." --semantic',
  ];
  return { message: lines.join("\n"), code: 0 };
}

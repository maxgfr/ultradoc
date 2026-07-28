import { sh, have } from "../../util.js";
import { ensureComposeMaterialized } from "../compose.js";
import { EMBED_MODEL } from "./qdrant.js";

// Lifecycle of the optional local Docker stack. Separate from retrieval:
// `semantic up|down|status` and `firecrawl up|down|status` manage containers,
// they do not search. Both drive the SAME compose file through different
// profiles — `all` (qdrant + ollama + searxng) and `extract` (firecrawl and its
// four sidecars), which is why the orchestration lives here once.

// Materialize the compose stack from the bundle into the cache dir and return
// its path. Always uses the embedded copy so `up|down|status` works from any
// install location (skills add, npm, curled bundle) — not just a dev checkout
// where docker-compose.yml happens to sit beside the source.
function composeFile(): string {
  return ensureComposeMaterialized();
}

// Generous default budget for pulling the stack images. The Ollama image alone
// is >1.6GB and the Firecrawl profile is ~3GB, so on a first run `up` would
// routinely blow past a short timeout while Docker is still downloading.
// Overridable per invocation via ULTRADOC_DOCKER_PULL_TIMEOUT_MS (read at call
// time, not module load).
const DEFAULT_DOCKER_PULL_TIMEOUT_MS = 1_200_000; // 20 min
function dockerPullTimeoutMs(): number {
  const raw = Number(process.env.ULTRADOC_DOCKER_PULL_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DOCKER_PULL_TIMEOUT_MS;
}

// Injectable dependencies so the `up|down|status` orchestration is unit
// testable without a real Docker daemon; both default to the real helpers.
export interface SemanticControlDeps {
  run?: typeof sh;
  has?: typeof have;
}

// One controllable subset of the compose file: which subcommand names it, which
// compose profile it maps to, and what `up` reports (and does) once the
// containers are running.
interface ComposeStack {
  command: string; // the ultradoc subcommand ("semantic" | "firecrawl")
  profile: string; // the compose profile it starts/stops
  summary: string; // the headline `up` prints on success
  // Extra work after `up -d`, e.g. pulling the embedding model. Returns lines
  // appended to the success message.
  postUp?: (file: string, run: typeof sh) => string[];
}

const SEMANTIC_STACK: ComposeStack = {
  command: "semantic",
  profile: "all",
  summary: "stack is up (Qdrant :6333 · Ollama :11434 · SearXNG :8888).",
  postUp: (file, run) => {
    // Pull the embedding model (idempotent; needed before embeddings work).
    const pull = run("docker", ["compose", "-f", file, "exec", "-T", "ollama", "ollama", "pull", EMBED_MODEL], { timeoutMs: 600_000 });
    return [
      pull.ok ? `  model:  ${EMBED_MODEL} ready` : `  model:  pull '${EMBED_MODEL}' yourself: docker compose -f ${file} exec ollama ollama pull ${EMBED_MODEL}`,
      '  use:    ultradoc ask --repo <url> --q "..." --semantic',
    ];
  },
};

const FIRECRAWL_STACK: ComposeStack = {
  command: "firecrawl",
  profile: "extract",
  summary: "stack is up (Firecrawl :3002 · playwright · redis · rabbitmq · postgres).",
  postUp: () => [
    "  keyless: USE_DB_AUTHENTICATION=false — no API key is sent or needed.",
    "  use:     fetched pages are now cleaned by Firecrawl; --firecrawl off opts out.",
    '  search:  ultradoc web --repo <url> --q "..." --web-engine firecrawl',
  ],
};

// Drive one profile of the compose stack. Never throws: every failure comes
// back as a message + a non-zero code the CLI turns into an exit status.
function composeControl(action: string, stack: ComposeStack, deps: SemanticControlDeps = {}): { message: string; code: number } {
  const run = deps.run ?? sh;
  const has = deps.has ?? have;
  const tag = `ultradoc ${stack.command}`;
  if (!["up", "down", "status"].includes(action)) {
    return { message: `${tag}: unknown action "${action}" (use: up | down | status)`, code: 1 };
  }
  if (!has("docker")) {
    return { message: `${tag}: docker not found. Install Docker, then retry. See references/semantic-setup.md.`, code: 1 };
  }
  const file = composeFile();

  if (action === "down") {
    const r = run("docker", ["compose", "-f", file, "--profile", stack.profile, "down"], { timeoutMs: 120_000 });
    return { message: r.ok ? `${tag}: stack stopped.` : `${tag}: down failed.\n${r.stderr}`, code: r.ok ? 0 : 1 };
  }

  if (action === "status") {
    const r = run("docker", ["compose", "-f", file, "--profile", stack.profile, "ps"], { timeoutMs: 30_000 });
    return { message: r.ok ? r.stdout || `${tag}: no services running.` : `${tag}: status failed.\n${r.stderr}`, code: 0 };
  }

  // up
  // Pull the images FIRST, on a generous env-configurable budget: the Ollama
  // image alone is >1.6GB and routinely exceeds `up`'s short timeout on a cold
  // machine. Once cached, `up -d` finds them locally and stays fast. A genuine
  // pull failure exits non-zero with a clear, actionable message — no crash,
  // no unbounded hang (the timeout is always finite).
  const imagePull = run("docker", ["compose", "-f", file, "--profile", stack.profile, "pull"], { timeoutMs: dockerPullTimeoutMs() });
  if (!imagePull.ok) {
    return {
      message: `${tag}: pulling the stack images failed (large images can be slow — raise ULTRADOC_DOCKER_PULL_TIMEOUT_MS, currently ${dockerPullTimeoutMs()}ms).\n${imagePull.stderr}`,
      code: 1,
    };
  }

  // `--wait` blocks until every service's healthcheck passes, so a green `up`
  // means the endpoints actually answer — otherwise the very next probe can
  // fail against a container that is merely "started".
  const up = run("docker", ["compose", "-f", file, "--profile", stack.profile, "up", "-d", "--wait"], { timeoutMs: 300_000 });
  if (!up.ok) return { message: `${tag}: up failed.\n${up.stderr}`, code: 1 };
  return { message: [`${tag}: ${stack.summary}`, ...(stack.postUp?.(file, run) ?? [])].join("\n"), code: 0 };
}

// Control the optional local Docker stack (Qdrant + embeddings + SearXNG).
export function semanticControl(action: string, deps: SemanticControlDeps = {}): { message: string; code: number } {
  return composeControl(action, SEMANTIC_STACK, deps);
}

// Control the optional Firecrawl extraction stack (compose profile `extract`).
// Kept out of `all` on purpose: ~3 GB of images and five containers, which
// `semantic up` must not drag in.
export function firecrawlControl(action: string, deps: SemanticControlDeps = {}): { message: string; code: number } {
  return composeControl(action, FIRECRAWL_STACK, deps);
}

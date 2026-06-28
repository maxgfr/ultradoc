import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunContext, EvidenceItem } from "../types.js";
import { readText } from "../walk.js";
import { httpGet, httpJson } from "../sources/fetch.js";
import { sh, have } from "../util.js";

export interface SemanticResult {
  available: boolean;
  items: Omit<EvidenceItem, "id">[];
  notes: string[];
}

// All endpoints are local and keyless; everything heavy runs in Docker
// containers, so the published bundle stays dependency-free and only speaks HTTP
// to localhost.
const QDRANT = (process.env.ULTRADOC_QDRANT || "http://localhost:6333").replace(/\/$/, "");
const OLLAMA = (process.env.ULTRADOC_OLLAMA || "http://localhost:11434").replace(/\/$/, "");
const EMBED_MODEL = process.env.ULTRADOC_EMBED_MODEL || "nomic-embed-text";
const MAX_CHUNKS = Number(process.env.ULTRADOC_MAX_CHUNKS || 800);

interface Chunk {
  rel: string;
  start: number;
  end: number;
  text: string;
  isDoc: boolean;
}

// Split a file into overlapping line windows. Pure + exported for testing.
export function chunkText(rel: string, content: string, isDoc: boolean, opts: { windowLines?: number; overlap?: number; maxPerFile?: number } = {}): Chunk[] {
  const win = opts.windowLines ?? 60;
  const overlap = opts.overlap ?? 12;
  const maxPerFile = opts.maxPerFile ?? 40;
  const lines = content.split(/\r?\n/);
  const chunks: Chunk[] = [];
  const step = Math.max(1, win - overlap);
  for (let i = 0; i < lines.length && chunks.length < maxPerFile; i += step) {
    const slice = lines.slice(i, i + win);
    const text = slice.join("\n").trim();
    if (text.length < 16) continue;
    chunks.push({ rel, start: i + 1, end: Math.min(lines.length, i + win), text, isDoc });
  }
  return chunks;
}

async function reachable(base: string, path = "/"): Promise<boolean> {
  const r = await httpGet(base + path, { timeoutMs: 2500 });
  return r.ok; // a healthy 2xx — a 5xx means up-but-broken, treat as unavailable
}

async function embed(text: string): Promise<number[] | null> {
  const r = await httpJson("POST", `${OLLAMA}/api/embeddings`, { model: EMBED_MODEL, prompt: text }, { timeoutMs: 60_000 });
  const v = r.ok ? r.data?.embedding : undefined;
  return Array.isArray(v) && v.length ? v : null;
}

function collectionName(slug: string): string {
  return "ultradoc_" + slug.replace(/[^a-z0-9_]/gi, "_").slice(0, 60);
}

function markerPath(repoDir: string): string {
  return join(repoDir, ".ultradoc", "semantic.json");
}

async function collectionExists(name: string): Promise<boolean> {
  const r = await httpJson("GET", `${QDRANT}/collections/${name}`);
  return r.ok && r.data?.result?.status !== undefined;
}

// Build the per-repo vector collection if it isn't already present for this
// commit: chunk code + docs, embed each chunk locally, upsert into Qdrant.
async function buildIfNeeded(ctx: RunContext): Promise<{ name: string } | { error: string }> {
  const name = collectionName(ctx.repoRef.slug);
  const marker = markerPath(ctx.repoDir);
  const commit = ctx.index.commit ?? "HEAD";

  if (existsSync(marker)) {
    try {
      const m = JSON.parse(readFileSync(marker, "utf8"));
      if (m.collection === name && m.commit === commit && (await collectionExists(name))) {
        return { name };
      }
    } catch {
      /* rebuild */
    }
  }

  // Gather chunks from code + doc files (cap total to bound embedding time).
  const codeFiles = ctx.index.symbols.length ? [...new Set(ctx.index.symbols.map((s) => s.file))] : [];
  const files = [...new Set([...codeFiles, ...ctx.index.docFiles])];
  const chunks: Chunk[] = [];
  for (const rel of files) {
    if (chunks.length >= MAX_CHUNKS) break;
    const content = readText(join(ctx.repoDir, rel));
    if (!content) continue;
    const isDoc = ctx.index.docFiles.includes(rel);
    for (const c of chunkText(rel, content, isDoc)) {
      chunks.push(c);
      if (chunks.length >= MAX_CHUNKS) break;
    }
  }
  if (chunks.length === 0) return { error: "no chunkable content to embed" };

  // Embed the first chunk to learn the vector dimension, then (re)create the
  // collection and upsert in batches.
  const first = await embed(chunks[0]!.text);
  if (!first) return { error: `embedding failed (is the '${EMBED_MODEL}' model pulled in Ollama?)` };
  const dim = first.length;

  // We only reach here when (re)building — marker missing, commit changed, or
  // the collection is gone. Delete any existing collection first so a rebuild
  // with fewer chunks can't leave stale points behind or mix commits.
  await httpJson("DELETE", `${QDRANT}/collections/${name}`);
  const create = await httpJson("PUT", `${QDRANT}/collections/${name}`, {
    vectors: { size: dim, distance: "Cosine" },
  });
  if (!create.ok) return { error: `could not create Qdrant collection (${create.status})` };

  const points: any[] = [];
  const flush = async (): Promise<boolean> => {
    if (!points.length) return true;
    const up = await httpJson("PUT", `${QDRANT}/collections/${name}/points?wait=true`, { points });
    points.length = 0;
    return up.ok;
  };
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const vector = i === 0 ? first : await embed(c.text);
    if (!vector) continue;
    points.push({
      id: i + 1,
      vector,
      payload: { rel: c.rel, start: c.start, end: c.end, isDoc: c.isDoc, snippet: c.text.slice(0, 1500) },
    });
    if (points.length >= 64 && !(await flush())) return { error: "failed to upsert vectors to Qdrant" };
  }
  if (!(await flush())) return { error: "failed to upsert vectors to Qdrant" };

  try {
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, JSON.stringify({ collection: name, commit, chunks: chunks.length, dim }));
  } catch {
    /* persistence is best-effort */
  }
  return { name };
}

// Tier-2 semantic retrieval. Returns available:false (so the code source falls
// back to lexical) whenever the local stack is unreachable, the model isn't
// pulled, or indexing fails — never throws, never blocks the answer.
export async function semanticSearch(ctx: RunContext): Promise<SemanticResult> {
  const fallbackNote = (why: string): SemanticResult => ({
    available: false,
    items: [],
    notes: [`Semantic mode unavailable (${why}); used Tier-1 lexical + structural search.`],
  });

  if (!(await reachable(QDRANT))) return fallbackNote(`Qdrant not reachable at ${QDRANT} — run \`ultradoc semantic up\``);
  if (!(await reachable(OLLAMA, "/api/tags"))) return fallbackNote(`Ollama not reachable at ${OLLAMA}`);

  const built = await buildIfNeeded(ctx);
  if ("error" in built) return fallbackNote(built.error);

  const qv = await embed(ctx.options.question);
  if (!qv) return fallbackNote("could not embed the question");

  const res = await httpJson("POST", `${QDRANT}/collections/${built.name}/points/search`, {
    vector: qv,
    limit: ctx.options.perSource,
    with_payload: true,
  });
  if (!res.ok) return fallbackNote(`Qdrant search failed (${res.status})`);

  const items = (res.data?.result ?? []).map((hit: any) => {
    const p = hit.payload ?? {};
    const loc = `${p.rel}:${p.start}-${p.end}`;
    return {
      source: "code" as const,
      title: `${p.rel} — semantic match`,
      ref: p.rel,
      location: loc,
      score: Number((hit.score ?? 0).toFixed(4)),
      snippet: p.snippet ?? "",
      url: ctx.repoRef.isLocal ? undefined : `${ctx.repoRef.webUrl}/blob/${ctx.index.commit ?? "HEAD"}/${p.rel}#L${p.start}-L${p.end}`,
      meta: { semantic: true },
    };
  });

  return { available: true, items, notes: [`Semantic search via Qdrant + ${EMBED_MODEL} (local).`] };
}

// Locate docker-compose.yml relative to the bundle (scripts/ultradoc.mjs sits
// one level under the repo root, alongside the committed compose file).
function composeFile(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const cand of [join(here, "..", "docker-compose.yml"), join(here, "docker-compose.yml")]) {
    if (existsSync(cand)) return cand;
  }
  return join(here, "..", "docker-compose.yml");
}

// Control the optional local Docker stack (Qdrant + embeddings + SearXNG).
export function semanticControl(action: string): { message: string; code: number } {
  if (!["up", "down", "status"].includes(action)) {
    return { message: `ultradoc semantic: unknown action "${action}" (use: up | down | status)`, code: 1 };
  }
  if (!have("docker")) {
    return { message: "ultradoc semantic: docker not found. Install Docker, then retry. See references/semantic-setup.md.", code: 1 };
  }
  const file = composeFile();

  if (action === "down") {
    const r = sh("docker", ["compose", "-f", file, "--profile", "all", "down"], { timeoutMs: 120_000 });
    return { message: r.ok ? "ultradoc semantic: stack stopped." : `ultradoc semantic: down failed.\n${r.stderr}`, code: r.ok ? 0 : 1 };
  }

  if (action === "status") {
    const r = sh("docker", ["compose", "-f", file, "ps"], { timeoutMs: 30_000 });
    return { message: r.ok ? r.stdout || "ultradoc semantic: no services running." : `ultradoc semantic: status failed.\n${r.stderr}`, code: 0 };
  }

  // up
  const up = sh("docker", ["compose", "-f", file, "--profile", "all", "up", "-d"], { timeoutMs: 300_000 });
  if (!up.ok) return { message: `ultradoc semantic: up failed.\n${up.stderr}`, code: 1 };
  // Pull the embedding model (idempotent; needed before embeddings work).
  const pull = sh("docker", ["compose", "-f", file, "exec", "-T", "ollama", "ollama", "pull", EMBED_MODEL], { timeoutMs: 600_000 });
  const lines = [
    "ultradoc semantic: stack is up (Qdrant :6333 · Ollama :11434 · SearXNG :8888).",
    pull.ok ? `  model:  ${EMBED_MODEL} ready` : `  model:  pull '${EMBED_MODEL}' yourself: docker compose -f ${file} exec ollama ollama pull ${EMBED_MODEL}`,
    '  use:    ultradoc ask --repo <url> --q "..." --semantic',
  ];
  return { message: lines.join("\n"), code: 0 };
}

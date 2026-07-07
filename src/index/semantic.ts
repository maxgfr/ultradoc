import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { RunContext, EvidenceItem } from "../types.js";
import { readText } from "../walk.js";
import { httpGet, httpJson } from "../sources/fetch.js";
import { sh, have, mapLimit } from "../util.js";
import { LIMITS } from "../config.js";
import { ensureComposeMaterialized } from "./compose.js";

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
const MAX_CHUNKS = LIMITS.embedChunks;

interface Chunk {
  rel: string;
  start: number;
  end: number;
  text: string;
  isDoc: boolean;
}

// Split a file into overlapping line windows. Pure + exported for testing. Used
// for docs and for code files with no extracted symbols.
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

// Chunk a code file at symbol boundaries so a function/class isn't split across
// the middle of its body: each symbol anchors a chunk spanning from its
// definition to the next symbol (capped at `win` lines). The region before the
// first symbol (imports/top-level) gets its own chunk. Docs, and files with no
// symbols, fall back to the fixed-window chunker. Pure + exported for testing.
export function chunkFile(
  rel: string,
  content: string,
  isDoc: boolean,
  symbolLines: number[],
  opts: { windowLines?: number; overlap?: number; maxPerFile?: number } = {},
): Chunk[] {
  const win = opts.windowLines ?? 60;
  const maxPerFile = opts.maxPerFile ?? 40;
  const MIN_LEADING = 5;
  const lines = content.split(/\r?\n/);
  const n = lines.length;
  const starts = [...new Set((symbolLines ?? []).filter((l) => l >= 1 && l <= n))].sort((a, b) => a - b);
  if (isDoc || starts.length === 0) return chunkText(rel, content, isDoc, opts);

  const chunks: Chunk[] = [];
  const add = (from: number, to: number): void => {
    if (chunks.length >= maxPerFile) return;
    const s = Math.max(1, from);
    const e = Math.min(n, to);
    if (e < s) return;
    const text = lines
      .slice(s - 1, e)
      .join("\n")
      .trim();
    if (text.length < 16) return;
    chunks.push({ rel, start: s, end: e, text, isDoc });
  };

  if (starts[0]! - 1 >= MIN_LEADING) add(1, starts[0]! - 1);
  for (let i = 0; i < starts.length && chunks.length < maxPerFile; i++) {
    const start = starts[i]!;
    const nextStart = i + 1 < starts.length ? starts[i + 1]! : n + 1;
    // Span the symbol body up to the next symbol, capped at `win` lines.
    add(start, Math.min(start + win - 1, nextStart - 1));
  }
  return chunks;
}

async function reachable(base: string, path = "/"): Promise<boolean> {
  const r = await httpGet(base + path, { timeoutMs: 2500 });
  return r.ok; // a healthy 2xx — a 5xx means up-but-broken, treat as unavailable
}

async function embed(text: string): Promise<number[] | null> {
  // 30s per embed: a wedged Ollama should fail the build fast, not after minutes
  // of stalled requests. Parallelism (mapLimit) keeps throughput up.
  const r = await httpJson("POST", `${OLLAMA}/api/embeddings`, { model: EMBED_MODEL, prompt: text }, { timeoutMs: 30_000 });
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
// commit: chunk code (at symbol boundaries) + docs, embed the chunks in
// parallel, upsert into Qdrant. Returns notes when the index is partial.
async function buildIfNeeded(ctx: RunContext): Promise<{ name: string; notes: string[] } | { error: string }> {
  const name = collectionName(ctx.repoRef.slug);
  const marker = markerPath(ctx.repoDir);
  const commit = ctx.index.commit ?? "HEAD";

  if (existsSync(marker)) {
    try {
      const m = JSON.parse(readFileSync(marker, "utf8"));
      if (m.collection === name && m.commit === commit && (await collectionExists(name))) {
        return { name, notes: [] };
      }
    } catch {
      /* rebuild */
    }
  }

  // Symbol start-lines per file so code chunks respect definition boundaries.
  const symbolLines = new Map<string, number[]>();
  for (const s of ctx.index.symbols) {
    const arr = symbolLines.get(s.file) ?? [];
    arr.push(s.line);
    symbolLines.set(s.file, arr);
  }
  const codeFiles = symbolLines.size ? [...symbolLines.keys()] : [];
  const files = [...new Set([...codeFiles, ...ctx.index.docFiles])];
  const chunks: Chunk[] = [];
  let capped = false;
  for (const rel of files) {
    if (chunks.length >= MAX_CHUNKS) {
      capped = true;
      break;
    }
    const content = readText(join(ctx.repoDir, rel));
    if (!content) continue;
    const isDoc = ctx.index.docFiles.includes(rel);
    for (const c of chunkFile(rel, content, isDoc, symbolLines.get(rel) ?? [])) {
      chunks.push(c);
      if (chunks.length >= MAX_CHUNKS) {
        capped = true;
        break;
      }
    }
  }
  if (chunks.length === 0) return { error: "no chunkable content to embed" };

  // Embed all chunks in parallel (bounded concurrency), preserving order so
  // point ids are stable. A failed embed yields null and is counted.
  const vectors = await mapLimit(chunks, LIMITS.embedConcurrency, (c) => embed(c.text));
  const dim = vectors.find((v): v is number[] => Array.isArray(v) && v.length > 0)?.length;
  if (!dim) return { error: `embedding failed (is the '${EMBED_MODEL}' model pulled in Ollama?)` };
  const failed = vectors.filter((v) => !v).length;

  // We only reach here when (re)building — marker missing, commit changed, or
  // the collection is gone. Delete any existing collection first so a rebuild
  // with fewer chunks can't leave stale points behind or mix commits.
  await httpJson("DELETE", `${QDRANT}/collections/${name}`);
  const create = await httpJson("PUT", `${QDRANT}/collections/${name}`, {
    vectors: { size: dim, distance: "Cosine" },
  });
  if (!create.ok) return { error: `could not create Qdrant collection (${create.status})` };

  let points: any[] = [];
  const flush = async (): Promise<boolean> => {
    if (!points.length) return true;
    const up = await httpJson("PUT", `${QDRANT}/collections/${name}/points?wait=true`, { points });
    points = [];
    return up.ok;
  };
  for (let i = 0; i < chunks.length; i++) {
    const vector = vectors[i];
    if (!vector) continue;
    const c = chunks[i]!;
    points.push({ id: i + 1, vector, payload: { rel: c.rel, start: c.start, end: c.end, isDoc: c.isDoc, snippet: c.text.slice(0, 1500) } });
    if (points.length >= 64 && !(await flush())) return { error: "failed to upsert vectors to Qdrant" };
  }
  if (!(await flush())) return { error: "failed to upsert vectors to Qdrant" };

  const notes: string[] = [];
  if (capped) notes.push(`Embedded ${chunks.length} chunks (repo has more) — raise ULTRADOC_MAX_CHUNKS for fuller semantic coverage.`);
  if (failed) notes.push(`${failed} chunk(s) failed to embed — the semantic index is partial.`);

  // If more than 20% of chunks failed the index is too hollow to trust; skip the
  // marker so the next run retries instead of reusing a partial collection.
  const tooHollow = failed / chunks.length > 0.2;
  if (!tooHollow) {
    try {
      mkdirSync(dirname(marker), { recursive: true });
      writeFileSync(marker, JSON.stringify({ collection: name, commit, chunks: chunks.length, dim }));
    } catch {
      /* persistence is best-effort */
    }
  }
  return { name, notes };
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
  const buildNotes = built.notes;

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

  return { available: true, items, notes: [`Semantic search via Qdrant + ${EMBED_MODEL} (local).`, ...buildNotes] };
}

// Materialize the compose stack from the bundle into the cache dir and return
// its path. Always uses the embedded copy so `semantic up|down|status` works
// from any install location (skills add, npm, curled bundle) — not just a dev
// checkout where docker-compose.yml happens to sit beside the source.
function composeFile(): string {
  return ensureComposeMaterialized();
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

import { spawnSync } from "node:child_process";
import { renameSync, unlinkSync, writeFileSync } from "node:fs";

// Write a cache artifact so a concurrent reader sees either the old bytes or the
// new ones, never a half-written file. `rename` is atomic within a filesystem,
// and the temp file is a sibling so it always is one. This is what keeps a
// second ultradoc process (the MCP server alongside the CLI, or two servers)
// from poisoning index.json / OVERVIEW.md with an interleaved write that the
// next `JSON.parse` throws on. The pid+counter suffix keeps two writers from
// colliding on the temp name itself.
let tmpCounter = 0;
export function writeFileAtomic(path: string, data: string): void {
  const tmp = `${path}.${process.pid}.${tmpCounter++}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      /* the temp file may never have been created */
    }
    throw e;
  }
}

// Result of a subprocess call. `ok` is true on exit code 0 with the binary
// found; `missing` is true when the binary isn't on PATH (so callers can fall
// back gracefully instead of crashing — e.g. no ripgrep, no gh, no docker).
export interface ShResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  missing: boolean;
}

// Run a command synchronously. Sync keeps the CLI simple and deterministic
// (mirrors how the engine is structured); the work is I/O-bound git/rg/gh calls
// where parallelism buys little. `input` feeds stdin; `maxBuffer` is generous
// for large `rg --json` / `git log` output.
export function sh(cmd: string, args: string[], opts: { cwd?: string; input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): ShResult {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 120_000,
    maxBuffer: 64 * 1024 * 1024,
    env: opts.env ?? process.env,
  });
  const missing = !!res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT";
  return {
    ok: !res.error && res.status === 0,
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? (res.error ? String(res.error.message) : ""),
    missing,
  };
}

// Is a binary available on PATH? Cached because we probe the same few tools
// (rg, gh, git, docker) repeatedly within a run.
const whichCache = new Map<string, boolean>();
export function have(cmd: string): boolean {
  const cached = whichCache.get(cmd);
  if (cached !== undefined) return cached;
  const probe = sh(process.platform === "win32" ? "where" : "which", [cmd]);
  const found = probe.ok && probe.stdout.trim().length > 0;
  whichCache.set(cmd, found);
  return found;
}

// Turn an arbitrary repo identifier into a filesystem-safe cache slug, e.g.
// "github.com/expressjs/express" -> "github.com-expressjs-express".
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// Truncate a string to a max length with an ellipsis marker, for snippets.
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n… [truncated ${s.length - max} chars]`;
}

// Escape a string for safe inclusion as a literal inside a RegExp.
// Test, spec, example, fixture and benchmark files — their code is not what a
// question about the project is usually asking about. Catches both the
// directory conventions and the per-language BASENAME ones (foo_test.go,
// test_foo.py, foo.test.ts, foo.spec.js, index.test-d.ts), which a
// directory-only rule misses (hono's `src/compose.test.ts` sits in `src/`).
// Used to rank such files down, never to hide them.
export function looksLikeTestFile(rel: string): boolean {
  if (/(^|\/)(tests?|__tests__|specs?|fixtures?|examples?|benchmarks?|e2e)\//i.test(rel)) return true;
  const base = (rel.split("/").pop() ?? "").toLowerCase();
  return /[._-](test|spec)(-d)?\.\w+$/.test(base) || /^(test|conftest)[_.]/.test(base);
}

// Keyword extraction, accent-insensitive matching and the RegExp escape now live
// in the vendored webindex engine. Every function here was byte-for-byte the
// engine's once comments are ignored; the only real difference was two extra
// stopwords, which src/engine.ts now declares as extraStopwords — so this skill
// keeps its exact vocabulary while running the shared implementation.
//
// Re-exported so every existing `from "./util.js"` keeps resolving.
export {
  escapeRegExp,
  keywords,
  rankedKeywords,
  deaccent,
  foldTerm,
  subtokens,
  expandTokens,
  accentPattern,
  buildMatcher,
  matcherFromTokens,
  isStopword,
  type KeywordVariant,
  type ExpandedKeyword,
  type KeywordMatcher,
} from "./engine.js";

// Pull the meaningful keywords out of a natural-language question: lowercase,
// split on non-word chars, drop stopwords and very short tokens, dedupe. Used
// to drive lexical search and symbol ranking deterministically (no LLM).
// Reciprocal Rank Fusion: merge several ranked lists into one robust ranking
// without needing comparable scores across lists. `k` damps the contribution of
// low ranks. Returns keys ordered best-first with a fused score.
export function rrf<T>(lists: T[][], keyOf: (item: T) => string, k = 60): Map<string, number> {
  const score = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, idx) => {
      const key = keyOf(item);
      score.set(key, (score.get(key) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return score;
}

// Map `fn` over `items` with at most `limit` concurrent calls, preserving input
// order in the result. Used to embed chunks in parallel without a dependency and
// without unbounded fan-out; a rejected call surfaces as the thrown error.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const n = items.length;
  const out: R[] = new Array(n);
  const width = Math.max(1, Math.min(limit, n || 1));
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= n) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: width }, () => worker()));
  return out;
}

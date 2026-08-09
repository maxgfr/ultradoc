import { existsSync, statSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { tmpdir } from "node:os";
import type { RepoRef } from "./types.js";
import { sh, slugify } from "./util.js";
import { cacheRoot } from "./config.js";

// Adopted from webindex v1.13. The engine's resolveRepo is a strict superset —
// it parses ssh://, git:// and file:// URLs, userinfo and ports, all of which
// this copy fell through to "generic" — and headCommit / originUrl / sameCommit
// were identical. ensureClone and ensureHistoryDepth stay below: the engine's
// are async and every call site here is synchronous.
export { resolveRepo, headCommit, originUrl } from "./engine.js";
import { resolveRepo } from "./engine.js";

// Re-exported for compatibility: the cache root now lives in config.ts (it is a
// persistent per-user dir, overridable with ULTRADOC_CACHE_DIR). Everything
// ultradoc writes for a repo lives under <cacheRoot>/<slug>/.
export { cacheRoot } from "./config.js";

// The pre-1.8 location was always /tmp/ultradoc/<slug>. Best-effort one-time
// migration so an existing clone isn't re-fetched after the cache moved; a
// cross-device rename just fails silently and the repo re-clones.
function migrateLegacyClone(dir: string, slug: string): void {
  if (existsSync(dir)) return;
  const legacy = join(tmpdir(), "ultradoc", slug);
  if (legacy === dir || !existsSync(join(legacy, ".git"))) return;
  try {
    mkdirSync(cacheRoot(), { recursive: true });
    renameSync(legacy, dir);
  } catch {
    /* cross-device or perms — the repo will just re-clone */
  }
}

// Ensure a working tree exists on disk for `ref`, returning its absolute path.
// Local repos are used in place. Remote repos are shallow-cloned into the cache
// (reused on subsequent runs unless `refresh`). Throws a readable error if the
// clone fails (private repo, bad URL, no network).
export function ensureClone(ref: RepoRef, opts: { refresh?: boolean; branch?: string } = {}): string {
  if (ref.isLocal) return resolve(ref.raw);

  const dir = join(cacheRoot(), ref.slug);
  migrateLegacyClone(dir, ref.slug);
  const alreadyCloned = existsSync(join(dir, ".git"));

  if (alreadyCloned && !opts.refresh) return dir;

  if (alreadyCloned && opts.refresh) {
    sh("git", ["-C", dir, "fetch", "--depth", "1", "origin"], { timeoutMs: 180_000 });
    sh("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"], { timeoutMs: 60_000 });
    return dir;
  }

  mkdirSync(cacheRoot(), { recursive: true });
  const args = ["clone", "--depth", "1", "--filter=blob:none"];
  if (opts.branch) args.push("--branch", opts.branch);
  args.push(ref.cloneUrl!, dir);

  const res = sh("git", args, { timeoutMs: 300_000 });
  if (!res.ok) {
    // Retry without the partial-clone filter; some servers reject it.
    const fallback = sh("git", ["clone", "--depth", "1", ...(opts.branch ? ["--branch", opts.branch] : []), ref.cloneUrl!, dir], { timeoutMs: 300_000 });
    if (!fallback.ok) {
      throw new Error(`git clone failed for ${ref.cloneUrl}\n${(res.stderr || fallback.stderr).trim()}`);
    }
  }
  if (!existsSync(dir) || readdirSync(dir).length === 0) {
    throw new Error(`clone produced an empty tree at ${dir}`);
  }
  return dir;
}

// Make a clone usable for `git log -S/-G`. ensureClone uses --depth 1 with
// --filter=blob:none: pickaxe has no history to dig through AND no blob
// content to diff (per-blob promisor fetches are pathologically slow and break
// once the commit graph outruns the object db). So this both unshallows and
// drops the partial-clone filter (--refetch) — a one-time fetch for remote
// repos, a no-op for full clones. Returns ok=false with an honest note when
// that is impossible (offline, server refuses). Cached per process so repeated
// drill calls don't re-probe.
const deepened = new Map<string, { ok: boolean; note?: string }>();
export function ensureHistoryDepth(dir: string): { ok: boolean; note?: string } {
  const cached = deepened.get(dir);
  if (cached) return cached;
  let out: { ok: boolean; note?: string };
  const probe = sh("git", ["-C", dir, "rev-parse", "--is-shallow-repository"]);
  const filter = sh("git", ["-C", dir, "config", "remote.origin.partialclonefilter"]);
  const shallow = probe.ok && probe.stdout.trim() === "true";
  const partial = filter.ok && filter.stdout.trim() !== "";
  if (!probe.ok) {
    out = { ok: false, note: "Not a git working tree — no commit history available." };
  } else if (!shallow && !partial) {
    out = { ok: true };
  } else {
    if (partial) sh("git", ["-C", dir, "config", "remote.origin.partialclonefilter", ""]);
    const args = ["-C", dir, "fetch", "--quiet", ...(partial ? ["--refetch"] : []), ...(shallow ? ["--unshallow"] : []), "origin"];
    const full = sh("git", args, { timeoutMs: 300_000 });
    if (full.ok) {
      out = { ok: true };
    } else if (shallow && !partial) {
      const deepen = sh("git", ["-C", dir, "fetch", "--quiet", "--deepen=500", "origin"], {
        timeoutMs: 180_000,
      });
      out = deepen.ok
        ? { ok: true, note: "History deepened to ~500 commits (full unshallow failed); older changes may be missing." }
        : { ok: false, note: "Shallow clone could not be deepened (offline?); history is limited to the latest commit." };
    } else {
      out = { ok: false, note: "Could not fetch full history (offline, or the repo is too large); history results may be incomplete." };
    }
  }
  deepened.set(dir, out);
  return out;
}

/**
 * Two commits are the same, tolerating either being an ABBREVIATION.
 *
 * Not the engine's `sameCommit`, which is strict equality — and that difference
 * is load-bearing here. A dossier records the commit it was built against, git
 * abbreviates a SHA almost everywhere it prints one, and this comparison decides
 * whether a stored excerpt may be re-validated against the working tree. Strict
 * equality answers "no" to a full SHA against its own 7-character prefix, and
 * every citation silently stops being checked.
 */
export function sameCommit(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

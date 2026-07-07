import { existsSync, statSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { tmpdir } from "node:os";
import type { RepoRef } from "./types.js";
import { sh, slugify } from "./util.js";
import { cacheRoot } from "./config.js";

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

// Parse any repo identifier into a RepoRef. Accepts:
//   - a local directory path (absolute or relative, existing)
//   - https://host/owner/repo(.git)
//   - git@host:owner/repo.git
//   - host/owner/repo
//   - owner/repo            (shorthand → github.com)
// GitLab subgroups are preserved: owner holds the full namespace
// ("group/subgroup"), repo holds the final segment.
export function resolveRepo(raw: string): RepoRef {
  const trimmed = raw.trim();

  // Local directory takes precedence — lets you point ultradoc at a checkout
  // you already have, with no network.
  const asPath = resolve(trimmed);
  if (existsSync(asPath) && statSync(asPath).isDirectory()) {
    return {
      raw: trimmed,
      host: "local",
      isLocal: true,
      slug: "local-" + slugify(basename(asPath) + "-" + asPath),
    };
  }

  let host: string;
  let path: string; // owner(/subgroups)/repo, no host, no .git

  const scp = /^git@([^:]+):(.+)$/.exec(trimmed); // git@github.com:owner/repo.git
  const url = /^https?:\/\/([^/]+)\/(.+)$/.exec(trimmed); // https://host/owner/repo
  const hostPath = /^([a-z0-9.-]+\.[a-z]{2,})\/(.+)$/i.exec(trimmed); // host/owner/repo

  if (scp) {
    host = scp[1]!;
    path = scp[2]!;
  } else if (url) {
    host = url[1]!;
    path = url[2]!;
  } else if (hostPath) {
    host = hostPath[1]!;
    path = hostPath[2]!;
  } else {
    // bare "owner/repo" shorthand → github
    host = "github.com";
    path = trimmed;
  }

  path = path.replace(/\.git$/, "").replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  const repo = segments.length ? segments[segments.length - 1] : undefined;
  const owner = segments.length > 1 ? segments.slice(0, -1).join("/") : undefined;

  const cloneUrl = /^https?:\/\//.test(trimmed) || scp ? trimmed : `https://${host}/${path}.git`;
  const webUrl = `https://${host}/${path}`;

  return {
    raw: trimmed,
    host,
    owner,
    repo,
    cloneUrl: cloneUrl.endsWith(".git") ? cloneUrl : `${cloneUrl}.git`,
    webUrl,
    isLocal: false,
    slug: slugify(`${host}/${path}`),
  };
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

// The short HEAD commit of a working tree, when it is a git repo. Recorded in
// the dossier so an answer is pinned to an exact revision.
export function headCommit(dir: string): string | undefined {
  const res = sh("git", ["-C", dir, "rev-parse", "--short", "HEAD"]);
  return res.ok ? res.stdout.trim() : undefined;
}

// Whether two abbreviated commit SHAs name the same revision. `git rev-parse
// --short` auto-grows the abbreviation as the object database grows — so after a
// shallow clone is deepened (e.g. by the history source), the SAME commit reads
// as `ba00676` at build time and `ba006766` later. Git guarantees a `--short`
// value is unambiguous when produced, so one being a prefix of the other means
// they resolve to the same object; a naive `!==` would report false drift.
export function sameCommit(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

// The `origin` remote URL of a working tree, if any. Lets a question asked
// against a LOCAL checkout still resolve the host's issues/PRs API.
export function originUrl(dir: string): string | undefined {
  const res = sh("git", ["-C", dir, "remote", "get-url", "origin"]);
  return res.ok && res.stdout.trim() ? res.stdout.trim() : undefined;
}

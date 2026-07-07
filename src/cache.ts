import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { cacheRoot } from "./config.js";
import { headCommit, resolveRepo } from "./clone.js";

export interface CacheRepo {
  slug: string;
  dir: string;
  bytes: number;
  commit?: string;
}

export interface CacheStatus {
  root: string;
  repos: CacheRepo[];
  totalBytes: number;
}

// Recursive on-disk size of a directory (best-effort; unreadable entries skip).
function dirSize(dir: string): number {
  let total = 0;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) total += dirSize(p);
    else total += st.size;
  }
  return total;
}

// Inspect the persistent cache: every cloned repo slug, its on-disk size and
// (when it's a git checkout) its HEAD commit.
export function cacheStatus(): CacheStatus {
  const root = cacheRoot();
  const repos: CacheRepo[] = [];
  let slugs: string[] = [];
  try {
    slugs = readdirSync(root).filter((n) => {
      try {
        return statSync(join(root, n)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    /* no cache yet */
  }
  for (const slug of slugs) {
    if (slug === "compose") continue; // materialized docker files, not a repo
    const dir = join(root, slug);
    repos.push({ slug, dir, bytes: dirSize(dir), commit: headCommit(dir) });
  }
  repos.sort((a, b) => b.bytes - a.bytes);
  return { root, repos, totalBytes: repos.reduce((s, r) => s + r.bytes, 0) };
}

// Clear cached clones/indexes. `all` wipes every repo (keeps the root dir);
// `repo` resolves one repo identifier to its slug and removes just that one.
export function cacheClean(opts: { all?: boolean; repo?: string }): { removed: string[] } {
  const root = cacheRoot();
  const removed: string[] = [];
  if (opts.all) {
    for (const r of cacheStatus().repos) {
      try {
        rmSync(r.dir, { recursive: true, force: true });
        removed.push(r.slug);
      } catch {
        /* skip */
      }
    }
    return { removed };
  }
  if (opts.repo) {
    const slug = resolveRepo(opts.repo).slug;
    const dir = join(root, slug);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      removed.push(slug);
    }
  }
  return { removed };
}

export function formatCacheStatus(s: CacheStatus): string {
  const mb = (b: number) => (b / (1024 * 1024)).toFixed(1) + " MB";
  const lines: string[] = [`ultradoc cache: ${s.root}`, `  ${s.repos.length} repo(s) · ${mb(s.totalBytes)} total`];
  for (const r of s.repos.slice(0, 20)) {
    lines.push(`  ${r.slug}  ${mb(r.bytes)}${r.commit ? ` @ ${r.commit.slice(0, 8)}` : ""}`);
  }
  if (s.repos.length > 20) lines.push(`  … +${s.repos.length - 20} more`);
  return lines.join("\n");
}

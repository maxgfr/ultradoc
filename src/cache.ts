import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { cacheRoot } from "./config.js";
import { headCommit, resolveRepo } from "./clone.js";
import { PAGES_DIR } from "./sources/page-cache.js";

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
  // The URL-keyed fetched-page cache (sources/page-cache.ts). It is not a repo,
  // so it is reported separately — but `clean --all` does clear it, otherwise
  // extracted pages would only ever expire on their 168 h TTL.
  pagesBytes: number;
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
    // Shared cache dirs that are not repos: the materialized docker files and
    // the URL-keyed fetched-page cache (sources/page-cache.ts).
    if (slug === "compose" || slug === PAGES_DIR) continue;
    const dir = join(root, slug);
    repos.push({ slug, dir, bytes: dirSize(dir), commit: headCommit(dir) });
  }
  repos.sort((a, b) => b.bytes - a.bytes);
  return { root, repos, totalBytes: repos.reduce((s, r) => s + r.bytes, 0), pagesBytes: dirSize(join(root, PAGES_DIR)) };
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
    // The page cache is keyed by URL, not by repo, so it survives every
    // per-repo removal above. Without this, `clean --all` leaves extracted
    // pages behind for their whole 168 h TTL — including entries produced by
    // an extractor the user has since turned off.
    const pages = join(root, PAGES_DIR);
    if (existsSync(pages)) {
      try {
        rmSync(pages, { recursive: true, force: true });
        removed.push(PAGES_DIR);
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
  if (s.pagesBytes > 0) lines.push(`  ${PAGES_DIR}/  ${mb(s.pagesBytes)} (fetched web pages; cleared by \`cache clean --all\`)`);
  return lines.join("\n");
}

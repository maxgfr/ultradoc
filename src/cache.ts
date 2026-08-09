import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { cacheRoot } from "./config.js";
import { headCommit, resolveRepo } from "./clone.js";
import { PAGES_DIR } from "./sources/page-cache.js";
import { MODELS_DIR } from "./index/semantic/model.js";

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
  // The downloaded static embedding model (index/semantic/model.ts). Also not a
  // repo — it used to be listed as one, which made `status` claim a phantom
  // repo named "models" and hid the fact that `clean --all` throws away a
  // ~20 MB checksum-verified download that `semantic pull` must re-fetch.
  modelsBytes: number;
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
    if (slug === "compose" || slug === PAGES_DIR || slug === MODELS_DIR) continue;
    const dir = join(root, slug);
    repos.push({ slug, dir, bytes: dirSize(dir), commit: headCommit(dir) });
  }
  repos.sort((a, b) => b.bytes - a.bytes);
  return {
    root,
    repos,
    totalBytes: repos.reduce((s, r) => s + r.bytes, 0),
    pagesBytes: dirSize(join(root, PAGES_DIR)),
    modelsBytes: dirSize(join(root, MODELS_DIR)),
  };
}

// Clear cached clones/indexes. `all` wipes every repo (keeps the root dir);
// `repo` resolves one repo identifier to its slug and removes just that one.
export function cleanRepoCache(opts: { all?: boolean; repo?: string }): { removed: string[] } {
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
    // Neither of these is a repo, so no per-repo removal above reaches them.
    // The page cache would otherwise survive its whole 168 h TTL (including
    // entries from an extractor since turned off); the model directory used to
    // be swept only because `status` mistook it for a repo. `--all` means all,
    // so both go — but they are named in `removed` so the caller can say that
    // the ~20 MB model will be re-downloaded on the next `semantic pull`.
    for (const extra of [PAGES_DIR, MODELS_DIR]) {
      const dir = join(root, extra);
      if (!existsSync(dir)) continue;
      try {
        rmSync(dir, { recursive: true, force: true });
        removed.push(extra);
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
  if (s.modelsBytes > 0) {
    lines.push(`  ${MODELS_DIR}/  ${mb(s.modelsBytes)} (static embedding model; \`cache clean --all\` drops it, \`semantic pull\` re-downloads)`);
  }
  return lines.join("\n");
}

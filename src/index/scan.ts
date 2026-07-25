import { join } from "node:path";
import { scanRepo, type RepoScan } from "../vendor/codeindex-engine.mjs";
import { CACHE_DIR_NAME, LIMITS } from "../config.js";

// The engine's full scan of a working tree — every file's symbols, calls,
// identifiers, imports and markdown structure. `buildIndex` distils it into the
// small persisted index that answers most questions; the richer capabilities
// (symbol lookup with bodies, caller resolution, the semantic tier, the module
// graph) need the scan itself.
//
// It is expensive — 7s on a repo the size of matomo — and immutable for a given
// tree during one CLI invocation, so it is memoised per root. Commands that
// never need it (`ask`, the lexical drills) never pay for it: they read the
// persisted index. `buildIndex` publishes the scan it just made, so a command
// that indexes and then needs the scan does the work once, not twice.

const memo = new Map<string, RepoScan>();

export function scanOptions(root: string, maxFiles?: number): { maxFiles: number; maxBytes: number; out: string } {
  return {
    maxFiles: maxFiles ?? LIMITS.maxFiles,
    maxBytes: LIMITS.maxFileBytes,
    // Exclude ultradoc's own cache dir by absolute path — the engine only knows
    // to skip its own.
    out: join(root, CACHE_DIR_NAME),
  };
}

// Publish a scan the caller already performed, so the next reader reuses it.
export function publishScan(root: string, scan: RepoScan): void {
  memo.set(root, scan);
}

// The scan for `root`, computed once per process.
export function repoScan(root: string): RepoScan {
  const hit = memo.get(root);
  if (hit) return hit;
  const scan = scanRepo(root, scanOptions(root));
  memo.set(root, scan);
  return scan;
}

// Drop the memo — for tests that mutate a tree in place and re-scan it.
export function resetScanCache(): void {
  memo.clear();
}

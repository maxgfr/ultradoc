import { existsSync, mkdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoRef } from "./types.js";
import { cacheRoot } from "./config.js";
import { ensureClone as engineEnsureClone } from "./engine.js";

// Naming a repository, and getting a working tree for it — the vendored engine's.
//
// `resolveRepo`, `headCommit` and `originUrl` went with v1.13. The other four
// went with v1.14.0, each against something the engine gained rather than by
// accepting a regression:
//
//   - `ensureClone` keyed clones under THIS repo's persistent cache dir, and the
//     engine keyed them under its own. The engine now takes the directory from
//     the brand (`repoDir` in src/engine.ts), so adopting moves nothing.
//   - `ensureHistoryDepth` here knew something the engine's did not: `ensureClone`
//     clones `--filter=blob:none`, so unshallowing alone leaves a repository with
//     a full commit graph and no blob CONTENT, where every pickaxe comparison
//     triggers a per-blob promisor fetch. That logic was moved UP into the engine
//     rather than lost, and it is async there — see historySource, which awaits it.
//   - `sameCommit` here tolerated an ABBREVIATION and the engine's did not. Same
//     answer: the tolerance moved into the engine, with a 7-character floor this
//     copy lacked, so a one-character "SHA" can no longer match every commit.
export { ensureHistoryDepth, headCommit, originUrl, resolveRepo, sameCommit, repoCacheRoot as cacheRoot } from "./engine.js";

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

/**
 * A working tree for `ref`, cloned if needed, returned as an absolute path.
 *
 * A thin wrapper rather than a re-export, and named for what it adds: the
 * one-time move of a pre-1.8 clone out of /tmp. Everything else — the shallow
 * blobless clone, the retry without the partial-clone filter, the labelled
 * two-attempt error, the missing-git message — is the engine's.
 *
 * ASYNC, which the copy this replaced was not. That is a real change and it
 * ripples: `buildContext` and its callers are async now. It is also the right
 * way round — a synchronous `git clone` freezes the event loop for the whole
 * transfer, which is the difference between three clones taking as long as the
 * slowest and taking as long as all of them put together.
 */
export async function ensureRepoClone(ref: RepoRef, opts: { refresh?: boolean; branch?: string } = {}): Promise<string> {
  if (!ref.isLocal) migrateLegacyClone(join(cacheRoot(), ref.slug), ref.slug);
  return engineEnsureClone(ref, opts);
}

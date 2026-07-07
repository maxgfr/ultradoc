import type { RunContext, SourceResult, RepoRef } from "../types.js";
import { resolveRepo, originUrl } from "../clone.js";
import { providerFor } from "../providers/registry.js";

// Resolve the host/owner/repo to query for issues/PRs. For a remote repo that's
// the repo itself; for a LOCAL checkout we read its `origin` remote so a local
// question can still pull the project's issues and PRs. Exported for testing.
export function remoteRef(ctx: RunContext): RepoRef {
  if (!ctx.repoRef.isLocal && ctx.repoRef.owner && ctx.repoRef.repo) return ctx.repoRef;
  const origin = originUrl(ctx.repoDir);
  if (origin) {
    const r = resolveRepo(origin);
    if (r.owner && r.repo) return r;
  }
  return ctx.repoRef;
}

// The `issue` source: related issues (open and closed) matching the question.
export async function issuesSource(ctx: RunContext): Promise<SourceResult> {
  const ref = remoteRef(ctx);
  if (!ref.owner || !ref.repo) {
    return { source: "issue", items: [], notes: ["No remote resolved; cannot search issues for this repo."] };
  }
  const provider = providerFor(ref.host);
  const { items, notes } = await provider.search(ref, ctx.options.question, "issue", ctx.options.perSource);
  return { source: "issue", items, notes };
}

// The `pr` source: in-progress / related pull (or merge) requests. Surfacing
// open PRs is how ultradoc answers "is this being changed right now?".
export async function prsSource(ctx: RunContext): Promise<SourceResult> {
  const ref = remoteRef(ctx);
  if (!ref.owner || !ref.repo) {
    return { source: "pr", items: [], notes: ["No remote resolved; cannot search PRs for this repo."] };
  }
  const provider = providerFor(ref.host);
  const { items, notes } = await provider.search(ref, ctx.options.question, "pr", ctx.options.perSource);
  return { source: "pr", items, notes };
}

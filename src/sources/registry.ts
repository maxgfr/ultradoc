import type { RunContext, SourceResult, SourceKind } from "../types.js";
import { codeSource } from "./code.js";
import { docsSource } from "./docs.js";
import { issuesSource, prsSource } from "./issues.js";
import { stackoverflowSource } from "./stackoverflow.js";
import { webSource } from "./web.js";

type Handler = (ctx: RunContext) => Promise<SourceResult>;

// Registry of retrieval sources. Each is independent and returns ranked
// evidence + honest notes; the dossier assembles them. Sources run
// concurrently — code search is CPU-bound while issues/PRs/web/SO are
// network-bound, so overlapping them cuts wall-clock.
const HANDLERS: Record<SourceKind, Handler> = {
  code: codeSource,
  docs: docsSource,
  issue: issuesSource,
  pr: prsSource,
  so: stackoverflowSource,
  web: webSource,
};

export async function runSources(ctx: RunContext): Promise<SourceResult[]> {
  const cap = ctx.options.perSource;
  const tasks = ctx.options.sources.map(async (kind): Promise<SourceResult> => {
    const handler = HANDLERS[kind];
    if (!handler) return { source: kind, items: [], notes: [`Unknown source "${kind}".`] };
    try {
      const res = await handler(ctx);
      // Enforce the per-source cap uniformly (best-scored first) so one chatty
      // source can't dominate the dossier.
      const items = [...res.items].sort((a, b) => b.score - a.score).slice(0, cap);
      return { ...res, items };
    } catch (e) {
      return { source: kind, items: [], notes: [`${kind} source failed: ${(e as Error).message}`] };
    }
  });
  return Promise.all(tasks);
}

import { stackControl, type StackDeps } from "../../engine.js";

// Lifecycle of the optional local Docker stack. Separate from retrieval:
// `semantic up|down|status` and `firecrawl up|down|status` manage containers,
// they do not search.
//
// The compose file, the orchestration and the timeouts all live in the engine
// now — this file is the mapping from ultradoc's two commands onto it, and the
// wording ultradoc prints. Everything the previous version did is still done
// there and tested there against a fake docker: docker probed before it is
// spawned, images pulled on their own 20-minute budget before `up`'s five, and
// `--wait` on the healthchecks.
//
// What each command starts is deliberately unchanged:
//   semantic  → Qdrant + Ollama + SearXNG, the cheap local stack
//   firecrawl → the extraction stack, ~3 GB, kept out of `semantic` on purpose

/** Injectable Docker, so the mapping is testable without a daemon. */
export type SemanticControlDeps = StackDeps;

/**
 * The optional local stack behind semantic mode: the vector database, the
 * embedding server and — because `ultradoc web` wants it and it costs almost
 * nothing next to the other two — SearXNG. One compose call, not two: a second
 * against the same project recreates what the first started.
 */
export function semanticControl(action: string, deps: SemanticControlDeps = {}): { message: string; code: number } {
  return stackControl(["semantic", "searxng"], action, deps);
}

/**
 * The Firecrawl extraction stack. Kept out of `semantic` on purpose: ~3 GB of
 * images and five containers, which `semantic up` must not drag in.
 */
export function firecrawlControl(action: string, deps: SemanticControlDeps = {}): { message: string; code: number } {
  return stackControl("firecrawl", action, deps);
}

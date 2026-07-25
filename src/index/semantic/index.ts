import type { RunContext } from "../../types.js";
import { qdrantSearch, type SemanticResult } from "./qdrant.js";

// Tier-2 semantic retrieval, and the entry point every caller uses. Tier 1
// (ripgrep + the symbol index) is the default and needs nothing; this is what
// `--semantic` adds for conceptual questions whose wording does not appear in
// the code.
//
// It NEVER throws and never blocks an answer: an unavailable backend returns
// `available: false` with a note saying why, and the code source falls back to
// lexical retrieval. A degraded run must announce itself, not look complete.

export type { SemanticResult } from "./qdrant.js";
export { chunkText, chunkFile } from "./qdrant.js";
export { semanticControl, type SemanticControlDeps } from "./control.js";

export async function semanticSearch(ctx: RunContext): Promise<SemanticResult> {
  return qdrantSearch(ctx);
}

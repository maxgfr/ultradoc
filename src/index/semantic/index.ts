import type { RunContext, SemanticTier } from "../../types.js";
import { qdrantSearch } from "./qdrant.js";
import { endpointEncoder, staticEncoder, staticModelHint } from "./tiers.js";
import { vectorSearch, type SemanticResult } from "./vectors.js";

// Tier-2 semantic retrieval, and the entry point every caller uses. Tier 1
// (ripgrep + the symbol index) is the default and needs nothing; this is what
// `--semantic` adds for questions whose wording does not appear in the code.
//
// Three keyless backends, tried in order by `--semantic-tier auto`:
//
//   endpoint  an embedding server you already run (CODEINDEX_EMBED_ENDPOINT)
//   static    a local model file, no service at all — `ultradoc semantic pull`
//   docker    Qdrant + Ollama via `ultradoc semantic up`
//
// `static` comes before `docker` in `auto` because it needs no infrastructure:
// the tier that is actually available on a plain machine should be the one that
// runs. `docker` is not a fallback, it is the strongest tier — it embeds the
// real content of code and docs, where the other two embed symbol names,
// signatures and file summaries. Ask for it explicitly with
// `--semantic-tier docker` (after `ultradoc semantic up`) when the question
// needs prose rather than a name.
//
// Nothing here throws and nothing blocks an answer: with no backend the result
// is `available: false` plus a note saying which tiers were tried and how to
// enable one, and the code source falls back to lexical retrieval. A degraded
// run announces itself.

export type { SemanticResult } from "./vectors.js";
export { chunkText, chunkFile } from "./qdrant.js";
export { semanticControl, type SemanticControlDeps } from "./control.js";
export { pullStaticModel, hasStaticModel, modelPath } from "./model.js";

const unavailable = (why: string): SemanticResult => ({
  available: false,
  items: [],
  notes: [`Semantic mode unavailable (${why}); used Tier-1 lexical + structural search.`],
});

export async function semanticSearch(ctx: RunContext): Promise<SemanticResult> {
  const tier: SemanticTier = ctx.options.semanticTier ?? "auto";
  if (tier === "off") return unavailable("--semantic-tier off");

  if (tier === "endpoint" || tier === "auto") {
    const enc = await endpointEncoder();
    if (enc) return vectorSearch(ctx, enc);
    if (tier === "endpoint") return unavailable("no embedding endpoint reachable (set CODEINDEX_EMBED_ENDPOINT)");
  }

  if (tier === "static" || tier === "auto") {
    const enc = staticEncoder();
    if (enc) return vectorSearch(ctx, enc);
    if (tier === "static") return unavailable(`no local embedding model — ${staticModelHint()}`);
  }

  if (tier === "docker" || tier === "auto") {
    const res = await qdrantSearch(ctx);
    if (res.available || tier === "docker") return res;
  }

  return unavailable(`no backend available — ${staticModelHint()}, or run \`ultradoc semantic up\` for the Docker tier`);
}

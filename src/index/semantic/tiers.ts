import {
  buildEmbeddingIndex,
  buildEndpointIndex,
  encode,
  encodeQueryViaEndpoint,
  probeEndpoint,
  resolveEmbedEndpoint,
  type RepoScan,
} from "../../vendor/codeindex-engine.mjs";
import { loadStaticModel, modelPath } from "./model.js";
import type { Encoder } from "./vectors.js";

// The two keyless vector tiers, in preference order.
//
// What they can see matters as much as whether they run. Both embed a symbol's
// NAME, SIGNATURE and its file's summary — not its body. So they answer "which
// declaration is this question about" ("the function that computes the growing
// delay" → `computeBackoff`) far better than lexical search does, and they do
// NOT answer "why was it designed this way", which needs the prose. That is
// what the Docker tier's 60-line content chunks are for; the notes say so
// rather than letting a thin result look like an absent answer.

export function staticEncoder(): Encoder | undefined {
  const model = loadStaticModel();
  if (!model) return undefined;
  return {
    tier: "static",
    buildIndex: async (scan: RepoScan) => buildEmbeddingIndex(scan, model),
    encodeQuery: async (query: string) => encode(model, query),
    describe: () =>
      `Semantic search via the local static model (${model.modelId}, no service). It matches symbol names, signatures and file summaries — not implementation prose. For a "why is it designed this way" question, run \`ultradoc semantic up\` and re-ask: the Docker tier embeds the actual code and docs.`,
  };
}

export async function endpointEncoder(): Promise<Encoder | undefined> {
  const base = resolveEmbedEndpoint();
  if (!base) return undefined;
  if (!(await probeEndpoint(base))) return undefined;
  return {
    tier: "endpoint",
    buildIndex: async (scan: RepoScan) => buildEndpointIndex(scan),
    encodeQuery: async (query: string) => encodeQueryViaEndpoint(query),
    describe: () => `Semantic search via the embedding endpoint at ${base}. It matches symbol names, signatures and file summaries — not implementation prose.`,
  };
}

export function staticModelHint(): string {
  return `run \`ultradoc semantic pull\` to fetch it (~21 MB, once per machine, into ${modelPath()})`;
}

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEmbedModel, resolveEmbedPullUrl, type StaticEmbedModel } from "../../vendor/codeindex-engine.mjs";
import { cacheRoot } from "../../config.js";
import { httpGet } from "../../sources/fetch.js";

// The local static embedding model — a single `model.json` published as a
// codeindex release asset. It is what makes `--semantic` work with no Docker,
// no service and no API key: one ~small download into the shared cache, reused
// by every repo thereafter.
//
// Stored under ultradoc's OWN cache root rather than the engine's per-repo
// `.codeindex/models`, so it is pulled once per user instead of once per clone.

export function modelDir(): string {
  return join(cacheRoot(), "models");
}

export function modelPath(): string {
  return join(modelDir(), "model.json");
}

export function hasStaticModel(): boolean {
  return existsSync(modelPath());
}

// Load the model, or undefined when it has not been pulled. Never throws: a
// corrupt file degrades the run to the next tier with a note, it does not fail
// the question.
export function loadStaticModel(): StaticEmbedModel | undefined {
  try {
    return loadEmbedModel(modelDir());
  } catch {
    return undefined;
  }
}

export interface PullResult {
  ok: boolean;
  status: "up-to-date" | "pulled" | "failed";
  path: string;
  message: string;
}

// Fetch the model asset into the shared cache, verifying the published sha256.
// Same honesty contract as the grammar warm-up: it reports what happened and
// never throws, so an offline machine keeps working on the lexical tier.
export async function pullStaticModel(opts: { force?: boolean } = {}): Promise<PullResult> {
  const path = modelPath();
  if (!opts.force && hasStaticModel()) {
    return { ok: true, status: "up-to-date", path, message: `ultradoc semantic: embedding model already present at ${path}` };
  }
  const target = resolveEmbedPullUrl();
  // The asset is ~21 MB; httpGet's default 4 MB ceiling would truncate it. The
  // sha256 check below is the real guard — a short read fails loudly there.
  const res = await httpGet(target.url, { timeoutMs: 300_000, retries: 2, maxBytes: 64 * 1024 * 1024 });
  if (!res.ok || !res.body) {
    return { ok: false, status: "failed", path, message: `ultradoc semantic: could not fetch the embedding model from ${target.url} (HTTP ${res.status}).` };
  }
  if (target.sha256) {
    const got = createHash("sha256").update(res.body).digest("hex");
    if (got !== target.sha256) {
      // A mismatched asset is never written: a silently wrong model would
      // produce plausible-looking but meaningless rankings.
      return {
        ok: false,
        status: "failed",
        path,
        message: `ultradoc semantic: embedding model sha256 mismatch (expected ${target.sha256}, got ${got}) — not written.`,
      };
    }
  }
  try {
    mkdirSync(modelDir(), { recursive: true });
    writeFileSync(path, res.body);
  } catch (e) {
    return { ok: false, status: "failed", path, message: `ultradoc semantic: could not write the embedding model to ${path} (${(e as Error).message}).` };
  }
  return { ok: true, status: "pulled", path, message: `ultradoc semantic: embedding model ready at ${path}` };
}

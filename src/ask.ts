import { resolveRepo, ensureClone } from "./clone.js";
import { ensureIndex } from "./index/structural.js";
import { runSources } from "./sources/registry.js";
import { assignIds, writeDossier, defaultRunDir } from "./dossier.js";
import type { AskOptions, RunContext, DossierMeta, EvidenceItem, SourceKind } from "./types.js";
import type { DossierPaths } from "./dossier.js";

// Resolve a repo, ensure a working tree exists (clone or local), and build/load
// the structural index. The shared setup behind every retrieval command.
export function buildContext(options: AskOptions): RunContext {
  const repoRef = resolveRepo(options.repo);
  const repoDir = ensureClone(repoRef, { refresh: options.refresh, branch: options.ref });
  const index = ensureIndex(repoDir, repoRef.slug, { refresh: options.refresh });
  return { repoRef, repoDir, index, options };
}

export interface AskResult {
  dir: string;
  evidence: EvidenceItem[];
  meta: DossierMeta;
  paths: DossierPaths;
}

// Full `ask`: retrieve from every selected source, assemble a dossier, write it
// to disk. The model then reads EVIDENCE.md, writes ANSWER.md beside it, and
// runs `ultradoc check`.
export async function runAsk(options: AskOptions): Promise<AskResult> {
  const ctx = buildContext(options);
  const results = await runSources(ctx);
  const evidence = assignIds(results);
  const meta: DossierMeta = {
    question: options.question,
    repo: ctx.repoRef.raw,
    host: ctx.repoRef.host,
    ref: options.ref,
    commit: ctx.index.commit,
    sources: options.sources,
    semantic: options.semantic,
    evidenceCount: evidence.length,
    builtAt: new Date().toISOString(),
    notes: results.flatMap((r) => r.notes),
  };
  const dir = options.out ?? defaultRunDir(ctx.repoRef.slug);
  const paths = writeDossier(dir, evidence, meta);
  return { dir, evidence, meta, paths };
}

// Single-source drill-down used by `ultradoc code|issues|prs|docs|so`. Returns
// ranked evidence without writing a dossier — the model reads it from stdout.
export async function runSingleSource(
  options: AskOptions,
  kind: SourceKind,
): Promise<{ ctx: RunContext; evidence: EvidenceItem[]; notes: string[] }> {
  const ctx = buildContext({ ...options, sources: [kind] });
  const results = await runSources(ctx);
  return { ctx, evidence: assignIds(results), notes: results.flatMap((r) => r.notes) };
}

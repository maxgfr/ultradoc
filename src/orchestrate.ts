import {
  listPhases as engineListPhases,
  orchestrateRun as engineOrchestrateRun,
  type OrchestrateOptions as EngineOrchestrateOptions,
  type OrchestrateResult as EngineOrchestrateResult,
  type PhaseDefinition,
} from "./engine.js";
import type { DrillPlan } from "./drill-plan.js";
import { agentContracts, DOC_SCHEMA, DRILL_SCHEMA, runbookPreamble, VERIFY_SCHEMA } from "./orchestrate-templates.js";
import type { ClaimEvidencePair, DocPlan } from "./types.js";

// ---------------------------------------------------------------------------
// `ultradoc orchestrate` — the run's three phases, declared.
//
// The MACHINERY moved into the engine with webindex v1.15.0: resolving a
// worklist, batching it, emitting the Workflow script and the runbook, and
// asserting the two constraints that harness imposes (a pure-literal `meta`,
// and no Date.now/Math.random/new Date anywhere in the emitted file). That was
// the same ~470 lines in eight skills, and this repo's copy had a defect the
// others did not: it wrote its artifacts with a bare writeFileSync, so
// `--stdout` claimed to leave the filesystem untouched and wrote five files.
//
// What is left is what was always ultradoc's: WHICH phases exist, what their
// worklists are called, how to read an id out of one, and what the orchestrator
// runs to fold the fragments back in.
//
// Per-phase emission stays the point: each worklist only exists after its own
// engine step (`ask`, `verify --run`, `doc`), so a whole-pipeline script
// emitted up front could only carry placeholders — exactly what the check gates
// exist to prevent.
// ---------------------------------------------------------------------------

export const PHASES = ["drill", "verify", "doc"] as const;
export type PhaseName = (typeof PHASES)[number];

/** One explorer per drill cell of drill-plan.json. */
const DRILL: PhaseDefinition<DrillPlan> = {
  name: "drill",
  worklist: "drill-plan.json",
  ids: (plan) => (Array.isArray(plan?.cells) ? plan.cells.map((c) => c.id) : undefined),
  prerequisite: (run, engineAbs) => `node ${engineAbs} ask --repo <url|path> --q "<question>" --out ${run}`,
  role: "explorer",
  title: "Drill",
  schema: DRILL_SCHEMA,
  batchSize: 8,
  description: (n) => `Fan out the ${n} retrieval drill cell(s) of an ultradoc run (explorer fan-out, triaged returns)`,
  applyHint: (run, engineAbs) => [`node ${engineAbs} check --run ${run} --strict`],
};

/** Skeptic fan-out over VERIFY.todo.json's claim↔evidence pairs. */
const VERIFY: PhaseDefinition<{ pairs?: ClaimEvidencePair[] }> = {
  name: "verify",
  worklist: "VERIFY.todo.json",
  ids: (todo) => (Array.isArray(todo?.pairs) ? todo.pairs.map((p) => `${p.claimId}:${p.evidenceId}`) : undefined),
  prerequisite: (run, engineAbs) => `node ${engineAbs} verify --run ${run}`,
  role: "skeptic",
  title: "Verify",
  schema: VERIFY_SCHEMA,
  batchSize: 8,
  description: (n) => `Adversarially verify the ${n} claim↔evidence pair(s) of an ultradoc answer (skeptic fan-out)`,
  applyHint: (run, engineAbs) => [`node ${engineAbs} verify --apply verdicts.json --run ${run} && node ${engineAbs} check --run ${run} --semantic`],
};

/** One section-writer per outline section of DOC.plan.json. */
const DOC: PhaseDefinition<DocPlan> = {
  name: "doc",
  worklist: "DOC.plan.json",
  ids: (plan) => (Array.isArray(plan?.sections) ? plan.sections.map((s) => s.id) : undefined),
  prerequisite: (run, engineAbs) => `node ${engineAbs} doc --repo <url|path> --out ${run}`,
  role: "section-writer",
  title: "Write",
  schema: DOC_SCHEMA,
  batchSize: 8,
  description: (n) => `Draft the ${n} outline section(s) of an ultradoc reference doc (section-writer fan-out)`,
  applyHint: (run, engineAbs) => [`node ${engineAbs} check --run ${run}`],
};

/** This run's phases, in order. */
// biome-ignore lint/suspicious/noExplicitAny: three differently-typed worklists in one table, which is the real shape
export const PHASE_DEFS = [DRILL, VERIFY, DOC] as any as PhaseDefinition<unknown>[];

// The runner, the resolver and their types are the engine's. Re-exported so
// every existing `from "./orchestrate.js"` keeps resolving.
export { BATCH_SIZE, listPhases, orchestrateRun, SMALL_WORKLIST, type OrchestrateOptions, type OrchestrateResult, type PhaseInfo } from "./engine.js";

/** This run's phases, resolved. A binder over the engine, not a second resolver. */
export function listPhasesFor(runDir: string, engineAbs: string) {
  return engineListPhases(runDir, engineAbs, PHASE_DEFS);
}

/**
 * Emit this run's orchestration.
 *
 * A binder, not a fork: it supplies the three things that are ultradoc's — the
 * phase table, the dispatch contracts and the sequential runbook prose — and
 * hands them to the engine's runner. Named for what it does rather than
 * shadowing `orchestrateRun`, which the usage gate would refuse and which would
 * make it impossible to tell at a call site whose implementation was running.
 */
export function emitOrchestration(runDir: string, engineAbs: string, opts: EngineOrchestrateOptions = {}): EngineOrchestrateResult {
  return engineOrchestrateRun(runDir, engineAbs, PHASE_DEFS, agentContracts, {
    ...opts,
    runbookPreamble: runbookPreamble(listPhasesFor(runDir, engineAbs), runDir, engineAbs),
  });
}

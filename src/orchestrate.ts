import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DrillPlan } from "./drill-plan.js";
import { agentContracts, phaseWorkflowScript, runbookMd } from "./orchestrate-templates.js";
import type { ClaimEvidencePair, DocPlan } from "./types.js";

// ---------------------------------------------------------------------------
// `ultradoc orchestrate` — emit the run's multi-agent orchestration from its
// CURRENT worklists (per-phase workflow scripts + dispatch contracts + a
// sequential RUNBOOK), so a subagent-capable harness fans the retrieval,
// verification and doc-writing work out while the main agent stays the sole
// writer. Per-phase emission is deliberate: each worklist only exists after
// its engine step (`ask`, `verify --run`, `doc`), so a whole-pipeline script
// could only carry placeholders — exactly what the check/verify gates exist
// to prevent.
// ---------------------------------------------------------------------------

export const PHASES = ["drill", "verify", "doc"] as const;
export type PhaseName = (typeof PHASES)[number];

/** Small worklists don't amortize a fan-out — orchestrate says so and nudges --eco. */
export const SMALL_WORKLIST = 3;
/** One subagent per batch of at most this many worklist items. */
export const BATCH_SIZE = 8;

export interface PhaseInfo {
  name: PhaseName;
  ready: boolean;
  /** Absolute path of the worklist this phase fans out over. */
  worklist: string;
  items: number;
  /** The injected fan-out ids (cell `D#` for drill, `claimId:evidenceId` for verify, section `S#` for doc). */
  ids: string[];
  /** The engine command that produces the worklist when it is missing. */
  prerequisite: string;
}

export function listPhases(runDir: string, engineAbs: string): PhaseInfo[] {
  const run = resolve(runDir);

  const drillPath = join(run, "drill-plan.json");
  let drillIds: string[] = [];
  let drillReady = false;
  if (existsSync(drillPath)) {
    try {
      const plan = JSON.parse(readFileSync(drillPath, "utf8")) as DrillPlan;
      if (plan && Array.isArray(plan.cells)) {
        drillReady = true;
        drillIds = plan.cells.map((c) => c.id);
      }
    } catch {
      /* unreadable worklist = not ready */
    }
  }

  const verPath = join(run, "VERIFY.todo.json");
  let verIds: string[] = [];
  let verReady = false;
  if (existsSync(verPath)) {
    try {
      const todo = JSON.parse(readFileSync(verPath, "utf8")) as { pairs?: ClaimEvidencePair[] };
      if (todo && Array.isArray(todo.pairs)) {
        verReady = true;
        verIds = todo.pairs.map((p) => `${p.claimId}:${p.evidenceId}`);
      }
    } catch {
      /* unreadable worklist = not ready */
    }
  }

  const docPath = join(run, "DOC.plan.json");
  let docIds: string[] = [];
  let docReady = false;
  if (existsSync(docPath)) {
    try {
      const plan = JSON.parse(readFileSync(docPath, "utf8")) as DocPlan;
      if (plan && Array.isArray(plan.sections)) {
        docReady = true;
        docIds = plan.sections.map((s) => s.id);
      }
    } catch {
      /* unreadable worklist = not ready */
    }
  }

  return [
    {
      name: "drill",
      ready: drillReady,
      worklist: drillPath,
      items: drillIds.length,
      ids: drillIds,
      prerequisite: `node ${engineAbs} ask --repo <url|path> --q "<question>" --out ${run}`,
    },
    {
      name: "verify",
      ready: verReady,
      worklist: verPath,
      items: verIds.length,
      ids: verIds,
      prerequisite: `node ${engineAbs} verify --run ${run}`,
    },
    {
      name: "doc",
      ready: docReady,
      worklist: docPath,
      items: docIds.length,
      ids: docIds,
      prerequisite: `node ${engineAbs} doc --repo <url|path> --out ${run}`,
    },
  ];
}

export interface OrchestrateOptions {
  /** Emit only this phase (exit 2 if its worklist does not exist yet). */
  phase?: string;
  /** Emit only the RUNBOOK + contracts (the explicit low-token sequential path). */
  eco?: boolean;
}

export interface OrchestrateResult {
  exitCode: number;
  written: string[];
  notices: string[];
  errors: string[];
  phases: PhaseInfo[];
}

export function orchestrateRun(runDir: string, engineAbs: string, opts: OrchestrateOptions = {}): OrchestrateResult {
  const run = resolve(runDir);
  if (!existsSync(run)) {
    return { exitCode: 2, written: [], notices: [], errors: [`run dir not found: ${run}`], phases: [] };
  }
  const phases = listPhases(run, engineAbs);

  let selected = phases.filter((p) => p.ready);
  if (opts.phase !== undefined) {
    const ph = phases.find((p) => p.name === opts.phase);
    if (!ph) {
      return {
        exitCode: 2,
        written: [],
        notices: [],
        errors: [`unknown phase "${opts.phase}" — expected one of: ${PHASES.join(", ")}.`],
        phases,
      };
    }
    if (!ph.ready) {
      return {
        exitCode: 2,
        written: [],
        notices: [],
        errors: [`phase "${ph.name}" is not ready — its worklist ${ph.worklist} does not exist yet. Produce it first: ${ph.prerequisite}`],
        phases,
      };
    }
    selected = [ph];
  }

  const orchDir = join(run, "orchestration");
  const agentsDir = join(orchDir, "agents");
  mkdirSync(join(orchDir, "out"), { recursive: true });
  mkdirSync(agentsDir, { recursive: true });

  const written: string[] = [];
  const notices: string[] = [];

  // Contracts: every role, every call (idempotent overwrite) — they double as the
  // RUNBOOK's self-pass checklists, so eco mode needs them too.
  for (const [name, content] of Object.entries(agentContracts(run, engineAbs))) {
    const p = join(agentsDir, `${name}.md`);
    writeFileSync(p, content);
    written.push(p);
  }

  if (!opts.eco) {
    for (const ph of selected) {
      if (ph.items === 0) {
        notices.push(`phase "${ph.name}": worklist is empty — nothing to orchestrate.`);
        continue;
      }
      if (ph.items <= SMALL_WORKLIST) {
        notices.push(`phase "${ph.name}": only ${ph.items} item(s) — the sequential --eco path is equivalent and cheaper.`);
      }
      const p = join(orchDir, `${ph.name}.workflow.mjs`);
      writeFileSync(p, phaseWorkflowScript(ph, run, engineAbs, BATCH_SIZE));
      written.push(p);
    }
  }

  const rb = join(orchDir, "RUNBOOK.md");
  writeFileSync(rb, runbookMd(phases, run, engineAbs));
  written.push(rb);

  return { exitCode: 0, written, notices, errors: [], phases };
}

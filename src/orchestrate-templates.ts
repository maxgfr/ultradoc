import { join } from "node:path";
import type { PhaseInfo } from "./engine.js";

// ---------------------------------------------------------------------------
// Templates for `ultradoc orchestrate` — the generator that turns the run's
// CURRENT worklists into a launchable multi-agent Workflow per phase, the
// dispatch contracts it references, and a sequential RUNBOOK fallback.
// Everything here is emitted by string concatenation with the run's constants
// injected as JSON literals, so the workflow runs as-is under the Workflow
// tool: `export const meta` stays a pure literal, and no emitted line ever
// calls Date.now()/Math.random()/new Date() (they throw in that harness).
// The contract prose mirrors skills/ultradoc/references/orchestration.md — the
// return contracts and triage rules live THERE; this generator bakes them into
// per-run files so prose and dispatch can't drift.
// ---------------------------------------------------------------------------

/** Family-standard footer: subagents return fragments; the orchestrator is the sole writer. */
const ONE_WRITER_FOOTER = `
## Return, don't write

Return ONLY the structured output specified above. Do NOT write, edit, or delete any file; do NOT run any engine command that writes (\`ask\`, \`doc\`, \`verify --run\`, \`verify --apply\`, \`overview\`, \`index\`, \`semantic up|down\`, \`cache clean\`). The orchestrator is the sole writer — it folds your fragments into the run itself and runs the grounding gates. Exception: if a justification is prose too large to return, write ONLY to \`<RUN>/orchestration/out/<role>-<batch>.md\` (a file namespaced to you alone) and return its path.
`;

// Structured-output schemas the emitted workflows pass to agent(..., { schema }).
// They mirror what the folds enforce — a verdict fragment that validates here
// still gets re-checked by `verify --apply` + `check --semantic` at fold time.
export const DRILL_SCHEMA = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: 8,
      description: "the ≤8 triaged evidence items for this WHOLE leaf (the lean-return contract)",
      items: {
        type: "object",
        required: ["cell", "ref", "quote"],
        properties: {
          cell: { type: "string", description: "the drill cell id (D#)" },
          ref: { type: "string", description: "file:line / issue#N / pr#N / url" },
          source: { type: "string" },
          evidenceId: { type: "string", description: "the [E#] id when the item already exists in the run's dossier" },
          quote: { type: "string", description: "the single load-bearing quote" },
        },
      },
    },
    dry: { type: "array", items: { type: "string" }, description: "cell ids that surfaced nothing on-topic" },
  },
};

export const VERIFY_SCHEMA = {
  type: "object",
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        required: ["claimId", "evidenceId", "verdict", "note"],
        properties: {
          claimId: { type: "string" },
          evidenceId: { type: "string" },
          verdict: { enum: ["supported", "partial", "refuted", "unsupported"] },
          note: { type: "string", description: "one line grounded in the digest/current source you read" },
        },
      },
    },
  },
};

export const DOC_SCHEMA = {
  type: "object",
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "markdown"],
        properties: {
          id: { type: "string", description: "the section id (S#)" },
          markdown: { type: "string", description: "the section's cited prose (heading included, every claim cites [E#])" },
          gaps: { type: "array", items: { type: "string" }, description: "sub-topics the evidence does not settle (explicit unknowns)" },
        },
      },
    },
  },
};

export function agentContracts(runAbs: string, engineAbs: string): Record<string, string> {
  // Function form: a path containing `$&`-style sequences must substitute literally.
  const footer = ONE_WRITER_FOOTER.replaceAll("<RUN>", () => runAbs);
  return {
    explorer: `# Contract: explorer

You run ONE slice of an ultradoc retrieval fan-out — a few drill cells, each one stateless, read-only CLI call against the cached clone+index. Recall is the first lever of a grounded answer: your cells are exactly the query-variant × source pairs the seed \`ask\` did not cover.

Worklist: \`${join(runAbs, "drill-plan.json")}\` (an object with \`question\`, \`repo\`, optional \`ref\`/\`pkg\`, and \`cells[]\`; each cell has \`id\`, \`variant\`, \`query\`, \`source\`). Handle ONLY the cells whose \`id\` is named in your prompt (\`ITEMS=<id,…>\`).

For EACH of your cells:

1. Compose the drill command.
   - \`variant: "symbol"\` resolves ONE declaration rather than running a search:
     \`node ${engineAbs} symbol --repo <plan.repo> --name <cell.query>\` — it returns the definition (real body), every call site with the caller it sits in, and where else the name is mentioned. If it reports no such declaration, say so in \`dry\` and move on; do NOT fall back to a lexical search for it, another cell already covers that.
   - Otherwise the cell's \`source\` maps to a CLI command (code→\`code\`, docs→\`docs\`, release→\`releases\`, history→\`history\`, issue→\`issues\`, pr→\`prs\`, discussion→\`discussions\`, so→\`so\`, web→\`web\`):
     \`node ${engineAbs} <command> --repo <plan.repo> --q <cell.query>\`.
   Add \`--package <plan.pkg>\` / \`--ref <plan.ref>\` when the plan sets them.
   Queries are free text — quote them safely for YOUR shell (single-quote and escape embedded \`'\`; never paste a query into double quotes where \`$\`/backticks expand), and quote \`<plan.repo>\` too.
2. Run it and read the printed evidence. These single-source drills print to stdout and write nothing — they are the only engine commands you may run.
3. Triage before returning (playbook rules): keep an item only if its snippet names the symbol/behavior or describes the same mechanism, not just a shared keyword. Drop keyword-coincidences, vendored/example/fixture code, and superseded discussion.

Return ONLY triaged evidence (structured output): \`{ "items": [{ "cell", "ref", "source", "evidenceId", "quote" }], "dry": [cell ids that surfaced nothing on-topic] }\` — for each kept item, its \`ref\` (file:line / issue#/pr#/url), its evidence id if it came from the run's dossier, and the single load-bearing quote. **Max ~8 items per leaf.** **Never return the raw dossier** — a subagent that dumps printed EVIDENCE output back is worse than no subagent, because the whole point was to keep the orchestrator's context lean.
${footer}`,
    skeptic: `# Contract: skeptic

You are an adversarial skeptic verifying that an ultradoc answer's citations actually SUPPORT its claims. Default to disbelief: the cited evidence must back the claim, not merely mention its keywords.

Worklist: \`${join(runAbs, "VERIFY.todo.json")}\` (an object with \`pairs[]\`; each pair has \`claimId\`, \`claim\`, \`evidenceId\`, \`ref\`, \`source\`, \`digest\`, and sometimes \`crossCheck: true\`). Handle ONLY the pairs whose \`<claimId>:<evidenceId>\` id is named in your prompt (\`ITEMS=<id,…>\`).

For EACH of your pairs:

1. Read the \`claim\` against the \`digest\` (the cited item's snippet). When the digest alone cannot settle it, open the underlying source (\`ref\`: a file in the pinned clone, an issue/PR, a doc/web url).
2. Judge whether the evidence supports the claim:
   - \`supported\` — the digest literally states the claim.
   - \`partial\` — the digest backs some of the claim but not all of it.
   - \`unsupported\` — the digest is on-topic but does **not** state the claim.
   - \`refuted\` — the digest **contradicts** the claim.
   When unsure, choose the HARSHER verdict (\`unsupported\` over \`partial\`) — a false pass is worse than a false fail.
3. A pair flagged \`crossCheck\` (⚠ cross-check in VERIFY.md) is grounded in an issue or PR — a tracker thread describes behavior at a point in time. Judge it against the CURRENT code: if the current source contradicts the claim, mark it \`refuted\`; if the behavior changed later, mark it \`partial\` and demand a temporal qualifier citing the fixing release. Never present stale tracker behavior as current just because the claim is faithful to the thread.
4. \`note\` is REQUIRED — one line grounded in what you read (quote or paraphrase the decisive text).

Return (structured output): \`{ "verdicts": [{ "claimId", "evidenceId", "verdict", "note" }] }\` — your ITEMS only.
${footer}`,
    "section-writer": `# Contract: section-writer

You draft section(s) of an ultradoc grounded reference doc. The engine already retrieved and merged the evidence; your job is cited prose, not new retrieval.

Worklist: \`${join(runAbs, "DOC.plan.json")}\` (a plan with \`sections[]\`; each section has \`id\`, \`title\`, \`query\`, \`evidenceIds\`). Handle ONLY the sections whose \`id\` is named in your prompt (\`ITEMS=<id,…>\`).

For EACH of your sections:

1. Read its entry in \`${join(runAbs, "DOC.todo.md")}\` and the cited snippets in \`${join(runAbs, "EVIDENCE.md")}\` (\`evidence.json\` holds the full items).
2. Draft the section's markdown: its heading plus grounded prose where EVERY factual claim cites a resolvable evidence id like \`[E3]\`. Cite only ids that exist in the run's \`evidence.json\`; never write from memory.
3. Thin evidence? You may drill read-only for context (\`node ${engineAbs} code|docs|issues|prs|releases|history|discussions|so|web --repo … --q "…"\`), but a claim may still only cite the run's existing \`[E#]\` ids — anything the dossier does not contain stays a gap.
4. State what the evidence does not settle in \`gaps\` (explicit unknowns) instead of papering over it.

Return (structured output): \`{ "sections": [{ "id", "markdown", "gaps" }] }\` — your ITEMS only. The orchestrator assembles \`DOC.md\` in plan order and runs the check gate.
${footer}`,
  };
}

// ultradoc's OWN runbook prose — its pipeline, not shared machinery. Handed
// to the engine as the preamble; the engine appends its per-phase listing.
// No H1 and no `Run:` line: the engine emits both above this.
export function runbookPreamble(phases: PhaseInfo[], runAbs: string, engineAbs: string): string[] {
  const status = phases
    .map((p) => `| ${p.name} | \`${p.worklist}\` | ${p.ready ? `ready (${p.items} item(s))` : "not ready"} | \`${p.prerequisite}\` |`)
    .join("\n");
  const engine = `node ${engineAbs}`;
  return [
    `Engine: \`${engine}\`

Generated by \`ultradoc orchestrate\` from the CURRENT run state. This sequential path is
correctness-identical to the multi-agent workflows — same worklists, same contracts, same
grounding gates; only wall-clock differs. Fan-out is an optimization, not a requirement.

## Phase status

| Phase | Worklist | Status | Produce it with |
|---|---|---|---|
${status}

## The loop (play every role yourself, one item at a time)

1. **Seed** (if not done): \`${engine} ask --repo <url|path> --q "<question>" --out ${runAbs}\` → \`${join(runAbs, "EVIDENCE.md")}\`, \`${join(runAbs, "evidence.json")}\` and the drill plan \`${join(runAbs, "drill-plan.json")}\`.
2. **Drill the plan** — for EVERY cell in \`${join(runAbs, "drill-plan.json")}\`, apply \`${join(runAbs, "orchestration", "agents", "explorer.md")}\` yourself (run the cell's read-only drill command, triage, keep ≤8 items per round). When your harness runs parallel tool-calls, batch the independent drills of a round in one message.
3. **Write** \`${join(runAbs, "ANSWER.md")}\` (cite \`[E#]\`), then gate: \`${engine} check --run ${runAbs} --strict\`.
4. **Verify the claims** — \`${engine} verify --run ${runAbs}\` writes \`${join(runAbs, "VERIFY.todo.json")}\`. For EVERY pair, apply \`${join(runAbs, "orchestration", "agents", "skeptic.md")}\` yourself (verdict supported/partial/refuted/unsupported + note), collect every verdict into ONE \`${join(runAbs, "verdicts.json")}\`, then fold: \`${engine} verify --apply verdicts.json --run ${runAbs}\`.
5. **Gate**: \`${engine} check --semantic --run ${runAbs}\` must exit 0 before presenting anything.
6. **Doc mode** (a whole-project doc instead of one answer): \`${engine} doc --repo <url|path> --out ${runAbs}\` writes \`${join(runAbs, "DOC.plan.json")}\` + \`${join(runAbs, "DOC.todo.md")}\`. For EVERY section, apply \`${join(runAbs, "orchestration", "agents", "section-writer.md")}\` yourself and assemble \`${join(runAbs, "DOC.md")}\` in plan order; then steps 4–5 (the gates auto-detect DOC.md).

With subagents available, prefer the emitted workflows instead: \`orchestrate --run ${runAbs} --phase <p>\` then \`Workflow({ scriptPath: "${join(runAbs, "orchestration", "<p>.workflow.mjs")}" })\` — you stay the sole writer either way.
`,
  ];
}

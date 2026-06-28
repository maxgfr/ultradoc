# Orchestration — parallelize retrieval and verification

Retrieval and verification in `ultradoc` are made of **independent, near-free
calls**: the drill commands (`code`/`issues`/… `--q`) print and write nothing, and
`verify` emits a worklist of independent claim↔evidence pairs. So the work fans out.
This file is how to run that fan-out across parallel tool-calls or subagents — and how
to do it inline when you can't.

> **The governing rule:** subagents and parallel tool-calls are *latency
> optimizations*. The grounding gates (`check`, `verify`, `check --semantic`) are
> harness-independent. Every recipe below has a sequential fallback that is
> correctness-equivalent — only speed differs. Never block waiting for a capability
> your harness doesn't have.

## Why parallelize

Recall is the first lever of a grounded answer: an answer is only as good as the
evidence you found. A linear agent runs one `ask`, reads the dossier, and stops — it
**satisfices**, and the variants/sources it never tried are exactly where the missing
evidence was. Fanning the work out makes thoroughness cheap, so you stop because the
evidence is complete, not because you got tired of drilling.

## Retrieval fan-out

The retrieval surface is a matrix:

| | `code` | `issues` | `prs` | `docs` | `releases` | `history` | `discussions` | `web`/`so` |
|---|---|---|---|---|---|---|---|---|
| variant A (prose) | ✓ | ✓ | … | | | | | |
| variant B (`identifier`) | ✓ | | ✓ | | | | | |
| variant C (`ERROR_CODE`) | ✓ | | | | | | | |

Each cell is **one stateless CLI call** against the cached clone+index. Pick the cells
that fit the question (see `retrieval-playbook.md` for which sources match which kind
of question) and run them as a fan-out.

**Don't fan out multiple `ask`s.** `ask` already runs its sources concurrently and
reuses the cache, so parallel `ask`s just duplicate the source fan-out and flood your
context with overlapping dossiers. Issue **one** broad `ask` as the seed, then fan out
the **drills** — `{remaining variants} × {drill sources}`.

**Without subagents (the default path).** Batch every independent drill for the round
into **one message** (parallel tool-calls). The harness runs them concurrently; you
read the printed evidence, triage it (`retrieval-playbook.md` → "Triage before you
write"), and move to the next round.

**With subagents (or a workflow).** Dispatch one explorer per source (or per
high-value variant). Each runs its drills, reads its slice, triages, and returns a
distilled result — this keeps *your* context lean and pushes the triage work into the
leaf where it parallelizes. On Claude Code this maps to the Workflow tool's
`parallel()` / `pipeline()` patterns; on any harness it's the Task/subagent tool.

> **Return contract (load-bearing — do not skip).** A retrieval subagent returns ONLY
> triaged evidence: for each kept item, its `ref` (file:line / issue#/pr#/url), its
> evidence id if it came from a dossier, and the single load-bearing quote. **Max ~8
> items per leaf.** Drop keyword-coincidences, vendored/example/fixture code, and
> superseded discussion (same triage rules as the playbook). **Never return the raw
> dossier** — a subagent that dumps `EVIDENCE.md` back is worse than no subagent,
> because the whole point was to keep the orchestrator's context lean.

## Convergence — loop until dry

Drill in **rounds**, capped at ~3. End retrieval when either:

- a round surfaces **no new on-topic evidence id** (the wording is exhausted, not the
  repo — re-phrasing one more time won't help), **or**
- **every sub-question has ≥2 supporting items** (you're done; more is noise).

Decompose a multi-part question into sub-questions up front (in `ask`'s step 2) and
track coverage per sub-question across rounds. Any sub-question still without support
after the cap is an **explicit "unknown"** in the answer, never filled from memory —
this is the same completeness bar as `answer-rubric.md` §1, made operational.

## Verification fan-out

`verify --run <dir>` writes `VERIFY.todo.json`: independent
`(claimId, evidenceId, ref, source, digest)` pairs (capped at 40, highest-score first).
**That file is the worklist** — one judgement per pair, and the judgements are
independent, so they fan out.

**The skeptic's job is adversarial.** For each pair, judge whether the `digest`
actually backs the `claim`, defaulting to *disbelief*:

| Verdict | Set it when… |
|---------|--------------|
| `supported` | the digest literally states the claim |
| `partial` | the digest backs some of the claim but not all of it |
| `unsupported` | the digest is on-topic but does **not** state the claim (your default when unsure) |
| `refuted` | the digest **contradicts** the claim |

**With subagents:** one skeptic per pair (or per claim). Each **returns** its verdict
object `{ claimId, evidenceId, verdict, note }` — it must **not write any file**. The
orchestrator merges every returned verdict into **one** `verdicts.json` (`applyVerdicts`
accepts `{ "pairs": [ … ] }` or a bare `[ … ]` array). If skeptics each wrote their own
file, only one would get applied and the rest would be silently dropped. Then:

```
node scripts/ultradoc.mjs verify --apply verdicts.json --run <dir>
node scripts/ultradoc.mjs check  --semantic            --run <dir>
```

**Without subagents:** adjudicate each pair inline, in `VERIFY.md` order, with the same
skeptical default. The gate is identical — only the speed differs.

**How the gate folds (so you know the stakes).** A claim **fails** if *any* of its
cited items is `refuted`, or if *all* of its cited items are `unsupported` (`verify.ts`
→ `reduceVerdicts`). Because the fold is already AND-across-evidence, **one honest
skeptic per pair is enough**. Multi-vote (several skeptics on the same claim,
majority-refute kills) is an *optional* escalation — reserve it for a single
load-bearing claim whose verdict you don't trust, not the default.

When a claim fails, fix it at the source: re-cite to a better item, weaken the claim to
what the evidence supports, drop it, or retrieve a stronger item — then re-verify until
`check --semantic` passes.

## Progressive enhancement

Run everything at the highest tier your harness offers, and degrade without ceremony:

- **Subagents / a workflow available** → fan out retrieval explorers and verification
  skeptics (return contracts above).
- **Parallel tool-calls but no subagents** → batch independent drills in one message;
  adjudicate verify pairs inline. This is the common middle tier and loses nothing
  essential.
- **Purely sequential** → do every step one at a time. Recall and the grounding gates
  don't depend on parallelism; only latency does.
- **This skill is itself running inside a subagent that can't spawn more** → use the
  batched-parallel-calls path, or go fully sequential. Never stall waiting on a
  capability you don't have.

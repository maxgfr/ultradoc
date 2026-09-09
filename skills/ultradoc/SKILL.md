---
name: ultradoc
description: Answer questions about an open-source project and write reference documentation with citations to its actual source.
disable-model-invocation: true
license: MIT
metadata:
  version: 2.31.6
  opencode/autoinvoke: 'false'
---

# ultradoc

Answer from retrieved source evidence and deliver a cited answer or reference
manual. The bundled `scripts/ultradoc.mjs` is a zero-dependency Node engine.
Resolve script paths relative to this skill directory, not the target checkout.

## Choose the smallest sufficient route

| Request | Route |
|---|---|
| One local fact or named declaration | Fast answer below |
| Behavior, ambiguity, interpretation, issue/PR evidence | Standard answer below |
| Whole-project/package reference documentation | `doc` workflow in [workflow.md](references/workflow.md#generate-a-documentation) |
| Declaration body/callers | `symbol --repo <path> --name <symbol>`; lexical search alone cannot establish calls |
| Cross-file implementation → callers → tests | `trace`; first read [trace.md](references/trace.md) |
| Version/change history | Retrieve `releases,history`, pin `--ref` when specified |

Use `node <skill-dir>/scripts/ultradoc.mjs --help` for flags. A local-only request
uses `--sources code,docs`; do not probe remote providers for it. Do not load the
full workflow, overview, optional semantic setup or orchestration for a small
question unless evidence exposes a gap.

## Fast answer

For one fact settled by at most three literal code/docs claims:

1. Run `ask --repo <path> --q "<identifier and question>" --sources code,docs
   --out <run-dir>`. Read its retrieval notes, then the relevant excerpts in
   `EVIDENCE.md`. One named declaration may instead start with `symbol`, then
   persist the evidence needed by the answer/check workflow.
2. Read [citation-format.md](references/citation-format.md), write `ANSWER.md`
   in the run directory: answer first, one claim per sentence, each cited `[E#]`.
   Put the pinned commit from `meta.json` in an HTML comment. Put unresolved
   matters under `## Unknowns`; never fill them from memory. Before describing
   an effect, inspect callback defaults and injected dependencies: distinguish
   computed/requested values from executed effects. A no-op implementation is
   evidence of no effect, not an unknown or a real timer/write/network call.
3. Run `check --run <run-dir> --strict`. Repair citation/coverage failures and
   rerun. If its coverage summary counts more than three claims, use the
   standard semantic verification below; a strict pass does not waive that
   gate. Present the answer, clickable source refs, commit and unknowns.

Stop when the excerpt settles the question and the gate passes. Do not execute
unrelated project tests for a read-only explanation. Additional retrieval is for
an identified evidence gap, not a required number of commands.

Any interpretation, disputed behavior or issue/PR claim requires the semantic
verification below. A resolvable citation alone does not prove its claim.

## Standard answer and semantic verification

1. Resolve the project, precise question and requested version. Ask only when
   target ambiguity prevents retrieval. Split multipart questions into explicit
   subquestions. Read [retrieval-playbook.md](references/retrieval-playbook.md)
   when choosing sources/query variants; use `ask` to persist a pinned dossier.
2. Read retrieval notes before snippets: truncation, rate limits, regex-tier
   analysis and missing providers bound the answer. Decode unclear notes using
   [reading-evidence.md](references/reading-evidence.md) and
   [engine-evidence.md](references/engine-evidence.md).
3. Drill only unresolved subquestions. Standard: one drill round, targeting two
   on-topic items per subquestion. Deep/contested: up to three rounds; stop when
   a round yields no new on-topic evidence. State remaining gaps explicitly.
4. Write the same answer contract as the fast path. Always run `check --strict`.
5. Run `verify --run <run-dir>`, judge every claim↔evidence pair skeptically as
   `supported`, `partial`, `refuted` or `unsupported`, with a concrete note.
   Cross-check issue/PR assertions against current code. Fold verdicts into one
   file, then run `verify --apply <verdicts.json> --run <run-dir>` and
   `check --semantic --run <run-dir>`. Missing verification fails closed.
   Fix, weaken, drop or re-retrieve unsupported claims and re-verify; never
   bypass the gate to obtain a pass.
6. Review [answer-rubric.md](references/answer-rubric.md), then present the
   answer in the user's language with source links, commit and coverage gaps.

## Evidence rules

- Answer only from retrieved evidence. A familiar API or matching keyword is
  insufficient; the snippet must support the actual statement.
- Never call an empty, capped or failed retrieval proof of absence. Bound the
  conclusion to what was searched and disclose missing sources.
- `check --strict` applies to every answer and every generated `DOC.md`.
  Semantic verification is required except for the narrow fast path above.
- Keep going through recoverable errors. Rephrase an off-topic query; scope a
  truncated monorepo with `--package`; use available local sources offline and
  state the gap. Do not claim evidence from a failed provider.
- Retrieval and verification may run sequentially. Optional fan-out never
  changes the evidence or exit gates.

## Open detail only when needed

- [workflow.md](references/workflow.md): complete workflow, documentation,
  recovery table, source routing and optional semantic mode.
- [tuning.md](references/tuning.md): caps, caching, cost and noisy retrieval.
- [orchestration.md](references/orchestration.md): independent worklists,
  subagent contracts and sequential eco mode; one writer folds results.
- [provider-apis.md](references/provider-apis.md): issue/PR provider problems.
- [web-discovery.md](references/web-discovery.md): web extraction and discovery.
- [semantic-setup.md](references/semantic-setup.md): optional local vector tiers.
- [worked-example.md](references/worked-example.md): complete worked answer.

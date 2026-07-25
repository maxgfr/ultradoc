---
name: ultradoc
description: "Use when the user asks a precise question about a NAMED open-source project (library, framework, CLI, tool) and the answer must come from its real source rather than the model's memory. Triggers: 'how does X work in <lib>', 'why does <lib> do <thing>', 'does <lib> support X', 'what is the default for <option>', 'where is X used / who calls X', 'is there an open issue or PR about <behavior>', 'when was X added / which version introduced it', 'what changed in <repo>', 'is this a bug in <lib> or in my code', 'explain this error from <lib>', 'which package of <monorepo> implements X', 'v1 vs v2 of <lib>'. Also when the user wants cited REFERENCE DOCUMENTATION written for a library or one package: 'document this project', 'generate docs for <lib>'. Not for the user's own working repo, and not for general web research."
license: MIT
metadata:
  version: 2.8.0
---

# ultradoc — answer questions from the source, not from memory

`ultradoc` answers ultra-precise questions about an open-source project by
**retrieving grounded evidence** and reasoning over it. The deterministic engine
(`scripts/ultradoc.mjs`, zero-dependency Node, no keys, no `npm install`) does
the searching and indexing **with code**; your job is to read the retrieved
evidence and write a precise, **cited** answer. This is enforced: `ultradoc
check` fails if any citation does not resolve to retrieved evidence, and
re-validates each code/docs excerpt against the pinned clone.

> **The core rule:** do not answer from your own knowledge of the library. Your
> training data is stale and hallucinates APIs. Answer **only** from the
> evidence `ultradoc` retrieves from the actual repo, issues, PRs, docs and web.
> If the evidence does not cover it, say so and retrieve more — never guess.

## Route the ask

`node scripts/ultradoc.mjs <command>` — run `--help` for the full flag surface.

| You want to… | Run |
|---|---|
| answer one question | `ask --repo <url\|path> --q "…"` → read `EVIDENCE.md` → write `ANSWER.md` → `check --strict` |
| resolve ONE declaration: its body, its callers, whether anything still calls it | `symbol --name <sym>` (**not** `code --q <sym>` — lexical search cannot tell a call from a mention). `--name Class/method` works |
| know when / in which version something changed | `--sources releases,history` (`history` = git pickaxe) |
| orient on an unfamiliar repo before drilling | `overview` — cached markdown digest (packages, layout, **core modules** ranked by what depends on them, public API, docs map). Navigation, **never citable** |
| expand ONE thin area | `code`·`issues`·`prs`·`docs`·`releases`·`history`·`discussions`·`so`·`web` `--q "…"` — prints evidence, writes nothing |
| ground a specific page you already found | `web --url <u,…>` |
| scope a monorepo | `--package <name\|dir>` on any retrieval command |
| write a whole reference doc | `doc` → `DOC.md` (see **Generate a documentation**) |
| fan the run's worklists out | `orchestrate` (see **Orchestration**) |
| reach what no wording will match | `--semantic` (see **Optional semantic mode**) |
| tune caps, cost, cache | `--help` · `references/tuning.md` · `cache status\|clean` |

`ask` persists a run (`EVIDENCE.md`, `evidence.json`, `meta.json`,
`drill-plan.json`) beside the clone at `<clone>/.ultradoc/runs/<id>` — a stable,
commit-pinned home reused across questions — unless you pass `--out`. Default
sources are `code,issues,prs,docs`; the clone and index are cached per user, so
every drill after the first `ask` is near-free (`references/tuning.md`).

## Budget the run

Match the effort to the ask; escalate on evidence, not on reflex.

| Tier | Use when | Path | Stop when |
|---|---|---|---|
| **fast** | one fact, one named declaration | `symbol --name X`, or one `ask --sources code,docs` | the excerpt settles it |
| **standard** (default) | how a behavior works | `ask` (default sources) → one drill round | every sub-question has ≥2 on-topic items |
| **deep** | "why", contested, multi-part, version-sensitive, whole-repo | `overview` → `ask` → fan-out, ≤3 rounds, `--semantic`, cross-source | a round surfaces no new on-topic evidence id |

**The gates do not scale down.** `check --strict` always. `verify` +
`check --semantic` always, *except* on the fast path when the answer is ≤3 claims
all cited to code/docs excerpts — those are exactly the citations `check`
re-validates line-by-line against the pinned clone. Any claim that **interprets**
evidence, or rests on an issue/PR, goes through `verify`.

## Workflow

You own this task end-to-end: return one grounded, cited answer, never a
half-retrieved dossier. Retrieval and verification are independent, near-free
calls — **parallelize when your harness can** (batch independent drills in one
message; fan out to subagents or a workflow if available), inline otherwise.
See `references/orchestration.md`.

**When a command fails, recover — don't guess:**

| symptom | what to do |
|---|---|
| `git clone failed` (404 / auth) | check the URL; a private repo → ask the user for a local checkout and pass `--repo <path>` |
| offline / every network source notes a failure | answer from `code,docs,releases,history` only, and state the gap in the answer |
| a note says GitHub is **rate-limited** | set `GITHUB_TOKEN` (or `gh auth login`), or continue with the other sources and say so |
| huge repo, slow index / a "truncated" note | scope with `--package`; raise a cap only per `references/tuning.md` |
| the **question** is ambiguous (which repo? which behavior?) | ask the user before retrieving — never guess the repo |
| the dossier is empty/off-topic twice in a row | re-phrase per `references/retrieval-playbook.md`; it's the wording, not a missing answer |

1. **Resolve the target.** Identify the project and the precise question. With
   only a name, find the canonical repo URL (your WebSearch, or ask if
   ambiguous). Note any version/branch the user cares about (`--ref`). Several
   questions about the same repo, or you don't know where a behavior lives? Run
   `overview` once and drill its **Core modules** first.

2. **Retrieve.** Derive 2–3 **query variants** — the engine searches literally,
   so phrasing decides what surfaces. Spend variants on **synonyms and
   identifiers** (`retryBackoff`, `MAX_RETRIES`, the literal error string), never
   on inflections; conceptual "why designed this way" questions lead with
   `docs`/`discussions`/`web` or `--semantic`, not `code`. The full variant and
   source tables are in `references/retrieval-playbook.md`.

   Split a multi-part question into sub-questions **now**; each needs its own
   evidence or an explicit "unknown" at the end. Then run `ask` with the best
   variant and the sources that fit — ultradoc auto-discovers the project's
   official docs URL (override with `--docs-url`). The remaining
   variants × sources are a fan-out, which `ask` persists as `drill-plan.json`.

3. **Read the dossier.** **Retrieval notes first** — they say what this run could
   not reach (a capped index, a regex-tier symbol scan, a sliced call-site list,
   a rate-limited provider) and therefore bound what you may claim. Then the item
   titles, then the snippets. `references/reading-evidence.md` decodes every
   note, the item labels, `meta.symbolSpan`/`meta.confidence`, and what `check`'s
   warnings mean. Read the real code/issue/PR/doc text — never the file name.

4. **Drill the gaps.** Fan the variant drills out **in parallel from the start**;
   iterate in rounds only when a fan-out surfaces new leads, and stop per the
   budget table. Two rules decide quality: **triage before writing** — cite an
   item only if its snippet names the symbol/behavior or describes the same
   mechanism, never on a shared keyword; and **re-query instead of re-reading** —
   two off-topic dossiers mean the wording is wrong. A sub-question still
   unsupported at the cap is an explicit unknown, never filled from memory.

5. **Write the answer** to `ANSWER.md` in the run folder, per **The answer
   contract** below and `references/citation-format.md`.

6. **Validate (two layers).**
   - *Structural:* `check --run <dir> --strict` fails on any citation that
     doesn't resolve, on an answer with no citations, and (with `--strict`) on
     any uncited claim — so the answer can't be mostly memory around one real
     reference. Fix and re-run until it passes.
   - *Semantic (adversarial support-check):* `verify --run <dir>` writes a
     claim↔evidence worklist. Judge each pair as a **skeptic**: default to
     `unsupported`/`refuted` unless the cited snippet literally backs the claim
     (`supported` · `partial` · `refuted` · `unsupported` + a note). A pair
     flagged **⚠ cross-check** is grounded in an issue/PR and must be judged
     against CURRENT code. Collect every verdict into a **single**
     `verdicts.json` (`references/orchestration.md` has the verdict table and the
     return contract), then:
     ```
     node scripts/ultradoc.mjs verify --apply verdicts.json --run <dir>
     node scripts/ultradoc.mjs check  --semantic            --run <dir>
     ```
     `check --semantic` **fails when `VERIFY.json` is missing** (or pass
     `--allow-unverified` to skip the gate explicitly), and on any refuted or
     unsupported claim — closing the gap where a citation *resolves* but does not
     back the claim. Fix the claim (re-cite, weaken, drop, or retrieve better)
     and re-verify. Then self-review against `references/answer-rubric.md`.

7. **Present** per the answer contract. `references/worked-example.md` walks one
   full run — retrieve, triage, write, both gates, hand-off.

## The answer contract

`ANSWER.md` **is**: a lead line that answers the question — **cited like any
other claim**, `--strict` counts it; then one claim per sentence, each carrying
the evidence id it rests on; identifiers, defaults and values quoted **verbatim**
from the excerpt; then a `## Unknowns` section naming what the evidence did
**not** settle (that heading is exempt from the coverage gate — an unknown cites
nothing by construction, so it never has to be dropped to get a green run). Put
the commit from `meta.json` in an HTML comment: `check` ignores comments, and a
bare "Verified against `abc1234`." is an uncited claim that fails `--strict`.

Your message to the user **is**: that answer, plus the clickable refs from the
evidence (file:line, issue/PR numbers, doc/SO/web URLs), the commit it was
verified against, and the unknowns — stated, not filled. Write it in the
conversation's language; identifiers, flags and file paths stay verbatim.

## Red flags — you are about to answer from memory

| The thought | The reality |
|---|---|
| "I know this library; the dossier just confirms it" | Then cite it. If no item says it, it does not go in the answer. |
| "`check` passed, so it's grounded" | Default coverage is 0.7 — 30% of claims may be uncited. Use `--strict`. |
| "The issue says so" | A tracker describes a point in time. **⚠ cross-check** against current code. |
| "Close enough to cite" | A shared keyword is not support. The bar: the snippet names the symbol/behavior. |
| "The evidence is thin, I'll bridge the gap" | A gap is an explicit unknown, not a sentence. |
| "`verify` is optional here" | `check --semantic` is fail-closed for a reason. Skip it only per the budget table. |
| "Let me read further down the dossier" | Two off-topic dossiers = wrong wording. Re-query instead. |
| "The retrieval note is just a warning" | It bounds what you may claim — and is often itself part of the answer. |

## Generate a documentation

When the user wants a *whole-project* (or whole-package) doc rather than one
answer, `doc` is the same grounded loop fanned out over a section outline:

1. **Scaffold.** `doc --repo <url> [--package <p>] [--sources …]`. The engine
   builds a deterministic outline (overview, install/usage, public API or one
   section per workspace package, configuration, architecture, then one section
   per **central subsystem**), retrieves a dossier **per section**, merges them
   into one `evidence.json` with global `[E#]` ids, and writes `DOC.todo.md` +
   `DOC.plan.json` under `<clone>/.ultradoc/doc/`, with an `ARCHITECTURE.mmd`
   module diagram — navigation like `OVERVIEW.md`, never cited.
2. **Write each section.** Read `DOC.todo.md` and `EVIDENCE.md`, then write
   `DOC.md`: one section per outline entry, **every claim cited `[E#]`**. A
   section with thin evidence is a fan-out unit — drill it or mark the gap an
   explicit unknown; never write from memory.
3. **Validate & present.** `check --run <doc-dir>` (and `verify` +
   `check --semantic`, exactly as in step 6 — both auto-detect `DOC.md`). Fix
   until grounded, then present `DOC.md` pinned to its commit.

## Orchestration — route by harness

The per-item work fans out: `drill-plan.json` (one cell per {query-variant ×
source}, plus one `symbol` cell per identifier the question names),
`VERIFY.todo.json` (one claim↔evidence pair) and `DOC.plan.json` (one section)
are independent worklists. `orchestrate` emits the orchestration from the
CURRENT worklists, with absolute paths and real item ids baked in:

```
node scripts/ultradoc.mjs orchestrate --run <dir> [--phase drill|verify|doc] [--eco] [--list]
```

| Your harness | How to run each phase |
|---|---|
| Has the Workflow tool | `orchestrate --run <RUN> --phase <p>`, then `Workflow({ scriptPath: "<RUN>/orchestration/<p>.workflow.mjs" })`. Subagents RETURN fragments (triaged evidence · verdicts · section drafts); you fold them yourself (ANSWER.md · one `verdicts.json` · DOC.md), then run the gates as usual. |
| Subagents but no Workflow tool | Same `orchestrate`; dispatch one subagent per batch following `<RUN>/orchestration/agents/<role>.md`. One writer: you fold results in. |
| Eco mode, or no subagents | `orchestrate --run <RUN> --eco` → follow `<RUN>/orchestration/RUNBOOK.md` sequentially, playing each role yourself. Correctness-identical; only wall-clock differs. |

Fan-out is an optimization, never a requirement — the gates are
harness-independent and every phase has a sequential fallback with identical
artifacts. Subagents never write; the folds stay with you, the orchestrator.
Re-run `orchestrate` whenever a worklist changes (emission is deterministic and
idempotent); `--phase <p>` before its worklist exists fails and names the command
that produces it.

## Optional semantic mode (fully local, no API key)

Tier-1 search (ripgrep + symbol index) is the default and needs nothing. Add
`--semantic` when the question **describes** what the codebase names differently
— "which helper works out how long to wait before trying again" finds
`computeBackoff`, which no lexical wording reaches. Two keyless backends:

- **static** — `semantic pull` (~21 MB, once, no container). Embeds symbol names
  and signatures: answers *which declaration*.
- **docker** — `semantic up`, then `--semantic-tier docker`. Embeds the real
  **content** of code and docs, so it is the one that answers *why it is designed
  this way*. Reach for it when the question needs prose.

`--semantic-tier auto` (default) tries endpoint → static → docker; with no
backend `--semantic` names the command that would enable one and falls back to
Tier 1. See `references/semantic-setup.md`.

## References

| Open it when | File |
|---|---|
| the dossier is in front of you: notes, item labels, gate warnings | `references/reading-evidence.md` |
| choosing sources, phrasing variants, iterating, triaging | `references/retrieval-playbook.md` |
| writing citations, or `check` rejected one | `references/citation-format.md` |
| the answer is drafted and you're about to present | `references/answer-rubric.md` |
| you want the whole loop demonstrated once | `references/worked-example.md` |
| a run is too slow, too shallow, or too noisy | `references/tuning.md` |
| parallelizing drills or verification across calls/subagents | `references/orchestration.md` |
| issues/PRs look wrong or empty for a host | `references/provider-apis.md` |
| `web` found nothing, or you want to drive discovery | `references/web-discovery.md` |
| setting up or choosing a vector tier | `references/semantic-setup.md` |

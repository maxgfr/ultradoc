---
name: ultradoc
description: "Use when the user asks an ultra-precise question about an open-source project (library, framework, CLI, or tool) and wants an answer grounded in its REAL source code — not the model's training memory. Clones any git repo, indexes it (ripgrep + symbols, optional vectors), retrieves evidence from code/issues/PRs/docs/releases/git-history/StackOverflow/web, and you write a cited answer `ultradoc check` verifies is grounded. Handles monorepos (scope to one package with --package), caches an overview for fast follow-ups, and generates a cited REFERENCE DOC (`ultradoc doc` → `DOC.md`). Triggers: 'how does X work in <library>', 'generate/write documentation for <library>', 'document this project/package', 'is there an open PR for <behavior>', 'why does <lib> do <thing>', 'what changed in <repo>', 'when was X added/changed/removed', 'which version introduced X', questions about a specific function/flag/option in a named open-source project or one package of a monorepo."
license: MIT
metadata:
  version: 2.2.0
---

# ultradoc — answer questions from the source, not from memory

`ultradoc` answers ultra-precise questions about an open-source project by
**retrieving grounded evidence** and reasoning over it. The deterministic engine
(`scripts/ultradoc.mjs`, zero-dependency Node) does the searching and indexing
**with code**; your job is to read the retrieved evidence and write a precise,
**cited** answer. Every claim must point to a real source. This is enforced:
`ultradoc check` fails if any citation does not resolve to retrieved evidence,
and re-validates each code/docs excerpt against the pinned clone.

> **The core rule:** do not answer from your own knowledge of the library. Your
> training data is stale and hallucinates APIs. Answer **only** from the
> evidence `ultradoc` retrieves from the actual repo, issues, PRs, docs and web.
> If the evidence does not cover it, say so and retrieve more — never guess.

## The script

One committed, dependency-free bundle: `node scripts/ultradoc.mjs <command>`.
No `npm install`, no API keys. Run `--help` for the full surface. Key commands:

- `ask --repo <url|path> --q "<question>" [--sources ...] [--package <p>] [--semantic] [--docs-url <u>]`
  Clone (any git URL, cached per-user — `ultradoc cache status` shows where),
  index, retrieve from all selected sources, and write an **evidence dossier**
  (`EVIDENCE.md`, `evidence.json`, `meta.json`) to a run folder — persisted
  beside the clone under `<clone>/.ultradoc/runs/<id>` (a stable, commit-pinned
  home reused across questions), unless you pass `--out`. Default sources:
  `code,issues,prs,docs` (add `web,so` when the repo alone won't answer it;
  add `releases,history` for "when was X added/changed" questions, and
  `discussions` for community Q&A — needs the gh CLI).
  In a monorepo, `--package <name|dir>` scopes code/docs retrieval to one
  workspace package.
- `code|issues|prs|docs|releases|history|discussions|so --repo <...> --q "..."` —
  drill into ONE source, print evidence to stdout (no dossier). Use these to
  expand a thin area. `history` runs git pickaxe (`log -S/-G`) on the clone —
  the first call on a remote repo fetches full history once.
- `web --repo <...> [--q "..."] [--url <u,...>]` — keyless web discovery
  (SearXNG → DuckDuckGo → your WebSearch) + fetch/extract. Pass `--url` to ground
  a specific page you found with your own WebSearch.
- `overview --repo <...> [--refresh]` — generate (once) a cached markdown digest
  of the repo: what it is, its workspace packages, layout, public API and docs
  map. Cached beside the clone and reused while the commit is unchanged — read
  it to orient yourself across several questions without re-indexing. It is a
  navigation map, NOT citable evidence.
- `doc --repo <...> [--package <p>] [--sources ...]` — scaffold a **grounded
  reference doc**: a deterministic section outline (overview, install, public
  API/per-package, configuration, architecture), one retrieved dossier per
  section merged into a single `evidence.json`, and a `DOC.todo.md` worklist.
  You write the cited prose into `DOC.md`; `check` validates it like an answer.
  Persisted under `<clone>/.ultradoc/doc/`. See "Generate a documentation" below.
- `check --run <dossier-dir> [--strict] [--semantic [--allow-unverified]]` —
  validate `ANSWER.md`'s (or a `doc` run's `DOC.md`'s) citations against the
  dossier's `evidence.json`, that the prose is covered (enough claims cite
  evidence), and that each cited code/docs excerpt still matches the pinned clone
  (line range + snippet). Exit non-zero ⇒ ungrounded. Use `--strict` for `ask`
  answers (require every claim cited); `--semantic` also gates on `verify`'s
  verdicts and **fails when no `VERIFY.json` exists** (`--allow-unverified`
  downgrades that to a warning); `--answer <file>` validates a specific file.
- `orchestrate --run <dir> [--phase drill|verify|doc] [--eco] [--list]` — emit the
  run's multi-agent orchestration from its CURRENT worklists (`drill-plan.json`,
  `VERIFY.todo.json`, `DOC.plan.json`): one launchable workflow per ready phase,
  the `agents/<role>.md` dispatch contracts, and a sequential `RUNBOOK.md`.
  See **Orchestration — route by harness** below.
- `index --repo <...>` — build/print the structural index (debugging/inspection);
  lists discovered workspace packages for a monorepo.
- `semantic up|down|status` — optional local vector backend (see below).
- `cache status | clean --all|--repo <url|path>` — inspect or clear the
  persistent clone/index cache.

## Workflow

You own this task end-to-end: return one grounded, cited answer, and never hand
back a half-retrieved dossier. But the retrieval and verification work is a set
of independent, near-free calls — **parallelize it when your harness can** (batch
the independent drills in one message; fan out to subagents or a workflow if
available) and do it inline otherwise. Iterate in rounds until the evidence is
complete; don't return until it is. See `references/orchestration.md`.

**When a command fails, recover — don't guess:**

| symptom | what to do |
|---|---|
| `git clone failed` (404 / auth) | check the URL; a private repo → ask the user for a local checkout and pass `--repo <path>` |
| offline / every network source notes a failure | answer from `code,docs,releases,history` only, and state the gap in the answer |
| a note says GitHub is **rate-limited** | set `GITHUB_TOKEN` (or `gh auth login`), or continue with the other sources and say so |
| huge repo, slow index / a "truncated" note | scope with `--package`; raise `ULTRADOC_MAX_FILES` only if a file is genuinely missing |
| the **question** is ambiguous (which repo? which behavior?) | ask the user before retrieving — never guess the repo |
| the dossier is empty/off-topic twice in a row | re-phrase per `references/retrieval-playbook.md`; it's the wording, not a missing answer |

1. **Resolve the target.** Identify the project and the precise question. If you
   only have a name, find the canonical repo URL (use your WebSearch, or ask the
   user if ambiguous). Note any version/branch the user cares about (`--ref`).

   *Multiple questions about the same repo?* Run `overview --repo <url>` once and
   read the cached `OVERVIEW.md` it prints — a navigation map (packages, layout,
   public API, docs) that lets follow-ups reuse the clone+index. Never cite it.

   *Monorepo?* When workspace packages are reported, add `--package <name|dir>`
   for the subsystem in question so retrieval doesn't drown in the other
   packages; no obvious match → run one unscoped `ask`, see where the top hits
   cluster, then re-run scoped (see the playbook's "Scope monorepos").

2. **Retrieve.** Derive 2–3 **query variants** — the engine searches literally,
   so phrasing decides what surfaces: the natural-language phrasing, the
   identifier forms the codebase probably uses (`retryBackoff`, `MAX_RETRIES`),
   and any literal error string / flag the user quoted. Spend variants on
   **synonyms and identifiers**, not inflections (the engine already folds
   plurals/accents and splits identifiers). Conceptual "why designed this way"
   questions lead with `docs`/`discussions`/`web` (or `--semantic`), not `code`.
   See `references/retrieval-playbook.md` for the full variant table.

   *Multi-part question?* Split it into sub-questions now — each needs its own
   evidence or an explicit "unknown" at the end. Track coverage per sub-question.

   Run `ask` with the best variant and the sources that fit:
   ```
   node scripts/ultradoc.mjs ask --repo <url> --q "<precise question>" --sources code,issues,prs,docs
   ```
   ultradoc auto-discovers the project's **official docs URL** from its own
   README/manifests (and prioritizes the canonical in-repo `docs/` tree), then
   grounds against it — pass `--docs-url <url>` only to override. Add `web,so`
   when the question is conceptual or the repo is sparse; add
   `releases,history` when it is about *when/why/which version* something
   changed. The command prints the dossier path. Then treat the remaining
   variants × drill-sources as a fan-out — issue those independent drills as
   parallel calls in one message (or one subagent per cell). See
   `references/orchestration.md`. `ask` also persists that matrix as
   `drill-plan.json`; `orchestrate --run <dir> --phase drill` emits it as a
   launchable workflow (see **Orchestration — route by harness**).

3. **Read the dossier.** Open `EVIDENCE.md` in the run folder. Each item has an
   id (`[E1]`, `[E2]`, …), a provenance `ref`, and a snippet. This is your
   evidence — read the actual code/issue/PR/doc text.

4. **Drill down on gaps.** Fan the variant drills out **in parallel from the
   start** (drills are near-free — the clone and index are cached); iterate in
   rounds only when a fan-out surfaces new leads, and stop after ~3 rounds or
   once every sub-question has ≥2 on-topic supporting items. Drill across
   sources: `code --q "<symbol/behavior>"` for more code, `issues`/`prs` for
   discussion and in-progress changes, `releases`/`history` for *when/why/which
   version*, `discussions` for community Q&A (needs `gh`), `web` for external
   refs. See `references/retrieval-playbook.md` (how to iterate + triage) and
   `references/orchestration.md` (how to parallelize).

   Two key rules from the playbook: **triage before writing** — cite an item only
   if its snippet names the symbol/behavior or describes the same mechanism, not
   just a shared keyword; and **re-query instead of re-reading** — two off-topic
   dossiers in a row mean the wording is wrong, so re-run with the next
   identifier variant rather than reading further down the list. A sub-question
   still unsupported after the cap is an explicit unknown, never filled from
   memory.

5. **Write the answer.** Create `ANSWER.md` in the same run folder. Be precise
   and concise. **Cite every factual claim** with the evidence id it rests on,
   e.g. `Retries use exponential backoff with jitter [E1], and PR #79 is
   rewriting this [E7].` See `references/citation-format.md`. Pin the answer to
   the commit shown in `meta.json` when version matters. Cover every sub-question
   from step 2; flag anything the evidence does not settle as an explicit
   unknown — do not fill it from memory.

6. **Validate (two layers).**
   - *Structural:* `node scripts/ultradoc.mjs check --run <dossier-dir> --strict`.
     It fails on any citation that doesn't resolve to evidence, on an answer with
     no citations, and (with `--strict`) on any uncited claim — so the answer
     can't be mostly memory around one real reference. Fix and re-run until it
     passes.
   - *Semantic (adversarial support-check):* `node scripts/ultradoc.mjs verify
     --run <dossier-dir>` writes a claim↔evidence worklist (`VERIFY.todo.json` +
     `VERIFY.md`). Judge each pair as a **skeptic**: default to
     `unsupported`/`refuted` unless the cited snippet literally backs the claim,
     setting `verdict` to supported · partial · refuted · unsupported (+ a short
     note). A pair flagged **⚠ cross-check** is grounded in an issue/PR — judge it
     against CURRENT code, since a closed thread can describe behavior a later
     release reversed (refuted, or partial with a temporal qualifier citing the
     fixing release). Run one skeptic per pair — fan out to subagents when
     available (each *returns* its verdict), else adjudicate each pair inline — and
     collect every verdict into a **single** `verdicts.json` (see
     `references/orchestration.md`; `orchestrate --run <dir> --phase verify`
     emits this fan-out — see **Orchestration — route by harness**), then:
     ```
     node scripts/ultradoc.mjs verify --apply verdicts.json --run <dossier-dir>
     node scripts/ultradoc.mjs check  --semantic --run <dossier-dir>
     ```
     `check --semantic` **fails when `VERIFY.json` is missing** (run `verify` +
     `--apply` first, or pass `--allow-unverified` to skip the gate explicitly) —
     a green semantic exit always means the support gate actually ran. It fails on
     dangling/unsourced (structural) **and** on any refuted or unsupported claim —
     closing the gap where a citation *resolves* but does not actually back the
     claim. Fix the claim (re-cite, weaken, drop, or retrieve a better item) and
     re-verify until it passes. Also self-review against
     `references/answer-rubric.md` for completeness/recency/unknowns.

7. **Present.** Give the user the grounded answer with its citations and links
   (file:line, issue/PR numbers, doc/SO/web URLs from the evidence), and the
   commit it was verified against.

## Generate a documentation

When the user wants a *whole-project* (or whole-package) doc rather than one
answer, use `doc` — it is the same grounded loop, fanned out over a section
outline:

1. **Scaffold.** `node scripts/ultradoc.mjs doc --repo <url> [--package <p>]`.
   The engine builds a deterministic outline (overview, install/usage, public
   API or one section per workspace package, configuration, architecture),
   retrieves a dossier **per section**, merges them into one `evidence.json` with
   global `[E#]` ids, and writes `DOC.todo.md` (the per-section worklist) +
   `DOC.plan.json`. Add `--sources code,docs,issues,prs` to ground sections on
   more than code+docs. It persists under `<clone>/.ultradoc/doc/`.
2. **Write each section.** Read `DOC.todo.md` and `EVIDENCE.md`, then write
   `DOC.md` in the run folder: one section per outline entry, **every claim cited
   `[E#]`**. A section whose evidence is thin is a fan-out unit — drill it
   (`code|docs|issues …`) or mark the gap an explicit unknown; never write from
   memory. The per-section work parallelizes — see `references/orchestration.md`
   (`orchestrate --run <doc-dir> --phase doc` emits it as a workflow; each
   section-writer *returns* its draft and you assemble `DOC.md`).
3. **Validate & present.** `node scripts/ultradoc.mjs check --run <doc-dir>`
   (and `verify` + `check --semantic` for the support gate, exactly as in step 6
   — both auto-detect `DOC.md`). Fix until grounded, then present `DOC.md` pinned
   to its commit.

## Orchestration — route by harness

The per-item work fans out: `drill-plan.json` (one cell per {query-variant ×
source} drill, written by `ask`), `VERIFY.todo.json` (one claim↔evidence pair)
and `DOC.plan.json` (one section per outline entry) are independent per-item
worklists. The engine manages the fan-out — `orchestrate` emits the
orchestration from the CURRENT worklists, with absolute paths and the real
item ids baked in:

```
node scripts/ultradoc.mjs orchestrate --run <dir> [--phase drill|verify|doc] [--eco] [--list]
```

| Your harness | How to run each phase |
|---|---|
| Has the Workflow tool | `orchestrate --run <RUN> --phase <p>`, then `Workflow({ scriptPath: "<RUN>/orchestration/<p>.workflow.mjs" })`. Subagents RETURN fragments (triaged evidence · verdicts · section drafts); you fold them yourself (ANSWER.md · one `verdicts.json` · DOC.md), then run the gates as usual. |
| Subagents but no Workflow tool | Same `orchestrate`; dispatch one subagent per batch following `<RUN>/orchestration/agents/<role>.md` (the workflow script shows batches + prompts). One writer: you fold results in. |
| Eco mode, or no subagents | `orchestrate --run <RUN> --eco` → follow `<RUN>/orchestration/RUNBOOK.md` sequentially, playing each role yourself. Correctness-identical; only wall-clock differs. |

Fan-out is an optimization, never a requirement — the gates (`check`, `verify
--apply`, `check --semantic`) are harness-independent and every phase has a
sequential fallback with identical artifacts. Subagents never write: the
emitted contracts end with the one-writer rule, and the folds always stay with
you, the orchestrator. Re-run `orchestrate` whenever a worklist changes
(emission is deterministic and idempotent); `--phase <p>` before its worklist
exists fails and names the command that produces it.

## Optional semantic mode (fully local, no API key)

Deterministic Tier-1 search (ripgrep + symbol index) is the default and needs
nothing. For fuzzier, conceptual questions you can enable local semantic search:

```
node scripts/ultradoc.mjs semantic up      # docker compose: Qdrant + Ollama (+ SearXNG)
node scripts/ultradoc.mjs ask --repo <url> --q "..." --semantic
```

Everything runs in local Docker containers — no key, no data leaves the machine.
If the stack isn't up, `--semantic` logs a notice and falls back to Tier 1. See
`references/semantic-setup.md`.

## References

- `references/orchestration.md` — how to parallelize retrieval drills and
  verification across calls/subagents, with the return + verdict-assembly
  contracts and the sequential fallback.
- `references/retrieval-playbook.md` — how to pick sources and iterate to a
  complete answer.
- `references/citation-format.md` — the citation grammar `check` enforces.
- `references/answer-rubric.md` — the semantic self-review before presenting.
- `references/provider-apis.md` — how issues/PRs are fetched per host, keyless.
- `references/web-discovery.md` — the layered keyless web search.
- `references/semantic-setup.md` — the optional local Docker vector stack.

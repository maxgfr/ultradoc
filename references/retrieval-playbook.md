# Retrieval playbook

How to drive `ultradoc` from a question to a complete, grounded answer. The
engine retrieves; you reason. Iterate until the evidence actually settles the
question — don't stop at the first dossier if it's thin.

## Pick the question, then the sources

Turn the user's ask into one precise question (a specific function, flag,
behavior, error, or change). Then choose sources:

| The question is about… | Start with |
|------------------------|------------|
| how code behaves, where something is defined | `code` (+ `docs`) |
| whether behavior is intended / documented | `docs`, `code` |
| a bug, a known limitation, a discussion | `issues` |
| an in-progress or proposed change | `prs` |
| when something was added / released, version differences | `releases` |
| when/why a piece of code changed, who changed it | `history` |
| community Q&A, design rationale threads on the repo | `discussions` (needs `gh`) |
| a "how do I" / conceptual / cross-library topic | `web`, `so` (+ `docs`) |
| anything version-sensitive | add `--ref <branch|tag>` and pin to the commit |

Default `ask` sources are `code,issues,prs,docs`. Add `web,so` when the repo
alone can't answer it. Use `--docs-url` when official docs live off-repo.

## Expand the query like a developer

The engine searches the corpus literally (BM25 + symbol names), so the wording
of `--q` decides what surfaces. Before retrieving — and again when a dossier is
thin — derive variants of the concept and drill once per promising variant
(drills are near-free: the clone and index are cached):

| The user says… | Also try |
|----------------|----------|
| "retry backoff" | `retryBackoff`, `retry_backoff`, `computeBackoff`, `MAX_RETRIES` |
| "request timed out" | the literal error string, `timeout`, `timeoutMs`, `ETIMEDOUT` |
| "the config option for X" | the option's exact key (`heartBeatTimer`, `merge_params`) |
| "rate limiting" | `429`, `Retry-After`, `rateLimit`, `throttle` |

camelCase / snake_case / SCREAMING_CASE forms of the same concept, exact error
strings, config keys, and status codes are what the codebase actually contains;
prose rarely is. One identifier-shaped variant usually beats three prose ones.

## Iterate

1. Run `ask`. Read `EVIDENCE.md`.
2. Find the gaps: a referenced symbol you haven't seen, an issue that hints at a
   cause, a PR that changes the answer.
3. Drill with single-source commands (they print, write nothing):
   - `code --q "<symbol/behavior>"` — pull more/other code regions. Search by the
     exact identifier when you know it; the symbol index ranks definitions first.
   - `issues --q "..."` / `prs --q "..."` — read the discussion and diffs.
   - `releases --q "..."` — changelog sections + release notes ("when was X
     added?"). `history --q "<identifier>"` — git pickaxe: the commits that
     introduced or changed the symbol (first run on a remote repo fetches full
     history once). `discussions --q "..."` — GitHub Discussions via `gh`.
   - `web --q "..."` or, after your own WebSearch, `web --url <u>` to ground a
     specific page.
4. Repeat until you can answer every part of the question from evidence.

## Triage before you write

Retrieval is recall-oriented: the dossier deliberately over-fetches, so some
items will be on-keyword but off-topic. You are the precision layer. Before
writing `ANSWER.md`, go through the evidence and decide which ids actually bear
on the question. Discard:

- **keyword coincidences** — an item that mentions the terms but talks about
  something else (a changelog entry for an unrelated module, a test that uses
  the word in another sense);
- **vendored / example / fixture code** — already down-ranked, but when it
  surfaces it is rarely the project's own behavior;
- **superseded discussion** — a closed PR or old issue whose outcome a newer
  merged PR or the current code contradicts (prefer the current code).

Cite only load-bearing items. `check` validates that citations *resolve*;
whether the cited item actually supports the claim is your job, and the
answer-rubric review will ask you exactly that.

## Tips

- **Quote the code.** The snippets are real — base behavioral claims on what the
  code actually does, not on what the function name implies.
- **Check recency.** Closed/merged PRs may already have changed current behavior;
  open PRs mean it's in flux. State which.
- **Prefer specific keywords.** Identifiers, error strings, and numbers (status
  codes, option names) retrieve far better than generic words. The engine already
  ranks these higher, but a sharper `--q` helps.
- **Scope monorepos.** When `index`/`ask`/`overview` lists workspace packages,
  add `--package <name|dir>` so code/docs hits come from the right package
  instead of the whole tree (e.g. `--package modeles-social` in
  `socialgouv/code-du-travail-numerique`).
- **Reuse across questions.** `overview --repo <url>` writes a cached markdown
  digest (packages, layout, public API, docs map) next to the clone. Read it
  once to orient and pick drill targets — but never cite it; answers cite
  dossier evidence only.
- **Local repos work too.** `--repo <path>` indexes a checkout you already have;
  its `origin` remote is used for issues/PRs.
- **Refresh** with `--refresh` if the cached clone is stale.
- **Semantic** (`--semantic`) helps conceptual questions where the wording won't
  match the code's; it's optional and falls back to lexical if the stack is down.

## When evidence is missing

If retrieval comes up empty for part of the question, say so explicitly in the
answer ("the repo/issues/docs don't cover X"). Do not fill the gap from memory —
that's exactly what `ultradoc` exists to prevent.

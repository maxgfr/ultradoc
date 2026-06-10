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
| a "how do I" / conceptual / cross-library topic | `web`, `so` (+ `docs`) |
| anything version-sensitive | add `--ref <branch|tag>` and pin to the commit |

Default `ask` sources are `code,issues,prs,docs`. Add `web,so` when the repo
alone can't answer it. Use `--docs-url` when official docs live off-repo.

## Iterate

1. Run `ask`. Read `EVIDENCE.md`.
2. Find the gaps: a referenced symbol you haven't seen, an issue that hints at a
   cause, a PR that changes the answer.
3. Drill with single-source commands (they print, write nothing):
   - `code --q "<symbol/behavior>"` — pull more/other code regions. Search by the
     exact identifier when you know it; the symbol index ranks definitions first.
   - `issues --q "..."` / `prs --q "..."` — read the discussion and diffs.
   - `web --q "..."` or, after your own WebSearch, `web --url <u>` to ground a
     specific page.
4. Repeat until you can answer every part of the question from evidence.

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

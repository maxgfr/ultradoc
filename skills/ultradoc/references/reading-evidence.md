# Reading a dossier

What the run **gave you**, and what it **could not reach**. This file owns the
dossier and the gate output; `citation-format.md` owns the citation grammar.

Read in this order: **retrieval notes → item titles → the snippets you'll cite.**
The notes are printed by `ask` and head `EVIDENCE.md` because they bound what the
evidence can support — a thin result under "index capped" means *not indexed*,
not *not there*.

## Retrieval notes — what each one costs you

| The note says | It means | So you may not… |
|---|---|---|
| `Index capped at N files — some of this repo was not indexed` | the walk stopped short of the tree | conclude anything is **absent**. Scope with `--package`, or raise the cap (`tuning.md`) |
| `M file(s) hit the N-symbol cap` | some declarations were dropped from the index | trust "no such symbol" for a big generated file |
| `Built without the tree-sitter grammars` | regex tier: methods nested in classes are invisible, and "call sites" include matches inside comments and strings | cite a call site as a real invocation without opening the file |
| `No declaration named "X". Similar names: …` | wrong spelling, or X is not a declared symbol (config key, error string, callback prop) | keep drilling `symbol` — take the suggested name or `code --q` |
| `No call site for "X" in this repo` | public API called from outside, invoked dynamically, or dead | report it as "unused" without saying **which** of the three, and why |
| `N of M call site(s) matched on name alone` | no import ties caller to declaration (`meta.confidence: unique-name`) | cite those. They are leads — confirm in the source first |
| `Showing N of M call site(s)` | you have a slice (implementation callers first, tests last) | claim how widely X is used. Raise `--per-source` |
| `Query term "X" matches only N file(s); pinned …` | a rare term was force-injected past the ranking | read that item as a *lead*; it did not win on score |
| `No distinctive keywords in the question` | the query was all stopwords | expect code hits. Re-query with an identifier (`retrieval-playbook.md`) |
| `ripgrep not found — used the slower built-in scanner` | slower, same results | — (latency only) |
| `Dropped N cross-source duplicate evidence item(s)` | the same ref surfaced twice | expect matching ids across sources |
| `served a stale cached copy of <url>` | the refetch failed | present that doc as current without saying so |
| `History deepened to ~500 commits` / `history is limited to the latest commit` | pickaxe saw a window, not the repo's life | answer "when was X added" from it — say the window instead |
| `Checked the 20 most recent GitHub releases only` | a feature added in an older release is out of view (the changelog half still covers it) | conclude "not in any release". Raise `ULTRADOC_MAX_RELEASES` |
| `No changelog file found in the repo` | the offline half of `releases` had nothing to parse | treat the GitHub release list as the full version history |
| `Embedded N chunks (repo has more)` | partial semantic index | read a semantic miss as absence |
| GitHub **rate-limited** / no issues API for this host | the source did not really run | say "no issue discusses this" |

An honest note is an **answer ingredient**: "the repo has no call site for `X`
outside its own tests" is a finding, and it belongs in the answer with the note
as its warrant.

## Item anatomy

```
### [E4] src/retry.ts — function computeBackoff
ref: `src/retry.ts` · loc: `src/retry.ts:21-38` · score: 18.2
url: https://github.com/…/blob/<commit>/src/retry.ts#L21-L38
```

- **title** carries the declaration. Prefer citing `— function computeBackoff`
  over a bare `— match`: the excerpt is the real body, so the citation stands on
  its own. `in <symbol>` = a region *inside* that declaration; `call site in
  <caller>` grounds "X is called by <caller>", not "X does Y".
- **`loc`** is what `check` re-validates line-by-line against the pinned clone.
- **`score`** is relative within a source — a top item is not necessarily on-topic
  (triage: `retrieval-playbook.md`).
- **`meta.symbolSpan`** (in `evidence.json`) appears when the declaration was
  longer than the excerpt cap — e.g. `"105-194"` on an excerpt showing `101-130`:
  you are reading the **head** of a longer body, and claims about its tail are
  ungrounded. `symbol --name X` returns the *same* capped window, so it does not
  help here: open the file in the clone (`meta.repoDir`), find an identifier in
  the tail, and drill `code --q "<that identifier>"` to retrieve a **citable**
  excerpt covering it.
- **`meta.confidence: unique-name`** — matched on the name alone. A lead.

`meta.json` carries `commit` (**the pin for every version-sensitive claim**),
`notes`, `fallbacks` (typed: e.g. lexical-only because the semantic tier was
down) and `timings` (where the run actually spent its time).

## Gate output

`check` **errors** are hard: dangling citation, no citations, an excerpt that no
longer matches the clone. Its **warnings** are the ones agents skip, and each is
a real defect:

| Warning | Do |
|---|---|
| `N claim(s) cite no evidence (coverage X%)` | run `check --strict` for `ask` answers — the default 0.7 lets 30% through |
| `N claim(s) under an "Unknowns" heading cite evidence` | that is a claim in the wrong section — move it into the body so coverage grades it (an **error** under `--strict`) |
| `N declared unknown(s) vs M graded claim(s)` | more of the answer is exempt than graded — retrieve more, or say plainly the evidence doesn't answer the question |
| `N claim(s) are grounded only in issue/PR evidence` | cross-check current code; cite it or the fixing release alongside |
| `evidence re-validation skipped: the clone moved / no longer exists` | the strongest structural gate did **not** run — re-run `ask` |
| `No evidence ids were cited (only typed aliases)` | prefer `[E#]` |

`verify` adds two things beyond the pairs: **`uncitedClaims`** (claims no
adjudication can ever reach — cite or delete them) and the **40-pair cap**
(`--max-verify`). Pairs past the cap come back `unadjudicated`, which
`check --semantic` reports as a *warning*, not a failure — a long answer can pass
the semantic gate with claims nobody judged. Split the answer or raise the cap.

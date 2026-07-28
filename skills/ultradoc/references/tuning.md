# Cost model & knobs

What each command actually costs, and which knob to turn when a run is too slow,
too shallow, or too noisy. Flags in full: `ultradoc --help`.

## Pay once, then drill for free

| Step | When it is paid | Roughly |
|---|---|---|
| clone | first question on a repo (`--depth 1 --filter=blob:none`, cached per user) | seconds |
| structural index | first question per commit, cached beside the clone | seconds–a minute on a huge tree |
| tree-sitter grammars | first indexing command on the machine (~22 MB, shared cache) | once ever; offline ⇒ regex tier, announced in the notes |
| `overview` / `doc` outline | first call per commit, cached | once |
| `semantic pull` | once per machine (~21 MB static model) | once |
| per-repo embeddings | first `--semantic` question per commit + tier (`.ultradoc/embeddings.bin`) | once |
| **`history`'s first call on a remote repo** | converts the shallow partial clone to full history | the one expensive drill — budget for it |
| every other drill (`code`/`issues`/`docs`/`symbol`/…) | — | ≈ free: cached clone + cached index |

So: **one `ask` as the seed, then fan drills out** — the second call on a repo is
cheap and the tenth is too. `cache status` shows what is resident and where —
clones, plus a `pages/` entry for fetched web pages, which are keyed by URL and
extractor rather than by repo. `cache clean --repo <url|path>` drops one repo,
`--all` drops every repo **and** `pages/`.

The corollary for context: drills **print and write nothing**. When one area is
thin, drill it and read stdout instead of re-reading `EVIDENCE.md` — you get the
new items without paying for the ones you already read.

## Knobs, and when to reach for them

| Knob | Default | Turn it when |
|---|---|---|
| `--per-source <n>` | 6 | raise before concluding "X is barely used" (a `Showing N of M call site(s)` note means you have a slice); lower to keep a broad `ask` lean |
| `--sources <list>` | `code,issues,prs,docs` | the question is *when/which version* (`releases,history`), conceptual (`web,so`, `discussions`), or code-only (drop the network sources — they dominate the wall clock) |
| `--package <name\|dir>` | — | a monorepo: the single biggest precision win |
| `--strict` (`check`) | off | **always for `ask` answers.** Requires every claim cited |
| `--coverage-min <0..1>` | 0.7 | doc prose where a strict 100% is unreasonable; never as a way to pass a thin answer |
| `--max-verify <n>` | 40 | the answer has more claim↔evidence pairs than the cap — otherwise the excess comes back `unadjudicated` (a warning, not a failure) |
| `--answer <file>` (`check`/`verify`) | `ANSWER.md`, else `DOC.md` | validating a draft or a second answer in the same run folder |
| `--ref <branch\|tag>` | default branch | any version-sensitive question |
| `--refresh` | off | the cached clone is stale, or the index predates a change you know landed |
| `--json` | off | you want `meta`/evidence as data (timings, fallbacks, notes) instead of prose |
| `--semantic [--semantic-tier]` | off / `auto` | the question's wording will not appear in the code (`semantic-setup.md`) |
| `--web-engine firecrawl` | `auto` | you want discovery through the self-hosted Firecrawl `/search` instead of SearXNG/DDG directly (`web-discovery.md`) |
| `--firecrawl <url\|off>` | `$ULTRADOC_FIRECRAWL`, else `http://localhost:3002` | pointing at a non-default Firecrawl, or opting out of it for one run |

## Environment caps (`ULTRADOC_*`)

Every cap is reported in the retrieval notes when it is actually hit. **Raise one
because a note said it bound the run — never to paper over a wording problem**
(two off-topic dossiers mean re-query, not a bigger cap).

| Var | Default | Raises |
|---|---|---|
| `ULTRADOC_MAX_FILES` | 20000 | files walked/indexed |
| `ULTRADOC_MAX_FILE_BYTES` | 1048576 | per-file read cap |
| `ULTRADOC_MAX_SYMBOLS_PER_FILE` | 400 | symbols kept per file |
| `ULTRADOC_MAX_CALL_SITES` | 30 | call sites kept per symbol name |
| `ULTRADOC_MAX_RELEASES` | 20 | GitHub releases fetched |
| `ULTRADOC_MAX_DOC_PACKAGES` | 6 | monorepo packages given a `doc` section |
| `ULTRADOC_MAX_DOC_MODULES` | 5 | subsystems given their own `doc` section |
| `ULTRADOC_MAX_VERIFY` | 40 | claim↔evidence pairs (`--max-verify` wins) |
| `ULTRADOC_MAX_CHUNKS` | 800 | chunks embedded per repo (docker tier) |
| `ULTRADOC_EMBED_CONCURRENCY` | 4 | parallel embed requests |
| `ULTRADOC_CACHE_DIR` | per-user cache | where clones, indexes and the static model live |
| `ULTRADOC_EXTDOCS_TTL_HOURS` | 168 | fetched-page cache freshness (docs URLs **and** web pages); also Firecrawl's own `maxAge` |

Not caps, but the two extraction knobs: `ULTRADOC_FIRECRAWL` (base URL, or `off`)
and `ULTRADOC_FIRECRAWL_KEY` (bearer token — only for Firecrawl Cloud; the
self-hosted stack is keyless). Pages are cached per **URL + extractor**, so
starting `firecrawl up` takes effect on the next run instead of waiting out the
TTL.

Rate limits, not caps: `GITHUB_TOKEN` / `gh auth login` for issues, PRs and
releases; `GITLAB_TOKEN` for GitLab; `gh` is **required** for `discussions`
(`provider-apis.md`).

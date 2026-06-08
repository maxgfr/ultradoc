---
name: ultradoc
description: "Use when the user asks an ultra-precise question about an open-source project (a library, framework, CLI, or tool) and wants an answer grounded in the project's REAL source code, issues, PRs, docs and the web — not the model's training-data memory. Clones any git repo into /tmp, indexes it deterministically with code (ripgrep + a symbol index, optional local vector search), retrieves evidence from code/issues/PRs/docs/StackOverflow/web, and has you write a citation-checked answer that `ultradoc check` verifies is grounded. Triggers: 'how does X work in <library>', 'is there an open PR for <behavior>', 'why does <lib> do <thing>', 'what changed in <repo>', questions about a specific function/flag/option in a named open-source project."
license: MIT
metadata:
  version: 1.1.1
---

# ultradoc — answer questions from the source, not from memory

`ultradoc` answers ultra-precise questions about an open-source project by
**retrieving grounded evidence** and reasoning over it. The deterministic engine
(`scripts/ultradoc.mjs`, zero-dependency Node) does the searching and indexing
**with code**; your job is to read the retrieved evidence and write a precise,
**cited** answer. Every claim must point to a real source. This is enforced:
`ultradoc check` fails if any citation does not resolve to retrieved evidence.

> **The core rule:** do not answer from your own knowledge of the library. Your
> training data is stale and hallucinates APIs. Answer **only** from the
> evidence `ultradoc` retrieves from the actual repo, issues, PRs, docs and web.
> If the evidence does not cover it, say so and retrieve more — never guess.

## The script

One committed, dependency-free bundle: `node scripts/ultradoc.mjs <command>`.
No `npm install`, no API keys. Run `--help` for the full surface. Key commands:

- `ask --repo <url|path> --q "<question>" [--sources ...] [--semantic] [--docs-url <u>]`
  Clone (any git URL, cached in `/tmp/ultradoc/<slug>`), index, retrieve from all
  selected sources, and write an **evidence dossier** (`EVIDENCE.md`,
  `evidence.json`, `meta.json`) to a run folder. Default sources:
  `code,issues,prs,docs` (add `web,so` when the repo alone won't answer it).
- `code|issues|prs|docs|so --repo <...> --q "..."` — drill into ONE source, print
  evidence to stdout (no dossier). Use these to expand a thin area.
- `web --repo <...> [--q "..."] [--url <u,...>]` — keyless web discovery
  (SearXNG → DuckDuckGo → your WebSearch) + fetch/extract. Pass `--url` to ground
  a specific page you found with your own WebSearch.
- `check --run <dossier-dir>` — validate `ANSWER.md`'s citations against the
  dossier's `evidence.json`. Exit non-zero ⇒ ungrounded.
- `index --repo <...>` — build/print the structural index (debugging/inspection).
- `semantic up|down|status` — optional local vector backend (see below).

## Workflow

You are invoked once and expected to return a grounded, cited answer. Do not
hand control back mid-retrieval.

1. **Resolve the target.** Identify the project and the precise question. If you
   only have a name, find the canonical repo URL (use your WebSearch, or ask the
   user if ambiguous). Note any version/branch the user cares about (`--ref`).

2. **Retrieve.** Run `ask` with the question and the sources that fit:
   ```
   node scripts/ultradoc.mjs ask --repo <url> --q "<precise question>" --sources code,issues,prs,docs
   ```
   Add `--docs-url <official-docs-page>` when the project's docs live off-repo.
   Add `web,so` when the question is conceptual or the repo is sparse. The
   command prints the dossier path.

3. **Read the dossier.** Open `EVIDENCE.md` in the run folder. Each item has an
   id (`[E1]`, `[E2]`, …), a provenance `ref`, and a snippet. This is your
   evidence — read the actual code/issue/PR/doc text.

4. **Drill down on gaps.** If a thread is thin, expand it:
   - `code --repo <...> --q "<symbol or behavior>"` to pull more code regions.
   - `issues`/`prs` to read related discussion and in-progress changes.
   - `web` (or your WebSearch → `web --url <u>`) for external references.
   Follow `references/retrieval-playbook.md` for how to iterate.

5. **Write the answer.** Create `ANSWER.md` in the same run folder. Be precise
   and concise. **Cite every factual claim** with the evidence id it rests on,
   e.g. `Retries use exponential backoff with jitter [E1], and PR #79 is
   rewriting this [E7].` See `references/citation-format.md`. Pin the answer to
   the commit shown in `meta.json` when version matters. Flag anything the
   evidence does not settle as an explicit unknown — do not fill it from memory.

6. **Validate (two layers).**
   - *Structural:* `node scripts/ultradoc.mjs check --run <dossier-dir>`. It
     fails on any citation that doesn't resolve to evidence, or on an answer with
     no citations. Fix and re-run until it passes.
   - *Semantic:* self-review against `references/answer-rubric.md` — is the
     question fully answered, is every claim grounded, are recency/version and
     unknowns stated? If not, retrieve more (step 4) and rewrite.

7. **Present.** Give the user the grounded answer with its citations and links
   (file:line, issue/PR numbers, doc/SO/web URLs from the evidence), and the
   commit it was verified against.

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

- `references/retrieval-playbook.md` — how to pick sources and iterate to a
  complete answer.
- `references/citation-format.md` — the citation grammar `check` enforces.
- `references/answer-rubric.md` — the semantic self-review before presenting.
- `references/provider-apis.md` — how issues/PRs are fetched per host, keyless.
- `references/web-discovery.md` — the layered keyless web search.
- `references/semantic-setup.md` — the optional local Docker vector stack.

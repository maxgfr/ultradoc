# Bounded implementation trace

Use `trace` for a code-only path from a question or symbol to implementations,
callers and test calls. It reuses the structural index and ordinary citations;
it does not run tests or infer runtime behavior.

```bash
node scripts/ultradoc.mjs trace --repo <path-or-url> --name retryDelay --out <run> --json
node scripts/ultradoc.mjs trace --repo <path-or-url> --q "how is retry delay calculated?" --max-depth 1
```

| Flag | Default | Allowed |
|---|---|---|
| `--max-depth` | 2 caller hops | 0–4 |
| `--max-symbols` | 6 symbol queries | 1–20 |
| `--max-evidence` | 18 excerpts | 1–100 |
| `--max-chars` | 20,000 snippet characters | 1–200000 |

These budgets bound traversal and output; initial repository indexing retains
its existing limits. Depth zero retrieves definitions only. At each visited
symbol, excerpts alternate between definitions, implementation callers and test
calls. Small evidence/character budgets can omit any role. The JSON reports
seeds, visited symbols, roles, depths and budget cuts. `--out` writes a dossier
even with `--json`.

Read the excerpts and retrieval notes before answering. Ambiguous definitions
and uncorroborated name-only calls remain leads; automatic expansion stops there.
Cycles are not revisited. Regex-tier coverage can stop after the first hop.
Missing test evidence does not prove missing tests, and a retrieved test call
does not prove an assertion covers the question. Refine `--name`, raise a budget
within the limits, or drill manually when the trace is unresolved or cut.

Write `ANSWER.md` in the output directory and run `check --run <run> --strict`.
Apply the normal semantic verification rules for interpreted claims. Never claim
a complete call graph or runtime guarantee from a bounded static trace.

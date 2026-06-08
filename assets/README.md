# Example output

[`example-dossier/`](./example-dossier) is a real evidence dossier produced by:

```bash
node scripts/ultradoc.mjs ask \
  --repo tests/fixtures/sample-lib \
  --q "How does the retry backoff work, and which HTTP statuses are retried?" \
  --sources code,docs --out assets/example-dossier
```

It contains what every `ultradoc ask` produces:

- `EVIDENCE.md` — ranked, provenance-tagged evidence, each item with a citable id.
- `evidence.json` — the machine-readable evidence `ultradoc check` validates.
- `meta.json` — repo, sources, timestamp.
- `ANSWER.md` — the grounded, **cited** answer (the model writes this). Every
  claim cites an evidence id, so `ultradoc check --run assets/example-dossier`
  passes.

Run the check yourself:

```bash
node scripts/ultradoc.mjs check --run assets/example-dossier
```

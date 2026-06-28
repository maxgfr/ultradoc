// Okapi BM25, pure TS over Node builtins. Ranks a candidate set against query
// terms given corpus-level stats (N documents, per-term document frequency).
// Only the candidates need per-doc stats; the corpus is described by N and df.

export interface Bm25Doc {
  key: string;
  // term -> occurrences in this doc. Upstream search caps hits per file (~40),
  // which clips tf — immaterial: BM25's tf component saturates well before that.
  tf: Map<string, number>;
  len: number; // doc length in tokens (any consistent proxy works)
}

export function bm25(docs: Bm25Doc[], terms: string[], N: number, df: Map<string, number>, k1 = 1.2, b = 0.75): Map<string, number> {
  const scores = new Map<string, number>();
  // Average length over the candidates, not the whole corpus — the corpus-wide
  // average isn't stored anywhere and the candidate average normalizes the same
  // ranking decisions.
  const avgLen = docs.length ? docs.reduce((s, d) => s + d.len, 0) / docs.length : 1;
  for (const d of docs) {
    let s = 0;
    for (const t of terms) {
      const f = d.tf.get(t) ?? 0;
      if (f === 0) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / (avgLen || 1)))));
    }
    if (s > 0) scores.set(d.key, s);
  }
  return scores;
}

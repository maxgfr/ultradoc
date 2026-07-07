import type { RawItem } from "./registry.js";

// Optional GitHub auth as a keyless-by-default enhancer: when GITHUB_TOKEN is
// set, send it on the public REST fallback so a run isn't capped at the ~10
// req/min unauthenticated search limit. Absent → no header, unchanged behavior.
export function ghAuthHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}

// Optional GitLab auth (PRIVATE-TOKEN header) — same keyless-by-default idea.
export function gitlabAuthHeaders(): Record<string, string> {
  const token = process.env.GITLAB_TOKEN?.trim();
  return token ? { "private-token": token } : {};
}

// Re-rank issue/PR items by how many of the question's keywords each item
// mentions (title + body), breaking ties by the host's own relevance score.
export function rerank(items: RawItem[], ranked: string[]): RawItem[] {
  const terms = ranked.map((t) => t.toLowerCase());
  const coverage = (it: RawItem): number => {
    const hay = `${it.title} ${it.snippet}`.toLowerCase();
    let c = 0;
    for (const t of terms) if (hay.includes(t)) c++;
    return c;
  };
  return items
    .map((it) => ({ it, c: coverage(it), s: it.score }))
    .sort((a, b) => b.c - a.c || b.s - a.s)
    .map((x) => x.it);
}

// Dedupe attempt term-lists (so [a,b,c],[a,b],[a] don't repeat when there are
// fewer keywords) while preserving order.
export function uniqueAttempts(lists: string[][]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const l of lists) {
    const key = l.join(" ");
    if (l.length && !seen.has(key)) {
      seen.add(key);
      out.push(l);
    }
  }
  return out;
}

// Persist a rerank order as a descending score for hosts whose API exposes no
// relevance score (GitLab, Gitea, GraphQL discussions), so the dossier's
// score-based assembly keeps the on-topic order.
export function withRankScores(items: RawItem[]): RawItem[] {
  return items.map((it, i) => ({ ...it, score: items.length - i }));
}

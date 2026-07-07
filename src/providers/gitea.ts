import type { RepoRef } from "../types.js";
import { httpGet } from "../sources/fetch.js";
import { rankedKeywords } from "../util.js";
import { rerank, uniqueAttempts, withRankScores } from "./shared.js";
import type { Provider, RawItem, IssueKind } from "./registry.js";

// Map a Gitea/Forgejo issues-API item to evidence. Gitea returns both issues
// and PRs from /issues; `type` filters them, and `pull_request` disambiguates.
function toItems(arr: any[], kind: IssueKind): RawItem[] {
  const marker = kind === "issue" ? "#" : "!";
  return (arr ?? []).map((it: any) => {
    const num = it.number;
    const labels = (it.labels ?? [])
      .map((l: any) => (typeof l === "string" ? l : l.name))
      .filter(Boolean)
      .join(", ");
    const body = String(it.body ?? "")
      .replace(/\r/g, "")
      .trim()
      .slice(0, 1200);
    return {
      source: kind,
      title: `${marker}${num} ${it.title} [${it.state}]`,
      ref: `${kind}#${num}`,
      location: it.html_url,
      score: 0, // Gitea exposes no relevance score; withRankScores sets it
      snippet: `state: ${it.state}${labels ? ` · labels: ${labels}` : ""} · updated: ${it.updated_at ?? "?"}\n\n${body || "(no description)"}`,
      url: it.html_url,
      meta: { number: num, state: it.state },
    };
  });
}

async function query(ref: RepoRef, terms: string[], kind: IssueKind, perSource: number): Promise<{ items: RawItem[]; error?: string }> {
  const type = kind === "issue" ? "issues" : "pulls";
  const q = encodeURIComponent(terms.join(" "));
  const url = `https://${ref.host}/api/v1/repos/${ref.owner}/${ref.repo}/issues?q=${q}&type=${type}&state=all&limit=${perSource}`;
  const r = await httpGet(url, { accept: "application/json", retries: 2 });
  if (!r.ok) return { items: [], error: `Gitea ${kind} search unavailable (status ${r.status}).` };
  try {
    const arr = JSON.parse(r.body);
    if (!Array.isArray(arr)) return { items: [], error: `Gitea ${kind} search returned no array.` };
    return { items: toItems(arr, kind) };
  } catch {
    return { items: [], error: `Gitea ${kind} search returned an unparseable response.` };
  }
}

// Gitea / Forgejo provider (covers Codeberg and self-hosted instances whose
// host name reveals the software). Stable keyless REST v1 issues API; `q` is a
// substring match, so the same relaxation ladder as GitLab avoids
// over-constraining, then reranks by keyword coverage.
export const gitea: Provider = {
  name: "gitea",
  matches: (host) => /(^|\.)codeberg\.org$/i.test(host) || /gitea|forgejo/i.test(host),

  async search(ref, question, kind, perSource) {
    if (!ref.owner || !ref.repo) {
      return { items: [], notes: ["No owner/repo resolved; cannot query Gitea issues/PRs."] };
    }
    const ranked = rankedKeywords(question);
    if (ranked.length === 0) return { items: [], notes: [`No keywords to search ${kind}s.`] };
    let lastError: string | undefined;

    for (const terms of uniqueAttempts([ranked.slice(0, 3), ranked.slice(0, 2)])) {
      const { items, error } = await query(ref, terms, kind, perSource * 2);
      if (error) lastError = error;
      if (items.length) return { items: withRankScores(rerank(items, ranked)).slice(0, perSource), notes: [] };
    }

    const seen = new Map<string, RawItem>();
    for (const t of ranked.slice(0, 2)) {
      const { items, error } = await query(ref, [t], kind, perSource * 2);
      if (error) lastError = error;
      for (const it of items) if (!seen.has(it.ref)) seen.set(it.ref, it);
    }
    const merged = withRankScores(rerank([...seen.values()], ranked)).slice(0, perSource);
    if (merged.length) return { items: merged, notes: [] };
    return { items: [], notes: lastError ? [lastError] : [`No ${kind}s matched the question.`] };
  },
};

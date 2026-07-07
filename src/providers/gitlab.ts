import type { RepoRef } from "../types.js";
import { httpGet } from "../sources/fetch.js";
import { rankedKeywords } from "../util.js";
import { gitlabAuthHeaders, rerank, uniqueAttempts, withRankScores } from "./shared.js";
import type { Provider, RawItem, IssueKind } from "./registry.js";

// One GitLab search request for the given terms (joined; GitLab's `search` is a
// substring-ish match, so ANDing many keywords over-constrains — the caller
// relaxes the term count). Returns [] on any non-OK response.
async function query(ref: RepoRef, terms: string[], kind: IssueKind, perSource: number): Promise<{ items: RawItem[]; error?: string }> {
  const proj = encodeURIComponent(`${ref.owner}/${ref.repo}`);
  const path = kind === "issue" ? "issues" : "merge_requests";
  const search = encodeURIComponent(terms.join(" "));
  const url = `https://${ref.host}/api/v4/projects/${proj}/${path}?search=${search}&per_page=${perSource}&order_by=updated_at&sort=desc`;
  const r = await httpGet(url, { accept: "application/json", headers: gitlabAuthHeaders(), retries: 2 });
  if (!r.ok) return { items: [], error: `GitLab ${kind} search unavailable (status ${r.status}).` };
  try {
    const arr = JSON.parse(r.body);
    if (!Array.isArray(arr)) return { items: [], error: `GitLab ${kind} search returned no array.` };
    const marker = kind === "issue" ? "#" : "!";
    const items: RawItem[] = arr.map((it: any) => {
      const num = it.iid ?? it.id;
      const body = String(it.description ?? "")
        .replace(/\r/g, "")
        .trim()
        .slice(0, 1200);
      return {
        source: kind,
        title: `${marker}${num} ${it.title} [${it.state}]`,
        ref: `${kind}#${num}`,
        location: it.web_url,
        score: 0, // GitLab exposes no relevance score; withRankScores sets it
        snippet: `state: ${it.state} · updated: ${it.updated_at ?? "?"}\n\n${body || "(no description)"}`,
        url: it.web_url,
        meta: { iid: num, state: it.state },
      };
    });
    return { items };
  } catch {
    return { items: [], error: `GitLab ${kind} search returned an unparseable response.` };
  }
}

// GitLab provider. Public REST v4, unauthenticated read of public projects
// (optional GITLAB_TOKEN enhancer). The project is addressed by its URL-encoded
// full path (namespace/subgroups/repo), so subgroups work. Issues → /issues,
// PRs → /merge_requests. Mirrors GitHub's relaxation ladder so a many-keyword
// question doesn't over-constrain to nothing, then reranks by keyword coverage.
export const gitlab: Provider = {
  name: "gitlab",
  matches: (host) => /gitlab/i.test(host),

  async search(ref, question, kind, perSource) {
    if (!ref.owner || !ref.repo) {
      return { items: [], notes: ["No project path resolved; cannot query GitLab issues/MRs."] };
    }
    const ranked = rankedKeywords(question);
    if (ranked.length === 0) return { items: [], notes: [`No keywords to search ${kind}s.`] };
    let lastError: string | undefined;

    // Precise → looser: top-3 terms, then top-2. Return the first non-empty set,
    // reranked by coverage and re-scored by rank.
    for (const terms of uniqueAttempts([ranked.slice(0, 3), ranked.slice(0, 2)])) {
      const { items, error } = await query(ref, terms, kind, perSource * 2);
      if (error) lastError = error;
      if (items.length) return { items: withRankScores(rerank(items, ranked)).slice(0, perSource), notes: [] };
    }

    // Broad: pool single-term queries over the top-2 keywords, dedupe, rerank.
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

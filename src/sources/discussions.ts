import type { RunContext, SourceResult, EvidenceItem } from "../types.js";
import { sh, have, rankedKeywords } from "../util.js";
import { rerank } from "../providers/github.js";

type RawItem = Omit<EvidenceItem, "id">;

// The `discussion` source: GitHub Discussions (community Q&A, design threads,
// announcements). GraphQL has no keyless access, so this needs the gh CLI;
// without it the source skips with an honest note instead of failing.

const QUERY = `query($q: String!, $n: Int!) {
  search(query: $q, type: DISCUSSION, first: $n) {
    nodes {
      ... on Discussion {
        number title url bodyText updatedAt
        category { name }
        answer { bodyText }
      }
    }
  }
}`;

// Exported for tests: map GraphQL Discussion nodes to evidence items.
export function discussionItems(nodes: any[]): RawItem[] {
  const items: RawItem[] = [];
  for (const d of nodes ?? []) {
    if (!d || typeof d.number !== "number") continue;
    const body = String(d.bodyText ?? "")
      .replace(/\r/g, "")
      .trim()
      .slice(0, 800);
    const answer = String(d.answer?.bodyText ?? "")
      .replace(/\r/g, "")
      .trim()
      .slice(0, 600);
    items.push({
      source: "discussion",
      title: `#${d.number} ${d.title}${d.category?.name ? ` [${d.category.name}]` : ""}`,
      ref: `discussion#${d.number}`,
      location: d.url,
      score: 0, // reranked by keyword coverage below
      snippet: `updated: ${d.updatedAt ?? "?"}\n\n${body || "(no description)"}` + (answer ? `\n\n--- accepted answer ---\n${answer}` : ""),
      url: d.url,
      meta: { number: d.number, category: d.category?.name, answered: !!d.answer },
    });
  }
  return items;
}

function search(owner: string, repo: string, terms: string[], n: number): RawItem[] | undefined {
  const res = sh("gh", ["api", "graphql", "-f", `query=${QUERY}`, "-f", `q=repo:${owner}/${repo} ${terms.join(" ")}`, "-F", `n=${n}`]);
  if (!res.ok) return undefined;
  try {
    return discussionItems(JSON.parse(res.stdout)?.data?.search?.nodes ?? []);
  } catch {
    return undefined;
  }
}

export async function discussionsSource(ctx: RunContext): Promise<SourceResult> {
  const ref = ctx.repoRef;
  if (!/github/i.test(ref.host) || !ref.owner || !ref.repo) {
    return {
      source: "discussion",
      items: [],
      notes: ["Discussions are only available for GitHub repos (none resolved here)."],
    };
  }
  if (!have("gh")) {
    return {
      source: "discussion",
      items: [],
      notes: ["GitHub Discussions need the gh CLI (the GraphQL API has no keyless access); skipped. Run `gh auth login` to enable."],
    };
  }

  const ranked = rankedKeywords(ctx.options.question);
  if (ranked.length === 0) {
    return { source: "discussion", items: [], notes: ["No keywords to search discussions."] };
  }

  // Same progressive relaxation as issues/PRs: precise AND first, then pooled
  // single-term results reranked by keyword coverage.
  const per = ctx.options.perSource;
  for (const terms of [ranked.slice(0, 3), ranked.slice(0, 2)]) {
    if (terms.length === 0) continue;
    const items = search(ref.owner, ref.repo, terms, per * 2);
    if (items === undefined) {
      return { source: "discussion", items: [], notes: ["GitHub Discussions search failed (gh api graphql)."] };
    }
    if (items.length) {
      return { source: "discussion", items: withRankScores(rerank(items, ranked).slice(0, per)), notes: [] };
    }
  }
  const seen = new Map<string, RawItem>();
  for (const t of ranked.slice(0, 3)) {
    const items = search(ref.owner, ref.repo, [t], per * 2) ?? [];
    for (const it of items) if (!seen.has(it.ref)) seen.set(it.ref, it);
  }
  const merged = withRankScores(rerank([...seen.values()], ranked).slice(0, per));
  return {
    source: "discussion",
    items: merged,
    notes: merged.length ? [] : ["No discussions matched the question (or the repo has none)."],
  };
}

// GraphQL search exposes no relevance score, so persist the rerank order as a
// descending score — the dossier sorts by score when assembling sources.
function withRankScores(items: RawItem[]): RawItem[] {
  return items.map((it, i) => ({ ...it, score: items.length - i }));
}

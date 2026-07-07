import type { RunContext, SourceResult, EvidenceItem } from "../types.js";
import { rankedKeywords } from "../util.js";
import { httpGet, htmlToText } from "./fetch.js";

type RawItem = Omit<EvidenceItem, "id">;

// The `so` source: StackOverflow Q&A via the StackExchange API. Anonymous /
// keyless (rate-limited but enough for a few targeted lookups). If a
// `STACK_PAT` (Personal Access Token) is present in the environment it is used
// for higher limits — but it's never required.
export async function stackoverflowSource(ctx: RunContext): Promise<SourceResult> {
  // StackOverflow questions are about a topic, not necessarily the exact lib —
  // search the most distinctive keywords, not the project name (which would
  // over-constrain to zero for niche libraries).
  const kws = rankedKeywords(ctx.options.question).slice(0, 5).join(" ");
  if (!kws) return { source: "so", items: [], notes: ["No keywords to search StackOverflow."] };
  const q = encodeURIComponent(kws);
  const pat = process.env.STACK_PAT ? `&access_token=${process.env.STACK_PAT}` : "";
  const url =
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance` +
    `&q=${q}&site=stackoverflow&filter=withbody&pagesize=${ctx.options.perSource}${pat}`;

  const r = await httpGet(url, { accept: "application/json", retries: 2 });
  if (!r.ok) {
    return { source: "so", items: [], notes: [`StackOverflow search unavailable (status ${r.status}).`] };
  }
  try {
    const data = JSON.parse(r.body);
    const items: RawItem[] = (data.items ?? []).map((it: any) => {
      const body = htmlToText(String(it.body ?? "")).slice(0, 1200);
      const accepted = it.is_answered ? "answered" : "unanswered";
      return {
        source: "so",
        // htmlToText keeps headings as markdown "#" markers — strip them from
        // one-line titles where they'd just be noise.
        title: htmlToText(String(it.title ?? "(question)"))
          .replace(/^#{1,6}\s+/, "")
          .slice(0, 160),
        ref: `so:${it.question_id}`,
        location: it.link,
        score: Number(it.score ?? 0),
        snippet:
          `score: ${it.score ?? 0} · ${accepted} · answers: ${it.answer_count ?? 0}` +
          (it.tags?.length ? ` · tags: ${it.tags.slice(0, 6).join(", ")}` : "") +
          `\n\n${body || "(no body)"}`,
        url: it.link,
        meta: { questionId: it.question_id, isAnswered: it.is_answered, answerCount: it.answer_count },
      };
    });
    const notes = data.quota_remaining !== undefined && data.quota_remaining < 20 ? [`StackExchange anonymous quota low (${data.quota_remaining} left).`] : [];
    if (items.length === 0) notes.push("No StackOverflow questions matched.");
    return { source: "so", items, notes };
  } catch {
    return { source: "so", items: [], notes: ["StackOverflow search returned an unparseable response."] };
  }
}

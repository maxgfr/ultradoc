import type { RunContext, SourceResult, EvidenceItem } from "../types.js";
import { sh, rankedKeywords } from "../util.js";
import { ensureHistoryDepth } from "../clone.js";

type RawItem = Omit<EvidenceItem, "id">;

// The `history` source: when/why did this code change. Runs `git log -S`
// (pickaxe) on the local clone — zero network for local repos, one one-time
// deepen for remote shallow clones. Respects --package via the git pathspec.

interface Hit {
  sha: string;
  date: string;
  author: string;
  subject: string;
  kws: Set<string>;
}

// camelCase / snake_case / dotted names are identifiers: -G (regex over the
// patch text) also catches moves and signature changes that -S's add/remove
// counting misses.
function looksLikeIdentifier(kw: string): boolean {
  return /[A-Z_.]/.test(kw.slice(1)) || /^[a-z]+[A-Z]/.test(kw);
}

export async function historySource(ctx: RunContext): Promise<SourceResult> {
  const notes: string[] = [];
  const depth = ensureHistoryDepth(ctx.repoDir);
  if (depth.note) notes.push(depth.note);
  if (!depth.ok && /not a git/i.test(depth.note ?? "")) {
    return { source: "history", items: [], notes };
  }

  const ranked = rankedKeywords(ctx.options.question).slice(0, 3);
  if (ranked.length === 0) {
    return { source: "history", items: [], notes: [...notes, "No keywords to search the history for."] };
  }

  const hits = new Map<string, Hit>();
  for (const kw of ranked) {
    const pickaxe = looksLikeIdentifier(kw) ? `-G${kw}` : `-S${kw}`;
    const res = sh(
      "git",
      [
        "-C",
        ctx.repoDir,
        "log",
        pickaxe,
        "--format=%h%x09%ad%x09%an%x09%s",
        "--date=short",
        "--max-count=5",
        "--no-merges",
        ...(ctx.scopeDir ? ["--", ctx.scopeDir] : []),
      ],
      { timeoutMs: 120_000 },
    );
    if (!res.ok) {
      notes.push(`git log ${pickaxe.slice(0, 2)} "${kw}" failed or timed out.`);
      continue;
    }
    for (const line of res.stdout.split("\n")) {
      if (!line.trim()) continue;
      const [sha, date, author, ...rest] = line.split("\t");
      if (!sha || !date) continue;
      const hit = hits.get(sha) ?? { sha, date, author: author ?? "?", subject: rest.join("\t"), kws: new Set<string>() };
      hit.kws.add(kw);
      hits.set(sha, hit);
    }
  }

  // Commits touched by more of the question's keywords rank first; recency
  // breaks ties (dates are ISO, so string compare works).
  const top = [...hits.values()].sort((a, b) => b.kws.size - a.kws.size || b.date.localeCompare(a.date)).slice(0, ctx.options.perSource);

  const items: RawItem[] = [];
  for (const c of top) {
    const show = sh("git", ["-C", ctx.repoDir, "show", "--stat", "-s", "--format=%B", c.sha], {
      timeoutMs: 30_000,
    });
    const body = show.ok ? show.stdout.replace(/\r/g, "").trim().slice(0, 1200) : c.subject;
    items.push({
      source: "history",
      title: `${c.sha} ${c.subject} (${c.date})`,
      ref: `commit:${c.sha}`,
      location: c.sha,
      score: c.kws.size * 3,
      snippet: `${c.date} · ${c.author} · matched: ${[...c.kws].join(", ")}\n\n${body}`,
      url: ctx.repoRef.isLocal ? undefined : `${ctx.repoRef.webUrl}/commit/${c.sha}`,
      meta: { sha: c.sha, date: c.date, matchedKeywords: [...c.kws] },
    });
  }

  if (items.length === 0) notes.push("No commit history matched the question's keywords.");
  return { source: "history", items, notes };
}

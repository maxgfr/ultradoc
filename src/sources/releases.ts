import { join } from "node:path";
import type { RunContext, SourceResult, EvidenceItem } from "../types.js";
import { readText } from "../walk.js";
import { keywords as extractKeywords, sh, have } from "../util.js";
import { httpGet } from "./fetch.js";
import { ghAuthHeaders } from "../providers/shared.js";

type RawItem = Omit<EvidenceItem, "id">;

// The `release` source: when was something added/changed/removed, per version.
// Two halves: the repo's own CHANGELOG (offline, always available) and the
// host's releases API (GitHub only, keyless) — release notes often say more
// than the changelog.

const CHANGELOG_RE = /(^|\/)(changelog|changes|history|news|releases?)(\.[a-z0-9]+)?$/i;
// A version section heading: "## [1.2.0] - 2024-01-01", "### v5.2", "1.4.0 / 2023-06-01" …
const VERSION_HEADING_RE = /^(#{1,4}\s*\[?v?\d+\.\d+|v?\d+\.\d+(\.\d+)?\s*[/(—-])/;

interface Section {
  file: string;
  version: string;
  start: number; // 1-based line
  lines: string[];
}

// Exported for tests.
export function changelogSections(file: string, content: string): Section[] {
  const lines = content.split(/\r?\n/);
  const sections: Section[] = [];
  let cur: Section | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (VERSION_HEADING_RE.test(line)) {
      if (cur) sections.push(cur);
      const version = /v?(\d+\.\d+[^\s\])/(—-]*)/.exec(line)?.[1] ?? line.trim().slice(0, 20);
      cur = { file, version, start: i + 1, lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) sections.push(cur);
  return sections;
}

function coverage(text: string, kws: string[]): number {
  const low = text.toLowerCase();
  let c = 0;
  for (const kw of kws) if (low.includes(kw)) c++;
  return c;
}

async function githubReleases(ctx: RunContext, kws: string[]): Promise<{ items: RawItem[]; notes: string[] }> {
  const ref = ctx.repoRef;
  const notes: string[] = [];
  if (!/github/i.test(ref.host) || !ref.owner || !ref.repo) {
    notes.push("Releases API: only GitHub is supported keylessly; used the changelog only.");
    return { items: [], notes };
  }

  let body: string | undefined;
  if (have("gh")) {
    const res = sh("gh", ["api", `repos/${ref.owner}/${ref.repo}/releases?per_page=20`]);
    if (res.ok) body = res.stdout;
  }
  if (!body) {
    const r = await httpGet(`https://api.github.com/repos/${ref.owner}/${ref.repo}/releases?per_page=20`, {
      accept: "application/vnd.github+json",
      headers: ghAuthHeaders(),
      retries: 2,
    });
    if (!r.ok) {
      notes.push(`GitHub releases API unavailable (status ${r.status}); used the changelog only.`);
      return { items: [], notes };
    }
    body = r.body;
  }

  let releases: any[];
  try {
    releases = JSON.parse(body);
  } catch {
    notes.push("GitHub releases API returned an unparseable response.");
    return { items: [], notes };
  }
  if (!Array.isArray(releases) || releases.length === 0) {
    notes.push("The repo has no GitHub releases; used the changelog only.");
    return { items: [], notes };
  }

  const items = githubReleaseItems(releases, kws);
  if (items.length === 0) notes.push("No GitHub release notes matched the question's keywords.");
  return { items, notes };
}

// Exported for tests: map GitHub releases API JSON to evidence items, keeping
// only releases whose notes mention the question's keywords.
export function githubReleaseItems(releases: any[], kws: string[]): RawItem[] {
  const items: RawItem[] = [];
  for (const rel of releases ?? []) {
    const text = `${rel.name ?? ""}\n${rel.body ?? ""}`;
    const cov = coverage(text, kws);
    if (cov === 0) continue;
    const tag = String(rel.tag_name ?? rel.name ?? "");
    items.push({
      source: "release",
      title: `Release ${rel.name || tag}${rel.published_at ? ` (${String(rel.published_at).slice(0, 10)})` : ""}`,
      ref: `release:${tag}`,
      location: rel.html_url,
      score: cov * 3,
      snippet: String(rel.body ?? "(no release notes)")
        .replace(/\r/g, "")
        .trim()
        .slice(0, 1200),
      url: rel.html_url,
      meta: { tag, publishedAt: rel.published_at },
    });
  }
  return items;
}

export async function releasesSource(ctx: RunContext): Promise<SourceResult> {
  const notes: string[] = [];
  const kws = extractKeywords(ctx.options.question).map((k) => k.toLowerCase());
  const items: RawItem[] = [];

  // Offline half: version sections of the repo's own changelog(s).
  const changelogs = ctx.index.docFiles.filter(
    (rel) => CHANGELOG_RE.test(rel) && (!ctx.scopeDir || rel.startsWith(ctx.scopeDir + "/")) && !/(^|\/)(node_modules|vendor|fixtures?)\//i.test(rel),
  );
  for (const rel of changelogs) {
    const content = readText(join(ctx.repoDir, rel));
    if (!content) continue;
    const scored = changelogSections(rel, content)
      .map((s) => ({ s, cov: coverage(s.lines.join("\n"), kws) }))
      .filter((x) => x.cov > 0)
      .sort((a, b) => b.cov - a.cov);
    for (const { s, cov } of scored.slice(0, ctx.options.perSource)) {
      const end = s.start + Math.min(s.lines.length, 30) - 1;
      items.push({
        source: "release",
        title: `${rel} — version ${s.version}`,
        ref: `release:${s.version}`,
        location: `${rel}:${s.start}-${s.start + s.lines.length - 1}`,
        score: cov * 3,
        snippet: s.lines.slice(0, 30).join("\n"),
        url: ctx.repoRef.isLocal ? undefined : `${ctx.repoRef.webUrl}/blob/${ctx.index.commit ?? "HEAD"}/${rel}#L${s.start}-L${end}`,
      });
    }
  }
  if (changelogs.length === 0) notes.push("No changelog file found in the repo.");
  else if (items.length === 0) notes.push("No changelog section matched the question's keywords.");

  // Network half: the host's release notes.
  if (!ctx.repoRef.isLocal) {
    const gh = await githubReleases(ctx, kws);
    items.push(...gh.items);
    notes.push(...gh.notes);
  }

  return { source: "release", items, notes };
}

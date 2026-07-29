import type { SourceKind } from "../types.js";

// The user-facing spellings of every retrieval source, singular and plural, plus
// the aliases a person actually types ("pull-requests", "stackoverflow"). Lives
// here rather than in cli.ts because the CLI is no longer the only front-end:
// the MCP server parses the same `sources` list out of a JSON tool call, and
// importing it from cli.ts would close an import cycle (cli.ts → mcp/server.ts →
// mcp/handlers.ts → cli.ts).
export const SOURCE_TOKENS: Record<string, SourceKind> = {
  code: "code",
  issue: "issue",
  issues: "issue",
  pr: "pr",
  prs: "pr",
  "pull-requests": "pr",
  "merge-requests": "pr",
  doc: "docs",
  docs: "docs",
  release: "release",
  releases: "release",
  history: "history",
  discussion: "discussion",
  discussions: "discussion",
  web: "web",
  so: "so",
  stackoverflow: "so",
};

// What `ask` retrieves when no --sources/`sources` is given: the four that
// answer most questions about a library without paying for a web round-trip.
export const DEFAULT_SOURCES: SourceKind[] = ["code", "issue", "pr", "docs"];

export const SOURCE_LIST_HINT = "use: code,issues,prs,docs,releases,history,discussions,web,so";

// Resolve source tokens, deduped, order-preserving. RETURNS the error instead of
// exiting: cli.ts turns it into `fail()` (exit 1), the MCP server turns it into a
// thrown Error the JSON-RPC layer reports — a bad `sources` value must never take
// a long-lived server process down with it.
export function parseSourceList(tokens: string[], label = "sources"): { sources?: SourceKind[]; error?: string } {
  const out: SourceKind[] = [];
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    const k = SOURCE_TOKENS[t.toLowerCase()];
    if (!k) return { error: `unknown source "${t}" (${SOURCE_LIST_HINT})` };
    if (!out.includes(k)) out.push(k);
  }
  if (out.length === 0) return { error: `${label} resolved to nothing` };
  return { sources: out };
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { CodeSymbol, RepoRef, StructuralIndex } from "./types.js";
import { walk, readText } from "./walk.js";

// Generate a deterministic markdown digest of a repository (no LLM): what it
// is, its workspace packages, layout, exported API surface and documentation
// map. Written once beside the index and reused across questions, so the model
// can orient itself (and pick a --package) without re-running retrieval.
//
// This file is a NAVIGATION map, not evidence: answers must still cite a
// dossier built by `ask`/drill commands.

const CACHE_MARK = /<!-- ultradoc:overview commit=([^\s]+) -->/;

export function overviewPath(repoDir: string): string {
  return join(repoDir, ".ultradoc", "OVERVIEW.md");
}

// First prose paragraphs of the README — skip headings, badges and HTML.
function readmeAbout(repoDir: string, docFiles: string[]): string[] {
  const readme = docFiles.find((f) => /^readme(\.|$)/i.test(f));
  if (!readme) return [];
  const text = readText(join(repoDir, readme));
  const out: string[] = [];
  let chars = 0;
  for (const para of text.split(/\r?\n\s*\r?\n/)) {
    const p = para.trim();
    if (!p || p.startsWith("#") || p.startsWith("<") || p.startsWith("!") || p.startsWith("[![") || p.startsWith("```")) continue;
    out.push(p.replace(/\s*\r?\n\s*/g, " "));
    chars += p.length;
    if (out.length >= 3 || chars > 700) break;
  }
  return out;
}

// Top-level directories by file count — a cheap structural map of the tree.
// Uses the index's cached topDirs histogram (built during indexing) instead of
// re-walking; falls back to a walk for a pre-v4 index without the field.
function layout(repoDir: string, index: StructuralIndex): { dir: string; files: number }[] {
  let counts: Map<string, number>;
  if (index.topDirs) {
    counts = new Map(Object.entries(index.topDirs).map(([top, n]) => [top === "." ? "(root)" : top + "/", n]));
  } else {
    counts = new Map();
    for (const f of walk(repoDir)) {
      const top = f.rel.includes("/") ? f.rel.slice(0, f.rel.indexOf("/")) + "/" : "(root)";
      counts.set(top, (counts.get(top) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([dir, files]) => ({ dir, files }))
    .sort((a, b) => b.files - a.files || a.dir.localeCompare(b.dir))
    .slice(0, 15);
}

// Exported symbols grouped per file, files with the richest public surface
// first. `prefix` restricts to one package's subtree.
function apiLines(symbols: CodeSymbol[], prefix?: string, maxFiles = 15, maxSyms = 8): string[] {
  const byFile = new Map<string, CodeSymbol[]>();
  for (const s of symbols) {
    if (!s.exported) continue;
    if (prefix && !s.file.startsWith(prefix + "/")) continue;
    const list = byFile.get(s.file) ?? [];
    list.push(s);
    byFile.set(s.file, list);
  }
  const files = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, maxFiles);
  return files.map(([file, syms]) => {
    const shown = syms
      .sort((a, b) => a.line - b.line)
      .slice(0, maxSyms)
      .map((s) => `${s.kind} \`${s.name}\``)
      .join(", ");
    const more = syms.length > maxSyms ? ` (+${syms.length - maxSyms} more)` : "";
    return `- \`${file}\` — ${shown}${more}`;
  });
}

export function renderOverview(index: StructuralIndex, ref: RepoRef, repoDir: string): string {
  const name = ref.repo ?? basename(repoDir);
  const out: string[] = [];
  out.push(`<!-- ultradoc:overview commit=${index.commit ?? "unknown"} -->`);
  out.push(`# ${name} — repository overview`);
  out.push("");
  out.push(`**Repo:** ${ref.raw}${index.commit ? ` @ ${index.commit}` : ""} · **host:** ${ref.host}`);
  const langs = Object.entries(index.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}:${v}`);
  out.push(`**Files:** ${index.fileCount} · **symbols:** ${index.symbols.length} · **languages:** ${langs.join(", ")}`);
  out.push(`**Generated:** ${index.builtAt} (regenerate with \`ultradoc overview --refresh\`)`);
  out.push("");
  out.push(
    `> This is a cached navigation map for answering questions about the repo ` +
      `without re-indexing. It is NOT citable evidence — ground answers in a ` +
      `dossier from \`ultradoc ask\`.`,
  );
  out.push("");

  const about = readmeAbout(repoDir, index.docFiles);
  if (about.length) {
    out.push("## About");
    out.push("");
    for (const p of about) out.push(p, "");
  }

  if (index.packages.length) {
    out.push("## Workspace packages");
    out.push("");
    out.push(`This is a monorepo with ${index.packages.length} packages. Scope any question with \`--package <name|dir>\`.`);
    out.push("");
    out.push("| package | path | description |");
    out.push("|---------|------|-------------|");
    for (const p of index.packages) {
      out.push(`| ${p.name} | \`${p.dir}\` | ${p.description ?? ""} |`);
    }
    out.push("");
  }

  out.push("## Layout");
  out.push("");
  for (const l of layout(repoDir, index)) out.push(`- \`${l.dir}\` — ${l.files} files`);
  out.push("");

  out.push("## Public API");
  out.push("");
  if (index.packages.length) {
    for (const p of index.packages) {
      const lines = apiLines(index.symbols, p.dir, 10, 8);
      if (!lines.length) continue;
      out.push(`### ${p.name} (\`${p.dir}\`)`);
      out.push("");
      out.push(...lines);
      out.push("");
    }
  } else {
    const lines = apiLines(index.symbols);
    out.push(...(lines.length ? lines : ["_No exported symbols were detected._"]));
    out.push("");
  }

  out.push("## Documentation");
  out.push("");
  if (index.docsRoot) out.push(`- Canonical docs tree: \`${index.docsRoot}/\``);
  if (index.docsUrl) out.push(`- Official docs site: ${index.docsUrl}`);
  for (const d of index.docFiles.slice(0, 40)) out.push(`- \`${d}\``);
  if (index.docFiles.length > 40) out.push(`- … ${index.docFiles.length - 40} more doc files`);
  out.push("");

  return out.join("\n");
}

export interface OverviewResult {
  path: string;
  markdown: string;
  cached: boolean; // true when an up-to-date file (same commit) was reused
}

// Write the overview beside the structural index, reusing it while the clone
// stays at the same commit (unless `refresh`). `out` overrides the file path.
export function ensureOverview(index: StructuralIndex, ref: RepoRef, repoDir: string, opts: { refresh?: boolean; out?: string } = {}): OverviewResult {
  const path = opts.out ?? overviewPath(repoDir);
  if (!opts.refresh && existsSync(path)) {
    try {
      const existing = readFileSync(path, "utf8");
      const commit = CACHE_MARK.exec(existing)?.[1];
      if (commit && commit === (index.commit ?? "unknown")) {
        return { path, markdown: existing, cached: true };
      }
    } catch {
      /* unreadable — regenerate below */
    }
  }
  const markdown = renderOverview(index, ref, repoDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown);
  return { path, markdown, cached: false };
}

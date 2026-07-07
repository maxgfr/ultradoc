import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StructuralIndex, CodeSymbol } from "../types.js";
import { walkDetailed, readText } from "../walk.js";
import { LIMITS } from "../config.js";
import { extractSymbols, languageOf } from "../lang/registry.js";
import { headCommit, sameCommit } from "../clone.js";
import { discoverDocsRoot, discoverDocsUrl } from "../sources/doc-discovery.js";
import { discoverWorkspaces } from "./workspaces.js";

// v4: added `stats` (truncation honesty) and `topDirs` (overview layout). Old
// indexes auto-rebuild.
const SCHEMA_VERSION = 4;

// Files that are documentation: conventional top-level docs, anything under a
// docs tree, and prose extensions. Used to feed the `docs` source and to weight
// code search away from prose.
const DOC_BASENAME = /^(readme|changelog|contributing|history|news|authors|notice|security|code_of_conduct|faq|getting[-_]?started|usage|guide|tutorial)\b/i;
const DOC_EXT = new Set([".md", ".mdx", ".rst", ".adoc", ".txt"]);
const DOC_DIR = /^(docs?|documentation|wiki|guides?|website|site|book)\//i;

// Manifests / config that reveal the stack, deps, scripts and entry points.
const CONFIG_BASENAME = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "requirements.txt",
  "pipfile",
  "go.mod",
  "cargo.toml",
  "gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "mix.exs",
  "pubspec.yaml",
  "build.sbt",
  "dockerfile",
  "docker-compose.yml",
  "makefile",
  ".env.example",
  "manifest.json",
]);

export function indexDir(root: string): string {
  return join(root, ".ultradoc");
}
export function indexPath(root: string): string {
  return join(indexDir(root), "index.json");
}

function isDoc(rel: string, ext: string): boolean {
  const base = rel.split("/").pop()!.toLowerCase();
  return DOC_EXT.has(ext) || DOC_BASENAME.test(base) || DOC_DIR.test(rel);
}
function isConfig(rel: string): boolean {
  return CONFIG_BASENAME.has(rel.split("/").pop()!.toLowerCase());
}

// Build the deterministic structural index from a working tree: language
// histogram, declared symbols, and the doc/config file lists. No LLM, no
// network. Persisted under <root>/.ultradoc/index.json for reuse.
export function buildIndex(root: string, slug: string, opts: { maxFiles?: number; project?: string[] } = {}): StructuralIndex {
  const { files, truncated } = walkDetailed(root, { maxFiles: opts.maxFiles });
  const languages: Record<string, number> = {};
  const symbols: CodeSymbol[] = [];
  const docFiles: string[] = [];
  const configFiles: string[] = [];
  const topDirs: Record<string, number> = {};
  let symbolCapHits = 0;

  for (const f of files) {
    const lang = languageOf(f.ext);
    languages[lang] = (languages[lang] ?? 0) + 1;
    const top = f.rel.includes("/") ? f.rel.slice(0, f.rel.indexOf("/")) : ".";
    topDirs[top] = (topDirs[top] ?? 0) + 1;
    if (isDoc(f.rel, f.ext)) docFiles.push(f.rel);
    if (isConfig(f.rel)) configFiles.push(f.rel);

    // Only read+extract from files an extractor can handle, to bound work on
    // huge repos. Other files remain fully searchable via ripgrep.
    const content = readText(f.abs);
    if (!content) continue;
    const syms = extractSymbols(f.rel, f.ext, content);
    // Cap symbols per file to avoid a generated/giant file dominating.
    if (syms.length > LIMITS.symbolsPerFile) symbolCapHits++;
    for (const s of syms.slice(0, LIMITS.symbolsPerFile)) symbols.push(s);
  }

  const sortedDocs = docFiles.sort();
  const sortedConfigs = configFiles.sort();
  const index: StructuralIndex = {
    slug,
    root,
    commit: headCommit(root),
    builtAt: new Date().toISOString(),
    fileCount: files.length,
    languages,
    symbols,
    docFiles: sortedDocs,
    configFiles: sortedConfigs,
    // Discover the canonical docs folder + official docs URL once, from the
    // repo's own README/manifests, and cache them so questions cost no extra work.
    docsRoot: discoverDocsRoot(sortedDocs),
    docsUrl: discoverDocsUrl(root, sortedDocs, sortedConfigs, opts.project ?? []),
    // Workspace packages (yarn/npm/pnpm/lerna/Cargo/go.work) so monorepo
    // questions can be scoped to one package with --package.
    packages: discoverWorkspaces(root),
    topDirs,
    stats: { truncated, symbolCapHits },
    schemaVersion: SCHEMA_VERSION,
  };

  try {
    mkdirSync(indexDir(root), { recursive: true });
    writeFileSync(indexPath(root), JSON.stringify(index));
  } catch {
    // A read-only tree still works in-memory; persistence is an optimization.
  }
  return index;
}

export function loadIndex(root: string): StructuralIndex | undefined {
  const p = indexPath(root);
  if (!existsSync(p)) return undefined;
  try {
    const idx = JSON.parse(readFileSync(p, "utf8")) as StructuralIndex;
    if (idx.schemaVersion !== SCHEMA_VERSION) return undefined;
    // Commit-validate: a local checkout whose HEAD moved under a persisted index
    // (or any tree that changed) must rebuild, else citations point at stale
    // lines. Non-git trees (no HEAD) keep the cached index. buildIndex is cheap.
    const head = headCommit(root);
    if (idx.commit && head && !sameCommit(idx.commit, head)) return undefined;
    return idx;
  } catch {
    return undefined;
  }
}

// Return a usable index, building it once and reusing it thereafter (unless
// `refresh`). The cached index lives inside the clone, so it is discarded
// whenever the clone is refreshed.
export function ensureIndex(root: string, slug: string, opts: { refresh?: boolean; maxFiles?: number; project?: string[] } = {}): StructuralIndex {
  if (!opts.refresh) {
    const existing = loadIndex(root);
    if (existing) return existing;
  }
  return buildIndex(root, slug, { maxFiles: opts.maxFiles, project: opts.project });
}

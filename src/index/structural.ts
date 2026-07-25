import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StructuralIndex, CodeSymbol } from "../types.js";
import { LIMITS } from "../config.js";
import { languageOf } from "../lang/registry.js";
import { scanRepo, grammarKeysForExts, grammarReady } from "../vendor/codeindex-engine.mjs";
import { publishScan, scanOptions } from "./scan.js";
import { headCommit, sameCommit } from "../clone.js";
import { discoverDocsRoot, discoverDocsUrl } from "../sources/doc-discovery.js";
import { discoverWorkspaces } from "./workspaces.js";

// v5: symbols carry `endLine`/`parent`, the index carries `callSites`, and
// `stats` records which extraction tier built it. Old indexes auto-rebuild.
const SCHEMA_VERSION = 5;

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

// Where each declared symbol name is invoked, from the engine's extracted call
// expressions. Restricted to names the repo DECLARES — an unknown callee is a
// library function, not something a question about this repo can be grounded
// on — and capped per name so one ubiquitous helper can't dominate index.json.
// Keys are sorted so the persisted artifact is byte-stable across walks.
function buildCallSites(
  files: { rel: string; calls?: { name: string; line: number }[] }[],
  declared: Set<string>,
): { callSites: Record<string, [string, number][]>; capHits: number } {
  const byName = new Map<string, [string, number][]>();
  let capHits = 0;
  for (const f of files) {
    for (const c of f.calls ?? []) {
      if (!declared.has(c.name)) continue;
      let sites = byName.get(c.name);
      if (!sites) {
        sites = [];
        byName.set(c.name, sites);
      }
      if (sites.length >= LIMITS.callSitesPerSymbol) continue;
      sites.push([f.rel, c.line]);
    }
  }
  const callSites: Record<string, [string, number][]> = {};
  for (const name of [...byName.keys()].sort()) {
    const sites = byName.get(name)!;
    if (sites.length >= LIMITS.callSitesPerSymbol) capHits++;
    callSites[name] = sites;
  }
  return { callSites, capHits };
}

// Build the deterministic structural index from a working tree: language
// histogram, declared symbols, call sites, and the doc/config file lists. One
// engine scan does the walk, the reads and the extraction in a single pass. No
// LLM, no network. Persisted under <root>/.ultradoc/index.json for reuse.
export function buildIndex(root: string, slug: string, opts: { maxFiles?: number; project?: string[] } = {}): StructuralIndex {
  const scan = scanRepo(root, scanOptions(root, opts.maxFiles));
  // Hand the scan to whatever needs the full picture later in this process —
  // the symbol drill, the semantic tier, the module graph — so an `overview`
  // that just indexed doesn't scan the tree a second time. A truncated scan
  // (maxFiles override) is not representative, so it is not published.
  if (!scan.capped && opts.maxFiles === undefined) publishScan(root, scan);
  const languages: Record<string, number> = {};
  const symbols: CodeSymbol[] = [];
  const docFiles: string[] = [];
  const configFiles: string[] = [];
  const topDirs: Record<string, number> = {};
  const exts = new Set<string>();
  let symbolCapHits = 0;

  for (const f of scan.files) {
    // The engine's own histogram is per-extension; ultradoc's is per language
    // family ("javascript/typescript"), which is what the overview reports.
    const lang = languageOf(f.ext);
    languages[lang] = (languages[lang] ?? 0) + 1;
    const top = f.rel.includes("/") ? f.rel.slice(0, f.rel.indexOf("/")) : ".";
    topDirs[top] = (topDirs[top] ?? 0) + 1;
    if (isDoc(f.rel, f.ext)) docFiles.push(f.rel);
    if (isConfig(f.rel)) configFiles.push(f.rel);
    if (f.kind === "code") exts.add(f.ext);

    // Cap symbols per file to avoid a generated/giant file dominating.
    if (f.symbols.length > LIMITS.symbolsPerFile) symbolCapHits++;
    for (const s of f.symbols.slice(0, LIMITS.symbolsPerFile)) symbols.push(s);
  }

  const { callSites, capHits: callSiteCapHits } = buildCallSites(scan.files, new Set(symbols.map((s) => s.name)));

  const sortedDocs = docFiles.sort();
  const sortedConfigs = configFiles.sort();
  const index: StructuralIndex = {
    slug,
    root,
    commit: headCommit(root),
    builtAt: new Date().toISOString(),
    fileCount: scan.files.length,
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
    callSites,
    // Recorded, never inferred later: an index built without the grammars has
    // no endLine and no nested methods, and every consumer must be able to say
    // so rather than present a regex-tier index as complete.
    stats: {
      truncated: scan.capped,
      symbolCapHits,
      astTier: grammarKeysForExts(exts).some((k) => grammarReady(k)),
      callSiteCapHits,
    },
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

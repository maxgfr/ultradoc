import type { WorkspacePackage } from "../types.js";
import { detectWorkspaces } from "../vendor/codeindex-engine.mjs";

// Discover, from the repo's own manifests, the packages of a workspace monorepo
// (yarn/npm/pnpm/lerna/nx workspaces, Cargo workspaces, go.work, uv workspaces,
// Composer path repositories, Maven modules, Gradle settings.gradle(.kts)
// includes). Deterministic, no LLM, no network — computed once at index time
// and cached in the StructuralIndex so questions can be scoped with --package.
//
// Delegated to the vendored codeindex engine's detectWorkspaces (v2.5+):
// through v2.0.1 the engine's detector lacked uv, Composer, Gradle, nested
// glob segments ("packages/*/plugins/*"), partial wildcard segments
// ("libs-*") and package descriptions, so ultradoc carried its own prober.
// The engine closed that gap in v2.5.0 ("uv workspaces, Composer path repos,
// Gradle includes, nested globs, descriptions, warnings") — verified against
// every case this module's test suite covers, including a Gradle
// single-project repo with no settings.gradle (both return no packages,
// since there is nothing to link). Only `{ name, dir, description }` is kept
// here: the engine's richer WorkspaceInfo (kind, manifest, dependsOn, cycle,
// topoOrder, warnings, packageOf-by-path) isn't part of ultradoc's public
// contract.
export function discoverWorkspaces(root: string): WorkspacePackage[] {
  return detectWorkspaces(root)
    .packages.map((p) => ({ name: p.name, dir: p.dir, description: p.description }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

// Resolve a user-supplied --package value (full name, short name, or dir) to
// one package. NOT delegated: the engine's WorkspaceInfo.packageOf(rel) only
// resolves a repo-relative FILE PATH to its owning package — a different
// operation from matching a user-typed CLI query against a package's name,
// short name (suffix after the scope), or directory. There is no engine
// equivalent for this, so it stays local.
// Ambiguous or unknown → undefined; the caller reports loudly.
export function resolvePackage(packages: WorkspacePackage[], query: string): WorkspacePackage | undefined {
  const q = query.toLowerCase().replace(/\/+$/, "");
  const exact = packages.find((p) => p.name.toLowerCase() === q) ?? packages.find((p) => p.dir.toLowerCase() === q);
  if (exact) return exact;
  const short = packages.filter((p) => p.name.toLowerCase().split("/").pop() === q || p.dir.toLowerCase().split("/").pop() === q);
  if (short.length === 1) return short[0];
  if (short.length > 1) return undefined;
  const loose = packages.filter((p) => p.name.toLowerCase().includes(q) || p.dir.toLowerCase().includes(q));
  return loose.length === 1 ? loose[0] : undefined;
}

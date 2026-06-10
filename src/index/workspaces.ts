import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { WorkspacePackage } from "../types.js";
import { readText } from "../walk.js";

// Discover, from the repo's own manifests, the packages of a workspace monorepo
// (yarn/npm workspaces, pnpm-workspace.yaml, lerna.json, Cargo workspaces,
// go.work). Deterministic, no LLM, no network — computed once at index time and
// cached in the StructuralIndex so questions can be scoped with --package.

// A directory only counts as a package if it carries a real manifest —
// otherwise a glob like "packages/*" would pick up assets or fixtures.
const PKG_MANIFESTS = ["package.json", "Cargo.toml", "go.mod", "composer.json", "pyproject.toml"];

function parseJson(text: string): any | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isDir(abs: string): boolean {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

function subDirs(root: string, rel: string): string[] {
  const abs = rel ? join(root, rel) : root;
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  return entries
    .filter((n) => !n.startsWith(".") && n !== "node_modules" && isDir(join(abs, n)))
    .map((n) => (rel ? `${rel}/${n}` : n));
}

// Expand one workspace pattern to candidate dirs. Supports exact paths,
// "dir/*", and "dir/**" (two levels) — the forms real monorepos use.
function expandOne(root: string, pat: string): string[] {
  if (!pat.includes("*")) return isDir(join(root, pat)) ? [pat] : [];
  const prefix = pat.slice(0, pat.indexOf("*")).replace(/\/$/, "");
  if (prefix.includes("*")) return []; // a glob in the middle — not seen in practice
  const level1 = subDirs(root, prefix);
  if (!pat.includes("**")) return level1;
  return [...level1, ...level1.flatMap((d) => subDirs(root, d))];
}

function expand(root: string, patterns: string[]): string[] {
  const include: string[] = [];
  const exclude = new Set<string>();
  for (const raw of patterns) {
    const neg = raw.startsWith("!");
    const pat = (neg ? raw.slice(1) : raw).replace(/^\.\//, "").replace(/\/+$/, "");
    if (!pat || pat === ".") continue;
    for (const dir of expandOne(root, pat)) (neg ? exclude.add(dir) : include.push(dir));
  }
  return include.filter((d) => !exclude.has(d));
}

// Read a package's identity from its own manifest.
function describePackage(root: string, dir: string): WorkspacePackage | undefined {
  if (!PKG_MANIFESTS.some((m) => existsSync(join(root, dir, m)))) return undefined;
  const base = dir.split("/").pop()!;
  const pj = parseJson(readText(join(root, dir, "package.json")) || readText(join(root, dir, "composer.json")));
  if (pj && typeof pj.name === "string") {
    return { name: pj.name, dir, description: typeof pj.description === "string" ? pj.description : undefined };
  }
  const cargo = readText(join(root, dir, "Cargo.toml"));
  if (cargo) {
    const name = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(cargo)?.[1];
    const description = /^\s*description\s*=\s*["']([^"']+)["']/m.exec(cargo)?.[1];
    if (name) return { name, dir, description };
  }
  const gomod = readText(join(root, dir, "go.mod"));
  if (gomod) {
    const mod = /^module\s+(\S+)/m.exec(gomod)?.[1];
    if (mod) return { name: mod, dir, description: undefined };
  }
  return { name: base, dir, description: undefined };
}

// Collect workspace glob patterns from every manifest format we understand.
function workspacePatterns(root: string): string[] {
  const patterns: string[] = [];

  const pj = parseJson(readText(join(root, "package.json")));
  const ws = pj?.workspaces;
  if (Array.isArray(ws)) patterns.push(...ws.filter((p: unknown) => typeof p === "string"));
  else if (ws && Array.isArray(ws.packages)) patterns.push(...ws.packages.filter((p: unknown) => typeof p === "string"));

  // pnpm-workspace.yaml: a flat "packages:" list — parsed directly to stay
  // dependency-free (full YAML is not needed for this shape).
  const pnpm = readText(join(root, "pnpm-workspace.yaml"));
  if (pnpm) {
    let inPackages = false;
    for (const line of pnpm.split(/\r?\n/)) {
      if (/^packages\s*:/.test(line)) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        const m = /^\s+-\s*["']?([^"'#]+?)["']?\s*$/.exec(line);
        if (m) patterns.push(m[1]!);
        else if (/^\S/.test(line)) inPackages = false; // next top-level key
      }
    }
  }

  const lerna = parseJson(readText(join(root, "lerna.json")));
  if (lerna && Array.isArray(lerna.packages)) {
    patterns.push(...lerna.packages.filter((p: unknown) => typeof p === "string"));
  }

  const cargo = readText(join(root, "Cargo.toml"));
  if (cargo) {
    const members = /\[workspace\][^[]*?members\s*=\s*\[([^\]]*)\]/.exec(cargo)?.[1];
    if (members) {
      for (const m of members.matchAll(/["']([^"']+)["']/g)) patterns.push(m[1]!);
    }
  }

  const gowork = readText(join(root, "go.work"));
  if (gowork) {
    const block = /^use\s*\(([\s\S]*?)\)/m.exec(gowork)?.[1];
    const uses = block
      ? block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("//"))
      : [...gowork.matchAll(/^use\s+(\S+)/gm)].map((m) => m[1]!);
    patterns.push(...uses);
  }

  return patterns;
}

export function discoverWorkspaces(root: string): WorkspacePackage[] {
  const dirs = expand(root, workspacePatterns(root));
  const byDir = new Map<string, WorkspacePackage>();
  for (const dir of dirs) {
    if (byDir.has(dir)) continue;
    const pkg = describePackage(root, dir);
    if (pkg) byDir.set(dir, pkg);
  }
  return [...byDir.values()].sort((a, b) => a.dir.localeCompare(b.dir));
}

// Resolve a user-supplied --package value (full name, short name, or dir) to
// one package. Ambiguous or unknown → undefined; the caller reports loudly.
export function resolvePackage(
  packages: WorkspacePackage[],
  query: string,
): WorkspacePackage | undefined {
  const q = query.toLowerCase().replace(/\/+$/, "");
  const exact = packages.find((p) => p.name.toLowerCase() === q) ?? packages.find((p) => p.dir.toLowerCase() === q);
  if (exact) return exact;
  const short = packages.filter(
    (p) => p.name.toLowerCase().split("/").pop() === q || p.dir.toLowerCase().split("/").pop() === q,
  );
  if (short.length === 1) return short[0];
  if (short.length > 1) return undefined;
  const loose = packages.filter(
    (p) => p.name.toLowerCase().includes(q) || p.dir.toLowerCase().includes(q),
  );
  return loose.length === 1 ? loose[0] : undefined;
}

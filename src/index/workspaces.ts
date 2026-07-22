import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { WorkspacePackage } from "../types.js";
import { escapeRegExp } from "../util.js";
import { readText } from "../walk.js";

// Discover, from the repo's own manifests, the packages of a workspace monorepo
// (yarn/npm workspaces, pnpm-workspace.yaml, lerna.json, Cargo workspaces,
// go.work, uv workspaces, Composer path repos, Maven modules, Gradle includes).
// Deterministic, no LLM, no network — computed once at index time and cached in
// the StructuralIndex so questions can be scoped with --package.
//
// NOT delegated to the vendored codeindex engine (engine gap, reported
// upstream): the engine's detectWorkspaces lacks uv workspaces, Composer path
// repositories, Gradle includes, package descriptions, nested glob patterns
// ("packages/*/plugins/*") and partial wildcard segments ("libs-*") — all
// behaviors this module supports and the test suite encodes. Revisit once the
// engine's detection is a strict superset.

// A directory only counts as a package if it carries a real manifest —
// otherwise a glob like "packages/*" would pick up assets or fixtures.
const PKG_MANIFESTS = ["package.json", "Cargo.toml", "go.mod", "composer.json", "pyproject.toml", "pom.xml", "build.gradle", "build.gradle.kts"];

// Extract a string-array value for `key` inside TOML table [section]. Tracks
// table headers line by line so key order, preceding keys (resolver = "2"),
// and arrays in other sections don't matter — a full TOML parser is not
// needed for this shape.
function tomlArrayInSection(text: string, section: string, key: string): string[] {
  const out: string[] = [];
  let table = "";
  let buf: string | undefined;
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\[`);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "");
    if (buf !== undefined) {
      buf += " " + line;
      if (line.includes("]")) {
        for (const m of buf.matchAll(/["']([^"']+)["']/g)) out.push(m[1]!);
        buf = undefined;
      }
      continue;
    }
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      table = header[1]!.trim();
      continue;
    }
    if (table !== section || !keyRe.test(line)) continue;
    const tail = line.slice(line.indexOf("["));
    if (tail.includes("]")) {
      for (const m of tail.matchAll(/["']([^"']+)["']/g)) out.push(m[1]!);
    } else {
      buf = tail;
    }
  }
  return out;
}

// Same idea for a scalar string value (e.g. [project] name in pyproject.toml).
function tomlStringInSection(text: string, section: string, key: string): string | undefined {
  let table = "";
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*["']([^"']+)["']`);
  for (const raw of text.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(raw);
    if (header) {
      table = header[1]!.trim();
      continue;
    }
    if (table !== section) continue;
    const m = keyRe.exec(raw);
    if (m) return m[1];
  }
  return undefined;
}

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
  return entries.filter((n) => !n.startsWith(".") && n !== "node_modules" && isDir(join(abs, n))).map((n) => (rel ? `${rel}/${n}` : n));
}

// Expand one workspace pattern to candidate dirs, segment by segment: literal
// segments descend directly, "*" expands one level, "**" up to two levels,
// and partial wildcards ("libs-*") filter siblings. Nested forms like
// "packages/*/plugins/*" work as well as plain "dir/*".
function expandOne(root: string, pat: string): string[] {
  const segs = pat.split("/").filter((s) => s && s !== ".");
  let dirs: string[] = [""];
  for (const seg of segs) {
    const next: string[] = [];
    for (const d of dirs) {
      if (seg === "**") {
        const level1 = subDirs(root, d);
        next.push(...level1, ...level1.flatMap((x) => subDirs(root, x)));
      } else if (seg === "*") {
        next.push(...subDirs(root, d));
      } else if (seg.includes("*")) {
        const re = new RegExp("^" + seg.split("*").map(escapeRegExp).join(".*") + "$");
        next.push(...subDirs(root, d).filter((x) => re.test(x.split("/").pop()!)));
      } else {
        const cand = d ? `${d}/${seg}` : seg;
        if (isDir(join(root, cand))) next.push(cand);
      }
    }
    dirs = next;
    if (dirs.length === 0) return [];
  }
  return dirs.filter(Boolean);
}

function expand(root: string, patterns: string[]): string[] {
  const include: string[] = [];
  const exclude = new Set<string>();
  for (const raw of patterns) {
    const neg = raw.startsWith("!");
    const pat = (neg ? raw.slice(1) : raw).replace(/^\.\//, "").replace(/\/+$/, "");
    if (!pat || pat === ".") continue;
    for (const dir of expandOne(root, pat)) neg ? exclude.add(dir) : include.push(dir);
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
  const py = readText(join(root, dir, "pyproject.toml"));
  if (py) {
    const name = tomlStringInSection(py, "project", "name") ?? tomlStringInSection(py, "tool.poetry", "name");
    const description = tomlStringInSection(py, "project", "description") ?? tomlStringInSection(py, "tool.poetry", "description");
    if (name) return { name, dir, description };
  }
  const pom = readText(join(root, dir, "pom.xml"));
  if (pom) {
    // Strip <parent> first: its artifactId would otherwise shadow the module's own.
    const own = pom.replace(/<parent>[\s\S]*?<\/parent>/, "");
    const name = /<artifactId>\s*([^<]+?)\s*<\/artifactId>/.exec(own)?.[1];
    if (name) return { name, dir, description: undefined };
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
    patterns.push(...tomlArrayInSection(cargo, "workspace", "members"));
    patterns.push(...tomlArrayInSection(cargo, "workspace", "exclude").map((p) => `!${p}`));
  }

  const gowork = readText(join(root, "go.work"));
  if (gowork) {
    const block = /^use\s*\(([\s\S]*?)\)/m.exec(gowork)?.[1];
    const uses = block
      ? block
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("//"))
      : [...gowork.matchAll(/^use\s+(\S+)/gm)].map((m) => m[1]!);
    patterns.push(...uses);
  }

  // uv workspaces: [tool.uv.workspace] members/exclude in the root pyproject.
  const py = readText(join(root, "pyproject.toml"));
  if (py) {
    patterns.push(...tomlArrayInSection(py, "tool.uv.workspace", "members"));
    patterns.push(...tomlArrayInSection(py, "tool.uv.workspace", "exclude").map((p) => `!${p}`));
  }

  // Composer: path repositories are how PHP monorepos wire local packages.
  const composer = parseJson(readText(join(root, "composer.json")));
  if (composer && Array.isArray(composer.repositories)) {
    for (const r of composer.repositories) {
      if (r && r.type === "path" && typeof r.url === "string") patterns.push(r.url);
    }
  }

  // Maven: <modules> in the root pom.
  const pom = readText(join(root, "pom.xml"));
  if (pom) {
    const block = /<modules>([\s\S]*?)<\/modules>/.exec(pom)?.[1];
    if (block) {
      for (const m of block.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)) patterns.push(m[1]!);
    }
  }

  // Gradle: include ":app", include(":lib:core") in settings.gradle(.kts);
  // Gradle project paths use ":" separators mapped onto directories.
  for (const f of ["settings.gradle", "settings.gradle.kts"]) {
    const gradle = readText(join(root, f));
    if (!gradle) continue;
    for (const line of gradle.split(/\r?\n/)) {
      if (!/^\s*include[\s(]/.test(line)) continue;
      for (const m of line.matchAll(/["']([^"']+)["']/g)) {
        patterns.push(m[1]!.replace(/^:/, "").replace(/:/g, "/"));
      }
    }
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

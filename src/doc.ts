import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { buildContext } from "./ask.js";
import { runSources } from "./sources/registry.js";
import { renderEvidenceMarkdown, SOURCE_ORDER } from "./dossier.js";
import { ensureOverview } from "./overview.js";
import { indexDir } from "./index/structural.js";
import { readText } from "./walk.js";
import { slugify } from "./util.js";
import { LIMITS } from "./config.js";
import type { AskOptions, DocPlan, DocSection, DossierMeta, EvidenceItem, RunContext, SourceKind, StructuralIndex, WorkspacePackage } from "./types.js";

// `ultradoc doc` generates a GROUNDED reference document. Like `ask`, the engine
// only retrieves — it builds a deterministic outline, grounds a dossier per
// section, and emits a fill-in worklist (DOC.todo.md + DOC.plan.json) plus one
// merged evidence.json. The model then writes the cited prose into DOC.md, which
// `check` validates exactly like an ANSWER.md. Nothing here writes prose; the
// JUDGEMENT and the writing are the model's.

// Default sources for a doc: the cheap, deterministic, offline-safe ones. The
// caller can override with --sources (e.g. to fold in issues/prs/web).
export const DEFAULT_DOC_SOURCES: SourceKind[] = ["code", "docs"];

// Test, spec, example, fixture and benchmark files — their symbols are NOT the
// project's public API. search.ts down-weights such *directories* in retrieval,
// but this must also catch the per-language *basename* conventions
// (foo_test.go, test_foo.py, foo.test.ts, foo.spec.js, index.test-d.ts) so a
// bare "public API" query isn't polluted by TestX / test_x identifiers.
function looksLikeTestFile(rel: string): boolean {
  if (/(^|\/)(tests?|__tests__|specs?|fixtures?|examples?|benchmarks?|e2e)\//i.test(rel)) return true;
  const base = (rel.split("/").pop() ?? "").toLowerCase();
  return /[._-](test|spec)(-d)?\.\w+$/.test(base) || /^(test|conftest)[_.]/.test(base);
}

// The most representative exported symbol names, best public surface first,
// optionally restricted to one package's subtree. Used to ground the API
// section on the project's actual identifiers rather than prose.
function topExportedSymbols(index: StructuralIndex, prefix: string | undefined, n: number): string[] {
  const byFile = new Map<string, number>();
  const names: string[] = [];
  const seen = new Set<string>();
  // Files with the richest exported surface first, then their symbols by line —
  // excluding test/example files, whose symbols aren't the public API.
  // Leading-underscore names (Python/JS `_private`, dunders like `__init__`)
  // are conventionally private, not public API.
  const isApi = (s: { exported: boolean; file: string; name: string }) => s.exported && !looksLikeTestFile(s.file) && !s.name.startsWith("_");
  for (const s of index.symbols) {
    if (!isApi(s)) continue;
    if (prefix && !s.file.startsWith(prefix + "/")) continue;
    byFile.set(s.file, (byFile.get(s.file) ?? 0) + 1);
  }
  const rankedFiles = [...byFile.keys()].sort((a, b) => (byFile.get(b) ?? 0) - (byFile.get(a) ?? 0) || a.localeCompare(b));
  for (const file of rankedFiles) {
    const syms = index.symbols.filter((s) => isApi(s) && s.file === file).sort((a, b) => a.line - b.line);
    for (const s of syms) {
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      names.push(s.name);
      if (names.length >= n) return names;
    }
  }
  return names;
}

// Deterministic project-type signals used to adapt the doc outline. Read from a
// few manifests + the symbol index — no LLM.
export interface ProjectTraits {
  isCli: boolean; // ships an executable (bin / [project.scripts] / [[bin]] / func main)
  isLib: boolean; // exposes an importable API (exported symbols)
  hasConfigSurface: boolean; // has configuration worth documenting
}

export function detectProjectTraits(repoDir: string, index: StructuralIndex): ProjectTraits {
  const bases = new Map(index.configFiles.map((f) => [f.split("/").pop()!.toLowerCase(), f]));
  const readCfg = (base: string): string => {
    const rel = bases.get(base);
    return rel ? readText(join(repoDir, rel)) : "";
  };

  let isCli = false;
  // Node: a package.json "bin" field.
  const pkg = readCfg("package.json");
  if (pkg) {
    try {
      if ((JSON.parse(pkg) as { bin?: unknown }).bin) isCli = true;
    } catch {
      if (/"bin"\s*:/.test(pkg)) isCli = true;
    }
  }
  // Python: a console-scripts table.
  if (/\[project\.scripts\]|\[tool\.poetry\.scripts\]/.test(readCfg("pyproject.toml"))) isCli = true;
  // Rust: an explicit binary target.
  if (/\[\[bin\]\]/.test(readCfg("cargo.toml"))) isCli = true;
  // Go / Rust / C: a program entry point among the extracted symbols.
  if (index.symbols.some((s) => s.name === "main" && (/\.go$/.test(s.file) || /(^|\/)main\.rs$/.test(s.file)))) isCli = true;

  const isLib = index.symbols.some((s) => s.exported && !s.name.startsWith("_"));

  const hasConfigSurface =
    bases.has(".env.example") ||
    index.configFiles.some((f) => /(^|\/)(config|settings)\.(json|ya?ml|toml|ini|js|ts)$/i.test(f)) ||
    index.symbols.some((s) => s.exported && /config|options?|settings/i.test(s.name)) ||
    index.configFiles.length > 0;

  return { isCli, isLib, hasConfigSurface };
}

// Build the deterministic documentation outline, adapted to the project type.
// Every section carries a retrieval query and the sources to ground it on;
// runDoc fills evidenceIds. A monorepo (unscoped) gets one section per package;
// otherwise a CLI gets a "Commands" section and a library gets "Public API".
export function buildOutline(index: StructuralIndex, name: string, scopePkg?: WorkspacePackage, traits?: ProjectTraits): Omit<DocSection, "evidenceIds">[] {
  const sections: Omit<DocSection, "evidenceIds">[] = [];
  let n = 0;
  const add = (title: string, query: string, sources: SourceKind[]) => sections.push({ id: `S${++n}`, title, query, sources });

  add("Overview", `${name} overview introduction purpose what is`, ["docs", "code"]);
  add("Installation & usage", `${name} install setup usage getting started example quickstart`, ["docs", "code"]);

  if (traits?.isCli) {
    add("Commands", `${name} command subcommand flags options usage help argv arguments`, ["code", "docs"]);
  }

  if (index.packages.length && !scopePkg) {
    // Monorepo: a section per workspace package (cap to keep the doc focused).
    for (const pkg of index.packages.slice(0, LIMITS.docPackages)) {
      const syms = topExportedSymbols(index, pkg.dir, 5);
      add(`Package: ${pkg.name}`, `${pkg.name} ${pkg.dir} ${syms.join(" ")}`.trim(), ["code", "docs"]);
    }
  } else if (traits ? traits.isLib : true) {
    // Library API — kept for any repo unless traits say it's a pure CLI.
    const syms = topExportedSymbols(index, scopePkg?.dir, 6);
    add("Public API", `${name} public API exports main entry ${syms.join(" ")}`.trim(), ["code", "docs"]);
  }

  // Configuration — skipped only when the project has no config surface at all.
  if (!traits || traits.hasConfigSurface) {
    add("Configuration", `${name} configuration options config settings environment flags`, ["code", "docs"]);
  }
  add("Architecture & internals", `${name} architecture design internals how it works module structure`, ["docs", "code"]);
  return sections;
}

type Item = Omit<EvidenceItem, "id">;
const dedupKey = (it: Item): string => `${it.source}|${it.ref}|${it.location ?? ""}|${(it.snippet ?? "").slice(0, 120)}`;
const sourceRank = (s: SourceKind): number => {
  const i = SOURCE_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
};

// Merge every section's retrieved items into ONE evidence list with stable
// global ids (canonical source order, best-scored first), deduping items that
// surface in multiple sections, and map each section to its (deduped, capped)
// evidence ids. One evidence.json is what `check` validates against DOC.md.
function mergeEvidence(perSection: { section: Omit<DocSection, "evidenceIds">; items: Item[] }[]): {
  evidence: EvidenceItem[];
  sectionIds: Map<string, string[]>;
} {
  const best = new Map<string, Item>();
  for (const { items } of perSection) {
    for (const it of items) {
      const k = dedupKey(it);
      const ex = best.get(k);
      if (!ex || it.score > ex.score) best.set(k, it);
    }
  }
  const flat = [...best.values()].sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref));
  const evidence: EvidenceItem[] = flat.map((it, i) => ({ id: `E${i + 1}`, ...it }));
  const idByKey = new Map(evidence.map((e) => [dedupKey(e), e.id] as const));

  const sectionIds = new Map<string, string[]>();
  for (const { section, items } of perSection) {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const it of [...items].sort((a, b) => b.score - a.score)) {
      const id = idByKey.get(dedupKey(it));
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    sectionIds.set(section.id, ids.slice(0, 10));
  }
  return { evidence, sectionIds };
}

// The model-facing worklist: every section, its grounded evidence (id · ref ·
// first snippet line), and the instruction to write cited prose into DOC.md.
function renderDocTodo(plan: DocPlan, evidence: EvidenceItem[]): string {
  const byId = new Map(evidence.map((e) => [e.id, e] as const));
  const out: string[] = [];
  out.push(`# Documentation worklist — ${plan.repo}${plan.commit ? ` @ ${plan.commit}` : ""}`);
  if (plan.pkg) out.push(`**Package:** ${plan.pkg}`);
  out.push("");
  out.push(
    `> Write the final document to \`DOC.md\` in this folder. Write each section below ` +
      `as grounded prose and **cite the evidence ids** ([E#]) — every factual claim needs a ` +
      `citation that resolves. Read \`EVIDENCE.md\` for the full snippets. If a section's ` +
      `evidence is thin, drill more (\`ultradoc code|docs --repo … --q …\`) or state the gap ` +
      `explicitly — never write from memory. Then run \`ultradoc check --run <dir>\`.`,
  );
  out.push("");
  for (const s of plan.sections) {
    out.push(`## ${s.id} · ${s.title}`);
    out.push(`_query:_ \`${s.query}\``);
    if (!s.evidenceIds.length) {
      out.push(`_evidence:_ none retrieved — drill this section or mark it an explicit unknown.`);
      out.push("");
      continue;
    }
    out.push(`_evidence:_ ${s.evidenceIds.map((id) => `[${id}]`).join(" ")}`);
    for (const id of s.evidenceIds) {
      const e = byId.get(id);
      if (!e) continue;
      const firstLine = (e.snippet ?? "").split("\n").find((l) => l.trim()) ?? e.title;
      out.push(`- [${id}] \`${e.ref}\` — ${firstLine.slice(0, 120)}`);
    }
    out.push("");
  }
  return out.join("\n");
}

export interface DocPaths {
  dir: string;
  evidenceJson: string;
  evidenceMd: string;
  planJson: string;
  todoMd: string;
  metaJson: string;
  overviewPath?: string;
}

export interface DocResult {
  dir: string;
  plan: DocPlan;
  evidence: EvidenceItem[];
  paths: DocPaths;
}

// Default location for a doc run: beside the clone under .ultradoc/doc/, scoped
// by package so per-package docs don't collide.
export function defaultDocDir(repoDir: string, scopePkg?: WorkspacePackage): string {
  const base = join(indexDir(repoDir), "doc");
  return scopePkg ? join(base, slugify(scopePkg.name)) : base;
}

// Run the full doc scaffold: clone+index once, retrieve a dossier per outline
// section, merge into one evidence set, and write the worklist. `sourcesOverride`
// (from an explicit --sources) replaces every section's default sources.
export async function runDoc(options: AskOptions, opts: { sourcesOverride?: SourceKind[] } = {}): Promise<DocResult> {
  const ctx = buildContext(options);
  const name = ctx.repoRef.repo ?? basename(ctx.repoDir);
  const traits = detectProjectTraits(ctx.repoDir, ctx.index);
  const outline = buildOutline(ctx.index, name, ctx.scopePkg, traits);

  // Ground each section independently (clone + index are cached; only retrieval
  // re-runs). Sections are independent, so retrieve them concurrently.
  const perSection = await Promise.all(
    outline.map(async (section) => {
      const sources = opts.sourcesOverride ?? section.sources;
      const sctx: RunContext = { ...ctx, options: { ...ctx.options, question: section.query, sources } };
      const results = await runSources(sctx);
      return {
        section,
        items: results.flatMap((r) => r.items),
        notes: results.flatMap((r) => r.notes),
      };
    }),
  );

  const { evidence, sectionIds } = mergeEvidence(perSection);
  const sections: DocSection[] = outline.map((s) => ({ ...s, evidenceIds: sectionIds.get(s.id) ?? [] }));
  const docNotes: string[] = [];
  if (!ctx.scopePkg && ctx.index.packages.length > LIMITS.docPackages) {
    docNotes.push(
      `This monorepo has ${ctx.index.packages.length} packages; sections cover the first ${LIMITS.docPackages}. Re-run \`doc --package <name>\` for the rest, or raise ULTRADOC_MAX_DOC_PACKAGES.`,
    );
  }
  // Report the sources actually retrieved (the override when --sources was
  // given), not each section's defaults — so meta.json and EVIDENCE.md don't
  // mislabel provenance.
  const usedSources = [...new Set(perSection.flatMap((p) => opts.sourcesOverride ?? p.section.sources))];

  const plan: DocPlan = {
    repo: ctx.repoRef.raw,
    host: ctx.repoRef.host,
    commit: ctx.index.commit,
    pkg: ctx.scopePkg?.name,
    builtAt: new Date().toISOString(),
    sections,
  };
  const meta: DossierMeta = {
    question: `Documentation: ${name}`,
    repo: ctx.repoRef.raw,
    host: ctx.repoRef.host,
    ref: options.ref,
    commit: ctx.index.commit,
    repoDir: ctx.repoDir,
    pkg: ctx.scopePkg?.name,
    sources: usedSources,
    semantic: options.semantic,
    evidenceCount: evidence.length,
    builtAt: plan.builtAt,
    notes: [...new Set([...docNotes, ...perSection.flatMap((p) => p.notes)])],
  };

  const dir = options.out ?? defaultDocDir(ctx.repoDir, ctx.scopePkg);
  mkdirSync(dir, { recursive: true });
  const evidenceJson = join(dir, "evidence.json");
  const evidenceMd = join(dir, "EVIDENCE.md");
  const planJson = join(dir, "DOC.plan.json");
  const todoMd = join(dir, "DOC.todo.md");
  const metaJson = join(dir, "meta.json");
  writeFileSync(evidenceJson, JSON.stringify(evidence, null, 2));
  writeFileSync(evidenceMd, renderEvidenceMarkdown(evidence, meta));
  writeFileSync(planJson, JSON.stringify(plan, null, 2));
  writeFileSync(todoMd, renderDocTodo(plan, evidence));
  writeFileSync(metaJson, JSON.stringify(meta, null, 2));

  // Refresh the navigation overview beside the doc so the model can orient and
  // refine sections; it is navigation, not citable evidence.
  let overviewPath: string | undefined;
  try {
    overviewPath = ensureOverview(ctx.index, ctx.repoRef, ctx.repoDir).path;
  } catch {
    /* overview is best-effort; the doc scaffold stands without it */
  }

  return { dir, plan, evidence, paths: { dir, evidenceJson, evidenceMd, planJson, todoMd, metaJson, overviewPath } };
}

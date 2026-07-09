import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, realpathSync } from "node:fs";
import { VERSION } from "./types.js";
import type { AskOptions, SourceKind, WebEngine, DossierMeta } from "./types.js";
import { runAsk, runSingleSource, buildContext } from "./ask.js";
import { runDoc } from "./doc.js";
import { renderEvidenceMarkdown } from "./dossier.js";
import { checkRun, formatCheckReport } from "./check.js";
import { runVerify, applyVerdicts, formatVerifyReport, VERIFY_MAX } from "./verify.js";
import { webFetchUrls } from "./sources/web.js";
import { assignIds } from "./dossier.js";
import { semanticControl } from "./index/semantic.js";
import { ensureOverview } from "./overview.js";
import { cacheStatus, cacheClean, formatCacheStatus } from "./cache.js";
import { PHASES, listPhases, orchestrateRun } from "./orchestrate.js";

const HELP = `ultradoc v${VERSION}
Answer ultra-precise questions about an open-source project from its real source
code, issues, PRs, docs and the web — grounded retrieval, not the model's memory.

Usage:
  ultradoc ask --repo <url|path> --q "<question>" [options]
  ultradoc code|issues|prs|docs|releases|history|discussions|so --repo <url|path> --q "<question>" [options]
  ultradoc web  --repo <url|path> [--q "<question>"] [--web-engine <e>] [--url <u,...>]
  ultradoc overview --repo <url|path> [--out <file>] [--refresh]
  ultradoc doc  --repo <url|path> [--package <p>] [--sources <list>] [--out <dir>]
  ultradoc index --repo <url|path> [--semantic] [--refresh]
  ultradoc check --run <dossier-dir> [--strict] [--coverage-min <0..1>] [--semantic [--allow-unverified]] [--answer <file>]
  ultradoc verify --run <dossier-dir> [--apply <verdicts.json>] [--answer <file>] [--max-verify <n>]
  ultradoc orchestrate --run <dossier-dir> [--phase drill|verify|doc] [--eco] [--list]
  ultradoc semantic up|down|status
  ultradoc cache status [--json] | cache clean (--all | --repo <url|path>)

Commands:
  ask        Retrieve from all selected sources and write an evidence dossier.
  code       Drill into code search only (prints evidence, writes nothing).
  issues     Drill into related issues.       prs   Drill into related PRs.
  docs       Drill into documentation.        so    Drill into StackOverflow.
  releases   Drill into release notes + changelog ("when was X added?").
  history    Drill into git history (pickaxe: "when/why did X change?").
  discussions  Drill into GitHub Discussions (needs the gh CLI).
  web        Discover + fetch web pages (keyless: SearXNG → DuckDuckGo → WebSearch).
  overview   Generate (once) a cached markdown digest of the repo — packages,
             layout, public API, docs map — to answer follow-up questions
             without re-indexing. Reused while the commit is unchanged.
  doc        Generate a GROUNDED reference doc: a deterministic outline +
             one dossier per section + a DOC.todo worklist to fill into DOC.md
             (cited, then validated by 'check'). Persists under .ultradoc/doc/.
  index      Build/refresh the structural index for a repo and print stats.
  check      Validate ANSWER.md (or a doc run's DOC.md) against a dossier's
             evidence.json: every citation must resolve AND enough claims must be
             cited (--strict requires all; --coverage-min tunes the threshold).
             --semantic also gates on verify's verdicts and FAILS when no
             VERIFY.json exists (--allow-unverified downgrades to a warning).
  verify     Emit a claim↔evidence worklist for adversarial support-checking,
             then (--apply <verdicts.json>) gate on refuted/unsupported claims.
  orchestrate  Emit the run's multi-agent orchestration from its CURRENT
             worklists (drill-plan.json, VERIFY.todo.json, DOC.plan.json):
             one launchable workflow per ready phase + the agents/<role>.md
             dispatch contracts + a sequential RUNBOOK.md fallback, under
             <run>/orchestration/. Subagents RETURN fragments; the folds
             (verdicts.json, ANSWER.md/DOC.md) stay with the orchestrator.
  semantic   Manage the optional local Docker stack (Qdrant + embeddings + SearXNG).
  cache      Inspect (status) or clear (clean) the persistent clone/index cache.

Options:
  --repo <url|path>    Any git URL or a local checkout              (required)
  --q, --question <s>  The question to answer                       (required for ask/drill)
  --sources <list>     code,issues,prs,docs,releases,history,discussions,web,so
                                                     (default: code,issues,prs,docs)
  --ref <branch>       Branch/tag/commit to clone                   (default: default branch)
  --package <p>        Monorepo: scope code/docs retrieval to one workspace
                       package (name like @scope/web, short name, or dir)
  --docs-url <url>     Official docs page to fetch + ground against
  --web-engine <e>     auto | searxng | ddg | claude                (default: auto)
  --url <u,...>        For 'web': specific page(s) to fetch + ground
  --per-source <n>     Max evidence items kept per source           (default: 6)
  --out <dir>          Dossier output dir   (default: <clone>/.ultradoc/runs/<id>)
  --run <dir>          For 'check'/'verify': the dossier dir to validate (also --out)
  --answer <file>      For 'check'/'verify': answer file to validate inside --run
                                       (default: ANSWER.md, else DOC.md)
  --max-verify <n>     For 'verify': cap how many claim↔evidence pairs to emit  (default: 40)
  --phase <name>       For 'orchestrate': emit one phase only — drill | verify | doc
                       (exit 2 when its worklist does not exist yet)
  --eco                For 'orchestrate': emit only RUNBOOK.md + agents/*.md — the
                       explicit sequential low-token path (no workflow scripts)
  --list               For 'orchestrate': print the phases + readiness as JSON
  --strict             For 'check': require EVERY claim to be cited (coverage 100%)
  --coverage-min <r>   For 'check': min fraction of claims that must cite [0..1] (default: 0.7)
  --semantic           Use the optional local vector backend (falls back if absent)
  --refresh            Force re-clone and re-index
  --json               Machine-readable output
  -h, --help           Show this help
  -v, --version        Show version

Grounding:
  'ask' writes EVIDENCE.md + evidence.json. Write your answer to ANSWER.md in the
  same folder, citing evidence ids like [E1]. Then run:
    ultradoc check --run <dossier-dir>
  It fails if any citation does not resolve to retrieved evidence, or if too much
  prose is uncited — the mechanical guard against answering from memory.

Environment (all optional, keyless by default):
  GITHUB_TOKEN               Raise the GitHub REST rate limit on the keyless fallback.
  GITLAB_TOKEN               Read private GitLab projects / lift limits (PRIVATE-TOKEN).
  ULTRADOC_CACHE_DIR         Override the clone/index cache root (persistent per-user).
  ULTRADOC_EXTDOCS_TTL_HOURS External-docs cache freshness before refetch (default 168).
  ULTRADOC_MAX_FILES, …      Raise index/scan/retrieval caps (see references).
`;

const COMMANDS = new Set([
  "ask",
  "code",
  "issues",
  "prs",
  "docs",
  "releases",
  "history",
  "discussions",
  "so",
  "web",
  "overview",
  "doc",
  "index",
  "check",
  "verify",
  "orchestrate",
  "semantic",
  "cache",
]);
const VALUE_FLAGS = new Set([
  "repo",
  "q",
  "question",
  "sources",
  "ref",
  "docs-url",
  "web-engine",
  "url",
  "per-source",
  "out",
  "run",
  "package",
  "apply",
  "max-verify",
  "answer",
  "coverage-min",
  "phase",
]);
const BOOL_FLAGS = new Set(["semantic", "json", "refresh", "strict", "all", "allow-unverified", "eco", "list"]);

function fail(message: string): never {
  process.stderr.write(`ultradoc: ${message}\n`);
  process.exit(1);
}

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) {
    fail(`invalid --${name} "${value}" (expected: ${allowed.join(", ")})`);
  }
  return value as T;
}

interface Parsed {
  command: string;
  positional: string[];
  values: Record<string, string>;
  bools: Set<string>;
}

export function parseArgs(argv: string[]): Parsed {
  if (argv.length === 0) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  // Global -h/-v work in any position.
  if (argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (argv[0] === "-v" || argv[0] === "--version") {
    process.stdout.write(VERSION + "\n");
    process.exit(0);
  }

  const command = argv[0]!;
  if (!COMMANDS.has(command)) {
    fail(`unknown command: ${command} (run --help for usage)`);
  }

  const values: Record<string, string> = {};
  const bools = new Set<string>();
  const positional: string[] = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP);
      process.exit(0);
    }
    if (arg === "-v" || arg === "--version") {
      process.stdout.write(VERSION + "\n");
      process.exit(0);
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const key = eq !== -1 ? arg.slice(2, eq) : arg.slice(2);
      if (BOOL_FLAGS.has(key)) {
        if (eq !== -1) fail(`--${key} is a boolean flag and does not take a value`);
        bools.add(key);
        continue;
      }
      if (!VALUE_FLAGS.has(key)) {
        fail(`unknown flag: --${key} (run --help for the supported options)`);
      }
      let value: string;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        // The next token is the value unless it's itself a flag. `--` (and any
        // `--foo`) is a flag marker, never a value — pass a leading-dash value
        // with `--key=value` instead.
        if (next === undefined || next.startsWith("--")) {
          fail(`missing value for --${key}`);
        }
        value = next;
        i++;
      }
      values[key] = value;
      continue;
    }
    positional.push(arg);
  }
  return { command, positional, values, bools };
}

const SOURCE_TOKENS: Record<string, SourceKind> = {
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
const DEFAULT_SOURCES: SourceKind[] = ["code", "issue", "pr", "docs"];

function parseSources(s: string): SourceKind[] {
  const out: SourceKind[] = [];
  for (const t of s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)) {
    const k = SOURCE_TOKENS[t.toLowerCase()];
    if (!k) fail(`unknown source "${t}" (use: code,issues,prs,docs,releases,history,discussions,web,so)`);
    if (!out.includes(k)) out.push(k);
  }
  if (out.length === 0) fail("--sources resolved to nothing");
  return out;
}

function buildAskOptions(p: Parsed, opts: { requireQuestion?: boolean } = {}): AskOptions {
  const repo = p.values.repo;
  if (!repo) fail("missing --repo <url|path>");
  const question = p.values.q ?? p.values.question ?? "";
  if (opts.requireQuestion !== false && !question) fail('missing --q "<question>"');

  const sources = p.values.sources ? parseSources(p.values.sources) : DEFAULT_SOURCES;
  const perSource = p.values["per-source"] ? Number(p.values["per-source"]) : 6;
  if (!Number.isFinite(perSource) || perSource <= 0) fail("invalid --per-source");
  const webEngine = oneOf<WebEngine>("web-engine", p.values["web-engine"] ?? "auto", ["auto", "searxng", "ddg", "claude"]);

  return {
    repo,
    question,
    sources,
    ref: p.values.ref,
    docsUrl: p.values["docs-url"],
    pkg: p.values.package,
    out: p.values.out ? resolve(p.values.out) : undefined,
    semantic: p.bools.has("semantic"),
    webEngine,
    perSource,
    json: p.bools.has("json"),
    refresh: p.bools.has("refresh"),
  };
}

// Render single-source drill-down evidence (no dossier written).
function printEvidence(p: Parsed, evidence: Parameters<typeof renderEvidenceMarkdown>[0], meta: DossierMeta): void {
  if (p.bools.has("json")) {
    process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
  } else {
    process.stdout.write(renderEvidenceMarkdown(evidence, meta) + "\n");
  }
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  const p = parseArgs(argv);

  switch (p.command) {
    case "ask": {
      const opts = buildAskOptions(p);
      const r = await runAsk(opts);
      if (opts.json) {
        process.stdout.write(JSON.stringify({ dir: r.dir, meta: r.meta }, null, 2) + "\n");
        return;
      }
      const bySource = r.meta.sources.map((s) => `${s}: ${r.evidence.filter((e) => e.source === s).length}`);
      const lines = [
        `ultradoc: ${r.evidence.length} evidence item(s) for "${opts.question}"`,
        `  repo:     ${r.meta.repo}${r.meta.commit ? ` @ ${r.meta.commit}` : ""} (${r.meta.host})`,
        `  sources:  ${bySource.join(" · ")}`,
        ...(r.meta.notes.length ? [`  notes:    ${r.meta.notes.length} (see EVIDENCE.md)`] : []),
        `  dossier:  ${r.dir}`,
        `  next:     read ${r.paths.evidenceMd}, write ANSWER.md (cite [E#]), then:`,
        `            ultradoc check --run ${r.dir}`,
      ];
      process.stderr.write(lines.join("\n") + "\n");
      return;
    }

    case "code":
    case "issues":
    case "prs":
    case "docs":
    case "releases":
    case "history":
    case "discussions":
    case "so": {
      const kindMap: Record<string, SourceKind> = {
        code: "code",
        issues: "issue",
        prs: "pr",
        docs: "docs",
        releases: "release",
        history: "history",
        discussions: "discussion",
        so: "so",
      };
      const kind = kindMap[p.command]!;
      const opts = buildAskOptions(p);
      const { ctx, evidence, notes } = await runSingleSource(opts, kind);
      const meta: DossierMeta = {
        question: opts.question,
        repo: ctx.repoRef.raw,
        host: ctx.repoRef.host,
        ref: opts.ref,
        commit: ctx.index.commit,
        sources: [kind],
        semantic: opts.semantic,
        evidenceCount: evidence.length,
        builtAt: new Date().toISOString(),
        notes,
      };
      printEvidence(p, evidence, meta);
      return;
    }

    case "web": {
      const opts = buildAskOptions(p, { requireQuestion: !p.values.url });
      if (p.values.url) {
        const urls = p.values.url
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean);
        const q = opts.question || urls.join(" ");
        const { items, notes } = await webFetchUrls(urls, q, opts.perSource);
        const evidence = assignIds([{ source: "web", items, notes }]);
        const meta: DossierMeta = {
          question: q,
          repo: opts.repo,
          host: "web",
          sources: ["web"],
          semantic: false,
          evidenceCount: evidence.length,
          builtAt: new Date().toISOString(),
          notes,
        };
        printEvidence(p, evidence, meta);
        return;
      }
      const { ctx, evidence, notes } = await runSingleSource(opts, "web");
      const meta: DossierMeta = {
        question: opts.question,
        repo: ctx.repoRef.raw,
        host: ctx.repoRef.host,
        ref: opts.ref,
        commit: ctx.index.commit,
        sources: ["web"],
        semantic: opts.semantic,
        evidenceCount: evidence.length,
        builtAt: new Date().toISOString(),
        notes,
      };
      printEvidence(p, evidence, meta);
      return;
    }

    case "overview": {
      const opts = buildAskOptions(p, { requireQuestion: false });
      const ctx = buildContext(opts);
      const r = ensureOverview(ctx.index, ctx.repoRef, ctx.repoDir, {
        refresh: opts.refresh,
        out: opts.out,
      });
      if (opts.json) {
        process.stdout.write(
          JSON.stringify(
            {
              path: r.path,
              cached: r.cached,
              commit: ctx.index.commit,
              packages: ctx.index.packages,
              fileCount: ctx.index.fileCount,
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }
      const lines = [
        `ultradoc: overview ${r.cached ? "reused (commit unchanged)" : "generated"} for ${ctx.repoRef.raw}${ctx.index.commit ? ` @ ${ctx.index.commit}` : ""}`,
        ...(ctx.index.packages.length ? [`  packages: ${ctx.index.packages.length} workspace package(s) — scope questions with --package`] : []),
        `  file:     ${r.path}`,
        `  next:     read it to navigate the repo; ground answers via 'ultradoc ask'.`,
      ];
      process.stderr.write(lines.join("\n") + "\n");
      return;
    }

    case "doc": {
      const opts = buildAskOptions(p, { requireQuestion: false });
      // Only override per-section sources when --sources was given explicitly;
      // otherwise each section keeps its natural defaults (code/docs).
      const sourcesOverride = p.values.sources ? parseSources(p.values.sources) : undefined;
      const r = await runDoc(opts, { sourcesOverride });
      if (opts.json) {
        process.stdout.write(JSON.stringify({ dir: r.dir, plan: r.plan }, null, 2) + "\n");
        return;
      }
      const lines = [
        `ultradoc: doc scaffold — ${r.plan.sections.length} section(s), ${r.evidence.length} evidence item(s)`,
        `  repo:     ${r.plan.repo}${r.plan.commit ? ` @ ${r.plan.commit}` : ""}${r.plan.pkg ? ` · package: ${r.plan.pkg}` : ""}`,
        `  sections: ${r.plan.sections.map((s) => s.title).join(" · ")}`,
        `  dir:      ${r.dir}`,
        `  next:     read ${r.paths.todoMd} + EVIDENCE.md, write DOC.md (cite [E#]), then:`,
        `            ultradoc check --run ${r.dir}`,
      ];
      process.stderr.write(lines.join("\n") + "\n");
      return;
    }

    case "index": {
      const opts = buildAskOptions(p, { requireQuestion: false });
      const ctx = buildContext(opts);
      const langs = Object.entries(ctx.index.languages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => `${k}:${v}`);
      if (opts.json) {
        process.stdout.write(
          JSON.stringify(
            {
              repo: ctx.repoRef.raw,
              dir: ctx.repoDir,
              commit: ctx.index.commit,
              fileCount: ctx.index.fileCount,
              symbols: ctx.index.symbols.length,
              docFiles: ctx.index.docFiles.length,
              configFiles: ctx.index.configFiles.length,
              docsRoot: ctx.index.docsRoot,
              docsUrl: ctx.index.docsUrl,
              packages: ctx.index.packages,
              languages: ctx.index.languages,
              stats: ctx.index.stats,
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }
      const st = ctx.index.stats;
      const truncated = st?.truncated ? ` · ⚠ truncated at ${ctx.index.fileCount} files (raise ULTRADOC_MAX_FILES)` : "";
      const lines = [
        `ultradoc: indexed ${ctx.repoRef.raw}${ctx.index.commit ? ` @ ${ctx.index.commit}` : ""}`,
        `  path:     ${ctx.repoDir}`,
        `  files:    ${ctx.index.fileCount} · symbols: ${ctx.index.symbols.length} · docs: ${ctx.index.docFiles.length} · config: ${ctx.index.configFiles.length}${truncated}`,
        `  langs:    ${langs.join(" · ")}`,
        ...(ctx.index.docsRoot ? [`  docsRoot: ${ctx.index.docsRoot}/`] : []),
        ...(ctx.index.docsUrl ? [`  docsUrl:  ${ctx.index.docsUrl} (auto-discovered)`] : []),
        ...(ctx.index.packages.length
          ? [
              `  packages: ${ctx.index.packages
                .slice(0, 8)
                .map((x) => x.name)
                .join(" · ")}${ctx.index.packages.length > 8 ? ` · +${ctx.index.packages.length - 8} more` : ""}`,
            ]
          : []),
      ];
      process.stderr.write(lines.join("\n") + "\n");
      return;
    }

    case "check": {
      const dir = p.values.run ?? p.values.out;
      if (!dir) fail("missing --run <dossier-dir>");
      let coverageMin: number | undefined;
      if (p.values["coverage-min"] !== undefined) {
        coverageMin = Number(p.values["coverage-min"]);
        if (!Number.isFinite(coverageMin) || coverageMin < 0 || coverageMin > 1) fail("invalid --coverage-min (expected a number in [0,1])");
      }
      const res = checkRun(resolve(dir), {
        semantic: p.bools.has("semantic"),
        answerFile: p.values.answer,
        strict: p.bools.has("strict"),
        coverageMin,
        allowUnverified: p.bools.has("allow-unverified"),
      });
      if (p.bools.has("json")) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      else process.stdout.write(formatCheckReport(res, resolve(dir)) + "\n");
      if (!res.ok) process.exit(1);
      return;
    }

    case "verify": {
      const dir = p.values.run ?? p.values.out;
      if (!dir) fail("missing --run <dossier-dir>");
      const rdir = resolve(dir);
      if (p.values.apply) {
        // A relative verdicts path resolves against the run dir (where the
        // verdicts file lives), not the process cwd; absolute paths pass through.
        const result = applyVerdicts(rdir, resolve(rdir, p.values.apply));
        if (p.bools.has("json")) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        else process.stdout.write(formatVerifyReport(result) + "\n");
        if (!result.ok) process.exit(1);
        return;
      }
      const maxVerify = p.values["max-verify"] ? Number(p.values["max-verify"]) : VERIFY_MAX;
      if (!Number.isFinite(maxVerify) || maxVerify <= 0) fail("invalid --max-verify");
      const wl = runVerify(rdir, { maxVerify, answerFile: p.values.answer });
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(wl, null, 2) + "\n");
        return;
      }
      process.stderr.write(
        `ultradoc: ${wl.pairs.length} claim↔evidence pair(s) → ${rdir}/VERIFY.md & VERIFY.todo.json\n` +
          `  adjudicate each verdict, save as verdicts.json, then: ultradoc verify --apply verdicts.json --run ${rdir}\n`,
      );
      return;
    }

    case "orchestrate": {
      // Family invariant: missing --run / unknown phase / not-ready phase exit 2,
      // and the error names the exact engine command that produces the worklist.
      const dir = p.values.run ?? p.values.out;
      if (!dir) {
        process.stderr.write("ultradoc orchestrate: --run <dir> is required (the run dir holding the worklists).\n");
        process.exit(2);
      }
      const engineAbs = realpathSync(fileURLToPath(import.meta.url));
      if (p.bools.has("list")) {
        if (!existsSync(dir)) {
          process.stderr.write(`ultradoc orchestrate: run dir not found: ${dir}.\n`);
          process.exit(2);
        }
        process.stdout.write(JSON.stringify({ phases: listPhases(resolve(dir), engineAbs) }, null, 2) + "\n");
        return;
      }
      const res = orchestrateRun(resolve(dir), engineAbs, {
        phase: p.values.phase,
        eco: p.bools.has("eco"),
      });
      if (res.exitCode !== 0) {
        for (const e of res.errors) process.stderr.write(`ultradoc orchestrate: ${e}\n`);
        process.exit(res.exitCode);
      }
      process.stdout.write("ultradoc orchestrate: generated\n");
      for (const w of res.written) process.stdout.write(`  ${w}\n`);
      for (const n of res.notices) process.stderr.write(`ultradoc orchestrate: note — ${n}\n`);
      const workflows = res.written.filter((w) => w.endsWith(".workflow.mjs"));
      if (workflows.length) {
        process.stdout.write("\n");
        for (const w of workflows) process.stdout.write(`Launch: Workflow({ scriptPath: ${JSON.stringify(w)} })\n`);
        process.stdout.write(
          "Then fold the returned fragments yourself (verdicts.json / ANSWER.md / DOC.md) and run the gate shown at the end of each workflow — you stay the sole writer.\n",
        );
      } else {
        process.stdout.write(`Follow ${join(resolve(dir), "orchestration", "RUNBOOK.md")} sequentially (the eco path).\n`);
        // Surface the valid phase names once, so a scripted caller can discover them without --help.
        if (p.values.phase === undefined && !p.bools.has("eco")) {
          process.stderr.write(`ultradoc orchestrate: no ready phase — phases are ${PHASES.join(", ")} (see --list).\n`);
        }
      }
      return;
    }

    case "semantic": {
      const action = p.positional[0] ?? "status";
      const r = semanticControl(action);
      process.stdout.write(r.message + "\n");
      if (r.code !== 0) process.exit(r.code);
      return;
    }

    case "cache": {
      const action = p.positional[0] ?? "status";
      if (action === "status") {
        const s = cacheStatus();
        if (p.bools.has("json")) process.stdout.write(JSON.stringify(s, null, 2) + "\n");
        else process.stdout.write(formatCacheStatus(s) + "\n");
        return;
      }
      if (action === "clean") {
        if (!p.bools.has("all") && !p.values.repo) fail("cache clean needs --all or --repo <url|path>");
        const { removed } = cacheClean({ all: p.bools.has("all"), repo: p.values.repo });
        process.stdout.write(`ultradoc: removed ${removed.length} cached repo(s)${removed.length ? ": " + removed.join(", ") : ""}\n`);
        return;
      }
      fail(`unknown cache action "${action}" (use: status | clean)`);
      return;
    }
  }
}

// Only run when invoked directly (node scripts/ultradoc.mjs), not when imported
// by tests. Compare realpaths: Node canonicalizes import.meta.url but leaves
// process.argv[1] as-typed, so on a symlinked path (e.g. macOS /tmp →
// /private/tmp, or a globally-linked skill folder) a raw URL compare silently
// fails and main() never runs. Realpath both sides, then fall back to the URL
// compare.
function isInvokedDirectly(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    if (realpathSync(argv1) === realpathSync(modulePath)) return true;
  } catch {
    /* a path may be virtual — fall through */
  }
  return import.meta.url === pathToFileURL(argv1).href;
}

if (isInvokedDirectly()) {
  run().catch((e) => fail((e as Error).message));
}

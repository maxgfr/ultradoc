import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { VERSION } from "./types.js";
import type { AskOptions, SourceKind, WebEngine, DossierMeta } from "./types.js";
import { runAsk, runSingleSource, buildContext } from "./ask.js";
import { renderEvidenceMarkdown } from "./dossier.js";
import { checkRun, formatCheckReport } from "./check.js";
import { webFetchUrls } from "./sources/web.js";
import { assignIds } from "./dossier.js";
import { semanticControl } from "./index/semantic.js";
import { ensureOverview } from "./overview.js";

const HELP = `ultradoc v${VERSION}
Answer ultra-precise questions about an open-source project from its real source
code, issues, PRs, docs and the web — grounded retrieval, not the model's memory.

Usage:
  ultradoc ask --repo <url|path> --q "<question>" [options]
  ultradoc code|issues|prs|docs|so --repo <url|path> --q "<question>" [options]
  ultradoc web  --repo <url|path> [--q "<question>"] [--web-engine <e>] [--url <u,...>]
  ultradoc overview --repo <url|path> [--out <file>] [--refresh]
  ultradoc index --repo <url|path> [--semantic] [--refresh]
  ultradoc check --run <dossier-dir>
  ultradoc semantic up|down|status

Commands:
  ask        Retrieve from all selected sources and write an evidence dossier.
  code       Drill into code search only (prints evidence, writes nothing).
  issues     Drill into related issues.       prs   Drill into related PRs.
  docs       Drill into documentation.        so    Drill into StackOverflow.
  web        Discover + fetch web pages (keyless: SearXNG → DuckDuckGo → WebSearch).
  overview   Generate (once) a cached markdown digest of the repo — packages,
             layout, public API, docs map — to answer follow-up questions
             without re-indexing. Reused while the commit is unchanged.
  index      Build/refresh the structural index for a repo and print stats.
  check      Validate ANSWER.md citations against a dossier's evidence.json.
  semantic   Manage the optional local Docker stack (Qdrant + embeddings + SearXNG).

Options:
  --repo <url|path>    Any git URL or a local checkout              (required)
  --q, --question <s>  The question to answer                       (required for ask/drill)
  --sources <list>     code,issues,prs,docs,web,so   (default: code,issues,prs,docs)
  --ref <branch>       Branch/tag/commit to clone                   (default: default branch)
  --package <p>        Monorepo: scope code/docs retrieval to one workspace
                       package (name like @scope/web, short name, or dir)
  --docs-url <url>     Official docs page to fetch + ground against
  --web-engine <e>     auto | searxng | ddg | claude                (default: auto)
  --url <u,...>        For 'web': specific page(s) to fetch + ground
  --per-source <n>     Max evidence items kept per source           (default: 6)
  --out <dir>          Dossier output dir          (default: /tmp/ultradoc/<slug>/runs/<id>)
  --run <dir>          For 'check': the dossier dir to validate (also accepts --out)
  --semantic           Use the optional local vector backend (falls back if absent)
  --refresh            Force re-clone and re-index
  --json               Machine-readable output
  -h, --help           Show this help
  -v, --version        Show version

Grounding:
  'ask' writes EVIDENCE.md + evidence.json. Write your answer to ANSWER.md in the
  same folder, citing evidence ids like [E1]. Then run:
    ultradoc check --run <dossier-dir>
  It fails if any citation does not resolve to retrieved evidence — the
  mechanical guard against answering from memory.
`;

const COMMANDS = new Set([
  "ask", "code", "issues", "prs", "docs", "so", "web", "overview", "index", "check", "semantic",
]);
const VALUE_FLAGS = new Set([
  "repo", "q", "question", "sources", "ref", "docs-url", "web-engine", "url", "per-source",
  "out", "run", "package",
]);
const BOOL_FLAGS = new Set(["semantic", "json", "refresh"]);

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
  issue: "issue", issues: "issue",
  pr: "pr", prs: "pr", "pull-requests": "pr", "merge-requests": "pr",
  doc: "docs", docs: "docs",
  web: "web",
  so: "so", stackoverflow: "so",
};
const DEFAULT_SOURCES: SourceKind[] = ["code", "issue", "pr", "docs"];

function parseSources(s: string): SourceKind[] {
  const out: SourceKind[] = [];
  for (const t of s.split(",").map((x) => x.trim()).filter(Boolean)) {
    const k = SOURCE_TOKENS[t.toLowerCase()];
    if (!k) fail(`unknown source "${t}" (use: code,issues,prs,docs,web,so)`);
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
  const webEngine = oneOf<WebEngine>("web-engine", p.values["web-engine"] ?? "auto", [
    "auto", "searxng", "ddg", "claude",
  ]);

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

async function main(): Promise<void> {
  const p = parseArgs(process.argv.slice(2));

  switch (p.command) {
    case "ask": {
      const opts = buildAskOptions(p);
      const r = await runAsk(opts);
      if (opts.json) {
        process.stdout.write(JSON.stringify({ dir: r.dir, meta: r.meta }, null, 2) + "\n");
        return;
      }
      const bySource = r.meta.sources.map(
        (s) => `${s}: ${r.evidence.filter((e) => e.source === s).length}`,
      );
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
    case "so": {
      const kindMap: Record<string, SourceKind> = {
        code: "code", issues: "issue", prs: "pr", docs: "docs", so: "so",
      };
      const kind = kindMap[p.command]!;
      const opts = buildAskOptions(p);
      const { ctx, evidence, notes } = await runSingleSource(opts, kind);
      const meta: DossierMeta = {
        question: opts.question, repo: ctx.repoRef.raw, host: ctx.repoRef.host,
        ref: opts.ref, commit: ctx.index.commit, sources: [kind], semantic: opts.semantic,
        evidenceCount: evidence.length, builtAt: new Date().toISOString(), notes,
      };
      printEvidence(p, evidence, meta);
      return;
    }

    case "web": {
      const opts = buildAskOptions(p, { requireQuestion: !p.values.url });
      if (p.values.url) {
        const urls = p.values.url.split(",").map((u) => u.trim()).filter(Boolean);
        const q = opts.question || urls.join(" ");
        const { items, notes } = await webFetchUrls(urls, q, opts.perSource);
        const evidence = assignIds([{ source: "web", items, notes }]);
        const meta: DossierMeta = {
          question: q, repo: opts.repo, host: "web", sources: ["web"],
          semantic: false, evidenceCount: evidence.length, builtAt: new Date().toISOString(), notes,
        };
        printEvidence(p, evidence, meta);
        return;
      }
      const { ctx, evidence, notes } = await runSingleSource(opts, "web");
      const meta: DossierMeta = {
        question: opts.question, repo: ctx.repoRef.raw, host: ctx.repoRef.host, ref: opts.ref,
        commit: ctx.index.commit, sources: ["web"], semantic: opts.semantic,
        evidenceCount: evidence.length, builtAt: new Date().toISOString(), notes,
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
              path: r.path, cached: r.cached, commit: ctx.index.commit,
              packages: ctx.index.packages, fileCount: ctx.index.fileCount,
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }
      const lines = [
        `ultradoc: overview ${r.cached ? "reused (commit unchanged)" : "generated"} for ${ctx.repoRef.raw}${ctx.index.commit ? ` @ ${ctx.index.commit}` : ""}`,
        ...(ctx.index.packages.length
          ? [`  packages: ${ctx.index.packages.length} workspace package(s) — scope questions with --package`]
          : []),
        `  file:     ${r.path}`,
        `  next:     read it to navigate the repo; ground answers via 'ultradoc ask'.`,
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
              repo: ctx.repoRef.raw, dir: ctx.repoDir, commit: ctx.index.commit,
              fileCount: ctx.index.fileCount, symbols: ctx.index.symbols.length,
              docFiles: ctx.index.docFiles.length, configFiles: ctx.index.configFiles.length,
              docsRoot: ctx.index.docsRoot, docsUrl: ctx.index.docsUrl,
              packages: ctx.index.packages,
              languages: ctx.index.languages,
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }
      const lines = [
        `ultradoc: indexed ${ctx.repoRef.raw}${ctx.index.commit ? ` @ ${ctx.index.commit}` : ""}`,
        `  path:     ${ctx.repoDir}`,
        `  files:    ${ctx.index.fileCount} · symbols: ${ctx.index.symbols.length} · docs: ${ctx.index.docFiles.length} · config: ${ctx.index.configFiles.length}`,
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
      const res = checkRun(resolve(dir));
      process.stdout.write(formatCheckReport(res, resolve(dir)) + "\n");
      if (!res.ok) process.exit(1);
      return;
    }

    case "semantic": {
      const action = p.positional[0] ?? "status";
      const r = semanticControl(action);
      process.stdout.write(r.message + "\n");
      if (r.code !== 0) process.exit(r.code);
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
  main().catch((e) => fail((e as Error).message));
}

#!/usr/bin/env node
// Retrieval evaluation harness. Runs `ask` on a set of (repo, question,
// expected-evidence) cases and scores whether the expected refs surface in the
// dossier, and how high. Zero-dependency, never bundled, never published.
//
//   node evals/run.mjs --suite offline|network|all [--filter <substr>] [--json] [--keep]
//
// Offline cases run against tests/fixtures (deterministic — a failure is a
// regression and exits non-zero). Network cases hit real repos and drift with
// upstream, so they are report-only and always exit 0.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const SUITE = arg("suite", "offline");
const FILTER = arg("filter", "");
const AS_JSON = process.argv.includes("--json");
const KEEP = process.argv.includes("--keep");
const BUNDLE = resolve(ROOT, arg("bundle", "scripts/ultradoc.mjs"));

function loadCases(suite) {
  const dir = join(ROOT, "evals", "cases", suite);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const cases = [];
  for (const f of files.sort()) {
    const parsed = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const c of Array.isArray(parsed) ? parsed : [parsed]) {
      cases.push({ ...c, suite });
    }
  }
  return cases;
}

function runCase(c, outRoot) {
  const out = join(outRoot, c.id);
  const mode = c.mode ?? "ask";
  const a = c.args ?? {};
  // `doc` generates a whole-repo reference dossier (no --q); it writes the same
  // evidence.json the expect[] scoring reads, so doc and ask share this runner.
  const args =
    mode === "doc"
      ? [BUNDLE, "doc", "--repo", c.repo, "--out", out, "--json"]
      : [BUNDLE, "ask", "--repo", c.repo, "--q", c.question, "--out", out, "--json"];
  // ask always passes sources (default code,docs); doc keeps its per-section
  // defaults unless a case overrides them.
  if (mode === "doc") {
    if (a.sources) args.push("--sources", a.sources);
  } else {
    args.push("--sources", a.sources ?? "code,docs");
  }
  if (a.package) args.push("--package", a.package);
  if (a.perSource) args.push("--per-source", String(a.perSource));
  if (a.docsUrl) args.push("--docs-url", a.docsUrl);
  if (a.ref) args.push("--ref", a.ref);

  const started = Date.now();
  const res = spawnSync("node", args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: c.suite === "network" ? 600_000 : 120_000,
  });
  const ms = Date.now() - started;
  if (res.status !== 0) {
    return { id: c.id, ok: false, ms, error: (res.stderr || res.stdout || `${mode} failed`).trim().slice(0, 300), expects: [] };
  }

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(join(out, "evidence.json"), "utf8"));
  } catch (e) {
    return { id: c.id, ok: false, ms, error: `no evidence.json: ${e.message}`, expects: [] };
  }

  const expects = (c.expect ?? []).map((ex) => {
    // Items are already ranked within each source; rank = position among the
    // items of the expected source (or among all items when no source given).
    const pool = ex.source ? evidence.filter((i) => i.source === ex.source) : evidence;
    // Negative assertion: the ref must NOT appear (proves e.g. --package scoping
    // doesn't leak sibling packages). Excluded from recall/MRR aggregates.
    if (ex.mustNotInclude) {
      const hit = pool.some((i) => i.ref.includes(ex.mustNotInclude));
      return { ...ex, negate: true, found: hit, rank: null, ok: !hit, mrr: 0 };
    }
    const matches = (i) =>
      (ex.refIncludes && i.ref.includes(ex.refIncludes)) ||
      (ex.refPattern && new RegExp(ex.refPattern, "i").test(i.ref));
    const rank = pool.findIndex(matches);
    const found = rank >= 0;
    const inTopN = found && (ex.topN === undefined || rank < ex.topN);
    return { ...ex, found, rank: found ? rank + 1 : null, ok: inTopN, mrr: found ? 1 / (rank + 1) : 0 };
  });

  // doc mode: assert the plan produced the expected section headings.
  let sections = [];
  if (mode === "doc" && (c.expectSections ?? []).length) {
    let plan;
    try {
      plan = JSON.parse(readFileSync(join(out, "DOC.plan.json"), "utf8"));
    } catch {
      plan = { sections: [] };
    }
    const titles = (plan.sections ?? []).map((s) => String(s.title).toLowerCase());
    sections = c.expectSections.map((want) => ({ want, ok: titles.some((t) => t.includes(want.toLowerCase())) }));
  }

  const minOk = evidence.length >= (c.minItems ?? 1);
  return {
    id: c.id,
    ok: minOk && expects.every((e) => e.ok) && sections.every((s) => s.ok),
    ms,
    items: evidence.length,
    minOk,
    expects,
    sections,
  };
}

const suites = SUITE === "all" ? ["offline", "network"] : [SUITE];
const cases = suites.flatMap(loadCases).filter((c) => !FILTER || c.id.includes(FILTER));
if (cases.length === 0) {
  console.error(`no eval cases for suite "${SUITE}"${FILTER ? ` matching "${FILTER}"` : ""}`);
  process.exit(1);
}

const outRoot = mkdtempSync(join(tmpdir(), "ultradoc-eval-"));
const results = [];
for (const c of cases) {
  const r = runCase(c, outRoot);
  r.suite = c.suite;
  results.push(r);
  if (!AS_JSON) {
    const exp = r.expects
      .map((e) => {
        if (e.negate) return `${e.ok ? "✓" : "✗"} !${e.mustNotInclude}${e.found ? " (leaked)" : ""}`;
        return `${e.ok ? "✓" : "✗"} ${e.refIncludes ?? e.refPattern}${e.found ? `@${e.rank}` : " (absent)"}`;
      })
      .concat((r.sections ?? []).map((s) => `${s.ok ? "✓" : "✗"} §${s.want}`))
      .join("  ");
    console.log(`${r.ok ? "PASS" : "FAIL"}  [${c.suite}] ${r.id}  (${r.ms}ms, ${r.items ?? 0} items)  ${exp}${r.error ? `  ERROR: ${r.error}` : ""}`);
  }
}
if (!KEEP) rmSync(outRoot, { recursive: true, force: true });

// Positive expects only feed recall/MRR; negative assertions are pass/fail.
const posExpects = results.flatMap((r) => r.expects).filter((e) => !e.negate);
const summary = {
  suite: SUITE,
  cases: results.length,
  passed: results.filter((r) => r.ok).length,
  recall: posExpects.length ? posExpects.filter((e) => e.found).length / posExpects.length : 0,
  recallTopN: posExpects.length ? posExpects.filter((e) => e.ok).length / posExpects.length : 0,
  mrr: posExpects.length ? posExpects.reduce((s, e) => s + e.mrr, 0) / posExpects.length : 0,
  results,
};
writeFileSync(join(ROOT, "evals", "last-run.json"), JSON.stringify(summary, null, 2));

if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(
    `\n${summary.passed}/${summary.cases} cases · recall ${(summary.recall * 100).toFixed(0)}%` +
      ` · recall@N ${(summary.recallTopN * 100).toFixed(0)}% · MRR ${summary.mrr.toFixed(3)}` +
      ` · baseline saved to evals/last-run.json`,
  );
}

// Offline regressions block; network drift only reports.
const offlineFailed = results.some((r) => r.suite === "offline" && !r.ok);
process.exit(offlineFailed ? 1 : 0);

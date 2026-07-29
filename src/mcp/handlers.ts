import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { warmGrammars } from "../vendor/codeindex-engine.mjs";
import { runAsk, buildContext } from "../ask.js";
import { runSources } from "../sources/registry.js";
import { assignIds } from "../dossier.js";
import { symbolEvidence } from "../index/symbols.js";
import { ensureOverview } from "../overview.js";
import { webFetchUrls } from "../sources/web.js";
import { checkRun } from "../check.js";
import { runVerify } from "../verify.js";
import { runDoc } from "../doc.js";
import { cacheStatus, cacheClean } from "../cache.js";
import { resolveRepo } from "../clone.js";
import { withRepoLock } from "../repo-lock.js";
import { DEFAULT_SOURCES, parseSourceList } from "../sources/kinds.js";
import { LIMITS, cacheRoot } from "../config.js";
import type { AskOptions, EvidenceItem, SourceKind } from "../types.js";

// Where a tool name becomes work. Every handler calls the same library
// functions the CLI does — nothing here shells out to `ultradoc`, and nothing
// here calls cli.ts, whose `fail()` would take the server process down with a
// process.exit on a bad argument.

export interface HandlerDefaults {
  defaultRepo?: string;
  allowWrite?: boolean;
}

// Thrown for anything the caller can fix by calling again differently. The
// server turns it into an `isError` tool result, never a JSON-RPC error: the
// tool ran, the request was wrong or the world didn't cooperate.
export class ToolError extends Error {}

// A file read cannot return more than this many lines in one call, however big
// the window asked for. Bounds a `ultradoc_read` on a 200k-line generated file.
const MAX_READ_LINES = 2000;

// Hard ceiling on a file ultradoc will open at all, even for a small window.
// Above the per-file cap a windowed read is still served (see handleRead);
// above THIS the file gets read into memory to slice a few lines out of it,
// which is not a trade worth making.
const WINDOWED_READ_MAX_BYTES = LIMITS.maxFileBytes * 64;

const SYMBOL_MAX_DEFAULT = 12;

// --------------------------------------------------------------------------
// Argument coercion
// --------------------------------------------------------------------------

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

function strArray(v: unknown): string[] | undefined {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined;
}

function requiredRepo(args: Record<string, unknown>, defaults: HandlerDefaults): string {
  const repo = str(args.repo) ?? defaults.defaultRepo;
  if (!repo) throw new ToolError("`repo` is required: a git URL, owner/repo, or an absolute local path.");
  return repo;
}

function requiredStr(args: Record<string, unknown>, key: string, hint: string): string {
  const v = str(args[key]);
  if (!v) throw new ToolError(`\`${key}\` is required — ${hint}`);
  return v;
}

// The MCP counterpart of cli.ts's buildAskOptions. Same shape, but it THROWS on
// a bad value where the CLI exits: a malformed `sources` in one tool call must
// not end a long-lived session.
function askOptions(args: Record<string, unknown>, defaults: HandlerDefaults, opts: { question?: string } = {}): AskOptions {
  const rawSources = strArray(args.sources);
  let sources: SourceKind[] = DEFAULT_SOURCES;
  if (rawSources !== undefined) {
    if (rawSources.length === 0) throw new ToolError("`sources` was an empty array — omit it to use the default (code, issue, pr, docs).");
    const parsed = parseSourceList(rawSources, "`sources`");
    if (parsed.error || !parsed.sources) throw new ToolError(parsed.error ?? "`sources` resolved to nothing");
    sources = parsed.sources;
  }

  const perSource = num(args.per_source);
  if (perSource !== undefined && perSource <= 0) throw new ToolError("`per_source` must be greater than 0.");

  const out = str(args.out);
  if (out !== undefined && !isAbsolute(out)) throw new ToolError("`out` must be an absolute path.");

  const docsUrl = str(args.docs_url);
  if (docsUrl !== undefined && !/^https?:\/\//i.test(docsUrl)) throw new ToolError("`docs_url` must be an absolute http(s) URL.");

  return {
    repo: requiredRepo(args, defaults),
    question: opts.question ?? str(args.question) ?? "",
    sources,
    ref: str(args.ref),
    docsUrl,
    pkg: str(args.package),
    out,
    // Opt-in, exactly like --semantic: it degrades to the lexical tier with a
    // note when no backend is reachable, so turning it on is never a failure.
    semantic: bool(args.semantic),
    // The tiers that need no infrastructure are tried first; which one wins is
    // not something a tool caller should have to decide.
    semanticTier: "auto",
    webEngine: "auto",
    perSource: perSource ?? 6,
    json: true,
    refresh: bool(args.refresh),
  };
}

// --------------------------------------------------------------------------
// Grammar warm-up
// --------------------------------------------------------------------------

// Warm the tree-sitter grammars once per process, on first use, and never at
// startup. The CLI warms up front (cli.ts INDEXING_COMMANDS), but a server that
// did the same would spend a first-run 22 MB download while the client is
// blocked on `initialize` — and Claude Code kills a server that doesn't answer
// initialize in 30s. Tools that only read a dossier (check, verify, cache) or
// fetch a URL never trigger it at all.
//
// `onNote` diverts the progress banner into the tool result's notes: on stdio,
// the engine's default would write to stderr, which several clients render as
// red error text.
let warmed: Promise<void> | undefined;
let warmNotes: string[] = [];
function ensureGrammarsWarm(): Promise<string[]> {
  if (!warmed) {
    const notes: string[] = [];
    warmed = warmGrammars({ label: "ultradoc", onNote: (m: string) => notes.push(m.trim()) }).then(
      () => {
        warmNotes = notes.filter(Boolean);
      },
      (e: unknown) => {
        warmNotes = [`Grammar warm-up failed (${errMessage(e)}) — symbol extraction falls back to the regex tier.`];
      },
    );
  }
  // Drained, not re-read: the warm-up happens once, so its notes belong to the
  // one result that paid for it. Repeating "pulling grammars…" on every later
  // call would be noise the model has to re-read and cannot act on.
  return warmed.then(() => {
    const n = warmNotes;
    warmNotes = [];
    return n;
  });
}

// Test seam: forget the memoized warm-up so a suite can exercise the first-call
// path more than once.
export function resetGrammarWarm(): void {
  warmed = undefined;
  warmNotes = [];
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(root + sep);
}

function safeRealpath(p: string): string | undefined {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
}

// --------------------------------------------------------------------------
// Dispatch
// --------------------------------------------------------------------------

// Tools that need neither a clone nor an index: they read a dossier that
// already exists, fetch a URL, or report on the cache.
const REPO_FREE_TOOLS = new Set(["ultradoc_fetch", "ultradoc_check", "ultradoc_verify", "ultradoc_cache", "ultradoc_cache_clean"]);

export interface ToolOutcome {
  // The tool result, JSON-encoded. The MCP content block carries this verbatim.
  text: string;
  // An on-disk file holding the same thing, when one exists. Only used if the
  // payload is too large to send, so the refusal can point somewhere useful.
  artifact?: string;
}

// Throws ToolError for anything the caller can act on; any other throw is a bug
// and the server reports it as an internal error.
export async function callTool(name: string, args: Record<string, unknown>, defaults: HandlerDefaults = {}): Promise<ToolOutcome> {
  if (name === "ultradoc_cache_clean" && !defaults.allowWrite) {
    throw new ToolError("ultradoc_cache_clean is disabled — start the server with --allow-write to enable it.");
  }

  if (REPO_FREE_TOOLS.has(name)) return outcome(name, await callRepoFree(name, args));

  // Everything else touches one repo's cache entry. `resolveRepo` is pure
  // string work, so the slug is known before any I/O — and the whole call is
  // serialized against other calls for the same repo, because ensureClone and
  // ensureIndex race with themselves.
  const repo = requiredRepo(args, defaults);
  const slug = resolveRepo(repo).slug;
  const notes = await ensureGrammarsWarm();
  return withRepoLock(slug, async () => outcome(name, await callRepoTool(name, args, defaults, notes)));
}

function outcome(name: string, result: unknown): ToolOutcome {
  return { text: JSON.stringify(result, null, 2) + "\n", artifact: artifactFor(name, result) };
}

// Where an oversized result already exists on disk, so an over-cap refusal can
// point at it instead of just saying no.
function artifactFor(name: string, result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const r = result as Record<string, unknown>;
  if (name === "ultradoc_ask") {
    const evidenceMd = (r.paths as Record<string, unknown> | undefined)?.evidence_md;
    return typeof evidenceMd === "string" ? evidenceMd : undefined;
  }
  if (name === "ultradoc_overview") return typeof r.path === "string" ? r.path : undefined;
  if (name === "ultradoc_doc") {
    const todo = (r.paths as Record<string, unknown> | undefined)?.todoMd;
    return typeof todo === "string" ? todo : undefined;
  }
  return undefined;
}

async function callRepoFree(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "ultradoc_fetch":
      return await handleFetch(args);
    case "ultradoc_check":
      return handleCheck(args);
    case "ultradoc_verify":
      return handleVerify(args);
    case "ultradoc_cache":
      return cacheStatus();
    case "ultradoc_cache_clean":
      return handleCacheClean(args);
    default:
      throw new ToolError(`unknown tool: ${name}`);
  }
}

async function callRepoTool(name: string, args: Record<string, unknown>, defaults: HandlerDefaults, warmNotes: string[]): Promise<unknown> {
  switch (name) {
    case "ultradoc_search":
      return await handleSearch(args, defaults, warmNotes);
    case "ultradoc_ask":
      return await handleAsk(args, defaults, warmNotes);
    case "ultradoc_overview":
      return handleOverview(args, defaults, warmNotes);
    case "ultradoc_symbol":
      return handleSymbol(args, defaults, warmNotes);
    case "ultradoc_read":
      return handleRead(args, defaults);
    case "ultradoc_doc":
      return await handleDoc(args, defaults, warmNotes);
    default:
      throw new ToolError(`unknown tool: ${name}`);
  }
}

// --------------------------------------------------------------------------
// Handlers
// --------------------------------------------------------------------------

// `buildContext` throws a good message on an unresolvable --package and a raw
// git failure on a bad repo. Both are the caller's to fix, so both become
// ToolError rather than escaping as an internal error.
function context(options: AskOptions) {
  try {
    return buildContext(options);
  } catch (e) {
    throw new ToolError(errMessage(e));
  }
}

async function handleSearch(args: Record<string, unknown>, defaults: HandlerDefaults, warmNotes: string[]) {
  const options = askOptions(args, defaults, { question: requiredStr(args, "question", "the precise question to retrieve evidence for.") });
  const t0 = Date.now();
  const ctx = context(options);
  const results = await runSources(ctx);
  const evidence = assignIds(results);
  const sourceMs: Partial<Record<SourceKind, number>> = {};
  for (const r of results) if (r.ms !== undefined) sourceMs[r.source] = r.ms;

  return {
    repo: ctx.repoRef.raw,
    host: ctx.repoRef.host,
    commit: ctx.index.commit,
    repo_dir: ctx.repoDir,
    package: ctx.scopePkg?.name,
    sources: options.sources,
    evidence,
    // Retrieval notes are the honest part of the result: a host with no issues
    // API, an unreachable page, a capped index. They are never an error.
    notes: [...warmNotes, ...results.flatMap((r) => r.notes)],
    fallbacks: results.flatMap((r) => r.fallbacks ?? []),
    timings: {
      clone_ms: ctx.setupTimings?.cloneMs ?? 0,
      index_ms: ctx.setupTimings?.indexMs ?? 0,
      total_ms: Date.now() - t0,
      sources: sourceMs,
    },
  };
}

async function handleAsk(args: Record<string, unknown>, defaults: HandlerDefaults, warmNotes: string[]) {
  const options = askOptions(args, defaults, { question: requiredStr(args, "question", "the question the dossier is built to answer.") });
  let r: Awaited<ReturnType<typeof runAsk>>;
  try {
    r = await runAsk(options);
  } catch (e) {
    throw new ToolError(errMessage(e));
  }
  return {
    run_dir: r.dir,
    paths: {
      evidence_md: r.paths.evidenceMd,
      evidence_json: r.paths.evidenceJson,
      meta_json: r.paths.metaJson,
    },
    meta: r.meta,
    evidence_count: r.evidence.length,
    notes: [...warmNotes, ...r.meta.notes],
    next: `Read ${r.paths.evidenceMd} with ultradoc_read, write an answer citing [E#], then call ultradoc_check with run_dir "${r.dir}".`,
  };
}

function handleOverview(args: Record<string, unknown>, defaults: HandlerDefaults, warmNotes: string[]) {
  const options = askOptions(args, defaults, { question: "" });
  const ctx = context(options);
  const r = ensureOverview(ctx.index, ctx.repoRef, ctx.repoDir, { refresh: options.refresh });
  return {
    path: r.path,
    cached: r.cached,
    markdown: r.markdown,
    commit: ctx.index.commit,
    file_count: ctx.index.fileCount,
    packages: ctx.index.packages,
    notes: warmNotes,
  };
}

function handleSymbol(args: Record<string, unknown>, defaults: HandlerDefaults, warmNotes: string[]) {
  const name = requiredStr(args, "name", "the exact symbol name to resolve.");
  const max = num(args.max);
  if (max !== undefined && max <= 0) throw new ToolError("`max` must be greater than 0.");
  // The symbol IS the query: this drill resolves declarations and call sites
  // from the index, it never runs a lexical search.
  const ctx = context(askOptions(args, defaults, { question: name }));
  const { items, notes } = symbolEvidence(ctx, name, { max: max ?? SYMBOL_MAX_DEFAULT });
  return {
    repo: ctx.repoRef.raw,
    commit: ctx.index.commit,
    symbol: name,
    items: assignIds([{ source: "code", items, notes: [] }]) as EvidenceItem[],
    notes: [...warmNotes, ...notes],
  };
}

function handleRead(args: Record<string, unknown>, defaults: HandlerDefaults) {
  const rel = requiredStr(args, "path", "a repo-relative path, or an absolute path inside the clone or ultradoc's cache.");
  const ctx = context(askOptions(args, defaults, { question: "" }));

  const root = realpathSync(ctx.repoDir);
  // Absolute is accepted because ultradoc_ask hands back absolute dossier
  // paths and a model will pass one straight back.
  const target = isAbsolute(rel) ? rel : resolve(root, rel);

  // Confinement is checked AFTER symlink resolution: a repo can contain a
  // symlink pointing anywhere, so resolving first is the only way to know what
  // is really being opened.
  //
  // Two anchors, and no more: the clone itself, and ultradoc's cache root
  // (where every dossier lands by default). A dossier written to an `out`
  // outside both belongs to the caller's filesystem — reading it is their file
  // tool's job, not this server's, which would otherwise be a read-anything
  // primitive wearing a repository's name.
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    throw new ToolError(`No such file in ${ctx.repoRef.raw}: ${rel}`);
  }
  const cache = safeRealpath(cacheRoot());
  if (!within(real, root) && !(cache && within(real, cache))) {
    throw new ToolError(
      `\`path\` is outside ${ctx.repoRef.raw} and outside ultradoc's cache: ${rel}. ` +
        `ultradoc_read only opens files in the clone or in a dossier under the cache — read anything else with your own file tools.`,
    );
  }
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(real);
  } catch {
    throw new ToolError(`No such file in ${ctx.repoRef.raw}: ${rel}`);
  }
  if (stat.isDirectory()) throw new ToolError(`\`path\` is a directory, not a file: ${rel}`);

  // The whole-file cap does not apply to a windowed read, because otherwise the
  // cap's own advice would be false — refusing a 2 MB file with "pass
  // start_line/end_line" and then refusing that too is worse than no advice at
  // all. A window still has a ceiling: past it the file is not something to
  // open in memory, and saying so is the honest answer.
  const wantsWindow = args.start_line !== undefined || args.end_line !== undefined;
  if (stat.size > WINDOWED_READ_MAX_BYTES) {
    throw new ToolError(
      `${rel} is ${stat.size} bytes — too large for ultradoc to open (ceiling ${WINDOWED_READ_MAX_BYTES}). Read it with your own file tools.`,
    );
  }
  if (stat.size > LIMITS.maxFileBytes && !wantsWindow) {
    throw new ToolError(
      `${rel} is ${stat.size} bytes, over the ${LIMITS.maxFileBytes}-byte whole-file cap — pass start_line/end_line and the window will be returned.`,
    );
  }

  const lines = readFileSync(real, "utf8").split("\n");
  // A trailing newline yields a final empty element that is not a line.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const total = lines.length;

  const start = Math.max(1, Math.trunc(num(args.start_line) ?? 1));
  if (start > total) throw new ToolError(`start_line ${start} is past the end of ${rel} (${total} lines).`);
  const requestedEnd = Math.trunc(num(args.end_line) ?? total);
  const end = Math.min(total, Math.max(start, requestedEnd), start + MAX_READ_LINES - 1);

  return {
    path: rel,
    commit: ctx.index.commit,
    start_line: start,
    end_line: end,
    total_lines: total,
    truncated: end < Math.min(total, Math.max(start, requestedEnd)),
    content: lines.slice(start - 1, end).join("\n"),
  };
}

async function handleFetch(args: Record<string, unknown>) {
  const urls = strArray(args.urls);
  if (!urls || urls.length === 0) throw new ToolError("`urls` is required — an array of absolute http(s) URLs.");
  const bad = urls.find((u) => !/^https?:\/\//i.test(u));
  if (bad) throw new ToolError(`\`urls\` must be absolute http(s) URLs — got "${bad}".`);
  const perSource = num(args.per_source);
  if (perSource !== undefined && perSource <= 0) throw new ToolError("`per_source` must be greater than 0.");

  const question = str(args.question) ?? "";
  const { items, notes } = await webFetchUrls(urls, question, perSource ?? 6, {});
  return { urls, items: assignIds([{ source: "web", items, notes: [] }]), notes };
}

function runDir(args: Record<string, unknown>): string {
  const dir = requiredStr(args, "run_dir", "the dossier directory returned by ultradoc_ask.");
  if (!existsSync(dir)) throw new ToolError(`No dossier at ${dir} — run ultradoc_ask first, and pass the run_dir it returned.`);
  return dir;
}

function handleCheck(args: Record<string, unknown>) {
  const dir = runDir(args);
  const coverageMin = num(args.coverage_min);
  if (coverageMin !== undefined && (coverageMin < 0 || coverageMin > 1)) throw new ToolError("`coverage_min` must be between 0 and 1.");

  const answerText = typeof args.answer_text === "string" ? args.answer_text : undefined;
  const result = checkRun(dir, {
    answerText,
    answerFile: str(args.answer_file),
    strict: bool(args.strict),
    coverageMin,
    semantic: bool(args.semantic),
    allowUnverified: bool(args.allow_unverified),
  });
  // ok:false is a verdict, not a failure: the tool did its job and the answer
  // did not pass. Reporting it as an error would tell the model the gate is
  // broken instead of that its answer is.
  return { ...result, run_dir: dir, answer_source: answerText === undefined ? "file" : "inline" };
}

function handleVerify(args: Record<string, unknown>) {
  const dir = runDir(args);
  const maxVerify = num(args.max_verify);
  if (maxVerify !== undefined && maxVerify <= 0) throw new ToolError("`max_verify` must be greater than 0.");
  try {
    return { ...runVerify(dir, { maxVerify, answerFile: str(args.answer_file) }), run_dir: dir };
  } catch (e) {
    throw new ToolError(errMessage(e));
  }
}

async function handleDoc(args: Record<string, unknown>, defaults: HandlerDefaults, warmNotes: string[]) {
  const options = askOptions(args, defaults, { question: "" });
  let r: Awaited<ReturnType<typeof runDoc>>;
  try {
    r = await runDoc(options);
  } catch (e) {
    throw new ToolError(errMessage(e));
  }
  return {
    dir: r.dir,
    paths: r.paths,
    outline_sections: r.plan.sections.map((s) => ({ id: s.id, title: s.title, evidence_ids: s.evidenceIds })),
    evidence_count: r.evidence.length,
    notes: warmNotes,
    next: `Read ${r.paths.todoMd}, write the cited DOC.md, then call ultradoc_check with run_dir "${r.dir}".`,
  };
}

function handleCacheClean(args: Record<string, unknown>) {
  const all = bool(args.all);
  const repo = str(args.repo);
  if (!all && !repo) throw new ToolError("Pass `repo` to drop one cache entry, or `all: true` to drop every one.");
  return { ...cacheClean({ all, repo }), all, repo };
}

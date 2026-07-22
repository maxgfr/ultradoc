#!/usr/bin/env node

// src/cli.ts
import { join as join25, resolve as resolve4 } from "path";
import { pathToFileURL, fileURLToPath as fileURLToPath2 } from "url";
import { existsSync as existsSync14, realpathSync as realpathSync2 } from "fs";

// src/types.ts
var VERSION = "2.1.3";

// src/clone.ts
import { existsSync, statSync, mkdirSync, readdirSync, renameSync } from "fs";
import { resolve, join as join2, basename } from "path";
import { tmpdir as tmpdir2 } from "os";

// src/util.ts
import { spawnSync } from "child_process";
function sh(cmd, args2, opts = {}) {
  const res = spawnSync(cmd, args2, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 12e4,
    maxBuffer: 64 * 1024 * 1024,
    env: opts.env ?? process.env
  });
  const missing = !!res.error && res.error.code === "ENOENT";
  return {
    ok: !res.error && res.status === 0,
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? (res.error ? String(res.error.message) : ""),
    missing
  };
}
var whichCache = /* @__PURE__ */ new Map();
function have(cmd) {
  const cached = whichCache.get(cmd);
  if (cached !== void 0) return cached;
  const probe = sh(process.platform === "win32" ? "where" : "which", [cmd]);
  const found = probe.ok && probe.stdout.trim().length > 0;
  whichCache.set(cmd, found);
  return found;
}
function slugify(input) {
  return input.toLowerCase().replace(/^https?:\/\//, "").replace(/^git@/, "").replace(/\.git$/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "how",
  "what",
  "why",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "of",
  "in",
  "on",
  "to",
  "for",
  "with",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "than",
  "as",
  "at",
  "by",
  "from",
  "into",
  "about",
  "it",
  "its",
  "i",
  "you",
  "we",
  "they",
  "he",
  "she",
  "there",
  "here",
  "can",
  "could",
  "should",
  "would",
  "will",
  "shall",
  "may",
  "might",
  "must",
  "have",
  "has",
  "had",
  "not",
  "no",
  "yes",
  "so",
  "such",
  "only",
  "any",
  "some",
  "all",
  "get",
  "set",
  "use",
  "used",
  "using",
  "work",
  "works",
  "working",
  "handle",
  "handled",
  "happen",
  "happens",
  "default",
  "value",
  "values",
  "please",
  "explain",
  "tell",
  "me",
  "my",
  "our",
  // French question scaffolding — questions about French-language repos are a
  // supported use case, and short function words otherwise eat the keyword
  // budget and substring-match everywhere ("est" hits "request", "test", …).
  "le",
  "la",
  "les",
  "de",
  "des",
  "du",
  "un",
  "une",
  "est",
  "sont",
  "que",
  "qui",
  "quoi",
  "quel",
  "quelle",
  "quels",
  "quelles",
  "pour",
  "dans",
  "avec",
  "entre",
  "sur",
  "par",
  "pas",
  "plus",
  "et",
  "ou",
  "o\xF9",
  "ce",
  "cette",
  "ces",
  "se",
  "sa",
  "son",
  "ses",
  "leur",
  "leurs",
  "comment",
  "pourquoi",
  "quand",
  "fait",
  "faire",
  "peut",
  "doit",
  "\xEAtre",
  "avoir",
  "il",
  "elle",
  "nous",
  "vous",
  "ils",
  "elles",
  "au",
  "aux",
  "si",
  "ne"
]);
function keywords(question) {
  const seen = /* @__PURE__ */ new Set();
  const out2 = [];
  for (const raw of question.split(/[^\p{L}\p{N}_]+/u)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (raw.length < 2) continue;
    if (STOPWORDS.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out2.push(raw);
  }
  return out2;
}
function rankedKeywords(question) {
  const base = keywords(question);
  const score = (raw) => {
    let s = 0;
    if (/\d/.test(raw)) s += 3;
    if (/[A-Z]/.test(raw) && !/^[A-Z0-9]+$/.test(raw)) s += 2;
    if (/_/.test(raw)) s += 2;
    if (raw.length >= 8) s += 1.5;
    else if (raw.length >= 5) s += 0.5;
    return s;
  };
  return base.map((k, i2) => ({ k, s: score(k), i: i2 })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.k);
}
var ACCENT_CLASSES = {
  a: "a\xE0\xE1\xE2\xE3\xE4\xE5\u0101\u0103\u0105",
  c: "c\xE7\u0107\u0109\u010B\u010D",
  d: "d\u010F\u0111",
  e: "e\xE8\xE9\xEA\xEB\u0113\u0115\u0117\u0119\u011B",
  g: "g\u011D\u011F\u0121\u0123",
  i: "i\xEC\xED\xEE\xEF\u0129\u012B\u012D\u012F\u0131",
  l: "l\u013A\u013C\u013E\u0140\u0142",
  n: "n\xF1\u0144\u0146\u0148",
  o: "o\xF2\xF3\xF4\xF5\xF6\xF8\u014D\u014F\u0151",
  r: "r\u0155\u0157\u0159",
  s: "s\u015B\u015D\u015F\u0161",
  t: "t\u0163\u0165\u0167",
  u: "u\xF9\xFA\xFB\xFC\u0169\u016B\u016D\u016F\u0171\u0173",
  y: "y\xFD\xFF\u0177",
  z: "z\u017A\u017C\u017E"
};
var BASE_OF = /* @__PURE__ */ new Map();
for (const [base, cls] of Object.entries(ACCENT_CLASSES)) {
  for (const ch of cls) BASE_OF.set(ch, base);
}
function baseChar(ch) {
  const known = BASE_OF.get(ch);
  if (known) return known;
  const stripped = ch.normalize("NFD").replace(new RegExp("\\p{M}+", "gu"), "");
  return stripped.length === 1 ? stripped : ch;
}
function deaccent(s) {
  let out2 = "";
  for (const ch of s) out2 += baseChar(ch);
  return out2;
}
function foldPlural(t) {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && /(?:[sxz]|[cs]h)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !/(?:ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}
function foldTerm(raw) {
  return foldPlural(deaccent(raw.toLowerCase()));
}
function subtokens(raw) {
  const spaced = raw.replace(new RegExp("([\\p{Ll}\\p{N}])(\\p{Lu})", "gu"), "$1 $2").replace(new RegExp("(\\p{Lu}+)(\\p{Lu}\\p{Ll})", "gu"), "$1 $2").replace(new RegExp("(\\p{L})(\\p{N})", "gu"), "$1 $2").replace(new RegExp("(\\p{N})(\\p{L})", "gu"), "$1 $2");
  const parts2 = spaced.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parts2.length < 2) return [];
  const out2 = [];
  for (const p of parts2) {
    const lower = p.toLowerCase();
    if (lower.length < 3 || STOPWORDS.has(lower)) continue;
    if (!out2.includes(lower)) out2.push(lower);
    if (out2.length >= 4) break;
  }
  return out2;
}
var MAX_PATTERNS = 24;
var VARIANT_PRIORITY = { original: 0, folded: 1, subtoken: 2 };
function expandTokens(tokens, max = 8) {
  const byCanonical = /* @__PURE__ */ new Map();
  for (const raw of tokens) {
    if (byCanonical.size >= max) break;
    const canonical = foldTerm(raw);
    if (!canonical || byCanonical.has(canonical)) continue;
    const plain = deaccent(raw.toLowerCase());
    const variants = [{ text: raw.toLowerCase(), kind: "original" }];
    if (canonical !== plain) variants.push({ text: canonical, kind: "folded" });
    if (plain.length > 4 && plain.endsWith("ies")) variants.push({ text: plain.slice(0, -1), kind: "folded" });
    for (const sub of subtokens(raw)) variants.push({ text: sub, kind: "subtoken" });
    byCanonical.set(canonical, { canonical, original: raw, variants });
  }
  const all = [...byCanonical.values()].flatMap((ek, kwIdx) => ek.variants.map((v) => ({ ek, v, kwIdx })));
  all.sort((a, b) => VARIANT_PRIORITY[a.v.kind] - VARIANT_PRIORITY[b.v.kind] || a.kwIdx - b.kwIdx);
  const seen = /* @__PURE__ */ new Set();
  const kept = /* @__PURE__ */ new Set();
  for (const { v } of all) {
    if (kept.size >= MAX_PATTERNS) break;
    const key = deaccent(v.text);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.add(v);
  }
  for (const ek of byCanonical.values()) ek.variants = ek.variants.filter((v) => kept.has(v));
  return [...byCanonical.values()];
}
function accentPattern(text) {
  let out2 = "";
  for (const ch of text) {
    const cls = ACCENT_CLASSES[baseChar(ch)];
    out2 += cls ? `[${cls}]` : escapeRegExp(ch);
  }
  return out2;
}
function makeMatcher(expanded) {
  const canonicalByVariant = /* @__PURE__ */ new Map();
  const patterns = [];
  const regexes = [];
  for (const ek of expanded) {
    for (const v of ek.variants) {
      const key = foldTerm(v.text);
      const prio = VARIANT_PRIORITY[v.kind];
      const prev = canonicalByVariant.get(key);
      if (!prev || prio < prev.prio) canonicalByVariant.set(key, { canonical: ek.canonical, prio });
      const source = accentPattern(v.text);
      patterns.push({ source, canonical: ek.canonical });
      regexes.push({ re: new RegExp(source, "i"), canonical: ek.canonical });
    }
  }
  return {
    expanded,
    canonicals: expanded.map((e) => e.canonical),
    patterns,
    canonicalOf: (span) => canonicalByVariant.get(foldTerm(span))?.canonical,
    matchLine: (line) => {
      const hit = /* @__PURE__ */ new Set();
      for (const { re, canonical } of regexes) {
        if (!hit.has(canonical) && re.test(line)) hit.add(canonical);
      }
      return hit;
    }
  };
}
function buildMatcher(question, max = 8) {
  return makeMatcher(expandTokens(keywords(question), max));
}
function matcherFromTokens(tokens, max = 8) {
  return makeMatcher(expandTokens(tokens.filter(Boolean), max));
}
function rrf(lists, keyOf2, k = 60) {
  const score = /* @__PURE__ */ new Map();
  for (const list of lists) {
    list.forEach((item, idx) => {
      const key = keyOf2(item);
      score.set(key, (score.get(key) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return score;
}
async function mapLimit(items, limit, fn) {
  const n = items.length;
  const out2 = new Array(n);
  const width = Math.max(1, Math.min(limit, n || 1));
  let next = 0;
  async function worker() {
    while (true) {
      const i2 = next++;
      if (i2 >= n) return;
      out2[i2] = await fn(items[i2], i2);
    }
  }
  await Promise.all(Array.from({ length: width }, () => worker()));
  return out2;
}

// src/config.ts
import { homedir, tmpdir } from "os";
import { join } from "path";
function envInt(name2, def, min = 1) {
  const raw = process.env[name2];
  if (raw === void 0) return def;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : def;
}
var LIMITS = {
  maxFiles: envInt("ULTRADOC_MAX_FILES", 2e4),
  // files walked/indexed
  maxFileBytes: envInt("ULTRADOC_MAX_FILE_BYTES", 1048576),
  // per-file read cap
  symbolsPerFile: envInt("ULTRADOC_MAX_SYMBOLS_PER_FILE", 400),
  // symbols kept per file
  releasesFetched: envInt("ULTRADOC_MAX_RELEASES", 20),
  // GitHub releases fetched
  docPackages: envInt("ULTRADOC_MAX_DOC_PACKAGES", 6),
  // monorepo packages given doc sections
  verifyPairs: envInt("ULTRADOC_MAX_VERIFY", 40),
  // claim↔evidence pairs (CLI --max-verify wins)
  embedChunks: envInt("ULTRADOC_MAX_CHUNKS", 800),
  // semantic chunks embedded per repo
  embedConcurrency: envInt("ULTRADOC_EMBED_CONCURRENCY", 4)
  // parallel embed requests
};
function cacheRoot() {
  const override = process.env.ULTRADOC_CACHE_DIR?.trim();
  if (override) return override;
  const home = homedir();
  if (!home) return join(tmpdir(), "ultradoc");
  if (process.platform === "darwin") return join(home, "Library", "Caches", "ultradoc");
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA?.trim() || join(home, "AppData", "Local"), "ultradoc");
  return join(process.env.XDG_CACHE_HOME?.trim() || join(home, ".cache"), "ultradoc");
}

// src/clone.ts
function migrateLegacyClone(dir, slug) {
  if (existsSync(dir)) return;
  const legacy = join2(tmpdir2(), "ultradoc", slug);
  if (legacy === dir || !existsSync(join2(legacy, ".git"))) return;
  try {
    mkdirSync(cacheRoot(), { recursive: true });
    renameSync(legacy, dir);
  } catch {
  }
}
function resolveRepo(raw) {
  const trimmed = raw.trim();
  const asPath = resolve(trimmed);
  if (existsSync(asPath) && statSync(asPath).isDirectory()) {
    return {
      raw: trimmed,
      host: "local",
      isLocal: true,
      slug: "local-" + slugify(basename(asPath) + "-" + asPath)
    };
  }
  let host;
  let path;
  const scp = /^git@([^:]+):(.+)$/.exec(trimmed);
  const url = /^https?:\/\/([^/]+)\/(.+)$/.exec(trimmed);
  const hostPath = /^([a-z0-9.-]+\.[a-z]{2,})\/(.+)$/i.exec(trimmed);
  if (scp) {
    host = scp[1];
    path = scp[2];
  } else if (url) {
    host = url[1];
    path = url[2];
  } else if (hostPath) {
    host = hostPath[1];
    path = hostPath[2];
  } else {
    host = "github.com";
    path = trimmed;
  }
  path = path.replace(/\.git$/, "").replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  const repo = segments.length ? segments[segments.length - 1] : void 0;
  const owner = segments.length > 1 ? segments.slice(0, -1).join("/") : void 0;
  const cloneUrl = /^https?:\/\//.test(trimmed) || scp ? trimmed : `https://${host}/${path}.git`;
  const webUrl = `https://${host}/${path}`;
  return {
    raw: trimmed,
    host,
    owner,
    repo,
    cloneUrl: cloneUrl.endsWith(".git") ? cloneUrl : `${cloneUrl}.git`,
    webUrl,
    isLocal: false,
    slug: slugify(`${host}/${path}`)
  };
}
function ensureClone(ref, opts = {}) {
  if (ref.isLocal) return resolve(ref.raw);
  const dir = join2(cacheRoot(), ref.slug);
  migrateLegacyClone(dir, ref.slug);
  const alreadyCloned = existsSync(join2(dir, ".git"));
  if (alreadyCloned && !opts.refresh) return dir;
  if (alreadyCloned && opts.refresh) {
    sh("git", ["-C", dir, "fetch", "--depth", "1", "origin"], { timeoutMs: 18e4 });
    sh("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"], { timeoutMs: 6e4 });
    return dir;
  }
  mkdirSync(cacheRoot(), { recursive: true });
  const args2 = ["clone", "--depth", "1", "--filter=blob:none"];
  if (opts.branch) args2.push("--branch", opts.branch);
  args2.push(ref.cloneUrl, dir);
  const res = sh("git", args2, { timeoutMs: 3e5 });
  if (!res.ok) {
    const fallback = sh("git", ["clone", "--depth", "1", ...opts.branch ? ["--branch", opts.branch] : [], ref.cloneUrl, dir], { timeoutMs: 3e5 });
    if (!fallback.ok) {
      throw new Error(`git clone failed for ${ref.cloneUrl}
${(res.stderr || fallback.stderr).trim()}`);
    }
  }
  if (!existsSync(dir) || readdirSync(dir).length === 0) {
    throw new Error(`clone produced an empty tree at ${dir}`);
  }
  return dir;
}
var deepened = /* @__PURE__ */ new Map();
function ensureHistoryDepth(dir) {
  const cached = deepened.get(dir);
  if (cached) return cached;
  let out2;
  const probe = sh("git", ["-C", dir, "rev-parse", "--is-shallow-repository"]);
  const filter = sh("git", ["-C", dir, "config", "remote.origin.partialclonefilter"]);
  const shallow = probe.ok && probe.stdout.trim() === "true";
  const partial = filter.ok && filter.stdout.trim() !== "";
  if (!probe.ok) {
    out2 = { ok: false, note: "Not a git working tree \u2014 no commit history available." };
  } else if (!shallow && !partial) {
    out2 = { ok: true };
  } else {
    if (partial) sh("git", ["-C", dir, "config", "remote.origin.partialclonefilter", ""]);
    const args2 = ["-C", dir, "fetch", "--quiet", ...partial ? ["--refetch"] : [], ...shallow ? ["--unshallow"] : [], "origin"];
    const full = sh("git", args2, { timeoutMs: 3e5 });
    if (full.ok) {
      out2 = { ok: true };
    } else if (shallow && !partial) {
      const deepen = sh("git", ["-C", dir, "fetch", "--quiet", "--deepen=500", "origin"], {
        timeoutMs: 18e4
      });
      out2 = deepen.ok ? { ok: true, note: "History deepened to ~500 commits (full unshallow failed); older changes may be missing." } : { ok: false, note: "Shallow clone could not be deepened (offline?); history is limited to the latest commit." };
    } else {
      out2 = { ok: false, note: "Could not fetch full history (offline, or the repo is too large); history results may be incomplete." };
    }
  }
  deepened.set(dir, out2);
  return out2;
}
function headCommit(dir) {
  const res = sh("git", ["-C", dir, "rev-parse", "--short", "HEAD"]);
  return res.ok ? res.stdout.trim() : void 0;
}
function sameCommit(a, b) {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}
function originUrl(dir) {
  const res = sh("git", ["-C", dir, "remote", "get-url", "origin"]);
  return res.ok && res.stdout.trim() ? res.stdout.trim() : void 0;
}

// src/index/structural.ts
import { existsSync as existsSync5, mkdirSync as mkdirSync3, writeFileSync as writeFileSync2, readFileSync as readFileSync4 } from "fs";
import { join as join9 } from "path";

// src/vendor/codeindex-engine.mjs
import { spawnSync as spawnSync2 } from "child_process";
import { readdirSync as readdirSync2, statSync as statSync2, lstatSync, readFileSync, realpathSync } from "fs";
import { join as join3, sep, extname } from "path";
import { createHash } from "crypto";
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "fs";
import { dirname, join as join22 } from "path";
import { fileURLToPath } from "url";
import { basename as basename2 } from "path";
import { posix } from "path";
import { join as join32 } from "path";
import { posix as posix2 } from "path";
import { join as join4 } from "path";
import { existsSync as existsSync22, readdirSync as readdirSync22 } from "fs";
import { join as join5 } from "path";
import { createInterface } from "readline";
import { basename as basename22 } from "path";
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync3, writeFileSync } from "fs";
import { join as join6, resolve as resolve2 } from "path";
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var ENGINE_VERSION;
var SCHEMA_VERSION;
var EXTRACTOR_VERSION;
var init_types = __esm({
  "src/types.ts"() {
    "use strict";
    ENGINE_VERSION = "2.0.1";
    SCHEMA_VERSION = 4;
    EXTRACTOR_VERSION = 5;
  }
});
function sh2(cmd, args2, opts = {}) {
  const res = spawnSync2(cmd, args2, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 12e4,
    maxBuffer: 64 * 1024 * 1024,
    env: opts.env ?? process.env
  });
  const missing = !!res.error && res.error.code === "ENOENT";
  return {
    ok: !res.error && res.status === 0,
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? (res.error ? String(res.error.message) : ""),
    missing
  };
}
function have2(cmd) {
  const cached = whichCache2.get(cmd);
  if (cached !== void 0) return cached;
  const probe = sh2(process.platform === "win32" ? "where" : "which", [cmd]);
  const found = probe.ok && probe.stdout.trim().length > 0;
  whichCache2.set(cmd, found);
  return found;
}
function slugify2(input) {
  return input.toLowerCase().replace(/^https?:\/\//, "").replace(/^git@/, "").replace(/\.git$/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}
function clip(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `
\u2026 [truncated ${s.length - max} chars]`;
}
function clipInline(s, max) {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  let cut = flat.slice(0, max).replace(/\s+\S*$/, "");
  if (!cut) cut = flat.slice(0, max);
  if ((cut.match(/`/g)?.length ?? 0) % 2 === 1) cut = cut.replace(/`[^`]*$/, "");
  if (cut.lastIndexOf("[") > cut.lastIndexOf("]")) cut = cut.slice(0, cut.lastIndexOf("["));
  return cut.replace(/\s+$/, "") + "\u2026";
}
function escapeRegExp2(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function foldText(s) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}
function keywords2(question) {
  const seen = /* @__PURE__ */ new Set();
  const out2 = [];
  for (const raw of foldText(question).split(/[^A-Za-z0-9_]+/)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (raw.length < 2) continue;
    if (STOPWORDS2.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out2.push(raw);
  }
  return out2;
}
function rankedKeywords2(question) {
  const base = keywords2(question);
  const score = (raw) => {
    let s = 0;
    if (/\d/.test(raw)) s += 3;
    if (/[A-Z]/.test(raw) && !/^[A-Z0-9]+$/.test(raw)) s += 2;
    if (/_/.test(raw)) s += 2;
    if (raw.length >= 8) s += 1.5;
    else if (raw.length >= 5) s += 0.5;
    return s;
  };
  return base.map((k, i2) => ({ k, s: score(k), i: i2 })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.k);
}
function rrf2(lists, keyOf2, k = 60) {
  const score = /* @__PURE__ */ new Map();
  for (const list of lists) {
    list.forEach((item, idx) => {
      const key = keyOf2(item);
      score.set(key, (score.get(key) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return score;
}
var whichCache2;
var STOPWORDS2;
var init_util = __esm({
  "src/util.ts"() {
    "use strict";
    whichCache2 = /* @__PURE__ */ new Map();
    STOPWORDS2 = /* @__PURE__ */ new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "do",
      "does",
      "did",
      "how",
      "what",
      "why",
      "when",
      "where",
      "which",
      "who",
      "whom",
      "this",
      "that",
      "these",
      "those",
      "of",
      "in",
      "on",
      "to",
      "for",
      "with",
      "and",
      "or",
      "but",
      "if",
      "then",
      "else",
      "than",
      "as",
      "at",
      "by",
      "from",
      "into",
      "about",
      "it",
      "its",
      "i",
      "you",
      "we",
      "they",
      "he",
      "she",
      "there",
      "here",
      "can",
      "could",
      "should",
      "would",
      "will",
      "shall",
      "may",
      "might",
      "must",
      "have",
      "has",
      "had",
      "not",
      "no",
      "yes",
      "so",
      "such",
      "only",
      "any",
      "some",
      "all",
      "get",
      "set",
      "use",
      "used",
      "using",
      "work",
      "works",
      "working",
      "handle",
      "handled",
      "happen",
      "happens",
      "default",
      "value",
      "values",
      "please",
      "explain",
      "tell",
      "me",
      "my",
      "our"
    ]);
  }
});
function patternToRegExpSource(pattern) {
  let re = "";
  for (let i2 = 0; i2 < pattern.length; i2++) {
    const c2 = pattern[i2];
    if (c2 === "\\" && i2 + 1 < pattern.length) {
      re += escapeRegExp2(pattern[++i2]);
    } else if (c2 === "*") {
      if (pattern[i2 + 1] === "*") {
        const atStart = i2 === 0 || pattern[i2 - 1] === "/";
        let j = i2;
        while (pattern[j + 1] === "*") j++;
        const next = pattern[j + 1];
        if (atStart && next === "/") {
          i2 = j + 1;
          re += "(?:[^/]+/)*";
        } else if (atStart && next === void 0) {
          i2 = j;
          re += ".*";
        } else {
          i2 = j;
          re += "[^/]*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c2 === "?") {
      re += "[^/]";
    } else if (c2 === "[") {
      let j = i2 + 1;
      let body2 = "";
      if (pattern[j] === "!") {
        body2 += "^";
        j++;
      }
      if (pattern[j] === "]") {
        body2 += "\\]";
        j++;
      }
      while (j < pattern.length && pattern[j] !== "]") {
        const ch = pattern[j];
        body2 += ch === "\\" || ch === "^" ? "\\" + ch : ch;
        j++;
      }
      if (j < pattern.length && body2 !== "" && body2 !== "^") {
        re += `[${body2}]`;
        i2 = j;
      } else {
        re += "\\[";
      }
    } else {
      re += escapeRegExp2(c2);
    }
  }
  return re;
}
function parseGitignore(content, baseRel) {
  const rules = [];
  const prefix = baseRel ? escapeRegExp2(baseRel) + "/" : "";
  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.replace(/(?<!\\) +$/, "");
    if (!line || line.startsWith("#")) continue;
    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    if (!line) continue;
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    const body2 = patternToRegExpSource(line);
    const source = anchored ? `^${prefix}${body2}$` : `^${prefix}(?:[^/]+/)*${body2}$`;
    try {
      rules.push({ re: new RegExp(source), negated, dirOnly });
    } catch {
    }
  }
  return rules;
}
function isIgnored(rules, rel, isDir2) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir2) continue;
    if (rule.re.test(rel)) ignored = !rule.negated;
  }
  return ignored;
}
var init_ignore = __esm({
  "src/ignore.ts"() {
    "use strict";
    init_util();
  }
});
function walk(root, opts = {}) {
  const maxFileBytes = opts.maxFileBytes ?? 1024 * 1024;
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const useGitignore = opts.gitignore !== false;
  const out2 = [];
  let capped = false;
  let rootReal;
  try {
    rootReal = realpathSync(root);
  } catch {
    return { files: out2, capped };
  }
  const contained = (real) => real === rootReal || real.startsWith(rootReal + sep);
  const stack = [
    { dir: root, rel: "", rules: [] }
  ];
  const seenDirs = /* @__PURE__ */ new Set();
  walking: while (stack.length) {
    const frame = stack.pop();
    let real;
    try {
      real = realpathSync(frame.dir);
    } catch {
      continue;
    }
    if (seenDirs.has(real)) continue;
    seenDirs.add(real);
    if (!contained(real)) continue;
    let entries;
    try {
      entries = readdirSync2(frame.dir).sort();
    } catch {
      continue;
    }
    let rules = frame.rules;
    if (useGitignore && entries.includes(".gitignore")) {
      const parsed = parseGitignore(readText(join3(frame.dir, ".gitignore")), frame.rel);
      if (parsed.length) rules = [...rules, ...parsed];
    }
    for (const name2 of entries) {
      const abs = join3(frame.dir, name2);
      const rel = frame.rel ? `${frame.rel}/${name2}` : name2;
      let st;
      let isLink;
      try {
        st = statSync2(abs);
        isLink = lstatSync(abs).isSymbolicLink();
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (IGNORE_DIRS.has(name2)) continue;
        if (isLink) continue;
        if (useGitignore && rules.length && isIgnored(rules, rel, true)) continue;
        stack.push({ dir: abs, rel, rules });
        continue;
      }
      if (!st.isFile()) continue;
      if (st.size > maxFileBytes) continue;
      if (LOCKFILES.has(name2.toLowerCase())) continue;
      const ext = extname(name2).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      if (name2.endsWith(".min.js") || name2.endsWith(".min.css")) continue;
      if (useGitignore && rules.length && isIgnored(rules, rel, false)) continue;
      if (isLink) {
        try {
          if (!contained(realpathSync(abs))) continue;
        } catch {
          continue;
        }
      }
      if (out2.length >= maxFiles) {
        capped = true;
        break walking;
      }
      out2.push({ rel: rel.split(sep).join("/"), abs, size: st.size, ext, mtimeMs: st.mtimeMs });
    }
  }
  return { files: out2, capped };
}
function readText(abs) {
  try {
    const buf = readFileSync(abs);
    if (buf.length >= 2 && buf[0] === 255 && buf[1] === 254) {
      return buf.subarray(2, 2 + (buf.length - 2 & ~1)).toString("utf16le");
    }
    if (buf.length >= 2 && buf[0] === 254 && buf[1] === 255) {
      const swapped = Buffer.from(buf.subarray(2, 2 + (buf.length - 2 & ~1)));
      swapped.swap16();
      return swapped.toString("utf16le");
    }
    if (buf.length >= 3 && buf[0] === 239 && buf[1] === 187 && buf[2] === 191) return buf.subarray(3).toString("utf8");
    if (buf.includes(0)) return "";
    const text = buf.toString("utf8");
    return text.includes("\uFFFD") ? buf.toString("latin1") : text;
  } catch {
    return "";
  }
}
var IGNORE_DIRS;
var LOCKFILES;
var BINARY_EXT;
var DEFAULT_MAX_FILES;
var init_walk = __esm({
  "src/walk.ts"() {
    "use strict";
    init_ignore();
    IGNORE_DIRS = /* @__PURE__ */ new Set([
      ".git",
      "node_modules",
      ".pnpm",
      "bower_components",
      "vendor",
      "dist",
      "build",
      "out",
      "target",
      ".next",
      ".nuxt",
      ".svelte-kit",
      ".turbo",
      "coverage",
      "__pycache__",
      ".venv",
      "venv",
      ".tox",
      ".mypy_cache",
      ".pytest_cache",
      ".gradle",
      ".idea",
      ".vscode",
      ".cache",
      "tmp",
      ".ultraindex",
      "Pods",
      "DerivedData",
      ".terraform",
      "elm-stuff",
      ".dart_tool"
    ]);
    LOCKFILES = /* @__PURE__ */ new Set([
      "package-lock.json",
      "npm-shrinkwrap.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "bun.lockb",
      "composer.lock",
      "cargo.lock",
      "poetry.lock",
      "pipfile.lock",
      "gemfile.lock",
      "go.sum",
      "flake.lock",
      "packages.lock.json",
      "podfile.lock",
      "mix.lock"
    ]);
    BINARY_EXT = /* @__PURE__ */ new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".bmp",
      ".ico",
      ".icns",
      ".svg",
      ".pdf",
      ".zip",
      ".gz",
      ".tar",
      ".tgz",
      ".bz2",
      ".xz",
      ".7z",
      ".rar",
      ".jar",
      ".war",
      ".class",
      ".so",
      ".dylib",
      ".dll",
      ".exe",
      ".bin",
      ".o",
      ".a",
      ".wasm",
      ".woff",
      ".woff2",
      ".ttf",
      ".otf",
      ".eot",
      ".mp3",
      ".mp4",
      ".mov",
      ".avi",
      ".webm",
      ".wav",
      ".flac",
      ".ogg",
      ".lock",
      ".min.js",
      ".map"
    ]);
    DEFAULT_MAX_FILES = 2e4;
  }
});
function headCommit2(dir) {
  const res = sh2("git", ["-C", dir, "rev-parse", "--short", "HEAD"]);
  return res.ok ? res.stdout.trim() : void 0;
}
function isGitWorktree(dir) {
  return sh2("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"]).ok;
}
function resolveBaseRef(dir, base) {
  const verify = (ref) => sh2("git", [...gitArgs(dir), "rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).ok;
  const mergeBase = (ref) => {
    const mb = sh2("git", [...gitArgs(dir), "merge-base", ref, "HEAD"]);
    return mb.ok ? mb.stdout.trim() : void 0;
  };
  if (base) {
    if (!verify(base)) return { error: `base ref "${base}" not found (tried git rev-parse --verify)` };
    const mb = mergeBase(base);
    if (!mb) return { error: `no merge-base between "${base}" and HEAD` };
    return { ref: base, mergeBase: mb };
  }
  const originHead = sh2("git", [...gitArgs(dir), "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  const candidates = [
    ...originHead.ok ? [originHead.stdout.trim().replace("refs/remotes/", "")] : [],
    "origin/main",
    "origin/master",
    "main",
    "master"
  ];
  for (const c2 of candidates) {
    if (!verify(c2)) continue;
    const mb = mergeBase(c2);
    if (mb) return { ref: c2, mergeBase: mb };
  }
  const head = sh2("git", [...gitArgs(dir), "rev-parse", "HEAD"]);
  if (!head.ok) return { error: "cannot resolve HEAD \u2014 empty repository?" };
  return {
    ref: "HEAD",
    mergeBase: head.stdout.trim(),
    note: "base: HEAD (no default branch found \u2014 reviewing uncommitted work)"
  };
}
function diffFiles(dir, spec) {
  const out2 = [];
  const ns = sh2("git", [...gitArgs(dir), "diff", "-z", "-M", "--name-status", ...rangeArgs(spec)]);
  if (ns.ok) {
    const toks = ns.stdout.split("\0");
    let i2 = 0;
    while (i2 < toks.length) {
      const st = toks[i2++];
      if (!st) break;
      const code = st[0];
      if (code === "R" || code === "C") {
        const oldPath = toks[i2++];
        const path = toks[i2++];
        if (path) out2.push({ path, status: "renamed", oldPath });
      } else {
        const path = toks[i2++];
        if (!path) break;
        const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
        out2.push({ path, status });
      }
    }
  }
  const byPath = new Map(out2.map((f) => [f.path, f]));
  const num = sh2("git", [...gitArgs(dir), "diff", "-z", "-M", "--numstat", ...rangeArgs(spec)]);
  if (num.ok) {
    const toks = num.stdout.split("\0");
    let i2 = 0;
    while (i2 < toks.length) {
      const head = toks[i2++];
      if (!head) break;
      const m = head.match(/^(-|\d+)\t(-|\d+)\t([\s\S]*)$/);
      if (!m) continue;
      let path = m[3];
      if (path === "") {
        i2++;
        path = toks[i2++] ?? "";
      }
      const rec = byPath.get(path);
      if (!rec) continue;
      if (m[1] === "-") rec.binary = true;
      else {
        rec.linesAdded = Number(m[1]);
        rec.linesDeleted = Number(m[2]);
      }
    }
  }
  return out2;
}
function diffHunks(dir, spec) {
  const map = /* @__PURE__ */ new Map();
  const res = sh2("git", [...gitArgs(dir), "diff", "-M", "--unified=0", ...rangeArgs(spec)]);
  if (!res.ok) return map;
  let current;
  for (const line of res.stdout.split("\n")) {
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      if (p === "/dev/null") {
        current = void 0;
        continue;
      }
      const path = p.startsWith("b/") ? p.slice(2) : p;
      current = map.get(path) ?? [];
      map.set(path, current);
    } else if (current && line.startsWith("@@")) {
      const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (!m) continue;
      const start2 = Number(m[1]);
      const count = m[2] === void 0 ? 1 : Number(m[2]);
      if (count === 0) current.push({ start: Math.max(start2, 1), end: Math.max(start2, 1), approx: true });
      else current.push({ start: start2, end: start2 + count - 1 });
    }
  }
  return map;
}
function untrackedFiles(dir) {
  const res = sh2("git", [...gitArgs(dir), "ls-files", "--others", "--exclude-standard", "-z"]);
  if (!res.ok) return [];
  return res.stdout.split("\0").filter((p) => p.length > 0);
}
function gitChurn(dir, opts = {}) {
  const churn = /* @__PURE__ */ new Map();
  const range = opts.since ? [`${opts.since}..HEAD`] : [];
  const res = sh2("git", [...gitArgs(dir), "log", ...range, "--pretty=format:", "--name-only", "-z"]);
  if (!res.ok) return { churn, ok: false };
  for (const tok of res.stdout.split("\0")) {
    const f = tok.replace(/^\n+/, "").trim();
    if (f) churn.set(f, (churn.get(f) ?? 0) + 1);
  }
  return { churn, ok: true };
}
function changedSince(dir, ref) {
  const out2 = /* @__PURE__ */ new Set();
  const diff = sh2("git", [...gitArgs(dir), "diff", "-z", "--name-only", ref, "--"]);
  if (diff.ok) {
    for (const p of diff.stdout.split("\0")) if (p) out2.add(p);
  }
  for (const p of untrackedFiles(dir)) out2.add(p);
  return out2;
}
var gitArgs;
var rangeArgs;
var init_git = __esm({
  "src/git.ts"() {
    "use strict";
    init_util();
    gitArgs = (dir) => ["-C", dir, "-c", "core.quotePath=false"];
    rangeArgs = (spec) => spec.staged ? ["--cached"] : [spec.mergeBase];
  }
});
function sha1(s) {
  return createHash("sha1").update(s).digest("hex");
}
function shortHash(s, n = 8) {
  return sha1(s).slice(0, n);
}
var init_hash = __esm({
  "src/hash.ts"() {
    "use strict";
  }
});
function scan(rel, content, lang, rules) {
  const out2 = [];
  const lines = content.split(/\r?\n/);
  for (let i2 = 0; i2 < lines.length; i2++) {
    const line = lines[i2];
    if (!line.trim()) continue;
    for (const rule of rules) {
      const m = rule.re.exec(line);
      if (!m) continue;
      const name2 = m.groups?.name ?? m[1];
      if (!name2) continue;
      const exported = typeof rule.exported === "function" ? rule.exported(m, line) : rule.exported ?? false;
      out2.push({
        name: name2,
        kind: rule.kind,
        file: rel,
        line: i2 + 1,
        signature: line.trim().slice(0, 200),
        exported,
        lang
      });
      break;
    }
  }
  return out2;
}
function extToLang(ext) {
  return EXT_LANG[ext] ?? "other";
}
var EXT_LANG;
var init_common = __esm({
  "src/lang/common.ts"() {
    "use strict";
    EXT_LANG = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".mts": "typescript",
      ".cts": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".py": "python",
      ".pyi": "python",
      ".go": "go",
      ".rb": "ruby",
      ".rake": "ruby",
      ".java": "java",
      ".rs": "rust",
      ".c": "c",
      ".h": "c",
      ".cc": "cpp",
      ".cpp": "cpp",
      ".cxx": "cpp",
      ".hpp": "cpp",
      ".cs": "csharp",
      ".php": "php",
      ".swift": "swift",
      ".kt": "kotlin",
      ".kts": "kotlin",
      ".scala": "scala",
      ".sc": "scala",
      ".clj": "clojure",
      ".ex": "elixir",
      ".exs": "elixir",
      ".erl": "erlang",
      ".hs": "haskell",
      ".dart": "dart",
      ".lua": "lua",
      ".sh": "shell",
      ".bash": "shell",
      ".zsh": "shell",
      ".ksh": "shell",
      ".fish": "shell",
      ".hh": "cpp",
      ".m": "objective-c",
      ".mm": "objective-c",
      ".sql": "sql",
      ".graphql": "graphql",
      ".gql": "graphql",
      ".proto": "protobuf",
      ".md": "markdown",
      ".mdx": "markdown",
      ".rst": "restructuredtext",
      ".txt": "text",
      ".json": "json",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".toml": "toml",
      ".ini": "ini",
      ".html": "html",
      ".css": "css",
      ".scss": "scss",
      ".vue": "vue",
      ".svelte": "svelte"
    };
  }
});
var RULES;
var jsTs;
var init_js_ts = __esm({
  "src/lang/js-ts.ts"() {
    "use strict";
    init_common();
    RULES = [
      { re: /^\s*export\s+(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: true },
      { re: /^\s*export\s+default\s+(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: true },
      { re: /^\s*export\s+default\s+(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: true },
      { re: /^\s*(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: false },
      { re: /^\s*export\s+(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: true },
      { re: /^\s*(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: false },
      { re: /^\s*export\s+interface\s+(?<name>[\w$]+)/, kind: "interface", exported: true },
      { re: /^\s*interface\s+(?<name>[\w$]+)/, kind: "interface", exported: false },
      { re: /^\s*export\s+type\s+(?<name>[\w$]+)/, kind: "type", exported: true },
      { re: /^\s*type\s+(?<name>[\w$]+)\s*[=<]/, kind: "type", exported: false },
      { re: /^\s*export\s+enum\s+(?<name>[\w$]+)/, kind: "enum", exported: true },
      { re: /^\s*export\s+const\s+enum\s+(?<name>[\w$]+)/, kind: "enum", exported: true },
      // exported const/let bound to an arrow fn or value
      { re: /^\s*export\s+(?:const|let|var)\s+(?<name>[\w$]+)\s*[:=]/, kind: "const", exported: true },
      // top-level const arrow function (not exported)
      { re: /^\s*(?:const|let)\s+(?<name>[\w$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/, kind: "const", exported: false },
      // `export default Foo;` — a class/const declared above and exported by reference.
      { re: /^\s*export\s+default\s+(?<name>[A-Za-z_$][\w$]*)\s*;?\s*$/, kind: "default", exported: true }
    ];
    jsTs = {
      lang: "javascript/typescript",
      exts: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
      extract(rel, content) {
        const lang = rel.match(/\.(ts|tsx|mts|cts)$/) ? "typescript" : "javascript";
        return scan(rel, content, lang, RULES);
      }
    };
  }
});
var pub;
var RULES2;
var python;
var init_python = __esm({
  "src/lang/python.ts"() {
    "use strict";
    init_common();
    pub = (name2) => !name2.startsWith("_") || name2.startsWith("__");
    RULES2 = [
      { re: /^(?:async\s+)?def\s+(?<name>[\w]+)\s*\(/, kind: "function", exported: (m) => pub(m.groups.name) },
      { re: /^\s+(?:async\s+)?def\s+(?<name>[\w]+)\s*\(/, kind: "method", exported: (m) => pub(m.groups.name) },
      { re: /^class\s+(?<name>[\w]+)/, kind: "class", exported: (m) => pub(m.groups.name) },
      { re: /^\s+class\s+(?<name>[\w]+)/, kind: "class", exported: (m) => pub(m.groups.name) }
    ];
    python = {
      lang: "python",
      exts: [".py", ".pyi"],
      extract(rel, content) {
        return scan(rel, content, "python", RULES2);
      }
    };
  }
});
var upper;
var RULES3;
var go;
var init_go = __esm({
  "src/lang/go.ts"() {
    "use strict";
    init_common();
    upper = (name2) => /^[A-Z]/.test(name2);
    RULES3 = [
      { re: /^func\s+\([^)]*\)\s+(?<name>[\w]+)\s*\(/, kind: "method", exported: (m) => upper(m.groups.name) },
      { re: /^func\s+(?<name>[\w]+)\s*\(/, kind: "function", exported: (m) => upper(m.groups.name) },
      { re: /^type\s+(?<name>[\w]+)\s+struct\b/, kind: "struct", exported: (m) => upper(m.groups.name) },
      { re: /^type\s+(?<name>[\w]+)\s+interface\b/, kind: "interface", exported: (m) => upper(m.groups.name) },
      { re: /^type\s+(?<name>[\w]+)\s+/, kind: "type", exported: (m) => upper(m.groups.name) }
    ];
    go = {
      lang: "go",
      exts: [".go"],
      extract(rel, content) {
        return scan(rel, content, "go", RULES3);
      }
    };
  }
});
var RULES4;
var ruby;
var init_ruby = __esm({
  "src/lang/ruby.ts"() {
    "use strict";
    init_common();
    RULES4 = [
      { re: /^\s*def\s+(?:self\.)?(?<name>[\w?!=]+)/, kind: "method", exported: true },
      { re: /^\s*class\s+(?<name>[\w:]+)/, kind: "class", exported: true },
      { re: /^\s*module\s+(?<name>[\w:]+)/, kind: "module", exported: true }
    ];
    ruby = {
      lang: "ruby",
      exts: [".rb", ".rake"],
      extract(rel, content) {
        return scan(rel, content, "ruby", RULES4);
      }
    };
  }
});
var RULES5;
var java;
var init_java = __esm({
  "src/lang/java.ts"() {
    "use strict";
    init_common();
    RULES5 = [
      { re: /^\s*(?:public|protected|private)?\s*(?:abstract\s+|final\s+)?class\s+(?<name>[\w]+)/, kind: "class", exported: (_m, l) => /\bpublic\b/.test(l) },
      { re: /^\s*(?:public|protected|private)?\s*interface\s+(?<name>[\w]+)/, kind: "interface", exported: (_m, l) => /\bpublic\b/.test(l) },
      { re: /^\s*(?:public|protected|private)?\s*enum\s+(?<name>[\w]+)/, kind: "enum", exported: (_m, l) => /\bpublic\b/.test(l) },
      { re: /^\s*(?:public|protected|private)\s+(?:static\s+|final\s+|abstract\s+|synchronized\s+)*[\w<>\[\],.?\s]+\s+(?<name>[\w]+)\s*\(/, kind: "method", exported: (_m, l) => /\bpublic\b/.test(l) }
    ];
    java = {
      lang: "java",
      exts: [".java"],
      extract(rel, content) {
        return scan(rel, content, "java", RULES5);
      }
    };
  }
});
var isPub;
var RULES6;
var rust;
var init_rust = __esm({
  "src/lang/rust.ts"() {
    "use strict";
    init_common();
    isPub = (_m, l) => /^\s*pub\b/.test(l);
    RULES6 = [
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(?<name>[\w]+)/, kind: "function", exported: isPub },
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+(?<name>[\w]+)/, kind: "struct", exported: isPub },
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+(?<name>[\w]+)/, kind: "enum", exported: isPub },
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+(?<name>[\w]+)/, kind: "trait", exported: isPub },
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?type\s+(?<name>[\w]+)/, kind: "type", exported: isPub }
    ];
    rust = {
      lang: "rust",
      exts: [".rs"],
      extract(rel, content) {
        return scan(rel, content, "rust", RULES6);
      }
    };
  }
});
var pub2;
var RULES7;
var csharp;
var init_csharp = __esm({
  "src/lang/csharp.ts"() {
    "use strict";
    init_common();
    pub2 = (_m, l) => /\b(public|internal)\b/.test(l);
    RULES7 = [
      { re: /^\s*(?:public|internal|protected|private)?\s*(?:static\s+|sealed\s+|abstract\s+|partial\s+)*(?:class|record)\s+(?<name>\w+)/, kind: "class", exported: pub2 },
      { re: /^\s*(?:public|internal|protected|private)?\s*(?:partial\s+)?interface\s+(?<name>\w+)/, kind: "interface", exported: pub2 },
      { re: /^\s*(?:public|internal|protected|private)?\s*(?:readonly\s+)?(?:ref\s+)?struct\s+(?<name>\w+)/, kind: "struct", exported: pub2 },
      { re: /^\s*(?:public|internal|protected|private)?\s*enum\s+(?<name>\w+)/, kind: "enum", exported: pub2 },
      // method: a visibility modifier, a return type, then `name(`
      { re: /^\s*(?:public|internal|protected|private)\s+(?:static\s+|virtual\s+|override\s+|async\s+|sealed\s+|abstract\s+|new\s+)*[\w<>\[\],.?]+\s+(?<name>\w+)\s*(?:<[^>]*>)?\s*\(/, kind: "method", exported: pub2 }
    ];
    csharp = {
      lang: "csharp",
      exts: [".cs"],
      extract(rel, content) {
        return scan(rel, content, "csharp", RULES7);
      }
    };
  }
});
var RULES8;
var php;
var init_php = __esm({
  "src/lang/php.ts"() {
    "use strict";
    init_common();
    RULES8 = [
      { re: /^\s*(?:abstract\s+|final\s+)*class\s+(?<name>\w+)/, kind: "class", exported: true },
      { re: /^\s*interface\s+(?<name>\w+)/, kind: "interface", exported: true },
      { re: /^\s*trait\s+(?<name>\w+)/, kind: "trait", exported: true },
      { re: /^\s*enum\s+(?<name>\w+)/, kind: "enum", exported: true },
      {
        re: /^\s*(?:public\s+|protected\s+|private\s+|static\s+|abstract\s+|final\s+)*function\s+(?<name>\w+)\s*\(/,
        kind: "function",
        exported: (_m, l) => !/\b(private|protected)\b/.test(l)
      }
    ];
    php = {
      lang: "php",
      exts: [".php"],
      extract(rel, content) {
        return scan(rel, content, "php", RULES8);
      }
    };
  }
});
var vis;
var MODS;
var RULES9;
var swift;
var init_swift = __esm({
  "src/lang/swift.ts"() {
    "use strict";
    init_common();
    vis = (_m, l) => !/\b(private|fileprivate)\b/.test(l);
    MODS = "(?:public\\s+|open\\s+|internal\\s+|private\\s+|fileprivate\\s+)?(?:final\\s+)?";
    RULES9 = [
      { re: new RegExp(`^\\s*${MODS}class\\s+(?<name>\\w+)`), kind: "class", exported: vis },
      { re: new RegExp(`^\\s*${MODS}struct\\s+(?<name>\\w+)`), kind: "struct", exported: vis },
      { re: new RegExp(`^\\s*${MODS}enum\\s+(?<name>\\w+)`), kind: "enum", exported: vis },
      { re: new RegExp(`^\\s*${MODS}protocol\\s+(?<name>\\w+)`), kind: "protocol", exported: vis },
      { re: /^\s*(?:public\s+|open\s+|internal\s+|private\s+|fileprivate\s+)?(?:static\s+|class\s+|final\s+|override\s+|mutating\s+|@\w+\s+)*func\s+(?<name>\w+)/, kind: "function", exported: vis }
    ];
    swift = {
      lang: "swift",
      exts: [".swift"],
      extract(rel, content) {
        return scan(rel, content, "swift", RULES9);
      }
    };
  }
});
var vis2;
var RULES10;
var kotlin;
var init_kotlin = __esm({
  "src/lang/kotlin.ts"() {
    "use strict";
    init_common();
    vis2 = (_m, l) => !/\b(private|internal)\b/.test(l);
    RULES10 = [
      { re: /^\s*(?:public\s+|internal\s+|private\s+|abstract\s+|sealed\s+|open\s+|final\s+|data\s+)*class\s+(?<name>\w+)/, kind: "class", exported: vis2 },
      { re: /^\s*(?:public\s+|internal\s+|private\s+|fun\s+)?interface\s+(?<name>\w+)/, kind: "interface", exported: vis2 },
      { re: /^\s*(?:public\s+|internal\s+|private\s+|companion\s+)?object\s+(?<name>\w+)/, kind: "object", exported: vis2 },
      { re: /^\s*(?:public\s+|internal\s+|private\s+|protected\s+|override\s+|open\s+|abstract\s+|suspend\s+|inline\s+|operator\s+)*fun\s+(?:<[^>]*>\s+)?(?<name>\w+)\s*\(/, kind: "function", exported: vis2 }
    ];
    kotlin = {
      lang: "kotlin",
      exts: [".kt", ".kts"],
      extract(rel, content) {
        return scan(rel, content, "kotlin", RULES10);
      }
    };
  }
});
var NOT_KEYWORD;
var RULES11;
var c;
var init_c = __esm({
  "src/lang/c.ts"() {
    "use strict";
    init_common();
    NOT_KEYWORD = "(?!\\s*(?:if|for|while|switch|return|else|do|sizeof|typedef)\\b)";
    RULES11 = [
      // C++ types
      { re: /^\s*(?:class|struct)\s+(?<name>[A-Za-z_]\w+)\s*(?:[:{]|$)/, kind: "class", exported: true },
      { re: /^\s*namespace\s+(?<name>[A-Za-z_]\w+)/, kind: "namespace", exported: true },
      // typedef struct/enum/union NAME {
      { re: /^\s*(?:typedef\s+)?(?:struct|enum|union)\s+(?<name>[A-Za-z_]\w+)\s*\{/, kind: "struct", exported: true },
      // function definition: <type ...> name(<args>) [const] {?  at column 0-ish
      { re: new RegExp(`^${NOT_KEYWORD}[A-Za-z_][\\w\\s\\*&<>:,]*?\\b(?<name>[A-Za-z_]\\w+)\\s*\\([^;{]*\\)\\s*(?:const)?\\s*\\{?\\s*$`), kind: "function", exported: true }
    ];
    c = {
      lang: "c/cpp",
      exts: [".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"],
      extract(rel, content) {
        return scan(rel, content, rel.match(/\.(c|h)$/) ? "c" : "cpp", RULES11);
      }
    };
  }
});
var RULES12;
var lua;
var init_lua = __esm({
  "src/lang/lua.ts"() {
    "use strict";
    init_common();
    RULES12 = [
      { re: /^\s*local\s+function\s+(?<name>[\w.:]+)\s*\(/, kind: "function", exported: false },
      { re: /^\s*function\s+(?<name>[\w.:]+)\s*\(/, kind: "function", exported: true },
      { re: /^\s*(?:local\s+)?(?<name>[\w.]+)\s*=\s*function\s*\(/, kind: "function", exported: true }
    ];
    lua = {
      lang: "lua",
      exts: [".lua"],
      extract(rel, content) {
        return scan(rel, content, "lua", RULES12);
      }
    };
  }
});
var RULES13;
var shell;
var init_shell = __esm({
  "src/lang/shell.ts"() {
    "use strict";
    init_common();
    RULES13 = [
      { re: /^\s*function\s+(?<name>[\w:-]+)\s*(?:\(\))?\s*\{?/, kind: "function", exported: true },
      { re: /^\s*(?<name>[A-Za-z_][\w:-]*)\s*\(\)\s*\{?/, kind: "function", exported: true }
    ];
    shell = {
      lang: "shell",
      exts: [".sh", ".bash", ".zsh", ".ksh"],
      extract(rel, content) {
        return scan(rel, content, "shell", RULES13);
      }
    };
  }
});
var RULES14;
var elixir;
var init_elixir = __esm({
  "src/lang/elixir.ts"() {
    "use strict";
    init_common();
    RULES14 = [
      { re: /^\s*defmodule\s+(?<name>[\w.]+)/, kind: "module", exported: true },
      { re: /^\s*defp\s+(?<name>[\w?!]+)/, kind: "function", exported: false },
      { re: /^\s*def\s+(?<name>[\w?!]+)/, kind: "function", exported: true },
      { re: /^\s*defmacrop?\s+(?<name>[\w?!]+)/, kind: "macro", exported: true }
    ];
    elixir = {
      lang: "elixir",
      exts: [".ex", ".exs"],
      extract(rel, content) {
        return scan(rel, content, "elixir", RULES14);
      }
    };
  }
});
var RULES15;
var scala;
var init_scala = __esm({
  "src/lang/scala.ts"() {
    "use strict";
    init_common();
    RULES15 = [
      { re: /^\s*(?:final\s+|sealed\s+|abstract\s+|implicit\s+)*(?:case\s+)?class\s+(?<name>\w+)/, kind: "class", exported: true },
      { re: /^\s*(?:sealed\s+)?trait\s+(?<name>\w+)/, kind: "trait", exported: true },
      { re: /^\s*(?:case\s+)?object\s+(?<name>\w+)/, kind: "object", exported: true },
      { re: /^\s*(?:override\s+|final\s+|private\s+|protected\s+|implicit\s+)*def\s+(?<name>\w+)/, kind: "def", exported: (_m, l) => !/\b(private|protected)\b/.test(l) }
    ];
    scala = {
      lang: "scala",
      exts: [".scala", ".sc"],
      extract(rel, content) {
        return scan(rel, content, "scala", RULES15);
      }
    };
  }
});
function extractSymbols(rel, ext, content) {
  const extractor = BY_EXT.get(ext);
  if (!extractor) return [];
  try {
    return extractor.extract(rel, content);
  } catch {
    return [];
  }
}
function languageOf(ext) {
  return BY_EXT.get(ext)?.lang ?? extToLang(ext);
}
var EXTRACTORS;
var BY_EXT;
var init_registry = __esm({
  "src/lang/registry.ts"() {
    "use strict";
    init_common();
    init_js_ts();
    init_python();
    init_go();
    init_ruby();
    init_java();
    init_rust();
    init_csharp();
    init_php();
    init_swift();
    init_kotlin();
    init_c();
    init_lua();
    init_shell();
    init_elixir();
    init_scala();
    EXTRACTORS = [
      jsTs,
      python,
      go,
      ruby,
      java,
      rust,
      csharp,
      php,
      swift,
      kotlin,
      c,
      lua,
      shell,
      elixir,
      scala
    ];
    BY_EXT = /* @__PURE__ */ new Map();
    for (const e of EXTRACTORS) for (const ext of e.exts) BY_EXT.set(ext, e);
  }
});
function isDoc(rel, ext) {
  const base = rel.split("/").pop().toLowerCase();
  return DOC_EXT.has(ext) || DOC_BASENAME.test(base) || DOC_DIR.test(rel);
}
function isConfig(rel, ext) {
  const base = rel.split("/").pop().toLowerCase();
  return CONFIG_BASENAME.has(base) || CONFIG_EXT.has(ext);
}
function isCode(ext) {
  return !NON_CODE_LANGS.has(languageOf(ext));
}
function classify(rel, ext) {
  if (isCode(ext)) return "code";
  if (isDoc(rel, ext)) return "doc";
  if (isConfig(rel, ext)) return "config";
  return "other";
}
var DOC_BASENAME;
var DOC_EXT;
var DOC_DIR;
var CONFIG_BASENAME;
var CONFIG_EXT;
var MARKDOWN_EXT;
var NON_CODE_LANGS;
var init_classify = __esm({
  "src/classify.ts"() {
    "use strict";
    init_registry();
    DOC_BASENAME = /^(readme|changelog|contributing|history|news|authors|notice|security|code_of_conduct|faq|getting[-_]?started|usage|guide|tutorial)\b/i;
    DOC_EXT = /* @__PURE__ */ new Set([".md", ".mdx", ".rst", ".adoc", ".txt"]);
    DOC_DIR = /^(docs?|documentation|wiki|guides?|website|site|book)\//i;
    CONFIG_BASENAME = /* @__PURE__ */ new Set([
      "package.json",
      "pnpm-workspace.yaml",
      "tsconfig.json",
      "jsconfig.json",
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
      "docker-compose.yaml",
      "makefile",
      ".env.example",
      "manifest.json"
    ]);
    CONFIG_EXT = /* @__PURE__ */ new Set([".json", ".yaml", ".yml", ".toml", ".ini", ".cfg"]);
    MARKDOWN_EXT = /* @__PURE__ */ new Set([".md", ".mdx"]);
    NON_CODE_LANGS = /* @__PURE__ */ new Set([
      "markdown",
      "restructuredtext",
      "text",
      "json",
      "yaml",
      "toml",
      "ini",
      "other",
      "html",
      "css",
      "scss"
    ]);
  }
});
function globToRegExp(glob) {
  let re = "";
  for (let i2 = 0; i2 < glob.length; i2++) {
    const c2 = glob[i2];
    if (c2 === "*") {
      if (glob[i2 + 1] === "*") {
        i2++;
        if (glob[i2 + 1] === "/") {
          i2++;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c2 === "?") {
      re += "[^/]";
    } else {
      re += escapeRegExp2(c2);
    }
  }
  return new RegExp(`^${re}$`);
}
function compileGlobs(globs) {
  if (!globs || globs.length === 0) return null;
  const res = globs.map(globToRegExp);
  return (rel) => res.some((r) => r.test(rel));
}
var init_glob = __esm({
  "src/glob.ts"() {
    "use strict";
    init_util();
  }
});
function byStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function byKey(keyOf2) {
  return (a, b) => byStr(keyOf2(a), keyOf2(b));
}
var init_sort = __esm({
  "src/sort.ts"() {
    "use strict";
  }
});
function stripFences(content) {
  const lines = content.split(/\r?\n/);
  const out2 = [];
  let fence = null;
  for (const line of lines) {
    const m = /^\s*(```+|~~~+)/.exec(line);
    if (fence) {
      if (m && line.trim().startsWith(fence[0][0].repeat(3).slice(0, 3))) fence = null;
      out2.push("");
      continue;
    }
    if (m) {
      fence = m[1];
      out2.push("");
      continue;
    }
    out2.push(line);
  }
  return out2.join("\n");
}
function isExternalTarget(spec) {
  if (!spec) return true;
  if (spec.startsWith("#")) return true;
  if (spec.startsWith("//")) return true;
  return /^[a-z][a-z0-9+.-]*:/i.test(spec);
}
function cleanProse(line) {
  return line.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/`([^`]*)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#>*_~-]+/g, " ").replace(/\s+/g, " ").trim();
}
function hasProse(s) {
  return /[A-Za-zÀ-ɏ]{3,}/.test(s);
}
function isBoilerplate(s) {
  return /^(all notable changes to this project|in the interest of fostering|this project adheres to|we as members and leaders|table of contents)\b/i.test(s);
}
function extractMarkdown(content) {
  let body2 = content;
  let frontTitle;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body2);
  if (fm) {
    const t = /(^|\n)title:\s*["']?(.+?)["']?\s*(\n|$)/i.exec(fm[1]);
    if (t) frontTitle = t[2].trim();
    body2 = body2.slice(fm[0].length);
  }
  const scan22 = stripFences(body2);
  const lines = scan22.split(/\r?\n/);
  const headings = [];
  let title = frontTitle;
  let summary;
  let summaryClosed = false;
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      const text = cleanProse(h[2]);
      headings.push(text);
      if (!title && h[1].length === 1) title = text;
      if (!summary && h[1].length >= 2) summaryClosed = true;
      continue;
    }
    if (!summary && !summaryClosed) {
      const t = line.trim();
      if (t && !/^([-*+]|\d+\.)\s/.test(t) && !t.startsWith("|") && !t.startsWith("<")) {
        const cleaned = cleanProse(t);
        if (cleaned.length >= 8 && hasProse(cleaned) && !cleaned.endsWith(":") && !isBoilerplate(cleaned)) {
          summary = cleaned.slice(0, 200);
        }
      }
    }
  }
  const refs = [];
  const seen = /* @__PURE__ */ new Set();
  const addRef = (raw) => {
    let spec = raw.trim();
    spec = spec.replace(/\s+["'(].*$/, "").trim();
    spec = spec.replace(/^<|>$/g, "");
    if (isExternalTarget(spec)) return;
    if (seen.has(spec)) return;
    seen.add(spec);
    refs.push({ kind: "doc-link", spec });
  };
  const inline = /!?\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while (m = inline.exec(scan22)) addRef(m[1]);
  const refdef = /^\s*\[[^\]]+\]:\s+(\S+)/gm;
  while (m = refdef.exec(scan22)) addRef(m[1]);
  return { title, summary, headings, refs };
}
var init_markdown = __esm({
  "src/extract/markdown.ts"() {
    "use strict";
  }
});
function assertInternal(x) {
  if (x !== INTERNAL) throw new Error("Illegal constructor");
}
function isPoint(point) {
  return !!point && typeof point.row === "number" && typeof point.column === "number";
}
function setModule(module2) {
  C = module2;
}
function getText(tree, startIndex, endIndex, startPosition) {
  const length = endIndex - startIndex;
  let result = tree.textCallback(startIndex, startPosition);
  if (result) {
    startIndex += result.length;
    while (startIndex < endIndex) {
      const string = tree.textCallback(startIndex, startPosition);
      if (string && string.length > 0) {
        startIndex += string.length;
        result += string;
      } else {
        break;
      }
    }
    if (startIndex > endIndex) {
      result = result.slice(0, length);
    }
  }
  return result ?? "";
}
function unmarshalCaptures(query4, tree, address, patternIndex, result) {
  for (let i2 = 0, n = result.length; i2 < n; i2++) {
    const captureIndex = C.getValue(address, "i32");
    address += SIZE_OF_INT;
    const node = unmarshalNode(tree, address);
    address += SIZE_OF_NODE;
    result[i2] = { patternIndex, name: query4.captureNames[captureIndex], node };
  }
  return address;
}
function marshalNode(node, index = 0) {
  let address = TRANSFER_BUFFER + index * SIZE_OF_NODE;
  C.setValue(address, node.id, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startPosition.row, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startPosition.column, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node[0], "i32");
}
function unmarshalNode(tree, address = TRANSFER_BUFFER) {
  const id = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  if (id === 0) return null;
  const index = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const row = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const column = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const other = C.getValue(address, "i32");
  const result = new Node(INTERNAL, {
    id,
    tree,
    startIndex: index,
    startPosition: { row, column },
    other
  });
  return result;
}
function marshalTreeCursor(cursor, address = TRANSFER_BUFFER) {
  C.setValue(address + 0 * SIZE_OF_INT, cursor[0], "i32");
  C.setValue(address + 1 * SIZE_OF_INT, cursor[1], "i32");
  C.setValue(address + 2 * SIZE_OF_INT, cursor[2], "i32");
  C.setValue(address + 3 * SIZE_OF_INT, cursor[3], "i32");
}
function unmarshalTreeCursor(cursor) {
  cursor[0] = C.getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32");
  cursor[1] = C.getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32");
  cursor[2] = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
  cursor[3] = C.getValue(TRANSFER_BUFFER + 3 * SIZE_OF_INT, "i32");
}
function marshalPoint(address, point) {
  C.setValue(address, point.row, "i32");
  C.setValue(address + SIZE_OF_INT, point.column, "i32");
}
function unmarshalPoint(address) {
  const result = {
    row: C.getValue(address, "i32") >>> 0,
    column: C.getValue(address + SIZE_OF_INT, "i32") >>> 0
  };
  return result;
}
function marshalRange(address, range) {
  marshalPoint(address, range.startPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, range.endPosition);
  address += SIZE_OF_POINT;
  C.setValue(address, range.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, range.endIndex, "i32");
  address += SIZE_OF_INT;
}
function unmarshalRange(address) {
  const result = {};
  result.startPosition = unmarshalPoint(address);
  address += SIZE_OF_POINT;
  result.endPosition = unmarshalPoint(address);
  address += SIZE_OF_POINT;
  result.startIndex = C.getValue(address, "i32") >>> 0;
  address += SIZE_OF_INT;
  result.endIndex = C.getValue(address, "i32") >>> 0;
  return result;
}
function marshalEdit(edit, address = TRANSFER_BUFFER) {
  marshalPoint(address, edit.startPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, edit.oldEndPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, edit.newEndPosition);
  address += SIZE_OF_POINT;
  C.setValue(address, edit.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, edit.oldEndIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, edit.newEndIndex, "i32");
  address += SIZE_OF_INT;
}
function unmarshalLanguageMetadata(address) {
  const major_version = C.getValue(address, "i32");
  const minor_version = C.getValue(address += SIZE_OF_INT, "i32");
  const patch_version = C.getValue(address += SIZE_OF_INT, "i32");
  return { major_version, minor_version, patch_version };
}
async function Module2(moduleArg = {}) {
  var moduleRtn;
  var Module = moduleArg;
  var ENVIRONMENT_IS_WEB = typeof window == "object";
  var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";
  var ENVIRONMENT_IS_NODE = typeof process == "object" && process.versions?.node && process.type != "renderer";
  if (ENVIRONMENT_IS_NODE) {
    const { createRequire } = await import("module");
    var require = createRequire(import.meta.url);
  }
  Module.currentQueryProgressCallback = null;
  Module.currentProgressCallback = null;
  Module.currentLogCallback = null;
  Module.currentParseCallback = null;
  var arguments_ = [];
  var thisProgram = "./this.program";
  var quit_ = /* @__PURE__ */ __name((status, toThrow) => {
    throw toThrow;
  }, "quit_");
  var _scriptName = import.meta.url;
  var scriptDirectory = "";
  function locateFile(path) {
    if (Module["locateFile"]) {
      return Module["locateFile"](path, scriptDirectory);
    }
    return scriptDirectory + path;
  }
  __name(locateFile, "locateFile");
  var readAsync, readBinary;
  if (ENVIRONMENT_IS_NODE) {
    var fs = require("fs");
    if (_scriptName.startsWith("file:")) {
      scriptDirectory = require("path").dirname(require("url").fileURLToPath(_scriptName)) + "/";
    }
    readBinary = /* @__PURE__ */ __name((filename) => {
      filename = isFileURI(filename) ? new URL(filename) : filename;
      var ret = fs.readFileSync(filename);
      return ret;
    }, "readBinary");
    readAsync = /* @__PURE__ */ __name(async (filename, binary2 = true) => {
      filename = isFileURI(filename) ? new URL(filename) : filename;
      var ret = fs.readFileSync(filename, binary2 ? void 0 : "utf8");
      return ret;
    }, "readAsync");
    if (process.argv.length > 1) {
      thisProgram = process.argv[1].replace(/\\/g, "/");
    }
    arguments_ = process.argv.slice(2);
    quit_ = /* @__PURE__ */ __name((status, toThrow) => {
      process.exitCode = status;
      throw toThrow;
    }, "quit_");
  } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    try {
      scriptDirectory = new URL(".", _scriptName).href;
    } catch {
    }
    {
      if (ENVIRONMENT_IS_WORKER) {
        readBinary = /* @__PURE__ */ __name((url) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.responseType = "arraybuffer";
          xhr.send(null);
          return new Uint8Array(
            /** @type{!ArrayBuffer} */
            xhr.response
          );
        }, "readBinary");
      }
      readAsync = /* @__PURE__ */ __name(async (url) => {
        if (isFileURI(url)) {
          return new Promise((resolve22, reject) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.responseType = "arraybuffer";
            xhr.onload = () => {
              if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                resolve22(xhr.response);
                return;
              }
              reject(xhr.status);
            };
            xhr.onerror = reject;
            xhr.send(null);
          });
        }
        var response = await fetch(url, {
          credentials: "same-origin"
        });
        if (response.ok) {
          return response.arrayBuffer();
        }
        throw new Error(response.status + " : " + response.url);
      }, "readAsync");
    }
  } else {
  }
  var out = console.log.bind(console);
  var err = console.error.bind(console);
  var dynamicLibraries = [];
  var wasmBinary;
  var ABORT = false;
  var EXITSTATUS;
  var isFileURI = /* @__PURE__ */ __name((filename) => filename.startsWith("file://"), "isFileURI");
  var readyPromiseResolve, readyPromiseReject;
  var wasmMemory;
  var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
  var HEAP64, HEAPU64;
  var HEAP_DATA_VIEW;
  var runtimeInitialized = false;
  function updateMemoryViews() {
    var b = wasmMemory.buffer;
    Module["HEAP8"] = HEAP8 = new Int8Array(b);
    Module["HEAP16"] = HEAP16 = new Int16Array(b);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
    Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
    Module["HEAP32"] = HEAP32 = new Int32Array(b);
    Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
    Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
    Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
    Module["HEAP64"] = HEAP64 = new BigInt64Array(b);
    Module["HEAPU64"] = HEAPU64 = new BigUint64Array(b);
    Module["HEAP_DATA_VIEW"] = HEAP_DATA_VIEW = new DataView(b);
    LE_HEAP_UPDATE();
  }
  __name(updateMemoryViews, "updateMemoryViews");
  function initMemory() {
    if (Module["wasmMemory"]) {
      wasmMemory = Module["wasmMemory"];
    } else {
      var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 33554432;
      wasmMemory = new WebAssembly.Memory({
        "initial": INITIAL_MEMORY / 65536,
        // In theory we should not need to emit the maximum if we want "unlimited"
        // or 4GB of memory, but VMs error on that atm, see
        // https://github.com/emscripten-core/emscripten/issues/14130
        // And in the pthreads case we definitely need to emit a maximum. So
        // always emit one.
        "maximum": 32768
      });
    }
    updateMemoryViews();
  }
  __name(initMemory, "initMemory");
  var __RELOC_FUNCS__ = [];
  function preRun() {
    if (Module["preRun"]) {
      if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
      while (Module["preRun"].length) {
        addOnPreRun(Module["preRun"].shift());
      }
    }
    callRuntimeCallbacks(onPreRuns);
  }
  __name(preRun, "preRun");
  function initRuntime() {
    runtimeInitialized = true;
    callRuntimeCallbacks(__RELOC_FUNCS__);
    wasmExports["__wasm_call_ctors"]();
    callRuntimeCallbacks(onPostCtors);
  }
  __name(initRuntime, "initRuntime");
  function preMain() {
  }
  __name(preMain, "preMain");
  function postRun() {
    if (Module["postRun"]) {
      if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
      while (Module["postRun"].length) {
        addOnPostRun(Module["postRun"].shift());
      }
    }
    callRuntimeCallbacks(onPostRuns);
  }
  __name(postRun, "postRun");
  function abort(what) {
    Module["onAbort"]?.(what);
    what = "Aborted(" + what + ")";
    err(what);
    ABORT = true;
    what += ". Build with -sASSERTIONS for more info.";
    var e = new WebAssembly.RuntimeError(what);
    readyPromiseReject?.(e);
    throw e;
  }
  __name(abort, "abort");
  var wasmBinaryFile;
  function findWasmBinary() {
    if (Module["locateFile"]) {
      return locateFile("web-tree-sitter.wasm");
    }
    return new URL("web-tree-sitter.wasm", import.meta.url).href;
  }
  __name(findWasmBinary, "findWasmBinary");
  function getBinarySync(file) {
    if (file == wasmBinaryFile && wasmBinary) {
      return new Uint8Array(wasmBinary);
    }
    if (readBinary) {
      return readBinary(file);
    }
    throw "both async and sync fetching of the wasm failed";
  }
  __name(getBinarySync, "getBinarySync");
  async function getWasmBinary(binaryFile) {
    if (!wasmBinary) {
      try {
        var response = await readAsync(binaryFile);
        return new Uint8Array(response);
      } catch {
      }
    }
    return getBinarySync(binaryFile);
  }
  __name(getWasmBinary, "getWasmBinary");
  async function instantiateArrayBuffer(binaryFile, imports) {
    try {
      var binary2 = await getWasmBinary(binaryFile);
      var instance2 = await WebAssembly.instantiate(binary2, imports);
      return instance2;
    } catch (reason) {
      err(`failed to asynchronously prepare wasm: ${reason}`);
      abort(reason);
    }
  }
  __name(instantiateArrayBuffer, "instantiateArrayBuffer");
  async function instantiateAsync(binary2, binaryFile, imports) {
    if (!binary2 && !isFileURI(binaryFile) && !ENVIRONMENT_IS_NODE) {
      try {
        var response = fetch(binaryFile, {
          credentials: "same-origin"
        });
        var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
        return instantiationResult;
      } catch (reason) {
        err(`wasm streaming compile failed: ${reason}`);
        err("falling back to ArrayBuffer instantiation");
      }
    }
    return instantiateArrayBuffer(binaryFile, imports);
  }
  __name(instantiateAsync, "instantiateAsync");
  function getWasmImports() {
    return {
      "env": wasmImports,
      "wasi_snapshot_preview1": wasmImports,
      "GOT.mem": new Proxy(wasmImports, GOTHandler),
      "GOT.func": new Proxy(wasmImports, GOTHandler)
    };
  }
  __name(getWasmImports, "getWasmImports");
  async function createWasm() {
    function receiveInstance(instance2, module2) {
      wasmExports = instance2.exports;
      wasmExports = relocateExports(wasmExports, 1024);
      var metadata2 = getDylinkMetadata(module2);
      if (metadata2.neededDynlibs) {
        dynamicLibraries = metadata2.neededDynlibs.concat(dynamicLibraries);
      }
      mergeLibSymbols(wasmExports, "main");
      LDSO.init();
      loadDylibs();
      __RELOC_FUNCS__.push(wasmExports["__wasm_apply_data_relocs"]);
      assignWasmExports(wasmExports);
      return wasmExports;
    }
    __name(receiveInstance, "receiveInstance");
    function receiveInstantiationResult(result2) {
      return receiveInstance(result2["instance"], result2["module"]);
    }
    __name(receiveInstantiationResult, "receiveInstantiationResult");
    var info2 = getWasmImports();
    if (Module["instantiateWasm"]) {
      return new Promise((resolve22, reject) => {
        Module["instantiateWasm"](info2, (mod, inst) => {
          resolve22(receiveInstance(mod, inst));
        });
      });
    }
    wasmBinaryFile ??= findWasmBinary();
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info2);
    var exports = receiveInstantiationResult(result);
    return exports;
  }
  __name(createWasm, "createWasm");
  class ExitStatus {
    static {
      __name(this, "ExitStatus");
    }
    name = "ExitStatus";
    constructor(status) {
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
  }
  var GOT = {};
  var currentModuleWeakSymbols = /* @__PURE__ */ new Set([]);
  var GOTHandler = {
    get(obj, symName) {
      var rtn = GOT[symName];
      if (!rtn) {
        rtn = GOT[symName] = new WebAssembly.Global({
          "value": "i32",
          "mutable": true
        });
      }
      if (!currentModuleWeakSymbols.has(symName)) {
        rtn.required = true;
      }
      return rtn;
    }
  };
  var LE_ATOMICS_NATIVE_BYTE_ORDER = [];
  var LE_HEAP_LOAD_F32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat32(byteOffset, true), "LE_HEAP_LOAD_F32");
  var LE_HEAP_LOAD_F64 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat64(byteOffset, true), "LE_HEAP_LOAD_F64");
  var LE_HEAP_LOAD_I16 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt16(byteOffset, true), "LE_HEAP_LOAD_I16");
  var LE_HEAP_LOAD_I32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt32(byteOffset, true), "LE_HEAP_LOAD_I32");
  var LE_HEAP_LOAD_I64 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getBigInt64(byteOffset, true), "LE_HEAP_LOAD_I64");
  var LE_HEAP_LOAD_U32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getUint32(byteOffset, true), "LE_HEAP_LOAD_U32");
  var LE_HEAP_STORE_F32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat32(byteOffset, value, true), "LE_HEAP_STORE_F32");
  var LE_HEAP_STORE_F64 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat64(byteOffset, value, true), "LE_HEAP_STORE_F64");
  var LE_HEAP_STORE_I16 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt16(byteOffset, value, true), "LE_HEAP_STORE_I16");
  var LE_HEAP_STORE_I32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt32(byteOffset, value, true), "LE_HEAP_STORE_I32");
  var LE_HEAP_STORE_I64 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setBigInt64(byteOffset, value, true), "LE_HEAP_STORE_I64");
  var LE_HEAP_STORE_U32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setUint32(byteOffset, value, true), "LE_HEAP_STORE_U32");
  var callRuntimeCallbacks = /* @__PURE__ */ __name((callbacks) => {
    while (callbacks.length > 0) {
      callbacks.shift()(Module);
    }
  }, "callRuntimeCallbacks");
  var onPostRuns = [];
  var addOnPostRun = /* @__PURE__ */ __name((cb) => onPostRuns.push(cb), "addOnPostRun");
  var onPreRuns = [];
  var addOnPreRun = /* @__PURE__ */ __name((cb) => onPreRuns.push(cb), "addOnPreRun");
  var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
  var findStringEnd = /* @__PURE__ */ __name((heapOrArray, idx, maxBytesToRead, ignoreNul) => {
    var maxIdx = idx + maxBytesToRead;
    if (ignoreNul) return maxIdx;
    while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
    return idx;
  }, "findStringEnd");
  var UTF8ArrayToString = /* @__PURE__ */ __name((heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
    var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
    if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
      return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
    }
    var str2 = "";
    while (idx < endPtr) {
      var u0 = heapOrArray[idx++];
      if (!(u0 & 128)) {
        str2 += String.fromCharCode(u0);
        continue;
      }
      var u1 = heapOrArray[idx++] & 63;
      if ((u0 & 224) == 192) {
        str2 += String.fromCharCode((u0 & 31) << 6 | u1);
        continue;
      }
      var u2 = heapOrArray[idx++] & 63;
      if ((u0 & 240) == 224) {
        u0 = (u0 & 15) << 12 | u1 << 6 | u2;
      } else {
        u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
      }
      if (u0 < 65536) {
        str2 += String.fromCharCode(u0);
      } else {
        var ch = u0 - 65536;
        str2 += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
      }
    }
    return str2;
  }, "UTF8ArrayToString");
  var getDylinkMetadata = /* @__PURE__ */ __name((binary2) => {
    var offset = 0;
    var end = 0;
    function getU8() {
      return binary2[offset++];
    }
    __name(getU8, "getU8");
    function getLEB() {
      var ret = 0;
      var mul = 1;
      while (1) {
        var byte = binary2[offset++];
        ret += (byte & 127) * mul;
        mul *= 128;
        if (!(byte & 128)) break;
      }
      return ret;
    }
    __name(getLEB, "getLEB");
    function getString() {
      var len = getLEB();
      offset += len;
      return UTF8ArrayToString(binary2, offset - len, len);
    }
    __name(getString, "getString");
    function getStringList() {
      var count2 = getLEB();
      var rtn = [];
      while (count2--) rtn.push(getString());
      return rtn;
    }
    __name(getStringList, "getStringList");
    function failIf(condition, message) {
      if (condition) throw new Error(message);
    }
    __name(failIf, "failIf");
    if (binary2 instanceof WebAssembly.Module) {
      var dylinkSection = WebAssembly.Module.customSections(binary2, "dylink.0");
      failIf(dylinkSection.length === 0, "need dylink section");
      binary2 = new Uint8Array(dylinkSection[0]);
      end = binary2.length;
    } else {
      var int32View = new Uint32Array(new Uint8Array(binary2.subarray(0, 24)).buffer);
      var magicNumberFound = int32View[0] == 1836278016 || int32View[0] == 6386541;
      failIf(!magicNumberFound, "need to see wasm magic number");
      failIf(binary2[8] !== 0, "need the dylink section to be first");
      offset = 9;
      var section_size = getLEB();
      end = offset + section_size;
      var name2 = getString();
      failIf(name2 !== "dylink.0");
    }
    var customSection = {
      neededDynlibs: [],
      tlsExports: /* @__PURE__ */ new Set(),
      weakImports: /* @__PURE__ */ new Set(),
      runtimePaths: []
    };
    var WASM_DYLINK_MEM_INFO = 1;
    var WASM_DYLINK_NEEDED = 2;
    var WASM_DYLINK_EXPORT_INFO = 3;
    var WASM_DYLINK_IMPORT_INFO = 4;
    var WASM_DYLINK_RUNTIME_PATH = 5;
    var WASM_SYMBOL_TLS = 256;
    var WASM_SYMBOL_BINDING_MASK = 3;
    var WASM_SYMBOL_BINDING_WEAK = 1;
    while (offset < end) {
      var subsectionType = getU8();
      var subsectionSize = getLEB();
      if (subsectionType === WASM_DYLINK_MEM_INFO) {
        customSection.memorySize = getLEB();
        customSection.memoryAlign = getLEB();
        customSection.tableSize = getLEB();
        customSection.tableAlign = getLEB();
      } else if (subsectionType === WASM_DYLINK_NEEDED) {
        customSection.neededDynlibs = getStringList();
      } else if (subsectionType === WASM_DYLINK_EXPORT_INFO) {
        var count = getLEB();
        while (count--) {
          var symname = getString();
          var flags2 = getLEB();
          if (flags2 & WASM_SYMBOL_TLS) {
            customSection.tlsExports.add(symname);
          }
        }
      } else if (subsectionType === WASM_DYLINK_IMPORT_INFO) {
        var count = getLEB();
        while (count--) {
          var modname = getString();
          var symname = getString();
          var flags2 = getLEB();
          if ((flags2 & WASM_SYMBOL_BINDING_MASK) == WASM_SYMBOL_BINDING_WEAK) {
            customSection.weakImports.add(symname);
          }
        }
      } else if (subsectionType === WASM_DYLINK_RUNTIME_PATH) {
        customSection.runtimePaths = getStringList();
      } else {
        offset += subsectionSize;
      }
    }
    return customSection;
  }, "getDylinkMetadata");
  function getValue(ptr, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
      case "i1":
        return HEAP8[ptr];
      case "i8":
        return HEAP8[ptr];
      case "i16":
        return LE_HEAP_LOAD_I16((ptr >> 1) * 2);
      case "i32":
        return LE_HEAP_LOAD_I32((ptr >> 2) * 4);
      case "i64":
        return LE_HEAP_LOAD_I64((ptr >> 3) * 8);
      case "float":
        return LE_HEAP_LOAD_F32((ptr >> 2) * 4);
      case "double":
        return LE_HEAP_LOAD_F64((ptr >> 3) * 8);
      case "*":
        return LE_HEAP_LOAD_U32((ptr >> 2) * 4);
      default:
        abort(`invalid type for getValue: ${type}`);
    }
  }
  __name(getValue, "getValue");
  var newDSO = /* @__PURE__ */ __name((name2, handle2, syms) => {
    var dso = {
      refcount: Infinity,
      name: name2,
      exports: syms,
      global: true
    };
    LDSO.loadedLibsByName[name2] = dso;
    if (handle2 != void 0) {
      LDSO.loadedLibsByHandle[handle2] = dso;
    }
    return dso;
  }, "newDSO");
  var LDSO = {
    loadedLibsByName: {},
    loadedLibsByHandle: {},
    init() {
      newDSO("__main__", 0, wasmImports);
    }
  };
  var ___heap_base = 78240;
  var alignMemory = /* @__PURE__ */ __name((size, alignment) => Math.ceil(size / alignment) * alignment, "alignMemory");
  var getMemory = /* @__PURE__ */ __name((size) => {
    if (runtimeInitialized) {
      return _calloc(size, 1);
    }
    var ret = ___heap_base;
    var end = ret + alignMemory(size, 16);
    ___heap_base = end;
    GOT["__heap_base"].value = end;
    return ret;
  }, "getMemory");
  var isInternalSym = /* @__PURE__ */ __name((symName) => ["__cpp_exception", "__c_longjmp", "__wasm_apply_data_relocs", "__dso_handle", "__tls_size", "__tls_align", "__set_stack_limits", "_emscripten_tls_init", "__wasm_init_tls", "__wasm_call_ctors", "__start_em_asm", "__stop_em_asm", "__start_em_js", "__stop_em_js"].includes(symName) || symName.startsWith("__em_js__"), "isInternalSym");
  var uleb128EncodeWithLen = /* @__PURE__ */ __name((arr) => {
    const n = arr.length;
    return [n % 128 | 128, n >> 7, ...arr];
  }, "uleb128EncodeWithLen");
  var wasmTypeCodes = {
    "i": 127,
    // i32
    "p": 127,
    // i32
    "j": 126,
    // i64
    "f": 125,
    // f32
    "d": 124,
    // f64
    "e": 111
  };
  var generateTypePack = /* @__PURE__ */ __name((types) => uleb128EncodeWithLen(Array.from(types, (type) => {
    var code = wasmTypeCodes[type];
    return code;
  })), "generateTypePack");
  var convertJsFunctionToWasm = /* @__PURE__ */ __name((func2, sig) => {
    var bytes = Uint8Array.of(
      0,
      97,
      115,
      109,
      // magic ("\0asm")
      1,
      0,
      0,
      0,
      // version: 1
      1,
      ...uleb128EncodeWithLen([
        1,
        // count: 1
        96,
        // param types
        ...generateTypePack(sig.slice(1)),
        // return types (for now only supporting [] if `void` and single [T] otherwise)
        ...generateTypePack(sig[0] === "v" ? "" : sig[0])
      ]),
      // The rest of the module is static
      2,
      7,
      // import section
      // (import "e" "f" (func 0 (type 0)))
      1,
      1,
      101,
      1,
      102,
      0,
      0,
      7,
      5,
      // export section
      // (export "f" (func 0 (type 0)))
      1,
      1,
      102,
      0,
      0
    );
    var module2 = new WebAssembly.Module(bytes);
    var instance2 = new WebAssembly.Instance(module2, {
      "e": {
        "f": func2
      }
    });
    var wrappedFunc = instance2.exports["f"];
    return wrappedFunc;
  }, "convertJsFunctionToWasm");
  var wasmTableMirror = [];
  var wasmTable = new WebAssembly.Table({
    "initial": 31,
    "element": "anyfunc"
  });
  var getWasmTableEntry = /* @__PURE__ */ __name((funcPtr) => {
    var func2 = wasmTableMirror[funcPtr];
    if (!func2) {
      wasmTableMirror[funcPtr] = func2 = wasmTable.get(funcPtr);
    }
    return func2;
  }, "getWasmTableEntry");
  var updateTableMap = /* @__PURE__ */ __name((offset, count) => {
    if (functionsInTableMap) {
      for (var i2 = offset; i2 < offset + count; i2++) {
        var item = getWasmTableEntry(i2);
        if (item) {
          functionsInTableMap.set(item, i2);
        }
      }
    }
  }, "updateTableMap");
  var functionsInTableMap;
  var getFunctionAddress = /* @__PURE__ */ __name((func2) => {
    if (!functionsInTableMap) {
      functionsInTableMap = /* @__PURE__ */ new WeakMap();
      updateTableMap(0, wasmTable.length);
    }
    return functionsInTableMap.get(func2) || 0;
  }, "getFunctionAddress");
  var freeTableIndexes = [];
  var getEmptyTableSlot = /* @__PURE__ */ __name(() => {
    if (freeTableIndexes.length) {
      return freeTableIndexes.pop();
    }
    return wasmTable["grow"](1);
  }, "getEmptyTableSlot");
  var setWasmTableEntry = /* @__PURE__ */ __name((idx, func2) => {
    wasmTable.set(idx, func2);
    wasmTableMirror[idx] = wasmTable.get(idx);
  }, "setWasmTableEntry");
  var addFunction = /* @__PURE__ */ __name((func2, sig) => {
    var rtn = getFunctionAddress(func2);
    if (rtn) {
      return rtn;
    }
    var ret = getEmptyTableSlot();
    try {
      setWasmTableEntry(ret, func2);
    } catch (err2) {
      if (!(err2 instanceof TypeError)) {
        throw err2;
      }
      var wrapped = convertJsFunctionToWasm(func2, sig);
      setWasmTableEntry(ret, wrapped);
    }
    functionsInTableMap.set(func2, ret);
    return ret;
  }, "addFunction");
  var updateGOT = /* @__PURE__ */ __name((exports, replace) => {
    for (var symName in exports) {
      if (isInternalSym(symName)) {
        continue;
      }
      var value = exports[symName];
      GOT[symName] ||= new WebAssembly.Global({
        "value": "i32",
        "mutable": true
      });
      if (replace || GOT[symName].value == 0) {
        if (typeof value == "function") {
          GOT[symName].value = addFunction(value);
        } else if (typeof value == "number") {
          GOT[symName].value = value;
        } else {
          err(`unhandled export type for '${symName}': ${typeof value}`);
        }
      }
    }
  }, "updateGOT");
  var relocateExports = /* @__PURE__ */ __name((exports, memoryBase2, replace) => {
    var relocated = {};
    for (var e in exports) {
      var value = exports[e];
      if (typeof value == "object") {
        value = value.value;
      }
      if (typeof value == "number") {
        value += memoryBase2;
      }
      relocated[e] = value;
    }
    updateGOT(relocated, replace);
    return relocated;
  }, "relocateExports");
  var isSymbolDefined = /* @__PURE__ */ __name((symName) => {
    var existing = wasmImports[symName];
    if (!existing || existing.stub) {
      return false;
    }
    return true;
  }, "isSymbolDefined");
  var dynCall = /* @__PURE__ */ __name((sig, ptr, args2 = [], promising = false) => {
    var func2 = getWasmTableEntry(ptr);
    var rtn = func2(...args2);
    function convert(rtn2) {
      return rtn2;
    }
    __name(convert, "convert");
    return convert(rtn);
  }, "dynCall");
  var stackSave = /* @__PURE__ */ __name(() => _emscripten_stack_get_current(), "stackSave");
  var stackRestore = /* @__PURE__ */ __name((val) => __emscripten_stack_restore(val), "stackRestore");
  var createInvokeFunction = /* @__PURE__ */ __name((sig) => (ptr, ...args2) => {
    var sp = stackSave();
    try {
      return dynCall(sig, ptr, args2);
    } catch (e) {
      stackRestore(sp);
      if (e !== e + 0) throw e;
      _setThrew(1, 0);
      if (sig[0] == "j") return 0n;
    }
  }, "createInvokeFunction");
  var resolveGlobalSymbol = /* @__PURE__ */ __name((symName, direct = false) => {
    var sym;
    if (isSymbolDefined(symName)) {
      sym = wasmImports[symName];
    } else if (symName.startsWith("invoke_")) {
      sym = wasmImports[symName] = createInvokeFunction(symName.split("_")[1]);
    }
    return {
      sym,
      name: symName
    };
  }, "resolveGlobalSymbol");
  var onPostCtors = [];
  var addOnPostCtor = /* @__PURE__ */ __name((cb) => onPostCtors.push(cb), "addOnPostCtor");
  var UTF8ToString = /* @__PURE__ */ __name((ptr, maxBytesToRead, ignoreNul) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "", "UTF8ToString");
  var loadWebAssemblyModule = /* @__PURE__ */ __name((binary, flags, libName, localScope, handle) => {
    var metadata = getDylinkMetadata(binary);
    function loadModule() {
      var memAlign = Math.pow(2, metadata.memoryAlign);
      var memoryBase = metadata.memorySize ? alignMemory(getMemory(metadata.memorySize + memAlign), memAlign) : 0;
      var tableBase = metadata.tableSize ? wasmTable.length : 0;
      if (handle) {
        HEAP8[handle + 8] = 1;
        LE_HEAP_STORE_U32((handle + 12 >> 2) * 4, memoryBase);
        LE_HEAP_STORE_I32((handle + 16 >> 2) * 4, metadata.memorySize);
        LE_HEAP_STORE_U32((handle + 20 >> 2) * 4, tableBase);
        LE_HEAP_STORE_I32((handle + 24 >> 2) * 4, metadata.tableSize);
      }
      if (metadata.tableSize) {
        wasmTable.grow(metadata.tableSize);
      }
      var moduleExports;
      function resolveSymbol(sym) {
        var resolved = resolveGlobalSymbol(sym).sym;
        if (!resolved && localScope) {
          resolved = localScope[sym];
        }
        if (!resolved) {
          resolved = moduleExports[sym];
        }
        return resolved;
      }
      __name(resolveSymbol, "resolveSymbol");
      var proxyHandler = {
        get(stubs, prop) {
          switch (prop) {
            case "__memory_base":
              return memoryBase;
            case "__table_base":
              return tableBase;
          }
          if (prop in wasmImports && !wasmImports[prop].stub) {
            var res = wasmImports[prop];
            return res;
          }
          if (!(prop in stubs)) {
            var resolved;
            stubs[prop] = (...args2) => {
              resolved ||= resolveSymbol(prop);
              return resolved(...args2);
            };
          }
          return stubs[prop];
        }
      };
      var proxy = new Proxy({}, proxyHandler);
      currentModuleWeakSymbols = metadata.weakImports;
      var info = {
        "GOT.mem": new Proxy({}, GOTHandler),
        "GOT.func": new Proxy({}, GOTHandler),
        "env": proxy,
        "wasi_snapshot_preview1": proxy
      };
      function postInstantiation(module, instance) {
        updateTableMap(tableBase, metadata.tableSize);
        moduleExports = relocateExports(instance.exports, memoryBase);
        if (!flags.allowUndefined) {
          reportUndefinedSymbols();
        }
        function addEmAsm(addr, body) {
          var args = [];
          var arity = 0;
          for (; arity < 16; arity++) {
            if (body.indexOf("$" + arity) != -1) {
              args.push("$" + arity);
            } else {
              break;
            }
          }
          args = args.join(",");
          var func = `(${args}) => { ${body} };`;
          ASM_CONSTS[start] = eval(func);
        }
        __name(addEmAsm, "addEmAsm");
        if ("__start_em_asm" in moduleExports) {
          var start = moduleExports["__start_em_asm"];
          var stop = moduleExports["__stop_em_asm"];
          while (start < stop) {
            var jsString = UTF8ToString(start);
            addEmAsm(start, jsString);
            start = HEAPU8.indexOf(0, start) + 1;
          }
        }
        function addEmJs(name, cSig, body) {
          var jsArgs = [];
          cSig = cSig.slice(1, -1);
          if (cSig != "void") {
            cSig = cSig.split(",");
            for (var i in cSig) {
              var jsArg = cSig[i].split(" ").pop();
              jsArgs.push(jsArg.replace("*", ""));
            }
          }
          var func = `(${jsArgs}) => ${body};`;
          moduleExports[name] = eval(func);
        }
        __name(addEmJs, "addEmJs");
        for (var name in moduleExports) {
          if (name.startsWith("__em_js__")) {
            var start = moduleExports[name];
            var jsString = UTF8ToString(start);
            var parts = jsString.split("<::>");
            addEmJs(name.replace("__em_js__", ""), parts[0], parts[1]);
            delete moduleExports[name];
          }
        }
        var applyRelocs = moduleExports["__wasm_apply_data_relocs"];
        if (applyRelocs) {
          if (runtimeInitialized) {
            applyRelocs();
          } else {
            __RELOC_FUNCS__.push(applyRelocs);
          }
        }
        var init = moduleExports["__wasm_call_ctors"];
        if (init) {
          if (runtimeInitialized) {
            init();
          } else {
            addOnPostCtor(init);
          }
        }
        return moduleExports;
      }
      __name(postInstantiation, "postInstantiation");
      if (flags.loadAsync) {
        return (async () => {
          var instance2;
          if (binary instanceof WebAssembly.Module) {
            instance2 = new WebAssembly.Instance(binary, info);
          } else {
            ({ module: binary, instance: instance2 } = await WebAssembly.instantiate(binary, info));
          }
          return postInstantiation(binary, instance2);
        })();
      }
      var module = binary instanceof WebAssembly.Module ? binary : new WebAssembly.Module(binary);
      var instance = new WebAssembly.Instance(module, info);
      return postInstantiation(module, instance);
    }
    __name(loadModule, "loadModule");
    flags = {
      ...flags,
      rpath: {
        parentLibPath: libName,
        paths: metadata.runtimePaths
      }
    };
    if (flags.loadAsync) {
      return metadata.neededDynlibs.reduce((chain, dynNeeded) => chain.then(() => loadDynamicLibrary(dynNeeded, flags, localScope)), Promise.resolve()).then(loadModule);
    }
    metadata.neededDynlibs.forEach((needed) => loadDynamicLibrary(needed, flags, localScope));
    return loadModule();
  }, "loadWebAssemblyModule");
  var mergeLibSymbols = /* @__PURE__ */ __name((exports, libName2) => {
    for (var [sym, exp] of Object.entries(exports)) {
      const setImport = /* @__PURE__ */ __name((target) => {
        if (!isSymbolDefined(target)) {
          wasmImports[target] = exp;
        }
      }, "setImport");
      setImport(sym);
      const main_alias = "__main_argc_argv";
      if (sym == "main") {
        setImport(main_alias);
      }
      if (sym == main_alias) {
        setImport("main");
      }
    }
  }, "mergeLibSymbols");
  var asyncLoad = /* @__PURE__ */ __name(async (url) => {
    var arrayBuffer = await readAsync(url);
    return new Uint8Array(arrayBuffer);
  }, "asyncLoad");
  function loadDynamicLibrary(libName2, flags2 = {
    global: true,
    nodelete: true
  }, localScope2, handle2) {
    var dso = LDSO.loadedLibsByName[libName2];
    if (dso) {
      if (!flags2.global) {
        if (localScope2) {
          Object.assign(localScope2, dso.exports);
        }
      } else if (!dso.global) {
        dso.global = true;
        mergeLibSymbols(dso.exports, libName2);
      }
      if (flags2.nodelete && dso.refcount !== Infinity) {
        dso.refcount = Infinity;
      }
      dso.refcount++;
      if (handle2) {
        LDSO.loadedLibsByHandle[handle2] = dso;
      }
      return flags2.loadAsync ? Promise.resolve(true) : true;
    }
    dso = newDSO(libName2, handle2, "loading");
    dso.refcount = flags2.nodelete ? Infinity : 1;
    dso.global = flags2.global;
    function loadLibData() {
      if (handle2) {
        var data = LE_HEAP_LOAD_U32((handle2 + 28 >> 2) * 4);
        var dataSize = LE_HEAP_LOAD_U32((handle2 + 32 >> 2) * 4);
        if (data && dataSize) {
          var libData = HEAP8.slice(data, data + dataSize);
          return flags2.loadAsync ? Promise.resolve(libData) : libData;
        }
      }
      var libFile = locateFile(libName2);
      if (flags2.loadAsync) {
        return asyncLoad(libFile);
      }
      if (!readBinary) {
        throw new Error(`${libFile}: file not found, and synchronous loading of external files is not available`);
      }
      return readBinary(libFile);
    }
    __name(loadLibData, "loadLibData");
    function getExports() {
      if (flags2.loadAsync) {
        return loadLibData().then((libData) => loadWebAssemblyModule(libData, flags2, libName2, localScope2, handle2));
      }
      return loadWebAssemblyModule(loadLibData(), flags2, libName2, localScope2, handle2);
    }
    __name(getExports, "getExports");
    function moduleLoaded(exports) {
      if (dso.global) {
        mergeLibSymbols(exports, libName2);
      } else if (localScope2) {
        Object.assign(localScope2, exports);
      }
      dso.exports = exports;
    }
    __name(moduleLoaded, "moduleLoaded");
    if (flags2.loadAsync) {
      return getExports().then((exports) => {
        moduleLoaded(exports);
        return true;
      });
    }
    moduleLoaded(getExports());
    return true;
  }
  __name(loadDynamicLibrary, "loadDynamicLibrary");
  var reportUndefinedSymbols = /* @__PURE__ */ __name(() => {
    for (var [symName, entry] of Object.entries(GOT)) {
      if (entry.value == 0) {
        var value = resolveGlobalSymbol(symName, true).sym;
        if (!value && !entry.required) {
          continue;
        }
        if (typeof value == "function") {
          entry.value = addFunction(value, value.sig);
        } else if (typeof value == "number") {
          entry.value = value;
        } else {
          throw new Error(`bad export type for '${symName}': ${typeof value}`);
        }
      }
    }
  }, "reportUndefinedSymbols");
  var runDependencies = 0;
  var dependenciesFulfilled = null;
  var removeRunDependency = /* @__PURE__ */ __name((id) => {
    runDependencies--;
    Module["monitorRunDependencies"]?.(runDependencies);
    if (runDependencies == 0) {
      if (dependenciesFulfilled) {
        var callback = dependenciesFulfilled;
        dependenciesFulfilled = null;
        callback();
      }
    }
  }, "removeRunDependency");
  var addRunDependency = /* @__PURE__ */ __name((id) => {
    runDependencies++;
    Module["monitorRunDependencies"]?.(runDependencies);
  }, "addRunDependency");
  var loadDylibs = /* @__PURE__ */ __name(async () => {
    if (!dynamicLibraries.length) {
      reportUndefinedSymbols();
      return;
    }
    addRunDependency("loadDylibs");
    for (var lib of dynamicLibraries) {
      await loadDynamicLibrary(lib, {
        loadAsync: true,
        global: true,
        nodelete: true,
        allowUndefined: true
      });
    }
    reportUndefinedSymbols();
    removeRunDependency("loadDylibs");
  }, "loadDylibs");
  var noExitRuntime = true;
  function setValue(ptr, value, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
      case "i1":
        HEAP8[ptr] = value;
        break;
      case "i8":
        HEAP8[ptr] = value;
        break;
      case "i16":
        LE_HEAP_STORE_I16((ptr >> 1) * 2, value);
        break;
      case "i32":
        LE_HEAP_STORE_I32((ptr >> 2) * 4, value);
        break;
      case "i64":
        LE_HEAP_STORE_I64((ptr >> 3) * 8, BigInt(value));
        break;
      case "float":
        LE_HEAP_STORE_F32((ptr >> 2) * 4, value);
        break;
      case "double":
        LE_HEAP_STORE_F64((ptr >> 3) * 8, value);
        break;
      case "*":
        LE_HEAP_STORE_U32((ptr >> 2) * 4, value);
        break;
      default:
        abort(`invalid type for setValue: ${type}`);
    }
  }
  __name(setValue, "setValue");
  var ___memory_base = new WebAssembly.Global({
    "value": "i32",
    "mutable": false
  }, 1024);
  var ___stack_high = 78240;
  var ___stack_low = 12704;
  var ___stack_pointer = new WebAssembly.Global({
    "value": "i32",
    "mutable": true
  }, 78240);
  var ___table_base = new WebAssembly.Global({
    "value": "i32",
    "mutable": false
  }, 1);
  var __abort_js = /* @__PURE__ */ __name(() => abort(""), "__abort_js");
  __abort_js.sig = "v";
  var getHeapMax = /* @__PURE__ */ __name(() => (
    // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
    // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
    // for any code that deals with heap sizes, which would require special
    // casing all heap size related code to treat 0 specially.
    2147483648
  ), "getHeapMax");
  var growMemory = /* @__PURE__ */ __name((size) => {
    var oldHeapSize = wasmMemory.buffer.byteLength;
    var pages = (size - oldHeapSize + 65535) / 65536 | 0;
    try {
      wasmMemory.grow(pages);
      updateMemoryViews();
      return 1;
    } catch (e) {
    }
  }, "growMemory");
  var _emscripten_resize_heap = /* @__PURE__ */ __name((requestedSize) => {
    var oldSize = HEAPU8.length;
    requestedSize >>>= 0;
    var maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize) {
      return false;
    }
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
      overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
      var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
      var replacement = growMemory(newSize);
      if (replacement) {
        return true;
      }
    }
    return false;
  }, "_emscripten_resize_heap");
  _emscripten_resize_heap.sig = "ip";
  var _fd_close = /* @__PURE__ */ __name((fd) => 52, "_fd_close");
  _fd_close.sig = "ii";
  var INT53_MAX = 9007199254740992;
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = /* @__PURE__ */ __name((num) => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num), "bigintToI53Checked");
  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
    return 70;
  }
  __name(_fd_seek, "_fd_seek");
  _fd_seek.sig = "iijip";
  var printCharBuffers = [null, [], []];
  var printChar = /* @__PURE__ */ __name((stream, curr) => {
    var buffer = printCharBuffers[stream];
    if (curr === 0 || curr === 10) {
      (stream === 1 ? out : err)(UTF8ArrayToString(buffer));
      buffer.length = 0;
    } else {
      buffer.push(curr);
    }
  }, "printChar");
  var _fd_write = /* @__PURE__ */ __name((fd, iov, iovcnt, pnum) => {
    var num = 0;
    for (var i2 = 0; i2 < iovcnt; i2++) {
      var ptr = LE_HEAP_LOAD_U32((iov >> 2) * 4);
      var len = LE_HEAP_LOAD_U32((iov + 4 >> 2) * 4);
      iov += 8;
      for (var j = 0; j < len; j++) {
        printChar(fd, HEAPU8[ptr + j]);
      }
      num += len;
    }
    LE_HEAP_STORE_U32((pnum >> 2) * 4, num);
    return 0;
  }, "_fd_write");
  _fd_write.sig = "iippp";
  function _tree_sitter_log_callback(isLexMessage, messageAddress) {
    if (Module.currentLogCallback) {
      const message = UTF8ToString(messageAddress);
      Module.currentLogCallback(message, isLexMessage !== 0);
    }
  }
  __name(_tree_sitter_log_callback, "_tree_sitter_log_callback");
  function _tree_sitter_parse_callback(inputBufferAddress, index, row, column, lengthAddress) {
    const INPUT_BUFFER_SIZE = 10 * 1024;
    const string = Module.currentParseCallback(index, {
      row,
      column
    });
    if (typeof string === "string") {
      setValue(lengthAddress, string.length, "i32");
      stringToUTF16(string, inputBufferAddress, INPUT_BUFFER_SIZE);
    } else {
      setValue(lengthAddress, 0, "i32");
    }
  }
  __name(_tree_sitter_parse_callback, "_tree_sitter_parse_callback");
  function _tree_sitter_progress_callback(currentOffset, hasError) {
    if (Module.currentProgressCallback) {
      return Module.currentProgressCallback({
        currentOffset,
        hasError
      });
    }
    return false;
  }
  __name(_tree_sitter_progress_callback, "_tree_sitter_progress_callback");
  function _tree_sitter_query_progress_callback(currentOffset) {
    if (Module.currentQueryProgressCallback) {
      return Module.currentQueryProgressCallback({
        currentOffset
      });
    }
    return false;
  }
  __name(_tree_sitter_query_progress_callback, "_tree_sitter_query_progress_callback");
  var runtimeKeepaliveCounter = 0;
  var keepRuntimeAlive = /* @__PURE__ */ __name(() => noExitRuntime || runtimeKeepaliveCounter > 0, "keepRuntimeAlive");
  var _proc_exit = /* @__PURE__ */ __name((code) => {
    EXITSTATUS = code;
    if (!keepRuntimeAlive()) {
      Module["onExit"]?.(code);
      ABORT = true;
    }
    quit_(code, new ExitStatus(code));
  }, "_proc_exit");
  _proc_exit.sig = "vi";
  var exitJS = /* @__PURE__ */ __name((status, implicit) => {
    EXITSTATUS = status;
    _proc_exit(status);
  }, "exitJS");
  var handleException = /* @__PURE__ */ __name((e) => {
    if (e instanceof ExitStatus || e == "unwind") {
      return EXITSTATUS;
    }
    quit_(1, e);
  }, "handleException");
  var lengthBytesUTF8 = /* @__PURE__ */ __name((str2) => {
    var len = 0;
    for (var i2 = 0; i2 < str2.length; ++i2) {
      var c2 = str2.charCodeAt(i2);
      if (c2 <= 127) {
        len++;
      } else if (c2 <= 2047) {
        len += 2;
      } else if (c2 >= 55296 && c2 <= 57343) {
        len += 4;
        ++i2;
      } else {
        len += 3;
      }
    }
    return len;
  }, "lengthBytesUTF8");
  var stringToUTF8Array = /* @__PURE__ */ __name((str2, heap, outIdx, maxBytesToWrite) => {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i2 = 0; i2 < str2.length; ++i2) {
      var u = str2.codePointAt(i2);
      if (u <= 127) {
        if (outIdx >= endIdx) break;
        heap[outIdx++] = u;
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break;
        heap[outIdx++] = 192 | u >> 6;
        heap[outIdx++] = 128 | u & 63;
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break;
        heap[outIdx++] = 224 | u >> 12;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
      } else {
        if (outIdx + 3 >= endIdx) break;
        heap[outIdx++] = 240 | u >> 18;
        heap[outIdx++] = 128 | u >> 12 & 63;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
        i2++;
      }
    }
    heap[outIdx] = 0;
    return outIdx - startIdx;
  }, "stringToUTF8Array");
  var stringToUTF8 = /* @__PURE__ */ __name((str2, outPtr, maxBytesToWrite) => stringToUTF8Array(str2, HEAPU8, outPtr, maxBytesToWrite), "stringToUTF8");
  var stackAlloc = /* @__PURE__ */ __name((sz) => __emscripten_stack_alloc(sz), "stackAlloc");
  var stringToUTF8OnStack = /* @__PURE__ */ __name((str2) => {
    var size = lengthBytesUTF8(str2) + 1;
    var ret = stackAlloc(size);
    stringToUTF8(str2, ret, size);
    return ret;
  }, "stringToUTF8OnStack");
  var AsciiToString = /* @__PURE__ */ __name((ptr) => {
    var str2 = "";
    while (1) {
      var ch = HEAPU8[ptr++];
      if (!ch) return str2;
      str2 += String.fromCharCode(ch);
    }
  }, "AsciiToString");
  var stringToUTF16 = /* @__PURE__ */ __name((str2, outPtr, maxBytesToWrite) => {
    maxBytesToWrite ??= 2147483647;
    if (maxBytesToWrite < 2) return 0;
    maxBytesToWrite -= 2;
    var startPtr = outPtr;
    var numCharsToWrite = maxBytesToWrite < str2.length * 2 ? maxBytesToWrite / 2 : str2.length;
    for (var i2 = 0; i2 < numCharsToWrite; ++i2) {
      var codeUnit = str2.charCodeAt(i2);
      LE_HEAP_STORE_I16((outPtr >> 1) * 2, codeUnit);
      outPtr += 2;
    }
    LE_HEAP_STORE_I16((outPtr >> 1) * 2, 0);
    return outPtr - startPtr;
  }, "stringToUTF16");
  LE_ATOMICS_NATIVE_BYTE_ORDER = new Int8Array(new Int16Array([1]).buffer)[0] === 1 ? [
    /* little endian */
    ((x) => x),
    ((x) => x),
    void 0,
    ((x) => x)
  ] : [
    /* big endian */
    ((x) => x),
    ((x) => ((x & 65280) << 8 | (x & 255) << 24) >> 16),
    void 0,
    ((x) => x >> 24 & 255 | x >> 8 & 65280 | (x & 65280) << 8 | (x & 255) << 24)
  ];
  function LE_HEAP_UPDATE() {
    HEAPU16.unsigned = ((x) => x & 65535);
    HEAPU32.unsigned = ((x) => x >>> 0);
  }
  __name(LE_HEAP_UPDATE, "LE_HEAP_UPDATE");
  {
    initMemory();
    if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
    if (Module["print"]) out = Module["print"];
    if (Module["printErr"]) err = Module["printErr"];
    if (Module["dynamicLibraries"]) dynamicLibraries = Module["dynamicLibraries"];
    if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].shift()();
      }
    }
  }
  Module["setValue"] = setValue;
  Module["getValue"] = getValue;
  Module["UTF8ToString"] = UTF8ToString;
  Module["stringToUTF8"] = stringToUTF8;
  Module["lengthBytesUTF8"] = lengthBytesUTF8;
  Module["AsciiToString"] = AsciiToString;
  Module["stringToUTF16"] = stringToUTF16;
  Module["loadWebAssemblyModule"] = loadWebAssemblyModule;
  Module["LE_HEAP_STORE_I64"] = LE_HEAP_STORE_I64;
  var ASM_CONSTS = {};
  var _malloc, _calloc, _realloc, _free, _ts_range_edit, _memcmp, _ts_language_symbol_count, _ts_language_state_count, _ts_language_abi_version, _ts_language_name, _ts_language_field_count, _ts_language_next_state, _ts_language_symbol_name, _ts_language_symbol_for_name, _strncmp, _ts_language_symbol_type, _ts_language_field_name_for_id, _ts_lookahead_iterator_new, _ts_lookahead_iterator_delete, _ts_lookahead_iterator_reset_state, _ts_lookahead_iterator_reset, _ts_lookahead_iterator_next, _ts_lookahead_iterator_current_symbol, _ts_point_edit, _ts_parser_delete, _ts_parser_reset, _ts_parser_set_language, _ts_parser_set_included_ranges, _ts_query_new, _ts_query_delete, _iswspace, _iswalnum, _ts_query_pattern_count, _ts_query_capture_count, _ts_query_string_count, _ts_query_capture_name_for_id, _ts_query_capture_quantifier_for_id, _ts_query_string_value_for_id, _ts_query_predicates_for_pattern, _ts_query_start_byte_for_pattern, _ts_query_end_byte_for_pattern, _ts_query_is_pattern_rooted, _ts_query_is_pattern_non_local, _ts_query_is_pattern_guaranteed_at_step, _ts_query_disable_capture, _ts_query_disable_pattern, _ts_tree_copy, _ts_tree_delete, _ts_init, _ts_parser_new_wasm, _ts_parser_enable_logger_wasm, _ts_parser_parse_wasm, _ts_parser_included_ranges_wasm, _ts_language_type_is_named_wasm, _ts_language_type_is_visible_wasm, _ts_language_metadata_wasm, _ts_language_supertypes_wasm, _ts_language_subtypes_wasm, _ts_tree_root_node_wasm, _ts_tree_root_node_with_offset_wasm, _ts_tree_edit_wasm, _ts_tree_included_ranges_wasm, _ts_tree_get_changed_ranges_wasm, _ts_tree_cursor_new_wasm, _ts_tree_cursor_copy_wasm, _ts_tree_cursor_delete_wasm, _ts_tree_cursor_reset_wasm, _ts_tree_cursor_reset_to_wasm, _ts_tree_cursor_goto_first_child_wasm, _ts_tree_cursor_goto_last_child_wasm, _ts_tree_cursor_goto_first_child_for_index_wasm, _ts_tree_cursor_goto_first_child_for_position_wasm, _ts_tree_cursor_goto_next_sibling_wasm, _ts_tree_cursor_goto_previous_sibling_wasm, _ts_tree_cursor_goto_descendant_wasm, _ts_tree_cursor_goto_parent_wasm, _ts_tree_cursor_current_node_type_id_wasm, _ts_tree_cursor_current_node_state_id_wasm, _ts_tree_cursor_current_node_is_named_wasm, _ts_tree_cursor_current_node_is_missing_wasm, _ts_tree_cursor_current_node_id_wasm, _ts_tree_cursor_start_position_wasm, _ts_tree_cursor_end_position_wasm, _ts_tree_cursor_start_index_wasm, _ts_tree_cursor_end_index_wasm, _ts_tree_cursor_current_field_id_wasm, _ts_tree_cursor_current_depth_wasm, _ts_tree_cursor_current_descendant_index_wasm, _ts_tree_cursor_current_node_wasm, _ts_node_symbol_wasm, _ts_node_field_name_for_child_wasm, _ts_node_field_name_for_named_child_wasm, _ts_node_children_by_field_id_wasm, _ts_node_first_child_for_byte_wasm, _ts_node_first_named_child_for_byte_wasm, _ts_node_grammar_symbol_wasm, _ts_node_child_count_wasm, _ts_node_named_child_count_wasm, _ts_node_child_wasm, _ts_node_named_child_wasm, _ts_node_child_by_field_id_wasm, _ts_node_next_sibling_wasm, _ts_node_prev_sibling_wasm, _ts_node_next_named_sibling_wasm, _ts_node_prev_named_sibling_wasm, _ts_node_descendant_count_wasm, _ts_node_parent_wasm, _ts_node_child_with_descendant_wasm, _ts_node_descendant_for_index_wasm, _ts_node_named_descendant_for_index_wasm, _ts_node_descendant_for_position_wasm, _ts_node_named_descendant_for_position_wasm, _ts_node_start_point_wasm, _ts_node_end_point_wasm, _ts_node_start_index_wasm, _ts_node_end_index_wasm, _ts_node_to_string_wasm, _ts_node_children_wasm, _ts_node_named_children_wasm, _ts_node_descendants_of_type_wasm, _ts_node_is_named_wasm, _ts_node_has_changes_wasm, _ts_node_has_error_wasm, _ts_node_is_error_wasm, _ts_node_is_missing_wasm, _ts_node_is_extra_wasm, _ts_node_parse_state_wasm, _ts_node_next_parse_state_wasm, _ts_query_matches_wasm, _ts_query_captures_wasm, _memset, _memcpy, _memmove, _iswalpha, _iswblank, _iswdigit, _iswlower, _iswupper, _iswxdigit, _memchr, _strlen, _strcmp, _strncat, _strncpy, _towlower, _towupper, _setThrew, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, ___wasm_apply_data_relocs;
  function assignWasmExports(wasmExports2) {
    Module["_malloc"] = _malloc = wasmExports2["malloc"];
    Module["_calloc"] = _calloc = wasmExports2["calloc"];
    Module["_realloc"] = _realloc = wasmExports2["realloc"];
    Module["_free"] = _free = wasmExports2["free"];
    Module["_ts_range_edit"] = _ts_range_edit = wasmExports2["ts_range_edit"];
    Module["_memcmp"] = _memcmp = wasmExports2["memcmp"];
    Module["_ts_language_symbol_count"] = _ts_language_symbol_count = wasmExports2["ts_language_symbol_count"];
    Module["_ts_language_state_count"] = _ts_language_state_count = wasmExports2["ts_language_state_count"];
    Module["_ts_language_abi_version"] = _ts_language_abi_version = wasmExports2["ts_language_abi_version"];
    Module["_ts_language_name"] = _ts_language_name = wasmExports2["ts_language_name"];
    Module["_ts_language_field_count"] = _ts_language_field_count = wasmExports2["ts_language_field_count"];
    Module["_ts_language_next_state"] = _ts_language_next_state = wasmExports2["ts_language_next_state"];
    Module["_ts_language_symbol_name"] = _ts_language_symbol_name = wasmExports2["ts_language_symbol_name"];
    Module["_ts_language_symbol_for_name"] = _ts_language_symbol_for_name = wasmExports2["ts_language_symbol_for_name"];
    Module["_strncmp"] = _strncmp = wasmExports2["strncmp"];
    Module["_ts_language_symbol_type"] = _ts_language_symbol_type = wasmExports2["ts_language_symbol_type"];
    Module["_ts_language_field_name_for_id"] = _ts_language_field_name_for_id = wasmExports2["ts_language_field_name_for_id"];
    Module["_ts_lookahead_iterator_new"] = _ts_lookahead_iterator_new = wasmExports2["ts_lookahead_iterator_new"];
    Module["_ts_lookahead_iterator_delete"] = _ts_lookahead_iterator_delete = wasmExports2["ts_lookahead_iterator_delete"];
    Module["_ts_lookahead_iterator_reset_state"] = _ts_lookahead_iterator_reset_state = wasmExports2["ts_lookahead_iterator_reset_state"];
    Module["_ts_lookahead_iterator_reset"] = _ts_lookahead_iterator_reset = wasmExports2["ts_lookahead_iterator_reset"];
    Module["_ts_lookahead_iterator_next"] = _ts_lookahead_iterator_next = wasmExports2["ts_lookahead_iterator_next"];
    Module["_ts_lookahead_iterator_current_symbol"] = _ts_lookahead_iterator_current_symbol = wasmExports2["ts_lookahead_iterator_current_symbol"];
    Module["_ts_point_edit"] = _ts_point_edit = wasmExports2["ts_point_edit"];
    Module["_ts_parser_delete"] = _ts_parser_delete = wasmExports2["ts_parser_delete"];
    Module["_ts_parser_reset"] = _ts_parser_reset = wasmExports2["ts_parser_reset"];
    Module["_ts_parser_set_language"] = _ts_parser_set_language = wasmExports2["ts_parser_set_language"];
    Module["_ts_parser_set_included_ranges"] = _ts_parser_set_included_ranges = wasmExports2["ts_parser_set_included_ranges"];
    Module["_ts_query_new"] = _ts_query_new = wasmExports2["ts_query_new"];
    Module["_ts_query_delete"] = _ts_query_delete = wasmExports2["ts_query_delete"];
    Module["_iswspace"] = _iswspace = wasmExports2["iswspace"];
    Module["_iswalnum"] = _iswalnum = wasmExports2["iswalnum"];
    Module["_ts_query_pattern_count"] = _ts_query_pattern_count = wasmExports2["ts_query_pattern_count"];
    Module["_ts_query_capture_count"] = _ts_query_capture_count = wasmExports2["ts_query_capture_count"];
    Module["_ts_query_string_count"] = _ts_query_string_count = wasmExports2["ts_query_string_count"];
    Module["_ts_query_capture_name_for_id"] = _ts_query_capture_name_for_id = wasmExports2["ts_query_capture_name_for_id"];
    Module["_ts_query_capture_quantifier_for_id"] = _ts_query_capture_quantifier_for_id = wasmExports2["ts_query_capture_quantifier_for_id"];
    Module["_ts_query_string_value_for_id"] = _ts_query_string_value_for_id = wasmExports2["ts_query_string_value_for_id"];
    Module["_ts_query_predicates_for_pattern"] = _ts_query_predicates_for_pattern = wasmExports2["ts_query_predicates_for_pattern"];
    Module["_ts_query_start_byte_for_pattern"] = _ts_query_start_byte_for_pattern = wasmExports2["ts_query_start_byte_for_pattern"];
    Module["_ts_query_end_byte_for_pattern"] = _ts_query_end_byte_for_pattern = wasmExports2["ts_query_end_byte_for_pattern"];
    Module["_ts_query_is_pattern_rooted"] = _ts_query_is_pattern_rooted = wasmExports2["ts_query_is_pattern_rooted"];
    Module["_ts_query_is_pattern_non_local"] = _ts_query_is_pattern_non_local = wasmExports2["ts_query_is_pattern_non_local"];
    Module["_ts_query_is_pattern_guaranteed_at_step"] = _ts_query_is_pattern_guaranteed_at_step = wasmExports2["ts_query_is_pattern_guaranteed_at_step"];
    Module["_ts_query_disable_capture"] = _ts_query_disable_capture = wasmExports2["ts_query_disable_capture"];
    Module["_ts_query_disable_pattern"] = _ts_query_disable_pattern = wasmExports2["ts_query_disable_pattern"];
    Module["_ts_tree_copy"] = _ts_tree_copy = wasmExports2["ts_tree_copy"];
    Module["_ts_tree_delete"] = _ts_tree_delete = wasmExports2["ts_tree_delete"];
    Module["_ts_init"] = _ts_init = wasmExports2["ts_init"];
    Module["_ts_parser_new_wasm"] = _ts_parser_new_wasm = wasmExports2["ts_parser_new_wasm"];
    Module["_ts_parser_enable_logger_wasm"] = _ts_parser_enable_logger_wasm = wasmExports2["ts_parser_enable_logger_wasm"];
    Module["_ts_parser_parse_wasm"] = _ts_parser_parse_wasm = wasmExports2["ts_parser_parse_wasm"];
    Module["_ts_parser_included_ranges_wasm"] = _ts_parser_included_ranges_wasm = wasmExports2["ts_parser_included_ranges_wasm"];
    Module["_ts_language_type_is_named_wasm"] = _ts_language_type_is_named_wasm = wasmExports2["ts_language_type_is_named_wasm"];
    Module["_ts_language_type_is_visible_wasm"] = _ts_language_type_is_visible_wasm = wasmExports2["ts_language_type_is_visible_wasm"];
    Module["_ts_language_metadata_wasm"] = _ts_language_metadata_wasm = wasmExports2["ts_language_metadata_wasm"];
    Module["_ts_language_supertypes_wasm"] = _ts_language_supertypes_wasm = wasmExports2["ts_language_supertypes_wasm"];
    Module["_ts_language_subtypes_wasm"] = _ts_language_subtypes_wasm = wasmExports2["ts_language_subtypes_wasm"];
    Module["_ts_tree_root_node_wasm"] = _ts_tree_root_node_wasm = wasmExports2["ts_tree_root_node_wasm"];
    Module["_ts_tree_root_node_with_offset_wasm"] = _ts_tree_root_node_with_offset_wasm = wasmExports2["ts_tree_root_node_with_offset_wasm"];
    Module["_ts_tree_edit_wasm"] = _ts_tree_edit_wasm = wasmExports2["ts_tree_edit_wasm"];
    Module["_ts_tree_included_ranges_wasm"] = _ts_tree_included_ranges_wasm = wasmExports2["ts_tree_included_ranges_wasm"];
    Module["_ts_tree_get_changed_ranges_wasm"] = _ts_tree_get_changed_ranges_wasm = wasmExports2["ts_tree_get_changed_ranges_wasm"];
    Module["_ts_tree_cursor_new_wasm"] = _ts_tree_cursor_new_wasm = wasmExports2["ts_tree_cursor_new_wasm"];
    Module["_ts_tree_cursor_copy_wasm"] = _ts_tree_cursor_copy_wasm = wasmExports2["ts_tree_cursor_copy_wasm"];
    Module["_ts_tree_cursor_delete_wasm"] = _ts_tree_cursor_delete_wasm = wasmExports2["ts_tree_cursor_delete_wasm"];
    Module["_ts_tree_cursor_reset_wasm"] = _ts_tree_cursor_reset_wasm = wasmExports2["ts_tree_cursor_reset_wasm"];
    Module["_ts_tree_cursor_reset_to_wasm"] = _ts_tree_cursor_reset_to_wasm = wasmExports2["ts_tree_cursor_reset_to_wasm"];
    Module["_ts_tree_cursor_goto_first_child_wasm"] = _ts_tree_cursor_goto_first_child_wasm = wasmExports2["ts_tree_cursor_goto_first_child_wasm"];
    Module["_ts_tree_cursor_goto_last_child_wasm"] = _ts_tree_cursor_goto_last_child_wasm = wasmExports2["ts_tree_cursor_goto_last_child_wasm"];
    Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = _ts_tree_cursor_goto_first_child_for_index_wasm = wasmExports2["ts_tree_cursor_goto_first_child_for_index_wasm"];
    Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = _ts_tree_cursor_goto_first_child_for_position_wasm = wasmExports2["ts_tree_cursor_goto_first_child_for_position_wasm"];
    Module["_ts_tree_cursor_goto_next_sibling_wasm"] = _ts_tree_cursor_goto_next_sibling_wasm = wasmExports2["ts_tree_cursor_goto_next_sibling_wasm"];
    Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = _ts_tree_cursor_goto_previous_sibling_wasm = wasmExports2["ts_tree_cursor_goto_previous_sibling_wasm"];
    Module["_ts_tree_cursor_goto_descendant_wasm"] = _ts_tree_cursor_goto_descendant_wasm = wasmExports2["ts_tree_cursor_goto_descendant_wasm"];
    Module["_ts_tree_cursor_goto_parent_wasm"] = _ts_tree_cursor_goto_parent_wasm = wasmExports2["ts_tree_cursor_goto_parent_wasm"];
    Module["_ts_tree_cursor_current_node_type_id_wasm"] = _ts_tree_cursor_current_node_type_id_wasm = wasmExports2["ts_tree_cursor_current_node_type_id_wasm"];
    Module["_ts_tree_cursor_current_node_state_id_wasm"] = _ts_tree_cursor_current_node_state_id_wasm = wasmExports2["ts_tree_cursor_current_node_state_id_wasm"];
    Module["_ts_tree_cursor_current_node_is_named_wasm"] = _ts_tree_cursor_current_node_is_named_wasm = wasmExports2["ts_tree_cursor_current_node_is_named_wasm"];
    Module["_ts_tree_cursor_current_node_is_missing_wasm"] = _ts_tree_cursor_current_node_is_missing_wasm = wasmExports2["ts_tree_cursor_current_node_is_missing_wasm"];
    Module["_ts_tree_cursor_current_node_id_wasm"] = _ts_tree_cursor_current_node_id_wasm = wasmExports2["ts_tree_cursor_current_node_id_wasm"];
    Module["_ts_tree_cursor_start_position_wasm"] = _ts_tree_cursor_start_position_wasm = wasmExports2["ts_tree_cursor_start_position_wasm"];
    Module["_ts_tree_cursor_end_position_wasm"] = _ts_tree_cursor_end_position_wasm = wasmExports2["ts_tree_cursor_end_position_wasm"];
    Module["_ts_tree_cursor_start_index_wasm"] = _ts_tree_cursor_start_index_wasm = wasmExports2["ts_tree_cursor_start_index_wasm"];
    Module["_ts_tree_cursor_end_index_wasm"] = _ts_tree_cursor_end_index_wasm = wasmExports2["ts_tree_cursor_end_index_wasm"];
    Module["_ts_tree_cursor_current_field_id_wasm"] = _ts_tree_cursor_current_field_id_wasm = wasmExports2["ts_tree_cursor_current_field_id_wasm"];
    Module["_ts_tree_cursor_current_depth_wasm"] = _ts_tree_cursor_current_depth_wasm = wasmExports2["ts_tree_cursor_current_depth_wasm"];
    Module["_ts_tree_cursor_current_descendant_index_wasm"] = _ts_tree_cursor_current_descendant_index_wasm = wasmExports2["ts_tree_cursor_current_descendant_index_wasm"];
    Module["_ts_tree_cursor_current_node_wasm"] = _ts_tree_cursor_current_node_wasm = wasmExports2["ts_tree_cursor_current_node_wasm"];
    Module["_ts_node_symbol_wasm"] = _ts_node_symbol_wasm = wasmExports2["ts_node_symbol_wasm"];
    Module["_ts_node_field_name_for_child_wasm"] = _ts_node_field_name_for_child_wasm = wasmExports2["ts_node_field_name_for_child_wasm"];
    Module["_ts_node_field_name_for_named_child_wasm"] = _ts_node_field_name_for_named_child_wasm = wasmExports2["ts_node_field_name_for_named_child_wasm"];
    Module["_ts_node_children_by_field_id_wasm"] = _ts_node_children_by_field_id_wasm = wasmExports2["ts_node_children_by_field_id_wasm"];
    Module["_ts_node_first_child_for_byte_wasm"] = _ts_node_first_child_for_byte_wasm = wasmExports2["ts_node_first_child_for_byte_wasm"];
    Module["_ts_node_first_named_child_for_byte_wasm"] = _ts_node_first_named_child_for_byte_wasm = wasmExports2["ts_node_first_named_child_for_byte_wasm"];
    Module["_ts_node_grammar_symbol_wasm"] = _ts_node_grammar_symbol_wasm = wasmExports2["ts_node_grammar_symbol_wasm"];
    Module["_ts_node_child_count_wasm"] = _ts_node_child_count_wasm = wasmExports2["ts_node_child_count_wasm"];
    Module["_ts_node_named_child_count_wasm"] = _ts_node_named_child_count_wasm = wasmExports2["ts_node_named_child_count_wasm"];
    Module["_ts_node_child_wasm"] = _ts_node_child_wasm = wasmExports2["ts_node_child_wasm"];
    Module["_ts_node_named_child_wasm"] = _ts_node_named_child_wasm = wasmExports2["ts_node_named_child_wasm"];
    Module["_ts_node_child_by_field_id_wasm"] = _ts_node_child_by_field_id_wasm = wasmExports2["ts_node_child_by_field_id_wasm"];
    Module["_ts_node_next_sibling_wasm"] = _ts_node_next_sibling_wasm = wasmExports2["ts_node_next_sibling_wasm"];
    Module["_ts_node_prev_sibling_wasm"] = _ts_node_prev_sibling_wasm = wasmExports2["ts_node_prev_sibling_wasm"];
    Module["_ts_node_next_named_sibling_wasm"] = _ts_node_next_named_sibling_wasm = wasmExports2["ts_node_next_named_sibling_wasm"];
    Module["_ts_node_prev_named_sibling_wasm"] = _ts_node_prev_named_sibling_wasm = wasmExports2["ts_node_prev_named_sibling_wasm"];
    Module["_ts_node_descendant_count_wasm"] = _ts_node_descendant_count_wasm = wasmExports2["ts_node_descendant_count_wasm"];
    Module["_ts_node_parent_wasm"] = _ts_node_parent_wasm = wasmExports2["ts_node_parent_wasm"];
    Module["_ts_node_child_with_descendant_wasm"] = _ts_node_child_with_descendant_wasm = wasmExports2["ts_node_child_with_descendant_wasm"];
    Module["_ts_node_descendant_for_index_wasm"] = _ts_node_descendant_for_index_wasm = wasmExports2["ts_node_descendant_for_index_wasm"];
    Module["_ts_node_named_descendant_for_index_wasm"] = _ts_node_named_descendant_for_index_wasm = wasmExports2["ts_node_named_descendant_for_index_wasm"];
    Module["_ts_node_descendant_for_position_wasm"] = _ts_node_descendant_for_position_wasm = wasmExports2["ts_node_descendant_for_position_wasm"];
    Module["_ts_node_named_descendant_for_position_wasm"] = _ts_node_named_descendant_for_position_wasm = wasmExports2["ts_node_named_descendant_for_position_wasm"];
    Module["_ts_node_start_point_wasm"] = _ts_node_start_point_wasm = wasmExports2["ts_node_start_point_wasm"];
    Module["_ts_node_end_point_wasm"] = _ts_node_end_point_wasm = wasmExports2["ts_node_end_point_wasm"];
    Module["_ts_node_start_index_wasm"] = _ts_node_start_index_wasm = wasmExports2["ts_node_start_index_wasm"];
    Module["_ts_node_end_index_wasm"] = _ts_node_end_index_wasm = wasmExports2["ts_node_end_index_wasm"];
    Module["_ts_node_to_string_wasm"] = _ts_node_to_string_wasm = wasmExports2["ts_node_to_string_wasm"];
    Module["_ts_node_children_wasm"] = _ts_node_children_wasm = wasmExports2["ts_node_children_wasm"];
    Module["_ts_node_named_children_wasm"] = _ts_node_named_children_wasm = wasmExports2["ts_node_named_children_wasm"];
    Module["_ts_node_descendants_of_type_wasm"] = _ts_node_descendants_of_type_wasm = wasmExports2["ts_node_descendants_of_type_wasm"];
    Module["_ts_node_is_named_wasm"] = _ts_node_is_named_wasm = wasmExports2["ts_node_is_named_wasm"];
    Module["_ts_node_has_changes_wasm"] = _ts_node_has_changes_wasm = wasmExports2["ts_node_has_changes_wasm"];
    Module["_ts_node_has_error_wasm"] = _ts_node_has_error_wasm = wasmExports2["ts_node_has_error_wasm"];
    Module["_ts_node_is_error_wasm"] = _ts_node_is_error_wasm = wasmExports2["ts_node_is_error_wasm"];
    Module["_ts_node_is_missing_wasm"] = _ts_node_is_missing_wasm = wasmExports2["ts_node_is_missing_wasm"];
    Module["_ts_node_is_extra_wasm"] = _ts_node_is_extra_wasm = wasmExports2["ts_node_is_extra_wasm"];
    Module["_ts_node_parse_state_wasm"] = _ts_node_parse_state_wasm = wasmExports2["ts_node_parse_state_wasm"];
    Module["_ts_node_next_parse_state_wasm"] = _ts_node_next_parse_state_wasm = wasmExports2["ts_node_next_parse_state_wasm"];
    Module["_ts_query_matches_wasm"] = _ts_query_matches_wasm = wasmExports2["ts_query_matches_wasm"];
    Module["_ts_query_captures_wasm"] = _ts_query_captures_wasm = wasmExports2["ts_query_captures_wasm"];
    Module["_memset"] = _memset = wasmExports2["memset"];
    Module["_memcpy"] = _memcpy = wasmExports2["memcpy"];
    Module["_memmove"] = _memmove = wasmExports2["memmove"];
    Module["_iswalpha"] = _iswalpha = wasmExports2["iswalpha"];
    Module["_iswblank"] = _iswblank = wasmExports2["iswblank"];
    Module["_iswdigit"] = _iswdigit = wasmExports2["iswdigit"];
    Module["_iswlower"] = _iswlower = wasmExports2["iswlower"];
    Module["_iswupper"] = _iswupper = wasmExports2["iswupper"];
    Module["_iswxdigit"] = _iswxdigit = wasmExports2["iswxdigit"];
    Module["_memchr"] = _memchr = wasmExports2["memchr"];
    Module["_strlen"] = _strlen = wasmExports2["strlen"];
    Module["_strcmp"] = _strcmp = wasmExports2["strcmp"];
    Module["_strncat"] = _strncat = wasmExports2["strncat"];
    Module["_strncpy"] = _strncpy = wasmExports2["strncpy"];
    Module["_towlower"] = _towlower = wasmExports2["towlower"];
    Module["_towupper"] = _towupper = wasmExports2["towupper"];
    _setThrew = wasmExports2["setThrew"];
    __emscripten_stack_restore = wasmExports2["_emscripten_stack_restore"];
    __emscripten_stack_alloc = wasmExports2["_emscripten_stack_alloc"];
    _emscripten_stack_get_current = wasmExports2["emscripten_stack_get_current"];
    ___wasm_apply_data_relocs = wasmExports2["__wasm_apply_data_relocs"];
  }
  __name(assignWasmExports, "assignWasmExports");
  var wasmImports = {
    /** @export */
    __heap_base: ___heap_base,
    /** @export */
    __indirect_function_table: wasmTable,
    /** @export */
    __memory_base: ___memory_base,
    /** @export */
    __stack_high: ___stack_high,
    /** @export */
    __stack_low: ___stack_low,
    /** @export */
    __stack_pointer: ___stack_pointer,
    /** @export */
    __table_base: ___table_base,
    /** @export */
    _abort_js: __abort_js,
    /** @export */
    emscripten_resize_heap: _emscripten_resize_heap,
    /** @export */
    fd_close: _fd_close,
    /** @export */
    fd_seek: _fd_seek,
    /** @export */
    fd_write: _fd_write,
    /** @export */
    memory: wasmMemory,
    /** @export */
    tree_sitter_log_callback: _tree_sitter_log_callback,
    /** @export */
    tree_sitter_parse_callback: _tree_sitter_parse_callback,
    /** @export */
    tree_sitter_progress_callback: _tree_sitter_progress_callback,
    /** @export */
    tree_sitter_query_progress_callback: _tree_sitter_query_progress_callback
  };
  function callMain(args2 = []) {
    var entryFunction = resolveGlobalSymbol("main").sym;
    if (!entryFunction) return;
    args2.unshift(thisProgram);
    var argc = args2.length;
    var argv = stackAlloc((argc + 1) * 4);
    var argv_ptr = argv;
    args2.forEach((arg) => {
      LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, stringToUTF8OnStack(arg));
      argv_ptr += 4;
    });
    LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, 0);
    try {
      var ret = entryFunction(argc, argv);
      exitJS(
        ret,
        /* implicit = */
        true
      );
      return ret;
    } catch (e) {
      return handleException(e);
    }
  }
  __name(callMain, "callMain");
  function run(args2 = arguments_) {
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    preRun();
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    function doRun() {
      Module["calledRun"] = true;
      if (ABORT) return;
      initRuntime();
      preMain();
      readyPromiseResolve?.(Module);
      Module["onRuntimeInitialized"]?.();
      var noInitialRun = Module["noInitialRun"] || false;
      if (!noInitialRun) callMain(args2);
      postRun();
    }
    __name(doRun, "doRun");
    if (Module["setStatus"]) {
      Module["setStatus"]("Running...");
      setTimeout(() => {
        setTimeout(() => Module["setStatus"](""), 1);
        doRun();
      }, 1);
    } else {
      doRun();
    }
  }
  __name(run, "run");
  var wasmExports;
  wasmExports = await createWasm();
  run();
  if (runtimeInitialized) {
    moduleRtn = Module;
  } else {
    moduleRtn = new Promise((resolve22, reject) => {
      readyPromiseResolve = resolve22;
      readyPromiseReject = reject;
    });
  }
  return moduleRtn;
}
async function initializeBinding(moduleOptions) {
  return Module3 ??= await web_tree_sitter_default(moduleOptions);
}
function checkModule() {
  return !!Module3;
}
function parseAnyPredicate(steps, index, operator, textPredicates) {
  if (steps.length !== 3) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}`
    );
  }
  if (!isCaptureStep(steps[1])) {
    throw new Error(
      `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}"`
    );
  }
  const isPositive = operator === "eq?" || operator === "any-eq?";
  const matchAll = !operator.startsWith("any-");
  if (isCaptureStep(steps[2])) {
    const captureName1 = steps[1].name;
    const captureName2 = steps[2].name;
    textPredicates[index].push((captures) => {
      const nodes1 = [];
      const nodes2 = [];
      for (const c2 of captures) {
        if (c2.name === captureName1) nodes1.push(c2.node);
        if (c2.name === captureName2) nodes2.push(c2.node);
      }
      const compare = /* @__PURE__ */ __name((n1, n2, positive) => {
        return positive ? n1.text === n2.text : n1.text !== n2.text;
      }, "compare");
      return matchAll ? nodes1.every((n1) => nodes2.some((n2) => compare(n1, n2, isPositive))) : nodes1.some((n1) => nodes2.some((n2) => compare(n1, n2, isPositive)));
    });
  } else {
    const captureName = steps[1].name;
    const stringValue = steps[2].value;
    const matches = /* @__PURE__ */ __name((n) => n.text === stringValue, "matches");
    const doesNotMatch = /* @__PURE__ */ __name((n) => n.text !== stringValue, "doesNotMatch");
    textPredicates[index].push((captures) => {
      const nodes = [];
      for (const c2 of captures) {
        if (c2.name === captureName) nodes.push(c2.node);
      }
      const test = isPositive ? matches : doesNotMatch;
      return matchAll ? nodes.every(test) : nodes.some(test);
    });
  }
}
function parseMatchPredicate(steps, index, operator, textPredicates) {
  if (steps.length !== 3) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}.`
    );
  }
  if (steps[1].type !== "capture") {
    throw new Error(
      `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`
    );
  }
  if (steps[2].type !== "string") {
    throw new Error(
      `Second argument of \`#${operator}\` predicate must be a string. Got @${steps[2].name}.`
    );
  }
  const isPositive = operator === "match?" || operator === "any-match?";
  const matchAll = !operator.startsWith("any-");
  const captureName = steps[1].name;
  const regex = new RegExp(steps[2].value);
  textPredicates[index].push((captures) => {
    const nodes = [];
    for (const c2 of captures) {
      if (c2.name === captureName) nodes.push(c2.node.text);
    }
    const test = /* @__PURE__ */ __name((text, positive) => {
      return positive ? regex.test(text) : !regex.test(text);
    }, "test");
    if (nodes.length === 0) return !isPositive;
    return matchAll ? nodes.every((text) => test(text, isPositive)) : nodes.some((text) => test(text, isPositive));
  });
}
function parseAnyOfPredicate(steps, index, operator, textPredicates) {
  if (steps.length < 2) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${steps.length - 1}.`
    );
  }
  if (steps[1].type !== "capture") {
    throw new Error(
      `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`
    );
  }
  const isPositive = operator === "any-of?";
  const captureName = steps[1].name;
  const stringSteps = steps.slice(2);
  if (!stringSteps.every(isStringStep)) {
    throw new Error(
      `Arguments to \`#${operator}\` predicate must be strings.".`
    );
  }
  const values = stringSteps.map((s) => s.value);
  textPredicates[index].push((captures) => {
    const nodes = [];
    for (const c2 of captures) {
      if (c2.name === captureName) nodes.push(c2.node.text);
    }
    if (nodes.length === 0) return !isPositive;
    return nodes.every((text) => values.includes(text)) === isPositive;
  });
}
function parseIsPredicate(steps, index, operator, assertedProperties, refutedProperties) {
  if (steps.length < 2 || steps.length > 3) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`
    );
  }
  if (!steps.every(isStringStep)) {
    throw new Error(
      `Arguments to \`#${operator}\` predicate must be strings.".`
    );
  }
  const properties = operator === "is?" ? assertedProperties : refutedProperties;
  if (!properties[index]) properties[index] = {};
  properties[index][steps[1].value] = steps[2]?.value ?? null;
}
function parseSetDirective(steps, index, setProperties) {
  if (steps.length < 2 || steps.length > 3) {
    throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
  }
  if (!steps.every(isStringStep)) {
    throw new Error(`Arguments to \`#set!\` predicate must be strings.".`);
  }
  if (!setProperties[index]) setProperties[index] = {};
  setProperties[index][steps[1].value] = steps[2]?.value ?? null;
}
function parsePattern(index, stepType, stepValueId, captureNames, stringValues, steps, textPredicates, predicates, setProperties, assertedProperties, refutedProperties) {
  if (stepType === PREDICATE_STEP_TYPE_CAPTURE) {
    const name2 = captureNames[stepValueId];
    steps.push({ type: "capture", name: name2 });
  } else if (stepType === PREDICATE_STEP_TYPE_STRING) {
    steps.push({ type: "string", value: stringValues[stepValueId] });
  } else if (steps.length > 0) {
    if (steps[0].type !== "string") {
      throw new Error("Predicates must begin with a literal value");
    }
    const operator = steps[0].value;
    switch (operator) {
      case "any-not-eq?":
      case "not-eq?":
      case "any-eq?":
      case "eq?":
        parseAnyPredicate(steps, index, operator, textPredicates);
        break;
      case "any-not-match?":
      case "not-match?":
      case "any-match?":
      case "match?":
        parseMatchPredicate(steps, index, operator, textPredicates);
        break;
      case "not-any-of?":
      case "any-of?":
        parseAnyOfPredicate(steps, index, operator, textPredicates);
        break;
      case "is?":
      case "is-not?":
        parseIsPredicate(steps, index, operator, assertedProperties, refutedProperties);
        break;
      case "set!":
        parseSetDirective(steps, index, setProperties);
        break;
      default:
        predicates[index].push({ operator, operands: steps.slice(1) });
    }
    steps.length = 0;
  }
}
var __defProp2;
var __name;
var Edit;
var SIZE_OF_SHORT;
var SIZE_OF_INT;
var SIZE_OF_CURSOR;
var SIZE_OF_NODE;
var SIZE_OF_POINT;
var SIZE_OF_RANGE;
var ZERO_POINT;
var INTERNAL;
var C;
var LookaheadIterator;
var Tree;
var TreeCursor;
var Node;
var LANGUAGE_FUNCTION_REGEX;
var Language;
var web_tree_sitter_default;
var Module3;
var TRANSFER_BUFFER;
var LANGUAGE_VERSION;
var MIN_COMPATIBLE_VERSION;
var Parser;
var PREDICATE_STEP_TYPE_CAPTURE;
var PREDICATE_STEP_TYPE_STRING;
var QUERY_WORD_REGEX;
var CaptureQuantifier;
var isCaptureStep;
var isStringStep;
var QueryErrorKind;
var QueryError;
var Query;
var init_web_tree_sitter = __esm({
  "node_modules/.pnpm/web-tree-sitter@0.26.11/node_modules/web-tree-sitter/web-tree-sitter.js"() {
    "use strict";
    __defProp2 = Object.defineProperty;
    __name = (target, value) => __defProp2(target, "name", { value, configurable: true });
    Edit = class {
      static {
        __name(this, "Edit");
      }
      /** The start position of the change. */
      startPosition;
      /** The end position of the change before the edit. */
      oldEndPosition;
      /** The end position of the change after the edit. */
      newEndPosition;
      /** The start index of the change. */
      startIndex;
      /** The end index of the change before the edit. */
      oldEndIndex;
      /** The end index of the change after the edit. */
      newEndIndex;
      constructor({
        startIndex,
        oldEndIndex,
        newEndIndex,
        startPosition,
        oldEndPosition,
        newEndPosition
      }) {
        this.startIndex = startIndex >>> 0;
        this.oldEndIndex = oldEndIndex >>> 0;
        this.newEndIndex = newEndIndex >>> 0;
        this.startPosition = startPosition;
        this.oldEndPosition = oldEndPosition;
        this.newEndPosition = newEndPosition;
      }
      /**
       * Edit a point and index to keep it in-sync with source code that has been edited.
       *
       * This function updates a single point's byte offset and row/column position
       * based on an edit operation. This is useful for editing points without
       * requiring a tree or node instance.
       */
      editPoint(point, index) {
        let newIndex = index;
        const newPoint = { ...point };
        if (index >= this.oldEndIndex) {
          newIndex = this.newEndIndex + (index - this.oldEndIndex);
          const originalRow = point.row;
          newPoint.row = this.newEndPosition.row + (point.row - this.oldEndPosition.row);
          newPoint.column = originalRow === this.oldEndPosition.row ? this.newEndPosition.column + (point.column - this.oldEndPosition.column) : point.column;
        } else if (index > this.startIndex) {
          newIndex = this.newEndIndex;
          newPoint.row = this.newEndPosition.row;
          newPoint.column = this.newEndPosition.column;
        }
        return { point: newPoint, index: newIndex };
      }
      /**
       * Edit a range to keep it in-sync with source code that has been edited.
       *
       * This function updates a range's start and end positions based on an edit
       * operation. This is useful for editing ranges without requiring a tree
       * or node instance.
       */
      editRange(range) {
        const newRange = {
          startIndex: range.startIndex,
          startPosition: { ...range.startPosition },
          endIndex: range.endIndex,
          endPosition: { ...range.endPosition }
        };
        if (range.endIndex >= this.oldEndIndex) {
          if (range.endIndex !== Number.MAX_SAFE_INTEGER) {
            newRange.endIndex = this.newEndIndex + (range.endIndex - this.oldEndIndex);
            newRange.endPosition = {
              row: this.newEndPosition.row + (range.endPosition.row - this.oldEndPosition.row),
              column: range.endPosition.row === this.oldEndPosition.row ? this.newEndPosition.column + (range.endPosition.column - this.oldEndPosition.column) : range.endPosition.column
            };
            if (newRange.endIndex < this.newEndIndex) {
              newRange.endIndex = Number.MAX_SAFE_INTEGER;
              newRange.endPosition = { row: Number.MAX_SAFE_INTEGER, column: Number.MAX_SAFE_INTEGER };
            }
          }
        } else if (range.endIndex > this.startIndex) {
          newRange.endIndex = this.startIndex;
          newRange.endPosition = { ...this.startPosition };
        }
        if (range.startIndex >= this.oldEndIndex) {
          newRange.startIndex = this.newEndIndex + (range.startIndex - this.oldEndIndex);
          newRange.startPosition = {
            row: this.newEndPosition.row + (range.startPosition.row - this.oldEndPosition.row),
            column: range.startPosition.row === this.oldEndPosition.row ? this.newEndPosition.column + (range.startPosition.column - this.oldEndPosition.column) : range.startPosition.column
          };
          if (newRange.startIndex < this.newEndIndex) {
            newRange.startIndex = Number.MAX_SAFE_INTEGER;
            newRange.startPosition = { row: Number.MAX_SAFE_INTEGER, column: Number.MAX_SAFE_INTEGER };
          }
        } else if (range.startIndex > this.startIndex) {
          newRange.startIndex = this.startIndex;
          newRange.startPosition = { ...this.startPosition };
        }
        return newRange;
      }
    };
    SIZE_OF_SHORT = 2;
    SIZE_OF_INT = 4;
    SIZE_OF_CURSOR = 4 * SIZE_OF_INT;
    SIZE_OF_NODE = 5 * SIZE_OF_INT;
    SIZE_OF_POINT = 2 * SIZE_OF_INT;
    SIZE_OF_RANGE = 2 * SIZE_OF_INT + 2 * SIZE_OF_POINT;
    ZERO_POINT = { row: 0, column: 0 };
    INTERNAL = /* @__PURE__ */ Symbol("INTERNAL");
    __name(assertInternal, "assertInternal");
    __name(isPoint, "isPoint");
    __name(setModule, "setModule");
    LookaheadIterator = class {
      static {
        __name(this, "LookaheadIterator");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      language;
      /** @internal */
      constructor(internal, address, language) {
        assertInternal(internal);
        this[0] = address;
        this.language = language;
      }
      /** Get the current symbol of the lookahead iterator. */
      get currentTypeId() {
        return C._ts_lookahead_iterator_current_symbol(this[0]);
      }
      /** Get the current symbol name of the lookahead iterator. */
      get currentType() {
        return this.language.types[this.currentTypeId] || "ERROR";
      }
      /** Delete the lookahead iterator, freeing its resources. */
      delete() {
        C._ts_lookahead_iterator_delete(this[0]);
        this[0] = 0;
      }
      /**
       * Reset the lookahead iterator.
       *
       * This returns `true` if the language was set successfully and `false`
       * otherwise.
       */
      reset(language, stateId) {
        if (C._ts_lookahead_iterator_reset(this[0], language[0], stateId)) {
          this.language = language;
          return true;
        }
        return false;
      }
      /**
       * Reset the lookahead iterator to another state.
       *
       * This returns `true` if the iterator was reset to the given state and
       * `false` otherwise.
       */
      resetState(stateId) {
        return Boolean(C._ts_lookahead_iterator_reset_state(this[0], stateId));
      }
      /**
       * Returns an iterator that iterates over the symbols of the lookahead iterator.
       *
       * The iterator will yield the current symbol name as a string for each step
       * until there are no more symbols to iterate over.
       */
      [Symbol.iterator]() {
        return {
          next: /* @__PURE__ */ __name(() => {
            if (C._ts_lookahead_iterator_next(this[0])) {
              return { done: false, value: this.currentType };
            }
            return { done: true, value: "" };
          }, "next")
        };
      }
    };
    __name(getText, "getText");
    Tree = class _Tree {
      static {
        __name(this, "Tree");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      textCallback;
      /** The language that was used to parse the syntax tree. */
      language;
      /** @internal */
      constructor(internal, address, language, textCallback) {
        assertInternal(internal);
        this[0] = address;
        this.language = language;
        this.textCallback = textCallback;
      }
      /** Create a shallow copy of the syntax tree. This is very fast. */
      copy() {
        const address = C._ts_tree_copy(this[0]);
        return new _Tree(INTERNAL, address, this.language, this.textCallback);
      }
      /** Delete the syntax tree, freeing its resources. */
      delete() {
        C._ts_tree_delete(this[0]);
        this[0] = 0;
      }
      /** Get the root node of the syntax tree. */
      get rootNode() {
        C._ts_tree_root_node_wasm(this[0]);
        return unmarshalNode(this);
      }
      /**
       * Get the root node of the syntax tree, but with its position shifted
       * forward by the given offset.
       */
      rootNodeWithOffset(offsetBytes, offsetExtent) {
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, offsetBytes, "i32");
        marshalPoint(address + SIZE_OF_INT, offsetExtent);
        C._ts_tree_root_node_with_offset_wasm(this[0]);
        return unmarshalNode(this);
      }
      /**
       * Edit the syntax tree to keep it in sync with source code that has been
       * edited.
       *
       * You must describe the edit both in terms of byte offsets and in terms of
       * row/column coordinates.
       */
      edit(edit) {
        marshalEdit(edit);
        C._ts_tree_edit_wasm(this[0]);
      }
      /** Create a new {@link TreeCursor} starting from the root of the tree. */
      walk() {
        return this.rootNode.walk();
      }
      /**
       * Compare this old edited syntax tree to a new syntax tree representing
       * the same document, returning a sequence of ranges whose syntactic
       * structure has changed.
       *
       * For this to work correctly, this syntax tree must have been edited such
       * that its ranges match up to the new tree. Generally, you'll want to
       * call this method right after calling one of the [`Parser::parse`]
       * functions. Call it on the old tree that was passed to parse, and
       * pass the new tree that was returned from `parse`.
       */
      getChangedRanges(other) {
        if (!(other instanceof _Tree)) {
          throw new TypeError("Argument must be a Tree");
        }
        C._ts_tree_get_changed_ranges_wasm(this[0], other[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalRange(address);
            address += SIZE_OF_RANGE;
          }
          C._free(buffer);
        }
        return result;
      }
      /** Get the included ranges that were used to parse the syntax tree. */
      getIncludedRanges() {
        C._ts_tree_included_ranges_wasm(this[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalRange(address);
            address += SIZE_OF_RANGE;
          }
          C._free(buffer);
        }
        return result;
      }
    };
    TreeCursor = class _TreeCursor {
      static {
        __name(this, "TreeCursor");
      }
      /** @internal */
      // @ts-expect-error: never read
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      // @ts-expect-error: never read
      [1] = 0;
      // Internal handle for Wasm
      /** @internal */
      // @ts-expect-error: never read
      [2] = 0;
      // Internal handle for Wasm
      /** @internal */
      // @ts-expect-error: never read
      [3] = 0;
      // Internal handle for Wasm
      /** @internal */
      tree;
      /** @internal */
      constructor(internal, tree) {
        assertInternal(internal);
        this.tree = tree;
        unmarshalTreeCursor(this);
      }
      /** Creates a deep copy of the tree cursor. This allocates new memory. */
      copy() {
        const copy = new _TreeCursor(INTERNAL, this.tree);
        C._ts_tree_cursor_copy_wasm(this.tree[0]);
        unmarshalTreeCursor(copy);
        return copy;
      }
      /** Delete the tree cursor, freeing its resources. */
      delete() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_delete_wasm(this.tree[0]);
        this[0] = this[1] = this[2] = 0;
      }
      /** Get the tree cursor's current {@link Node}. */
      get currentNode() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_current_node_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get the numerical field id of this tree cursor's current node.
       *
       * See also {@link TreeCursor#currentFieldName}.
       */
      get currentFieldId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_field_id_wasm(this.tree[0]);
      }
      /** Get the field name of this tree cursor's current node. */
      get currentFieldName() {
        return this.tree.language.fields[this.currentFieldId];
      }
      /**
       * Get the depth of the cursor's current node relative to the original
       * node that the cursor was constructed with.
       */
      get currentDepth() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_depth_wasm(this.tree[0]);
      }
      /**
       * Get the index of the cursor's current node out of all of the
       * descendants of the original node that the cursor was constructed with.
       */
      get currentDescendantIndex() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_descendant_index_wasm(this.tree[0]);
      }
      /** Get the type of the cursor's current node. */
      get nodeType() {
        return this.tree.language.types[this.nodeTypeId] || "ERROR";
      }
      /** Get the type id of the cursor's current node. */
      get nodeTypeId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_type_id_wasm(this.tree[0]);
      }
      /** Get the state id of the cursor's current node. */
      get nodeStateId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_state_id_wasm(this.tree[0]);
      }
      /** Get the id of the cursor's current node. */
      get nodeId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_id_wasm(this.tree[0]);
      }
      /**
       * Check if the cursor's current node is *named*.
       *
       * Named nodes correspond to named rules in the grammar, whereas
       * *anonymous* nodes correspond to string literals in the grammar.
       */
      get nodeIsNamed() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_is_named_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if the cursor's current node is *missing*.
       *
       * Missing nodes are inserted by the parser in order to recover from
       * certain kinds of syntax errors.
       */
      get nodeIsMissing() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_is_missing_wasm(this.tree[0]) === 1;
      }
      /** Get the string content of the cursor's current node. */
      get nodeText() {
        marshalTreeCursor(this);
        const startIndex = C._ts_tree_cursor_start_index_wasm(this.tree[0]);
        const endIndex = C._ts_tree_cursor_end_index_wasm(this.tree[0]);
        C._ts_tree_cursor_start_position_wasm(this.tree[0]);
        const startPosition = unmarshalPoint(TRANSFER_BUFFER);
        return getText(this.tree, startIndex, endIndex, startPosition);
      }
      /** Get the start position of the cursor's current node. */
      get startPosition() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_start_position_wasm(this.tree[0]);
        return unmarshalPoint(TRANSFER_BUFFER);
      }
      /** Get the end position of the cursor's current node. */
      get endPosition() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_end_position_wasm(this.tree[0]);
        return unmarshalPoint(TRANSFER_BUFFER);
      }
      /** Get the start index of the cursor's current node. */
      get startIndex() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_start_index_wasm(this.tree[0]);
      }
      /** Get the end index of the cursor's current node. */
      get endIndex() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_end_index_wasm(this.tree[0]);
      }
      /**
       * Move this cursor to the first child of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there were no children.
       */
      gotoFirstChild() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_first_child_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the last child of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there were no children.
       *
       * Note that this function may be slower than
       * {@link TreeCursor#gotoFirstChild} because it needs to
       * iterate through all the children to compute the child's position.
       */
      gotoLastChild() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_last_child_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the parent of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there was no parent node (the cursor was already on the
       * root node).
       *
       * Note that the node the cursor was constructed with is considered the root
       * of the cursor, and the cursor cannot walk outside this node.
       */
      gotoParent() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_parent_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the next sibling of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there was no next sibling node.
       *
       * Note that the node the cursor was constructed with is considered the root
       * of the cursor, and the cursor cannot walk outside this node.
       */
      gotoNextSibling() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_next_sibling_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the previous sibling of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there was no previous sibling node.
       *
       * Note that this function may be slower than
       * {@link TreeCursor#gotoNextSibling} due to how node
       * positions are stored. In the worst case, this will need to iterate
       * through all the children up to the previous sibling node to recalculate
       * its position. Also note that the node the cursor was constructed with is
       * considered the root of the cursor, and the cursor cannot walk outside this node.
       */
      gotoPreviousSibling() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_previous_sibling_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move the cursor to the node that is the nth descendant of
       * the original node that the cursor was constructed with, where
       * zero represents the original node itself.
       */
      gotoDescendant(goalDescendantIndex) {
        marshalTreeCursor(this);
        C._ts_tree_cursor_goto_descendant_wasm(this.tree[0], goalDescendantIndex);
        unmarshalTreeCursor(this);
      }
      /**
       * Move this cursor to the first child of its current node that contains or
       * starts after the given byte offset.
       *
       * This returns `true` if the cursor successfully moved to a child node, and returns
       * `false` if no such child was found.
       */
      gotoFirstChildForIndex(goalIndex) {
        marshalTreeCursor(this);
        C.setValue(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalIndex, "i32");
        const result = C._ts_tree_cursor_goto_first_child_for_index_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the first child of its current node that contains or
       * starts after the given byte offset.
       *
       * This returns the index of the child node if one was found, and returns
       * `null` if no such child was found.
       */
      gotoFirstChildForPosition(goalPosition) {
        marshalTreeCursor(this);
        marshalPoint(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalPosition);
        const result = C._ts_tree_cursor_goto_first_child_for_position_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Re-initialize this tree cursor to start at the original node that the
       * cursor was constructed with.
       */
      reset(node) {
        marshalNode(node);
        marshalTreeCursor(this, TRANSFER_BUFFER + SIZE_OF_NODE);
        C._ts_tree_cursor_reset_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
      }
      /**
       * Re-initialize a tree cursor to the same position as another cursor.
       *
       * Unlike {@link TreeCursor#reset}, this will not lose parent
       * information and allows reusing already created cursors.
       */
      resetTo(cursor) {
        marshalTreeCursor(this, TRANSFER_BUFFER);
        marshalTreeCursor(cursor, TRANSFER_BUFFER + SIZE_OF_CURSOR);
        C._ts_tree_cursor_reset_to_wasm(this.tree[0], cursor.tree[0]);
        unmarshalTreeCursor(this);
      }
    };
    Node = class {
      static {
        __name(this, "Node");
      }
      /** @internal */
      // @ts-expect-error: never read
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      _children;
      /** @internal */
      _namedChildren;
      /** @internal */
      constructor(internal, {
        id,
        tree,
        startIndex,
        startPosition,
        other
      }) {
        assertInternal(internal);
        this[0] = other;
        this.id = id;
        this.tree = tree;
        this.startIndex = startIndex;
        this.startPosition = startPosition;
      }
      /**
       * The numeric id for this node that is unique.
       *
       * Within a given syntax tree, no two nodes have the same id. However:
       *
       * * If a new tree is created based on an older tree, and a node from the old tree is reused in
       *   the process, then that node will have the same id in both trees.
       *
       * * A node not marked as having changes does not guarantee it was reused.
       *
       * * If a node is marked as having changed in the old tree, it will not be reused.
       */
      id;
      /** The byte index where this node starts. */
      startIndex;
      /** The position where this node starts. */
      startPosition;
      /** The tree that this node belongs to. */
      tree;
      /** Get this node's type as a numerical id. */
      get typeId() {
        marshalNode(this);
        return C._ts_node_symbol_wasm(this.tree[0]);
      }
      /**
       * Get the node's type as a numerical id as it appears in the grammar,
       * ignoring aliases.
       */
      get grammarId() {
        marshalNode(this);
        return C._ts_node_grammar_symbol_wasm(this.tree[0]);
      }
      /** Get this node's type as a string. */
      get type() {
        return this.tree.language.types[this.typeId] || "ERROR";
      }
      /**
       * Get this node's symbol name as it appears in the grammar, ignoring
       * aliases as a string.
       */
      get grammarType() {
        return this.tree.language.types[this.grammarId] || "ERROR";
      }
      /**
       * Check if this node is *named*.
       *
       * Named nodes correspond to named rules in the grammar, whereas
       * *anonymous* nodes correspond to string literals in the grammar.
       */
      get isNamed() {
        marshalNode(this);
        return C._ts_node_is_named_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node is *extra*.
       *
       * Extra nodes represent things like comments, which are not required
       * by the grammar, but can appear anywhere.
       */
      get isExtra() {
        marshalNode(this);
        return C._ts_node_is_extra_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node represents a syntax error.
       *
       * Syntax errors represent parts of the code that could not be incorporated
       * into a valid syntax tree.
       */
      get isError() {
        marshalNode(this);
        return C._ts_node_is_error_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node is *missing*.
       *
       * Missing nodes are inserted by the parser in order to recover from
       * certain kinds of syntax errors.
       */
      get isMissing() {
        marshalNode(this);
        return C._ts_node_is_missing_wasm(this.tree[0]) === 1;
      }
      /** Check if this node has been edited. */
      get hasChanges() {
        marshalNode(this);
        return C._ts_node_has_changes_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node represents a syntax error or contains any syntax
       * errors anywhere within it.
       */
      get hasError() {
        marshalNode(this);
        return C._ts_node_has_error_wasm(this.tree[0]) === 1;
      }
      /** Get the byte index where this node ends. */
      get endIndex() {
        marshalNode(this);
        return C._ts_node_end_index_wasm(this.tree[0]);
      }
      /** Get the position where this node ends. */
      get endPosition() {
        marshalNode(this);
        C._ts_node_end_point_wasm(this.tree[0]);
        return unmarshalPoint(TRANSFER_BUFFER);
      }
      /** Get the string content of this node. */
      get text() {
        return getText(this.tree, this.startIndex, this.endIndex, this.startPosition);
      }
      /** Get this node's parse state. */
      get parseState() {
        marshalNode(this);
        return C._ts_node_parse_state_wasm(this.tree[0]);
      }
      /** Get the parse state after this node. */
      get nextParseState() {
        marshalNode(this);
        return C._ts_node_next_parse_state_wasm(this.tree[0]);
      }
      /** Check if this node is equal to another node. */
      equals(other) {
        return this.tree === other.tree && this.id === other.id;
      }
      /**
       * Get the node's child at the given index, where zero represents the first child.
       *
       * This method is fairly fast, but its cost is technically log(n), so if
       * you might be iterating over a long list of children, you should use
       * {@link Node#children} instead.
       */
      child(index) {
        marshalNode(this);
        C._ts_node_child_wasm(this.tree[0], index);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's *named* child at the given index.
       *
       * See also {@link Node#isNamed}.
       * This method is fairly fast, but its cost is technically log(n), so if
       * you might be iterating over a long list of children, you should use
       * {@link Node#namedChildren} instead.
       */
      namedChild(index) {
        marshalNode(this);
        C._ts_node_named_child_wasm(this.tree[0], index);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's child with the given numerical field id.
       *
       * See also {@link Node#childForFieldName}. You can
       * convert a field name to an id using {@link Language#fieldIdForName}.
       */
      childForFieldId(fieldId) {
        marshalNode(this);
        C._ts_node_child_by_field_id_wasm(this.tree[0], fieldId);
        return unmarshalNode(this.tree);
      }
      /**
       * Get the first child with the given field name.
       *
       * If multiple children may have the same field name, access them using
       * {@link Node#childrenForFieldName}.
       */
      childForFieldName(fieldName) {
        const fieldId = this.tree.language.fields.indexOf(fieldName);
        if (fieldId !== -1) return this.childForFieldId(fieldId);
        return null;
      }
      /** Get the field name of this node's child at the given index. */
      fieldNameForChild(index) {
        marshalNode(this);
        const address = C._ts_node_field_name_for_child_wasm(this.tree[0], index);
        if (!address) return null;
        return C.AsciiToString(address);
      }
      /** Get the field name of this node's named child at the given index. */
      fieldNameForNamedChild(index) {
        marshalNode(this);
        const address = C._ts_node_field_name_for_named_child_wasm(this.tree[0], index);
        if (!address) return null;
        return C.AsciiToString(address);
      }
      /**
       * Get an array of this node's children with a given field name.
       *
       * See also {@link Node#children}.
       */
      childrenForFieldName(fieldName) {
        const fieldId = this.tree.language.fields.indexOf(fieldName);
        if (fieldId !== -1 && fieldId !== 0) return this.childrenForFieldId(fieldId);
        return [];
      }
      /**
        * Get an array of this node's children with a given field id.
        *
        * See also {@link Node#childrenForFieldName}.
        */
      childrenForFieldId(fieldId) {
        marshalNode(this);
        C._ts_node_children_by_field_id_wasm(this.tree[0], fieldId);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalNode(this.tree, address);
            address += SIZE_OF_NODE;
          }
          C._free(buffer);
        }
        return result;
      }
      /** Get the node's first child that contains or starts after the given byte offset. */
      firstChildForIndex(index) {
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, index, "i32");
        C._ts_node_first_child_for_byte_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the node's first named child that contains or starts after the given byte offset. */
      firstNamedChildForIndex(index) {
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, index, "i32");
        C._ts_node_first_named_child_for_byte_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get this node's number of children. */
      get childCount() {
        marshalNode(this);
        return C._ts_node_child_count_wasm(this.tree[0]);
      }
      /**
       * Get this node's number of *named* children.
       *
       * See also {@link Node#isNamed}.
       */
      get namedChildCount() {
        marshalNode(this);
        return C._ts_node_named_child_count_wasm(this.tree[0]);
      }
      /** Get this node's first child. */
      get firstChild() {
        return this.child(0);
      }
      /**
       * Get this node's first named child.
       *
       * See also {@link Node#isNamed}.
       */
      get firstNamedChild() {
        return this.namedChild(0);
      }
      /** Get this node's last child. */
      get lastChild() {
        return this.child(this.childCount - 1);
      }
      /**
       * Get this node's last named child.
       *
       * See also {@link Node#isNamed}.
       */
      get lastNamedChild() {
        return this.namedChild(this.namedChildCount - 1);
      }
      /**
       * Iterate over this node's children.
       *
       * If you're walking the tree recursively, you may want to use the
       * {@link TreeCursor} APIs directly instead.
       */
      get children() {
        if (!this._children) {
          marshalNode(this);
          C._ts_node_children_wasm(this.tree[0]);
          const count = C.getValue(TRANSFER_BUFFER, "i32");
          const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
          this._children = new Array(count);
          if (count > 0) {
            let address = buffer;
            for (let i2 = 0; i2 < count; i2++) {
              this._children[i2] = unmarshalNode(this.tree, address);
              address += SIZE_OF_NODE;
            }
            C._free(buffer);
          }
        }
        return this._children;
      }
      /**
       * Iterate over this node's named children.
       *
       * See also {@link Node#children}.
       */
      get namedChildren() {
        if (!this._namedChildren) {
          marshalNode(this);
          C._ts_node_named_children_wasm(this.tree[0]);
          const count = C.getValue(TRANSFER_BUFFER, "i32");
          const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
          this._namedChildren = new Array(count);
          if (count > 0) {
            let address = buffer;
            for (let i2 = 0; i2 < count; i2++) {
              this._namedChildren[i2] = unmarshalNode(this.tree, address);
              address += SIZE_OF_NODE;
            }
            C._free(buffer);
          }
        }
        return this._namedChildren;
      }
      /**
       * Get the descendants of this node that are the given type, or in the given types array.
       *
       * The types array should contain node type strings, which can be retrieved from {@link Language#types}.
       *
       * Additionally, a `startPosition` and `endPosition` can be passed in to restrict the search to a byte range.
       */
      descendantsOfType(types, startPosition = ZERO_POINT, endPosition = ZERO_POINT) {
        if (!Array.isArray(types)) types = [types];
        const symbols = [];
        const typesBySymbol = this.tree.language.types;
        for (const node_type of types) {
          if (node_type == "ERROR") {
            symbols.push(65535);
          }
        }
        for (let i2 = 0, n = typesBySymbol.length; i2 < n; i2++) {
          if (types.includes(typesBySymbol[i2])) {
            symbols.push(i2);
          }
        }
        const symbolsAddress = C._malloc(SIZE_OF_INT * symbols.length);
        for (let i2 = 0, n = symbols.length; i2 < n; i2++) {
          C.setValue(symbolsAddress + i2 * SIZE_OF_INT, symbols[i2], "i32");
        }
        marshalNode(this);
        C._ts_node_descendants_of_type_wasm(
          this.tree[0],
          symbolsAddress,
          symbols.length,
          startPosition.row,
          startPosition.column,
          endPosition.row,
          endPosition.column
        );
        const descendantCount = C.getValue(TRANSFER_BUFFER, "i32");
        const descendantAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(descendantCount);
        if (descendantCount > 0) {
          let address = descendantAddress;
          for (let i2 = 0; i2 < descendantCount; i2++) {
            result[i2] = unmarshalNode(this.tree, address);
            address += SIZE_OF_NODE;
          }
        }
        C._free(descendantAddress);
        C._free(symbolsAddress);
        return result;
      }
      /** Get this node's next sibling. */
      get nextSibling() {
        marshalNode(this);
        C._ts_node_next_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get this node's previous sibling. */
      get previousSibling() {
        marshalNode(this);
        C._ts_node_prev_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's next *named* sibling.
       *
       * See also {@link Node#isNamed}.
       */
      get nextNamedSibling() {
        marshalNode(this);
        C._ts_node_next_named_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's previous *named* sibling.
       *
       * See also {@link Node#isNamed}.
       */
      get previousNamedSibling() {
        marshalNode(this);
        C._ts_node_prev_named_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the node's number of descendants, including one for the node itself. */
      get descendantCount() {
        marshalNode(this);
        return C._ts_node_descendant_count_wasm(this.tree[0]);
      }
      /**
       * Get this node's immediate parent.
       * Prefer {@link Node#childWithDescendant} for iterating over this node's ancestors.
       */
      get parent() {
        marshalNode(this);
        C._ts_node_parent_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get the node that contains `descendant`.
       *
       * Note that this can return `descendant` itself.
       */
      childWithDescendant(descendant) {
        marshalNode(this);
        marshalNode(descendant, 1);
        C._ts_node_child_with_descendant_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest node within this node that spans the given byte range. */
      descendantForIndex(start2, end = start2) {
        if (typeof start2 !== "number" || typeof end !== "number") {
          throw new Error("Arguments must be numbers");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, start2, "i32");
        C.setValue(address + SIZE_OF_INT, end, "i32");
        C._ts_node_descendant_for_index_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest named node within this node that spans the given byte range. */
      namedDescendantForIndex(start2, end = start2) {
        if (typeof start2 !== "number" || typeof end !== "number") {
          throw new Error("Arguments must be numbers");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, start2, "i32");
        C.setValue(address + SIZE_OF_INT, end, "i32");
        C._ts_node_named_descendant_for_index_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest node within this node that spans the given point range. */
      descendantForPosition(start2, end = start2) {
        if (!isPoint(start2) || !isPoint(end)) {
          throw new Error("Arguments must be {row, column} objects");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        marshalPoint(address, start2);
        marshalPoint(address + SIZE_OF_POINT, end);
        C._ts_node_descendant_for_position_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest named node within this node that spans the given point range. */
      namedDescendantForPosition(start2, end = start2) {
        if (!isPoint(start2) || !isPoint(end)) {
          throw new Error("Arguments must be {row, column} objects");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        marshalPoint(address, start2);
        marshalPoint(address + SIZE_OF_POINT, end);
        C._ts_node_named_descendant_for_position_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Create a new {@link TreeCursor} starting from this node.
       *
       * Note that the given node is considered the root of the cursor,
       * and the cursor cannot walk outside this node.
       */
      walk() {
        marshalNode(this);
        C._ts_tree_cursor_new_wasm(this.tree[0]);
        return new TreeCursor(INTERNAL, this.tree);
      }
      /**
       * Edit this node to keep it in-sync with source code that has been edited.
       *
       * This function is only rarely needed. When you edit a syntax tree with
       * the {@link Tree#edit} method, all of the nodes that you retrieve from
       * the tree afterward will already reflect the edit. You only need to
       * use {@link Node#edit} when you have a specific {@link Node} instance that
       * you want to keep and continue to use after an edit.
       */
      edit(edit) {
        if (this.startIndex >= edit.oldEndIndex) {
          this.startIndex = edit.newEndIndex + (this.startIndex - edit.oldEndIndex);
          let subbedPointRow;
          let subbedPointColumn;
          if (this.startPosition.row > edit.oldEndPosition.row) {
            subbedPointRow = this.startPosition.row - edit.oldEndPosition.row;
            subbedPointColumn = this.startPosition.column;
          } else {
            subbedPointRow = 0;
            subbedPointColumn = this.startPosition.column;
            if (this.startPosition.column >= edit.oldEndPosition.column) {
              subbedPointColumn = this.startPosition.column - edit.oldEndPosition.column;
            }
          }
          if (subbedPointRow > 0) {
            this.startPosition.row += subbedPointRow;
            this.startPosition.column = subbedPointColumn;
          } else {
            this.startPosition.column += subbedPointColumn;
          }
        } else if (this.startIndex > edit.startIndex) {
          this.startIndex = edit.newEndIndex;
          this.startPosition.row = edit.newEndPosition.row;
          this.startPosition.column = edit.newEndPosition.column;
        }
      }
      /** Get the S-expression representation of this node. */
      toString() {
        marshalNode(this);
        const address = C._ts_node_to_string_wasm(this.tree[0]);
        const result = C.AsciiToString(address);
        C._free(address);
        return result;
      }
    };
    __name(unmarshalCaptures, "unmarshalCaptures");
    __name(marshalNode, "marshalNode");
    __name(unmarshalNode, "unmarshalNode");
    __name(marshalTreeCursor, "marshalTreeCursor");
    __name(unmarshalTreeCursor, "unmarshalTreeCursor");
    __name(marshalPoint, "marshalPoint");
    __name(unmarshalPoint, "unmarshalPoint");
    __name(marshalRange, "marshalRange");
    __name(unmarshalRange, "unmarshalRange");
    __name(marshalEdit, "marshalEdit");
    __name(unmarshalLanguageMetadata, "unmarshalLanguageMetadata");
    LANGUAGE_FUNCTION_REGEX = /^tree_sitter_\w+$/;
    Language = class _Language {
      static {
        __name(this, "Language");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for Wasm
      /**
       * A list of all node types in the language. The index of each type in this
       * array is its node type id.
       */
      types;
      /**
       * A list of all field names in the language. The index of each field name in
       * this array is its field id.
       */
      fields;
      /** @internal */
      constructor(internal, address) {
        assertInternal(internal);
        this[0] = address;
        this.types = new Array(C._ts_language_symbol_count(this[0]));
        for (let i2 = 0, n = this.types.length; i2 < n; i2++) {
          if (C._ts_language_symbol_type(this[0], i2) < 2) {
            this.types[i2] = C.UTF8ToString(C._ts_language_symbol_name(this[0], i2));
          }
        }
        this.fields = new Array(C._ts_language_field_count(this[0]) + 1);
        for (let i2 = 0, n = this.fields.length; i2 < n; i2++) {
          const fieldName = C._ts_language_field_name_for_id(this[0], i2);
          if (fieldName !== 0) {
            this.fields[i2] = C.UTF8ToString(fieldName);
          } else {
            this.fields[i2] = null;
          }
        }
      }
      /**
       * Gets the name of the language.
       */
      get name() {
        const ptr = C._ts_language_name(this[0]);
        if (ptr === 0) return null;
        return C.UTF8ToString(ptr);
      }
      /**
       * Gets the ABI version of the language.
       */
      get abiVersion() {
        return C._ts_language_abi_version(this[0]);
      }
      /**
      * Get the metadata for this language. This information is generated by the
      * CLI, and relies on the language author providing the correct metadata in
      * the language's `tree-sitter.json` file.
      */
      get metadata() {
        C._ts_language_metadata_wasm(this[0]);
        const length = C.getValue(TRANSFER_BUFFER, "i32");
        if (length === 0) return null;
        return unmarshalLanguageMetadata(TRANSFER_BUFFER + SIZE_OF_INT);
      }
      /**
       * Gets the number of fields in the language.
       */
      get fieldCount() {
        return this.fields.length - 1;
      }
      /**
       * Gets the number of states in the language.
       */
      get stateCount() {
        return C._ts_language_state_count(this[0]);
      }
      /**
       * Get the field id for a field name.
       */
      fieldIdForName(fieldName) {
        const result = this.fields.indexOf(fieldName);
        return result !== -1 ? result : null;
      }
      /**
       * Get the field name for a field id.
       */
      fieldNameForId(fieldId) {
        return this.fields[fieldId] ?? null;
      }
      /**
       * Get the node type id for a node type name.
       */
      idForNodeType(type, named) {
        const typeLength = C.lengthBytesUTF8(type);
        const typeAddress = C._malloc(typeLength + 1);
        C.stringToUTF8(type, typeAddress, typeLength + 1);
        const result = C._ts_language_symbol_for_name(this[0], typeAddress, typeLength, named ? 1 : 0);
        C._free(typeAddress);
        return result || null;
      }
      /**
       * Gets the number of node types in the language.
       */
      get nodeTypeCount() {
        return C._ts_language_symbol_count(this[0]);
      }
      /**
       * Get the node type name for a node type id.
       */
      nodeTypeForId(typeId) {
        const name2 = C._ts_language_symbol_name(this[0], typeId);
        return name2 ? C.UTF8ToString(name2) : null;
      }
      /**
       * Check if a node type is named.
       *
       * @see {@link https://tree-sitter.github.io/tree-sitter/using-parsers/2-basic-parsing.html#named-vs-anonymous-nodes}
       */
      nodeTypeIsNamed(typeId) {
        return C._ts_language_type_is_named_wasm(this[0], typeId) ? true : false;
      }
      /**
       * Check if a node type is visible.
       */
      nodeTypeIsVisible(typeId) {
        return C._ts_language_type_is_visible_wasm(this[0], typeId) ? true : false;
      }
      /**
       * Get the supertypes ids of this language.
       *
       * @see {@link https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types.html?highlight=supertype#supertype-nodes}
       */
      get supertypes() {
        C._ts_language_supertypes_wasm(this[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = C.getValue(address, "i16");
            address += SIZE_OF_SHORT;
          }
        }
        return result;
      }
      /**
       * Get the subtype ids for a given supertype node id.
       */
      subtypes(supertype) {
        C._ts_language_subtypes_wasm(this[0], supertype);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = C.getValue(address, "i16");
            address += SIZE_OF_SHORT;
          }
        }
        return result;
      }
      /**
       * Get the next state id for a given state id and node type id.
       */
      nextState(stateId, typeId) {
        return C._ts_language_next_state(this[0], stateId, typeId);
      }
      /**
       * Create a new lookahead iterator for this language and parse state.
       *
       * This returns `null` if state is invalid for this language.
       *
       * Iterating {@link LookaheadIterator} will yield valid symbols in the given
       * parse state. Newly created lookahead iterators will return the `ERROR`
       * symbol from {@link LookaheadIterator#currentType}.
       *
       * Lookahead iterators can be useful for generating suggestions and improving
       * syntax error diagnostics. To get symbols valid in an `ERROR` node, use the
       * lookahead iterator on its first leaf node state. For `MISSING` nodes, a
       * lookahead iterator created on the previous non-extra leaf node may be
       * appropriate.
       */
      lookaheadIterator(stateId) {
        const address = C._ts_lookahead_iterator_new(this[0], stateId);
        if (address) return new LookaheadIterator(INTERNAL, address, this);
        return null;
      }
      /**
       * Load a language from a WebAssembly module.
       * The module can be provided as a path to a file or as a buffer.
       */
      static async load(input) {
        let binary2;
        if (input instanceof Uint8Array) {
          binary2 = input;
        } else if (globalThis.process?.versions.node) {
          const fs2 = await import("fs/promises");
          binary2 = await fs2.readFile(input);
        } else {
          const response = await fetch(input);
          if (!response.ok) {
            const body2 = await response.text();
            throw new Error(`Language.load failed with status ${response.status}.

${body2}`);
          }
          const retryResp = response.clone();
          try {
            binary2 = await WebAssembly.compileStreaming(response);
          } catch (reason) {
            console.error("wasm streaming compile failed:", reason);
            console.error("falling back to ArrayBuffer instantiation");
            binary2 = new Uint8Array(await retryResp.arrayBuffer());
          }
        }
        const mod = await C.loadWebAssemblyModule(binary2, { loadAsync: true });
        const symbolNames = Object.keys(mod);
        const functionName = symbolNames.find((key) => LANGUAGE_FUNCTION_REGEX.test(key) && !key.includes("external_scanner_"));
        if (!functionName) {
          console.log(`Couldn't find language function in Wasm file. Symbols:
${JSON.stringify(symbolNames, null, 2)}`);
          throw new Error("Language.load failed: no language function found in Wasm file");
        }
        const languageAddress = mod[functionName]();
        return new _Language(INTERNAL, languageAddress);
      }
    };
    __name(Module2, "Module");
    web_tree_sitter_default = Module2;
    Module3 = null;
    __name(initializeBinding, "initializeBinding");
    __name(checkModule, "checkModule");
    Parser = class {
      static {
        __name(this, "Parser");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      [1] = 0;
      // Internal handle for Wasm
      /** @internal */
      logCallback = null;
      /** The parser's current language. */
      language = null;
      /**
       * This must always be called before creating a Parser.
       *
       * You can optionally pass in options to configure the Wasm module, the most common
       * one being `locateFile` to help the module find the `.wasm` file.
       */
      static async init(moduleOptions) {
        setModule(await initializeBinding(moduleOptions));
        TRANSFER_BUFFER = C._ts_init();
        LANGUAGE_VERSION = C.getValue(TRANSFER_BUFFER, "i32");
        MIN_COMPATIBLE_VERSION = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      }
      /**
       * Create a new parser.
       */
      constructor() {
        this.initialize();
      }
      /** @internal */
      initialize() {
        if (!checkModule()) {
          throw new Error("cannot construct a Parser before calling `init()`");
        }
        C._ts_parser_new_wasm();
        this[0] = C.getValue(TRANSFER_BUFFER, "i32");
        this[1] = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      }
      /** Delete the parser, freeing its resources. */
      delete() {
        C._ts_parser_delete(this[0]);
        C._free(this[1]);
        this[0] = 0;
        this[1] = 0;
      }
      /**
       * Set the language that the parser should use for parsing.
       *
       * If the language was not successfully assigned, an error will be thrown.
       * This happens if the language was generated with an incompatible
       * version of the Tree-sitter CLI. Check the language's version using
       * {@link Language#version} and compare it to this library's
       * {@link LANGUAGE_VERSION} and {@link MIN_COMPATIBLE_VERSION} constants.
       */
      setLanguage(language) {
        let address;
        if (!language) {
          address = 0;
          this.language = null;
        } else if (language.constructor === Language) {
          address = language[0];
          const version = C._ts_language_abi_version(address);
          if (version < MIN_COMPATIBLE_VERSION || LANGUAGE_VERSION < version) {
            throw new Error(
              `Incompatible language version ${version}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${LANGUAGE_VERSION}.`
            );
          }
          this.language = language;
        } else {
          throw new Error("Argument must be a Language");
        }
        C._ts_parser_set_language(this[0], address);
        return this;
      }
      /**
       * Parse a slice of UTF8 text.
       *
       * @param {string | ParseCallback} callback - The UTF8-encoded text to parse or a callback function.
       *
       * @param {Tree | null} [oldTree] - A previous syntax tree parsed from the same document. If the text of the
       *   document has changed since `oldTree` was created, then you must edit `oldTree` to match
       *   the new text using {@link Tree#edit}.
       *
       * @param {ParseOptions} [options] - Options for parsing the text.
       *  This can be used to set the included ranges, or a progress callback.
       *
       * @returns {Tree | null} A {@link Tree} if parsing succeeded, or `null` if:
       *  - The parser has not yet had a language assigned with {@link Parser#setLanguage}.
       *  - The progress callback returned true.
       */
      parse(callback, oldTree, options) {
        if (typeof callback === "string") {
          C.currentParseCallback = (index) => callback.slice(index);
        } else if (typeof callback === "function") {
          C.currentParseCallback = callback;
        } else {
          throw new Error("Argument must be a string or a function");
        }
        if (options?.progressCallback) {
          C.currentProgressCallback = options.progressCallback;
        } else {
          C.currentProgressCallback = null;
        }
        if (this.logCallback) {
          C.currentLogCallback = this.logCallback;
          C._ts_parser_enable_logger_wasm(this[0], 1);
        } else {
          C.currentLogCallback = null;
          C._ts_parser_enable_logger_wasm(this[0], 0);
        }
        let rangeCount = 0;
        let rangeAddress = 0;
        if (options?.includedRanges) {
          rangeCount = options.includedRanges.length;
          rangeAddress = C._calloc(rangeCount, SIZE_OF_RANGE);
          let address = rangeAddress;
          for (let i2 = 0; i2 < rangeCount; i2++) {
            marshalRange(address, options.includedRanges[i2]);
            address += SIZE_OF_RANGE;
          }
        }
        const treeAddress = C._ts_parser_parse_wasm(
          this[0],
          this[1],
          oldTree ? oldTree[0] : 0,
          rangeAddress,
          rangeCount
        );
        if (!treeAddress) {
          C.currentParseCallback = null;
          C.currentLogCallback = null;
          C.currentProgressCallback = null;
          return null;
        }
        if (!this.language) {
          throw new Error("Parser must have a language to parse");
        }
        const result = new Tree(INTERNAL, treeAddress, this.language, C.currentParseCallback);
        C.currentParseCallback = null;
        C.currentLogCallback = null;
        C.currentProgressCallback = null;
        return result;
      }
      /**
       * Instruct the parser to start the next parse from the beginning.
       *
       * If the parser previously failed because of a callback, 
       * then by default, it will resume where it left off on the
       * next call to {@link Parser#parse} or other parsing functions.
       * If you don't want to resume, and instead intend to use this parser to
       * parse some other document, you must call `reset` first.
       */
      reset() {
        C._ts_parser_reset(this[0]);
      }
      /** Get the ranges of text that the parser will include when parsing. */
      getIncludedRanges() {
        C._ts_parser_included_ranges_wasm(this[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalRange(address);
            address += SIZE_OF_RANGE;
          }
          C._free(buffer);
        }
        return result;
      }
      /** Set the logging callback that a parser should use during parsing. */
      setLogger(callback) {
        if (!callback) {
          this.logCallback = null;
        } else if (typeof callback !== "function") {
          throw new Error("Logger callback must be a function");
        } else {
          this.logCallback = callback;
        }
        return this;
      }
      /** Get the parser's current logger. */
      getLogger() {
        return this.logCallback;
      }
    };
    PREDICATE_STEP_TYPE_CAPTURE = 1;
    PREDICATE_STEP_TYPE_STRING = 2;
    QUERY_WORD_REGEX = /[\w-]+/g;
    CaptureQuantifier = {
      Zero: 0,
      ZeroOrOne: 1,
      ZeroOrMore: 2,
      One: 3,
      OneOrMore: 4
    };
    isCaptureStep = /* @__PURE__ */ __name((step) => step.type === "capture", "isCaptureStep");
    isStringStep = /* @__PURE__ */ __name((step) => step.type === "string", "isStringStep");
    QueryErrorKind = {
      Syntax: 1,
      NodeName: 2,
      FieldName: 3,
      CaptureName: 4,
      PatternStructure: 5
    };
    QueryError = class _QueryError extends Error {
      constructor(kind, info2, index, length) {
        super(_QueryError.formatMessage(kind, info2));
        this.kind = kind;
        this.info = info2;
        this.index = index;
        this.length = length;
        this.name = "QueryError";
      }
      static {
        __name(this, "QueryError");
      }
      /** Formats an error message based on the error kind and info */
      static formatMessage(kind, info2) {
        switch (kind) {
          case QueryErrorKind.NodeName:
            return `Bad node name '${info2.word}'`;
          case QueryErrorKind.FieldName:
            return `Bad field name '${info2.word}'`;
          case QueryErrorKind.CaptureName:
            return `Bad capture name @${info2.word}`;
          case QueryErrorKind.PatternStructure:
            return `Bad pattern structure at offset ${info2.suffix}`;
          case QueryErrorKind.Syntax:
            return `Bad syntax at offset ${info2.suffix}`;
        }
      }
    };
    __name(parseAnyPredicate, "parseAnyPredicate");
    __name(parseMatchPredicate, "parseMatchPredicate");
    __name(parseAnyOfPredicate, "parseAnyOfPredicate");
    __name(parseIsPredicate, "parseIsPredicate");
    __name(parseSetDirective, "parseSetDirective");
    __name(parsePattern, "parsePattern");
    Query = class {
      static {
        __name(this, "Query");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      exceededMatchLimit;
      /** @internal */
      textPredicates;
      /** The names of the captures used in the query. */
      captureNames;
      /** The quantifiers of the captures used in the query. */
      captureQuantifiers;
      /**
       * The other user-defined predicates associated with the given index.
       *
       * This includes predicates with operators other than:
       * - `match?`
       * - `eq?` and `not-eq?`
       * - `any-of?` and `not-any-of?`
       * - `is?` and `is-not?`
       * - `set!`
       */
      predicates;
      /** The properties for predicates with the operator `set!`. */
      setProperties;
      /** The properties for predicates with the operator `is?`. */
      assertedProperties;
      /** The properties for predicates with the operator `is-not?`. */
      refutedProperties;
      /** The maximum number of in-progress matches for this cursor. */
      matchLimit;
      /**
       * Create a new query from a string containing one or more S-expression
       * patterns.
       *
       * The query is associated with a particular language, and can only be run
       * on syntax nodes parsed with that language. References to Queries can be
       * shared between multiple threads.
       *
       * @link {@see https://tree-sitter.github.io/tree-sitter/using-parsers/queries}
       */
      constructor(language, source) {
        const sourceLength = C.lengthBytesUTF8(source);
        const sourceAddress = C._malloc(sourceLength + 1);
        C.stringToUTF8(source, sourceAddress, sourceLength + 1);
        const address = C._ts_query_new(
          language[0],
          sourceAddress,
          sourceLength,
          TRANSFER_BUFFER,
          TRANSFER_BUFFER + SIZE_OF_INT
        );
        if (!address) {
          const errorId = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
          const errorByte = C.getValue(TRANSFER_BUFFER, "i32");
          const errorIndex = C.UTF8ToString(sourceAddress, errorByte).length;
          const suffix = source.slice(errorIndex, errorIndex + 100).split("\n")[0];
          const word = suffix.match(QUERY_WORD_REGEX)?.[0] ?? "";
          C._free(sourceAddress);
          switch (errorId) {
            case QueryErrorKind.Syntax:
              throw new QueryError(QueryErrorKind.Syntax, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
            case QueryErrorKind.NodeName:
              throw new QueryError(errorId, { word }, errorIndex, word.length);
            case QueryErrorKind.FieldName:
              throw new QueryError(errorId, { word }, errorIndex, word.length);
            case QueryErrorKind.CaptureName:
              throw new QueryError(errorId, { word }, errorIndex, word.length);
            case QueryErrorKind.PatternStructure:
              throw new QueryError(errorId, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
          }
        }
        const stringCount = C._ts_query_string_count(address);
        const captureCount = C._ts_query_capture_count(address);
        const patternCount = C._ts_query_pattern_count(address);
        const captureNames = new Array(captureCount);
        const captureQuantifiers = new Array(patternCount);
        const stringValues = new Array(stringCount);
        for (let i2 = 0; i2 < captureCount; i2++) {
          const nameAddress = C._ts_query_capture_name_for_id(
            address,
            i2,
            TRANSFER_BUFFER
          );
          const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
          captureNames[i2] = C.UTF8ToString(nameAddress, nameLength);
        }
        for (let i2 = 0; i2 < patternCount; i2++) {
          const captureQuantifiersArray = new Array(captureCount);
          for (let j = 0; j < captureCount; j++) {
            const quantifier = C._ts_query_capture_quantifier_for_id(address, i2, j);
            captureQuantifiersArray[j] = quantifier;
          }
          captureQuantifiers[i2] = captureQuantifiersArray;
        }
        for (let i2 = 0; i2 < stringCount; i2++) {
          const valueAddress = C._ts_query_string_value_for_id(
            address,
            i2,
            TRANSFER_BUFFER
          );
          const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
          stringValues[i2] = C.UTF8ToString(valueAddress, nameLength);
        }
        const setProperties = new Array(patternCount);
        const assertedProperties = new Array(patternCount);
        const refutedProperties = new Array(patternCount);
        const predicates = new Array(patternCount);
        const textPredicates = new Array(patternCount);
        for (let i2 = 0; i2 < patternCount; i2++) {
          const predicatesAddress = C._ts_query_predicates_for_pattern(address, i2, TRANSFER_BUFFER);
          const stepCount = C.getValue(TRANSFER_BUFFER, "i32");
          predicates[i2] = [];
          textPredicates[i2] = [];
          const steps = new Array();
          let stepAddress = predicatesAddress;
          for (let j = 0; j < stepCount; j++) {
            const stepType = C.getValue(stepAddress, "i32");
            stepAddress += SIZE_OF_INT;
            const stepValueId = C.getValue(stepAddress, "i32");
            stepAddress += SIZE_OF_INT;
            parsePattern(
              i2,
              stepType,
              stepValueId,
              captureNames,
              stringValues,
              steps,
              textPredicates,
              predicates,
              setProperties,
              assertedProperties,
              refutedProperties
            );
          }
          Object.freeze(textPredicates[i2]);
          Object.freeze(predicates[i2]);
          Object.freeze(setProperties[i2]);
          Object.freeze(assertedProperties[i2]);
          Object.freeze(refutedProperties[i2]);
        }
        C._free(sourceAddress);
        this[0] = address;
        this.captureNames = captureNames;
        this.captureQuantifiers = captureQuantifiers;
        this.textPredicates = textPredicates;
        this.predicates = predicates;
        this.setProperties = setProperties;
        this.assertedProperties = assertedProperties;
        this.refutedProperties = refutedProperties;
        this.exceededMatchLimit = false;
      }
      /** Delete the query, freeing its resources. */
      delete() {
        C._ts_query_delete(this[0]);
        this[0] = 0;
      }
      /**
       * Iterate over all of the matches in the order that they were found.
       *
       * Each match contains the index of the pattern that matched, and a list of
       * captures. Because multiple patterns can match the same set of nodes,
       * one match may contain captures that appear *before* some of the
       * captures from a previous match.
       *
       * @param {Node} node - The node to execute the query on.
       *
       * @param {QueryOptions} options - Options for query execution.
       */
      matches(node, options = {}) {
        const startPosition = options.startPosition ?? ZERO_POINT;
        const endPosition = options.endPosition ?? ZERO_POINT;
        const startIndex = options.startIndex ?? 0;
        const endIndex = options.endIndex ?? 0;
        const startContainingPosition = options.startContainingPosition ?? ZERO_POINT;
        const endContainingPosition = options.endContainingPosition ?? ZERO_POINT;
        const startContainingIndex = options.startContainingIndex ?? 0;
        const endContainingIndex = options.endContainingIndex ?? 0;
        const matchLimit = options.matchLimit ?? 4294967295;
        const maxStartDepth = options.maxStartDepth ?? 4294967295;
        const progressCallback = options.progressCallback;
        if (typeof matchLimit !== "number") {
          throw new Error("Arguments must be numbers");
        }
        this.matchLimit = matchLimit;
        if (endIndex !== 0 && startIndex > endIndex) {
          throw new Error("`startIndex` cannot be greater than `endIndex`");
        }
        if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
          throw new Error("`startPosition` cannot be greater than `endPosition`");
        }
        if (endContainingIndex !== 0 && startContainingIndex > endContainingIndex) {
          throw new Error("`startContainingIndex` cannot be greater than `endContainingIndex`");
        }
        if (endContainingPosition !== ZERO_POINT && (startContainingPosition.row > endContainingPosition.row || startContainingPosition.row === endContainingPosition.row && startContainingPosition.column > endContainingPosition.column)) {
          throw new Error("`startContainingPosition` cannot be greater than `endContainingPosition`");
        }
        if (progressCallback) {
          C.currentQueryProgressCallback = progressCallback;
        }
        marshalNode(node);
        C._ts_query_matches_wasm(
          this[0],
          node.tree[0],
          startPosition.row,
          startPosition.column,
          endPosition.row,
          endPosition.column,
          startIndex,
          endIndex,
          startContainingPosition.row,
          startContainingPosition.column,
          endContainingPosition.row,
          endContainingPosition.column,
          startContainingIndex,
          endContainingIndex,
          matchLimit,
          maxStartDepth
        );
        const rawCount = C.getValue(TRANSFER_BUFFER, "i32");
        const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
        const result = new Array(rawCount);
        this.exceededMatchLimit = Boolean(didExceedMatchLimit);
        let filteredCount = 0;
        let address = startAddress;
        for (let i2 = 0; i2 < rawCount; i2++) {
          const patternIndex = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captureCount = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captures = new Array(captureCount);
          address = unmarshalCaptures(this, node.tree, address, patternIndex, captures);
          if (this.textPredicates[patternIndex].every((p) => p(captures))) {
            result[filteredCount] = { patternIndex, captures };
            const setProperties = this.setProperties[patternIndex];
            result[filteredCount].setProperties = setProperties;
            const assertedProperties = this.assertedProperties[patternIndex];
            result[filteredCount].assertedProperties = assertedProperties;
            const refutedProperties = this.refutedProperties[patternIndex];
            result[filteredCount].refutedProperties = refutedProperties;
            filteredCount++;
          }
        }
        result.length = filteredCount;
        C._free(startAddress);
        C.currentQueryProgressCallback = null;
        return result;
      }
      /**
       * Iterate over all of the individual captures in the order that they
       * appear.
       *
       * This is useful if you don't care about which pattern matched, and just
       * want a single, ordered sequence of captures.
       *
       * @param {Node} node - The node to execute the query on.
       *
       * @param {QueryOptions} options - Options for query execution.
       */
      captures(node, options = {}) {
        const startPosition = options.startPosition ?? ZERO_POINT;
        const endPosition = options.endPosition ?? ZERO_POINT;
        const startIndex = options.startIndex ?? 0;
        const endIndex = options.endIndex ?? 0;
        const startContainingPosition = options.startContainingPosition ?? ZERO_POINT;
        const endContainingPosition = options.endContainingPosition ?? ZERO_POINT;
        const startContainingIndex = options.startContainingIndex ?? 0;
        const endContainingIndex = options.endContainingIndex ?? 0;
        const matchLimit = options.matchLimit ?? 4294967295;
        const maxStartDepth = options.maxStartDepth ?? 4294967295;
        const progressCallback = options.progressCallback;
        if (typeof matchLimit !== "number") {
          throw new Error("Arguments must be numbers");
        }
        this.matchLimit = matchLimit;
        if (endIndex !== 0 && startIndex > endIndex) {
          throw new Error("`startIndex` cannot be greater than `endIndex`");
        }
        if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
          throw new Error("`startPosition` cannot be greater than `endPosition`");
        }
        if (endContainingIndex !== 0 && startContainingIndex > endContainingIndex) {
          throw new Error("`startContainingIndex` cannot be greater than `endContainingIndex`");
        }
        if (endContainingPosition !== ZERO_POINT && (startContainingPosition.row > endContainingPosition.row || startContainingPosition.row === endContainingPosition.row && startContainingPosition.column > endContainingPosition.column)) {
          throw new Error("`startContainingPosition` cannot be greater than `endContainingPosition`");
        }
        if (progressCallback) {
          C.currentQueryProgressCallback = progressCallback;
        }
        marshalNode(node);
        C._ts_query_captures_wasm(
          this[0],
          node.tree[0],
          startPosition.row,
          startPosition.column,
          endPosition.row,
          endPosition.column,
          startIndex,
          endIndex,
          startContainingPosition.row,
          startContainingPosition.column,
          endContainingPosition.row,
          endContainingPosition.column,
          startContainingIndex,
          endContainingIndex,
          matchLimit,
          maxStartDepth
        );
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
        const result = new Array();
        this.exceededMatchLimit = Boolean(didExceedMatchLimit);
        const captures = new Array();
        let address = startAddress;
        for (let i2 = 0; i2 < count; i2++) {
          const patternIndex = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captureCount = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captureIndex = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          captures.length = captureCount;
          address = unmarshalCaptures(this, node.tree, address, patternIndex, captures);
          if (this.textPredicates[patternIndex].every((p) => p(captures))) {
            const capture = captures[captureIndex];
            const setProperties = this.setProperties[patternIndex];
            capture.setProperties = setProperties;
            const assertedProperties = this.assertedProperties[patternIndex];
            capture.assertedProperties = assertedProperties;
            const refutedProperties = this.refutedProperties[patternIndex];
            capture.refutedProperties = refutedProperties;
            result.push(capture);
          }
        }
        C._free(startAddress);
        C.currentQueryProgressCallback = null;
        return result;
      }
      /** Get the predicates for a given pattern. */
      predicatesForPattern(patternIndex) {
        return this.predicates[patternIndex];
      }
      /**
       * Disable a certain capture within a query.
       *
       * This prevents the capture from being returned in matches, and also
       * avoids any resource usage associated with recording the capture.
       */
      disableCapture(captureName) {
        const captureNameLength = C.lengthBytesUTF8(captureName);
        const captureNameAddress = C._malloc(captureNameLength + 1);
        C.stringToUTF8(captureName, captureNameAddress, captureNameLength + 1);
        C._ts_query_disable_capture(this[0], captureNameAddress, captureNameLength);
        C._free(captureNameAddress);
      }
      /**
       * Disable a certain pattern within a query.
       *
       * This prevents the pattern from matching, and also avoids any resource
       * usage associated with the pattern. This throws an error if the pattern
       * index is out of bounds.
       */
      disablePattern(patternIndex) {
        if (patternIndex >= this.predicates.length) {
          throw new Error(
            `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
          );
        }
        C._ts_query_disable_pattern(this[0], patternIndex);
      }
      /**
       * Check if, on its last execution, this cursor exceeded its maximum number
       * of in-progress matches.
       */
      didExceedMatchLimit() {
        return this.exceededMatchLimit;
      }
      /** Get the byte offset where the given pattern starts in the query's source. */
      startIndexForPattern(patternIndex) {
        if (patternIndex >= this.predicates.length) {
          throw new Error(
            `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
          );
        }
        return C._ts_query_start_byte_for_pattern(this[0], patternIndex);
      }
      /** Get the byte offset where the given pattern ends in the query's source. */
      endIndexForPattern(patternIndex) {
        if (patternIndex >= this.predicates.length) {
          throw new Error(
            `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
          );
        }
        return C._ts_query_end_byte_for_pattern(this[0], patternIndex);
      }
      /** Get the number of patterns in the query. */
      patternCount() {
        return C._ts_query_pattern_count(this[0]);
      }
      /** Get the index for a given capture name. */
      captureIndexForName(captureName) {
        return this.captureNames.indexOf(captureName);
      }
      /** Check if a given pattern within a query has a single root node. */
      isPatternRooted(patternIndex) {
        return C._ts_query_is_pattern_rooted(this[0], patternIndex) === 1;
      }
      /** Check if a given pattern within a query has a single root node. */
      isPatternNonLocal(patternIndex) {
        return C._ts_query_is_pattern_non_local(this[0], patternIndex) === 1;
      }
      /**
       * Check if a given step in a query is 'definite'.
       *
       * A query step is 'definite' if its parent pattern will be guaranteed to
       * match successfully once it reaches the step.
       */
      isPatternGuaranteedAtStep(byteIndex) {
        return C._ts_query_is_pattern_guaranteed_at_step(this[0], byteIndex) === 1;
      }
    };
  }
});
function grammarKeyForExt(ext) {
  return EXT_GRAMMAR[ext];
}
function resolveGrammarDir() {
  const env = process.env.CODEINDEX_GRAMMAR_DIR ?? process.env.ULTRAINDEX_GRAMMAR_DIR;
  if (env && existsSync2(env)) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join22(here, "grammars"),
    // bundle: <...>/scripts/grammars
    join22(here, "..", "..", "scripts", "grammars"),
    // dev: src/ast → <repo>/scripts/grammars
    join22(here, "..", "scripts", "grammars")
  ];
  for (const c2 of candidates) if (existsSync2(c2)) return c2;
  return join22(here, "grammars");
}
async function ensureGrammars(keys) {
  const dir = resolveGrammarDir();
  if (!runtimeReady) {
    const runtime = join22(dir, "web-tree-sitter.wasm");
    if (!existsSync2(runtime)) return;
    await Parser.init({ wasmBinary: readFileSync2(runtime) });
    runtimeReady = true;
    parser = new Parser();
  }
  for (const key of new Set(keys)) {
    if (loaded.has(key) || failed.has(key)) continue;
    const wasm = join22(dir, `${key}.wasm`);
    if (!existsSync2(wasm)) {
      failed.add(key);
      continue;
    }
    try {
      loaded.set(key, await Language.load(new Uint8Array(readFileSync2(wasm))));
    } catch {
      failed.add(key);
    }
  }
}
function allGrammarKeys() {
  return [...new Set(Object.values(EXT_GRAMMAR))];
}
function grammarReady(key) {
  return loaded.has(key);
}
function parserFor(key) {
  const lang = loaded.get(key);
  if (!parser || !lang) return null;
  parser.setLanguage(lang);
  return parser;
}
var EXT_GRAMMAR;
var runtimeReady;
var parser;
var loaded;
var failed;
var init_loader = __esm({
  "src/ast/loader.ts"() {
    "use strict";
    init_web_tree_sitter();
    EXT_GRAMMAR = {
      ".ts": "typescript",
      ".mts": "typescript",
      ".cts": "typescript",
      ".tsx": "tsx",
      ".js": "javascript",
      ".jsx": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".py": "python",
      ".pyi": "python",
      ".go": "go",
      ".rs": "rust",
      ".java": "java",
      ".rb": "ruby",
      ".rake": "ruby",
      ".c": "c",
      ".h": "c",
      ".cc": "cpp",
      ".cpp": "cpp",
      ".cxx": "cpp",
      ".hpp": "cpp",
      ".hh": "cpp",
      ".cs": "c_sharp",
      ".php": "php"
    };
    runtimeReady = false;
    parser = null;
    loaded = /* @__PURE__ */ new Map();
    failed = /* @__PURE__ */ new Set();
  }
});
function collectRefIdents(root, defNames) {
  const found = /* @__PURE__ */ new Set();
  const visit = (node) => {
    if (node.namedChildCount === 0 && /identifier|constant|(^|_)name$/.test(node.type) && /^[A-Za-z_]\w{4,}$/.test(node.text) && !defNames.has(node.text)) {
      found.add(node.text);
    }
    for (let i2 = 0; i2 < node.namedChildCount; i2++) visit(node.namedChild(i2));
  };
  visit(root);
  return [...found].sort().slice(0, MAX_REF_IDENTS);
}
function firstLine(node) {
  const nl = node.text.indexOf("\n");
  return (nl === -1 ? node.text : node.text.slice(0, nl)).trim().slice(0, 200);
}
function nameOf(node) {
  const named = node.childForFieldName("name");
  if (named?.text) return named.text;
  let decl = node.childForFieldName("declarator");
  while (decl) {
    if (decl.namedChildCount === 0 && /(^|_)identifier$/.test(decl.type)) return decl.text;
    const next = decl.childForFieldName("declarator");
    if (!next || next === decl) break;
    decl = next;
  }
  for (let i2 = 0; i2 < node.namedChildCount; i2++) {
    const c2 = node.namedChild(i2);
    if (/(^|_)(identifier|name|constant)$/.test(c2.type)) return c2.text;
  }
  return void 0;
}
function collectImports(root, spec) {
  if (!spec.imports) return [];
  const out2 = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (s) => {
    const v = s.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out2.push({ kind: "import", spec: v });
    }
  };
  const visit = (node) => {
    const how = spec.imports[node.type];
    if (how === "string") {
      const str2 = findFirst(node, (n) => /string/.test(n.type));
      if (str2) add(str2.text.replace(/^['"]|['"]$/g, ""));
    } else if (how === "path") {
      const name2 = node.childForFieldName("name") ?? node.childForFieldName("module_name");
      add((name2 ?? node).text.replace(/^(import|from)\s+/, "").split(/\s+/)[0]);
    }
    for (let i2 = 0; i2 < node.namedChildCount; i2++) visit(node.namedChild(i2));
  };
  visit(root);
  return out2;
}
function findFirst(node, pred) {
  for (let i2 = 0; i2 < node.namedChildCount; i2++) {
    const c2 = node.namedChild(i2);
    if (pred(c2)) return c2;
    const deep = findFirst(c2, pred);
    if (deep) return deep;
  }
  return void 0;
}
function readName(node) {
  if (!node) return void 0;
  if (node.namedChildCount === 0) return IDENT_LEAF.test(node.type) ? node.text : void 0;
  const seg = node.childForFieldName("name") ?? node.childForFieldName("property") ?? node.childForFieldName("attribute") ?? node.childForFieldName("field");
  if (seg) return readName(seg);
  const last = node.namedChild(node.namedChildCount - 1);
  return last && last !== node ? readName(last) : void 0;
}
function collectCalls(root, spec) {
  if (!spec.calls) return [];
  const out2 = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (name2, node) => {
    if (!name2 || name2.length < 2 || !/^[A-Za-z_]\w*$/.test(name2)) return;
    const line = node.startPosition.row + 1;
    const key = `${name2} ${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    out2.push({ name: name2, line });
  };
  const visit = (node) => {
    const how = spec.calls[node.type];
    if (how === "function") {
      add(readName(node.childForFieldName("function") ?? node.childForFieldName("callee") ?? node.childForFieldName("method") ?? node.childForFieldName("name")), node);
    } else if (how === "member") {
      add(readName(node.childForFieldName("name")), node);
    } else if (how === "constructor") {
      let t = node.childForFieldName("constructor") ?? node.childForFieldName("type") ?? node.childForFieldName("name");
      for (let i2 = 0; !t && i2 < node.namedChildCount; i2++) {
        const c2 = node.namedChild(i2);
        if (IDENT_LEAF.test(c2.type)) t = c2;
      }
      add(readName(t), node);
    }
    for (let i2 = 0; i2 < node.namedChildCount; i2++) visit(node.namedChild(i2));
  };
  visit(root);
  out2.sort((a, b) => byStr(a.name, b.name) || a.line - b.line);
  return out2.slice(0, MAX_CALLS);
}
function collectImportedNames(root, spec) {
  if (!spec.imports?.import_statement) return [];
  const found = /* @__PURE__ */ new Set();
  const visit = (node) => {
    if (node.type === "import_statement") {
      for (let i2 = 0; i2 < node.namedChildCount; i2++) {
        const clause = node.namedChild(i2);
        if (clause.type !== "import_clause") continue;
        for (let j = 0; j < clause.namedChildCount; j++) {
          const named = clause.namedChild(j);
          if (named.type !== "named_imports") continue;
          for (let k = 0; k < named.namedChildCount; k++) {
            const specifier = named.namedChild(k);
            if (specifier.type !== "import_specifier") continue;
            const nm = specifier.childForFieldName("name") ?? specifier.namedChild(0);
            if (nm?.text) found.add(nm.text);
          }
        }
      }
    }
    for (let i2 = 0; i2 < node.namedChildCount; i2++) visit(node.namedChild(i2));
  };
  visit(root);
  return [...found].sort(byStr).slice(0, MAX_IMPORTED_NAMES);
}
function extractAst(rel, ext, content) {
  const key = grammarKeyForExt(ext);
  if (!key || !grammarReady(key)) return void 0;
  const spec = SPECS[key];
  if (!spec) return void 0;
  const parser2 = parserFor(key);
  if (!parser2) return void 0;
  let tree = null;
  try {
    tree = parser2.parse(content);
    if (!tree) return void 0;
    const symbols = [];
    const root = tree.rootNode;
    const exportedNames = /* @__PURE__ */ new Set();
    const walk22 = (node, parent, exported) => {
      const nowExported = exported || node.type === "export_statement";
      if (node.type === "export_statement") {
        for (let i2 = 0; i2 < node.namedChildCount; i2++) {
          const c2 = node.namedChild(i2);
          if (c2.type === "identifier") exportedNames.add(c2.text);
          else if (c2.type === "export_clause") {
            for (let j = 0; j < c2.namedChildCount; j++) {
              const spec2 = c2.namedChild(j);
              const nm = spec2.childForFieldName("name") ?? spec2.namedChild(0);
              if (nm?.text) exportedNames.add(nm.text);
            }
          }
        }
      }
      if (spec.assignments && node.type === "expression_statement") {
        const expr = node.namedChild(0);
        if (expr?.type === "assignment_expression") {
          const left = expr.childForFieldName("left");
          const right = expr.childForFieldName("right");
          const funcy = right && ["function_expression", "function", "generator_function", "arrow_function", "class"].includes(right.type);
          if (left && right && funcy) {
            let name2;
            let exportedAssign = false;
            if (left.type === "member_expression") {
              const prop = left.childForFieldName("property");
              if (prop?.type === "property_identifier") {
                name2 = prop.text;
                const obj = left.text.slice(0, left.text.length - prop.text.length - 1);
                exportedAssign = obj === "exports" || obj === "module.exports";
              }
            } else if (left.type === "identifier") {
              name2 = left.text;
            }
            if (name2) {
              symbols.push({
                name: name2,
                kind: right.type === "class" ? "class" : "function",
                file: rel,
                line: expr.startPosition.row + 1,
                endLine: expr.endPosition.row + 1,
                ...parent ? { parent } : {},
                signature: firstLine(expr),
                exported: nowExported || exportedAssign,
                lang: spec.lang
              });
              return;
            }
          }
        }
      }
      const kind = spec.defs[node.type];
      if (kind) {
        const name2 = nameOf(node);
        if (name2) {
          const line = firstLine(node);
          symbols.push({
            name: name2,
            kind,
            file: rel,
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            ...parent ? { parent } : {},
            signature: line,
            exported: nowExported || spec.exported(line, name2),
            lang: spec.lang
          });
          for (let i2 = 0; i2 < node.namedChildCount; i2++) {
            walkBody(node.namedChild(i2), name2, nowExported);
          }
          return;
        }
      }
      if (spec.containers.has(node.type)) {
        for (let i2 = 0; i2 < node.namedChildCount; i2++) walk22(node.namedChild(i2), parent, nowExported);
      }
    };
    const walkBody = (node, parent, exported) => {
      if (spec.containers.has(node.type)) {
        for (let i2 = 0; i2 < node.namedChildCount; i2++) walk22(node.namedChild(i2), parent, exported);
      }
    };
    walk22(root, void 0, false);
    if (exportedNames.size) {
      for (const s of symbols) if (!s.exported && exportedNames.has(s.name)) s.exported = true;
    }
    const refs = collectImports(root, spec);
    const idents = collectRefIdents(root, new Set(symbols.map((s) => s.name)));
    const calls = collectCalls(root, spec);
    const importedNames = collectImportedNames(root, spec);
    let pkg;
    if (spec.lang === "java") {
      const p = findFirst(root, (n) => n.type === "package_declaration");
      if (p) pkg = p.text.replace(/^package\s+/, "").replace(/;.*$/, "").trim();
    }
    return { symbols, refs, pkg, idents, calls, importedNames };
  } catch {
    return void 0;
  } finally {
    tree?.delete();
  }
}
var MAX_REF_IDENTS;
var MAX_CALLS;
var MAX_IMPORTED_NAMES;
var byPublicKeyword;
var byPub;
var byCapital;
var byPyConvention;
var always;
var neverExport;
var TS_SPEC;
var SPECS;
var IDENT_LEAF;
var init_extract = __esm({
  "src/ast/extract.ts"() {
    "use strict";
    init_sort();
    init_loader();
    MAX_REF_IDENTS = 256;
    MAX_CALLS = 512;
    MAX_IMPORTED_NAMES = 256;
    byPublicKeyword = (line) => /\b(public|internal)\b/.test(line);
    byPub = (line) => /\bpub\b/.test(line);
    byCapital = (_l, name2) => /^[A-Z]/.test(name2);
    byPyConvention = (_l, name2) => !name2.startsWith("_") || /^__\w+__$/.test(name2);
    always = () => true;
    neverExport = () => false;
    TS_SPEC = {
      lang: "typescript",
      defs: {
        function_declaration: "function",
        generator_function_declaration: "function",
        class_declaration: "class",
        abstract_class_declaration: "class",
        interface_declaration: "interface",
        type_alias_declaration: "type",
        enum_declaration: "enum",
        method_definition: "method",
        variable_declarator: "const"
      },
      containers: /* @__PURE__ */ new Set(["class_body", "export_statement", "program", "lexical_declaration", "variable_declaration"]),
      exported: neverExport,
      // export is tracked structurally via export_statement; see walk
      imports: { import_statement: "string" },
      calls: { call_expression: "function", new_expression: "constructor" },
      assignments: true
    };
    SPECS = {
      typescript: TS_SPEC,
      tsx: { ...TS_SPEC, lang: "typescript" },
      javascript: {
        ...TS_SPEC,
        lang: "javascript",
        defs: {
          function_declaration: "function",
          generator_function_declaration: "function",
          class_declaration: "class",
          method_definition: "method",
          variable_declarator: "const"
        }
      },
      python: {
        lang: "python",
        defs: { function_definition: "function", class_definition: "class" },
        containers: /* @__PURE__ */ new Set(["block", "decorated_definition", "module"]),
        exported: byPyConvention,
        imports: { import_statement: "path", import_from_statement: "path" },
        calls: { call: "function" }
      },
      go: {
        lang: "go",
        defs: {
          function_declaration: "function",
          method_declaration: "method",
          type_spec: "type",
          const_spec: "const",
          var_spec: "var"
        },
        containers: /* @__PURE__ */ new Set(["type_declaration", "const_declaration", "var_declaration", "source_file"]),
        exported: byCapital,
        imports: { import_declaration: "string" },
        calls: { call_expression: "function" }
      },
      ruby: {
        lang: "ruby",
        defs: { method: "def", singleton_method: "def", class: "class", module: "module" },
        containers: /* @__PURE__ */ new Set(["class", "module", "body_statement", "program"]),
        exported: always,
        // Ruby models every invocation — dotted, parenthesized, or bare command form
        // (`puts "x"`) — as a `call` node whose callee is the `method` field.
        calls: { call: "function" }
      },
      java: {
        lang: "java",
        defs: {
          class_declaration: "class",
          interface_declaration: "interface",
          enum_declaration: "enum",
          record_declaration: "record",
          method_declaration: "method",
          constructor_declaration: "constructor"
        },
        containers: /* @__PURE__ */ new Set(["class_body", "interface_body", "enum_body", "program"]),
        exported: byPublicKeyword,
        imports: { import_declaration: "path" },
        calls: { method_invocation: "function", object_creation_expression: "constructor" }
      },
      rust: {
        lang: "rust",
        defs: {
          function_item: "function",
          struct_item: "struct",
          enum_item: "enum",
          trait_item: "trait",
          type_item: "type",
          mod_item: "mod",
          const_item: "const",
          static_item: "static",
          union_item: "union",
          macro_definition: "macro"
        },
        containers: /* @__PURE__ */ new Set(["impl_item", "declaration_list", "source_file"]),
        exported: byPub,
        calls: { call_expression: "function" }
      },
      c_sharp: {
        lang: "csharp",
        defs: {
          class_declaration: "class",
          interface_declaration: "interface",
          struct_declaration: "struct",
          enum_declaration: "enum",
          record_declaration: "record",
          method_declaration: "method",
          constructor_declaration: "constructor",
          property_declaration: "property"
        },
        containers: /* @__PURE__ */ new Set(["namespace_declaration", "declaration_list", "compilation_unit", "file_scoped_namespace_declaration"]),
        exported: byPublicKeyword,
        calls: { invocation_expression: "function", object_creation_expression: "constructor" }
      },
      php: {
        lang: "php",
        defs: {
          function_definition: "function",
          class_declaration: "class",
          interface_declaration: "interface",
          trait_declaration: "trait",
          enum_declaration: "enum",
          method_declaration: "method"
        },
        containers: /* @__PURE__ */ new Set(["declaration_list", "program"]),
        exported: always,
        calls: { function_call_expression: "function", member_call_expression: "member", object_creation_expression: "constructor" }
      },
      c: {
        lang: "c",
        defs: {
          function_definition: "function",
          struct_specifier: "struct",
          enum_specifier: "enum",
          union_specifier: "union",
          type_definition: "type"
        },
        // C has no visibility keyword — headers are the interface, so everything
        // counts as exported (same stance as the regex extractor).
        containers: /* @__PURE__ */ new Set(["translation_unit", "declaration_list", "linkage_specification", "preproc_ifdef", "preproc_if"]),
        exported: always,
        calls: { call_expression: "function" }
      },
      cpp: {
        lang: "cpp",
        defs: {
          function_definition: "function",
          class_specifier: "class",
          struct_specifier: "struct",
          enum_specifier: "enum",
          union_specifier: "union",
          type_definition: "type",
          namespace_definition: "namespace"
        },
        containers: /* @__PURE__ */ new Set([
          "translation_unit",
          "declaration_list",
          "field_declaration_list",
          "template_declaration",
          "linkage_specification",
          "preproc_ifdef",
          "preproc_if"
        ]),
        exported: always,
        calls: { call_expression: "function", new_expression: "constructor" }
      }
    };
    IDENT_LEAF = /(^|_)(identifier|name|constant)$/;
  }
});
function isDirective(line) {
  return DIRECTIVE_RE.test(line.trim());
}
function isBanner(line) {
  return BANNER_RE.test(line.trim());
}
function topDocComment(content) {
  const lines = content.split(/\r?\n/);
  const collected = [];
  let inBlock = null;
  for (let i2 = 0; i2 < Math.min(lines.length, 40); i2++) {
    const raw = lines[i2];
    const line = raw.trim();
    if (inBlock === "c") {
      collected.push(line.replace(/\*+\/\s*$/, "").replace(/^\*+/, "").trim());
      if (line.includes("*/")) inBlock = null;
      continue;
    }
    if (inBlock === "py") {
      if (line.includes('"""') || line.includes("'''")) {
        collected.push(line.replace(/['"]{3}.*$/, "").trim());
        inBlock = null;
      } else collected.push(line);
      continue;
    }
    if (line === "" && collected.length === 0) continue;
    if (line.startsWith("#!")) continue;
    if (line.startsWith("//")) {
      collected.push(line.replace(/^\/+/, "").trim());
      continue;
    }
    if (line.startsWith("#")) {
      collected.push(line.replace(/^#+/, "").trim());
      continue;
    }
    if (line.startsWith("/*")) {
      collected.push(line.replace(/^\/\*+!?/, "").replace(/\*+\/\s*$/, "").trim());
      if (!line.includes("*/")) inBlock = "c";
      continue;
    }
    if (line.startsWith('"""') || line.startsWith("'''")) {
      const rest = line.slice(3);
      if (rest.includes('"""') || rest.includes("'''")) collected.push(rest.replace(/['"]{3}.*$/, "").trim());
      else {
        collected.push(rest.trim());
        inBlock = "py";
      }
      continue;
    }
    break;
  }
  const text = collected.filter((l) => l && !isDirective(l) && !isBanner(l)).join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 8) return void 0;
  const sentence = /^(.*?[.!?])(\s|$)/.exec(text);
  return (sentence ? sentence[1] : text).slice(0, 200);
}
function expandUseGroups(path, out2 = []) {
  if (out2.length >= MAX_USE_EXPANSION) return out2;
  const brace = path.indexOf("{");
  if (brace === -1) {
    const cleaned = path.replace(/\s+as\s+\w+\s*$/, "").replace(/::\s*\*\s*$/, "").replace(/^::/, "").trim();
    if (cleaned) out2.push(cleaned);
    return out2;
  }
  const prefix = path.slice(0, brace);
  let depth = 0;
  let end = -1;
  for (let i2 = brace; i2 < path.length; i2++) {
    if (path[i2] === "{") depth++;
    else if (path[i2] === "}" && --depth === 0) {
      end = i2;
      break;
    }
  }
  if (end === -1) return out2;
  const parts2 = [];
  let cur = "";
  depth = 0;
  for (const ch of path.slice(brace + 1, end)) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (ch === "," && depth === 0) {
      parts2.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts2.push(cur);
  for (const part of parts2) {
    const t = part.trim();
    if (!t) continue;
    if (t === "self") expandUseGroups(prefix.replace(/::\s*$/, ""), out2);
    else expandUseGroups(prefix + t, out2);
  }
  return out2;
}
function extractImports(ext, content) {
  const specs = /* @__PURE__ */ new Set();
  const lines = content.split(/\r?\n/);
  if (JS_TS.has(ext)) {
    let m;
    const from = /(?:^|[^\w$.])(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g;
    while (m = from.exec(content)) specs.add(m[1]);
    const bare = /(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g;
    while (m = bare.exec(content)) specs.add(m[1]);
    const req = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
    while (m = req.exec(content)) specs.add(m[1]);
    const dyn = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
    while (m = dyn.exec(content)) specs.add(m[1]);
  } else if (PY.has(ext)) {
    for (const line of lines) {
      const from = /^\s*from\s+(\.*[\w.]*)\s+import\b/.exec(line);
      if (from) {
        specs.add(from[1]);
        continue;
      }
      const imp = /^\s*import\s+(.+)$/.exec(line);
      if (imp) {
        for (const part of imp[1].split(",")) {
          const name2 = part.trim().split(/\s+as\s+/)[0].trim();
          if (name2 && /^[\w.]+$/.test(name2)) specs.add(name2);
        }
      }
    }
  } else if (ext === ".go") {
    let inBlock = false;
    for (const line of lines) {
      const t = line.trim();
      if (inBlock) {
        if (t === ")") {
          inBlock = false;
          continue;
        }
        const b = /"([^"]+)"/.exec(t);
        if (b) specs.add(b[1]);
        continue;
      }
      if (/^import\s*\($/.test(t)) {
        inBlock = true;
        continue;
      }
      const single = /^import\s+(?:[\w.]+\s+)?"([^"]+)"/.exec(t);
      if (single) specs.add(single[1]);
    }
  } else if (ext === ".rs") {
    let m;
    const modRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm;
    while (m = modRe.exec(content)) specs.add(`mod ${m[1]}`);
    const useRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);/gm;
    while (m = useRe.exec(content)) {
      for (const p of expandUseGroups(m[1].trim())) specs.add(p);
    }
  } else if (ext === ".java") {
    let m;
    const imp = /^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/gm;
    while (m = imp.exec(content)) specs.add(m[1]);
  } else if (ext === ".rb" || ext === ".rake") {
    let m;
    const rel = /^\s*require_relative\s+['"]([^'"]+)['"]/gm;
    while (m = rel.exec(content)) specs.add(/^\.\.?\//.test(m[1]) ? m[1] : "./" + m[1]);
    const req = /^\s*require\s+['"]([^'"]+)['"]/gm;
    while (m = req.exec(content)) specs.add(m[1]);
  } else if (C_CPP.has(ext)) {
    let m;
    const inc = /^\s*#\s*include\s*"([^"]+)"/gm;
    while (m = inc.exec(content)) specs.add(m[1]);
  } else if (ext === ".php") {
    let m;
    const use = /^\s*use\s+(?:function\s+|const\s+)?\\?([A-Za-z_][\w\\]*)\s*(?:as\s+\w+)?\s*;/gm;
    while (m = use.exec(content)) specs.add(m[1]);
    const inc = /\b(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g;
    while (m = inc.exec(content)) specs.add(/^\.\.?\//.test(m[1]) ? m[1] : "./" + m[1]);
  } else if (ext === ".cs") {
    let m;
    const using = /^\s*(?:global\s+)?using\s+(?:static\s+)?([A-Za-z_][\w.]*)\s*;/gm;
    while (m = using.exec(content)) specs.add(m[1]);
  }
  return [...specs].map((spec) => ({ kind: "import", spec }));
}
function extractReexports(rel, content) {
  if (!JS_TS.has(rel.slice(rel.lastIndexOf(".")))) return [];
  const lang = /\.(ts|tsx|mts|cts)$/.test(rel) ? "typescript" : "javascript";
  const out2 = [];
  const seen = /* @__PURE__ */ new Set();
  const lineAt = (idx) => content.slice(0, idx).split(/\r?\n/).length;
  const named = /export\s*\{([\s\S]*?)\}\s*(?:from\s*['"]([^'"]+)['"])?\s*;?/g;
  let m;
  while ((m = named.exec(content)) && out2.length < 60) {
    const from = m[2];
    for (const part of m[1].split(",")) {
      const p = part.trim().replace(/^type\s+/, "");
      const as = /^(\S+)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(p);
      const name2 = as ? as[2] : p;
      if (!/^[A-Za-z_$][\w$]*$/.test(name2) || name2 === "default" || seen.has(name2)) continue;
      seen.add(name2);
      out2.push({
        name: name2,
        kind: "reexport",
        file: rel,
        line: lineAt(m.index),
        signature: from ? `export { ${name2} } from "${from}"` : `export { ${name2} }`,
        exported: true,
        lang
      });
    }
  }
  const star = /export\s*\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s+)?from\s*['"]([^'"]+)['"]/g;
  while ((m = star.exec(content)) && out2.length < 60) {
    const ns = m[1];
    const from = m[2];
    const key = "*" + (ns ?? from);
    if (seen.has(key)) continue;
    seen.add(key);
    out2.push({
      name: ns ?? `* (${from})`,
      kind: ns ? "reexport" : "reexport-all",
      file: rel,
      line: lineAt(m.index),
      signature: `export * ${ns ? `as ${ns} ` : ""}from "${from}"`,
      exported: true,
      lang
    });
  }
  return out2;
}
function collectCallsRegex(content) {
  const out2 = /* @__PURE__ */ new Map();
  const lines = content.split("\n");
  const CALL_RE = /(?:\bnew\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
  for (let i2 = 0; i2 < lines.length && out2.size < 512; i2++) {
    const line = lines[i2];
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) continue;
    CALL_RE.lastIndex = 0;
    let m;
    while ((m = CALL_RE.exec(line)) !== null && out2.size < 512) {
      const name2 = m[1];
      if (name2.length < 2 || CALL_KEYWORDS.has(name2)) continue;
      if (DEF_INTRODUCERS.test(line.slice(0, m.index))) continue;
      const key = `${name2} ${i2 + 1}`;
      if (!out2.has(key)) out2.set(key, { name: name2, line: i2 + 1 });
    }
  }
  return [...out2.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.line - b.line);
}
function extractCode(rel, ext, content) {
  const ast = extractAst(rel, ext, content);
  const symbols = (ast ? ast.symbols : extractSymbols(rel, ext, content)).slice(0, 400);
  const known = new Set(symbols.map((s) => s.name));
  const reexports = extractReexports(rel, content).filter((s) => !known.has(s.name));
  return {
    symbols: [...symbols, ...reexports],
    summary: topDocComment(content),
    refs: extractImports(ext, content),
    // pkg anchors namespace→source-root resolution: Java's `package`, C#'s
    // `namespace` (block or file-scoped). Both feed the same resolver pattern.
    pkg: ext === ".java" ? /^\s*package\s+([\w.]+)\s*;/m.exec(content)?.[1] : ext === ".cs" ? /^\s*(?:file-scoped\s+)?namespace\s+([\w.]+)/m.exec(content)?.[1] : void 0,
    idents: ast?.idents,
    // AST call sites when a grammar parsed the file; the conservative regex
    // collector otherwise, so caller indexes exist without the wasm sidecar.
    calls: ast ? ast.calls : collectCallsRegex(content),
    importedNames: ast?.importedNames
  };
}
var JS_TS;
var PY;
var C_CPP;
var DIRECTIVE_RE;
var BANNER_RE;
var MAX_USE_EXPANSION;
var CALL_KEYWORDS;
var DEF_INTRODUCERS;
var init_code = __esm({
  "src/extract/code.ts"() {
    "use strict";
    init_registry();
    init_extract();
    JS_TS = /* @__PURE__ */ new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
    PY = /* @__PURE__ */ new Set([".py", ".pyi"]);
    C_CPP = /* @__PURE__ */ new Set([".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"]);
    DIRECTIVE_RE = /^(eslint\b|eslint-|prettier\b|prettier-|tslint\b|jshint\b|jslint\b|globals?\b|istanbul\b|c8\s|v8\s|@ts-|ts-|@flow\b|@jsx\b|@jsxRuntime\b|@jest-environment\b|@vitest-environment\b|@license\b|@preserve\b|@copyright\b|copyright\b|spdx-|<reference\b|use strict|biome-|deno-lint|noqa\b|type:\s*ignore|pylint:|flake8:|mypy:|coding[:=])/i;
    BANNER_RE = /^((?:mit|isc|bsd|apache|gnu|gpl|mpl|lgpl|agpl)\s+licen[sc]ed?\b|licen[sc]ed\b|(?:released|distributed)\s+under\b|all rights reserved\b|https?:\/\/|www\.)/i;
    MAX_USE_EXPANSION = 16;
    CALL_KEYWORDS = /* @__PURE__ */ new Set([
      "if",
      "else",
      "elif",
      "for",
      "while",
      "do",
      "switch",
      "case",
      "match",
      "when",
      "unless",
      "until",
      "catch",
      "except",
      "return",
      "throw",
      "raise",
      "yield",
      "await",
      "typeof",
      "instanceof",
      "sizeof",
      "delete",
      "void",
      "in",
      "of",
      "not",
      "and",
      "or",
      "assert",
      "defer",
      "select",
      "with",
      "loop"
    ]);
    DEF_INTRODUCERS = /(?:\bfunction|\bdef|\bfunc|\bfun|\bfn|\bclass|\bsub|\bmacro|\bproc)\s*[*]?\s*$/;
  }
});
function countLines(s) {
  if (!s) return 0;
  let n = 1;
  for (let i2 = 0; i2 < s.length; i2++) if (s.charCodeAt(i2) === 10) n++;
  return n;
}
function scanRepo(root, opts = {}) {
  const scoped = opts.scope ? [...opts.include ?? [], `${opts.scope.replace(/\/+$/, "")}/**`] : opts.include;
  const include = compileGlobs(scoped);
  const exclude = compileGlobs(opts.exclude);
  const { files: walked, capped } = walk(root, {
    maxFileBytes: opts.maxBytes,
    maxFiles: opts.maxFiles,
    gitignore: opts.gitignore
  });
  const outPrefix = opts.out ? opts.out.replace(/\/+$/, "") + "/" : null;
  const files = [];
  const languages = {};
  const docText = /* @__PURE__ */ new Map();
  const mtimes = /* @__PURE__ */ new Map();
  for (const f of walked) {
    if (outPrefix && (f.abs === opts.out || f.abs.startsWith(outPrefix))) continue;
    if (include && !include(f.rel)) continue;
    if (exclude && exclude(f.rel)) continue;
    const kind = classify(f.rel, f.ext);
    const lang = extToLang(f.ext);
    languages[lang] = (languages[lang] ?? 0) + 1;
    mtimes.set(f.rel, f.mtimeMs);
    const cached = opts.cache?.get(f.rel);
    if (kind !== "doc" && !opts.fullHash && cached && cached.size !== void 0 && cached.mtimeMs !== void 0 && cached.size === f.size && cached.mtimeMs === f.mtimeMs) {
      files.push(cached.record);
      continue;
    }
    const content = readText(f.abs);
    const hash = sha1(content);
    if (cached && cached.hash === hash) {
      files.push(cached.record);
      if (kind === "doc" && content) docText.set(f.rel, content);
      continue;
    }
    const record = {
      rel: f.rel,
      ext: f.ext,
      size: f.size,
      lines: countLines(content),
      hash,
      kind,
      lang,
      headings: [],
      symbols: [],
      refs: []
    };
    if (content) {
      if (kind === "doc" && MARKDOWN_EXT.has(f.ext)) {
        const md = extractMarkdown(content);
        record.title = md.title ?? basename2(f.rel);
        record.summary = md.summary;
        record.headings = md.headings;
        record.refs = md.refs;
      } else if (kind === "doc") {
        record.title = basename2(f.rel);
      } else if (kind === "code") {
        const code = extractCode(f.rel, f.ext, content);
        record.title = basename2(f.rel);
        record.summary = code.summary;
        record.symbols = code.symbols;
        record.refs = code.refs;
        record.pkg = code.pkg;
        record.idents = code.idents;
        record.calls = code.calls;
        record.importedNames = code.importedNames;
      } else {
        record.title = basename2(f.rel);
      }
    } else {
      record.title = basename2(f.rel);
    }
    if (kind === "doc" && content) docText.set(f.rel, content);
    files.push(record);
  }
  files.sort(byKey((f) => f.rel));
  return { root, commit: headCommit2(root), files, languages, docText, mtimes, capped };
}
var init_scan = __esm({
  "src/scan.ts"() {
    "use strict";
    init_walk();
    init_git();
    init_hash();
    init_classify();
    init_registry();
    init_glob();
    init_sort();
    init_markdown();
    init_code();
  }
});
function distToSrcCandidates(target) {
  const segs = norm(target).split("/").filter((s) => s !== ".");
  const out2 = [];
  let i2 = 0;
  while (i2 < segs.length - 1 && BUILD_DIRS.has(segs[i2])) {
    i2++;
    const rest = segs.slice(i2).join("/");
    out2.push("src/" + rest, rest);
  }
  return out2;
}
function norm(p) {
  return posix.normalize(p).replace(/\/$/, "");
}
function firstThat(fileSet, candidates) {
  for (const c2 of candidates) {
    const n = norm(c2);
    if (fileSet.has(n)) return n;
  }
  return void 0;
}
function byLen(a, b) {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}
function tolerantJsonParse(text) {
  let stripped = "";
  let inStr = false;
  for (let i2 = 0; i2 < text.length; i2++) {
    const c2 = text[i2];
    if (inStr) {
      stripped += c2;
      if (c2 === "\\") stripped += text[++i2] ?? "";
      else if (c2 === '"') inStr = false;
      continue;
    }
    if (c2 === '"') {
      inStr = true;
      stripped += c2;
    } else if (c2 === "/" && text[i2 + 1] === "/") {
      while (i2 < text.length && text[i2] !== "\n") i2++;
      stripped += "\n";
    } else if (c2 === "/" && text[i2 + 1] === "*") {
      i2 += 2;
      while (i2 < text.length && !(text[i2] === "*" && text[i2 + 1] === "/")) i2++;
      i2++;
    } else {
      stripped += c2;
    }
  }
  let out2 = "";
  inStr = false;
  for (let i2 = 0; i2 < stripped.length; i2++) {
    const c2 = stripped[i2];
    if (inStr) {
      out2 += c2;
      if (c2 === "\\") out2 += stripped[++i2] ?? "";
      else if (c2 === '"') inStr = false;
      continue;
    }
    if (c2 === '"') {
      inStr = true;
      out2 += c2;
      continue;
    }
    if (c2 === ",") {
      let j = i2 + 1;
      while (j < stripped.length && (stripped[j] === " " || stripped[j] === "	" || stripped[j] === "\n" || stripped[j] === "\r")) j++;
      if (stripped[j] === "}" || stripped[j] === "]") continue;
    }
    out2 += c2;
  }
  try {
    return JSON.parse(out2);
  } catch {
    return void 0;
  }
}
function resolveExtends(fileSet, fromDir, ext) {
  if (!/^\.\.?\//.test(ext)) return void 0;
  const base = norm(posix.join(fromDir, ext));
  const cands = ext.endsWith(".json") ? [base] : [base + ".json", posix.join(base, "tsconfig.json")];
  for (const c2 of cands) if (fileSet.has(c2)) return c2;
  return void 0;
}
function readTsConfig(root, fileSet, rel, warnings, seen) {
  if (seen.has(rel)) return void 0;
  seen.add(rel);
  const cfg = tolerantJsonParse(readText(join32(root, rel)));
  if (cfg === void 0) {
    warnings.push(`unparseable ${rel} \u2014 its path aliases were ignored`);
    return void 0;
  }
  const dir = rel.includes("/") ? posix.dirname(rel) : "";
  const eff = { baseUrlDir: "", pathsDir: "" };
  const exts = cfg.extends === void 0 ? [] : Array.isArray(cfg.extends) ? cfg.extends : [cfg.extends];
  for (const ext of exts) {
    if (typeof ext !== "string") continue;
    const baseRel = resolveExtends(fileSet, dir, ext);
    if (!baseRel) {
      if (/^\.\.?\//.test(ext)) warnings.push(`${rel} extends "${ext}" which is missing \u2014 its path aliases were ignored`);
      continue;
    }
    const inherited = readTsConfig(root, fileSet, baseRel, warnings, seen);
    if (inherited?.baseUrl !== void 0) {
      eff.baseUrl = inherited.baseUrl;
      eff.baseUrlDir = inherited.baseUrlDir;
    }
    if (inherited?.paths) {
      eff.paths = inherited.paths;
      eff.pathsDir = inherited.pathsDir;
    }
  }
  const co = cfg.compilerOptions;
  if (co?.baseUrl !== void 0) {
    eff.baseUrl = co.baseUrl;
    eff.baseUrlDir = dir;
  }
  if (co?.paths) {
    eff.paths = co.paths;
    eff.pathsDir = dir;
  }
  return eff;
}
function conditionRank(key) {
  const i2 = CONDITION_PRIORITY.indexOf(key);
  if (i2 !== -1) return i2;
  return key === "types" ? CONDITION_PRIORITY.length + 1 : CONDITION_PRIORITY.length;
}
function flattenExportTargets(value, out2) {
  if (out2.length >= MAX_EXPORT_TARGETS) return;
  if (typeof value === "string") {
    if (!out2.includes(value)) out2.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) flattenExportTargets(v, out2);
  } else if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => conditionRank(a) - conditionRank(b) || (a < b ? -1 : a > b ? 1 : 0));
    for (const k of keys) flattenExportTargets(value[k], out2);
  }
}
function parseExportEntries(exportsField) {
  if (exportsField === void 0 || exportsField === null) return [];
  const entries = [];
  const push = (key, value) => {
    const targets = [];
    flattenExportTargets(value, targets);
    if (targets.length) entries.push({ key, star: key.includes("*"), targets });
  };
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    push(".", exportsField);
  } else if (typeof exportsField === "object") {
    const keys = Object.keys(exportsField);
    if (keys.every((k) => k === "." || k.startsWith("./"))) {
      for (const k of keys) push(k, exportsField[k]);
    } else {
      push(".", exportsField);
    }
  }
  entries.sort((a, b) => Number(a.star) - Number(b.star) || b.key.length - a.key.length || (a.key < b.key ? -1 : 1));
  return entries;
}
function parseGoReplaces(text, modDir) {
  const out2 = [];
  const addLine = (line) => {
    const m = /^\s*([^\s=]+)(?:\s+v\S+)?\s*=>\s*(\S+)(?:\s+v\S+)?\s*$/.exec(line);
    if (!m) return;
    const target = m[2];
    if (!/^\.\.?\//.test(target)) return;
    const toDir = norm(posix.join(modDir, target));
    if (toDir.startsWith("..")) return;
    out2.push({ from: m[1], toDir });
  };
  for (const m of text.matchAll(/^[ \t]*replace[ \t]+([^(\r\n][^\r\n]*)$/gm)) addLine(m[1]);
  for (const b of text.matchAll(/^[ \t]*replace[ \t]*\(([\s\S]*?)\)/gm)) {
    for (const line of b[1].split(/\r?\n/)) addLine(line);
  }
  return out2;
}
function buildResolveContext(scan22) {
  const fileSet = new Set(scan22.files.map((f) => f.rel));
  const filesByDir = /* @__PURE__ */ new Map();
  const dirSet = /* @__PURE__ */ new Set();
  for (const f of scan22.files) {
    const dir = f.rel.includes("/") ? posix.dirname(f.rel) : "";
    let list = filesByDir.get(dir);
    if (!list) filesByDir.set(dir, list = []);
    list.push(f.rel);
    let d = dir;
    while (d) {
      if (dirSet.has(d)) break;
      dirSet.add(d);
      d = d.includes("/") ? posix.dirname(d) : "";
    }
  }
  const warnings = [];
  const tsConfigs = [];
  for (const rel of fileSet) {
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    const isRootBase = rel === "tsconfig.base.json";
    if (base !== "tsconfig.json" && base !== "jsconfig.json" && !isRootBase) continue;
    const dir = rel.includes("/") ? posix.dirname(rel) : "";
    const eff = readTsConfig(scan22.root, fileSet, rel, warnings, /* @__PURE__ */ new Set());
    if (!eff?.paths) continue;
    const tsPaths = [];
    for (const [alias, targets] of Object.entries(eff.paths)) {
      if (!Array.isArray(targets)) continue;
      const star = alias.endsWith("*");
      tsPaths.push({ prefix: star ? alias.slice(0, -1) : alias, star, targets });
    }
    if (!tsPaths.length) continue;
    const baseUrl = eff.baseUrl !== void 0 ? norm(posix.join(eff.baseUrlDir, eff.baseUrl)).replace(/^\.$/, "") : eff.pathsDir;
    tsConfigs.push({ dir, baseUrl, paths: tsPaths });
  }
  tsConfigs.sort((a, b) => b.dir.length - a.dir.length);
  const goModules = [];
  for (const rel of fileSet) {
    if (rel !== "go.mod" && !rel.endsWith("/go.mod")) continue;
    const text = readText(join32(scan22.root, rel));
    const m = /^\s*module\s+(\S+)/m.exec(text);
    if (!m) continue;
    const dir = rel.includes("/") ? posix.dirname(rel) : "";
    goModules.push({ module: m[1], dir, replaces: parseGoReplaces(text, dir) });
  }
  goModules.sort((a, b) => b.dir.length - a.dir.length || (a.dir < b.dir ? -1 : 1));
  const rustCrates = [];
  for (const rel of fileSet) {
    if (rel !== "Cargo.toml" && !rel.endsWith("/Cargo.toml")) continue;
    const text = readText(join32(scan22.root, rel));
    const m = /\[package\][^[]*?^\s*name\s*=\s*"([^"]+)"/ms.exec(text);
    if (!m) continue;
    const dir = rel.includes("/") ? posix.dirname(rel) : "";
    const srcDir = norm(posix.join(dir, "src")).replace(/^\.$/, "");
    const rootFile = firstThat(fileSet, [posix.join(srcDir, "lib.rs"), posix.join(srcDir, "main.rs")]);
    rustCrates.push({ name: m[1].replace(/-/g, "_"), dir, srcDir, rootFile });
  }
  rustCrates.sort((a, b) => b.dir.length - a.dir.length || (a.dir < b.dir ? -1 : 1));
  const javaRoots = /* @__PURE__ */ new Set();
  for (const f of scan22.files) {
    if (f.ext !== ".java" || !f.pkg) continue;
    const dir = f.rel.includes("/") ? posix.dirname(f.rel) : "";
    const pkgPath = f.pkg.replace(/\./g, "/");
    if (dir === pkgPath) javaRoots.add("");
    else if (dir.endsWith("/" + pkgPath)) javaRoots.add(dir.slice(0, -pkgPath.length - 1));
  }
  const pyRoots = /* @__PURE__ */ new Set([""]);
  for (const rel of fileSet) {
    const base = rel.split("/").pop();
    if (base === "__init__.py" || base === "pyproject.toml" || base === "setup.py") {
      pyRoots.add(rel.includes("/") ? posix.dirname(rel) : "");
    }
  }
  const workspacePackages = [];
  for (const rel of fileSet) {
    if (rel !== "package.json" && !rel.endsWith("/package.json")) continue;
    const pkg = tolerantJsonParse(readText(join32(scan22.root, rel)));
    if (pkg === void 0) {
      warnings.push(`unparseable ${rel} \u2014 skipped for workspace resolution`);
      continue;
    }
    if (typeof pkg.name !== "string") continue;
    const mainCandidates = [pkg.source, pkg.main, pkg.module, pkg.types].filter(
      (v) => typeof v === "string"
    );
    workspacePackages.push({
      name: pkg.name,
      dir: rel.includes("/") ? posix.dirname(rel) : "",
      exportEntries: parseExportEntries(pkg.exports),
      mainCandidates
    });
  }
  workspacePackages.sort((a, b) => b.name.length - a.name.length);
  const cIncludeRoots = /* @__PURE__ */ new Set([""]);
  for (const d of dirSet) {
    const base = d.slice(d.lastIndexOf("/") + 1);
    if (base === "include" || base === "inc" || base === "src") cIncludeRoots.add(d);
  }
  const rubyLibRoots = /* @__PURE__ */ new Set([""]);
  for (const d of dirSet) if (d.slice(d.lastIndexOf("/") + 1) === "lib") rubyLibRoots.add(d);
  const phpPsr4 = [];
  for (const rel of fileSet) {
    if (rel !== "composer.json" && !rel.endsWith("/composer.json")) continue;
    const composer = tolerantJsonParse(readText(join32(scan22.root, rel)));
    if (!composer) {
      warnings.push(`unparseable ${rel} \u2014 skipped for PHP PSR-4 resolution`);
      continue;
    }
    const baseDir = rel.includes("/") ? posix.dirname(rel) : "";
    for (const block of [composer.autoload?.["psr-4"], composer["autoload-dev"]?.["psr-4"]]) {
      if (!block) continue;
      for (const [prefix, dirs] of Object.entries(block)) {
        for (const d of Array.isArray(dirs) ? dirs : [dirs]) {
          if (typeof d !== "string") continue;
          phpPsr4.push({ prefix: prefix.replace(/\\+$/, ""), dir: norm(posix.join(baseDir, d)).replace(/^\.$/, "") });
        }
      }
    }
  }
  phpPsr4.sort((a, b) => b.prefix.length - a.prefix.length);
  const csharpNamespaces = /* @__PURE__ */ new Map();
  for (const f of scan22.files) {
    if (f.ext !== ".cs" || !f.pkg) continue;
    let arr = csharpNamespaces.get(f.pkg);
    if (!arr) csharpNamespaces.set(f.pkg, arr = []);
    arr.push(f.rel);
  }
  for (const arr of csharpNamespaces.values()) arr.sort(byStr);
  return {
    fileSet,
    dirSet,
    filesByDir,
    tsConfigs,
    goModules,
    rustCrates,
    javaRoots: [...javaRoots].sort(byLen),
    pyRoots: [...pyRoots],
    workspacePackages,
    cIncludeRoots: [...cIncludeRoots].sort(byLen),
    rubyLibRoots: [...rubyLibRoots].sort(byLen),
    phpPsr4,
    csharpNamespaces,
    warnings
  };
}
function firstExisting(ctx, candidates) {
  for (const c2 of candidates) {
    const n = norm(c2);
    if (n && !n.startsWith("..") && ctx.fileSet.has(n)) return n;
  }
  return void 0;
}
function resolveDocLink(fromRel, spec, ctx) {
  let target = spec.split("#")[0].split("?")[0];
  if (!target) return { kind: "external" };
  if (target.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return { kind: "external" };
  const base = fromRel.includes("/") ? posix.dirname(fromRel) : "";
  const p = norm(posix.join(base, target));
  if (p.startsWith("..")) return { kind: "dangling", reason: "escapes-repo-root" };
  const hit = firstExisting(ctx, [
    p,
    p + ".md",
    p + ".mdx",
    posix.join(p, "README.md"),
    posix.join(p, "readme.md"),
    posix.join(p, "index.md"),
    posix.join(p, "index.mdx")
  ]);
  if (hit) return { kind: "resolved", target: hit };
  if (ctx.dirSet.has(p)) return { kind: "external" };
  return { kind: "dangling", reason: "missing-target" };
}
function resolveJs(fromRel, spec, ctx) {
  const probe = (p) => firstExisting(ctx, [...JS_EXT_PROBES.map((e) => p + e), ...JS_INDEX.map((i2) => posix.join(p, i2))]);
  const tryResolve = (p) => {
    const hit = probe(p);
    if (hit) return hit;
    const noJs = p.replace(/\.(js|jsx|mjs|cjs)$/, "");
    return noJs !== p ? probe(noJs) : void 0;
  };
  if (spec.startsWith(".")) {
    const base = fromRel.includes("/") ? posix.dirname(fromRel) : "";
    const p = norm(posix.join(base, spec));
    if (p.startsWith("..")) return { kind: "dangling", reason: "escapes-repo-root" };
    const hit = tryResolve(p);
    return hit ? { kind: "resolved", target: hit } : { kind: "dangling", reason: "missing-module" };
  }
  let aliasFallback;
  for (const cfg of ctx.tsConfigs) {
    if (cfg.dir && fromRel !== cfg.dir && !fromRel.startsWith(cfg.dir + "/")) continue;
    let matched = false;
    for (const tp of cfg.paths) {
      if (!(tp.star ? spec.startsWith(tp.prefix) : spec === tp.prefix)) continue;
      matched = true;
      const suffix = tp.star ? spec.slice(tp.prefix.length) : "";
      let targetTreeExists = false;
      for (const t of tp.targets) {
        const resolved = tp.star ? t.replace(/\*/, suffix) : t;
        const p = norm(posix.join(cfg.baseUrl, resolved));
        const hit = tryResolve(p);
        if (hit) return { kind: "resolved", target: hit };
        const tdir = p.includes("/") ? posix.dirname(p) : "";
        if (ctx.dirSet.has(tdir) || ctx.fileSet.has(p)) targetTreeExists = true;
      }
      aliasFallback = targetTreeExists ? { kind: "dangling", reason: "alias-unresolved" } : { kind: "external" };
      break;
    }
    if (matched) break;
  }
  for (const pkg of ctx.workspacePackages) {
    if (spec !== pkg.name && !spec.startsWith(pkg.name + "/")) continue;
    const sub = spec.slice(pkg.name.length).replace(/^\//, "");
    const probeEntry = (entry) => {
      for (const cand of [entry, ...distToSrcCandidates(entry)]) {
        const hit = tryResolve(norm(posix.join(pkg.dir, cand)));
        if (hit) return hit;
      }
      return void 0;
    };
    const subKey = sub ? "./" + sub : ".";
    for (const entry of pkg.exportEntries) {
      let fill;
      if (entry.star) {
        const starAt = entry.key.indexOf("*");
        const pre = entry.key.slice(0, starAt);
        const post = entry.key.slice(starAt + 1);
        if (!subKey.startsWith(pre) || !subKey.endsWith(post) || subKey.length < pre.length + post.length) continue;
        fill = subKey.slice(pre.length, subKey.length - post.length);
      } else if (entry.key !== subKey) continue;
      for (const t of entry.targets) {
        const hit = probeEntry(fill === void 0 ? t : t.replace(/\*/g, fill));
        if (hit) return { kind: "resolved", target: hit };
      }
      break;
    }
    if (!sub) {
      for (const m of pkg.mainCandidates) {
        const hit = probeEntry(m);
        if (hit) return { kind: "resolved", target: hit };
      }
    }
    const bases = sub ? [posix.join(pkg.dir, "src", sub), posix.join(pkg.dir, sub)] : [posix.join(pkg.dir, "src", "index"), posix.join(pkg.dir, "index"), posix.join(pkg.dir, "src")];
    for (const b of bases) {
      const hit = tryResolve(norm(b));
      if (hit) return { kind: "resolved", target: hit };
    }
    return { kind: "external" };
  }
  return aliasFallback ?? { kind: "external" };
}
function resolvePython(fromRel, spec, ctx) {
  const probeModule = (dir, dotted) => {
    const sub = dotted ? dotted.replace(/\./g, "/") : "";
    const base = norm(posix.join(dir, sub));
    return firstExisting(ctx, [base + ".py", base + ".pyi", posix.join(base, "__init__.py")]);
  };
  if (spec.startsWith(".")) {
    const dots = /^\.+/.exec(spec)[0].length;
    const rest = spec.slice(dots);
    const base = fromRel.includes("/") ? posix.dirname(fromRel) : "";
    let dir = base;
    for (let i2 = 1; i2 < dots; i2++) dir = dir.includes("/") ? posix.dirname(dir) : "";
    const hit = rest ? probeModule(dir, rest) : firstExisting(ctx, [posix.join(norm(dir), "__init__.py")]);
    return hit ? { kind: "resolved", target: hit } : { kind: "dangling", reason: "missing-module" };
  }
  for (const root of ctx.pyRoots) {
    const hit = probeModule(root, spec);
    if (hit) return { kind: "resolved", target: hit };
  }
  return { kind: "external" };
}
function resolveGo(fromRel, spec, ctx) {
  if (!ctx.goModules.length) return { kind: "external" };
  const probePkg = (dir) => {
    const d = norm(dir).replace(/^\.$/, "");
    const inDir = (ctx.filesByDir.get(d) ?? []).filter((f) => f.endsWith(".go")).sort();
    return inDir.length ? { kind: "resolved", target: inDir[0] } : { kind: "dangling", reason: "missing-package" };
  };
  const home = ctx.goModules.find((g) => !g.dir || fromRel === g.dir || fromRel.startsWith(g.dir + "/"));
  if (home) {
    for (const r of home.replaces) {
      if (spec !== r.from && !spec.startsWith(r.from + "/")) continue;
      const sub = spec.slice(r.from.length).replace(/^\//, "");
      return probePkg(posix.join(r.toDir, sub));
    }
  }
  const ordered = home ? [home, ...ctx.goModules.filter((g) => g !== home)] : ctx.goModules;
  for (const g of ordered) {
    if (spec !== g.module && !spec.startsWith(g.module + "/")) continue;
    const sub = spec.slice(g.module.length).replace(/^\//, "");
    return probePkg(posix.join(g.dir, sub));
  }
  return { kind: "external" };
}
function resolveRust(fromRel, spec, ctx) {
  if (!ctx.rustCrates.length) return { kind: "external" };
  const probeMod = (dir, name2) => firstExisting(ctx, [posix.join(dir, name2 + ".rs"), posix.join(dir, name2, "mod.rs")]);
  const walkPath = (baseDir2, segs2) => {
    for (let n = segs2.length; n >= 1; n--) {
      const dir = norm(posix.join(baseDir2, ...segs2.slice(0, n - 1)));
      const hit2 = probeMod(dir, segs2[n - 1]);
      if (hit2) return hit2;
    }
    return void 0;
  };
  const fromDir = fromRel.includes("/") ? posix.dirname(fromRel) : "";
  const stem = fromRel.slice(fromRel.lastIndexOf("/") + 1).replace(/\.rs$/, "");
  const isRootish = stem === "mod" || stem === "lib" || stem === "main";
  const childDir = isRootish ? fromDir : posix.join(fromDir, stem);
  if (spec.startsWith("mod ")) {
    const name2 = spec.slice(4);
    const hit2 = probeMod(childDir, name2) ?? (isRootish ? void 0 : probeMod(fromDir, name2));
    return hit2 ? { kind: "resolved", target: hit2 } : { kind: "dangling", reason: "missing-module" };
  }
  const segs = spec.split("::").map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return { kind: "external" };
  const head = segs[0];
  const home = ctx.rustCrates.find((c2) => !c2.dir || fromRel === c2.dir || fromRel.startsWith(c2.dir + "/"));
  let baseDir;
  let rest = [];
  if (head === "crate" && home) {
    baseDir = home.srcDir;
    rest = segs.slice(1);
  } else if (head === "self") {
    baseDir = childDir;
    rest = segs.slice(1);
  } else if (head === "super") {
    let dir = isRootish ? fromDir.includes("/") ? posix.dirname(fromDir) : "" : fromDir;
    let i2 = 1;
    while (i2 < segs.length && segs[i2] === "super") {
      dir = dir.includes("/") ? posix.dirname(dir) : "";
      i2++;
    }
    baseDir = dir;
    rest = segs.slice(i2);
  } else {
    const target = ctx.rustCrates.find((c2) => c2.name === head);
    if (target) {
      const walked = walkPath(target.srcDir, segs.slice(1));
      if (walked) return { kind: "resolved", target: walked };
      if (target.rootFile) return { kind: "resolved", target: target.rootFile };
    }
    return { kind: "external" };
  }
  if (!rest.length) return { kind: "external" };
  const hit = walkPath(baseDir, rest);
  if (hit) return { kind: "resolved", target: hit };
  if (home && baseDir === home.srcDir && home.rootFile) return { kind: "resolved", target: home.rootFile };
  const ownerDir = baseDir.includes("/") ? posix.dirname(baseDir) : "";
  const ownerName = baseDir.slice(baseDir.lastIndexOf("/") + 1);
  const owner = ownerName ? probeMod(ownerDir, ownerName) : void 0;
  if (owner && owner !== fromRel) return { kind: "resolved", target: owner };
  return { kind: "external" };
}
function resolveJava(spec, ctx) {
  if (!ctx.javaRoots.length) return { kind: "external" };
  const probe = (pkgPath) => {
    for (const root of ctx.javaRoots) {
      const p = norm(posix.join(root, pkgPath));
      if (p.endsWith("/*") || p === "*") {
        const dir = p === "*" ? "" : p.slice(0, -2);
        const inDir = (ctx.filesByDir.get(dir) ?? []).filter((f) => f.endsWith(".java")).sort();
        if (inDir.length) return inDir[0];
        continue;
      }
      if (ctx.fileSet.has(p + ".java")) return p + ".java";
    }
    return void 0;
  };
  const path = spec.replace(/\./g, "/");
  let hit = probe(path);
  if (!hit && !spec.endsWith(".*")) {
    const segs = path.split("/");
    for (let n = segs.length - 1; n >= 2 && !hit; n--) {
      hit = probe(segs.slice(0, n).join("/"));
    }
  }
  return hit ? { kind: "resolved", target: hit } : { kind: "external" };
}
function resolveC(fromRel, spec, ctx) {
  const fromDir = fromRel.includes("/") ? posix.dirname(fromRel) : "";
  const hit = firstExisting(ctx, [posix.join(fromDir, spec), ...ctx.cIncludeRoots.map((r) => posix.join(r, spec))]);
  return hit ? { kind: "resolved", target: hit } : { kind: "dangling", reason: "missing-include" };
}
function resolveRuby(fromRel, spec, ctx) {
  if (spec.startsWith(".")) {
    const fromDir = fromRel.includes("/") ? posix.dirname(fromRel) : "";
    const base = norm(posix.join(fromDir, spec));
    const hit = firstExisting(ctx, [base + ".rb", posix.join(base, "index.rb")]);
    return hit ? { kind: "resolved", target: hit } : { kind: "dangling", reason: "missing-module" };
  }
  for (const root of ctx.rubyLibRoots) {
    const hit = firstExisting(ctx, [posix.join(root, spec + ".rb")]);
    if (hit) return { kind: "resolved", target: hit };
  }
  return { kind: "external" };
}
function resolvePhp(fromRel, spec, ctx) {
  if (spec.startsWith(".")) {
    const fromDir = fromRel.includes("/") ? posix.dirname(fromRel) : "";
    const base = norm(posix.join(fromDir, spec));
    const hit = firstExisting(ctx, [base, base + ".php"]);
    return hit ? { kind: "resolved", target: hit } : { kind: "dangling", reason: "missing-module" };
  }
  const ns = spec.replace(/^\\+/, "");
  for (const { prefix, dir } of ctx.phpPsr4) {
    if (prefix && ns !== prefix && !ns.startsWith(prefix + "\\")) continue;
    const rest = prefix ? ns.slice(prefix.length).replace(/^\\+/, "") : ns;
    const hit = firstExisting(ctx, [posix.join(dir, rest.replace(/\\/g, "/")) + ".php"]);
    if (hit) return { kind: "resolved", target: hit };
  }
  return { kind: "external" };
}
function resolveCsharp(spec, ctx) {
  const exact = ctx.csharpNamespaces.get(spec);
  if (exact?.length) return { kind: "resolved", target: exact[0] };
  let best;
  for (const [ns, files] of ctx.csharpNamespaces) {
    if (ns === spec || ns.startsWith(spec + ".")) {
      const f = files[0];
      if (best === void 0 || byStr(f, best) < 0) best = f;
    }
  }
  return best ? { kind: "resolved", target: best } : { kind: "external" };
}
function resolveImport(fromRel, ext, spec, ctx) {
  const dot = spec.lastIndexOf(".");
  if (dot !== -1 && ASSET_EXT.has(spec.slice(dot).toLowerCase().replace(/[?#].*$/, ""))) {
    return { kind: "external" };
  }
  if (JS_TS2.has(ext)) return resolveJs(fromRel, spec, ctx);
  if (PY2.has(ext)) return resolvePython(fromRel, spec, ctx);
  if (ext === ".go") return resolveGo(fromRel, spec, ctx);
  if (ext === ".rs") return resolveRust(fromRel, spec, ctx);
  if (ext === ".java") return resolveJava(spec, ctx);
  if (C_CPP2.has(ext)) return resolveC(fromRel, spec, ctx);
  if (ext === ".rb" || ext === ".rake") return resolveRuby(fromRel, spec, ctx);
  if (ext === ".php") return resolvePhp(fromRel, spec, ctx);
  if (ext === ".cs") return resolveCsharp(spec, ctx);
  return { kind: "external" };
}
var ASSET_EXT;
var JS_EXT_PROBES;
var JS_INDEX;
var JS_TS2;
var PY2;
var C_CPP2;
var BUILD_DIRS;
var CONDITION_PRIORITY;
var MAX_EXPORT_TARGETS;
var init_resolve = __esm({
  "src/resolve.ts"() {
    "use strict";
    init_walk();
    init_sort();
    ASSET_EXT = /* @__PURE__ */ new Set([
      ".svg",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".bmp",
      ".ico",
      ".icns",
      ".pdf",
      ".woff",
      ".woff2",
      ".ttf",
      ".otf",
      ".eot",
      ".mp3",
      ".mp4",
      ".mov",
      ".avi",
      ".webm",
      ".wav",
      ".flac",
      ".ogg",
      ".map"
    ]);
    JS_EXT_PROBES = ["", ".ts", ".tsx", ".d.ts", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
    JS_INDEX = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs", "index.cjs"];
    JS_TS2 = /* @__PURE__ */ new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
    PY2 = /* @__PURE__ */ new Set([".py", ".pyi"]);
    C_CPP2 = /* @__PURE__ */ new Set([".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"]);
    BUILD_DIRS = /* @__PURE__ */ new Set(["dist", "build", "lib", "out", "output", "esm", "cjs", "umd"]);
    CONDITION_PRIORITY = ["source", "ts", "import", "module", "require", "node", "default"];
    MAX_EXPORT_TARGETS = 8;
  }
});
function isTestFile(rel) {
  return TEST_FILE.test(rel.split("/").pop());
}
function dirOf(rel) {
  return rel.includes("/") ? posix2.dirname(rel) : ROOT_PATH;
}
function tierForPath(path) {
  if (path === ROOT_PATH) return 0;
  if (TIER2_ANY.test(path) || TIER2_LEAF.test(path)) return 2;
  if (TIER0.test(path)) return 0;
  return null;
}
function tierOf(path, members) {
  const byPath = tierForPath(path);
  if (byPath !== null) return byPath;
  if (members.every((m) => m.kind === "doc" || m.kind === "config" || isTestFile(m.rel))) return 2;
  return 1;
}
function summaryOf(path, members) {
  const readme = members.find((m) => /^(readme|index)\.(md|mdx)$/i.test(m.rel.split("/").pop()));
  if (readme?.summary) return readme.summary;
  if (readme?.title) return readme.title;
  const withSummary = members.filter((m) => m.summary).sort((a, b) => (b.summary?.length ?? 0) - (a.summary?.length ?? 0));
  if (withSummary[0]?.summary) return withSummary[0].summary;
  const langs = [...new Set(members.map((m) => m.lang))].filter((l) => l !== "other");
  const where = path === ROOT_PATH ? "the repository root" : `\`${path}/\``;
  return `${members.length} file(s) in ${where}${langs.length ? ` (${langs.slice(0, 3).join(", ")})` : ""}.`;
}
function buildModules(scan22) {
  const byDir = /* @__PURE__ */ new Map();
  for (const f of scan22.files) {
    const dir = dirOf(f.rel);
    let list = byDir.get(dir);
    if (!list) byDir.set(dir, list = []);
    list.push(f);
  }
  const dirs = [...byDir.keys()].sort(byStr);
  const baseOf = /* @__PURE__ */ new Map();
  const baseCount = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    const b = dir === ROOT_PATH ? "root" : slugify2(dir);
    baseOf.set(dir, b);
    baseCount.set(b, (baseCount.get(b) ?? 0) + 1);
  }
  const slugForDir = (dir) => {
    const b = baseOf.get(dir);
    return b && baseCount.get(b) === 1 ? b : `${b || "module"}-${sha1(dir).slice(0, 8)}`;
  };
  const modules = [];
  const moduleOf = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    const members = byDir.get(dir).slice().sort((a, b) => byStr(a.rel, b.rel));
    const slug = slugForDir(dir);
    const info2 = {
      slug,
      path: dir,
      title: dir,
      tier: tierOf(dir, members),
      members: members.map((m) => m.rel),
      summary: summaryOf(dir, members)
    };
    modules.push(info2);
    for (const m of members) moduleOf.set(m.rel, slug);
  }
  modules.sort((a, b) => byStr(a.slug, b.slug));
  return { modules, moduleOf };
}
var ROOT_PATH;
var TIER0;
var TIER2_ANY;
var TIER2_LEAF;
var TEST_FILE;
var init_modules = __esm({
  "src/modules.ts"() {
    "use strict";
    init_util();
    init_hash();
    init_sort();
    ROOT_PATH = "(root)";
    TIER0 = /(^|\/)(types?|util|utils|lib|libs|common|core|config|configs|constants|shared|helpers|internal)$/i;
    TIER2_ANY = /(^|\/)(tests?|__tests?__|__mocks?__|__snapshots?__|spec|specs|e2e|examples?|example|benchmark|benchmarks|fixtures?|docs?|documentation|\.github)(\/|$)/i;
    TIER2_LEAF = /(^|\/)(scripts?|bin|\.storybook)$/i;
    TEST_FILE = /\.(test|spec|e2e|stories|story)\.[cm]?[jt]sx?$/i;
  }
});
function familyOf(lang) {
  if (lang === "typescript" || lang === "javascript") return "js";
  if (lang === "c" || lang === "cpp") return "c";
  return lang;
}
function sharedSegments(a, b) {
  const as = a.split("/");
  const bs = b.split("/");
  let n = 0;
  while (n < as.length && n < bs.length && as[n] === bs[n]) n++;
  return n;
}
function pickCandidate(callerRel, cands) {
  if (cands.length === 1) return cands[0];
  if (cands.length === 0) return void 0;
  let best;
  let bestScore = -1;
  let tied = false;
  for (const c2 of cands) {
    const s = sharedSegments(callerRel, c2.file);
    if (s > bestScore) {
      bestScore = s;
      best = c2;
      tied = false;
    } else if (s === bestScore) {
      tied = true;
    }
  }
  return tied ? void 0 : best;
}
function resolveCallEdges(scan22, importPairs) {
  const defs = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  for (const f of scan22.files) {
    for (const s of f.symbols) {
      if (!s.exported || REFERENCE_KINDS.has(s.kind)) continue;
      const dedup = `${s.name} ${s.file}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      let arr = defs.get(s.name);
      if (!arr) defs.set(s.name, arr = []);
      arr.push({ file: s.file, lang: s.lang });
    }
  }
  const agg = /* @__PURE__ */ new Map();
  for (const f of scan22.files) {
    if (!f.calls?.length) continue;
    const family = familyOf(f.lang);
    const ownNames = new Set(f.symbols.map((s) => s.name));
    const counts = /* @__PURE__ */ new Map();
    for (const c2 of f.calls) counts.set(c2.name, (counts.get(c2.name) ?? 0) + 1);
    for (const [name2, count] of counts) {
      if (ownNames.has(name2)) continue;
      const cands = (defs.get(name2) ?? []).filter((d) => familyOf(d.lang) === family && d.file !== f.rel);
      if (!cands.length) continue;
      const imported = cands.filter((d) => importPairs.has(`${f.rel}|${d.file}`));
      let chosen;
      let confidence;
      if (family === "js") {
        if (!imported.length) continue;
        chosen = pickCandidate(f.rel, imported);
        confidence = "extracted";
      } else if (imported.length) {
        chosen = pickCandidate(f.rel, imported);
        confidence = "extracted";
      } else {
        chosen = pickCandidate(f.rel, cands);
        confidence = "inferred";
      }
      if (!chosen) continue;
      const key = `${f.rel}|${chosen.file}`;
      const prev = agg.get(key);
      if (prev) {
        prev.weight += count;
        if (confidence === "extracted") prev.confidence = "extracted";
      } else {
        agg.set(key, { from: f.rel, to: chosen.file, weight: count, confidence });
      }
    }
  }
  return [...agg.values()].map((e) => ({ from: e.from, to: e.to, kind: "call", weight: Math.min(e.weight, 5), confidence: e.confidence })).sort((a, b) => byStr(a.from, b.from) || byStr(a.to, b.to));
}
var REFERENCE_KINDS;
var init_calls = __esm({
  "src/calls.ts"() {
    "use strict";
    init_sort();
    REFERENCE_KINDS = /* @__PURE__ */ new Set(["reexport", "reexport-all", "default"]);
  }
});
function isDistinctive(name2) {
  if (name2.length < 5) return false;
  const internalUpper = /[a-z][A-Z]/.test(name2) || /[A-Z]{2}/.test(name2);
  return internalUpper || name2.includes("_") || /\d/.test(name2);
}
function uniqueSymbolDefs(scan22) {
  const byName = /* @__PURE__ */ new Map();
  for (const f of scan22.files) {
    for (const s of f.symbols) {
      if (!s.exported || REFERENCE_KINDS2.has(s.kind) || !isDistinctive(s.name)) continue;
      let set = byName.get(s.name);
      if (!set) byName.set(s.name, set = /* @__PURE__ */ new Set());
      set.add(f.rel);
    }
  }
  const unique = /* @__PURE__ */ new Map();
  for (const [name2, files] of byName) if (files.size === 1) unique.set(name2, [...files][0]);
  return unique;
}
function collect(edges, e) {
  const k = keyOf(e.from, e.to, e.kind);
  const prev = edges.get(k);
  if (prev) {
    prev.weight += e.weight;
    return;
  }
  edges.set(k, { ...e });
}
function buildGraph(scan22, ctx, modules, moduleOf, meta) {
  const fileEdgeMap = /* @__PURE__ */ new Map();
  const importPairs = /* @__PURE__ */ new Set();
  for (const f of scan22.files) {
    for (const ref of f.refs) {
      if (ref.kind === "doc-link") {
        const r = resolveDocLink(f.rel, ref.spec, ctx);
        if (r.kind === "external") continue;
        if (r.kind === "dangling") {
          collect(fileEdgeMap, { from: f.rel, to: ref.spec, kind: "doc-link", weight: 1, dangling: true, reason: r.reason });
        } else if (r.target !== f.rel) {
          collect(fileEdgeMap, { from: f.rel, to: r.target, kind: "doc-link", weight: 1 });
        }
      } else {
        const r = resolveImport(f.rel, f.ext, ref.spec, ctx);
        if (r.kind === "external") continue;
        if (r.kind === "dangling") {
          collect(fileEdgeMap, { from: f.rel, to: ref.spec, kind: "import", weight: 1, dangling: true, reason: r.reason });
        } else if (r.target !== f.rel) {
          collect(fileEdgeMap, { from: f.rel, to: r.target, kind: "import", weight: 1 });
          importPairs.add(`${f.rel}|${r.target}`);
        }
      }
    }
  }
  const callPairs = /* @__PURE__ */ new Set();
  for (const e of resolveCallEdges(scan22, importPairs)) {
    collect(fileEdgeMap, e);
    callPairs.add(`${e.from}|${e.to}`);
  }
  const unique = uniqueSymbolDefs(scan22);
  if (unique.size) {
    for (const f of scan22.files) {
      if (f.kind !== "code" || !f.idents?.length) continue;
      const perTarget = /* @__PURE__ */ new Map();
      for (const id of f.idents) {
        const target = unique.get(id);
        if (!target || target === f.rel) continue;
        perTarget.set(target, (perTarget.get(target) ?? 0) + 1);
      }
      for (const [target, count] of perTarget) {
        const pair = `${f.rel}|${target}`;
        if (importPairs.has(pair) || callPairs.has(pair)) continue;
        collect(fileEdgeMap, { from: f.rel, to: target, kind: "use", weight: Math.min(count, 5) });
      }
    }
  }
  if (unique.size) {
    for (const f of scan22.files) {
      if (f.kind !== "doc") continue;
      const content = scan22.docText.get(f.rel) ?? readText(join4(scan22.root, f.rel));
      if (!content) continue;
      const tokens = /* @__PURE__ */ new Map();
      for (const tok of content.split(/[^A-Za-z0-9_]+/)) {
        if (unique.has(tok)) tokens.set(tok, (tokens.get(tok) ?? 0) + 1);
      }
      for (const [name2, count] of tokens) {
        const target = unique.get(name2);
        if (target === f.rel) continue;
        collect(fileEdgeMap, { from: f.rel, to: target, kind: "mention", weight: Math.min(count, 5) });
      }
    }
  }
  const fileEdges = [...fileEdgeMap.values()].sort(
    (a, b) => byStr(a.from, b.from) || byStr(a.to, b.to) || byStr(a.kind, b.kind)
  );
  const degIn = /* @__PURE__ */ new Map();
  const degOut = /* @__PURE__ */ new Map();
  const fileSet = new Set(scan22.files.map((f) => f.rel));
  for (const e of fileEdges) {
    if (e.dangling || !fileSet.has(e.to)) continue;
    degOut.set(e.from, (degOut.get(e.from) ?? 0) + 1);
    degIn.set(e.to, (degIn.get(e.to) ?? 0) + 1);
  }
  const KIND_RANK = { import: 5, call: 4, use: 3, "doc-link": 2, mention: 1, contains: 0 };
  const modEdgeMap = /* @__PURE__ */ new Map();
  for (const e of fileEdges) {
    if (e.dangling || !fileSet.has(e.to)) continue;
    const from = moduleOf.get(e.from);
    const to = moduleOf.get(e.to);
    if (!from || !to || from === to) continue;
    const k = `${from}\0${to}`;
    const prev = modEdgeMap.get(k);
    if (prev) {
      prev.weight += e.weight;
      if ((KIND_RANK[e.kind] ?? 0) > (KIND_RANK[prev.kind] ?? 0)) prev.kind = e.kind;
    } else {
      modEdgeMap.set(k, { from, to, kind: e.kind, weight: e.weight });
    }
  }
  const moduleEdges = [...modEdgeMap.values()].sort((a, b) => byStr(a.from, b.from) || byStr(a.to, b.to));
  const modDegIn = /* @__PURE__ */ new Map();
  const modDegOut = /* @__PURE__ */ new Map();
  for (const e of moduleEdges) {
    modDegOut.set(e.from, (modDegOut.get(e.from) ?? 0) + 1);
    modDegIn.set(e.to, (modDegIn.get(e.to) ?? 0) + 1);
  }
  const files = scan22.files.map((f) => ({
    id: f.rel,
    kind: "file",
    rel: f.rel,
    fileKind: f.kind,
    lang: f.lang,
    module: moduleOf.get(f.rel) ?? "root",
    title: f.title,
    summary: f.summary,
    symbols: f.symbols.length,
    lines: f.lines,
    degIn: degIn.get(f.rel) ?? 0,
    degOut: degOut.get(f.rel) ?? 0
  })).sort((a, b) => byStr(a.rel, b.rel));
  const symbolsByModule = /* @__PURE__ */ new Map();
  for (const f of scan22.files) {
    const slug = moduleOf.get(f.rel) ?? "root";
    symbolsByModule.set(slug, (symbolsByModule.get(slug) ?? 0) + f.symbols.length);
  }
  const moduleNodes = modules.map((m) => ({
    id: m.slug,
    kind: "module",
    slug: m.slug,
    path: m.path,
    title: m.title,
    summary: m.summary,
    tier: m.tier,
    members: m.members,
    symbols: symbolsByModule.get(m.slug) ?? 0,
    degIn: modDegIn.get(m.slug) ?? 0,
    degOut: modDegOut.get(m.slug) ?? 0
  })).sort((a, b) => byStr(a.slug, b.slug));
  return {
    schemaVersion: meta?.schemaVersion ?? SCHEMA_VERSION,
    version: meta?.version ?? ENGINE_VERSION,
    commit: scan22.commit,
    fileCount: scan22.files.length,
    languages: scan22.languages,
    files,
    modules: moduleNodes,
    fileEdges,
    moduleEdges
  };
}
var REFERENCE_KINDS2;
var keyOf;
var init_graph = __esm({
  "src/graph.ts"() {
    "use strict";
    init_types();
    init_resolve();
    init_calls();
    init_walk();
    init_sort();
    REFERENCE_KINDS2 = /* @__PURE__ */ new Set(["reexport", "reexport-all", "default"]);
    keyOf = (from, to, kind) => `${from}\0${to}\0${kind}`;
  }
});
function computeImportPairs(scan22) {
  const ctx = buildResolveContext(scan22);
  const pairs = /* @__PURE__ */ new Set();
  for (const f of scan22.files) {
    for (const ref of f.refs) {
      if (ref.kind !== "import") continue;
      const r = resolveImport(f.rel, f.ext, ref.spec, ctx);
      if (r.kind === "resolved" && r.target !== f.rel) pairs.add(`${f.rel}|${r.target}`);
    }
  }
  return pairs;
}
function buildCallerIndex(scan22, importPairs) {
  const pairs = importPairs ?? computeImportPairs(scan22);
  const defs = /* @__PURE__ */ new Map();
  for (const f of scan22.files) {
    const seen = /* @__PURE__ */ new Set();
    for (const s of f.symbols) {
      if (!s.exported || REFERENCE_KINDS3.has(s.kind)) continue;
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      let arr = defs.get(s.name);
      if (!arr) defs.set(s.name, arr = []);
      arr.push(s);
    }
  }
  const localDefs = /* @__PURE__ */ new Map();
  for (const f of scan22.files) {
    const byName = /* @__PURE__ */ new Map();
    for (const s of f.symbols) {
      if (!REFERENCE_KINDS3.has(s.kind) && !byName.has(s.name)) byName.set(s.name, s);
    }
    localDefs.set(f.rel, byName);
  }
  const sites = /* @__PURE__ */ new Map();
  const record = (def, caller) => {
    let entry = sites.get(def.name + "\0" + def.file);
    if (!entry) sites.set(def.name + "\0" + def.file, entry = { def, callers: [] });
    entry.callers.push(caller);
  };
  for (const f of scan22.files) {
    if (!f.calls?.length) continue;
    const family = familyOf(f.lang);
    const own = localDefs.get(f.rel);
    for (const c2 of f.calls) {
      const local = own.get(c2.name);
      if (local) {
        if (local.line !== c2.line) record(local, { file: f.rel, line: c2.line });
        continue;
      }
      const cands = (defs.get(c2.name) ?? []).filter((d) => familyOf(d.lang) === family && d.file !== f.rel).map((d) => ({ file: d.file, lang: d.lang }));
      if (!cands.length) continue;
      const imported = cands.filter((d) => pairs.has(`${f.rel}|${d.file}`));
      const chosen = family === "js" ? imported.length ? pickCandidate(f.rel, imported) : void 0 : imported.length ? pickCandidate(f.rel, imported) : pickCandidate(f.rel, cands);
      if (!chosen) continue;
      const def = defs.get(c2.name).find((d) => d.file === chosen.file);
      record(def, { file: f.rel, line: c2.line });
    }
  }
  const index = /* @__PURE__ */ new Map();
  const keys = [...sites.keys()].sort(byStr);
  for (const key of keys) {
    const { def, callers } = sites.get(key);
    callers.sort((a, b) => byStr(a.file, b.file) || a.line - b.line);
    if (!index.has(def.name)) index.set(def.name, { def, callers });
    else index.set(`${def.name}@${def.file}`, { def, callers });
  }
  return index;
}
function enclosingSymbol(scan22, file, line) {
  const f = scan22.files.find((x) => x.rel === file);
  if (!f?.symbols.length) return void 0;
  let best;
  for (const s of f.symbols) {
    if (REFERENCE_KINDS3.has(s.kind)) continue;
    if (s.line > line) continue;
    if (s.endLine !== void 0 && line > s.endLine) continue;
    if (!best || s.line > best.line || s.line === best.line && (s.endLine ?? Infinity) <= (best.endLine ?? Infinity)) {
      best = s;
    }
  }
  return best;
}
var REFERENCE_KINDS3;
var init_callers = __esm({
  "src/callers.ts"() {
    "use strict";
    init_calls();
    init_resolve();
    init_sort();
    REFERENCE_KINDS3 = /* @__PURE__ */ new Set(["reexport", "reexport-all", "default"]);
  }
});
function readJson(path) {
  const raw = readText(path);
  if (!raw) return void 0;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function tomlSectionBody(toml, section) {
  const re = new RegExp(`^\\[${section}\\]\\s*$([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, "m");
  const m = toml.match(re);
  return m ? m[1] : null;
}
function tomlStringArray(body2, key) {
  const m = body2.match(new RegExp(`${key}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) return [];
  return m[1].split(/\r?\n/).map((line) => line.replace(/#.*$/, "")).join("\n").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}
function wsGlobToRegExp(pat) {
  let re = "";
  for (let i2 = 0; i2 < pat.length; i2++) {
    const c2 = pat[i2];
    if (c2 === "*") {
      if (pat[i2 + 1] === "*") {
        re += ".*";
        i2++;
        if (pat[i2 + 1] === "/") i2++;
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(c2)) {
      re += "\\" + c2;
    } else {
      re += c2;
    }
  }
  return new RegExp(`^${re}($|/)`);
}
function packageAt(root, dir, kind) {
  const abs = join5(root, dir);
  const pkgJson = join5(abs, "package.json");
  if (existsSync22(pkgJson)) {
    const pkg = readJson(pkgJson);
    const name2 = typeof pkg?.name === "string" && pkg.name ? pkg.name : dir.split("/").pop();
    return { name: name2, dir, kind, manifest: `${dir}/package.json` };
  }
  const cargo = join5(abs, "Cargo.toml");
  if (existsSync22(cargo)) {
    const body2 = tomlSectionBody(readText(cargo), "package");
    const name2 = body2?.match(/name\s*=\s*["']([^"']+)["']/)?.[1] ?? dir.split("/").pop();
    return { name: name2, dir, kind: "cargo", manifest: `${dir}/Cargo.toml` };
  }
  const gomod = join5(abs, "go.mod");
  if (existsSync22(gomod)) {
    const name2 = readText(gomod).match(/^module\s+(\S+)/m)?.[1] ?? dir.split("/").pop();
    return { name: name2, dir, kind: "go", manifest: `${dir}/go.mod` };
  }
  const pom = join5(abs, "pom.xml");
  if (existsSync22(pom)) {
    const name2 = ownArtifactId(readText(pom)) ?? dir.split("/").pop();
    return { name: name2, dir, kind: "maven", manifest: `${dir}/pom.xml` };
  }
  return void 0;
}
function ownArtifactId(pom) {
  const stripped = pom.replace(/<parent>[\s\S]*?<\/parent>/g, "").replace(/<dependencies>[\s\S]*?<\/dependencies>/g, "");
  return stripped.match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/)?.[1];
}
function addPackage(root, dir, found, kind) {
  const clean2 = dir.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!clean2 || found.has(clean2)) return;
  const pkg = packageAt(root, clean2, kind);
  if (pkg) found.set(clean2, pkg);
}
function collectRecursive(root, base, found, kind, depth) {
  if (depth > MAX_RECURSE_DEPTH) return;
  let entries;
  try {
    entries = readdirSync22(join5(root, base), { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || WS_SKIP_DIRS.has(ent.name)) continue;
    const sub = base ? `${base}/${ent.name}` : ent.name;
    addPackage(root, sub, found, kind);
    collectRecursive(root, sub, found, kind, depth + 1);
  }
}
function expandPattern(root, raw, found, kind) {
  const pat = raw.replace(/\/+$/, "");
  if (pat.endsWith("/**")) {
    collectRecursive(root, pat.slice(0, -3), found, kind, 0);
  } else if (pat.endsWith("/*")) {
    const base = pat.slice(0, -2);
    let entries;
    try {
      entries = readdirSync22(join5(root, base), { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) addPackage(root, `${base}/${ent.name}`, found, kind);
    }
  } else {
    addPackage(root, pat, found, kind);
  }
}
function npmFamilyPatterns(root) {
  const positives = [];
  const negations = [];
  const push = (raw, kind) => {
    const t = raw.trim();
    if (!t) return;
    if (t.startsWith("!")) negations.push(t.slice(1));
    else positives.push({ pattern: t, kind });
  };
  const pkg = readJson(join5(root, "package.json"));
  const ws = pkg?.workspaces;
  if (Array.isArray(ws)) {
    for (const x of ws) if (typeof x === "string") push(x, "npm");
  } else if (ws && typeof ws === "object" && Array.isArray(ws.packages)) {
    for (const x of ws.packages) if (typeof x === "string") push(x, "npm");
  }
  const pnpm = readText(join5(root, "pnpm-workspace.yaml"));
  let inPackages = false;
  for (const line of pnpm.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inPackages = /^packages\s*:/.test(line);
      continue;
    }
    if (!inPackages) continue;
    const m = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/);
    if (m) push(m[1].trim(), "pnpm");
  }
  return { positives, negations };
}
function fallbackNpmPatterns(root) {
  const lerna = readJson(join5(root, "lerna.json"));
  if (lerna && Array.isArray(lerna.packages)) {
    return lerna.packages.filter((x) => typeof x === "string").map((pattern) => ({ pattern, kind: "lerna" }));
  }
  const nx = readJson(join5(root, "nx.json"));
  if (nx) {
    const layout2 = nx.workspaceLayout ?? {};
    const appsDir = typeof layout2.appsDir === "string" ? layout2.appsDir : "apps";
    const libsDir = typeof layout2.libsDir === "string" ? layout2.libsDir : "libs";
    return [.../* @__PURE__ */ new Set([appsDir, libsDir])].map((dir) => ({ pattern: `${dir}/*`, kind: "nx" }));
  }
  return [];
}
function detectCargoMembers(root, found) {
  const toml = readText(join5(root, "Cargo.toml"));
  if (!toml) return;
  const body2 = tomlSectionBody(toml, "workspace");
  if (!body2) return;
  const members = tomlStringArray(body2, "members");
  if (!members.length) return;
  const excludes = tomlStringArray(body2, "exclude").map(wsGlobToRegExp);
  const candidates = /* @__PURE__ */ new Map();
  for (const pat of members) expandPattern(root, pat, candidates, "cargo");
  for (const [dir, pkg] of candidates) {
    if (excludes.some((re) => re.test(dir))) continue;
    if (!found.has(dir)) found.set(dir, pkg);
  }
}
function detectGoWork(root, found) {
  const gowork = readText(join5(root, "go.work"));
  if (!gowork) return;
  const dirs = [];
  for (const block of gowork.matchAll(/^use\s*\(([\s\S]*?)\)/gm)) {
    for (const line of block[1].split(/\r?\n/)) {
      const t = line.replace(/\/\/.*$/, "").trim();
      if (t) dirs.push(t);
    }
  }
  for (const m of gowork.matchAll(/^use\s+([^\s(]+)/gm)) dirs.push(m[1]);
  for (const dir of dirs) {
    if (dir === "." || dir === "./") continue;
    addPackage(root, dir, found, "go");
  }
}
function detectMavenModules(root, found) {
  const pom = readText(join5(root, "pom.xml"));
  if (!pom) return;
  const modules = pom.match(/<modules>([\s\S]*?)<\/modules>/)?.[1];
  if (!modules) return;
  for (const m of modules.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)) {
    addPackage(root, m[1], found, "maven");
  }
}
function npmEdges(root, pkg, byName) {
  const manifest = readJson(join5(root, pkg.dir, "package.json"));
  if (!manifest) return [];
  const edges = /* @__PURE__ */ new Set();
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = manifest[field];
    if (!deps || typeof deps !== "object") continue;
    for (const dep of Object.keys(deps)) {
      if (dep !== pkg.name && byName.has(dep)) edges.add(dep);
    }
  }
  return [...edges];
}
function normalizeDepPath(fromDir, rel) {
  const parts2 = `${fromDir}/${rel}`.split("/");
  const out2 = [];
  for (const p of parts2) {
    if (!p || p === ".") continue;
    if (p === "..") out2.pop();
    else out2.push(p);
  }
  return out2.join("/");
}
function cargoEdges(root, pkg, byName, byDir) {
  const toml = readText(join5(root, pkg.dir, "Cargo.toml"));
  if (!toml) return [];
  const edges = /* @__PURE__ */ new Set();
  for (const section of ["dependencies", "dev-dependencies", "build-dependencies"]) {
    const body2 = tomlSectionBody(toml, section);
    if (!body2) continue;
    for (const line of body2.split(/\r?\n/)) {
      const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
      if (!kv) continue;
      const dep = kv[1];
      if (dep !== pkg.name && byName.has(dep)) {
        edges.add(dep);
        continue;
      }
      const pathDep = kv[2].match(/path\s*=\s*["']([^"']+)["']/);
      if (pathDep) {
        const target = byDir.get(normalizeDepPath(pkg.dir, pathDep[1]));
        if (target && target !== pkg.name) edges.add(target);
      }
    }
  }
  return [...edges];
}
function goPkgEdges(root, pkg, byName, byDir) {
  const gomod = readText(join5(root, pkg.dir, "go.mod"));
  if (!gomod) return [];
  const edges = /* @__PURE__ */ new Set();
  for (const m of gomod.matchAll(/^\s*(?:require\s+)?([^\s/(][^\s]*)\s+v[^\s]+/gm)) {
    const dep = m[1];
    if (dep !== pkg.name && byName.has(dep)) edges.add(dep);
  }
  for (const m of gomod.matchAll(/^\s*(?:replace\s+)?(\S+)(?:\s+\S+)?\s*=>\s*(\.\.?\/\S+)/gm)) {
    const target = byDir.get(normalizeDepPath(pkg.dir, m[2]));
    if (target && target !== pkg.name) edges.add(target);
  }
  return [...edges];
}
function mavenEdges(root, pkg, byName) {
  const pom = readText(join5(root, pkg.dir, "pom.xml"));
  if (!pom) return [];
  const edges = /* @__PURE__ */ new Set();
  for (const m of pom.replace(/<parent>[\s\S]*?<\/parent>/g, "").matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const aid = m[1].match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/)?.[1];
    if (aid && aid !== pkg.name && byName.has(aid)) edges.add(aid);
  }
  return [...edges];
}
function findCycle(packages) {
  const deps = new Map(packages.map((p) => [p.name, [...p.dependsOn ?? []].sort(byStr)]));
  const state = /* @__PURE__ */ new Map();
  const stack = [];
  const visit = (name2) => {
    state.set(name2, "visiting");
    stack.push(name2);
    for (const dep of deps.get(name2) ?? []) {
      if (!deps.has(dep)) continue;
      if (state.get(dep) === "visiting") return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(name2, "done");
    return null;
  };
  for (const name2 of [...deps.keys()].sort(byStr)) {
    if (!state.has(name2)) {
      const found = visit(name2);
      if (found) return found;
    }
  }
  return void 0;
}
function topoOrder(packages) {
  const remaining = new Map(packages.map((p) => [p.name, new Set(p.dependsOn ?? [])]));
  const order = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()].filter(([, deps]) => [...deps].every((d) => !remaining.has(d))).map(([name2]) => name2).sort(byStr);
    if (!ready.length) {
      order.push(...[...remaining.keys()].sort(byStr));
      break;
    }
    for (const name2 of ready) {
      order.push(name2);
      remaining.delete(name2);
    }
  }
  return order;
}
function detectWorkspaces(root) {
  const found = /* @__PURE__ */ new Map();
  const { positives, negations } = npmFamilyPatterns(root);
  const npmPatterns = positives.length ? positives : fallbackNpmPatterns(root);
  if (npmPatterns.length) {
    const candidates = /* @__PURE__ */ new Map();
    for (const { pattern, kind } of npmPatterns) expandPattern(root, pattern, candidates, kind);
    const negRes = negations.map(wsGlobToRegExp);
    for (const [dir, pkg] of candidates) {
      if (negRes.some((re) => re.test(dir))) continue;
      found.set(dir, pkg);
    }
  }
  detectCargoMembers(root, found);
  detectGoWork(root, found);
  detectMavenModules(root, found);
  const packages = [...found.values()].sort((a, b) => byStr(a.dir, b.dir));
  const byName = new Set(packages.map((p) => p.name));
  const byDir = new Map(packages.map((p) => [p.dir, p.name]));
  for (const pkg of packages) {
    const edges = pkg.kind === "cargo" ? cargoEdges(root, pkg, byName, byDir) : pkg.kind === "go" ? goPkgEdges(root, pkg, byName, byDir) : pkg.kind === "maven" ? mavenEdges(root, pkg, byName) : npmEdges(root, pkg, byName);
    if (edges.length) pkg.dependsOn = edges.sort(byStr);
  }
  const byDepth = [...packages].sort((a, b) => b.dir.length - a.dir.length);
  return {
    packages,
    cycle: findCycle(packages),
    topoOrder: topoOrder(packages),
    packageOf: (rel) => byDepth.find((p) => rel === p.dir || rel.startsWith(p.dir + "/"))
  };
}
var WS_SKIP_DIRS;
var MAX_RECURSE_DEPTH;
var init_workspaces = __esm({
  "src/workspaces.ts"() {
    "use strict";
    init_walk();
    init_sort();
    WS_SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", "target", "coverage"]);
    MAX_RECURSE_DEPTH = 4;
  }
});
function pagerankOf(ids, edges, damping = DAMPING) {
  const out2 = /* @__PURE__ */ new Map();
  const n = ids.length;
  if (n === 0) return out2;
  const idx = new Map(ids.map((s, i2) => [s, i2]));
  const adj = Array.from({ length: n }, () => []);
  const outW = new Array(n).fill(0);
  for (const e of edges) {
    if (e.dangling) continue;
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a === void 0 || b === void 0 || a === b) continue;
    adj[a].push([b, e.weight]);
    outW[a] += e.weight;
  }
  let pr = new Array(n).fill(1 / n);
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let dangling = 0;
    for (let i2 = 0; i2 < n; i2++) if (outW[i2] === 0) dangling += pr[i2];
    const base = (1 - damping) / n + damping * dangling / n;
    const next = new Array(n).fill(base);
    for (let i2 = 0; i2 < n; i2++) {
      if (outW[i2] === 0) continue;
      const share = damping * pr[i2] / outW[i2];
      for (const [j, w] of adj[i2]) next[j] += share * w;
    }
    let delta = 0;
    for (let i2 = 0; i2 < n; i2++) delta += Math.abs(next[i2] - pr[i2]);
    pr = next;
    if (delta < CONVERGENCE) break;
  }
  ids.forEach((s, i2) => out2.set(s, pr[i2]));
  return out2;
}
function betweennessOf(ids, edges) {
  const out2 = /* @__PURE__ */ new Map();
  for (const s of ids) out2.set(s, 0);
  const n = ids.length;
  if (n < 3) return out2;
  const idx = new Map(ids.map((s, i2) => [s, i2]));
  const nbSets = Array.from({ length: n }, () => /* @__PURE__ */ new Set());
  for (const e of edges) {
    if (e.dangling) continue;
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a === void 0 || b === void 0 || a === b) continue;
    nbSets[a].add(b);
    nbSets[b].add(a);
  }
  const adj = nbSets.map((s) => [...s].sort((x, y) => x - y));
  const cb = new Array(n).fill(0);
  for (let s = 0; s < n; s++) {
    const stack = [];
    const pred = Array.from({ length: n }, () => []);
    const sigma = new Array(n).fill(0);
    const dist = new Array(n).fill(-1);
    sigma[s] = 1;
    dist[s] = 0;
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const v = queue[qi];
      stack.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          queue.push(w);
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }
    const delta = new Array(n).fill(0);
    for (let si = stack.length - 1; si >= 0; si--) {
      const w = stack[si];
      for (const v of pred[w]) delta[v] += sigma[v] / sigma[w] * (1 + delta[w]);
      if (w !== s) cb[w] += delta[w];
    }
  }
  const norm2 = (n - 1) * (n - 2) / 2;
  ids.forEach((id, i2) => out2.set(id, cb[i2] / 2 / norm2));
  return out2;
}
function applyCentrality(graph) {
  const notes = [];
  const nM = graph.modules.length;
  if (nM > 0) {
    const mIds = graph.modules.map((m) => m.id);
    const mPr = pagerankOf(mIds, graph.moduleEdges);
    for (const m of graph.modules) m.pagerank = Number(((mPr.get(m.id) ?? 0) * nM).toFixed(4));
    if (nM > BETWEENNESS_MAX_NODES) {
      notes.push(`betweenness skipped (${nM} modules > ${BETWEENNESS_MAX_NODES})`);
    } else {
      const bt = betweennessOf(mIds, graph.moduleEdges);
      for (const m of graph.modules) m.betweenness = Number((bt.get(m.id) ?? 0).toFixed(6));
    }
  }
  const nF = graph.files.length;
  if (nF > 0) {
    const fIds = graph.files.map((f) => f.id);
    const fPr = pagerankOf(fIds, graph.fileEdges);
    for (const f of graph.files) f.pagerank = Number(((fPr.get(f.id) ?? 0) * nF).toFixed(4));
  }
  return notes;
}
var DAMPING;
var MAX_ITERS;
var CONVERGENCE;
var BETWEENNESS_MAX_NODES;
var init_centrality = __esm({
  "src/centrality.ts"() {
    "use strict";
    DAMPING = 0.85;
    MAX_ITERS = 100;
    CONVERGENCE = 1e-10;
    BETWEENNESS_MAX_NODES = 3e3;
  }
});
function communityOf(graph, slug) {
  return graph.modules.find((m) => m.slug === slug)?.community;
}
function buildAdjacency(slugs, edges) {
  const n = slugs.length;
  const idx = new Map(slugs.map((s, i2) => [s, i2]));
  const adj = Array.from({ length: n }, () => /* @__PURE__ */ new Map());
  for (const e of edges) {
    if (e.dangling) continue;
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a === void 0 || b === void 0 || a === b) continue;
    adj[a].set(b, (adj[a].get(b) ?? 0) + e.weight);
    adj[b].set(a, (adj[b].get(a) ?? 0) + e.weight);
  }
  const k = adj.map((m) => {
    let s = 0;
    for (const w of m.values()) s += w;
    return s;
  });
  const twoM = k.reduce((a, b) => a + b, 0);
  return { n, adj, k, twoM };
}
function canonicalize(comm) {
  const remap = /* @__PURE__ */ new Map();
  const out2 = new Array(comm.length);
  for (let i2 = 0; i2 < comm.length; i2++) {
    let id = remap.get(comm[i2]);
    if (id === void 0) {
      id = remap.size;
      remap.set(comm[i2], id);
    }
    out2[i2] = id;
  }
  return { comm: out2, count: remap.size };
}
function localMove(g) {
  const { n, adj, k, twoM } = g;
  const comm = Array.from({ length: n }, (_, i2) => i2);
  if (twoM === 0) return canonicalize(comm);
  const commTot = k.slice();
  let moved = true;
  let sweeps = 0;
  while (moved && sweeps < MAX_SWEEPS) {
    moved = false;
    sweeps++;
    for (let i2 = 0; i2 < n; i2++) {
      const cOld = comm[i2];
      commTot[cOld] -= k[i2];
      const nb = /* @__PURE__ */ new Map();
      for (const [j, wij] of adj[i2]) {
        if (j === i2) continue;
        const cj = comm[j];
        nb.set(cj, (nb.get(cj) ?? 0) + wij);
      }
      let bestC = cOld;
      let bestScore = (nb.get(cOld) ?? 0) - GAMMA * k[i2] * commTot[cOld] / twoM;
      for (const c2 of [...nb.keys()].sort((a, b) => a - b)) {
        if (c2 === cOld) continue;
        const score = nb.get(c2) - GAMMA * k[i2] * commTot[c2] / twoM;
        if (score > bestScore + EPS) {
          bestScore = score;
          bestC = c2;
        }
      }
      commTot[bestC] += k[i2];
      if (bestC !== cOld) {
        comm[i2] = bestC;
        moved = true;
      }
    }
  }
  return canonicalize(comm);
}
function aggregate(g, comm, count) {
  const adj = Array.from({ length: count }, () => /* @__PURE__ */ new Map());
  for (let i2 = 0; i2 < g.n; i2++) {
    const ci = comm[i2];
    for (const [j, wij] of g.adj[i2]) {
      const cj = comm[j];
      adj[ci].set(cj, (adj[ci].get(cj) ?? 0) + wij);
    }
  }
  const k = adj.map((m) => {
    let s = 0;
    for (const w of m.values()) s += w;
    return s;
  });
  const twoM = k.reduce((a, b) => a + b, 0);
  return { n: count, adj, k, twoM };
}
function louvain(g) {
  if (g.n === 0) return [];
  let level = g;
  const mapping = Array.from({ length: g.n }, (_, i2) => i2);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { comm, count } = localMove(level);
    for (let i2 = 0; i2 < mapping.length; i2++) mapping[i2] = comm[mapping[i2]];
    if (count === level.n) break;
    level = aggregate(level, comm, count);
  }
  return canonicalize(mapping).comm;
}
function groupByLabel(labels) {
  const groups = [];
  for (let i2 = 0; i2 < labels.length; i2++) {
    (groups[labels[i2]] ??= []).push(i2);
  }
  return groups.filter((g) => g && g.length > 0);
}
function louvainInduced(g, members) {
  const m = members.length;
  const local = /* @__PURE__ */ new Map();
  members.forEach((b, li) => local.set(b, li));
  const adj = Array.from({ length: m }, () => /* @__PURE__ */ new Map());
  for (let li = 0; li < m; li++) {
    for (const [nb, w] of g.adj[members[li]]) {
      const lj = local.get(nb);
      if (lj === void 0) continue;
      adj[li].set(lj, w);
    }
  }
  const k = adj.map((mp) => {
    let s = 0;
    for (const w of mp.values()) s += w;
    return s;
  });
  const twoM = k.reduce((a, b) => a + b, 0);
  const labels = louvain({ n: m, adj, k, twoM });
  return groupByLabel(labels).map((grp) => grp.map((li) => members[li]));
}
function splitOversized(groups, g, n) {
  const out2 = [];
  for (const grp of groups) {
    if (grp.length > OVERSIZE_FRACTION * n && grp.length >= OVERSIZE_MIN) {
      const sub = louvainInduced(g, grp);
      if (sub.length > 1) {
        out2.push(...sub);
        continue;
      }
    }
    out2.push(grp);
  }
  return out2;
}
function compareCommunities(a, b) {
  if (a.length !== b.length) return b.length - a.length;
  for (let i2 = 0; i2 < a.length; i2++) {
    const c2 = byStr(a[i2], b[i2]);
    if (c2) return c2;
  }
  return 0;
}
function assignIds(ordered, previous) {
  const n = ordered.length;
  const ids = new Array(n).fill(-1);
  if (!previous || Object.keys(previous).length === 0) {
    for (let i2 = 0; i2 < n; i2++) ids[i2] = i2;
    return ids;
  }
  const prevSets = Object.entries(previous).map(([id, members]) => ({
    id: Number(id),
    set: new Set(members)
  }));
  const pairs = [];
  ordered.forEach((comm, ni) => {
    for (const prev of prevSets) {
      let inter = 0;
      for (const s of comm) if (prev.set.has(s)) inter++;
      if (inter > 0) pairs.push({ ni, prevId: prev.id, inter });
    }
  });
  pairs.sort((a, b) => b.inter - a.inter || a.ni - b.ni || a.prevId - b.prevId);
  const matched = /* @__PURE__ */ new Map();
  const usedPrev = /* @__PURE__ */ new Set();
  for (const p of pairs) {
    if (matched.has(p.ni) || usedPrev.has(p.prevId)) continue;
    matched.set(p.ni, p.prevId);
    usedPrev.add(p.prevId);
  }
  const taken = /* @__PURE__ */ new Set();
  for (let ni = 0; ni < n; ni++) {
    const pid = matched.get(ni);
    if (pid !== void 0 && pid >= 0 && pid < n && !taken.has(pid)) {
      ids[ni] = pid;
      taken.add(pid);
    }
  }
  const free = [];
  for (let id = 0; id < n; id++) if (!taken.has(id)) free.push(id);
  let fi = 0;
  for (let ni = 0; ni < n; ni++) if (ids[ni] === -1) ids[ni] = free[fi++];
  return ids;
}
function detectCommunities(modules, edges, previous) {
  const out2 = /* @__PURE__ */ new Map();
  if (modules.length === 0) return out2;
  const slugs = modules.map((m) => m.slug).sort(byStr);
  const g = buildAdjacency(slugs, edges);
  const labels = louvain(g);
  const split = splitOversized(groupByLabel(labels), g, slugs.length);
  const communities = split.map((grp) => grp.map((i2) => slugs[i2]).sort(byStr));
  communities.sort(compareCommunities);
  const ids = assignIds(communities, previous);
  communities.forEach((comm, ni) => {
    for (const s of comm) out2.set(s, ids[ni]);
  });
  return out2;
}
var GAMMA;
var MAX_SWEEPS;
var MAX_PASSES;
var EPS;
var OVERSIZE_FRACTION;
var OVERSIZE_MIN;
var init_community = __esm({
  "src/community.ts"() {
    "use strict";
    init_sort();
    GAMMA = 1;
    MAX_SWEEPS = 20;
    MAX_PASSES = 10;
    EPS = 1e-12;
    OVERSIZE_FRACTION = 0.25;
    OVERSIZE_MIN = 10;
  }
});
function isTestPath(rel) {
  if (TEST_DIR.test(rel)) return true;
  if (isTestFile(rel)) return true;
  const base = rel.split("/").pop();
  return BASENAME_PATTERNS.some((p) => p.test(base));
}
function computeTestMap(graph) {
  const testFiles = /* @__PURE__ */ new Set();
  const moduleOf = /* @__PURE__ */ new Map();
  for (const f of graph.files) {
    moduleOf.set(f.rel, f.module);
    if (f.fileKind === "code" && isTestPath(f.rel)) testFiles.add(f.rel);
  }
  const byFile = /* @__PURE__ */ new Map();
  const byModule = /* @__PURE__ */ new Map();
  for (const e of graph.fileEdges) {
    if (e.dangling) continue;
    if (e.kind !== "import" && e.kind !== "use" && e.kind !== "call") continue;
    if (!testFiles.has(e.from) || testFiles.has(e.to)) continue;
    let set = byFile.get(e.to);
    if (!set) byFile.set(e.to, set = /* @__PURE__ */ new Set());
    set.add(e.from);
    const slug = moduleOf.get(e.to);
    if (slug !== void 0) {
      let mset = byModule.get(slug);
      if (!mset) byModule.set(slug, mset = /* @__PURE__ */ new Set());
      mset.add(e.from);
    }
  }
  const sortSets = (m) => {
    const out2 = /* @__PURE__ */ new Map();
    for (const key of [...m.keys()].sort(byStr)) out2.set(key, [...m.get(key)].sort(byStr));
    return out2;
  };
  return { testFiles, testedByFile: sortSets(byFile), testedByModule: sortSets(byModule) };
}
function testsForModule(graph, slug) {
  const m = graph.modules.find((x) => x.slug === slug);
  if (m?.testedBy) return m.testedBy;
  return computeTestMap(graph).testedByModule.get(slug) ?? [];
}
function untestedModules(graph) {
  const tm = computeTestMap(graph);
  const codeMembers = /* @__PURE__ */ new Map();
  for (const f of graph.files) {
    if (f.fileKind !== "code" || tm.testFiles.has(f.rel)) continue;
    codeMembers.set(f.module, (codeMembers.get(f.module) ?? 0) + 1);
  }
  return graph.modules.filter(
    (m) => m.tier <= 1 && m.symbols > 0 && (codeMembers.get(m.slug) ?? 0) > 0 && !tm.testedByModule.has(m.slug)
  );
}
var BASENAME_PATTERNS;
var TEST_DIR;
var init_tests_map = __esm({
  "src/tests-map.ts"() {
    "use strict";
    init_modules();
    init_sort();
    BASENAME_PATTERNS = [
      /^test_.*\.py$/i,
      /_test\.py$/i,
      /_test\.go$/,
      /(Test|Tests|IT)\.java$/,
      /(Test|Tests)\.kt$/,
      /_spec\.rb$/,
      /_test\.rb$/,
      /Test\.php$/,
      /(Test|Tests)\.cs$/,
      /_test\.exs$/
    ];
    TEST_DIR = /(^|\/)(tests?|__tests?__|spec|specs|e2e)(\/|$)/i;
  }
});
function computeSurprises(graph) {
  const commOf = /* @__PURE__ */ new Map();
  const tierOf2 = /* @__PURE__ */ new Map();
  for (const m of graph.modules) {
    if (m.community !== void 0) commOf.set(m.slug, m.community);
    tierOf2.set(m.slug, m.tier);
  }
  const pairCount = /* @__PURE__ */ new Map();
  const pairKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const candidates = [];
  for (const e of graph.moduleEdges) {
    if (e.dangling) continue;
    const ca = commOf.get(e.from);
    const cb = commOf.get(e.to);
    if (ca === void 0 || cb === void 0 || ca === cb) continue;
    pairCount.set(pairKey(ca, cb), (pairCount.get(pairKey(ca, cb)) ?? 0) + 1);
    if (!DEP_KINDS.has(e.kind)) continue;
    if (tierOf2.get(e.to) === 0) continue;
    candidates.push({ edge: e, comms: [ca, cb] });
  }
  return candidates.filter((c2) => pairCount.get(pairKey(c2.comms[0], c2.comms[1])) <= MAX_PAIR_EDGES).map((c2) => ({
    from: c2.edge.from,
    to: c2.edge.to,
    kind: c2.edge.kind,
    weight: c2.edge.weight,
    communities: c2.comms,
    pairEdges: pairCount.get(pairKey(c2.comms[0], c2.comms[1]))
  })).sort((a, b) => a.pairEdges - b.pairEdges || byStr(a.from, b.from) || byStr(a.to, b.to)).slice(0, SURPRISE_CAP);
}
function isSurprising(graph, from, to) {
  const list = graph.surprises ?? computeSurprises(graph);
  return list.some((s) => s.from === from && s.to === to);
}
var SURPRISE_CAP;
var MAX_PAIR_EDGES;
var DEP_KINDS;
var init_surprise = __esm({
  "src/surprise.ts"() {
    "use strict";
    init_sort();
    SURPRISE_CAP = 24;
    MAX_PAIR_EDGES = 2;
    DEP_KINDS = /* @__PURE__ */ new Set(["import", "call", "use"]);
  }
});
function computeSymbolRefs(scan22) {
  const unique = uniqueSymbolDefs(scan22);
  const refs = /* @__PURE__ */ new Map();
  if (!unique.size) return refs;
  const add = (name2, file) => {
    let set = refs.get(name2);
    if (!set) refs.set(name2, set = /* @__PURE__ */ new Set());
    set.add(file);
  };
  for (const f of scan22.files) {
    if (f.kind === "code" && f.idents) {
      for (const id of f.idents) {
        const target = unique.get(id);
        if (target && target !== f.rel) add(id, f.rel);
      }
    } else if (f.kind === "doc") {
      const content = scan22.docText.get(f.rel);
      if (!content) continue;
      for (const tok of content.split(/[^A-Za-z0-9_]+/)) {
        const target = unique.get(tok);
        if (target && target !== f.rel) add(tok, f.rel);
      }
    }
  }
  return refs;
}
function buildSymbolIndex(scan22, refs = /* @__PURE__ */ new Map()) {
  const defsByName = /* @__PURE__ */ new Map();
  for (const f of scan22.files) {
    for (const s of f.symbols) {
      let arr = defsByName.get(s.name);
      if (!arr) defsByName.set(s.name, arr = []);
      arr.push({
        file: s.file,
        line: s.line,
        ...s.endLine !== void 0 ? { endLine: s.endLine } : {},
        kind: s.kind,
        exported: s.exported,
        lang: s.lang,
        ...s.parent ? { parent: s.parent } : {}
      });
    }
  }
  const defs = {};
  for (const name2 of [...defsByName.keys()].sort(byStr)) {
    defs[name2] = defsByName.get(name2).slice().sort((a, b) => byStr(a.file, b.file) || a.line - b.line || byStr(a.kind, b.kind));
  }
  const refsOut = {};
  for (const name2 of [...refs.keys()].sort(byStr)) {
    const files = [...refs.get(name2)].sort(byStr);
    if (files.length) refsOut[name2] = files;
  }
  return { schemaVersion: SCHEMA_VERSION, defs, refs: refsOut };
}
function renderSymbolsJson(index) {
  return JSON.stringify(index, null, 2) + "\n";
}
var init_symbols_json = __esm({
  "src/render/symbols-json.ts"() {
    "use strict";
    init_types();
    init_sort();
    init_graph();
  }
});
function sortObject(obj) {
  const out2 = {};
  for (const k of Object.keys(obj).sort(byStr)) out2[k] = obj[k];
  return out2;
}
function renderGraphJson(graph) {
  const ordered = { ...graph, languages: sortObject(graph.languages) };
  return JSON.stringify(ordered, null, 2) + "\n";
}
var init_graph_json = __esm({
  "src/render/graph-json.ts"() {
    "use strict";
    init_sort();
  }
});
function buildIndexArtifacts(repo, opts = {}) {
  const scan22 = scanRepo(repo, opts);
  const ctx = buildResolveContext(scan22);
  const { modules, moduleOf } = buildModules(scan22);
  const graph = buildGraph(scan22, ctx, modules, moduleOf, opts.meta);
  const communities = detectCommunities(graph.modules, graph.moduleEdges, opts.previousCommunities);
  for (const m of graph.modules) {
    const id = communities.get(m.slug);
    if (id !== void 0) m.community = id;
  }
  applyCentrality(graph);
  const testMap = computeTestMap(graph);
  for (const f of graph.files) {
    if (testMap.testFiles.has(f.rel)) f.testFile = true;
  }
  for (const m of graph.modules) {
    const t = testMap.testedByModule.get(m.slug);
    if (t?.length) m.testedBy = t;
  }
  const surprises = computeSurprises(graph);
  if (surprises.length) graph.surprises = surprises;
  const symbols = buildSymbolIndex(scan22, computeSymbolRefs(scan22));
  return { scan: scan22, graph, symbols };
}
var init_pipeline = __esm({
  "src/pipeline.ts"() {
    "use strict";
    init_scan();
    init_resolve();
    init_modules();
    init_graph();
    init_community();
    init_centrality();
    init_tests_map();
    init_surprise();
    init_symbols_json();
  }
});
function sortHits(hits) {
  return hits.sort((a, b) => byStr(a.file, b.file) || a.line - b.line);
}
function rgBackend(root, pattern, opts) {
  const args2 = [
    "--no-heading",
    "--line-number",
    "--null",
    // path\0line:text — a `:12:` inside a filename can't corrupt parsing
    "--color=never",
    "--no-messages",
    "--hidden",
    "--no-require-git",
    "--no-ignore-global",
    "--no-ignore-exclude",
    "--no-ignore-parent",
    "--no-ignore-dot",
    "--max-filesize",
    "1M"
  ];
  for (const d of IGNORE_DIRS) args2.push("--glob", `!**/${d}/**`);
  for (const l of LOCKFILES) args2.push("--iglob", `!**/${l}`);
  for (const ext of BINARY_EXT) args2.push("--iglob", `!**/*${ext}`);
  args2.push("--glob", "!*.min.js", "--glob", "!*.min.css");
  if (opts.ignoreCase) args2.push("--ignore-case");
  for (const g of opts.globs ?? []) args2.push("--glob", g.startsWith("/") ? g : `/${g}`);
  args2.push("--regexp", pattern, "./");
  const res = sh2("rg", args2, { cwd: root });
  if (res.missing || !res.ok && res.status !== 1) return void 0;
  const hits = [];
  for (const line of res.stdout.split("\n")) {
    if (!line) continue;
    const nul = line.indexOf("\0");
    if (nul === -1) continue;
    const file = line.slice(0, nul).replace(/^\.\//, "");
    const rest = line.slice(nul + 1);
    const colon = rest.indexOf(":");
    if (colon === -1) continue;
    hits.push({ file, line: Number(rest.slice(0, colon)), text: rest.slice(colon + 1) });
  }
  return hits;
}
function jsBackend(root, re, opts) {
  const filter = compileGlobs(opts.globs?.map((g) => g.replace(/^\//, "")));
  const hits = [];
  for (const f of walk(root).files) {
    if (filter && !filter(f.rel)) continue;
    const content = readText(f.abs);
    if (!content) continue;
    const lines = content.split("\n");
    for (let i2 = 0; i2 < lines.length; i2++) {
      if (re.test(lines[i2])) hits.push({ file: f.rel, line: i2 + 1, text: lines[i2] });
    }
  }
  return hits;
}
function grepRepo(root, pattern, opts = {}) {
  const re = new RegExp(pattern, opts.ignoreCase ? "i" : "");
  const max = opts.maxHits ?? DEFAULT_MAX_HITS;
  let hits;
  if (!opts.noRipgrep && have2("rg")) hits = rgBackend(root, pattern, opts);
  hits ??= jsBackend(root, re, opts);
  return sortHits(hits).slice(0, max);
}
var DEFAULT_MAX_HITS;
var init_grep = __esm({
  "src/grep.ts"() {
    "use strict";
    init_walk();
    init_glob();
    init_util();
    init_sort();
    DEFAULT_MAX_HITS = 200;
  }
});
var mcp_exports = {};
__export(mcp_exports, {
  runMcpServer: () => runMcpServer
});
function str(v) {
  return typeof v === "string" && v ? v : void 0;
}
function strArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string") && v.length ? v : void 0;
}
function callTool(name2, args2) {
  const repo = str(args2.repo);
  if (!repo) throw new Error("`repo` is required (absolute path to the repository root)");
  const scanOpts = { scope: str(args2.scope), include: strArray(args2.include), exclude: strArray(args2.exclude) };
  if (name2 === "scan_summary") {
    const scan22 = scanRepo(repo, scanOpts);
    return JSON.stringify(
      { engineVersion: ENGINE_VERSION, commit: scan22.commit, fileCount: scan22.files.length, languages: scan22.languages, capped: scan22.capped },
      null,
      2
    );
  }
  if (name2 === "graph") {
    return renderGraphJson(buildIndexArtifacts(repo, scanOpts).graph);
  }
  if (name2 === "symbols") {
    const { symbols } = buildIndexArtifacts(repo, scanOpts);
    const lookup = str(args2.name);
    if (lookup) {
      return JSON.stringify({ name: lookup, defs: symbols.defs[lookup] ?? [], refs: symbols.refs[lookup] ?? [] }, null, 2);
    }
    return JSON.stringify(symbols, null, 2);
  }
  if (name2 === "callers") {
    const index = buildCallerIndex(scanRepo(repo, scanOpts));
    const lookup = str(args2.name);
    if (lookup) {
      const entry = index.get(lookup);
      return JSON.stringify(entry ?? { error: `no tracked callers for "${lookup}"` }, null, 2);
    }
    const obj = {};
    for (const [k, v] of index) obj[k] = v;
    return JSON.stringify(obj, null, 2);
  }
  if (name2 === "workspaces") {
    const info2 = detectWorkspaces(repo);
    return JSON.stringify({ packages: info2.packages, cycle: info2.cycle ?? null, topoOrder: info2.topoOrder }, null, 2);
  }
  if (name2 === "churn") {
    const { churn, ok } = gitChurn(repo, { since: str(args2.since) });
    const sorted = {};
    for (const k of [...churn.keys()].sort()) sorted[k] = churn.get(k);
    return JSON.stringify({ ok, churn: sorted }, null, 2);
  }
  if (name2 === "grep") {
    const pattern = str(args2.pattern);
    if (!pattern) throw new Error("`pattern` is required");
    const hits = grepRepo(repo, pattern, {
      globs: strArray(args2.globs),
      ignoreCase: args2.ignoreCase === true,
      maxHits: typeof args2.maxHits === "number" ? args2.maxHits : void 0
    });
    return JSON.stringify(hits, null, 2);
  }
  throw new Error(`unknown tool: ${name2}`);
}
async function runMcpServer() {
  await ensureGrammars(allGrammarKeys());
  const send = (msg) => {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  };
  const rl = createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      send({ id: null, error: { code: -32700, message: "parse error" } });
      continue;
    }
    const requests = Array.isArray(parsed) ? parsed : [parsed];
    for (const req of requests) handle2(req);
  }
  function handle2(req) {
    if (req.id === void 0 || req.id === null) return;
    try {
      if (req.method === "initialize") {
        send({
          id: req.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "codeindex", version: ENGINE_VERSION }
          }
        });
      } else if (req.method === "ping") {
        send({ id: req.id, result: {} });
      } else if (req.method === "tools/list") {
        send({ id: req.id, result: { tools: TOOLS } });
      } else if (req.method === "tools/call") {
        const params = req.params ?? {};
        const name2 = str(params.name) ?? "";
        const args2 = params.arguments ?? {};
        try {
          const text = callTool(name2, args2);
          send({ id: req.id, result: { content: [{ type: "text", text }] } });
        } catch (e) {
          send({
            id: req.id,
            result: { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
          });
        }
      } else {
        send({ id: req.id, error: { code: -32601, message: `method not found: ${req.method}` } });
      }
    } catch (e) {
      send({ id: req.id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } });
    }
  }
}
var repoProp;
var scopeProps;
var TOOLS;
var init_mcp = __esm({
  "src/mcp.ts"() {
    "use strict";
    init_types();
    init_loader();
    init_pipeline();
    init_graph_json();
    init_scan();
    init_callers();
    init_workspaces();
    init_git();
    init_grep();
    repoProp = { repo: { type: "string", description: "Absolute path to the repository root" } };
    scopeProps = {
      scope: { type: "string", description: "Restrict to one directory (repo-relative)" },
      include: { type: "array", items: { type: "string" }, description: "Include globs" },
      exclude: { type: "array", items: { type: "string" }, description: "Exclude globs" }
    };
    TOOLS = [
      {
        name: "scan_summary",
        description: "Deterministically scan a repository: file count, per-language file histogram, HEAD commit, and whether the walk was capped. Fast first look at any codebase.",
        inputSchema: { type: "object", properties: { ...repoProp, ...scopeProps }, required: ["repo"] }
      },
      {
        name: "graph",
        description: "Build the full typed cross-file link-graph (import/call/use/doc-link/mention edges, module grouping, PageRank centrality, Louvain communities, tests-map). Returns graph.json. Large on big repos \u2014 prefer scan_summary/symbols/callers for targeted questions.",
        inputSchema: { type: "object", properties: { ...repoProp, ...scopeProps }, required: ["repo"] }
      },
      {
        name: "symbols",
        description: "Where is a symbol defined and which files reference it? Returns the definition sites (file, line, kind, exported) and referencing files. Omit `name` for the full symbol index.",
        inputSchema: {
          type: "object",
          properties: { ...repoProp, name: { type: "string", description: "Symbol name to look up" } },
          required: ["repo"]
        }
      },
      {
        name: "callers",
        description: "Who calls a function? Per-symbol caller index: each defined symbol with the exact (file, line) call sites that bind to it. Omit `name` for the full index.",
        inputSchema: {
          type: "object",
          properties: { ...repoProp, name: { type: "string", description: "Symbol name to look up" } },
          required: ["repo"]
        }
      },
      {
        name: "workspaces",
        description: "Detect monorepo packages (npm/pnpm/yarn/lerna/nx/cargo/go.work/maven) with the workspace dependency graph, one cycle if present, and a topological build order.",
        inputSchema: { type: "object", properties: { ...repoProp }, required: ["repo"] }
      },
      {
        name: "churn",
        description: "Per-file git commit counts (whole history, or since a ref) \u2014 the churn half of hotspot analysis.",
        inputSchema: {
          type: "object",
          properties: { ...repoProp, since: { type: "string", description: "Only count commits after this ref" } },
          required: ["repo"]
        }
      },
      {
        name: "grep",
        description: "Search file contents (ripgrep when available, deterministic JS fallback otherwise). Returns sorted (file, line, text) hits.",
        inputSchema: {
          type: "object",
          properties: {
            ...repoProp,
            pattern: { type: "string", description: "Regular expression to search for" },
            globs: { type: "array", items: { type: "string" }, description: "Restrict to matching paths" },
            ignoreCase: { type: "boolean" },
            maxHits: { type: "number" }
          },
          required: ["repo", "pattern"]
        }
      }
    ];
  }
});
init_types();
init_walk();
init_scan();
init_glob();
init_ignore();
init_classify();
var CODE_EXTS = /* @__PURE__ */ new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".astro",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".php",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".swift",
  ".scala",
  ".clj",
  ".ex",
  ".exs",
  ".dart",
  ".lua",
  ".sh",
  ".bash",
  ".zig",
  ".elm"
]);
var STYLE_EXTS = /* @__PURE__ */ new Set([".css", ".scss", ".sass", ".less", ".styl", ".pcss"]);
var DOC_EXTS = /* @__PURE__ */ new Set([".md", ".mdx", ".rst", ".adoc", ".txt"]);
var DATA_EXTS = /* @__PURE__ */ new Set([".json", ".yaml", ".yml", ".toml", ".csv", ".xml", ".env"]);
var ASSET_EXTS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".bmp",
  ".tiff",
  ".svg",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".webm"
]);
var I18N_DIRS = ["locales", "locale", "i18n", "lang", "langs", "translations", "messages"];
var I18N_EXTS = /* @__PURE__ */ new Set([".json", ".yaml", ".yml", ".po", ".properties"]);
var TEST_DIRS = ["__tests__", "test", "tests", "spec", "e2e", "__mocks__"];
var SCHEMA_DIRS = ["migrations", "entities", "models"];
var CONFIG_BASES = /* @__PURE__ */ new Set([
  "package.json",
  "tsconfig.json",
  "dockerfile",
  "makefile",
  "pyproject.toml",
  "cargo.toml",
  "go.mod",
  "requirements.txt",
  "gemfile",
  "composer.json",
  "pubspec.yaml"
]);
function categorize(rel, ext) {
  const lower = rel.toLowerCase();
  const base = basename22(lower);
  const segments = lower.split("/");
  const inDir = (names) => names.some((n) => segments.includes(n));
  if (inDir(I18N_DIRS) && I18N_EXTS.has(ext)) return "i18n";
  if (ext === ".prisma" || ext === ".sql" || ext === ".graphql" || ext === ".gql" || base.startsWith("schema.") || base === "models.py" || inDir(SCHEMA_DIRS)) {
    return "schema";
  }
  if (lower.includes(".test.") || lower.includes(".spec.") || inDir(TEST_DIRS)) return "test";
  if (CONFIG_BASES.has(base) || base.endsWith(".config.js") || base.endsWith(".config.ts") || base.endsWith(".config.mjs") || base.startsWith(".eslintrc") || base.startsWith(".prettierrc") || base.startsWith(".env") || base.startsWith("docker-compose")) {
    return "config";
  }
  if (DOC_EXTS.has(ext)) return "doc";
  if (STYLE_EXTS.has(ext)) return "style";
  if (CODE_EXTS.has(ext)) return "code";
  if (ASSET_EXTS.has(ext)) return "asset";
  if (DATA_EXTS.has(ext)) return "data";
  return "other";
}
init_registry();
init_code();
init_markdown();
init_loader();
init_extract();
init_resolve();
init_modules();
init_graph();
init_calls();
init_callers();
init_workspaces();
init_centrality();
init_community();
init_tests_map();
init_surprise();
init_symbols_json();
init_graph_json();
init_pipeline();
init_git();
init_grep();
init_mcp();
init_hash();
init_sort();
init_util();
init_types();
init_types();
init_loader();
init_pipeline();
init_graph_json();
init_symbols_json();
init_scan();
init_callers();
init_workspaces();
init_git();
init_grep();
var HELP = `codeindex engine v${ENGINE_VERSION} \u2014 deterministic repo indexing

Usage: engine.mjs <command> [flags]

Commands:
  index       Build graph.json + symbols.json (+ incremental cache.json) into
              --out <dir> in ONE pass \u2014 the fast path for repeated runs
  scan        Scan summary: file count, language histogram, capped flag
  graph       Full link-graph (graph.json bytes) to stdout or --out
  symbols     Symbol index (symbols.json bytes) to stdout or --out
  callers     Per-symbol caller index (JSON)
  workspaces  Monorepo packages + dependency graph (JSON)
  churn       Per-file git commit counts (JSON; --since <ref> to bound)
  grep        Search: engine.mjs grep <pattern> --repo <dir> (JSON hits)
  mcp         Run as an MCP server over stdio (tools: scan_summary, graph,
              symbols, callers, workspaces, churn, grep)
  version     Print the engine version

Flags:
  --repo <dir>        Repo root (default: cwd)
  --out <file>        Write output to a file instead of stdout
  --include <glob>    Only include matching paths (repeatable)
  --exclude <glob>    Exclude matching paths (repeatable)
  --scope <dir>       Restrict to one directory (sugar for --include '<dir>/**')
  --no-gitignore      Do not honor .gitignore files (default: honored)
  --max-files <n>     Cap walked files (default 20000)
  --max-bytes <n>     Skip files above this size (default 1 MiB)
  --no-ast            Skip tree-sitter grammars even when present (regex tier)
`;
function parseFlags(args2) {
  const flags2 = { repo: process.cwd(), include: [], exclude: [], gitignore: true, noAst: false };
  for (let i2 = 0; i2 < args2.length; i2++) {
    const a = args2[i2];
    const next = () => {
      const v = args2[++i2];
      if (v === void 0) throw new Error(`missing value for ${a}`);
      return v;
    };
    const num = () => {
      const raw = next();
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`${a} expects a positive number, got "${raw}"`);
      return n;
    };
    if (a === "--repo") flags2.repo = resolve2(next());
    else if (a === "--out") flags2.out = resolve2(next());
    else if (a === "--include") flags2.include.push(next());
    else if (a === "--exclude") flags2.exclude.push(next());
    else if (a === "--scope") flags2.scope = next();
    else if (a === "--no-gitignore") flags2.gitignore = false;
    else if (a === "--max-files") flags2.maxFiles = num();
    else if (a === "--max-bytes") flags2.maxBytes = num();
    else if (a === "--ignore-case") flags2.ignoreCase = true;
    else if (a === "--max-hits") flags2.maxHits = num();
    else if (a === "--no-ast") flags2.noAst = true;
    else if (a === "--since") flags2.since = next();
    else if (!a.startsWith("--") && flags2.positional === void 0) flags2.positional = a;
    else throw new Error(`unknown flag: ${a}`);
  }
  return flags2;
}
function emit(content, out2) {
  if (out2) writeFileSync(out2, content);
  else process.stdout.write(content);
}
function scanOptions(flags2) {
  return {
    include: flags2.include.length ? flags2.include : void 0,
    exclude: flags2.exclude.length ? flags2.exclude : void 0,
    scope: flags2.scope,
    gitignore: flags2.gitignore,
    maxFiles: flags2.maxFiles,
    maxBytes: flags2.maxBytes
  };
}
async function runCli(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    return;
  }
  if (cmd === "version" || cmd === "--version") {
    process.stdout.write(ENGINE_VERSION + "\n");
    return;
  }
  if (cmd === "mcp") {
    const { runMcpServer: runMcpServer2 } = await Promise.resolve().then(() => (init_mcp(), mcp_exports));
    await runMcpServer2();
    return;
  }
  const flags2 = parseFlags(rest);
  if (!existsSync3(flags2.repo)) throw new Error(`--repo path does not exist: ${flags2.repo}`);
  if (!flags2.noAst) await ensureGrammars(allGrammarKeys());
  if (cmd === "index") {
    if (!flags2.out) throw new Error("index needs --out <dir>");
    const outDir = flags2.out;
    mkdirSync2(outDir, { recursive: true });
    const cachePath = join6(outDir, "cache.json");
    let cache;
    try {
      const parsed = JSON.parse(readFileSync3(cachePath, "utf8"));
      if (parsed.schemaVersion === SCHEMA_VERSION && parsed.extractorVersion === EXTRACTOR_VERSION) {
        cache = new Map(Object.entries(parsed.files));
      }
    } catch {
    }
    const { scan: scan22, graph, symbols } = buildIndexArtifacts(flags2.repo, { ...scanOptions(flags2), cache, out: outDir });
    writeFileSync(join6(outDir, "graph.json"), renderGraphJson(graph));
    writeFileSync(join6(outDir, "symbols.json"), renderSymbolsJson(symbols));
    const files = {};
    for (const f of scan22.files) {
      const entry = { hash: f.hash, record: f, size: f.size };
      const mtime = scan22.mtimes.get(f.rel);
      if (mtime !== void 0) entry.mtimeMs = mtime;
      files[f.rel] = entry;
    }
    writeFileSync(
      cachePath,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, extractorVersion: EXTRACTOR_VERSION, files }) + "\n"
    );
    process.stderr.write(`codeindex: ${scan22.files.length} files \u2192 ${outDir}/graph.json + symbols.json${scan22.capped ? " (capped)" : ""}
`);
  } else if (cmd === "scan") {
    const { scan: scan22 } = buildIndexArtifacts(flags2.repo, scanOptions(flags2));
    const summary = {
      engineVersion: ENGINE_VERSION,
      commit: scan22.commit,
      fileCount: scan22.files.length,
      languages: scan22.languages,
      capped: scan22.capped
    };
    emit(JSON.stringify(summary, null, 2) + "\n", flags2.out);
  } else if (cmd === "graph") {
    const { graph } = buildIndexArtifacts(flags2.repo, scanOptions(flags2));
    emit(renderGraphJson(graph), flags2.out);
  } else if (cmd === "symbols") {
    const { symbols } = buildIndexArtifacts(flags2.repo, scanOptions(flags2));
    emit(renderSymbolsJson(symbols), flags2.out);
  } else if (cmd === "callers") {
    const scan22 = scanRepo(flags2.repo, scanOptions(flags2));
    const index = buildCallerIndex(scan22);
    const obj = {};
    for (const [name2, entry] of index) obj[name2] = entry;
    emit(JSON.stringify(obj, null, 2) + "\n", flags2.out);
  } else if (cmd === "workspaces") {
    const info2 = detectWorkspaces(flags2.repo);
    emit(
      JSON.stringify(
        { packages: info2.packages, cycle: info2.cycle ?? null, topoOrder: info2.topoOrder },
        null,
        2
      ) + "\n",
      flags2.out
    );
  } else if (cmd === "churn") {
    const { churn, ok } = gitChurn(flags2.repo, { since: flags2.since });
    const sorted = {};
    for (const k of [...churn.keys()].sort()) sorted[k] = churn.get(k);
    emit(JSON.stringify({ ok, churn: sorted }, null, 2) + "\n", flags2.out);
  } else if (cmd === "grep") {
    if (!flags2.positional) throw new Error("grep needs a pattern: cli.mjs grep <pattern> --repo <dir>");
    const globs = [...flags2.include, ...flags2.exclude.map((g) => `!${g}`)];
    const hits = grepRepo(flags2.repo, flags2.positional, {
      globs: globs.length ? globs : void 0,
      ignoreCase: flags2.ignoreCase,
      maxHits: flags2.maxHits
    });
    emit(JSON.stringify(hits, null, 2) + "\n", flags2.out);
  } else {
    process.stderr.write(`unknown command: ${cmd}

${HELP}`);
    process.exitCode = 2;
  }
}

// src/walk.ts
function walkDetailed(root, opts = {}) {
  const res = walk(root, {
    maxFileBytes: opts.maxFileBytes ?? LIMITS.maxFileBytes,
    maxFiles: opts.maxFiles ?? LIMITS.maxFiles
  });
  return {
    files: res.files.filter((f) => f.rel !== ".ultradoc" && !f.rel.startsWith(".ultradoc/")),
    truncated: res.capped
  };
}
function walk2(root, opts = {}) {
  return walkDetailed(root, opts).files;
}

// src/lang/common.ts
function scan2(rel, content, lang, rules) {
  const out2 = [];
  const lines = content.split(/\r?\n/);
  for (let i2 = 0; i2 < lines.length; i2++) {
    const line = lines[i2];
    if (!line.trim()) continue;
    for (const rule of rules) {
      const m = rule.re.exec(line);
      if (!m) continue;
      const name2 = m.groups?.name ?? m[1];
      if (!name2) continue;
      const exported = typeof rule.exported === "function" ? rule.exported(m, line) : rule.exported ?? false;
      out2.push({
        name: name2,
        kind: rule.kind,
        file: rel,
        line: i2 + 1,
        signature: line.trim().slice(0, 200),
        exported,
        lang
      });
      break;
    }
  }
  return out2;
}
var EXPORT_LIST_RE = /export\s*\{([^}]*)\}\s*(from\b)?/g;
var CJS_OBJECT_RE = /module\.exports\s*=\s*\{([^}]*)\}/g;
var DEFAULT_ID_RE = /(^|\n)\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*(?=\n|$)/g;
function applyExportLists(content, symbols, rel, lang) {
  const byName = /* @__PURE__ */ new Map();
  for (const s of symbols) if (!byName.has(s.name)) byName.set(s.name, s);
  const markExported = (name2) => {
    const s = byName.get(name2);
    if (s) s.exported = true;
    return s;
  };
  const handleList = (inner, cjs) => {
    for (const raw of inner.split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const asMatch = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(part);
      if (asMatch) {
        const orig = asMatch[1];
        const alias = asMatch[2];
        if (orig === "default" || alias === "default") continue;
        const base = markExported(orig);
        if (base && !byName.has(alias)) {
          const clone = { ...base, name: alias, exported: true };
          symbols.push(clone);
          byName.set(alias, clone);
        }
        continue;
      }
      const name2 = /^([\w$]+)/.exec(cjs ? part : part.split(":")[0].trim())?.[1];
      if (name2 && name2 !== "default") markExported(name2);
    }
  };
  let m;
  EXPORT_LIST_RE.lastIndex = 0;
  while (m = EXPORT_LIST_RE.exec(content)) {
    if (m[2]) continue;
    handleList(m[1] ?? "", false);
  }
  CJS_OBJECT_RE.lastIndex = 0;
  while (m = CJS_OBJECT_RE.exec(content)) handleList(m[1] ?? "", true);
  DEFAULT_ID_RE.lastIndex = 0;
  while (m = DEFAULT_ID_RE.exec(content)) {
    const name2 = m[2];
    if (!markExported(name2)) {
      symbols.push({ name: name2, kind: "default", file: rel, line: 1, signature: `export default ${name2}`, exported: true, lang });
      byName.set(name2, symbols[symbols.length - 1]);
    }
  }
}

// src/lang/js-ts.ts
var RULES16 = [
  { re: /^\s*export\s+(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: true },
  { re: /^\s*export\s+default\s+(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: true },
  { re: /^\s*export\s+default\s+(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: true },
  { re: /^\s*(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: false },
  { re: /^\s*export\s+(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: true },
  { re: /^\s*(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: false },
  { re: /^\s*export\s+interface\s+(?<name>[\w$]+)/, kind: "interface", exported: true },
  { re: /^\s*interface\s+(?<name>[\w$]+)/, kind: "interface", exported: false },
  { re: /^\s*export\s+type\s+(?<name>[\w$]+)/, kind: "type", exported: true },
  { re: /^\s*type\s+(?<name>[\w$]+)\s*[=<]/, kind: "type", exported: false },
  { re: /^\s*export\s+enum\s+(?<name>[\w$]+)/, kind: "enum", exported: true },
  { re: /^\s*export\s+const\s+enum\s+(?<name>[\w$]+)/, kind: "enum", exported: true },
  // exported const/let bound to an arrow fn or value
  { re: /^\s*export\s+(?:const|let|var)\s+(?<name>[\w$]+)\s*[:=]/, kind: "const", exported: true },
  // CommonJS named exports: `exports.foo = …`, `module.exports.foo = …`
  { re: /^\s*exports\.(?<name>[\w$]+)\s*=/, kind: "const", exported: true },
  { re: /^\s*module\.exports\.(?<name>[\w$]+)\s*=/, kind: "const", exported: true },
  // top-level const arrow function (not exported)
  { re: /^\s*(?:const|let)\s+(?<name>[\w$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/, kind: "const", exported: false }
];
var ANON_DEFAULT_RE = /^\s*export\s+default\s+(?:async\s+)?(?:function|class)?\s*(?:\(|\{|extends\b)/;
var NAMED_DEFAULT_RE = /^\s*export\s+default\s+(?:async\s+)?(?:function|class)\s+(?!extends\b)[\w$]+/;
function stemOf(rel) {
  return (rel.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
}
var jsTs2 = {
  lang: "javascript/typescript",
  exts: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
  extract(rel, content) {
    const lang = rel.match(/\.(ts|tsx|mts|cts)$/) ? "typescript" : "javascript";
    const symbols = scan2(rel, content, lang, RULES16);
    const lines = content.split(/\r?\n/);
    for (let i2 = 0; i2 < lines.length; i2++) {
      const line = lines[i2];
      if (ANON_DEFAULT_RE.test(line) && !NAMED_DEFAULT_RE.test(line)) {
        symbols.push({ name: stemOf(rel), kind: "default", file: rel, line: i2 + 1, signature: line.trim().slice(0, 200), exported: true, lang });
        break;
      }
    }
    applyExportLists(content, symbols, rel, lang);
    return symbols;
  }
};

// src/lang/registry.ts
var JS_TS_EXTS = new Set(jsTs2.exts);
function extractSymbols2(rel, ext, content) {
  if (JS_TS_EXTS.has(ext)) {
    try {
      return jsTs2.extract(rel, content);
    } catch {
      return [];
    }
  }
  return extractSymbols(rel, ext, content);
}
function languageOf2(ext) {
  return JS_TS_EXTS.has(ext) ? jsTs2.lang : languageOf(ext);
}

// src/sources/doc-discovery.ts
import { join as join7 } from "path";
var DOC_DIR2 = /(^|\/)(docs?|documentation|website|guides?|book|manual|handbook|reference)$/i;
function discoverDocsRoot(docFiles) {
  const counts = /* @__PURE__ */ new Map();
  for (const rel of docFiles) {
    const parts2 = rel.split("/");
    for (const depth of [1, 2]) {
      if (parts2.length <= depth) continue;
      const dir = parts2.slice(0, depth).join("/");
      if (DOC_DIR2.test(dir)) counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  let best;
  let bestN = 1;
  for (const [k, v] of counts) {
    if (v > bestN || v === bestN && best && k.length < best.length) {
      best = k;
      bestN = v;
    }
  }
  return best;
}
var KNOWN_DOC_HOST = /readthedocs\.(io|org)|\.gitbook\.io|mintlify|docusaurus|\.readme\.io/i;
var HOSTED = /\.github\.io|\.netlify\.app|\.vercel\.app|\.pages\.dev/i;
var DOC_SUBDOMAIN = /^https?:\/\/docs?\./i;
var DOC_PATH = /(^|\/)(docs?|documentation|guide|guides|manual|handbook|reference|learn)(\/|$|#|\?)/i;
var URL_RE = /https?:\/\/[^\s)"'<>`\]]+/g;
function scoreDocUrl(url, context) {
  let s = 0;
  if (DOC_SUBDOMAIN.test(url)) s += 5;
  if (KNOWN_DOC_HOST.test(url)) s += 5;
  if (DOC_PATH.test(url)) s += 3;
  if (HOSTED.test(url) && DOC_PATH.test(url)) s += 1;
  if (/\b(documentation|docs|guide|manual|reference|api docs)\b/i.test(context)) s += 2;
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "");
  const depth = (path.match(/\//g) ?? []).length;
  if (depth >= 3) s -= Math.min(2, (depth - 2) * 0.5);
  return s;
}
function clean(url) {
  return url.replace(/[.,;]+$/, "").replace(/\)+$/, "");
}
function discoverDocsUrl(repoDir, docFiles, configFiles, projectNames = []) {
  const candidates = [];
  const names = projectNames.filter((n) => n && n.length >= 3).map((n) => n.toLowerCase());
  const related = (url) => names.some((n) => url.toLowerCase().includes(n));
  const add = (url, context, bonus = 0) => {
    const u = clean(url);
    if (!/^https?:\/\//.test(u)) return;
    candidates.push({ url: u, score: scoreDocUrl(u, context) + bonus + (related(u) ? 3 : 0) });
  };
  const readme = docFiles.find((f) => /^readme(\.|$)/i.test(f)) ?? docFiles.find((f) => /(^|\/)readme\./i.test(f));
  if (readme) {
    const text = readText(join7(repoDir, readme)).slice(0, 4e4);
    let m;
    const link = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
    while (m = link.exec(text)) add(m[2], m[1]);
    for (const line of text.split("\n")) {
      if (!/\b(doc|documentation|guide|manual|reference)\b/i.test(line)) continue;
      const urls = line.match(URL_RE);
      if (urls) for (const u of urls) add(u, line);
    }
  }
  for (const cfg of configFiles) {
    const base = cfg.split("/").pop().toLowerCase();
    const text = readText(join7(repoDir, cfg));
    if (!text) continue;
    if (base === "package.json" || base === "composer.json") {
      try {
        const j = JSON.parse(text);
        if (typeof j.homepage === "string") add(j.homepage, "homepage", 1);
        if (typeof j.documentation === "string") add(j.documentation, "documentation", 8);
        const docs = j.support?.docs ?? j.support?.documentation;
        if (typeof docs === "string") add(docs, "documentation", 8);
      } catch {
      }
    } else if (base === "pyproject.toml" || base === "setup.cfg") {
      const m = /^\s*Documentation\s*=\s*["']?(https?:\/\/[^"'\s]+)/im.exec(text);
      if (m) add(m[1], "documentation", 8);
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best && best.score >= 4 ? best.url : void 0;
}

// src/index/workspaces.ts
import { existsSync as existsSync4, readdirSync as readdirSync3, statSync as statSync3 } from "fs";
import { join as join8 } from "path";
var PKG_MANIFESTS = ["package.json", "Cargo.toml", "go.mod", "composer.json", "pyproject.toml", "pom.xml", "build.gradle", "build.gradle.kts"];
function tomlArrayInSection(text, section, key) {
  const out2 = [];
  let table = "";
  let buf;
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\[`);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "");
    if (buf !== void 0) {
      buf += " " + line;
      if (line.includes("]")) {
        for (const m of buf.matchAll(/["']([^"']+)["']/g)) out2.push(m[1]);
        buf = void 0;
      }
      continue;
    }
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      table = header[1].trim();
      continue;
    }
    if (table !== section || !keyRe.test(line)) continue;
    const tail = line.slice(line.indexOf("["));
    if (tail.includes("]")) {
      for (const m of tail.matchAll(/["']([^"']+)["']/g)) out2.push(m[1]);
    } else {
      buf = tail;
    }
  }
  return out2;
}
function tomlStringInSection(text, section, key) {
  let table = "";
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*["']([^"']+)["']`);
  for (const raw of text.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(raw);
    if (header) {
      table = header[1].trim();
      continue;
    }
    if (table !== section) continue;
    const m = keyRe.exec(raw);
    if (m) return m[1];
  }
  return void 0;
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function isDir(abs) {
  try {
    return statSync3(abs).isDirectory();
  } catch {
    return false;
  }
}
function subDirs(root, rel) {
  const abs = rel ? join8(root, rel) : root;
  let entries;
  try {
    entries = readdirSync3(abs);
  } catch {
    return [];
  }
  return entries.filter((n) => !n.startsWith(".") && n !== "node_modules" && isDir(join8(abs, n))).map((n) => rel ? `${rel}/${n}` : n);
}
function expandOne(root, pat) {
  const segs = pat.split("/").filter((s) => s && s !== ".");
  let dirs = [""];
  for (const seg of segs) {
    const next = [];
    for (const d of dirs) {
      if (seg === "**") {
        const level1 = subDirs(root, d);
        next.push(...level1, ...level1.flatMap((x) => subDirs(root, x)));
      } else if (seg === "*") {
        next.push(...subDirs(root, d));
      } else if (seg.includes("*")) {
        const re = new RegExp("^" + seg.split("*").map(escapeRegExp).join(".*") + "$");
        next.push(...subDirs(root, d).filter((x) => re.test(x.split("/").pop())));
      } else {
        const cand = d ? `${d}/${seg}` : seg;
        if (isDir(join8(root, cand))) next.push(cand);
      }
    }
    dirs = next;
    if (dirs.length === 0) return [];
  }
  return dirs.filter(Boolean);
}
function expand(root, patterns) {
  const include = [];
  const exclude = /* @__PURE__ */ new Set();
  for (const raw of patterns) {
    const neg = raw.startsWith("!");
    const pat = (neg ? raw.slice(1) : raw).replace(/^\.\//, "").replace(/\/+$/, "");
    if (!pat || pat === ".") continue;
    for (const dir of expandOne(root, pat)) neg ? exclude.add(dir) : include.push(dir);
  }
  return include.filter((d) => !exclude.has(d));
}
function describePackage(root, dir) {
  if (!PKG_MANIFESTS.some((m) => existsSync4(join8(root, dir, m)))) return void 0;
  const base = dir.split("/").pop();
  const pj = parseJson(readText(join8(root, dir, "package.json")) || readText(join8(root, dir, "composer.json")));
  if (pj && typeof pj.name === "string") {
    return { name: pj.name, dir, description: typeof pj.description === "string" ? pj.description : void 0 };
  }
  const cargo = readText(join8(root, dir, "Cargo.toml"));
  if (cargo) {
    const name2 = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(cargo)?.[1];
    const description = /^\s*description\s*=\s*["']([^"']+)["']/m.exec(cargo)?.[1];
    if (name2) return { name: name2, dir, description };
  }
  const gomod = readText(join8(root, dir, "go.mod"));
  if (gomod) {
    const mod = /^module\s+(\S+)/m.exec(gomod)?.[1];
    if (mod) return { name: mod, dir, description: void 0 };
  }
  const py = readText(join8(root, dir, "pyproject.toml"));
  if (py) {
    const name2 = tomlStringInSection(py, "project", "name") ?? tomlStringInSection(py, "tool.poetry", "name");
    const description = tomlStringInSection(py, "project", "description") ?? tomlStringInSection(py, "tool.poetry", "description");
    if (name2) return { name: name2, dir, description };
  }
  const pom = readText(join8(root, dir, "pom.xml"));
  if (pom) {
    const own = pom.replace(/<parent>[\s\S]*?<\/parent>/, "");
    const name2 = /<artifactId>\s*([^<]+?)\s*<\/artifactId>/.exec(own)?.[1];
    if (name2) return { name: name2, dir, description: void 0 };
  }
  return { name: base, dir, description: void 0 };
}
function workspacePatterns(root) {
  const patterns = [];
  const pj = parseJson(readText(join8(root, "package.json")));
  const ws = pj?.workspaces;
  if (Array.isArray(ws)) patterns.push(...ws.filter((p) => typeof p === "string"));
  else if (ws && Array.isArray(ws.packages)) patterns.push(...ws.packages.filter((p) => typeof p === "string"));
  const pnpm = readText(join8(root, "pnpm-workspace.yaml"));
  if (pnpm) {
    let inPackages = false;
    for (const line of pnpm.split(/\r?\n/)) {
      if (/^packages\s*:/.test(line)) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        const m = /^\s+-\s*["']?([^"'#]+?)["']?\s*$/.exec(line);
        if (m) patterns.push(m[1]);
        else if (/^\S/.test(line)) inPackages = false;
      }
    }
  }
  const lerna = parseJson(readText(join8(root, "lerna.json")));
  if (lerna && Array.isArray(lerna.packages)) {
    patterns.push(...lerna.packages.filter((p) => typeof p === "string"));
  }
  const cargo = readText(join8(root, "Cargo.toml"));
  if (cargo) {
    patterns.push(...tomlArrayInSection(cargo, "workspace", "members"));
    patterns.push(...tomlArrayInSection(cargo, "workspace", "exclude").map((p) => `!${p}`));
  }
  const gowork = readText(join8(root, "go.work"));
  if (gowork) {
    const block = /^use\s*\(([\s\S]*?)\)/m.exec(gowork)?.[1];
    const uses = block ? block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("//")) : [...gowork.matchAll(/^use\s+(\S+)/gm)].map((m) => m[1]);
    patterns.push(...uses);
  }
  const py = readText(join8(root, "pyproject.toml"));
  if (py) {
    patterns.push(...tomlArrayInSection(py, "tool.uv.workspace", "members"));
    patterns.push(...tomlArrayInSection(py, "tool.uv.workspace", "exclude").map((p) => `!${p}`));
  }
  const composer = parseJson(readText(join8(root, "composer.json")));
  if (composer && Array.isArray(composer.repositories)) {
    for (const r of composer.repositories) {
      if (r && r.type === "path" && typeof r.url === "string") patterns.push(r.url);
    }
  }
  const pom = readText(join8(root, "pom.xml"));
  if (pom) {
    const block = /<modules>([\s\S]*?)<\/modules>/.exec(pom)?.[1];
    if (block) {
      for (const m of block.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)) patterns.push(m[1]);
    }
  }
  for (const f of ["settings.gradle", "settings.gradle.kts"]) {
    const gradle = readText(join8(root, f));
    if (!gradle) continue;
    for (const line of gradle.split(/\r?\n/)) {
      if (!/^\s*include[\s(]/.test(line)) continue;
      for (const m of line.matchAll(/["']([^"']+)["']/g)) {
        patterns.push(m[1].replace(/^:/, "").replace(/:/g, "/"));
      }
    }
  }
  return patterns;
}
function discoverWorkspaces(root) {
  const dirs = expand(root, workspacePatterns(root));
  const byDir = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    if (byDir.has(dir)) continue;
    const pkg = describePackage(root, dir);
    if (pkg) byDir.set(dir, pkg);
  }
  return [...byDir.values()].sort((a, b) => a.dir.localeCompare(b.dir));
}
function resolvePackage(packages, query4) {
  const q = query4.toLowerCase().replace(/\/+$/, "");
  const exact = packages.find((p) => p.name.toLowerCase() === q) ?? packages.find((p) => p.dir.toLowerCase() === q);
  if (exact) return exact;
  const short = packages.filter((p) => p.name.toLowerCase().split("/").pop() === q || p.dir.toLowerCase().split("/").pop() === q);
  if (short.length === 1) return short[0];
  if (short.length > 1) return void 0;
  const loose = packages.filter((p) => p.name.toLowerCase().includes(q) || p.dir.toLowerCase().includes(q));
  return loose.length === 1 ? loose[0] : void 0;
}

// src/index/structural.ts
var SCHEMA_VERSION2 = 4;
var DOC_BASENAME2 = /^(readme|changelog|contributing|history|news|authors|notice|security|code_of_conduct|faq|getting[-_]?started|usage|guide|tutorial)\b/i;
var DOC_EXT2 = /* @__PURE__ */ new Set([".md", ".mdx", ".rst", ".adoc", ".txt"]);
var DOC_DIR3 = /^(docs?|documentation|wiki|guides?|website|site|book)\//i;
var CONFIG_BASENAME2 = /* @__PURE__ */ new Set([
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
  "manifest.json"
]);
function indexDir(root) {
  return join9(root, ".ultradoc");
}
function indexPath(root) {
  return join9(indexDir(root), "index.json");
}
function isDoc2(rel, ext) {
  const base = rel.split("/").pop().toLowerCase();
  return DOC_EXT2.has(ext) || DOC_BASENAME2.test(base) || DOC_DIR3.test(rel);
}
function isConfig2(rel) {
  return CONFIG_BASENAME2.has(rel.split("/").pop().toLowerCase());
}
function buildIndex(root, slug, opts = {}) {
  const { files, truncated } = walkDetailed(root, { maxFiles: opts.maxFiles });
  const languages = {};
  const symbols = [];
  const docFiles = [];
  const configFiles = [];
  const topDirs = {};
  let symbolCapHits = 0;
  for (const f of files) {
    const lang = languageOf2(f.ext);
    languages[lang] = (languages[lang] ?? 0) + 1;
    const top = f.rel.includes("/") ? f.rel.slice(0, f.rel.indexOf("/")) : ".";
    topDirs[top] = (topDirs[top] ?? 0) + 1;
    if (isDoc2(f.rel, f.ext)) docFiles.push(f.rel);
    if (isConfig2(f.rel)) configFiles.push(f.rel);
    const content = readText(f.abs);
    if (!content) continue;
    const syms = extractSymbols2(f.rel, f.ext, content);
    if (syms.length > LIMITS.symbolsPerFile) symbolCapHits++;
    for (const s of syms.slice(0, LIMITS.symbolsPerFile)) symbols.push(s);
  }
  const sortedDocs = docFiles.sort();
  const sortedConfigs = configFiles.sort();
  const index = {
    slug,
    root,
    commit: headCommit(root),
    builtAt: (/* @__PURE__ */ new Date()).toISOString(),
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
    schemaVersion: SCHEMA_VERSION2
  };
  try {
    mkdirSync3(indexDir(root), { recursive: true });
    writeFileSync2(indexPath(root), JSON.stringify(index));
  } catch {
  }
  return index;
}
function loadIndex(root) {
  const p = indexPath(root);
  if (!existsSync5(p)) return void 0;
  try {
    const idx = JSON.parse(readFileSync4(p, "utf8"));
    if (idx.schemaVersion !== SCHEMA_VERSION2) return void 0;
    const head = headCommit(root);
    if (idx.commit && head && !sameCommit(idx.commit, head)) return void 0;
    return idx;
  } catch {
    return void 0;
  }
}
function ensureIndex(root, slug, opts = {}) {
  if (!opts.refresh) {
    const existing = loadIndex(root);
    if (existing) return existing;
  }
  return buildIndex(root, slug, { maxFiles: opts.maxFiles, project: opts.project });
}

// src/dossier.ts
import { mkdirSync as mkdirSync4, writeFileSync as writeFileSync3 } from "fs";
import { join as join10 } from "path";
var SOURCE_ORDER = ["code", "docs", "release", "history", "issue", "pr", "discussion", "so", "web"];
var SOURCE_LABEL = {
  code: "Code",
  docs: "Documentation",
  release: "Releases & Changelog",
  history: "Git History",
  issue: "Issues",
  pr: "Pull / Merge Requests",
  discussion: "Discussions",
  so: "StackOverflow",
  web: "Web"
};
function rank(s) {
  const i2 = SOURCE_ORDER.indexOf(s);
  return i2 < 0 ? 99 : i2;
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function runId(d = /* @__PURE__ */ new Date()) {
  return `run-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function defaultRunDir(repoDir, d) {
  return join10(indexDir(repoDir), "runs", runId(d));
}
function assignIds2(results) {
  const flat = results.flatMap((r) => r.items);
  flat.sort((a, b) => rank(a.source) - rank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref));
  return flat.map((it, i2) => ({ id: `E${i2 + 1}`, ...it }));
}
function renderEvidenceMarkdown(evidence, meta) {
  const out2 = [];
  out2.push(`# Evidence dossier`);
  out2.push("");
  out2.push(`**Question:** ${meta.question}`);
  out2.push(
    `**Repo:** ${meta.repo}${meta.commit ? ` @ ${meta.commit}` : ""}${meta.ref ? ` (ref: ${meta.ref})` : ""} \xB7 **host:** ${meta.host}${meta.pkg ? ` \xB7 **package:** ${meta.pkg}` : ""}`
  );
  out2.push(`**Sources:** ${meta.sources.join(", ")} \xB7 **semantic:** ${meta.semantic ? "on" : "off"} \xB7 **built:** ${meta.builtAt}`);
  out2.push("");
  out2.push(
    `> Ground every claim in the answer in this evidence. Cite items by id, e.g. \`[E1]\`. Do not assert anything you cannot tie to an item below. Write the answer to \`ANSWER.md\` in this folder, then run \`ultradoc check\`.`
  );
  out2.push("");
  if (evidence.length === 0) {
    out2.push(`_No evidence was retrieved. Broaden the question, add sources, or check connectivity._`);
  }
  for (const source of SOURCE_ORDER) {
    const items = evidence.filter((e) => e.source === source);
    if (items.length === 0) continue;
    out2.push(`## ${SOURCE_LABEL[source]}`);
    out2.push("");
    for (const it of items) {
      out2.push(`### [${it.id}] ${it.title}`);
      const meta1 = [`ref: \`${it.ref}\``, it.location ? `loc: \`${it.location}\`` : "", `score: ${it.score}`].filter(Boolean).join(" \xB7 ");
      out2.push(meta1);
      if (it.url) out2.push(`url: ${it.url}`);
      out2.push("");
      out2.push("```");
      out2.push(it.snippet);
      out2.push("```");
      out2.push("");
    }
  }
  if (meta.notes.length) {
    out2.push(`## Retrieval notes`);
    out2.push("");
    for (const n of meta.notes) out2.push(`- ${n}`);
    out2.push("");
  }
  return out2.join("\n");
}
function writeDossier(dir, evidence, meta) {
  mkdirSync4(dir, { recursive: true });
  const evidenceJson = join10(dir, "evidence.json");
  const evidenceMd = join10(dir, "EVIDENCE.md");
  const metaJson = join10(dir, "meta.json");
  writeFileSync3(evidenceJson, JSON.stringify(evidence, null, 2));
  writeFileSync3(evidenceMd, renderEvidenceMarkdown(evidence, meta));
  writeFileSync3(metaJson, JSON.stringify(meta, null, 2));
  return { dir, evidenceJson, evidenceMd, metaJson };
}

// src/index/search.ts
import { statSync as statSync4 } from "fs";
import { join as join11 } from "path";

// src/index/bm25.ts
function bm25(docs, terms, N, df, k1 = 1.2, b = 0.75) {
  const scores = /* @__PURE__ */ new Map();
  const avgLen = docs.length ? docs.reduce((s, d) => s + d.len, 0) / docs.length : 1;
  for (const d of docs) {
    let s = 0;
    for (const t of terms) {
      const f = d.tf.get(t) ?? 0;
      if (f === 0) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * (f * (k1 + 1) / (f + k1 * (1 - b + b * (d.len / (avgLen || 1)))));
    }
    if (s > 0) scores.set(d.key, s);
  }
  return scores;
}

// src/index/search.ts
var MAX_KEYWORDS = 8;
var MAX_EXCERPT_LINES = 30;
var EXCERPT_PAD = 8;
var RANKING = {
  BM25_K1: 1.2,
  // b=0.3: code corpora mix tiny config files with huge implementation files,
  // and full-strength length normalization (b=0.75) buries the big files where
  // the answer lives (e.g. matomo's js/piwik.js).
  BM25_B: 0.3,
  LOW_SIGNAL_PENALTY: 0.45,
  // tests/docs/examples down-weight
  STEM_EXACT_BOOST: 1.3,
  // file stem == a query keyword (retry.ts for "retry")
  STEM_SUBTOKEN_BOOST: 1.15,
  // file stem shares a subtoken with a keyword
  EXPORTED_BOOST: 1.5,
  // an exported symbol outranks a private one
  SCORE_SCALE: 1e3,
  // readability of the reported score; ordering unchanged
  // Per-file contribution of its 1st/2nd/3rd best-matching symbol, so a file
  // that defines several relevant symbols outranks one with a single weak match.
  SYMBOL_DECAY: [1, 0.5, 0.25],
  // Call-site awareness: how many identifier keywords are probed as call
  // targets, the score of a distant call-site excerpt relative to its file's
  // primary excerpt, and how close a call region must be to the definition to
  // fold into one excerpt instead of a second item.
  CALLSITE_MAX_NAMES: 4,
  CALLSITE_SECOND_ITEM_FACTOR: 0.95,
  CALLSITE_MERGE_GAP: 12,
  // Rare-literal guarantee: a query keyword matching in at most RARE_TERM_DF
  // files is a near-unique literal (error string, regex fragment, data-file
  // entry) — its holder must surface even when rank fusion buries it, and at
  // most RARE_PIN_MAX holders may displace normally-ranked items.
  RARE_TERM_DF: 3,
  RARE_PIN_MAX: 2
};
var MAX_LINES_PER_FILE = 40;
function lexicalSearch(root, matcher, scope) {
  const byFile = /* @__PURE__ */ new Map();
  if (!matcher.patterns.length) return byFile;
  const pattern = matcher.patterns.map((p) => `(?:${p.source})`).join("|");
  const hits = grepRepo(root, pattern, {
    ignoreCase: true,
    maxHits: Number.MAX_SAFE_INTEGER,
    globs: scope ? [`${scope}/**`] : void 0
  });
  const res = matcher.patterns.map((p) => ({ re: new RegExp(p.source, "gi"), canonical: p.canonical }));
  for (const h of hits) {
    if (h.file === ".ultradoc" || h.file.startsWith(".ultradoc/")) continue;
    let fh = byFile.get(h.file);
    if (!fh) {
      fh = { rel: h.file, matchedKw: /* @__PURE__ */ new Set(), kwCounts: /* @__PURE__ */ new Map(), lines: [] };
      byFile.set(h.file, fh);
    }
    if (fh.lines.length >= MAX_LINES_PER_FILE) continue;
    for (const p of res) {
      const n = (h.text.match(p.re) ?? []).length;
      if (n > 0) {
        fh.matchedKw.add(p.canonical);
        fh.kwCounts.set(p.canonical, (fh.kwCounts.get(p.canonical) ?? 0) + n);
      }
    }
    fh.lines.push({ line: h.line, text: h.text.slice(0, 400) });
  }
  return byFile;
}
function regionsFor(fh, matcher, gap = 8) {
  const sorted = [...fh.lines].sort((a, b) => a.line - b.line);
  const regions = [];
  let cur = null;
  for (const h of sorted) {
    if (cur && h.line - cur.end <= gap) {
      cur.end = h.line;
      cur.lines.push(h);
    } else {
      if (cur) regions.push(scoreRegion(cur, matcher));
      cur = { start: h.line, end: h.line, lines: [h] };
    }
  }
  if (cur) regions.push(scoreRegion(cur, matcher));
  return regions;
}
function scoreRegion(cur, matcher) {
  const covered = /* @__PURE__ */ new Set();
  let anchor = cur.start;
  let best = -1;
  for (const h of cur.lines) {
    const here = matcher.matchLine(h.text);
    for (const c2 of here) covered.add(c2);
    if (here.size > best) {
      best = here.size;
      anchor = h.line;
    }
  }
  return { start: cur.start, end: cur.end, anchor, kwCount: covered.size };
}
function expandWindow(lines, start2, end, anchor) {
  const blank = (n) => /^\s*$/.test(lines[n - 1] ?? "");
  let s = Math.max(1, start2);
  let e = Math.min(lines.length, end);
  while (s > 1 && start2 - s < EXCERPT_PAD && !blank(s - 1)) s--;
  while (e < lines.length && e - end < EXCERPT_PAD && !blank(e + 1)) e++;
  if (e - s + 1 > MAX_EXCERPT_LINES) {
    let ns = Math.max(s, anchor - Math.floor(MAX_EXCERPT_LINES / 3));
    let ne = ns + MAX_EXCERPT_LINES - 1;
    if (ne > e) {
      ne = e;
      ns = ne - MAX_EXCERPT_LINES + 1;
    }
    s = ns;
    e = ne;
  }
  return { start: s, end: e };
}
function scoreSymbol(sym, matcher) {
  const name2 = foldTerm(sym.name);
  let s = 0;
  for (const ek of matcher.expanded) {
    let best = 0;
    for (const v of ek.variants) {
      const vt = foldTerm(v.text);
      let vs = 0;
      if (name2 === vt) vs = 6;
      else if (name2.startsWith(vt) || vt.startsWith(name2)) vs = 3;
      else if (name2.includes(vt) || vt.includes(name2)) vs = 1.5;
      if (v.kind === "subtoken") vs *= 0.5;
      if (vs > best) best = vs;
    }
    s += best;
  }
  if (s === 0) return 0;
  return sym.exported ? s * RANKING.EXPORTED_BOOST : s;
}
function symbolScores(index, matcher) {
  const perFile = /* @__PURE__ */ new Map();
  for (const sym of index.symbols) {
    const s = scoreSymbol(sym, matcher);
    if (s === 0) continue;
    const arr = perFile.get(sym.file) ?? [];
    arr.push({ score: s, sym });
    perFile.set(sym.file, arr);
  }
  const byFile = /* @__PURE__ */ new Map();
  for (const [file, arr] of perFile) {
    arr.sort((a, b) => b.score - a.score);
    let fileScore = 0;
    for (let i2 = 0; i2 < arr.length && i2 < RANKING.SYMBOL_DECAY.length; i2++) fileScore += arr[i2].score * RANKING.SYMBOL_DECAY[i2];
    byFile.set(file, { score: fileScore, sym: arr[0].sym });
  }
  return byFile;
}
function callableNames(matcher, index) {
  const declared = new Set(index.symbols.map((s) => foldTerm(s.name)));
  const out2 = [];
  for (const ek of matcher.expanded) {
    if (out2.length >= RANKING.CALLSITE_MAX_NAMES) break;
    const orig = ek.original;
    if (!/^[A-Za-z_$][\w$]*$/.test(orig)) continue;
    const identifierShaped = /[a-z][A-Z]/.test(orig) || orig.includes("_");
    if ((identifierShaped || declared.has(foldTerm(orig))) && !out2.includes(orig)) out2.push(orig);
  }
  return out2;
}
function callSiteHits(fh, compiled, declLines) {
  const lines = /* @__PURE__ */ new Set();
  const counts = /* @__PURE__ */ new Map();
  for (const h of fh.lines) {
    if (declLines.has(h.line)) continue;
    for (const c2 of compiled) {
      if (c2.re.test(h.text)) {
        lines.add(h.line);
        counts.set(c2.name, (counts.get(c2.name) ?? 0) + 1);
        break;
      }
    }
  }
  const name2 = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return { lines: [...lines].sort((a, b) => a - b), name: name2 };
}
function mergeLines(sorted, gap) {
  const regions = [];
  let cur = null;
  for (const l of sorted) {
    if (cur && l - cur.end <= gap) cur.end = l;
    else {
      if (cur) regions.push(cur);
      cur = { start: l, end: l };
    }
  }
  if (cur) regions.push(cur);
  return regions;
}
function searchCode(root, ref, index, question, perSource, scope) {
  const notes = [];
  const inScope = (rel) => !scope || rel.startsWith(scope + "/");
  let matcher = buildMatcher(question, MAX_KEYWORDS);
  if (matcher.expanded.length === 0) {
    notes.push("No distinctive keywords in the question; code search may be weak.");
    matcher = matcherFromTokens(question.split(/\s+/), MAX_KEYWORDS);
  }
  if (matcher.expanded.length === 0) return { items: [], notes };
  const usedRg = have("rg");
  if (!usedRg) notes.push("ripgrep not found \u2014 used the slower built-in scanner.");
  const lexical = lexicalSearch(root, matcher, scope);
  const symbols = symbolScores(index, matcher);
  const names = callableNames(matcher, index);
  const callHits = /* @__PURE__ */ new Map();
  let callRank = [];
  if (names.length) {
    const compiled = names.map((n) => ({ name: n, re: new RegExp(`\\b${escapeRegExp(n)}\\s*(?:\\?\\.)?\\s*\\(`) }));
    const nameSet = new Set(names.map(foldTerm));
    const declByFile = /* @__PURE__ */ new Map();
    for (const s of index.symbols) {
      if (!nameSet.has(foldTerm(s.name))) continue;
      const set = declByFile.get(s.file) ?? /* @__PURE__ */ new Set();
      set.add(s.line);
      declByFile.set(s.file, set);
    }
    for (const [rel, fh] of lexical) {
      if (!inScope(rel)) continue;
      const hit = callSiteHits(fh, compiled, declByFile.get(rel) ?? /* @__PURE__ */ new Set());
      if (hit.lines.length) callHits.set(rel, hit);
    }
    callRank = [...callHits.entries()].sort((a, b) => b[1].lines.length - a[1].lines.length || a[0].localeCompare(b[0])).map(([rel]) => rel);
  }
  const files = new Set([...lexical.keys(), ...symbols.keys()].filter(inScope));
  const canonicals = matcher.canonicals;
  const df = /* @__PURE__ */ new Map();
  for (const fh of lexical.values()) {
    for (const kw of fh.kwCounts.keys()) df.set(kw, (df.get(kw) ?? 0) + 1);
  }
  const missed = matcher.expanded.filter((ek) => (df.get(ek.canonical) ?? 0) <= RANKING.RARE_TERM_DF && ek.variants.some((v) => v.kind !== "subtoken"));
  if (missed.length) {
    let merged = false;
    for (const ek of missed) {
      const rescueMatcher = {
        ...matcher,
        expanded: [ek],
        canonicals: [ek.canonical],
        patterns: ek.variants.filter((v) => v.kind !== "subtoken").map((v) => ({ source: accentPattern(v.text), canonical: ek.canonical }))
      };
      const extra = lexicalSearch(root, rescueMatcher, scope);
      for (const [rel, fh] of extra) {
        if (!inScope(rel)) continue;
        const cur = lexical.get(rel);
        if (!cur) {
          lexical.set(rel, fh);
          files.add(rel);
          merged = true;
          continue;
        }
        for (const kw of fh.matchedKw) cur.matchedKw.add(kw);
        for (const [kw, n] of fh.kwCounts) cur.kwCounts.set(kw, Math.max(cur.kwCounts.get(kw) ?? 0, n));
        const seen = new Set(cur.lines.map((l) => l.line));
        for (const l of fh.lines) if (!seen.has(l.line)) cur.lines.push(l);
        merged = true;
      }
    }
    if (merged) {
      df.clear();
      for (const fh of lexical.values()) {
        for (const kw of fh.kwCounts.keys()) df.set(kw, (df.get(kw) ?? 0) + 1);
      }
    }
  }
  const candidates = [...files].filter((rel) => lexical.has(rel)).map((rel) => {
    let len = 1e3;
    try {
      len = Math.max(1, statSync4(join11(root, rel)).size / 5);
    } catch {
    }
    return { key: rel, tf: lexical.get(rel).kwCounts, len };
  });
  const lexScores = bm25(candidates, canonicals, Math.max(index.fileCount, lexical.size), df, RANKING.BM25_K1, RANKING.BM25_B);
  const lexRank = [...lexScores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([rel]) => rel);
  const symRank = [...symbols.entries()].filter(([rel]) => files.has(rel)).sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0])).map(([rel]) => rel);
  const fused = rrf(callRank.length ? [lexRank, symRank, callRank] : [lexRank, symRank], (rel) => rel);
  const docSet = new Set(index.docFiles);
  const canonSet = new Set(canonicals);
  const scored = [];
  for (const rel of files) {
    const base = fused.get(rel) ?? 0;
    if (base <= 0) continue;
    const lowSignal = /(^|\/)(test|tests|__tests__|spec|specs|fixtures?|examples?|benchmark|benchmarks)\//i.test(rel) || docSet.has(rel);
    const stem = (rel.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
    const stemParts = [foldTerm(stem), ...subtokens(stem).map(foldTerm)];
    const nameBoost = canonSet.has(stemParts[0]) ? RANKING.STEM_EXACT_BOOST : stemParts.some((p) => canonSet.has(p)) ? RANKING.STEM_SUBTOKEN_BOOST : 1;
    const score = base * RANKING.SCORE_SCALE * (lowSignal ? RANKING.LOW_SIGNAL_PENALTY : 1) * nameBoost;
    scored.push({ rel, score, fh: lexical.get(rel), sym: symbols.get(rel)?.sym });
  }
  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
  const items = [];
  for (const f of scored) {
    if (items.length >= perSource) break;
    const content = readText(join11(root, f.rel));
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    const call = callHits.get(f.rel);
    const windows = excerptWindows(lines, matcher, f.sym, f.fh, call?.lines ?? []);
    for (let wi = 0; wi < windows.length; wi++) {
      if (items.length >= perSource) break;
      const win = windows[wi];
      const score = wi === 0 ? f.score : f.score * RANKING.CALLSITE_SECOND_ITEM_FACTOR;
      const label = win.callSite ? `call site${call?.name ? ` (${call.name})` : ""}` : win.label;
      const url = ref.isLocal ? void 0 : `${ref.webUrl}/blob/${index.commit ?? "HEAD"}/${f.rel}#L${win.start}-L${win.end}`;
      items.push({
        source: "code",
        title: `${f.rel} \u2014 ${label}`,
        ref: f.rel,
        location: `${f.rel}:${win.start}-${win.end}`,
        score: Number(score.toFixed(3)),
        snippet: lines.slice(win.start - 1, win.end).join("\n"),
        url,
        meta: { matchedKeywords: f.fh ? [...f.fh.matchedKw] : [], symbol: f.sym?.name, ...win.callSite ? { callSite: true } : {} }
      });
    }
  }
  const pins = [];
  for (const kw of canonicals) {
    if (pins.length >= RANKING.RARE_PIN_MAX) break;
    const n = df.get(kw) ?? 0;
    if (n < 1 || n > RANKING.RARE_TERM_DF) continue;
    const direct = matcher.expanded.find((ek) => ek.canonical === kw)?.variants.filter((v) => v.kind !== "subtoken") ?? [];
    if (!direct.length) continue;
    const res = direct.map((v) => new RegExp(accentPattern(v.text), "i"));
    const covered = items.some((i2) => i2.snippet.split(/\r?\n/).some((ln) => res.some((re) => re.test(ln))));
    if (covered) continue;
    const best = scored.find((f) => f.fh?.matchedKw.has(kw) && !pins.some((p) => p.f.rel === f.rel));
    if (!best) continue;
    pins.push({ f: best, kw, n, res });
  }
  if (pins.length) {
    items.length = Math.max(0, Math.min(items.length, perSource - pins.length));
    for (const { f, kw, n, res } of pins) {
      const content = readText(join11(root, f.rel));
      if (!content) continue;
      const lines = content.split(/\r?\n/);
      const anchor = f.fh.lines.find((l) => {
        const full = lines[l.line - 1] ?? l.text;
        return res.some((re) => re.test(full));
      })?.line ?? f.fh.lines[0].line;
      const w = expandWindow(lines, Math.max(1, anchor - 2), Math.min(lines.length, anchor + 4), anchor);
      const url = ref.isLocal ? void 0 : `${ref.webUrl}/blob/${index.commit ?? "HEAD"}/${f.rel}#L${w.start}-L${w.end}`;
      items.push({
        source: "code",
        title: `${f.rel} \u2014 rare-term match (${kw})`,
        ref: f.rel,
        location: `${f.rel}:${w.start}-${w.end}`,
        score: Number(f.score.toFixed(3)),
        snippet: lines.slice(w.start - 1, w.end).join("\n"),
        url,
        meta: { matchedKeywords: [...f.fh.matchedKw], pinnedRareTerm: kw }
      });
      notes.push(`Query term "${kw}" matches only ${n} file(s); pinned ${f.rel} into the results.`);
    }
  }
  return { items, notes, fallback: usedRg ? void 0 : "js-scan" };
}
function excerptWindows(lines, matcher, sym, fh, callLines) {
  let primary;
  if (sym) {
    const w = expandWindow(lines, Math.max(1, sym.line - 1), Math.min(lines.length, sym.line + 18), sym.line);
    primary = { start: w.start, end: w.end, label: `${sym.kind} ${sym.name}` };
  } else if (fh) {
    const region = regionsFor(fh, matcher).sort((a, b) => b.kwCount - a.kwCount || a.start - b.start)[0];
    const w = expandWindow(lines, region.start, region.end, region.anchor);
    primary = { start: w.start, end: w.end, label: "match" };
  } else {
    primary = { start: 1, end: Math.min(lines.length, 20), label: "match" };
  }
  if (!callLines.length) return [primary];
  const sorted = [...new Set(callLines)].sort((a, b) => a - b);
  const regions = mergeLines(sorted, RANKING.CALLSITE_MERGE_GAP);
  const best = regions.map((r) => ({ r, count: sorted.filter((l) => l >= r.start && l <= r.end).length })).sort((a, b) => b.count - a.count || a.r.start - b.r.start)[0].r;
  const gap = best.start > primary.end ? best.start - primary.end : primary.start > best.end ? primary.start - best.end : 0;
  const mergedStart = Math.min(primary.start, best.start);
  const mergedEnd = Math.max(primary.end, best.end);
  if (gap <= RANKING.CALLSITE_MERGE_GAP && mergedEnd - mergedStart + 1 <= MAX_EXCERPT_LINES) {
    const w = expandWindow(lines, mergedStart, mergedEnd, sym?.line ?? best.start);
    return [{ start: w.start, end: w.end, label: primary.label }];
  }
  const cw = expandWindow(lines, best.start, best.end, best.start);
  return [primary, { start: cw.start, end: cw.end, label: "call site", callSite: true }];
}

// src/index/semantic.ts
import { existsSync as existsSync7, readFileSync as readFileSync6, writeFileSync as writeFileSync5, mkdirSync as mkdirSync6 } from "fs";
import { join as join13, dirname as dirname3 } from "path";

// src/sources/fetch.ts
var UA = `ultradoc/${VERSION} (+https://github.com/maxgfr/ultradoc)`;
var RETRY_MAX = 2;
var RETRY_BASE_MS = 500;
var RETRY_AFTER_CAP_MS = 1e4;
var RETRYABLE_STATUS = /* @__PURE__ */ new Set([429, 502, 503, 504]);
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function detectRateLimited(status, headers) {
  if (status === 429) return true;
  return status === 403 && headers.get("x-ratelimit-remaining") === "0";
}
function parseRetryAfter(headers) {
  const h = headers.get("retry-after");
  if (!h) return void 0;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(Math.max(0, secs) * 1e3, RETRY_AFTER_CAP_MS);
  const when = Date.parse(h);
  if (Number.isFinite(when)) return Math.min(Math.max(0, when - Date.now()), RETRY_AFTER_CAP_MS);
  return void 0;
}
async function readCapped(res, max) {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, max).toString("utf8");
  }
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    const remaining = max - total;
    if (chunk.length >= remaining) {
      chunks.push(chunk.subarray(0, remaining));
      await reader.cancel().catch(() => {
      });
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function httpGetOnce(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 2e4);
  const max = opts.maxBytes ?? 4 * 1024 * 1024;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: opts.accept ?? "*/*", ...opts.headers ?? {} }
    });
    const contentType = res.headers.get("content-type") ?? "";
    const rateLimited = detectRateLimited(res.status, res.headers);
    const retryAfterMs = parseRetryAfter(res.headers);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > max) {
      ctrl.abort();
      return { ok: false, status: res.status, body: "", contentType, error: `response too large: ${declared} bytes > ${max} cap`, rateLimited, retryAfterMs };
    }
    const body2 = await readCapped(res, max);
    return { ok: res.ok, status: res.status, body: body2, contentType, rateLimited, retryAfterMs };
  } catch (e) {
    return { ok: false, status: 0, body: "", contentType: "", error: e.message };
  } finally {
    clearTimeout(t);
  }
}
async function httpGet(url, opts = {}) {
  const retries = Math.max(0, Math.min(opts.retries ?? 0, RETRY_MAX));
  let res = await httpGetOnce(url, opts);
  for (let attempt = 0; attempt < retries; attempt++) {
    if (res.ok || res.status === 403) return res;
    if (res.status !== 0 && !RETRYABLE_STATUS.has(res.status)) return res;
    const backoff = Math.min(RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 250), RETRY_AFTER_CAP_MS);
    await sleep(res.retryAfterMs ?? backoff);
    res = await httpGetOnce(url, opts);
  }
  return res;
}
async function httpJson(method, url, body2, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 3e4);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": UA },
      body: body2 === void 0 ? void 0 : JSON.stringify(body2)
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : void 0;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: void 0, error: e.message };
  } finally {
    clearTimeout(t);
  }
}
var ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "\u2014",
  "&ndash;": "\u2013",
  "&hellip;": "\u2026",
  "&copy;": "\xA9"
};
function htmlToText(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|head|nav|footer|svg)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<h([1-6])(?:\s[^>]*)?>/gi, (_m, n) => "\n" + "#".repeat(Number(n)) + " ");
  s = s.replace(/<\/(p|div|section|article|li|tr|h[1-6]|pre|blockquote|br)>/gi, "\n");
  s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&#(\d+);/g, (_m, n) => {
    try {
      return String.fromCodePoint(Number(n));
    } catch {
      return " ";
    }
  });
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).join("\n");
}
async function fetchAndExtract(url) {
  const res = await httpGet(url, { accept: "text/html,text/plain,*/*", retries: 2 });
  if (!res.ok) {
    return { text: "", note: `Could not fetch ${url} (status ${res.status}${res.error ? ", " + res.error : ""}).` };
  }
  const isHtml = /html/i.test(res.contentType) || /^\s*</.test(res.body);
  const text = isHtml ? htmlToText(res.body) : res.body;
  return { text };
}
function nearestHeading(lines, anchor) {
  let heading;
  let inFence = false;
  for (let i2 = 0; i2 <= anchor && i2 < lines.length; i2++) {
    const line = lines[i2];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) heading = m[1].trim();
  }
  return heading;
}
function excerptsFromText(text, url, title, source, question, perSource) {
  const lines = text.split("\n");
  const matcher = buildMatcher(question);
  const hits = [];
  for (let i2 = 0; i2 < lines.length; i2++) {
    const cov = matcher.matchLine(lines[i2]).size;
    if (cov > 0) hits.push({ idx: i2, cov });
  }
  hits.sort((a, b) => b.cov - a.cov || a.idx - b.idx);
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  const take = hits.length ? hits : [{ idx: 0, cov: 0 }];
  const perDoc = Math.min(2, Math.max(1, perSource));
  for (const h of take) {
    if (items.length >= perDoc) break;
    const block = Math.floor(h.idx / 12);
    if (seen.has(block)) continue;
    seen.add(block);
    const start2 = Math.max(0, h.idx - 3);
    const end = Math.min(lines.length, h.idx + 12);
    const snippet = lines.slice(start2, end).join("\n").slice(0, 1500);
    if (!snippet.trim()) continue;
    const heading = nearestHeading(lines, h.idx);
    items.push({
      source,
      title: heading ? `${title} \xA7 ${heading}` : title,
      ref: url,
      location: `${url}#~${start2 + 1}`,
      score: Number((h.cov + 1).toFixed(3)),
      snippet,
      url,
      meta: heading ? { heading } : void 0
    });
  }
  return items;
}

// src/index/compose.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync5, readFileSync as readFileSync5, writeFileSync as writeFileSync4 } from "fs";
import { dirname as dirname2, join as join12 } from "path";
var COMPOSE_YAML = `# Optional, fully-local, no-API-key stack for ultradoc's semantic mode and web
# search. Start it with \`ultradoc semantic up\` (or \`docker compose --profile all
# up -d\`). The published bundle stays dependency-free \u2014 it only speaks HTTP to
# these containers on localhost; nothing here is required for Tier-1 retrieval.
#
# Profiles let you start subsets:
#   --profile semantic  \u2192 qdrant + ollama (vector search)
#   --profile search    \u2192 searxng (web discovery)
#   --profile all       \u2192 everything
name: ultradoc

services:
  # Vector database \u2014 Apache-2.0, self-hosted, no key.
  qdrant:
    image: qdrant/qdrant:latest
    container_name: ultradoc-qdrant
    ports:
      - "6333:6333"
    volumes:
      - ultradoc_qdrant:/qdrant/storage
    restart: unless-stopped
    profiles: ["semantic", "all"]

  # Local embedding server \u2014 no key, no data leaves the machine. Pull the model
  # once: \`docker compose exec ollama ollama pull nomic-embed-text\`
  # (\`ultradoc semantic up\` does this for you).
  ollama:
    image: ollama/ollama:latest
    container_name: ultradoc-ollama
    ports:
      - "11434:11434"
    volumes:
      - ultradoc_ollama:/root/.ollama
    restart: unless-stopped
    profiles: ["semantic", "all"]

  # Self-hosted metasearch for keyless web discovery. JSON output is enabled in
  # docker/searxng/settings.yml so the engine can be queried programmatically.
  searxng:
    image: searxng/searxng:latest
    container_name: ultradoc-searxng
    ports:
      - "8888:8080"
    environment:
      - SEARXNG_BASE_URL=http://localhost:8888/
    volumes:
      - ./docker/searxng:/etc/searxng:rw
    restart: unless-stopped
    profiles: ["search", "all"]

volumes:
  ultradoc_qdrant:
  ultradoc_ollama:
`;
var SEARXNG_SETTINGS_YAML = `# Minimal SearXNG config for ultradoc's keyless web discovery. The important
# bit is enabling the JSON output format so \`ultradoc web\` can query it
# programmatically (\`/search?format=json\`). Change the secret_key for anything
# beyond local use.
use_default_settings: true

server:
  secret_key: "ultradoc-dev-secret-change-me"
  limiter: false
  image_proxy: false

search:
  safe_search: 0
  autocomplete: ""
  formats:
    - html
    - json
`;
function ensureComposeMaterialized() {
  const base = join12(cacheRoot(), "compose");
  const composePath = join12(base, "docker-compose.yml");
  const settingsPath = join12(base, "docker", "searxng", "settings.yml");
  writeIfChanged(composePath, COMPOSE_YAML);
  writeIfChanged(settingsPath, SEARXNG_SETTINGS_YAML);
  return composePath;
}
function writeIfChanged(path, content) {
  try {
    if (existsSync6(path) && readFileSync5(path, "utf8") === content) return;
    mkdirSync5(dirname2(path), { recursive: true });
    writeFileSync4(path, content);
  } catch {
  }
}

// src/index/semantic.ts
var QDRANT = (process.env.ULTRADOC_QDRANT || "http://localhost:6333").replace(/\/$/, "");
var OLLAMA = (process.env.ULTRADOC_OLLAMA || "http://localhost:11434").replace(/\/$/, "");
var EMBED_MODEL = process.env.ULTRADOC_EMBED_MODEL || "nomic-embed-text";
var MAX_CHUNKS = LIMITS.embedChunks;
function chunkText(rel, content, isDoc3, opts = {}) {
  const win = opts.windowLines ?? 60;
  const overlap = opts.overlap ?? 12;
  const maxPerFile = opts.maxPerFile ?? 40;
  const lines = content.split(/\r?\n/);
  const chunks = [];
  const step = Math.max(1, win - overlap);
  for (let i2 = 0; i2 < lines.length && chunks.length < maxPerFile; i2 += step) {
    const slice = lines.slice(i2, i2 + win);
    const text = slice.join("\n").trim();
    if (text.length < 16) continue;
    chunks.push({ rel, start: i2 + 1, end: Math.min(lines.length, i2 + win), text, isDoc: isDoc3 });
  }
  return chunks;
}
function chunkFile(rel, content, isDoc3, symbolLines, opts = {}) {
  const win = opts.windowLines ?? 60;
  const maxPerFile = opts.maxPerFile ?? 40;
  const MIN_LEADING = 5;
  const lines = content.split(/\r?\n/);
  const n = lines.length;
  const starts = [...new Set((symbolLines ?? []).filter((l) => l >= 1 && l <= n))].sort((a, b) => a - b);
  if (isDoc3 || starts.length === 0) return chunkText(rel, content, isDoc3, opts);
  const chunks = [];
  const add = (from, to) => {
    if (chunks.length >= maxPerFile) return;
    const s = Math.max(1, from);
    const e = Math.min(n, to);
    if (e < s) return;
    const text = lines.slice(s - 1, e).join("\n").trim();
    if (text.length < 16) return;
    chunks.push({ rel, start: s, end: e, text, isDoc: isDoc3 });
  };
  if (starts[0] - 1 >= MIN_LEADING) add(1, starts[0] - 1);
  for (let i2 = 0; i2 < starts.length && chunks.length < maxPerFile; i2++) {
    const start2 = starts[i2];
    const nextStart = i2 + 1 < starts.length ? starts[i2 + 1] : n + 1;
    add(start2, Math.min(start2 + win - 1, nextStart - 1));
  }
  return chunks;
}
async function reachable(base, path = "/") {
  const r = await httpGet(base + path, { timeoutMs: 2500 });
  return r.ok;
}
async function embed(text) {
  const r = await httpJson("POST", `${OLLAMA}/api/embeddings`, { model: EMBED_MODEL, prompt: text }, { timeoutMs: 3e4 });
  const v = r.ok ? r.data?.embedding : void 0;
  return Array.isArray(v) && v.length ? v : null;
}
function collectionName(slug) {
  return "ultradoc_" + slug.replace(/[^a-z0-9_]/gi, "_").slice(0, 60);
}
function markerPath(repoDir) {
  return join13(repoDir, ".ultradoc", "semantic.json");
}
async function collectionExists(name2) {
  const r = await httpJson("GET", `${QDRANT}/collections/${name2}`);
  return r.ok && r.data?.result?.status !== void 0;
}
async function buildIfNeeded(ctx) {
  const name2 = collectionName(ctx.repoRef.slug);
  const marker = markerPath(ctx.repoDir);
  const commit = ctx.index.commit ?? "HEAD";
  if (existsSync7(marker)) {
    try {
      const m = JSON.parse(readFileSync6(marker, "utf8"));
      if (m.collection === name2 && m.commit === commit && await collectionExists(name2)) {
        return { name: name2, notes: [] };
      }
    } catch {
    }
  }
  const symbolLines = /* @__PURE__ */ new Map();
  for (const s of ctx.index.symbols) {
    const arr = symbolLines.get(s.file) ?? [];
    arr.push(s.line);
    symbolLines.set(s.file, arr);
  }
  const codeFiles = symbolLines.size ? [...symbolLines.keys()] : [];
  const files = [.../* @__PURE__ */ new Set([...codeFiles, ...ctx.index.docFiles])];
  const chunks = [];
  let capped = false;
  for (const rel of files) {
    if (chunks.length >= MAX_CHUNKS) {
      capped = true;
      break;
    }
    const content = readText(join13(ctx.repoDir, rel));
    if (!content) continue;
    const isDoc3 = ctx.index.docFiles.includes(rel);
    for (const c2 of chunkFile(rel, content, isDoc3, symbolLines.get(rel) ?? [])) {
      chunks.push(c2);
      if (chunks.length >= MAX_CHUNKS) {
        capped = true;
        break;
      }
    }
  }
  if (chunks.length === 0) return { error: "no chunkable content to embed" };
  const vectors = await mapLimit(chunks, LIMITS.embedConcurrency, (c2) => embed(c2.text));
  const dim = vectors.find((v) => Array.isArray(v) && v.length > 0)?.length;
  if (!dim) return { error: `embedding failed (is the '${EMBED_MODEL}' model pulled in Ollama?)` };
  const failed2 = vectors.filter((v) => !v).length;
  await httpJson("DELETE", `${QDRANT}/collections/${name2}`);
  const create = await httpJson("PUT", `${QDRANT}/collections/${name2}`, {
    vectors: { size: dim, distance: "Cosine" }
  });
  if (!create.ok) return { error: `could not create Qdrant collection (${create.status})` };
  let points = [];
  const flush = async () => {
    if (!points.length) return true;
    const up = await httpJson("PUT", `${QDRANT}/collections/${name2}/points?wait=true`, { points });
    points = [];
    return up.ok;
  };
  for (let i2 = 0; i2 < chunks.length; i2++) {
    const vector = vectors[i2];
    if (!vector) continue;
    const c2 = chunks[i2];
    points.push({ id: i2 + 1, vector, payload: { rel: c2.rel, start: c2.start, end: c2.end, isDoc: c2.isDoc, snippet: c2.text.slice(0, 1500) } });
    if (points.length >= 64 && !await flush()) return { error: "failed to upsert vectors to Qdrant" };
  }
  if (!await flush()) return { error: "failed to upsert vectors to Qdrant" };
  const notes = [];
  if (capped) notes.push(`Embedded ${chunks.length} chunks (repo has more) \u2014 raise ULTRADOC_MAX_CHUNKS for fuller semantic coverage.`);
  if (failed2) notes.push(`${failed2} chunk(s) failed to embed \u2014 the semantic index is partial.`);
  const tooHollow = failed2 / chunks.length > 0.2;
  if (!tooHollow) {
    try {
      mkdirSync6(dirname3(marker), { recursive: true });
      writeFileSync5(marker, JSON.stringify({ collection: name2, commit, chunks: chunks.length, dim }));
    } catch {
    }
  }
  return { name: name2, notes };
}
async function semanticSearch(ctx) {
  const fallbackNote = (why) => ({
    available: false,
    items: [],
    notes: [`Semantic mode unavailable (${why}); used Tier-1 lexical + structural search.`]
  });
  if (!await reachable(QDRANT)) return fallbackNote(`Qdrant not reachable at ${QDRANT} \u2014 run \`ultradoc semantic up\``);
  if (!await reachable(OLLAMA, "/api/tags")) return fallbackNote(`Ollama not reachable at ${OLLAMA}`);
  const built = await buildIfNeeded(ctx);
  if ("error" in built) return fallbackNote(built.error);
  const buildNotes = built.notes;
  const qv = await embed(ctx.options.question);
  if (!qv) return fallbackNote("could not embed the question");
  const res = await httpJson("POST", `${QDRANT}/collections/${built.name}/points/search`, {
    vector: qv,
    limit: ctx.options.perSource,
    with_payload: true
  });
  if (!res.ok) return fallbackNote(`Qdrant search failed (${res.status})`);
  const items = (res.data?.result ?? []).map((hit) => {
    const p = hit.payload ?? {};
    const loc = `${p.rel}:${p.start}-${p.end}`;
    return {
      source: "code",
      title: `${p.rel} \u2014 semantic match`,
      ref: p.rel,
      location: loc,
      score: Number((hit.score ?? 0).toFixed(4)),
      snippet: p.snippet ?? "",
      url: ctx.repoRef.isLocal ? void 0 : `${ctx.repoRef.webUrl}/blob/${ctx.index.commit ?? "HEAD"}/${p.rel}#L${p.start}-L${p.end}`,
      meta: { semantic: true }
    };
  });
  return { available: true, items, notes: [`Semantic search via Qdrant + ${EMBED_MODEL} (local).`, ...buildNotes] };
}
function composeFile() {
  return ensureComposeMaterialized();
}
var DEFAULT_DOCKER_PULL_TIMEOUT_MS = 12e5;
function dockerPullTimeoutMs() {
  const raw = Number(process.env.ULTRADOC_DOCKER_PULL_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DOCKER_PULL_TIMEOUT_MS;
}
function semanticControl(action, deps = {}) {
  const run3 = deps.run ?? sh;
  const has = deps.has ?? have;
  if (!["up", "down", "status"].includes(action)) {
    return { message: `ultradoc semantic: unknown action "${action}" (use: up | down | status)`, code: 1 };
  }
  if (!has("docker")) {
    return { message: "ultradoc semantic: docker not found. Install Docker, then retry. See references/semantic-setup.md.", code: 1 };
  }
  const file = composeFile();
  if (action === "down") {
    const r = run3("docker", ["compose", "-f", file, "--profile", "all", "down"], { timeoutMs: 12e4 });
    return { message: r.ok ? "ultradoc semantic: stack stopped." : `ultradoc semantic: down failed.
${r.stderr}`, code: r.ok ? 0 : 1 };
  }
  if (action === "status") {
    const r = run3("docker", ["compose", "-f", file, "ps"], { timeoutMs: 3e4 });
    return { message: r.ok ? r.stdout || "ultradoc semantic: no services running." : `ultradoc semantic: status failed.
${r.stderr}`, code: 0 };
  }
  const imagePull = run3("docker", ["compose", "-f", file, "--profile", "all", "pull"], { timeoutMs: dockerPullTimeoutMs() });
  if (!imagePull.ok) {
    return {
      message: `ultradoc semantic: pulling the stack images failed (large images can be slow \u2014 raise ULTRADOC_DOCKER_PULL_TIMEOUT_MS, currently ${dockerPullTimeoutMs()}ms).
${imagePull.stderr}`,
      code: 1
    };
  }
  const up = run3("docker", ["compose", "-f", file, "--profile", "all", "up", "-d"], { timeoutMs: 3e5 });
  if (!up.ok) return { message: `ultradoc semantic: up failed.
${up.stderr}`, code: 1 };
  const pull = run3("docker", ["compose", "-f", file, "exec", "-T", "ollama", "ollama", "pull", EMBED_MODEL], { timeoutMs: 6e5 });
  const lines = [
    "ultradoc semantic: stack is up (Qdrant :6333 \xB7 Ollama :11434 \xB7 SearXNG :8888).",
    pull.ok ? `  model:  ${EMBED_MODEL} ready` : `  model:  pull '${EMBED_MODEL}' yourself: docker compose -f ${file} exec ollama ollama pull ${EMBED_MODEL}`,
    '  use:    ultradoc ask --repo <url> --q "..." --semantic'
  ];
  return { message: lines.join("\n"), code: 0 };
}

// src/sources/code.ts
function indexCoverageNotes(index) {
  const notes = [];
  if (index.stats?.truncated) {
    notes.push(`Index capped at ${LIMITS.maxFiles} files \u2014 some of this repo was not indexed. Raise ULTRADOC_MAX_FILES for full coverage.`);
  }
  if (index.stats?.symbolCapHits) {
    notes.push(
      `${index.stats.symbolCapHits} file(s) hit the ${LIMITS.symbolsPerFile}-symbol cap. Raise ULTRADOC_MAX_SYMBOLS_PER_FILE if a symbol seems missing.`
    );
  }
  return notes;
}
async function codeSource(ctx) {
  const lexical = searchCode(ctx.repoDir, ctx.repoRef, ctx.index, ctx.options.question, ctx.options.perSource, ctx.scopeDir);
  const coverage2 = indexCoverageNotes(ctx.index);
  const fallbacks = [];
  if (lexical.fallback === "js-scan") {
    fallbacks.push("code: ripgrep missing \u2014 used the built-in JS scanner");
  }
  if (!ctx.options.semantic) {
    return { source: "code", items: lexical.items, notes: [...coverage2, ...lexical.notes], fallbacks };
  }
  const sem = await semanticSearch(ctx);
  if (ctx.scopeDir) sem.items = sem.items.filter((it) => it.ref.startsWith(ctx.scopeDir + "/"));
  if (!sem.available) {
    fallbacks.push("code: semantic backend unavailable \u2014 lexical only");
    return {
      source: "code",
      items: lexical.items,
      notes: [...coverage2, ...lexical.notes, ...sem.notes],
      fallbacks
    };
  }
  const byKey2 = /* @__PURE__ */ new Map();
  for (const it of [...lexical.items, ...sem.items]) {
    const key = it.ref + "@" + (it.location ?? "");
    if (!byKey2.has(key)) byKey2.set(key, it);
  }
  const fused = rrf([lexical.items, sem.items], (it) => it.ref + "@" + (it.location ?? ""));
  const ranked = [...byKey2.values()].map((it) => ({ it, s: fused.get(it.ref + "@" + (it.location ?? "")) ?? 0 })).sort((a, b) => b.s - a.s).slice(0, ctx.options.perSource).map(({ it, s }) => ({ ...it, score: Number(s.toFixed(4)) }));
  return {
    source: "code",
    items: ranked,
    notes: [...coverage2, ...lexical.notes, ...sem.notes, "Fused lexical + semantic results (RRF)."],
    fallbacks
  };
}

// src/sources/docs.ts
import { join as join14 } from "path";
import { existsSync as existsSync8, readFileSync as readFileSync7, statSync as statSync5, writeFileSync as writeFileSync6, mkdirSync as mkdirSync7 } from "fs";
var DOCS_ENTRY_BOOST = 1.2;
var DOCS_ROOT_BOOST = 1.5;
function extdocsTtlMs() {
  return envInt("ULTRADOC_EXTDOCS_TTL_HOURS", 168) * 36e5;
}
async function getDocText(repoDir, url) {
  const dir = join14(repoDir, ".ultradoc", "extdocs");
  const file = join14(dir, url.replace(/[^a-z0-9]+/gi, "_").slice(0, 100) + ".v2.txt");
  let cached;
  let fresh = false;
  try {
    if (existsSync8(file)) {
      cached = readFileSync7(file, "utf8");
      fresh = Date.now() - statSync5(file).mtimeMs < extdocsTtlMs();
    }
  } catch {
  }
  if (cached !== void 0 && fresh) return { text: cached };
  const res = await fetchAndExtract(url);
  if (res.text) {
    try {
      mkdirSync7(dir, { recursive: true });
      writeFileSync6(file, res.text);
    } catch {
    }
    return res;
  }
  if (cached !== void 0) return { text: cached, note: `served a stale cached copy of ${url} (refetch failed)` };
  return res;
}
async function docsSource(ctx) {
  const notes = [];
  const matcher = buildMatcher(ctx.options.question);
  const items = [];
  const scored = [];
  for (const rel of ctx.index.docFiles) {
    if (ctx.scopeDir && !rel.startsWith(ctx.scopeDir + "/")) continue;
    if (/(^|\/)(tests?|__tests__|spec|specs|fixtures?|examples?|vendor|node_modules|third[-_]?party|deps?|bower_components)\//i.test(rel)) continue;
    const content = readText(join14(ctx.repoDir, rel));
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    let bestLine = -1;
    let bestHits = 0;
    const covered = /* @__PURE__ */ new Set();
    for (let i2 = 0; i2 < lines.length; i2++) {
      const here = matcher.matchLine(lines[i2]);
      for (const c2 of here) covered.add(c2);
      if (here.size > bestHits) {
        bestHits = here.size;
        bestLine = i2;
      }
    }
    if (covered.size === 0) continue;
    const inDocsRoot = ctx.index.docsRoot ? rel.startsWith(ctx.index.docsRoot + "/") : false;
    const boost = (/readme|getting|guide|usage|tutorial/i.test(rel) ? DOCS_ENTRY_BOOST : 1) * (inDocsRoot ? DOCS_ROOT_BOOST : 1);
    scored.push({ rel, score: covered.size * 3 * boost + bestHits * 0.5, anchor: bestLine, lines });
  }
  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
  for (const d of scored.slice(0, ctx.options.perSource)) {
    const start2 = Math.max(0, d.anchor - 4);
    const end = Math.min(d.lines.length, d.anchor + 14);
    const heading = /\.(md|mdx)$/i.test(d.rel) ? nearestHeading(d.lines, d.anchor) : void 0;
    items.push({
      source: "docs",
      title: heading ? `${d.rel} \xA7 ${heading} (in-repo docs)` : `${d.rel} (in-repo docs)`,
      ref: d.rel,
      location: `${d.rel}:${start2 + 1}-${end}`,
      score: Number(d.score.toFixed(3)),
      snippet: d.lines.slice(start2, end).join("\n"),
      url: ctx.repoRef.isLocal ? void 0 : `${ctx.repoRef.webUrl}/blob/${ctx.index.commit ?? "HEAD"}/${d.rel}`,
      meta: heading ? { heading } : void 0
    });
  }
  const docsUrl = ctx.options.docsUrl ?? ctx.index.docsUrl;
  if (docsUrl) {
    const discovered = !ctx.options.docsUrl;
    const { text, note } = await getDocText(ctx.repoDir, docsUrl);
    if (note) notes.push(note);
    if (text) {
      const label = discovered ? `Official docs (auto-discovered) \u2014 ${docsUrl}` : `Official docs \u2014 ${docsUrl}`;
      const ext = excerptsFromText(text, docsUrl, label, "docs", ctx.options.question, ctx.options.perSource);
      items.push(...ext);
      if (discovered) notes.push(`Auto-discovered official docs from the repo: ${docsUrl}`);
      if (ext.length === 0) notes.push("Fetched the docs URL but found no keyword matches in it.");
    }
  }
  if (items.length === 0) notes.push("No in-repo documentation matched the question's keywords.");
  return { source: "docs", items, notes };
}

// src/sources/releases.ts
import { join as join15 } from "path";

// src/providers/shared.ts
function ghAuthHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}
function gitlabAuthHeaders() {
  const token = process.env.GITLAB_TOKEN?.trim();
  return token ? { "private-token": token } : {};
}
function rerank(items, ranked) {
  const terms = ranked.map((t) => t.toLowerCase());
  const coverage2 = (it) => {
    const hay = `${it.title} ${it.snippet}`.toLowerCase();
    let c2 = 0;
    for (const t of terms) if (hay.includes(t)) c2++;
    return c2;
  };
  return items.map((it) => ({ it, c: coverage2(it), s: it.score })).sort((a, b) => b.c - a.c || b.s - a.s).map((x) => x.it);
}
function uniqueAttempts(lists) {
  const seen = /* @__PURE__ */ new Set();
  const out2 = [];
  for (const l of lists) {
    const key = l.join(" ");
    if (l.length && !seen.has(key)) {
      seen.add(key);
      out2.push(l);
    }
  }
  return out2;
}
function withRankScores(items) {
  return items.map((it, i2) => ({ ...it, score: items.length - i2 }));
}

// src/sources/releases.ts
var CHANGELOG_RE = /(^|\/)(changelog|changes|history|news|releases?)(\.[a-z0-9]+)?$/i;
var VERSION_HEADING_RE = /^(#{1,4}\s*\[?v?\d+\.\d+|v?\d+\.\d+(\.\d+)?\s*[/(—-])/;
function changelogSections(file, content) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let cur;
  for (let i2 = 0; i2 < lines.length; i2++) {
    const line = lines[i2];
    if (VERSION_HEADING_RE.test(line)) {
      if (cur) sections.push(cur);
      const version = /v?(\d+\.\d+[^\s\])/(—-]*)/.exec(line)?.[1] ?? line.trim().slice(0, 20);
      cur = { file, version, start: i2 + 1, lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) sections.push(cur);
  return sections;
}
function coverage(text, kws) {
  const low = text.toLowerCase();
  let c2 = 0;
  for (const kw of kws) if (low.includes(kw)) c2++;
  return c2;
}
async function githubReleases(ctx, kws) {
  const ref = ctx.repoRef;
  const notes = [];
  if (!/github/i.test(ref.host) || !ref.owner || !ref.repo) {
    notes.push("Releases API: only GitHub is supported keylessly; used the changelog only.");
    return { items: [], notes };
  }
  let body2;
  const perPage = LIMITS.releasesFetched;
  if (have("gh")) {
    const res = sh("gh", ["api", `repos/${ref.owner}/${ref.repo}/releases?per_page=${perPage}`]);
    if (res.ok) body2 = res.stdout;
  }
  if (!body2) {
    const r = await httpGet(`https://api.github.com/repos/${ref.owner}/${ref.repo}/releases?per_page=${perPage}`, {
      accept: "application/vnd.github+json",
      headers: ghAuthHeaders(),
      retries: 2
    });
    if (!r.ok) {
      notes.push(`GitHub releases API unavailable (status ${r.status}); used the changelog only.`);
      return { items: [], notes };
    }
    body2 = r.body;
  }
  let releases;
  try {
    releases = JSON.parse(body2);
  } catch {
    notes.push("GitHub releases API returned an unparseable response.");
    return { items: [], notes };
  }
  if (!Array.isArray(releases) || releases.length === 0) {
    notes.push("The repo has no GitHub releases; used the changelog only.");
    return { items: [], notes };
  }
  if (releases.length >= perPage) {
    notes.push(
      `Checked the ${perPage} most recent GitHub releases only \u2014 a feature added in an older release may be missed here (the changelog half still covers it). Raise ULTRADOC_MAX_RELEASES.`
    );
  }
  const items = githubReleaseItems(releases, kws);
  if (items.length === 0) notes.push("No GitHub release notes matched the question's keywords.");
  return { items, notes };
}
function githubReleaseItems(releases, kws) {
  const items = [];
  for (const rel of releases ?? []) {
    const text = `${rel.name ?? ""}
${rel.body ?? ""}`;
    const cov = coverage(text, kws);
    if (cov === 0) continue;
    const tag = String(rel.tag_name ?? rel.name ?? "");
    items.push({
      source: "release",
      title: `Release ${rel.name || tag}${rel.published_at ? ` (${String(rel.published_at).slice(0, 10)})` : ""}`,
      ref: `release:${tag}`,
      location: rel.html_url,
      score: cov * 3,
      snippet: String(rel.body ?? "(no release notes)").replace(/\r/g, "").trim().slice(0, 1200),
      url: rel.html_url,
      meta: { tag, publishedAt: rel.published_at }
    });
  }
  return items;
}
async function releasesSource(ctx) {
  const notes = [];
  const kws = keywords(ctx.options.question).map((k) => k.toLowerCase());
  const items = [];
  const changelogs = ctx.index.docFiles.filter(
    (rel) => CHANGELOG_RE.test(rel) && (!ctx.scopeDir || rel.startsWith(ctx.scopeDir + "/")) && !/(^|\/)(node_modules|vendor|fixtures?)\//i.test(rel)
  );
  for (const rel of changelogs) {
    const content = readText(join15(ctx.repoDir, rel));
    if (!content) continue;
    const scored = changelogSections(rel, content).map((s) => ({ s, cov: coverage(s.lines.join("\n"), kws) })).filter((x) => x.cov > 0).sort((a, b) => b.cov - a.cov);
    for (const { s, cov } of scored.slice(0, ctx.options.perSource)) {
      const end = s.start + Math.min(s.lines.length, 30) - 1;
      items.push({
        source: "release",
        title: `${rel} \u2014 version ${s.version}`,
        ref: `release:${s.version}`,
        location: `${rel}:${s.start}-${s.start + s.lines.length - 1}`,
        score: cov * 3,
        snippet: s.lines.slice(0, 30).join("\n"),
        url: ctx.repoRef.isLocal ? void 0 : `${ctx.repoRef.webUrl}/blob/${ctx.index.commit ?? "HEAD"}/${rel}#L${s.start}-L${end}`
      });
    }
  }
  if (changelogs.length === 0) notes.push("No changelog file found in the repo.");
  else if (items.length === 0) notes.push("No changelog section matched the question's keywords.");
  if (!ctx.repoRef.isLocal) {
    const gh = await githubReleases(ctx, kws);
    items.push(...gh.items);
    notes.push(...gh.notes);
  }
  return { source: "release", items, notes };
}

// src/sources/history.ts
function looksLikeIdentifier(kw) {
  return /[A-Z_.]/.test(kw.slice(1)) || /^[a-z]+[A-Z]/.test(kw);
}
async function historySource(ctx) {
  const notes = [];
  const depth = ensureHistoryDepth(ctx.repoDir);
  if (depth.note) notes.push(depth.note);
  if (!depth.ok && /not a git/i.test(depth.note ?? "")) {
    return { source: "history", items: [], notes };
  }
  const ranked = rankedKeywords(ctx.options.question).slice(0, 3);
  if (ranked.length === 0) {
    return { source: "history", items: [], notes: [...notes, "No keywords to search the history for."] };
  }
  const hits = /* @__PURE__ */ new Map();
  for (const kw of ranked) {
    const pickaxe = looksLikeIdentifier(kw) ? `-G${kw}` : `-S${kw}`;
    const res = sh(
      "git",
      [
        "-C",
        ctx.repoDir,
        "log",
        pickaxe,
        "--format=%h%x09%ad%x09%an%x09%s",
        "--date=short",
        "--max-count=5",
        "--no-merges",
        ...ctx.scopeDir ? ["--", ctx.scopeDir] : []
      ],
      { timeoutMs: 12e4 }
    );
    if (!res.ok) {
      notes.push(`git log ${pickaxe.slice(0, 2)} "${kw}" failed or timed out.`);
      continue;
    }
    for (const line of res.stdout.split("\n")) {
      if (!line.trim()) continue;
      const [sha, date, author, ...rest] = line.split("	");
      if (!sha || !date) continue;
      const hit = hits.get(sha) ?? { sha, date, author: author ?? "?", subject: rest.join("	"), kws: /* @__PURE__ */ new Set() };
      hit.kws.add(kw);
      hits.set(sha, hit);
    }
  }
  const top = [...hits.values()].sort((a, b) => b.kws.size - a.kws.size || b.date.localeCompare(a.date)).slice(0, ctx.options.perSource);
  const items = [];
  for (const c2 of top) {
    const show = sh("git", ["-C", ctx.repoDir, "show", "--stat", "-s", "--format=%B", c2.sha], {
      timeoutMs: 3e4
    });
    const body2 = show.ok ? show.stdout.replace(/\r/g, "").trim().slice(0, 1200) : c2.subject;
    items.push({
      source: "history",
      title: `${c2.sha} ${c2.subject} (${c2.date})`,
      ref: `commit:${c2.sha}`,
      location: c2.sha,
      score: c2.kws.size * 3,
      snippet: `${c2.date} \xB7 ${c2.author} \xB7 matched: ${[...c2.kws].join(", ")}

${body2}`,
      url: ctx.repoRef.isLocal ? void 0 : `${ctx.repoRef.webUrl}/commit/${c2.sha}`,
      meta: { sha: c2.sha, date: c2.date, matchedKeywords: [...c2.kws] }
    });
  }
  if (items.length === 0) notes.push("No commit history matched the question's keywords.");
  return { source: "history", items, notes };
}

// src/providers/github.ts
function toItems(raw, kind) {
  return (raw ?? []).map((it) => {
    const body2 = String(it.body ?? "").replace(/\r/g, "").trim().slice(0, 1200);
    const labels = (it.labels ?? []).map((l) => typeof l === "string" ? l : l.name).filter(Boolean).join(", ");
    const state = it.draft ? "draft" : it.state;
    return {
      source: kind,
      title: `#${it.number} ${it.title} [${state}]`,
      ref: `${kind}#${it.number}`,
      location: it.html_url,
      score: Number(it.score ?? 0),
      snippet: `state: ${state}` + (labels ? ` \xB7 labels: ${labels}` : "") + ` \xB7 comments: ${it.comments ?? 0} \xB7 updated: ${it.updated_at ?? "?"}

` + (body2 || "(no description)"),
      url: it.html_url,
      meta: { number: it.number, state, isPR: !!it.pull_request }
    };
  });
}
async function query(ref, terms, kind, perSource) {
  const q = `repo:${ref.owner}/${ref.repo} type:${kind} ${terms.join(" ")}`.trim();
  if (have("gh")) {
    const res = sh("gh", ["api", "-X", "GET", "search/issues", "-f", `q=${q}`, "-f", `per_page=${perSource}`, "-f", "sort=updated", "-f", "order=desc"]);
    if (res.ok) {
      try {
        return { items: toItems(JSON.parse(res.stdout).items, kind) };
      } catch {
      }
    }
  }
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=${perSource}&sort=updated&order=desc`;
  const r = await httpGet(url, { accept: "application/vnd.github+json", headers: ghAuthHeaders(), retries: 2 });
  if (!r.ok) {
    const hint = r.rateLimited ? `GitHub search rate-limited (keyless ~10/min). Set GITHUB_TOKEN, run \`gh auth login\`, or retry in ~60s.` : `GitHub ${kind} search unavailable (status ${r.status}). Run \`gh auth login\` for higher-rate access.`;
    return { items: [], error: hint, rateLimited: r.rateLimited };
  }
  try {
    return { items: toItems(JSON.parse(r.body).items, kind) };
  } catch {
    return { items: [], error: `GitHub ${kind} search returned an unparseable response.` };
  }
}
var github = {
  name: "github",
  matches: (host) => /(^|\.)github\.com$/i.test(host) || /github/i.test(host),
  async search(ref, question, kind, perSource) {
    if (!ref.owner || !ref.repo) {
      return { items: [], notes: ["No owner/repo resolved; cannot query GitHub issues/PRs."] };
    }
    const ranked = rankedKeywords(question);
    if (ranked.length === 0) return { items: [], notes: [`No keywords to search ${kind}s.`] };
    let lastError;
    for (const terms of uniqueAttempts([ranked.slice(0, 3), ranked.slice(0, 2)])) {
      const { items, error, rateLimited } = await query(ref, terms, kind, perSource * 2);
      if (error) lastError = error;
      if (items.length) return { items: rerank(items, ranked).slice(0, perSource), notes: [] };
      if (rateLimited) return { items: [], notes: [error] };
    }
    const seen = /* @__PURE__ */ new Map();
    for (const t of ranked.slice(0, 3)) {
      const { items, error, rateLimited } = await query(ref, [t], kind, perSource * 2);
      if (error) lastError = error;
      for (const it of items) if (!seen.has(it.ref)) seen.set(it.ref, it);
      if (rateLimited) break;
    }
    const merged = rerank([...seen.values()], ranked).slice(0, perSource);
    if (merged.length) return { items: merged, notes: [] };
    return { items: [], notes: lastError ? [lastError] : [`No ${kind}s matched the question.`] };
  }
};

// src/providers/gitlab.ts
async function query2(ref, terms, kind, perSource) {
  const proj = encodeURIComponent(`${ref.owner}/${ref.repo}`);
  const path = kind === "issue" ? "issues" : "merge_requests";
  const search2 = encodeURIComponent(terms.join(" "));
  const url = `https://${ref.host}/api/v4/projects/${proj}/${path}?search=${search2}&per_page=${perSource}&order_by=updated_at&sort=desc`;
  const r = await httpGet(url, { accept: "application/json", headers: gitlabAuthHeaders(), retries: 2 });
  if (!r.ok) return { items: [], error: `GitLab ${kind} search unavailable (status ${r.status}).` };
  try {
    const arr = JSON.parse(r.body);
    if (!Array.isArray(arr)) return { items: [], error: `GitLab ${kind} search returned no array.` };
    const marker = kind === "issue" ? "#" : "!";
    const items = arr.map((it) => {
      const num = it.iid ?? it.id;
      const body2 = String(it.description ?? "").replace(/\r/g, "").trim().slice(0, 1200);
      return {
        source: kind,
        title: `${marker}${num} ${it.title} [${it.state}]`,
        ref: `${kind}#${num}`,
        location: it.web_url,
        score: 0,
        // GitLab exposes no relevance score; withRankScores sets it
        snippet: `state: ${it.state} \xB7 updated: ${it.updated_at ?? "?"}

${body2 || "(no description)"}`,
        url: it.web_url,
        meta: { iid: num, state: it.state }
      };
    });
    return { items };
  } catch {
    return { items: [], error: `GitLab ${kind} search returned an unparseable response.` };
  }
}
var gitlab = {
  name: "gitlab",
  matches: (host) => /gitlab/i.test(host),
  async search(ref, question, kind, perSource) {
    if (!ref.owner || !ref.repo) {
      return { items: [], notes: ["No project path resolved; cannot query GitLab issues/MRs."] };
    }
    const ranked = rankedKeywords(question);
    if (ranked.length === 0) return { items: [], notes: [`No keywords to search ${kind}s.`] };
    let lastError;
    for (const terms of uniqueAttempts([ranked.slice(0, 3), ranked.slice(0, 2)])) {
      const { items, error } = await query2(ref, terms, kind, perSource * 2);
      if (error) lastError = error;
      if (items.length) return { items: withRankScores(rerank(items, ranked)).slice(0, perSource), notes: [] };
    }
    const seen = /* @__PURE__ */ new Map();
    for (const t of ranked.slice(0, 2)) {
      const { items, error } = await query2(ref, [t], kind, perSource * 2);
      if (error) lastError = error;
      for (const it of items) if (!seen.has(it.ref)) seen.set(it.ref, it);
    }
    const merged = withRankScores(rerank([...seen.values()], ranked)).slice(0, perSource);
    if (merged.length) return { items: merged, notes: [] };
    return { items: [], notes: lastError ? [lastError] : [`No ${kind}s matched the question.`] };
  }
};

// src/providers/gitea.ts
function toItems2(arr, kind) {
  const marker = kind === "issue" ? "#" : "!";
  return (arr ?? []).map((it) => {
    const num = it.number;
    const labels = (it.labels ?? []).map((l) => typeof l === "string" ? l : l.name).filter(Boolean).join(", ");
    const body2 = String(it.body ?? "").replace(/\r/g, "").trim().slice(0, 1200);
    return {
      source: kind,
      title: `${marker}${num} ${it.title} [${it.state}]`,
      ref: `${kind}#${num}`,
      location: it.html_url,
      score: 0,
      // Gitea exposes no relevance score; withRankScores sets it
      snippet: `state: ${it.state}${labels ? ` \xB7 labels: ${labels}` : ""} \xB7 updated: ${it.updated_at ?? "?"}

${body2 || "(no description)"}`,
      url: it.html_url,
      meta: { number: num, state: it.state }
    };
  });
}
async function query3(ref, terms, kind, perSource) {
  const type = kind === "issue" ? "issues" : "pulls";
  const q = encodeURIComponent(terms.join(" "));
  const url = `https://${ref.host}/api/v1/repos/${ref.owner}/${ref.repo}/issues?q=${q}&type=${type}&state=all&limit=${perSource}`;
  const r = await httpGet(url, { accept: "application/json", retries: 2 });
  if (!r.ok) return { items: [], error: `Gitea ${kind} search unavailable (status ${r.status}).` };
  try {
    const arr = JSON.parse(r.body);
    if (!Array.isArray(arr)) return { items: [], error: `Gitea ${kind} search returned no array.` };
    return { items: toItems2(arr, kind) };
  } catch {
    return { items: [], error: `Gitea ${kind} search returned an unparseable response.` };
  }
}
var gitea = {
  name: "gitea",
  matches: (host) => /(^|\.)codeberg\.org$/i.test(host) || /gitea|forgejo/i.test(host),
  async search(ref, question, kind, perSource) {
    if (!ref.owner || !ref.repo) {
      return { items: [], notes: ["No owner/repo resolved; cannot query Gitea issues/PRs."] };
    }
    const ranked = rankedKeywords(question);
    if (ranked.length === 0) return { items: [], notes: [`No keywords to search ${kind}s.`] };
    let lastError;
    for (const terms of uniqueAttempts([ranked.slice(0, 3), ranked.slice(0, 2)])) {
      const { items, error } = await query3(ref, terms, kind, perSource * 2);
      if (error) lastError = error;
      if (items.length) return { items: withRankScores(rerank(items, ranked)).slice(0, perSource), notes: [] };
    }
    const seen = /* @__PURE__ */ new Map();
    for (const t of ranked.slice(0, 2)) {
      const { items, error } = await query3(ref, [t], kind, perSource * 2);
      if (error) lastError = error;
      for (const it of items) if (!seen.has(it.ref)) seen.set(it.ref, it);
    }
    const merged = withRankScores(rerank([...seen.values()], ranked)).slice(0, perSource);
    if (merged.length) return { items: merged, notes: [] };
    return { items: [], notes: lastError ? [lastError] : [`No ${kind}s matched the question.`] };
  }
};

// src/providers/generic.ts
var generic = {
  name: "generic",
  matches: () => true,
  async search(ref, _question, kind) {
    return {
      items: [],
      notes: [
        `No public ${kind} API for host "${ref.host}". The code was cloned and indexed; issues/PRs are not retrievable for this host (a self-hosted Gitea/Forgejo is auto-detected when its domain contains 'gitea'/'forgejo').`
      ]
    };
  }
};

// src/providers/registry.ts
var PROVIDERS = [github, gitlab, gitea];
function providerFor(host) {
  return PROVIDERS.find((p) => p.matches(host)) ?? generic;
}

// src/sources/issues.ts
function remoteRef(ctx) {
  if (!ctx.repoRef.isLocal && ctx.repoRef.owner && ctx.repoRef.repo) return ctx.repoRef;
  const origin = originUrl(ctx.repoDir);
  if (origin) {
    const r = resolveRepo(origin);
    if (r.owner && r.repo) return r;
  }
  return ctx.repoRef;
}
async function issuesSource(ctx) {
  const ref = remoteRef(ctx);
  if (!ref.owner || !ref.repo) {
    return { source: "issue", items: [], notes: ["No remote resolved; cannot search issues for this repo."] };
  }
  const provider = providerFor(ref.host);
  const { items, notes } = await provider.search(ref, ctx.options.question, "issue", ctx.options.perSource);
  return { source: "issue", items, notes };
}
async function prsSource(ctx) {
  const ref = remoteRef(ctx);
  if (!ref.owner || !ref.repo) {
    return { source: "pr", items: [], notes: ["No remote resolved; cannot search PRs for this repo."] };
  }
  const provider = providerFor(ref.host);
  const { items, notes } = await provider.search(ref, ctx.options.question, "pr", ctx.options.perSource);
  return { source: "pr", items, notes };
}

// src/sources/discussions.ts
var QUERY = `query($q: String!, $n: Int!) {
  search(query: $q, type: DISCUSSION, first: $n) {
    nodes {
      ... on Discussion {
        number title url bodyText updatedAt
        category { name }
        answer { bodyText }
      }
    }
  }
}`;
function discussionItems(nodes) {
  const items = [];
  for (const d of nodes ?? []) {
    if (!d || typeof d.number !== "number") continue;
    const body2 = String(d.bodyText ?? "").replace(/\r/g, "").trim().slice(0, 800);
    const answer = String(d.answer?.bodyText ?? "").replace(/\r/g, "").trim().slice(0, 600);
    items.push({
      source: "discussion",
      title: `#${d.number} ${d.title}${d.category?.name ? ` [${d.category.name}]` : ""}`,
      ref: `discussion#${d.number}`,
      location: d.url,
      score: 0,
      // reranked by keyword coverage below
      snippet: `updated: ${d.updatedAt ?? "?"}

${body2 || "(no description)"}` + (answer ? `

--- accepted answer ---
${answer}` : ""),
      url: d.url,
      meta: { number: d.number, category: d.category?.name, answered: !!d.answer }
    });
  }
  return items;
}
function search(owner, repo, terms, n) {
  const res = sh("gh", ["api", "graphql", "-f", `query=${QUERY}`, "-f", `q=repo:${owner}/${repo} ${terms.join(" ")}`, "-F", `n=${n}`]);
  if (!res.ok) return void 0;
  try {
    return discussionItems(JSON.parse(res.stdout)?.data?.search?.nodes ?? []);
  } catch {
    return void 0;
  }
}
async function discussionsSource(ctx) {
  const ref = ctx.repoRef;
  if (!/github/i.test(ref.host) || !ref.owner || !ref.repo) {
    return {
      source: "discussion",
      items: [],
      notes: ["Discussions are only available for GitHub repos (none resolved here)."]
    };
  }
  if (!have("gh")) {
    return {
      source: "discussion",
      items: [],
      notes: ["GitHub Discussions need the gh CLI (the GraphQL API has no keyless access); skipped. Run `gh auth login` to enable."]
    };
  }
  const ranked = rankedKeywords(ctx.options.question);
  if (ranked.length === 0) {
    return { source: "discussion", items: [], notes: ["No keywords to search discussions."] };
  }
  const per = ctx.options.perSource;
  for (const terms of [ranked.slice(0, 3), ranked.slice(0, 2)]) {
    if (terms.length === 0) continue;
    const items = search(ref.owner, ref.repo, terms, per * 2);
    if (items === void 0) {
      return { source: "discussion", items: [], notes: ["GitHub Discussions search failed (gh api graphql)."] };
    }
    if (items.length) {
      return { source: "discussion", items: withRankScores(rerank(items, ranked).slice(0, per)), notes: [] };
    }
  }
  const seen = /* @__PURE__ */ new Map();
  for (const t of ranked.slice(0, 3)) {
    const items = search(ref.owner, ref.repo, [t], per * 2) ?? [];
    for (const it of items) if (!seen.has(it.ref)) seen.set(it.ref, it);
  }
  const merged = withRankScores(rerank([...seen.values()], ranked).slice(0, per));
  return {
    source: "discussion",
    items: merged,
    notes: merged.length ? [] : ["No discussions matched the question (or the repo has none)."]
  };
}

// src/sources/stackoverflow.ts
async function stackoverflowSource(ctx) {
  const kws = rankedKeywords(ctx.options.question).slice(0, 5).join(" ");
  if (!kws) return { source: "so", items: [], notes: ["No keywords to search StackOverflow."] };
  const q = encodeURIComponent(kws);
  const pat = process.env.STACK_PAT ? `&access_token=${process.env.STACK_PAT}` : "";
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${q}&site=stackoverflow&filter=withbody&pagesize=${ctx.options.perSource}${pat}`;
  const r = await httpGet(url, { accept: "application/json", retries: 2 });
  if (!r.ok) {
    return { source: "so", items: [], notes: [`StackOverflow search unavailable (status ${r.status}).`] };
  }
  try {
    const data = JSON.parse(r.body);
    const items = soItems(data);
    const notes = data.quota_remaining !== void 0 && data.quota_remaining < 20 ? [`StackExchange anonymous quota low (${data.quota_remaining} left).`] : [];
    if (items.length === 0) notes.push("No StackOverflow questions matched.");
    return { source: "so", items, notes };
  } catch {
    return { source: "so", items: [], notes: ["StackOverflow search returned an unparseable response."] };
  }
}
function soItems(data) {
  return (data.items ?? []).map((it) => {
    const body2 = htmlToText(String(it.body ?? "")).slice(0, 1200);
    const accepted = it.is_answered ? "answered" : "unanswered";
    return {
      source: "so",
      // htmlToText keeps headings as markdown "#" markers — strip them from
      // one-line titles where they'd just be noise.
      title: htmlToText(String(it.title ?? "(question)")).replace(/^#{1,6}\s+/, "").slice(0, 160),
      ref: `so:${it.question_id}`,
      location: it.link,
      score: Number(it.score ?? 0),
      snippet: `score: ${it.score ?? 0} \xB7 ${accepted} \xB7 answers: ${it.answer_count ?? 0}` + (it.tags?.length ? ` \xB7 tags: ${it.tags.slice(0, 6).join(", ")}` : "") + `

${body2 || "(no body)"}`,
      url: it.link,
      meta: { questionId: it.question_id, isAnswered: it.is_answered, answerCount: it.answer_count }
    };
  });
}

// src/sources/web.ts
var SEARXNG_BASE = process.env.ULTRADOC_SEARXNG || "http://localhost:8888";
async function viaSearxng(query4, n) {
  const url = `${SEARXNG_BASE.replace(/\/$/, "")}/search?q=${encodeURIComponent(query4)}&format=json`;
  const r = await httpGet(url, { accept: "application/json", timeoutMs: 8e3 });
  if (!r.ok) return null;
  try {
    const data = JSON.parse(r.body);
    const urls = (data.results ?? []).map((x) => x.url).filter(Boolean);
    return urls.slice(0, n);
  } catch {
    return null;
  }
}
function parseDuckDuckGoResults(html, n) {
  const urls = [];
  const tagRe = /<a\b[^>]*\bresult__a\b[^>]*>/g;
  let m;
  while ((m = tagRe.exec(html)) && urls.length < n) {
    const href0 = /\bhref="([^"]+)"/.exec(m[0]);
    if (!href0) continue;
    let href = href0[1];
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) {
      try {
        href = decodeURIComponent(uddg[1]);
      } catch {
      }
    }
    if (/^https?:\/\//.test(href) && !/duckduckgo\.com/.test(href)) urls.push(href);
  }
  return urls;
}
async function viaDuckDuckGo(query4, n) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query4)}`;
  const r = await httpGet(url, { accept: "text/html", timeoutMs: 12e3, retries: 2 });
  if (!r.ok || !r.body) return null;
  const urls = parseDuckDuckGoResults(r.body, n);
  return urls.length ? urls : null;
}
async function discover(query4, engine, n) {
  const notes = [];
  if (engine === "searxng" || engine === "auto") {
    const s = await viaSearxng(query4, n);
    if (s?.length) return { urls: s, via: "searxng", notes };
    if (engine === "searxng") notes.push(`SearXNG unreachable at ${SEARXNG_BASE}. Run \`ultradoc semantic up\`.`);
  }
  if (engine === "ddg" || engine === "auto") {
    const d = await viaDuckDuckGo(query4, n);
    if (d?.length) return { urls: d, via: "duckduckgo", notes };
    if (engine === "ddg") notes.push("DuckDuckGo returned no results.");
  }
  if (engine === "claude" || engine === "auto") {
    notes.push(
      "No keyless engine returned results. Use your built-in WebSearch to find URLs, then ground them with `ultradoc web --repo <repo> --url <url>`."
    );
  }
  return { urls: [], via: "none", notes };
}
async function webFetchUrls(urls, question, perSource) {
  const items = [];
  const notes = [];
  for (const url of urls.slice(0, Math.max(1, Math.ceil(perSource / 2)))) {
    const { text, note } = await fetchAndExtract(url);
    if (note) notes.push(note);
    if (!text) continue;
    const ex = excerptsFromText(text, url, `Web \u2014 ${url}`, "web", question, perSource);
    items.push(
      ...ex.length ? ex : [
        {
          source: "web",
          title: `Web \u2014 ${url}`,
          ref: url,
          location: url,
          score: 0,
          snippet: text.slice(0, 800),
          url
        }
      ]
    );
  }
  return { items, notes };
}
async function webSource(ctx) {
  const kws = keywords(ctx.options.question).slice(0, 8).join(" ");
  const project = ctx.repoRef.repo ?? "";
  const query4 = `${project} ${kws}`.trim();
  if (!query4) return { source: "web", items: [], notes: ["No keywords to search the web."] };
  const { urls, via, notes } = await discover(query4, ctx.options.webEngine, ctx.options.perSource);
  if (urls.length === 0) return { source: "web", items: [], notes };
  const fetched = await webFetchUrls(urls, ctx.options.question, ctx.options.perSource);
  return {
    source: "web",
    items: fetched.items,
    notes: [`Web discovery via ${via}.`, ...notes, ...fetched.notes]
  };
}

// src/sources/registry.ts
var HANDLERS = {
  code: codeSource,
  docs: docsSource,
  release: releasesSource,
  history: historySource,
  issue: issuesSource,
  pr: prsSource,
  discussion: discussionsSource,
  so: stackoverflowSource,
  web: webSource
};
function srcRank(s) {
  const i2 = SOURCE_ORDER.indexOf(s);
  return i2 < 0 ? 99 : i2;
}
function normSnippet(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
function lineRange(location) {
  const m = location?.match(/:(\d+)-(\d+)$/);
  if (!m) return void 0;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a <= b ? { a, b } : void 0;
}
function keeperOver(a, b, docFiles) {
  const aDocs = a.source === "docs" && docFiles.has(a.ref);
  const bDocs = b.source === "docs" && docFiles.has(b.ref);
  if (aDocs !== bDocs) return aDocs;
  if (srcRank(a.source) !== srcRank(b.source)) return srcRank(a.source) < srcRank(b.source);
  if (a.score !== b.score) return a.score > b.score;
  return a.ref.localeCompare(b.ref) <= 0;
}
function dedupeAcrossSources(results, docFiles) {
  const all = results.flatMap((res) => res.items.map((item) => ({ res, item })));
  const droppedItems = /* @__PURE__ */ new Set();
  const bySnippet = /* @__PURE__ */ new Map();
  for (const e of all) {
    const key = normSnippet(e.item.snippet);
    if (!key) continue;
    const prev = bySnippet.get(key);
    if (!prev) {
      bySnippet.set(key, e);
    } else if (keeperOver(e.item, prev.item, docFiles)) {
      droppedItems.add(prev.item);
      bySnippet.set(key, e);
    } else {
      droppedItems.add(e.item);
    }
  }
  const byRef = /* @__PURE__ */ new Map();
  for (const e of all) {
    if (droppedItems.has(e.item)) continue;
    const group = byRef.get(e.item.ref);
    if (group) group.push(e);
    else byRef.set(e.item.ref, [e]);
  }
  for (const group of byRef.values()) {
    for (let i2 = 0; i2 < group.length; i2++) {
      const a = group[i2];
      if (droppedItems.has(a.item)) continue;
      const ra = lineRange(a.item.location);
      if (!ra) continue;
      for (let j = i2 + 1; j < group.length; j++) {
        const b = group[j];
        if (droppedItems.has(b.item) || a.res.source === b.res.source) continue;
        const rb = lineRange(b.item.location);
        if (!rb) continue;
        const inter = Math.min(ra.b, rb.b) - Math.max(ra.a, rb.a) + 1;
        const union = Math.max(ra.b, rb.b) - Math.min(ra.a, rb.a) + 1;
        if (inter > 0 && inter / union >= 0.6) {
          droppedItems.add(keeperOver(a.item, b.item, docFiles) ? b.item : a.item);
        }
      }
    }
  }
  return {
    results: results.map((r) => ({ ...r, items: r.items.filter((it) => !droppedItems.has(it)) })),
    dropped: droppedItems.size
  };
}
async function runSources(ctx) {
  const cap = ctx.options.perSource;
  const tasks = ctx.options.sources.map(async (kind) => {
    const handler = HANDLERS[kind];
    if (!handler) return { source: kind, items: [], notes: [`Unknown source "${kind}".`] };
    const t0 = Date.now();
    try {
      const res = await handler(ctx);
      return { ...res, ms: Date.now() - t0 };
    } catch (e) {
      return { source: kind, items: [], notes: [`${kind} source failed: ${e.message}`], ms: Date.now() - t0 };
    }
  });
  const raw = await Promise.all(tasks);
  const { results, dropped } = dedupeAcrossSources(raw, new Set(ctx.index.docFiles));
  if (dropped > 0 && results.length > 0) {
    results[0].notes.push(`Dropped ${dropped} cross-source duplicate evidence item(s).`);
  }
  return results.map((r) => ({
    ...r,
    items: [...r.items].sort((a, b) => b.score - a.score).slice(0, cap)
  }));
}

// src/drill-plan.ts
import { writeFileSync as writeFileSync7 } from "fs";
import { join as join16 } from "path";
var DRILL_SOURCES = ["code", "docs", "release", "history", "issue", "pr", "discussion", "so", "web"];
var MAX_DRILL_CELLS = 24;
var IDENT_RE = /\b[A-Za-z][A-Za-z0-9]*(?:[_.][A-Za-z0-9]+)+\b|\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]+)+[a-zA-Z0-9]*\b|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
var CODE_SPAN_RE = /`([^`\n]+)`/g;
var QUOTED_RE = /"([^"\n]{3,})"|(?<![A-Za-z])'([^'\n]{3,})'(?![A-Za-z])/g;
function deriveVariants(question) {
  const out2 = [{ variant: "prose", query: question }];
  const idents = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (tok) => {
    const t = tok.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      idents.push(t);
    }
  };
  let rest = question;
  for (const m of question.matchAll(CODE_SPAN_RE)) {
    push(m[1]);
    rest = rest.replace(m[0], " ");
  }
  const noQuotes = rest.replace(QUOTED_RE, " ");
  for (const m of noQuotes.matchAll(IDENT_RE)) push(m[0]);
  if (idents.length) out2.push({ variant: "identifier", query: idents.join(" ") });
  const literals = [];
  for (const m of rest.matchAll(QUOTED_RE)) {
    const lit = (m[1] ?? m[2]).trim();
    if (lit && !literals.includes(lit)) literals.push(lit);
  }
  if (literals.length) out2.push({ variant: "literal", query: literals.join(" ") });
  return out2;
}
function buildDrillPlan(opts) {
  const cells = [];
  let n = 0;
  for (const v of deriveVariants(opts.question)) {
    for (const source of DRILL_SOURCES) {
      if (v.variant === "prose" && opts.askedSources.includes(source)) continue;
      if (cells.length >= MAX_DRILL_CELLS) break;
      cells.push({ id: `D${++n}`, variant: v.variant, query: v.query, source });
    }
  }
  return {
    question: opts.question,
    repo: opts.repo,
    ...opts.ref ? { ref: opts.ref } : {},
    ...opts.pkg ? { pkg: opts.pkg } : {},
    askedSources: opts.askedSources,
    cells
  };
}
function writeDrillPlan(dir, plan) {
  const p = join16(dir, "drill-plan.json");
  writeFileSync7(p, JSON.stringify(plan, null, 2));
  return p;
}

// src/ask.ts
function buildContext(options) {
  const t0 = Date.now();
  const repoRef = resolveRepo(options.repo);
  const repoDir = ensureClone(repoRef, { refresh: options.refresh, branch: options.ref });
  const cloneMs = Date.now() - t0;
  const project = [repoRef.repo, repoRef.owner].filter((x) => !!x);
  const index = ensureIndex(repoDir, repoRef.slug, { refresh: options.refresh, project });
  const indexMs = Date.now() - t0 - cloneMs;
  let scopePkg;
  if (options.pkg) {
    scopePkg = resolvePackage(index.packages, options.pkg);
    if (!scopePkg) {
      const known = index.packages.length ? `known packages: ${index.packages.map((p) => `${p.name} (${p.dir})`).join(", ")}` : "this repo declares no workspace packages";
      throw new Error(`--package "${options.pkg}" does not match one package \u2014 ${known}`);
    }
  }
  return { repoRef, repoDir, index, options, scopePkg, scopeDir: scopePkg?.dir, setupTimings: { cloneMs, indexMs } };
}
async function runAsk(options) {
  const t0 = Date.now();
  const ctx = buildContext(options);
  const results = await runSources(ctx);
  const evidence = assignIds2(results);
  const sourceMs = {};
  for (const r of results) if (r.ms !== void 0) sourceMs[r.source] = r.ms;
  const meta = {
    question: options.question,
    repo: ctx.repoRef.raw,
    host: ctx.repoRef.host,
    ref: options.ref,
    commit: ctx.index.commit,
    repoDir: ctx.repoDir,
    pkg: ctx.scopePkg?.name,
    sources: options.sources,
    semantic: options.semantic,
    evidenceCount: evidence.length,
    builtAt: (/* @__PURE__ */ new Date()).toISOString(),
    notes: results.flatMap((r) => r.notes),
    timings: {
      cloneMs: ctx.setupTimings?.cloneMs ?? 0,
      indexMs: ctx.setupTimings?.indexMs ?? 0,
      totalMs: Date.now() - t0,
      sources: sourceMs
    },
    fallbacks: results.flatMap((r) => r.fallbacks ?? [])
  };
  const dir = options.out ?? defaultRunDir(ctx.repoDir);
  const paths = writeDossier(dir, evidence, meta);
  writeDrillPlan(
    dir,
    buildDrillPlan({
      question: options.question,
      repo: options.repo,
      ref: options.ref,
      pkg: ctx.scopePkg?.name,
      askedSources: options.sources
    })
  );
  return { dir, evidence, meta, paths };
}
async function runSingleSource(options, kind) {
  const ctx = buildContext({ ...options, sources: [kind] });
  const results = await runSources(ctx);
  return { ctx, evidence: assignIds2(results), notes: results.flatMap((r) => r.notes) };
}

// src/doc.ts
import { mkdirSync as mkdirSync9, writeFileSync as writeFileSync9 } from "fs";
import { basename as basename4, join as join18 } from "path";

// src/overview.ts
import { existsSync as existsSync9, mkdirSync as mkdirSync8, readFileSync as readFileSync8, writeFileSync as writeFileSync8 } from "fs";
import { basename as basename3, dirname as dirname4, join as join17 } from "path";
var CACHE_MARK = /<!-- ultradoc:overview commit=([^\s]+) -->/;
function overviewPath(repoDir) {
  return join17(repoDir, ".ultradoc", "OVERVIEW.md");
}
function readmeAbout(repoDir, docFiles) {
  const readme = docFiles.find((f) => /^readme(\.|$)/i.test(f));
  if (!readme) return [];
  const text = readText(join17(repoDir, readme));
  const out2 = [];
  let chars = 0;
  for (const para of text.split(/\r?\n\s*\r?\n/)) {
    const p = para.trim();
    if (!p || p.startsWith("#") || p.startsWith("<") || p.startsWith("!") || p.startsWith("[![") || p.startsWith("```")) continue;
    out2.push(p.replace(/\s*\r?\n\s*/g, " "));
    chars += p.length;
    if (out2.length >= 3 || chars > 700) break;
  }
  return out2;
}
function layout(repoDir, index) {
  let counts;
  if (index.topDirs) {
    counts = new Map(Object.entries(index.topDirs).map(([top, n]) => [top === "." ? "(root)" : top + "/", n]));
  } else {
    counts = /* @__PURE__ */ new Map();
    for (const f of walk2(repoDir)) {
      const top = f.rel.includes("/") ? f.rel.slice(0, f.rel.indexOf("/")) + "/" : "(root)";
      counts.set(top, (counts.get(top) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([dir, files]) => ({ dir, files })).sort((a, b) => b.files - a.files || a.dir.localeCompare(b.dir)).slice(0, 15);
}
function apiLines(symbols, prefix, maxFiles = 15, maxSyms = 8) {
  const byFile = /* @__PURE__ */ new Map();
  for (const s of symbols) {
    if (!s.exported) continue;
    if (prefix && !s.file.startsWith(prefix + "/")) continue;
    const list = byFile.get(s.file) ?? [];
    list.push(s);
    byFile.set(s.file, list);
  }
  const files = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, maxFiles);
  return files.map(([file, syms]) => {
    const shown = syms.sort((a, b) => a.line - b.line).slice(0, maxSyms).map((s) => `${s.kind} \`${s.name}\``).join(", ");
    const more = syms.length > maxSyms ? ` (+${syms.length - maxSyms} more)` : "";
    return `- \`${file}\` \u2014 ${shown}${more}`;
  });
}
function renderOverview(index, ref, repoDir) {
  const name2 = ref.repo ?? basename3(repoDir);
  const out2 = [];
  out2.push(`<!-- ultradoc:overview commit=${index.commit ?? "unknown"} -->`);
  out2.push(`# ${name2} \u2014 repository overview`);
  out2.push("");
  out2.push(`**Repo:** ${ref.raw}${index.commit ? ` @ ${index.commit}` : ""} \xB7 **host:** ${ref.host}`);
  const langs = Object.entries(index.languages).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`);
  out2.push(`**Files:** ${index.fileCount} \xB7 **symbols:** ${index.symbols.length} \xB7 **languages:** ${langs.join(", ")}`);
  out2.push(`**Generated:** ${index.builtAt} (regenerate with \`ultradoc overview --refresh\`)`);
  out2.push("");
  out2.push(
    `> This is a cached navigation map for answering questions about the repo without re-indexing. It is NOT citable evidence \u2014 ground answers in a dossier from \`ultradoc ask\`.`
  );
  out2.push("");
  const about = readmeAbout(repoDir, index.docFiles);
  if (about.length) {
    out2.push("## About");
    out2.push("");
    for (const p of about) out2.push(p, "");
  }
  if (index.packages.length) {
    out2.push("## Workspace packages");
    out2.push("");
    out2.push(`This is a monorepo with ${index.packages.length} packages. Scope any question with \`--package <name|dir>\`.`);
    out2.push("");
    out2.push("| package | path | description |");
    out2.push("|---------|------|-------------|");
    for (const p of index.packages) {
      out2.push(`| ${p.name} | \`${p.dir}\` | ${p.description ?? ""} |`);
    }
    out2.push("");
  }
  out2.push("## Layout");
  out2.push("");
  for (const l of layout(repoDir, index)) out2.push(`- \`${l.dir}\` \u2014 ${l.files} files`);
  out2.push("");
  out2.push("## Public API");
  out2.push("");
  if (index.packages.length) {
    for (const p of index.packages) {
      const lines = apiLines(index.symbols, p.dir, 10, 8);
      if (!lines.length) continue;
      out2.push(`### ${p.name} (\`${p.dir}\`)`);
      out2.push("");
      out2.push(...lines);
      out2.push("");
    }
  } else {
    const lines = apiLines(index.symbols);
    out2.push(...lines.length ? lines : ["_No exported symbols were detected._"]);
    out2.push("");
  }
  out2.push("## Documentation");
  out2.push("");
  if (index.docsRoot) out2.push(`- Canonical docs tree: \`${index.docsRoot}/\``);
  if (index.docsUrl) out2.push(`- Official docs site: ${index.docsUrl}`);
  for (const d of index.docFiles.slice(0, 40)) out2.push(`- \`${d}\``);
  if (index.docFiles.length > 40) out2.push(`- \u2026 ${index.docFiles.length - 40} more doc files`);
  out2.push("");
  return out2.join("\n");
}
function ensureOverview(index, ref, repoDir, opts = {}) {
  const path = opts.out ?? overviewPath(repoDir);
  if (!opts.refresh && existsSync9(path)) {
    try {
      const existing = readFileSync8(path, "utf8");
      const commit = CACHE_MARK.exec(existing)?.[1];
      if (commit && commit === (index.commit ?? "unknown")) {
        return { path, markdown: existing, cached: true };
      }
    } catch {
    }
  }
  const markdown = renderOverview(index, ref, repoDir);
  mkdirSync8(dirname4(path), { recursive: true });
  writeFileSync8(path, markdown);
  return { path, markdown, cached: false };
}

// src/doc.ts
function looksLikeTestFile(rel) {
  if (/(^|\/)(tests?|__tests__|specs?|fixtures?|examples?|benchmarks?|e2e)\//i.test(rel)) return true;
  const base = (rel.split("/").pop() ?? "").toLowerCase();
  return /[._-](test|spec)(-d)?\.\w+$/.test(base) || /^(test|conftest)[_.]/.test(base);
}
function topExportedSymbols(index, prefix, n) {
  const byFile = /* @__PURE__ */ new Map();
  const names = [];
  const seen = /* @__PURE__ */ new Set();
  const isApi = (s) => s.exported && !looksLikeTestFile(s.file) && !s.name.startsWith("_");
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
function detectProjectTraits(repoDir, index) {
  const bases = new Map(index.configFiles.map((f) => [f.split("/").pop().toLowerCase(), f]));
  const readCfg = (base) => {
    const rel = bases.get(base);
    return rel ? readText(join18(repoDir, rel)) : "";
  };
  let isCli = false;
  const pkg = readCfg("package.json");
  if (pkg) {
    try {
      if (JSON.parse(pkg).bin) isCli = true;
    } catch {
      if (/"bin"\s*:/.test(pkg)) isCli = true;
    }
  }
  if (/\[project\.scripts\]|\[tool\.poetry\.scripts\]/.test(readCfg("pyproject.toml"))) isCli = true;
  if (/\[\[bin\]\]/.test(readCfg("cargo.toml"))) isCli = true;
  if (index.symbols.some((s) => s.name === "main" && (/\.go$/.test(s.file) || /(^|\/)main\.rs$/.test(s.file)))) isCli = true;
  const isLib = index.symbols.some((s) => s.exported && !s.name.startsWith("_"));
  const hasConfigSurface = bases.has(".env.example") || index.configFiles.some((f) => /(^|\/)(config|settings)\.(json|ya?ml|toml|ini|js|ts)$/i.test(f)) || index.symbols.some((s) => s.exported && /config|options?|settings/i.test(s.name)) || index.configFiles.length > 0;
  return { isCli, isLib, hasConfigSurface };
}
function buildOutline(index, name2, scopePkg, traits) {
  const sections = [];
  let n = 0;
  const add = (title, query4, sources) => sections.push({ id: `S${++n}`, title, query: query4, sources });
  add("Overview", `${name2} overview introduction purpose what is`, ["docs", "code"]);
  add("Installation & usage", `${name2} install setup usage getting started example quickstart`, ["docs", "code"]);
  if (traits?.isCli) {
    add("Commands", `${name2} command subcommand flags options usage help argv arguments`, ["code", "docs"]);
  }
  if (index.packages.length && !scopePkg) {
    for (const pkg of index.packages.slice(0, LIMITS.docPackages)) {
      const syms = topExportedSymbols(index, pkg.dir, 5);
      add(`Package: ${pkg.name}`, `${pkg.name} ${pkg.dir} ${syms.join(" ")}`.trim(), ["code", "docs"]);
    }
  } else if (traits ? traits.isLib : true) {
    const syms = topExportedSymbols(index, scopePkg?.dir, 6);
    add("Public API", `${name2} public API exports main entry ${syms.join(" ")}`.trim(), ["code", "docs"]);
  }
  if (!traits || traits.hasConfigSurface) {
    add("Configuration", `${name2} configuration options config settings environment flags`, ["code", "docs"]);
  }
  add("Architecture & internals", `${name2} architecture design internals how it works module structure`, ["docs", "code"]);
  return sections;
}
var dedupKey = (it) => `${it.source}|${it.ref}|${it.location ?? ""}|${(it.snippet ?? "").slice(0, 120)}`;
var sourceRank = (s) => {
  const i2 = SOURCE_ORDER.indexOf(s);
  return i2 < 0 ? 99 : i2;
};
function mergeEvidence(perSection) {
  const best = /* @__PURE__ */ new Map();
  for (const { items } of perSection) {
    for (const it of items) {
      const k = dedupKey(it);
      const ex = best.get(k);
      if (!ex || it.score > ex.score) best.set(k, it);
    }
  }
  const flat = [...best.values()].sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref));
  const evidence = flat.map((it, i2) => ({ id: `E${i2 + 1}`, ...it }));
  const idByKey = new Map(evidence.map((e) => [dedupKey(e), e.id]));
  const sectionIds = /* @__PURE__ */ new Map();
  for (const { section, items } of perSection) {
    const ids = [];
    const seen = /* @__PURE__ */ new Set();
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
function renderDocTodo(plan, evidence) {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const out2 = [];
  out2.push(`# Documentation worklist \u2014 ${plan.repo}${plan.commit ? ` @ ${plan.commit}` : ""}`);
  if (plan.pkg) out2.push(`**Package:** ${plan.pkg}`);
  out2.push("");
  out2.push(
    `> Write the final document to \`DOC.md\` in this folder. Write each section below as grounded prose and **cite the evidence ids** ([E#]) \u2014 every factual claim needs a citation that resolves. Read \`EVIDENCE.md\` for the full snippets. If a section's evidence is thin, drill more (\`ultradoc code|docs --repo \u2026 --q \u2026\`) or state the gap explicitly \u2014 never write from memory. Then run \`ultradoc check --run <dir>\`.`
  );
  out2.push("");
  for (const s of plan.sections) {
    out2.push(`## ${s.id} \xB7 ${s.title}`);
    out2.push(`_query:_ \`${s.query}\``);
    if (!s.evidenceIds.length) {
      out2.push(`_evidence:_ none retrieved \u2014 drill this section or mark it an explicit unknown.`);
      out2.push("");
      continue;
    }
    out2.push(`_evidence:_ ${s.evidenceIds.map((id) => `[${id}]`).join(" ")}`);
    for (const id of s.evidenceIds) {
      const e = byId.get(id);
      if (!e) continue;
      const firstLine2 = (e.snippet ?? "").split("\n").find((l) => l.trim()) ?? e.title;
      out2.push(`- [${id}] \`${e.ref}\` \u2014 ${firstLine2.slice(0, 120)}`);
    }
    out2.push("");
  }
  return out2.join("\n");
}
function defaultDocDir(repoDir, scopePkg) {
  const base = join18(indexDir(repoDir), "doc");
  return scopePkg ? join18(base, slugify(scopePkg.name)) : base;
}
async function runDoc(options, opts = {}) {
  const ctx = buildContext(options);
  const name2 = ctx.repoRef.repo ?? basename4(ctx.repoDir);
  const traits = detectProjectTraits(ctx.repoDir, ctx.index);
  const outline = buildOutline(ctx.index, name2, ctx.scopePkg, traits);
  const perSection = await Promise.all(
    outline.map(async (section) => {
      const sources = opts.sourcesOverride ?? section.sources;
      const sctx = { ...ctx, options: { ...ctx.options, question: section.query, sources } };
      const results = await runSources(sctx);
      return {
        section,
        items: results.flatMap((r) => r.items),
        notes: results.flatMap((r) => r.notes)
      };
    })
  );
  const { evidence, sectionIds } = mergeEvidence(perSection);
  const sections = outline.map((s) => ({ ...s, evidenceIds: sectionIds.get(s.id) ?? [] }));
  const docNotes = [];
  if (!ctx.scopePkg && ctx.index.packages.length > LIMITS.docPackages) {
    docNotes.push(
      `This monorepo has ${ctx.index.packages.length} packages; sections cover the first ${LIMITS.docPackages}. Re-run \`doc --package <name>\` for the rest, or raise ULTRADOC_MAX_DOC_PACKAGES.`
    );
  }
  const usedSources = [...new Set(perSection.flatMap((p) => opts.sourcesOverride ?? p.section.sources))];
  const plan = {
    repo: ctx.repoRef.raw,
    host: ctx.repoRef.host,
    commit: ctx.index.commit,
    pkg: ctx.scopePkg?.name,
    builtAt: (/* @__PURE__ */ new Date()).toISOString(),
    sections
  };
  const meta = {
    question: `Documentation: ${name2}`,
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
    notes: [.../* @__PURE__ */ new Set([...docNotes, ...perSection.flatMap((p) => p.notes)])]
  };
  const dir = options.out ?? defaultDocDir(ctx.repoDir, ctx.scopePkg);
  mkdirSync9(dir, { recursive: true });
  const evidenceJson = join18(dir, "evidence.json");
  const evidenceMd = join18(dir, "EVIDENCE.md");
  const planJson = join18(dir, "DOC.plan.json");
  const todoMd = join18(dir, "DOC.todo.md");
  const metaJson = join18(dir, "meta.json");
  writeFileSync9(evidenceJson, JSON.stringify(evidence, null, 2));
  writeFileSync9(evidenceMd, renderEvidenceMarkdown(evidence, meta));
  writeFileSync9(planJson, JSON.stringify(plan, null, 2));
  writeFileSync9(todoMd, renderDocTodo(plan, evidence));
  writeFileSync9(metaJson, JSON.stringify(meta, null, 2));
  let overviewPath2;
  try {
    overviewPath2 = ensureOverview(ctx.index, ctx.repoRef, ctx.repoDir).path;
  } catch {
  }
  return { dir, plan, evidence, paths: { dir, evidenceJson, evidenceMd, planJson, todoMd, metaJson, overviewPath: overviewPath2 } };
}

// src/check.ts
import { createHash as createHash2 } from "crypto";
import { existsSync as existsSync11, readFileSync as readFileSync10 } from "fs";
import { basename as basename5, dirname as dirname5, join as join20, resolve as resolvePath, sep as sep2 } from "path";

// src/citations.ts
var TOKEN_RE = /\[([^\]\n]+)\](?!\()/g;
var SHAPE = {
  id: /^E\d+$/,
  numbered: /^(issue|pr|discussion)#\d+$/,
  soref: /^so:\S+$/,
  typed: /^(code|docs|web|so|release|commit|history|discussion):\S+$/
};
var TYPED_SOURCE = { commit: "history" };
function isCitation(tok) {
  return SHAPE.id.test(tok) || SHAPE.numbered.test(tok) || SHAPE.soref.test(tok) || SHAPE.typed.test(tok);
}
function stripLineSuffix(p) {
  return p.replace(/:\d+(-\d+)?$/, "");
}
function matchPath(e, payload) {
  const bare = stripLineSuffix(payload);
  if (!bare) return false;
  for (const c2 of [e.ref, e.location]) {
    if (!c2) continue;
    const cBare = stripLineSuffix(c2);
    if (cBare === bare || cBare.endsWith("/" + bare)) return true;
  }
  return false;
}
function matchRelease(ref, payload) {
  const tag = ref.startsWith("release:") ? ref.slice("release:".length) : ref;
  const norm2 = (s) => s.replace(/^v/i, "");
  return tag === payload || norm2(tag) === norm2(payload);
}
function matchCommit(items, payload) {
  if (!/^[0-9a-f]{7,}$/i.test(payload)) return [];
  return items.filter((e) => {
    const sha = e.ref.startsWith("commit:") ? e.ref.slice("commit:".length) : e.ref;
    if (!/^[0-9a-f]{7,}$/i.test(sha)) return false;
    return sha.startsWith(payload) || payload.startsWith(sha);
  });
}
function matchWeb(e, payload) {
  const bare = (u) => u.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const p = bare(payload);
  for (const c2 of [e.ref, e.url]) {
    if (!c2) continue;
    if (c2 === payload || bare(c2) === p) return true;
  }
  return false;
}
function resolveAlias(tok, evidence) {
  const colon = tok.indexOf(":");
  if (colon <= 0) return [];
  const prefix = tok.slice(0, colon);
  const payload = tok.slice(colon + 1);
  const source = TYPED_SOURCE[prefix] ?? prefix;
  const same = evidence.filter((e) => e.source === source);
  switch (prefix) {
    case "code":
    case "docs":
      return same.filter((e) => matchPath(e, payload));
    case "discussion":
      return /^\d+$/.test(payload) ? same.filter((e) => e.ref === `discussion#${payload}`) : [];
    case "so":
      return /^\d+$/.test(payload) ? same.filter((e) => e.ref === `so:${payload}`) : [];
    case "release":
      return same.filter((e) => matchRelease(e.ref, payload));
    case "commit":
    case "history":
      return matchCommit(same, payload);
    case "web":
      return same.filter((e) => matchWeb(e, payload));
    default:
      return [];
  }
}
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}
function stripInlineCode(line) {
  return line.replace(/`[^`\n]*`/g, " ");
}
function codeMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let inFence = false;
  for (let i2 = 0; i2 < lines.length; i2++) {
    if (/^\s*(```|~~~)/.test(lines[i2])) {
      mask[i2] = true;
      inFence = !inFence;
      continue;
    }
    mask[i2] = inFence;
  }
  return mask;
}
function isHeadingOrRule(t) {
  return /^#{1,6}\s/.test(t) || /^([-*_])\1{2,}$/.test(t);
}
function isTableSeparator(line) {
  return /\|/.test(line) && /^[\s:|-]+$/.test(line.trim()) && /-/.test(line);
}
function isTableRow(line) {
  return /\|/.test(line.trim()) && !isTableSeparator(line);
}
function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c2) => c2.trim()).join(" ");
}
function isListItem(line) {
  return /^\s*([-*+]|\d+\.)\s+\S/.test(line);
}
function extractClaimUnits(text) {
  const lines = stripHtmlComments(text).split("\n");
  const code = codeMask(lines);
  const units = [];
  let prose = [];
  const flush = () => {
    if (prose.length) units.push({ kind: "text", text: prose.join(" ") });
    prose = [];
  };
  let i2 = 0;
  while (i2 < lines.length) {
    if (code[i2]) {
      flush();
      i2++;
      continue;
    }
    const raw = lines[i2];
    const line = stripInlineCode(raw);
    const t = line.trim();
    if (t === "" || isHeadingOrRule(t) || isTableSeparator(line)) {
      flush();
      i2++;
      continue;
    }
    if (isTableRow(line)) {
      flush();
      units.push({ kind: "text", text: tableCells(raw) });
      i2++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const dequoted = raw.replace(/^\s*>\s?/, "").trim();
      if (dequoted) prose.push(dequoted);
      i2++;
      continue;
    }
    if (isListItem(line)) {
      flush();
      const items = [];
      while (i2 < lines.length && !code[i2]) {
        const rawL = lines[i2];
        const l = stripInlineCode(rawL);
        const tt = l.trim();
        if (tt === "" || isHeadingOrRule(tt) || isTableSeparator(l) || isTableRow(l)) break;
        if (isListItem(l)) items.push(rawL.replace(/^\s*([-*+]|\d+\.)\s+/, "").trim());
        else if (items.length) items[items.length - 1] += " " + rawL.trim();
        else items.push(rawL.trim());
        i2++;
      }
      units.push({ kind: "list", items });
      continue;
    }
    prose.push(raw);
    i2++;
  }
  flush();
  return units;
}
function citationTokensIn(text) {
  const masked = stripInlineCode(text);
  const out2 = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while (m = TOKEN_RE.exec(masked)) {
    const tok = m[1].trim();
    if (isCitation(tok) && !out2.includes(tok)) out2.push(tok);
  }
  return out2;
}
function citedEvidenceIds(text, evidence) {
  const ids = new Set(evidence.map((e) => e.id));
  const out2 = [];
  const push = (id) => {
    if (!out2.includes(id)) out2.push(id);
  };
  for (const tok of citationTokensIn(text)) {
    if (SHAPE.id.test(tok)) {
      if (ids.has(tok)) push(tok);
      continue;
    }
    for (const e of evidence) if (e.ref === tok) push(e.id);
    for (const e of resolveAlias(tok, evidence)) push(e.id);
  }
  return out2;
}
function collectCitations(text) {
  const tokens = [];
  for (const u of extractClaimUnits(text)) {
    const parts2 = u.kind === "text" ? [u.text] : u.items;
    for (const part of parts2) for (const t of citationTokensIn(part)) if (!tokens.includes(t)) tokens.push(t);
  }
  const all = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while (m = TOKEN_RE.exec(text)) {
    const tok = m[1].trim();
    if (isCitation(tok) && !all.includes(tok)) all.push(tok);
  }
  return { tokens, fencedOnly: all.filter((t) => !tokens.includes(t)) };
}
var MIN_CLAIM_LEN = 25;
function claimCoverage(text, _evidence) {
  const claims = [];
  for (const u of extractClaimUnits(text)) {
    if (u.kind === "text") claims.push(u.text);
    else for (const it of u.items) claims.push(it);
  }
  let counted = 0;
  let cited = 0;
  const uncited = [];
  for (const c2 of claims) {
    const trimmed = c2.trim();
    if (stripInlineCode(trimmed).trim().length < MIN_CLAIM_LEN) continue;
    counted++;
    if (citationTokensIn(trimmed).length > 0) cited++;
    else if (uncited.length < 8) uncited.push(trimmed.slice(0, 160));
  }
  return { claims: counted, cited, ratio: counted === 0 ? 1 : cited / counted, uncited };
}

// src/verify.ts
import { existsSync as existsSync10, readFileSync as readFileSync9, writeFileSync as writeFileSync10 } from "fs";
import { join as join19 } from "path";
var VERIFY_MAX = LIMITS.verifyPairs;
var VALID_VERDICTS = ["supported", "partial", "refuted", "unsupported"];
var MIN_UNCITED_LEN = 25;
function claimStrings(text) {
  const out2 = [];
  for (const u of extractClaimUnits(text)) {
    if (u.kind === "text") out2.push(u.text);
    else for (const it of u.items) out2.push(it);
  }
  return out2;
}
function buildWorklist(dir, opts = {}) {
  const evidencePath = join19(dir, "evidence.json");
  if (!existsSync10(evidencePath)) throw new Error(`No evidence.json in ${dir} \u2014 run \`ultradoc ask\` first.`);
  const evidence = JSON.parse(readFileSync9(evidencePath, "utf8"));
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const answerPath = resolveAnswerPath(dir, opts.answerFile);
  if (!answerPath) throw new Error(`No ${opts.answerFile ?? "ANSWER.md or DOC.md"} in ${dir} \u2014 write the answer first.`);
  const answer = readFileSync9(answerPath, "utf8");
  const pairs = [];
  const uncitedClaims = [];
  let claimNo = 0;
  for (const claim of claimStrings(answer)) {
    const ids = citedEvidenceIds(claim, evidence);
    claimNo++;
    const claimId = `C${claimNo}`;
    if (!ids.length) {
      if (stripInlineCode(claim).trim().length >= MIN_UNCITED_LEN) uncitedClaims.push({ claimId, claim: claim.trim().slice(0, 400) });
      continue;
    }
    for (const id of ids) {
      const e = byId.get(id);
      if (!e) continue;
      pairs.push({
        claimId,
        claim: claim.trim().slice(0, 400),
        evidenceId: id,
        ref: e.ref,
        source: e.source,
        digest: (e.snippet || e.title || e.ref).slice(0, 600),
        ...e.source === "issue" || e.source === "pr" ? { crossCheck: true } : {},
        score: e.score
      });
    }
  }
  const max = Math.max(1, Math.floor(opts.maxVerify ?? VERIFY_MAX));
  const kept = pairs.length > max ? pairs.slice().sort((a, b) => b.score - a.score || a.claimId.localeCompare(b.claimId) || a.evidenceId.localeCompare(b.evidenceId)).slice(0, max) : pairs;
  const worklist = { run: dir, pairs: kept.map(({ score, ...rest }) => rest), uncitedClaims };
  return { worklist, total: pairs.length, kept: kept.length };
}
function runVerify(dir, opts = {}) {
  const { worklist, total, kept } = buildWorklist(dir, opts);
  const todo = {
    run: dir,
    pairs: worklist.pairs.map((p) => ({ ...p, verdict: null, note: "" })),
    uncitedClaims: worklist.uncitedClaims
  };
  writeFileSync10(join19(dir, "VERIFY.todo.json"), JSON.stringify(todo, null, 2));
  writeFileSync10(join19(dir, "VERIFY.md"), renderWorklistMd(worklist, total, kept));
  return worklist;
}
function renderWorklistMd(wl, total, kept) {
  const out2 = [];
  out2.push(`# Verification worklist`);
  out2.push("");
  out2.push(
    `For each pair, open the cited evidence and judge whether it **supports** the claim. In \`VERIFY.todo.json\`, set each \`verdict\` to one of supported \xB7 partial \xB7 refuted \xB7 unsupported, add a short \`note\`, save it (e.g. as \`verdicts.json\`), then run \`ultradoc verify --apply verdicts.json --run <dir>\`.`
  );
  if (wl.pairs.some((p) => p.crossCheck)) {
    out2.push("");
    out2.push(
      `Pairs flagged **\u26A0 cross-check** are grounded in an issue/PR \u2014 a tracker thread describes behavior at a point in time. Judge them by cross-check against CURRENT code: if the current source contradicts the claim, mark it refuted (or partial with a temporal qualifier citing the fixing release).`
    );
  }
  if (kept < total) out2.push(`
_Showing ${kept} of ${total} pair(s) \u2014 capped at the highest-score evidence._`);
  out2.push("");
  for (const p of wl.pairs) {
    out2.push(`## ${p.claimId} \xB7 ${p.evidenceId} (${p.source} \xB7 ${p.ref})${p.crossCheck ? " \xB7 \u26A0 cross-check" : ""}`);
    out2.push(`**Claim:** ${p.claim}`);
    out2.push(`**Cited evidence:** ${p.digest}`);
    out2.push(`**Verdict:** _____ \xB7 **Note:** _____`);
    out2.push("");
  }
  if (wl.uncitedClaims.length) {
    out2.push(`## Uncited claims \u2014 cite or delete`);
    out2.push("");
    out2.push(`These claim(s) cite no evidence, so verify cannot adjudicate them. Cite an evidence id or remove the claim (\`check\` fails on low coverage):`);
    out2.push("");
    for (const u of wl.uncitedClaims) out2.push(`- **${u.claimId}:** ${u.claim}`);
    out2.push("");
  }
  return out2.join("\n");
}
function applyVerdicts(dir, verdictsPath) {
  if (!existsSync10(verdictsPath)) {
    throw new Error(`No verdicts file at ${verdictsPath} \u2014 adjudicate VERIFY.todo.json and save it as verdicts.json first.`);
  }
  const raw = JSON.parse(readFileSync9(verdictsPath, "utf8"));
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.pairs) ? raw.pairs : Array.isArray(raw?.verdicts) ? raw.verdicts : [];
  if (list.length === 0) {
    throw new Error(`${verdictsPath}: no verdict rows found \u2014 expected a bare array, { pairs: [...] } or { verdicts: [...] } with at least one row.`);
  }
  const problems = [];
  const verdicts = [];
  for (const [i2, v] of list.entries()) {
    if (!v || typeof v.claimId !== "string" || typeof v.evidenceId !== "string") {
      problems.push(`row ${i2 + 1}: missing claimId/evidenceId`);
      continue;
    }
    if (v.verdict != null && !VALID_VERDICTS.includes(v.verdict)) {
      problems.push(`row ${i2 + 1} (${v.claimId}:${v.evidenceId}): invalid verdict "${String(v.verdict)}" \u2014 expected ${VALID_VERDICTS.join("|")} or null`);
      continue;
    }
    const verdict = VALID_VERDICTS.includes(v.verdict) ? v.verdict : void 0;
    verdicts.push({
      claimId: v.claimId,
      claim: typeof v.claim === "string" ? v.claim : "",
      evidenceId: v.evidenceId,
      ref: typeof v.ref === "string" ? v.ref : "",
      source: v.source,
      digest: typeof v.digest === "string" ? v.digest : "",
      verdict,
      note: typeof v.note === "string" ? v.note : ""
    });
  }
  if (problems.length) {
    throw new Error(`${verdictsPath}: ${problems.length} malformed row(s) \u2014 fix them and re-apply (fail-closed):
  - ${problems.join("\n  - ")}`);
  }
  const result = reduceVerdicts(verdicts);
  const answerSig = answerSignatureFor(dir);
  const claims = expectedClaims(dir) ?? [...new Set(verdicts.map((v) => v.claimId))];
  writeFileSync10(join19(dir, "VERIFY.json"), JSON.stringify({ ...result, verdicts, ...answerSig ? { answerSig } : {}, claims }, null, 2));
  return result;
}
function expectedClaims(dir) {
  try {
    const todoPath = join19(dir, "VERIFY.todo.json");
    if (!existsSync10(todoPath)) return null;
    const todo = JSON.parse(readFileSync9(todoPath, "utf8"));
    if (!Array.isArray(todo?.pairs)) return null;
    return [...new Set(todo.pairs.map((p) => p.claimId))];
  } catch {
    return null;
  }
}
function answerSignatureFor(dir) {
  try {
    const answerPath = resolveAnswerPath(dir);
    const evidencePath = join19(dir, "evidence.json");
    if (!answerPath || !existsSync10(evidencePath)) return null;
    const evidence = JSON.parse(readFileSync9(evidencePath, "utf8"));
    return answerClaimSignature(readFileSync9(answerPath, "utf8"), evidence);
  } catch {
    return null;
  }
}
function reduceVerdicts(verdicts) {
  const counts = { supported: 0, partial: 0, refuted: 0, unsupported: 0 };
  for (const v of verdicts) if (v.verdict && counts[v.verdict] !== void 0) counts[v.verdict]++;
  const byClaim = /* @__PURE__ */ new Map();
  for (const v of verdicts) {
    const group = byClaim.get(v.claimId) ?? [];
    group.push(v);
    byClaim.set(v.claimId, group);
  }
  const failures = [];
  const unadjudicated = [];
  for (const [claimId, group] of byClaim) {
    const adjudicated = group.filter((g) => !!g.verdict);
    if (adjudicated.length < group.length) unadjudicated.push(claimId);
    const refuted = adjudicated.find((g) => g.verdict === "refuted");
    const hasSupport = adjudicated.some((g) => g.verdict === "supported" || g.verdict === "partial");
    if (refuted) {
      failures.push({ claimId, evidenceId: refuted.evidenceId, verdict: "refuted", note: refuted.note });
    } else if (adjudicated.length === group.length && adjudicated.length > 0 && !hasSupport) {
      const u = adjudicated.find((g) => g.verdict === "unsupported") ?? adjudicated[0];
      failures.push({ claimId, evidenceId: u.evidenceId, verdict: u.verdict, note: u.note });
    }
  }
  return {
    ok: failures.length === 0,
    pairs: verdicts.length,
    adjudicated: verdicts.filter((v) => !!v.verdict).length,
    supported: counts.supported,
    partial: counts.partial,
    refuted: counts.refuted,
    unsupported: counts.unsupported,
    failures,
    unadjudicated
  };
}
function formatVerifyReport(r) {
  const lines = [];
  lines.push(`ultradoc verify: ${r.adjudicated}/${r.pairs} pair(s) adjudicated`);
  lines.push(`  supported: ${r.supported} \xB7 partial: ${r.partial} \xB7 refuted: ${r.refuted} \xB7 unsupported: ${r.unsupported}`);
  for (const f of r.failures.slice(0, 12)) {
    lines.push(`  \u2717 ${f.claimId} (${f.evidenceId}): ${f.verdict}${f.note ? " \u2014 " + f.note : ""}`);
  }
  if (r.unadjudicated.length) {
    lines.push(`  \u26A0 ${r.unadjudicated.length} claim(s) not fully adjudicated: ${r.unadjudicated.join(", ")}`);
  }
  lines.push(r.ok ? `  \u2713 every claim is backed by a cited evidence item` : `  \u2717 some claims are refuted or unsupported`);
  return lines.join("\n");
}

// src/check.ts
var COVERAGE_MIN_DEFAULT = 0.7;
function resolveAnswerPath(dir, answerFile) {
  if (answerFile) {
    const p = join20(dir, answerFile);
    return existsSync11(p) ? p : null;
  }
  for (const name2 of ["ANSWER.md", "DOC.md"]) {
    const p = join20(dir, name2);
    if (existsSync11(p)) return p;
  }
  return null;
}
function resolves(tok, evidence, ids, refs) {
  if (SHAPE.id.test(tok)) return ids.has(tok);
  if (refs.has(tok)) return true;
  return resolveAlias(tok, evidence).length > 0;
}
var REVALIDATION = {
  // Clipped snippets only: fraction of stored lines that must re-match in order.
  // Un-clipped code/docs snippets are exact slices at build time, so anything
  // short of exact equality is corruption/staleness there.
  SNIPPET_MATCH_MIN: 0.8,
  // Failing items detailed individually per run (then "… and N more").
  MAX_REPORTED: 5
};
function pinnedClone(dir) {
  const pin = { headMatches: false };
  try {
    const metaPath = join20(dir, "meta.json");
    if (!existsSync11(metaPath)) return pin;
    const meta = JSON.parse(readFileSync10(metaPath, "utf8"));
    pin.meta = meta;
    if (!meta.commit) return pin;
    pin.recordedRepoDir = meta.repoDir;
    const repoDir = meta.repoDir && existsSync11(meta.repoDir) ? meta.repoDir : dossierRepoDir(dir);
    if (!repoDir) return pin;
    pin.repoDir = repoDir;
    const head = headCommit(repoDir);
    if (!head) return pin;
    pin.head = head;
    if (sameCommit(head, meta.commit)) {
      pin.headMatches = true;
    } else {
      pin.staleWarning = `dossier was built at ${meta.commit} but the tree is now at ${head} \u2014 line-anchored citations may have drifted; re-run \`ask\`.`;
    }
  } catch {
  }
  return pin;
}
var CLIP_MARKER_RE = /\n?… \[truncated \d+ chars\]$/;
function snippetMatches(stored, fileLines, start2, end) {
  const norm2 = (l) => l.replace(/\s+/g, " ").trim();
  const clipped = CLIP_MARKER_RE.test(stored);
  const storedLines = stored.replace(CLIP_MARKER_RE, "").split(/\r?\n/).map(norm2).filter((l) => l !== "");
  const windowLines = fileLines.slice(start2 - 1, end).map(norm2).filter((l) => l !== "");
  const total = storedLines.length;
  if (total === 0) return { ok: true, matched: 0, total: 0 };
  if (storedLines.join("\n") === windowLines.join("\n")) return { ok: true, matched: total, total };
  let matched = 0;
  let w = 0;
  for (let s = 0; s < storedLines.length; s++) {
    const last = clipped && s === storedLines.length - 1;
    while (w < windowLines.length) {
      const win = windowLines[w];
      w++;
      if (last ? win.startsWith(storedLines[s]) : storedLines[s] === win) {
        matched++;
        break;
      }
    }
  }
  const ok = clipped && matched >= Math.ceil(total * REVALIDATION.SNIPPET_MATCH_MIN);
  return { ok, matched, total };
}
var FILE_LOC_RE = /^(.+?):(\d+)(?:-(\d+))?$/;
function revalidateEvidence(pin, evidence, errors, warnings) {
  const stats = { attempted: 0, validated: 0, failures: [] };
  const candidates = evidence.filter(
    (e) => (e.source === "code" || e.source === "docs") && !!e.location && !/^https?:\/\//.test(e.ref) && !/^https?:\/\//.test(e.location)
  );
  if (!pin.meta?.commit) {
    stats.skipped = "no pinned clone recorded in meta.json";
    return stats;
  }
  if (!pin.repoDir) {
    stats.skipped = `the recorded clone ${pin.recordedRepoDir ?? "(unknown)"} no longer exists`;
    if (candidates.length) {
      warnings.push(
        `evidence re-validation skipped: the recorded clone ${pin.recordedRepoDir ?? "(unknown)"} no longer exists (cache evicted?) \u2014 cited snippets cannot be checked; re-run \`ask\` to rebuild the dossier.`
      );
    }
    return stats;
  }
  if (!pin.head) {
    stats.skipped = "the recorded clone is not a git tree";
    return stats;
  }
  if (!pin.headMatches) {
    stats.skipped = `the clone moved from ${pin.meta.commit} to ${pin.head}`;
    if (candidates.length) {
      warnings.push(
        `evidence re-validation skipped: the clone moved from ${pin.meta.commit} to ${pin.head} \u2014 line-anchored snippets cannot be checked against a different tree.`
      );
    }
    return stats;
  }
  const repoRoot = resolvePath(pin.repoDir);
  for (const item of candidates) {
    const m = FILE_LOC_RE.exec(item.location);
    if (!m) continue;
    const start2 = Number(m[2]);
    const end = m[3] ? Number(m[3]) : start2;
    stats.attempted++;
    const fail2 = (reason, detail) => {
      stats.failures.push({ id: item.id, ref: item.ref, location: item.location, reason, detail });
    };
    const abs = resolvePath(repoRoot, m[1]);
    if (abs !== repoRoot && !abs.startsWith(repoRoot + sep2)) {
      fail2("escapes-repo", "the cited path resolves outside the pinned clone");
      continue;
    }
    if (!existsSync11(abs)) {
      fail2("missing-file", `file not found in the pinned clone (${repoRoot} @ ${pin.meta.commit})`);
      continue;
    }
    let lines;
    try {
      lines = readFileSync10(abs, "utf8").split(/\r?\n/);
    } catch (e) {
      fail2("missing-file", `file is unreadable (${e.message})`);
      continue;
    }
    if (start2 < 1 || end < start2 || end > lines.length) {
      fail2("range-out-of-bounds", `line range is out of bounds (file has ${lines.length} line(s) at ${pin.meta.commit})`);
      continue;
    }
    const r = snippetMatches(item.snippet, lines, start2, end);
    if (r.ok) stats.validated++;
    else
      fail2(
        "snippet-mismatch",
        `stored snippet does not match those lines (${r.matched}/${r.total} line(s) match); the dossier is stale or was modified \u2014 re-run \`ask\` and re-cite`
      );
  }
  for (const f of stats.failures.slice(0, REVALIDATION.MAX_REPORTED)) {
    const src = evidence.find((e) => e.id === f.id)?.source ?? "code";
    errors.push(`[${f.id}] ${src} ${f.location} \u2014 ${f.detail}.`);
  }
  if (stats.failures.length > REVALIDATION.MAX_REPORTED) {
    errors.push(`\u2026 and ${stats.failures.length - REVALIDATION.MAX_REPORTED} more failing excerpt(s).`);
  }
  if (stats.failures.length) {
    errors.push(
      `${stats.failures.length} evidence excerpt(s) no longer match the pinned clone at ${pin.meta.commit} \u2014 citations built on them are not grounded.`
    );
  }
  return stats;
}
function headingsOf(answer) {
  const lines = answer.split("\n");
  const fenced = codeMask(lines);
  const out2 = [];
  for (let i2 = 0; i2 < lines.length; i2++) {
    if (fenced[i2]) continue;
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[i2]);
    if (m) out2.push(m[1].trim().toLowerCase());
  }
  return out2;
}
function missingDocSections(dir, answerPath, answer) {
  if (basename5(answerPath) !== "DOC.md") return void 0;
  const planPath = join20(dir, "DOC.plan.json");
  if (!existsSync11(planPath)) return void 0;
  let plan;
  try {
    plan = JSON.parse(readFileSync10(planPath, "utf8"));
  } catch {
    return void 0;
  }
  const headings = headingsOf(answer);
  const missing = (plan.sections ?? []).map((s) => s.title).filter((title) => !headings.some((h) => h.includes(title.toLowerCase())));
  if (missing.length) return `DOC.md is missing planned section(s): ${missing.join(", ")}. Write each section from DOC.todo.md or drop it from the plan.`;
  return void 0;
}
function dossierRepoDir(dir) {
  let d = dir;
  for (let i2 = 0; i2 < 6; i2++) {
    if (basename5(d) === ".ultradoc") return dirname5(d);
    const parent = dirname5(d);
    if (parent === d) break;
    d = parent;
  }
  return void 0;
}
function answerClaimSignature(answer, evidence) {
  const parts2 = [];
  for (const u of extractClaimUnits(answer)) {
    for (const part of u.kind === "text" ? [u.text] : u.items) {
      const ids = citedEvidenceIds(part, evidence);
      if (!ids.length) continue;
      const text = part.replace(/\s+/g, " ").trim();
      parts2.push(`${text}::${[...new Set(ids)].sort().join(",")}`);
    }
  }
  return createHash2("sha256").update(parts2.join("\n")).digest("hex").slice(0, 32);
}
function applySemantic(dir, result, answer, evidence, allowUnverified = false, answerFile) {
  const p = join20(dir, "VERIFY.json");
  const unverified = (what) => {
    const fix = "run `verify` then `verify --apply <verdicts.json>` first";
    if (allowUnverified) {
      result.warnings.push(`--semantic: ${what} \u2014 ${fix}; semantic gate skipped (--allow-unverified).`);
    } else {
      result.ok = false;
      result.errors.push(`--semantic: ${what} \u2014 ${fix}, or pass --allow-unverified to skip the semantic gate explicitly.`);
    }
  };
  if (!existsSync11(p)) {
    unverified("no VERIFY.json");
    return;
  }
  let sem;
  try {
    sem = JSON.parse(readFileSync10(p, "utf8"));
  } catch (e) {
    unverified(`VERIFY.json is unreadable (${e.message})`);
    return;
  }
  if (!Array.isArray(sem.verdicts) || sem.verdicts.length === 0) {
    unverified("VERIFY.json records no verdicts");
    return;
  }
  const currentSig = answerClaimSignature(answer, evidence);
  if (typeof sem.answerSig !== "string" || sem.answerSig.length === 0) {
    unverified("VERIFY.json is not bound to an answer (missing answerSig) \u2014 re-run `verify --apply` so the gate can confirm it matches the current answer");
    return;
  }
  if (sem.answerSig !== currentSig) {
    unverified(
      "ANSWER.md changed since `verify --apply` (a claim was added, removed, or reworded) \u2014 the VERIFY.json ledger no longer covers the current answer; re-run `verify` and `verify --apply`"
    );
    return;
  }
  let expectedClaims2 = [];
  try {
    expectedClaims2 = [...new Set(buildWorklist(dir, { answerFile }).worklist.pairs.map((p2) => p2.claimId))];
  } catch {
    expectedClaims2 = [];
  }
  if (expectedClaims2.length) {
    const adjudicatedClaims = new Set(sem.verdicts.filter((v) => !!v.verdict).map((v) => v.claimId));
    const missing = expectedClaims2.filter((c2) => !adjudicatedClaims.has(c2));
    if (missing.length) {
      unverified(
        `VERIFY.json is missing an adjudicated verdict for ${missing.length} cited claim(s) (${missing.join(", ")}) \u2014 the ledger does not cover the whole answer; re-run \`verify\` and \`verify --apply\``
      );
      return;
    }
  }
  const reduced = reduceVerdicts(sem.verdicts);
  result.semantic = { ...reduced, verdicts: sem.verdicts };
  if (reduced.adjudicated === 0) {
    unverified("VERIFY.json contains rows but 0 adjudicated verdicts \u2014 the support gate never engaged (re-run verify --apply with valid verdict tokens)");
    return;
  }
  if (!reduced.ok) {
    result.ok = false;
    result.errors.push(`Semantic verification failed: ${reduced.failures.length} claim(s) refuted or unsupported by their cited evidence (see VERIFY.json).`);
  }
  if (reduced.unadjudicated?.length) {
    result.warnings.push(`${reduced.unadjudicated.length} claim(s) not fully adjudicated by verify.`);
  }
}
function checkRun(dir, opts = {}) {
  const errors = [];
  const warnings = [];
  const coverageMin = opts.strict ? 1 : opts.coverageMin ?? COVERAGE_MIN_DEFAULT;
  const answerPath = resolveAnswerPath(dir, opts.answerFile);
  const evidencePath = join20(dir, "evidence.json");
  if (!existsSync11(evidencePath)) {
    return {
      ok: false,
      citations: [],
      resolved: [],
      dangling: [],
      uncited: [],
      errors: [`No evidence.json in ${dir} \u2014 run \`ultradoc ask\` first.`],
      warnings: []
    };
  }
  let evidence;
  try {
    evidence = JSON.parse(readFileSync10(evidencePath, "utf8"));
  } catch (e) {
    return {
      ok: false,
      citations: [],
      resolved: [],
      dangling: [],
      uncited: [],
      errors: [`evidence.json is unreadable: ${e.message}`],
      warnings: []
    };
  }
  if (!answerPath) {
    const which = opts.answerFile ?? "ANSWER.md or DOC.md";
    return {
      ok: false,
      citations: [],
      resolved: [],
      dangling: [],
      uncited: evidence.map((e) => e.id),
      errors: [`No ${which} in ${dir} \u2014 write the grounded answer there, then re-run check.`],
      warnings: []
    };
  }
  const answer = readFileSync10(answerPath, "utf8");
  const ids = new Set(evidence.map((e) => e.id));
  const refs = new Set(evidence.map((e) => e.ref));
  const { tokens: citations, fencedOnly } = collectCitations(answer);
  const resolved = [];
  const dangling = [];
  for (const c2 of citations) {
    if (resolves(c2, evidence, ids, refs)) resolved.push(c2);
    else dangling.push(c2);
  }
  const citedIds = new Set(resolved.filter((c2) => SHAPE.id.test(c2)));
  const uncited = evidence.map((e) => e.id).filter((id) => !citedIds.has(id));
  const coverage2 = claimCoverage(answer, evidence);
  if (citations.length === 0) {
    errors.push(`${basename5(answerPath)} contains no citations \u2014 a grounded answer must cite evidence ids like [E1].`);
  }
  if (dangling.length) {
    errors.push(`Dangling citation(s) not in evidence.json: ${dangling.join(", ")}`);
  }
  if (coverage2.ratio < coverageMin && (opts.strict || coverage2.claims >= 3)) {
    const pct = Math.round(coverage2.ratio * 100);
    errors.push(
      `Only ${coverage2.cited}/${coverage2.claims} claim(s) cite evidence (${pct}% < ${Math.round(coverageMin * 100)}% required) \u2014 ground each claim in an evidence id or run \`check --coverage-min\` lower if this is intentional.`
    );
  }
  if (coverage2.ratio < 1 && coverage2.uncited.length) {
    const shown = coverage2.uncited.slice(0, 5).map((u) => `"${u}"`).join("; ");
    warnings.push(`${coverage2.claims - coverage2.cited} claim(s) cite no evidence (coverage ${Math.round(coverage2.ratio * 100)}%): ${shown}`);
  }
  if (fencedOnly.length) {
    const msg = `${fencedOnly.length} citation-like token(s) appear only inside code fences and do not ground any claim: ${fencedOnly.join(", ")}`;
    if (opts.strict) errors.push(msg);
    else warnings.push(msg);
  }
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const issueOnly = [];
  let issueOnlyCount = 0;
  for (const u of extractClaimUnits(answer)) {
    for (const part of u.kind === "text" ? [u.text] : u.items) {
      const cited = citedEvidenceIds(part, evidence).map((id) => byId.get(id)).filter((e) => !!e);
      if (cited.length && cited.every((e) => e.source === "issue" || e.source === "pr")) {
        issueOnlyCount++;
        if (issueOnly.length < 3) issueOnly.push(`"${part.trim().slice(0, 120)}"`);
      }
    }
  }
  if (issueOnlyCount) {
    warnings.push(
      `${issueOnlyCount} claim(s) are grounded only in issue/PR evidence \u2014 a tracker thread describes behavior at a point in time; cross-check the current source and cite the code or the fixing release alongside: ${issueOnly.join("; ")}`
    );
  }
  const missingSections = missingDocSections(dir, answerPath, answer);
  if (missingSections) errors.push(missingSections);
  if (citations.length > 0 && citedIds.size === 0) {
    warnings.push("No evidence ids were cited (only typed aliases). Prefer citing ids like [E1].");
  } else if (uncited.length) {
    warnings.push(`${uncited.length} evidence item(s) were not cited (informational).`);
  }
  const pin = pinnedClone(dir);
  if (pin.staleWarning) warnings.push(pin.staleWarning);
  const revalidation = revalidateEvidence(pin, evidence, errors, warnings);
  const result = {
    ok: errors.length === 0,
    citations,
    resolved,
    dangling,
    uncited,
    errors,
    warnings,
    coverage: coverage2,
    fencedOnly,
    revalidation
  };
  if (opts.semantic) applySemantic(dir, result, answer, evidence, opts.allowUnverified, opts.answerFile);
  return result;
}
function formatCheckReport(r, dir) {
  const lines = [];
  lines.push(`ultradoc check: ${dir}`);
  lines.push(`  citations: ${r.citations.length} \xB7 resolved: ${r.resolved.length} \xB7 dangling: ${r.dangling.length}`);
  if (r.coverage) {
    lines.push(`  coverage:  ${r.coverage.cited}/${r.coverage.claims} claim(s) cited (${Math.round(r.coverage.ratio * 100)}%)`);
  }
  if (r.revalidation) {
    const v = r.revalidation;
    if (v.skipped) {
      if (v.skipped !== "no pinned clone recorded in meta.json") lines.push(`  evidence:  re-validation skipped (${v.skipped})`);
    } else if (v.attempted > 0) {
      lines.push(`  evidence:  re-validated ${v.validated}/${v.attempted} code/docs excerpt(s) against the pinned clone`);
    }
  }
  if (r.semantic) {
    const s = r.semantic;
    lines.push(`  semantic: supported ${s.supported} \xB7 partial ${s.partial} \xB7 refuted ${s.refuted} \xB7 unsupported ${s.unsupported}`);
    for (const f of s.failures.slice(0, 8)) lines.push(`  \u2717 semantic ${f.claimId} (${f.evidenceId}): ${f.verdict}`);
  }
  for (const e of r.errors) lines.push(`  \u2717 ${e}`);
  for (const w of r.warnings) lines.push(`  \u26A0 ${w}`);
  lines.push(r.ok ? `  \u2713 answer is grounded \u2014 every citation resolves to evidence` : `  \u2717 answer is NOT grounded`);
  return lines.join("\n");
}

// src/cache.ts
import { existsSync as existsSync12, readdirSync as readdirSync4, rmSync, statSync as statSync6 } from "fs";
import { join as join21 } from "path";
function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = readdirSync4(dir);
  } catch {
    return 0;
  }
  for (const name2 of entries) {
    const p = join21(dir, name2);
    let st;
    try {
      st = statSync6(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) total += dirSize(p);
    else total += st.size;
  }
  return total;
}
function cacheStatus() {
  const root = cacheRoot();
  const repos = [];
  let slugs = [];
  try {
    slugs = readdirSync4(root).filter((n) => {
      try {
        return statSync6(join21(root, n)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
  }
  for (const slug of slugs) {
    if (slug === "compose") continue;
    const dir = join21(root, slug);
    repos.push({ slug, dir, bytes: dirSize(dir), commit: headCommit(dir) });
  }
  repos.sort((a, b) => b.bytes - a.bytes);
  return { root, repos, totalBytes: repos.reduce((s, r) => s + r.bytes, 0) };
}
function cacheClean(opts) {
  const root = cacheRoot();
  const removed = [];
  if (opts.all) {
    for (const r of cacheStatus().repos) {
      try {
        rmSync(r.dir, { recursive: true, force: true });
        removed.push(r.slug);
      } catch {
      }
    }
    return { removed };
  }
  if (opts.repo) {
    const slug = resolveRepo(opts.repo).slug;
    const dir = join21(root, slug);
    if (existsSync12(dir)) {
      rmSync(dir, { recursive: true, force: true });
      removed.push(slug);
    }
  }
  return { removed };
}
function formatCacheStatus(s) {
  const mb = (b) => (b / (1024 * 1024)).toFixed(1) + " MB";
  const lines = [`ultradoc cache: ${s.root}`, `  ${s.repos.length} repo(s) \xB7 ${mb(s.totalBytes)} total`];
  for (const r of s.repos.slice(0, 20)) {
    lines.push(`  ${r.slug}  ${mb(r.bytes)}${r.commit ? ` @ ${r.commit.slice(0, 8)}` : ""}`);
  }
  if (s.repos.length > 20) lines.push(`  \u2026 +${s.repos.length - 20} more`);
  return lines.join("\n");
}

// src/orchestrate.ts
import { existsSync as existsSync13, mkdirSync as mkdirSync10, readFileSync as readFileSync11, writeFileSync as writeFileSync11 } from "fs";
import { join as join24, resolve as resolve3 } from "path";

// src/orchestrate-templates.ts
import { join as join23 } from "path";
var ONE_WRITER_FOOTER = `
## Return, don't write

Return ONLY the structured output specified above. Do NOT write, edit, or delete any file; do NOT run any engine command that writes (\`ask\`, \`doc\`, \`verify --run\`, \`verify --apply\`, \`overview\`, \`index\`, \`semantic up|down\`, \`cache clean\`). The orchestrator is the sole writer \u2014 it folds your fragments into the run itself and runs the grounding gates. Exception: if a justification is prose too large to return, write ONLY to \`<RUN>/orchestration/out/<role>-<batch>.md\` (a file namespaced to you alone) and return its path.
`;
var DRILL_SCHEMA = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      maxItems: 8,
      description: "the \u22648 triaged evidence items for this WHOLE leaf (the lean-return contract)",
      items: {
        type: "object",
        required: ["cell", "ref", "quote"],
        properties: {
          cell: { type: "string", description: "the drill cell id (D#)" },
          ref: { type: "string", description: "file:line / issue#N / pr#N / url" },
          source: { type: "string" },
          evidenceId: { type: "string", description: "the [E#] id when the item already exists in the run's dossier" },
          quote: { type: "string", description: "the single load-bearing quote" }
        }
      }
    },
    dry: { type: "array", items: { type: "string" }, description: "cell ids that surfaced nothing on-topic" }
  }
};
var VERIFY_SCHEMA = {
  type: "object",
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        required: ["claimId", "evidenceId", "verdict", "note"],
        properties: {
          claimId: { type: "string" },
          evidenceId: { type: "string" },
          verdict: { enum: ["supported", "partial", "refuted", "unsupported"] },
          note: { type: "string", description: "one line grounded in the digest/current source you read" }
        }
      }
    }
  }
};
var DOC_SCHEMA = {
  type: "object",
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "markdown"],
        properties: {
          id: { type: "string", description: "the section id (S#)" },
          markdown: { type: "string", description: "the section's cited prose (heading included, every claim cites [E#])" },
          gaps: { type: "array", items: { type: "string" }, description: "sub-topics the evidence does not settle (explicit unknowns)" }
        }
      }
    }
  }
};
var PHASE_SPECS = {
  drill: {
    role: "explorer",
    title: "Drill",
    schema: DRILL_SCHEMA,
    description: (n) => `Fan out the ${n} retrieval drill cell(s) of an ultradoc run (explorer fan-out, triaged returns)`,
    fold: "triages the returned items into the answer (citing resolvable [E#]/refs, drilling any new lead itself)",
    applyHint: (engine, _worklist, run3) => `node ${engine} check --run ${run3} --strict`
  },
  verify: {
    role: "skeptic",
    title: "Verify",
    schema: VERIFY_SCHEMA,
    description: (n) => `Adversarially verify the ${n} claim\u2194evidence pair(s) of an ultradoc answer (skeptic fan-out)`,
    fold: 'merges EVERY returned verdict into ONE verdicts.json ({ "pairs": [ \u2026 ] })',
    applyHint: (engine, _worklist, run3) => `node ${engine} verify --apply verdicts.json --run ${run3} && node ${engine} check --run ${run3} --semantic`
  },
  doc: {
    role: "section-writer",
    title: "Write",
    schema: DOC_SCHEMA,
    description: (n) => `Draft the ${n} outline section(s) of an ultradoc reference doc (section-writer fan-out)`,
    fold: "assembles the returned section drafts into DOC.md in plan order",
    applyHint: (engine, _worklist, run3) => `node ${engine} check --run ${run3}`
  }
};
function phaseSpec(name2) {
  const spec = PHASE_SPECS[name2];
  if (!spec) throw new Error(`no phase spec for "${name2}"`);
  return spec;
}
function toBatches(ids, batchSize) {
  const out2 = [];
  for (let i2 = 0; i2 < ids.length; i2 += batchSize) out2.push(ids.slice(i2, i2 + batchSize));
  return out2;
}
function phaseWorkflowScript(ph, runAbs, engineAbs, batchSize) {
  const spec = phaseSpec(ph.name);
  const scriptPath = join23(runAbs, "orchestration", `${ph.name}.workflow.mjs`);
  const meta = { name: `ultradoc-${ph.name}`, description: spec.description(ph.items), phases: [{ title: spec.title }] };
  return [
    `export const meta = ${JSON.stringify(meta)}`,
    ``,
    `// NOT a plain Node script: launch via the Workflow tool \u2014 Workflow({ scriptPath: ${JSON.stringify(scriptPath)} }).`,
    `// Emitted by \`ultradoc orchestrate\` from the CURRENT worklist. The worklist is the source`,
    `// of truth: if it changes, re-run \`orchestrate --phase ${ph.name}\` before launching.`,
    ``,
    `// Constants for THIS run (injected at emit time; no Date.now/Math.random in this harness).`,
    `const RUN = ${JSON.stringify(runAbs)}`,
    `const ENGINE = ${JSON.stringify(engineAbs)}`,
    `const WORKLIST = ${JSON.stringify(ph.worklist)}`,
    `const AGENTS = RUN + '/orchestration/agents'`,
    `const BATCHES = ${JSON.stringify(toBatches(ph.ids, batchSize))}`,
    `const SCHEMA = ${JSON.stringify(spec.schema)}`,
    ``,
    `function contract(name, extra) {`,
    `  return 'Read and follow the dispatch contract at ' + AGENTS + '/' + name + '.md VERBATIM.\\n'`,
    `    + 'Constants: RUN=' + RUN + '  ENGINE=' + ENGINE + '  WORKLIST=' + WORKLIST + '.\\n'`,
    `    + 'Invoke the engine only by its ABSOLUTE path: node ' + ENGINE + ' <cmd> \u2014 read-only commands only.'`,
    `    + (extra ? '\\n' + extra : '')`,
    `}`,
    ``,
    `log('ultradoc ${ph.name}: ' + ${JSON.stringify(String(ph.items))} + ' item(s) across ' + BATCHES.length + ' agent(s)')`,
    ``,
    `phase(${JSON.stringify(spec.title)})`,
    `const results = await pipeline(BATCHES, (batch, _item, i) =>`,
    `  agent(contract('${spec.role}', 'ITEMS=' + batch.join(',')), { label: '${ph.name}:' + (i + 1), phase: ${JSON.stringify(spec.title)}, agentType: 'general-purpose', schema: SCHEMA }))`,
    ``,
    `// One-writer rule: this workflow only COLLECTS fragments. The main agent`,
    `// ${spec.fold}, then runs:`,
    `//   ${spec.applyHint(engineAbs, ph.worklist, runAbs)}`,
    `return { phase: ${JSON.stringify(ph.name)}, worklist: WORKLIST, results: results.filter(Boolean) }`,
    ``
  ].join("\n");
}
function agentContracts(runAbs, engineAbs) {
  const footer = ONE_WRITER_FOOTER.replaceAll("<RUN>", () => runAbs);
  return {
    explorer: `# Contract: explorer

You run ONE slice of an ultradoc retrieval fan-out \u2014 a few drill cells, each one stateless, read-only CLI call against the cached clone+index. Recall is the first lever of a grounded answer: your cells are exactly the query-variant \xD7 source pairs the seed \`ask\` did not cover.

Worklist: \`${join23(runAbs, "drill-plan.json")}\` (an object with \`question\`, \`repo\`, optional \`ref\`/\`pkg\`, and \`cells[]\`; each cell has \`id\`, \`variant\`, \`query\`, \`source\`). Handle ONLY the cells whose \`id\` is named in your prompt (\`ITEMS=<id,\u2026>\`).

For EACH of your cells:

1. Compose the drill command \u2014 the cell's \`source\` maps to a CLI command (code\u2192\`code\`, docs\u2192\`docs\`, release\u2192\`releases\`, history\u2192\`history\`, issue\u2192\`issues\`, pr\u2192\`prs\`, discussion\u2192\`discussions\`, so\u2192\`so\`, web\u2192\`web\`):
   \`node ${engineAbs} <command> --repo <plan.repo> --q <cell.query>\` (add \`--package <plan.pkg>\` / \`--ref <plan.ref>\` when the plan sets them).
   Queries are free text \u2014 quote them safely for YOUR shell (single-quote and escape embedded \`'\`; never paste a query into double quotes where \`$\`/backticks expand), and quote \`<plan.repo>\` too.
2. Run it and read the printed evidence. These single-source drills print to stdout and write nothing \u2014 they are the only engine commands you may run.
3. Triage before returning (playbook rules): keep an item only if its snippet names the symbol/behavior or describes the same mechanism, not just a shared keyword. Drop keyword-coincidences, vendored/example/fixture code, and superseded discussion.

Return ONLY triaged evidence (structured output): \`{ "items": [{ "cell", "ref", "source", "evidenceId", "quote" }], "dry": [cell ids that surfaced nothing on-topic] }\` \u2014 for each kept item, its \`ref\` (file:line / issue#/pr#/url), its evidence id if it came from the run's dossier, and the single load-bearing quote. **Max ~8 items per leaf.** **Never return the raw dossier** \u2014 a subagent that dumps printed EVIDENCE output back is worse than no subagent, because the whole point was to keep the orchestrator's context lean.
${footer}`,
    skeptic: `# Contract: skeptic

You are an adversarial skeptic verifying that an ultradoc answer's citations actually SUPPORT its claims. Default to disbelief: the cited evidence must back the claim, not merely mention its keywords.

Worklist: \`${join23(runAbs, "VERIFY.todo.json")}\` (an object with \`pairs[]\`; each pair has \`claimId\`, \`claim\`, \`evidenceId\`, \`ref\`, \`source\`, \`digest\`, and sometimes \`crossCheck: true\`). Handle ONLY the pairs whose \`<claimId>:<evidenceId>\` id is named in your prompt (\`ITEMS=<id,\u2026>\`).

For EACH of your pairs:

1. Read the \`claim\` against the \`digest\` (the cited item's snippet). When the digest alone cannot settle it, open the underlying source (\`ref\`: a file in the pinned clone, an issue/PR, a doc/web url).
2. Judge whether the evidence supports the claim:
   - \`supported\` \u2014 the digest literally states the claim.
   - \`partial\` \u2014 the digest backs some of the claim but not all of it.
   - \`unsupported\` \u2014 the digest is on-topic but does **not** state the claim.
   - \`refuted\` \u2014 the digest **contradicts** the claim.
   When unsure, choose the HARSHER verdict (\`unsupported\` over \`partial\`) \u2014 a false pass is worse than a false fail.
3. A pair flagged \`crossCheck\` (\u26A0 cross-check in VERIFY.md) is grounded in an issue or PR \u2014 a tracker thread describes behavior at a point in time. Judge it against the CURRENT code: if the current source contradicts the claim, mark it \`refuted\`; if the behavior changed later, mark it \`partial\` and demand a temporal qualifier citing the fixing release. Never present stale tracker behavior as current just because the claim is faithful to the thread.
4. \`note\` is REQUIRED \u2014 one line grounded in what you read (quote or paraphrase the decisive text).

Return (structured output): \`{ "verdicts": [{ "claimId", "evidenceId", "verdict", "note" }] }\` \u2014 your ITEMS only.
${footer}`,
    "section-writer": `# Contract: section-writer

You draft section(s) of an ultradoc grounded reference doc. The engine already retrieved and merged the evidence; your job is cited prose, not new retrieval.

Worklist: \`${join23(runAbs, "DOC.plan.json")}\` (a plan with \`sections[]\`; each section has \`id\`, \`title\`, \`query\`, \`evidenceIds\`). Handle ONLY the sections whose \`id\` is named in your prompt (\`ITEMS=<id,\u2026>\`).

For EACH of your sections:

1. Read its entry in \`${join23(runAbs, "DOC.todo.md")}\` and the cited snippets in \`${join23(runAbs, "EVIDENCE.md")}\` (\`evidence.json\` holds the full items).
2. Draft the section's markdown: its heading plus grounded prose where EVERY factual claim cites a resolvable evidence id like \`[E3]\`. Cite only ids that exist in the run's \`evidence.json\`; never write from memory.
3. Thin evidence? You may drill read-only for context (\`node ${engineAbs} code|docs|issues|prs|releases|history|discussions|so|web --repo \u2026 --q "\u2026"\`), but a claim may still only cite the run's existing \`[E#]\` ids \u2014 anything the dossier does not contain stays a gap.
4. State what the evidence does not settle in \`gaps\` (explicit unknowns) instead of papering over it.

Return (structured output): \`{ "sections": [{ "id", "markdown", "gaps" }] }\` \u2014 your ITEMS only. The orchestrator assembles \`DOC.md\` in plan order and runs the check gate.
${footer}`
  };
}
function runbookMd(phases, runAbs, engineAbs) {
  const status = phases.map((p) => `| ${p.name} | \`${p.worklist}\` | ${p.ready ? `ready (${p.items} item(s))` : "not ready"} | \`${p.prerequisite}\` |`).join("\n");
  const engine = `node ${engineAbs}`;
  return `# ultradoc \u2014 sequential RUNBOOK (eco / no-subagent fallback)

Run: \`${runAbs}\` \xB7 Engine: \`${engine}\`

Generated by \`ultradoc orchestrate\` from the CURRENT run state. This sequential path is
correctness-identical to the multi-agent workflows \u2014 same worklists, same contracts, same
grounding gates; only wall-clock differs. Fan-out is an optimization, not a requirement.

## Phase status

| Phase | Worklist | Status | Produce it with |
|---|---|---|---|
${status}

## The loop (play every role yourself, one item at a time)

1. **Seed** (if not done): \`${engine} ask --repo <url|path> --q "<question>" --out ${runAbs}\` \u2192 \`${join23(runAbs, "EVIDENCE.md")}\`, \`${join23(runAbs, "evidence.json")}\` and the drill plan \`${join23(runAbs, "drill-plan.json")}\`.
2. **Drill the plan** \u2014 for EVERY cell in \`${join23(runAbs, "drill-plan.json")}\`, apply \`${join23(runAbs, "orchestration", "agents", "explorer.md")}\` yourself (run the cell's read-only drill command, triage, keep \u22648 items per round). When your harness runs parallel tool-calls, batch the independent drills of a round in one message.
3. **Write** \`${join23(runAbs, "ANSWER.md")}\` (cite \`[E#]\`), then gate: \`${engine} check --run ${runAbs} --strict\`.
4. **Verify the claims** \u2014 \`${engine} verify --run ${runAbs}\` writes \`${join23(runAbs, "VERIFY.todo.json")}\`. For EVERY pair, apply \`${join23(runAbs, "orchestration", "agents", "skeptic.md")}\` yourself (verdict supported/partial/refuted/unsupported + note), collect every verdict into ONE \`${join23(runAbs, "verdicts.json")}\`, then fold: \`${engine} verify --apply verdicts.json --run ${runAbs}\`.
5. **Gate**: \`${engine} check --semantic --run ${runAbs}\` must exit 0 before presenting anything.
6. **Doc mode** (a whole-project doc instead of one answer): \`${engine} doc --repo <url|path> --out ${runAbs}\` writes \`${join23(runAbs, "DOC.plan.json")}\` + \`${join23(runAbs, "DOC.todo.md")}\`. For EVERY section, apply \`${join23(runAbs, "orchestration", "agents", "section-writer.md")}\` yourself and assemble \`${join23(runAbs, "DOC.md")}\` in plan order; then steps 4\u20135 (the gates auto-detect DOC.md).

With subagents available, prefer the emitted workflows instead: \`orchestrate --run ${runAbs} --phase <p>\` then \`Workflow({ scriptPath: "${join23(runAbs, "orchestration", "<p>.workflow.mjs")}" })\` \u2014 you stay the sole writer either way.
`;
}

// src/orchestrate.ts
var PHASES = ["drill", "verify", "doc"];
var SMALL_WORKLIST = 3;
var BATCH_SIZE = 8;
function listPhases(runDir, engineAbs) {
  const run3 = resolve3(runDir);
  const drillPath = join24(run3, "drill-plan.json");
  let drillIds = [];
  let drillReady = false;
  if (existsSync13(drillPath)) {
    try {
      const plan = JSON.parse(readFileSync11(drillPath, "utf8"));
      if (plan && Array.isArray(plan.cells)) {
        drillReady = true;
        drillIds = plan.cells.map((c2) => c2.id);
      }
    } catch {
    }
  }
  const verPath = join24(run3, "VERIFY.todo.json");
  let verIds = [];
  let verReady = false;
  if (existsSync13(verPath)) {
    try {
      const todo = JSON.parse(readFileSync11(verPath, "utf8"));
      if (todo && Array.isArray(todo.pairs)) {
        verReady = true;
        verIds = todo.pairs.map((p) => `${p.claimId}:${p.evidenceId}`);
      }
    } catch {
    }
  }
  const docPath = join24(run3, "DOC.plan.json");
  let docIds = [];
  let docReady = false;
  if (existsSync13(docPath)) {
    try {
      const plan = JSON.parse(readFileSync11(docPath, "utf8"));
      if (plan && Array.isArray(plan.sections)) {
        docReady = true;
        docIds = plan.sections.map((s) => s.id);
      }
    } catch {
    }
  }
  return [
    {
      name: "drill",
      ready: drillReady,
      worklist: drillPath,
      items: drillIds.length,
      ids: drillIds,
      prerequisite: `node ${engineAbs} ask --repo <url|path> --q "<question>" --out ${run3}`
    },
    {
      name: "verify",
      ready: verReady,
      worklist: verPath,
      items: verIds.length,
      ids: verIds,
      prerequisite: `node ${engineAbs} verify --run ${run3}`
    },
    {
      name: "doc",
      ready: docReady,
      worklist: docPath,
      items: docIds.length,
      ids: docIds,
      prerequisite: `node ${engineAbs} doc --repo <url|path> --out ${run3}`
    }
  ];
}
function orchestrateRun(runDir, engineAbs, opts = {}) {
  const run3 = resolve3(runDir);
  if (!existsSync13(run3)) {
    return { exitCode: 2, written: [], notices: [], errors: [`run dir not found: ${run3}`], phases: [] };
  }
  const phases = listPhases(run3, engineAbs);
  let selected = phases.filter((p) => p.ready);
  if (opts.phase !== void 0) {
    const ph = phases.find((p) => p.name === opts.phase);
    if (!ph) {
      return {
        exitCode: 2,
        written: [],
        notices: [],
        errors: [`unknown phase "${opts.phase}" \u2014 expected one of: ${PHASES.join(", ")}.`],
        phases
      };
    }
    if (!ph.ready) {
      return {
        exitCode: 2,
        written: [],
        notices: [],
        errors: [`phase "${ph.name}" is not ready \u2014 its worklist ${ph.worklist} does not exist yet. Produce it first: ${ph.prerequisite}`],
        phases
      };
    }
    selected = [ph];
  }
  const orchDir = join24(run3, "orchestration");
  const agentsDir = join24(orchDir, "agents");
  mkdirSync10(join24(orchDir, "out"), { recursive: true });
  mkdirSync10(agentsDir, { recursive: true });
  const written = [];
  const notices = [];
  for (const [name2, content] of Object.entries(agentContracts(run3, engineAbs))) {
    const p = join24(agentsDir, `${name2}.md`);
    writeFileSync11(p, content);
    written.push(p);
  }
  if (!opts.eco) {
    for (const ph of selected) {
      if (ph.items === 0) {
        notices.push(`phase "${ph.name}": worklist is empty \u2014 nothing to orchestrate.`);
        continue;
      }
      if (ph.items <= SMALL_WORKLIST) {
        notices.push(`phase "${ph.name}": only ${ph.items} item(s) \u2014 the sequential --eco path is equivalent and cheaper.`);
      }
      const p = join24(orchDir, `${ph.name}.workflow.mjs`);
      writeFileSync11(p, phaseWorkflowScript(ph, run3, engineAbs, BATCH_SIZE));
      written.push(p);
    }
  }
  const rb = join24(orchDir, "RUNBOOK.md");
  writeFileSync11(rb, runbookMd(phases, run3, engineAbs));
  written.push(rb);
  return { exitCode: 0, written, notices, errors: [], phases };
}

// src/cli.ts
var HELP2 = `ultradoc v${VERSION}
Answer ultra-precise questions about an open-source project from its real source
code, issues, PRs, docs and the web \u2014 grounded retrieval, not the model's memory.

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
  web        Discover + fetch web pages (keyless: SearXNG \u2192 DuckDuckGo \u2192 WebSearch).
  overview   Generate (once) a cached markdown digest of the repo \u2014 packages,
             layout, public API, docs map \u2014 to answer follow-up questions
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
  verify     Emit a claim\u2194evidence worklist for adversarial support-checking,
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
  --max-verify <n>     For 'verify': cap how many claim\u2194evidence pairs to emit  (default: 40)
  --phase <name>       For 'orchestrate': emit one phase only \u2014 drill | verify | doc
                       (exit 2 when its worklist does not exist yet)
  --eco                For 'orchestrate': emit only RUNBOOK.md + agents/*.md \u2014 the
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
  prose is uncited \u2014 the mechanical guard against answering from memory.

Environment (all optional, keyless by default):
  GITHUB_TOKEN               Raise the GitHub REST rate limit on the keyless fallback.
  GITLAB_TOKEN               Read private GitLab projects / lift limits (PRIVATE-TOKEN).
  ULTRADOC_CACHE_DIR         Override the clone/index cache root (persistent per-user).
  ULTRADOC_EXTDOCS_TTL_HOURS External-docs cache freshness before refetch (default 168).
  ULTRADOC_MAX_FILES, \u2026      Raise index/scan/retrieval caps (see references).
`;
var COMMANDS = /* @__PURE__ */ new Set([
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
  "cache"
]);
var VALUE_FLAGS = /* @__PURE__ */ new Set([
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
  "phase"
]);
var BOOL_FLAGS = /* @__PURE__ */ new Set(["semantic", "json", "refresh", "strict", "all", "allow-unverified", "eco", "list"]);
function fail(message) {
  process.stderr.write(`ultradoc: ${message}
`);
  process.exit(1);
}
function oneOf(name2, value, allowed) {
  if (!allowed.includes(value)) {
    fail(`invalid --${name2} "${value}" (expected: ${allowed.join(", ")})`);
  }
  return value;
}
function parseArgs(argv) {
  if (argv.length === 0) {
    process.stdout.write(HELP2);
    process.exit(0);
  }
  if (argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP2);
    process.exit(0);
  }
  if (argv[0] === "-v" || argv[0] === "--version") {
    process.stdout.write(VERSION + "\n");
    process.exit(0);
  }
  const command = argv[0];
  if (!COMMANDS.has(command)) {
    fail(`unknown command: ${command} (run --help for usage)`);
  }
  const values = {};
  const bools = /* @__PURE__ */ new Set();
  const positional = [];
  for (let i2 = 1; i2 < argv.length; i2++) {
    const arg = argv[i2];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP2);
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
      let value;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        const next = argv[i2 + 1];
        if (next === void 0 || next.startsWith("--")) {
          fail(`missing value for --${key}`);
        }
        value = next;
        i2++;
      }
      values[key] = value;
      continue;
    }
    positional.push(arg);
  }
  return { command, positional, values, bools };
}
var SOURCE_TOKENS = {
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
  stackoverflow: "so"
};
var DEFAULT_SOURCES = ["code", "issue", "pr", "docs"];
function parseSources(s) {
  const out2 = [];
  for (const t of s.split(",").map((x) => x.trim()).filter(Boolean)) {
    const k = SOURCE_TOKENS[t.toLowerCase()];
    if (!k) fail(`unknown source "${t}" (use: code,issues,prs,docs,releases,history,discussions,web,so)`);
    if (!out2.includes(k)) out2.push(k);
  }
  if (out2.length === 0) fail("--sources resolved to nothing");
  return out2;
}
function buildAskOptions(p, opts = {}) {
  const repo = p.values.repo;
  if (!repo) fail("missing --repo <url|path>");
  const question = p.values.q ?? p.values.question ?? "";
  if (opts.requireQuestion !== false && !question) fail('missing --q "<question>"');
  const sources = p.values.sources ? parseSources(p.values.sources) : DEFAULT_SOURCES;
  const perSource = p.values["per-source"] ? Number(p.values["per-source"]) : 6;
  if (!Number.isFinite(perSource) || perSource <= 0) fail("invalid --per-source");
  const webEngine = oneOf("web-engine", p.values["web-engine"] ?? "auto", ["auto", "searxng", "ddg", "claude"]);
  return {
    repo,
    question,
    sources,
    ref: p.values.ref,
    docsUrl: p.values["docs-url"],
    pkg: p.values.package,
    out: p.values.out ? resolve4(p.values.out) : void 0,
    semantic: p.bools.has("semantic"),
    webEngine,
    perSource,
    json: p.bools.has("json"),
    refresh: p.bools.has("refresh")
  };
}
function printEvidence(p, evidence, meta) {
  if (p.bools.has("json")) {
    process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
  } else {
    process.stdout.write(renderEvidenceMarkdown(evidence, meta) + "\n");
  }
}
async function run2(argv = process.argv.slice(2)) {
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
        `  sources:  ${bySource.join(" \xB7 ")}`,
        ...r.meta.notes.length ? [`  notes:    ${r.meta.notes.length} (see EVIDENCE.md)`] : [],
        `  dossier:  ${r.dir}`,
        `  next:     read ${r.paths.evidenceMd}, write ANSWER.md (cite [E#]), then:`,
        `            ultradoc check --run ${r.dir}`
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
      const kindMap = {
        code: "code",
        issues: "issue",
        prs: "pr",
        docs: "docs",
        releases: "release",
        history: "history",
        discussions: "discussion",
        so: "so"
      };
      const kind = kindMap[p.command];
      const opts = buildAskOptions(p);
      const { ctx, evidence, notes } = await runSingleSource(opts, kind);
      const meta = {
        question: opts.question,
        repo: ctx.repoRef.raw,
        host: ctx.repoRef.host,
        ref: opts.ref,
        commit: ctx.index.commit,
        sources: [kind],
        semantic: opts.semantic,
        evidenceCount: evidence.length,
        builtAt: (/* @__PURE__ */ new Date()).toISOString(),
        notes
      };
      printEvidence(p, evidence, meta);
      return;
    }
    case "web": {
      const opts = buildAskOptions(p, { requireQuestion: !p.values.url });
      if (p.values.url) {
        const urls = p.values.url.split(",").map((u) => u.trim()).filter(Boolean);
        const q = opts.question || urls.join(" ");
        const { items, notes: notes2 } = await webFetchUrls(urls, q, opts.perSource);
        const evidence2 = assignIds2([{ source: "web", items, notes: notes2 }]);
        const meta2 = {
          question: q,
          repo: opts.repo,
          host: "web",
          sources: ["web"],
          semantic: false,
          evidenceCount: evidence2.length,
          builtAt: (/* @__PURE__ */ new Date()).toISOString(),
          notes: notes2
        };
        printEvidence(p, evidence2, meta2);
        return;
      }
      const { ctx, evidence, notes } = await runSingleSource(opts, "web");
      const meta = {
        question: opts.question,
        repo: ctx.repoRef.raw,
        host: ctx.repoRef.host,
        ref: opts.ref,
        commit: ctx.index.commit,
        sources: ["web"],
        semantic: opts.semantic,
        evidenceCount: evidence.length,
        builtAt: (/* @__PURE__ */ new Date()).toISOString(),
        notes
      };
      printEvidence(p, evidence, meta);
      return;
    }
    case "overview": {
      const opts = buildAskOptions(p, { requireQuestion: false });
      const ctx = buildContext(opts);
      const r = ensureOverview(ctx.index, ctx.repoRef, ctx.repoDir, {
        refresh: opts.refresh,
        out: opts.out
      });
      if (opts.json) {
        process.stdout.write(
          JSON.stringify(
            {
              path: r.path,
              cached: r.cached,
              commit: ctx.index.commit,
              packages: ctx.index.packages,
              fileCount: ctx.index.fileCount
            },
            null,
            2
          ) + "\n"
        );
        return;
      }
      const lines = [
        `ultradoc: overview ${r.cached ? "reused (commit unchanged)" : "generated"} for ${ctx.repoRef.raw}${ctx.index.commit ? ` @ ${ctx.index.commit}` : ""}`,
        ...ctx.index.packages.length ? [`  packages: ${ctx.index.packages.length} workspace package(s) \u2014 scope questions with --package`] : [],
        `  file:     ${r.path}`,
        `  next:     read it to navigate the repo; ground answers via 'ultradoc ask'.`
      ];
      process.stderr.write(lines.join("\n") + "\n");
      return;
    }
    case "doc": {
      const opts = buildAskOptions(p, { requireQuestion: false });
      const sourcesOverride = p.values.sources ? parseSources(p.values.sources) : void 0;
      const r = await runDoc(opts, { sourcesOverride });
      if (opts.json) {
        process.stdout.write(JSON.stringify({ dir: r.dir, plan: r.plan }, null, 2) + "\n");
        return;
      }
      const lines = [
        `ultradoc: doc scaffold \u2014 ${r.plan.sections.length} section(s), ${r.evidence.length} evidence item(s)`,
        `  repo:     ${r.plan.repo}${r.plan.commit ? ` @ ${r.plan.commit}` : ""}${r.plan.pkg ? ` \xB7 package: ${r.plan.pkg}` : ""}`,
        `  sections: ${r.plan.sections.map((s) => s.title).join(" \xB7 ")}`,
        `  dir:      ${r.dir}`,
        `  next:     read ${r.paths.todoMd} + EVIDENCE.md, write DOC.md (cite [E#]), then:`,
        `            ultradoc check --run ${r.dir}`
      ];
      process.stderr.write(lines.join("\n") + "\n");
      return;
    }
    case "index": {
      const opts = buildAskOptions(p, { requireQuestion: false });
      const ctx = buildContext(opts);
      const langs = Object.entries(ctx.index.languages).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`);
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
              stats: ctx.index.stats
            },
            null,
            2
          ) + "\n"
        );
        return;
      }
      const st = ctx.index.stats;
      const truncated = st?.truncated ? ` \xB7 \u26A0 truncated at ${ctx.index.fileCount} files (raise ULTRADOC_MAX_FILES)` : "";
      const lines = [
        `ultradoc: indexed ${ctx.repoRef.raw}${ctx.index.commit ? ` @ ${ctx.index.commit}` : ""}`,
        `  path:     ${ctx.repoDir}`,
        `  files:    ${ctx.index.fileCount} \xB7 symbols: ${ctx.index.symbols.length} \xB7 docs: ${ctx.index.docFiles.length} \xB7 config: ${ctx.index.configFiles.length}${truncated}`,
        `  langs:    ${langs.join(" \xB7 ")}`,
        ...ctx.index.docsRoot ? [`  docsRoot: ${ctx.index.docsRoot}/`] : [],
        ...ctx.index.docsUrl ? [`  docsUrl:  ${ctx.index.docsUrl} (auto-discovered)`] : [],
        ...ctx.index.packages.length ? [
          `  packages: ${ctx.index.packages.slice(0, 8).map((x) => x.name).join(" \xB7 ")}${ctx.index.packages.length > 8 ? ` \xB7 +${ctx.index.packages.length - 8} more` : ""}`
        ] : []
      ];
      process.stderr.write(lines.join("\n") + "\n");
      return;
    }
    case "check": {
      const dir = p.values.run ?? p.values.out;
      if (!dir) fail("missing --run <dossier-dir>");
      let coverageMin;
      if (p.values["coverage-min"] !== void 0) {
        coverageMin = Number(p.values["coverage-min"]);
        if (!Number.isFinite(coverageMin) || coverageMin < 0 || coverageMin > 1) fail("invalid --coverage-min (expected a number in [0,1])");
      }
      const res = checkRun(resolve4(dir), {
        semantic: p.bools.has("semantic"),
        answerFile: p.values.answer,
        strict: p.bools.has("strict"),
        coverageMin,
        allowUnverified: p.bools.has("allow-unverified")
      });
      if (p.bools.has("json")) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      else process.stdout.write(formatCheckReport(res, resolve4(dir)) + "\n");
      if (!res.ok) process.exit(1);
      return;
    }
    case "verify": {
      const dir = p.values.run ?? p.values.out;
      if (!dir) fail("missing --run <dossier-dir>");
      const rdir = resolve4(dir);
      if (p.values.apply) {
        const result = applyVerdicts(rdir, resolve4(rdir, p.values.apply));
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
        `ultradoc: ${wl.pairs.length} claim\u2194evidence pair(s) \u2192 ${rdir}/VERIFY.md & VERIFY.todo.json
  adjudicate each verdict, save as verdicts.json, then: ultradoc verify --apply verdicts.json --run ${rdir}
`
      );
      return;
    }
    case "orchestrate": {
      const dir = p.values.run ?? p.values.out;
      if (!dir) {
        process.stderr.write("ultradoc orchestrate: --run <dir> is required (the run dir holding the worklists).\n");
        process.exit(2);
      }
      const engineAbs = realpathSync2(fileURLToPath2(import.meta.url));
      if (p.bools.has("list")) {
        if (!existsSync14(dir)) {
          process.stderr.write(`ultradoc orchestrate: run dir not found: ${dir}.
`);
          process.exit(2);
        }
        process.stdout.write(JSON.stringify({ phases: listPhases(resolve4(dir), engineAbs) }, null, 2) + "\n");
        return;
      }
      const res = orchestrateRun(resolve4(dir), engineAbs, {
        phase: p.values.phase,
        eco: p.bools.has("eco")
      });
      if (res.exitCode !== 0) {
        for (const e of res.errors) process.stderr.write(`ultradoc orchestrate: ${e}
`);
        process.exit(res.exitCode);
      }
      process.stdout.write("ultradoc orchestrate: generated\n");
      for (const w of res.written) process.stdout.write(`  ${w}
`);
      for (const n of res.notices) process.stderr.write(`ultradoc orchestrate: note \u2014 ${n}
`);
      const workflows = res.written.filter((w) => w.endsWith(".workflow.mjs"));
      if (workflows.length) {
        process.stdout.write("\n");
        for (const w of workflows) process.stdout.write(`Launch: Workflow({ scriptPath: ${JSON.stringify(w)} })
`);
        process.stdout.write(
          "Then fold the returned fragments yourself (verdicts.json / ANSWER.md / DOC.md) and run the gate shown at the end of each workflow \u2014 you stay the sole writer.\n"
        );
      } else {
        process.stdout.write(`Follow ${join25(resolve4(dir), "orchestration", "RUNBOOK.md")} sequentially (the eco path).
`);
        if (p.values.phase === void 0 && !p.bools.has("eco")) {
          process.stderr.write(`ultradoc orchestrate: no ready phase \u2014 phases are ${PHASES.join(", ")} (see --list).
`);
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
        process.stdout.write(`ultradoc: removed ${removed.length} cached repo(s)${removed.length ? ": " + removed.join(", ") : ""}
`);
        return;
      }
      fail(`unknown cache action "${action}" (use: status | clean)`);
      return;
    }
  }
}
function isInvokedDirectly() {
  const argv1 = process.argv[1];
  if (argv1 === void 0) return false;
  const modulePath = fileURLToPath2(import.meta.url);
  try {
    if (realpathSync2(argv1) === realpathSync2(modulePath)) return true;
  } catch {
  }
  return import.meta.url === pathToFileURL(argv1).href;
}
if (isInvokedDirectly()) {
  run2().catch((e) => fail(e.message));
}
export {
  parseArgs,
  run2 as run
};
// "Copyright" and "@license" are already caught by DIRECTIVE_RE.

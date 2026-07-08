#!/usr/bin/env node

// src/cli.ts
import { resolve as resolve2 } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { realpathSync } from "fs";

// src/types.ts
var VERSION = "2.0.0";

// src/clone.ts
import { existsSync, statSync, mkdirSync, readdirSync, renameSync } from "fs";
import { resolve, join as join2, basename } from "path";
import { tmpdir as tmpdir2 } from "os";

// src/util.ts
import { spawnSync } from "child_process";
function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
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
  const out = [];
  for (const raw of question.split(/[^\p{L}\p{N}_]+/u)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (raw.length < 2) continue;
    if (STOPWORDS.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(raw);
  }
  return out;
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
  return base.map((k, i) => ({ k, s: score(k), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.k);
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
  let out = "";
  for (const ch of s) out += baseChar(ch);
  return out;
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
  const parts = spaced.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parts.length < 2) return [];
  const out = [];
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower.length < 3 || STOPWORDS.has(lower)) continue;
    if (!out.includes(lower)) out.push(lower);
    if (out.length >= 4) break;
  }
  return out;
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
  let out = "";
  for (const ch of text) {
    const cls = ACCENT_CLASSES[baseChar(ch)];
    out += cls ? `[${cls}]` : escapeRegExp(ch);
  }
  return out;
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
function rrf(lists, keyOf, k = 60) {
  const score = /* @__PURE__ */ new Map();
  for (const list of lists) {
    list.forEach((item, idx) => {
      const key = keyOf(item);
      score.set(key, (score.get(key) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return score;
}
async function mapLimit(items, limit, fn) {
  const n = items.length;
  const out = new Array(n);
  const width = Math.max(1, Math.min(limit, n || 1));
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= n) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: width }, () => worker()));
  return out;
}

// src/config.ts
import { homedir, tmpdir } from "os";
import { join } from "path";
function envInt(name, def, min = 1) {
  const raw = process.env[name];
  if (raw === void 0) return def;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : def;
}
var LIMITS = {
  maxFiles: envInt("ULTRADOC_MAX_FILES", 2e4),
  // files walked/indexed
  maxFileBytes: envInt("ULTRADOC_MAX_FILE_BYTES", 1048576),
  // per-file read cap
  jsScanFiles: envInt("ULTRADOC_MAX_SCAN_FILES", 8e3),
  // pure-JS search fallback cap
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
  const args = ["clone", "--depth", "1", "--filter=blob:none"];
  if (opts.branch) args.push("--branch", opts.branch);
  args.push(ref.cloneUrl, dir);
  const res = sh("git", args, { timeoutMs: 3e5 });
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
  let out;
  const probe = sh("git", ["-C", dir, "rev-parse", "--is-shallow-repository"]);
  const filter = sh("git", ["-C", dir, "config", "remote.origin.partialclonefilter"]);
  const shallow = probe.ok && probe.stdout.trim() === "true";
  const partial = filter.ok && filter.stdout.trim() !== "";
  if (!probe.ok) {
    out = { ok: false, note: "Not a git working tree \u2014 no commit history available." };
  } else if (!shallow && !partial) {
    out = { ok: true };
  } else {
    if (partial) sh("git", ["-C", dir, "config", "remote.origin.partialclonefilter", ""]);
    const args = ["-C", dir, "fetch", "--quiet", ...partial ? ["--refetch"] : [], ...shallow ? ["--unshallow"] : [], "origin"];
    const full = sh("git", args, { timeoutMs: 3e5 });
    if (full.ok) {
      out = { ok: true };
    } else if (shallow && !partial) {
      const deepen = sh("git", ["-C", dir, "fetch", "--quiet", "--deepen=500", "origin"], {
        timeoutMs: 18e4
      });
      out = deepen.ok ? { ok: true, note: "History deepened to ~500 commits (full unshallow failed); older changes may be missing." } : { ok: false, note: "Shallow clone could not be deepened (offline?); history is limited to the latest commit." };
    } else {
      out = { ok: false, note: "Could not fetch full history (offline, or the repo is too large); history results may be incomplete." };
    }
  }
  deepened.set(dir, out);
  return out;
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
import { existsSync as existsSync3, mkdirSync as mkdirSync2, writeFileSync, readFileSync as readFileSync2 } from "fs";
import { join as join6 } from "path";

// src/walk.ts
import { readdirSync as readdirSync2, statSync as statSync2, readFileSync } from "fs";
import { join as join3, relative, sep, extname } from "path";
var IGNORE_DIRS = /* @__PURE__ */ new Set([
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
  ".ultradoc",
  "Pods",
  "DerivedData",
  ".terraform",
  "elm-stuff",
  ".dart_tool"
]);
var LOCKFILES = /* @__PURE__ */ new Set([
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
var BINARY_EXT = /* @__PURE__ */ new Set([
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
function walkDetailed(root, opts = {}) {
  const maxFileBytes = opts.maxFileBytes ?? LIMITS.maxFileBytes;
  const maxFiles = opts.maxFiles ?? LIMITS.maxFiles;
  const out = [];
  let truncated = false;
  const stack = [root];
  while (stack.length) {
    if (out.length >= maxFiles) {
      truncated = true;
      break;
    }
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync2(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const abs = join3(dir, name);
      let st;
      try {
        st = statSync2(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (IGNORE_DIRS.has(name)) continue;
        stack.push(abs);
        continue;
      }
      if (!st.isFile()) continue;
      if (st.size > maxFileBytes) continue;
      if (LOCKFILES.has(name.toLowerCase())) continue;
      const ext = extname(name).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      if (name.endsWith(".min.js") || name.endsWith(".min.css")) continue;
      out.push({ rel: relative(root, abs).split(sep).join("/"), abs, size: st.size, ext });
    }
  }
  return { files: out, truncated };
}
function walk(root, opts = {}) {
  return walkDetailed(root, opts).files;
}
function readText(abs) {
  try {
    const buf = readFileSync(abs);
    const head = buf.subarray(0, 4096);
    if (head.includes(0)) return "";
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

// src/lang/common.ts
function scan(rel, content, lang, rules) {
  const out = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    for (const rule of rules) {
      const m = rule.re.exec(line);
      if (!m) continue;
      const name = m.groups?.name ?? m[1];
      if (!name) continue;
      const exported = typeof rule.exported === "function" ? rule.exported(m, line) : rule.exported ?? false;
      out.push({
        name,
        kind: rule.kind,
        file: rel,
        line: i + 1,
        signature: line.trim().slice(0, 200),
        exported,
        lang
      });
      break;
    }
  }
  return out;
}
var EXPORT_LIST_RE = /export\s*\{([^}]*)\}\s*(from\b)?/g;
var CJS_OBJECT_RE = /module\.exports\s*=\s*\{([^}]*)\}/g;
var DEFAULT_ID_RE = /(^|\n)\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*(?=\n|$)/g;
function applyExportLists(content, symbols, rel, lang) {
  const byName = /* @__PURE__ */ new Map();
  for (const s of symbols) if (!byName.has(s.name)) byName.set(s.name, s);
  const markExported = (name) => {
    const s = byName.get(name);
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
      const name = /^([\w$]+)/.exec(cjs ? part : part.split(":")[0].trim())?.[1];
      if (name && name !== "default") markExported(name);
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
    const name = m[2];
    if (!markExported(name)) {
      symbols.push({ name, kind: "default", file: rel, line: 1, signature: `export default ${name}`, exported: true, lang });
      byName.set(name, symbols[symbols.length - 1]);
    }
  }
}
var EXT_LANG = {
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
function extToLang(ext) {
  return EXT_LANG[ext] ?? "other";
}

// src/lang/js-ts.ts
var RULES = [
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
var jsTs = {
  lang: "javascript/typescript",
  exts: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
  extract(rel, content) {
    const lang = rel.match(/\.(ts|tsx|mts|cts)$/) ? "typescript" : "javascript";
    const symbols = scan(rel, content, lang, RULES);
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (ANON_DEFAULT_RE.test(line) && !NAMED_DEFAULT_RE.test(line)) {
        symbols.push({ name: stemOf(rel), kind: "default", file: rel, line: i + 1, signature: line.trim().slice(0, 200), exported: true, lang });
        break;
      }
    }
    applyExportLists(content, symbols, rel, lang);
    return symbols;
  }
};

// src/lang/python.ts
var pub = (name) => !name.startsWith("_") || name.startsWith("__");
var RULES2 = [
  { re: /^(?:async\s+)?def\s+(?<name>[\w]+)\s*\(/, kind: "function", exported: (m) => pub(m.groups.name) },
  { re: /^\s+(?:async\s+)?def\s+(?<name>[\w]+)\s*\(/, kind: "method", exported: (m) => pub(m.groups.name) },
  { re: /^class\s+(?<name>[\w]+)/, kind: "class", exported: (m) => pub(m.groups.name) },
  { re: /^\s+class\s+(?<name>[\w]+)/, kind: "class", exported: (m) => pub(m.groups.name) }
];
var python = {
  lang: "python",
  exts: [".py", ".pyi"],
  extract(rel, content) {
    return scan(rel, content, "python", RULES2);
  }
};

// src/lang/go.ts
var upper = (name) => /^[A-Z]/.test(name);
var RULES3 = [
  { re: /^func\s+\([^)]*\)\s+(?<name>[\w]+)\s*\(/, kind: "method", exported: (m) => upper(m.groups.name) },
  { re: /^func\s+(?<name>[\w]+)\s*\(/, kind: "function", exported: (m) => upper(m.groups.name) },
  { re: /^type\s+(?<name>[\w]+)\s+struct\b/, kind: "struct", exported: (m) => upper(m.groups.name) },
  { re: /^type\s+(?<name>[\w]+)\s+interface\b/, kind: "interface", exported: (m) => upper(m.groups.name) },
  { re: /^type\s+(?<name>[\w]+)\s+/, kind: "type", exported: (m) => upper(m.groups.name) }
];
var go = {
  lang: "go",
  exts: [".go"],
  extract(rel, content) {
    return scan(rel, content, "go", RULES3);
  }
};

// src/lang/ruby.ts
var RULES4 = [
  { re: /^\s*def\s+(?:self\.)?(?<name>[\w?!=]+)/, kind: "method", exported: true },
  { re: /^\s*class\s+(?<name>[\w:]+)/, kind: "class", exported: true },
  { re: /^\s*module\s+(?<name>[\w:]+)/, kind: "module", exported: true }
];
var ruby = {
  lang: "ruby",
  exts: [".rb", ".rake"],
  extract(rel, content) {
    return scan(rel, content, "ruby", RULES4);
  }
};

// src/lang/java.ts
var RULES5 = [
  { re: /^\s*(?:public|protected|private)?\s*(?:abstract\s+|final\s+)?class\s+(?<name>[\w]+)/, kind: "class", exported: (_m, l) => /\bpublic\b/.test(l) },
  { re: /^\s*(?:public|protected|private)?\s*interface\s+(?<name>[\w]+)/, kind: "interface", exported: (_m, l) => /\bpublic\b/.test(l) },
  { re: /^\s*(?:public|protected|private)?\s*enum\s+(?<name>[\w]+)/, kind: "enum", exported: (_m, l) => /\bpublic\b/.test(l) },
  {
    re: /^\s*(?:public|protected|private)\s+(?:static\s+|final\s+|abstract\s+|synchronized\s+)*[\w<>[\],.?\s]+\s+(?<name>[\w]+)\s*\(/,
    kind: "method",
    exported: (_m, l) => /\bpublic\b/.test(l)
  }
];
var java = {
  lang: "java",
  exts: [".java"],
  extract(rel, content) {
    return scan(rel, content, "java", RULES5);
  }
};

// src/lang/rust.ts
var isPub = (_m, l) => /^\s*pub\b/.test(l);
var RULES6 = [
  { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(?<name>[\w]+)/, kind: "function", exported: isPub },
  { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+(?<name>[\w]+)/, kind: "struct", exported: isPub },
  { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+(?<name>[\w]+)/, kind: "enum", exported: isPub },
  { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+(?<name>[\w]+)/, kind: "trait", exported: isPub },
  { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?type\s+(?<name>[\w]+)/, kind: "type", exported: isPub }
];
var rust = {
  lang: "rust",
  exts: [".rs"],
  extract(rel, content) {
    return scan(rel, content, "rust", RULES6);
  }
};

// src/lang/csharp.ts
var pub2 = (_m, l) => /\b(public|internal)\b/.test(l);
var RULES7 = [
  {
    re: /^\s*(?:public|internal|protected|private)?\s*(?:static\s+|sealed\s+|abstract\s+|partial\s+)*(?:class|record)\s+(?<name>\w+)/,
    kind: "class",
    exported: pub2
  },
  { re: /^\s*(?:public|internal|protected|private)?\s*(?:partial\s+)?interface\s+(?<name>\w+)/, kind: "interface", exported: pub2 },
  { re: /^\s*(?:public|internal|protected|private)?\s*(?:readonly\s+)?(?:ref\s+)?struct\s+(?<name>\w+)/, kind: "struct", exported: pub2 },
  { re: /^\s*(?:public|internal|protected|private)?\s*enum\s+(?<name>\w+)/, kind: "enum", exported: pub2 },
  // method: a visibility modifier, a return type, then `name(`
  {
    re: /^\s*(?:public|internal|protected|private)\s+(?:static\s+|virtual\s+|override\s+|async\s+|sealed\s+|abstract\s+|new\s+)*[\w<>[\],.?]+\s+(?<name>\w+)\s*(?:<[^>]*>)?\s*\(/,
    kind: "method",
    exported: pub2
  }
];
var csharp = {
  lang: "csharp",
  exts: [".cs"],
  extract(rel, content) {
    return scan(rel, content, "csharp", RULES7);
  }
};

// src/lang/php.ts
var RULES8 = [
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
var php = {
  lang: "php",
  exts: [".php"],
  extract(rel, content) {
    return scan(rel, content, "php", RULES8);
  }
};

// src/lang/swift.ts
var vis = (_m, l) => !/\b(private|fileprivate)\b/.test(l);
var MODS = "(?:public\\s+|open\\s+|internal\\s+|private\\s+|fileprivate\\s+)?(?:final\\s+)?";
var RULES9 = [
  { re: new RegExp(`^\\s*${MODS}class\\s+(?<name>\\w+)`), kind: "class", exported: vis },
  { re: new RegExp(`^\\s*${MODS}struct\\s+(?<name>\\w+)`), kind: "struct", exported: vis },
  { re: new RegExp(`^\\s*${MODS}enum\\s+(?<name>\\w+)`), kind: "enum", exported: vis },
  { re: new RegExp(`^\\s*${MODS}protocol\\s+(?<name>\\w+)`), kind: "protocol", exported: vis },
  {
    re: /^\s*(?:public\s+|open\s+|internal\s+|private\s+|fileprivate\s+)?(?:static\s+|class\s+|final\s+|override\s+|mutating\s+|@\w+\s+)*func\s+(?<name>\w+)/,
    kind: "function",
    exported: vis
  }
];
var swift = {
  lang: "swift",
  exts: [".swift"],
  extract(rel, content) {
    return scan(rel, content, "swift", RULES9);
  }
};

// src/lang/kotlin.ts
var vis2 = (_m, l) => !/\b(private|internal)\b/.test(l);
var RULES10 = [
  { re: /^\s*(?:public\s+|internal\s+|private\s+|abstract\s+|sealed\s+|open\s+|final\s+|data\s+)*class\s+(?<name>\w+)/, kind: "class", exported: vis2 },
  { re: /^\s*(?:public\s+|internal\s+|private\s+|fun\s+)?interface\s+(?<name>\w+)/, kind: "interface", exported: vis2 },
  { re: /^\s*(?:public\s+|internal\s+|private\s+|companion\s+)?object\s+(?<name>\w+)/, kind: "object", exported: vis2 },
  {
    re: /^\s*(?:public\s+|internal\s+|private\s+|protected\s+|override\s+|open\s+|abstract\s+|suspend\s+|inline\s+|operator\s+)*fun\s+(?:<[^>]*>\s+)?(?<name>\w+)\s*\(/,
    kind: "function",
    exported: vis2
  }
];
var kotlin = {
  lang: "kotlin",
  exts: [".kt", ".kts"],
  extract(rel, content) {
    return scan(rel, content, "kotlin", RULES10);
  }
};

// src/lang/c.ts
var NOT_KEYWORD = "(?!\\s*(?:if|for|while|switch|return|else|do|sizeof|typedef)\\b)";
var RULES11 = [
  // C++ types
  { re: /^\s*(?:class|struct)\s+(?<name>[A-Za-z_]\w+)\s*(?:[:{]|$)/, kind: "class", exported: true },
  { re: /^\s*namespace\s+(?<name>[A-Za-z_]\w+)/, kind: "namespace", exported: true },
  // typedef struct/enum/union NAME {
  { re: /^\s*(?:typedef\s+)?(?:struct|enum|union)\s+(?<name>[A-Za-z_]\w+)\s*\{/, kind: "struct", exported: true },
  // function definition: <type ...> name(<args>) [const] {?  at column 0-ish
  {
    re: new RegExp(`^${NOT_KEYWORD}[A-Za-z_][\\w\\s\\*&<>:,]*?\\b(?<name>[A-Za-z_]\\w+)\\s*\\([^;{]*\\)\\s*(?:const)?\\s*\\{?\\s*$`),
    kind: "function",
    exported: true
  }
];
var c = {
  lang: "c/cpp",
  exts: [".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"],
  extract(rel, content) {
    return scan(rel, content, rel.match(/\.(c|h)$/) ? "c" : "cpp", RULES11);
  }
};

// src/lang/lua.ts
var RULES12 = [
  { re: /^\s*local\s+function\s+(?<name>[\w.:]+)\s*\(/, kind: "function", exported: false },
  { re: /^\s*function\s+(?<name>[\w.:]+)\s*\(/, kind: "function", exported: true },
  { re: /^\s*(?:local\s+)?(?<name>[\w.]+)\s*=\s*function\s*\(/, kind: "function", exported: true }
];
var lua = {
  lang: "lua",
  exts: [".lua"],
  extract(rel, content) {
    return scan(rel, content, "lua", RULES12);
  }
};

// src/lang/shell.ts
var RULES13 = [
  { re: /^\s*function\s+(?<name>[\w:-]+)\s*(?:\(\))?\s*\{?/, kind: "function", exported: true },
  { re: /^\s*(?<name>[A-Za-z_][\w:-]*)\s*\(\)\s*\{?/, kind: "function", exported: true }
];
var shell = {
  lang: "shell",
  exts: [".sh", ".bash", ".zsh", ".ksh"],
  extract(rel, content) {
    return scan(rel, content, "shell", RULES13);
  }
};

// src/lang/elixir.ts
var RULES14 = [
  { re: /^\s*defmodule\s+(?<name>[\w.]+)/, kind: "module", exported: true },
  { re: /^\s*defp\s+(?<name>[\w?!]+)/, kind: "function", exported: false },
  { re: /^\s*def\s+(?<name>[\w?!]+)/, kind: "function", exported: true },
  { re: /^\s*defmacrop?\s+(?<name>[\w?!]+)/, kind: "macro", exported: true }
];
var elixir = {
  lang: "elixir",
  exts: [".ex", ".exs"],
  extract(rel, content) {
    return scan(rel, content, "elixir", RULES14);
  }
};

// src/lang/scala.ts
var RULES15 = [
  { re: /^\s*(?:final\s+|sealed\s+|abstract\s+|implicit\s+)*(?:case\s+)?class\s+(?<name>\w+)/, kind: "class", exported: true },
  { re: /^\s*(?:sealed\s+)?trait\s+(?<name>\w+)/, kind: "trait", exported: true },
  { re: /^\s*(?:case\s+)?object\s+(?<name>\w+)/, kind: "object", exported: true },
  {
    re: /^\s*(?:override\s+|final\s+|private\s+|protected\s+|implicit\s+)*def\s+(?<name>\w+)/,
    kind: "def",
    exported: (_m, l) => !/\b(private|protected)\b/.test(l)
  }
];
var scala = {
  lang: "scala",
  exts: [".scala", ".sc"],
  extract(rel, content) {
    return scan(rel, content, "scala", RULES15);
  }
};

// src/lang/registry.ts
var EXTRACTORS = [jsTs, python, go, ruby, java, rust, csharp, php, swift, kotlin, c, lua, shell, elixir, scala];
var BY_EXT = /* @__PURE__ */ new Map();
for (const e of EXTRACTORS) for (const ext of e.exts) BY_EXT.set(ext, e);
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

// src/sources/doc-discovery.ts
import { join as join4 } from "path";
var DOC_DIR = /(^|\/)(docs?|documentation|website|guides?|book|manual|handbook|reference)$/i;
function discoverDocsRoot(docFiles) {
  const counts = /* @__PURE__ */ new Map();
  for (const rel of docFiles) {
    const parts = rel.split("/");
    for (const depth of [1, 2]) {
      if (parts.length <= depth) continue;
      const dir = parts.slice(0, depth).join("/");
      if (DOC_DIR.test(dir)) counts.set(dir, (counts.get(dir) ?? 0) + 1);
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
    const text = readText(join4(repoDir, readme)).slice(0, 4e4);
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
    const text = readText(join4(repoDir, cfg));
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
import { existsSync as existsSync2, readdirSync as readdirSync3, statSync as statSync3 } from "fs";
import { join as join5 } from "path";
var PKG_MANIFESTS = ["package.json", "Cargo.toml", "go.mod", "composer.json", "pyproject.toml", "pom.xml", "build.gradle", "build.gradle.kts"];
function tomlArrayInSection(text, section, key) {
  const out = [];
  let table = "";
  let buf;
  const keyRe = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\[`);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "");
    if (buf !== void 0) {
      buf += " " + line;
      if (line.includes("]")) {
        for (const m of buf.matchAll(/["']([^"']+)["']/g)) out.push(m[1]);
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
      for (const m of tail.matchAll(/["']([^"']+)["']/g)) out.push(m[1]);
    } else {
      buf = tail;
    }
  }
  return out;
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
  const abs = rel ? join5(root, rel) : root;
  let entries;
  try {
    entries = readdirSync3(abs);
  } catch {
    return [];
  }
  return entries.filter((n) => !n.startsWith(".") && n !== "node_modules" && isDir(join5(abs, n))).map((n) => rel ? `${rel}/${n}` : n);
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
        if (isDir(join5(root, cand))) next.push(cand);
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
  if (!PKG_MANIFESTS.some((m) => existsSync2(join5(root, dir, m)))) return void 0;
  const base = dir.split("/").pop();
  const pj = parseJson(readText(join5(root, dir, "package.json")) || readText(join5(root, dir, "composer.json")));
  if (pj && typeof pj.name === "string") {
    return { name: pj.name, dir, description: typeof pj.description === "string" ? pj.description : void 0 };
  }
  const cargo = readText(join5(root, dir, "Cargo.toml"));
  if (cargo) {
    const name = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(cargo)?.[1];
    const description = /^\s*description\s*=\s*["']([^"']+)["']/m.exec(cargo)?.[1];
    if (name) return { name, dir, description };
  }
  const gomod = readText(join5(root, dir, "go.mod"));
  if (gomod) {
    const mod = /^module\s+(\S+)/m.exec(gomod)?.[1];
    if (mod) return { name: mod, dir, description: void 0 };
  }
  const py = readText(join5(root, dir, "pyproject.toml"));
  if (py) {
    const name = tomlStringInSection(py, "project", "name") ?? tomlStringInSection(py, "tool.poetry", "name");
    const description = tomlStringInSection(py, "project", "description") ?? tomlStringInSection(py, "tool.poetry", "description");
    if (name) return { name, dir, description };
  }
  const pom = readText(join5(root, dir, "pom.xml"));
  if (pom) {
    const own = pom.replace(/<parent>[\s\S]*?<\/parent>/, "");
    const name = /<artifactId>\s*([^<]+?)\s*<\/artifactId>/.exec(own)?.[1];
    if (name) return { name, dir, description: void 0 };
  }
  return { name: base, dir, description: void 0 };
}
function workspacePatterns(root) {
  const patterns = [];
  const pj = parseJson(readText(join5(root, "package.json")));
  const ws = pj?.workspaces;
  if (Array.isArray(ws)) patterns.push(...ws.filter((p) => typeof p === "string"));
  else if (ws && Array.isArray(ws.packages)) patterns.push(...ws.packages.filter((p) => typeof p === "string"));
  const pnpm = readText(join5(root, "pnpm-workspace.yaml"));
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
  const lerna = parseJson(readText(join5(root, "lerna.json")));
  if (lerna && Array.isArray(lerna.packages)) {
    patterns.push(...lerna.packages.filter((p) => typeof p === "string"));
  }
  const cargo = readText(join5(root, "Cargo.toml"));
  if (cargo) {
    patterns.push(...tomlArrayInSection(cargo, "workspace", "members"));
    patterns.push(...tomlArrayInSection(cargo, "workspace", "exclude").map((p) => `!${p}`));
  }
  const gowork = readText(join5(root, "go.work"));
  if (gowork) {
    const block = /^use\s*\(([\s\S]*?)\)/m.exec(gowork)?.[1];
    const uses = block ? block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("//")) : [...gowork.matchAll(/^use\s+(\S+)/gm)].map((m) => m[1]);
    patterns.push(...uses);
  }
  const py = readText(join5(root, "pyproject.toml"));
  if (py) {
    patterns.push(...tomlArrayInSection(py, "tool.uv.workspace", "members"));
    patterns.push(...tomlArrayInSection(py, "tool.uv.workspace", "exclude").map((p) => `!${p}`));
  }
  const composer = parseJson(readText(join5(root, "composer.json")));
  if (composer && Array.isArray(composer.repositories)) {
    for (const r of composer.repositories) {
      if (r && r.type === "path" && typeof r.url === "string") patterns.push(r.url);
    }
  }
  const pom = readText(join5(root, "pom.xml"));
  if (pom) {
    const block = /<modules>([\s\S]*?)<\/modules>/.exec(pom)?.[1];
    if (block) {
      for (const m of block.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)) patterns.push(m[1]);
    }
  }
  for (const f of ["settings.gradle", "settings.gradle.kts"]) {
    const gradle = readText(join5(root, f));
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
var SCHEMA_VERSION = 4;
var DOC_BASENAME = /^(readme|changelog|contributing|history|news|authors|notice|security|code_of_conduct|faq|getting[-_]?started|usage|guide|tutorial)\b/i;
var DOC_EXT = /* @__PURE__ */ new Set([".md", ".mdx", ".rst", ".adoc", ".txt"]);
var DOC_DIR2 = /^(docs?|documentation|wiki|guides?|website|site|book)\//i;
var CONFIG_BASENAME = /* @__PURE__ */ new Set([
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
  return join6(root, ".ultradoc");
}
function indexPath(root) {
  return join6(indexDir(root), "index.json");
}
function isDoc(rel, ext) {
  const base = rel.split("/").pop().toLowerCase();
  return DOC_EXT.has(ext) || DOC_BASENAME.test(base) || DOC_DIR2.test(rel);
}
function isConfig(rel) {
  return CONFIG_BASENAME.has(rel.split("/").pop().toLowerCase());
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
    const lang = languageOf(f.ext);
    languages[lang] = (languages[lang] ?? 0) + 1;
    const top = f.rel.includes("/") ? f.rel.slice(0, f.rel.indexOf("/")) : ".";
    topDirs[top] = (topDirs[top] ?? 0) + 1;
    if (isDoc(f.rel, f.ext)) docFiles.push(f.rel);
    if (isConfig(f.rel)) configFiles.push(f.rel);
    const content = readText(f.abs);
    if (!content) continue;
    const syms = extractSymbols(f.rel, f.ext, content);
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
    schemaVersion: SCHEMA_VERSION
  };
  try {
    mkdirSync2(indexDir(root), { recursive: true });
    writeFileSync(indexPath(root), JSON.stringify(index));
  } catch {
  }
  return index;
}
function loadIndex(root) {
  const p = indexPath(root);
  if (!existsSync3(p)) return void 0;
  try {
    const idx = JSON.parse(readFileSync2(p, "utf8"));
    if (idx.schemaVersion !== SCHEMA_VERSION) return void 0;
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
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync2 } from "fs";
import { join as join7 } from "path";
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
  const i = SOURCE_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function runId(d = /* @__PURE__ */ new Date()) {
  return `run-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function defaultRunDir(repoDir, d) {
  return join7(indexDir(repoDir), "runs", runId(d));
}
function assignIds(results) {
  const flat = results.flatMap((r) => r.items);
  flat.sort((a, b) => rank(a.source) - rank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref));
  return flat.map((it, i) => ({ id: `E${i + 1}`, ...it }));
}
function renderEvidenceMarkdown(evidence, meta) {
  const out = [];
  out.push(`# Evidence dossier`);
  out.push("");
  out.push(`**Question:** ${meta.question}`);
  out.push(
    `**Repo:** ${meta.repo}${meta.commit ? ` @ ${meta.commit}` : ""}${meta.ref ? ` (ref: ${meta.ref})` : ""} \xB7 **host:** ${meta.host}${meta.pkg ? ` \xB7 **package:** ${meta.pkg}` : ""}`
  );
  out.push(`**Sources:** ${meta.sources.join(", ")} \xB7 **semantic:** ${meta.semantic ? "on" : "off"} \xB7 **built:** ${meta.builtAt}`);
  out.push("");
  out.push(
    `> Ground every claim in the answer in this evidence. Cite items by id, e.g. \`[E1]\`. Do not assert anything you cannot tie to an item below. Write the answer to \`ANSWER.md\` in this folder, then run \`ultradoc check\`.`
  );
  out.push("");
  if (evidence.length === 0) {
    out.push(`_No evidence was retrieved. Broaden the question, add sources, or check connectivity._`);
  }
  for (const source of SOURCE_ORDER) {
    const items = evidence.filter((e) => e.source === source);
    if (items.length === 0) continue;
    out.push(`## ${SOURCE_LABEL[source]}`);
    out.push("");
    for (const it of items) {
      out.push(`### [${it.id}] ${it.title}`);
      const meta1 = [`ref: \`${it.ref}\``, it.location ? `loc: \`${it.location}\`` : "", `score: ${it.score}`].filter(Boolean).join(" \xB7 ");
      out.push(meta1);
      if (it.url) out.push(`url: ${it.url}`);
      out.push("");
      out.push("```");
      out.push(it.snippet);
      out.push("```");
      out.push("");
    }
  }
  if (meta.notes.length) {
    out.push(`## Retrieval notes`);
    out.push("");
    for (const n of meta.notes) out.push(`- ${n}`);
    out.push("");
  }
  return out.join("\n");
}
function writeDossier(dir, evidence, meta) {
  mkdirSync3(dir, { recursive: true });
  const evidenceJson = join7(dir, "evidence.json");
  const evidenceMd = join7(dir, "EVIDENCE.md");
  const metaJson = join7(dir, "meta.json");
  writeFileSync2(evidenceJson, JSON.stringify(evidence, null, 2));
  writeFileSync2(evidenceMd, renderEvidenceMarkdown(evidence, meta));
  writeFileSync2(metaJson, JSON.stringify(meta, null, 2));
  return { dir, evidenceJson, evidenceMd, metaJson };
}

// src/index/search.ts
import { statSync as statSync4 } from "fs";
import { join as join8, relative as relative2, sep as sep2 } from "path";

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
  CALLSITE_MERGE_GAP: 12
};
function rgSearch(root, matcher, scope) {
  const args = [
    "--json",
    "-i",
    "--max-count",
    "40",
    "--max-filesize",
    "1M",
    "-g",
    "!**/.ultradoc/**",
    "-g",
    "!**/node_modules/**",
    "-g",
    "!**/{dist,build,vendor}/**",
    // Lockfiles are machine-generated noise (walk skips them for the index, but
    // ripgrep scans the tree directly, so exclude them here too).
    "-g",
    "!**/*.lock",
    "-g",
    "!**/package-lock.json",
    "-g",
    "!**/npm-shrinkwrap.json",
    "-g",
    "!**/pnpm-lock.yaml",
    "-g",
    "!**/yarn.lock",
    "-g",
    "!**/go.sum"
  ];
  if (scope) args.push("-g", `${scope}/**`);
  for (const p of matcher.patterns) args.push("-e", p.source);
  args.push(scope ? join8(root, scope) : root);
  const res = sh("rg", args, { timeoutMs: 6e4 });
  const byFile = /* @__PURE__ */ new Map();
  if (!res.ok && !res.stdout) return byFile;
  for (const raw of res.stdout.split("\n")) {
    if (!raw) continue;
    let evt;
    try {
      evt = JSON.parse(raw);
    } catch {
      continue;
    }
    if (evt.type !== "match") continue;
    const abs = evt.data?.path?.text ?? "";
    if (!abs) continue;
    const rel = relative2(root, abs).split(sep2).join("/");
    if (!rel || rel.startsWith("..")) continue;
    const lineNo = evt.data?.line_number ?? 0;
    const text = (evt.data?.lines?.text ?? "").replace(/\n$/, "");
    let fh = byFile.get(rel);
    if (!fh) {
      fh = { rel, matchedKw: /* @__PURE__ */ new Set(), kwCounts: /* @__PURE__ */ new Map(), lines: [] };
      byFile.set(rel, fh);
    }
    for (const sm of evt.data?.submatches ?? []) {
      const canonical = matcher.canonicalOf(sm.match?.text ?? "");
      if (canonical) {
        fh.matchedKw.add(canonical);
        fh.kwCounts.set(canonical, (fh.kwCounts.get(canonical) ?? 0) + 1);
      }
    }
    fh.lines.push({ line: lineNo, text: text.slice(0, 400) });
  }
  return byFile;
}
function jsSearch(root, matcher, scope) {
  const byFile = /* @__PURE__ */ new Map();
  const res = matcher.patterns.map((p) => ({ re: new RegExp(p.source, "i"), canonical: p.canonical }));
  const base = scope ? join8(root, scope) : root;
  for (const f of walk(base, { maxFiles: LIMITS.jsScanFiles })) {
    const rel = scope ? `${scope}/${f.rel}` : f.rel;
    const content = readText(f.abs);
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    let fh;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matched = [];
      for (const p of res) if (p.re.test(line)) matched.push(p.canonical);
      if (matched.length) {
        if (!fh) {
          fh = { rel, matchedKw: /* @__PURE__ */ new Set(), kwCounts: /* @__PURE__ */ new Map(), lines: [] };
          byFile.set(rel, fh);
        }
        for (const m of matched) {
          fh.matchedKw.add(m);
          fh.kwCounts.set(m, (fh.kwCounts.get(m) ?? 0) + 1);
        }
        if (fh.lines.length < 40) fh.lines.push({ line: i + 1, text: line.slice(0, 400) });
      }
    }
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
function expandWindow(lines, start, end, anchor) {
  const blank = (n) => /^\s*$/.test(lines[n - 1] ?? "");
  let s = Math.max(1, start);
  let e = Math.min(lines.length, end);
  while (s > 1 && start - s < EXCERPT_PAD && !blank(s - 1)) s--;
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
  const name = foldTerm(sym.name);
  let s = 0;
  for (const ek of matcher.expanded) {
    let best = 0;
    for (const v of ek.variants) {
      const vt = foldTerm(v.text);
      let vs = 0;
      if (name === vt) vs = 6;
      else if (name.startsWith(vt) || vt.startsWith(name)) vs = 3;
      else if (name.includes(vt) || vt.includes(name)) vs = 1.5;
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
    for (let i = 0; i < arr.length && i < RANKING.SYMBOL_DECAY.length; i++) fileScore += arr[i].score * RANKING.SYMBOL_DECAY[i];
    byFile.set(file, { score: fileScore, sym: arr[0].sym });
  }
  return byFile;
}
function callableNames(matcher, index) {
  const declared = new Set(index.symbols.map((s) => foldTerm(s.name)));
  const out = [];
  for (const ek of matcher.expanded) {
    if (out.length >= RANKING.CALLSITE_MAX_NAMES) break;
    const orig = ek.original;
    if (!/^[A-Za-z_$][\w$]*$/.test(orig)) continue;
    const identifierShaped = /[a-z][A-Z]/.test(orig) || orig.includes("_");
    if ((identifierShaped || declared.has(foldTerm(orig))) && !out.includes(orig)) out.push(orig);
  }
  return out;
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
  const name = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return { lines: [...lines].sort((a, b) => a - b), name };
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
  const lexical = usedRg ? rgSearch(root, matcher, scope) : jsSearch(root, matcher, scope);
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
  const candidates = [...files].filter((rel) => lexical.has(rel)).map((rel) => {
    let len = 1e3;
    try {
      len = Math.max(1, statSync4(join8(root, rel)).size / 5);
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
    const content = readText(join8(root, f.rel));
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
import { existsSync as existsSync5, readFileSync as readFileSync4, writeFileSync as writeFileSync4, mkdirSync as mkdirSync5 } from "fs";
import { join as join10, dirname as dirname2 } from "path";

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
    const body = await readCapped(res, max);
    return { ok: res.ok, status: res.status, body, contentType, rateLimited, retryAfterMs };
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
async function httpJson(method, url, body, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 3e4);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": UA },
      body: body === void 0 ? void 0 : JSON.stringify(body)
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
  for (let i = 0; i <= anchor && i < lines.length; i++) {
    const line = lines[i];
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
  for (let i = 0; i < lines.length; i++) {
    const cov = matcher.matchLine(lines[i]).size;
    if (cov > 0) hits.push({ idx: i, cov });
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
    const start = Math.max(0, h.idx - 3);
    const end = Math.min(lines.length, h.idx + 12);
    const snippet = lines.slice(start, end).join("\n").slice(0, 1500);
    if (!snippet.trim()) continue;
    const heading = nearestHeading(lines, h.idx);
    items.push({
      source,
      title: heading ? `${title} \xA7 ${heading}` : title,
      ref: url,
      location: `${url}#~${start + 1}`,
      score: Number((h.cov + 1).toFixed(3)),
      snippet,
      url,
      meta: heading ? { heading } : void 0
    });
  }
  return items;
}

// src/index/compose.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync4, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "fs";
import { dirname, join as join9 } from "path";
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
  const base = join9(cacheRoot(), "compose");
  const composePath = join9(base, "docker-compose.yml");
  const settingsPath = join9(base, "docker", "searxng", "settings.yml");
  writeIfChanged(composePath, COMPOSE_YAML);
  writeIfChanged(settingsPath, SEARXNG_SETTINGS_YAML);
  return composePath;
}
function writeIfChanged(path, content) {
  try {
    if (existsSync4(path) && readFileSync3(path, "utf8") === content) return;
    mkdirSync4(dirname(path), { recursive: true });
    writeFileSync3(path, content);
  } catch {
  }
}

// src/index/semantic.ts
var QDRANT = (process.env.ULTRADOC_QDRANT || "http://localhost:6333").replace(/\/$/, "");
var OLLAMA = (process.env.ULTRADOC_OLLAMA || "http://localhost:11434").replace(/\/$/, "");
var EMBED_MODEL = process.env.ULTRADOC_EMBED_MODEL || "nomic-embed-text";
var MAX_CHUNKS = LIMITS.embedChunks;
function chunkText(rel, content, isDoc2, opts = {}) {
  const win = opts.windowLines ?? 60;
  const overlap = opts.overlap ?? 12;
  const maxPerFile = opts.maxPerFile ?? 40;
  const lines = content.split(/\r?\n/);
  const chunks = [];
  const step = Math.max(1, win - overlap);
  for (let i = 0; i < lines.length && chunks.length < maxPerFile; i += step) {
    const slice = lines.slice(i, i + win);
    const text = slice.join("\n").trim();
    if (text.length < 16) continue;
    chunks.push({ rel, start: i + 1, end: Math.min(lines.length, i + win), text, isDoc: isDoc2 });
  }
  return chunks;
}
function chunkFile(rel, content, isDoc2, symbolLines, opts = {}) {
  const win = opts.windowLines ?? 60;
  const maxPerFile = opts.maxPerFile ?? 40;
  const MIN_LEADING = 5;
  const lines = content.split(/\r?\n/);
  const n = lines.length;
  const starts = [...new Set((symbolLines ?? []).filter((l) => l >= 1 && l <= n))].sort((a, b) => a - b);
  if (isDoc2 || starts.length === 0) return chunkText(rel, content, isDoc2, opts);
  const chunks = [];
  const add = (from, to) => {
    if (chunks.length >= maxPerFile) return;
    const s = Math.max(1, from);
    const e = Math.min(n, to);
    if (e < s) return;
    const text = lines.slice(s - 1, e).join("\n").trim();
    if (text.length < 16) return;
    chunks.push({ rel, start: s, end: e, text, isDoc: isDoc2 });
  };
  if (starts[0] - 1 >= MIN_LEADING) add(1, starts[0] - 1);
  for (let i = 0; i < starts.length && chunks.length < maxPerFile; i++) {
    const start = starts[i];
    const nextStart = i + 1 < starts.length ? starts[i + 1] : n + 1;
    add(start, Math.min(start + win - 1, nextStart - 1));
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
  return join10(repoDir, ".ultradoc", "semantic.json");
}
async function collectionExists(name) {
  const r = await httpJson("GET", `${QDRANT}/collections/${name}`);
  return r.ok && r.data?.result?.status !== void 0;
}
async function buildIfNeeded(ctx) {
  const name = collectionName(ctx.repoRef.slug);
  const marker = markerPath(ctx.repoDir);
  const commit = ctx.index.commit ?? "HEAD";
  if (existsSync5(marker)) {
    try {
      const m = JSON.parse(readFileSync4(marker, "utf8"));
      if (m.collection === name && m.commit === commit && await collectionExists(name)) {
        return { name, notes: [] };
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
    const content = readText(join10(ctx.repoDir, rel));
    if (!content) continue;
    const isDoc2 = ctx.index.docFiles.includes(rel);
    for (const c2 of chunkFile(rel, content, isDoc2, symbolLines.get(rel) ?? [])) {
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
  const failed = vectors.filter((v) => !v).length;
  await httpJson("DELETE", `${QDRANT}/collections/${name}`);
  const create = await httpJson("PUT", `${QDRANT}/collections/${name}`, {
    vectors: { size: dim, distance: "Cosine" }
  });
  if (!create.ok) return { error: `could not create Qdrant collection (${create.status})` };
  let points = [];
  const flush = async () => {
    if (!points.length) return true;
    const up = await httpJson("PUT", `${QDRANT}/collections/${name}/points?wait=true`, { points });
    points = [];
    return up.ok;
  };
  for (let i = 0; i < chunks.length; i++) {
    const vector = vectors[i];
    if (!vector) continue;
    const c2 = chunks[i];
    points.push({ id: i + 1, vector, payload: { rel: c2.rel, start: c2.start, end: c2.end, isDoc: c2.isDoc, snippet: c2.text.slice(0, 1500) } });
    if (points.length >= 64 && !await flush()) return { error: "failed to upsert vectors to Qdrant" };
  }
  if (!await flush()) return { error: "failed to upsert vectors to Qdrant" };
  const notes = [];
  if (capped) notes.push(`Embedded ${chunks.length} chunks (repo has more) \u2014 raise ULTRADOC_MAX_CHUNKS for fuller semantic coverage.`);
  if (failed) notes.push(`${failed} chunk(s) failed to embed \u2014 the semantic index is partial.`);
  const tooHollow = failed / chunks.length > 0.2;
  if (!tooHollow) {
    try {
      mkdirSync5(dirname2(marker), { recursive: true });
      writeFileSync4(marker, JSON.stringify({ collection: name, commit, chunks: chunks.length, dim }));
    } catch {
    }
  }
  return { name, notes };
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
function semanticControl(action) {
  if (!["up", "down", "status"].includes(action)) {
    return { message: `ultradoc semantic: unknown action "${action}" (use: up | down | status)`, code: 1 };
  }
  if (!have("docker")) {
    return { message: "ultradoc semantic: docker not found. Install Docker, then retry. See references/semantic-setup.md.", code: 1 };
  }
  const file = composeFile();
  if (action === "down") {
    const r = sh("docker", ["compose", "-f", file, "--profile", "all", "down"], { timeoutMs: 12e4 });
    return { message: r.ok ? "ultradoc semantic: stack stopped." : `ultradoc semantic: down failed.
${r.stderr}`, code: r.ok ? 0 : 1 };
  }
  if (action === "status") {
    const r = sh("docker", ["compose", "-f", file, "ps"], { timeoutMs: 3e4 });
    return { message: r.ok ? r.stdout || "ultradoc semantic: no services running." : `ultradoc semantic: status failed.
${r.stderr}`, code: 0 };
  }
  const up = sh("docker", ["compose", "-f", file, "--profile", "all", "up", "-d"], { timeoutMs: 3e5 });
  if (!up.ok) return { message: `ultradoc semantic: up failed.
${up.stderr}`, code: 1 };
  const pull = sh("docker", ["compose", "-f", file, "exec", "-T", "ollama", "ollama", "pull", EMBED_MODEL], { timeoutMs: 6e5 });
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
  const byKey = /* @__PURE__ */ new Map();
  for (const it of [...lexical.items, ...sem.items]) {
    const key = it.ref + "@" + (it.location ?? "");
    if (!byKey.has(key)) byKey.set(key, it);
  }
  const fused = rrf([lexical.items, sem.items], (it) => it.ref + "@" + (it.location ?? ""));
  const ranked = [...byKey.values()].map((it) => ({ it, s: fused.get(it.ref + "@" + (it.location ?? "")) ?? 0 })).sort((a, b) => b.s - a.s).slice(0, ctx.options.perSource).map(({ it, s }) => ({ ...it, score: Number(s.toFixed(4)) }));
  return {
    source: "code",
    items: ranked,
    notes: [...coverage2, ...lexical.notes, ...sem.notes, "Fused lexical + semantic results (RRF)."],
    fallbacks
  };
}

// src/sources/docs.ts
import { join as join11 } from "path";
import { existsSync as existsSync6, readFileSync as readFileSync5, statSync as statSync5, writeFileSync as writeFileSync5, mkdirSync as mkdirSync6 } from "fs";
var DOCS_ENTRY_BOOST = 1.2;
var DOCS_ROOT_BOOST = 1.5;
function extdocsTtlMs() {
  return envInt("ULTRADOC_EXTDOCS_TTL_HOURS", 168) * 36e5;
}
async function getDocText(repoDir, url) {
  const dir = join11(repoDir, ".ultradoc", "extdocs");
  const file = join11(dir, url.replace(/[^a-z0-9]+/gi, "_").slice(0, 100) + ".v2.txt");
  let cached;
  let fresh = false;
  try {
    if (existsSync6(file)) {
      cached = readFileSync5(file, "utf8");
      fresh = Date.now() - statSync5(file).mtimeMs < extdocsTtlMs();
    }
  } catch {
  }
  if (cached !== void 0 && fresh) return { text: cached };
  const res = await fetchAndExtract(url);
  if (res.text) {
    try {
      mkdirSync6(dir, { recursive: true });
      writeFileSync5(file, res.text);
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
    const content = readText(join11(ctx.repoDir, rel));
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    let bestLine = -1;
    let bestHits = 0;
    const covered = /* @__PURE__ */ new Set();
    for (let i = 0; i < lines.length; i++) {
      const here = matcher.matchLine(lines[i]);
      for (const c2 of here) covered.add(c2);
      if (here.size > bestHits) {
        bestHits = here.size;
        bestLine = i;
      }
    }
    if (covered.size === 0) continue;
    const inDocsRoot = ctx.index.docsRoot ? rel.startsWith(ctx.index.docsRoot + "/") : false;
    const boost = (/readme|getting|guide|usage|tutorial/i.test(rel) ? DOCS_ENTRY_BOOST : 1) * (inDocsRoot ? DOCS_ROOT_BOOST : 1);
    scored.push({ rel, score: covered.size * 3 * boost + bestHits * 0.5, anchor: bestLine, lines });
  }
  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
  for (const d of scored.slice(0, ctx.options.perSource)) {
    const start = Math.max(0, d.anchor - 4);
    const end = Math.min(d.lines.length, d.anchor + 14);
    const heading = /\.(md|mdx)$/i.test(d.rel) ? nearestHeading(d.lines, d.anchor) : void 0;
    items.push({
      source: "docs",
      title: heading ? `${d.rel} \xA7 ${heading} (in-repo docs)` : `${d.rel} (in-repo docs)`,
      ref: d.rel,
      location: `${d.rel}:${start + 1}-${end}`,
      score: Number(d.score.toFixed(3)),
      snippet: d.lines.slice(start, end).join("\n"),
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
import { join as join12 } from "path";

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
  const out = [];
  for (const l of lists) {
    const key = l.join(" ");
    if (l.length && !seen.has(key)) {
      seen.add(key);
      out.push(l);
    }
  }
  return out;
}
function withRankScores(items) {
  return items.map((it, i) => ({ ...it, score: items.length - i }));
}

// src/sources/releases.ts
var CHANGELOG_RE = /(^|\/)(changelog|changes|history|news|releases?)(\.[a-z0-9]+)?$/i;
var VERSION_HEADING_RE = /^(#{1,4}\s*\[?v?\d+\.\d+|v?\d+\.\d+(\.\d+)?\s*[/(—-])/;
function changelogSections(file, content) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let cur;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (VERSION_HEADING_RE.test(line)) {
      if (cur) sections.push(cur);
      const version = /v?(\d+\.\d+[^\s\])/(—-]*)/.exec(line)?.[1] ?? line.trim().slice(0, 20);
      cur = { file, version, start: i + 1, lines: [line] };
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
  let body;
  const perPage = LIMITS.releasesFetched;
  if (have("gh")) {
    const res = sh("gh", ["api", `repos/${ref.owner}/${ref.repo}/releases?per_page=${perPage}`]);
    if (res.ok) body = res.stdout;
  }
  if (!body) {
    const r = await httpGet(`https://api.github.com/repos/${ref.owner}/${ref.repo}/releases?per_page=${perPage}`, {
      accept: "application/vnd.github+json",
      headers: ghAuthHeaders(),
      retries: 2
    });
    if (!r.ok) {
      notes.push(`GitHub releases API unavailable (status ${r.status}); used the changelog only.`);
      return { items: [], notes };
    }
    body = r.body;
  }
  let releases;
  try {
    releases = JSON.parse(body);
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
    const content = readText(join12(ctx.repoDir, rel));
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
    const body = show.ok ? show.stdout.replace(/\r/g, "").trim().slice(0, 1200) : c2.subject;
    items.push({
      source: "history",
      title: `${c2.sha} ${c2.subject} (${c2.date})`,
      ref: `commit:${c2.sha}`,
      location: c2.sha,
      score: c2.kws.size * 3,
      snippet: `${c2.date} \xB7 ${c2.author} \xB7 matched: ${[...c2.kws].join(", ")}

${body}`,
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
    const body = String(it.body ?? "").replace(/\r/g, "").trim().slice(0, 1200);
    const labels = (it.labels ?? []).map((l) => typeof l === "string" ? l : l.name).filter(Boolean).join(", ");
    const state = it.draft ? "draft" : it.state;
    return {
      source: kind,
      title: `#${it.number} ${it.title} [${state}]`,
      ref: `${kind}#${it.number}`,
      location: it.html_url,
      score: Number(it.score ?? 0),
      snippet: `state: ${state}` + (labels ? ` \xB7 labels: ${labels}` : "") + ` \xB7 comments: ${it.comments ?? 0} \xB7 updated: ${it.updated_at ?? "?"}

` + (body || "(no description)"),
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
      const body = String(it.description ?? "").replace(/\r/g, "").trim().slice(0, 1200);
      return {
        source: kind,
        title: `${marker}${num} ${it.title} [${it.state}]`,
        ref: `${kind}#${num}`,
        location: it.web_url,
        score: 0,
        // GitLab exposes no relevance score; withRankScores sets it
        snippet: `state: ${it.state} \xB7 updated: ${it.updated_at ?? "?"}

${body || "(no description)"}`,
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
    const body = String(it.body ?? "").replace(/\r/g, "").trim().slice(0, 1200);
    return {
      source: kind,
      title: `${marker}${num} ${it.title} [${it.state}]`,
      ref: `${kind}#${num}`,
      location: it.html_url,
      score: 0,
      // Gitea exposes no relevance score; withRankScores sets it
      snippet: `state: ${it.state}${labels ? ` \xB7 labels: ${labels}` : ""} \xB7 updated: ${it.updated_at ?? "?"}

${body || "(no description)"}`,
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
    const body = String(d.bodyText ?? "").replace(/\r/g, "").trim().slice(0, 800);
    const answer = String(d.answer?.bodyText ?? "").replace(/\r/g, "").trim().slice(0, 600);
    items.push({
      source: "discussion",
      title: `#${d.number} ${d.title}${d.category?.name ? ` [${d.category.name}]` : ""}`,
      ref: `discussion#${d.number}`,
      location: d.url,
      score: 0,
      // reranked by keyword coverage below
      snippet: `updated: ${d.updatedAt ?? "?"}

${body || "(no description)"}` + (answer ? `

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
    const body = htmlToText(String(it.body ?? "")).slice(0, 1200);
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

${body || "(no body)"}`,
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
  const i = SOURCE_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
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
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      if (droppedItems.has(a.item)) continue;
      const ra = lineRange(a.item.location);
      if (!ra) continue;
      for (let j = i + 1; j < group.length; j++) {
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
  const evidence = assignIds(results);
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
  return { dir, evidence, meta, paths };
}
async function runSingleSource(options, kind) {
  const ctx = buildContext({ ...options, sources: [kind] });
  const results = await runSources(ctx);
  return { ctx, evidence: assignIds(results), notes: results.flatMap((r) => r.notes) };
}

// src/doc.ts
import { mkdirSync as mkdirSync8, writeFileSync as writeFileSync7 } from "fs";
import { basename as basename3, join as join14 } from "path";

// src/overview.ts
import { existsSync as existsSync7, mkdirSync as mkdirSync7, readFileSync as readFileSync6, writeFileSync as writeFileSync6 } from "fs";
import { basename as basename2, dirname as dirname3, join as join13 } from "path";
var CACHE_MARK = /<!-- ultradoc:overview commit=([^\s]+) -->/;
function overviewPath(repoDir) {
  return join13(repoDir, ".ultradoc", "OVERVIEW.md");
}
function readmeAbout(repoDir, docFiles) {
  const readme = docFiles.find((f) => /^readme(\.|$)/i.test(f));
  if (!readme) return [];
  const text = readText(join13(repoDir, readme));
  const out = [];
  let chars = 0;
  for (const para of text.split(/\r?\n\s*\r?\n/)) {
    const p = para.trim();
    if (!p || p.startsWith("#") || p.startsWith("<") || p.startsWith("!") || p.startsWith("[![") || p.startsWith("```")) continue;
    out.push(p.replace(/\s*\r?\n\s*/g, " "));
    chars += p.length;
    if (out.length >= 3 || chars > 700) break;
  }
  return out;
}
function layout(repoDir, index) {
  let counts;
  if (index.topDirs) {
    counts = new Map(Object.entries(index.topDirs).map(([top, n]) => [top === "." ? "(root)" : top + "/", n]));
  } else {
    counts = /* @__PURE__ */ new Map();
    for (const f of walk(repoDir)) {
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
  const name = ref.repo ?? basename2(repoDir);
  const out = [];
  out.push(`<!-- ultradoc:overview commit=${index.commit ?? "unknown"} -->`);
  out.push(`# ${name} \u2014 repository overview`);
  out.push("");
  out.push(`**Repo:** ${ref.raw}${index.commit ? ` @ ${index.commit}` : ""} \xB7 **host:** ${ref.host}`);
  const langs = Object.entries(index.languages).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`);
  out.push(`**Files:** ${index.fileCount} \xB7 **symbols:** ${index.symbols.length} \xB7 **languages:** ${langs.join(", ")}`);
  out.push(`**Generated:** ${index.builtAt} (regenerate with \`ultradoc overview --refresh\`)`);
  out.push("");
  out.push(
    `> This is a cached navigation map for answering questions about the repo without re-indexing. It is NOT citable evidence \u2014 ground answers in a dossier from \`ultradoc ask\`.`
  );
  out.push("");
  const about = readmeAbout(repoDir, index.docFiles);
  if (about.length) {
    out.push("## About");
    out.push("");
    for (const p of about) out.push(p, "");
  }
  if (index.packages.length) {
    out.push("## Workspace packages");
    out.push("");
    out.push(`This is a monorepo with ${index.packages.length} packages. Scope any question with \`--package <name|dir>\`.`);
    out.push("");
    out.push("| package | path | description |");
    out.push("|---------|------|-------------|");
    for (const p of index.packages) {
      out.push(`| ${p.name} | \`${p.dir}\` | ${p.description ?? ""} |`);
    }
    out.push("");
  }
  out.push("## Layout");
  out.push("");
  for (const l of layout(repoDir, index)) out.push(`- \`${l.dir}\` \u2014 ${l.files} files`);
  out.push("");
  out.push("## Public API");
  out.push("");
  if (index.packages.length) {
    for (const p of index.packages) {
      const lines = apiLines(index.symbols, p.dir, 10, 8);
      if (!lines.length) continue;
      out.push(`### ${p.name} (\`${p.dir}\`)`);
      out.push("");
      out.push(...lines);
      out.push("");
    }
  } else {
    const lines = apiLines(index.symbols);
    out.push(...lines.length ? lines : ["_No exported symbols were detected._"]);
    out.push("");
  }
  out.push("## Documentation");
  out.push("");
  if (index.docsRoot) out.push(`- Canonical docs tree: \`${index.docsRoot}/\``);
  if (index.docsUrl) out.push(`- Official docs site: ${index.docsUrl}`);
  for (const d of index.docFiles.slice(0, 40)) out.push(`- \`${d}\``);
  if (index.docFiles.length > 40) out.push(`- \u2026 ${index.docFiles.length - 40} more doc files`);
  out.push("");
  return out.join("\n");
}
function ensureOverview(index, ref, repoDir, opts = {}) {
  const path = opts.out ?? overviewPath(repoDir);
  if (!opts.refresh && existsSync7(path)) {
    try {
      const existing = readFileSync6(path, "utf8");
      const commit = CACHE_MARK.exec(existing)?.[1];
      if (commit && commit === (index.commit ?? "unknown")) {
        return { path, markdown: existing, cached: true };
      }
    } catch {
    }
  }
  const markdown = renderOverview(index, ref, repoDir);
  mkdirSync7(dirname3(path), { recursive: true });
  writeFileSync6(path, markdown);
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
    return rel ? readText(join14(repoDir, rel)) : "";
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
function buildOutline(index, name, scopePkg, traits) {
  const sections = [];
  let n = 0;
  const add = (title, query4, sources) => sections.push({ id: `S${++n}`, title, query: query4, sources });
  add("Overview", `${name} overview introduction purpose what is`, ["docs", "code"]);
  add("Installation & usage", `${name} install setup usage getting started example quickstart`, ["docs", "code"]);
  if (traits?.isCli) {
    add("Commands", `${name} command subcommand flags options usage help argv arguments`, ["code", "docs"]);
  }
  if (index.packages.length && !scopePkg) {
    for (const pkg of index.packages.slice(0, LIMITS.docPackages)) {
      const syms = topExportedSymbols(index, pkg.dir, 5);
      add(`Package: ${pkg.name}`, `${pkg.name} ${pkg.dir} ${syms.join(" ")}`.trim(), ["code", "docs"]);
    }
  } else if (traits ? traits.isLib : true) {
    const syms = topExportedSymbols(index, scopePkg?.dir, 6);
    add("Public API", `${name} public API exports main entry ${syms.join(" ")}`.trim(), ["code", "docs"]);
  }
  if (!traits || traits.hasConfigSurface) {
    add("Configuration", `${name} configuration options config settings environment flags`, ["code", "docs"]);
  }
  add("Architecture & internals", `${name} architecture design internals how it works module structure`, ["docs", "code"]);
  return sections;
}
var dedupKey = (it) => `${it.source}|${it.ref}|${it.location ?? ""}|${(it.snippet ?? "").slice(0, 120)}`;
var sourceRank = (s) => {
  const i = SOURCE_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
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
  const evidence = flat.map((it, i) => ({ id: `E${i + 1}`, ...it }));
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
  const out = [];
  out.push(`# Documentation worklist \u2014 ${plan.repo}${plan.commit ? ` @ ${plan.commit}` : ""}`);
  if (plan.pkg) out.push(`**Package:** ${plan.pkg}`);
  out.push("");
  out.push(
    `> Write the final document to \`DOC.md\` in this folder. Write each section below as grounded prose and **cite the evidence ids** ([E#]) \u2014 every factual claim needs a citation that resolves. Read \`EVIDENCE.md\` for the full snippets. If a section's evidence is thin, drill more (\`ultradoc code|docs --repo \u2026 --q \u2026\`) or state the gap explicitly \u2014 never write from memory. Then run \`ultradoc check --run <dir>\`.`
  );
  out.push("");
  for (const s of plan.sections) {
    out.push(`## ${s.id} \xB7 ${s.title}`);
    out.push(`_query:_ \`${s.query}\``);
    if (!s.evidenceIds.length) {
      out.push(`_evidence:_ none retrieved \u2014 drill this section or mark it an explicit unknown.`);
      out.push("");
      continue;
    }
    out.push(`_evidence:_ ${s.evidenceIds.map((id) => `[${id}]`).join(" ")}`);
    for (const id of s.evidenceIds) {
      const e = byId.get(id);
      if (!e) continue;
      const firstLine = (e.snippet ?? "").split("\n").find((l) => l.trim()) ?? e.title;
      out.push(`- [${id}] \`${e.ref}\` \u2014 ${firstLine.slice(0, 120)}`);
    }
    out.push("");
  }
  return out.join("\n");
}
function defaultDocDir(repoDir, scopePkg) {
  const base = join14(indexDir(repoDir), "doc");
  return scopePkg ? join14(base, slugify(scopePkg.name)) : base;
}
async function runDoc(options, opts = {}) {
  const ctx = buildContext(options);
  const name = ctx.repoRef.repo ?? basename3(ctx.repoDir);
  const traits = detectProjectTraits(ctx.repoDir, ctx.index);
  const outline = buildOutline(ctx.index, name, ctx.scopePkg, traits);
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
    notes: [.../* @__PURE__ */ new Set([...docNotes, ...perSection.flatMap((p) => p.notes)])]
  };
  const dir = options.out ?? defaultDocDir(ctx.repoDir, ctx.scopePkg);
  mkdirSync8(dir, { recursive: true });
  const evidenceJson = join14(dir, "evidence.json");
  const evidenceMd = join14(dir, "EVIDENCE.md");
  const planJson = join14(dir, "DOC.plan.json");
  const todoMd = join14(dir, "DOC.todo.md");
  const metaJson = join14(dir, "meta.json");
  writeFileSync7(evidenceJson, JSON.stringify(evidence, null, 2));
  writeFileSync7(evidenceMd, renderEvidenceMarkdown(evidence, meta));
  writeFileSync7(planJson, JSON.stringify(plan, null, 2));
  writeFileSync7(todoMd, renderDocTodo(plan, evidence));
  writeFileSync7(metaJson, JSON.stringify(meta, null, 2));
  let overviewPath2;
  try {
    overviewPath2 = ensureOverview(ctx.index, ctx.repoRef, ctx.repoDir).path;
  } catch {
  }
  return { dir, plan, evidence, paths: { dir, evidenceJson, evidenceMd, planJson, todoMd, metaJson, overviewPath: overviewPath2 } };
}

// src/check.ts
import { existsSync as existsSync9, readFileSync as readFileSync8 } from "fs";
import { basename as basename4, dirname as dirname4, join as join16, resolve as resolvePath, sep as sep3 } from "path";

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
  const norm = (s) => s.replace(/^v/i, "");
  return tag === payload || norm(tag) === norm(payload);
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
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      mask[i] = true;
      inFence = !inFence;
      continue;
    }
    mask[i] = inFence;
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
  let i = 0;
  while (i < lines.length) {
    if (code[i]) {
      flush();
      i++;
      continue;
    }
    const raw = lines[i];
    const line = stripInlineCode(raw);
    const t = line.trim();
    if (t === "" || isHeadingOrRule(t) || isTableSeparator(line)) {
      flush();
      i++;
      continue;
    }
    if (isTableRow(line)) {
      flush();
      units.push({ kind: "text", text: tableCells(raw) });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const dequoted = raw.replace(/^\s*>\s?/, "").trim();
      if (dequoted) prose.push(dequoted);
      i++;
      continue;
    }
    if (isListItem(line)) {
      flush();
      const items = [];
      while (i < lines.length && !code[i]) {
        const rawL = lines[i];
        const l = stripInlineCode(rawL);
        const tt = l.trim();
        if (tt === "" || isHeadingOrRule(tt) || isTableSeparator(l) || isTableRow(l)) break;
        if (isListItem(l)) items.push(rawL.replace(/^\s*([-*+]|\d+\.)\s+/, "").trim());
        else if (items.length) items[items.length - 1] += " " + rawL.trim();
        else items.push(rawL.trim());
        i++;
      }
      units.push({ kind: "list", items });
      continue;
    }
    prose.push(raw);
    i++;
  }
  flush();
  return units;
}
function citationTokensIn(text) {
  const masked = stripInlineCode(text);
  const out = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while (m = TOKEN_RE.exec(masked)) {
    const tok = m[1].trim();
    if (isCitation(tok) && !out.includes(tok)) out.push(tok);
  }
  return out;
}
function citedEvidenceIds(text, evidence) {
  const ids = new Set(evidence.map((e) => e.id));
  const out = [];
  const push = (id) => {
    if (!out.includes(id)) out.push(id);
  };
  for (const tok of citationTokensIn(text)) {
    if (SHAPE.id.test(tok)) {
      if (ids.has(tok)) push(tok);
      continue;
    }
    for (const e of evidence) if (e.ref === tok) push(e.id);
    for (const e of resolveAlias(tok, evidence)) push(e.id);
  }
  return out;
}
function collectCitations(text) {
  const tokens = [];
  for (const u of extractClaimUnits(text)) {
    const parts = u.kind === "text" ? [u.text] : u.items;
    for (const part of parts) for (const t of citationTokensIn(part)) if (!tokens.includes(t)) tokens.push(t);
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
import { existsSync as existsSync8, readFileSync as readFileSync7, writeFileSync as writeFileSync8 } from "fs";
import { join as join15 } from "path";
var VERIFY_MAX = LIMITS.verifyPairs;
var VALID_VERDICTS = ["supported", "partial", "refuted", "unsupported"];
var MIN_UNCITED_LEN = 25;
function claimStrings(text) {
  const out = [];
  for (const u of extractClaimUnits(text)) {
    if (u.kind === "text") out.push(u.text);
    else for (const it of u.items) out.push(it);
  }
  return out;
}
function runVerify(dir, opts = {}) {
  const evidencePath = join15(dir, "evidence.json");
  if (!existsSync8(evidencePath)) throw new Error(`No evidence.json in ${dir} \u2014 run \`ultradoc ask\` first.`);
  const evidence = JSON.parse(readFileSync7(evidencePath, "utf8"));
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const answerPath = resolveAnswerPath(dir, opts.answerFile);
  if (!answerPath) throw new Error(`No ${opts.answerFile ?? "ANSWER.md or DOC.md"} in ${dir} \u2014 write the answer first.`);
  const answer = readFileSync7(answerPath, "utf8");
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
  const todo = {
    run: dir,
    pairs: worklist.pairs.map((p) => ({ ...p, verdict: null, note: "" })),
    uncitedClaims
  };
  writeFileSync8(join15(dir, "VERIFY.todo.json"), JSON.stringify(todo, null, 2));
  writeFileSync8(join15(dir, "VERIFY.md"), renderWorklistMd(worklist, pairs.length, kept.length));
  return worklist;
}
function renderWorklistMd(wl, total, kept) {
  const out = [];
  out.push(`# Verification worklist`);
  out.push("");
  out.push(
    `For each pair, open the cited evidence and judge whether it **supports** the claim. In \`VERIFY.todo.json\`, set each \`verdict\` to one of supported \xB7 partial \xB7 refuted \xB7 unsupported, add a short \`note\`, save it (e.g. as \`verdicts.json\`), then run \`ultradoc verify --apply verdicts.json --run <dir>\`.`
  );
  if (wl.pairs.some((p) => p.crossCheck)) {
    out.push("");
    out.push(
      `Pairs flagged **\u26A0 cross-check** are grounded in an issue/PR \u2014 a tracker thread describes behavior at a point in time. Judge them by cross-check against CURRENT code: if the current source contradicts the claim, mark it refuted (or partial with a temporal qualifier citing the fixing release).`
    );
  }
  if (kept < total) out.push(`
_Showing ${kept} of ${total} pair(s) \u2014 capped at the highest-score evidence._`);
  out.push("");
  for (const p of wl.pairs) {
    out.push(`## ${p.claimId} \xB7 ${p.evidenceId} (${p.source} \xB7 ${p.ref})${p.crossCheck ? " \xB7 \u26A0 cross-check" : ""}`);
    out.push(`**Claim:** ${p.claim}`);
    out.push(`**Cited evidence:** ${p.digest}`);
    out.push(`**Verdict:** _____ \xB7 **Note:** _____`);
    out.push("");
  }
  if (wl.uncitedClaims.length) {
    out.push(`## Uncited claims \u2014 cite or delete`);
    out.push("");
    out.push(`These claim(s) cite no evidence, so verify cannot adjudicate them. Cite an evidence id or remove the claim (\`check\` fails on low coverage):`);
    out.push("");
    for (const u of wl.uncitedClaims) out.push(`- **${u.claimId}:** ${u.claim}`);
    out.push("");
  }
  return out.join("\n");
}
function applyVerdicts(dir, verdictsPath) {
  if (!existsSync8(verdictsPath)) {
    throw new Error(`No verdicts file at ${verdictsPath} \u2014 adjudicate VERIFY.todo.json and save it as verdicts.json first.`);
  }
  const raw = JSON.parse(readFileSync7(verdictsPath, "utf8"));
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.pairs) ? raw.pairs : [];
  const verdicts = [];
  for (const v of list) {
    if (!v || typeof v.claimId !== "string" || typeof v.evidenceId !== "string") continue;
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
  const result = reduceVerdicts(verdicts);
  writeFileSync8(join15(dir, "VERIFY.json"), JSON.stringify({ ...result, verdicts }, null, 2));
  return result;
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
    const p = join16(dir, answerFile);
    return existsSync9(p) ? p : null;
  }
  for (const name of ["ANSWER.md", "DOC.md"]) {
    const p = join16(dir, name);
    if (existsSync9(p)) return p;
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
    const metaPath = join16(dir, "meta.json");
    if (!existsSync9(metaPath)) return pin;
    const meta = JSON.parse(readFileSync8(metaPath, "utf8"));
    pin.meta = meta;
    if (!meta.commit) return pin;
    pin.recordedRepoDir = meta.repoDir;
    const repoDir = meta.repoDir && existsSync9(meta.repoDir) ? meta.repoDir : dossierRepoDir(dir);
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
function snippetMatches(stored, fileLines, start, end) {
  const norm = (l) => l.replace(/\s+/g, " ").trim();
  const clipped = CLIP_MARKER_RE.test(stored);
  const storedLines = stored.replace(CLIP_MARKER_RE, "").split(/\r?\n/).map(norm).filter((l) => l !== "");
  const windowLines = fileLines.slice(start - 1, end).map(norm).filter((l) => l !== "");
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
    const start = Number(m[2]);
    const end = m[3] ? Number(m[3]) : start;
    stats.attempted++;
    const fail2 = (reason, detail) => {
      stats.failures.push({ id: item.id, ref: item.ref, location: item.location, reason, detail });
    };
    const abs = resolvePath(repoRoot, m[1]);
    if (abs !== repoRoot && !abs.startsWith(repoRoot + sep3)) {
      fail2("escapes-repo", "the cited path resolves outside the pinned clone");
      continue;
    }
    if (!existsSync9(abs)) {
      fail2("missing-file", `file not found in the pinned clone (${repoRoot} @ ${pin.meta.commit})`);
      continue;
    }
    let lines;
    try {
      lines = readFileSync8(abs, "utf8").split(/\r?\n/);
    } catch (e) {
      fail2("missing-file", `file is unreadable (${e.message})`);
      continue;
    }
    if (start < 1 || end < start || end > lines.length) {
      fail2("range-out-of-bounds", `line range is out of bounds (file has ${lines.length} line(s) at ${pin.meta.commit})`);
      continue;
    }
    const r = snippetMatches(item.snippet, lines, start, end);
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
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (m) out.push(m[1].trim().toLowerCase());
  }
  return out;
}
function missingDocSections(dir, answerPath, answer) {
  if (basename4(answerPath) !== "DOC.md") return void 0;
  const planPath = join16(dir, "DOC.plan.json");
  if (!existsSync9(planPath)) return void 0;
  let plan;
  try {
    plan = JSON.parse(readFileSync8(planPath, "utf8"));
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
  for (let i = 0; i < 6; i++) {
    if (basename4(d) === ".ultradoc") return dirname4(d);
    const parent = dirname4(d);
    if (parent === d) break;
    d = parent;
  }
  return void 0;
}
function applySemantic(dir, result, allowUnverified = false) {
  const p = join16(dir, "VERIFY.json");
  const unverified = (what) => {
    const fix = "run `verify` then `verify --apply <verdicts.json>` first";
    if (allowUnverified) {
      result.warnings.push(`--semantic: ${what} \u2014 ${fix}; semantic gate skipped (--allow-unverified).`);
    } else {
      result.ok = false;
      result.errors.push(`--semantic: ${what} \u2014 ${fix}, or pass --allow-unverified to skip the semantic gate explicitly.`);
    }
  };
  if (!existsSync9(p)) {
    unverified("no VERIFY.json");
    return;
  }
  let sem;
  try {
    sem = JSON.parse(readFileSync8(p, "utf8"));
  } catch (e) {
    unverified(`VERIFY.json is unreadable (${e.message})`);
    return;
  }
  if (!Array.isArray(sem.verdicts) || sem.verdicts.length === 0) {
    unverified("VERIFY.json records no verdicts");
    return;
  }
  const reduced = reduceVerdicts(sem.verdicts);
  result.semantic = { ...reduced, verdicts: sem.verdicts };
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
  const evidencePath = join16(dir, "evidence.json");
  if (!existsSync9(evidencePath)) {
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
    evidence = JSON.parse(readFileSync8(evidencePath, "utf8"));
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
  const answer = readFileSync8(answerPath, "utf8");
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
    errors.push(`${basename4(answerPath)} contains no citations \u2014 a grounded answer must cite evidence ids like [E1].`);
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
  if (opts.semantic) applySemantic(dir, result, opts.allowUnverified);
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
import { existsSync as existsSync10, readdirSync as readdirSync4, rmSync, statSync as statSync6 } from "fs";
import { join as join17 } from "path";
function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = readdirSync4(dir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    const p = join17(dir, name);
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
        return statSync6(join17(root, n)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
  }
  for (const slug of slugs) {
    if (slug === "compose") continue;
    const dir = join17(root, slug);
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
    const dir = join17(root, slug);
    if (existsSync10(dir)) {
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

// src/cli.ts
var HELP = `ultradoc v${VERSION}
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
  "coverage-min"
]);
var BOOL_FLAGS = /* @__PURE__ */ new Set(["semantic", "json", "refresh", "strict", "all", "allow-unverified"]);
function fail(message) {
  process.stderr.write(`ultradoc: ${message}
`);
  process.exit(1);
}
function oneOf(name, value, allowed) {
  if (!allowed.includes(value)) {
    fail(`invalid --${name} "${value}" (expected: ${allowed.join(", ")})`);
  }
  return value;
}
function parseArgs(argv) {
  if (argv.length === 0) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
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
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
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
      let value;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next === void 0 || next.startsWith("--")) {
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
  const out = [];
  for (const t of s.split(",").map((x) => x.trim()).filter(Boolean)) {
    const k = SOURCE_TOKENS[t.toLowerCase()];
    if (!k) fail(`unknown source "${t}" (use: code,issues,prs,docs,releases,history,discussions,web,so)`);
    if (!out.includes(k)) out.push(k);
  }
  if (out.length === 0) fail("--sources resolved to nothing");
  return out;
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
    out: p.values.out ? resolve2(p.values.out) : void 0,
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
async function run(argv = process.argv.slice(2)) {
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
        const evidence2 = assignIds([{ source: "web", items, notes: notes2 }]);
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
      const res = checkRun(resolve2(dir), {
        semantic: p.bools.has("semantic"),
        answerFile: p.values.answer,
        strict: p.bools.has("strict"),
        coverageMin,
        allowUnverified: p.bools.has("allow-unverified")
      });
      if (p.bools.has("json")) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      else process.stdout.write(formatCheckReport(res, resolve2(dir)) + "\n");
      if (!res.ok) process.exit(1);
      return;
    }
    case "verify": {
      const dir = p.values.run ?? p.values.out;
      if (!dir) fail("missing --run <dossier-dir>");
      const rdir = resolve2(dir);
      if (p.values.apply) {
        const result = applyVerdicts(rdir, resolve2(rdir, p.values.apply));
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
  const modulePath = fileURLToPath(import.meta.url);
  try {
    if (realpathSync(argv1) === realpathSync(modulePath)) return true;
  } catch {
  }
  return import.meta.url === pathToFileURL(argv1).href;
}
if (isInvokedDirectly()) {
  run().catch((e) => fail(e.message));
}
export {
  parseArgs,
  run
};

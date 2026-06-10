#!/usr/bin/env node

// src/cli.ts
import { resolve as resolve2 } from "path";
import { pathToFileURL, fileURLToPath as fileURLToPath2 } from "url";
import { realpathSync } from "fs";

// src/types.ts
var VERSION = "1.3.0";

// src/clone.ts
import { existsSync, statSync, mkdirSync, readdirSync } from "fs";
import { resolve, join, basename } from "path";
import { tmpdir } from "os";

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
  "our"
]);
function keywords(question) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of question.split(/[^A-Za-z0-9_]+/)) {
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

// src/clone.ts
function cacheRoot() {
  return join(tmpdir(), "ultradoc");
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
  const dir = join(cacheRoot(), ref.slug);
  const alreadyCloned = existsSync(join(dir, ".git"));
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
    const fallback = sh(
      "git",
      ["clone", "--depth", "1", ...opts.branch ? ["--branch", opts.branch] : [], ref.cloneUrl, dir],
      { timeoutMs: 3e5 }
    );
    if (!fallback.ok) {
      throw new Error(
        `git clone failed for ${ref.cloneUrl}
${(res.stderr || fallback.stderr).trim()}`
      );
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
    const args = [
      "-C",
      dir,
      "fetch",
      "--quiet",
      ...partial ? ["--refetch"] : [],
      ...shallow ? ["--unshallow"] : [],
      "origin"
    ];
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
function originUrl(dir) {
  const res = sh("git", ["-C", dir, "remote", "get-url", "origin"]);
  return res.ok && res.stdout.trim() ? res.stdout.trim() : void 0;
}

// src/index/structural.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync2, writeFileSync, readFileSync as readFileSync2 } from "fs";
import { join as join5 } from "path";

// src/walk.ts
import { readdirSync as readdirSync2, statSync as statSync2, readFileSync } from "fs";
import { join as join2, relative, sep, extname } from "path";
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
function walk(root, opts = {}) {
  const maxFileBytes = opts.maxFileBytes ?? 1024 * 1024;
  const maxFiles = opts.maxFiles ?? 2e4;
  const out = [];
  const stack = [root];
  while (stack.length) {
    if (out.length >= maxFiles) break;
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync2(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const abs = join2(dir, name);
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
  return out;
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
  { re: /^\s*(?:const|let)\s+(?<name>[\w$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/, kind: "const", exported: false }
];
var jsTs = {
  lang: "javascript/typescript",
  exts: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
  extract(rel, content) {
    const lang = rel.match(/\.(ts|tsx|mts|cts)$/) ? "typescript" : "javascript";
    return scan(rel, content, lang, RULES);
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
  { re: /^\s*(?:public|protected|private)\s+(?:static\s+|final\s+|abstract\s+|synchronized\s+)*[\w<>\[\],.?\s]+\s+(?<name>[\w]+)\s*\(/, kind: "method", exported: (_m, l) => /\bpublic\b/.test(l) }
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
  { re: /^\s*(?:public|internal|protected|private)?\s*(?:static\s+|sealed\s+|abstract\s+|partial\s+)*(?:class|record)\s+(?<name>\w+)/, kind: "class", exported: pub2 },
  { re: /^\s*(?:public|internal|protected|private)?\s*(?:partial\s+)?interface\s+(?<name>\w+)/, kind: "interface", exported: pub2 },
  { re: /^\s*(?:public|internal|protected|private)?\s*(?:readonly\s+)?(?:ref\s+)?struct\s+(?<name>\w+)/, kind: "struct", exported: pub2 },
  { re: /^\s*(?:public|internal|protected|private)?\s*enum\s+(?<name>\w+)/, kind: "enum", exported: pub2 },
  // method: a visibility modifier, a return type, then `name(`
  { re: /^\s*(?:public|internal|protected|private)\s+(?:static\s+|virtual\s+|override\s+|async\s+|sealed\s+|abstract\s+|new\s+)*[\w<>\[\],.?]+\s+(?<name>\w+)\s*(?:<[^>]*>)?\s*\(/, kind: "method", exported: pub2 }
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
  { re: /^\s*(?:public\s+|open\s+|internal\s+|private\s+|fileprivate\s+)?(?:static\s+|class\s+|final\s+|override\s+|mutating\s+|@\w+\s+)*func\s+(?<name>\w+)/, kind: "function", exported: vis }
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
  { re: /^\s*(?:public\s+|internal\s+|private\s+|protected\s+|override\s+|open\s+|abstract\s+|suspend\s+|inline\s+|operator\s+)*fun\s+(?:<[^>]*>\s+)?(?<name>\w+)\s*\(/, kind: "function", exported: vis2 }
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
  { re: new RegExp(`^${NOT_KEYWORD}[A-Za-z_][\\w\\s\\*&<>:,]*?\\b(?<name>[A-Za-z_]\\w+)\\s*\\([^;{]*\\)\\s*(?:const)?\\s*\\{?\\s*$`), kind: "function", exported: true }
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
  { re: /^\s*(?:override\s+|final\s+|private\s+|protected\s+|implicit\s+)*def\s+(?<name>\w+)/, kind: "def", exported: (_m, l) => !/\b(private|protected)\b/.test(l) }
];
var scala = {
  lang: "scala",
  exts: [".scala", ".sc"],
  extract(rel, content) {
    return scan(rel, content, "scala", RULES15);
  }
};

// src/lang/registry.ts
var EXTRACTORS = [
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
import { join as join3 } from "path";
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
    const text = readText(join3(repoDir, readme)).slice(0, 4e4);
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
    const text = readText(join3(repoDir, cfg));
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
import { join as join4 } from "path";
var PKG_MANIFESTS = [
  "package.json",
  "Cargo.toml",
  "go.mod",
  "composer.json",
  "pyproject.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts"
];
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
  const abs = rel ? join4(root, rel) : root;
  let entries;
  try {
    entries = readdirSync3(abs);
  } catch {
    return [];
  }
  return entries.filter((n) => !n.startsWith(".") && n !== "node_modules" && isDir(join4(abs, n))).map((n) => rel ? `${rel}/${n}` : n);
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
        if (isDir(join4(root, cand))) next.push(cand);
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
  if (!PKG_MANIFESTS.some((m) => existsSync2(join4(root, dir, m)))) return void 0;
  const base = dir.split("/").pop();
  const pj = parseJson(readText(join4(root, dir, "package.json")) || readText(join4(root, dir, "composer.json")));
  if (pj && typeof pj.name === "string") {
    return { name: pj.name, dir, description: typeof pj.description === "string" ? pj.description : void 0 };
  }
  const cargo = readText(join4(root, dir, "Cargo.toml"));
  if (cargo) {
    const name = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(cargo)?.[1];
    const description = /^\s*description\s*=\s*["']([^"']+)["']/m.exec(cargo)?.[1];
    if (name) return { name, dir, description };
  }
  const gomod = readText(join4(root, dir, "go.mod"));
  if (gomod) {
    const mod = /^module\s+(\S+)/m.exec(gomod)?.[1];
    if (mod) return { name: mod, dir, description: void 0 };
  }
  const py = readText(join4(root, dir, "pyproject.toml"));
  if (py) {
    const name = tomlStringInSection(py, "project", "name") ?? tomlStringInSection(py, "tool.poetry", "name");
    const description = tomlStringInSection(py, "project", "description") ?? tomlStringInSection(py, "tool.poetry", "description");
    if (name) return { name, dir, description };
  }
  const pom = readText(join4(root, dir, "pom.xml"));
  if (pom) {
    const own = pom.replace(/<parent>[\s\S]*?<\/parent>/, "");
    const name = /<artifactId>\s*([^<]+?)\s*<\/artifactId>/.exec(own)?.[1];
    if (name) return { name, dir, description: void 0 };
  }
  return { name: base, dir, description: void 0 };
}
function workspacePatterns(root) {
  const patterns = [];
  const pj = parseJson(readText(join4(root, "package.json")));
  const ws = pj?.workspaces;
  if (Array.isArray(ws)) patterns.push(...ws.filter((p) => typeof p === "string"));
  else if (ws && Array.isArray(ws.packages)) patterns.push(...ws.packages.filter((p) => typeof p === "string"));
  const pnpm = readText(join4(root, "pnpm-workspace.yaml"));
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
  const lerna = parseJson(readText(join4(root, "lerna.json")));
  if (lerna && Array.isArray(lerna.packages)) {
    patterns.push(...lerna.packages.filter((p) => typeof p === "string"));
  }
  const cargo = readText(join4(root, "Cargo.toml"));
  if (cargo) {
    patterns.push(...tomlArrayInSection(cargo, "workspace", "members"));
    patterns.push(...tomlArrayInSection(cargo, "workspace", "exclude").map((p) => `!${p}`));
  }
  const gowork = readText(join4(root, "go.work"));
  if (gowork) {
    const block = /^use\s*\(([\s\S]*?)\)/m.exec(gowork)?.[1];
    const uses = block ? block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("//")) : [...gowork.matchAll(/^use\s+(\S+)/gm)].map((m) => m[1]);
    patterns.push(...uses);
  }
  const py = readText(join4(root, "pyproject.toml"));
  if (py) {
    patterns.push(...tomlArrayInSection(py, "tool.uv.workspace", "members"));
    patterns.push(...tomlArrayInSection(py, "tool.uv.workspace", "exclude").map((p) => `!${p}`));
  }
  const composer = parseJson(readText(join4(root, "composer.json")));
  if (composer && Array.isArray(composer.repositories)) {
    for (const r of composer.repositories) {
      if (r && r.type === "path" && typeof r.url === "string") patterns.push(r.url);
    }
  }
  const pom = readText(join4(root, "pom.xml"));
  if (pom) {
    const block = /<modules>([\s\S]*?)<\/modules>/.exec(pom)?.[1];
    if (block) {
      for (const m of block.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)) patterns.push(m[1]);
    }
  }
  for (const f of ["settings.gradle", "settings.gradle.kts"]) {
    const gradle = readText(join4(root, f));
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
function resolvePackage(packages, query2) {
  const q = query2.toLowerCase().replace(/\/+$/, "");
  const exact = packages.find((p) => p.name.toLowerCase() === q) ?? packages.find((p) => p.dir.toLowerCase() === q);
  if (exact) return exact;
  const short = packages.filter(
    (p) => p.name.toLowerCase().split("/").pop() === q || p.dir.toLowerCase().split("/").pop() === q
  );
  if (short.length === 1) return short[0];
  if (short.length > 1) return void 0;
  const loose = packages.filter(
    (p) => p.name.toLowerCase().includes(q) || p.dir.toLowerCase().includes(q)
  );
  return loose.length === 1 ? loose[0] : void 0;
}

// src/index/structural.ts
var SCHEMA_VERSION = 3;
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
  return join5(root, ".ultradoc");
}
function indexPath(root) {
  return join5(indexDir(root), "index.json");
}
function isDoc(rel, ext) {
  const base = rel.split("/").pop().toLowerCase();
  return DOC_EXT.has(ext) || DOC_BASENAME.test(base) || DOC_DIR2.test(rel);
}
function isConfig(rel) {
  return CONFIG_BASENAME.has(rel.split("/").pop().toLowerCase());
}
function buildIndex(root, slug, opts = {}) {
  const files = walk(root, { maxFiles: opts.maxFiles });
  const languages = {};
  const symbols = [];
  const docFiles = [];
  const configFiles = [];
  for (const f of files) {
    const lang = languageOf(f.ext);
    languages[lang] = (languages[lang] ?? 0) + 1;
    if (isDoc(f.rel, f.ext)) docFiles.push(f.rel);
    if (isConfig(f.rel)) configFiles.push(f.rel);
    const content = readText(f.abs);
    if (!content) continue;
    const syms = extractSymbols(f.rel, f.ext, content);
    for (const s of syms.slice(0, 400)) symbols.push(s);
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

// src/index/search.ts
import { statSync as statSync4 } from "fs";
import { join as join6, relative as relative2, sep as sep2 } from "path";

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
var CONTEXT = 3;
function rgSearch(root, kws, scope) {
  const args = [
    "--json",
    "-i",
    "-F",
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
  for (const kw of kws) args.push("-e", kw);
  args.push(root);
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
      const m = (sm.match?.text ?? "").toLowerCase();
      if (m) {
        fh.matchedKw.add(m);
        fh.kwCounts.set(m, (fh.kwCounts.get(m) ?? 0) + 1);
      }
    }
    fh.lines.push({ line: lineNo, text: text.slice(0, 400) });
  }
  return byFile;
}
function jsSearch(root, kws, scope) {
  const byFile = /* @__PURE__ */ new Map();
  const res = kws.map((k) => new RegExp(escapeRegExp(k), "i"));
  const base = scope ? join6(root, scope) : root;
  for (const f of walk(base, { maxFiles: 8e3 })) {
    const rel = scope ? `${scope}/${f.rel}` : f.rel;
    const content = readText(f.abs);
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    let fh;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matched = [];
      for (let k = 0; k < kws.length; k++) if (res[k].test(line)) matched.push(kws[k].toLowerCase());
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
function regionsFor(fh, kws, gap = 8) {
  const sorted = [...fh.lines].sort((a, b) => a.line - b.line);
  const regions = [];
  let cur = null;
  for (const h of sorted) {
    if (cur && h.line - cur.end <= gap) {
      cur.end = h.line;
      cur.lines.push(h);
    } else {
      if (cur) regions.push(scoreRegion(cur, kws));
      cur = { start: h.line, end: h.line, lines: [h] };
    }
  }
  if (cur) regions.push(scoreRegion(cur, kws));
  return regions;
}
function scoreRegion(cur, kws) {
  const covered = /* @__PURE__ */ new Set();
  let anchor = cur.start;
  let best = -1;
  for (const h of cur.lines) {
    let here = 0;
    for (const kw of kws) if (h.text.toLowerCase().includes(kw.toLowerCase())) {
      covered.add(kw.toLowerCase());
      here++;
    }
    if (here > best) {
      best = here;
      anchor = h.line;
    }
  }
  return { start: cur.start, end: cur.end, anchor, kwCount: covered.size };
}
function symbolScores(index, kws) {
  const lowered = kws.map((k) => k.toLowerCase());
  const byFile = /* @__PURE__ */ new Map();
  for (const sym of index.symbols) {
    const name = sym.name.toLowerCase();
    let s = 0;
    for (const kw of lowered) {
      if (name === kw) s += 6;
      else if (name.startsWith(kw) || kw.startsWith(name)) s += 3;
      else if (name.includes(kw) || kw.includes(name)) s += 1.5;
    }
    if (s === 0) continue;
    if (sym.exported) s *= 1.5;
    const key = sym.file;
    const prev = byFile.get(key);
    if (!prev || s > prev.score) byFile.set(key, { score: s, sym });
  }
  return byFile;
}
function searchCode(root, ref, index, question, perSource, scope) {
  const notes = [];
  const inScope = (rel) => !scope || rel.startsWith(scope + "/");
  let kws = keywords(question).slice(0, MAX_KEYWORDS);
  if (kws.length === 0) {
    notes.push("No distinctive keywords in the question; code search may be weak.");
    kws = question.split(/\s+/).filter(Boolean).slice(0, MAX_KEYWORDS);
  }
  if (kws.length === 0) return { items: [], notes };
  const usedRg = have("rg");
  if (!usedRg) notes.push("ripgrep not found \u2014 used the slower built-in scanner.");
  const lexical = usedRg ? rgSearch(root, kws, scope) : jsSearch(root, kws, scope);
  const symbols = symbolScores(index, kws);
  const files = new Set([...lexical.keys(), ...symbols.keys()].filter(inScope));
  const lowered = kws.map((k) => k.toLowerCase());
  const df = /* @__PURE__ */ new Map();
  for (const fh of lexical.values()) {
    for (const kw of fh.kwCounts.keys()) df.set(kw, (df.get(kw) ?? 0) + 1);
  }
  const candidates = [...files].filter((rel) => lexical.has(rel)).map((rel) => {
    let len = 1e3;
    try {
      len = Math.max(1, statSync4(join6(root, rel)).size / 5);
    } catch {
    }
    return { key: rel, tf: lexical.get(rel).kwCounts, len };
  });
  const lexScores = bm25(candidates, lowered, Math.max(index.fileCount, lexical.size), df, 1.2, 0.3);
  const lexRank = [...lexScores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([rel]) => rel);
  const symRank = [...symbols.entries()].filter(([rel]) => files.has(rel)).sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0])).map(([rel]) => rel);
  const fused = rrf([lexRank, symRank], (rel) => rel);
  const docSet = new Set(index.docFiles);
  const scored = [];
  for (const rel of files) {
    const base = fused.get(rel) ?? 0;
    if (base <= 0) continue;
    const lowSignal = /(^|\/)(test|tests|__tests__|spec|specs|fixtures?|examples?|benchmark|benchmarks)\//i.test(rel) || docSet.has(rel);
    const score = base * 1e3 * (lowSignal ? 0.45 : 1);
    scored.push({ rel, score, fh: lexical.get(rel), sym: symbols.get(rel)?.sym });
  }
  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
  const items = [];
  for (const f of scored) {
    if (items.length >= perSource) break;
    const content = readText(join6(root, f.rel));
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    let start;
    let end;
    let label;
    if (f.sym) {
      start = Math.max(1, f.sym.line - 1);
      end = Math.min(lines.length, f.sym.line + 18);
      label = `${f.sym.kind} ${f.sym.name}`;
    } else if (f.fh) {
      const region = regionsFor(f.fh, kws).sort((a, b) => b.kwCount - a.kwCount || a.start - b.start)[0];
      start = Math.max(1, region.start - CONTEXT);
      end = Math.min(lines.length, region.end + CONTEXT);
      label = "match";
    } else {
      start = 1;
      end = Math.min(lines.length, 20);
      label = "match";
    }
    const excerpt = lines.slice(start - 1, end).join("\n");
    const url = ref.isLocal ? void 0 : `${ref.webUrl}/blob/${index.commit ?? "HEAD"}/${f.rel}#L${start}-L${end}`;
    items.push({
      source: "code",
      title: `${f.rel} \u2014 ${label}`,
      ref: f.rel,
      location: `${f.rel}:${start}-${end}`,
      score: Number(f.score.toFixed(3)),
      snippet: excerpt,
      url,
      meta: { matchedKeywords: f.fh ? [...f.fh.matchedKw] : [], symbol: f.sym?.name }
    });
  }
  return { items, notes };
}

// src/index/semantic.ts
import { existsSync as existsSync4, readFileSync as readFileSync3, writeFileSync as writeFileSync2, mkdirSync as mkdirSync3 } from "fs";
import { join as join7, dirname } from "path";
import { fileURLToPath } from "url";

// src/sources/fetch.ts
var UA = "ultradoc/0.x (+https://github.com/maxgfr/ultradoc)";
async function httpGet(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 2e4);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: opts.accept ?? "*/*" }
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const max = opts.maxBytes ?? 4 * 1024 * 1024;
    return {
      ok: res.ok,
      status: res.status,
      body: buf.subarray(0, max).toString("utf8"),
      contentType: res.headers.get("content-type") ?? ""
    };
  } catch (e) {
    return { ok: false, status: 0, body: "", contentType: "", error: e.message };
  } finally {
    clearTimeout(t);
  }
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
    let data = void 0;
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
  const res = await httpGet(url, { accept: "text/html,text/plain,*/*" });
  if (!res.ok) {
    return { text: "", note: `Could not fetch ${url} (status ${res.status}${res.error ? ", " + res.error : ""}).` };
  }
  const isHtml = /html/i.test(res.contentType) || /^\s*</.test(res.body);
  const text = isHtml ? htmlToText(res.body) : res.body;
  return { text };
}
function excerptsFromText(text, url, title, source, question, perSource) {
  const lines = text.split("\n");
  const kws = keywords(question).map((k) => k.toLowerCase());
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    let cov = 0;
    for (const kw of kws) if (low.includes(kw)) cov++;
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
    items.push({
      source,
      title,
      ref: url,
      location: `${url}#~${start + 1}`,
      score: Number((h.cov + 1).toFixed(3)),
      snippet,
      url
    });
  }
  return items;
}

// src/index/semantic.ts
var QDRANT = (process.env.ULTRADOC_QDRANT || "http://localhost:6333").replace(/\/$/, "");
var OLLAMA = (process.env.ULTRADOC_OLLAMA || "http://localhost:11434").replace(/\/$/, "");
var EMBED_MODEL = process.env.ULTRADOC_EMBED_MODEL || "nomic-embed-text";
var MAX_CHUNKS = Number(process.env.ULTRADOC_MAX_CHUNKS || 800);
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
async function reachable(base, path = "/") {
  const r = await httpGet(base + path, { timeoutMs: 2500 });
  return r.ok;
}
async function embed(text) {
  const r = await httpJson("POST", `${OLLAMA}/api/embeddings`, { model: EMBED_MODEL, prompt: text }, { timeoutMs: 6e4 });
  const v = r.ok ? r.data?.embedding : void 0;
  return Array.isArray(v) && v.length ? v : null;
}
function collectionName(slug) {
  return "ultradoc_" + slug.replace(/[^a-z0-9_]/gi, "_").slice(0, 60);
}
function markerPath(repoDir) {
  return join7(repoDir, ".ultradoc", "semantic.json");
}
async function collectionExists(name) {
  const r = await httpJson("GET", `${QDRANT}/collections/${name}`);
  return r.ok && r.data?.result?.status !== void 0;
}
async function buildIfNeeded(ctx) {
  const name = collectionName(ctx.repoRef.slug);
  const marker = markerPath(ctx.repoDir);
  const commit = ctx.index.commit ?? "HEAD";
  if (existsSync4(marker)) {
    try {
      const m = JSON.parse(readFileSync3(marker, "utf8"));
      if (m.collection === name && m.commit === commit && await collectionExists(name)) {
        return { name };
      }
    } catch {
    }
  }
  const codeFiles = ctx.index.symbols.length ? [...new Set(ctx.index.symbols.map((s) => s.file))] : [];
  const files = [.../* @__PURE__ */ new Set([...codeFiles, ...ctx.index.docFiles])];
  const chunks = [];
  for (const rel of files) {
    if (chunks.length >= MAX_CHUNKS) break;
    const content = readText(join7(ctx.repoDir, rel));
    if (!content) continue;
    const isDoc2 = ctx.index.docFiles.includes(rel);
    for (const c2 of chunkText(rel, content, isDoc2)) {
      chunks.push(c2);
      if (chunks.length >= MAX_CHUNKS) break;
    }
  }
  if (chunks.length === 0) return { error: "no chunkable content to embed" };
  const first = await embed(chunks[0].text);
  if (!first) return { error: `embedding failed (is the '${EMBED_MODEL}' model pulled in Ollama?)` };
  const dim = first.length;
  await httpJson("DELETE", `${QDRANT}/collections/${name}`);
  const create = await httpJson("PUT", `${QDRANT}/collections/${name}`, {
    vectors: { size: dim, distance: "Cosine" }
  });
  if (!create.ok) return { error: `could not create Qdrant collection (${create.status})` };
  const points = [];
  const flush = async () => {
    if (!points.length) return true;
    const up = await httpJson("PUT", `${QDRANT}/collections/${name}/points?wait=true`, { points });
    points.length = 0;
    return up.ok;
  };
  for (let i = 0; i < chunks.length; i++) {
    const c2 = chunks[i];
    const vector = i === 0 ? first : await embed(c2.text);
    if (!vector) continue;
    points.push({
      id: i + 1,
      vector,
      payload: { rel: c2.rel, start: c2.start, end: c2.end, isDoc: c2.isDoc, snippet: c2.text.slice(0, 1500) }
    });
    if (points.length >= 64 && !await flush()) return { error: "failed to upsert vectors to Qdrant" };
  }
  if (!await flush()) return { error: "failed to upsert vectors to Qdrant" };
  try {
    mkdirSync3(dirname(marker), { recursive: true });
    writeFileSync2(marker, JSON.stringify({ collection: name, commit, chunks: chunks.length, dim }));
  } catch {
  }
  return { name };
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
  return { available: true, items, notes: [`Semantic search via Qdrant + ${EMBED_MODEL} (local).`] };
}
function composeFile() {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const cand of [join7(here, "..", "docker-compose.yml"), join7(here, "docker-compose.yml")]) {
    if (existsSync4(cand)) return cand;
  }
  return join7(here, "..", "docker-compose.yml");
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
async function codeSource(ctx) {
  const lexical = searchCode(
    ctx.repoDir,
    ctx.repoRef,
    ctx.index,
    ctx.options.question,
    ctx.options.perSource,
    ctx.scopeDir
  );
  if (!ctx.options.semantic) return { source: "code", items: lexical.items, notes: lexical.notes };
  const sem = await semanticSearch(ctx);
  if (ctx.scopeDir) sem.items = sem.items.filter((it) => it.ref.startsWith(ctx.scopeDir + "/"));
  if (!sem.available) {
    return {
      source: "code",
      items: lexical.items,
      notes: [...lexical.notes, ...sem.notes]
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
    notes: [...lexical.notes, ...sem.notes, "Fused lexical + semantic results (RRF)."]
  };
}

// src/sources/docs.ts
import { join as join8 } from "path";
import { existsSync as existsSync5, readFileSync as readFileSync4, writeFileSync as writeFileSync3, mkdirSync as mkdirSync4 } from "fs";
async function getDocText(repoDir, url) {
  const dir = join8(repoDir, ".ultradoc", "extdocs");
  const file = join8(dir, url.replace(/[^a-z0-9]+/gi, "_").slice(0, 100) + ".txt");
  try {
    if (existsSync5(file)) return { text: readFileSync4(file, "utf8") };
  } catch {
  }
  const res = await fetchAndExtract(url);
  if (res.text) {
    try {
      mkdirSync4(dir, { recursive: true });
      writeFileSync3(file, res.text);
    } catch {
    }
  }
  return res;
}
async function docsSource(ctx) {
  const notes = [];
  const kws = keywords(ctx.options.question).map((k) => k.toLowerCase());
  const items = [];
  const scored = [];
  for (const rel of ctx.index.docFiles) {
    if (ctx.scopeDir && !rel.startsWith(ctx.scopeDir + "/")) continue;
    if (/(^|\/)(tests?|__tests__|spec|specs|fixtures?|examples?|vendor|node_modules|third[-_]?party|deps?|bower_components)\//i.test(rel)) continue;
    const content = readText(join8(ctx.repoDir, rel));
    if (!content) continue;
    const lines = content.split(/\r?\n/);
    let bestLine = -1;
    let bestHits = 0;
    const covered = /* @__PURE__ */ new Set();
    for (let i = 0; i < lines.length; i++) {
      const low = lines[i].toLowerCase();
      let here = 0;
      for (const kw of kws) if (low.includes(kw)) {
        here++;
        covered.add(kw);
      }
      if (here > bestHits) {
        bestHits = here;
        bestLine = i;
      }
    }
    if (covered.size === 0) continue;
    const inDocsRoot = ctx.index.docsRoot ? rel.startsWith(ctx.index.docsRoot + "/") : false;
    const boost = (/readme|getting|guide|usage|tutorial/i.test(rel) ? 1.2 : 1) * (inDocsRoot ? 1.5 : 1);
    scored.push({ rel, score: covered.size * 3 * boost + bestHits * 0.5, anchor: bestLine, lines });
  }
  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
  for (const d of scored.slice(0, ctx.options.perSource)) {
    const start = Math.max(0, d.anchor - 4);
    const end = Math.min(d.lines.length, d.anchor + 14);
    items.push({
      source: "docs",
      title: `${d.rel} (in-repo docs)`,
      ref: d.rel,
      location: `${d.rel}:${start + 1}-${end}`,
      score: Number(d.score.toFixed(3)),
      snippet: d.lines.slice(start, end).join("\n"),
      url: ctx.repoRef.isLocal ? void 0 : `${ctx.repoRef.webUrl}/blob/${ctx.index.commit ?? "HEAD"}/${d.rel}`
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
import { join as join9 } from "path";
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
  if (have("gh")) {
    const res = sh("gh", ["api", `repos/${ref.owner}/${ref.repo}/releases?per_page=20`]);
    if (res.ok) body = res.stdout;
  }
  if (!body) {
    const r = await httpGet(
      `https://api.github.com/repos/${ref.owner}/${ref.repo}/releases?per_page=20`,
      { accept: "application/vnd.github+json" }
    );
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
    const content = readText(join9(ctx.repoDir, rel));
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
    const res = sh("gh", [
      "api",
      "-X",
      "GET",
      "search/issues",
      "-f",
      `q=${q}`,
      "-f",
      `per_page=${perSource}`,
      "-f",
      "sort=updated",
      "-f",
      "order=desc"
    ]);
    if (res.ok) {
      try {
        return { items: toItems(JSON.parse(res.stdout).items, kind) };
      } catch {
      }
    }
  }
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=${perSource}&sort=updated&order=desc`;
  const r = await httpGet(url, { accept: "application/vnd.github+json" });
  if (!r.ok) {
    return {
      items: [],
      error: `GitHub ${kind} search unavailable (status ${r.status}). Run \`gh auth login\` for higher-rate access.`
    };
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
      const { items, error } = await query(ref, terms, kind, perSource * 2);
      if (error) lastError = error;
      if (items.length) return { items: rerank(items, ranked).slice(0, perSource), notes: [] };
    }
    const seen = /* @__PURE__ */ new Map();
    for (const t of ranked.slice(0, 4)) {
      const { items, error } = await query(ref, [t], kind, perSource * 2);
      if (error) lastError = error;
      for (const it of items) if (!seen.has(it.ref)) seen.set(it.ref, it);
    }
    const merged = rerank([...seen.values()], ranked).slice(0, perSource);
    if (merged.length) return { items: merged, notes: [] };
    return { items: [], notes: lastError ? [lastError] : [`No ${kind}s matched the question.`] };
  }
};
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
    const key = l.join("\0");
    if (l.length && !seen.has(key)) {
      seen.add(key);
      out.push(l);
    }
  }
  return out;
}

// src/providers/gitlab.ts
var gitlab = {
  name: "gitlab",
  matches: (host) => /gitlab/i.test(host),
  async search(ref, question, kind, perSource) {
    if (!ref.owner || !ref.repo) {
      return { items: [], notes: ["No project path resolved; cannot query GitLab issues/MRs."] };
    }
    const proj = encodeURIComponent(`${ref.owner}/${ref.repo}`);
    const path = kind === "issue" ? "issues" : "merge_requests";
    const search2 = encodeURIComponent(rankedKeywords(question).slice(0, 4).join(" "));
    const url = `https://${ref.host}/api/v4/projects/${proj}/${path}?search=${search2}&per_page=${perSource}&order_by=updated_at&sort=desc`;
    const r = await httpGet(url, { accept: "application/json" });
    if (!r.ok) {
      return { items: [], notes: [`GitLab ${kind} search unavailable (status ${r.status}).`] };
    }
    try {
      const arr = JSON.parse(r.body);
      if (!Array.isArray(arr)) return { items: [], notes: [`GitLab ${kind} search returned no array.`] };
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
          snippet: `state: ${it.state} \xB7 updated: ${it.updated_at ?? "?"}

${body || "(no description)"}`,
          url: it.web_url,
          meta: { iid: num, state: it.state }
        };
      });
      return { items, notes: [] };
    } catch {
      return { items: [], notes: [`GitLab ${kind} search returned an unparseable response.`] };
    }
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
        `No public ${kind} API for host "${ref.host}". The code was cloned and indexed; issues/PRs are not retrievable for this host.`
      ]
    };
  }
};

// src/providers/registry.ts
var PROVIDERS = [github, gitlab];
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
  const res = sh("gh", [
    "api",
    "graphql",
    "-f",
    `query=${QUERY}`,
    "-f",
    `q=repo:${owner}/${repo} ${terms.join(" ")}`,
    "-F",
    `n=${n}`
  ]);
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
function withRankScores(items) {
  return items.map((it, i) => ({ ...it, score: items.length - i }));
}

// src/sources/stackoverflow.ts
async function stackoverflowSource(ctx) {
  const kws = rankedKeywords(ctx.options.question).slice(0, 5).join(" ");
  if (!kws) return { source: "so", items: [], notes: ["No keywords to search StackOverflow."] };
  const q = encodeURIComponent(kws);
  const pat = process.env.STACK_PAT ? `&access_token=${process.env.STACK_PAT}` : "";
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${q}&site=stackoverflow&filter=withbody&pagesize=${ctx.options.perSource}${pat}`;
  const r = await httpGet(url, { accept: "application/json" });
  if (!r.ok) {
    return { source: "so", items: [], notes: [`StackOverflow search unavailable (status ${r.status}).`] };
  }
  try {
    const data = JSON.parse(r.body);
    const items = (data.items ?? []).map((it) => {
      const body = htmlToText(String(it.body ?? "")).slice(0, 1200);
      const accepted = it.is_answered ? "answered" : "unanswered";
      return {
        source: "so",
        title: htmlToText(String(it.title ?? "(question)")).slice(0, 160),
        ref: `so:${it.question_id}`,
        location: it.link,
        score: Number(it.score ?? 0),
        snippet: `score: ${it.score ?? 0} \xB7 ${accepted} \xB7 answers: ${it.answer_count ?? 0}` + (it.tags?.length ? ` \xB7 tags: ${it.tags.slice(0, 6).join(", ")}` : "") + `

${body || "(no body)"}`,
        url: it.link,
        meta: { questionId: it.question_id, isAnswered: it.is_answered, answerCount: it.answer_count }
      };
    });
    const notes = data.quota_remaining !== void 0 && data.quota_remaining < 20 ? [`StackExchange anonymous quota low (${data.quota_remaining} left).`] : [];
    if (items.length === 0) notes.push("No StackOverflow questions matched.");
    return { source: "so", items, notes };
  } catch {
    return { source: "so", items: [], notes: ["StackOverflow search returned an unparseable response."] };
  }
}

// src/sources/web.ts
var SEARXNG_BASE = process.env.ULTRADOC_SEARXNG || "http://localhost:8888";
async function viaSearxng(query2, n) {
  const url = `${SEARXNG_BASE.replace(/\/$/, "")}/search?q=${encodeURIComponent(query2)}&format=json`;
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
async function viaDuckDuckGo(query2, n) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query2)}`;
  const r = await httpGet(url, { accept: "text/html", timeoutMs: 12e3 });
  if (!r.ok || !r.body) return null;
  const urls = [];
  const tagRe = /<a\b[^>]*\bresult__a\b[^>]*>/g;
  let m;
  while ((m = tagRe.exec(r.body)) && urls.length < n) {
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
  return urls.length ? urls : null;
}
async function discover(query2, engine, n) {
  const notes = [];
  if (engine === "searxng" || engine === "auto") {
    const s = await viaSearxng(query2, n);
    if (s && s.length) return { urls: s, via: "searxng", notes };
    if (engine === "searxng") notes.push(`SearXNG unreachable at ${SEARXNG_BASE}. Run \`ultradoc semantic up\`.`);
  }
  if (engine === "ddg" || engine === "auto") {
    const d = await viaDuckDuckGo(query2, n);
    if (d && d.length) return { urls: d, via: "duckduckgo", notes };
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
    items.push(...ex.length ? ex : [{
      source: "web",
      title: `Web \u2014 ${url}`,
      ref: url,
      location: url,
      score: 0,
      snippet: text.slice(0, 800),
      url
    }]);
  }
  return { items, notes };
}
async function webSource(ctx) {
  const kws = keywords(ctx.options.question).slice(0, 8).join(" ");
  const project = ctx.repoRef.repo ?? "";
  const query2 = `${project} ${kws}`.trim();
  if (!query2) return { source: "web", items: [], notes: ["No keywords to search the web."] };
  const { urls, via, notes } = await discover(query2, ctx.options.webEngine, ctx.options.perSource);
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
async function runSources(ctx) {
  const cap = ctx.options.perSource;
  const tasks = ctx.options.sources.map(async (kind) => {
    const handler = HANDLERS[kind];
    if (!handler) return { source: kind, items: [], notes: [`Unknown source "${kind}".`] };
    try {
      const res = await handler(ctx);
      const items = [...res.items].sort((a, b) => b.score - a.score).slice(0, cap);
      return { ...res, items };
    } catch (e) {
      return { source: kind, items: [], notes: [`${kind} source failed: ${e.message}`] };
    }
  });
  return Promise.all(tasks);
}

// src/dossier.ts
import { mkdirSync as mkdirSync5, writeFileSync as writeFileSync4 } from "fs";
import { join as join10 } from "path";
var SOURCE_ORDER = [
  "code",
  "docs",
  "release",
  "history",
  "issue",
  "pr",
  "discussion",
  "so",
  "web"
];
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
function defaultRunDir(slug, d) {
  return join10(cacheRoot(), slug, "runs", runId(d));
}
function assignIds(results) {
  const flat = results.flatMap((r) => r.items);
  flat.sort(
    (a, b) => rank(a.source) - rank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref)
  );
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
      const meta1 = [
        `ref: \`${it.ref}\``,
        it.location ? `loc: \`${it.location}\`` : "",
        `score: ${it.score}`
      ].filter(Boolean).join(" \xB7 ");
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
  mkdirSync5(dir, { recursive: true });
  const evidenceJson = join10(dir, "evidence.json");
  const evidenceMd = join10(dir, "EVIDENCE.md");
  const metaJson = join10(dir, "meta.json");
  writeFileSync4(evidenceJson, JSON.stringify(evidence, null, 2));
  writeFileSync4(evidenceMd, renderEvidenceMarkdown(evidence, meta));
  writeFileSync4(metaJson, JSON.stringify(meta, null, 2));
  return { dir, evidenceJson, evidenceMd, metaJson };
}

// src/ask.ts
function buildContext(options) {
  const repoRef = resolveRepo(options.repo);
  const repoDir = ensureClone(repoRef, { refresh: options.refresh, branch: options.ref });
  const project = [repoRef.repo, repoRef.owner].filter((x) => !!x);
  const index = ensureIndex(repoDir, repoRef.slug, { refresh: options.refresh, project });
  let scopePkg;
  if (options.pkg) {
    scopePkg = resolvePackage(index.packages, options.pkg);
    if (!scopePkg) {
      const known = index.packages.length ? `known packages: ${index.packages.map((p) => `${p.name} (${p.dir})`).join(", ")}` : "this repo declares no workspace packages";
      throw new Error(`--package "${options.pkg}" does not match one package \u2014 ${known}`);
    }
  }
  return { repoRef, repoDir, index, options, scopePkg, scopeDir: scopePkg?.dir };
}
async function runAsk(options) {
  const ctx = buildContext(options);
  const results = await runSources(ctx);
  const evidence = assignIds(results);
  const meta = {
    question: options.question,
    repo: ctx.repoRef.raw,
    host: ctx.repoRef.host,
    ref: options.ref,
    commit: ctx.index.commit,
    pkg: ctx.scopePkg?.name,
    sources: options.sources,
    semantic: options.semantic,
    evidenceCount: evidence.length,
    builtAt: (/* @__PURE__ */ new Date()).toISOString(),
    notes: results.flatMap((r) => r.notes)
  };
  const dir = options.out ?? defaultRunDir(ctx.repoRef.slug);
  const paths = writeDossier(dir, evidence, meta);
  return { dir, evidence, meta, paths };
}
async function runSingleSource(options, kind) {
  const ctx = buildContext({ ...options, sources: [kind] });
  const results = await runSources(ctx);
  return { ctx, evidence: assignIds(results), notes: results.flatMap((r) => r.notes) };
}

// src/check.ts
import { existsSync as existsSync6, readFileSync as readFileSync5 } from "fs";
import { join as join11 } from "path";
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
function resolves(tok, evidence, ids, refs) {
  if (SHAPE.id.test(tok)) return ids.has(tok);
  if (refs.has(tok)) return true;
  const colon = tok.indexOf(":");
  if (colon > 0) {
    const prefix = tok.slice(0, colon);
    const payload = tok.slice(colon + 1);
    const source = TYPED_SOURCE[prefix] ?? prefix;
    return evidence.some(
      (e) => e.source === source && (e.ref.includes(payload) || payload.includes(e.ref) || (e.location?.includes(payload) ?? false) || (e.url?.includes(payload) ?? false))
    );
  }
  return false;
}
function checkRun(dir) {
  const errors = [];
  const warnings = [];
  const answerPath = join11(dir, "ANSWER.md");
  const evidencePath = join11(dir, "evidence.json");
  if (!existsSync6(evidencePath)) {
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
    evidence = JSON.parse(readFileSync5(evidencePath, "utf8"));
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
  if (!existsSync6(answerPath)) {
    return {
      ok: false,
      citations: [],
      resolved: [],
      dangling: [],
      uncited: evidence.map((e) => e.id),
      errors: [`No ANSWER.md in ${dir} \u2014 write the grounded answer there, then re-run check.`],
      warnings: []
    };
  }
  const answer = readFileSync5(answerPath, "utf8");
  const ids = new Set(evidence.map((e) => e.id));
  const refs = new Set(evidence.map((e) => e.ref));
  const citations = [];
  const seen = /* @__PURE__ */ new Set();
  let m;
  TOKEN_RE.lastIndex = 0;
  while (m = TOKEN_RE.exec(answer)) {
    const tok = m[1].trim();
    if (!isCitation(tok) || seen.has(tok)) continue;
    seen.add(tok);
    citations.push(tok);
  }
  const resolved = [];
  const dangling = [];
  for (const c2 of citations) {
    if (resolves(c2, evidence, ids, refs)) resolved.push(c2);
    else dangling.push(c2);
  }
  const citedIds = new Set(resolved.filter((c2) => SHAPE.id.test(c2)));
  const uncited = evidence.map((e) => e.id).filter((id) => !citedIds.has(id));
  if (citations.length === 0) {
    errors.push("ANSWER.md contains no citations \u2014 a grounded answer must cite evidence ids like [E1].");
  }
  if (dangling.length) {
    errors.push(`Dangling citation(s) not in evidence.json: ${dangling.join(", ")}`);
  }
  if (citations.length > 0 && citedIds.size === 0) {
    warnings.push("No evidence ids were cited (only typed aliases). Prefer citing ids like [E1].");
  } else if (uncited.length) {
    warnings.push(`${uncited.length} evidence item(s) were not cited (informational).`);
  }
  return {
    ok: errors.length === 0,
    citations,
    resolved,
    dangling,
    uncited,
    errors,
    warnings
  };
}
function formatCheckReport(r, dir) {
  const lines = [];
  lines.push(`ultradoc check: ${dir}`);
  lines.push(`  citations: ${r.citations.length} \xB7 resolved: ${r.resolved.length} \xB7 dangling: ${r.dangling.length}`);
  for (const e of r.errors) lines.push(`  \u2717 ${e}`);
  for (const w of r.warnings) lines.push(`  \u26A0 ${w}`);
  lines.push(r.ok ? `  \u2713 answer is grounded \u2014 every citation resolves to evidence` : `  \u2717 answer is NOT grounded`);
  return lines.join("\n");
}

// src/overview.ts
import { existsSync as existsSync7, mkdirSync as mkdirSync6, readFileSync as readFileSync6, writeFileSync as writeFileSync5 } from "fs";
import { basename as basename2, dirname as dirname2, join as join12 } from "path";
var CACHE_MARK = /<!-- ultradoc:overview commit=([^\s]+) -->/;
function overviewPath(repoDir) {
  return join12(repoDir, ".ultradoc", "OVERVIEW.md");
}
function readmeAbout(repoDir, docFiles) {
  const readme = docFiles.find((f) => /^readme(\.|$)/i.test(f));
  if (!readme) return [];
  const text = readText(join12(repoDir, readme));
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
function layout(repoDir) {
  const counts = /* @__PURE__ */ new Map();
  for (const f of walk(repoDir)) {
    const top = f.rel.includes("/") ? f.rel.slice(0, f.rel.indexOf("/")) + "/" : "(root)";
    counts.set(top, (counts.get(top) ?? 0) + 1);
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
  for (const l of layout(repoDir)) out.push(`- \`${l.dir}\` \u2014 ${l.files} files`);
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
  mkdirSync6(dirname2(path), { recursive: true });
  writeFileSync5(path, markdown);
  return { path, markdown, cached: false };
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
  ultradoc index --repo <url|path> [--semantic] [--refresh]
  ultradoc check --run <dossier-dir>
  ultradoc semantic up|down|status

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
  index      Build/refresh the structural index for a repo and print stats.
  check      Validate ANSWER.md citations against a dossier's evidence.json.
  semantic   Manage the optional local Docker stack (Qdrant + embeddings + SearXNG).

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
  It fails if any citation does not resolve to retrieved evidence \u2014 the
  mechanical guard against answering from memory.
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
  "index",
  "check",
  "semantic"
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
  "package"
]);
var BOOL_FLAGS = /* @__PURE__ */ new Set(["semantic", "json", "refresh"]);
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
  const webEngine = oneOf("web-engine", p.values["web-engine"] ?? "auto", [
    "auto",
    "searxng",
    "ddg",
    "claude"
  ]);
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
async function main() {
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
        (s) => `${s}: ${r.evidence.filter((e) => e.source === s).length}`
      );
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
              languages: ctx.index.languages
            },
            null,
            2
          ) + "\n"
        );
        return;
      }
      const lines = [
        `ultradoc: indexed ${ctx.repoRef.raw}${ctx.index.commit ? ` @ ${ctx.index.commit}` : ""}`,
        `  path:     ${ctx.repoDir}`,
        `  files:    ${ctx.index.fileCount} \xB7 symbols: ${ctx.index.symbols.length} \xB7 docs: ${ctx.index.docFiles.length} \xB7 config: ${ctx.index.configFiles.length}`,
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
      const res = checkRun(resolve2(dir));
      process.stdout.write(formatCheckReport(res, resolve2(dir)) + "\n");
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
function isInvokedDirectly() {
  const argv1 = process.argv[1];
  if (argv1 === void 0) return false;
  const modulePath = fileURLToPath2(import.meta.url);
  try {
    if (realpathSync(argv1) === realpathSync(modulePath)) return true;
  } catch {
  }
  return import.meta.url === pathToFileURL(argv1).href;
}
if (isInvokedDirectly()) {
  main().catch((e) => fail(e.message));
}
export {
  parseArgs
};

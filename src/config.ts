import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// Central place to read environment overrides so parsing lives in one module.
// Everything here is optional — ultradoc is keyless and works with no config.

// Parse a positive-integer env override, falling back to `def` on unset/invalid.
//
// NOT the engine's `envInt`, despite what the old name suggested. This one reads
// a RAW variable name; the engine's resolves a SUFFIX through the brand prefix,
// so `envInt("MAX_FILES")` there means ULTRADOC_MAX_FILES here. Same signature,
// different input — the kind of pair that is worse than a duplicate, because
// either one compiles at the other's call site and quietly reads nothing.
//
// Renamed rather than adopted: the LIMITS block below spells its variables out
// in full, which is what makes them greppable.
export function envIntRaw(name: string, def: number, min = 1): number {
  const raw = process.env[name];
  if (raw === undefined) return def;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : def;
}

// Read a string env override, trimming; empty/unset falls back to `def`.
export function envStr(name: string, def: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : def;
}

// Compile-time limits, each overridable by an env var, parsed once here so the
// knobs live in one place instead of scattered across modules. Raising a cap
// trades speed/quota for coverage; the engine surfaces a note whenever a cap is
// actually hit so a partial result is never silent.
export const LIMITS = {
  maxFiles: envIntRaw("ULTRADOC_MAX_FILES", 20_000), // files walked/indexed
  maxFileBytes: envIntRaw("ULTRADOC_MAX_FILE_BYTES", 1_048_576), // per-file read cap
  symbolsPerFile: envIntRaw("ULTRADOC_MAX_SYMBOLS_PER_FILE", 400), // symbols kept per file
  // Call sites kept per declared symbol name. Bounds index.json on repos where
  // a helper is invoked everywhere: at 50, matomo's index grew by 2.7 MB; 30
  // keeps the evidence (a handful of sites is all a citation ever needs) and
  // the cap is reported in stats rather than silently applied.
  callSitesPerSymbol: envIntRaw("ULTRADOC_MAX_CALL_SITES", 30),
  releasesFetched: envIntRaw("ULTRADOC_MAX_RELEASES", 20), // GitHub releases fetched
  docPackages: envIntRaw("ULTRADOC_MAX_DOC_PACKAGES", 6), // monorepo packages given doc sections
  docModules: envIntRaw("ULTRADOC_MAX_DOC_MODULES", 5), // subsystems given their own doc section
  verifyPairs: envIntRaw("ULTRADOC_MAX_VERIFY", 40), // claim↔evidence pairs (CLI --max-verify wins)
  embedChunks: envIntRaw("ULTRADOC_MAX_CHUNKS", 800), // semantic chunks embedded per repo
  embedConcurrency: envIntRaw("ULTRADOC_EMBED_CONCURRENCY", 4), // parallel embed requests
} as const;

// How long a cached fetched page (external docs, web results) is trusted before
// a refetch — a docs site updates, and the page is keyed by URL + extractor
// only. Overridable; default one week. Also handed to Firecrawl as its own
// server-side `maxAge`, so the two caches agree on what "fresh" means.
export function extdocsTtlMs(): number {
  return envIntRaw("ULTRADOC_EXTDOCS_TTL_HOURS", 168) * 3600_000;
}

// Everything ultradoc writes into a working tree lives under this directory,
// and everything that scans a tree must exclude it.
export const CACHE_DIR_NAME = ".ultradoc";

// Root of the on-disk clone/index cache. Persistent per-user by default (so a
// reboot or a /tmp clean doesn't force a re-clone), overridable with
// ULTRADOC_CACHE_DIR (set it to a /tmp path to restore the old ephemeral
// behavior). Falls back to the temp dir when no home directory is resolvable.
export function cacheRoot(): string {
  const override = process.env.ULTRADOC_CACHE_DIR?.trim();
  if (override) return override;
  const home = homedir();
  if (!home) return join(tmpdir(), "ultradoc");
  if (process.platform === "darwin") return join(home, "Library", "Caches", "ultradoc");
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA?.trim() || join(home, "AppData", "Local"), "ultradoc");
  return join(process.env.XDG_CACHE_HOME?.trim() || join(home, ".cache"), "ultradoc");
}

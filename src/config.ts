import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// Central place to read environment overrides so parsing lives in one module.
// Everything here is optional — ultradoc is keyless and works with no config.

// Parse a positive-integer env override, falling back to `def` on unset/invalid.
export function envInt(name: string, def: number, min = 1): number {
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

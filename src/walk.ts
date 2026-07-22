import { LIMITS } from "./config.js";
import { walk as engineWalk, readText } from "./vendor/codeindex-engine.mjs";

// File walking + text reading, delegated to the vendored codeindex engine
// (src/vendor/codeindex-engine.mjs). The engine's walker keeps the same ignore
// rules this module used to implement (dependency/build/VCS dirs, lockfiles,
// binary extensions, minified files, the 1 MiB size cap) and adds what it did
// not: .gitignore honoring (root and nested, with negation semantics),
// symlink-escape and symlink-cycle guards, and a deterministic sorted walk
// order. readText gains BOM/UTF-16 handling and a Latin-1 fallback over the
// old first-4-KiB binary sniff.
//
// This module stays as the single boundary: it preserves ultradoc's option and
// result shapes (`truncated` instead of the engine's `capped`) and keeps the
// engine ignorant of ultradoc-specific layout — the engine skips its own
// consumer cache dir (.ultraindex), so ultradoc's .ultradoc cache dir is
// filtered here.

export interface WalkOptions {
  maxFileBytes?: number; // skip files larger than this (default 1 MiB)
  maxFiles?: number; // hard cap on indexed files (default 20000)
}

export interface WalkedFile {
  rel: string; // path relative to root, posix-style
  abs: string;
  size: number;
  ext: string;
}

export interface WalkResult {
  files: WalkedFile[];
  truncated: boolean; // the maxFiles cap was hit — the listing is partial
}

// Recursively list source-like files under `root`, applying ignore rules, and
// report whether the file cap truncated the listing. Pure filesystem walk — no
// git dependency, so it works on any directory.
export function walkDetailed(root: string, opts: WalkOptions = {}): WalkResult {
  const res = engineWalk(root, {
    maxFileBytes: opts.maxFileBytes ?? LIMITS.maxFileBytes,
    maxFiles: opts.maxFiles ?? LIMITS.maxFiles,
  });
  return {
    files: res.files.filter((f) => f.rel !== ".ultradoc" && !f.rel.startsWith(".ultradoc/")),
    truncated: res.capped,
  };
}

// The common case: just the file listing (truncation reported by walkDetailed).
export function walk(root: string, opts: WalkOptions = {}): WalkedFile[] {
  return walkDetailed(root, opts).files;
}

// Read a file as UTF-8, returning "" on any error (unreadable, vanished) or for
// binary content. Re-exported from the engine.
export { readText };

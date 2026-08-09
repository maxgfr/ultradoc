// The vendored webindex engine, configured for this skill.
//
// Everything in src/ reaches the engine through THIS module, never through
// src/vendor/webindex-engine.mjs directly. You cannot obtain an engine function
// without first importing the module that configures it, so there is no
// ordering hazard to remember and no entry point that can forget.
//
// The engine reads `${envPrefix}_*` at call time, so ULTRADOC_FIRECRAWL,
// ULTRADOC_PDF_ENGINE, ULTRADOC_NO_NPX and the rest keep working exactly as they
// did when this code lived here. `contactUrl` goes into the polite User-Agent
// rate-limited APIs see — it must identify ultradoc, not the shared engine
// underneath.
//
// (codeindex is vendored too, but it has no configuration and is imported
// directly where needed.)
import { cacheRoot, extdocsTtlMs } from "./config.js";
import { VERSION } from "./types.js";
import { configure } from "./vendor/webindex-engine.mjs";

configure({
  name: "ultradoc",
  envPrefix: "ULTRADOC",
  cli: "ultradoc",
  contactUrl: "https://github.com/maxgfr/ultradoc",
  // The real release, not the engine's generic "1.x". A maintainer reading their
  // logs to decide whether to throttle a client has to be able to tell one
  // ultradoc release from another.
  version: VERSION,

  // Identify honestly. This skill reads other projects' documentation sites and
  // their forge APIs at some volume; a UA naming the tool and where to complain
  // is what earns polite throttling instead of a block. The engine retries once
  // as a browser when a host refuses the honest one, which is the concession
  // this repo's own fetch layer never had.
  defaultUa: "contact",

  // Where clones already live: a persistent per-user cache dir, not /tmp, so a
  // reboot does not force a re-clone. Declared rather than accepting the
  // engine's default because adopting `ensureClone` would otherwise orphan every
  // checkout on every machine that has run `ultradoc` before, and this is
  // exactly what kept that function forked.
  repoDir: cacheRoot(),

  // A week for a fetched external docs page, matching what this skill has always
  // used and what it hands Firecrawl as its own server-side `maxAge` — the two
  // caches agree on what "fresh" means.
  cacheTtlMs: extdocsTtlMs(),
  // Two words on top of the engine's shared list, and the reason this skill can
  // use the shared keyword machinery at all. ultradoc reads source repositories,
  // where "test" and "request" appear in nearly every file — keeping them as
  // keywords would score every document alike. The rest of the matcher is
  // byte-for-byte the engine's.
  extraStopwords: ["request", "test"],
});

export * from "./vendor/webindex-engine.mjs";

// Shell commands here include clones and full-history fetches of large
// repositories, not `rev-parse`. Declared through the environment because the
// engine reads its tunables at call time, and this is the value src/util.ts's
// own `sh` used before the engine owned it.
process.env.ULTRADOC_SH_TIMEOUT_MS ??= "120000";

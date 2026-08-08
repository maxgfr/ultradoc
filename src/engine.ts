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
import { configure } from "./vendor/webindex-engine.mjs";

configure({
  name: "ultradoc",
  envPrefix: "ULTRADOC",
  cli: "ultradoc",
  contactUrl: "https://github.com/maxgfr/ultradoc",
  // Two words on top of the engine's shared list, and the reason this skill can
  // use the shared keyword machinery at all. ultradoc reads source repositories,
  // where "test" and "request" appear in nearly every file — keeping them as
  // keywords would score every document alike. The rest of the matcher is
  // byte-for-byte the engine's.
  extraStopwords: ["request", "test"],
});

export * from "./vendor/webindex-engine.mjs";

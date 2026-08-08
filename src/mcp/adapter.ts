import { VERSION } from "../types.js";
import type { McpAdapter } from "../engine.js";
import { callTool } from "./handlers.js";
import { getPrompt, PROMPTS } from "./prompts.js";
import { toolsFor } from "./tools.js";

// The skill half of the MCP server.
//
// The engine owns everything protocol-shaped — version negotiation, the
// notification/request split, cancellation, schema validation, response
// capping, the JSON-RPC-error vs isError-result line, and both transports. It
// cannot know WHICH tools exist, so this file hands it the four things that are
// genuinely ultradoc's: the version it reports, the tool declarations, the
// dispatcher, and the prompts.

/**
 * How to ask for less, per tool, when a response is withheld for size.
 *
 * The engine detects the overflow; only the skill knows which argument shrinks
 * the result. A cap that says only "too big" makes the model retry the same
 * call — one that names the narrowing argument gets a smaller second call.
 */
const CAP_ADVICE: Record<string, string> = {
  ultradoc_search: "lower `per_source`, or narrow `sources` to the one you actually need",
  ultradoc_ask: "lower `per_source`, or narrow `sources`",
  ultradoc_symbol: "lower `max`, or scope with `package`",
  ultradoc_read: "pass `start_line`/`end_line` to read a window instead of the whole file",
  ultradoc_fetch: "pass fewer `urls`, or lower `per_source`",
  ultradoc_overview: "read the file at the returned `path` instead of inlining it",
  ultradoc_doc: "scope with `package`, or narrow `sources`",
  ultradoc_verify: "lower `max_verify`",
};

export interface AdapterOptions {
  defaultRepo?: string;
  allowWrite?: boolean;
}

export function ultradocAdapter(opts: AdapterOptions = {}): McpAdapter {
  return {
    version: VERSION,
    listTools: (protocol) => toolsFor(protocol, opts),
    callTool: (name, args) => callTool(name, args, opts),
    capAdvice: CAP_ADVICE,
    prompts: PROMPTS,
    getPrompt,
  };
}

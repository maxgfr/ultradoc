import { describe, it, expect, vi, afterEach } from "vitest";
// `parseCli` is what `parseArgs` used to be: the tables and the exit policy
// are still this repo's; only the validating loop moved into the engine.
import { parseCli as parseArgs } from "../src/cli.js";

// parseArgs calls process.exit on help/version/errors; trap it so tests can
// assert without killing the runner.
function trapExit(fn: () => void): { exited: boolean; code: number | undefined } {
  const state = { exited: false, code: undefined as number | undefined };
  const exit = vi.spyOn(process, "exit").mockImplementation(((c?: number) => {
    state.exited = true;
    state.code = c;
    throw new Error("__exit__");
  }) as never);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    fn();
  } catch (e) {
    if ((e as Error).message !== "__exit__") throw e;
  } finally {
    exit.mockRestore();
  }
  return state;
}

afterEach(() => vi.restoreAllMocks());

describe("parseArgs", () => {
  it("parses a valid ask command with flags", () => {
    const p = parseArgs(["ask", "--repo", "owner/repo", "--q", "why?", "--sources", "code,issues"]);
    expect(p.command).toBe("ask");
    expect(p.values.repo).toBe("owner/repo");
    expect(p.values.q).toBe("why?");
    expect(p.values.sources).toBe("code,issues");
  });

  it("supports --key=value and boolean flags", () => {
    const p = parseArgs(["ask", "--repo=x", "--q=y", "--semantic", "--json"]);
    expect(p.values.repo).toBe("x");
    expect(p.bools.has("semantic")).toBe(true);
    expect(p.bools.has("json")).toBe(true);
  });

  // Boolean flags are presence-only: `--semantic` / `--json` set the flag, but
  // a `--flag=value` form is rejected rather than silently swallowing the value.
  it("rejects a value attached to a boolean flag", () => {
    expect(trapExit(() => parseArgs(["ask", "--repo", "x", "--q", "y", "--json=true"])).code).toBe(1);
    expect(trapExit(() => parseArgs(["ask", "--repo", "x", "--q", "y", "--semantic=false"])).code).toBe(1);
  });

  it("treats a bare boolean flag as present without consuming the next token", () => {
    const p = parseArgs(["ask", "--repo", "x", "--q", "y", "--semantic", "--sources", "code"]);
    expect(p.bools.has("semantic")).toBe(true);
    expect(p.values.sources).toBe("code");
  });

  it("collects the positional action for semantic", () => {
    const p = parseArgs(["semantic", "up"]);
    expect(p.command).toBe("semantic");
    expect(p.positional).toEqual(["up"]);
  });

  it("collects the positional action for firecrawl", () => {
    const p = parseArgs(["firecrawl", "up"]);
    expect(p.command).toBe("firecrawl");
    expect(p.positional).toEqual(["up"]);
  });

  // Unknown flags hard-fail, so --firecrawl has to be registered as a value
  // flag or `ask --firecrawl off` would exit 1.
  it("parses --firecrawl as a value flag", () => {
    expect(parseArgs(["ask", "--repo", "x", "--q", "y", "--firecrawl", "off"]).values.firecrawl).toBe("off");
    expect(parseArgs(["ask", "--repo=x", "--q=y", "--firecrawl=http://fc:3002"]).values.firecrawl).toBe("http://fc:3002");
  });

  it("exits on an unknown command", () => {
    expect(trapExit(() => parseArgs(["frobnicate"])).code).toBe(1);
  });

  it("exits on an unknown flag", () => {
    expect(trapExit(() => parseArgs(["ask", "--bogus", "v"])).code).toBe(1);
  });

  it("exits 0 on --version", () => {
    expect(trapExit(() => parseArgs(["--version"])).code).toBe(0);
  });

  it("accepts the overview command with --package", () => {
    const p = parseArgs(["overview", "--repo", "owner/repo", "--package", "web"]);
    expect(p.command).toBe("overview");
    expect(p.values.package).toBe("web");
  });

  it("accepts --package on ask", () => {
    const p = parseArgs(["ask", "--repo", "owner/repo", "--q", "why?", "--package", "packages/api"]);
    expect(p.values.package).toBe("packages/api");
  });

  it("accepts the mcp command with no flags at all", () => {
    const p = parseArgs(["mcp"]);
    expect(p.command).toBe("mcp");
    expect(p.values.transport).toBeUndefined();
  });

  it("parses the mcp http flags", () => {
    const p = parseArgs(["mcp", "--transport", "http", "--port", "7337", "--bind", "127.0.0.1", "--allow-origin", "https://a.test,https://b.test"]);
    expect(p.values.transport).toBe("http");
    expect(p.values.port).toBe("7337");
    expect(p.values.bind).toBe("127.0.0.1");
    expect(p.values["allow-origin"]).toBe("https://a.test,https://b.test");
  });

  it("parses the mcp boolean flags and a default repo", () => {
    const p = parseArgs(["mcp", "--repo", "owner/repo", "--allow-write", "--allow-remote", "--max-response-bytes", "2000"]);
    expect(p.values.repo).toBe("owner/repo");
    expect(p.bools.has("allow-write")).toBe(true);
    expect(p.bools.has("allow-remote")).toBe(true);
    expect(p.values["max-response-bytes"]).toBe("2000");
  });

  it("still rejects an unknown flag on mcp", () => {
    expect(trapExit(() => parseArgs(["mcp", "--nope"])).code).toBe(1);
  });
});

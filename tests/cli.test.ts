import { describe, it, expect, vi, afterEach } from "vitest";
import { parseArgs } from "../src/cli.js";

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

  it("collects the positional action for semantic", () => {
    const p = parseArgs(["semantic", "up"]);
    expect(p.command).toBe("semantic");
    expect(p.positional).toEqual(["up"]);
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
});

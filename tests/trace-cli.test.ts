import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";
import { checkRun, snippetMatches } from "../src/check.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ultradoc-trace-"));
  const files = {
    "src/retry.ts": "export function retryDelay(attempt: number) {\n  return 2 ** attempt;\n}\n",
    "src/client.ts": "import { retryDelay } from './retry.js';\nexport function sendMessage() {\n  return retryDelay(2);\n}\n",
    "src/handler.ts": "import { sendMessage } from './client.js';\nexport function handleRequest() {\n  return sendMessage();\n}\n",
    "tests/retry.test.ts":
      "import { retryDelay } from '../src/retry.js';\nexport function testDelay() {\n  if (retryDelay(2) !== 4) throw new Error('wrong delay');\n}\n",
    "docs/notes.md": "retryDelay is mentioned here, but this is not an implementation or a caller.\n",
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), text);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

async function invoke(flags: string[]) {
  let stdout = "";
  let stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  vi.spyOn(process, "exit").mockImplementation(((code: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
  let error: unknown;
  try {
    await run(["trace", "--repo", root, "--json", ...flags]);
  } catch (caught) {
    error = caught;
  }
  return { stdout, stderr, error };
}

describe("bounded trace CLI", () => {
  it("retrieves implementation, caller, test and a second caller hop with valid citations", async () => {
    const result = await invoke(["--name", "retryDelay"]);
    expect(result.error).toBeUndefined();
    const data = JSON.parse(result.stdout);
    expect(data.evidence.some((e: any) => e.meta.traceRole === "definition" && e.ref === "src/retry.ts")).toBe(true);
    expect(data.evidence.some((e: any) => e.meta.traceRole === "caller" && e.ref === "src/client.ts")).toBe(true);
    expect(data.evidence.some((e: any) => e.meta.traceRole === "test" && e.ref === "tests/retry.test.ts")).toBe(true);
    expect(data.evidence.some((e: any) => e.ref === "src/handler.ts")).toBe(true);
    expect(data.evidence.some((e: any) => e.ref === "docs/notes.md")).toBe(false);
    for (const item of data.evidence) {
      const [, file, start, end] = item.location.match(/^(.+):(\d+)-(\d+)$/);
      expect(snippetMatches(item.snippet, readFileSync(join(root, file), "utf8").split(/\r?\n/), Number(start), Number(end)).ok).toBe(true);
    }
  });

  it("resolves a prose question and writes a dossier even with --json", async () => {
    const out = join(root, ".ultradoc", "trace-run");
    const result = await invoke(["--q", "How is exponential retry delay calculated?", "--out", out]);
    expect(result.error).toBeUndefined();
    expect(JSON.parse(result.stdout).seeds).toContain("retryDelay");
    expect(JSON.parse(readFileSync(join(out, "evidence.json"), "utf8")).length).toBeGreaterThan(0);
    writeFileSync(join(out, "ANSWER.md"), "retryDelay calculates the delay using exponentiation. [E1]\n");
    expect(checkRun(out, { strict: true }).ok).toBe(true);
    writeFileSync(join(out, "ANSWER.md"), "retryDelay calculates the delay using exponentiation. [E999]\n");
    expect(checkRun(out, { strict: true }).ok).toBe(false);
  });

  it("reserves evidence for tests and reports reached budgets", async () => {
    const result = await invoke(["--name", "retryDelay", "--max-evidence", "3", "--max-depth", "1"]);
    expect(result.error).toBeUndefined();
    const data = JSON.parse(result.stdout);
    expect(data.evidence).toHaveLength(3);
    expect(data.evidence.map((e: any) => e.meta.traceRole)).toEqual(["definition", "caller", "test"]);
    expect(data.notes.join(" ")).toMatch(/budget|depth/i);
  });

  it("returns an explicit unresolved result for an unknown symbol", async () => {
    const result = await invoke(["--name", "notARealSymbol"]);
    expect(result.error).toBeUndefined();
    const data = JSON.parse(result.stdout);
    expect(data.evidence).toEqual([]);
    expect(data.notes.join(" ")).toMatch(/No declaration/);
  });

  it("enforces the character budget without fabricating snippets", async () => {
    const result = await invoke(["--name", "retryDelay", "--max-chars", "64"]);
    expect(result.error).toBeUndefined();
    const data = JSON.parse(result.stdout);
    expect(data.evidence.reduce((n: number, e: any) => n + e.snippet.length, 0)).toBeLessThanOrEqual(64);
    expect(data.notes.join(" ")).toMatch(/budget/i);
  });

  it("terminates a cyclic caller graph without revisiting symbols", async () => {
    writeFileSync(
      join(root, "src/retry.ts"),
      "import { sendMessage } from './client.js';\nexport function retryDelay(attempt: number) {\n  return attempt ? sendMessage() : 0;\n}\n",
    );
    const result = await invoke(["--name", "retryDelay", "--max-depth", "4"]);
    expect(result.error).toBeUndefined();
    const data = JSON.parse(result.stdout);
    expect(data.visited).toContain("sendMessage");
    expect(new Set(data.visited).size).toBe(data.visited.length);
    expect(data.visited.length).toBeLessThanOrEqual(data.budget.maxSymbols);
  });

  it("does not expand ambiguous declarations into a guessed graph", async () => {
    writeFileSync(join(root, "src/other.ts"), "export function retryDelay() { return 9; }\n");
    const result = await invoke(["--name", "retryDelay"]);
    expect(result.error).toBeUndefined();
    const data = JSON.parse(result.stdout);
    expect(data.visited).toEqual(["retryDelay"]);
    expect(data.notes.join(" ")).toContain("Multiple definitions");
  });

  it.each(["-1", "1.5", "Infinity"])("rejects invalid budgets: %s", async (value) => {
    const result = await invoke(["--name", "retryDelay", "--max-depth", value]);
    expect(result.error).toBeDefined();
  });
});

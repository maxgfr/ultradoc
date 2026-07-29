import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The stdio transport driven against the REAL committed bundle, as a separate
// process — the exact file `claude mcp add -- node scripts/ultradoc.mjs mcp`
// runs. In-process tests against src/ cannot see a bundling or wiring
// regression, and they cannot see the one property that matters most here:
// that stdout carries JSON-RPC frames and nothing else.

const BUNDLE = resolve("scripts/ultradoc.mjs");
const LIB = resolve("tests/fixtures/sample-lib");

afterAll(() => {
  rmSync(join(LIB, ".ultradoc"), { recursive: true, force: true });
});

interface Session {
  lines: string[];
  stderr: string;
  code: number | null;
}

interface SessionOptions {
  args?: string[];
  timeoutMs?: number;
}

// Feed the server a set of newline-delimited frames, close stdin, and collect
// everything it wrote.
function session(frames: unknown[], opts: SessionOptions = {}): Promise<Session> {
  const { args = [], timeoutMs = 60_000 } = opts;
  return new Promise((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [BUNDLE, "mcp", ...args], { env: { ...process.env } });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`server did not exit within ${timeoutMs}ms; stdout so far: ${out}`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => {
      out += c;
    });
    child.stderr.on("data", (c: string) => {
      err += c;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ lines: out.split("\n").filter((l) => l.trim() !== ""), stderr: err, code });
    });

    for (const f of frames) child.stdin.write(JSON.stringify(f) + "\n");
    child.stdin.end();
  });
}

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } };
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };

describe("the bundled MCP server over stdio", () => {
  it("completes a handshake, and writes NOTHING to stdout but JSON-RPC frames", async () => {
    const s = await session([INIT, INITIALIZED, { jsonrpc: "2.0", id: 2, method: "tools/list" }]);

    // Three frames in, two out: a notification is answered with silence. If a
    // stray console.log ever lands on an import path, this count breaks first.
    expect(s.lines).toHaveLength(2);
    const msgs = s.lines.map((l) => JSON.parse(l));

    expect(msgs[0].id).toBe(1);
    expect(msgs[0].result.serverInfo.name).toBe("ultradoc");
    expect(msgs[0].result.serverInfo.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(msgs[0].result.protocolVersion).toBe("2025-06-18");

    expect(msgs[1].id).toBe(2);
    const names = msgs[1].result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("ultradoc_search");
    expect(names).toContain("ultradoc_read");
    // The destructive tool stays hidden without --allow-write.
    expect(names).not.toContain("ultradoc_cache_clean");

    expect(s.code).toBe(0);
  });

  it("runs a real tool call against a fixture repo", async () => {
    const s = await session([
      INIT,
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ultradoc_read", arguments: { repo: LIB, path: "src/retry.ts", end_line: 5 } } },
    ]);
    const call = s.lines.map((l) => JSON.parse(l)).find((m) => m.id === 2);
    const payload = JSON.parse(call.result.content[0].text);
    expect(payload.path).toBe("src/retry.ts");
    expect(payload.content).toContain("RetryOptions");
    expect(payload.end_line).toBe(5);
  });

  it("survives an unknown method and keeps serving", async () => {
    const s = await session([INIT, { jsonrpc: "2.0", id: 2, method: "resources/list" }, { jsonrpc: "2.0", id: 3, method: "ping" }]);
    const msgs = s.lines.map((l) => JSON.parse(l));
    expect(msgs.find((m) => m.id === 2).error.code).toBe(-32601);
    // Still answering afterwards: a bad frame must not end the session.
    expect(msgs.find((m) => m.id === 3).result).toEqual({});
    expect(s.code).toBe(0);
  });

  it("reports malformed JSON as a parse error without dying", async () => {
    const s = await new Promise<Session>((res, rej) => {
      const child = spawn(process.execPath, [BUNDLE, "mcp"], { env: { ...process.env } });
      let out = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (c: string) => {
        out += c;
      });
      child.on("error", rej);
      child.on("close", (code) => res({ lines: out.split("\n").filter((l) => l.trim()), stderr: "", code }));
      child.stdin.write("{ not json\n");
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }) + "\n");
      child.stdin.end();
    });
    const msgs = s.lines.map((l) => JSON.parse(l));
    expect(msgs[0].error.code).toBe(-32700);
    expect(msgs[1].result).toEqual({});
    expect(s.code).toBe(0);
  });

  it("does not answer a request the client cancelled", async () => {
    const s = await session([INIT, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 2 } }, { jsonrpc: "2.0", id: 2, method: "ping" }]);
    const msgs = s.lines.map((l) => JSON.parse(l));
    expect(msgs.map((m) => m.id)).toEqual([1]);
  });

  it("answers a batch with a single array frame", async () => {
    const s = await session([INIT, [{ jsonrpc: "2.0", id: 2, method: "ping" }, INITIALIZED, { jsonrpc: "2.0", id: 3, method: "ping" }]]);
    const batch = JSON.parse(s.lines[1]!);
    expect(Array.isArray(batch)).toBe(true);
    expect(batch.map((m: { id: number }) => m.id)).toEqual([2, 3]);
  });

  it("emits no frame at all for a batch of only notifications", async () => {
    const s = await session([INIT, [INITIALIZED, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 99 } }]]);
    expect(s.lines).toHaveLength(1);
  });

  it("lets a fast request overtake a slow one", async () => {
    // The read loop dispatches without awaiting, so a 30s `ask` cannot starve
    // `ping`. JSON-RPC permits out-of-order responses; a client that has to
    // wait behind an indexing run for a liveness check will time the server
    // out. This is the test for the property, not just the comment.
    const s = await session([
      INIT,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "ultradoc_ask", arguments: { repo: LIB, question: "how does the retry backoff work", sources: ["code", "docs"] } },
      },
      { jsonrpc: "2.0", id: 3, method: "ping" },
    ]);
    const ids = s.lines.map((l) => JSON.parse(l).id);
    expect(ids).toContain(2);
    expect(ids.indexOf(3)).toBeLessThan(ids.indexOf(2));
  });
});

describe("server flags, through the bundle", () => {
  it("hides the destructive tool by default and exposes it with --allow-write", async () => {
    const names = async (args: string[]) => {
      const s = await session([INIT, { jsonrpc: "2.0", id: 2, method: "tools/list" }], { args });
      return JSON.parse(s.lines[1]!).result.tools.map((t: { name: string }) => t.name);
    };
    expect(await names([])).not.toContain("ultradoc_cache_clean");
    expect(await names(["--allow-write"])).toContain("ultradoc_cache_clean");
  });

  it("makes `repo` optional on every tool when a default repo is configured", async () => {
    const s = await session([INIT, { jsonrpc: "2.0", id: 2, method: "tools/list" }], { args: ["--repo", LIB] });
    const search = JSON.parse(s.lines[1]!).result.tools.find((t: { name: string }) => t.name === "ultradoc_search");
    expect(search.inputSchema.required).toEqual(["question"]);
    expect(search.inputSchema.properties.repo.description).toContain(LIB);
  });

  it("withholds an over-cap result and points at the file that holds it", async () => {
    const s = await session([INIT, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ultradoc_overview", arguments: { repo: LIB } } }], {
      args: ["--max-response-bytes", "300"],
    });
    const payload = JSON.parse(JSON.parse(s.lines[1]!).result.content[0].text);
    expect(payload.truncated).toBe(true);
    expect(payload.bytes).toBeGreaterThan(300);
    // Withholding is only acceptable because it says where the real thing is.
    expect(payload.artifact).toMatch(/OVERVIEW\.md$/);
    expect(payload.narrower).toBeTruthy();
  });

  it("refuses an invalid --transport instead of starting anything", async () => {
    const s = await session([INIT], { args: ["--transport", "bogus"] });
    expect(s.code).toBe(1);
    expect(s.stderr).toMatch(/invalid --transport "bogus"/);
    expect(s.lines).toHaveLength(0);
  });
});

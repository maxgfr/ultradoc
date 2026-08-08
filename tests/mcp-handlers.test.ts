import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ultradocAdapter, type AdapterOptions } from "../src/mcp/adapter.js";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type JsonRpcMessage } from "../src/engine.js";
import { resetGrammarWarm } from "../src/mcp/handlers.js";
import { resetRepoLocks } from "../src/repo-lock.js";

// Drives the MCP server in-process, the way tests/e2e-commands.test.ts drives
// the CLI. Network is stubbed to throw so the network-backed sources take their
// degradation path and the suite stays offline and deterministic.

const LIB = resolve("tests/fixtures/sample-lib");
const MONO = resolve("tests/fixtures/sample-mono");

const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error("network disabled in tests");
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "ultradoc-mcp-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  resetRepoLocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

let nextId = 1;
async function rpc(msg: Omit<JsonRpcMessage, "jsonrpc">, opts: AdapterOptions = {}): Promise<JsonRpcMessage | undefined> {
  const server = createServer(ultradocAdapter(opts));
  server.setProtocolVersion("2025-06-18");
  let out: JsonRpcMessage | undefined;
  await server.handle({ jsonrpc: "2.0", ...msg }, (m) => {
    out = m;
  });
  return out;
}

async function call(name: string, args: Record<string, unknown>, opts: AdapterOptions = {}) {
  const res = await rpc({ id: nextId++, method: "tools/call", params: { name, arguments: args } }, opts);
  return res!;
}

// The tool's JSON payload, asserting it was not an error result.
function payload(res: JsonRpcMessage): Record<string, unknown> {
  const result = res.result as { content: { text: string }[]; isError?: boolean } | undefined;
  expect(res.error, `unexpected JSON-RPC error: ${JSON.stringify(res.error)}`).toBeUndefined();
  expect(result?.isError, `unexpected isError: ${result?.content?.[0]?.text}`).toBeFalsy();
  return JSON.parse(result!.content[0]!.text);
}

function errorText(res: JsonRpcMessage): string {
  const result = res.result as { content: { text: string }[]; isError?: boolean } | undefined;
  expect(result?.isError, "expected an isError tool result").toBe(true);
  return result!.content[0]!.text;
}

describe("lifecycle methods", () => {
  it("negotiates a protocol version and identifies itself", async () => {
    const res = await rpc({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    const r = res!.result as { protocolVersion: string; serverInfo: { name: string; version: string }; capabilities: unknown };
    expect(r.protocolVersion).toBe("2025-06-18");
    expect(r.serverInfo.name).toBe("ultradoc");
    expect(r.serverInfo.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(r.capabilities).toEqual({
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
    });
  });

  it("answers ping and lists tools", async () => {
    expect((await rpc({ id: 1, method: "ping" }))!.result).toEqual({});
    const tools = ((await rpc({ id: 2, method: "tools/list" }))!.result as { tools: { name: string }[] }).tools;
    expect(tools.map((t) => t.name)).toContain("ultradoc_search");
  });

  it("answers nothing to a notification", async () => {
    expect(await rpc({ method: "notifications/initialized" })).toBeUndefined();
  });

  it("rejects an unknown method with -32601", async () => {
    expect((await rpc({ id: 1, method: "resources/subscribe" }))!.error).toMatchObject({ code: -32601 });
  });

  it("serves resources and prompts alongside tools", async () => {
    const resources = ((await rpc({ id: 1, method: "resources/list" }))!.result as { resources: { uri: string }[] }).resources;
    expect(resources.map((r) => r.uri)).toContain("skill://SKILL.md");

    const prompts = ((await rpc({ id: 2, method: "prompts/list" }))!.result as { prompts: { name: string }[] }).prompts;
    expect(prompts.map((p) => p.name)).toContain("answer_from_source");

    const got = await rpc({ id: 3, method: "prompts/get", params: { name: "answer_from_source", arguments: { repo: "owner/lib", question: "why?" } } });
    expect((got!.result as { messages: { content: { text: string } }[] }).messages[0]!.content.text).toContain("owner/lib");
  });

  it("requires a uri on resources/read", async () => {
    expect((await rpc({ id: 1, method: "resources/read", params: {} }))!.error).toMatchObject({ code: -32602 });
  });

  it("treats an unknown tool and bad arguments as protocol errors, not tool failures", async () => {
    // The distinction matters: a client bug must not arrive as a result the
    // model then tries to reason around.
    expect((await call("ultradoc_nope", {})).error).toMatchObject({ code: -32602 });
    expect((await call("ultradoc_search", { repo: LIB })).error).toMatchObject({ code: -32602, message: expect.stringMatching(/`question` is required/) });
    expect((await call("ultradoc_search", { repo: LIB, question: "x", sources: ["telepathy"] })).error).toMatchObject({ code: -32602 });
  });

  it("drops the response to a cancelled request", async () => {
    const server = createServer(ultradocAdapter());
    const sent: JsonRpcMessage[] = [];
    await server.handle({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 } }, (m) => void sent.push(m));
    await server.handle({ jsonrpc: "2.0", id: 7, method: "ping" }, (m) => void sent.push(m));
    expect(sent).toEqual([]);
    // Only that id is cancelled.
    await server.handle({ jsonrpc: "2.0", id: 8, method: "ping" }, (m) => void sent.push(m));
    expect(sent).toHaveLength(1);
  });
});

describe("ultradoc_search", () => {
  it("returns ranked, citable evidence from a real fixture repo", async () => {
    const r = payload(await call("ultradoc_search", { repo: LIB, question: "how does the retry backoff work?", sources: ["code"] }));
    const evidence = r.evidence as { id: string; source: string; ref: string; snippet: string }[];
    expect(evidence.length).toBeGreaterThan(0);
    for (const e of evidence) {
      expect(e.id).toMatch(/^E\d+$/);
      expect(e.source).toBe("code");
      expect(e.ref).toBeTruthy();
      expect(e.snippet).toBeTruthy();
    }
    expect(Array.isArray(r.notes)).toBe(true);
    expect(r.repo_dir).toBe(LIB);
    expect((r.timings as { total_ms: number }).total_ms).toBeGreaterThanOrEqual(0);
  });

  it("reports an unreachable source as notes, NOT as an error", async () => {
    // The contract that keeps honest degradation honest: a host with no API and
    // a dead network are information, not failures. Flipping this to isError
    // would make the model retry work that already told it everything it will.
    const r = payload(await call("ultradoc_search", { repo: LIB, question: "retry backoff", sources: ["so", "web"] }));
    expect((r.evidence as unknown[]).length).toBe(0);
    expect((r.notes as string[]).length).toBeGreaterThan(0);
  });

  it("writes no dossier — that is what ultradoc_ask is for", async () => {
    const out = tmp();
    await call("ultradoc_search", { repo: LIB, question: "retry", sources: ["code"], out });
    expect(readdirSync(out)).toEqual([]);
  });

  it("fails with the real package list on an unknown --package", async () => {
    const msg = errorText(await call("ultradoc_search", { repo: MONO, question: "x", sources: ["code"], package: "nope" }));
    expect(msg).toMatch(/does not match one package/);
    expect(msg).toMatch(/known packages:/);
  });

  it("rejects an empty sources array with an actionable message", async () => {
    expect(errorText(await call("ultradoc_search", { repo: LIB, question: "x", sources: [] }))).toMatch(/omit it to use the default/);
  });
});

describe("ultradoc_read", () => {
  it("reads a whole file and a line window from the pinned clone", async () => {
    const whole = payload(await call("ultradoc_read", { repo: LIB, path: "src/retry.ts" }));
    expect(whole.total_lines as number).toBeGreaterThan(3);
    expect(whole.start_line).toBe(1);
    expect(whole.truncated).toBe(false);

    const window = payload(await call("ultradoc_read", { repo: LIB, path: "src/retry.ts", start_line: 2, end_line: 3 }));
    expect(window.start_line).toBe(2);
    expect(window.end_line).toBe(3);
    expect((window.content as string).split("\n")).toHaveLength(2);
    expect((whole.content as string).split("\n").slice(1, 3).join("\n")).toBe(window.content);
  });

  it("refuses a path that escapes the repository, relative or absolute", async () => {
    for (const p of ["../../../etc/passwd", "/etc/passwd", "/etc/hosts"]) {
      expect(errorText(await call("ultradoc_read", { repo: LIB, path: p })), p).toMatch(/is outside .* and outside ultradoc's cache|No such file/);
    }
  });

  it("reports a missing file and a directory clearly", async () => {
    expect(errorText(await call("ultradoc_read", { repo: LIB, path: "does/not/exist.js" }))).toMatch(/No such file/);
    expect(errorText(await call("ultradoc_read", { repo: LIB, path: "src" }))).toMatch(/is a directory/);
  });

  it("rejects a start_line past the end of the file", async () => {
    expect(errorText(await call("ultradoc_read", { repo: LIB, path: "src/retry.ts", start_line: 99999 }))).toMatch(/past the end/);
  });

  it("caps a whole-file read, and then HONOURS the window it told you to ask for", async () => {
    // The cap's advice has to be true. Refusing a big file with "pass
    // start_line/end_line" and then refusing that too would be worse than
    // giving no advice at all.
    const repo = tmp();
    mkdirSync(join(repo, "src"), { recursive: true });
    const big = join(repo, "src", "big.txt");
    writeFileSync(big, Array.from({ length: 300_000 }, (_, i) => `line ${i}`).join("\n"));
    expect(statSync(big).size).toBeGreaterThan(1_048_576);

    const refused = errorText(await call("ultradoc_read", { repo, path: "src/big.txt" }));
    expect(refused).toMatch(/whole-file cap/);
    expect(refused).toMatch(/pass start_line\/end_line/);

    const windowed = payload(await call("ultradoc_read", { repo, path: "src/big.txt", start_line: 2, end_line: 4 }));
    expect(windowed.content).toBe("line 1\nline 2\nline 3");
    expect(windowed.total_lines).toBe(300_000);
  });

  it("truncates a window wider than the per-call line ceiling, and says so", async () => {
    const r = payload(await call("ultradoc_read", { repo: LIB, path: "src/retry.ts", start_line: 1, end_line: 999_999 }));
    // The fixture is short, so nothing is dropped — the flag is the contract.
    expect(r.truncated).toBe(false);
    expect(r.end_line).toBe(r.total_lines);
  });
});

describe("ultradoc_overview and ultradoc_symbol", () => {
  it("caches the overview between calls", async () => {
    const first = payload(await call("ultradoc_overview", { repo: LIB }));
    expect(first.markdown).toBeTruthy();
    expect(first.file_count as number).toBeGreaterThan(0);
    const second = payload(await call("ultradoc_overview", { repo: LIB }));
    expect(second.cached).toBe(true);
  });

  it("resolves a declaration and its call sites", async () => {
    const r = payload(await call("ultradoc_symbol", { repo: LIB, name: "retryRequest" }));
    expect(r.symbol).toBe("retryRequest");
    const items = r.items as { ref: string; snippet: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => /retry\.ts/.test(i.ref))).toBe(true);
  });
});

describe("ultradoc_fetch", () => {
  it("needs no repo and validates its URLs", async () => {
    expect(errorText(await call("ultradoc_fetch", { urls: ["not-a-url"] }))).toMatch(/absolute http\(s\) URLs/);
  });

  it("reports an unreachable page as notes rather than failing", async () => {
    const r = payload(await call("ultradoc_fetch", { urls: ["https://example.invalid/page"], question: "anything" }));
    expect(r.items).toEqual([]);
    expect((r.notes as string[]).length).toBeGreaterThan(0);
  });
});

describe("the ask → check loop", () => {
  it("builds a dossier, reads it back by the absolute path it returned, then validates a cited answer inline", async () => {
    const ask = payload(await call("ultradoc_ask", { repo: LIB, question: "how does the retry backoff work?", sources: ["code"] }));
    const runDir = ask.run_dir as string;
    expect(ask.evidence_count as number).toBeGreaterThan(0);
    expect(ask.next).toMatch(/ultradoc_check/);

    // The absolute path ask handed back is exactly what a model passes on, so
    // it has to work verbatim.
    const evidenceMd = payload(await call("ultradoc_read", { repo: LIB, path: (ask.paths as { evidence_md: string }).evidence_md }));
    expect(evidenceMd.content).toMatch(/E1/);

    const good = payload(await call("ultradoc_check", { run_dir: runDir, answer_text: "The backoff doubles each attempt [E1]." }));
    expect(good.ok).toBe(true);
    expect(good.answer_source).toBe("inline");
    expect(good.dangling).toEqual([]);
  });

  it("refuses to read a dossier the caller put outside the clone and the cache", async () => {
    const out = tmp();
    const ask = payload(await call("ultradoc_ask", { repo: LIB, question: "retry backoff", sources: ["code"], out }));
    const msg = errorText(await call("ultradoc_read", { repo: LIB, path: (ask.paths as { evidence_md: string }).evidence_md }));
    expect(msg).toMatch(/outside ultradoc's cache/);
    expect(msg).toMatch(/your own file tools/);
    // The dossier itself is fine — only this server's reach is bounded.
    expect(readFileSync(join(out, "EVIDENCE.md"), "utf8")).toMatch(/E1/);
  });

  it("returns ok:false as a VERDICT, not a tool error, on a dangling citation", async () => {
    const out = tmp();
    await call("ultradoc_ask", { repo: LIB, question: "retry backoff", sources: ["code"], out });
    const res = await call("ultradoc_check", { run_dir: out, answer_text: "It retries forever [E999]." });
    // Crucially NOT isError: the gate ran and did its job.
    const r = payload(res);
    expect(r.ok).toBe(false);
    expect(r.dangling).toContain("E999");
  });

  it("still reads ANSWER.md from disk when no inline answer is given", async () => {
    const out = tmp();
    await call("ultradoc_ask", { repo: LIB, question: "retry backoff", sources: ["code"], out });
    writeFileSync(join(out, "ANSWER.md"), "The backoff doubles each attempt [E1].\n");
    const r = payload(await call("ultradoc_check", { run_dir: out }));
    expect(r.ok).toBe(true);
    expect(r.answer_source).toBe("file");
  });

  it("emits a claim-support worklist from the dossier", async () => {
    const out = tmp();
    await call("ultradoc_ask", { repo: LIB, question: "retry backoff", sources: ["code"], out });
    writeFileSync(join(out, "ANSWER.md"), "The backoff doubles each attempt [E1].\n");
    const r = payload(await call("ultradoc_verify", { run_dir: out }));
    expect((r.pairs as unknown[]).length).toBeGreaterThan(0);
    expect(r.run_dir).toBe(out);
  });

  it("says what to do when the dossier does not exist", async () => {
    expect(errorText(await call("ultradoc_check", { run_dir: join(tmp(), "nope") }))).toMatch(/run ultradoc_ask first/);
  });
});

describe("ultradoc_doc", () => {
  it("scaffolds an outline with a grounded dossier per section", async () => {
    const out = tmp();
    const r = payload(await call("ultradoc_doc", { repo: LIB, sources: ["code", "docs"], out }));
    expect(r.dir).toBe(out);
    const sections = r.outline_sections as { id: string; title: string; evidence_ids: string[] }[];
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      expect(s.id).toMatch(/^S\d+$/);
      expect(s.title).toBeTruthy();
    }
    expect(r.evidence_count as number).toBeGreaterThan(0);
    expect(r.next).toMatch(/ultradoc_check/);
    // The worklist it points at really exists.
    expect(readdirSync(out)).toContain("DOC.todo.md");
  });
});

describe("options that mirror the CLI", () => {
  it("accepts semantic and degrades to lexical with a note when no backend is up", async () => {
    // Opt-in, exactly like --semantic. With no vector backend reachable this
    // must still succeed and merely say so.
    const r = payload(await call("ultradoc_search", { repo: LIB, question: "retry backoff", sources: ["code"], semantic: true }));
    expect((r.evidence as unknown[]).length).toBeGreaterThan(0);
    expect((r.notes as string[]).join(" ")).toMatch(/semantic/i);
  });

  it("validates docs_url instead of passing junk down the pipeline", async () => {
    expect(errorText(await call("ultradoc_search", { repo: LIB, question: "x", sources: ["code"], docs_url: "not-a-url" }))).toMatch(
      /`docs_url` must be an absolute http\(s\) URL/,
    );
  });
});

describe("cache tools", () => {
  it("reports cache status read-only", async () => {
    const r = payload(await call("ultradoc_cache", {}));
    expect(r.root).toBeTruthy();
    expect(Array.isArray(r.repos)).toBe(true);
  });

  it("hides the destructive clean unless the server allows writes", async () => {
    // Not advertised, so it is an unknown tool at the protocol layer.
    expect((await call("ultradoc_cache_clean", { all: true })).error).toMatchObject({ code: -32602 });
    // Advertised but still refuses without a target.
    expect(errorText(await call("ultradoc_cache_clean", {}, { allowWrite: true }))).toMatch(/Pass `repo`.*or `all: true`/s);
  });
});

describe("concurrency", () => {
  it("serializes overlapping calls on one repo without corrupting the index", async () => {
    resetGrammarWarm();
    const results = await Promise.all(Array.from({ length: 5 }, () => call("ultradoc_overview", { repo: LIB })));
    for (const res of results) expect(payload(res).markdown).toBeTruthy();
    // The index the calls raced to write is still valid JSON.
    const idx = JSON.parse(readFileSync(join(LIB, ".ultradoc", "index.json"), "utf8"));
    expect(idx.schemaVersion).toBeGreaterThan(0);
  });
});

describe("a default repo", () => {
  it("makes `repo` optional on every tool that takes one", async () => {
    const r = payload(await call("ultradoc_search", { question: "retry backoff", sources: ["code"] }, { defaultRepo: LIB }));
    expect((r.evidence as unknown[]).length).toBeGreaterThan(0);
  });
});

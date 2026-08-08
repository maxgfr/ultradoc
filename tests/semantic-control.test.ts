import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { firecrawlControl, semanticControl } from "../src/index/semantic/index.js";

// The compose file and the orchestration live in the engine, which tests them
// against its own fake docker. What is ultradoc's — and what these cover — is
// the MAPPING: which profiles each of its two commands brings up, and that
// neither has quietly started meaning something else.
//
// `semantic` is the one worth pinning. It has always meant "the cheap local
// stack": the vector database, the embedding server AND SearXNG. The engine
// keeps those as separate services, so this repo asks for both — in one compose
// call, because a second against the same project recreates the first's work.

function fakeRunner(fail?: (args: string[]) => boolean) {
  const calls: { cmd: string; args: string[]; timeoutMs?: number }[] = [];
  const run = (cmd: string, args: string[], opts: { timeoutMs: number }) => {
    calls.push({ cmd, args, timeoutMs: opts.timeoutMs });
    const ok = !(fail?.(args) ?? false);
    return { ok, stdout: "", stderr: ok ? "" : "boom: network timeout pulling image" };
  };
  return { calls, run };
}

const isImagePull = (args: string[]): boolean => args.includes("pull") && !args.includes("exec");
const isUp = (args: string[]): boolean => args.includes("up") && args.includes("-d");

describe("semanticControl up — image pull step wiring", () => {
  it("pulls the stack images in a separate step BEFORE `up -d`, on a generous default timeout", () => {
    const { calls, run } = fakeRunner();
    const res = semanticControl("up", { run, has: () => true });
    expect(res.code).toBe(0);

    const pullIdx = calls.findIndex((c) => isImagePull(c.args));
    const upIdx = calls.findIndex((c) => isUp(c.args));
    expect(pullIdx).toBeGreaterThanOrEqual(0);
    expect(upIdx).toBeGreaterThanOrEqual(0);
    // The pull must precede `up -d` so `up` finds images cached and stays fast.
    expect(pullIdx).toBeLessThan(upIdx);

    const pull = calls[pullIdx]!;
    expect(pull.cmd).toBe("docker");
    // `--profile semantic --profile search` selects exactly what `--profile all`
    // did: qdrant and ollama carry ["semantic","all"], searxng ["search","all"].
    // Same three containers, asked for by name instead of by an alias.
    expect(pull.args).toEqual(["compose", "-f", expect.any(String), "--profile", "semantic", "--profile", "search", "pull"]);
    // Generous default budget (20 min) — far larger than up's short timeout.
    expect(pull.timeoutMs).toBe(1_200_000);
    const up = calls[upIdx]!;
    expect(up.timeoutMs).toBeLessThan(pull.timeoutMs!);
  });

  it("honors ULTRADOC_DOCKER_PULL_TIMEOUT_MS for the image pull step (read at call time)", () => {
    const prev = process.env.ULTRADOC_DOCKER_PULL_TIMEOUT_MS;
    process.env.ULTRADOC_DOCKER_PULL_TIMEOUT_MS = "1800000";
    try {
      const { calls, run } = fakeRunner();
      semanticControl("up", { run, has: () => true });
      const pull = calls.find((c) => isImagePull(c.args))!;
      expect(pull.timeoutMs).toBe(1_800_000);
    } finally {
      if (prev === undefined) delete process.env.ULTRADOC_DOCKER_PULL_TIMEOUT_MS;
      else process.env.ULTRADOC_DOCKER_PULL_TIMEOUT_MS = prev;
    }
  });

  it("exits non-zero with a clear message when the pull fails — and never proceeds to `up -d`", () => {
    const { calls, run } = fakeRunner((args) => isImagePull(args));
    const res = semanticControl("up", { run, has: () => true });
    expect(res.code).toBe(1);
    expect(res.message).toMatch(/pull/i);
    // A failed pull must short-circuit: no `up -d` is attempted afterwards.
    expect(calls.some((c) => isUp(c.args))).toBe(false);
  });

  it("waits for the healthchecks, so a green `up` means the endpoints answer", () => {
    const { calls, run } = fakeRunner();
    semanticControl("up", { run, has: () => true });
    expect(calls.find((c) => isUp(c.args))!.args).toContain("--wait");
  });
});

// The Firecrawl stack is the SAME compose file under a different profile. The
// invariant that matters is one-directional: `semantic up` must never drag in
// Firecrawl's ~3 GB, while `firecrawl up` DOES bring SearXNG, because
// Firecrawl's keyless /search delegates to it.
describe("firecrawlControl — the extraction stack", () => {
  const profilesOf = (args: string[]): string[] => args.filter((a, i) => args[i - 1] === "--profile");

  it("starts the extractor and the search engine it delegates to, never the semantic pair", () => {
    for (const action of ["up", "down", "status"]) {
      const { calls, run } = fakeRunner();
      const res = firecrawlControl(action, { run, has: () => true });
      expect(res.code).toBe(0);
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) {
        expect(profilesOf(c.args), action).toEqual(["search", "extract"]);
        expect(profilesOf(c.args), action).not.toContain("semantic");
      }
    }
  });

  it("pulls before `up -d --wait` (5 containers, ~3 GB of images)", () => {
    const { calls, run } = fakeRunner();
    const res = firecrawlControl("up", { run, has: () => true });
    expect(res.code).toBe(0);
    const pullIdx = calls.findIndex((c) => isImagePull(c.args));
    const upIdx = calls.findIndex((c) => isUp(c.args));
    expect(pullIdx).toBeGreaterThanOrEqual(0);
    expect(pullIdx).toBeLessThan(upIdx);
    expect(calls[upIdx]!.args).toContain("--wait");
    // No embedding model to pull — that post-up step belongs to `semantic`.
    expect(calls.some((c) => c.args.includes("exec"))).toBe(false);
    expect(res.message).toMatch(/Firecrawl is up \(:3002/);
  });

  it("names itself in every message and rejects an unknown action", () => {
    const { run } = fakeRunner();
    const res = firecrawlControl("frobnicate", { run, has: () => true });
    expect(res.code).toBe(1);
    expect(res.message).toMatch(/^ultradoc firecrawl: unknown action/);
  });

  it("reports a missing docker instead of throwing", () => {
    const { calls, run } = fakeRunner();
    const res = firecrawlControl("up", { run, has: () => false });
    expect(res.code).toBe(1);
    expect(res.message).toMatch(/docker not found/);
    expect(calls).toEqual([]);
  });

  it("`semantic` still means the cheap three, and never Firecrawl", () => {
    const { calls, run } = fakeRunner();
    const res = semanticControl("up", { run, has: () => true });
    const up = calls.find((c) => isUp(c.args))!;
    expect(profilesOf(up.args)).toEqual(["semantic", "search"]);
    expect(profilesOf(up.args)).not.toContain("extract");
    // Qdrant, Ollama and SearXNG are all named in what it reports.
    expect(res.message).toMatch(/Qdrant/);
    expect(res.message).toMatch(/Ollama/);
    expect(res.message).toMatch(/SearXNG/);
  });

  it("pulls the embedding model once Ollama answers, and only for `semantic`", () => {
    const { calls, run } = fakeRunner();
    const res = semanticControl("up", { run, has: () => true });
    expect(calls.some((c) => c.args.includes("exec") && c.args.includes("ollama"))).toBe(true);
    expect(res.message).toMatch(/nomic-embed-text ready/);
  });

  it("drives the engine's embedded compose file, so an installed copy works", () => {
    // The previous version needed docker-compose.yml beside the bundle. There
    // is no such file in this repo any more.
    const { calls, run } = fakeRunner();
    semanticControl("status", { run, has: () => true });
    const file = calls[0]!.args[calls[0]!.args.indexOf("-f") + 1]!;
    expect(file).toMatch(/docker-compose\.yml$/);
    expect(existsSync(file)).toBe(true);
    expect(file).toContain("ultradoc"); // under OUR cache dir, not a shared one
  });
});

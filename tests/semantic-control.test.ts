import { describe, it, expect } from "vitest";
import { semanticControl } from "../src/index/semantic.js";
import type { ShResult } from "../src/util.js";

// A fake `sh` runner matching the real signature: records every invocation and
// (by default) succeeds, so `semantic up` orchestration can be asserted without
// a real Docker daemon. `fail` lets a test make a chosen step fail.
type ShLike = (cmd: string, args: string[], opts?: { cwd?: string; input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }) => ShResult;

function fakeRunner(fail?: (args: string[]) => boolean) {
  const calls: { cmd: string; args: string[]; timeoutMs?: number }[] = [];
  const run: ShLike = (cmd, args, opts = {}) => {
    calls.push({ cmd, args, timeoutMs: opts.timeoutMs });
    const ok = !(fail?.(args) ?? false);
    return { ok, status: ok ? 0 : 1, stdout: "", stderr: ok ? "" : "boom: network timeout pulling image", missing: false };
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
    expect(pull.args).toEqual(["compose", "-f", expect.any(String), "--profile", "all", "pull"]);
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
});

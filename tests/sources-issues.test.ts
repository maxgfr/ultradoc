import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remoteRef } from "../src/sources/issues.js";
import { resolveRepo } from "../src/clone.js";
import type { RunContext } from "../src/types.js";

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function localCtx(repoDir: string): RunContext {
  const repoRef = resolveRepo(repoDir); // a local path → isLocal, no owner/repo
  return { repoRef, repoDir, index: {} as any, options: {} as any };
}

describe("remoteRef (local checkout → origin)", () => {
  it("resolves owner/repo from the checkout's origin remote", () => {
    dir = mkdtempSync(join(tmpdir(), "ud-remote-"));
    const git = (args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });
    git(["init", "-q"]);
    git(["remote", "add", "origin", "https://github.com/sindresorhus/ky.git"]);
    const ref = remoteRef(localCtx(dir));
    expect(ref.host).toBe("github.com");
    expect(ref.owner).toBe("sindresorhus");
    expect(ref.repo).toBe("ky");
  });

  it("falls back to the local ref (no owner/repo) when there is no origin", () => {
    dir = mkdtempSync(join(tmpdir(), "ud-remote-none-"));
    execFileSync("git", ["-C", dir, "init", "-q"], { stdio: "pipe" });
    const ctx = localCtx(dir);
    const ref = remoteRef(ctx);
    expect(ref.owner).toBeUndefined();
    expect(ref).toBe(ctx.repoRef);
  });
});

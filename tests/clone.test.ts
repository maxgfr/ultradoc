import { describe, it, expect } from "vitest";
import { resolveRepo } from "../src/clone.js";

describe("resolveRepo", () => {
  it("parses an https GitHub URL", () => {
    const r = resolveRepo("https://github.com/sindresorhus/p-retry");
    expect(r).toMatchObject({ host: "github.com", owner: "sindresorhus", repo: "p-retry", isLocal: false });
    expect(r.cloneUrl).toBe("https://github.com/sindresorhus/p-retry.git");
  });

  it("parses an scp-style git URL", () => {
    const r = resolveRepo("git@gitlab.com:group/sub/proj.git");
    expect(r).toMatchObject({ host: "gitlab.com", owner: "group/sub", repo: "proj" });
  });

  it("treats owner/repo as GitHub shorthand", () => {
    const r = resolveRepo("expressjs/express");
    expect(r).toMatchObject({ host: "github.com", owner: "expressjs", repo: "express" });
  });

  it("preserves GitLab subgroups in owner", () => {
    const r = resolveRepo("https://gitlab.com/a/b/c/repo");
    expect(r).toMatchObject({ host: "gitlab.com", owner: "a/b/c", repo: "repo" });
  });

  it("detects a local directory", () => {
    const r = resolveRepo("tests/fixtures/sample-lib");
    expect(r.isLocal).toBe(true);
    expect(r.host).toBe("local");
  });
});

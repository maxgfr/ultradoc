import { describe, it, expect } from "vitest";
import { resolveRepo, sameCommit } from "../src/clone.js";

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

describe("sameCommit", () => {
  // Regression: `git rev-parse --short` grows the abbreviation as the object DB
  // grows (a shallow clone deepened by the history source), so the same commit
  // reads as `ba00676` then `ba006766`. A naive !== reported false drift.
  it("treats a shorter abbrev as the same commit as its longer form", () => {
    expect(sameCommit("ba00676", "ba006766")).toBe(true);
    expect(sameCommit("ba006766", "ba00676")).toBe(true);
    expect(sameCommit("ba006766fb964571723138708eacaba0f55759cd", "ba00676")).toBe(true);
  });

  it("is true for identical shas and false for different ones", () => {
    expect(sameCommit("deadbee", "deadbee")).toBe(true);
    expect(sameCommit("ba00676", "ba00677")).toBe(false);
    expect(sameCommit("abc1234", "def5678")).toBe(false);
  });

  it("is false when either sha is missing", () => {
    expect(sameCommit(undefined, "ba00676")).toBe(false);
    expect(sameCommit("ba00676", undefined)).toBe(false);
    expect(sameCommit(undefined, undefined)).toBe(false);
  });
});

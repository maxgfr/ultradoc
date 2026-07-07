import { describe, expect, it } from "vitest";
import { generic } from "../src/providers/generic.js";
import type { RepoRef } from "../src/types.js";

describe("generic provider", () => {
  const ref: RepoRef = { raw: "x", host: "bitbucket.org", owner: "o", repo: "r", isLocal: false, slug: "bitbucket.org-o-r" };

  it("returns no items and an honest note for an unsupported host", async () => {
    const out = await generic.search(ref, "anything", "issue", 6);
    expect(out.items).toEqual([]);
    expect(out.notes.join(" ")).toMatch(/no public issue api/i);
    expect(out.notes.join(" ")).toContain("bitbucket.org");
  });

  it("matches any host (it is the fallback)", () => {
    expect(generic.matches("anything.example")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { claimCoverage, collectCitations, resolveAlias } from "../src/citations.js";
import type { EvidenceItem } from "../src/types.js";

const EVIDENCE: EvidenceItem[] = [
  { id: "E1", source: "code", title: "retry", ref: "src/index/search.ts", location: "src/index/search.ts:12-40", score: 1, snippet: "..." },
  { id: "E2", source: "code", title: "foo", ref: "src/foo.ts", location: "src/foo.ts:1-10", score: 1, snippet: "..." },
  { id: "E3", source: "docs", title: "guide", ref: "docs/guide.md", location: "docs/guide.md:3-9", score: 1, snippet: "..." },
  { id: "E4", source: "release", title: "rel", ref: "release:v1.2.0", score: 1, snippet: "..." },
  { id: "E5", source: "history", title: "commit", ref: "commit:abc1234def5678", location: "abc1234def5678", score: 1, snippet: "..." },
  { id: "E6", source: "so", title: "so", ref: "so:678", url: "https://stackoverflow.com/q/678", score: 1, snippet: "..." },
  { id: "E7", source: "discussion", title: "disc", ref: "discussion#42", score: 1, snippet: "..." },
  { id: "E8", source: "web", title: "web", ref: "https://qdrant.tech/docs", url: "https://qdrant.tech/docs", score: 1, snippet: "..." },
];

function ids(items: EvidenceItem[]): string[] {
  return items.map((e) => e.id).sort();
}

describe("resolveAlias (strict per-prefix)", () => {
  it("resolves a code alias by full path", () => {
    expect(ids(resolveAlias("code:src/foo.ts", EVIDENCE))).toEqual(["E2"]);
  });

  it("resolves a code alias by trailing path segment", () => {
    expect(ids(resolveAlias("code:foo.ts", EVIDENCE))).toEqual(["E2"]);
  });

  it("resolves a code alias with a line range against the location", () => {
    expect(ids(resolveAlias("code:src/index/search.ts:12-40", EVIDENCE))).toEqual(["E1"]);
  });

  it("does NOT resolve a bare word against a partial path (the [code:index] false positive)", () => {
    expect(resolveAlias("code:index", EVIDENCE)).toEqual([]);
    expect(resolveAlias("code:search", EVIDENCE)).toEqual([]);
  });

  it("resolves a release alias tolerating a leading v", () => {
    expect(ids(resolveAlias("release:1.2.0", EVIDENCE))).toEqual(["E4"]);
    expect(ids(resolveAlias("release:v1.2.0", EVIDENCE))).toEqual(["E4"]);
  });

  it("resolves a commit alias by sha prefix", () => {
    expect(ids(resolveAlias("commit:abc1234", EVIDENCE))).toEqual(["E5"]);
  });

  it("rejects a too-short or non-hex commit payload", () => {
    expect(resolveAlias("commit:abc", EVIDENCE)).toEqual([]);
    expect(resolveAlias("commit:zzzzzzz", EVIDENCE)).toEqual([]);
  });

  it("resolves so/discussion aliases only for exact numeric ids", () => {
    expect(ids(resolveAlias("so:678", EVIDENCE))).toEqual(["E6"]);
    expect(resolveAlias("so:67", EVIDENCE)).toEqual([]);
    expect(ids(resolveAlias("discussion:42", EVIDENCE))).toEqual(["E7"]);
  });

  it("resolves a web alias ignoring scheme and trailing slash", () => {
    expect(ids(resolveAlias("web:qdrant.tech/docs", EVIDENCE))).toEqual(["E8"]);
    expect(ids(resolveAlias("web:https://qdrant.tech/docs/", EVIDENCE))).toEqual(["E8"]);
  });

  it("never resolves across sources", () => {
    // a docs alias must not match the code item at the same path base
    expect(resolveAlias("docs:src/foo.ts", EVIDENCE)).toEqual([]);
  });
});

describe("collectCitations (fence-aware)", () => {
  it("collects grounding tokens and flags fence-only tokens", () => {
    const answer = ["A grounded claim [E1].", "", "```", "example [E2]", "```", "", "Another claim with `[E3]` inline only."].join("\n");
    const { tokens, fencedOnly } = collectCitations(answer);
    expect(tokens).toEqual(["E1"]);
    expect(fencedOnly.sort()).toEqual(["E2", "E3"]);
  });

  it("does not treat a markdown link as a citation", () => {
    const { tokens } = collectCitations("See [the docs](https://example.com) and [E1].");
    expect(tokens).toEqual(["E1"]);
  });
});

describe("claimCoverage", () => {
  it("reports full coverage when every claim is cited", () => {
    const answer = "The retry doubles the delay each attempt [E1].\n\nOnly idempotent requests retry [E2].";
    const c = claimCoverage(answer, EVIDENCE);
    expect(c.claims).toBe(2);
    expect(c.cited).toBe(2);
    expect(c.ratio).toBe(1);
  });

  it("counts uncited paragraphs and lists them", () => {
    const answer = [
      "The retry doubles the delay each attempt [E1].",
      "",
      "It also retries on network partitions and DNS failures automatically.",
      "",
      "The default backoff cap is thirty seconds in production.",
    ].join("\n");
    const c = claimCoverage(answer, EVIDENCE);
    expect(c.claims).toBe(3);
    expect(c.cited).toBe(1);
    expect(c.uncited.length).toBe(2);
    expect(c.ratio).toBeCloseTo(1 / 3, 5);
  });

  it("counts each list item as its own claim", () => {
    const answer = ["Behaviour:", "", "- It retries idempotent requests only [E2].", "- It backs off exponentially without any evidence at all here."].join(
      "\n",
    );
    const c = claimCoverage(answer, EVIDENCE);
    expect(c.claims).toBe(2);
    expect(c.cited).toBe(1);
  });

  it("exempts short transition lines from the count", () => {
    const answer = "In short:\n\nThe retry doubles the delay each attempt [E1].";
    const c = claimCoverage(answer, EVIDENCE);
    expect(c.claims).toBe(1);
    expect(c.cited).toBe(1);
  });

  // Regression: inline-code spans used to be stripped from the stored claim
  // text, garbling the uncited-claim warnings (`makeRetriable` vanished).
  it("preserves backticked tokens in the uncited claim text", () => {
    const answer = "The retry doubles the delay each attempt [E1].\n\nThe `makeRetriable` helper wraps any function in retry behavior.";
    const c = claimCoverage(answer, EVIDENCE);
    expect(c.uncited).toHaveLength(1);
    expect(c.uncited[0]).toContain("`makeRetriable`");
  });

  it("still exempts a line that is only inline code", () => {
    const answer = "`const wrapped = makeRetriable(fetchUser, options)`\n\nThe retry doubles the delay each attempt [E1].";
    const c = claimCoverage(answer, EVIDENCE);
    expect(c.claims).toBe(1);
    expect(c.cited).toBe(1);
  });

  it("still ignores a citation-shaped token inside backticks", () => {
    const answer = "The docs mention `[E1]` but never actually cite it for real anywhere.";
    const c = claimCoverage(answer, EVIDENCE);
    expect(c.claims).toBe(1);
    expect(c.cited).toBe(0);
    expect(c.uncited[0]).toContain("`[E1]`");
  });
});

import { describe, it, expect } from "vitest";
import {
  keywords, rankedKeywords, slugify, rrf, escapeRegExp, clip,
  foldTerm, deaccent, subtokens, accentPattern, expandTokens, buildMatcher, matcherFromTokens,
} from "../src/util.js";

describe("keywords", () => {
  it("drops stopwords and short noise, keeps identifiers", () => {
    const k = keywords("How does the retryRequest function handle a 429 status?");
    expect(k).toContain("retryRequest");
    expect(k).toContain("429");
    expect(k).toContain("status");
    expect(k).not.toContain("the");
    expect(k).not.toContain("does");
  });
  it("dedupes case-insensitively but preserves original token", () => {
    const k = keywords("Backoff backoff BACKOFF");
    expect(k).toEqual(["Backoff"]);
  });
  it("keeps accented tokens whole instead of splitting at the accent", () => {
    const k = keywords("quelle est la stratégie de réessai ?");
    expect(k).toContain("stratégie");
    expect(k).toContain("réessai");
    expect(k).not.toContain("strat");
  });
  it("drops French question scaffolding", () => {
    const k = keywords("comment est calculé le délai entre les réessais ?");
    expect(k).toEqual(["calculé", "délai", "réessais"]);
  });
});

describe("foldTerm / deaccent", () => {
  it("folds plurals conservatively", () => {
    expect(foldTerm("retries")).toBe("retry");
    expect(foldTerm("statuses")).toBe("status");
    expect(foldTerm("branches")).toBe("branch");
    expect(foldTerm("handlers")).toBe("handler");
    expect(foldTerm("class")).toBe("class"); // ss — not a plural
    expect(foldTerm("status")).toBe("status"); // us — not a plural
    expect(foldTerm("redis")).toBe("redis"); // is — not a plural
    expect(foldTerm("ing")).toBe("ing"); // no verb-form folding
  });
  it("strips accents, including non-NFD-decomposable letters", () => {
    expect(foldTerm("Réessai")).toBe("reessai");
    expect(foldTerm("café")).toBe("cafe");
    expect(deaccent("łøđ")).toBe("lod");
  });
});

describe("subtokens", () => {
  it("splits camelCase and snake_case identifiers", () => {
    expect(subtokens("retryBackoff")).toEqual(["retry", "backoff"]);
    expect(subtokens("MAX_RETRY_COUNT")).toEqual(["max", "retry", "count"]);
    expect(subtokens("HTTPServer")).toEqual(["http", "server"]);
  });
  it("returns nothing for single words and drops short/stopword parts", () => {
    expect(subtokens("backoff")).toEqual([]);
    expect(subtokens("toJSON")).toEqual(["json"]); // "to" is a stopword
  });
  it("caps at 4 parts", () => {
    expect(subtokens("oneTwoThreeFourFiveSixParts").length).toBeLessThanOrEqual(4);
  });
});

describe("accentPattern", () => {
  it("matches both accented and plain spellings, both directions", () => {
    const plain = new RegExp(accentPattern("delai"), "i");
    expect(plain.test("le délai entre")).toBe(true);
    expect(plain.test("the delai value")).toBe(true);
    const accented = new RegExp(accentPattern("réessai"), "i");
    expect(accented.test("Réessai automatique")).toBe(true);
    expect(accented.test("reessai automatique")).toBe(true);
  });
  it("escapes regex metacharacters", () => {
    expect(new RegExp(accentPattern("a.b"), "i").test("axb")).toBe(false);
    expect(new RegExp(accentPattern("a.b"), "i").test("a.b")).toBe(true);
  });
});

describe("expandTokens / buildMatcher", () => {
  it("merges variants under one canonical and attributes spans back to it", () => {
    const m = buildMatcher("why do retries fail?");
    expect(m.canonicals).toContain("retry");
    expect(m.canonicalOf("retries")).toBe("retry");
    expect(m.canonicalOf("Retry")).toBe("retry");
  });
  it("prefers the typed keyword over a subtoken on collisions", () => {
    const m = matcherFromTokens(["retryBackoff", "retry"]);
    expect(m.canonicalOf("retry")).toBe("retry");
    expect(m.canonicalOf("backoff")).toBe("retrybackoff");
  });
  it("matchLine covers folded, accented and subtoken forms", () => {
    const m = matcherFromTokens(["retryBackoff", "stratégies"]);
    expect(m.matchLine("const backoff = base * 2")).toEqual(new Set(["retrybackoff"]));
    expect(m.matchLine("la strategie par defaut")).toEqual(new Set(["strategy"]));
    expect(m.matchLine("nothing relevant here")).toEqual(new Set());
  });
  it("keeps the pattern budget bounded", () => {
    const tokens = Array.from({ length: 12 }, (_, i) => `someLongIdentifierNumber${i}Thing`);
    const m = matcherFromTokens(tokens);
    expect(m.expanded.length).toBeLessThanOrEqual(8);
    expect(m.patterns.length).toBeLessThanOrEqual(24);
  });
  it("expandTokens adds folded variants only when they differ", () => {
    const [ek] = expandTokens(["retries"]);
    // ies→y fold ("retry") plus the s-strip form ("retrie") for French-style plurals
    expect(ek!.variants.map((v) => v.text)).toEqual(["retries", "retry", "retrie"]);
    const [ek2] = expandTokens(["retry"]);
    expect(ek2!.variants.map((v) => v.kind)).toEqual(["original"]);
  });
});

describe("rankedKeywords", () => {
  it("ranks numbers and long/identifier tokens before short generic words", () => {
    const r = rankedKeywords("retry on 429 rate limit exponential backoff");
    expect(r[0]).toBe("429"); // a number is the most distinctive
    expect(r.indexOf("exponential")).toBeLessThan(r.indexOf("rate"));
  });
});

describe("slugify", () => {
  it("normalizes a repo URL into a filesystem-safe slug", () => {
    expect(slugify("https://github.com/expressjs/express.git")).toBe("github.com-expressjs-express");
    expect(slugify("git@github.com:a/b.git")).toBe("github.com-a-b");
  });
});

describe("rrf", () => {
  it("fuses ranked lists, rewarding items ranked high across lists", () => {
    const a = [{ k: "x" }, { k: "y" }, { k: "z" }];
    const b = [{ k: "y" }, { k: "x" }, { k: "w" }];
    const fused = rrf([a, b], (i) => i.k);
    // y and x appear high in both; y is #1+#0, x is #0+#1 -> both beat z and w
    const ranked = [...fused.entries()].sort((p, q) => q[1] - p[1]).map(([k]) => k);
    expect(ranked.slice(0, 2).sort()).toEqual(["x", "y"]);
  });
});

describe("misc helpers", () => {
  it("escapeRegExp escapes regex metacharacters", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
  });
  it("clip truncates with a marker", () => {
    expect(clip("abcdef", 3)).toContain("truncated");
    expect(clip("ab", 3)).toBe("ab");
  });
});

import { describe, it, expect } from "vitest";
import { parseDuckDuckGoResults } from "../src/sources/web.js";

// A trimmed DuckDuckGo HTML result page. Real anchors carry the target URL in a
// `uddg=` query param on the DDG redirector, and attribute order varies (class
// before/after href). The fixture also includes a self-referential DDG link and
// a non-http(s) anchor that must both be filtered out.
const DDG_HTML = `
<div class="results">
  <div class="result">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs%2Fretry&amp;rut=abc">Retry backoff — Example docs</a>
  </div>
  <div class="result">
    <a class="result__a" data-testid="result-title-a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Facme%2Flib%2Fissues%2F42&amp;rut=def">acme/lib#42</a>
  </div>
  <div class="result">
    <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fpage%3Fa%3D1%26b%3D2&amp;rut=ghi" class="result__a">Query-string page</a>
  </div>
  <div class="result">
    <a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Sponsored — should be dropped</a>
  </div>
  <div class="result">
    <a class="result__a" href="javascript:void(0)">Bad scheme — should be dropped</a>
  </div>
  <a class="sidebar__link" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnot-a-result.example">Not a result anchor</a>
</div>`;

describe("parseDuckDuckGoResults", () => {
  it("decodes the real target out of the uddg= redirector, in anchor order", () => {
    const urls = parseDuckDuckGoResults(DDG_HTML, 10);
    expect(urls).toEqual(["https://example.com/docs/retry", "https://github.com/acme/lib/issues/42", "https://example.org/page?a=1&b=2"]);
  });

  it("matches result__a anchors regardless of attribute order", () => {
    // href-before-class and class-before-href both appear above and are kept.
    const urls = parseDuckDuckGoResults(DDG_HTML, 10);
    expect(urls).toContain("https://example.org/page?a=1&b=2");
  });

  it("drops duckduckgo.com self-links, bad schemes, and non-result anchors", () => {
    const urls = parseDuckDuckGoResults(DDG_HTML, 10);
    expect(urls.some((u) => /duckduckgo\.com/.test(u))).toBe(false);
    expect(urls.some((u) => u.startsWith("javascript:"))).toBe(false);
    expect(urls).not.toContain("https://not-a-result.example");
  });

  it("honours the result cap", () => {
    expect(parseDuckDuckGoResults(DDG_HTML, 1)).toEqual(["https://example.com/docs/retry"]);
  });

  it("returns an empty list when the page has no result anchors", () => {
    expect(parseDuckDuckGoResults("<html><body>no results</body></html>", 5)).toEqual([]);
  });
});

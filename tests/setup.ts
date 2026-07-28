// Global test environment. Runs before every suite.
//
// Firecrawl defaults to http://localhost:3002, so a developer who happens to
// have the `extract` profile running would silently exercise a DIFFERENT
// extractor than CI does — different cache keys, different extracted text,
// different call counts. That is not a hypothetical: it hid a real failure in
// tests/ask.test.ts, where a hand-written cache-key literal stopped matching and
// the "offline" test quietly started fetching example.com for real. It passed
// locally and failed in CI.
//
// Tests that exercise Firecrawl pass an explicit base (or set the env var
// themselves), which overrides this.
process.env.ULTRADOC_FIRECRAWL = "off";

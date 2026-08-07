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

// The PDF extractor ladder shells out to npx (pdf-inspector) and pdftotext. In a
// test that would mean network access, ~90s timeouts, and results that depend on
// which tools the developer happens to have installed — the opposite of an
// offline, deterministic suite. Pin it to the built-in reader; the cases that
// exercise other rungs pass `engines` themselves.
process.env.ULTRADOC_PDF_ENGINE = "native";

// The office-document ladder shells out to npx (anydoc) too, and unlike the PDF
// one it has no built-in last rung to pin it to — so `none` disables it. The
// tests that exercise a rung pass `engines` themselves. This also keeps the
// default honest: an office document nothing can read must REFUSE.
process.env.ULTRADOC_DOC_ENGINE = "none";

// OCR shells out to copyable-pdf + tesseract and rasterises at 300 DPI:
// machine-dependent, and seconds per page. A budget of 0 switches the rung off
// for the suite; tests/pdf-ocr.test.ts drives it with the subprocess stubbed.
process.env.ULTRADOC_OCR_MAX = "0";

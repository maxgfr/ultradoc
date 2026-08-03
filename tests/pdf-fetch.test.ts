import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAndExtract } from "../src/sources/fetch.js";

// A minimal fake Response. fetchAndExtract only reads ok/status/headers.get and
// the body — as a stream when it can, so `body: null` steers readCapped/
// readCappedBytes down their arrayBuffer fallback, which is what we want here.
function res(body: string, contentType: string) {
  const buf = Buffer.from(body, "latin1");
  return {
    ok: true,
    status: 200,
    body: null,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
    async arrayBuffer() {
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
    async text() {
      return body;
    },
  } as unknown as Response;
}

describe("PDF extraction", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Before the ladder there was no PDF branch: an application/pdf response
  // failed the isHtml test in nativeExtract and came back as res.body verbatim —
  // the PDF's bytes decoded as UTF-8 — and was then cached and quoted as docs.
  it("extracts a PDF instead of passing its bytes along as text", async () => {
    const prose = "A clean sentence of extracted prose, long enough for the quality gate to judge it fairly. ".repeat(3);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(`%PDF-1.4\nstream\nBT (${prose}) Tj ET\nendstream\n`, "application/pdf")),
    );
    const r = await fetchAndExtract("https://x.test/paper.pdf");
    expect(r.text).toContain("A clean sentence of extracted prose");
    expect(r.text).not.toContain("%PDF");
  });

  it("refuses a PDF no rung could read rather than emitting binary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res("%PDF-1.4 no text operators here", "application/pdf")),
    );
    const r = await fetchAndExtract("https://x.test/scan.pdf");
    expect(r.text).toBe("");
    expect(r.note).toMatch(/could not extract text/i);
  });
});

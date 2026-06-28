import { describe, it, expect } from "vitest";
import { assignIds, renderEvidenceMarkdown } from "../src/dossier.js";
import type { SourceResult, DossierMeta } from "../src/types.js";

const results: SourceResult[] = [
  {
    source: "docs",
    items: [{ source: "docs", title: "README", ref: "README.md", score: 1, snippet: "docs" }],
    notes: [],
  },
  {
    source: "code",
    items: [
      { source: "code", title: "low", ref: "b.ts", score: 2, snippet: "x" },
      { source: "code", title: "high", ref: "a.ts", score: 9, snippet: "y" },
    ],
    notes: ["a note"],
  },
];

describe("assignIds", () => {
  it("orders code before docs and sorts by score within a source", () => {
    const ev = assignIds(results);
    expect(ev.map((e) => e.id)).toEqual(["E1", "E2", "E3"]);
    expect(ev[0]).toMatchObject({ id: "E1", source: "code", ref: "a.ts" }); // highest code score first
    expect(ev[1]).toMatchObject({ id: "E2", source: "code", ref: "b.ts" });
    expect(ev[2]).toMatchObject({ id: "E3", source: "docs" });
  });
});

describe("renderEvidenceMarkdown", () => {
  it("renders the question, grouped sections and citable ids", () => {
    const ev = assignIds(results);
    const meta: DossierMeta = {
      question: "what?",
      repo: "r",
      host: "h",
      sources: ["code", "docs"],
      semantic: false,
      evidenceCount: ev.length,
      builtAt: "now",
      notes: ["a note"],
    };
    const md = renderEvidenceMarkdown(ev, meta);
    expect(md).toContain("**Question:** what?");
    expect(md).toContain("## Code");
    expect(md).toContain("## Documentation");
    expect(md).toContain("[E1]");
    expect(md).toContain("Retrieval notes");
  });
});

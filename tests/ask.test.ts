import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runAsk } from "../src/ask.js";
import { checkRun } from "../src/check.js";
import type { AskOptions } from "../src/types.js";

// End-to-end, fully offline: clone (local path), index, retrieve from code+docs,
// write a dossier, then validate a grounded answer against it.
describe("runAsk (offline integration)", () => {
  it("produces a dossier and a passing citation check", async () => {
    const out = mkdtempSync(join(tmpdir(), "ultradoc-ask-"));
    const opts: AskOptions = {
      repo: resolve("tests/fixtures/sample-lib"),
      question: "how does the retry backoff work?",
      sources: ["code", "docs"],
      semantic: false,
      webEngine: "auto",
      perSource: 6,
      json: false,
      refresh: true,
      out,
    };
    const r = await runAsk(opts);

    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.evidence.some((e) => e.source === "code")).toBe(true);
    expect(r.evidence.some((e) => e.source === "docs")).toBe(true);
    expect(existsSync(join(out, "evidence.json"))).toBe(true);
    expect(existsSync(join(out, "EVIDENCE.md"))).toBe(true);

    // The retry source should be retrievable as the top code evidence.
    const code = r.evidence.filter((e) => e.source === "code");
    expect(code[0]!.ref).toBe("src/retry.ts");

    // A grounded answer citing real ids must pass the check.
    const cited = code[0]!.id;
    writeFileSync(join(out, "ANSWER.md"), `Backoff doubles each attempt [${cited}].`);
    const check = checkRun(out);
    expect(check.ok).toBe(true);

    rmSync(out, { recursive: true, force: true });
  });
});

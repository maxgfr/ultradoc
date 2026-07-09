import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAsk } from "../src/ask.js";
import { DRILL_COMMAND, DRILL_SOURCES, MAX_DRILL_CELLS, buildDrillPlan, writeDrillPlan } from "../src/drill-plan.js";
import type { SourceKind } from "../src/types.js";

const LIB = resolve("tests/fixtures/sample-lib");
const ASKED: SourceKind[] = ["code", "issue", "pr", "docs"];

// Offline, like every fixture-building suite.
const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = (async () => {
    throw new Error("network disabled in tests");
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("drill-plan — deriving the retrieval fan-out from the ask", () => {
  it("a prose-only question plans one prose drill per source the ask did NOT cover", () => {
    const plan = buildDrillPlan({ question: "how does the retry logic work?", repo: LIB, askedSources: ASKED });
    expect(plan.cells.length).toBe(DRILL_SOURCES.length - ASKED.length);
    for (const c of plan.cells) {
      expect(c.variant).toBe("prose");
      expect(c.query).toBe("how does the retry logic work?");
      expect(ASKED).not.toContain(c.source);
    }
  });

  it("derives identifier and literal variants from the question and fans them across ALL drill sources", () => {
    const plan = buildDrillPlan({
      question: 'why does `retryBackoff` throw "request timed out" after MAX_RETRIES?',
      repo: LIB,
      askedSources: ASKED,
    });
    const identifier = plan.cells.filter((c) => c.variant === "identifier");
    const literal = plan.cells.filter((c) => c.variant === "literal");
    expect(identifier.length).toBe(DRILL_SOURCES.length);
    expect(literal.length).toBe(DRILL_SOURCES.length);
    expect(identifier[0]!.query).toContain("retryBackoff");
    expect(identifier[0]!.query).toContain("MAX_RETRIES");
    expect(literal[0]!.query).toContain("request timed out");
    // The prose × already-asked cells are covered by the seed ask, so skipped.
    expect(plan.cells.filter((c) => c.variant === "prose").length).toBe(DRILL_SOURCES.length - ASKED.length);
  });

  it("is deterministic, with sequential D# ids and the cell count capped", () => {
    const opts = { question: 'is `computeBackoff` capped by MAX_DELAY or "retry limit reached"?', repo: LIB, askedSources: ["code"] as SourceKind[] };
    const a = buildDrillPlan(opts);
    const b = buildDrillPlan(opts);
    expect(b).toEqual(a);
    expect(a.cells.map((c) => c.id)).toEqual(a.cells.map((_, i) => `D${i + 1}`));
    expect(a.cells.length).toBeLessThanOrEqual(MAX_DRILL_CELLS);
  });

  it("plans no cells when the ask already covered every drillable source", () => {
    const plan = buildDrillPlan({ question: "how does the retry logic work?", repo: LIB, askedSources: [...DRILL_SOURCES] });
    expect(plan.cells).toEqual([]);
  });

  it("maps every drillable source kind to a real single-source CLI command", () => {
    const cliDrillCommands = new Set(["code", "issues", "prs", "docs", "releases", "history", "discussions", "so", "web"]);
    for (const s of DRILL_SOURCES) {
      expect(cliDrillCommands.has(DRILL_COMMAND[s]!), `DRILL_COMMAND[${s}]`).toBe(true);
    }
  });

  it("writeDrillPlan persists drill-plan.json in the run dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "udoc-plan-"));
    const plan = buildDrillPlan({ question: "how does the retry logic work?", repo: LIB, askedSources: ASKED });
    const p = writeDrillPlan(dir, plan);
    expect(p).toBe(join(dir, "drill-plan.json"));
    expect(JSON.parse(readFileSync(p, "utf8"))).toEqual(plan);
  });

  it("ask persists the drill plan beside the dossier (the engine addition orchestrate reads)", async () => {
    const root = mkdtempSync(join(tmpdir(), "udoc-plan-ask-"));
    const lib = join(root, "sample-lib");
    cpSync(LIB, lib, { recursive: true });
    const dir = join(root, "run");
    await runAsk({
      repo: lib,
      question: "how does `retryBackoff` work?",
      sources: ["code", "docs"],
      out: dir,
      semantic: false,
      webEngine: "auto",
      perSource: 6,
      json: false,
      refresh: false,
    });
    expect(existsSync(join(dir, "drill-plan.json"))).toBe(true);
    const plan = JSON.parse(readFileSync(join(dir, "drill-plan.json"), "utf8"));
    expect(plan.question).toBe("how does `retryBackoff` work?");
    expect(plan.askedSources).toEqual(["code", "docs"]);
    expect(plan.cells.length).toBeGreaterThan(0);
    expect(plan.cells.some((c: { variant: string }) => c.variant === "identifier")).toBe(true);
  }, 60_000);
});

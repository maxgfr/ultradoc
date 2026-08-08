import { describe, it, expect } from "vitest";
import { ultradocAdapter } from "../src/mcp/adapter.js";
import { TOOLS, WRITE_TOOLS, TOOL_META, annotationsFor, toolsFor } from "../src/mcp/tools.js";
import { validateArgs } from "../src/engine.js";
import { SOURCE_TOKENS, parseSourceList } from "../src/sources/kinds.js";

const ALL = [...TOOLS, ...WRITE_TOOLS];

describe("tool declarations", () => {
  it("names every tool consistently and uniquely", () => {
    const names = ALL.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^ultradoc_[a-z_]+$/);
  });

  it("declares a well-formed object schema whose required properties exist", () => {
    for (const t of ALL) {
      expect(t.inputSchema.type, t.name).toBe("object");
      expect(t.inputSchema.properties, t.name).toBeTypeOf("object");
      expect(Array.isArray(t.inputSchema.required), t.name).toBe(true);
      for (const r of t.inputSchema.required) {
        expect(Object.keys(t.inputSchema.properties), `${t.name}.required lists "${r}"`).toContain(r);
      }
      for (const [key, spec] of Object.entries(t.inputSchema.properties)) {
        expect(spec.description, `${t.name}.${key} has no description`).toBeTruthy();
      }
    }
  });

  it("gives every tool a description that says what it is for", () => {
    for (const t of ALL) {
      expect(t.description.length, t.name).toBeGreaterThan(80);
      expect(t.title, t.name).toBeTruthy();
    }
  });

  it("keeps the `sources` enum in sync with what the engine actually parses", () => {
    const enumValues = TOOLS.find((t) => t.name === "ultradoc_search")!.inputSchema.properties.sources!.enum!;
    expect([...enumValues].sort()).toEqual(Object.keys(SOURCE_TOKENS).sort());
    // Every advertised token really resolves — the schema cannot promise a
    // spelling parseSourceList would reject.
    for (const v of enumValues) expect(parseSourceList([v]).error, v).toBeUndefined();
  });

  it("declares an outputSchema only where the result shape is small and stable", () => {
    expect(ALL.filter((t) => t.outputSchema).map((t) => t.name)).toEqual(["ultradoc_read"]);
  });
});

describe("annotations", () => {
  // Asserted tool by tool on purpose: flipping readOnlyHint on `ask` is the
  // kind of change that silently makes a client stop asking for confirmation,
  // so it has to show up as a failing diff.
  const EXPECTED: Record<string, { readOnlyHint: boolean; openWorldHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean }> = {
    ultradoc_search: { readOnlyHint: true, openWorldHint: true },
    ultradoc_overview: { readOnlyHint: true, openWorldHint: true },
    ultradoc_symbol: { readOnlyHint: true, openWorldHint: true },
    ultradoc_read: { readOnlyHint: true, openWorldHint: true },
    ultradoc_fetch: { readOnlyHint: true, openWorldHint: true },
    ultradoc_ask: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    ultradoc_check: { readOnlyHint: true, openWorldHint: false },
    ultradoc_verify: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    ultradoc_doc: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    ultradoc_cache: { readOnlyHint: true, openWorldHint: false },
    ultradoc_cache_clean: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  };

  it("matches the expected matrix exactly", () => {
    for (const t of ALL) expect(annotationsFor(t.name), t.name).toEqual(EXPECTED[t.name]);
  });

  it("covers every declared tool and nothing else", () => {
    expect(Object.keys(TOOL_META).sort()).toEqual(ALL.map((t) => t.name).sort());
    expect(Object.keys(EXPECTED).sort()).toEqual(ALL.map((t) => t.name).sort());
  });

  it("marks the only destructive tool as such", () => {
    expect(ALL.filter((t) => annotationsFor(t.name)?.destructiveHint).map((t) => t.name)).toEqual(["ultradoc_cache_clean"]);
  });
});

describe("toolsFor", () => {
  it("hides the destructive tool unless the server allows writes", () => {
    expect(toolsFor("2025-06-18").map((t) => t.name)).not.toContain("ultradoc_cache_clean");
    expect(toolsFor("2025-06-18", { allowWrite: true }).map((t) => t.name)).toContain("ultradoc_cache_clean");
  });

  it("gates rich fields on the negotiated protocol version", () => {
    const old = toolsFor("2024-11-05").find((t) => t.name === "ultradoc_read")!;
    expect(old.annotations).toBeUndefined();
    expect(old.title).toBeUndefined();
    expect(old.outputSchema).toBeUndefined();

    const mid = toolsFor("2025-03-26").find((t) => t.name === "ultradoc_read")!;
    expect(mid.annotations).toBeDefined();
    expect(mid.title).toBeUndefined();
    expect(mid.outputSchema).toBeUndefined();

    const latest = toolsFor("2025-11-25").find((t) => t.name === "ultradoc_read")!;
    expect(latest.annotations).toBeDefined();
    expect(latest.title).toBeTruthy();
    expect(latest.outputSchema).toBeDefined();
  });

  it("drops `repo` from required and names the default when one is configured", () => {
    const plain = toolsFor("2025-06-18").find((t) => t.name === "ultradoc_search")!;
    expect(plain.inputSchema.required).toContain("repo");

    const scoped = toolsFor("2025-06-18", { defaultRepo: "/srv/vue" }).find((t) => t.name === "ultradoc_search")!;
    expect(scoped.inputSchema.required).not.toContain("repo");
    expect(scoped.inputSchema.required).toContain("question");
    expect(scoped.inputSchema.properties.repo!.description).toMatch(/defaults to \/srv\/vue/);
    // Validation follows the rewritten schema: no repo is now acceptable.
    expect(validateArgs(scoped.inputSchema, { question: "how?" })).toBeUndefined();
  });

  it("leaves tools without a repo property untouched by the default", () => {
    const fetch = toolsFor("2025-06-18", { defaultRepo: "/srv/vue" }).find((t) => t.name === "ultradoc_fetch")!;
    expect(fetch.inputSchema.required).toEqual(["urls"]);
    expect(fetch.inputSchema.properties.repo).toBeUndefined();
  });

  it("never lets a destructive delete inherit the default repo", () => {
    const clean = toolsFor("2025-06-18", { defaultRepo: "/srv/vue", allowWrite: true }).find((t) => t.name === "ultradoc_cache_clean")!;
    expect(clean.inputSchema.properties.repo!.description).not.toMatch(/defaults to/);
  });

  it("validates a realistic search call against the advertised schema", () => {
    const search = toolsFor("2025-06-18").find((t) => t.name === "ultradoc_search")!;
    expect(validateArgs(search.inputSchema, { repo: "vuejs/core", question: "how does reactivity work?", sources: ["code", "issues"] })).toBeUndefined();
    expect(validateArgs(search.inputSchema, { repo: "vuejs/core" })).toMatch(/`question` is required/);
    expect(validateArgs(search.inputSchema, { repo: "vuejs/core", question: "x", sources: ["telepathy"] })).toMatch(/telepathy/);
  });
});

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractSymbols } from "../src/lang/registry.js";

function runNode(script: string, env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string; status: number }> {
  return new Promise((res) => {
    execFile(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env }, (err, stdout, stderr) => {
      const status = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
      res({ stdout: stdout ?? "", stderr: stderr ?? "", status });
    });
  });
}

const SRC = `export class Controller {
  handle(input: string): string { return this.sanitize(input); }
  private sanitize(raw: string): string { return raw.trim(); }
}
export function create(base: string): Controller { return new Controller(); }
`;

describe("symbol extraction is AST-preferred", () => {
  it("without a warm-up it is the regex tier — methods are invisible", () => {
    // The suite never warms the grammars, so this is the documented fallback and
    // it must stay complete: top-level declarations, no methods.
    const syms = extractSymbols("a.ts", ".ts", SRC).map((s) => `${s.kind}:${s.name}`);
    expect(syms).toContain("class:Controller");
    expect(syms).toContain("function:create");
    expect(syms.some((s) => s.endsWith(":sanitize"))).toBe(false);
  });

  it("after warmGrammars the same file yields its methods — measured in a fresh interpreter", async () => {
    // A child process: the loader's `loaded` map is module-global, so warming a
    // grammar in THIS process would leak into the regex assertion above.
    const engine = fileURLToPath(new URL("../src/vendor/codeindex-engine.mjs", import.meta.url));
    const cmp = `
      const { extractCode, warmGrammars } = await import(${JSON.stringify(engine)});
      const S = ${JSON.stringify(SRC)};
      const cold = extractCode("a.ts", ".ts", S).symbols.map((s) => s.kind + ":" + s.name);
      const r = await warmGrammars({ keys: ["typescript"], pull: false, onNote: () => {} });
      const warm = extractCode("a.ts", ".ts", S).symbols.map((s) => s.kind + ":" + s.name);
      console.log(JSON.stringify({ cold, warm, ready: r.ready, tier: r.tier }));
    `;
    const env = { ...process.env, CODEINDEX_GRAMMARS_DIR: process.env.CODEINDEX_GRAMMARS_DIR ?? "" };
    const { stdout, status } = await runNode(cmp, env);
    expect(status).toBe(0);
    const out = JSON.parse(stdout.trim()) as { cold: string[]; warm: string[]; ready: boolean; tier: string };

    // No grammars resolvable on this host ⇒ nothing to assert beyond "the
    // fallback held". CI runs in exactly that shape; a host with the shared
    // cache populated exercises the real AST assertion below.
    if (!out.ready) {
      expect(out.tier).toBe("none");
      expect(out.warm).toEqual(out.cold);
      return;
    }
    expect(out.cold.some((s) => s.endsWith(":sanitize"))).toBe(false);
    expect(out.warm.some((s) => s.endsWith(":sanitize"))).toBe(true);
    expect(out.warm.some((s) => s.endsWith(":handle"))).toBe(true);
    // AST is strictly richer here: every top-level symbol survives.
    expect(out.warm).toContain("class:Controller");
  });
});

// The call index (StructuralIndex.callSites) is only as precise as the tier
// that produced it. searchCode's call-site pass reads that index, so pin what
// each tier actually reports rather than assuming the AST behaviour holds
// everywhere.
describe("call extraction is AST-preferred", () => {
  const DECOY = [
    "// remember to call fireCallback(1) somewhere", // line comment
    "/** @see fireCallback(1) */", // block comment
    "export const hint = 'call fireCallback(1) to retry';", // string literal
    "export function run(): void {",
    "  fireCallback(1);", // the only real invocation
    "}",
  ].join("\n");

  it("reports only the real invocation once the grammars are warm", async () => {
    const engine = fileURLToPath(new URL("../src/vendor/codeindex-engine.mjs", import.meta.url));
    const cmp = `
      const { extractCode, warmGrammars } = await import(${JSON.stringify(engine)});
      const S = ${JSON.stringify(DECOY)};
      const lines = (r) => r.calls.filter((c) => c.name === "fireCallback").map((c) => c.line);
      const cold = lines(extractCode("a.ts", ".ts", S));
      const r = await warmGrammars({ keys: ["typescript"], pull: false, onNote: () => {} });
      const warm = lines(extractCode("a.ts", ".ts", S));
      console.log(JSON.stringify({ cold, warm, ready: r.ready, tier: r.tier }));
    `;
    const env = { ...process.env, CODEINDEX_GRAMMARS_DIR: process.env.CODEINDEX_GRAMMARS_DIR ?? "" };
    const { stdout, status } = await runNode(cmp, env);
    expect(status).toBe(0);
    const out = JSON.parse(stdout.trim()) as { cold: number[]; warm: number[]; ready: boolean; tier: string };

    // The regex tier drops the line comment but keeps the block comment and the
    // string literal — the documented fallback, no worse than the text pass the
    // call index replaced.
    expect(out.cold).toContain(5);
    expect(out.cold).not.toContain(1);
    if (!out.ready) {
      expect(out.tier).toBe("none");
      return;
    }
    // The AST tier keeps only the invocation that is actually in the parse tree.
    expect(out.warm).toEqual([5]);
    expect(out.cold.length).toBeGreaterThan(out.warm.length);
  });
});

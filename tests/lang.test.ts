import { describe, it, expect } from "vitest";
import { extractSymbols, languageOf } from "../src/lang/registry.js";

describe("language symbol extraction", () => {
  it("extracts TypeScript declarations with export status", () => {
    const src = `export function retryRequest() {}
function helper() {}
export class HttpClient {}
export interface RetryOptions {}
export const DEFAULT = 1;
type Internal = string;`;
    const syms = extractSymbols("a.ts", ".ts", src);
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]));
    expect(byName.retryRequest).toMatchObject({ kind: "function", exported: true });
    expect(byName.helper).toMatchObject({ kind: "function", exported: false });
    expect(byName.HttpClient).toMatchObject({ kind: "class", exported: true });
    expect(byName.RetryOptions).toMatchObject({ kind: "interface", exported: true });
    expect(byName.DEFAULT).toMatchObject({ kind: "const", exported: true });
    expect(byName.Internal).toMatchObject({ kind: "type", exported: false });
  });

  it("extracts Python functions/methods and respects underscore privacy", () => {
    const src = `def public_fn():
    pass

def _private():
    pass

class Thing:
    def method(self):
        pass`;
    const syms = extractSymbols("a.py", ".py", src);
    const pub = syms.find((s) => s.name === "public_fn");
    const priv = syms.find((s) => s.name === "_private");
    const method = syms.find((s) => s.name === "method");
    expect(pub).toMatchObject({ kind: "function", exported: true });
    expect(priv).toMatchObject({ exported: false });
    expect(method).toMatchObject({ kind: "method" });
  });

  it("extracts Go functions/types with uppercase = exported", () => {
    const src = `func Exported() {}
func unexported() {}
func (s *Server) Handle() {}
type Config struct {}`;
    const syms = extractSymbols("a.go", ".go", src);
    expect(syms.find((s) => s.name === "Exported")).toMatchObject({ exported: true });
    expect(syms.find((s) => s.name === "unexported")).toMatchObject({ exported: false });
    expect(syms.find((s) => s.name === "Handle")).toMatchObject({ kind: "method", exported: true });
    expect(syms.find((s) => s.name === "Config")).toMatchObject({ kind: "struct" });
  });

  it("returns [] for an unknown extension but still labels the language", () => {
    expect(extractSymbols("a.txt", ".txt", "hello")).toEqual([]);
    expect(languageOf(".ts")).toBe("javascript/typescript");
    expect(languageOf(".py")).toBe("python");
    expect(languageOf(".zzz")).toBe("other");
  });
});

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

  it("extracts C# types and methods with visibility", () => {
    const src = `public class LoggerConfiguration {
    public Logger CreateLogger() { }
    private void Flush() { }
}
internal interface ISink { }
public enum LogLevel { }`;
    const s = extractSymbols("a.cs", ".cs", src);
    const by = Object.fromEntries(s.map((x) => [x.name, x]));
    expect(by.LoggerConfiguration).toMatchObject({ kind: "class", exported: true });
    expect(by.CreateLogger).toMatchObject({ kind: "method", exported: true });
    expect(by.Flush).toMatchObject({ exported: false });
    expect(by.ISink).toMatchObject({ kind: "interface" });
    expect(by.LogLevel).toMatchObject({ kind: "enum" });
  });

  it("extracts PHP classes and functions", () => {
    const src = `class Client {
    public function send() {}
    private function build() {}
}
interface ClientInterface {}
trait HasHeaders {}`;
    const s = extractSymbols("a.php", ".php", src);
    const by = Object.fromEntries(s.map((x) => [x.name, x]));
    expect(by.Client).toMatchObject({ kind: "class" });
    expect(by.send).toMatchObject({ kind: "function", exported: true });
    expect(by.build).toMatchObject({ exported: false });
    expect(by.ClientInterface).toMatchObject({ kind: "interface" });
    expect(by.HasHeaders).toMatchObject({ kind: "trait" });
  });

  it("extracts Elixir modules and def/defp", () => {
    const src = `defmodule Ecto.Query do
  def from(expr) do
  end
  defp build(x) do
  end
  defmacro where(q) do
  end
end`;
    const s = extractSymbols("a.ex", ".ex", src);
    const by = Object.fromEntries(s.map((x) => [x.name, x]));
    expect(by["Ecto.Query"]).toMatchObject({ kind: "module" });
    expect(by.from).toMatchObject({ kind: "function", exported: true });
    expect(by.build).toMatchObject({ kind: "function", exported: false });
    expect(by.where).toMatchObject({ kind: "macro" });
  });

  it("extracts shell functions (both syntaxes, incl. .zsh)", () => {
    const src = `function is_plugin {
  return 0
}
load_plugin() {
  echo hi
}`;
    const s = extractSymbols("plugin.zsh", ".zsh", src);
    const names = s.map((x) => x.name);
    expect(names).toContain("is_plugin");
    expect(names).toContain("load_plugin");
    expect(languageOf(".zsh")).toBe("shell");
  });

  it("extracts Swift and Kotlin declarations", () => {
    const swiftSyms = extractSymbols("a.swift", ".swift", `public func validate() {}\nstruct Request {}\nprivate func internalOnly() {}`);
    const sby = Object.fromEntries(swiftSyms.map((x) => [x.name, x]));
    expect(sby.validate).toMatchObject({ kind: "function", exported: true });
    expect(sby.Request).toMatchObject({ kind: "struct" });
    expect(sby.internalOnly).toMatchObject({ exported: false });

    const kotlinSyms = extractSymbols("a.kt", ".kt", `class ConnectionPool {\n  fun reuse() {}\n  private fun evict() {}\n}`);
    const kby = Object.fromEntries(kotlinSyms.map((x) => [x.name, x]));
    expect(kby.ConnectionPool).toMatchObject({ kind: "class" });
    expect(kby.reuse).toMatchObject({ kind: "function", exported: true });
    expect(kby.evict).toMatchObject({ exported: false });
  });

  it("marks symbols exported via an export list, including `as` aliases", () => {
    const src = `function alpha() {}
class Beta {}
function gamma() {}
export { alpha, Beta as PublicBeta };
export { something } from "./other.js";`;
    const s = extractSymbols("m.ts", ".ts", src);
    const by = Object.fromEntries(s.map((x) => [x.name, x]));
    expect(by.alpha).toMatchObject({ exported: true }); // flipped by the list
    expect(by.Beta).toMatchObject({ exported: true });
    expect(by.PublicBeta).toMatchObject({ kind: "class", exported: true }); // alias added
    expect(by.gamma).toMatchObject({ exported: false }); // not in any list
    expect(by.something).toBeUndefined(); // re-export from another module — ignored
  });

  it("extracts CommonJS named and object exports", () => {
    const src = `function build() {}
exports.render = function () {};
module.exports.parse = function () {};
function helper() {}
module.exports = { build, helper };`;
    const s = extractSymbols("m.js", ".js", src);
    const by = Object.fromEntries(s.map((x) => [x.name, x]));
    expect(by.render).toMatchObject({ exported: true });
    expect(by.parse).toMatchObject({ exported: true });
    expect(by.build).toMatchObject({ exported: true }); // via module.exports = { build, … }
    expect(by.helper).toMatchObject({ exported: true });
  });

  it("names an anonymous default export after the file stem", () => {
    const anonFn = extractSymbols("createServer.ts", ".ts", `export default function () {\n  return 1;\n}`);
    expect(anonFn.find((s) => s.name === "createServer")).toMatchObject({ kind: "default", exported: true });

    const anonClass = extractSymbols("Widget.ts", ".ts", `export default class extends Base {}`);
    expect(anonClass.find((s) => s.name === "Widget")).toMatchObject({ kind: "default", exported: true });

    const named = extractSymbols("x.ts", ".ts", `export default class Foo {}`);
    expect(named.find((s) => s.name === "Foo")).toMatchObject({ kind: "class", exported: true });
    expect(named.find((s) => s.name === "x")).toBeUndefined(); // no stem symbol when named
  });

  it("flags a default-exported existing identifier", () => {
    const src = `function handler() {}\nexport default handler;`;
    const s = extractSymbols("h.ts", ".ts", src);
    expect(s.find((x) => x.name === "handler")).toMatchObject({ exported: true });
  });

  it("returns [] for an unknown extension but still labels the language", () => {
    expect(extractSymbols("a.txt", ".txt", "hello")).toEqual([]);
    expect(languageOf(".ts")).toBe("javascript/typescript");
    expect(languageOf(".py")).toBe("python");
    expect(languageOf(".zzz")).toBe("other");
  });
});

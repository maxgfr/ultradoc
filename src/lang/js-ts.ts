import type { CodeSymbol } from "../types.js";
import { applyExportLists, scan, type Rule } from "./common.js";

// JavaScript / TypeScript. Heuristic, line-based: catches top-level
// declarations and their `export` status, which is what drives ranking and
// "where is X defined" navigation.
const RULES: Rule[] = [
  { re: /^\s*export\s+(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: true },
  { re: /^\s*export\s+default\s+(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: true },
  { re: /^\s*export\s+default\s+(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: true },
  { re: /^\s*(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: false },
  { re: /^\s*export\s+(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: true },
  { re: /^\s*(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: false },
  { re: /^\s*export\s+interface\s+(?<name>[\w$]+)/, kind: "interface", exported: true },
  { re: /^\s*interface\s+(?<name>[\w$]+)/, kind: "interface", exported: false },
  { re: /^\s*export\s+type\s+(?<name>[\w$]+)/, kind: "type", exported: true },
  { re: /^\s*type\s+(?<name>[\w$]+)\s*[=<]/, kind: "type", exported: false },
  { re: /^\s*export\s+enum\s+(?<name>[\w$]+)/, kind: "enum", exported: true },
  { re: /^\s*export\s+const\s+enum\s+(?<name>[\w$]+)/, kind: "enum", exported: true },
  // exported const/let bound to an arrow fn or value
  { re: /^\s*export\s+(?:const|let|var)\s+(?<name>[\w$]+)\s*[:=]/, kind: "const", exported: true },
  // CommonJS named exports: `exports.foo = …`, `module.exports.foo = …`
  { re: /^\s*exports\.(?<name>[\w$]+)\s*=/, kind: "const", exported: true },
  { re: /^\s*module\.exports\.(?<name>[\w$]+)\s*=/, kind: "const", exported: true },
  // top-level const arrow function (not exported)
  { re: /^\s*(?:const|let)\s+(?<name>[\w$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/, kind: "const", exported: false },
];

// A default export with no name (`export default function () {}`,
// `export default class extends X {}`, `export default { … }`). Named as the
// file stem so "what does <module> export by default" resolves.
const ANON_DEFAULT_RE = /^\s*export\s+default\s+(?:async\s+)?(?:function|class)?\s*(?:\(|\{|extends\b)/;
// A NAMED default declaration; `extends` is a keyword, not the class name.
const NAMED_DEFAULT_RE = /^\s*export\s+default\s+(?:async\s+)?(?:function|class)\s+(?!extends\b)[\w$]+/;

function stemOf(rel: string): string {
  return (rel.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
}

export const jsTs = {
  lang: "javascript/typescript",
  exts: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
  extract(rel: string, content: string): CodeSymbol[] {
    const lang = rel.match(/\.(ts|tsx|mts|cts)$/) ? "typescript" : "javascript";
    const symbols = scan(rel, content, lang, RULES);

    // Anonymous default export → a symbol named after the file stem.
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (ANON_DEFAULT_RE.test(line) && !NAMED_DEFAULT_RE.test(line)) {
        symbols.push({ name: stemOf(rel), kind: "default", file: rel, line: i + 1, signature: line.trim().slice(0, 200), exported: true, lang });
        break;
      }
    }

    // Export lists, CJS object exports, and `export default Identifier`.
    applyExportLists(content, symbols, rel, lang);
    return symbols;
  },
};

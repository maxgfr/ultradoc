import type { CodeSymbol } from "../types.js";

// A line-level extraction rule. `re` must capture the symbol name in a named
// group `name` (or capture group 1). One symbol is emitted per matching line
// (first rule wins), which keeps the heuristics cheap and predictable.
export interface Rule {
  re: RegExp;
  kind: string;
  exported?: boolean | ((m: RegExpExecArray, line: string) => boolean);
}

// Run a list of rules line-by-line over file content. Deterministic and
// zero-dep — no parser, no AST, no LLM. Good enough to locate declarations and
// rank them; ripgrep covers everything inside bodies.
export function scan(rel: string, content: string, lang: string, rules: Rule[]): CodeSymbol[] {
  const out: CodeSymbol[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    for (const rule of rules) {
      const m = rule.re.exec(line);
      if (!m) continue;
      const name = m.groups?.name ?? m[1];
      if (!name) continue;
      const exported = typeof rule.exported === "function" ? rule.exported(m, line) : (rule.exported ?? false);
      out.push({
        name,
        kind: rule.kind,
        file: rel,
        line: i + 1,
        signature: line.trim().slice(0, 200),
        exported,
        lang,
      });
      break;
    }
  }
  return out;
}

// A `export { … }` list, not followed by `from` (that's a re-export of another
// module's symbols, which don't live in this file). `[^}]` spans newlines, so a
// multi-line list is matched whole.
const EXPORT_LIST_RE = /export\s*\{([^}]*)\}\s*(from\b)?/g;
// A CommonJS object export: `module.exports = { a, b: impl }`.
const CJS_OBJECT_RE = /module\.exports\s*=\s*\{([^}]*)\}/g;
// A default re-export of an in-file binding: `export default Foo;`.
const DEFAULT_ID_RE = /(^|\n)\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*(?=\n|$)/g;

// Second pass over JS/TS content: mark symbols that are exported via an
// `export { … }` list or `module.exports = { … }` (which the line-anchored rules
// miss because the declaration and the export are on different lines), add alias
// symbols for `as` renames, and flag a default-exported identifier. Mutates the
// symbol list in place.
export function applyExportLists(content: string, symbols: CodeSymbol[], rel: string, lang: string): void {
  const byName = new Map<string, CodeSymbol>();
  for (const s of symbols) if (!byName.has(s.name)) byName.set(s.name, s);

  const markExported = (name: string): CodeSymbol | undefined => {
    const s = byName.get(name);
    if (s) s.exported = true;
    return s;
  };

  const handleList = (inner: string, cjs: boolean): void => {
    for (const raw of inner.split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const asMatch = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(part);
      if (asMatch) {
        const orig = asMatch[1]!;
        const alias = asMatch[2]!;
        if (orig === "default" || alias === "default") continue;
        const base = markExported(orig);
        if (base && !byName.has(alias)) {
          const clone: CodeSymbol = { ...base, name: alias, exported: true };
          symbols.push(clone);
          byName.set(alias, clone);
        }
        continue;
      }
      // `a` (ESM) or `a: impl` (CJS key). The export name is the key.
      const name = /^([\w$]+)/.exec(cjs ? part : part.split(":")[0]!.trim())?.[1];
      if (name && name !== "default") markExported(name);
    }
  };

  let m: RegExpExecArray | null;
  EXPORT_LIST_RE.lastIndex = 0;
  while ((m = EXPORT_LIST_RE.exec(content))) {
    if (m[2]) continue; // `export { … } from "…"` — a re-export, not local
    handleList(m[1] ?? "", false);
  }
  CJS_OBJECT_RE.lastIndex = 0;
  while ((m = CJS_OBJECT_RE.exec(content))) handleList(m[1] ?? "", true);

  DEFAULT_ID_RE.lastIndex = 0;
  while ((m = DEFAULT_ID_RE.exec(content))) {
    const name = m[2]!;
    if (!markExported(name)) {
      symbols.push({ name, kind: "default", file: rel, line: 1, signature: `export default ${name}`, exported: true, lang });
      byName.set(name, symbols[symbols.length - 1]!);
    }
  }
}

// The broad extension → language table (extToLang) that used to live here now
// comes from the vendored codeindex engine (identical entries) via registry.ts.

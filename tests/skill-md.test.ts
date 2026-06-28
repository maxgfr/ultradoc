import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { VERSION } from "../src/types.js";

// Guards that the published SKILL.md stays installable via `npx skills add`.
// The `skills` CLI discovers a skill by reading SKILL.md, extracting the
// frontmatter with this exact regex and `parse()`-ing it with `yaml`. If that
// parse throws — or name/description are missing — it SILENTLY drops the skill.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// The skill is packaged under skills/ultradoc/ (not at the repo root) so that
// `npx skills add` bundles the engine + references with the SKILL.md — a root
// SKILL.md would be installed alone. See scripts/verify-skill-bundle.mjs.
const SKILL_DIR = join(ROOT, "skills", "ultradoc");
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

describe("SKILL.md is installable by the `skills` CLI", () => {
  const raw = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
  const match = raw.match(FRONTMATTER_RE);
  const frontmatter = match?.[1] ?? "";

  it("has a frontmatter block", () => {
    expect(match).not.toBeNull();
    expect(frontmatter.length).toBeGreaterThan(0);
  });

  it("parses as YAML without throwing", () => {
    expect(() => parse(frontmatter)).not.toThrow();
  });

  it("exposes a non-empty name and description", () => {
    const data = parse(frontmatter) as Record<string, unknown>;
    expect(data.name).toBe("ultradoc");
    expect(typeof data.description).toBe("string");
    expect((data.description as string).length).toBeGreaterThan(0);
  });

  it("keeps version in lockstep across SKILL.md, package.json and src/types.ts", () => {
    const data = parse(frontmatter) as { metadata?: { version?: string } };
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
    expect(data.metadata?.version).toBe(pkg.version);
    expect(VERSION).toBe(pkg.version);
  });

  it("links the orchestration reference and it exists on disk", () => {
    const body = match?.[2] ?? "";
    expect(body).toContain("references/orchestration.md");
    expect(existsSync(join(SKILL_DIR, "references", "orchestration.md"))).toBe(true);
  });
});

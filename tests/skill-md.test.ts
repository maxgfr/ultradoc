import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { VERSION } from "../src/types.js";

// Matches scripts/verify-skill-bundle.mjs: Claude Code's skill matcher caps the
// description at 1024 chars; the repo guards a little under it.
const DESC_MAX = 1000;

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

  it("exposes a non-empty name and description under the length guard", () => {
    const data = parse(frontmatter) as Record<string, unknown>;
    expect(data.name).toBe("ultradoc");
    expect(typeof data.description).toBe("string");
    const desc = data.description as string;
    expect(desc.length).toBeGreaterThan(0);
    // Caught locally by `pnpm test` too, not only by verify:bundle in CI.
    expect(desc.length).toBeLessThanOrEqual(DESC_MAX);
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

  it("mentions every reference file, and every mentioned reference exists", () => {
    const body = match?.[2] ?? "";
    const refDir = join(SKILL_DIR, "references");
    const onDisk = readdirSync(refDir).filter((f) => f.endsWith(".md"));
    // Every shipped reference is pointed to (progressive disclosure), …
    for (const f of onDisk) expect(body).toContain(`references/${f}`);
    // … and every mentioned reference actually exists (no dangling pointer).
    const mentioned = [...body.matchAll(/references\/([\w-]+\.md)/g)].map((m) => m[1]!);
    for (const f of new Set(mentioned)) expect(existsSync(join(refDir, f))).toBe(true);
  });

  it("stays lean (progressive disclosure into references/)", () => {
    const body = match?.[2] ?? "";
    const words = body.split(/\s+/).filter(Boolean).length;
    // A soft structural guard against re-inflating what belongs in references/.
    // Raised from 2100, then 2500, as new engine surface landed — and LOWERED
    // to 2400 (from 2620) the first time the file got smaller: the "The script"
    // section was a prose mirror of `ultradoc --help`, so it paid tokens on
    // every load to say what one `--help` says better and drifted on every CLI
    // change. It became the "Route the ask" decision table, and the freed budget
    // bought guidance `--help` cannot give: budget tiers, the answer contract,
    // and the rationalization table. Flag detail belongs in `--help`, cost and
    // caps in references/tuning.md. Ratchet this DOWN, not up.
    expect(words).toBeLessThanOrEqual(2400);
  });

  it("keeps the load-bearing sections an agent routes with", () => {
    const body = match?.[2] ?? "";
    // Each of these answers a question the engine cannot: which command fits
    // this ask, how much effort it deserves, what the deliverable looks like,
    // and how to catch yourself answering from memory. Losing one silently
    // would regress the skill without failing any other gate.
    for (const heading of ["## Route the ask", "## Budget the run", "## The answer contract", "## Red flags"]) {
      expect(body).toContain(heading);
    }
    // The grounding gates are the whole point — they must stay spelled out.
    expect(body).toContain("check --strict");
    expect(body).toContain("check --semantic");
  });
});

import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Smoke test the REAL bundled engine as an external process — the exact file a
// user runs via `node scripts/ultradoc.mjs` (and the one shipped inside the
// skill). This catches bundle/wiring regressions that in-process tests against
// src/ can't see. Only offline-capable commands are spawned so it never touches
// the network.

const BUNDLE = resolve("scripts/ultradoc.mjs");
const LIB = resolve("tests/fixtures/sample-lib");
const tmp = mkdtempSync(join(tmpdir(), "ultradoc-subproc-"));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(join(LIB, ".ultradoc"), { recursive: true, force: true });
});

function cli(...args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [BUNDLE, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env },
  });
}

describe("bundled engine (subprocess)", () => {
  it("prints a semver version for --version", () => {
    const r = cli("--version");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it("prints usage for --help", () => {
    const r = cli("--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage:/);
    expect(r.stdout).toMatch(/\bask\b/);
  });

  it("exits 1 with a message on an unknown command", () => {
    const r = cli("frobnicate");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown command/);
  });

  it("runs `code` against a local fixture", () => {
    const r = cli("code", "--repo", LIB, "--q", "retry backoff");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("# Evidence dossier");
  });

  it("runs `index --json` against a local fixture", () => {
    const r = cli("index", "--repo", LIB, "--json");
    expect(r.status).toBe(0);
    const idx = JSON.parse(r.stdout);
    expect(idx.fileCount).toBeGreaterThan(0);
  });

  it("runs `overview` and writes the digest to --out", () => {
    const out = join(tmp, "OVERVIEW.md");
    const r = cli("overview", "--repo", LIB, "--out", out);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/overview/);
  });
});

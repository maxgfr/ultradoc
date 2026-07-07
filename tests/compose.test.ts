import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { COMPOSE_YAML, SEARXNG_SETTINGS_YAML, ensureComposeMaterialized } from "../src/index/compose.js";

const ROOT = resolve(__dirname, "..");

describe("embedded compose stays in sync with the repo files", () => {
  it("COMPOSE_YAML is byte-identical to docker-compose.yml", () => {
    expect(COMPOSE_YAML).toBe(readFileSync(join(ROOT, "docker-compose.yml"), "utf8"));
  });

  it("SEARXNG_SETTINGS_YAML is byte-identical to docker/searxng/settings.yml", () => {
    expect(SEARXNG_SETTINGS_YAML).toBe(readFileSync(join(ROOT, "docker", "searxng", "settings.yml"), "utf8"));
  });
});

describe("ensureComposeMaterialized", () => {
  let cache: string;
  const prev = process.env.ULTRADOC_CACHE_DIR;

  beforeEach(() => {
    cache = mkdtempSync(join(tmpdir(), "ud-compose-"));
    process.env.ULTRADOC_CACHE_DIR = cache;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.ULTRADOC_CACHE_DIR;
    else process.env.ULTRADOC_CACHE_DIR = prev;
    rmSync(cache, { recursive: true, force: true });
  });

  it("writes both files under the cache dir and returns the compose path", () => {
    const path = ensureComposeMaterialized();
    expect(path).toBe(join(cache, "compose", "docker-compose.yml"));
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(COMPOSE_YAML);
    const settings = join(cache, "compose", "docker", "searxng", "settings.yml");
    expect(readFileSync(settings, "utf8")).toBe(SEARXNG_SETTINGS_YAML);
  });

  it("is idempotent (a second call returns the same path)", () => {
    expect(ensureComposeMaterialized()).toBe(ensureComposeMaterialized());
  });
});

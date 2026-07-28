import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { COMPOSE_YAML, FIRECRAWL_ENV, SEARXNG_SETTINGS_YAML, ensureComposeMaterialized } from "../src/index/compose.js";

const ROOT = resolve(__dirname, "..");

describe("embedded compose stays in sync with the repo files", () => {
  it("COMPOSE_YAML is byte-identical to docker-compose.yml", () => {
    expect(COMPOSE_YAML).toBe(readFileSync(join(ROOT, "docker-compose.yml"), "utf8"));
  });

  it("SEARXNG_SETTINGS_YAML is byte-identical to docker/searxng/settings.yml", () => {
    expect(SEARXNG_SETTINGS_YAML).toBe(readFileSync(join(ROOT, "docker", "searxng", "settings.yml"), "utf8"));
  });

  it("FIRECRAWL_ENV is byte-identical to docker/firecrawl/firecrawl.env", () => {
    expect(FIRECRAWL_ENV).toBe(readFileSync(join(ROOT, "docker", "firecrawl", "firecrawl.env"), "utf8"));
  });

  // Firecrawl is five containers and ~3 GB of images. It belongs to the
  // `extract` profile alone — leaking it into `all` would make the cheap
  // `ultradoc semantic up` drag the whole extraction stack in.
  it("keeps firecrawl out of the `all` profile", () => {
    const firecrawlBlock = COMPOSE_YAML.slice(COMPOSE_YAML.indexOf("\n  firecrawl:"));
    expect(firecrawlBlock).toContain('profiles: ["extract"]');
    expect(firecrawlBlock).not.toContain('"all"');
    // …and the searxng/qdrant/ollama services keep theirs.
    expect(COMPOSE_YAML).toContain('profiles: ["semantic", "all"]');
    expect(COMPOSE_YAML).toContain('profiles: ["search", "all"]');
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

  // The compose file references it as `env_file: ./docker/firecrawl/firecrawl.env`
  // — a path relative to the compose file. Materializing the compose without it
  // makes `firecrawl up` fail before Docker is even reached.
  it("materializes the firecrawl env file beside the compose file", () => {
    ensureComposeMaterialized();
    const envFile = join(cache, "compose", "docker", "firecrawl", "firecrawl.env");
    expect(readFileSync(envFile, "utf8")).toBe(FIRECRAWL_ENV);
  });

  it("is idempotent (a second call returns the same path)", () => {
    expect(ensureComposeMaterialized()).toBe(ensureComposeMaterialized());
  });
});

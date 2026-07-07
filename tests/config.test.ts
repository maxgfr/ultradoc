import { afterEach, describe, expect, it } from "vitest";
import { envInt, envStr, LIMITS } from "../src/config.js";

const KEY = "ULTRADOC_TEST_ENV_KNOB";

afterEach(() => {
  delete process.env[KEY];
});

describe("envInt", () => {
  it("returns the default when unset", () => {
    expect(envInt(KEY, 42)).toBe(42);
  });
  it("parses a valid override", () => {
    process.env[KEY] = "128";
    expect(envInt(KEY, 42)).toBe(128);
  });
  it("falls back on a non-numeric or below-min value", () => {
    process.env[KEY] = "nope";
    expect(envInt(KEY, 42)).toBe(42);
    process.env[KEY] = "0";
    expect(envInt(KEY, 42, 1)).toBe(42);
  });
});

describe("envStr", () => {
  it("returns the default when unset or empty", () => {
    expect(envStr(KEY, "def")).toBe("def");
    process.env[KEY] = "   ";
    expect(envStr(KEY, "def")).toBe("def");
  });
  it("trims and returns an override", () => {
    process.env[KEY] = "  hello  ";
    expect(envStr(KEY, "def")).toBe("hello");
  });
});

describe("LIMITS", () => {
  it("exposes the documented defaults", () => {
    expect(LIMITS.maxFiles).toBe(20_000);
    expect(LIMITS.symbolsPerFile).toBe(400);
    expect(LIMITS.verifyPairs).toBe(40);
    expect(LIMITS.embedChunks).toBe(800);
  });
});

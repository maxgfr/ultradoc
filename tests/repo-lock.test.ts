import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withRepoLock, resetRepoLocks } from "../src/repo-lock.js";
import { writeFileAtomic } from "../src/util.js";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "ultradoc-lock-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  resetRepoLocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("withRepoLock", () => {
  it("serializes overlapping work on the same slug", async () => {
    const events: string[] = [];
    const task = (name: string) => async () => {
      events.push(`${name}:start`);
      await tick();
      events.push(`${name}:end`);
    };
    await Promise.all([withRepoLock("a", task("1")), withRepoLock("a", task("2")), withRepoLock("a", task("3"))]);
    // No interleaving: every start is immediately followed by its own end.
    expect(events).toEqual(["1:start", "1:end", "2:start", "2:end", "3:start", "3:end"]);
  });

  it("runs different slugs concurrently", async () => {
    const events: string[] = [];
    const task = (name: string) => async () => {
      events.push(`${name}:start`);
      await tick();
      events.push(`${name}:end`);
    };
    await Promise.all([withRepoLock("a", task("a")), withRepoLock("b", task("b"))]);
    // Both start before either finishes — the lock is per repo, not global.
    expect(events.slice(0, 2).sort()).toEqual(["a:start", "b:start"]);
  });

  it("does not let a rejected holder poison the queue behind it", async () => {
    const boom = withRepoLock("a", async () => {
      throw new Error("boom");
    });
    const after = withRepoLock("a", async () => "ok");
    await expect(boom).rejects.toThrow("boom");
    await expect(after).resolves.toBe("ok");
  });

  it("propagates the resolved value to the caller", async () => {
    await expect(withRepoLock("a", async () => 42)).resolves.toBe(42);
  });

  it("releases the slug once the queue drains", async () => {
    await withRepoLock("a", async () => undefined);
    await tick();
    // A fresh call must not queue behind a settled predecessor.
    let started = false;
    const p = withRepoLock("a", async () => {
      started = true;
    });
    await p;
    expect(started).toBe(true);
  });
});

describe("writeFileAtomic", () => {
  it("writes the file and leaves no temp behind", () => {
    const d = tmp();
    const p = join(d, "index.json");
    writeFileAtomic(p, '{"a":1}');
    expect(JSON.parse(readFileSync(p, "utf8"))).toEqual({ a: 1 });
    expect(readdirSync(d)).toEqual(["index.json"]);
  });

  it("a reader never sees a partial file across repeated overwrites", () => {
    const d = tmp();
    const p = join(d, "index.json");
    for (let i = 0; i < 50; i++) {
      writeFileAtomic(p, JSON.stringify({ i, pad: "x".repeat(4096) }));
      // Whatever is on disk always parses — the property a plain writeFileSync
      // cannot promise a concurrent reader.
      expect(JSON.parse(readFileSync(p, "utf8")).i).toBe(i);
    }
    expect(readdirSync(d)).toEqual(["index.json"]);
  });

  it("cleans up the temp file when the rename target is unwritable", () => {
    const d = tmp();
    // A directory at the destination makes renameSync fail after the temp write.
    const p = join(d, "sub");
    mkdirSync(join(p, "nested"), { recursive: true });
    expect(() => writeFileAtomic(p, "data")).toThrow();
    expect(existsSync(p)).toBe(true);
    expect(readdirSync(d)).toEqual(["sub"]);
  });
});

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverDocsRoot, discoverDocsUrl } from "../src/sources/doc-discovery.js";

describe("discoverDocsRoot", () => {
  it("finds the dominant in-repo docs folder", () => {
    expect(
      discoverDocsRoot(["README.md", "docs/a.md", "docs/b.md", "docs/c.md", "CONTRIBUTING.md"]),
    ).toBe("docs");
  });

  it("requires at least two doc files to call a folder a root", () => {
    expect(discoverDocsRoot(["README.md", "guide/intro.md"])).toBeUndefined();
    expect(discoverDocsRoot(["README.md"])).toBeUndefined();
  });

  it("recognizes a nested website/docs tree", () => {
    const root = discoverDocsRoot(["website/docs/a.md", "website/docs/b.md", "website/docs/c.md"]);
    expect(root === "website" || root === "website/docs").toBe(true);
  });
});

describe("discoverDocsUrl", () => {
  it("extracts a confident docs URL from the README", () => {
    const dir = mkdtempSync(join(tmpdir(), "ultradoc-disc-"));
    writeFileSync(
      join(dir, "README.md"),
      "# Proj\n\nSee the [documentation](https://proj.readthedocs.io/en/latest/) for details.\n",
    );
    writeFileSync(join(dir, "package.json"), JSON.stringify({ homepage: "https://example.com" }));
    expect(discoverDocsUrl(dir, ["README.md"], ["package.json"])).toBe(
      "https://proj.readthedocs.io/en/latest/",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses a package.json documentation field", () => {
    const dir = mkdtempSync(join(tmpdir(), "ultradoc-disc-"));
    writeFileSync(join(dir, "README.md"), "# Proj\nNothing useful here.");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ homepage: "https://foo.dev/docs/" }));
    expect(discoverDocsUrl(dir, ["README.md"], ["package.json"])).toBe("https://foo.dev/docs/");
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns nothing when no confident docs URL exists (avoids fetching a homepage)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ultradoc-disc-"));
    writeFileSync(join(dir, "README.md"), "# Proj\nA cool project. Visit https://example.com");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ homepage: "https://example.com" }));
    expect(discoverDocsUrl(dir, ["README.md"], ["package.json"])).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

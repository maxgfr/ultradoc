import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests clone/index real repos into /tmp/ultradoc and write evidence
    // dossiers there — never collect tests from those working trees.
    exclude: [...configDefaults.exclude, "**/.ultradoc/**", "tests/fixtures/**"],
    // Pins ULTRADOC_FIRECRAWL=off so a container running on :3002 can't change
    // what the suite exercises. See tests/setup.ts.
    setupFiles: ["tests/setup.ts"],
  },
});

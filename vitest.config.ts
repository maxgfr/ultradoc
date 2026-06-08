import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests clone/index real repos into /tmp/ultradoc and write evidence
    // dossiers there — never collect tests from those working trees.
    exclude: [...configDefaults.exclude, "**/.ultradoc/**", "tests/fixtures/**"],
  },
});

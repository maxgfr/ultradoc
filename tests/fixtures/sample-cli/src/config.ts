import { readFileSync } from "node:fs";

export interface CliSettings {
  verbose: boolean;
  outputDir: string;
}

// Read the settings file from disk and merge it over the defaults. A missing
// or unparsable file falls back to the defaults silently.
export function loadConfig(path: string): CliSettings {
  const defaults: CliSettings = { verbose: false, outputDir: "out" };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<CliSettings>;
    return { ...defaults, ...raw };
  } catch {
    return defaults;
  }
}

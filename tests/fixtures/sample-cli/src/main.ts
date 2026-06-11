import { loadConfig } from "./config.js";
import { onInterrupt } from "./signal.js";

// Entry point: parse flags, read the config, run. The config drives verbosity
// and the output directory; the config path comes from the first flag.
export function main(argv: string[]): number {
  const configPath = argv[0] ?? "cli.json";
  const config = loadConfig(configPath);
  onInterrupt(() => process.exit(130));
  if (config.verbose) console.log(`using config at ${configPath}`);
  console.log(`writing to ${config.outputDir}`);
  return 0;
}

#!/usr/bin/env node
// Install-bundle gate: prove the repo is shaped so that `npx skills add
// maxgfr/<name>` installs a WORKING skill — engine + references included, not
// just a lone SKILL.md.
//
// A skill is bundled predictably only when its SKILL.md lives in a
// SUBDIRECTORY (skills/<name>/), which is the layout every repo in this family
// targets. This script asserts that shape, that the embedded engine is
// byte-identical to the tested bundle, and that the docs and the CLI have not
// drifted apart.
//
// The drift half was missing here for a long time while a sibling had it: a
// SKILL.md could document a --flag the engine rejects, and every gate stayed
// green. The matchers come from the vendored webindex engine rather than a
// local copy, so the subtle cases (a bold flag, a parenthesised one, `--` glued
// to a word tail) cannot diverge between the two repos that use them.
//
// Run by CI and by `pnpm run verify:bundle`. No deps, no network.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { documentedFlags, missingFromHelp } from "../src/vendor/webindex-engine.mjs";

// Flags belonging to OTHER tools that the docs legitimately quote. Each entry
// names its owner, so the list stays an argued exception rather than a place to
// silence the gate.
//   docker compose  --profile --wait          container bring-up lines
//   npx             --prefer-offline          the pdf-inspector invocation
//   pdftotext       --layout                  the PDF ladder
//   anydoc          --format                  the office ladder
//   git             --depth --filter          the shallow blobless clone
//                   --refetch --unshallow     deepening it on demand
//   HF text-embeddings-inference  --model-id  the optional endpoint tier
const ALLOWED_FOREIGN_FLAGS = ["profile", "wait", "prefer-offline", "layout", "format", "depth", "filter", "refetch", "unshallow", "model-id"];

// Claude Code matches skill descriptions at <=1024 chars; 1000 leaves a safety
// margin so a future edit can't silently cross the cap.
const DESC_MAX = 1000;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const name = pkg.name;
const skillDir = join(root, "skills", name);
const errors = [];
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  errors.push(m);
  console.log(`  FAIL ${m}`);
};

// 1. No SKILL.md at the repo root (would make `skills add` install it alone).
existsSync(join(root, "SKILL.md"))
  ? bad("a SKILL.md exists at the repo ROOT — `skills add` would install it alone, dropping the engine. Move it to skills/" + name + "/SKILL.md")
  : ok("no root SKILL.md");

// 2. The packaged SKILL.md exists with valid, installable frontmatter.
const skillMd = join(skillDir, "SKILL.md");
if (!existsSync(skillMd)) {
  bad(`missing ${skillMd} — the skill package has no SKILL.md`);
} else {
  const raw = readFileSync(skillMd, "utf8");
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fm) bad("skills/" + name + "/SKILL.md has no frontmatter block");
  else {
    ok("packaged SKILL.md present with frontmatter");
    const nameLine = fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
    nameLine === name ? ok(`frontmatter name "${name}" matches package`) : bad(`frontmatter name "${nameLine}" != package name "${name}"`);
    const desc = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
    if (!desc) bad("frontmatter has no description");
    else {
      const len = desc.replace(/^["']|["']$/g, "").length;
      len <= DESC_MAX ? ok(`description ${len} chars (<= ${DESC_MAX} guard, under the 1024 matcher limit)`) : bad(`description ${len} chars exceeds the ${DESC_MAX}-char guard (1024 matcher limit)`);
    }
  }

  // 3. Every references/*.md mentioned exists, and every file is mentioned.
  const refsDir = join(skillDir, "references");
  if (existsSync(refsDir)) {
    const mentioned = new Set(raw.match(/references\/[a-z0-9-]+\.md/g) ?? []);
    for (const ref of mentioned) existsSync(join(skillDir, ref)) ? ok(`mentioned ${ref} exists`) : bad(`${ref} is mentioned in SKILL.md but missing from the package`);
    for (const f of readdirSync(refsDir).filter((f) => f.endsWith(".md"))) raw.includes(`references/${f}`) ? null : bad(`references/${f} exists but SKILL.md never mentions it`);
    ok(`references/ present (${readdirSync(refsDir).filter((f) => f.endsWith(".md")).length} playbooks)`);
  }
}

// 4. The embedded engine is byte-identical to the committed root bundle.
const engine = `scripts/${name}.mjs`;
const rootEngine = join(root, engine);
const pkgEngine = join(skillDir, engine);
if (!existsSync(rootEngine)) bad(`missing ${engine} at repo root — run \`pnpm run build\``);
else if (!existsSync(pkgEngine)) bad(`missing skills/${name}/${engine} — run \`node scripts/copy-bundle.mjs\``);
else readFileSync(rootEngine).equals(readFileSync(pkgEngine))
  ? ok(`embedded engine skills/${name}/${engine} is byte-identical to ${engine}`)
  : bad(`skills/${name}/${engine} differs from ${engine} — run \`node scripts/copy-bundle.mjs\` and commit`);

// 5. Docs <-> CLI. A documented flag the engine rejects is a doc bug, and the
// reader who tries it gets an error from an example that was meant to work.
// Read from the BUILT artifact rather than inferred from source: an earlier
// sibling recovered the flag surface by pattern-matching call sites, and the
// moment the CLI changed how it read flags the regex matched nothing, the set
// went empty, and every documented flag reported as drift at once.
if (existsSync(pkgEngine) && existsSync(skillMd)) {
  let cli = null;
  try {
    cli = await import(pathToFileURL(pkgEngine).href);
  } catch (e) {
    bad(`cannot import skills/${name}/${engine} for the drift gate: ${e.message}`);
  }
  if (cli && !(cli.HELP && cli.VALUE_FLAGS && cli.BOOL_FLAGS)) {
    bad("the bundle no longer exports HELP/VALUE_FLAGS/BOOL_FLAGS — the drift gate needs them");
    cli = null;
  }
  if (cli) {
    const universe = new Set([...cli.VALUE_FLAGS, ...cli.BOOL_FLAGS, "help", "version", "h", "v", ...ALLOWED_FOREIGN_FLAGS]);
    const refs = join(skillDir, "references");
    const docs = [
      ["SKILL.md", readFileSync(skillMd, "utf8")],
      ...(existsSync(refs)
        ? readdirSync(refs)
            .filter((f) => f.endsWith(".md"))
            .map((f) => [`references/${f}`, readFileSync(join(refs, f), "utf8")])
        : []),
    ];

    // A. docs subset of CLI.
    let unknown = 0;
    for (const [file, text] of docs) {
      for (const flag of documentedFlags(text)) {
        if (universe.has(flag)) continue;
        bad(`${file} documents unknown flag --${flag} (add it to ALLOWED_FOREIGN_FLAGS only if it belongs to another tool)`);
        unknown++;
      }
    }
    if (!unknown) ok(`every --flag documented across ${docs.length} skill file(s) exists in the CLI`);

    // B. CLI subset of --help. A flag the engine accepts but never advertises
    // is a flag nobody will use.
    const missing = missingFromHelp(cli.HELP, [...cli.VALUE_FLAGS, ...cli.BOOL_FLAGS]);
    missing.length === 0 ? ok("--help covers the whole flag surface") : bad(`--help omits: ${missing.map((f) => `--${f}`).join(", ")}`);

    // C. And every command, for the same reason: one stayed invisible for four
    // releases in a sibling because HELP and the dispatch table were never
    // compared. Named in --help is the test, not a usage line of its own.
    for (const cmd of cli.COMMANDS ?? []) {
      const named = new RegExp(`(^|[^\\w-])${cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w-]|$)`, "m").test(cli.HELP);
      if (!named) bad(`--help never names the \`${cmd}\` command`);
    }
    ok(`--help names all ${[...(cli.COMMANDS ?? [])].length} dispatched command(s)`);
  }
}

if (errors.length) {
  console.error(`\nverify-skill-bundle: ${errors.length} problem(s) — the published skill would not install correctly.`);
  process.exit(1);
}
console.log(`\nverify-skill-bundle: ok — skills/${name}/ installs as a complete skill.`);

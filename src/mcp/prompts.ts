import { TOOLS, WRITE_TOOLS } from "./tools.js";

// The workflows, as MCP prompts.
//
// Tools are the half of this skill a client can discover on its own. The other
// half is the protocol: retrieve BEFORE answering, cite every claim, name what
// the evidence did not settle, and let `check` fail you rather than talk past
// it. Inside Claude Code SKILL.md carries that. A prompt is how it reaches
// every other host — one `prompts/get` and the model has the sequence and the
// gate, instead of guessing which of ten tools to call first.
//
// Each prompt says three things, in this order: the contract, the exact tool
// sequence, and what the gate does on failure. Nothing here is a summary of
// SKILL.md — it is the operative subset, phrased for a model that has the
// tools in hand and nothing else.

export interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

// Thrown for an unknown prompt or a missing required argument — a client bug,
// which the server reports as a JSON-RPC error rather than as content.
export { PromptError } from "../engine.js";
import { PromptError } from "../engine.js";
export type { PromptDecl, PromptResult } from "../engine.js";
import type { PromptDecl, PromptResult } from "../engine.js";

const repoArg: { name: string; description?: string; required?: boolean } = {
  name: "repo",
  description: "The repository: a git URL, owner/repo, or an absolute local path.",
  required: true,
};

export const PROMPTS: PromptDecl[] = [
  {
    name: "answer_from_source",
    title: "Answer a question from a repo's real source",
    description:
      "The grounded-answer workflow: retrieve evidence from the repository, write an answer that cites every claim, and prove it with the citation gate. " +
      "Use for any precise question about a named open-source project.",
    arguments: [
      repoArg,
      { name: "question", description: "The precise question to answer.", required: true },
      { name: "package", description: "Scope to one workspace package of a monorepo.", required: false },
      { name: "ref", description: "Branch or tag to pin the answer to a version.", required: false },
    ],
  },
  {
    name: "document_project",
    title: "Write grounded reference documentation",
    description:
      "The reference-doc workflow: scaffold an outline, build one evidence dossier per section, write each section from its dossier, and validate the " +
      "whole document against the citation gate. Slow — expect minutes on a large repo.",
    arguments: [
      repoArg,
      { name: "package", description: "Document one workspace package instead of the whole repo.", required: false },
      { name: "ref", description: "Branch or tag to pin the documentation to a version.", required: false },
    ],
  },
];

export function getPrompt(name: string, args: Record<string, unknown> = {}): PromptResult {
  const decl = PROMPTS.find((p) => p.name === name);
  if (!decl) throw new PromptError(`unknown prompt: ${name || "(none given)"}`);

  for (const arg of decl.arguments ?? []) {
    if (arg.required && !str(args[arg.name])) throw new PromptError(`\`${arg.name}\` is required for prompt "${name}"`);
  }

  const text = name === "answer_from_source" ? answerFromSource(args) : documentProject(args);
  return { description: decl.description, messages: [{ role: "user", content: { type: "text", text } }] };
}

// The rule every workflow here rests on. Stated once, quoted into each prompt,
// so the two can never drift apart.
const CORE_RULE = `Do not answer from your own knowledge of this project. Your training data is stale and invents APIs that never existed. Answer ONLY from evidence retrieved by the ultradoc tools. If the evidence does not cover something, say so and retrieve more — never bridge the gap with a plausible sentence.`;

const GATE = `\`ultradoc_check\` returning \`ok: false\` is a VERDICT, not a tool failure. Read \`errors\` and \`dangling\`, fix the answer, and check again. Do not explain the failure away, and do not report an answer that has not passed.`;

function answerFromSource(args: Record<string, unknown>): string {
  const repo = str(args.repo)!;
  const question = str(args.question)!;
  const pkg = str(args.package);
  const ref = str(args.ref);
  const scope = [pkg ? `\`package: "${pkg}"\`` : "", ref ? `\`ref: "${ref}"\`` : ""].filter(Boolean).join(" and ");

  return `Answer this question about \`${repo}\` from its real source:

> ${question}

${CORE_RULE}

**Sequence:**

1. \`ultradoc_overview\` on \`${repo}\` — only if you do not already know how this repo is laid out. Navigation only: never cite it.
2. \`ultradoc_ask\` with the question above${scope ? `, passing ${scope}` : ""}. It writes an evidence dossier and returns its directory.
3. \`ultradoc_read\` the \`EVIDENCE.md\` in that directory. Read every item before writing anything.
4. Widen anything thin: \`ultradoc_symbol\` for "where is X used / who calls X", \`ultradoc_read\` with a line range to see more of a file, \`ultradoc_search\` with \`sources: ["web","so"]\` when the answer is genuinely not in the repo.
5. Write the answer, then validate it: \`ultradoc_check\` with \`run_dir\` from step 2, your answer as \`answer_text\`, and \`strict: true\`.

**The answer contract.** A lead line that answers the question — cited, \`strict\` counts it. Then one claim per sentence, each carrying the \`[E#]\` it rests on. Identifiers, defaults and values quoted verbatim from the excerpt, never paraphrased. Then a \`## Unknowns\` section naming what the evidence did not settle; that heading is exempt from the coverage gate, so an honest unknown never costs you a green run.

**Before you write a sentence, check it against these:** "I know this library, the dossier just confirms it" — then cite it; if no item says it, it does not go in. "Close enough to cite" — a shared keyword is not support; the bar is that the snippet names the symbol or the behaviour. "The issue says so" — a tracker describes a point in time; cross-check against current code. "The evidence is thin, I'll bridge the gap" — a gap is an explicit unknown, not a sentence.

${GATE}`;
}

function documentProject(args: Record<string, unknown>): string {
  const repo = str(args.repo)!;
  const pkg = str(args.package);
  const ref = str(args.ref);
  const scope = [pkg ? `\`package: "${pkg}"\`` : "", ref ? `\`ref: "${ref}"\`` : ""].filter(Boolean).join(" and ");

  return `Write grounded reference documentation for \`${repo}\`${pkg ? `, scoped to the \`${pkg}\` package` : ""}.

${CORE_RULE}

**Sequence:**

1. \`ultradoc_overview\` on \`${repo}\` — read how the project is actually organised before deciding what to document.
2. \`ultradoc_doc\`${scope ? ` with ${scope}` : ""}. SLOW: it builds one evidence dossier per outline section, so expect tens of seconds to minutes. It returns a scaffold directory containing the outline, a dossier per section, and a \`DOC.todo\` worklist.
3. \`ultradoc_read\` the worklist, then each section's \`EVIDENCE.md\` in turn.
4. Write \`DOC.md\` section by section, each claim citing the \`[E#]\` from THAT section's dossier. A section whose dossier came back thin gets a short honest section, not an invented one.
5. \`ultradoc_check\` with the scaffold's \`run_dir\`, \`answer_file: "DOC.md"\`, and \`strict: true\`.

**What reference documentation is here.** Every API name, signature, default and flag copied verbatim from the excerpt that shows it — never reconstructed from what the name suggests. Behaviour described as the code implements it, not as the README wishes it worked. Where the evidence is silent, the section says so rather than filling the space.

${GATE}`;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

// Every tool a prompt tells the model to call must actually be declared —
// otherwise a prompt survives a tool rename as a set of instructions that
// cannot be followed. Exported so the test can assert it rather than a human
// having to notice.
export function toolNamesReferencedBy(text: string): string[] {
  const declared = new Set([...TOOLS, ...WRITE_TOOLS].map((t) => t.name));
  const found = new Set<string>();
  for (const m of text.matchAll(/ultradoc_[a-z_]+/g)) {
    if (declared.has(m[0])) found.add(m[0]);
  }
  return [...found].sort();
}

export function unknownToolNamesIn(text: string): string[] {
  const declared = new Set([...TOOLS, ...WRITE_TOOLS].map((t) => t.name));
  const bad = new Set<string>();
  for (const m of text.matchAll(/ultradoc_[a-z_]+/g)) {
    if (!declared.has(m[0])) bad.add(m[0]);
  }
  return [...bad].sort();
}

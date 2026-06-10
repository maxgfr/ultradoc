import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceItem, SourceResult, DossierMeta, SourceKind } from "./types.js";
import { cacheRoot } from "./clone.js";

// Canonical ordering so evidence ids are stable and grouped predictably,
// regardless of which order the sources finished in.
const SOURCE_ORDER: SourceKind[] = [
  "code", "docs", "release", "history", "issue", "pr", "discussion", "so", "web",
];
const SOURCE_LABEL: Record<SourceKind, string> = {
  code: "Code",
  docs: "Documentation",
  release: "Releases & Changelog",
  history: "Git History",
  issue: "Issues",
  pr: "Pull / Merge Requests",
  discussion: "Discussions",
  so: "StackOverflow",
  web: "Web",
};

function rank(s: SourceKind): number {
  const i = SOURCE_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
}

// Two-digit zero pad for the readable run id.
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function runId(d: Date = new Date()): string {
  return (
    `run-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function defaultRunDir(slug: string, d?: Date): string {
  return join(cacheRoot(), slug, "runs", runId(d));
}

// Flatten all source results into one list and assign stable ids (E1, E2 …) in
// canonical source order, best-scored first within each source.
export function assignIds(results: SourceResult[]): EvidenceItem[] {
  const flat = results.flatMap((r) => r.items);
  flat.sort(
    (a, b) => rank(a.source) - rank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref),
  );
  return flat.map((it, i) => ({ id: `E${i + 1}`, ...it }));
}

// Render the model-facing evidence document. Every item carries an id the model
// must cite in ANSWER.md; `ultradoc check` later verifies those citations.
export function renderEvidenceMarkdown(
  evidence: EvidenceItem[],
  meta: DossierMeta,
): string {
  const out: string[] = [];
  out.push(`# Evidence dossier`);
  out.push("");
  out.push(`**Question:** ${meta.question}`);
  out.push(
    `**Repo:** ${meta.repo}${meta.commit ? ` @ ${meta.commit}` : ""}` +
      `${meta.ref ? ` (ref: ${meta.ref})` : ""} · **host:** ${meta.host}` +
      `${meta.pkg ? ` · **package:** ${meta.pkg}` : ""}`,
  );
  out.push(`**Sources:** ${meta.sources.join(", ")} · **semantic:** ${meta.semantic ? "on" : "off"} · **built:** ${meta.builtAt}`);
  out.push("");
  out.push(
    `> Ground every claim in the answer in this evidence. Cite items by id, e.g. \`[E1]\`. ` +
      `Do not assert anything you cannot tie to an item below. Write the answer to \`ANSWER.md\` in this folder, then run \`ultradoc check\`.`,
  );
  out.push("");

  if (evidence.length === 0) {
    out.push(`_No evidence was retrieved. Broaden the question, add sources, or check connectivity._`);
  }

  for (const source of SOURCE_ORDER) {
    const items = evidence.filter((e) => e.source === source);
    if (items.length === 0) continue;
    out.push(`## ${SOURCE_LABEL[source]}`);
    out.push("");
    for (const it of items) {
      out.push(`### [${it.id}] ${it.title}`);
      const meta1 = [
        `ref: \`${it.ref}\``,
        it.location ? `loc: \`${it.location}\`` : "",
        `score: ${it.score}`,
      ]
        .filter(Boolean)
        .join(" · ");
      out.push(meta1);
      if (it.url) out.push(`url: ${it.url}`);
      out.push("");
      out.push("```");
      out.push(it.snippet);
      out.push("```");
      out.push("");
    }
  }

  if (meta.notes.length) {
    out.push(`## Retrieval notes`);
    out.push("");
    for (const n of meta.notes) out.push(`- ${n}`);
    out.push("");
  }
  return out.join("\n");
}

export interface DossierPaths {
  dir: string;
  evidenceJson: string;
  evidenceMd: string;
  metaJson: string;
}

// Persist a run: evidence.json (machine-readable, what `check` validates),
// EVIDENCE.md (model-readable), and meta.json. Returns the written paths.
export function writeDossier(dir: string, evidence: EvidenceItem[], meta: DossierMeta): DossierPaths {
  mkdirSync(dir, { recursive: true });
  const evidenceJson = join(dir, "evidence.json");
  const evidenceMd = join(dir, "EVIDENCE.md");
  const metaJson = join(dir, "meta.json");
  writeFileSync(evidenceJson, JSON.stringify(evidence, null, 2));
  writeFileSync(evidenceMd, renderEvidenceMarkdown(evidence, meta));
  writeFileSync(metaJson, JSON.stringify(meta, null, 2));
  return { dir, evidenceJson, evidenceMd, metaJson };
}

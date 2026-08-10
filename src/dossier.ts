import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceItem, SourceResult, DossierMeta, SourceKind } from "./types.js";
import { indexDir } from "./index/structural.js";

// Canonical ordering so evidence ids are stable and grouped predictably,
// regardless of which order the sources finished in.
export const SOURCE_ORDER: SourceKind[] = ["code", "docs", "release", "history", "issue", "pr", "discussion", "so", "web"];
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

// The readable run id is the engine's as of v1.15.0 — three repos had the same
// timestamp format, which for a shared on-disk convention is exactly the thing
// that must not be written twice.
export { runId } from "./engine.js";
import { runId } from "./engine.js";

// Persist runs beside the clone under <repoDir>/.ultradoc/runs/<id> — the same
// stable, commit-pinned data home as the index and OVERVIEW.md — so a repo's
// dossiers and answers survive as a reusable markdown knowledge base instead of
// scattering under ephemeral /tmp run ids.
export function defaultRunDir(repoDir: string, d?: Date): string {
  return join(indexDir(repoDir), "runs", runId(d));
}

// Flatten all source results into one list and assign stable ids (E1, E2 …) in
// canonical source order, best-scored first within each source.
export function assignIds(results: SourceResult[]): EvidenceItem[] {
  const flat = results.flatMap((r) => r.items);
  flat.sort((a, b) => rank(a.source) - rank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref));
  return flat.map((it, i) => ({ id: `E${i + 1}`, ...it }));
}

// Render the model-facing evidence document. Every item carries an id the model
// must cite in ANSWER.md; `ultradoc check` later verifies those citations.
/**
 * Render the dossier.
 *
 * `persisted` decides which instruction the header carries, and it is not
 * cosmetic. A drill (`symbol`, `code`, `issues`, …) prints a dossier with its
 * OWN `[E1] [E2] …` numbering and writes nothing; telling the reader to "write
 * the answer to ANSWER.md in this folder" then names a folder that does not
 * exist, and the natural repair — writing it into the `ask` run instead —
 * carries the drill's ids into a file where the same ids mean different items.
 * `check` cannot catch that: every citation still RESOLVES, it just resolves to
 * the wrong excerpt, and the run comes back green.
 */
export function renderEvidenceMarkdown(evidence: EvidenceItem[], meta: DossierMeta, persisted = true): string {
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
    persisted
      ? `> Ground every claim in the answer in this evidence. Cite items by id, e.g. \`[E1]\`. ` +
          `Do not assert anything you cannot tie to an item below. Write the answer to \`ANSWER.md\` in this folder, then run \`ultradoc check\`.`
      : `> Read this to decide what to retrieve next. NOTHING WAS WRITTEN, and these ` +
          `\`[E#]\` ids are local to this drill — they are NOT the ids of any run, so ` +
          `citing them in an existing \`ANSWER.md\` would point at different evidence. ` +
          `To cite what you see here, re-run with \`--out <dir>\` (or fold it into a run with \`ask\`) ` +
          `and cite the ids from THAT dossier.`,
  );
  out.push("");

  // Notes come BEFORE the evidence, not after it: they say what this retrieval
  // could not reach (a capped index, a regex-tier symbol scan, a rate-limited
  // provider, a sliced call-site list), and that qualifies every item below. At
  // the bottom they were read last, or not at all — after the claims they
  // should have constrained were already written.
  if (meta.notes.length) {
    out.push(`## Retrieval notes`);
    out.push("");
    out.push(`_What this run could not reach — read these before the evidence; they bound what you may claim._`);
    out.push("");
    for (const n of meta.notes) out.push(`- ${n}`);
    out.push("");
  }

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
      const meta1 = [`ref: \`${it.ref}\``, it.location ? `loc: \`${it.location}\`` : "", `score: ${it.score}`].filter(Boolean).join(" · ");
      out.push(meta1);
      if (it.url) out.push(`url: ${it.url}`);
      out.push("");
      out.push("```");
      out.push(it.snippet);
      out.push("```");
      out.push("");
    }
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

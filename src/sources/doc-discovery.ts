import { join } from "node:path";
import { readText } from "../walk.js";

// Discover, from the repo's own files, (a) the canonical in-repo documentation
// folder and (b) the official external docs URL. Deterministic, no LLM, no
// network — computed once at index time and cached in the StructuralIndex so it
// costs nothing per question.

const DOC_DIR = /(^|\/)(docs?|documentation|website|guides?|book|manual|handbook|reference)$/i;

// The in-repo docs root = the directory (1 or 2 levels deep) that holds the most
// documentation files and whose name looks like a docs folder. Used to boost
// docs retrieval toward the real documentation tree.
export function discoverDocsRoot(docFiles: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const rel of docFiles) {
    const parts = rel.split("/");
    for (const depth of [1, 2]) {
      if (parts.length <= depth) continue;
      const dir = parts.slice(0, depth).join("/");
      if (DOC_DIR.test(dir)) counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  let bestN = 1; // require at least 2 doc files to call it a "root"
  for (const [k, v] of counts) {
    if (v > bestN || (v === bestN && best && k.length < best.length)) {
      best = k;
      bestN = v;
    }
  }
  return best;
}

const KNOWN_DOC_HOST = /readthedocs\.(io|org)|\.gitbook\.io|mintlify|docusaurus|\.readme\.io/i;
const HOSTED = /\.github\.io|\.netlify\.app|\.vercel\.app|\.pages\.dev/i;
const DOC_SUBDOMAIN = /^https?:\/\/docs?\./i;
const DOC_PATH = /(^|\/)(docs?|documentation|guide|guides|manual|handbook|reference|learn)(\/|$|#|\?)/i;
const URL_RE = /https?:\/\/[^\s)"'<>`\]]+/g;

// Score a URL's "doc-likeness". A high threshold means we only auto-fetch when
// we're confident it's actually documentation (not a marketing homepage).
function scoreDocUrl(url: string, context: string): number {
  let s = 0;
  if (DOC_SUBDOMAIN.test(url)) s += 5;
  if (KNOWN_DOC_HOST.test(url)) s += 5;
  if (DOC_PATH.test(url)) s += 3;
  if (HOSTED.test(url) && DOC_PATH.test(url)) s += 1;
  if (/\b(documentation|docs|guide|manual|reference|api docs)\b/i.test(context)) s += 2;
  // Prefer the docs root over a deep sub-page (a single fetched overview page is
  // more broadly useful than one specific guide). Only penalize genuinely deep
  // paths so a shallow ".../docs/" is unaffected.
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "");
  const depth = (path.match(/\//g) ?? []).length;
  if (depth >= 3) s -= Math.min(2, (depth - 2) * 0.5);
  return s;
}

function clean(url: string): string {
  return url.replace(/[.,;]+$/, "").replace(/\)+$/, "");
}

// Pull candidate doc URLs from README prose (markdown links + bare URLs, scored
// with their surrounding text as context) and from manifest metadata fields.
export function discoverDocsUrl(repoDir: string, docFiles: string[], configFiles: string[], projectNames: string[] = []): string | undefined {
  const candidates: { url: string; score: number }[] = [];
  // Prefer URLs that belong to THIS project (its repo/owner name appears in the
  // host or path) — a README often links to dependencies' docs too, and we must
  // not pick those (e.g. fastapi's README links pydantic's docs).
  const names = projectNames.filter((n) => n && n.length >= 3).map((n) => n.toLowerCase());
  const related = (url: string) => names.some((n) => url.toLowerCase().includes(n));
  // `bonus` rewards curated metadata (manifest fields) over prose links, since
  // an explicit `documentation` field is the authoritative signal.
  const add = (url: string, context: string, bonus = 0) => {
    const u = clean(url);
    if (!/^https?:\/\//.test(u)) return;
    candidates.push({ url: u, score: scoreDocUrl(u, context) + bonus + (related(u) ? 3 : 0) });
  };

  // README: markdown links [text](url) carry the best context; also bare URLs.
  const readme = docFiles.find((f) => /^readme(\.|$)/i.test(f)) ?? docFiles.find((f) => /(^|\/)readme\./i.test(f));
  if (readme) {
    const text = readText(join(repoDir, readme)).slice(0, 40_000);
    let m: RegExpExecArray | null;
    const link = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
    while ((m = link.exec(text))) add(m[2]!, m[1]!);
    for (const line of text.split("\n")) {
      if (!/\b(doc|documentation|guide|manual|reference)\b/i.test(line)) continue;
      const urls = line.match(URL_RE);
      if (urls) for (const u of urls) add(u, line);
    }
  }

  // Manifests: explicit documentation fields are high-confidence.
  for (const cfg of configFiles) {
    const base = cfg.split("/").pop()!.toLowerCase();
    const text = readText(join(repoDir, cfg));
    if (!text) continue;
    if (base === "package.json" || base === "composer.json") {
      try {
        const j = JSON.parse(text);
        if (typeof j.homepage === "string") add(j.homepage, "homepage", 1);
        // An explicit documentation field is authoritative for the project.
        if (typeof j.documentation === "string") add(j.documentation, "documentation", 8);
        const docs = j.support?.docs ?? j.support?.documentation;
        if (typeof docs === "string") add(docs, "documentation", 8);
      } catch {
        /* ignore */
      }
    } else if (base === "pyproject.toml" || base === "setup.cfg") {
      const m = /^\s*Documentation\s*=\s*["']?(https?:\/\/[^"'\s]+)/im.exec(text);
      if (m) add(m[1]!, "documentation", 8);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  // Only return a confidently-documentation URL — avoids auto-fetching a random
  // homepage on every run.
  return best && best.score >= 4 ? best.url : undefined;
}

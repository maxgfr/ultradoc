import { applyCentrality, buildArtifactsFromScan, computeTestMap, renderMermaid, type Graph } from "../vendor/codeindex-engine.mjs";
import { repoScan } from "./scan.js";

// The repo's module graph, ranked by how central each module actually is.
//
// Counting files per directory says how BIG a part of the tree is, not how much
// it matters. PageRank over the import graph says which modules the rest of the
// codebase depends on — on hono that surfaces `src`, `src/utils`, `src/jsx`;
// on matomo `core`, `core/Plugin`, `core/Tracker`. That is where a question is
// usually answered, and which subsystems a generated doc should have sections
// for.
//
// Used for NAVIGATION and for shaping outlines — never as citable evidence. An
// answer still has to cite a dossier.

export interface RankedModule {
  slug: string;
  path: string;
  title: string;
  summary: string;
  symbols: number;
  pagerank: number;
  /** Test files the graph ties to this module. */
  tests: string[];
}

// Modules that exist but are not what the project IS: tests, fixtures, examples,
// benchmarks, and the docs/website trees. Ranked out rather than deleted — they
// are still searchable, they just must not headline the map.
const NOISE_DIR = /(^|\/)(tests?|__tests__|specs?|fixtures?|examples?|benchmarks?|e2e|docs?|website|site)(\/|$)/i;

// Module summaries come from the file's leading doc comment, so JSDoc markup
// rides along: `@module Hono - Web Framework @example ```ts import …`. Keep the
// prose, drop the tags and everything from the first block tag or code fence.
export function cleanSummary(raw: string): string {
  return raw
    .replace(/^\s*@(module|description|fileoverview|file)\s+/i, "")
    .split(/\s@(?:example|param|returns?|see|throws|template|typedef)\b|```/)[0]!
    .replace(/\s+/g, " ")
    .trim();
}

export function rankModules(graph: Graph, limit: number): RankedModule[] {
  const tests = computeTestMap(graph);
  return (
    graph.modules
      // A module with no symbols has nothing to say about the code. On express
      // the highest-pagerank module is the repo root (every doc link points at
      // it) with zero symbols, which would headline the map with nothing.
      .filter((m) => m.symbols > 0 && !NOISE_DIR.test(m.path))
      .sort((a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0) || a.path.localeCompare(b.path))
      .slice(0, limit)
      .map((m) => ({
        slug: m.slug,
        path: m.path,
        title: m.title,
        summary: cleanSummary(m.summary),
        symbols: m.symbols,
        pagerank: m.pagerank ?? 0,
        tests: tests.testedByModule.get(m.slug) ?? [],
      }))
  );
}

export interface RepoGraph {
  graph: Graph;
  modules: (limit: number) => RankedModule[];
  mermaid: (maxEdges?: number) => string;
}

// Build the graph for a working tree. Reuses the memoised scan, so a command
// that already indexed pays nothing extra.
export function repoGraph(repoDir: string): RepoGraph {
  const { graph } = buildArtifactsFromScan(repoScan(repoDir));
  applyCentrality(graph);
  return {
    graph,
    modules: (limit: number) => rankModules(graph, limit),
    mermaid: (maxEdges = 60) => renderMermaid(graph, { maxEdges }),
  };
}

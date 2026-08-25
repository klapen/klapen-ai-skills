import * as d3 from "d3";
import type { CodeEdge, CodeNode, RepositoryData } from "../shared/types";

const SYMBOL_KINDS = new Set(["class", "interface", "function", "method"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".py", ".tsx", ".jsx", ".mjs"]);

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rb", ".java", ".kt", ".kts", ".swift", ".rs",
  ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".php", ".scala", ".sh", ".bash", ".zsh", ".sql", ".graphql",
  ".gql", ".proto", ".vue", ".svelte", ".lua", ".pl", ".r", ".m", ".dart",
]);
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".rst", ".txt", ".adoc", ".textile", ".markdown"]);
const DOC_BASENAMES = new Set(["license", "readme", "changelog", "contributing", "authors", "notice", "codeowners"]);

export type FileCategory = "code" | "docs" | "assets";

export function categoryOf(name: string, ext: string): FileCategory {
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (DOC_EXTENSIONS.has(ext)) return "docs";
  const base = name.replace(/\.[^.]+$/, "").toLowerCase();
  if (ext === "(none)" && DOC_BASENAMES.has(base)) return "docs";
  return "assets";
}

export interface HiddenCouplingPair {
  a: CodeNode;
  b: CodeNode;
  weight: number;
  confidence: number;
}

export interface GroupStat {
  key: string;
  files: number;
  loc: number;
  churn: number;
}

export interface ExtensionStat {
  key: string;
  files: number;
  loc: number;
}

export interface CategoryStat {
  key: FileCategory;
  files: number;
  loc: number;
}

export interface DerivedFacts {
  byId: Map<string, CodeNode>;
  files: CodeNode[];
  symbols: CodeNode[];
  symsByFile: Map<string, CodeNode[]>;
  imports: CodeEdge[];
  cochange: CodeEdge[];
  cycleNodes: Set<string>;
  cyclePairs: Set<string>;
  sourceFiles: CodeNode[];
  tests: CodeNode[];
  loc: number;
  groups: string[];
  byGroup: GroupStat[];
  byExt: ExtensionStat[];
  byCategory: CategoryStat[];
  hubs: CodeNode[];
  spokes: CodeNode[];
  risky: CodeNode[];
  churned: CodeNode[];
  recent: CodeNode[];
  connected: Set<string>;
  orphans: CodeNode[];
  hidden: HiddenCouplingPair[];
  symKinds: Array<{ kind: string; count: number }>;
  complexSyms: CodeNode[];
  maxDepth: number;
  biggest: CodeNode | undefined;
}

export function groupOf(relativePath: string | undefined): string {
  const segments = (relativePath ?? "").split("/");
  return segments.length > 1 ? segments.slice(0, 2).join("/") : "(root)";
}

export function extOf(relativePath: string | undefined): string {
  const base = (relativePath ?? "").split("/").pop() ?? "";
  return base.includes(".") ? `.${base.split(".").pop()}` : "(none)";
}

/** Shared by the initial (whole-repo) render and the client-side category filter on the Composition section. */
export function groupAndExtStats(files: CodeNode[]): { byGroup: GroupStat[]; byExt: ExtensionStat[] } {
  const byGroup: GroupStat[] = Array.from(
    d3.rollup(
      files,
      (v) => ({ files: v.length, loc: d3.sum(v, (f) => f.loc ?? 0), churn: d3.sum(v, (f) => f.churn ?? 0) }),
      (f) => groupOf(f.relativePath)
    ),
    ([key, v]) => ({ key, ...v })
  ).sort((a, b) => b.loc - a.loc);

  const byExt: ExtensionStat[] = Array.from(
    d3.rollup(files, (v) => ({ files: v.length, loc: d3.sum(v, (f) => f.loc ?? 0) }), (f) => extOf(f.relativePath)),
    ([key, v]) => ({ key, ...v })
  ).sort((a, b) => b.loc - a.loc);

  return { byGroup, byExt };
}

export function deriveFacts(data: RepositoryData): DerivedFacts {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const files = data.nodes.filter((n) => n.kind === "file");
  const symbols = data.nodes.filter((n) => SYMBOL_KINDS.has(n.kind));
  const symsByFile = d3.group(symbols, (s) => s.parentId ?? "");
  const imports = data.edges.filter((e) => e.type === "import");
  const cochange = data.edges.filter((e) => e.type === "co-change");
  const importKey = new Set(imports.map((e) => `${e.source}|${e.target}`));

  const cycleNodes = new Set<string>();
  const cyclePairs = new Set<string>();
  for (const cycle of data.cycles ?? []) {
    for (const a of cycle.nodeIds) {
      cycleNodes.add(a);
      for (const b of cycle.nodeIds) {
        if (a !== b) cyclePairs.add(`${a}|${b}`);
      }
    }
  }

  const groupCounts = d3.rollup(files, (v) => v.length, (f) => groupOf(f.relativePath));
  const groups = Array.from(groupCounts)
    .sort((a, b) => b[1] - a[1])
    .map((d) => d[0]);

  const sourceFiles = files.filter((f) => SOURCE_EXTENSIONS.has(extOf(f.relativePath)));
  const tests = files.filter((f) => f.isTest);
  const loc = d3.sum(files, (f) => f.loc ?? 0);

  const { byGroup, byExt } = groupAndExtStats(files);

  const categoryCounts = d3.rollup(
    files,
    (v) => ({ files: v.length, loc: d3.sum(v, (f) => f.loc ?? 0) }),
    (f) => categoryOf(f.name, extOf(f.relativePath))
  );
  const byCategory: CategoryStat[] = (["code", "docs", "assets"] as const).map((key) => ({
    key,
    files: categoryCounts.get(key)?.files ?? 0,
    loc: categoryCounts.get(key)?.loc ?? 0,
  }));

  const hubs = files.filter((f) => (f.fanIn ?? 0) > 0).sort((a, b) => (b.fanIn ?? 0) - (a.fanIn ?? 0));
  const spokes = files.filter((f) => (f.fanOut ?? 0) > 0).sort((a, b) => (b.fanOut ?? 0) - (a.fanOut ?? 0));
  const risky = files.filter((f) => (f.riskScore ?? 0) > 0).sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));
  const churned = files.filter((f) => (f.churn ?? 0) > 0).sort((a, b) => (b.churn ?? 0) - (a.churn ?? 0));
  const recent = files
    .filter((f) => f.lastModified)
    .sort((a, b) => d3.descending(a.lastModified, b.lastModified));

  const connected = new Set<string>();
  for (const e of imports) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const orphans = sourceFiles.filter((f) => !connected.has(f.id));

  const hidden: HiddenCouplingPair[] = cochange
    .filter((e) => !importKey.has(`${e.source}|${e.target}`) && !importKey.has(`${e.target}|${e.source}`))
    .map((e) => ({ a: byId.get(e.source), b: byId.get(e.target), weight: e.weight, confidence: e.confidence ?? 0 }))
    .filter((d): d is HiddenCouplingPair => Boolean(d.a && d.b))
    .sort((a, b) => b.weight - a.weight);

  const symKinds = Array.from(d3.rollup(symbols, (v) => v.length, (s) => s.kind), ([kind, count]) => ({
    kind,
    count,
  })).sort((a, b) => b.count - a.count);

  const complexSyms = symbols
    .slice()
    .sort((a, b) => (b.complexity ?? 0) - (a.complexity ?? 0))
    .slice(0, 10);

  const maxDepth = d3.max(files, (f) => (f.relativePath ?? "").split("/").length) ?? 1;
  const biggest = files.slice().sort((a, b) => (b.loc ?? 0) - (a.loc ?? 0))[0];

  return {
    byId,
    files,
    symbols,
    symsByFile,
    imports,
    cochange,
    cycleNodes,
    cyclePairs,
    sourceFiles,
    tests,
    loc,
    groups,
    byGroup,
    byExt,
    byCategory,
    hubs,
    spokes,
    risky,
    churned,
    recent,
    connected,
    orphans,
    hidden,
    symKinds,
    complexSyms,
    maxDepth,
    biggest,
  };
}

import * as d3 from "d3";
import type { RepositoryData, CodeNode, CodeEdge } from "../shared/types";

const SYMBOL_KINDS = new Set(["class", "interface", "function", "method"]);
const PALETTE = [
  "#63b3ff", "#8b7bff", "#3fb9a8", "#e6b450", "#ff8b6b",
  "#c46bd8", "#6ec28f", "#d88f6b", "#5f8ad4", "#9aa3af",
];

export interface Derived {
  byId: Map<string, CodeNode>;
  files: CodeNode[];
  symbols: CodeNode[];
  symsByFile: Map<string, CodeNode[]>;
  imports: CodeEdge[];
  cochange: CodeEdge[];
  cycleNodes: Set<string>;
  cyclePairs: Set<string>;
  groups: string[];
  color: (group: string) => string;
  riskColor: (risk: number) => string;
  maxRisk: number;
}

export function groupOf(relativePath: string | undefined): string {
  const segments = (relativePath ?? "").split("/");
  return segments.length > 1 ? segments.slice(0, 2).join("/") : "(root)";
}

export function extOf(relativePath: string | undefined): string {
  const base = (relativePath ?? "").split("/").pop() ?? "";
  return base.includes(".") ? `.${base.split(".").pop()}` : "(none)";
}

export function deriveContext(data: RepositoryData): Derived {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const files = data.nodes.filter((n) => n.kind === "file");
  const symbols = data.nodes.filter((n) => SYMBOL_KINDS.has(n.kind));
  const symsByFile = new Map<string, CodeNode[]>();
  for (const s of symbols) {
    if (!s.parentId) continue;
    const arr = symsByFile.get(s.parentId) ?? [];
    arr.push(s);
    symsByFile.set(s.parentId, arr);
  }
  const imports = data.edges.filter((e) => e.type === "import");
  const cochange = data.edges.filter((e) => e.type === "co-change");

  const cycleNodes = new Set<string>();
  const cyclePairs = new Set<string>();
  for (const cycle of data.cycles) {
    for (const a of cycle.nodeIds) {
      cycleNodes.add(a);
      for (const b of cycle.nodeIds) if (a !== b) cyclePairs.add(`${a}|${b}`);
    }
  }

  const groupCounts = d3.rollup(
    files,
    (v) => v.length,
    (f) => groupOf(f.relativePath)
  );
  const groups = Array.from(groupCounts)
    .sort((a, b) => b[1] - a[1])
    .map((d) => d[0]);
  const colorScale = d3
    .scaleOrdinal<string, string>()
    .domain(groups)
    .range(groups.map((_g, i) => PALETTE[i] ?? "#4b535e"))
    .unknown("#4b535e");

  const maxRisk = d3.max(files, (f) => f.riskScore ?? 0) ?? 1;
  const riskScale = d3
    .scaleSequential(d3.interpolateRgbBasis(["#39424f", "#63b3ff", "#e6b450", "#ff6b6b"]))
    .domain([0, Math.max(1, maxRisk)]);

  return {
    byId,
    files,
    symbols,
    symsByFile,
    imports,
    cochange,
    cycleNodes,
    cyclePairs,
    groups,
    color: (g: string) => colorScale(g),
    riskColor: (r: number) => riskScale(r),
    maxRisk,
  };
}

export const fmt = d3.format(",");

export function trunc(value: string | undefined, max: number): string {
  const s = value ?? "";
  return s.length > max ? `…${s.slice(-(max - 1))}` : s;
}

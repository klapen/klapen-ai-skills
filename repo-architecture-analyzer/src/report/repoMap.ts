import * as d3 from "d3";
import type { RepositoryData, CodeNode } from "../shared/types";
import { AppState, matchesFilters } from "./state";

export interface RepoMapHandle {
  setLayout(layout: "icicle" | "treemap"): void;
  setMetric(metric: "loc" | "riskScore" | "complexity" | "churn"): void;
}

const STRUCTURAL_KINDS = new Set(["repository", "folder", "file"]);

function buildHierarchy(data: RepositoryData): d3.HierarchyNode<CodeNode> {
  const childrenById = new Map<string, CodeNode[]>();
  for (const node of data.nodes) {
    if (!STRUCTURAL_KINDS.has(node.kind) || !node.parentId) continue;
    const siblings = childrenById.get(node.parentId) ?? [];
    siblings.push(node);
    childrenById.set(node.parentId, siblings);
  }

  const root = data.nodes.find((n) => n.kind === "repository");
  if (!root) throw new Error("RepositoryData has no repository root node");
  return d3.hierarchy(root, (n) => childrenById.get(n.id) ?? []);
}

function riskColor(node: CodeNode): string {
  const risk = node.riskScore ?? 0;
  if (risk >= 60) return "var(--rk-bad, #e06c75)";
  if (risk >= 30) return "var(--rk-warn, #d19a66)";
  return "var(--rk-ok, #98c379)";
}

export function renderRepoMap(container: HTMLElement, data: RepositoryData, state: AppState): RepoMapHandle {
  const width = 760;
  const height = 420;
  let layout: "icicle" | "treemap" = "icicle";
  let metric: "loc" | "riskScore" | "complexity" | "churn" = "loc";

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "rk-repomap-svg");
  const g = svg.append("g");

  function render(): void {
    const root = buildHierarchy(data);
    root.sum((d) => (d.kind === "file" ? Math.max(1, (d as unknown as Record<string, number>)[metric] ?? 0) : 0));

    const laidOut =
      layout === "treemap"
        ? d3.treemap<CodeNode>().size([width, height]).paddingInner(1)(root)
        : d3.partition<CodeNode>().size([width, height])(root);

    const visibleNodes = laidOut
      .descendants()
      .filter((d): d is d3.HierarchyRectangularNode<CodeNode> => d.data.kind === "file" && matchesFilters(d.data, state.filters));

    const cells = g
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<CodeNode>>("g.rk-cell")
      .data(visibleNodes, (d) => d.data.id);
    cells.exit().remove();

    const entered = cells.enter().append("g").attr("class", "rk-cell");
    entered.append("rect");
    entered.append("title");

    const merged = entered.merge(cells);
    merged.attr("transform", (d) => `translate(${d.x0},${d.y0})`);
    merged
      .select("rect")
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0))
      .style("fill", (d) => riskColor(d.data))
      .style("stroke", "var(--rk-deep, #1e1e2e)")
      .on("click", (_event, d) => state.select(d.data.id));
    merged.select("title").text((d) => `${d.data.relativePath} (${metric}: ${d.value ?? 0})`);
  }

  render();
  state.subscribe(render);

  return {
    setLayout(next) {
      layout = next;
      render();
    },
    setMetric(next) {
      metric = next;
      render();
    },
  };
}

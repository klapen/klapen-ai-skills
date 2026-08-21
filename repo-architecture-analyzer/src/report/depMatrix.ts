import * as d3 from "d3";
import type { RepositoryData, CodeNode, CodeEdge } from "../shared/types";
import { AppState, matchesFilters } from "./state";

export interface DepMatrixHandle {
  setEdgeType(type: "import" | "co-change"): void;
  setOrder(order: "hierarchy" | "fanIn"): void;
}

interface Cell {
  row: CodeNode;
  col: CodeNode;
  edge?: CodeEdge;
}

export function renderDepMatrix(container: HTMLElement, data: RepositoryData, state: AppState): DepMatrixHandle {
  const cellSize = 18;
  let edgeType: "import" | "co-change" = "import";
  let order: "hierarchy" | "fanIn" = "hierarchy";

  const svg = d3.select(container).append("svg").attr("class", "rk-matrix-svg");
  const g = svg.append("g").attr("transform", "translate(120,120)");

  function render(): void {
    const fileNodes = data.nodes.filter((n) => n.kind === "file" && matchesFilters(n, state.filters));
    const sorted = [...fileNodes].sort((a, b) =>
      order === "fanIn" ? (b.fanIn ?? 0) - (a.fanIn ?? 0) : a.relativePath.localeCompare(b.relativePath)
    );
    const indexById = new Map(sorted.map((n, i) => [n.id, i]));

    const relevantEdges = data.edges.filter(
      (e) => e.type === edgeType && indexById.has(e.source) && indexById.has(e.target)
    );

    svg.attr("viewBox", `0 0 ${sorted.length * cellSize + 140} ${sorted.length * cellSize + 140}`);

    const maxWeight = Math.max(1, ...relevantEdges.map((e) => e.weight));
    const color = d3
      .scaleLinear<string>()
      .domain([0, maxWeight])
      .range(["var(--rk-surface, #2a2a3a)", "var(--rk-bad, #e06c75)"]);

    const cellData: Cell[] = [];
    for (const row of sorted) {
      for (const col of sorted) {
        cellData.push({ row, col, edge: relevantEdges.find((e) => e.source === row.id && e.target === col.id) });
      }
    }

    const cells = g
      .selectAll<SVGRectElement, Cell>("rect.rk-matrix-cell")
      .data(cellData, (d) => `${d.row.id}->${d.col.id}`);
    cells.exit().remove();

    const mergedCells = cells.enter().append("rect").attr("class", "rk-matrix-cell").merge(cells);
    mergedCells
      .attr("x", (d) => (indexById.get(d.col.id) ?? 0) * cellSize)
      .attr("y", (d) => (indexById.get(d.row.id) ?? 0) * cellSize)
      .attr("width", cellSize - 1)
      .attr("height", cellSize - 1)
      .style("fill", (d) => (d.edge ? color(d.edge.weight) : "var(--rk-deep, #1e1e2e)"))
      .classed("rk-matrix-cell--violation", (d) => Boolean(d.edge?.isArchitectureViolation))
      .on("click", (_event, d) => state.select(d.row.id));

    const labels = g.selectAll<SVGTextElement, CodeNode>("text.rk-matrix-row-label").data(sorted, (d) => d.id);
    labels.exit().remove();
    const mergedLabels = labels.enter().append("text").attr("class", "rk-matrix-row-label").merge(labels);
    mergedLabels
      .attr("x", -4)
      .attr("y", (d) => (indexById.get(d.id) ?? 0) * cellSize + cellSize * 0.75)
      .attr("text-anchor", "end")
      .text((d) => d.name);
  }

  render();
  state.subscribe(render);

  return {
    setEdgeType(next) {
      edgeType = next;
      render();
    },
    setOrder(next) {
      order = next;
      render();
    },
  };
}

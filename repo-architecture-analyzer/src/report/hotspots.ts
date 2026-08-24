import * as d3 from "d3";
import type { RepositoryData, CodeNode } from "../shared/types";
import { AppState, matchesFilters } from "./state";

export interface HotspotsHandle {
  setLogScale(enabled: boolean): void;
}

const TOP_LABEL_COUNT = 5;

function riskColor(node: CodeNode): string {
  const risk = node.riskScore ?? 0;
  if (risk >= 60) return "var(--rk-bad, #e06c75)";
  if (risk >= 30) return "var(--rk-warn, #d19a66)";
  return "var(--rk-ok, #98c379)";
}

export function renderHotspots(container: HTMLElement, data: RepositoryData, state: AppState): HotspotsHandle {
  const width = 720;
  const height = 420;
  const margin = { top: 20, right: 20, bottom: 40, left: 50 };
  let logScale = false;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "rk-hotspots-svg");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  function render(): void {
    const fileNodes = data.nodes.filter((n) => n.kind === "file" && matchesFilters(n, state.filters));

    const churnScale = (logScale ? d3.scaleLog() : d3.scaleLinear())
      .domain([1, Math.max(2, d3.max(fileNodes, (n) => n.churn ?? 0) ?? 1)])
      .range([0, innerWidth])
      .clamp(true);
    const complexityScale = (logScale ? d3.scaleLog() : d3.scaleLinear())
      .domain([1, Math.max(2, d3.max(fileNodes, (n) => n.complexity ?? 0) ?? 1)])
      .range([innerHeight, 0])
      .clamp(true);
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, Math.max(1, d3.max(fileNodes, (n) => n.fanIn ?? 0) ?? 1)])
      .range([4, 20]);

    const bubbles = g.selectAll<SVGCircleElement, CodeNode>("circle.rk-hotspot-bubble").data(fileNodes, (d) => d.id);
    bubbles.exit().remove();

    const mergedBubbles = bubbles.enter().append("circle").attr("class", "rk-hotspot-bubble").merge(bubbles);
    mergedBubbles
      .attr("cx", (d) => churnScale(Math.max(1, d.churn ?? 0)))
      .attr("cy", (d) => complexityScale(Math.max(1, d.complexity ?? 0)))
      .attr("r", (d) => radiusScale(d.fanIn ?? 0))
      .style("fill", (d) => riskColor(d))
      .style("opacity", 0.85)
      .on("click", (_event, d) => state.select(d.id));

    const topByRisk = [...fileNodes].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, TOP_LABEL_COUNT);

    const labels = g.selectAll<SVGTextElement, CodeNode>("text.rk-hotspot-label").data(topByRisk, (d) => d.id);
    labels.exit().remove();
    const mergedLabels = labels.enter().append("text").attr("class", "rk-hotspot-label").merge(labels);
    mergedLabels
      .attr("x", (d) => churnScale(Math.max(1, d.churn ?? 0)) + radiusScale(d.fanIn ?? 0) + 4)
      .attr("y", (d) => complexityScale(Math.max(1, d.complexity ?? 0)))
      .text((d) => d.name);
  }

  render();
  state.subscribe(render);

  return {
    setLogScale(enabled) {
      logScale = enabled;
      render();
    },
  };
}

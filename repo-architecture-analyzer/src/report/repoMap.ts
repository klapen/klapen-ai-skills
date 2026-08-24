import * as d3 from "d3";
import { escapeHtml } from "./escape";
import { fmt, groupOf } from "./derive";
import { matchesFilters } from "./state";
import type { ViewContext } from "./viewContext";
import type { CodeNode } from "../shared/types";

const STRUCTURAL_KINDS = new Set(["repository", "folder", "file"]);

function hierarchy(ctx: ViewContext): d3.HierarchyNode<CodeNode> {
  const { data, state } = ctx;
  const keep = new Set<string>();
  const byId = ctx.derived.byId;
  data.nodes
    .filter((n) => n.kind === "file" && matchesFilters(n, state.filters))
    .forEach((f) => {
      let n: CodeNode | undefined = f;
      while (n) {
        keep.add(n.id);
        n = n.parentId ? byId.get(n.parentId) : undefined;
      }
    });
  const list = data.nodes.filter((n) => keep.has(n.id) && STRUCTURAL_KINDS.has(n.kind));
  const root = d3
    .stratify<CodeNode>()
    .id((d) => d.id)
    .parentId((d) => (d.kind === "repository" ? null : (d.parentId ?? null)))(list);
  root.sum((d) => (d.kind === "file" ? Math.max(0, (d as unknown as Record<string, number>)[state.metric] ?? 0) : 0));
  root.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return root;
}

export function renderRepoMap(ctx: ViewContext): void {
  const { derived, state, stage, toolbar, select, showTip, hideTip, moveTip } = ctx;

  toolbar.innerHTML =
    `<span class="rk-toolbar__title">Repo map</span>` +
    `<label>layout <select data-k="layout"><option value="icicle">icicle</option><option value="treemap">treemap</option></select></label>` +
    `<label>size by <select data-k="metric"><option value="loc">lines of code</option><option value="riskScore">risk score</option><option value="complexity">complexity</option><option value="churn">churn</option></select></label>` +
    `<span class="rk-sp"></span><span class="rk-toolbar__note">click a folder to zoom · click the root to go back</span>`;
  (toolbar.querySelector('[data-k="layout"]') as HTMLSelectElement).value = state.mapLayout;
  (toolbar.querySelector('[data-k="metric"]') as HTMLSelectElement).value = state.metric;
  (toolbar.querySelector('[data-k="layout"]') as HTMLSelectElement).onchange = (e) =>
    state.setMapLayout((e.target as HTMLSelectElement).value as "icicle" | "treemap");
  (toolbar.querySelector('[data-k="metric"]') as HTMLSelectElement).onchange = (e) =>
    state.setMetric((e.target as HTMLSelectElement).value as "loc" | "riskScore" | "complexity" | "churn");

  stage.className = "rk-stage";
  let root: d3.HierarchyNode<CodeNode>;
  try {
    root = hierarchy(ctx);
  } catch {
    // d3.stratify() throws if the filtered node set doesn't chain up to exactly one root (e.g.
    // an unexpected/malformed data shape) — degrade to an empty state rather than crash the
    // whole report over one view.
    stage.innerHTML = '<div class="rk-hint-empty">Repo map is unavailable for this data set.</div>';
    return;
  }
  const w = stage.clientWidth || 900;
  const h = stage.clientHeight || 480;
  const svg = d3.select(stage).append("svg").attr("width", w).attr("height", h).style("display", "block");

  const fill = (d: d3.HierarchyRectangularNode<CodeNode>): string =>
    d.data.kind === "file" && state.metric !== "loc"
      ? derived.riskColor(d.data.riskScore ?? ((d.value ?? 0) / (root.value || 1)) * 60)
      : derived.color(groupOf(d.data.relativePath));

  const tipFor = (d: d3.HierarchyRectangularNode<CodeNode>): string => {
    const f = d.data.kind === "file" ? d.data : null;
    return (
      `<b>${escapeHtml(d.data.name)}</b><br /><span class="rk-tip__d">${escapeHtml(d.data.relativePath ?? "")}</span><br />` +
      `<span class="rk-tip__d">${escapeHtml(state.metric)}</span> ${fmt(Math.round(d.value ?? 0))}` +
      (f ? ` · <span class="rk-tip__d">risk</span> ${f.riskScore ?? 0}` : ` · <span class="rk-tip__d">files</span> ${d.leaves().length}`)
    );
  };

  if (state.mapLayout === "treemap") {
    d3
      .treemap<CodeNode>()
      .size([w, h])
      .paddingTop((d) => (d.depth ? 13 : 0))
      .paddingInner(1)
      .round(true)(root);
    const cell = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<CodeNode>>("g")
      .data(root.descendants().filter((d) => d.depth) as d3.HierarchyRectangularNode<CodeNode>[])
      .join("g")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`)
      .style("cursor", "pointer");
    cell
      .append("rect")
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0))
      .attr("fill", (d) => (d.children ? "#12151a" : fill(d)))
      .attr("fill-opacity", (d) => (d.children ? 1 : 0.8))
      .attr("stroke", (d) => (d.data.id === state.selectedNodeId ? "#fff" : derived.cycleNodes.has(d.data.id) ? "#ff6b6b" : "#0a0b0d"))
      .attr("stroke-width", (d) => (d.data.id === state.selectedNodeId ? 2 : 1))
      .attr("data-node", (d) => d.data.id);
    cell
      .append("text")
      .attr("x", 4)
      .attr("y", (d) => (d.children ? 10 : 13))
      .attr("font-size", (d) => (d.children ? 9.5 : 10))
      .attr("fill", (d) => (d.children ? "#7f8894" : "#0a0b0d"))
      .text((d) => (d.x1 - d.x0 > 46 && d.y1 - d.y0 > 14 ? d.data.name : ""));
    cell
      .on("mouseenter", (ev, d) => showTip(ev, tipFor(d)))
      .on("mousemove", (ev) => moveTip(ev))
      .on("mouseleave", () => hideTip())
      .on("click", (_ev, d) => {
        if (d.data.kind === "file") select(d.data.id);
      });
  } else {
    const p = d3.partition<CodeNode>().size([h, w])(root);
    let focus: d3.HierarchyRectangularNode<CodeNode> = p;
    const cell = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<CodeNode>>("g")
      .data(p.descendants())
      .join("g")
      .style("cursor", "pointer");
    const rect = cell
      .append("rect")
      .attr("fill", (d) => (d.depth ? fill(d) : "#1a1f26"))
      .attr("fill-opacity", (d) => (d.children ? 0.55 : 0.85))
      .attr("stroke", (d) => (d.data.id === state.selectedNodeId ? "#fff" : derived.cycleNodes.has(d.data.id) ? "#ff6b6b" : "#0a0b0d"))
      .attr("stroke-width", (d) => (d.data.id === state.selectedNodeId ? 2 : 1))
      .attr("data-node", (d) => d.data.id);
    const txt = cell
      .append("text")
      .attr("x", 5)
      .attr("dy", ".34em")
      .attr("font-size", 10)
      .attr("fill", (d) => (d.depth ? "#0d1013" : "#9aa3af"))
      .attr("pointer-events", "none");
    const draw = (): void => {
      const yScale = d3.scaleLinear().domain([focus.x0, focus.x1]).range([0, h]);
      cell.attr("transform", (d) => `translate(${(d.depth - focus.depth) * (w / 6)},${yScale(d.x0)})`);
      rect.attr("width", w / 6 - 1.5).attr("height", (d) => Math.max(0, yScale(d.x1) - yScale(d.x0) - 1));
      txt
        .attr("y", (d) => Math.max(0, yScale(d.x1) - yScale(d.x0) - 1) / 2)
        .text((d) => (yScale(d.x1) - yScale(d.x0) > 11 ? d.data.name : ""));
    };
    draw();
    cell.on("click", (_ev, d) => {
      if (d.children) {
        focus = focus === d ? (d.parent ?? p) : d;
        draw();
      }
      if (d.data.kind === "file") select(d.data.id);
    });
    cell.on("mouseenter", (ev, d) => showTip(ev, tipFor(d))).on("mousemove", (ev) => moveTip(ev)).on("mouseleave", () => hideTip());
  }

  const legend = document.createElement("div");
  legend.className = "rk-legend";
  legend.innerHTML = derived.groups
    .slice(0, 10)
    .map((g) => `<div><i style="background:${escapeHtml(derived.color(g))}"></i>${escapeHtml(g)}</div>`)
    .join("");
  stage.appendChild(legend);
}

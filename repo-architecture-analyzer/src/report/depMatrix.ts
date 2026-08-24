import * as d3 from "d3";
import { escapeHtml } from "./escape";
import { trunc } from "./derive";
import { matchesFilters } from "./state";
import type { ViewContext } from "./viewContext";
import type { CodeNode } from "../shared/types";

interface Cell {
  r: number;
  c: number;
  w: number;
  s: string;
  t: string;
}

export function renderDepMatrix(ctx: ViewContext): void {
  const { derived, state, stage, toolbar, select, showTip, hideTip, moveTip } = ctx;

  toolbar.innerHTML =
    `<span class="rk-toolbar__title">Dependency matrix</span>` +
    `<label>edges <select data-k="edge"><option value="import">imports</option><option value="co-change">co-change</option></select></label>` +
    `<label>order <select data-k="order"><option value="hierarchy">path</option><option value="fanIn">fan-in</option><option value="risk">risk</option></select></label>` +
    `<span class="rk-sp"></span><span class="rk-toolbar__note">row → column = row imports column · red = cycle</span>`;
  (toolbar.querySelector('[data-k="edge"]') as HTMLSelectElement).value = state.edgeType;
  (toolbar.querySelector('[data-k="order"]') as HTMLSelectElement).value = state.order;
  (toolbar.querySelector('[data-k="edge"]') as HTMLSelectElement).onchange = (e) =>
    state.setEdgeType((e.target as HTMLSelectElement).value as "import" | "co-change");
  (toolbar.querySelector('[data-k="order"]') as HTMLSelectElement).onchange = (e) =>
    state.setOrder((e.target as HTMLSelectElement).value as "hierarchy" | "fanIn" | "risk");

  const edges = state.edgeType === "import" ? derived.imports : derived.cochange;
  const degree = new Set<string>();
  edges.forEach((e) => {
    degree.add(e.source);
    degree.add(e.target);
  });
  let ns = derived.files.filter((f) => degree.has(f.id) && matchesFilters(f, state.filters));
  if (state.order === "fanIn") {
    ns = ns.sort((a, b) => (b.fanIn ?? 0) - (a.fanIn ?? 0) || a.relativePath.localeCompare(b.relativePath));
  } else if (state.order === "risk") {
    ns = ns.sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0) || a.relativePath.localeCompare(b.relativePath));
  } else {
    ns = ns.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  stage.className = "rk-stage rk-stage--scroll";
  if (!ns.length) {
    stage.innerHTML = '<div class="rk-hint-empty">No connected files match the filters.</div>';
    return;
  }

  const idx = new Map<string, number>(ns.map((n, i) => [n.id, i]));
  const cells: Cell[] = edges
    .filter((e) => idx.has(e.source) && idx.has(e.target))
    .map((e) => ({ r: idx.get(e.source)!, c: idx.get(e.target)!, w: e.weight || 1, s: e.source, t: e.target }));

  const pad = { l: 250, t: 250 };
  const cs = Math.max(7, Math.min(16, (Math.min(stage.clientWidth || 900, stage.clientHeight || 700) - pad.l - 24) / ns.length));
  const size = cs * ns.length;
  const svg = d3.select(stage).append("svg").attr("width", pad.l + size + 20).attr("height", pad.t + size + 20);
  const g = svg.append("g").attr("transform", `translate(${pad.l},${pad.t})`);
  g.append("rect").attr("width", size).attr("height", size).attr("fill", "#0d1014");
  g.selectAll<SVGLineElement, CodeNode>("line.rk-mrow")
    .data(ns)
    .join("line")
    .attr("class", "rk-mrow")
    .attr("x1", 0)
    .attr("x2", size)
    .attr("y1", (_d, i) => i * cs)
    .attr("y2", (_d, i) => i * cs)
    .attr("stroke", "#161a20");
  g.selectAll<SVGLineElement, CodeNode>("line.rk-mcol")
    .data(ns)
    .join("line")
    .attr("class", "rk-mcol")
    .attr("y1", 0)
    .attr("y2", size)
    .attr("x1", (_d, i) => i * cs)
    .attr("x2", (_d, i) => i * cs)
    .attr("stroke", "#161a20");

  const wmax = d3.max(cells, (c) => c.w) || 1;
  g.selectAll<SVGRectElement, Cell>("rect.rk-mcell")
    .data(cells)
    .join("rect")
    .attr("class", "rk-mcell")
    .attr("x", (d) => d.c * cs)
    .attr("y", (d) => d.r * cs)
    .attr("width", cs - 1)
    .attr("height", cs - 1)
    .attr("fill", (d) => (derived.cyclePairs.has(`${d.s}|${d.t}`) ? "#ff6b6b" : "#63b3ff"))
    .attr("fill-opacity", (d) => 0.35 + 0.65 * (d.w / wmax))
    .style("cursor", "pointer")
    .on("mouseenter", (ev, d) =>
      showTip(
        ev,
        `<b>${escapeHtml(ns[d.r].name)}</b> → <b>${escapeHtml(ns[d.c].name)}</b><br /><span class="rk-tip__d">${escapeHtml(ns[d.r].relativePath)}</span><br />` +
          `<span class="rk-tip__d">→ ${escapeHtml(ns[d.c].relativePath)}</span><br /><span class="rk-tip__d">weight</span> ${d.w}` +
          (derived.cyclePairs.has(`${d.s}|${d.t}`) ? ' <span style="color:#ff6b6b">· cycle</span>' : "")
      )
    )
    .on("mousemove", (ev) => moveTip(ev))
    .on("mouseleave", () => hideTip())
    .on("click", (_ev, d) => select(d.s));

  g.selectAll<SVGTextElement, CodeNode>("text.rk-mrowlabel")
    .data(ns)
    .join("text")
    .attr("class", "rk-mrowlabel")
    .attr("x", -6)
    .attr("y", (_d, i) => i * cs + cs / 2 + 3)
    .attr("text-anchor", "end")
    .attr("font-size", Math.min(10, cs - 1))
    .attr("fill", (d) => (d.id === state.selectedNodeId ? "#fff" : derived.cycleNodes.has(d.id) ? "#ff6b6b" : "#7f8894"))
    .text((d) => trunc(d.relativePath, 40))
    .style("cursor", "pointer")
    .on("click", (_ev, d) => select(d.id));

  g.selectAll<SVGTextElement, CodeNode>("text.rk-mcollabel")
    .data(ns)
    .join("text")
    .attr("class", "rk-mcollabel")
    .attr("transform", (_d, i) => `translate(${i * cs + cs / 2 + 3},-6) rotate(-90)`)
    .attr("font-size", Math.min(10, cs - 1))
    .attr("fill", (d) => (d.id === state.selectedNodeId ? "#fff" : derived.cycleNodes.has(d.id) ? "#ff6b6b" : "#7f8894"))
    .text((d) => trunc(d.name, 34))
    .style("cursor", "pointer")
    .on("click", (_ev, d) => select(d.id));
}

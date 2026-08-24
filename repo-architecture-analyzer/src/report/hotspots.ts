import * as d3 from "d3";
import { escapeHtml } from "./escape";
import { fmt } from "./derive";
import { matchesFilters } from "./state";
import type { ViewContext } from "./viewContext";

export function renderHotspots(ctx: ViewContext): void {
  const { derived, state, stage, toolbar, select, showTip, hideTip, moveTip } = ctx;

  toolbar.innerHTML =
    `<span class="rk-toolbar__title">Hotspots</span>` +
    `<label><input type="checkbox" data-k="log" ${state.logScale ? "checked" : ""} /> log scales</label>` +
    `<span class="rk-sp"></span><span class="rk-toolbar__note">x = churn · y = complexity · size = LOC · colour = risk</span>`;
  (toolbar.querySelector('[data-k="log"]') as HTMLInputElement).onchange = (e) => state.setLogScale((e.target as HTMLInputElement).checked);

  const data = derived.files.filter((f) => matchesFilters(f, state.filters) && ((f.churn ?? 0) > 0 || (f.complexity ?? 0) > 0));

  stage.className = "rk-stage";
  const w = stage.clientWidth || 900;
  const h = stage.clientHeight || 460;
  const svg = d3.select(stage).append("svg").attr("width", w).attr("height", h).style("display", "block");
  const m = { l: 58, r: 30, t: 34, b: 46 };

  const x = (state.logScale ? d3.scaleLog() : d3.scaleLinear())
    .domain(state.logScale ? [1, d3.max(data, (d) => d.churn ?? 1) || 10] : [0, d3.max(data, (d) => d.churn ?? 0) || 1])
    .range([m.l, w - m.r]);
  if (!state.logScale) x.nice();
  const y = (state.logScale ? d3.scaleLog() : d3.scaleLinear())
    .domain(state.logScale ? [1, d3.max(data, (d) => d.complexity ?? 1) || 10] : [0, d3.max(data, (d) => d.complexity ?? 0) || 1])
    .range([h - m.b, m.t]);
  if (!state.logScale) y.nice();
  const r = d3
    .scaleSqrt()
    .domain([0, d3.max(data, (d) => d.loc ?? 1) || 1])
    .range([3, 26]);

  const axisStyle = (sel: d3.Selection<SVGGElement, unknown, null, undefined>): void => {
    sel.selectAll("text").attr("fill", "#5b636e").attr("font-size", 10);
    sel.selectAll("line,path").attr("stroke", "#232830");
  };
  svg.append("g").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x as d3.AxisScale<d3.NumberValue>).ticks(6, "~s")).call(axisStyle);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y as d3.AxisScale<d3.NumberValue>).ticks(6, "~s")).call(axisStyle);
  svg
    .append("text")
    .attr("x", w - m.r)
    .attr("y", h - 8)
    .attr("text-anchor", "end")
    .attr("fill", "#5b636e")
    .attr("font-size", 10)
    .text("churn (lines changed) →");
  svg
    .append("text")
    .attr("x", m.l - 8)
    .attr("y", m.t - 12)
    .attr("text-anchor", "end")
    .attr("fill", "#5b636e")
    .attr("font-size", 10)
    .text("complexity ↑");

  const g2 = svg.append("g");
  g2.selectAll<SVGCircleElement, (typeof data)[number]>("circle")
    .data(data)
    .join("circle")
    .attr("cx", (d) => x(Math.max(state.logScale ? 1 : 0, d.churn ?? 0)))
    .attr("cy", (d) => y(Math.max(state.logScale ? 1 : 0, d.complexity ?? 0)))
    .attr("r", (d) => r(d.loc ?? 1))
    .attr("fill", (d) => derived.riskColor(d.riskScore ?? 0))
    .attr("fill-opacity", 0.3)
    .attr("stroke", (d) => (d.id === state.selectedNodeId ? "#fff" : derived.riskColor(d.riskScore ?? 0)))
    .attr("stroke-width", (d) => (d.id === state.selectedNodeId ? 2.5 : 1.3))
    .attr("data-node", (d) => d.id)
    .style("cursor", "pointer")
    .on("mouseenter", (ev, d) =>
      showTip(
        ev,
        `<b>${escapeHtml(d.name)}</b><br /><span class="rk-tip__d">${escapeHtml(d.relativePath)}</span><br /><span class="rk-tip__d">risk</span> ${d.riskScore ?? 0} · <span class="rk-tip__d">churn</span> ${fmt(d.churn ?? 0)} · <span class="rk-tip__d">cx</span> ${d.complexity ?? 0} · <span class="rk-tip__d">loc</span> ${fmt(d.loc ?? 0)} · <span class="rk-tip__d">commits</span> ${d.commitCount ?? 0}`
      )
    )
    .on("mousemove", (ev) => moveTip(ev))
    .on("mouseleave", () => hideTip())
    .on("click", (_ev, d) => select(d.id));

  const labels = [...data].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 8);
  g2.selectAll<SVGTextElement, (typeof labels)[number]>("text")
    .data(labels)
    .join("text")
    .attr("x", (d) => x(Math.max(state.logScale ? 1 : 0, d.churn ?? 0)))
    .attr("y", (d) => y(Math.max(state.logScale ? 1 : 0, d.complexity ?? 0)) - r(d.loc ?? 1) - 5)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", "#9aa3af")
    .attr("pointer-events", "none")
    .text((d) => d.name);

  const hint = document.createElement("div");
  hint.className = "rk-hint";
  hint.textContent = `${data.length} files with git history · top ${labels.length} by risk labelled`;
  stage.appendChild(hint);
}

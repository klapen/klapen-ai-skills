import * as d3 from "d3";
import { escapeHtml } from "./escape";
import { fmt, groupOf } from "./derive";
import { matchesFilters } from "./state";
import type { ViewContext } from "./viewContext";
import type { CodeNode } from "../shared/types";

interface GraphNode {
  id: string;
  name: string;
  group: string;
  loc: number;
  risk: number;
  count?: number;
  file?: CodeNode;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}
interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  weight: number;
}

function buildGraphData(ctx: ViewContext): { nodes: GraphNode[]; links: GraphLink[] } {
  const { data, derived, state } = ctx;
  const edges = state.edgeType === "import" ? derived.imports : derived.cochange;

  if (state.level === "folder") {
    const key = (f: CodeNode) => groupOf(f.relativePath);
    const groups = d3.group(
      derived.files.filter((f) => matchesFilters(f, state.filters)),
      key
    );
    const nodes: GraphNode[] = Array.from(groups, ([k, arr]) => ({
      id: `grp:${k}`,
      name: k,
      group: k,
      loc: d3.sum(arr, (f) => f.loc ?? 0),
      risk: d3.mean(arr, (f) => f.riskScore ?? 0) ?? 0,
      count: arr.length,
    }));
    const idx = new Map<string, string>();
    derived.files.forEach((f) => idx.set(f.id, `grp:${key(f)}`));
    const agg = new Map<string, number>();
    for (const e of edges) {
      const a = idx.get(e.source);
      const b = idx.get(e.target);
      if (!a || !b || a === b) continue;
      const k = `${a}|${b}`;
      agg.set(k, (agg.get(k) ?? 0) + (e.weight || 1));
    }
    const has = new Set(nodes.map((n) => n.id));
    const links: GraphLink[] = Array.from(agg, ([k, w]) => {
      const [source, target] = k.split("|");
      return { source, target, weight: w };
    }).filter((l) => has.has(l.source as string) && has.has(l.target as string));
    return { nodes, links };
  }

  let ns = data.nodes.filter((n) => n.kind === "file" && matchesFilters(n, state.filters));
  const keep = new Set(ns.map((n) => n.id));
  const links: GraphLink[] = edges
    .filter((e) => keep.has(e.source) && keep.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, weight: e.weight || 1 }));
  if (state.filters.hideIsolated) {
    const connected = new Set<string>();
    links.forEach((l) => {
      connected.add(l.source as string);
      connected.add(l.target as string);
    });
    ns = ns.filter((n) => connected.has(n.id));
  }
  const nodes: GraphNode[] = ns.map((f) => ({
    id: f.id,
    name: f.name,
    group: groupOf(f.relativePath),
    loc: f.loc ?? 0,
    risk: f.riskScore ?? 0,
    file: f,
  }));
  return { nodes, links };
}

export function renderGraph(ctx: ViewContext): void {
  const { derived, state, stage, toolbar, select, showTip, hideTip, moveTip } = ctx;

  toolbar.innerHTML =
    `<span class="rk-toolbar__title">Dependency graph</span>` +
    `<label>level <select data-k="level"><option value="file">file</option><option value="folder">folder</option></select></label>` +
    `<label>edges <select data-k="edge"><option value="import">imports</option><option value="co-change">co-change</option></select></label>` +
    `<label>colour <select data-k="color"><option value="folder">by folder</option><option value="risk">by risk</option></select></label>` +
    `<span class="rk-sp"></span><button type="button" class="rk-act" data-act="refit">Re-run layout</button>`;
  (toolbar.querySelector('[data-k="level"]') as HTMLSelectElement).value = state.level;
  (toolbar.querySelector('[data-k="edge"]') as HTMLSelectElement).value = state.edgeType;
  (toolbar.querySelector('[data-k="color"]') as HTMLSelectElement).value = state.colorBy;
  (toolbar.querySelector('[data-k="level"]') as HTMLSelectElement).onchange = (e) =>
    state.setLevel((e.target as HTMLSelectElement).value as "file" | "folder");
  (toolbar.querySelector('[data-k="edge"]') as HTMLSelectElement).onchange = (e) =>
    state.setEdgeType((e.target as HTMLSelectElement).value as "import" | "co-change");
  (toolbar.querySelector('[data-k="color"]') as HTMLSelectElement).onchange = (e) =>
    state.setColorBy((e.target as HTMLSelectElement).value as "folder" | "risk");
  (toolbar.querySelector('[data-act="refit"]') as HTMLButtonElement).onclick = () => state.setView(state.view);

  stage.className = "rk-stage";
  const w = stage.clientWidth || 900;
  const h = stage.clientHeight || 520;
  const svg = d3.select(stage).append("svg").attr("width", w).attr("height", h).style("display", "block");
  const g = svg.append("g");
  svg
    .append("defs")
    .append("marker")
    .attr("id", "rk-arrow")
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 8)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-3L7,0L0,3")
    .attr("fill", "#39424f");

  const { nodes, links } = buildGraphData(ctx);
  if (!nodes.length) {
    stage.innerHTML = '<div class="rk-hint-empty">No nodes match the current filters.</div>';
    return;
  }

  const rScale = d3
    .scaleSqrt()
    .domain([0, d3.max(nodes, (n) => n.loc || 1) || 1])
    .range([3.5, state.level === "folder" ? 46 : 20]);
  const lw = d3
    .scaleLinear()
    .domain([1, d3.max(links, (l) => l.weight) || 1])
    .range([0.7, 3]);

  const link = g
    .append("g")
    .attr("fill", "none")
    .selectAll<SVGLineElement, GraphLink>("line")
    .data(links)
    .join("line")
    .attr("stroke", (d) => (derived.cyclePairs.has(`${(d.source as GraphNode).id ?? d.source}|${(d.target as GraphNode).id ?? d.target}`) ? "#ff6b6b" : "#2b323d"))
    .attr("stroke-width", (d) => lw(d.weight))
    .attr("marker-end", "url(#rk-arrow)");

  const node = g
    .append("g")
    .selectAll<SVGCircleElement, GraphNode>("circle")
    .data(nodes)
    .join("circle")
    .attr("r", (d) => rScale(d.loc || 1))
    .attr("fill", (d) => (state.colorBy === "risk" ? derived.riskColor(d.risk || 0) : derived.color(d.group)))
    .attr("fill-opacity", 0.82)
    .attr("stroke", (d) => (d.id === state.selectedNodeId ? "#fff" : derived.cycleNodes.has(d.id) ? "#ff6b6b" : "#0a0b0d"))
    .attr("stroke-width", (d) => (d.id === state.selectedNodeId ? 2.5 : derived.cycleNodes.has(d.id) ? 2 : 1))
    .attr("data-node", (d) => d.id)
    .style("cursor", "pointer");

  const labelled =
    state.level === "folder"
      ? nodes
      : nodes
          .slice()
          .sort((a, b) => ((b.file?.fanIn ?? 0) + rScale(b.loc || 1)) - ((a.file?.fanIn ?? 0) + rScale(a.loc || 1)))
          .slice(0, 22);
  const label = g
    .append("g")
    .selectAll<SVGTextElement, GraphNode>("text")
    .data(labelled)
    .join("text")
    .text((d) => d.name)
    .attr("font-size", state.level === "folder" ? 12 : 9.5)
    .attr("fill", "#aeb6c0")
    .attr("stroke", "#0a0b0d")
    .attr("stroke-width", 3)
    .attr("paint-order", "stroke")
    .attr("text-anchor", "middle")
    .attr("pointer-events", "none");

  node
    .on("mouseenter", (ev, d) => {
      const f = d.file;
      showTip(
        ev,
        `<b>${escapeHtml(d.name)}</b><br /><span class="rk-tip__d">${f ? escapeHtml(f.relativePath) : `${d.count} files`}</span><br />` +
          (f
            ? `<span class="rk-tip__d">loc</span> ${fmt(f.loc ?? 0)} · <span class="rk-tip__d">in</span> ${f.fanIn ?? 0} · <span class="rk-tip__d">out</span> ${f.fanOut ?? 0} · <span class="rk-tip__d">risk</span> ${f.riskScore ?? 0}`
            : `<span class="rk-tip__d">loc</span> ${fmt(d.loc)} · <span class="rk-tip__d">avg risk</span> ${d.risk.toFixed(1)}`)
      );
      focus(d);
    })
    .on("mousemove", (ev) => moveTip(ev))
    .on("mouseleave", () => {
      hideTip();
      focus(null);
    })
    .on("click", (_ev, d) => {
      if (d.file) select(d.id);
    });

  function focus(d: GraphNode | null): void {
    if (!d) {
      node.attr("opacity", 1);
      link.attr("stroke-opacity", 0.75);
      label.attr("opacity", 1);
      return;
    }
    const near = new Set([d.id]);
    links.forEach((l) => {
      const s = (l.source as GraphNode).id ?? (l.source as string);
      const t = (l.target as GraphNode).id ?? (l.target as string);
      if (s === d.id) near.add(t);
      if (t === d.id) near.add(s);
    });
    node.attr("opacity", (n) => (near.has(n.id) ? 1 : 0.12));
    label.attr("opacity", (n) => (near.has(n.id) ? 1 : 0.08));
    link
      .attr("stroke-opacity", (l) => {
        const s = (l.source as GraphNode).id ?? (l.source as string);
        const t = (l.target as GraphNode).id ?? (l.target as string);
        return s === d.id || t === d.id ? 1 : 0.06;
      })
      .attr("stroke", (l) => {
        const s = (l.source as GraphNode).id ?? (l.source as string);
        const t = (l.target as GraphNode).id ?? (l.target as string);
        if (s !== d.id && t !== d.id) return "#2b323d";
        return derived.cyclePairs.has(`${s}|${t}`) ? "#ff6b6b" : "#63b3ff";
      });
  }

  const lanes = Array.from(new Set(nodes.map((n) => n.group))).sort((a, b) => derived.groups.indexOf(a) - derived.groups.indexOf(b));
  const cx = new Map(lanes.map((d, i) => [d, w * (0.14 + 0.72 * (lanes.length < 2 ? 0.5 : i / (lanes.length - 1)))]));
  nodes.forEach((d, i) => {
    const a = i * 2.399;
    const rr = 12 + 9 * Math.sqrt(i);
    d.x = (cx.get(d.group) ?? w / 2) + rr * Math.cos(a);
    d.y = h / 2 + rr * Math.sin(a);
  });

  const tick = (): void => {
    link
      .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
      .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
      .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
      .attr("y2", (d) => (d.target as GraphNode).y ?? 0);
    node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
    label.attr("x", (d) => d.x ?? 0).attr("y", (d) => (d.y ?? 0) - rScale(d.loc || 1) - 4);
  };

  const sim = d3
    .forceSimulation(nodes)
    .stop()
    .force(
      "link",
      d3
        .forceLink<GraphNode, GraphLink>(links)
        .id((d) => d.id)
        .distance(state.level === "folder" ? 180 : 55)
        .strength(0.35)
    )
    .force("charge", d3.forceManyBody().strength(state.level === "folder" ? -1400 : -170))
    .force("collide", d3.forceCollide<GraphNode>((d) => rScale(d.loc || 1) + 5))
    .force("x", d3.forceX<GraphNode>((d) => cx.get(d.group) ?? w / 2).strength(0.14))
    .force("y", d3.forceY(h / 2).strength(0.14))
    .on("tick", tick);
  for (let i = 0; i < 340; i += 1) sim.tick();
  tick();

  node.call(
    d3
      .drag<SVGCircleElement, GraphNode>()
      .on("start", (ev, d) => {
        if (!ev.active) sim.alphaTarget(0.25).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (ev, d) => {
        d.fx = ev.x;
        d.fy = ev.y;
      })
      .on("end", (ev) => {
        if (!ev.active) sim.alphaTarget(0);
      })
  );

  const zoomB = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.15, 6]).on("zoom", (ev) => g.attr("transform", ev.transform));
  svg.call(zoomB);
  // getBBox() requires a real layout engine and isn't implemented by jsdom (throws there); the
  // auto-fit zoom it drives is a nice-to-have, so skip it rather than let rendering fail.
  const gNode = g.node();
  if (gNode && typeof gNode.getBBox === "function") {
    let b: SVGRect | undefined;
    try {
      b = gNode.getBBox();
    } catch {
      b = undefined;
    }
    if (b && b.width && b.height) {
      const k = Math.min(w / (b.width + 70), h / (b.height + 70), 1.6);
      svg.call(zoomB.transform, d3.zoomIdentity.translate(w / 2 - k * (b.x + b.width / 2), h / 2 - k * (b.y + b.height / 2)).scale(k));
    }
  }

  const legend = document.createElement("div");
  legend.className = "rk-legend";
  const items =
    state.colorBy === "risk"
      ? [
          ["#39424f", "risk 0"],
          ["#63b3ff", "low"],
          ["#e6b450", "medium"],
          ["#ff6b6b", "high / cycle"],
        ]
      : lanes.slice(0, 10).map((d) => [derived.color(d), d]).concat([["#ff6b6b", "in cycle"]]);
  legend.innerHTML = items.map(([c, l]) => `<div><i style="background:${escapeHtml(c)}"></i>${escapeHtml(l)}</div>`).join("");
  stage.appendChild(legend);

  const hint = document.createElement("div");
  hint.className = "rk-hint";
  hint.textContent = `${nodes.length} nodes · ${links.length} ${state.edgeType} edges · scroll to zoom, drag to pin, hover to isolate`;
  stage.appendChild(hint);
}

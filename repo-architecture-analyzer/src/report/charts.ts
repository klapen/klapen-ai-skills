import * as d3 from "d3";
import type { CodeNode, RepositoryData } from "../shared/types";
import type { DerivedFacts } from "./derive";
import { groupOf } from "./derive";
import type { ReportColorScales } from "./colors";
import { escapeHtml } from "./escape";

const N = d3.format(",");

function legendHtml(items: Array<[string, string]>): string {
  return items.map(([c, l]) => `<span><i style="background:${c}"></i>${escapeHtml(l)}</span>`).join("");
}

function chartSvg(container: HTMLElement, height: number): { svg: d3.Selection<SVGSVGElement, unknown, null, undefined>; width: number; height: number } {
  const width = container.clientWidth || 900;
  container.innerHTML = "";
  const svg = d3.select(container).append("svg").attr("width", width).attr("height", height).style("display", "block");
  return { svg, width, height };
}

function makeTip(root: ParentNode): {
  show: (ev: MouseEvent, html: string) => void;
  move: (ev: MouseEvent) => void;
  hide: () => void;
} {
  const tip = root.querySelector<HTMLElement>("#tip");
  const move = (ev: MouseEvent): void => {
    if (!tip) return;
    const rect = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(ev.clientX + 14, innerWidth - rect.width - 10)}px`;
    tip.style.top = `${Math.min(ev.clientY + 14, innerHeight - rect.height - 10)}px`;
  };
  const show = (ev: MouseEvent, html: string): void => {
    if (!tip) return;
    tip.innerHTML = html;
    tip.style.opacity = "1";
    move(ev);
  };
  const hide = (): void => {
    if (tip) tip.style.opacity = "0";
  };
  return { show, move, hide };
}

export function drawAll(root: HTMLElement, data: RepositoryData, facts: DerivedFacts, colors: ReportColorScales): void {
  const tip = makeTip(root.ownerDocument ?? document);
  drawMap(root, facts, colors, tip);
  drawGraph(root, facts, colors, tip);
  drawMatrix(root, facts, tip);
  drawHotspots(root, facts, colors, tip);
}

/** Wires the row/column module selects above the coupling matrix so changing either re-renders it in place. */
export function bindMatrixFilters(root: HTMLElement, facts: DerivedFacts): void {
  const rowsSel = root.querySelector<HTMLSelectElement>("#mx-rows");
  const colsSel = root.querySelector<HTMLSelectElement>("#mx-cols");
  if (!rowsSel || !colsSel) return;
  const tip = makeTip(root.ownerDocument ?? document);
  const redraw = (): void => drawMatrix(root, facts, tip);
  rowsSel.addEventListener("change", redraw);
  colsSel.addEventListener("change", redraw);
}

type Tip = ReturnType<typeof makeTip>;

function drawMap(root: HTMLElement, facts: DerivedFacts, colors: ReportColorScales, tip: Tip): void {
  const container = root.querySelector<HTMLElement>("#c-map");
  const legend = root.querySelector<HTMLElement>("#l-map");
  if (!container) return;
  const { svg, width, height } = chartSvg(container, 440);

  const keep = new Set<string>();
  for (const f of facts.files) {
    let n: CodeNode | undefined = f;
    while (n) {
      keep.add(n.id);
      n = n.parentId ? facts.byId.get(n.parentId) : undefined;
    }
  }
  const list = Array.from(facts.byId.values()).filter((n) => keep.has(n.id) && ["file", "folder", "repository"].includes(n.kind));
  let root_: d3.HierarchyNode<CodeNode>;
  try {
    root_ = d3
      .stratify<CodeNode>()
      .id((d) => d.id)
      .parentId((d) => (d.kind === "repository" ? null : d.parentId ?? null))(list);
  } catch {
    container.innerHTML = '<p class="cap">Repo map unavailable — could not build a file hierarchy for this analysis.</p>';
    return;
  }
  root_.sum((d) => (d.kind === "file" ? Math.max(1, d.loc ?? 0) : 0)).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  d3
    .treemap<CodeNode>()
    .size([width, height])
    .paddingTop((d) => (d.depth ? 13 : 0))
    .paddingInner(1)
    .round(true)(root_ as d3.HierarchyNode<CodeNode> & { x0: number });

  const rects = root_.descendants().filter((d) => d.depth) as Array<d3.HierarchyRectangularNode<CodeNode>>;
  const cell = svg
    .selectAll("g")
    .data(rects)
    .join("g")
    .attr("transform", (d) => `translate(${d.x0},${d.y0})`);
  cell
    .append("rect")
    .attr("width", (d) => Math.max(0, d.x1 - d.x0))
    .attr("height", (d) => Math.max(0, d.y1 - d.y0))
    .attr("fill", (d) => (d.children ? "#12151a" : colors.group(groupOf(d.data.relativePath))))
    .attr("fill-opacity", (d) => (d.children ? 1 : 0.82))
    .attr("stroke", (d) => (facts.cycleNodes.has(d.data.id) ? "#ff6b6b" : "#0a0b0d"));
  cell
    .append("text")
    .attr("x", 4)
    .attr("y", (d) => (d.children ? 10 : 13))
    .attr("font-family", "var(--mono)")
    .attr("font-size", (d) => (d.children ? 9.5 : 10))
    .attr("fill", (d) => (d.children ? "#7f8894" : "#0a0b0d"))
    .text((d) => ((d.x1 - d.x0 > 48 && d.y1 - d.y0 > 14) ? d.data.name : ""));
  cell
    .on("mouseenter", (ev: MouseEvent, d) =>
      tip.show(
        ev,
        `<b>${escapeHtml(d.data.name)}</b><br /><span class="d">${escapeHtml(d.data.relativePath ?? "")}</span><br /><span class="d">loc</span> ${N(
          d.value ?? 0
        )}${
          d.data.kind === "file"
            ? ` · <span class="d">risk</span> ${d.data.riskScore ?? 0} · <span class="d">fan-in</span> ${d.data.fanIn ?? 0}`
            : ` · <span class="d">files</span> ${d.leaves().length}`
        }`
      )
    )
    .on("mousemove", (ev: MouseEvent) => tip.move(ev))
    .on("mouseleave", () => tip.hide());

  if (legend) legend.innerHTML = legendHtml(facts.groups.slice(0, 8).map((g) => [colors.group(g), g]));
}

function drawGraph(root: HTMLElement, facts: DerivedFacts, colors: ReportColorScales, tip: Tip): void {
  const container = root.querySelector<HTMLElement>("#c-graph");
  const legend = root.querySelector<HTMLElement>("#l-graph");
  if (!container) return;
  const { svg, width, height } = chartSvg(container, 520);
  const g = svg.append("g");
  svg
    .append("defs")
    .append("marker")
    .attr("id", "ar")
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 8)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-3L7,0L0,3")
    .attr("fill", "#39424f");

  interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    group: string;
    loc: number;
    file: CodeNode;
  }
  const nodes: GraphNode[] = facts.files
    .filter((f) => facts.connected.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, group: groupOf(f.relativePath), loc: f.loc ?? 1, file: f }));
  if (!nodes.length) {
    container.innerHTML = '<p class="cap">No connected files to graph.</p>';
    return;
  }
  const keep = new Set(nodes.map((n) => n.id));
  const links = facts.imports
    .filter((e) => keep.has(e.source) && keep.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, key: `${e.source}|${e.target}` }));

  const r = d3.scaleSqrt().domain([0, d3.max(nodes, (n) => n.loc) ?? 1]).range([3.5, 19]);
  const lanes = Array.from(new Set(nodes.map((n) => n.group))).sort((a, b) => facts.groups.indexOf(a) - facts.groups.indexOf(b));
  const cx = new Map(lanes.map((d, i) => [d, width * (0.14 + 0.72 * (lanes.length < 2 ? 0.5 : i / (lanes.length - 1)))]));
  nodes.forEach((d, i) => {
    d.x = (cx.get(d.group) ?? width / 2) + 9 * Math.cos(i * 2.4) * Math.sqrt(i);
    d.y = height / 2 + 9 * Math.sin(i * 2.4) * Math.sqrt(i);
  });

  const link = g
    .append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", (d) => (facts.cyclePairs.has(d.key) ? "#ff6b6b" : "#2b323d"))
    .attr("stroke-width", 0.8)
    .attr("stroke-opacity", 0.75)
    .attr("marker-end", "url(#ar)");
  const node = g
    .append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", (d) => r(d.loc))
    .attr("fill", (d) => colors.group(d.group))
    .attr("fill-opacity", 0.82)
    .attr("stroke", (d) => (facts.cycleNodes.has(d.id) ? "#ff6b6b" : "#0a0b0d"))
    .attr("stroke-width", (d) => (facts.cycleNodes.has(d.id) ? 2 : 1))
    .style("cursor", "grab");
  const labelled = nodes
    .slice()
    .sort((a, b) => ((b.file.fanIn ?? 0) + r(b.loc) - ((a.file.fanIn ?? 0) + r(a.loc))))
    .slice(0, 18);
  const label = g
    .append("g")
    .selectAll("text")
    .data(labelled)
    .join("text")
    .text((d) => d.name)
    .attr("font-family", "var(--mono)")
    .attr("font-size", 9.5)
    .attr("fill", "#aeb6c0")
    .attr("stroke", "#0a0b0d")
    .attr("stroke-width", 3)
    .attr("paint-order", "stroke")
    .attr("text-anchor", "middle")
    .attr("pointer-events", "none");

  const tick = (): void => {
    link
      .attr("x1", (d) => (typeof d.source === "object" ? (d.source as GraphNode).x ?? 0 : 0))
      .attr("y1", (d) => (typeof d.source === "object" ? (d.source as GraphNode).y ?? 0 : 0))
      .attr("x2", (d) => (typeof d.target === "object" ? (d.target as GraphNode).x ?? 0 : 0))
      .attr("y2", (d) => (typeof d.target === "object" ? (d.target as GraphNode).y ?? 0 : 0));
    node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
    label.attr("x", (d) => d.x ?? 0).attr("y", (d) => (d.y ?? 0) - r(d.loc) - 4);
  };
  const sim = d3
    .forceSimulation<GraphNode>(nodes)
    .stop()
    .force(
      "link",
      d3
        .forceLink<GraphNode, (typeof links)[number]>(links)
        .id((d) => d.id)
        .distance(52)
        .strength(0.35)
    )
    .force("charge", d3.forceManyBody().strength(-170))
    .force("collide", d3.forceCollide<GraphNode>((d) => r(d.loc) + 5))
    .force("x", d3.forceX<GraphNode>((d) => cx.get(d.group) ?? width / 2).strength(0.14))
    .force("y", d3.forceY(height / 2).strength(0.14))
    .on("tick", tick);
  for (let i = 0; i < 340; i++) sim.tick();
  tick();

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 5])
    .filter((ev: Event) => {
      if (ev.type === "wheel") return (ev as WheelEvent).ctrlKey || (ev as WheelEvent).metaKey;
      return !(ev as MouseEvent).ctrlKey && !(ev as MouseEvent).button;
    })
    .on("zoom", (ev) => g.attr("transform", ev.transform.toString()));
  svg.call(zoom);
  const bbox = (g.node() as SVGGElement | null)?.getBBox?.();
  if (bbox && bbox.width && bbox.height) {
    const k = Math.min(width / (bbox.width + 60), height / (bbox.height + 60), 1.4);
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(width / 2 - k * (bbox.x + bbox.width / 2), height / 2 - k * (bbox.y + bbox.height / 2)).scale(k)
    );
  }

  node
    .on("mouseenter", (ev: MouseEvent, d) =>
      tip.show(
        ev,
        `<b>${escapeHtml(d.name)}</b><br /><span class="d">${escapeHtml(d.file.relativePath ?? "")}</span><br /><span class="d">loc</span> ${N(
          d.loc
        )} · <span class="d">in</span> ${d.file.fanIn ?? 0} · <span class="d">out</span> ${d.file.fanOut ?? 0} · <span class="d">risk</span> ${
          d.file.riskScore ?? 0
        }`
      )
    )
    .on("mousemove", (ev: MouseEvent) => tip.move(ev))
    .on("mouseleave", () => tip.hide());

  if (legend)
    legend.innerHTML =
      legendHtml(
        lanes
          .slice(0, 8)
          .map((x): [string, string] => [colors.group(x), x])
          .concat([["#ff6b6b", "in a cycle"]])
      ) + '<span class="hint">⌃ Ctrl / ⌘ Cmd + scroll to zoom · drag to pan</span>';
}

function drawMatrix(root: HTMLElement, facts: DerivedFacts, tip: Tip): void {
  const container = root.querySelector<HTMLElement>("#c-matrix");
  if (!container) return;
  container.innerHTML = "";
  const degree = new Set<string>();
  for (const e of facts.imports) {
    degree.add(e.source);
    degree.add(e.target);
  }
  const all = facts.files.filter((f) => degree.has(f.id)).sort((a, b) => d3.ascending(a.relativePath, b.relativePath));
  if (!all.length) {
    container.innerHTML = '<p class="cap">No connected files to show in the matrix.</p>';
    return;
  }

  const rowFilter = root.querySelector<HTMLSelectElement>("#mx-rows")?.value ?? "";
  const colFilter = root.querySelector<HTMLSelectElement>("#mx-cols")?.value ?? "";
  const rows = rowFilter ? all.filter((f) => groupOf(f.relativePath) === rowFilter) : all;
  const cols = colFilter ? all.filter((f) => groupOf(f.relativePath) === colFilter) : all;
  if (!rows.length || !cols.length) {
    container.innerHTML = '<p class="cap">No files match the selected row/column modules.</p>';
    return;
  }

  const rowIdx = new Map(rows.map((n, i) => [n.id, i]));
  const colIdx = new Map(cols.map((n, i) => [n.id, i]));
  const cs = 11;
  const pad = { l: 300, t: 250 };
  const w = cs * cols.length;
  const h = cs * rows.length;
  const svg = d3.select(container).append("svg").attr("width", pad.l + w + 16).attr("height", pad.t + h + 16);
  const g = svg.append("g").attr("transform", `translate(${pad.l},${pad.t})`);
  g.append("rect").attr("width", w).attr("height", h).attr("fill", "#0d1014");
  g.selectAll("line.h").data(rows).join("line").attr("x1", 0).attr("x2", w).attr("y1", (_d, i) => i * cs).attr("y2", (_d, i) => i * cs).attr("stroke", "#161a20");
  g.selectAll("line.v").data(cols).join("line").attr("y1", 0).attr("y2", h).attr("x1", (_d, i) => i * cs).attr("x2", (_d, i) => i * cs).attr("stroke", "#161a20");

  const cells = facts.imports
    .filter((e) => rowIdx.has(e.source) && colIdx.has(e.target))
    .map((e) => ({ r: rowIdx.get(e.source) as number, c: colIdx.get(e.target) as number, w: e.weight || 1, s: e.source, t: e.target }));
  const wmax = d3.max(cells, (c) => c.w) || 1;
  g
    .selectAll("rect.c")
    .data(cells)
    .join("rect")
    .attr("x", (d) => d.c * cs)
    .attr("y", (d) => d.r * cs)
    .attr("width", cs - 1)
    .attr("height", cs - 1)
    .attr("fill", (d) => (facts.cyclePairs.has(`${d.s}|${d.t}`) ? "#ff6b6b" : "#63b3ff"))
    .attr("fill-opacity", (d) => 0.4 + 0.6 * (d.w / wmax))
    .on("mouseenter", (ev: MouseEvent, d) =>
      tip.show(
        ev,
        `<b>${escapeHtml(rows[d.r].name)}</b> imports <b>${escapeHtml(cols[d.c].name)}</b><br /><span class="d">${escapeHtml(
          rows[d.r].relativePath
        )}</span><br /><span class="d">→ ${escapeHtml(cols[d.c].relativePath)}</span>${
          facts.cyclePairs.has(`${d.s}|${d.t}`) ? '<br /><span style="color:#ff6b6b">part of a cycle</span>' : ""
        }`
      )
    )
    .on("mousemove", (ev: MouseEvent) => tip.move(ev))
    .on("mouseleave", () => tip.hide());

  g
    .selectAll("text.r")
    .data(rows)
    .join("text")
    .attr("x", -6)
    .attr("y", (_d, i) => i * cs + cs / 2 + 3)
    .attr("text-anchor", "end")
    .attr("font-family", "var(--mono)")
    .attr("font-size", 9)
    .attr("fill", (d) => (facts.cycleNodes.has(d.id) ? "#ff6b6b" : "#7f8894"))
    .text((d) => (d.relativePath ?? "").slice(-46));
  g
    .selectAll("text.c")
    .data(cols)
    .join("text")
    .attr("transform", (_d, i) => `translate(${i * cs + cs / 2 + 3},-6) rotate(-90)`)
    .attr("font-family", "var(--mono)")
    .attr("font-size", 9)
    .attr("fill", (d) => (facts.cycleNodes.has(d.id) ? "#ff6b6b" : "#7f8894"))
    .text((d) => d.name.slice(0, 28));
}

function drawHotspots(root: HTMLElement, facts: DerivedFacts, colors: ReportColorScales, tip: Tip): void {
  const container = root.querySelector<HTMLElement>("#c-hot");
  if (!container) return;
  const { svg, width, height } = chartSvg(container, 420);
  const data = facts.files.filter((f) => (f.churn ?? 0) > 0 || (f.complexity ?? 0) > 0);
  if (!data.length) {
    container.innerHTML = '<p class="cap">No files with churn or complexity data to plot.</p>';
    return;
  }
  const m = { l: 58, r: 26, t: 30, b: 46 };
  const x = d3.scaleLinear().domain([0, d3.max(data, (d) => d.churn ?? 0) || 1]).nice().range([m.l, width - m.r]);
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.complexity ?? 0) || 1]).nice().range([height - m.b, m.t]);
  const r = d3.scaleSqrt().domain([0, d3.max(data, (d) => d.loc ?? 1) || 1]).range([3, 24]);
  const axisStyle = (sel: d3.Selection<SVGGElement, unknown, null, undefined>): void => {
    sel.selectAll("text").attr("fill", "#5b636e").attr("font-family", "var(--mono)").attr("font-size", 10);
    sel.selectAll("line,path").attr("stroke", "#232830");
  };
  svg.append("g").attr("transform", `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(6, "~s")).call(axisStyle);
  svg.append("g").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6, "~s")).call(axisStyle);
  svg
    .append("text")
    .attr("x", width - m.r)
    .attr("y", height - 10)
    .attr("text-anchor", "end")
    .attr("fill", "#5b636e")
    .attr("font-family", "var(--mono)")
    .attr("font-size", 10)
    .text("churn — lines changed →");
  svg
    .append("text")
    .attr("x", m.l)
    .attr("y", m.t - 12)
    .attr("text-anchor", "start")
    .attr("fill", "#5b636e")
    .attr("font-family", "var(--mono)")
    .attr("font-size", 10)
    .text("complexity ↑");

  const g2 = svg.append("g");
  g2
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", (d) => x(d.churn ?? 0))
    .attr("cy", (d) => y(d.complexity ?? 0))
    .attr("r", (d) => r(d.loc ?? 1))
    .attr("fill", (d) => colors.risk(d.riskScore ?? 0))
    .attr("fill-opacity", 0.28)
    .attr("stroke", (d) => colors.risk(d.riskScore ?? 0))
    .attr("stroke-width", 1.2)
    .on("mouseenter", (ev: MouseEvent, d) =>
      tip.show(
        ev,
        `<b>${escapeHtml(d.name)}</b><br /><span class="d">${escapeHtml(d.relativePath ?? "")}</span><br /><span class="d">risk</span> ${
          d.riskScore ?? 0
        } · <span class="d">churn</span> ${N(d.churn ?? 0)} · <span class="d">cx</span> ${d.complexity ?? 0} · <span class="d">loc</span> ${N(
          d.loc ?? 0
        )}`
      )
    )
    .on("mousemove", (ev: MouseEvent) => tip.move(ev))
    .on("mouseleave", () => tip.hide());

  const labels = data
    .slice()
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
    .slice(0, 6);
  g2
    .selectAll("text")
    .data(labels)
    .join("text")
    .attr("x", (d) => Math.min(width - m.r - 30, Math.max(m.l + 24, x(d.churn ?? 0))))
    .attr("y", (d) => y(d.complexity ?? 0) - r(d.loc ?? 1) - 5)
    .attr("text-anchor", "middle")
    .attr("font-family", "var(--mono)")
    .attr("font-size", 10)
    .attr("fill", "#9aa3af")
    .text((d) => d.name);
}

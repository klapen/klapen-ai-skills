import * as d3 from "d3";
import { escapeHtml } from "./escape";
import { fmt } from "./derive";
import type { ViewContext } from "./viewContext";
import type { CodeNode } from "../shared/types";

const SYMBOL_LANES = ["class", "interface", "function", "method"];

export function renderSymbols(ctx: ViewContext): void {
  const { derived, state, stage, toolbar, select, showTip, hideTip, moveTip } = ctx;

  const withSyms = derived.files
    .filter((f) => (derived.symsByFile.get(f.id) ?? []).length > 0)
    .sort((a, b) => (derived.symsByFile.get(b.id)?.length ?? 0) - (derived.symsByFile.get(a.id)?.length ?? 0));

  let symFile = state.symFile;
  if (!symFile || !derived.symsByFile.has(symFile)) {
    symFile = withSyms.length ? withSyms[0].id : null;
    if (symFile !== state.symFile) state.symFile = symFile;
  }

  toolbar.innerHTML =
    `<span class="rk-toolbar__title">Symbols</span>` +
    `<label>file <select data-k="symfile" style="max-width:420px">${withSyms
      .map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.relativePath)} (${derived.symsByFile.get(f.id)?.length ?? 0})</option>`)
      .join("")}</select></label>` +
    `<span class="rk-sp"></span><span class="rk-toolbar__note">bubble = symbol · size = LOC · colour = complexity</span>`;
  const sel = toolbar.querySelector<HTMLSelectElement>('[data-k="symfile"]');
  if (sel && symFile) {
    sel.value = symFile;
    sel.onchange = (e) => state.setSymFile((e.target as HTMLSelectElement).value);
  }

  stage.className = "rk-stage";
  if (!symFile) {
    stage.innerHTML = '<div class="rk-hint-empty">No parsed symbols.</div>';
    return;
  }

  const file = derived.byId.get(symFile);
  if (!file) return;
  const syms = (derived.symsByFile.get(symFile) ?? []).filter((s) =>
    state.filters.search ? `${s.name} ${s.relativePath ?? ""}`.toLowerCase().includes(state.filters.search.toLowerCase()) : true
  );

  const w = stage.clientWidth || 900;
  const h = stage.clientHeight || 480;
  const svg = d3.select(stage).append("svg").attr("width", w).attr("height", h).style("display", "block");

  const lanes = SYMBOL_LANES.filter((k) => syms.some((s) => s.kind === k));
  const laneW = w / Math.max(1, lanes.length);
  const cScale = d3
    .scaleSequential(d3.interpolateRgbBasis(["#3fb9a8", "#63b3ff", "#e6b450", "#ff6b6b"]))
    .domain([1, d3.max(syms, (s) => s.complexity ?? 1) || 1]);
  const r = d3
    .scaleSqrt()
    .domain([0, d3.max(syms, (s) => s.loc ?? 1) || 1])
    .range([8, 46]);

  svg.append("text").attr("x", 16).attr("y", 26).attr("fill", "#dfe3e8").attr("font-size", 12).text(file.relativePath);
  svg
    .append("text")
    .attr("x", 16)
    .attr("y", 44)
    .attr("fill", "#5b636e")
    .attr("font-size", 11)
    .text(`${syms.length} symbols · ${fmt(file.loc ?? 0)} LOC · fan-in ${file.fanIn ?? 0} · fan-out ${file.fanOut ?? 0}`);

  lanes.forEach((k, i) => {
    svg
      .append("text")
      .attr("x", laneW * (i + 0.5))
      .attr("y", 78)
      .attr("text-anchor", "middle")
      .attr("fill", "#5b636e")
      .attr("font-size", 10)
      .attr("letter-spacing", ".08em")
      .text(`${k.toUpperCase()} · ${syms.filter((s) => s.kind === k).length}`);
    if (i) svg.append("line").attr("x1", laneW * i).attr("x2", laneW * i).attr("y1", 64).attr("y2", h - 16).attr("stroke", "#1a1e25");
  });

  interface SymNode extends CodeNode {
    lane: number;
    x?: number;
    y?: number;
  }
  const nodes: SymNode[] = syms.map((s) => ({ ...s, lane: lanes.indexOf(s.kind) }));
  const gg = svg.append("g");
  const node = gg
    .selectAll<SVGGElement, SymNode>("g")
    .data(nodes)
    .join("g")
    .style("cursor", "pointer")
    .on("mouseenter", (ev, d) =>
      showTip(
        ev,
        `<b>${escapeHtml(d.name)}</b><br /><span class="rk-tip__d">${escapeHtml(d.kind)} · loc</span> ${d.loc ?? 0} <span class="rk-tip__d">· complexity</span> ${d.complexity ?? 0} <span class="rk-tip__d">· nesting</span> ${d.nestingDepth ?? 0}`
      )
    )
    .on("mousemove", (ev) => moveTip(ev))
    .on("mouseleave", () => hideTip())
    .on("click", (_ev, d) => select(d.id));

  node
    .append("circle")
    .attr("r", (d) => r(d.loc || 1))
    .attr("fill", (d) => cScale(d.complexity || 1))
    .attr("fill-opacity", 0.22)
    .attr("stroke", (d) => (d.id === state.selectedNodeId ? "#fff" : cScale(d.complexity || 1)))
    .attr("stroke-width", (d) => (d.id === state.selectedNodeId ? 2.5 : 1.4))
    .attr("data-node", (d) => d.id);
  node
    .append("text")
    .text((d) => d.name)
    .attr("text-anchor", "middle")
    .attr("dy", 3)
    .attr("font-size", (d) => Math.min(12, Math.max(8, r(d.loc || 1) / 2.6)))
    .attr("fill", "#cfd5dd")
    .attr("pointer-events", "none");

  const stick = (): void => {
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  };
  nodes.forEach((d, i) => {
    d.x = laneW * (d.lane + 0.5) + ((i % 5) - 2) * 6;
    d.y = (h + 90) / 2 + ((i % 7) - 3) * 8;
  });
  const sim = d3
    .forceSimulation(nodes)
    .stop()
    .force("x", d3.forceX<SymNode>((d) => laneW * (d.lane + 0.5)).strength(0.5))
    .force("y", d3.forceY((h + 90) / 2).strength(0.09))
    .force(
      "collide",
      d3.forceCollide<SymNode>((d) => r(d.loc || 1) + 4).iterations(2)
    )
    .on("tick", stick);
  for (let i = 0; i < 300; i += 1) sim.tick();
  stick();

  const hint = document.createElement("div");
  hint.className = "rk-hint";
  hint.textContent = "click a symbol for details · use the search box to filter by name";
  stage.appendChild(hint);
}

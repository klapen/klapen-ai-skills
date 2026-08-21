import type { RepositoryData } from "../shared/types";
import { AppState } from "./state";
import { renderRepoMap } from "./repoMap";
import { renderDepMatrix } from "./depMatrix";
import { renderHotspots } from "./hotspots";

declare global {
  interface Window {
    __REPO_ARCH_DATA__?: RepositoryData;
  }
}

function renderInspector(container: HTMLElement, data: RepositoryData, nodeId: string | null): void {
  const node = nodeId ? data.nodes.find((n) => n.id === nodeId) : undefined;
  if (!node) {
    container.textContent = "Select a file or symbol to see details.";
    return;
  }
  const incoming = data.edges.filter((e) => e.target === nodeId).length;
  const outgoing = data.edges.filter((e) => e.source === nodeId).length;
  container.innerHTML = "";
  const rows: Array<[string, string]> = [
    ["Path", node.relativePath],
    ["Kind", node.kind],
    ["Language", node.language ?? "—"],
    ["Risk score", String(node.riskScore ?? "—")],
    ["Complexity", String(node.complexity ?? "—")],
    ["Churn", String(node.churn ?? "—")],
    ["Fan-in / Fan-out", `${incoming} / ${outgoing}`],
    ["Cycle membership", node.cycleCount ? `${node.cycleCount} cycle(s)` : "none"],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "rk-inspector__row";
    const labelSpan = document.createElement("span");
    labelSpan.className = "rk-inspector__label";
    labelSpan.textContent = label;
    const valueSpan = document.createElement("span");
    valueSpan.className = "rk-inspector__value";
    // Use textContent (not innerHTML) — `value` includes node fields (e.g. relativePath) drawn
    // straight from the analyzed repository, which may be untrusted. Any field value must never
    // be parsed as markup.
    valueSpan.textContent = value;
    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    container.appendChild(row);
  }
}

function bindControl(id: string, event: string, handler: (el: HTMLInputElement) => void): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener(event, () => handler(el));
}

export function bootstrapReport(): void {
  const data = window.__REPO_ARCH_DATA__;
  if (!data) return;

  const state = new AppState();

  const mapContainer = document.getElementById("rk-repo-map");
  const matrixContainer = document.getElementById("rk-dep-matrix");
  const hotspotsContainer = document.getElementById("rk-hotspots");
  const inspectorContainer = document.getElementById("rk-inspector");

  const mapHandle = mapContainer ? renderRepoMap(mapContainer, data, state) : null;
  const matrixHandle = matrixContainer ? renderDepMatrix(matrixContainer, data, state) : null;
  const hotspotsHandle = hotspotsContainer ? renderHotspots(hotspotsContainer, data, state) : null;

  if (inspectorContainer) {
    renderInspector(inspectorContainer, data, state.selectedNodeId);
    state.subscribe(() => renderInspector(inspectorContainer, data, state.selectedNodeId));
  }

  bindControl("rk-search", "input", (el) => state.setFilter("search", el.value));
  bindControl("rk-show-tests", "change", (el) => state.setFilter("showTests", el.checked));
  bindControl("rk-min-risk", "input", (el) => state.setFilter("minRisk", Number(el.value) || 0));
  bindControl("rk-reset", "click", () => state.reset());
  bindControl("rk-layout-toggle", "change", (el) => mapHandle?.setLayout(el.value as "icicle" | "treemap"));
  bindControl("rk-metric-select", "change", (el) =>
    mapHandle?.setMetric(el.value as "loc" | "riskScore" | "complexity" | "churn")
  );
  bindControl("rk-edge-type-select", "change", (el) => matrixHandle?.setEdgeType(el.value as "import" | "co-change"));
  bindControl("rk-order-select", "change", (el) => matrixHandle?.setOrder(el.value as "hierarchy" | "fanIn"));
  bindControl("rk-logscale-checkbox", "change", (el) => hotspotsHandle?.setLogScale(el.checked));
}

bootstrapReport();

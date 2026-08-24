import { escapeHtml } from "./escape";
import { fmt, deriveContext } from "./derive";
import { AppState } from "./state";
import type { ViewId } from "./state";
import { renderDetail } from "./detail";
import { renderOverview } from "./overview";
import { renderGraph } from "./graph";
import { renderSymbols } from "./symbols";
import { renderRepoMap } from "./repoMap";
import { renderDepMatrix } from "./depMatrix";
import { renderHotspots } from "./hotspots";
import type { RepositoryData } from "../shared/types";
import type { ViewContext, ViewRenderer } from "./viewContext";

const VIEW_RENDERERS: Record<ViewId, ViewRenderer> = {
  overview: renderOverview,
  graph: renderGraph,
  symbols: renderSymbols,
  map: renderRepoMap,
  matrix: renderDepMatrix,
  hotspots: renderHotspots,
};

function viewList(hasNarrative: boolean): Array<{ id: ViewId; label: string }> {
  return [
    ...(hasNarrative ? [{ id: "overview" as const, label: "Overview" }] : []),
    { id: "graph" as const, label: "Dependency graph" },
    { id: "symbols" as const, label: "Symbols" },
    { id: "map" as const, label: "Repo map" },
    { id: "matrix" as const, label: "Matrix" },
    { id: "hotspots" as const, label: "Hotspots" },
  ];
}

export function boot(root: HTMLElement, data: RepositoryData): void {
  const hasNarrative = Boolean(data.narrative);
  const views = viewList(hasNarrative);
  const state = new AppState(hasNarrative ? "overview" : "graph");
  const derived = deriveContext(data);

  const header = root.querySelector<HTMLElement>("#rk-repo-name");
  const branch = root.querySelector<HTMLElement>("#rk-branch");
  const commit = root.querySelector<HTMLElement>("#rk-commit");
  const generated = root.querySelector<HTMLElement>("#rk-generated");
  const navViews = root.querySelector<HTMLElement>("#rk-nav-views");
  const stats = root.querySelector<HTMLElement>("#rk-stats");
  const search = root.querySelector<HTMLInputElement>("#rk-search");
  const filterTests = root.querySelector<HTMLInputElement>("#rk-filter-tests");
  const filterIsolated = root.querySelector<HTMLInputElement>("#rk-filter-isolated");
  const filterRisk = root.querySelector<HTMLInputElement>("#rk-filter-risk");
  const filterRiskValue = root.querySelector<HTMLElement>("#rk-filter-risk-value");
  const resetButton = root.querySelector<HTMLButtonElement>("#rk-reset");
  const toolbar = root.querySelector<HTMLElement>("#rk-toolbar");
  const stage = root.querySelector<HTMLElement>("#rk-stage");
  const detail = root.querySelector<HTMLElement>("#rk-detail");
  const tip = root.querySelector<HTMLElement>("#rk-tip");

  if (!navViews || !toolbar || !stage || !detail || !tip) return;
  // Rebind as fresh consts: TS narrows a `const` to its non-null initializer type at the point
  // of declaration, but does NOT preserve narrowing of the *original* variable across the
  // nested closures below (render(), keydown handler, resize handler) — this sidesteps that.
  const navViewsEl = navViews;
  const toolbarEl = toolbar;
  const stageEl = stage;
  const detailEl = detail;
  const tipEl = tip;

  if (header) header.textContent = data.metadata.repositoryName;
  if (branch) branch.textContent = data.metadata.gitBranch ?? "";
  if (commit) commit.textContent = (data.metadata.gitCommit ?? "").slice(0, 7);
  if (generated) {
    generated.textContent = data.metadata.isDirty ? "dirty worktree" : "clean worktree";
    generated.classList.toggle("rk-chip--dirty", Boolean(data.metadata.isDirty));
  }

  navViews.innerHTML = views.map((v) => `<button type="button" data-view="${v.id}"><i></i>${escapeHtml(v.label)}</button>`).join("");
  navViews.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => state.setView(btn.dataset.view as ViewId));
  });

  if (stats) {
    const s = data.summary;
    const rows: Array<[string, string]> = [
      ["files", fmt(s.files)],
      ["source", fmt(s.sourceFiles)],
      ["symbols", fmt(derived.symbols.length)],
      ["LOC", fmt(s.linesOfCode)],
      ["edges", fmt(s.dependencyEdges)],
      ["cycles", fmt(s.cycles)],
    ];
    stats.innerHTML = rows.map(([k, v]) => `<div><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("");
  }

  if (search) {
    search.addEventListener("input", () => state.setFilter("search", search.value.trim()));
  }
  if (filterTests) {
    filterTests.checked = state.filters.showTests;
    filterTests.addEventListener("change", () => state.setFilter("showTests", filterTests.checked));
  }
  if (filterIsolated) {
    filterIsolated.checked = state.filters.hideIsolated;
    filterIsolated.addEventListener("change", () => state.setFilter("hideIsolated", filterIsolated.checked));
  }
  if (filterRisk) {
    const maxRisk = Math.max(10, Math.ceil(derived.maxRisk));
    filterRisk.max = String(maxRisk);
    filterRisk.value = String(state.filters.minRisk);
    filterRisk.addEventListener("input", () => {
      const value = Number(filterRisk.value) || 0;
      if (filterRiskValue) filterRiskValue.textContent = String(value);
      state.setFilter("minRisk", value);
    });
  }
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      state.reset();
      if (search) search.value = "";
      if (filterTests) filterTests.checked = true;
      if (filterIsolated) filterIsolated.checked = true;
      if (filterRisk) filterRisk.value = "0";
      if (filterRiskValue) filterRiskValue.textContent = "0";
    });
  }

  root.addEventListener("keydown", (ev) => {
    if (ev.key === "/" && document.activeElement !== search) {
      ev.preventDefault();
      search?.focus();
    }
    if (ev.key === "Escape") {
      state.select(null);
    }
  });

  function showTip(ev: MouseEvent, html: string): void {
    tipEl.innerHTML = html;
    tipEl.style.opacity = "1";
    moveTip(ev);
  }
  function hideTip(): void {
    tipEl.style.opacity = "0";
  }
  function moveTip(ev: MouseEvent): void {
    const rect = tipEl.getBoundingClientRect();
    let x = ev.clientX + 14;
    let y = ev.clientY + 14;
    if (typeof innerWidth === "number" && x + rect.width > innerWidth - 8) x = ev.clientX - rect.width - 14;
    if (typeof innerHeight === "number" && y + rect.height > innerHeight - 8) y = ev.clientY - rect.height - 14;
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${y}px`;
  }

  function select(id: string): void {
    state.select(id);
  }

  function render(): void {
    navViewsEl.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach((btn) => {
      btn.setAttribute("aria-current", String(btn.dataset.view === state.view));
    });
    toolbarEl.innerHTML = "";
    stageEl.innerHTML = "";
    stageEl.className = "rk-stage";
    hideTip();

    const ctx: ViewContext = { data, derived, state, stage: stageEl, toolbar: toolbarEl, select, showTip, hideTip, moveTip };
    const renderer = VIEW_RENDERERS[state.view] ?? VIEW_RENDERERS.graph;
    renderer(ctx);

    renderDetail(detailEl, derived, state, select);
    syncHash(state);
  }

  readHash(state, derived, views);
  state.subscribe(render);
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener?.("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 180);
  });

  render();
}

function syncHash(state: AppState): void {
  if (typeof location === "undefined") return;
  try {
    const params = new URLSearchParams();
    params.set("v", state.view);
    if (state.selectedNodeId) params.set("s", state.selectedNodeId);
    history.replaceState?.(null, "", `#${params.toString()}`);
  } catch {
    // Hash sync is a convenience feature only — never let it break rendering
    // (e.g. under jsdom without a full `history`/`location` implementation).
  }
}

function readHash(state: AppState, derived: ReturnType<typeof deriveContext>, views: Array<{ id: ViewId }>): void {
  if (typeof location === "undefined") return;
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    const v = params.get("v");
    if (v && views.some((view) => view.id === v)) state.view = v as ViewId;
    const s = params.get("s");
    if (s && derived.byId.has(s)) state.selectedNodeId = s;
  } catch {
    // Malformed/absent hash — start from defaults.
  }
}

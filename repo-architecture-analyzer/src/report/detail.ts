import { escapeHtml } from "./escape";
import { fmt } from "./derive";
import type { Derived } from "./derive";
import type { AppState } from "./state";
import type { CodeNode } from "../shared/types";

function listHtml(nodes: CodeNode[], metric?: (n: CodeNode) => number | string | undefined): string {
  return `<div class="rk-list">${nodes
    .map(
      (n) =>
        `<a href="#" class="rk-list__row" data-id="${escapeHtml(n.id)}" title="${escapeHtml(n.relativePath ?? "")}">` +
        `<span>${escapeHtml(n.name)}</span>` +
        `<span class="rk-list__meta">${metric ? escapeHtml(metric(n) ?? "") : ""}</span></a>`
    )
    .join("")}</div>`;
}

function bar(label: string, value: number | undefined, max: number): string {
  const v = value ?? 0;
  const pct = Math.min(100, (v / Math.max(1, max)) * 100);
  return `<div class="rk-bar"><div class="rk-bar__l"><span>${escapeHtml(label)}</span><span>${escapeHtml(v)}</span></div><div class="rk-bar__t"><div class="rk-bar__f" style="width:${pct}%"></div></div></div>`;
}

function wireLinks(container: HTMLElement, onSelect: (id: string) => void): void {
  container.querySelectorAll<HTMLAnchorElement>("[data-id]").forEach((a) => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      const id = a.dataset.id;
      if (id) onSelect(id);
    });
  });
}

export function renderDetail(container: HTMLElement, derived: Derived, state: AppState, onSelect: (id: string) => void): void {
  const { byId, files, symsByFile, imports, cochange, cycleNodes, maxRisk } = derived;
  const node = state.selectedNodeId ? byId.get(state.selectedNodeId) : undefined;

  if (!node) {
    const byFanIn = [...files].sort((a, b) => (b.fanIn ?? 0) - (a.fanIn ?? 0)).slice(0, 6);
    const byRisk = [...files].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 6);
    container.innerHTML =
      `<h4>Selection</h4><p class="rk-empty">Nothing selected.<br />Click a node in any view.</p>` +
      `<h4>Highest fan-in</h4>${listHtml(byFanIn, (n) => n.fanIn)}` +
      `<h4>Highest risk</h4>${listHtml(byRisk, (n) => n.riskScore)}`;
    wireLinks(container, onSelect);
    return;
  }

  const isFile = node.kind === "file";
  const tags: string[] = [`<span class="rk-tag">${escapeHtml(node.kind)}</span>`];
  if (node.isTest) tags.push('<span class="rk-tag rk-tag--warn">test</span>');
  if (node.isGenerated) tags.push('<span class="rk-tag">generated</span>');
  if (cycleNodes.has(node.id)) tags.push('<span class="rk-tag rk-tag--bad">in cycle</span>');
  if (isFile && (node.fanIn ?? 0) >= 8) tags.push(`<span class="rk-tag">hub · fan-in ${escapeHtml(node.fanIn)}</span>`);

  const rows: string[] = [];
  const addRow = (label: string, value: string | number | undefined | null): void => {
    if (value !== undefined && value !== null && value !== "") {
      rows.push(`<span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b>`);
    }
  };
  addRow("LOC", node.loc !== undefined ? fmt(node.loc) : undefined);
  addRow("complexity", node.complexity);
  addRow("nesting", node.nestingDepth);
  addRow("risk score", node.riskScore);
  addRow("fan-in", node.fanIn);
  addRow("fan-out", node.fanOut);
  addRow("instability", node.instability !== undefined ? node.instability.toFixed(2) : undefined);
  addRow("churn", node.churn !== undefined ? fmt(node.churn) : undefined);
  addRow("commits", node.commitCount);
  addRow("contributors", node.contributorCount);
  addRow("modified", node.lastModified ? node.lastModified.slice(0, 10) : undefined);

  const syms = symsByFile.get(node.id) ?? [];

  let extra: string;
  if (isFile) {
    const depOut = imports
      .filter((e) => e.source === node.id)
      .map((e) => byId.get(e.target))
      .filter((n): n is CodeNode => !!n);
    const depIn = imports
      .filter((e) => e.target === node.id)
      .map((e) => byId.get(e.source))
      .filter((n): n is CodeNode => !!n);
    const co = cochange
      .filter((e) => e.source === node.id || e.target === node.id)
      .map((e) => ({ node: byId.get(e.source === node.id ? e.target : e.source), w: e.weight, c: e.confidence }))
      .filter((d) => d.node !== undefined) as Array<{ node: CodeNode; w: number; c?: number }>;

    const bars = [
      bar("risk", node.riskScore, Math.max(1, maxRisk)),
      bar("complexity", node.complexity, Math.max(1, ...files.map((f) => f.complexity ?? 0))),
      bar("churn", node.churn, Math.max(1, ...files.map((f) => f.churn ?? 0))),
    ].join("");

    extra =
      `<div class="rk-bars">${bars}</div>` +
      `<h4>Depends on <span class="rk-dim">${depOut.length}</span></h4>${depOut.length ? listHtml(depOut, (n) => n.fanIn) : '<p class="rk-empty">none</p>'}` +
      `<h4>Depended on by <span class="rk-dim">${depIn.length}</span></h4>${depIn.length ? listHtml(depIn, (n) => n.fanOut) : '<p class="rk-empty">none</p>'}` +
      `<h4>Changes together with <span class="rk-dim">${co.length}</span></h4>${
        co.length
          ? `<div class="rk-list">${co
              .map(
                (c) =>
                  `<a href="#" class="rk-list__row" data-id="${escapeHtml(c.node.id)}"><span>${escapeHtml(c.node.name)}</span>` +
                  `<span class="rk-list__meta">${c.w}× · ${Math.round((c.c ?? 0) * 100)}%</span></a>`
              )
              .join("")}</div>`
          : '<p class="rk-empty">none</p>'
      }` +
      `<h4>Symbols <span class="rk-dim">${syms.length}</span></h4>${syms.length ? listHtml([...syms].sort((a, b) => (b.loc ?? 0) - (a.loc ?? 0)), (s) => s.kind) : '<p class="rk-empty">none parsed</p>'}`;
  } else {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const siblings = (node.parentId ? symsByFile.get(node.parentId) ?? [] : []).filter((s) => s.id !== node.id).slice(0, 20);
    extra =
      `<h4>Defined in</h4>${parent ? listHtml([parent]) : '<p class="rk-empty">none</p>'}` +
      `<h4>Siblings</h4>${siblings.length ? listHtml(siblings, (s) => s.kind) : '<p class="rk-empty">none</p>'}`;
  }

  container.innerHTML =
    `<h3>${escapeHtml(node.name)}</h3><div class="rk-path">${escapeHtml(node.relativePath ?? "")}</div><div>${tags.join("")}</div>` +
    `${rows.length ? `<h4>Metrics</h4><div class="rk-kv">${rows.join("")}</div>` : ""}` +
    extra;
  wireLinks(container, onSelect);
}

import type { RepositoryData, NarrativeContent } from "../shared/types";

export interface BuildReportHtmlOptions {
  reportRuntimeJs: string;
}

const REPORT_CSS = `
:root { --rk-bg:#1e1e2e; --rk-deep:#181825; --rk-surface:#313244; --rk-text:#cdd6f4; --rk-dim:#a6adc8; --rk-accent:#89b4fa; --rk-ok:#a6e3a1; --rk-warn:#f9e2af; --rk-bad:#f38ba8; }
* { box-sizing: border-box; }
body { margin:0; background:var(--rk-bg); color:var(--rk-text); font-family: ui-sans-serif, system-ui, sans-serif; }
header.rk-topbar { padding:12px 20px; background:var(--rk-deep); display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
header.rk-topbar h1 { font-size:16px; margin:0; }
main { padding:20px; display:grid; gap:24px; }
section.rk-view { background:var(--rk-surface); border-radius:8px; padding:16px; overflow-x:auto; }
section.rk-view h2 { margin-top:0; font-size:14px; text-transform:uppercase; letter-spacing:0.04em; color:var(--rk-dim); }
.rk-controls { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:12px; font-size:13px; }
#rk-inspector { background:var(--rk-deep); border-radius:8px; padding:12px; font-size:13px; }
.rk-inspector__row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--rk-surface); }
.rk-matrix-cell--violation { stroke: var(--rk-bad); stroke-width: 2px; }
`;

const NARRATIVE_CSS = `
.rk-narrative__list { margin:8px 0 16px; padding-left:20px; }
.rk-narrative__list li { margin-bottom:4px; }
.rk-view-narrative { color:var(--rk-dim); font-size:13px; margin:0 0 12px; }
`;

function escapeHtml(value: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (char) => map[char]);
}

function renderKeyInsights(insights: string[]): string {
  return `<ul class="rk-narrative__list">${insights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderReadingList(items: NarrativeContent["readingList"]): string {
  return `<ul class="rk-narrative__list">${items
    .map((item) => `<li><code>${escapeHtml(item.path)}</code> — ${escapeHtml(item.reason)}</li>`)
    .join("")}</ul>`;
}

function renderNarrativeBanner(narrative?: NarrativeContent): string {
  if (!narrative) return "";
  return `
  <section class="rk-view rk-narrative" id="rk-narrative">
    <h2>Walkthrough</h2>
    <p id="rk-narrative-summary">${escapeHtml(narrative.summary)}</p>
    <h3>Key insights</h3>
    <div id="rk-narrative-insights">${renderKeyInsights(narrative.keyInsights)}</div>
    <h3>Where to start reading</h3>
    <div id="rk-narrative-reading-list">${renderReadingList(narrative.readingList)}</div>
  </section>`;
}

function renderViewNarrative(id: string, text: string | undefined): string {
  if (!text) return "";
  return `<p class="rk-view-narrative" id="${id}">${escapeHtml(text)}</p>`;
}

export function buildReportHtml(data: RepositoryData, options: BuildReportHtmlOptions): string {
  const payload = JSON.stringify(data).replace(/</g, "\\u003c");
  const name = escapeHtml(data.metadata.repositoryName);
  const css = REPORT_CSS + (data.narrative ? NARRATIVE_CSS : "");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${name} — Architecture Report</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${css}</style>
</head>
<body>
<header class="rk-topbar">
  <h1>${name}</h1>
  <span>${escapeHtml(data.metadata.gitBranch ?? "")}</span>
  <input id="rk-search" type="search" placeholder="Search files, classes, functions..." />
  <label><input id="rk-show-tests" type="checkbox" checked /> show tests</label>
  <label>min risk <input id="rk-min-risk" type="range" min="0" max="100" value="0" /></label>
  <button id="rk-reset" type="button">Reset</button>
</header>
<main>
  ${renderNarrativeBanner(data.narrative)}
  <section class="rk-view">
    <h2>Repo map</h2>
    ${renderViewNarrative("rk-narrative-repo-map", data.narrative?.views.repoMap)}
    <div class="rk-controls">
      <select id="rk-layout-toggle"><option value="icicle">Icicle</option><option value="treemap">Treemap</option></select>
      <select id="rk-metric-select">
        <option value="loc">Lines of code</option>
        <option value="riskScore">Risk score</option>
        <option value="complexity">Complexity</option>
        <option value="churn">Churn</option>
      </select>
    </div>
    <div id="rk-repo-map"></div>
  </section>
  <section class="rk-view">
    <h2>Dependency matrix</h2>
    ${renderViewNarrative("rk-narrative-dep-matrix", data.narrative?.views.depMatrix)}
    <div class="rk-controls">
      <select id="rk-edge-type-select"><option value="import">Imports</option><option value="co-change">Co-change</option></select>
      <select id="rk-order-select"><option value="hierarchy">Hierarchy</option><option value="fanIn">Fan-in</option></select>
    </div>
    <div id="rk-dep-matrix"></div>
  </section>
  <section class="rk-view">
    <h2>Hotspots</h2>
    ${renderViewNarrative("rk-narrative-hotspots", data.narrative?.views.hotspots)}
    <div class="rk-controls">
      <label><input id="rk-logscale-checkbox" type="checkbox" /> log scale</label>
    </div>
    <div id="rk-hotspots"></div>
  </section>
  <section class="rk-view">
    <h2>Selected entity</h2>
    <div id="rk-inspector">Select a file or symbol to see details.</div>
  </section>
</main>
<script>window.__REPO_ARCH_DATA__ = ${payload};</script>
<script>${options.reportRuntimeJs}</script>
</body>
</html>`;
}

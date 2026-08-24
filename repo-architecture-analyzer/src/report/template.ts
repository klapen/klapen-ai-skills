import type { RepositoryData } from "../shared/types";

export interface BuildReportHtmlOptions {
  reportRuntimeJs: string;
}

const REPORT_CSS = `
:root{--rk-bg:#0a0b0d;--rk-panel:#0f1114;--rk-panel-2:#14171c;--rk-line:#212630;--rk-line-2:#2c3340;--rk-text:#dfe3e8;--rk-dim:#7f8894;--rk-dim-2:#5b636e;--rk-accent:#63b3ff;--rk-risk:#ff6b6b;--rk-warn:#e6b450;--rk-ok:#6ec28f;--rk-mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;--rk-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--rk-bg);color:var(--rk-text);font-family:var(--rk-sans);font-size:13px;overflow:hidden}
a{color:var(--rk-accent);text-decoration:none}
a:hover{color:#9acdff;text-decoration:underline}
button,select,input{font:inherit;color:inherit}
#rk-app{display:grid;grid-template-columns:196px 1fr;grid-template-rows:46px 1fr;height:100vh}
header.rk-header{grid-column:1/3;display:flex;align-items:center;gap:14px;padding:0 14px;background:var(--rk-panel);border-bottom:1px solid var(--rk-line)}
header.rk-header .rk-brand{display:flex;align-items:baseline;gap:9px;min-width:0}
header.rk-header .rk-brand b{font-size:13px;font-weight:600;letter-spacing:-.01em}
header.rk-header .rk-brand span{font-family:var(--rk-mono);font-size:11px;color:var(--rk-dim-2)}
.rk-chip{font-family:var(--rk-mono);font-size:10.5px;color:var(--rk-dim);background:var(--rk-panel-2);border:1px solid var(--rk-line);border-radius:3px;padding:2px 6px}
.rk-chip--dirty{color:var(--rk-warn);border-color:#3a3220}
#rk-search{flex:1;max-width:380px;margin-left:auto;background:var(--rk-panel-2);border:1px solid var(--rk-line);border-radius:4px;padding:6px 9px;font-family:var(--rk-mono);font-size:12px;outline:none}
#rk-search:focus{border-color:#33465e}
#rk-search::placeholder{color:var(--rk-dim-2)}
nav.rk-nav{background:var(--rk-panel);border-right:1px solid var(--rk-line);display:flex;flex-direction:column;padding:8px 0;overflow:auto}
nav.rk-nav .rk-lbl{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--rk-dim-2);padding:10px 14px 6px}
nav.rk-nav button{display:flex;align-items:center;gap:9px;width:100%;background:none;border:0;border-left:2px solid transparent;padding:7px 14px;text-align:left;color:var(--rk-dim);cursor:pointer}
nav.rk-nav button:hover{color:var(--rk-text);background:#13161a}
nav.rk-nav button[aria-current="true"]{color:var(--rk-text);background:#13171d;border-left-color:var(--rk-accent)}
nav.rk-nav button i{width:14px;height:14px;border-radius:2px;background:currentColor;opacity:.55;flex:none}
#rk-filters{padding:2px 14px 8px;display:grid;gap:7px}
#rk-filters label{display:flex;gap:6px;align-items:center;font-size:11.5px;color:var(--rk-dim)}
#rk-filters label.rk-range{display:grid;gap:3px}
#rk-filter-risk-value{font-family:var(--rk-mono);color:var(--rk-dim-2)}
#rk-filter-risk{width:100%;accent-color:var(--rk-accent)}
#rk-reset{margin:4px 14px 0;background:var(--rk-panel-2);border:1px solid var(--rk-line);border-radius:4px;padding:4px 8px;font-size:11px;color:var(--rk-dim);cursor:pointer;text-align:center}
#rk-reset:hover{color:var(--rk-text);border-color:var(--rk-line-2)}
#rk-stats{margin-top:auto;padding:12px 14px;border-top:1px solid var(--rk-line);display:grid;gap:5px}
#rk-stats div{display:flex;justify-content:space-between;font-family:var(--rk-mono);font-size:11px;color:var(--rk-dim-2)}
#rk-stats b{color:var(--rk-dim);font-weight:500}
main.rk-main{display:flex;min-width:0;min-height:0}
.rk-canvas{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
#rk-toolbar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:9px 14px;border-bottom:1px solid var(--rk-line);background:#0c0e11;min-height:44px}
.rk-toolbar__title{font-size:12px;font-weight:600;letter-spacing:-.01em;margin-right:2px}
.rk-toolbar__note{font-family:var(--rk-mono);font-size:11px;color:var(--rk-dim-2)}
#rk-toolbar label{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--rk-dim)}
#rk-toolbar select{background:var(--rk-panel-2);border:1px solid var(--rk-line);border-radius:4px;padding:4px 6px;font-size:11.5px}
#rk-toolbar input[type=range]{width:88px;accent-color:var(--rk-accent)}
#rk-toolbar input[type=checkbox]{accent-color:var(--rk-accent)}
.rk-sp{flex:1}
.rk-act{background:var(--rk-panel-2);border:1px solid var(--rk-line);border-radius:4px;padding:4px 9px;font-size:11.5px;color:var(--rk-dim);cursor:pointer}
.rk-act:hover{color:var(--rk-text);border-color:var(--rk-line-2)}
#rk-stage{flex:1;position:relative;min-height:0;overflow:hidden}
#rk-stage.rk-stage--scroll{overflow:auto;padding:16px}
.rk-hint{position:absolute;left:14px;bottom:12px;font-family:var(--rk-mono);font-size:10.5px;color:var(--rk-dim-2);pointer-events:none}
.rk-hint-empty{padding:40px;color:var(--rk-dim-2);font-family:var(--rk-mono);font-size:12px}
#rk-detail{width:330px;flex:none;border-left:1px solid var(--rk-line);background:var(--rk-panel);overflow:auto;padding:14px}
#rk-detail h3{margin:0 0 3px;font-size:13px;font-family:var(--rk-mono);word-break:break-all;font-weight:600}
.rk-path{font-family:var(--rk-mono);font-size:10.5px;color:var(--rk-dim-2);word-break:break-all;margin-bottom:12px}
#rk-detail h4{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--rk-dim-2);margin:16px 0 7px;font-weight:600}
.rk-dim{color:var(--rk-dim-2)}
.rk-kv{display:grid;grid-template-columns:1fr auto;gap:3px 10px;font-family:var(--rk-mono);font-size:11.5px}
.rk-kv span{color:var(--rk-dim-2)}
.rk-kv b{font-weight:500}
.rk-bars{display:grid;gap:7px;margin-top:4px}
.rk-bar{font-family:var(--rk-mono);font-size:11px}
.rk-bar__l{display:flex;justify-content:space-between;color:var(--rk-dim);margin-bottom:3px}
.rk-bar__t{height:3px;background:var(--rk-panel-2);border-radius:2px;overflow:hidden}
.rk-bar__f{height:3px;background:var(--rk-accent)}
.rk-list{display:grid;gap:1px}
.rk-list__row{display:flex;justify-content:space-between;gap:8px;font-family:var(--rk-mono);font-size:11px;padding:3px 5px;border-radius:3px;color:var(--rk-text);cursor:pointer}
.rk-list__row:hover{background:var(--rk-panel-2);text-decoration:none}
.rk-list__meta{color:var(--rk-dim-2);flex:none}
.rk-empty{color:var(--rk-dim-2);font-size:11.5px;font-family:var(--rk-mono)}
.rk-tag{display:inline-block;font-family:var(--rk-mono);font-size:10px;padding:1px 5px;border-radius:3px;background:var(--rk-panel-2);border:1px solid var(--rk-line);color:var(--rk-dim);margin:0 4px 4px 0}
.rk-tag--bad{color:var(--rk-risk);border-color:#3c2226}
.rk-tag--warn{color:var(--rk-warn);border-color:#3a3220}
.rk-tag--ok{color:var(--rk-ok);border-color:#22352a}
#rk-tip{position:fixed;pointer-events:none;z-index:50;background:rgba(8,10,13,.94);border:1px solid var(--rk-line-2);border-radius:4px;padding:6px 8px;font-family:var(--rk-mono);font-size:11px;color:var(--rk-text);opacity:0;transition:opacity .08s;max-width:320px}
.rk-tip__d{color:var(--rk-dim-2)}
.rk-overview{max-width:980px;margin:0 auto;padding:8px 4px 40px}
.rk-overview h2{font-size:15px;margin:0 0 10px;font-weight:600;letter-spacing:-.01em}
.rk-overview__sum{color:#c3c9d1;line-height:1.65;font-size:13.5px;margin:0 0 26px}
.rk-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:1px;background:var(--rk-line);border:1px solid var(--rk-line);border-radius:6px;overflow:hidden;margin-bottom:28px}
.rk-cards div{background:var(--rk-panel);padding:12px 13px}
.rk-cards b{display:block;font-family:var(--rk-mono);font-size:19px;font-weight:500;letter-spacing:-.02em}
.rk-cards span{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--rk-dim-2)}
.rk-overview h4{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--rk-dim-2);margin:0 0 10px;font-weight:600}
.rk-ins{display:grid;gap:9px;margin-bottom:28px}
.rk-ins li{list-style:none;padding-left:14px;position:relative;color:#b9c0c9;line-height:1.55}
.rk-ins li:before{content:"";position:absolute;left:0;top:7px;width:5px;height:5px;border-radius:1px;background:var(--rk-accent);opacity:.7}
.rk-rl{display:grid;gap:1px;background:var(--rk-line);border:1px solid var(--rk-line);border-radius:6px;overflow:hidden}
.rk-rl__item{display:block;width:100%;text-align:left;background:var(--rk-panel);border:0;padding:12px 14px;cursor:pointer}
.rk-rl__item:hover{background:var(--rk-panel-2)}
.rk-rl__item code{font-family:var(--rk-mono);font-size:12px;color:var(--rk-accent)}
.rk-rl__item p{margin:5px 0 0;color:var(--rk-dim);line-height:1.5;font-size:12px}
.rk-legend{position:absolute;right:10px;bottom:10px;max-height:44%;overflow:hidden;max-width:250px;background:rgba(10,12,15,.86);border:1px solid var(--rk-line);border-radius:5px;padding:7px 9px;font-family:var(--rk-mono);font-size:9.5px;display:grid;gap:3px;pointer-events:none;opacity:.93}
.rk-legend div{display:flex;align-items:center;gap:6px;color:var(--rk-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rk-legend i{width:8px;height:8px;border-radius:50%;flex:none}
::-webkit-scrollbar{width:9px;height:9px}
::-webkit-scrollbar-thumb{background:#232830;border-radius:5px}
::-webkit-scrollbar-track{background:transparent}
`;

function escapeHtml(value: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (char) => map[char]);
}

export function buildReportHtml(data: RepositoryData, options: BuildReportHtmlOptions): string {
  const payload = JSON.stringify(data).replace(/</g, "\\u003c");
  const name = escapeHtml(data.metadata.repositoryName);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${name} — Architecture Report</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${REPORT_CSS}</style>
</head>
<body>
<div id="rk-app">
  <header class="rk-header">
    <div class="rk-brand"><b id="rk-repo-name">—</b><span id="rk-branch"></span></div>
    <span class="rk-chip" id="rk-commit"></span>
    <span class="rk-chip" id="rk-generated"></span>
    <input id="rk-search" type="search" placeholder="filter files, symbols, paths…" />
  </header>
  <nav class="rk-nav">
    <div class="rk-lbl">Views</div>
    <div id="rk-nav-views"></div>
    <div class="rk-lbl">Filters</div>
    <div id="rk-filters">
      <label><input id="rk-filter-tests" type="checkbox" checked /> show tests</label>
      <label><input id="rk-filter-isolated" type="checkbox" checked /> hide isolated</label>
      <label class="rk-range">min risk <span id="rk-filter-risk-value">0</span><input id="rk-filter-risk" type="range" min="0" max="40" value="0" /></label>
    </div>
    <button id="rk-reset" type="button">Reset</button>
    <div id="rk-stats"></div>
  </nav>
  <main class="rk-main">
    <div class="rk-canvas">
      <div id="rk-toolbar"></div>
      <div id="rk-stage"></div>
    </div>
    <aside id="rk-detail"></aside>
  </main>
  <div id="rk-tip"></div>
</div>
<script>window.__REPO_ARCH_DATA__ = ${payload};</script>
<script>${options.reportRuntimeJs}</script>
</body>
</html>`;
}

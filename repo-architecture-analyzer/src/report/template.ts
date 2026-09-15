import type { RepositoryData } from "../shared/types";
import { escapeHtml } from "./escape";

export interface BuildReportHtmlOptions {
  reportRuntimeJs: string;
}

const REPORT_CSS = `
:root{--bg:#0a0b0d;--panel:#0f1114;--panel-2:#14171c;--line:#212630;--text:#dfe3e8;--dim:#7f8894;--dim-2:#5b636e;--accent:#63b3ff;--violet:#8b7bff;--teal:#3fb9a8;--amber:#e6b450;--risk:#ff6b6b;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:13px;line-height:1.5}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline;color:#9acdff}
.wrap{max-width:1180px;margin:0 auto;padding:0 40px 96px}
.wrap.head{padding-bottom:0}
.mast{padding:44px 0 22px}
.mast .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim-2);margin-bottom:12px}
.mast h1{font-size:34px;letter-spacing:-.025em;margin:0 0 10px;font-weight:600}
.mast .meta{display:flex;flex-wrap:wrap;gap:8px;font-family:var(--mono);font-size:11px;color:var(--dim)}
.mast .meta span{border:1px solid var(--line);border-radius:3px;padding:3px 7px;background:var(--panel);white-space:nowrap}
.mast .meta span.dirty{color:var(--amber);border-color:#3a3220}
.mast .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.seg{display:flex;border:1px solid var(--line);border-radius:5px;overflow:hidden;width:fit-content}
#lang-toggle.seg{flex:none}
.seg button{font-family:var(--mono);font-size:11px;color:var(--dim);background:var(--panel);border:0;padding:6px 12px;cursor:pointer}
.seg button+button{border-left:1px solid var(--line)}
.seg button:hover{color:var(--text)}
.seg button.on{color:var(--bg);background:var(--accent)}
nav.toc{position:sticky;top:0;z-index:20;margin-bottom:36px;background:rgba(10,11,13,.93);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
nav.toc .inner{max-width:1180px;margin:0 auto;padding:0 40px;display:flex;gap:20px;overflow:auto}
nav.toc a{font-family:var(--mono);font-size:11px;color:var(--dim);padding:11px 0;border-bottom:2px solid transparent;white-space:nowrap}
nav.toc a:hover{color:var(--text);text-decoration:none}
nav.toc a.on{color:var(--text);border-bottom-color:var(--accent)}
section{margin-bottom:60px;scroll-margin-top:60px}
h2{font-size:18px;letter-spacing:-.015em;margin:0 0 6px;font-weight:600}
h2 em{font-style:normal;color:var(--dim-2);font-family:var(--mono);font-size:12px;margin-left:9px;letter-spacing:0}
.lede{color:var(--dim);margin:0 0 20px;text-wrap:pretty}
h3{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim-2);margin:0 0 10px;font-weight:600}
.grid{display:grid;gap:20px}
.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:7px;padding:16px 18px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:7px;overflow:hidden}
@media (max-width:760px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
.stats div{background:var(--panel);padding:14px 16px}
.stats b{display:block;font-family:var(--mono);font-size:23px;font-weight:500;letter-spacing:-.03em}
.stats b small{font-size:12px;color:var(--dim-2);letter-spacing:0}
.stats span{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim-2)}
.sum{font-size:14.5px;line-height:1.72;color:#c6ccd4;text-wrap:pretty}
ul.ins{list-style:none;padding:0;margin:0;display:grid;gap:10px}
ul.ins li{padding-left:15px;position:relative;color:#b6bec8;text-wrap:pretty}
ul.ins li:before{content:"";position:absolute;left:0;top:8px;width:5px;height:5px;border-radius:1px;background:var(--accent);opacity:.75}
table{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11.5px}
th{text-align:left;font-weight:500;color:var(--dim-2);font-size:10px;letter-spacing:.07em;text-transform:uppercase;padding:0 10px 7px 0;border-bottom:1px solid var(--line)}
th.n,td.n{text-align:right;padding-right:0;padding-left:14px;white-space:nowrap}
td{padding:6px 10px 6px 0;border-bottom:1px solid #171b21;color:var(--text);vertical-align:top}
tr:last-child td{border-bottom:0}
td.p{color:var(--dim);word-break:break-all}
td.hi{color:var(--accent)}
.bar-row{display:grid;grid-template-columns:1fr 54px;align-items:center;gap:10px;font-family:var(--mono);font-size:11.5px;padding:4px 0}
.bar-row .lab{display:flex;align-items:center;gap:8px;min-width:0}
.bar-row .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dim);flex:none;width:190px}
.bar-row .tr{display:block;flex:1;height:7px;background:#171b21;border-radius:2px;overflow:hidden}
.bar-row .fl{display:block;height:7px;border-radius:2px}
.bar-row .v{text-align:right;color:var(--text)}
.chart{width:100%}
.cap{font-family:var(--mono);font-size:10.5px;color:var(--dim-2);margin-top:10px}
.tag{display:inline-block;font-family:var(--mono);font-size:10px;padding:1px 6px;border-radius:3px;background:var(--panel-2);border:1px solid var(--line);color:var(--dim)}
.tag.bad{color:var(--risk);border-color:#3c2226}.tag.ok{color:#6ec28f;border-color:#22352a}.tag.warn{color:var(--amber);border-color:#3a3220}
.callout{border-left:2px solid var(--accent);padding:2px 0 2px 14px;color:var(--dim);font-size:12.5px;margin-top:14px;text-wrap:pretty}
.callout.bad{border-left-color:var(--risk)}
#tip{position:fixed;pointer-events:none;z-index:60;background:rgba(8,10,13,.95);border:1px solid #2c3340;border-radius:4px;padding:6px 8px;font-family:var(--mono);font-size:11px;opacity:0;transition:opacity .08s;max-width:340px}
#tip .d{color:var(--dim-2)}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-family:var(--mono);font-size:10.5px;color:var(--dim);margin-top:12px}
.legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}
.legend .hint{color:var(--dim-2);margin-left:auto}
.controls{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:14px;font-family:var(--mono);font-size:11px;color:var(--dim)}
.controls label{display:flex;align-items:center;gap:7px}
.controls select{background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:4px 8px;font-family:var(--mono);font-size:11px}
.controls select:hover{border-color:#39424f}
footer{border-top:1px solid var(--line);padding-top:20px;font-family:var(--mono);font-size:11px;color:var(--dim-2);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px}
@media print{body{background:#fff}nav.toc{display:none}}
`;

export function buildReportHtml(data: RepositoryData, options: BuildReportHtmlOptions): string {
  const payload = JSON.stringify(data).replace(/</g, "\\u003c");
  const name = escapeHtml(data.metadata.repositoryName);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="wrap head">
  <div class="mast">
    <div class="top">
      <div class="eyebrow">Repository architecture report</div>
      <div id="lang-toggle" class="seg"><button type="button" data-lang="en">EN</button><button type="button" data-lang="es">ES</button></div>
    </div>
    <h1 id="m-name">—</h1>
    <div class="meta" id="m-meta"></div>
  </div>
</div>
<nav class="toc"><div class="inner" id="toc"></div></nav>
<div class="wrap" id="main"></div>
<div id="tip"></div>
<script>window.__REPO_ARCH_DATA__ = ${payload};</script>
<script>${options.reportRuntimeJs}</script>
</body>
</html>`;
}

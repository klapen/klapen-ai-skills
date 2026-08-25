import * as d3 from "d3";
import type { RepositoryData, RepositoryMetadata } from "../shared/types";
import type { DerivedFacts } from "./derive";
import { groupOf } from "./derive";
import type { ReportColorScales } from "./colors";
import { escapeHtml } from "./escape";
import { barRows, callout, section, tableHTML, type ReportSection } from "./html";

const N = d3.format(",");
const P = d3.format(".0%");

function short(path: string | undefined): string {
  const p = path ?? "";
  return p.length > 46 ? `…${p.slice(-45)}` : p;
}

export interface SectionsResult {
  html: string;
  sections: ReportSection[];
}

export function buildMastheadHtml(metadata: RepositoryMetadata): string {
  const parts = [
    `<span>${escapeHtml(metadata.gitBranch ?? "")}</span>`,
    `<span>${escapeHtml((metadata.gitCommit ?? "").slice(0, 10))}</span>`,
    metadata.isDirty ? '<span class="dirty">dirty worktree</span>' : "<span>clean worktree</span>",
    `<span>${escapeHtml((metadata.languages ?? []).join(" · "))}</span>`,
    `<span>generated ${escapeHtml(metadata.generatedAt.slice(0, 16).replace("T", " "))} UTC</span>`,
    `<span>analyzer ${escapeHtml(metadata.analyzerVersion)}</span>`,
  ];
  return parts.join("");
}

export function buildSectionsHtml(data: RepositoryData, facts: DerivedFacts, colors: ReportColorScales): SectionsResult {
  const sections: ReportSection[] = [];
  const { summary, metadata, narrative } = data;
  const { files, symbols, imports, byGroup, byExt, hubs, spokes, risky, churned, recent, connected, orphans, hidden, symKinds, complexSyms, maxDepth, biggest, tests, loc } = facts;

  const parts: string[] = [];

  parts.push(
    section(
      sections,
      "snapshot",
      "Snapshot",
      null,
      `Eight numbers that place the repository: how much code there is, how much of it the parser could read, and how tangled it is. Use it as the baseline for the next run — a rising cycle or violation count is the signal worth acting on.`,
      `<div class="stats">${[
        ["files", N(summary.files)],
        ["lines of code", N(loc)],
        ["source files", N(summary.sourceFiles)],
        ["symbols", N(symbols.length)],
        ["import edges", N(imports.length)],
        ["cycles", N(summary.cycles)],
        ["violations", N(summary.architectureViolations)],
        ["parsed", `${metadata.parserCoverage.full}<small>/${metadata.parserCoverage.full + metadata.parserCoverage.skipped}</small>`],
      ]
        .map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`)
        .join("")}</div>${callout(
        `${P(files.length ? tests.length / files.length : 0)} of files are tests (${N(tests.length)} of ${N(
          files.length
        )}). The parser skipped ${N(metadata.parserCoverage.skipped)} files — config, docs and generated output rather than source — and failed on ${N(
          metadata.parserCoverage.failed
        )}.`
      )}`
    )
  );

  if (narrative) {
    parts.push(
      section(
        sections,
        "summary",
        "Executive summary",
        null,
        `A written read of this run, generated alongside the metrics. Everything below is the evidence behind it.`,
        `<p class="sum">${escapeHtml(narrative.summary)}</p><h3 style="margin-top:26px">Key insights</h3><ul class="ins">${narrative.keyInsights
          .map((i) => `<li>${escapeHtml(i)}</li>`)
          .join("")}</ul>`
      )
    );
  }

  if (byGroup.length && byExt.length) {
    parts.push(
      section(
        sections,
        "composition",
        "Composition",
        `${byGroup.length} modules · ${byExt.length} file types`,
        `<b>What this is:</b> where the lines actually live — by module (top two path segments) and by file type. <b>How to read it:</b> the top bar is where most of your reading time will go; a module with many files but few lines is usually config or fixtures, and an unexpected file type is worth a look.`,
        `<div class="grid g2">
      <div class="card"><h3>Lines of code by module</h3>${barRows(
        byGroup.slice(0, 10).map((g) => ({ label: escapeHtml(g.key), value: g.loc, color: colors.group(g.key) })),
        byGroup[0].loc
      )}</div>
      <div class="card"><h3>Lines of code by file type</h3>${barRows(
        byExt.slice(0, 10).map((e) => ({ label: `${escapeHtml(e.key)}  ·  ${e.files} files`, value: e.loc })),
        byExt[0].loc
      )}</div>
    </div>${callout(
          `<b>${escapeHtml(byGroup[0].key)}</b> holds ${P(loc ? byGroup[0].loc / loc : 0)} of all code (${N(
            byGroup[0].loc
          )} lines in ${N(byGroup[0].files)} files); the top three modules are ${P(
            loc ? d3.sum(byGroup.slice(0, 3), (g) => g.loc) / loc : 0
          )} of the repository. Directories nest ${maxDepth} levels deep.`
        )}`
      )
    );
  }

  parts.push(
    section(
      sections,
      "map",
      "Repo map",
      "treemap, area = lines of code",
      `<b>What this is:</b> every file as a rectangle nested inside its folder, area proportional to lines of code. <b>How to read it:</b> scan for the few large rectangles — they dominate the codebase and are where refactoring pays off; a folder that is one giant rectangle plus crumbs usually wants splitting. Hover for metrics.`,
      `<div class="card"><div id="c-map" class="chart"></div><div class="legend" id="l-map"></div></div>${
        biggest
          ? callout(
              `Largest single file: <b>${escapeHtml(biggest.relativePath)}</b> at ${N(biggest.loc ?? 0)} lines — ${P(
                loc ? (biggest.loc ?? 0) / loc : 0
              )} of the repository on its own.`
            )
          : ""
      }`
    )
  );

  parts.push(
    section(
      sections,
      "graph",
      "Dependency graph",
      `${imports.length} import edges`,
      `<b>What this is:</b> each connected source file is a circle (area = lines of code, colour = module), each arrow an import. Files with no imports either way are left out so the shape stays readable. <b>How to read it:</b> circles everything points at are shared foundations — change them carefully; circles with many outgoing arrows are orchestrators and the natural place to start reading. Click a node to isolate its neighbourhood — click it again, or click empty space, to clear. Drag to pan; hold Ctrl (Windows/Linux) or Cmd (Mac) and scroll to zoom, so scrolling the page still works over the chart. Red outlines mark files in an import cycle.`,
      `<div class="card"><div id="c-graph" class="chart"></div><div class="legend" id="l-graph"></div></div>${callout(
        `${N(connected.size)} of ${N(facts.sourceFiles.length)} source files take part in the import graph; ${N(
          orphans.length
        )} import nothing and are imported by nothing${
          orphans.length ? ` (e.g. ${orphans.slice(0, 3).map((o) => escapeHtml(o.name)).join(", ")})` : ""
        } — usually entry points, scripts, or dead code worth checking.`
      )}`
    )
  );

  const cyclesList = (data.cycles ?? []).length
    ? (data.cycles ?? [])
        .map(
          (c) =>
            `<div style="font-family:var(--mono);font-size:11.5px;padding:5px 0;color:var(--dim)"><span class="tag bad">cycle</span> ${c.nodeIds
              .map((id) => escapeHtml(facts.byId.get(id)?.relativePath ?? id))
              .join(' <span style="color:var(--risk)">⇄</span> ')}</div>`
        )
        .join("")
    : '<p class="cap">No import cycles detected.</p>';

  parts.push(
    section(
      sections,
      "coupling",
      "Coupling & cycles",
      `${summary.cycles} cycle${summary.cycles === 1 ? "" : "s"}`,
      `<b>What this is:</b> the same imports as a matrix — a mark at row → column means the row file imports the column file. <b>How to read it:</b> a dense column is a hub everything depends on; a dense row is a file that depends on everything. Marks mirrored across the diagonal for one pair are a cycle (red) and should be broken. Click a row or column label to trace everything it touches, or click a cell to isolate that one row/column intersection — click again, or click the empty background, to clear. The tables rank what the matrix points at.`,
      `<div class="card"><div class="controls">${["rows", "cols"]
        .map(
          (axis) =>
            `<label>${axis === "rows" ? "Rows" : "Columns"} <select id="mx-${axis}"><option value="">All modules</option>${facts.groups
              .map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`)
              .join("")}</select></label>`
        )
        .join("")}</div><div id="c-matrix" class="chart" style="overflow:auto"></div><div class="cap">Ordered by path, so folders appear as blocks. Filter rows/columns to a module, click a label or cell to highlight, hover a cell for the pair.</div></div>
     <div class="grid g2" style="margin-top:20px">${
       hubs.length
         ? `<div class="card"><h3>Most depended on · fan-in</h3>${tableHTML(
             [{ header: "file" }, { header: "module", cls: "p" }, { header: "in", numeric: true }, { header: "out", numeric: true }],
             hubs.slice(0, 8).map((f) => [escapeHtml(f.name), escapeHtml(groupOf(f.relativePath)), f.fanIn ?? 0, f.fanOut ?? 0])
           )}</div>`
         : ""
     }${
       spokes.length
         ? `<div class="card"><h3>Depends on most · fan-out</h3>${tableHTML(
             [{ header: "file" }, { header: "module", cls: "p" }, { header: "out", numeric: true }, { header: "instab.", numeric: true }],
             spokes
               .slice(0, 8)
               .map((f) => [escapeHtml(f.name), escapeHtml(groupOf(f.relativePath)), f.fanOut ?? 0, (+(f.instability ?? 0)).toFixed(2)])
           )}</div>`
         : ""
     }</div>
     <div class="card" style="margin-top:20px"><h3>Cycles</h3>${cyclesList}</div>${
       hubs.length && spokes.length
         ? callout(
             `Highest fan-in is <b>${escapeHtml(hubs[0].relativePath)}</b> with ${hubs[0].fanIn} dependents — a change there touches ${P(
               connected.size ? (hubs[0].fanIn ?? 0) / connected.size : 0
             )} of the connected graph. Highest fan-out is <b>${escapeHtml(spokes[0].relativePath)}</b> with ${spokes[0].fanOut} dependencies: the orchestration point.`
           )
         : ""
     }`
    )
  );

  parts.push(
    section(
      sections,
      "hidden",
      "Hidden coupling",
      `${hidden.length} pair${hidden.length === 1 ? "" : "s"}`,
      `<b>What this is:</b> pairs of files repeatedly committed together that have no import between them — coupling git can see and the compiler cannot. <b>How to read it:</b> high-confidence pairs are candidates for a shared abstraction or a moved responsibility, and they are the pairs most likely to break each other during a refactor.`,
      hidden.length
        ? `<div class="card">${tableHTML(
            [
              { header: "file a", cls: "p" },
              { header: "file b", cls: "p" },
              { header: "commits together", numeric: true },
              { header: "confidence", numeric: true },
            ],
            hidden.slice(0, 12).map((h) => [escapeHtml(short(h.a.relativePath)), escapeHtml(short(h.b.relativePath)), h.weight, P(h.confidence)])
          )}</div>${callout(
            `Strongest pair: <b>${escapeHtml(hidden[0].a.name)}</b> and <b>${escapeHtml(
              hidden[0].b.name
            )}</b> — changed together ${hidden[0].weight} times at ${P(hidden[0].confidence)} confidence with no import between them.`
          )}`
        : `<div class="card"><p class="cap">Every co-change pair is also an import — no hidden coupling detected.</p></div>`
    )
  );

  parts.push(
    section(
      sections,
      "risk",
      "Risk & hotspots",
      `${risky.length} files scored`,
      `<b>What this is:</b> churn (lines changed across git history) against complexity; bubble area = file size, colour = risk score. <b>How to read it:</b> the top-right quadrant is the danger zone — complex code that also changes constantly, the classic refactor target. Bottom-right is churny but simple (healthy). Top-left is complex but stable (leave alone unless you must touch it).`,
      `<div class="card"><div id="c-hot" class="chart"></div><div class="cap">Every file with git history is plotted; the six highest-risk files are labelled.</div></div>${
        risky.length
          ? `<div class="card" style="margin-top:20px"><h3>Highest risk files</h3>${tableHTML(
              [
                { header: "file", cls: "p" },
                { header: "risk", numeric: true },
                { header: "cx", numeric: true },
                { header: "churn", numeric: true },
                { header: "loc", numeric: true },
                { header: "commits", numeric: true },
              ],
              risky
                .slice(0, 10)
                .map((f) => [
                  escapeHtml(short(f.relativePath)),
                  `<span style="color:${colors.risk(f.riskScore ?? 0)}">${f.riskScore}</span>`,
                  f.complexity ?? 0,
                  N(f.churn ?? 0),
                  N(f.loc ?? 0),
                  f.commitCount ?? 0,
                ])
            )}</div>${callout(
              `Top risk is <b>${escapeHtml(risky[0].relativePath)}</b> at ${risky[0].riskScore} — complexity ${risky[0].complexity}, churn ${N(
                risky[0].churn ?? 0
              )} over ${risky[0].commitCount} commits. ${
                (d3.max(files, (f) => f.riskScore ?? 0) ?? 0) < 60
                  ? "Nothing crosses the hotspot threshold of 60, so this ranking is relative, not alarming."
                  : ""
              }`
            )}`
          : ""
      }`
    )
  );

  const churnByGroup = byGroup.filter((g) => g.churn).sort((a, b) => b.churn - a.churn);
  parts.push(
    section(
      sections,
      "history",
      "Change history",
      `${N(d3.sum(files, (f) => f.churn ?? 0))} lines churned`,
      `<b>What this is:</b> where git activity concentrates, by module and by file. <b>How to read it:</b> churn shows which parts of the repo are alive; pair it with risk — high churn in a simple module is healthy iteration, high churn in a complex one is debt accumulating. The recent list answers "what has the team been doing".`,
      `<div class="grid g2">${
        churnByGroup.length
          ? `<div class="card"><h3>Churn by module</h3>${barRows(
              churnByGroup.slice(0, 8).map((g) => ({ label: escapeHtml(g.key), value: g.churn, color: colors.group(g.key) })),
              d3.max(byGroup, (g) => g.churn) || 1
            )}</div>`
          : ""
      }${
        churned.length
          ? `<div class="card"><h3>Most-changed files</h3>${tableHTML(
              [{ header: "file", cls: "p" }, { header: "churn", numeric: true }, { header: "commits", numeric: true }],
              churned.slice(0, 8).map((f) => [escapeHtml(short(f.relativePath)), N(f.churn ?? 0), f.commitCount ?? 0])
            )}</div>`
          : ""
      }</div>${
        recent.length
          ? `<div class="card" style="margin-top:20px"><h3>Recently modified</h3>${tableHTML(
              [
                { header: "file", cls: "p" },
                { header: "module", cls: "p" },
                { header: "modified", numeric: true },
                { header: "contributors", numeric: true },
              ],
              recent.slice(0, 8).map((f) => [escapeHtml(short(f.relativePath)), escapeHtml(groupOf(f.relativePath)), (f.lastModified ?? "").slice(0, 10), f.contributorCount ?? 0])
            )}</div>`
          : ""
      }${
        churnByGroup.length
          ? callout(
              `<b>${escapeHtml(churnByGroup[0].key)}</b> absorbs the most churn. Files carry at most ${d3.max(
                files,
                (f) => f.contributorCount ?? 0
              )} contributor${(d3.max(files, (f) => f.contributorCount ?? 0) ?? 0) === 1 ? "" : "s"}, so bus factor — not merge conflict — is the people risk here.`
            )
          : ""
      }`
    )
  );

  if (symbols.length) {
    const symbolsByFileCounts = Array.from(facts.symsByFile, ([id, v]) => ({
      label: facts.byId.get(id)?.name ?? id,
      value: v.length,
    })).sort((a, b) => b.value - a.value);
    parts.push(
      section(
        sections,
        "symbols",
        "Symbols",
        `${N(symbols.length)} parsed`,
        `<b>What this is:</b> the classes, interfaces, functions and methods found inside the source files. <b>How to read it:</b> the mix describes the codebase's style — interface-heavy means a typed contract layer, function-heavy a procedural pipeline. The complexity table is what to check before touching anything: those symbols are hardest to change safely.`,
        `<div class="grid g2">
      <div class="card"><h3>Symbols by kind</h3>${barRows(
        symKinds.map((k) => ({ label: escapeHtml(k.kind), value: k.count })),
        symKinds[0].count
      )}
        <h3 style="margin-top:22px">Files with most symbols</h3>${barRows(
          symbolsByFileCounts.slice(0, 6).map((s) => ({ label: escapeHtml(s.label), value: s.value })),
          d3.max(symbolsByFileCounts, (s) => s.value) ?? 1
        )}</div>
      <div class="card"><h3>Most complex symbols</h3>${tableHTML(
        [
          { header: "symbol" },
          { header: "kind", cls: "p" },
          { header: "file", cls: "p" },
          { header: "cx", numeric: true },
          { header: "loc", numeric: true },
        ],
        complexSyms.map((s) => [
          escapeHtml(s.name),
          escapeHtml(s.kind),
          escapeHtml((s.relativePath ?? "").split("/").pop() ?? ""),
          s.complexity ?? 0,
          s.loc ?? 0,
        ])
      )}</div>
     </div>${
       complexSyms.length
         ? callout(
             `<b>${escapeHtml(complexSyms[0].name)}</b> in ${escapeHtml(
               (complexSyms[0].relativePath ?? "").split("/").pop() ?? ""
             )} is the most complex symbol (complexity ${complexSyms[0].complexity}, ${complexSyms[0].loc} lines) — first candidate to break up if that file needs work.`
           )
         : ""
     }`
      )
    );
  }

  if (narrative) {
    parts.push(
      section(
        sections,
        "reading",
        "Where to start reading",
        null,
        `A path through the code for someone opening this repository for the first time, ordered by how much structure each file explains.`,
        `<div class="card">${narrative.readingList
          .map(
            (r, i) =>
              `<div style="display:grid;grid-template-columns:26px 1fr;gap:12px;padding:11px 0;border-bottom:1px solid #171b21">` +
              `<span style="font-family:var(--mono);color:var(--dim-2)">${String(i + 1).padStart(2, "0")}</span>` +
              `<div><code style="font-family:var(--mono);font-size:12px;color:var(--accent)">${escapeHtml(
                r.path
              )}</code><p style="margin:5px 0 0;color:var(--dim);font-size:12px;text-wrap:pretty">${escapeHtml(r.reason)}</p></div></div>`
          )
          .join("")}</div>`
      )
    );
  }

  parts.push(
    `<footer><span>${escapeHtml(metadata.repositoryName)} · ${escapeHtml((metadata.gitCommit ?? "").slice(0, 10))} · ${escapeHtml(
      metadata.generatedAt.slice(0, 10)
    )}</span><span>schema ${escapeHtml(metadata.schemaVersion)} · analyzer ${escapeHtml(metadata.analyzerVersion)} · config ${escapeHtml(
      (metadata.configurationHash ?? "").slice(0, 8)
    )}</span></footer>`
  );

  return { html: parts.join(""), sections };
}

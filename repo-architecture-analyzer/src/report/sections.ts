import * as d3 from "d3";
import type { RepositoryData, RepositoryMetadata } from "../shared/types";
import type { DerivedFacts, FileCategory } from "./derive";
import { categoryOf, extOf, groupAndExtStats, groupOf } from "./derive";
import type { ReportColorScales } from "./colors";
import { escapeHtml } from "./escape";
import { barRows, callout, section, tableHTML, type ReportSection } from "./html";
import { formatters, t, type Lang } from "./i18n";

function short(path: string | undefined): string {
  const p = path ?? "";
  return p.length > 46 ? `…${p.slice(-45)}` : p;
}

export interface SectionsResult {
  html: string;
  sections: ReportSection[];
}

export function buildMastheadHtml(metadata: RepositoryMetadata, lang: Lang): string {
  const d = t(lang);
  const parts = [
    `<span>${escapeHtml(metadata.gitBranch ?? "")}</span>`,
    `<span>${escapeHtml((metadata.gitCommit ?? "").slice(0, 10))}</span>`,
    metadata.isDirty ? `<span class="dirty">${escapeHtml(d.dirtyWorktree)}</span>` : `<span>${escapeHtml(d.cleanWorktree)}</span>`,
    `<span>${escapeHtml((metadata.languages ?? []).join(" · "))}</span>`,
    `<span>${escapeHtml(d.generated)} ${escapeHtml(metadata.generatedAt.slice(0, 16).replace("T", " "))} ${escapeHtml(d.utc)}</span>`,
    `<span>${escapeHtml(d.analyzer)} ${escapeHtml(metadata.analyzerVersion)}</span>`,
  ];
  return parts.join("");
}

export interface CompositionBreakdown {
  moduleHtml: string;
  extHtml: string;
  calloutHtml: string;
}

/**
 * Builds the module/file-type breakdown for one category filter ("all" or a single
 * FileCategory). Used for the Composition section's initial render and reused client-side
 * when the category filter buttons are clicked, so both stay in sync.
 */
export function buildCompositionBreakdown(
  facts: DerivedFacts,
  colors: ReportColorScales,
  lang: Lang,
  category: FileCategory | "all"
): CompositionBreakdown {
  const d = t(lang);
  const { N, P } = formatters(lang);
  const files = category === "all" ? facts.files : facts.files.filter((f) => categoryOf(f.name, extOf(f.relativePath)) === category);
  const { byGroup, byExt } = groupAndExtStats(files);
  const totalLoc = d3.sum(files, (f) => f.loc ?? 0);

  const moduleHtml = byGroup.length
    ? barRows(
        byGroup.slice(0, 10).map((g) => ({ label: escapeHtml(g.key), value: g.loc, text: N(g.loc), color: colors.group(g.key) })),
        byGroup[0].loc
      )
    : `<p class="cap">${escapeHtml(d.composition.noFilesInCategory)}</p>`;

  const extHtml = byExt.length
    ? barRows(
        byExt
          .slice(0, 10)
          .map((e) => ({ label: `${escapeHtml(e.key)}  ·  ${e.files} ${escapeHtml(d.composition.filesSuffix)}`, value: e.loc, text: N(e.loc) })),
        byExt[0].loc
      )
    : `<p class="cap">${escapeHtml(d.composition.noFilesInCategory)}</p>`;

  const calloutHtml = byGroup.length
    ? callout(
        d.composition.callout(
          escapeHtml(byGroup[0].key),
          P(totalLoc ? byGroup[0].loc / totalLoc : 0),
          N(byGroup[0].loc),
          N(byGroup[0].files),
          P(totalLoc ? d3.sum(byGroup.slice(0, 3), (g) => g.loc) / totalLoc : 0),
          facts.maxDepth
        )
      )
    : "";

  return { moduleHtml, extHtml, calloutHtml };
}

export function buildSectionsHtml(data: RepositoryData, facts: DerivedFacts, colors: ReportColorScales, lang: Lang): SectionsResult {
  const d = t(lang);
  const { N, P } = formatters(lang);
  const sections: ReportSection[] = [];
  const { summary, metadata } = data;
  const narrative = data.narrative?.[lang];
  const { files, symbols, imports, byGroup, byExt, byCategory, hubs, spokes, risky, churned, recent, connected, orphans, hidden, symKinds, complexSyms, biggest, tests, loc } = facts;

  const parts: string[] = [];

  parts.push(
    section(
      sections,
      "snapshot",
      d.snapshot.title,
      null,
      d.snapshot.lede,
      `<div class="stats">${[
        [d.snapshot.files, N(summary.files)],
        [d.snapshot.loc, N(loc)],
        [d.snapshot.sourceFiles, N(summary.sourceFiles)],
        [d.snapshot.symbols, N(symbols.length)],
        [d.snapshot.importEdges, N(imports.length)],
        [d.snapshot.cycles, N(summary.cycles)],
        [d.snapshot.violations, N(summary.architectureViolations)],
        [d.snapshot.parsed, `${metadata.parserCoverage.full}<small>/${metadata.parserCoverage.full + metadata.parserCoverage.skipped}</small>`],
      ]
        .map(([l, v]) => `<div><b>${v}</b><span>${escapeHtml(l)}</span></div>`)
        .join("")}</div>${callout(
        d.snapshot.callout(
          P(files.length ? tests.length / files.length : 0),
          N(tests.length),
          N(files.length),
          N(metadata.parserCoverage.skipped),
          N(metadata.parserCoverage.failed)
        )
      )}`
    )
  );

  if (narrative) {
    parts.push(
      section(
        sections,
        "summary",
        d.summary.title,
        null,
        d.summary.lede,
        `<p class="sum">${escapeHtml(narrative.summary)}</p><h3 style="margin-top:26px">${escapeHtml(
          d.summary.keyInsights
        )}</h3><ul class="ins">${narrative.keyInsights.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
      )
    );
  }

  if (byGroup.length && byExt.length) {
    const categoryMeta: Record<FileCategory, { label: string; color: string }> = {
      code: { label: d.composition.categoryCode, color: "var(--accent)" },
      docs: { label: d.composition.categoryDocs, color: "var(--violet)" },
      assets: { label: d.composition.categoryAssets, color: "var(--teal)" },
    };
    const categoryLoc = (key: FileCategory): number => byCategory.find((c) => c.key === key)?.loc ?? 0;
    const initial = buildCompositionBreakdown(facts, colors, lang, "all");
    parts.push(
      section(
        sections,
        "composition",
        d.composition.title,
        d.composition.subtitle(N(byGroup.length), N(byExt.length)),
        d.composition.lede,
        `<div class="card"><h3>${escapeHtml(d.composition.locByCategory)}</h3>${barRows(
          byCategory.map((c) => ({
            label: `${escapeHtml(categoryMeta[c.key].label)}  ·  ${c.files} ${escapeHtml(d.composition.filesSuffix)}`,
            value: c.loc,
            text: N(c.loc),
            color: categoryMeta[c.key].color,
          })),
          d3.max(byCategory, (c) => c.loc) || 1
        )}${callout(
          d.composition.categoryCallout(
            P(loc ? categoryLoc("code") / loc : 0),
            P(loc ? categoryLoc("docs") / loc : 0),
            P(loc ? categoryLoc("assets") / loc : 0)
          )
        )}</div>
    <div class="seg" id="comp-filter" style="margin-top:20px">${(["all", "code", "docs", "assets"] as const)
      .map(
        (cat) =>
          `<button type="button" data-cat="${cat}"${cat === "all" ? ' class="on"' : ""}>${escapeHtml(
            cat === "all" ? d.composition.categoryAll : categoryMeta[cat].label
          )}</button>`
      )
      .join("")}</div>
    <div class="cap">${escapeHtml(d.composition.filterHint)}</div>
    <div class="grid g2" style="margin-top:10px">
      <div class="card"><h3>${escapeHtml(d.composition.locByModule)}</h3><div id="comp-module">${initial.moduleHtml}</div></div>
      <div class="card"><h3>${escapeHtml(d.composition.locByFileType)}</h3><div id="comp-ext">${initial.extHtml}</div></div>
    </div>
    <div id="comp-callout">${initial.calloutHtml}</div>`
      )
    );
  }

  parts.push(
    section(
      sections,
      "map",
      d.map.title,
      d.map.subtitle,
      d.map.lede,
      `<div class="card"><div id="c-map" class="chart"></div><div class="legend" id="l-map"></div></div>${
        biggest ? callout(d.map.callout(escapeHtml(biggest.relativePath), N(biggest.loc ?? 0), P(loc ? (biggest.loc ?? 0) / loc : 0))) : ""
      }`
    )
  );

  parts.push(
    section(
      sections,
      "graph",
      d.graph.title,
      d.graph.subtitle(N(imports.length)),
      d.graph.lede,
      `<div class="card"><div id="c-graph" class="chart"></div><div class="legend" id="l-graph"></div></div>${callout(
        d.graph.callout(
          N(connected.size),
          N(facts.sourceFiles.length),
          N(orphans.length),
          orphans.length ? orphans.slice(0, 3).map((o) => escapeHtml(o.name)).join(", ") : ""
        )
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
    : `<p class="cap">${escapeHtml(d.coupling.noCycles)}</p>`;

  const filesByGroup = d3.group(files, (f) => groupOf(f.relativePath));
  const matrixModules = facts.groups.filter((g) => {
    const members = filesByGroup.get(g) ?? [];
    return !(members.length === 1 && members[0].relativePath === g);
  });

  parts.push(
    section(
      sections,
      "coupling",
      d.coupling.title,
      d.coupling.subtitle(summary.cycles),
      d.coupling.lede,
      `<div class="card"><div class="controls">${["rows", "cols"]
        .map(
          (axis) =>
            `<label>${axis === "rows" ? escapeHtml(d.coupling.rows) : escapeHtml(d.coupling.cols)} <select id="mx-${axis}"><option value="">${escapeHtml(
              d.coupling.allModules
            )}</option>${matrixModules.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("")}</select></label>`
        )
        .join("")}</div><div id="c-matrix" class="chart" style="overflow:auto"></div><div class="cap">${escapeHtml(d.coupling.caption)}</div></div>
     <div class="grid g2" style="margin-top:20px">${
       hubs.length
         ? `<div class="card"><h3>${escapeHtml(d.coupling.fanInHeading)}</h3>${tableHTML(
             [
               { header: escapeHtml(d.coupling.col.file) },
               { header: escapeHtml(d.coupling.col.module), cls: "p" },
               { header: escapeHtml(d.coupling.col.in), numeric: true },
               { header: escapeHtml(d.coupling.col.out), numeric: true },
             ],
             hubs.slice(0, 8).map((f) => [escapeHtml(f.name), escapeHtml(groupOf(f.relativePath)), f.fanIn ?? 0, f.fanOut ?? 0])
           )}</div>`
         : ""
     }${
       spokes.length
         ? `<div class="card"><h3>${escapeHtml(d.coupling.fanOutHeading)}</h3>${tableHTML(
             [
               { header: escapeHtml(d.coupling.col.file) },
               { header: escapeHtml(d.coupling.col.module), cls: "p" },
               { header: escapeHtml(d.coupling.col.out), numeric: true },
               { header: escapeHtml(d.coupling.col.instab), numeric: true },
             ],
             spokes
               .slice(0, 8)
               .map((f) => [escapeHtml(f.name), escapeHtml(groupOf(f.relativePath)), f.fanOut ?? 0, (+(f.instability ?? 0)).toFixed(2)])
           )}</div>`
         : ""
     }</div>
     <div class="card" style="margin-top:20px"><h3>${escapeHtml(d.coupling.cyclesHeading)}</h3>${cyclesList}</div>${
       hubs.length && spokes.length
         ? callout(
             d.coupling.callout(
               escapeHtml(hubs[0].relativePath),
               hubs[0].fanIn ?? 0,
               P(connected.size ? (hubs[0].fanIn ?? 0) / connected.size : 0),
               escapeHtml(spokes[0].relativePath),
               spokes[0].fanOut ?? 0
             )
           )
         : ""
     }`
    )
  );

  parts.push(
    section(
      sections,
      "hidden",
      d.hidden.title,
      d.hidden.subtitle(hidden.length),
      d.hidden.lede,
      hidden.length
        ? `<div class="card">${tableHTML(
            [
              { header: escapeHtml(d.hidden.col.fileA), cls: "p" },
              { header: escapeHtml(d.hidden.col.fileB), cls: "p" },
              { header: escapeHtml(d.hidden.col.commitsTogether), numeric: true },
              { header: escapeHtml(d.hidden.col.confidence), numeric: true },
            ],
            hidden.slice(0, 12).map((h) => [escapeHtml(short(h.a.relativePath)), escapeHtml(short(h.b.relativePath)), h.weight, P(h.confidence)])
          )}</div>${callout(d.hidden.callout(escapeHtml(hidden[0].a.name), escapeHtml(hidden[0].b.name), hidden[0].weight, P(hidden[0].confidence)))}`
        : `<div class="card"><p class="cap">${escapeHtml(d.hidden.none)}</p></div>`
    )
  );

  parts.push(
    section(
      sections,
      "risk",
      d.risk.title,
      d.risk.subtitle(risky.length),
      d.risk.lede,
      `<div class="card"><div id="c-hot" class="chart"></div><div class="cap">${escapeHtml(d.risk.caption)}</div></div>${
        risky.length
          ? `<div class="card" style="margin-top:20px"><h3>${escapeHtml(d.risk.heading)}</h3>${tableHTML(
              [
                { header: escapeHtml(d.risk.col.file), cls: "p" },
                { header: escapeHtml(d.risk.col.risk), numeric: true },
                { header: escapeHtml(d.risk.col.cx), numeric: true },
                { header: escapeHtml(d.risk.col.churn), numeric: true },
                { header: escapeHtml(d.risk.col.loc), numeric: true },
                { header: escapeHtml(d.risk.col.commits), numeric: true },
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
              d.risk.callout(escapeHtml(risky[0].relativePath), risky[0].riskScore ?? 0, risky[0].complexity ?? 0, N(risky[0].churn ?? 0), risky[0].commitCount ?? 0) +
                ((d3.max(files, (f) => f.riskScore ?? 0) ?? 0) < 60 ? ` ${d.risk.notAlarming}` : "")
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
      d.history.title,
      d.history.subtitle(N(d3.sum(files, (f) => f.churn ?? 0))),
      d.history.lede,
      `<div class="grid g2">${
        churnByGroup.length
          ? `<div class="card"><h3>${escapeHtml(d.history.churnByModule)}</h3>${barRows(
              churnByGroup.slice(0, 8).map((g) => ({ label: escapeHtml(g.key), value: g.churn, text: N(g.churn), color: colors.group(g.key) })),
              d3.max(byGroup, (g) => g.churn) || 1
            )}</div>`
          : ""
      }${
        churned.length
          ? `<div class="card"><h3>${escapeHtml(d.history.mostChanged)}</h3>${tableHTML(
              [
                { header: escapeHtml(d.history.col.file), cls: "p" },
                { header: escapeHtml(d.history.col.churn), numeric: true },
                { header: escapeHtml(d.history.col.commits), numeric: true },
              ],
              churned.slice(0, 8).map((f) => [escapeHtml(short(f.relativePath)), N(f.churn ?? 0), f.commitCount ?? 0])
            )}</div>`
          : ""
      }</div>${
        recent.length
          ? `<div class="card" style="margin-top:20px"><h3>${escapeHtml(d.history.recentlyModified)}</h3>${tableHTML(
              [
                { header: escapeHtml(d.history.col.file), cls: "p" },
                { header: escapeHtml(d.history.col.module), cls: "p" },
                { header: escapeHtml(d.history.col.modified), numeric: true },
                { header: escapeHtml(d.history.col.contributors), numeric: true },
              ],
              recent.slice(0, 8).map((f) => [escapeHtml(short(f.relativePath)), escapeHtml(groupOf(f.relativePath)), (f.lastModified ?? "").slice(0, 10), f.contributorCount ?? 0])
            )}</div>`
          : ""
      }${
        churnByGroup.length
          ? callout(
              d.history.callout(
                escapeHtml(churnByGroup[0].key),
                d3.max(files, (f) => f.contributorCount ?? 0) ?? 0,
                (d3.max(files, (f) => f.contributorCount ?? 0) ?? 0) !== 1
              )
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
        d.symbols.title,
        d.symbols.subtitle(N(symbols.length)),
        d.symbols.lede,
        `<div class="grid g2">
      <div class="card"><h3>${escapeHtml(d.symbols.byKind)}</h3>${barRows(
        symKinds.map((k) => ({ label: escapeHtml(k.kind), value: k.count, text: N(k.count) })),
        symKinds[0].count
      )}
        <h3 style="margin-top:22px">${escapeHtml(d.symbols.filesWithMost)}</h3>${barRows(
          symbolsByFileCounts.slice(0, 6).map((s) => ({ label: escapeHtml(s.label), value: s.value, text: N(s.value) })),
          d3.max(symbolsByFileCounts, (s) => s.value) ?? 1
        )}</div>
      <div class="card"><h3>${escapeHtml(d.symbols.mostComplex)}</h3>${tableHTML(
        [
          { header: escapeHtml(d.symbols.col.symbol) },
          { header: escapeHtml(d.symbols.col.kind), cls: "p" },
          { header: escapeHtml(d.symbols.col.file), cls: "p" },
          { header: escapeHtml(d.symbols.col.cx), numeric: true },
          { header: escapeHtml(d.symbols.col.loc), numeric: true },
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
             d.symbols.callout(
               escapeHtml(complexSyms[0].name),
               escapeHtml((complexSyms[0].relativePath ?? "").split("/").pop() ?? ""),
               complexSyms[0].complexity ?? 0,
               complexSyms[0].loc ?? 0
             )
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
        d.reading.title,
        null,
        d.reading.lede,
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
    )}</span><span>${escapeHtml(d.footer.schema)} ${escapeHtml(metadata.schemaVersion)} · ${escapeHtml(d.footer.analyzer)} ${escapeHtml(
      metadata.analyzerVersion
    )} · ${escapeHtml(d.footer.config)} ${escapeHtml((metadata.configurationHash ?? "").slice(0, 8))}</span></footer>`
  );

  return { html: parts.join(""), sections };
}

/** Wires the All/Code/Documentation/Assets buttons above the Composition module/file-type breakdown. */
export function bindCompositionFilter(root: HTMLElement, facts: DerivedFacts, colors: ReportColorScales, lang: Lang): void {
  const filterEl = root.querySelector<HTMLElement>("#comp-filter");
  const moduleEl = root.querySelector<HTMLElement>("#comp-module");
  const extEl = root.querySelector<HTMLElement>("#comp-ext");
  const calloutEl = root.querySelector<HTMLElement>("#comp-callout");
  if (!filterEl || !moduleEl || !extEl || !calloutEl) return;

  filterEl.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-cat]");
    const cat = btn?.dataset.cat;
    if (!cat || (cat !== "all" && cat !== "code" && cat !== "docs" && cat !== "assets")) return;

    const { moduleHtml, extHtml, calloutHtml } = buildCompositionBreakdown(facts, colors, lang, cat);
    moduleEl.innerHTML = moduleHtml;
    extEl.innerHTML = extHtml;
    calloutEl.innerHTML = calloutHtml;
    for (const b of Array.from(filterEl.querySelectorAll<HTMLButtonElement>("button"))) {
      b.classList.toggle("on", b.dataset.cat === cat);
    }
  });
}

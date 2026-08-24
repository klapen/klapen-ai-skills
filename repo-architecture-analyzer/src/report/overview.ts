import { escapeHtml } from "./escape";
import { fmt } from "./derive";
import type { ViewContext } from "./viewContext";

export function renderOverview(ctx: ViewContext): void {
  const { data, derived, toolbar, stage, select, state } = ctx;
  const narrative = data.narrative;

  toolbar.innerHTML =
    `<span class="rk-toolbar__title">Overview</span>` +
    `<span class="rk-toolbar__note">generated ${escapeHtml(data.metadata.generatedAt.slice(0, 16).replace("T", " "))} UTC · analyzer ${escapeHtml(data.metadata.analyzerVersion)}</span>`;

  stage.className = "rk-stage rk-stage--scroll";

  if (!narrative) {
    stage.innerHTML = `<div class="rk-overview"><p class="rk-empty">No narrative was attached to this report.</p></div>`;
    return;
  }

  const s = data.summary;
  const pc = data.metadata.parserCoverage;
  const cards: Array<[string, string]> = [
    ["files", fmt(s.files)],
    ["lines of code", fmt(s.linesOfCode)],
    ["symbols", fmt(derived.symbols.length)],
    ["import edges", fmt(derived.imports.length)],
    ["cycles", fmt(s.cycles)],
    ["violations", fmt(s.architectureViolations)],
    ["parsed", `${pc.full}/${pc.full + pc.skipped}`],
  ];

  stage.innerHTML =
    `<div class="rk-overview">` +
    `<h2>What is in this repository</h2><p class="rk-overview__sum">${escapeHtml(narrative.summary)}</p>` +
    `<div class="rk-cards">${cards.map(([l, v]) => `<div><b>${escapeHtml(v)}</b><span>${escapeHtml(l)}</span></div>`).join("")}</div>` +
    `<h4>Key insights</h4><ul class="rk-ins">${narrative.keyInsights.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` +
    `<h4>Where to start reading</h4><div class="rk-rl">${narrative.readingList
      .map((r) => {
        const id = `file:${r.path}`;
        const known = derived.byId.has(id);
        return `<button type="button" class="rk-rl__item" data-id="${known ? escapeHtml(id) : ""}"><code>${escapeHtml(r.path)}</code><p>${escapeHtml(r.reason)}</p></button>`;
      })
      .join("")}</div>` +
    `</div>`;

  stage.querySelectorAll<HTMLButtonElement>(".rk-rl__item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (id) {
        select(id);
        state.setView("graph");
      }
    });
  });
}

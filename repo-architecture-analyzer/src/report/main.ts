import type { RepositoryData } from "../shared/types";
import { deriveFacts } from "./derive";
import { createColorScales } from "./colors";
import { buildMastheadHtml, buildSectionsHtml } from "./sections";
import { bindMatrixFilters, drawAll } from "./charts";

declare global {
  interface Window {
    __REPO_ARCH_DATA__?: RepositoryData;
  }
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;

export function bootstrapReport(): void {
  const data = window.__REPO_ARCH_DATA__;
  if (!data) return;

  const facts = deriveFacts(data);
  const colors = createColorScales(facts);

  const nameEl = document.getElementById("m-name");
  if (nameEl) nameEl.textContent = data.metadata.repositoryName;
  const metaEl = document.getElementById("m-meta");
  if (metaEl) metaEl.innerHTML = buildMastheadHtml(data.metadata);

  const mainEl = document.getElementById("main");
  const tocEl = document.getElementById("toc");
  if (!mainEl) return;

  const { html, sections } = buildSectionsHtml(data, facts, colors);
  mainEl.innerHTML = html;

  if (tocEl) {
    tocEl.innerHTML = sections.map((s) => `<a href="#${s.id}">${s.title}</a>`).join("");
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".toc a"));
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            for (const link of links) {
              link.classList.toggle("on", link.getAttribute("href") === `#${entry.target.id}`);
            }
          }
        },
        { rootMargin: "-15% 0px -75% 0px" }
      );
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el) observer.observe(el);
      }
    }
  }

  const redraw = (): void => drawAll(document.body, data, facts, colors);
  redraw();
  bindMatrixFilters(document.body, facts);
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redraw, 250);
  });
}

bootstrapReport();

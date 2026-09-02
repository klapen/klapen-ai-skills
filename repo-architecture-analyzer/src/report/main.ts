import type { RepositoryData } from "../shared/types";
import { deriveFacts } from "./derive";
import { createColorScales } from "./colors";
import { bindCompositionFilter, buildMastheadHtml, buildSectionsHtml } from "./sections";
import { bindMatrixFilters, drawAll } from "./charts";
import { isLang, t, type Lang } from "./i18n";

declare global {
  interface Window {
    __REPO_ARCH_DATA__?: RepositoryData;
  }
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;

function detectDefaultLang(): Lang {
  try {
    const candidates = [navigator.language, ...(navigator.languages ?? [])];
    const spanish = candidates.find((c) => (c ?? "").toLowerCase().startsWith("es"));
    return spanish ? "es" : "en";
  } catch {
    return "en";
  }
}

export function bootstrapReport(): void {
  const data = window.__REPO_ARCH_DATA__;
  if (!data) return;

  const facts = deriveFacts(data);
  const colors = createColorScales(facts);

  const mainEl = document.getElementById("main");
  const tocEl = document.getElementById("toc");
  const toggleEl = document.getElementById("lang-toggle");
  if (!mainEl) return;

  let lang: Lang = detectDefaultLang();
  let observer: IntersectionObserver | undefined;

  const renderAll = (): void => {
    const d = t(lang);
    document.documentElement.lang = d.htmlLang;
    document.title = `${data.metadata.repositoryName} — ${d.titleSuffix}`;

    const nameEl = document.getElementById("m-name");
    if (nameEl) nameEl.textContent = data.metadata.repositoryName;
    const metaEl = document.getElementById("m-meta");
    if (metaEl) metaEl.innerHTML = buildMastheadHtml(data.metadata, lang);

    const { html, sections } = buildSectionsHtml(data, facts, colors, lang);
    mainEl.innerHTML = html;

    if (tocEl) {
      tocEl.innerHTML = sections.map((s) => `<a href="#${s.id}">${s.title}</a>`).join("");
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".toc a"));
      observer?.disconnect();
      if (typeof IntersectionObserver !== "undefined") {
        observer = new IntersectionObserver(
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

    drawAll(document.body, data, facts, colors, lang);
    bindMatrixFilters(document.body, facts, lang);
    bindCompositionFilter(document.body, facts, colors, lang);

    if (toggleEl) {
      for (const btn of Array.from(toggleEl.querySelectorAll<HTMLButtonElement>("button"))) {
        btn.classList.toggle("on", btn.dataset.lang === lang);
      }
    }
  };

  if (toggleEl) {
    toggleEl.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-lang]");
      if (!btn || !isLang(btn.dataset.lang) || btn.dataset.lang === lang) return;
      lang = btn.dataset.lang;
      renderAll();
    });
  }

  renderAll();
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => drawAll(document.body, data, facts, colors, lang), 250);
  });
}

bootstrapReport();

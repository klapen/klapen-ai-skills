// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { boot } from "../../src/report/shell";
import type { RepositoryData } from "../../src/shared/types";

function sampleData(withNarrative: boolean): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "r", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x", gitBranch: "main", gitCommit: "abcdef1234",
      parserCoverage: { full: 3, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 3, sourceFiles: 3, testFiles: 0, entities: 0, linesOfCode: 30, dependencyEdges: 2, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "repository:.", name: "r", relativePath: ".", kind: "repository" },
      { id: "file:a.ts", parentId: "repository:.", name: "a.ts", relativePath: "a.ts", kind: "file", loc: 10, fanIn: 1, riskScore: 10 },
      { id: "file:b.ts", parentId: "repository:.", name: "b.ts", relativePath: "b.ts", kind: "file", loc: 10, fanIn: 0, riskScore: 5 },
      { id: "file:c.ts", parentId: "repository:.", name: "c.ts", relativePath: "c.ts", kind: "file", loc: 10, fanIn: 0, riskScore: 20 },
    ],
    edges: [
      { id: "e1", source: "file:a.ts", target: "file:b.ts", type: "import", weight: 1 },
      { id: "e2", source: "file:a.ts", target: "file:c.ts", type: "import", weight: 1 },
    ],
    cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
    narrative: withNarrative
      ? { summary: "s", keyInsights: ["i"], readingList: [{ path: "a.ts", reason: "r" }], views: { repoMap: "x", depMatrix: "x", hotspots: "x" } }
      : undefined,
  };
}

function buildShellDom(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <header class="rk-header">
      <div class="rk-brand"><b id="rk-repo-name">—</b><span id="rk-branch"></span></div>
      <span class="rk-chip" id="rk-commit"></span>
      <span class="rk-chip" id="rk-generated"></span>
      <input id="rk-search" type="search" />
    </header>
    <nav class="rk-nav">
      <div id="rk-nav-views"></div>
      <div id="rk-filters">
        <label><input id="rk-filter-tests" type="checkbox" checked /></label>
        <label><input id="rk-filter-isolated" type="checkbox" checked /></label>
        <label><span id="rk-filter-risk-value">0</span><input id="rk-filter-risk" type="range" min="0" max="40" value="0" /></label>
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
  `;
  document.body.appendChild(root);
  return root;
}

describe("boot", () => {
  beforeEach(() => {
    // boot() reads/writes location.hash for view+selection state; jsdom's `location` is shared
    // across tests in this file, so an earlier test's view/selection would otherwise leak in.
    history.replaceState(null, "", "#");
  });

  it("renders nav buttons for all views, including Overview when narrative is present", () => {
    const root = buildShellDom();
    boot(root, sampleData(true));
    const labels = Array.from(root.querySelectorAll("#rk-nav-views button")).map((b) => b.textContent);
    expect(labels).toEqual(["Overview", "Dependency graph", "Symbols", "Repo map", "Matrix", "Hotspots"]);
  });

  it("omits the Overview nav item when narrative is absent, and defaults to the graph view", () => {
    const root = buildShellDom();
    boot(root, sampleData(false));
    const labels = Array.from(root.querySelectorAll("#rk-nav-views button")).map((b) => b.textContent);
    expect(labels).not.toContain("Overview");
    const active = root.querySelector('#rk-nav-views button[aria-current="true"]');
    expect(active?.textContent).toBe("Dependency graph");
  });

  it("populates header metadata", () => {
    const root = buildShellDom();
    boot(root, sampleData(false));
    expect(root.querySelector("#rk-repo-name")?.textContent).toBe("r");
    expect(root.querySelector("#rk-branch")?.textContent).toBe("main");
    expect(root.querySelector("#rk-commit")?.textContent).toBe("abcdef1");
  });

  it("switches views when a nav button is clicked", () => {
    const root = buildShellDom();
    boot(root, sampleData(false));
    const mapButton = Array.from(root.querySelectorAll<HTMLButtonElement>("#rk-nav-views button")).find((b) => b.textContent === "Repo map");
    mapButton?.dispatchEvent(new Event("click", { bubbles: true }));
    expect(mapButton?.getAttribute("aria-current")).toBe("true");
    expect(root.querySelector("#rk-stage svg")).toBeTruthy();
  });

  it("wires the search box to the shared filter state and re-renders the active view", () => {
    const root = buildShellDom();
    boot(root, sampleData(false));
    const search = root.querySelector<HTMLInputElement>("#rk-search")!;
    search.value = "nonexistent-file-name";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector("#rk-stage")?.textContent).toContain("No nodes match the current filters.");
  });

  it("selecting a node populates the detail panel", () => {
    const root = buildShellDom();
    boot(root, sampleData(false));
    const circle = root.querySelector<SVGCircleElement>("#rk-stage circle[data-node]");
    circle?.dispatchEvent(new Event("click", { bubbles: true }));
    expect(root.querySelector("#rk-detail")?.textContent).not.toContain("Nothing selected.");
  });

  it("the reset button clears filters and selection", () => {
    const root = buildShellDom();
    boot(root, sampleData(false));
    const search = root.querySelector<HTMLInputElement>("#rk-search")!;
    search.value = "a";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLButtonElement>("#rk-reset")?.dispatchEvent(new Event("click", { bubbles: true }));
    expect(search.value).toBe("");
    expect(root.querySelector("#rk-detail")?.textContent).toContain("Nothing selected.");
  });
});

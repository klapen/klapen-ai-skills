// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderRepoMap } from "../../src/report/repoMap";
import { AppState } from "../../src/report/state";
import type { RepositoryData } from "../../src/shared/types";

function sampleData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "r", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 2, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 2, sourceFiles: 2, testFiles: 0, entities: 0, linesOfCode: 30, dependencyEdges: 0, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "repository:.", name: "r", relativePath: ".", kind: "repository" },
      { id: "folder:src", parentId: "repository:.", name: "src", relativePath: "src", kind: "folder" },
      { id: "file:src/a.ts", parentId: "folder:src", name: "a.ts", relativePath: "src/a.ts", kind: "file", loc: 20, riskScore: 70 },
      { id: "file:src/b.ts", parentId: "folder:src", name: "b.ts", relativePath: "src/b.ts", kind: "file", loc: 10, riskScore: 10 },
    ],
    edges: [], cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

describe("renderRepoMap", () => {
  it("renders one rect per visible file node", () => {
    const container = document.createElement("div");
    renderRepoMap(container, sampleData(), new AppState());
    expect(container.querySelectorAll("g.rk-cell rect").length).toBe(2);
  });

  it("re-renders and hides nodes that no longer match an active filter", () => {
    const container = document.createElement("div");
    const state = new AppState();
    renderRepoMap(container, sampleData(), state);
    state.setFilter("minRisk", 50);
    expect(container.querySelectorAll("g.rk-cell rect").length).toBe(1);
  });

  it("clicking a cell selects its node id in shared state", () => {
    const container = document.createElement("div");
    const state = new AppState();
    renderRepoMap(container, sampleData(), state);
    const firstRect = container.querySelector("g.rk-cell rect") as SVGRectElement;
    firstRect.dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).not.toBeNull();
  });

  it("switching layout re-renders without throwing", () => {
    const container = document.createElement("div");
    const handle = renderRepoMap(container, sampleData(), new AppState());
    expect(() => handle.setLayout("treemap")).not.toThrow();
    expect(container.querySelectorAll("g.rk-cell rect").length).toBe(2);
  });
});

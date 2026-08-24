// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderDepMatrix } from "../../src/report/depMatrix";
import { AppState } from "../../src/report/state";
import type { RepositoryData } from "../../src/shared/types";

function sampleData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "r", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 2, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 2, sourceFiles: 2, testFiles: 0, entities: 0, linesOfCode: 0, dependencyEdges: 1, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "file:a.ts", name: "a.ts", relativePath: "a.ts", kind: "file" },
      { id: "file:b.ts", name: "b.ts", relativePath: "b.ts", kind: "file" },
    ],
    edges: [{ id: "e1", source: "file:a.ts", target: "file:b.ts", type: "import", weight: 3 }],
    cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

describe("renderDepMatrix", () => {
  it("renders one cell per row/col pair (n^2 for n visible files)", () => {
    const container = document.createElement("div");
    renderDepMatrix(container, sampleData(), new AppState());
    expect(container.querySelectorAll("rect.rk-matrix-cell").length).toBe(4);
  });

  it("renders one row label per visible file", () => {
    const container = document.createElement("div");
    renderDepMatrix(container, sampleData(), new AppState());
    expect(container.querySelectorAll("text.rk-matrix-row-label").length).toBe(2);
  });

  it("clicking a cell selects the row's node id", () => {
    const container = document.createElement("div");
    const state = new AppState();
    renderDepMatrix(container, sampleData(), state);
    const cell = container.querySelector("rect.rk-matrix-cell") as SVGRectElement;
    cell.dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).not.toBeNull();
  });

  it("switching edge type re-renders without throwing", () => {
    const container = document.createElement("div");
    const handle = renderDepMatrix(container, sampleData(), new AppState());
    expect(() => handle.setEdgeType("co-change")).not.toThrow();
  });

  it("renders one column label per visible file", () => {
    const container = document.createElement("div");
    renderDepMatrix(container, sampleData(), new AppState());
    expect(container.querySelectorAll("text.rk-matrix-col-label").length).toBe(2);
  });

  it("gives each cell a title tooltip naming both paths and the edge weight", () => {
    const container = document.createElement("div");
    renderDepMatrix(container, sampleData(), new AppState());
    const titles = Array.from(container.querySelectorAll("rect.rk-matrix-cell title")).map((t) => t.textContent);
    expect(titles).toHaveLength(4);
    expect(titles).toContain("a.ts -> b.ts (weight: 3)");
    expect(titles).toContain("a.ts -> a.ts");
  });
});

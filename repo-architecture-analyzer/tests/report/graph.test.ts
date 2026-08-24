// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderGraph } from "../../src/report/graph";
import { AppState } from "../../src/report/state";
import { makeViewContext } from "./viewTestHelpers";
import type { RepositoryData } from "../../src/shared/types";

function sampleData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "r", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 3, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 3, sourceFiles: 3, testFiles: 0, entities: 0, linesOfCode: 30, dependencyEdges: 2, cycles: 1, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "file:a.ts", name: "a.ts", relativePath: "a.ts", kind: "file", loc: 10 },
      { id: "file:b.ts", name: "b.ts", relativePath: "b.ts", kind: "file", loc: 10 },
      { id: "file:c.ts", name: "c.ts", relativePath: "c.ts", kind: "file", loc: 10 },
    ],
    edges: [
      { id: "e1", source: "file:a.ts", target: "file:b.ts", type: "import", weight: 1 },
      { id: "e2", source: "file:b.ts", target: "file:a.ts", type: "import", weight: 1 },
    ],
    cycles: [{ id: "cyc1", nodeIds: ["file:a.ts", "file:b.ts"] }],
    communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

function nodeCircles(container: HTMLElement): SVGCircleElement[] {
  return Array.from(container.querySelectorAll<SVGCircleElement>("circle[data-node]"));
}

describe("renderGraph (file level)", () => {
  it("renders one node per connected file and hides isolated files by default", () => {
    const ctx = makeViewContext(sampleData());
    renderGraph(ctx);
    expect(nodeCircles(ctx.stage).length).toBe(2);
  });

  it("shows isolated files when hideIsolated is turned off", () => {
    const state = new AppState();
    state.setFilter("hideIsolated", false);
    const ctx = makeViewContext(sampleData(), state);
    renderGraph(ctx);
    expect(nodeCircles(ctx.stage).length).toBe(3);
  });

  it("clicking a file node selects it", () => {
    const state = new AppState();
    const ctx = makeViewContext(sampleData(), state);
    renderGraph(ctx);
    nodeCircles(ctx.stage)[0].dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).not.toBeNull();
  });

  it("marks nodes participating in a cycle with a distinct stroke", () => {
    const ctx = makeViewContext(sampleData());
    renderGraph(ctx);
    const a = ctx.stage.querySelector('circle[data-node="file:a.ts"]');
    expect(a?.getAttribute("stroke")).toBe("#ff6b6b");
  });

  it("switching level to folder groups files into folder-level nodes", () => {
    const state = new AppState();
    state.setLevel("folder");
    const ctx = makeViewContext(sampleData(), state);
    renderGraph(ctx);
    const ids = nodeCircles(ctx.stage).map((c) => c.getAttribute("data-node"));
    expect(ids.every((id) => id?.startsWith("grp:"))).toBe(true);
  });

  it("shows an empty-state message when no nodes match the current filters", () => {
    const state = new AppState();
    state.setFilter("search", "nonexistent-file-name");
    const ctx = makeViewContext(sampleData(), state);
    renderGraph(ctx);
    expect(ctx.stage.textContent).toContain("No nodes match the current filters.");
  });
});

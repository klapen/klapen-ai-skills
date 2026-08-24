// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderRepoMap } from "../../src/report/repoMap";
import { AppState } from "../../src/report/state";
import { makeViewContext } from "./viewTestHelpers";
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

function fileRects(container: HTMLElement): SVGRectElement[] {
  return Array.from(container.querySelectorAll<SVGRectElement>('rect[data-node^="file:"]'));
}

describe("renderRepoMap (icicle, default layout)", () => {
  it("renders one rect per visible file node", () => {
    const ctx = makeViewContext(sampleData());
    renderRepoMap(ctx);
    expect(fileRects(ctx.stage).length).toBe(2);
  });

  it("hides nodes that no longer match an active filter", () => {
    const state = new AppState();
    state.setFilter("minRisk", 50);
    const ctx = makeViewContext(sampleData(), state);
    renderRepoMap(ctx);
    expect(fileRects(ctx.stage).length).toBe(1);
  });

  it("clicking a leaf cell selects its node id in shared state", () => {
    const state = new AppState();
    const ctx = makeViewContext(sampleData(), state);
    renderRepoMap(ctx);
    fileRects(ctx.stage)[0].dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).toBe("file:src/a.ts");
  });

  it("marks the selected node's stroke distinctly", () => {
    const state = new AppState();
    state.select("file:src/a.ts");
    const ctx = makeViewContext(sampleData(), state);
    renderRepoMap(ctx);
    const rect = ctx.stage.querySelector('rect[data-node="file:src/a.ts"]');
    expect(rect?.getAttribute("stroke")).toBe("#fff");
  });
});

describe("renderRepoMap (treemap layout)", () => {
  it("renders without throwing and produces one rect per visible file", () => {
    const state = new AppState();
    state.setMapLayout("treemap");
    const ctx = makeViewContext(sampleData(), state);
    expect(() => renderRepoMap(ctx)).not.toThrow();
    expect(fileRects(ctx.stage).length).toBe(2);
  });
});

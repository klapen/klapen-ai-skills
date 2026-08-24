// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderSymbols } from "../../src/report/symbols";
import { AppState } from "../../src/report/state";
import { makeViewContext } from "./viewTestHelpers";
import type { RepositoryData } from "../../src/shared/types";

function sampleData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "r", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 1, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 1, sourceFiles: 1, testFiles: 0, entities: 2, linesOfCode: 40, dependencyEdges: 0, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "file:a.ts", name: "a.ts", relativePath: "a.ts", kind: "file", loc: 40 },
      { id: "class:a.ts#Foo", parentId: "file:a.ts", name: "Foo", relativePath: "a.ts", kind: "class", loc: 20, complexity: 3 },
      { id: "function:a.ts#bar", parentId: "file:a.ts", name: "bar", relativePath: "a.ts", kind: "function", loc: 10, complexity: 1 },
    ],
    edges: [], cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

function symbolCircles(container: HTMLElement): SVGCircleElement[] {
  return Array.from(container.querySelectorAll<SVGCircleElement>("circle[data-node]"));
}

describe("renderSymbols", () => {
  it("defaults to the first file that has parsed symbols and renders one bubble per symbol", () => {
    const state = new AppState();
    const ctx = makeViewContext(sampleData(), state);
    renderSymbols(ctx);
    expect(state.symFile).toBe("file:a.ts");
    expect(symbolCircles(ctx.stage).length).toBe(2);
  });

  it("clicking a symbol selects it", () => {
    const state = new AppState();
    const ctx = makeViewContext(sampleData(), state);
    renderSymbols(ctx);
    symbolCircles(ctx.stage)[0].dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).not.toBeNull();
  });

  it("marks the selected symbol's stroke distinctly", () => {
    const state = new AppState();
    state.select("class:a.ts#Foo");
    const ctx = makeViewContext(sampleData(), state);
    renderSymbols(ctx);
    const circle = ctx.stage.querySelector('circle[data-node="class:a.ts#Foo"]');
    expect(circle?.getAttribute("stroke")).toBe("#fff");
  });

  it("shows an empty-state message when no file has parsed symbols", () => {
    const data = sampleData();
    data.nodes = [{ id: "file:empty.ts", name: "empty.ts", relativePath: "empty.ts", kind: "file" }];
    const ctx = makeViewContext(data);
    renderSymbols(ctx);
    expect(ctx.stage.textContent).toContain("No parsed symbols.");
  });
});

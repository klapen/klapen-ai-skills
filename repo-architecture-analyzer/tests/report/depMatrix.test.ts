// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderDepMatrix } from "../../src/report/depMatrix";
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
  it("renders one cell per actual edge (not a full n^2 grid)", () => {
    const ctx = makeViewContext(sampleData());
    renderDepMatrix(ctx);
    expect(ctx.stage.querySelectorAll("rect.rk-mcell").length).toBe(1);
  });

  it("renders one row label and one column label per connected file", () => {
    const ctx = makeViewContext(sampleData());
    renderDepMatrix(ctx);
    expect(ctx.stage.querySelectorAll("text.rk-mrowlabel").length).toBe(2);
    expect(ctx.stage.querySelectorAll("text.rk-mcollabel").length).toBe(2);
  });

  it("clicking a cell selects the row's node id", () => {
    const state = new AppState();
    const ctx = makeViewContext(sampleData(), state);
    renderDepMatrix(ctx);
    const cell = ctx.stage.querySelector("rect.rk-mcell") as SVGRectElement;
    cell.dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).not.toBeNull();
  });

  it("clicking a row label selects that file", () => {
    const state = new AppState();
    const ctx = makeViewContext(sampleData(), state);
    renderDepMatrix(ctx);
    const label = ctx.stage.querySelector("text.rk-mrowlabel") as SVGTextElement;
    label.dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).toBe("file:a.ts");
  });

  it("switching edge type re-renders without throwing", () => {
    const state = new AppState();
    const ctx = makeViewContext(sampleData(), state);
    renderDepMatrix(ctx);
    state.setEdgeType("co-change");
    expect(() => renderDepMatrix(ctx)).not.toThrow();
  });

  it("shows an empty-state message when no files are connected", () => {
    const data = sampleData();
    data.edges = [];
    const ctx = makeViewContext(data);
    renderDepMatrix(ctx);
    expect(ctx.stage.textContent).toContain("No connected files match the filters.");
  });

  it("gives each cell a tooltip via a mouseenter handler naming both paths and the weight", () => {
    let tipHtml = "";
    const ctx = makeViewContext(sampleData());
    ctx.showTip = (_ev, html) => {
      tipHtml = html;
    };
    renderDepMatrix(ctx);
    const cell = ctx.stage.querySelector("rect.rk-mcell") as SVGRectElement;
    cell.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tipHtml).toContain("a.ts");
    expect(tipHtml).toContain("b.ts");
    expect(tipHtml).toContain("weight");
  });
});

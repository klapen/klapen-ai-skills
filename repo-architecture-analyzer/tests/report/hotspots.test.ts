// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHotspots } from "../../src/report/hotspots";
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
    summary: { files: 3, sourceFiles: 3, testFiles: 0, entities: 0, linesOfCode: 0, dependencyEdges: 0, cycles: 0, architectureViolations: 0, hotspots: 1 },
    nodes: [
      { id: "file:a.ts", name: "a.ts", relativePath: "a.ts", kind: "file", churn: 100, complexity: 20, fanIn: 4, riskScore: 80 },
      { id: "file:b.ts", name: "b.ts", relativePath: "b.ts", kind: "file", churn: 5, complexity: 2, fanIn: 0, riskScore: 5 },
      { id: "file:c.ts", name: "c.ts", relativePath: "c.ts", kind: "file", churn: 30, complexity: 8, fanIn: 1, riskScore: 40 },
    ],
    edges: [], cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

function bubbles(container: HTMLElement): SVGCircleElement[] {
  return Array.from(container.querySelectorAll<SVGCircleElement>("circle[data-node]"));
}

describe("renderHotspots", () => {
  it("renders one bubble per visible file", () => {
    const ctx = makeViewContext(sampleData());
    renderHotspots(ctx);
    expect(bubbles(ctx.stage).length).toBe(3);
  });

  it("labels the top files by risk score", () => {
    const ctx = makeViewContext(sampleData());
    renderHotspots(ctx);
    const labels = Array.from(ctx.stage.querySelectorAll("text")).map((el) => el.textContent);
    expect(labels).toContain("a.ts");
  });

  it("clicking a bubble selects its node id", () => {
    const state = new AppState();
    const ctx = makeViewContext(sampleData(), state);
    renderHotspots(ctx);
    bubbles(ctx.stage)[0].dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).not.toBeNull();
  });

  it("marks the selected bubble's stroke distinctly", () => {
    const state = new AppState();
    state.select("file:a.ts");
    const ctx = makeViewContext(sampleData(), state);
    renderHotspots(ctx);
    const bubble = ctx.stage.querySelector('circle[data-node="file:a.ts"]');
    expect(bubble?.getAttribute("stroke")).toBe("#fff");
  });

  it("toggling log scale re-renders without throwing", () => {
    const state = new AppState();
    const ctx = makeViewContext(sampleData(), state);
    renderHotspots(ctx);
    state.setLogScale(true);
    expect(() => renderHotspots(ctx)).not.toThrow();
  });

  it("hides bubbles filtered out by shared state", () => {
    const state = new AppState();
    state.setFilter("minRisk", 50);
    const ctx = makeViewContext(sampleData(), state);
    renderHotspots(ctx);
    expect(bubbles(ctx.stage).length).toBe(1);
  });
});

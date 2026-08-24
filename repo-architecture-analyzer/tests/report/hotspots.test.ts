// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHotspots } from "../../src/report/hotspots";
import { AppState } from "../../src/report/state";
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

describe("renderHotspots", () => {
  it("renders one bubble per visible file", () => {
    const container = document.createElement("div");
    renderHotspots(container, sampleData(), new AppState());
    expect(container.querySelectorAll("circle.rk-hotspot-bubble").length).toBe(3);
  });

  it("labels the top files by risk score", () => {
    const container = document.createElement("div");
    renderHotspots(container, sampleData(), new AppState());
    const labels = Array.from(container.querySelectorAll("text.rk-hotspot-label")).map((el) => el.textContent);
    expect(labels).toContain("a.ts");
  });

  it("clicking a bubble selects its node id", () => {
    const container = document.createElement("div");
    const state = new AppState();
    renderHotspots(container, sampleData(), state);
    const bubble = container.querySelector("circle.rk-hotspot-bubble") as SVGCircleElement;
    bubble.dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).not.toBeNull();
  });

  it("toggling log scale re-renders without throwing", () => {
    const container = document.createElement("div");
    const handle = renderHotspots(container, sampleData(), new AppState());
    expect(() => handle.setLogScale(true)).not.toThrow();
  });

  it("hides bubbles filtered out by shared state", () => {
    const container = document.createElement("div");
    const state = new AppState();
    renderHotspots(container, sampleData(), state);
    state.setFilter("minRisk", 50);
    expect(container.querySelectorAll("circle.rk-hotspot-bubble").length).toBe(1);
  });
});

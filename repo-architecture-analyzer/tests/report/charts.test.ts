import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { deriveFacts } from "../../src/report/derive";
import { createColorScales } from "../../src/report/colors";
import { drawAll } from "../../src/report/charts";
import type { RepositoryData } from "../../src/shared/types";

function fixtureData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "fixture", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 3, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 3, sourceFiles: 3, testFiles: 0, entities: 0, linesOfCode: 40, dependencyEdges: 2, cycles: 1, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "repository:.", name: "fixture", relativePath: ".", kind: "repository" },
      { id: "folder:src", parentId: "repository:.", name: "src", relativePath: "src", kind: "folder" },
      { id: "file:src/a.ts", parentId: "folder:src", name: "a.ts", relativePath: "src/a.ts", kind: "file", loc: 20, fanIn: 1, fanOut: 1, churn: 30, complexity: 4, riskScore: 25, commitCount: 3 },
      { id: "file:src/b.ts", parentId: "folder:src", name: "b.ts", relativePath: "src/b.ts", kind: "file", loc: 20, fanIn: 1, fanOut: 1, churn: 10, complexity: 2, riskScore: 5, commitCount: 1 },
    ],
    edges: [
      { id: "e1", source: "file:src/a.ts", target: "file:src/b.ts", type: "import", weight: 1 },
      { id: "e2", source: "file:src/b.ts", target: "file:src/a.ts", type: "import", weight: 1 },
    ],
    cycles: [{ id: "cycle-1", nodeIds: ["file:src/a.ts", "file:src/b.ts"] }],
    communities: [],
    unresolvedDependencies: [],
    architectureRules: [],
    warnings: [],
  };
}

let dom: JSDOM;

beforeEach(() => {
  dom = new JSDOM(
    `<!doctype html><body>
      <div id="c-map" class="chart"></div><div id="l-map"></div>
      <div id="c-graph" class="chart"></div><div id="l-graph"></div>
      <div id="c-matrix" class="chart"></div>
      <div id="c-hot" class="chart"></div>
      <div id="tip"></div>
    </body>`
  );
  (globalThis as unknown as { window: typeof window }).window = dom.window as unknown as typeof window;
  (globalThis as unknown as { document: Document }).document = dom.window.document;
  (globalThis as unknown as { innerWidth: number }).innerWidth = 1024;
  (globalThis as unknown as { innerHeight: number }).innerHeight = 768;
});

afterEach(() => {
  dom.window.close();
});

describe("drawAll", () => {
  it("draws an SVG into each of the four chart containers", () => {
    const data = fixtureData();
    const facts = deriveFacts(data);
    const colors = createColorScales(facts);
    drawAll(dom.window.document.body, data, facts, colors);

    for (const id of ["c-map", "c-graph", "c-matrix", "c-hot"]) {
      const container = dom.window.document.getElementById(id);
      expect(container?.querySelector("svg")).toBeTruthy();
    }
  });

  it("marks the cycle pair with the risk colour in the graph view", () => {
    const data = fixtureData();
    const facts = deriveFacts(data);
    const colors = createColorScales(facts);
    drawAll(dom.window.document.body, data, facts, colors);

    const strokedRed = Array.from(dom.window.document.querySelectorAll("#c-graph circle")).some(
      (el) => el.getAttribute("stroke") === "#ff6b6b"
    );
    expect(strokedRed).toBe(true);
  });

  it("escapes an unsafe file name in a hover tooltip", () => {
    const data = fixtureData();
    (data.nodes[2] as { name: string }).name = "<img src=x onerror=alert(1)>";
    const facts = deriveFacts(data);
    const colors = createColorScales(facts);
    drawAll(dom.window.document.body, data, facts, colors);

    const circle = dom.window.document.querySelector("#c-hot circle");
    expect(circle).toBeTruthy();
    const event = new dom.window.MouseEvent("mouseenter", { clientX: 10, clientY: 10 });
    circle?.dispatchEvent(event);

    const tip = dom.window.document.getElementById("tip");
    expect(tip?.innerHTML ?? "").not.toContain("<img src=x onerror=alert(1)>");
  });

  it("does not throw when there are no files with git history for hotspots", () => {
    const data = fixtureData();
    for (const n of data.nodes) {
      if (n.kind === "file") {
        n.churn = undefined;
        n.complexity = undefined;
      }
    }
    const facts = deriveFacts(data);
    const colors = createColorScales(facts);
    expect(() => drawAll(dom.window.document.body, data, facts, colors)).not.toThrow();
  });
});

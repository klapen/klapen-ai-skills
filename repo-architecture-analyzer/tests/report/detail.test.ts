// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderDetail } from "../../src/report/detail";
import { deriveContext } from "../../src/report/derive";
import { AppState } from "../../src/report/state";
import type { RepositoryData } from "../../src/shared/types";

function sampleData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "r", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 2, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 2, sourceFiles: 2, testFiles: 0, entities: 1, linesOfCode: 30, dependencyEdges: 1, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "file:a.ts", name: "a.ts", relativePath: "a.ts", kind: "file", loc: 20, riskScore: 40, fanIn: 1, fanOut: 1 },
      { id: "file:b.ts", name: "b.ts", relativePath: "b.ts", kind: "file", loc: 10, riskScore: 5, fanIn: 0, fanOut: 0 },
      { id: "class:a.ts#Foo", parentId: "file:a.ts", name: "Foo", relativePath: "a.ts", kind: "class", loc: 20 },
    ],
    edges: [{ id: "e1", source: "file:a.ts", target: "file:b.ts", type: "import", weight: 1 }],
    cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

describe("renderDetail", () => {
  it("shows quick-lists when nothing is selected", () => {
    const data = sampleData();
    const container = document.createElement("div");
    renderDetail(container, deriveContext(data), new AppState(), () => {});
    expect(container.textContent).toContain("Nothing selected.");
    expect(container.textContent).toContain("Highest fan-in");
    expect(container.textContent).toContain("Highest risk");
  });

  it("shows full metrics, dependency, and symbol details for a selected file", () => {
    const data = sampleData();
    const state = new AppState();
    state.select("file:a.ts");
    const container = document.createElement("div");
    renderDetail(container, deriveContext(data), state, () => {});
    expect(container.textContent).toContain("a.ts");
    expect(container.textContent).toContain("risk score");
    expect(container.textContent).toContain("Foo");
  });

  it("shows a lighter detail view for a selected symbol", () => {
    const data = sampleData();
    const state = new AppState();
    state.select("class:a.ts#Foo");
    const container = document.createElement("div");
    renderDetail(container, deriveContext(data), state, () => {});
    expect(container.textContent).toContain("Foo");
    expect(container.textContent).toContain("Defined in");
  });

  it("clicking a quick-list entry invokes onSelect with that node's id", () => {
    const data = sampleData();
    const container = document.createElement("div");
    let selected: string | undefined;
    renderDetail(container, deriveContext(data), new AppState(), (id) => {
      selected = id;
    });
    const link = container.querySelector<HTMLAnchorElement>("[data-id]");
    link?.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    expect(selected).toBeDefined();
  });

  it("escapes HTML-unsafe characters in node names and paths", () => {
    const data = sampleData();
    data.nodes[0].name = "<script>evil()</script>";
    const state = new AppState();
    state.select("file:a.ts");
    const container = document.createElement("div");
    renderDetail(container, deriveContext(data), state, () => {});
    expect(container.innerHTML).not.toContain("<script>evil()</script>");
    expect(container.textContent).toContain("<script>evil()</script>");
  });
});

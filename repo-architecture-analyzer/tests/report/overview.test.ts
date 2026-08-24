// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderOverview } from "../../src/report/overview";
import { AppState } from "../../src/report/state";
import { makeViewContext } from "./viewTestHelpers";
import type { RepositoryData } from "../../src/shared/types";

function sampleData(withNarrative: boolean): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "2026-01-01T00:00:00.000Z", repositoryName: "r", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 1, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 1, sourceFiles: 1, testFiles: 0, entities: 0, linesOfCode: 10, dependencyEdges: 0, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [{ id: "file:a.ts", name: "a.ts", relativePath: "a.ts", kind: "file", loc: 10 }],
    edges: [], cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
    narrative: withNarrative
      ? {
          summary: "A tiny repo with one file.",
          keyInsights: ["a.ts is the only file."],
          readingList: [{ path: "a.ts", reason: "It is the only file." }],
          views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
        }
      : undefined,
  };
}

describe("renderOverview", () => {
  it("renders the narrative summary, key insights, and reading list", () => {
    const ctx = makeViewContext(sampleData(true));
    renderOverview(ctx);
    expect(ctx.stage.textContent).toContain("A tiny repo with one file.");
    expect(ctx.stage.textContent).toContain("a.ts is the only file.");
    expect(ctx.stage.textContent).toContain("It is the only file.");
  });

  it("escapes HTML-unsafe characters in narrative text", () => {
    const data = sampleData(true);
    data.narrative!.summary = "<script>evil()</script>";
    const ctx = makeViewContext(data);
    renderOverview(ctx);
    expect(ctx.stage.innerHTML).not.toContain("<script>evil()</script>");
    expect(ctx.stage.textContent).toContain("<script>evil()</script>");
  });

  it("shows a fallback message when no narrative is attached", () => {
    const ctx = makeViewContext(sampleData(false));
    renderOverview(ctx);
    expect(ctx.stage.textContent).toContain("No narrative was attached to this report.");
  });

  it("clicking a reading-list entry for a known file selects it and switches to the graph view", () => {
    const state = new AppState("overview");
    const ctx = makeViewContext(sampleData(true), state);
    renderOverview(ctx);
    const button = ctx.stage.querySelector<HTMLButtonElement>(".rk-rl__item");
    button?.dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).toBe("file:a.ts");
    expect(state.view).toBe("graph");
  });
});

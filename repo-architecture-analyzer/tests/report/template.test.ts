import { describe, it, expect } from "vitest";
import { buildReportHtml } from "../../src/report/template";
import type { RepositoryData, NarrativeContent } from "../../src/shared/types";

function minimalData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "My Repo", languages: [],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 0, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 0, sourceFiles: 0, testFiles: 0, entities: 0, linesOfCode: 0, dependencyEdges: 0, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [], edges: [], cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

describe("buildReportHtml", () => {
  it("embeds the dataset as a global assignment", () => {
    const html = buildReportHtml(minimalData(), { reportRuntimeJs: "" });
    expect(html).toContain("window.__REPO_ARCH_DATA__ =");
    expect(html).toContain('"repositoryName":"My Repo"');
  });

  it("inlines the provided report runtime JS verbatim", () => {
    const html = buildReportHtml(minimalData(), { reportRuntimeJs: "console.log('marker-xyz');" });
    expect(html).toContain("marker-xyz");
  });

  it("escapes HTML-unsafe characters in the repository name", () => {
    const data = minimalData();
    data.metadata.repositoryName = "<script>evil()</script>";
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the three view containers and the shared controls", () => {
    const html = buildReportHtml(minimalData(), { reportRuntimeJs: "" });
    for (const id of ["rk-repo-map", "rk-dep-matrix", "rk-hotspots", "rk-inspector", "rk-search", "rk-reset"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("prevents a </script> sequence inside embedded data from breaking out of the data script tag", () => {
    const data = minimalData();
    data.metadata.repositoryName = "</script><script>evil()</script>";
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html).not.toContain("</script><script>evil()</script>");
  });
});

function narrativeFixture(): NarrativeContent {
  return {
    summary: "A small TypeScript service with one entry point.",
    keyInsights: ["src/index.ts has the highest fan-in of any file."],
    readingList: [{ path: "src/index.ts", reason: "Main entry point." }],
    views: {
      repoMap: "The map is dominated by src/.",
      depMatrix: "No cycles were found.",
      hotspots: "No file crosses the risk threshold.",
    },
  };
}

describe("buildReportHtml — narrative", () => {
  it("renders nothing narrative-related when data.narrative is absent", () => {
    const html = buildReportHtml(minimalData(), { reportRuntimeJs: "" });
    expect(html).not.toContain("rk-narrative");
  });

  it("renders the narrative banner and per-view narrative paragraphs when present", () => {
    const data = minimalData();
    data.narrative = narrativeFixture();
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html).toContain('id="rk-narrative"');
    expect(html).toContain("A small TypeScript service with one entry point.");
    expect(html).toContain("src/index.ts has the highest fan-in of any file.");
    expect(html).toContain("Main entry point.");
    expect(html).toContain('id="rk-narrative-repo-map"');
    expect(html).toContain("The map is dominated by src/.");
    expect(html).toContain('id="rk-narrative-dep-matrix"');
    expect(html).toContain('id="rk-narrative-hotspots"');
  });

  it("escapes HTML-unsafe characters in narrative text", () => {
    const data = minimalData();
    data.narrative = narrativeFixture();
    data.narrative.summary = "<script>evil()</script>";
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

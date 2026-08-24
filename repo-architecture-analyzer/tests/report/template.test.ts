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

  it("escapes HTML-unsafe characters in the repository name shown in the <title>", () => {
    const data = minimalData();
    data.metadata.repositoryName = "<script>evil()</script>";
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html.split("<title>")[1]).not.toContain("<script>evil()</script>");
  });

  it("renders the app shell: nav container, filter controls, canvas, and detail panel", () => {
    const html = buildReportHtml(minimalData(), { reportRuntimeJs: "" });
    for (const id of [
      "rk-app", "rk-nav-views", "rk-search", "rk-filter-tests", "rk-filter-isolated",
      "rk-filter-risk", "rk-reset", "rk-toolbar", "rk-stage", "rk-detail", "rk-tip",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("prevents a </script> sequence inside embedded data from breaking out of the data script tag", () => {
    const data = minimalData();
    data.metadata.repositoryName = "</script><script>evil()</script>";
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html).not.toContain("</script><script>evil()</script>");
  });

  it("produces the identical shell whether or not a narrative is attached — narrative rendering is entirely client-side", () => {
    const withoutNarrative = buildReportHtml(minimalData(), { reportRuntimeJs: "" });
    const data = minimalData();
    data.narrative = narrativeFixture();
    const withNarrative = buildReportHtml(data, { reportRuntimeJs: "" });
    // Strip the embedded JSON payload (the only part expected to differ) and compare the rest.
    const stripPayload = (html: string): string => html.replace(/window\.__REPO_ARCH_DATA__ = .*?;<\/script>/s, "");
    expect(stripPayload(withNarrative)).toBe(stripPayload(withoutNarrative));
  });

  it("still embeds narrative content in the JSON payload when present, for the client-side Overview view to read", () => {
    const data = minimalData();
    data.narrative = narrativeFixture();
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html).toContain("A small TypeScript service with one entry point.");
    expect(html).toContain("src/index.ts has the highest fan-in of any file.");
  });
});

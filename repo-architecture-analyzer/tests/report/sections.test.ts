import { describe, it, expect } from "vitest";
import { deriveFacts } from "../../src/report/derive";
import { createColorScales } from "../../src/report/colors";
import { buildMastheadHtml, buildSectionsHtml } from "../../src/report/sections";
import type { NarrativeContent, RepositoryData } from "../../src/shared/types";

function fixtureData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "2026-01-01T12:00:00Z", repositoryName: "fixture", languages: ["typescript"],
      gitBranch: "main", gitCommit: "abc123def456", isDirty: false,
      analyzerVersion: "0.1.0", configurationHash: "hash1234",
      parserCoverage: { full: 2, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 2, sourceFiles: 2, testFiles: 0, entities: 0, linesOfCode: 35, dependencyEdges: 1, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "repository:.", name: "fixture", relativePath: ".", kind: "repository" },
      { id: "file:src/a.ts", parentId: "repository:.", name: "a.ts", relativePath: "src/a.ts", kind: "file", loc: 20, fanIn: 1, fanOut: 1, churn: 5, complexity: 3, riskScore: 15, commitCount: 2 },
      { id: "file:src/b.ts", parentId: "repository:.", name: "b.ts", relativePath: "src/b.ts", kind: "file", loc: 15, fanIn: 1, fanOut: 0 },
    ],
    edges: [{ id: "e1", source: "file:src/a.ts", target: "file:src/b.ts", type: "import", weight: 1 }],
    cycles: [],
    communities: [],
    unresolvedDependencies: [],
    architectureRules: [],
    warnings: [],
  };
}

function narrativeFixture(): NarrativeContent {
  return {
    en: {
      summary: "A small fixture repo with two files.",
      keyInsights: ["src/a.ts has the highest fan-in of any file."],
      readingList: [{ path: "src/a.ts", reason: "Start here." }],
      views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
    },
    es: {
      summary: "Un pequeño repositorio de prueba con dos archivos.",
      keyInsights: ["src/a.ts tiene el mayor fan-in de cualquier archivo."],
      readingList: [{ path: "src/a.ts", reason: "Empieza aquí." }],
      views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
    },
  };
}

function build(data: RepositoryData) {
  const facts = deriveFacts(data);
  const colors = createColorScales(facts);
  return buildSectionsHtml(data, facts, colors, "en");
}

describe("buildMastheadHtml", () => {
  it("renders branch, commit, dirty state, and languages", () => {
    const html = buildMastheadHtml(fixtureData().metadata, "en");
    expect(html).toContain("main");
    expect(html).toContain("abc123def4");
    expect(html).toContain("clean worktree");
    expect(html).toContain("typescript");
  });

  it("flags a dirty worktree distinctly", () => {
    const data = fixtureData();
    data.metadata.isDirty = true;
    const html = buildMastheadHtml(data.metadata, "en");
    expect(html).toContain("dirty worktree");
    expect(html).toContain('class="dirty"');
  });

  it("renders Spanish labels when lang is es", () => {
    const html = buildMastheadHtml(fixtureData().metadata, "es");
    expect(html).toContain("árbol de trabajo limpio");
  });
});

describe("buildSectionsHtml — narrative gating", () => {
  it("omits Executive summary and Where to start reading when narrative is absent", () => {
    const { html, sections } = build(fixtureData());
    expect(sections.some((s) => s.id === "summary")).toBe(false);
    expect(sections.some((s) => s.id === "reading")).toBe(false);
    expect(html).not.toContain('id="summary"');
    expect(html).not.toContain('id="reading"');
  });

  it("still renders every non-narrative section without a narrative", () => {
    const { sections } = build(fixtureData());
    const ids = sections.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["snapshot", "map", "graph", "coupling", "hidden", "risk", "history"]));
  });

  it("includes Executive summary and Where to start reading when narrative is present", () => {
    const data = fixtureData();
    data.narrative = narrativeFixture();
    const { html, sections } = build(data);
    expect(sections.some((s) => s.id === "summary")).toBe(true);
    expect(sections.some((s) => s.id === "reading")).toBe(true);
    expect(html).toContain("A small fixture repo with two files.");
    expect(html).toContain("src/a.ts has the highest fan-in of any file.");
    expect(html).toContain("Start here.");
  });

  it("renders the Spanish narrative content when lang is es", () => {
    const data = fixtureData();
    data.narrative = narrativeFixture();
    const facts = deriveFacts(data);
    const colors = createColorScales(facts);
    const { html } = buildSectionsHtml(data, facts, colors, "es");
    expect(html).toContain("Un pequeño repositorio de prueba con dos archivos.");
    expect(html).toContain("Empieza aquí.");
    expect(html).not.toContain("A small fixture repo with two files.");
  });
});

describe("buildSectionsHtml — escaping", () => {
  it("escapes an unsafe narrative summary", () => {
    const data = fixtureData();
    data.narrative = narrativeFixture();
    data.narrative.en.summary = "<script>evil()</script>";
    const { html } = build(data);
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes an unsafe file relativePath appearing in a table", () => {
    const data = fixtureData();
    data.nodes.push({
      id: "file:<img src=x onerror=alert(1)>.ts",
      parentId: "repository:.",
      name: "<img src=x onerror=alert(1)>.ts",
      relativePath: "<img src=x onerror=alert(1)>.ts",
      kind: "file",
      loc: 1,
      churn: 100,
      commitCount: 9,
    });
    const { html } = build(data);
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("buildSectionsHtml — content", () => {
  it("renders the snapshot stat grid with real numbers", () => {
    const { html } = build(fixtureData());
    expect(html).toContain("<b>2</b><span>files</span>");
    expect(html).toContain("<b>35</b><span>lines of code</span>");
  });

  it("mounts chart containers for the map, graph, matrix, and hotspots charts", () => {
    const { html } = build(fixtureData());
    for (const id of ["c-map", "c-graph", "c-matrix", "c-hot"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("breaks composition down by code/documentation/assets category", () => {
    const { html } = build(fixtureData());
    expect(html).toContain("Lines of code by category");
    expect(html).toContain("Code  ·  2 files");
    expect(html).toContain("100% of this repository is actual code");
  });

  it("renders the category breakdown in Spanish when lang is es", () => {
    const data = fixtureData();
    const facts = deriveFacts(data);
    const colors = createColorScales(facts);
    const { html } = buildSectionsHtml(data, facts, colors, "es");
    expect(html).toContain("Líneas de código por categoría");
    expect(html).toContain("Código  ·  2 archivos");
  });
});

import { describe, it, expect } from "vitest";
import { deriveFacts, groupOf, extOf, categoryOf } from "../../src/report/derive";
import type { RepositoryData } from "../../src/shared/types";

function fixtureData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "fixture", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 3, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 3, sourceFiles: 3, testFiles: 1, entities: 1, linesOfCode: 60, dependencyEdges: 2, cycles: 1, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "repository:.", name: "fixture", relativePath: ".", kind: "repository" },
      { id: "file:src/a.ts", parentId: "repository:.", name: "a.ts", relativePath: "src/a.ts", kind: "file", loc: 20, fanIn: 1, fanOut: 1, churn: 40, complexity: 5, riskScore: 30, commitCount: 4, contributorCount: 2, lastModified: "2026-01-02T00:00:00Z" },
      { id: "file:src/b.ts", parentId: "repository:.", name: "b.ts", relativePath: "src/b.ts", kind: "file", loc: 15, fanIn: 1, fanOut: 1, churn: 10, complexity: 2, riskScore: 10, commitCount: 1, contributorCount: 1, lastModified: "2026-01-01T00:00:00Z" },
      { id: "file:src/c.ts", parentId: "repository:.", name: "c.ts", relativePath: "src/c.ts", kind: "file", loc: 5, fanIn: 0, fanOut: 0, churn: 0, complexity: 0, riskScore: 0 },
      { id: "file:tests/a.test.ts", parentId: "repository:.", name: "a.test.ts", relativePath: "tests/a.test.ts", kind: "file", loc: 20, isTest: true },
      { id: "class:src/a.ts#Foo", parentId: "file:src/a.ts", name: "Foo", relativePath: "src/a.ts", kind: "class", complexity: 8, loc: 12 },
    ],
    edges: [
      { id: "e1", source: "file:src/a.ts", target: "file:src/b.ts", type: "import", weight: 1 },
      { id: "e2", source: "file:src/b.ts", target: "file:src/a.ts", type: "import", weight: 1 },
      { id: "e3", source: "file:src/a.ts", target: "file:src/c.ts", type: "co-change", weight: 5, confidence: 0.8 },
    ],
    cycles: [{ id: "cycle-1", nodeIds: ["file:src/a.ts", "file:src/b.ts"] }],
    communities: [],
    unresolvedDependencies: [],
    architectureRules: [],
    warnings: [],
  };
}

describe("groupOf / extOf", () => {
  it("groups by the top two path segments", () => {
    expect(groupOf("src/report/derive.ts")).toBe("src/report");
    expect(groupOf("README.md")).toBe("(root)");
  });

  it("extracts the file extension", () => {
    expect(extOf("src/report/derive.ts")).toBe(".ts");
    expect(extOf("LICENSE")).toBe("(none)");
  });
});

describe("categoryOf", () => {
  it("classifies known programming-language extensions as code", () => {
    expect(categoryOf("derive.ts", ".ts")).toBe("code");
    expect(categoryOf("render.py", ".py")).toBe("code");
    expect(categoryOf("main.go", ".go")).toBe("code");
  });

  it("classifies markdown/text extensions and extensionless doc filenames as docs", () => {
    expect(categoryOf("HANDOFF.md", ".md")).toBe("docs");
    expect(categoryOf("notes.txt", ".txt")).toBe("docs");
    expect(categoryOf("LICENSE", "(none)")).toBe("docs");
    expect(categoryOf("README", "(none)")).toBe("docs");
  });

  it("falls back to assets for everything else, including config/data and extensionless non-doc files", () => {
    expect(categoryOf("example.html", ".html")).toBe("assets");
    expect(categoryOf("logo.svg", ".svg")).toBe("assets");
    expect(categoryOf("config.json", ".json")).toBe("assets");
    expect(categoryOf("Dockerfile", "(none)")).toBe("assets");
  });
});

describe("deriveFacts", () => {
  it("separates files from symbols and groups symbols by parent file", () => {
    const facts = deriveFacts(fixtureData());
    expect(facts.files.map((f) => f.id).sort()).toEqual(
      ["file:src/a.ts", "file:src/b.ts", "file:src/c.ts", "file:tests/a.test.ts"].sort()
    );
    expect(facts.symbols).toHaveLength(1);
    expect(facts.symsByFile.get("file:src/a.ts")).toHaveLength(1);
  });

  it("detects the cycle and marks both member nodes and both directed pairs", () => {
    const facts = deriveFacts(fixtureData());
    expect(facts.cycleNodes.has("file:src/a.ts")).toBe(true);
    expect(facts.cycleNodes.has("file:src/b.ts")).toBe(true);
    expect(facts.cyclePairs.has("file:src/a.ts|file:src/b.ts")).toBe(true);
    expect(facts.cyclePairs.has("file:src/b.ts|file:src/a.ts")).toBe(true);
  });

  it("ranks hubs/spokes/risky/churned by their respective metric, descending", () => {
    const facts = deriveFacts(fixtureData());
    expect(facts.risky[0].id).toBe("file:src/a.ts");
    expect(facts.churned[0].id).toBe("file:src/a.ts");
  });

  it("finds hidden coupling: a co-change pair with no import between them", () => {
    const facts = deriveFacts(fixtureData());
    expect(facts.hidden).toHaveLength(1);
    expect(facts.hidden[0].a.id).toBe("file:src/a.ts");
    expect(facts.hidden[0].b.id).toBe("file:src/c.ts");
  });

  it("does not flag an import-connected pair as hidden coupling", () => {
    const facts = deriveFacts(fixtureData());
    const flagged = facts.hidden.some(
      (h) => (h.a.id === "file:src/a.ts" && h.b.id === "file:src/b.ts") || (h.a.id === "file:src/b.ts" && h.b.id === "file:src/a.ts")
    );
    expect(flagged).toBe(false);
  });

  it("treats a file with no import edges as an orphan", () => {
    const facts = deriveFacts(fixtureData());
    expect(facts.orphans.map((f) => f.id)).toContain("file:src/c.ts");
  });

  it("counts tests separately and computes total LOC across files", () => {
    const facts = deriveFacts(fixtureData());
    expect(facts.tests).toHaveLength(1);
    expect(facts.loc).toBe(60);
  });

  it("buckets every file into exactly one of code/docs/assets, covering all files and all LOC", () => {
    const data = fixtureData();
    data.nodes.push(
      { id: "file:README.md", parentId: "repository:.", name: "README.md", relativePath: "README.md", kind: "file", loc: 8 },
      { id: "file:logo.svg", parentId: "repository:.", name: "logo.svg", relativePath: "assets/logo.svg", kind: "file", loc: 3 }
    );
    const facts = deriveFacts(data);
    const byKey = Object.fromEntries(facts.byCategory.map((c) => [c.key, c]));
    expect(byKey.code).toEqual({ key: "code", files: 4, loc: 60 });
    expect(byKey.docs).toEqual({ key: "docs", files: 1, loc: 8 });
    expect(byKey.assets).toEqual({ key: "assets", files: 1, loc: 3 });
    const totalFiles = facts.byCategory.reduce((n, c) => n + c.files, 0);
    const totalLoc = facts.byCategory.reduce((n, c) => n + c.loc, 0);
    expect(totalFiles).toBe(facts.files.length);
    expect(totalLoc).toBe(sumLoc(facts.files));
  });
});

function sumLoc(files: { loc?: number }[]): number {
  return files.reduce((n, f) => n + (f.loc ?? 0), 0);
}

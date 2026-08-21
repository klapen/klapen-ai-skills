import { describe, it, expect } from "vitest";
import { validateRepositoryData } from "../../src/shared/validate";
import type { RepositoryData } from "../../src/shared/types";

function minimalData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      repositoryName: "fixture",
      languages: ["typescript"],
      analyzerVersion: "0.1.0",
      configurationHash: "abc123",
      parserCoverage: { full: 1, partial: 0, skipped: 0, failed: 0 },
    },
    summary: {
      files: 1,
      sourceFiles: 1,
      testFiles: 0,
      entities: 0,
      linesOfCode: 10,
      dependencyEdges: 0,
      cycles: 0,
      architectureViolations: 0,
      hotspots: 0,
    },
    nodes: [],
    edges: [],
    cycles: [],
    communities: [],
    unresolvedDependencies: [],
    architectureRules: [],
    warnings: [],
  };
}

describe("validateRepositoryData", () => {
  it("accepts a minimal well-formed document", () => {
    const result = validateRepositoryData(minimalData());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a document missing a required metadata field", () => {
    const data = minimalData() as any;
    delete data.metadata.schemaVersion;
    const result = validateRepositoryData(data);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a node with an invalid kind", () => {
    const data = minimalData() as any;
    data.nodes.push({ id: "x", name: "x", relativePath: "x", kind: "not-a-kind" });
    const result = validateRepositoryData(data);
    expect(result.valid).toBe(false);
  });
});

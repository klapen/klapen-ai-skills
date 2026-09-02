import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { annotateRiskScores } from "../../src/graph/risk";
import { walkRepository } from "../../src/analyzers/filesystem/walk";
import { analyzeTypeScriptFiles } from "../../src/analyzers/languages/typescript";
import { analyzePythonFiles } from "../../src/analyzers/languages/python";
import { loadConfig } from "../../src/shared/config";
import { assembleGraph } from "../../src/graph/assemble";
import { annotateComplexity } from "../../src/graph/complexity";
import type { CodeNode } from "../../src/shared/types";

const FIXTURE_ROOT = fileURLToPath(new URL("../../examples/fixture-repo", import.meta.url));

const weights = { complexityWeight: 0.3, churnWeight: 0.25, couplingWeight: 0.2, cycleWeight: 0.15, coverageWeight: 0.1 };

describe("annotateRiskScores", () => {
  it("gives the file with the worst metrics a higher score than a clean file", () => {
    const nodes: CodeNode[] = [
      { id: "file:a", name: "a", relativePath: "a", kind: "file", churn: 100, fanIn: 5, fanOut: 5, cycleCount: 2, coverage: 10 },
      { id: "class:a#A", name: "A", relativePath: "a", kind: "class", qualifiedName: "A", complexity: 20 },
      { id: "file:b", name: "b", relativePath: "b", kind: "file", churn: 1, fanIn: 0, fanOut: 0, cycleCount: 0, coverage: 100 },
      { id: "class:b#B", name: "B", relativePath: "b", kind: "class", qualifiedName: "B", complexity: 1 },
    ];

    annotateRiskScores(nodes, weights);

    const a = nodes.find((n) => n.id === "file:a")!;
    const b = nodes.find((n) => n.id === "file:b")!;
    expect(a.riskScore).toBeGreaterThan(b.riskScore!);
    expect(b.riskScore).toBeGreaterThanOrEqual(0);
  });

  it("gives a file with zero metrics and no cycles a risk score of 0", () => {
    const nodes: CodeNode[] = [{ id: "file:z", name: "z", relativePath: "z", kind: "file", churn: 0, fanIn: 0, fanOut: 0, cycleCount: 0 }];
    annotateRiskScores(nodes, weights);
    expect(nodes[0].riskScore).toBe(0);
  });

  it("aggregates entity complexity onto the owning file node", () => {
    const nodes: CodeNode[] = [
      { id: "file:a", name: "a", relativePath: "a", kind: "file" },
      { id: "fn:a#one", name: "one", relativePath: "a", kind: "function", qualifiedName: "one", complexity: 3 },
      { id: "fn:a#two", name: "two", relativePath: "a", kind: "function", qualifiedName: "two", complexity: 4 },
    ];
    annotateRiskScores(nodes, weights);
    expect(nodes.find((n) => n.id === "file:a")!.complexity).toBe(7);
  });
});

describe("annotateRiskScores — real pipeline integration", () => {
  it("aggregates complexity from real entities in fixture repo via real pipeline", () => {
    const config = loadConfig();
    const files = walkRepository(FIXTURE_ROOT, config);
    const ts = analyzeTypeScriptFiles(FIXTURE_ROOT, files);
    const py = analyzePythonFiles(FIXTURE_ROOT, files);
    const graph = assembleGraph(FIXTURE_ROOT, "fixture-repo", files, [ts, py], [], config);

    // Annotate complexity first (this sets complexity on entities)
    annotateComplexity(graph.nodes, [...ts.entities, ...py.entities], files);

    // Now annotate risk scores (this should aggregate entity complexity onto file nodes)
    annotateRiskScores(graph.nodes, config.risk);

    // Verify file nodes have aggregated complexity
    const fileNodes = graph.nodes.filter((n) => n.kind === "file");
    const filesWithComplexity = fileNodes.filter((n) => (n.complexity ?? 0) > 0);

    expect(fileNodes.length).toBeGreaterThan(0);
    expect(filesWithComplexity.length).toBeGreaterThan(0);

    // All files should have a risk score after annotation
    fileNodes.forEach((file) => {
      expect(file.riskScore).toBeDefined();
      expect(file.riskScore).toBeGreaterThanOrEqual(0);
      expect(file.riskScore).toBeLessThanOrEqual(100);
    });
  });
});

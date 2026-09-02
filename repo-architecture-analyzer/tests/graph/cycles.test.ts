import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../src/analyzers/filesystem/walk";
import { analyzeTypeScriptFiles } from "../../src/analyzers/languages/typescript";
import { analyzePythonFiles } from "../../src/analyzers/languages/python";
import { loadConfig } from "../../src/shared/config";
import { assembleGraph } from "../../src/graph/assemble";
import { findCycles, annotateCycleCounts } from "../../src/graph/cycles";
import type { CodeNode, CodeEdge } from "../../src/shared/types";

const FIXTURE_ROOT = fileURLToPath(new URL("../../examples/fixture-repo", import.meta.url));

describe("findCycles — fixture repo", () => {
  const files = walkRepository(FIXTURE_ROOT, loadConfig());
  const ts = analyzeTypeScriptFiles(FIXTURE_ROOT, files);
  const py = analyzePythonFiles(FIXTURE_ROOT, files);
  const graph = assembleGraph(FIXTURE_ROOT, "fixture-repo", files, [ts, py], [], loadConfig());
  const cycles = findCycles(graph.nodes, graph.edges);
  const fileId = (rel: string) => graph.nodes.find((n) => n.relativePath === rel)!.id;

  it("finds the a.ts <-> b.ts cycle", () => {
    expect(cycles).toHaveLength(1);
    expect(cycles[0].nodeIds.sort()).toEqual([fileId("src/a.ts"), fileId("src/b.ts")].sort());
  });

  it("does not include utils/c.ts, which only receives imports", () => {
    expect(cycles.some((c) => c.nodeIds.includes(fileId("src/utils/c.ts")))).toBe(false);
  });

  it("annotates cycleCount on participating nodes only", () => {
    annotateCycleCounts(graph.nodes, cycles);
    const aNode = graph.nodes.find((n) => n.id === fileId("src/a.ts"))!;
    const cNode = graph.nodes.find((n) => n.id === fileId("src/utils/c.ts"))!;
    expect(aNode.cycleCount).toBe(1);
    expect(cNode.cycleCount ?? 0).toBe(0);
  });
});

describe("findCycles — synthetic 3-node cycle", () => {
  it("detects a longer cycle p -> q -> r -> p", () => {
    const nodes: CodeNode[] = ["p", "q", "r"].map((id) => ({ id, name: id, relativePath: id, kind: "file" }));
    const edges: CodeEdge[] = [
      { id: "e1", source: "p", target: "q", type: "import", weight: 1 },
      { id: "e2", source: "q", target: "r", type: "import", weight: 1 },
      { id: "e3", source: "r", target: "p", type: "import", weight: 1 },
    ];
    const cycles = findCycles(nodes, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].nodeIds.sort()).toEqual(["p", "q", "r"]);
  });
});

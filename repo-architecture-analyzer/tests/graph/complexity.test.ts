import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../src/analyzers/filesystem/walk";
import { analyzeTypeScriptFiles } from "../../src/analyzers/languages/typescript";
import { analyzePythonFiles } from "../../src/analyzers/languages/python";
import { loadConfig } from "../../src/shared/config";
import { assembleGraph } from "../../src/graph/assemble";
import { annotateComplexity } from "../../src/graph/complexity";

const FIXTURE_ROOT = fileURLToPath(new URL("../../examples/fixture-repo", import.meta.url));

describe("annotateComplexity", () => {
  const config = loadConfig();
  const files = walkRepository(FIXTURE_ROOT, config);
  const ts = analyzeTypeScriptFiles(FIXTURE_ROOT, files);
  const py = analyzePythonFiles(FIXTURE_ROOT, files);
  const graph = assembleGraph(FIXTURE_ROOT, "fixture-repo", files, [ts, py], [], config);
  annotateComplexity(graph.nodes, [...ts.entities, ...py.entities], files);

  const byQualifiedName = (qn: string) => graph.nodes.find((n) => n.qualifiedName === qn)!;

  it("gives a branch-free function complexity 1", () => {
    expect(byQualifiedName("AService.run").complexity).toBe(1);
  });

  it("adds 1 per if-statement in TypeScript", () => {
    expect(byQualifiedName("bFunction").complexity).toBe(2);
  });

  it("adds 1 per if-statement in Python", () => {
    expect(byQualifiedName("Formatter.render").complexity).toBe(2);
  });

  it("measures deeper nesting for a function with a branch than one without", () => {
    const branchy = byQualifiedName("Formatter.render").nestingDepth ?? 0;
    const flat = byQualifiedName("AService.run").nestingDepth ?? 0;
    expect(branchy).toBeGreaterThan(flat);
  });
});

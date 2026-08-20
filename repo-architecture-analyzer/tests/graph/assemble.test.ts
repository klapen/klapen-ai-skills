import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../src/analyzers/filesystem/walk";
import { analyzeTypeScriptFiles } from "../../src/analyzers/languages/typescript";
import { analyzePythonFiles } from "../../src/analyzers/languages/python";
import { loadConfig } from "../../src/shared/config";
import { assembleGraph } from "../../src/graph/assemble";
import type { WalkedFile } from "../../src/analyzers/filesystem/walk";
import type { LanguageAnalysisResult } from "../../src/analyzers/languages/typescript";

const FIXTURE_ROOT = fileURLToPath(new URL("../../examples/fixture-repo", import.meta.url));

function buildFixtureGraph(config = loadConfig()) {
  const files = walkRepository(FIXTURE_ROOT, config);
  const ts = analyzeTypeScriptFiles(FIXTURE_ROOT, files);
  const py = analyzePythonFiles(FIXTURE_ROOT, files);
  return assembleGraph(FIXTURE_ROOT, "fixture-repo", files, [ts, py], [], config);
}

describe("assembleGraph — hierarchy", () => {
  const graph = buildFixtureGraph();
  const byPath = new Map(graph.nodes.map((n) => [n.relativePath, n]));

  it("creates a repository root and nested folder nodes", () => {
    expect(byPath.get(".")?.kind).toBe("repository");
    expect(byPath.get("src")?.kind).toBe("folder");
    expect(byPath.get("src/utils")?.parentId).toBe(byPath.get("src")?.id);
  });

  it("creates file nodes with language, loc, and correct parent folder", () => {
    const aFile = byPath.get("src/a.ts");
    expect(aFile?.kind).toBe("file");
    expect(aFile?.language).toBe("typescript");
    expect(aFile?.loc).toBeGreaterThan(0);
    expect(aFile?.parentId).toBe(byPath.get("src")?.id);
  });

  it("nests a method node under its class node, not directly under the file", () => {
    const helperClass = graph.nodes.find((n) => n.kind === "class" && n.qualifiedName === "Helper");
    const addMethod = graph.nodes.find((n) => n.kind === "method" && n.qualifiedName === "Helper.add");
    expect(addMethod?.parentId).toBe(helperClass?.id);
  });
});

describe("assembleGraph — import edges and fan-in/out", () => {
  const graph = buildFixtureGraph();
  const fileNode = (rel: string) => graph.nodes.find((n) => n.kind === "file" && n.relativePath === rel)!;

  it("creates one aggregated import edge per source/target file pair", () => {
    const aToB = graph.edges.find(
      (e) => e.type === "import" && e.source === fileNode("src/a.ts").id && e.target === fileNode("src/b.ts").id
    );
    expect(aToB).toBeDefined();
    expect(aToB?.weight).toBe(1);
  });

  it("computes fan-in on a file imported by two others", () => {
    expect(fileNode("src/utils/c.ts").fanIn).toBe(2);
  });

  it("computes fan-out on a file that imports two others", () => {
    expect(fileNode("src/a.ts").fanOut).toBe(2);
  });

  it("cross-language: resolves a Python same-directory import as an edge", () => {
    const mainToHelpers = graph.edges.find(
      (e) => e.type === "import" && e.source === fileNode("pyapp/main.py").id && e.target === fileNode("pyapp/helpers.py").id
    );
    expect(mainToHelpers).toBeDefined();
  });
});

describe("assembleGraph — unresolved dependencies and co-change", () => {
  it("records an unresolved relative import instead of dropping it", () => {
    const files: WalkedFile[] = [
      { absolutePath: "/does-not-exist/x.ts", relativePath: "x.ts", classification: "source", language: "typescript" },
    ];
    const languageResults: LanguageAnalysisResult[] = [
      { entities: [], imports: [{ fromRelativePath: "x.ts", specifier: "./missing" }] },
    ];
    const graph = assembleGraph(FIXTURE_ROOT, "fixture-repo", files, languageResults, [], loadConfig());
    expect(graph.unresolvedDependencies).toHaveLength(1);
    expect(graph.unresolvedDependencies[0].specifier).toBe("./missing");
  });

  it("turns a co-change pair into a co-change edge", () => {
    const graph = buildFixtureGraph();
    const withCoChange = assembleGraph(
      FIXTURE_ROOT,
      "fixture-repo",
      graph.nodes.filter((n) => n.kind === "file").map((n) => ({
        absolutePath: n.relativePath,
        relativePath: n.relativePath,
        classification: "source",
        language: n.language ?? null,
      })),
      [],
      [{ fileA: "src/a.ts", fileB: "src/b.ts", commits: 5, confidence: 0.8 }],
      loadConfig()
    );
    const coChangeEdge = withCoChange.edges.find((e) => e.type === "co-change");
    expect(coChangeEdge?.weight).toBe(5);
    expect(coChangeEdge?.confidence).toBeCloseTo(0.8);
  });
});

describe("assembleGraph — architecture layers", () => {
  it("flags an architecture violation only when layers are configured", () => {
    const layers = [
      { name: "a-layer", match: ["src/a.ts"], mayDependOn: ["b-layer", "c-layer"] },
      { name: "b-layer", match: ["src/b.ts"], mayDependOn: ["c-layer"] },
      { name: "c-layer", match: ["src/utils/**"], mayDependOn: [] },
    ];
    const config = { ...loadConfig(), layers };
    const graph = buildFixtureGraph(config);
    const fileId = (rel: string) => graph.nodes.find((n) => n.relativePath === rel)!.id;

    const aToB = graph.edges.find((e) => e.source === fileId("src/a.ts") && e.target === fileId("src/b.ts"));
    const bToA = graph.edges.find((e) => e.source === fileId("src/b.ts") && e.target === fileId("src/a.ts"));

    expect(aToB?.isCrossLayer).toBe(true);
    expect(aToB?.isArchitectureViolation).toBe(false); // a-layer may depend on b-layer
    expect(bToA?.isArchitectureViolation).toBe(true); // b-layer may not depend on a-layer
  });

  it("leaves isCrossLayer/isArchitectureViolation undefined with no layers configured (default config)", () => {
    const graph = buildFixtureGraph();
    const anyImportEdge = graph.edges.find((e) => e.type === "import")!;
    expect(anyImportEdge.isCrossLayer).toBeUndefined();
    expect(anyImportEdge.isArchitectureViolation).toBeUndefined();
  });
});

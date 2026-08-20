import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../../src/analyzers/filesystem/walk";
import { loadConfig } from "../../../src/shared/config";
import { analyzePythonFiles } from "../../../src/analyzers/languages/python";

const FIXTURE_ROOT = fileURLToPath(new URL("../../../examples/fixture-repo", import.meta.url));

describe("analyzePythonFiles", () => {
  const files = walkRepository(FIXTURE_ROOT, loadConfig());
  const result = analyzePythonFiles(FIXTURE_ROOT, files);

  it("extracts top-level functions and classes with their methods", () => {
    const names = result.entities.map((e) => e.qualifiedName);
    expect(names).toContain("double");
    expect(names).toContain("Formatter");
    expect(names).toContain("Formatter.render");
    expect(names).toContain("main");
  });

  it("computes accurate line counts and start/end lines for all entities", () => {
    const double = result.entities.find((e) => e.qualifiedName === "double");
    expect(double).toMatchObject({ startLine: 1, endLine: 2, loc: 2, language: "python" });

    const formatter = result.entities.find((e) => e.qualifiedName === "Formatter");
    expect(formatter).toMatchObject({ startLine: 5, endLine: 9, loc: 5, language: "python" });

    const render = result.entities.find((e) => e.qualifiedName === "Formatter.render");
    expect(render).toMatchObject({ startLine: 6, endLine: 9, loc: 4, language: "python" });

    const main = result.entities.find((e) => e.qualifiedName === "main");
    expect(main).toMatchObject({ startLine: 4, endLine: 7, loc: 4, language: "python" });
  });

  it("resolves a same-directory module import", () => {
    const imp = result.imports.find((i) => i.fromRelativePath === "pyapp/main.py" && i.specifier === "helpers");
    expect(imp?.resolvedRelativePath).toBe("pyapp/helpers.py");
  });
});

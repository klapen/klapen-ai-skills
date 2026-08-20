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

  it("computes a line count and start/end lines for a multi-line class", () => {
    const formatter = result.entities.find((e) => e.qualifiedName === "Formatter");
    expect(formatter?.loc).toBeGreaterThan(1);
    expect(formatter?.endLine).toBeGreaterThan(formatter!.startLine);
    expect(formatter?.language).toBe("python");
  });

  it("resolves a same-directory module import", () => {
    const imp = result.imports.find((i) => i.fromRelativePath === "pyapp/main.py" && i.specifier === "helpers");
    expect(imp?.resolvedRelativePath).toBe("pyapp/helpers.py");
  });
});

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

describe("analyzePythonFiles — async def", () => {
  it("extracts an `async def` the same way as a plain `def`", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-py-asyncdef-"));
    fs.writeFileSync(
      path.join(tmp, "svc.py"),
      "class Service:\n    async def fetch(self):\n        return 1\n\nasync def top_level():\n    return 2\n"
    );

    const files = walkRepository(tmp, loadConfig());
    const result = analyzePythonFiles(tmp, files);
    const names = result.entities.map((e) => e.qualifiedName);

    expect(names).toContain("Service.fetch");
    expect(names).toContain("top_level");
    expect(result.entities.find((e) => e.qualifiedName === "Service.fetch")?.kind).toBe("method");
    expect(result.entities.find((e) => e.qualifiedName === "top_level")?.kind).toBe("function");

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

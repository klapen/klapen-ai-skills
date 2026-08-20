import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../../src/analyzers/filesystem/walk";
import { loadConfig } from "../../../src/shared/config";
import { analyzeTypeScriptFiles } from "../../../src/analyzers/languages/typescript";

const FIXTURE_ROOT = fileURLToPath(new URL("../../../examples/fixture-repo", import.meta.url));

describe("analyzeTypeScriptFiles", () => {
  const files = walkRepository(FIXTURE_ROOT, loadConfig());
  const result = analyzeTypeScriptFiles(FIXTURE_ROOT, files);

  it("extracts classes, methods, and functions", () => {
    const names = result.entities.map((e) => e.qualifiedName);
    expect(names).toContain("AService");
    expect(names).toContain("AService.run");
    expect(names).toContain("bFunction");
    expect(names).toContain("Helper");
    expect(names).toContain("Helper.add");
  });

  it("computes a positive line count and start/end lines per entity", () => {
    const aService = result.entities.find((e) => e.qualifiedName === "AService");
    expect(aService?.loc).toBeGreaterThan(0);
    expect(aService?.endLine).toBeGreaterThanOrEqual(aService!.startLine);
    expect(aService?.language).toBe("typescript");
  });

  it("resolves relative imports to repo-relative paths", () => {
    const aImports = result.imports.filter((i) => i.fromRelativePath === "src/a.ts");
    expect(aImports.find((i) => i.specifier === "./b")?.resolvedRelativePath).toBe("src/b.ts");
    expect(aImports.find((i) => i.specifier === "./utils/c")?.resolvedRelativePath).toBe("src/utils/c.ts");
  });

  it("only resolves relative specifiers", () => {
    const allRelative = result.imports.every(
      (i) => i.specifier.startsWith(".") || i.resolvedRelativePath === undefined
    );
    expect(allRelative).toBe(true);
  });
});

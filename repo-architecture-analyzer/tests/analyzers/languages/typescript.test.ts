import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

describe("analyzeTypeScriptFiles — relative imports with an explicit extension", () => {
  it("resolves a bare specifier like './foo.js' or '../package.json' directly, without appending another extension", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-ts-extimport-"));
    fs.writeFileSync(path.join(tmp, "foo.js"), "export const foo = 1;\n");
    fs.writeFileSync(path.join(tmp, "package.json"), "{}\n");
    fs.mkdirSync(path.join(tmp, "src"));
    fs.writeFileSync(
      path.join(tmp, "src", "index.ts"),
      'import { foo } from "../foo.js";\nimport pkg from "../package.json";\n'
    );

    const files = walkRepository(tmp, loadConfig());
    const result = analyzeTypeScriptFiles(tmp, files);

    const jsImport = result.imports.find((i) => i.specifier === "../foo.js");
    expect(jsImport?.resolvedRelativePath).toBe("foo.js");

    const jsonImport = result.imports.find((i) => i.specifier === "../package.json");
    expect(jsonImport?.resolvedRelativePath).toBe("package.json");

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

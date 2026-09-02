import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../../src/analyzers/filesystem/walk";
import { loadConfig } from "../../../src/shared/config";

const FIXTURE_ROOT = fileURLToPath(new URL("../../../examples/fixture-repo", import.meta.url));

describe("walkRepository — fixture repo", () => {
  const files = walkRepository(FIXTURE_ROOT, loadConfig());
  const byPath = new Map(files.map((f) => [f.relativePath, f]));

  it("classifies TypeScript source files", () => {
    const f = byPath.get("src/a.ts");
    expect(f?.classification).toBe("source");
    expect(f?.language).toBe("typescript");
  });

  it("classifies test files by testRoots", () => {
    expect(byPath.get("tests/a.test.ts")?.classification).toBe("test");
  });

  it("classifies markdown as doc", () => {
    expect(byPath.get("README.md")?.classification).toBe("doc");
  });

  it("classifies Python source files", () => {
    const f = byPath.get("pyapp/main.py");
    expect(f?.classification).toBe("source");
    expect(f?.language).toBe("python");
  });
});

describe("walkRepository — exclusions", () => {
  it("skips node_modules and honors a custom .gitignore", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-walk-"));
    fs.mkdirSync(path.join(tmp, "node_modules", "left-pad"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "node_modules", "left-pad", "index.js"), "module.exports = {};");
    fs.writeFileSync(path.join(tmp, "keep.ts"), "export const x = 1;");
    fs.writeFileSync(path.join(tmp, "secret.local.ts"), "export const y = 2;");
    fs.writeFileSync(path.join(tmp, ".gitignore"), "secret.local.ts\n");

    const files = walkRepository(tmp, loadConfig());
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain("keep.ts");
    expect(paths).not.toContain("node_modules/left-pad/index.js");
    expect(paths).not.toContain("secret.local.ts");

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("prunes directories before recursing into them", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-prune-"));
    fs.mkdirSync(path.join(tmp, "node_modules", "pkg"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "node_modules", "pkg", "index.js"), "module.exports = {};");
    fs.writeFileSync(path.join(tmp, "src", "main.ts"), "export const x = 1;");

    const readdirSpy = vi.spyOn(fs, "readdirSync");
    const files = walkRepository(tmp, loadConfig());
    readdirSpy.mockRestore();

    const readdirCalls = readdirSpy.mock.calls.map((call) => call[0]);
    const nodeModulesPath = path.join(tmp, "node_modules");
    const reachedNodeModules = readdirCalls.some((p) => p === nodeModulesPath);

    expect(reachedNodeModules).toBe(false);
    expect(files.some((f) => f.relativePath === "src/main.ts")).toBe(true);
    expect(files.some((f) => f.relativePath.startsWith("node_modules"))).toBe(false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("walkRepository — include allowlist", () => {
  it("only walks files matching config.include when it's set to a real allowlist", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-walk-include-"));
    fs.mkdirSync(path.join(tmp, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "src", "main.ts"), "export const x = 1;");
    fs.writeFileSync(path.join(tmp, "docs", "notes.md"), "# notes");

    const config = { ...loadConfig(), include: ["src/**"] };
    const files = walkRepository(tmp, config);
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain("src/main.ts");
    expect(paths).not.toContain("docs/notes.md");

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("behaves unchanged (walks everything not excluded) with the default include", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-walk-include-default-"));
    fs.mkdirSync(path.join(tmp, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "src", "main.ts"), "export const x = 1;");
    fs.writeFileSync(path.join(tmp, "docs", "notes.md"), "# notes");

    const files = walkRepository(tmp, loadConfig());
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain("src/main.ts");
    expect(paths).toContain("docs/notes.md");

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("never re-admits an excluded file even when include is permissive", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-walk-include-exclude-"));
    fs.mkdirSync(path.join(tmp, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "node_modules", "pkg", "index.js"), "module.exports = {};");
    fs.writeFileSync(path.join(tmp, "keep.ts"), "export const x = 1;");

    const config = { ...loadConfig(), include: ["**/*"] };
    const files = walkRepository(tmp, config);
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain("keep.ts");
    expect(paths.some((p) => p.startsWith("node_modules"))).toBe(false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

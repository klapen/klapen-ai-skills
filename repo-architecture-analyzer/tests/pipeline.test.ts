import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/shared/config";
import { runAnalysis } from "../src/pipeline";
import { resolveCacheDir } from "../src/cache/store";
import * as coChangeModule from "../src/analyzers/git/coChange";

const FIXTURE_SOURCE = fileURLToPath(new URL("../examples/fixture-repo", import.meta.url));

// examples/fixture-repo is committed inside this project's own git repository, so running
// git commands against it directly (e.g. `git -C examples/fixture-repo rev-parse
// --is-inside-work-tree`) finds the ancestor .git and treats it as version-controlled —
// masking the "no git history" path and pulling in unrelated history from the surrounding
// repo. Copy it to an isolated tmpdir (matching the pattern already used by
// tests/helpers/tempGitRepo.ts and the "non-git directory" case in history.test.ts) so the
// pipeline sees a genuinely git-less directory, as intended by this fixture.
let FIXTURE_ROOT: string;

beforeAll(() => {
  const tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-pipeline-fixture-"));
  FIXTURE_ROOT = path.join(tmpParent, "fixture-repo");
  fs.cpSync(FIXTURE_SOURCE, FIXTURE_ROOT, { recursive: true });
});

afterAll(() => {
  fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

describe("runAnalysis — fixture repo (no cache)", () => {
  it("produces schema-valid RepositoryData without throwing", () => {
    const data = runAnalysis(FIXTURE_ROOT, loadConfig(), { noCache: true });
    expect(data.metadata.schemaVersion).toBe("1.0.0");
  });

  it("names the repository after the fixture directory", () => {
    const data = runAnalysis(FIXTURE_ROOT, loadConfig(), { noCache: true });
    expect(data.metadata.repositoryName).toBe("fixture-repo");
  });

  it("fully parses all 5 TS/Python source files", () => {
    const data = runAnalysis(FIXTURE_ROOT, loadConfig(), { noCache: true });
    expect(data.metadata.parserCoverage.full).toBe(5);
  });

  it("finds the a.ts <-> b.ts cycle", () => {
    const data = runAnalysis(FIXTURE_ROOT, loadConfig(), { noCache: true });
    expect(data.summary.cycles).toBe(1);
  });

  it("carries the info warning about missing git history", () => {
    const data = runAnalysis(FIXTURE_ROOT, loadConfig(), { noCache: true });
    expect(data.warnings.some((w) => w.level === "info")).toBe(true);
  });

  it("sets a risk score on every file node", () => {
    const data = runAnalysis(FIXTURE_ROOT, loadConfig(), { noCache: true });
    const fileNodes = data.nodes.filter((n) => n.kind === "file");
    expect(fileNodes.length).toBeGreaterThan(0);
    expect(fileNodes.every((n) => typeof n.riskScore === "number")).toBe(true);
  });
});

describe("runAnalysis — caching", () => {
  it("writes a cache file under the resolved cache dir when caching is enabled", () => {
    const cacheDir = resolveCacheDir(FIXTURE_ROOT);
    fs.rmSync(cacheDir, { recursive: true, force: true });

    runAnalysis(FIXTURE_ROOT, loadConfig(), {});

    expect(fs.existsSync(`${cacheDir}/cache.json`)).toBe(true);
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it("does not write a cache file when config.cache.enabled is false, even without --no-cache", () => {
    const cacheDir = resolveCacheDir(FIXTURE_ROOT);
    fs.rmSync(cacheDir, { recursive: true, force: true });

    const config = { ...loadConfig(), cache: { enabled: false } };
    runAnalysis(FIXTURE_ROOT, config, {});

    expect(fs.existsSync(`${cacheDir}/cache.json`)).toBe(false);
  });
});

describe("runAnalysis — skips co-change for non-git targets", () => {
  it("never calls computeCoChange when the target has no .git directory", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-pipeline-nogit-"));
    fs.writeFileSync(path.join(tmp, "app.ts"), "export const x = 1;\n");

    const spy = vi.spyOn(coChangeModule, "computeCoChange");
    runAnalysis(tmp, loadConfig(), { noCache: true });
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("runAnalysis — parserCoverage.skipped", () => {
  it("counts source-shaped files in an unsupported language as skipped, not as full coverage", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-skipped-"));
    fs.writeFileSync(path.join(tmp, "main.go"), "package main\n\nfunc main() {}\n");
    fs.writeFileSync(path.join(tmp, "app.ts"), "export const x = 1;\n");

    const data = runAnalysis(tmp, loadConfig(), { noCache: true });

    expect(data.metadata.parserCoverage.skipped).toBeGreaterThanOrEqual(1);
    expect(data.metadata.parserCoverage.full).toBe(1);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

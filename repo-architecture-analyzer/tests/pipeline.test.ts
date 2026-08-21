import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/shared/config";
import { runAnalysis } from "../src/pipeline";
import { resolveCacheDir } from "../src/cache/store";

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
});

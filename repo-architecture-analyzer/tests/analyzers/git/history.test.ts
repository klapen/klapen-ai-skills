import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeGitHistory } from "../../../src/analyzers/git/history";
import { createTempGitRepo, type TempGitRepo } from "../../helpers/tempGitRepo";
import { loadConfig } from "../../../src/shared/config";

let repo: TempGitRepo | undefined;
afterEach(() => {
  repo?.cleanup();
  repo = undefined;
});

describe("analyzeGitHistory — non-git directory", () => {
  it("returns zeroed results with an info warning", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-nogit-"));
    const result = analyzeGitHistory(tmp, loadConfig().git);
    expect(result.isGitRepo).toBe(false);
    expect(result.files).toEqual({});
    expect(result.warnings[0]?.level).toBe("info");
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("analyzeGitHistory — basic repo", () => {
  it("tracks commit count, churn, and distinct contributors per file", () => {
    repo = createTempGitRepo();
    repo.commit(
      { "fileA.ts": "line1\nline2\n" },
      { message: "add fileA", date: "2026-01-01T00:00:00Z", author: "Alice <alice@example.com>" }
    );
    repo.commit(
      { "fileA.ts": "line1\nline2\nline3\nline4\n", "fileB.ts": "x\n" },
      { message: "extend fileA, add fileB", date: "2026-01-02T00:00:00Z", author: "Bob <bob@example.com>" }
    );

    const result = analyzeGitHistory(repo.root, loadConfig().git);

    expect(result.isGitRepo).toBe(true);
    expect(result.commitsAnalyzed).toBe(2);
    expect(result.files["fileA.ts"].commitCount).toBe(2);
    expect(result.files["fileA.ts"].contributorCount).toBe(2);
    expect(result.files["fileB.ts"].commitCount).toBe(1);
  });

  it("excludes configured lockfiles from churn", () => {
    repo = createTempGitRepo();
    repo.commit(
      { "package-lock.json": "{}\n", "app.ts": "x\n" },
      { message: "install deps", date: "2026-01-01T00:00:00Z" }
    );

    const result = analyzeGitHistory(repo.root, loadConfig().git);

    expect(result.files["package-lock.json"]).toBeUndefined();
    expect(result.files["app.ts"]).toBeDefined();
  });

  it("down-weights commits that touch more files than the bulk threshold", () => {
    repo = createTempGitRepo();
    const bulkConfig = { ...loadConfig().git, bulkCommitFileThreshold: 2, bulkCommitWeight: 0.2 };

    repo.commit(
      { "a.ts": "x\n", "b.ts": "x\n", "c.ts": "x\n" },
      { message: "bulk formatting", date: "2026-01-01T00:00:00Z" }
    );

    const result = analyzeGitHistory(repo.root, bulkConfig);
    expect(result.files["a.ts"].commitCount).toBeCloseTo(0.2);
  });
});

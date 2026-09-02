import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type * as ChildProcessModule from "node:child_process";
import { computeCoChange } from "../../../src/analyzers/git/coChange";
import { createTempGitRepo, type TempGitRepo } from "../../helpers/tempGitRepo";
import { loadConfig } from "../../../src/shared/config";

let repo: TempGitRepo | undefined;
afterEach(() => {
  repo?.cleanup();
  repo = undefined;
});

describe("computeCoChange", () => {
  it("pairs files that repeatedly change together above the thresholds", () => {
    repo = createTempGitRepo();
    for (let i = 0; i < 3; i += 1) {
      repo.commit(
        { "service.ts": `v${i}`, "service.test.ts": `v${i}` },
        { message: `iterate ${i}`, date: `2026-01-0${i + 1}T00:00:00Z` }
      );
    }
    repo.commit({ "unrelated.ts": "x" }, { message: "unrelated", date: "2026-01-05T00:00:00Z" });

    const config = { ...loadConfig().git, coChangeMinimumCommits: 2, coChangeMinimumConfidence: 0.5 };
    const pairs = computeCoChange(repo.root, config);

    const pair = pairs.find(
      (p) => [p.fileA, p.fileB].includes("service.ts") && [p.fileA, p.fileB].includes("service.test.ts")
    );
    expect(pair).toBeDefined();
    expect(pair!.commits).toBe(3);
    expect(pair!.confidence).toBeCloseTo(1);
  });

  it("ignores pairs below the minimum joint-commit threshold", () => {
    repo = createTempGitRepo();
    repo.commit({ "a.ts": "x", "b.ts": "x" }, { message: "one-off pairing", date: "2026-01-01T00:00:00Z" });

    const config = { ...loadConfig().git, coChangeMinimumCommits: 2 };
    const pairs = computeCoChange(repo.root, config);

    expect(pairs).toHaveLength(0);
  });

  it("correctly handles files with spaces in their names", () => {
    repo = createTempGitRepo();
    for (let i = 0; i < 3; i += 1) {
      repo.commit(
        { "my file.ts": `v${i}`, "other.ts": `v${i}` },
        { message: `iterate ${i}`, date: `2026-01-0${i + 1}T00:00:00Z` }
      );
    }

    const config = { ...loadConfig().git, coChangeMinimumCommits: 2, coChangeMinimumConfidence: 0.5 };
    const pairs = computeCoChange(repo.root, config);

    const pair = pairs.find(
      (p) => [p.fileA, p.fileB].includes("my file.ts") && [p.fileA, p.fileB].includes("other.ts")
    );
    expect(pair).toBeDefined();
    expect(pair!.fileA).toBe("my file.ts");
    expect(pair!.fileB).toBe("other.ts");
    expect(pair!.commits).toBe(3);
    expect(pair!.confidence).toBeCloseTo(1);
  });

  it("passes stdio that suppresses git's own stderr output", async () => {
    repo = createTempGitRepo();
    repo.commit({ "a.ts": "x" }, { message: "init", date: "2026-01-01T00:00:00Z" });

    // coChange.ts imports execFileSync as a named import, so a spy on `node:child_process`'s
    // default/namespace object (as used elsewhere for `fs`) doesn't intercept its calls — the
    // module registry has to be swapped instead, via vi.doMock + a fresh dynamic import.
    const execCalls: unknown[][] = [];
    vi.resetModules();
    vi.doMock("node:child_process", async (importOriginal) => {
      const actual = await importOriginal<typeof ChildProcessModule>();
      return {
        ...actual,
        execFileSync: (...args: unknown[]) => {
          execCalls.push(args);
          return (actual.execFileSync as (...a: unknown[]) => unknown)(...args);
        },
      };
    });

    const { computeCoChange: freshComputeCoChange } = await import("../../../src/analyzers/git/coChange");
    freshComputeCoChange(repo.root, loadConfig().git);

    vi.doUnmock("node:child_process");
    vi.resetModules();

    expect(execCalls).toHaveLength(1);
    const [, , options] = execCalls[0] as [string, string[], Record<string, unknown>];
    expect(options.stdio).toEqual(["ignore", "pipe", "ignore"]);
  });

  it("returns an empty array for a non-git directory without throwing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-cochange-nogit-"));
    const pairs = computeCoChange(tmp, loadConfig().git);
    expect(pairs).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

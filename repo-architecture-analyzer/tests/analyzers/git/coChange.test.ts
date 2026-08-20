import { describe, it, expect, afterEach } from "vitest";
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
});

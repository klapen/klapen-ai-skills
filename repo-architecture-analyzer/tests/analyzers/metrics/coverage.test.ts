import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseLcov, loadCoverage } from "../../../src/analyzers/metrics/coverage";

describe("parseLcov", () => {
  it("computes per-file coverage percentage from hit/total lines", () => {
    const lcov = ["SF:src/a.ts", "LH:8", "LF:10", "end_of_record", "SF:src/b.ts", "LH:0", "LF:5", "end_of_record"].join(
      "\n"
    );
    const result = parseLcov(lcov, "/repo");
    expect(result["src/a.ts"]).toBeCloseTo(80);
    expect(result["src/b.ts"]).toBeCloseTo(0);
  });
});

describe("loadCoverage", () => {
  it("reads coverage/lcov.info when present", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-cov-"));
    fs.mkdirSync(path.join(tmp, "coverage"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "coverage", "lcov.info"), ["SF:app.ts", "LH:5", "LF:5", "end_of_record"].join("\n"));

    expect(loadCoverage(tmp)["app.ts"]).toBeCloseTo(100);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns an empty object when no coverage artifact exists", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-nocov-"));
    expect(loadCoverage(tmp)).toEqual({});
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

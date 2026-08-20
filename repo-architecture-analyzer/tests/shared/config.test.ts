import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, mergeConfig } from "../../src/shared/config";

const tmpFiles: string[] = [];
afterEach(() => {
  for (const f of tmpFiles.splice(0)) fs.rmSync(f, { force: true });
});

describe("loadConfig", () => {
  it("returns the built-in defaults when no path is given", () => {
    const config = loadConfig();
    expect(config.git.since).toBe("12 months ago");
    expect(config.risk.complexityWeight).toBeCloseTo(0.3);
  });

  it("merges a user config file over the defaults", () => {
    const file = path.join(os.tmpdir(), `repo-arch-config-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify({ risk: { complexityWeight: 0.9 } }));
    tmpFiles.push(file);

    const config = loadConfig(file);
    expect(config.risk.complexityWeight).toBeCloseTo(0.9);
    expect(config.risk.churnWeight).toBeCloseTo(0.25); // untouched default
  });
});

describe("mergeConfig", () => {
  it("replaces array fields wholesale rather than concatenating", () => {
    const base = loadConfig();
    const merged = mergeConfig(base, { exclude: ["**/only-this/**"] });
    expect(merged.exclude).toEqual(["**/only-this/**"]);
  });
});

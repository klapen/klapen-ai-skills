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
  it("replaces `include` wholesale rather than concatenating", () => {
    const base = loadConfig();
    const merged = mergeConfig(base, { include: ["src/**"] });
    expect(merged.include).toEqual(["src/**"]);
  });

  it("adds CLI-supplied excludes to the default exclude list instead of replacing it", () => {
    const base = loadConfig();
    const merged = mergeConfig(base, { exclude: ["**/only-this/**"] });
    expect(merged.exclude).toContain("**/only-this/**");
    // The safety-critical defaults must still be present — a user passing --exclude must never
    // silently re-enable walking .git internals or node_modules.
    expect(merged.exclude).toContain("**/.git/**");
    expect(merged.exclude).toContain("**/node_modules/**");
    expect(merged.exclude).toEqual([...base.exclude, "**/only-this/**"]);
  });

  it("leaves exclude untouched when no override is given", () => {
    const base = loadConfig();
    const merged = mergeConfig(base, {});
    expect(merged.exclude).toEqual(base.exclude);
  });
});

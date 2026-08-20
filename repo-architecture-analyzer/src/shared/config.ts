import fs from "node:fs";
import defaultConfigJson from "../../config/repo-architecture.default.config.json";
import type { AnalyzerConfig } from "./types";

export function loadConfig(userConfigPath?: string): AnalyzerConfig {
  const base = defaultConfigJson as unknown as AnalyzerConfig;
  if (!userConfigPath) {
    return base;
  }
  const raw = fs.readFileSync(userConfigPath, "utf8");
  const overrides = JSON.parse(raw) as Partial<AnalyzerConfig>;
  return mergeConfig(base, overrides);
}

export function mergeConfig(
  base: AnalyzerConfig,
  overrides: Partial<AnalyzerConfig>
): AnalyzerConfig {
  return {
    sourceRoots: overrides.sourceRoots ?? base.sourceRoots,
    testRoots: overrides.testRoots ?? base.testRoots,
    include: overrides.include ?? base.include,
    exclude: overrides.exclude ?? base.exclude,
    layers: overrides.layers ?? base.layers,
    git: { ...base.git, ...overrides.git },
    risk: { ...base.risk, ...overrides.risk },
    cache: { ...base.cache, ...overrides.cache },
  };
}

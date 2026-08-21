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
    // `include` replaces wholesale when supplied (its default of ["**/*"] is a sentinel meaning
    // "no allowlist restriction"; a real --include narrows it to specific globs, which additive
    // union with "**/*" could never do). `exclude`, by contrast, is additive: its defaults
    // (.git, node_modules, vendor, dist, build, ...) are a safety guarantee — replacing them
    // wholesale on any --exclude use would re-enable walking .git internals, node_modules, etc.
    // This exclude guarantee is also enforced independently in walk.ts (exclude is checked
    // before any include allowlist), so a permissive --include can never defeat it either.
    include: overrides.include ?? base.include,
    exclude: overrides.exclude && overrides.exclude.length > 0 ? [...base.exclude, ...overrides.exclude] : base.exclude,
    layers: overrides.layers ?? base.layers,
    git: { ...base.git, ...overrides.git },
    risk: { ...base.risk, ...overrides.risk },
    cache: { ...base.cache, ...overrides.cache },
  };
}

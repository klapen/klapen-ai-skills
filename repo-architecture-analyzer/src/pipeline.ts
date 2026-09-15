import path from "node:path";
import { execFileSync } from "node:child_process";
import pkg from "../package.json";
import { walkRepository } from "./analyzers/filesystem/walk";
import { analyzeGitHistory } from "./analyzers/git/history";
import { computeCoChange } from "./analyzers/git/coChange";
import { analyzeTypeScriptFiles } from "./analyzers/languages/typescript";
import { analyzePythonFiles } from "./analyzers/languages/python";
import { loadCoverage } from "./analyzers/metrics/coverage";
import { assembleGraph } from "./graph/assemble";
import { findCycles, annotateCycleCounts } from "./graph/cycles";
import { annotateComplexity } from "./graph/complexity";
import { annotateRiskScores } from "./graph/risk";
import { hashContent, resolveCacheDir, CacheStore } from "./cache/store";
import { assertRepositoryData } from "./shared/validate";
import type { AnalyzerConfig, RepositoryData, AnalysisWarning } from "./shared/types";
import type { LanguageAnalysisResult } from "./analyzers/languages/typescript";

const SCHEMA_VERSION = "1.0.0";
const HOTSPOT_RISK_THRESHOLD = 60;
const CODE_LANGUAGES = new Set(["typescript", "javascript", "python"]);

function safeGit(repoRoot: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

export interface RunAnalysisOptions {
  noCache?: boolean;
  force?: boolean;
}

interface CachedGitData {
  history: ReturnType<typeof analyzeGitHistory>;
  coChange: ReturnType<typeof computeCoChange>;
}

export function runAnalysis(
  repoRoot: string,
  config: AnalyzerConfig,
  options: RunAnalysisOptions = {}
): RepositoryData {
  const warnings: AnalysisWarning[] = [];
  const absoluteRoot = path.resolve(repoRoot);

  const files = walkRepository(absoluteRoot, config);

  // A whole-language analysis failure discards ALL entities/imports for that language for this
  // run (full per-file isolation is a larger change, out of scope here). Track which languages
  // failed so parserCoverage.failed/full can report that honestly below, instead of silently
  // claiming full coverage for files whose entities were actually just dropped.
  let tsFailed = false;
  let ts: LanguageAnalysisResult = { entities: [], imports: [] };
  try {
    ts = analyzeTypeScriptFiles(absoluteRoot, files);
  } catch (err) {
    tsFailed = true;
    warnings.push({ level: "error", message: `TypeScript analysis failed: ${(err as Error).message}` });
  }

  let pyFailed = false;
  let py: LanguageAnalysisResult = { entities: [], imports: [] };
  try {
    py = analyzePythonFiles(absoluteRoot, files);
  } catch (err) {
    pyFailed = true;
    warnings.push({ level: "error", message: `Python analysis failed: ${(err as Error).message}` });
  }

  const configHash = hashContent(JSON.stringify(config));
  const headSha = safeGit(absoluteRoot, ["rev-parse", "HEAD"]);
  // `config.cache.enabled === false` behaves the same as the CLI's own `--no-cache`, so a
  // config file can disable caching without needing a matching CLI flag every invocation.
  const cachingDisabled = options.noCache || config.cache.enabled === false;
  const cache = cachingDisabled ? null : new CacheStore(resolveCacheDir(absoluteRoot));
  const gitCacheKey = `git:${headSha ?? "no-head"}:${configHash}`;

  let gitData = options.force ? undefined : cache?.get<CachedGitData>(gitCacheKey);
  if (!gitData) {
    const history = analyzeGitHistory(absoluteRoot, config.git);
    // Skip the second `git log` subprocess entirely when history analysis already determined
    // this isn't a git repo — there's no co-change signal to find, and running it anyway is
    // what caused git's own "fatal: not a git repository" message to leak to stderr.
    const coChange = history.isGitRepo ? computeCoChange(absoluteRoot, config.git) : [];
    gitData = { history, coChange };
    cache?.set(gitCacheKey, gitData);
  }
  warnings.push(...gitData.history.warnings);

  const graph = assembleGraph(absoluteRoot, path.basename(absoluteRoot), files, [ts, py], gitData.coChange, config);

  for (const node of graph.nodes) {
    if (node.kind !== "file") continue;
    const stats = gitData.history.files[node.relativePath];
    if (!stats) continue;
    node.commitCount = stats.commitCount;
    node.churn = stats.churn;
    node.contributorCount = stats.contributorCount;
    node.lastModified = stats.lastModified;
  }

  const cycles = findCycles(graph.nodes, graph.edges);
  annotateCycleCounts(graph.nodes, cycles);
  annotateComplexity(graph.nodes, [...ts.entities, ...py.entities], files);

  const coverageByPath = loadCoverage(absoluteRoot);
  for (const node of graph.nodes) {
    if (node.kind === "file" && coverageByPath[node.relativePath] !== undefined) {
      node.coverage = coverageByPath[node.relativePath];
    }
  }

  annotateRiskScores(graph.nodes, config.risk);

  if (cache) cache.save();

  const languages = Array.from(new Set(files.map((f) => f.language).filter((l): l is string => l !== null)));
  const sourceFiles = files.filter((f) => f.classification === "source").length;
  const testFiles = files.filter((f) => f.classification === "test").length;
  const entityCount = graph.nodes.filter(
    (n) => !["repository", "workspace", "package", "folder", "file"].includes(n.kind)
  ).length;
  const linesOfCode = graph.nodes
    .filter((n) => n.kind === "file")
    .reduce((sum, n) => sum + (n.loc ?? 0), 0);
  const architectureViolations = graph.edges.filter((e) => e.isArchitectureViolation).length;
  const hotspots = graph.nodes.filter(
    (n) => n.kind === "file" && (n.riskScore ?? 0) >= HOTSPOT_RISK_THRESHOLD
  ).length;

  const failedLanguages = new Set<string>();
  if (tsFailed) {
    failedLanguages.add("typescript");
    failedLanguages.add("javascript");
  }
  if (pyFailed) failedLanguages.add("python");

  const fullCoverage = files.filter(
    (f) =>
      f.classification === "source" &&
      f.language !== null &&
      CODE_LANGUAGES.has(f.language) &&
      !failedLanguages.has(f.language)
  ).length;
  // "Skipped" means source-shaped files with no detected/supported language — e.g. a .go or
  // .rb file. walk.ts's classify() only ever assigns "source" when a language WAS detected
  // (an unsupported-language file falls through to "other" instead), so a file with
  // `language === null` is never classified "source"; check both buckets here rather than
  // requiring classification === "source", which would make this count structurally always 0.
  const skippedCoverage = files.filter(
    (f) => (f.classification === "source" || f.classification === "other") && f.language === null
  ).length;
  // "Failed" means a whole-language analyzer threw and discarded all of that language's
  // entities/imports for this run — count every walked file of that language (not just
  // classification === "source") since analyzeTypeScriptFiles/analyzePythonFiles batch all
  // files of a language together regardless of classification (e.g. *.test.ts included).
  const failedCoverage = files.filter((f) => f.language !== null && failedLanguages.has(f.language)).length;

  const statusOutput = safeGit(absoluteRoot, ["status", "--porcelain"]);

  const data: RepositoryData = {
    metadata: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      repositoryName: path.basename(absoluteRoot),
      repositoryRoot: absoluteRoot,
      gitCommit: headSha,
      gitBranch: safeGit(absoluteRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
      isDirty: statusOutput !== undefined ? statusOutput.length > 0 : undefined,
      languages,
      analyzerVersion: pkg.version,
      configurationHash: configHash,
      parserCoverage: { full: fullCoverage, partial: 0, skipped: skippedCoverage, failed: failedCoverage },
    },
    summary: {
      files: files.length,
      sourceFiles,
      testFiles,
      entities: entityCount,
      linesOfCode,
      dependencyEdges: graph.edges.length,
      cycles: cycles.length,
      architectureViolations,
      hotspots,
    },
    nodes: graph.nodes,
    edges: graph.edges,
    cycles,
    communities: [],
    unresolvedDependencies: graph.unresolvedDependencies,
    architectureRules: config.layers,
    warnings,
  };

  assertRepositoryData(data);
  return data;
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, mergeConfig } from "./shared/config";
import { runAnalysis } from "./pipeline";
import { buildReportHtml } from "./report/template";
import { assertRepositoryData, assertNarrativeContent } from "./shared/validate";
import type { RepositoryData, NarrativeContent } from "./shared/types";

export interface CliArgs {
  repo: string;
  out?: string;
  config?: string;
  include?: string[];
  exclude?: string[];
  maxGitCommits?: number;
  gitSince?: string;
  noCache: boolean;
  force: boolean;
  verbose: boolean;
  dataOut?: string;
  narrative?: string;
  renderOnly: boolean;
  data?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { repo: process.cwd(), noCache: false, force: false, verbose: false, renderOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      i += 1;
      if (argv[i] === undefined) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };
    switch (arg) {
      case "--repo": args.repo = path.resolve(next()); break;
      case "--out": args.out = next(); break;
      case "--config": args.config = next(); break;
      case "--include": args.include = [...(args.include ?? []), next()]; break;
      case "--exclude": args.exclude = [...(args.exclude ?? []), next()]; break;
      case "--max-git-commits": args.maxGitCommits = Number(next()); break;
      case "--git-since": args.gitSince = next(); break;
      case "--no-cache": args.noCache = true; break;
      case "--force": args.force = true; break;
      case "--verbose": args.verbose = true; break;
      case "--data-out": args.dataOut = next(); break;
      case "--narrative": args.narrative = next(); break;
      case "--render-only": args.renderOnly = true; break;
      case "--data": args.data = next(); break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

// This module is bundled to CJS (bin/analyze.js) via esbuild for standalone
// distribution, but also runs unbundled as an ESM file under vitest. esbuild
// empties `import.meta.url` when targeting CJS output, so both path
// resolution and main-module detection below prefer the CJS-native globals
// (`__dirname` / `require.main`) when they're actually present, and fall
// back to `import.meta.url` in the ESM (test) context.
function resolveReportRuntimePath(): string {
  if (typeof __dirname !== "undefined") {
    return path.join(__dirname, "../bin/report-runtime.js");
  }
  return fileURLToPath(new URL("../bin/report-runtime.js", import.meta.url));
}

function detectIsMainModule(): boolean {
  if (typeof require !== "undefined" && typeof module !== "undefined") {
    return require.main === module;
  }
  return import.meta.url === `file://${process.argv[1]}`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
}

function defaultOutputPath(repoName: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const tmpDir = process.env.TMPDIR ?? "/tmp";
  return path.join(tmpDir, `${date}-repo-architecture-${slugify(repoName)}.html`);
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const args = parseArgs(argv);

  if (args.renderOnly) {
    runRenderOnly(args);
    return;
  }

  // Validate the narrative (if any) before running the potentially expensive analysis, so a
  // malformed narrative file fails in milliseconds instead of after a full analysis run whose
  // output would otherwise be thrown away.
  const narrative = args.narrative ? readNarrative(args.narrative) : undefined;

  const baseConfig = loadConfig(args.config);
  const config = mergeConfig(baseConfig, {
    include: args.include,
    exclude: args.exclude,
    git: {
      ...baseConfig.git,
      ...(args.maxGitCommits !== undefined ? { maxCommits: args.maxGitCommits } : {}),
      ...(args.gitSince !== undefined ? { since: args.gitSince } : {}),
    },
  });

  const data = runAnalysis(args.repo, config, { noCache: args.noCache, force: args.force });

  if (args.dataOut) {
    const dataOutPath = path.resolve(args.dataOut);
    fs.mkdirSync(path.dirname(dataOutPath), { recursive: true });
    fs.writeFileSync(dataOutPath, JSON.stringify(data));
  }

  const reportData = narrative ? mergeNarrative(data, narrative) : data;

  const reportRuntimePath = resolveReportRuntimePath();
  const reportRuntimeJs = fs.readFileSync(reportRuntimePath, "utf8");
  const html = buildReportHtml(reportData, { reportRuntimeJs });

  const outputPath = args.out ? path.resolve(args.out) : defaultOutputPath(data.metadata.repositoryName);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);

  const summary = {
    outputPath,
    files: data.summary.files,
    entities: data.summary.entities,
    linesOfCode: data.summary.linesOfCode,
    cycles: data.summary.cycles,
    hotspots: data.summary.hotspots,
    architectureViolations: data.summary.architectureViolations,
    warnings: data.warnings.length,
    parserCoverage: data.metadata.parserCoverage,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (args.verbose) {
    for (const warning of data.warnings) console.error(`[${warning.level}] ${warning.message}`);
  }
}

function readNarrative(narrativePath: string): NarrativeContent {
  const raw = JSON.parse(fs.readFileSync(path.resolve(narrativePath), "utf8"));
  assertNarrativeContent(raw);
  return raw as NarrativeContent;
}

function mergeNarrative(data: RepositoryData, narrative: NarrativeContent): RepositoryData {
  const narrated: RepositoryData = { ...data, narrative };
  assertRepositoryData(narrated);
  return narrated;
}

function attachNarrative(data: RepositoryData, narrativePath: string): RepositoryData {
  return mergeNarrative(data, readNarrative(narrativePath));
}

function runRenderOnly(args: CliArgs): void {
  if (!args.data) throw new Error("--render-only requires --data <path>");
  if (!args.out) throw new Error("--render-only requires --out <path>");

  const raw = JSON.parse(fs.readFileSync(path.resolve(args.data), "utf8"));
  assertRepositoryData(raw);
  const data = args.narrative ? attachNarrative(raw as RepositoryData, args.narrative) : (raw as RepositoryData);

  const reportRuntimePath = resolveReportRuntimePath();
  const reportRuntimeJs = fs.readFileSync(reportRuntimePath, "utf8");
  const html = buildReportHtml(data, { reportRuntimeJs });

  const outputPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);

  console.log(JSON.stringify({ outputPath }, null, 2));
}

if (detectIsMainModule()) {
  main();
}

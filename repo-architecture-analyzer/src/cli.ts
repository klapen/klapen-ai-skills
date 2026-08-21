import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, mergeConfig } from "./shared/config";
import { runAnalysis } from "./pipeline";
import { buildReportHtml } from "./report/template";

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
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { repo: process.cwd(), noCache: false, force: false, verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      i += 1;
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
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
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

  const reportRuntimePath = fileURLToPath(new URL("../bin/report-runtime.js", import.meta.url));
  const reportRuntimeJs = fs.readFileSync(reportRuntimePath, "utf8");
  const html = buildReportHtml(data, { reportRuntimeJs });

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

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}

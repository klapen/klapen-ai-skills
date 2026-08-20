import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import type { GitConfig, AnalysisWarning } from "../../shared/types";

export interface FileGitStats {
  relativePath: string;
  commitCount: number;
  churn: number;
  contributorCount: number;
  lastModified: string;
  firstSeen: string;
}

export interface GitHistoryResult {
  isGitRepo: boolean;
  commitsAnalyzed: number;
  files: Record<string, FileGitStats>;
  warnings: AnalysisWarning[];
}

function isGitRepository(repoRoot: string): boolean {
  try {
    execFileSync("git", ["-C", repoRoot, "rev-parse", "--is-inside-work-tree"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function anonymizeAuthor(email: string): string {
  return crypto.createHash("sha1").update(email).digest("hex").slice(0, 12);
}

function isLockfile(relativePath: string, patterns: string[]): boolean {
  return patterns.includes(path.basename(relativePath));
}

function extractPath(rawPath: string): string {
  const braceMatch = rawPath.match(/^(.*)\{.* => (.*)\}(.*)$/);
  if (braceMatch) return `${braceMatch[1]}${braceMatch[2]}${braceMatch[3]}`;
  const arrowMatch = rawPath.match(/^.* => (.*)$/);
  return arrowMatch ? arrowMatch[1] : rawPath;
}

export function analyzeGitHistory(repoRoot: string, config: GitConfig): GitHistoryResult {
  const warnings: AnalysisWarning[] = [];

  if (!isGitRepository(repoRoot)) {
    warnings.push({
      level: "info",
      message: "Repository has no .git directory; git-history metrics are all zero.",
    });
    return { isGitRepo: false, commitsAnalyzed: 0, files: {}, warnings };
  }

  let output: string;
  try {
    output = execFileSync(
      "git",
      [
        "-C", repoRoot,
        "log", "--no-merges",
        `--since=${config.since}`,
        "-n", String(config.maxCommits),
        "--format=@@%H|%at|%ae",
        "--numstat",
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }
    );
  } catch (err) {
    warnings.push({ level: "warn", message: `git log failed: ${(err as Error).message}` });
    return { isGitRepo: true, commitsAnalyzed: 0, files: {}, warnings };
  }

  const lines = output.split("\n");
  const stats = new Map<string, FileGitStats>();
  const contributorsByFile = new Map<string, Set<string>>();
  let commitsAnalyzed = 0;
  let index = 0;

  while (index < lines.length) {
    const header = lines[index];
    if (!header.startsWith("@@")) {
      index += 1;
      continue;
    }

    const match = header.match(/^@@(.*)\|(\d+)\|(.*)$/);
    const epoch = match?.[2];
    const authorEmail = match?.[3];
    const commitDate = epoch ? new Date(Number(epoch) * 1000).toISOString() : new Date().toISOString();
    const authorId = authorEmail ? anonymizeAuthor(authorEmail) : "unknown";
    commitsAnalyzed += 1;
    index += 1;

    // Skip blank line after the commit header
    if (index < lines.length && lines[index].trim() === "") {
      index += 1;
    }

    const fileLines: string[] = [];
    while (index < lines.length && !lines[index].startsWith("@@") && lines[index].trim() !== "") {
      fileLines.push(lines[index]);
      index += 1;
    }

    const weight = fileLines.length > config.bulkCommitFileThreshold ? config.bulkCommitWeight : 1;

    for (const fileLine of fileLines) {
      const [addsRaw, delsRaw, rawPath] = fileLine.split("\t");
      const relativePath = extractPath(rawPath).split(path.sep).join("/");
      if (isLockfile(relativePath, config.lockfilePatterns)) continue;

      const adds = addsRaw === "-" ? 0 : Number(addsRaw);
      const dels = delsRaw === "-" ? 0 : Number(delsRaw);

      const existing = stats.get(relativePath) ?? {
        relativePath,
        commitCount: 0,
        churn: 0,
        contributorCount: 0,
        lastModified: commitDate,
        firstSeen: commitDate,
      };
      existing.commitCount += weight;
      existing.churn += (adds + dels) * weight;
      existing.lastModified = existing.lastModified > commitDate ? existing.lastModified : commitDate;
      existing.firstSeen = existing.firstSeen < commitDate ? existing.firstSeen : commitDate;
      stats.set(relativePath, existing);

      const contributors = contributorsByFile.get(relativePath) ?? new Set<string>();
      contributors.add(authorId);
      contributorsByFile.set(relativePath, contributors);
    }
  }

  for (const [relativePath, fileStats] of stats) {
    fileStats.contributorCount = contributorsByFile.get(relativePath)?.size ?? 1;
  }

  return { isGitRepo: true, commitsAnalyzed, files: Object.fromEntries(stats), warnings };
}

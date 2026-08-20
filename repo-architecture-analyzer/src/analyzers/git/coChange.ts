import { execFileSync } from "node:child_process";
import path from "node:path";
import type { GitConfig } from "../../shared/types";

export interface CoChangePair {
  fileA: string;
  fileB: string;
  commits: number;
  confidence: number;
}

function isLockfile(relativePath: string, patterns: string[]): boolean {
  return patterns.includes(path.basename(relativePath));
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(" ");
}

export function computeCoChange(repoRoot: string, config: GitConfig): CoChangePair[] {
  let output: string;
  try {
    output = execFileSync(
      "git",
      [
        "-C", repoRoot,
        "log", "--no-merges",
        `--since=${config.since}`,
        "-n", String(config.maxCommits),
        "--pretty=format:@@%n",
        "--name-only",
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 }
    );
  } catch {
    return [];
  }

  const commits: string[][] = [];
  let current: string[] = [];
  for (const line of output.split("\n")) {
    if (line === "@@") {
      if (current.length > 0) commits.push(current);
      current = [];
      continue;
    }
    if (line.trim() === "") continue;
    const rel = line.split(path.sep).join("/");
    if (!isLockfile(rel, config.lockfilePatterns)) current.push(rel);
  }
  if (current.length > 0) commits.push(current);

  const commitCountByFile = new Map<string, number>();
  const jointCountByPair = new Map<string, number>();

  for (const files of commits) {
    if (files.length > config.bulkCommitFileThreshold) continue; // bulk commits are noise, not signal
    const unique = Array.from(new Set(files));
    for (const f of unique) {
      commitCountByFile.set(f, (commitCountByFile.get(f) ?? 0) + 1);
    }
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const key = pairKey(unique[i], unique[j]);
        jointCountByPair.set(key, (jointCountByPair.get(key) ?? 0) + 1);
      }
    }
  }

  const pairs: CoChangePair[] = [];
  for (const [key, jointCommits] of jointCountByPair) {
    if (jointCommits < config.coChangeMinimumCommits) continue;
    const [fileA, fileB] = key.split(" ");
    const denom = Math.max(commitCountByFile.get(fileA) ?? 1, commitCountByFile.get(fileB) ?? 1);
    const confidence = jointCommits / denom;
    if (confidence < config.coChangeMinimumConfidence) continue;
    pairs.push({ fileA, fileB, commits: jointCommits, confidence });
  }

  return pairs;
}

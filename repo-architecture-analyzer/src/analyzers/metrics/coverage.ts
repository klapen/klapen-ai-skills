import fs from "node:fs";
import path from "node:path";

const CONVENTIONAL_PATHS = ["coverage/lcov.info", "coverage/lcov-report/lcov.info"];

export function parseLcov(content: string, repoRoot: string): Record<string, number> {
  const result: Record<string, number> = {};
  let currentFile: string | null = null;
  let hit = 0;
  let total = 0;

  for (const line of content.split("\n")) {
    if (line.startsWith("SF:")) {
      currentFile = path
        .relative(repoRoot, path.resolve(repoRoot, line.slice(3).trim()))
        .split(path.sep)
        .join("/");
      hit = 0;
      total = 0;
    } else if (line.startsWith("LH:")) {
      hit = Number(line.slice(3).trim());
    } else if (line.startsWith("LF:")) {
      total = Number(line.slice(3).trim());
    } else if (line.startsWith("end_of_record")) {
      if (currentFile && total > 0) result[currentFile] = (hit / total) * 100;
      currentFile = null;
    }
  }

  return result;
}

export function loadCoverage(repoRoot: string): Record<string, number> {
  for (const rel of CONVENTIONAL_PATHS) {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) {
      return parseLcov(fs.readFileSync(abs, "utf8"), repoRoot);
    }
  }
  return {};
}

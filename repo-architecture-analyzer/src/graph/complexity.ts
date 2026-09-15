import fs from "node:fs";
import type { CodeNode } from "../shared/types";
import type { RawEntity } from "../analyzers/languages/typescript";
import type { WalkedFile } from "../analyzers/filesystem/walk";
import { buildEntityId } from "../shared/ids";

const KEYWORD_PATTERNS: Record<string, RegExp[]> = {
  typescript: [/\bif\s*\(/g, /\belse\s+if\s*\(/g, /\bfor\s*\(/g, /\bwhile\s*\(/g, /\bcatch\s*\(/g, /\bcase\s+/g, /&&/g, /\|\|/g],
  javascript: [/\bif\s*\(/g, /\belse\s+if\s*\(/g, /\bfor\s*\(/g, /\bwhile\s*\(/g, /\bcatch\s*\(/g, /\bcase\s+/g, /&&/g, /\|\|/g],
  python: [/\bif\s+/g, /\belif\s+/g, /\bfor\s+/g, /\bwhile\s+/g, /\bexcept\b/g, /\band\b/g, /\bor\b/g],
};

function indentWidth(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].replace(/\t/g, "    ").length : 0;
}

function countDecisionPoints(lines: string[], language: string): number {
  const patterns = KEYWORD_PATTERNS[language] ?? [];
  const text = lines.join("\n");
  let count = 0;
  for (const pattern of patterns) {
    count += text.match(pattern)?.length ?? 0;
  }
  return count;
}

function measureNestingDepth(lines: string[]): number {
  if (lines.length === 0) return 0;
  const baseIndent = indentWidth(lines[0]);
  let maxExtra = 0;
  for (const line of lines) {
    if (line.trim() === "") continue;
    maxExtra = Math.max(maxExtra, indentWidth(line) - baseIndent);
  }
  return Math.max(0, Math.round(maxExtra / 4));
}

export function annotateComplexity(nodes: CodeNode[], entities: RawEntity[], files: WalkedFile[]): void {
  const absolutePathByRelative = new Map(files.map((f) => [f.relativePath, f.absolutePath]));
  const sourceCache = new Map<string, string[]>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const entity of entities) {
    const absolutePath = absolutePathByRelative.get(entity.relativePath);
    if (!absolutePath) continue;

    let sourceLines = sourceCache.get(absolutePath);
    if (!sourceLines) {
      try {
        sourceLines = fs.readFileSync(absolutePath, "utf8").split("\n");
      } catch {
        sourceLines = [];
      }
      sourceCache.set(absolutePath, sourceLines);
    }

    const entityLines = sourceLines.slice(entity.startLine - 1, entity.endLine);
    const node = nodeById.get(buildEntityId(entity.kind, entity.relativePath, entity.qualifiedName));
    if (!node) continue;

    node.complexity = 1 + countDecisionPoints(entityLines, entity.language);
    node.nestingDepth = measureNestingDepth(entityLines);
  }
}

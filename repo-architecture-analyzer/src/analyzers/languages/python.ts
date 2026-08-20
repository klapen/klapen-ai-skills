import fs from "node:fs";
import path from "node:path";
import { normalizeRelativePath } from "../../shared/ids";
import type { WalkedFile } from "../filesystem/walk";
import type { RawEntity, RawImport, LanguageAnalysisResult } from "./typescript";

const DEF_RE = /^(\s*)(class|def)\s+([A-Za-z_][A-Za-z0-9_]*)/;
const IMPORT_RE = /^\s*import\s+([A-Za-z_][\w.]*)/;
const FROM_IMPORT_RE = /^\s*from\s+(\.*[\w.]*)\s+import\s+.+$/;

function indentWidth(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].replace(/\t/g, "    ").length : 0;
}

interface StackEntry {
  indent: number;
  kind: "class" | "function" | "method";
  qualifiedName: string;
  startLine: number;
}

function analyzePythonSource(
  relativePath: string,
  source: string
): { entities: RawEntity[]; imports: RawImport[] } {
  const lines = source.split("\n");
  const entities: RawEntity[] = [];
  const imports: RawImport[] = [];
  const stack: StackEntry[] = [];

  const closeEntitiesDownTo = (threshold: number, endLineExclusive: number) => {
    while (stack.length > 0 && stack[stack.length - 1].indent >= threshold) {
      const entry = stack.pop()!;
      const endLine = Math.max(entry.startLine, endLineExclusive - 1);
      entities.push({
        relativePath,
        kind: entry.kind,
        name: entry.qualifiedName.split(".").pop() ?? entry.qualifiedName,
        qualifiedName: entry.qualifiedName,
        loc: endLine - entry.startLine + 1,
        startLine: entry.startLine,
        endLine,
        language: "python",
      });
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indent = indentWidth(line);

    // Any open def/class whose own indent is >= this line's indent has had its body end.
    closeEntitiesDownTo(indent, i + 1);

    const defMatch = line.match(DEF_RE);
    if (defMatch) {
      const [, , kindWord, name] = defMatch;
      const parent = stack[stack.length - 1];
      const isMethod = kindWord === "def" && parent?.kind === "class";
      const qualifiedName = parent ? `${parent.qualifiedName}.${name}` : name;
      stack.push({
        indent,
        kind: kindWord === "class" ? "class" : isMethod ? "method" : "function",
        qualifiedName,
        startLine: i + 1,
      });
      continue;
    }

    const importMatch = line.match(IMPORT_RE);
    if (importMatch) {
      imports.push({ fromRelativePath: relativePath, specifier: importMatch[1] });
      continue;
    }

    const fromMatch = line.match(FROM_IMPORT_RE);
    if (fromMatch) {
      imports.push({ fromRelativePath: relativePath, specifier: fromMatch[1] });
    }
  }

  closeEntitiesDownTo(0, lines.length + 1);
  return { entities, imports };
}

function resolvePythonImport(fromAbsoluteFile: string, specifier: string, repoRoot: string): string | undefined {
  if (specifier === "") return undefined;
  const leadingDots = specifier.match(/^\.*/)?.[0].length ?? 0;
  const modulePath = specifier.slice(leadingDots).split(".").filter(Boolean);
  let dir = path.dirname(fromAbsoluteFile);
  for (let i = 1; i < leadingDots; i += 1) dir = path.dirname(dir);
  const candidateBase = modulePath.length > 0 ? path.join(dir, ...modulePath) : dir;
  const candidates = [`${candidateBase}.py`, path.join(candidateBase, "__init__.py")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return normalizeRelativePath(repoRoot, candidate);
  }
  return undefined;
}

export function analyzePythonFiles(repoRoot: string, files: WalkedFile[]): LanguageAnalysisResult {
  const pyFiles = files.filter((f) => f.language === "python");
  const entities: RawEntity[] = [];
  const imports: RawImport[] = [];

  for (const f of pyFiles) {
    const source = fs.readFileSync(f.absolutePath, "utf8");
    const parsed = analyzePythonSource(f.relativePath, source);
    entities.push(...parsed.entities);
    for (const imp of parsed.imports) {
      imports.push({
        ...imp,
        resolvedRelativePath: resolvePythonImport(f.absolutePath, imp.specifier, repoRoot),
      });
    }
  }

  return { entities, imports };
}

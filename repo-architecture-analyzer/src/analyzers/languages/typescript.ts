import { Project, type Node } from "ts-morph";
import fs from "node:fs";
import path from "node:path";
import { normalizeRelativePath } from "../../shared/ids";
import type { WalkedFile } from "../filesystem/walk";

export interface RawEntity {
  relativePath: string;
  kind: "class" | "interface" | "function" | "method";
  name: string;
  qualifiedName: string;
  loc: number;
  startLine: number;
  endLine: number;
  language: string;
}

export interface RawImport {
  fromRelativePath: string;
  specifier: string;
  resolvedRelativePath?: string;
}

export interface LanguageAnalysisResult {
  entities: RawEntity[];
  imports: RawImport[];
}

const EXTENSION_CANDIDATES = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];

function resolveRelativeImport(fromAbsDir: string, specifier: string, repoRoot: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = path.resolve(fromAbsDir, specifier);
  for (const ext of EXTENSION_CANDIDATES) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) {
      return normalizeRelativePath(repoRoot, candidate);
    }
  }
  return undefined;
}

function entityFields(node: Node): { loc: number; startLine: number; endLine: number } {
  const startLine = node.getStartLineNumber();
  const endLine = node.getEndLineNumber();
  return { loc: endLine - startLine + 1, startLine, endLine };
}

export function analyzeTypeScriptFiles(repoRoot: string, files: WalkedFile[]): LanguageAnalysisResult {
  const tsFiles = files.filter((f) => f.language === "typescript" || f.language === "javascript");
  const entities: RawEntity[] = [];
  const imports: RawImport[] = [];
  if (tsFiles.length === 0) return { entities, imports };

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const f of tsFiles) project.addSourceFileAtPath(f.absolutePath);

  for (const f of tsFiles) {
    const sourceFile = project.getSourceFileOrThrow(f.absolutePath);
    const language = f.language!;

    for (const cls of sourceFile.getClasses()) {
      const name = cls.getName() ?? "<anonymous>";
      entities.push({ relativePath: f.relativePath, kind: "class", name, qualifiedName: name, language, ...entityFields(cls) });
      for (const method of cls.getMethods()) {
        const methodName = method.getName();
        entities.push({
          relativePath: f.relativePath,
          kind: "method",
          name: methodName,
          qualifiedName: `${name}.${methodName}`,
          language,
          ...entityFields(method),
        });
      }
    }

    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName();
      entities.push({ relativePath: f.relativePath, kind: "interface", name, qualifiedName: name, language, ...entityFields(iface) });
    }

    for (const fn of sourceFile.getFunctions()) {
      const name = fn.getName() ?? "<anonymous>";
      entities.push({ relativePath: f.relativePath, kind: "function", name, qualifiedName: name, language, ...entityFields(fn) });
    }

    for (const imp of sourceFile.getImportDeclarations()) {
      const specifier = imp.getModuleSpecifierValue();
      const resolvedRelativePath = resolveRelativeImport(path.dirname(f.absolutePath), specifier, repoRoot);
      imports.push({ fromRelativePath: f.relativePath, specifier, resolvedRelativePath });
    }
  }

  return { entities, imports };
}

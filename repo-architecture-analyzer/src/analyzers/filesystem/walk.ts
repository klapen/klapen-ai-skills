import fs from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import type { AnalyzerConfig } from "../../shared/types";
import { normalizeRelativePath } from "../../shared/ids";

export type FileClassification = "source" | "test" | "generated" | "config" | "doc" | "other";

export interface WalkedFile {
  absolutePath: string;
  relativePath: string;
  classification: FileClassification;
  language: string | null;
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
};

const DOC_EXTENSIONS = new Set([".md", ".mdx", ".rst", ".txt"]);
const CONFIG_BASENAMES = new Set([
  "package.json",
  "tsconfig.json",
  ".eslintrc.json",
  "pyproject.toml",
  "setup.cfg",
  "Makefile",
  "Dockerfile",
]);

function detectLanguage(relativePath: string): string | null {
  return LANGUAGE_BY_EXTENSION[path.extname(relativePath)] ?? null;
}

function classify(relativePath: string, config: AnalyzerConfig): FileClassification {
  const base = path.basename(relativePath);
  const ext = path.extname(relativePath);
  const segments = relativePath.split("/");

  if (config.testRoots.some((root) => segments.includes(root)) || /\.test\.|\.spec\./.test(base)) {
    return "test";
  }
  if (DOC_EXTENSIONS.has(ext)) {
    return "doc";
  }
  if (CONFIG_BASENAMES.has(base) || [".json", ".yaml", ".yml", ".toml"].includes(ext)) {
    return "config";
  }
  if (segments.includes("generated") || base.endsWith(".generated.ts")) {
    return "generated";
  }
  if (detectLanguage(relativePath)) {
    return "source";
  }
  return "other";
}

function loadIgnore(repoRoot: string, config: AnalyzerConfig): Ignore {
  const ig = ignore();
  const gitignorePath = path.join(repoRoot, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, "utf8"));
  }
  ig.add(config.exclude);
  return ig;
}

function loadPruneIgnore(repoRoot: string, config: AnalyzerConfig): Ignore {
  const ig = ignore();
  const gitignorePath = path.join(repoRoot, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, "utf8"));
  }
  ig.add(config.exclude.map((p) => p.replace(/\/\*\*$/, "")));
  return ig;
}

// `ignore()`'s glob matcher works either as a denylist (as used above for `exclude`) or,
// inverted, as an allowlist: a file "passes" the include filter if it matches at least one
// of the configured include globs. The default config ships `include: ["**/*"]`, which matches
// every path — i.e. behaves identically to having no include filter at all — so this only
// narrows the walk when a real value has been configured.
function loadInclude(config: AnalyzerConfig): Ignore | null {
  if (!config.include || config.include.length === 0) return null;
  return ignore().add(config.include);
}

export function walkRepository(repoRoot: string, config: AnalyzerConfig): WalkedFile[] {
  const ig = loadIgnore(repoRoot, config);
  const pruneIg = loadPruneIgnore(repoRoot, config);
  const includeIg = loadInclude(config);
  const results: WalkedFile[] = [];

  function visit(dirAbs: string): void {
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const abs = path.join(dirAbs, entry.name);
      const rel = normalizeRelativePath(repoRoot, abs);
      const checkPath = entry.isDirectory() ? `${rel}/` : rel;
      // exclude is always checked first and independently of include, so a permissive
      // --include can never re-admit a file the exclude list (or .gitignore) removed.
      if (ig.ignores(checkPath)) continue;

      if (entry.isDirectory()) {
        if (!pruneIg.ignores(rel)) {
          visit(abs);
        }
      } else if (entry.isFile()) {
        if (includeIg && !includeIg.ignores(rel)) continue;
        results.push({
          absolutePath: abs,
          relativePath: rel,
          classification: classify(rel, config),
          language: detectLanguage(rel),
        });
      }
    }
  }

  visit(repoRoot);
  return results;
}

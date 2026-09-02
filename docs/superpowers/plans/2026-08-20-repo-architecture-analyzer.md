# Repo Architecture Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `repo-architecture-analyzer` Claude Code skill: a bundled, dependency-free Node.js tool that statically analyzes a repository (TS/JS + Python fully, other languages as labeled fallback), mines its Git history, and renders a single self-contained interactive D3 HTML report with 3 coordinated views (repo map, dependency matrix, hotspots).

**Architecture:** All analysis is deterministic TypeScript compiled once (at authoring time) into a single dependency-free `bin/analyze.js` via esbuild. Claude never authors a payload — it only runs the bundle and relays its small `summary`/`warnings` block to the user. Engine (filesystem/git/language/metrics/graph analyzers → schema-valid `RepositoryData` JSON) is built and tested first; the D3 report and packaging come after, so every task has an independently testable deliverable.

**Tech Stack:** TypeScript, Node.js (`>=18`), `ts-morph` (TS/JS AST), a custom lightweight Python structural parser, `ajv` (JSON Schema validation), D3.js v7 (`d3` npm package, bundled by `esbuild` into the browser-side report — not loaded from a CDN), `esbuild` (bundling), `vitest` (tests), `jsdom` (report smoke test).

**Spec:** [`docs/superpowers/specs/2026-08-20-repo-architecture-analyzer-design.md`](../specs/2026-08-20-repo-architecture-analyzer-design.md) — read it alongside this plan; original source prompt at [`docs/superpowers/specs/2026-08-20-repo-architecture-analyzer-original-prompt.txt`](../specs/2026-08-20-repo-architecture-analyzer-original-prompt.txt) is superseded by the spec wherever they disagree.

## Global Constraints

- End users need only Node.js on PATH — no `npm install`, no Python interpreter, no native binary deps. `bin/analyze.js` (Node CLI) and `bin/report-runtime.js` (browser-side D3 report code, inlined as a `<script>` into the generated HTML) are the two pre-bundled files committed to the skill folder — both are `esbuild` build outputs, neither requires `node_modules` at runtime.
- Zero footprint in the target repo — nothing is written there, ever.
- Never embed source-code snippets in the JSON or report.
- Never collect or store author email addresses — contributor **counts** only, never raw emails, in memory or on disk.
- No network calls of any kind.
- Respect `.gitignore`; allow config `include`/`exclude` overrides. Default excludes: `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `coverage`, `.next`, `out`, `bin`, `obj`, `.cache`, `generated`, `*.min.js`.
- Report output path: `/tmp/YYYY-MM-DD-repo-architecture-<repo-slug>.html` unless `--out` is given.
- Working cache lives at `~/.cache/repo-architecture-analyzer/<repo-slug>/` — outside both the target repo and this skills repo.
- v1 languages: TypeScript/JavaScript (full, via `ts-morph`) and Python (full, via a custom structural parser) — everything else appears in the file tree and git-history metrics only, labeled `"fallback"` or `"skipped"` in `metadata.parserCoverage`, never silently dropped.
- v1 report views: repo map, dependency matrix, hotspot view. Edge bundling, the architectural-tension view, and snapshot/evolution are v2 — not built, not stubbed with dead UI.
- `communities[]` is present in the schema but always emitted empty in v1 (no clustering algorithm exists yet).
- Risk score formula is fixed and documented (weights in `config/repo-architecture.default.config.json`), always labeled "heuristic" wherever shown.
- No architecture-rule violations are invented when no `layers`/`mayDependOn` config is supplied — cross-folder/cross-package edges are neutral observations.
- No Playwright — the report smoke test uses `jsdom` only.
- Coverage numbers are only read from an existing LCOV/Cobertura/JaCoCo artifact at a conventional path; the tool never runs the target repo's test suite.

## File Structure

```
repo-architecture-analyzer/
├── SKILL.md                              # Task 21
├── HANDOFF.md                            # Task 21
├── README.md                             # Task 21 (dev/build instructions)
├── package.json / package-lock.json      # Task 1 (devDependencies only)
├── tsconfig.json                         # Task 1
├── bin/
│   ├── analyze.js                        # Task 20 (esbuild output, Node/CJS; the CLI entry point)
│   └── report-runtime.js                 # Task 18 (esbuild output, browser/IIFE; inlined into every report)
├── config/
│   └── repo-architecture.default.config.json   # Task 1
├── schema/
│   └── repository-data.schema.json       # Task 1
├── src/
│   ├── shared/
│   │   ├── types.ts                      # Task 1 — RepositoryData/CodeNode/CodeEdge etc.
│   │   ├── ids.ts                        # Task 1 — path normalization + stable entity IDs
│   │   ├── validate.ts                   # Task 2 — ajv schema validation
│   │   └── config.ts                     # Task 2 — config load + merge with defaults
│   ├── analyzers/
│   │   ├── filesystem/walk.ts            # Task 3
│   │   ├── git/history.ts                # Task 4
│   │   ├── git/coChange.ts               # Task 5
│   │   ├── languages/typescript.ts       # Task 6
│   │   ├── languages/python.ts           # Task 7
│   │   └── metrics/coverage.ts           # Task 11
│   ├── graph/
│   │   ├── assemble.ts                   # Task 8 — nodes/edges + fan-in/out
│   │   ├── cycles.ts                     # Task 9 — Tarjan SCC
│   │   ├── complexity.ts                 # Task 10
│   │   └── risk.ts                       # Task 11
│   ├── cache/store.ts                    # Task 12
│   ├── pipeline.ts                       # Task 13 — RepositoryData assembler
│   ├── report/
│   │   ├── state.ts                      # Task 14 — shared client-side app state
│   │   ├── repoMap.ts                    # Task 15
│   │   ├── depMatrix.ts                  # Task 16
│   │   ├── hotspots.ts                   # Task 17
│   │   ├── main.ts                       # Task 18 — browser bootstrap; esbuild entry point for bin/report-runtime.js
│   │   └── template.ts                   # Task 18 — assembles the final HTML (Node-side)
│   └── cli.ts                            # Task 19
├── tests/
│   ├── helpers/tempGitRepo.ts            # Task 4
│   └── ... (one test file per src/ file above, same relative path)
└── examples/
    ├── fixture-repo/                     # Task 1 — plain (non-git) TS+Python fixture
    └── example-report.html               # Task 22 — generated by running the finished tool
```

One file, one responsibility: each analyzer only knows its own domain (filesystem shape, git log, one language's AST) and returns plain data; `graph/assemble.ts` and `pipeline.ts` are the only places that combine analyzer outputs. Report view modules (`report/*.ts`) only render from an already-built `RepositoryData` — none of them touch the filesystem, git, or language parsers.

---

### Task 1: Scaffold toolchain, config, schema, fixture repo, shared types & IDs

**Files:**
- Create: `repo-architecture-analyzer/package.json`
- Create: `repo-architecture-analyzer/tsconfig.json`
- Create: `repo-architecture-analyzer/vitest.config.ts`
- Create: `repo-architecture-analyzer/config/repo-architecture.default.config.json`
- Create: `repo-architecture-analyzer/schema/repository-data.schema.json`
- Create: `repo-architecture-analyzer/examples/fixture-repo/src/a.ts`
- Create: `repo-architecture-analyzer/examples/fixture-repo/src/b.ts`
- Create: `repo-architecture-analyzer/examples/fixture-repo/src/utils/c.ts`
- Create: `repo-architecture-analyzer/examples/fixture-repo/pyapp/main.py`
- Create: `repo-architecture-analyzer/examples/fixture-repo/pyapp/helpers.py`
- Create: `repo-architecture-analyzer/examples/fixture-repo/tests/a.test.ts`
- Create: `repo-architecture-analyzer/examples/fixture-repo/README.md`
- Create: `repo-architecture-analyzer/src/shared/types.ts`
- Create: `repo-architecture-analyzer/src/shared/ids.ts`
- Test: `repo-architecture-analyzer/tests/shared/ids.test.ts`

**Interfaces:**
- Produces: `CodeNode`, `CodeEdge`, `DependencyCycle`, `Community`, `UnresolvedDependency`, `ArchitectureRule`, `AnalysisWarning`, `RepositoryData`, `AnalyzerConfig` (all `src/shared/types.ts`); `normalizeRelativePath(repoRoot: string, absolutePath: string): string` and `buildEntityId(kind: string, relativePath: string, qualifiedName?: string): string` (`src/shared/ids.ts`). Every later task imports its types from here.

- [ ] **Step 1: Create the skill folder skeleton and toolchain config**

```bash
mkdir -p repo-architecture-analyzer/{bin,config,schema,src/shared,src/analyzers/filesystem,src/analyzers/git,src/analyzers/languages,src/analyzers/metrics,src/graph,src/cache,src/report,tests/shared,tests/helpers,examples/fixture-repo}
```

`repo-architecture-analyzer/package.json`:

```json
{
  "name": "repo-architecture-analyzer",
  "private": true,
  "type": "module",
  "version": "0.1.0",
  "scripts": {
    "build:report": "esbuild src/report/main.ts --bundle --platform=browser --format=iife --outfile=bin/report-runtime.js --minify",
    "build:cli": "esbuild src/cli.ts --bundle --platform=node --target=node18 --format=cjs --banner:js=\"#!/usr/bin/env node\" --outfile=bin/analyze.js --minify",
    "build": "npm run build:report && npm run build:cli",
    "test": "vitest run"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "d3": "^7.9.0",
    "ignore": "^6.0.2",
    "ts-morph": "^24.0.0"
  },
  "devDependencies": {
    "@types/d3": "^7.4.3",
    "@types/node": "^22.10.0",
    "esbuild": "^0.24.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`dependencies` are the packages `esbuild` actually inlines into `bin/analyze.js`; `devDependencies` are build/test-only tools that never ship. Both are installed together by `npm install` during development — the split only documents intent, and matters once `--force`/`--no-cache`-style dependency audits are done later.

`repo-architecture-analyzer/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "tests"]
}
```

`repo-architecture-analyzer/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

Run: `cd repo-architecture-analyzer && npm install`
Expected: installs the 10 packages above with no errors.

- [ ] **Step 2: Write the default config**

`repo-architecture-analyzer/config/repo-architecture.default.config.json`:

```json
{
  "sourceRoots": ["src", "lib", "app"],
  "testRoots": ["test", "tests", "__tests__", "spec"],
  "include": ["**/*"],
  "exclude": [
    "**/.git/**",
    "**/node_modules/**",
    "**/vendor/**",
    "**/dist/**",
    "**/build/**",
    "**/target/**",
    "**/coverage/**",
    "**/.next/**",
    "**/out/**",
    "**/bin/**",
    "**/obj/**",
    "**/.cache/**",
    "**/generated/**",
    "**/*.min.js"
  ],
  "layers": [],
  "git": {
    "since": "12 months ago",
    "maxCommits": 5000,
    "coChangeMinimumCommits": 3,
    "coChangeMinimumConfidence": 0.2,
    "bulkCommitFileThreshold": 50,
    "bulkCommitWeight": 0.2,
    "lockfilePatterns": [
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "poetry.lock",
      "Cargo.lock"
    ]
  },
  "risk": {
    "complexityWeight": 0.3,
    "churnWeight": 0.25,
    "couplingWeight": 0.2,
    "cycleWeight": 0.15,
    "coverageWeight": 0.1
  },
  "cache": {
    "enabled": true
  }
}
```

- [ ] **Step 3: Write the JSON Schema for `RepositoryData`**

`repo-architecture-analyzer/schema/repository-data.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "repo-architecture-analyzer/repository-data.schema.json",
  "title": "RepositoryData",
  "type": "object",
  "required": ["metadata", "summary", "nodes", "edges", "cycles", "communities", "unresolvedDependencies", "architectureRules", "warnings"],
  "properties": {
    "metadata": {
      "type": "object",
      "required": ["schemaVersion", "generatedAt", "repositoryName", "languages", "analyzerVersion", "configurationHash", "parserCoverage"],
      "properties": {
        "schemaVersion": { "type": "string" },
        "generatedAt": { "type": "string" },
        "repositoryName": { "type": "string" },
        "repositoryRoot": { "type": "string" },
        "gitCommit": { "type": "string" },
        "gitBranch": { "type": "string" },
        "isDirty": { "type": "boolean" },
        "languages": { "type": "array", "items": { "type": "string" } },
        "analyzerVersion": { "type": "string" },
        "configurationHash": { "type": "string" },
        "parserCoverage": {
          "type": "object",
          "required": ["full", "partial", "skipped", "failed"],
          "properties": {
            "full": { "type": "integer" },
            "partial": { "type": "integer" },
            "skipped": { "type": "integer" },
            "failed": { "type": "integer" }
          }
        }
      }
    },
    "summary": {
      "type": "object",
      "required": ["files", "sourceFiles", "testFiles", "entities", "linesOfCode", "dependencyEdges", "cycles", "architectureViolations", "hotspots"],
      "properties": {
        "files": { "type": "integer" },
        "sourceFiles": { "type": "integer" },
        "testFiles": { "type": "integer" },
        "entities": { "type": "integer" },
        "linesOfCode": { "type": "integer" },
        "dependencyEdges": { "type": "integer" },
        "cycles": { "type": "integer" },
        "architectureViolations": { "type": "integer" },
        "hotspots": { "type": "integer" }
      }
    },
    "nodes": { "type": "array", "items": { "$ref": "#/definitions/CodeNode" } },
    "edges": { "type": "array", "items": { "$ref": "#/definitions/CodeEdge" } },
    "cycles": { "type": "array", "items": { "$ref": "#/definitions/DependencyCycle" } },
    "communities": { "type": "array", "items": { "$ref": "#/definitions/Community" } },
    "unresolvedDependencies": { "type": "array", "items": { "$ref": "#/definitions/UnresolvedDependency" } },
    "architectureRules": { "type": "array", "items": { "$ref": "#/definitions/ArchitectureRule" } },
    "warnings": { "type": "array", "items": { "$ref": "#/definitions/AnalysisWarning" } }
  },
  "definitions": {
    "CodeNode": {
      "type": "object",
      "required": ["id", "name", "relativePath", "kind"],
      "properties": {
        "id": { "type": "string" },
        "parentId": { "type": "string" },
        "name": { "type": "string" },
        "qualifiedName": { "type": "string" },
        "relativePath": { "type": "string" },
        "kind": { "enum": ["repository", "workspace", "package", "folder", "file", "class", "interface", "function", "method", "module", "component", "other"] },
        "language": { "type": "string" },
        "layer": { "type": "string" },
        "packageName": { "type": "string" },
        "isTest": { "type": "boolean" },
        "isGenerated": { "type": "boolean" },
        "loc": { "type": "number" },
        "complexity": { "type": "number" },
        "nestingDepth": { "type": "number" },
        "fanIn": { "type": "number" },
        "fanOut": { "type": "number" },
        "instability": { "type": "number" },
        "centrality": { "type": "number" },
        "coverage": { "type": "number" },
        "commitCount": { "type": "number" },
        "churn": { "type": "number" },
        "contributorCount": { "type": "number" },
        "lastModified": { "type": "string" },
        "cycleCount": { "type": "number" },
        "riskScore": { "type": "number" }
      }
    },
    "CodeEdge": {
      "type": "object",
      "required": ["id", "source", "target", "type", "weight"],
      "properties": {
        "id": { "type": "string" },
        "source": { "type": "string" },
        "target": { "type": "string" },
        "type": { "enum": ["import", "call", "inheritance", "implementation", "type-reference", "package-dependency", "co-change"] },
        "weight": { "type": "number" },
        "occurrences": { "type": "number" },
        "confidence": { "type": "number" },
        "isCrossFolder": { "type": "boolean" },
        "isCrossPackage": { "type": "boolean" },
        "isCrossLayer": { "type": "boolean" },
        "isArchitectureViolation": { "type": "boolean" }
      }
    },
    "DependencyCycle": {
      "type": "object",
      "required": ["id", "nodeIds"],
      "properties": {
        "id": { "type": "string" },
        "nodeIds": { "type": "array", "items": { "type": "string" } }
      }
    },
    "Community": {
      "type": "object",
      "required": ["id", "nodeIds"],
      "properties": {
        "id": { "type": "string" },
        "label": { "type": "string" },
        "nodeIds": { "type": "array", "items": { "type": "string" } }
      }
    },
    "UnresolvedDependency": {
      "type": "object",
      "required": ["fromNodeId", "specifier", "reason"],
      "properties": {
        "fromNodeId": { "type": "string" },
        "specifier": { "type": "string" },
        "reason": { "type": "string" }
      }
    },
    "ArchitectureRule": {
      "type": "object",
      "required": ["name", "match", "mayDependOn"],
      "properties": {
        "name": { "type": "string" },
        "match": { "type": "array", "items": { "type": "string" } },
        "mayDependOn": { "type": "array", "items": { "type": "string" } }
      }
    },
    "AnalysisWarning": {
      "type": "object",
      "required": ["level", "message"],
      "properties": {
        "level": { "enum": ["info", "warn", "error"] },
        "message": { "type": "string" },
        "relativePath": { "type": "string" }
      }
    }
  }
}
```

- [ ] **Step 4: Write the fixture repo**

`repo-architecture-analyzer/examples/fixture-repo/src/a.ts`:

```ts
import { helperValue } from "./utils/c";
import { bFunction } from "./b";

export class AService {
  run(): number {
    return helperValue() + bFunction();
  }
}
```

`repo-architecture-analyzer/examples/fixture-repo/src/b.ts`:

```ts
import { helperValue } from "./utils/c";
import { AService } from "./a";

export function bFunction(): number {
  if (helperValue() > 0) {
    return new AService().run();
  }
  return 0;
}
```

`repo-architecture-analyzer/examples/fixture-repo/src/utils/c.ts`:

```ts
export function helperValue(): number {
  return 42;
}

export class Helper {
  private value = 0;

  add(n: number): number {
    this.value += n;
    return this.value;
  }
}
```

`repo-architecture-analyzer/examples/fixture-repo/pyapp/helpers.py`:

```python
def double(value):
    return value * 2


class Formatter:
    def render(self, value):
        if value > 0:
            return f"+{value}"
        return str(value)
```

`repo-architecture-analyzer/examples/fixture-repo/pyapp/main.py`:

```python
from helpers import double, Formatter


def main():
    formatter = Formatter()
    for i in range(3):
        print(formatter.render(double(i)))


if __name__ == "__main__":
    main()
```

`repo-architecture-analyzer/examples/fixture-repo/tests/a.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AService } from "../src/a";

describe("AService", () => {
  it("runs without throwing", () => {
    expect(() => new AService().run()).not.toThrow();
  });
});
```

`repo-architecture-analyzer/examples/fixture-repo/README.md`:

```markdown
# Fixture repo

Small synthetic repository used by `repo-architecture-analyzer`'s own test
suite. Not a real project — `src/a.ts` and `src/b.ts` deliberately import
each other to exercise cycle detection, and `src/utils/c.ts` is imported by
both to exercise fan-in. This directory intentionally has no `.git` — git
history analyzer tests build their own ephemeral repos instead (Task 4).
```

- [ ] **Step 5: Write the shared types**

`repo-architecture-analyzer/src/shared/types.ts`:

```ts
export type NodeKind =
  | "repository"
  | "workspace"
  | "package"
  | "folder"
  | "file"
  | "class"
  | "interface"
  | "function"
  | "method"
  | "module"
  | "component"
  | "other";

export interface CodeNode {
  id: string;
  parentId?: string;
  name: string;
  qualifiedName?: string;
  relativePath: string;
  kind: NodeKind;
  language?: string;
  layer?: string;
  packageName?: string;
  isTest?: boolean;
  isGenerated?: boolean;
  loc?: number;
  complexity?: number;
  nestingDepth?: number;
  fanIn?: number;
  fanOut?: number;
  instability?: number;
  centrality?: number;
  coverage?: number;
  commitCount?: number;
  churn?: number;
  contributorCount?: number;
  lastModified?: string;
  cycleCount?: number;
  riskScore?: number;
}

export type EdgeType =
  | "import"
  | "call"
  | "inheritance"
  | "implementation"
  | "type-reference"
  | "package-dependency"
  | "co-change";

export interface CodeEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
  occurrences?: number;
  confidence?: number;
  isCrossFolder?: boolean;
  isCrossPackage?: boolean;
  isCrossLayer?: boolean;
  isArchitectureViolation?: boolean;
}

export interface DependencyCycle {
  id: string;
  nodeIds: string[];
}

export interface Community {
  id: string;
  label?: string;
  nodeIds: string[];
}

export interface UnresolvedDependency {
  fromNodeId: string;
  specifier: string;
  reason: string;
}

export interface ArchitectureRule {
  name: string;
  match: string[];
  mayDependOn: string[];
}

export interface AnalysisWarning {
  level: "info" | "warn" | "error";
  message: string;
  relativePath?: string;
}

export interface ParserCoverage {
  full: number;
  partial: number;
  skipped: number;
  failed: number;
}

export interface RepositoryMetadata {
  schemaVersion: string;
  generatedAt: string;
  repositoryName: string;
  repositoryRoot?: string;
  gitCommit?: string;
  gitBranch?: string;
  isDirty?: boolean;
  languages: string[];
  analyzerVersion: string;
  configurationHash: string;
  parserCoverage: ParserCoverage;
}

export interface RepositorySummary {
  files: number;
  sourceFiles: number;
  testFiles: number;
  entities: number;
  linesOfCode: number;
  dependencyEdges: number;
  cycles: number;
  architectureViolations: number;
  hotspots: number;
}

export interface RepositoryData {
  metadata: RepositoryMetadata;
  summary: RepositorySummary;
  nodes: CodeNode[];
  edges: CodeEdge[];
  cycles: DependencyCycle[];
  communities: Community[];
  unresolvedDependencies: UnresolvedDependency[];
  architectureRules: ArchitectureRule[];
  warnings: AnalysisWarning[];
}

export interface GitConfig {
  since: string;
  maxCommits: number;
  coChangeMinimumCommits: number;
  coChangeMinimumConfidence: number;
  bulkCommitFileThreshold: number;
  bulkCommitWeight: number;
  lockfilePatterns: string[];
}

export interface RiskWeights {
  complexityWeight: number;
  churnWeight: number;
  couplingWeight: number;
  cycleWeight: number;
  coverageWeight: number;
}

export interface AnalyzerConfig {
  sourceRoots: string[];
  testRoots: string[];
  include: string[];
  exclude: string[];
  layers: ArchitectureRule[];
  git: GitConfig;
  risk: RiskWeights;
  cache: { enabled: boolean };
}
```

- [ ] **Step 6: Write the failing test for entity IDs**

`repo-architecture-analyzer/tests/shared/ids.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { normalizeRelativePath, buildEntityId } from "../../src/shared/ids";

describe("normalizeRelativePath", () => {
  it("returns a posix-style relative path for a nested file", () => {
    const root = path.resolve("/repo");
    const abs = path.resolve("/repo/src/utils/c.ts");
    expect(normalizeRelativePath(root, abs)).toBe("src/utils/c.ts");
  });
});

describe("buildEntityId", () => {
  it("builds a file-level id without a qualified name", () => {
    expect(buildEntityId("file", "src/utils/c.ts")).toBe("file:src/utils/c.ts");
  });

  it("builds a symbol-level id with a qualified name", () => {
    expect(buildEntityId("class", "src/utils/c.ts", "Helper")).toBe(
      "class:src/utils/c.ts#Helper"
    );
  });
});
```

- [ ] **Step 7: Run the test and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/shared/ids.test.ts`
Expected: FAIL — `src/shared/ids.ts` does not exist yet.

- [ ] **Step 8: Implement `ids.ts`**

`repo-architecture-analyzer/src/shared/ids.ts`:

```ts
import path from "node:path";

export function normalizeRelativePath(repoRoot: string, absolutePath: string): string {
  const rel = path.relative(repoRoot, absolutePath);
  return rel.split(path.sep).join("/");
}

export function buildEntityId(
  kind: string,
  relativePath: string,
  qualifiedName?: string
): string {
  const base = `${kind}:${relativePath}`;
  return qualifiedName ? `${base}#${qualifiedName}` : base;
}
```

- [ ] **Step 9: Run the test and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/shared/ids.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: Commit**

```bash
git add repo-architecture-analyzer/
git commit -m "$(cat <<'EOF'
Scaffold repo-architecture-analyzer toolchain, config, schema, fixture repo

Sets up the dev-only TypeScript toolchain (package.json, tsconfig,
vitest), the default analysis config, the RepositoryData JSON Schema,
the `d3`/`ajv`/`ts-morph`/`ignore` runtime dependencies, a small
fixture repo used by later analyzer tests, and the shared types/ID
utilities every later task builds on.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 2: Schema validation + config loader

**Files:**
- Create: `repo-architecture-analyzer/src/shared/validate.ts`
- Create: `repo-architecture-analyzer/src/shared/config.ts`
- Test: `repo-architecture-analyzer/tests/shared/validate.test.ts`
- Test: `repo-architecture-analyzer/tests/shared/config.test.ts`

**Interfaces:**
- Consumes: `RepositoryData`, `AnalyzerConfig` (Task 1 `src/shared/types.ts`).
- Produces: `validateRepositoryData(data: unknown): { valid: boolean; errors: string[] }`, `assertRepositoryData(data: unknown): asserts data is RepositoryData` (`validate.ts`); `loadConfig(userConfigPath?: string): AnalyzerConfig`, `mergeConfig(base: AnalyzerConfig, overrides: Partial<AnalyzerConfig>): AnalyzerConfig` (`config.ts`). Task 13's pipeline assembler calls `assertRepositoryData` before writing output; Task 19's CLI calls `loadConfig`.

- [ ] **Step 1: Write the failing validation tests**

`repo-architecture-analyzer/tests/shared/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateRepositoryData } from "../../src/shared/validate";
import type { RepositoryData } from "../../src/shared/types";

function minimalData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      repositoryName: "fixture",
      languages: ["typescript"],
      analyzerVersion: "0.1.0",
      configurationHash: "abc123",
      parserCoverage: { full: 1, partial: 0, skipped: 0, failed: 0 },
    },
    summary: {
      files: 1,
      sourceFiles: 1,
      testFiles: 0,
      entities: 0,
      linesOfCode: 10,
      dependencyEdges: 0,
      cycles: 0,
      architectureViolations: 0,
      hotspots: 0,
    },
    nodes: [],
    edges: [],
    cycles: [],
    communities: [],
    unresolvedDependencies: [],
    architectureRules: [],
    warnings: [],
  };
}

describe("validateRepositoryData", () => {
  it("accepts a minimal well-formed document", () => {
    const result = validateRepositoryData(minimalData());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a document missing a required metadata field", () => {
    const data = minimalData() as any;
    delete data.metadata.schemaVersion;
    const result = validateRepositoryData(data);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a node with an invalid kind", () => {
    const data = minimalData() as any;
    data.nodes.push({ id: "x", name: "x", relativePath: "x", kind: "not-a-kind" });
    const result = validateRepositoryData(data);
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/shared/validate.test.ts`
Expected: FAIL — `src/shared/validate.ts` does not exist.

- [ ] **Step 3: Implement `validate.ts`**

`repo-architecture-analyzer/src/shared/validate.ts`:

```ts
import Ajv, { type ValidateFunction } from "ajv";
import schemaJson from "../../schema/repository-data.schema.json";
import type { RepositoryData } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn: ValidateFunction = ajv.compile(schemaJson);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRepositoryData(data: unknown): ValidationResult {
  const valid = validateFn(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateFn.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`
  );
  return { valid: false, errors };
}

export function assertRepositoryData(data: unknown): asserts data is RepositoryData {
  const result = validateRepositoryData(data);
  if (!result.valid) {
    throw new Error(`RepositoryData failed schema validation:\n${result.errors.join("\n")}`);
  }
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/shared/validate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing config tests**

`repo-architecture-analyzer/tests/shared/config.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, mergeConfig } from "../../src/shared/config";

const tmpFiles: string[] = [];
afterEach(() => {
  for (const f of tmpFiles.splice(0)) fs.rmSync(f, { force: true });
});

describe("loadConfig", () => {
  it("returns the built-in defaults when no path is given", () => {
    const config = loadConfig();
    expect(config.git.since).toBe("12 months ago");
    expect(config.risk.complexityWeight).toBeCloseTo(0.3);
  });

  it("merges a user config file over the defaults", () => {
    const file = path.join(os.tmpdir(), `repo-arch-config-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify({ risk: { complexityWeight: 0.9 } }));
    tmpFiles.push(file);

    const config = loadConfig(file);
    expect(config.risk.complexityWeight).toBeCloseTo(0.9);
    expect(config.risk.churnWeight).toBeCloseTo(0.25); // untouched default
  });
});

describe("mergeConfig", () => {
  it("replaces array fields wholesale rather than concatenating", () => {
    const base = loadConfig();
    const merged = mergeConfig(base, { exclude: ["**/only-this/**"] });
    expect(merged.exclude).toEqual(["**/only-this/**"]);
  });
});
```

- [ ] **Step 6: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/shared/config.test.ts`
Expected: FAIL — `src/shared/config.ts` does not exist.

- [ ] **Step 7: Implement `config.ts`**

`repo-architecture-analyzer/src/shared/config.ts`:

```ts
import fs from "node:fs";
import defaultConfigJson from "../../config/repo-architecture.default.config.json";
import type { AnalyzerConfig } from "./types";

export function loadConfig(userConfigPath?: string): AnalyzerConfig {
  const base = defaultConfigJson as unknown as AnalyzerConfig;
  if (!userConfigPath) {
    return base;
  }
  const raw = fs.readFileSync(userConfigPath, "utf8");
  const overrides = JSON.parse(raw) as Partial<AnalyzerConfig>;
  return mergeConfig(base, overrides);
}

export function mergeConfig(
  base: AnalyzerConfig,
  overrides: Partial<AnalyzerConfig>
): AnalyzerConfig {
  return {
    sourceRoots: overrides.sourceRoots ?? base.sourceRoots,
    testRoots: overrides.testRoots ?? base.testRoots,
    include: overrides.include ?? base.include,
    exclude: overrides.exclude ?? base.exclude,
    layers: overrides.layers ?? base.layers,
    git: { ...base.git, ...overrides.git },
    risk: { ...base.risk, ...overrides.risk },
    cache: { ...base.cache, ...overrides.cache },
  };
}
```

- [ ] **Step 8: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/shared/config.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add repo-architecture-analyzer/src/shared/validate.ts repo-architecture-analyzer/src/shared/config.ts repo-architecture-analyzer/tests/shared/validate.test.ts repo-architecture-analyzer/tests/shared/config.test.ts
git commit -m "$(cat <<'EOF'
Add RepositoryData schema validation and config loader

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 3: Filesystem analyzer (walk, classify, respect `.gitignore`/config excludes)

**Files:**
- Create: `repo-architecture-analyzer/src/analyzers/filesystem/walk.ts`
- Test: `repo-architecture-analyzer/tests/analyzers/filesystem/walk.test.ts`

**Interfaces:**
- Consumes: `AnalyzerConfig` (Task 1), `normalizeRelativePath` (Task 1 `src/shared/ids.ts`), `loadConfig` (Task 2).
- Produces: `WalkedFile { absolutePath: string; relativePath: string; classification: "source"|"test"|"generated"|"config"|"doc"|"other"; language: string | null }` and `walkRepository(repoRoot: string, config: AnalyzerConfig): WalkedFile[]`. Task 6/7 (language analyzers) filter this list by `language`; Task 8 (graph assembler) uses it to create one `CodeNode` per file.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/analyzers/filesystem/walk.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../../src/analyzers/filesystem/walk";
import { loadConfig } from "../../../src/shared/config";

const FIXTURE_ROOT = fileURLToPath(new URL("../../../examples/fixture-repo", import.meta.url));

describe("walkRepository — fixture repo", () => {
  const files = walkRepository(FIXTURE_ROOT, loadConfig());
  const byPath = new Map(files.map((f) => [f.relativePath, f]));

  it("classifies TypeScript source files", () => {
    const f = byPath.get("src/a.ts");
    expect(f?.classification).toBe("source");
    expect(f?.language).toBe("typescript");
  });

  it("classifies test files by testRoots", () => {
    expect(byPath.get("tests/a.test.ts")?.classification).toBe("test");
  });

  it("classifies markdown as doc", () => {
    expect(byPath.get("README.md")?.classification).toBe("doc");
  });

  it("classifies Python source files", () => {
    const f = byPath.get("pyapp/main.py");
    expect(f?.classification).toBe("source");
    expect(f?.language).toBe("python");
  });
});

describe("walkRepository — exclusions", () => {
  it("skips node_modules and honors a custom .gitignore", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-walk-"));
    fs.mkdirSync(path.join(tmp, "node_modules", "left-pad"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "node_modules", "left-pad", "index.js"), "module.exports = {};");
    fs.writeFileSync(path.join(tmp, "keep.ts"), "export const x = 1;");
    fs.writeFileSync(path.join(tmp, "secret.local.ts"), "export const y = 2;");
    fs.writeFileSync(path.join(tmp, ".gitignore"), "secret.local.ts\n");

    const files = walkRepository(tmp, loadConfig());
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain("keep.ts");
    expect(paths).not.toContain("node_modules/left-pad/index.js");
    expect(paths).not.toContain("secret.local.ts");

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/filesystem/walk.test.ts`
Expected: FAIL — `src/analyzers/filesystem/walk.ts` does not exist.

- [ ] **Step 3: Implement `walk.ts`**

`repo-architecture-analyzer/src/analyzers/filesystem/walk.ts`:

```ts
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

export function walkRepository(repoRoot: string, config: AnalyzerConfig): WalkedFile[] {
  const ig = loadIgnore(repoRoot, config);
  const results: WalkedFile[] = [];

  function visit(dirAbs: string): void {
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const abs = path.join(dirAbs, entry.name);
      const rel = normalizeRelativePath(repoRoot, abs);
      const checkPath = entry.isDirectory() ? `${rel}/` : rel;
      if (ig.ignores(checkPath)) continue;

      if (entry.isDirectory()) {
        visit(abs);
      } else if (entry.isFile()) {
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
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/filesystem/walk.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/analyzers/filesystem/walk.ts repo-architecture-analyzer/tests/analyzers/filesystem/walk.test.ts
git commit -m "$(cat <<'EOF'
Add filesystem analyzer: walk, classify, gitignore-aware excludes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 4: Git history analyzer

**Files:**
- Create: `repo-architecture-analyzer/tests/helpers/tempGitRepo.ts`
- Create: `repo-architecture-analyzer/src/analyzers/git/history.ts`
- Test: `repo-architecture-analyzer/tests/analyzers/git/history.test.ts`

**Interfaces:**
- Consumes: `GitConfig`, `AnalysisWarning` (Task 1 `src/shared/types.ts`).
- Produces: `FileGitStats { relativePath, commitCount, churn, contributorCount, lastModified, firstSeen }`, `GitHistoryResult { isGitRepo, commitsAnalyzed, files: Record<string, FileGitStats>, warnings }`, `analyzeGitHistory(repoRoot: string, config: GitConfig): GitHistoryResult`. Test helper: `createTempGitRepo(): { root: string; commit(files: Record<string,string>, opts: {message: string; date: string; author?: string}): void; cleanup(): void }` — reused by Task 5's co-change tests. Task 8's graph assembler merges `GitHistoryResult.files` onto `CodeNode.commitCount/.churn/.contributorCount/.lastModified`.

- [ ] **Step 1: Write the temp-git-repo test helper**

`repo-architecture-analyzer/tests/helpers/tempGitRepo.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface TempGitRepo {
  root: string;
  commit(
    files: Record<string, string>,
    opts: { message: string; date: string; author?: string }
  ): void;
  cleanup(): void;
}

export function createTempGitRepo(): TempGitRepo {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-git-"));
  const run = (args: string[], env?: NodeJS.ProcessEnv) =>
    execFileSync("git", args, { cwd: root, env: { ...process.env, ...env }, stdio: "pipe" });

  run(["init", "-q"]);
  run(["config", "user.email", "fixture@example.com"]);
  run(["config", "user.name", "Fixture Bot"]);

  return {
    root,
    commit(files, opts) {
      for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(root, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
      }
      run(["add", "-A"]);
      const author = opts.author ?? "Fixture Bot <fixture@example.com>";
      run(["commit", "-q", "-m", opts.message, "--author", author], {
        GIT_AUTHOR_DATE: opts.date,
        GIT_COMMITTER_DATE: opts.date,
      });
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 2: Write the failing tests**

`repo-architecture-analyzer/tests/analyzers/git/history.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeGitHistory } from "../../../src/analyzers/git/history";
import { createTempGitRepo, type TempGitRepo } from "../../helpers/tempGitRepo";
import { loadConfig } from "../../../src/shared/config";

let repo: TempGitRepo | undefined;
afterEach(() => {
  repo?.cleanup();
  repo = undefined;
});

describe("analyzeGitHistory — non-git directory", () => {
  it("returns zeroed results with an info warning", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-nogit-"));
    const result = analyzeGitHistory(tmp, loadConfig().git);
    expect(result.isGitRepo).toBe(false);
    expect(result.files).toEqual({});
    expect(result.warnings[0]?.level).toBe("info");
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("analyzeGitHistory — basic repo", () => {
  it("tracks commit count, churn, and distinct contributors per file", () => {
    repo = createTempGitRepo();
    repo.commit(
      { "fileA.ts": "line1\nline2\n" },
      { message: "add fileA", date: "2026-01-01T00:00:00Z", author: "Alice <alice@example.com>" }
    );
    repo.commit(
      { "fileA.ts": "line1\nline2\nline3\nline4\n", "fileB.ts": "x\n" },
      { message: "extend fileA, add fileB", date: "2026-01-02T00:00:00Z", author: "Bob <bob@example.com>" }
    );

    const result = analyzeGitHistory(repo.root, loadConfig().git);

    expect(result.isGitRepo).toBe(true);
    expect(result.commitsAnalyzed).toBe(2);
    expect(result.files["fileA.ts"].commitCount).toBe(2);
    expect(result.files["fileA.ts"].contributorCount).toBe(2);
    expect(result.files["fileB.ts"].commitCount).toBe(1);
  });

  it("excludes configured lockfiles from churn", () => {
    repo = createTempGitRepo();
    repo.commit(
      { "package-lock.json": "{}\n", "app.ts": "x\n" },
      { message: "install deps", date: "2026-01-01T00:00:00Z" }
    );

    const result = analyzeGitHistory(repo.root, loadConfig().git);

    expect(result.files["package-lock.json"]).toBeUndefined();
    expect(result.files["app.ts"]).toBeDefined();
  });

  it("down-weights commits that touch more files than the bulk threshold", () => {
    repo = createTempGitRepo();
    const bulkConfig = { ...loadConfig().git, bulkCommitFileThreshold: 2, bulkCommitWeight: 0.2 };

    repo.commit(
      { "a.ts": "x\n", "b.ts": "x\n", "c.ts": "x\n" },
      { message: "bulk formatting", date: "2026-01-01T00:00:00Z" }
    );

    const result = analyzeGitHistory(repo.root, bulkConfig);
    expect(result.files["a.ts"].commitCount).toBeCloseTo(0.2);
  });
});
```

- [ ] **Step 3: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/git/history.test.ts`
Expected: FAIL — `src/analyzers/git/history.ts` does not exist.

- [ ] **Step 4: Implement `history.ts`**

`repo-architecture-analyzer/src/analyzers/git/history.ts`:

```ts
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

    const fileLines: string[] = [];
    while (index < lines.length && !lines[index].startsWith("@@") && lines[index].trim() !== "") {
      fileLines.push(lines[index]);
      index += 1;
    }
    if (index < lines.length && lines[index].trim() === "") {
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
```

Note: `authorEmail` only ever exists as a local variable for the duration of one loop iteration and is immediately hashed into `authorId` — the raw address is never put into `stats`, `contributorsByFile`, or any returned value, matching the "no stored email addresses" constraint.

- [ ] **Step 5: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/git/history.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add repo-architecture-analyzer/tests/helpers/tempGitRepo.ts repo-architecture-analyzer/src/analyzers/git/history.ts repo-architecture-analyzer/tests/analyzers/git/history.test.ts
git commit -m "$(cat <<'EOF'
Add git history analyzer: churn, commits, anonymized contributors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 5: Co-change analyzer

**Files:**
- Create: `repo-architecture-analyzer/src/analyzers/git/coChange.ts`
- Test: `repo-architecture-analyzer/tests/analyzers/git/coChange.test.ts`

**Interfaces:**
- Consumes: `GitConfig` (Task 1), `createTempGitRepo` (Task 4 `tests/helpers/tempGitRepo.ts`).
- Produces: `CoChangePair { fileA: string; fileB: string; commits: number; confidence: number }`, `computeCoChange(repoRoot: string, config: GitConfig): CoChangePair[]`. Task 8's graph assembler turns each pair into one `CodeEdge` with `type: "co-change"`.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/analyzers/git/coChange.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { computeCoChange } from "../../../src/analyzers/git/coChange";
import { createTempGitRepo, type TempGitRepo } from "../../helpers/tempGitRepo";
import { loadConfig } from "../../../src/shared/config";

let repo: TempGitRepo | undefined;
afterEach(() => {
  repo?.cleanup();
  repo = undefined;
});

describe("computeCoChange", () => {
  it("pairs files that repeatedly change together above the thresholds", () => {
    repo = createTempGitRepo();
    for (let i = 0; i < 3; i += 1) {
      repo.commit(
        { "service.ts": `v${i}`, "service.test.ts": `v${i}` },
        { message: `iterate ${i}`, date: `2026-01-0${i + 1}T00:00:00Z` }
      );
    }
    repo.commit({ "unrelated.ts": "x" }, { message: "unrelated", date: "2026-01-05T00:00:00Z" });

    const config = { ...loadConfig().git, coChangeMinimumCommits: 2, coChangeMinimumConfidence: 0.5 };
    const pairs = computeCoChange(repo.root, config);

    const pair = pairs.find(
      (p) => [p.fileA, p.fileB].includes("service.ts") && [p.fileA, p.fileB].includes("service.test.ts")
    );
    expect(pair).toBeDefined();
    expect(pair!.commits).toBe(3);
    expect(pair!.confidence).toBeCloseTo(1);
  });

  it("ignores pairs below the minimum joint-commit threshold", () => {
    repo = createTempGitRepo();
    repo.commit({ "a.ts": "x", "b.ts": "x" }, { message: "one-off pairing", date: "2026-01-01T00:00:00Z" });

    const config = { ...loadConfig().git, coChangeMinimumCommits: 2 };
    const pairs = computeCoChange(repo.root, config);

    expect(pairs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/git/coChange.test.ts`
Expected: FAIL — `src/analyzers/git/coChange.ts` does not exist.

- [ ] **Step 3: Implement `coChange.ts`**

`repo-architecture-analyzer/src/analyzers/git/coChange.ts`:

```ts
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
  return [a, b].sort().join(" ");
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
        "--format=@@",
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
    const [fileA, fileB] = key.split(" ");
    const denom = Math.max(commitCountByFile.get(fileA) ?? 1, commitCountByFile.get(fileB) ?? 1);
    const confidence = jointCommits / denom;
    if (confidence < config.coChangeMinimumConfidence) continue;
    pairs.push({ fileA, fileB, commits: jointCommits, confidence });
  }

  return pairs;
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/git/coChange.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/analyzers/git/coChange.ts repo-architecture-analyzer/tests/analyzers/git/coChange.test.ts
git commit -m "$(cat <<'EOF'
Add co-change analyzer with commit/confidence thresholds

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 6: TypeScript/JavaScript language analyzer (`ts-morph`)

**Files:**
- Create: `repo-architecture-analyzer/src/analyzers/languages/typescript.ts`
- Test: `repo-architecture-analyzer/tests/analyzers/languages/typescript.test.ts`

**Interfaces:**
- Consumes: `WalkedFile` (Task 3), `normalizeRelativePath` (Task 1).
- Produces: `RawEntity { relativePath, kind: "class"|"interface"|"function"|"method", name, qualifiedName, loc, startLine, endLine, language }`, `RawImport { fromRelativePath, specifier, resolvedRelativePath?: string }`, `LanguageAnalysisResult { entities: RawEntity[]; imports: RawImport[] }`, `analyzeTypeScriptFiles(repoRoot: string, files: WalkedFile[]): LanguageAnalysisResult`. Task 7's Python analyzer produces the same `LanguageAnalysisResult` shape; Task 8's graph assembler consumes both uniformly; Task 10's complexity pass reads `startLine`/`endLine`/`language` to slice source text without re-parsing.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/analyzers/languages/typescript.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../../src/analyzers/filesystem/walk";
import { loadConfig } from "../../../src/shared/config";
import { analyzeTypeScriptFiles } from "../../../src/analyzers/languages/typescript";

const FIXTURE_ROOT = fileURLToPath(new URL("../../../examples/fixture-repo", import.meta.url));

describe("analyzeTypeScriptFiles", () => {
  const files = walkRepository(FIXTURE_ROOT, loadConfig());
  const result = analyzeTypeScriptFiles(FIXTURE_ROOT, files);

  it("extracts classes, methods, and functions", () => {
    const names = result.entities.map((e) => e.qualifiedName);
    expect(names).toContain("AService");
    expect(names).toContain("AService.run");
    expect(names).toContain("bFunction");
    expect(names).toContain("Helper");
    expect(names).toContain("Helper.add");
  });

  it("computes a positive line count and start/end lines per entity", () => {
    const aService = result.entities.find((e) => e.qualifiedName === "AService");
    expect(aService?.loc).toBeGreaterThan(0);
    expect(aService?.endLine).toBeGreaterThanOrEqual(aService!.startLine);
    expect(aService?.language).toBe("typescript");
  });

  it("resolves relative imports to repo-relative paths", () => {
    const aImports = result.imports.filter((i) => i.fromRelativePath === "src/a.ts");
    expect(aImports.find((i) => i.specifier === "./b")?.resolvedRelativePath).toBe("src/b.ts");
    expect(aImports.find((i) => i.specifier === "./utils/c")?.resolvedRelativePath).toBe("src/utils/c.ts");
  });

  it("only resolves relative specifiers", () => {
    const allRelative = result.imports.every(
      (i) => i.specifier.startsWith(".") || i.resolvedRelativePath === undefined
    );
    expect(allRelative).toBe(true);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/languages/typescript.test.ts`
Expected: FAIL — `src/analyzers/languages/typescript.ts` does not exist.

- [ ] **Step 3: Implement `typescript.ts`**

`repo-architecture-analyzer/src/analyzers/languages/typescript.ts`:

```ts
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
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/languages/typescript.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/analyzers/languages/typescript.ts repo-architecture-analyzer/tests/analyzers/languages/typescript.test.ts
git commit -m "$(cat <<'EOF'
Add TypeScript/JavaScript language analyzer via ts-morph

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 7: Python language analyzer (custom structural parser)

Not a full CPython-`ast`-equivalent — an indentation-based structural parser (classes, functions, methods, imports) documented as best-effort in `metadata.parserCoverage`/warnings (see spec §6). No dependency on a Python interpreter.

**Files:**
- Create: `repo-architecture-analyzer/src/analyzers/languages/python.ts`
- Test: `repo-architecture-analyzer/tests/analyzers/languages/python.test.ts`

**Interfaces:**
- Consumes: `WalkedFile` (Task 3), `normalizeRelativePath` (Task 1), `RawEntity`/`RawImport`/`LanguageAnalysisResult` (Task 6 `src/analyzers/languages/typescript.ts`).
- Produces: `analyzePythonFiles(repoRoot: string, files: WalkedFile[]): LanguageAnalysisResult` — same shape as Task 6's TS analyzer, including `startLine`/`endLine`/`language: "python"` on every `RawEntity`. Task 8's graph assembler treats both interchangeably; Task 10's complexity pass uses the line range directly.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/analyzers/languages/python.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../../src/analyzers/filesystem/walk";
import { loadConfig } from "../../../src/shared/config";
import { analyzePythonFiles } from "../../../src/analyzers/languages/python";

const FIXTURE_ROOT = fileURLToPath(new URL("../../../examples/fixture-repo", import.meta.url));

describe("analyzePythonFiles", () => {
  const files = walkRepository(FIXTURE_ROOT, loadConfig());
  const result = analyzePythonFiles(FIXTURE_ROOT, files);

  it("extracts top-level functions and classes with their methods", () => {
    const names = result.entities.map((e) => e.qualifiedName);
    expect(names).toContain("double");
    expect(names).toContain("Formatter");
    expect(names).toContain("Formatter.render");
    expect(names).toContain("main");
  });

  it("computes a line count and start/end lines for a multi-line class", () => {
    const formatter = result.entities.find((e) => e.qualifiedName === "Formatter");
    expect(formatter?.loc).toBeGreaterThan(1);
    expect(formatter?.endLine).toBeGreaterThan(formatter!.startLine);
    expect(formatter?.language).toBe("python");
  });

  it("resolves a same-directory module import", () => {
    const imp = result.imports.find((i) => i.fromRelativePath === "pyapp/main.py" && i.specifier === "helpers");
    expect(imp?.resolvedRelativePath).toBe("pyapp/helpers.py");
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/languages/python.test.ts`
Expected: FAIL — `src/analyzers/languages/python.ts` does not exist.

- [ ] **Step 3: Implement `python.ts`**

`repo-architecture-analyzer/src/analyzers/languages/python.ts`:

```ts
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
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/languages/python.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/analyzers/languages/python.ts repo-architecture-analyzer/tests/analyzers/languages/python.test.ts
git commit -m "$(cat <<'EOF'
Add Python structural language analyzer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 8: Graph assembler (nodes, edges, fan-in/out, layer violations)

**Files:**
- Create: `repo-architecture-analyzer/src/graph/assemble.ts`
- Test: `repo-architecture-analyzer/tests/graph/assemble.test.ts`

**Interfaces:**
- Consumes: `WalkedFile` (Task 3), `LanguageAnalysisResult`/`RawEntity` (Task 6), `CoChangePair` (Task 5), `AnalyzerConfig`/`CodeNode`/`CodeEdge`/`UnresolvedDependency`/`ArchitectureRule` (Task 1), `buildEntityId` (Task 1).
- Produces: `AssembledGraph { nodes: CodeNode[]; edges: CodeEdge[]; unresolvedDependencies: UnresolvedDependency[] }`, `assembleGraph(repoRoot: string, repoName: string, files: WalkedFile[], languageResults: LanguageAnalysisResult[], coChangePairs: CoChangePair[], config: AnalyzerConfig): AssembledGraph`. Task 9 (cycles) and Task 10/11 (complexity/risk) both read and mutate the returned `nodes`/`edges` arrays in place; Task 13's pipeline calls this after Tasks 3–7.

Only file-to-file import edges feed `fanIn`/`fanOut` — v1 has no symbol-level call graph (only import resolution is reliable across both languages), so `call`/`inheritance`/`implementation`/`type-reference` edge types are part of the schema but never emitted in v1. This is a deliberate, documented gap, not a bug: v1's 3 report views only need file/class-level structure and import/co-change edges.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/graph/assemble.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../src/analyzers/filesystem/walk";
import { analyzeTypeScriptFiles } from "../../src/analyzers/languages/typescript";
import { analyzePythonFiles } from "../../src/analyzers/languages/python";
import { loadConfig } from "../../src/shared/config";
import { assembleGraph } from "../../src/graph/assemble";
import type { WalkedFile } from "../../src/analyzers/filesystem/walk";
import type { LanguageAnalysisResult } from "../../src/analyzers/languages/typescript";

const FIXTURE_ROOT = fileURLToPath(new URL("../../examples/fixture-repo", import.meta.url));

function buildFixtureGraph(config = loadConfig()) {
  const files = walkRepository(FIXTURE_ROOT, config);
  const ts = analyzeTypeScriptFiles(FIXTURE_ROOT, files);
  const py = analyzePythonFiles(FIXTURE_ROOT, files);
  return assembleGraph(FIXTURE_ROOT, "fixture-repo", files, [ts, py], [], config);
}

describe("assembleGraph — hierarchy", () => {
  const graph = buildFixtureGraph();
  const byPath = new Map(graph.nodes.map((n) => [n.relativePath, n]));

  it("creates a repository root and nested folder nodes", () => {
    expect(byPath.get(".")?.kind).toBe("repository");
    expect(byPath.get("src")?.kind).toBe("folder");
    expect(byPath.get("src/utils")?.parentId).toBe(byPath.get("src")?.id);
  });

  it("creates file nodes with language, loc, and correct parent folder", () => {
    const aFile = byPath.get("src/a.ts");
    expect(aFile?.kind).toBe("file");
    expect(aFile?.language).toBe("typescript");
    expect(aFile?.loc).toBeGreaterThan(0);
    expect(aFile?.parentId).toBe(byPath.get("src")?.id);
  });

  it("nests a method node under its class node, not directly under the file", () => {
    const helperClass = graph.nodes.find((n) => n.kind === "class" && n.qualifiedName === "Helper");
    const addMethod = graph.nodes.find((n) => n.kind === "method" && n.qualifiedName === "Helper.add");
    expect(addMethod?.parentId).toBe(helperClass?.id);
  });
});

describe("assembleGraph — import edges and fan-in/out", () => {
  const graph = buildFixtureGraph();
  const fileNode = (rel: string) => graph.nodes.find((n) => n.kind === "file" && n.relativePath === rel)!;

  it("creates one aggregated import edge per source/target file pair", () => {
    const aToB = graph.edges.find(
      (e) => e.type === "import" && e.source === fileNode("src/a.ts").id && e.target === fileNode("src/b.ts").id
    );
    expect(aToB).toBeDefined();
    expect(aToB?.weight).toBe(1);
  });

  it("computes fan-in on a file imported by two others", () => {
    expect(fileNode("src/utils/c.ts").fanIn).toBe(2);
  });

  it("computes fan-out on a file that imports two others", () => {
    expect(fileNode("src/a.ts").fanOut).toBe(2);
  });

  it("cross-language: resolves a Python same-directory import as an edge", () => {
    const mainToHelpers = graph.edges.find(
      (e) => e.type === "import" && e.source === fileNode("pyapp/main.py").id && e.target === fileNode("pyapp/helpers.py").id
    );
    expect(mainToHelpers).toBeDefined();
  });
});

describe("assembleGraph — unresolved dependencies and co-change", () => {
  it("records an unresolved relative import instead of dropping it", () => {
    const files: WalkedFile[] = [
      { absolutePath: "/does-not-exist/x.ts", relativePath: "x.ts", classification: "source", language: "typescript" },
    ];
    const languageResults: LanguageAnalysisResult[] = [
      { entities: [], imports: [{ fromRelativePath: "x.ts", specifier: "./missing" }] },
    ];
    const graph = assembleGraph(FIXTURE_ROOT, "fixture-repo", files, languageResults, [], loadConfig());
    expect(graph.unresolvedDependencies).toHaveLength(1);
    expect(graph.unresolvedDependencies[0].specifier).toBe("./missing");
  });

  it("turns a co-change pair into a co-change edge", () => {
    const graph = buildFixtureGraph();
    const withCoChange = assembleGraph(
      FIXTURE_ROOT,
      "fixture-repo",
      graph.nodes.filter((n) => n.kind === "file").map((n) => ({
        absolutePath: n.relativePath,
        relativePath: n.relativePath,
        classification: "source",
        language: n.language ?? null,
      })),
      [],
      [{ fileA: "src/a.ts", fileB: "src/b.ts", commits: 5, confidence: 0.8 }],
      loadConfig()
    );
    const coChangeEdge = withCoChange.edges.find((e) => e.type === "co-change");
    expect(coChangeEdge?.weight).toBe(5);
    expect(coChangeEdge?.confidence).toBeCloseTo(0.8);
  });
});

describe("assembleGraph — architecture layers", () => {
  it("flags an architecture violation only when layers are configured", () => {
    const layers = [
      { name: "a-layer", match: ["src/a.ts"], mayDependOn: ["b-layer", "c-layer"] },
      { name: "b-layer", match: ["src/b.ts"], mayDependOn: ["c-layer"] },
      { name: "c-layer", match: ["src/utils/**"], mayDependOn: [] },
    ];
    const config = { ...loadConfig(), layers };
    const graph = buildFixtureGraph(config);
    const fileId = (rel: string) => graph.nodes.find((n) => n.relativePath === rel)!.id;

    const aToB = graph.edges.find((e) => e.source === fileId("src/a.ts") && e.target === fileId("src/b.ts"));
    const bToA = graph.edges.find((e) => e.source === fileId("src/b.ts") && e.target === fileId("src/a.ts"));

    expect(aToB?.isCrossLayer).toBe(true);
    expect(aToB?.isArchitectureViolation).toBe(false); // a-layer may depend on b-layer
    expect(bToA?.isArchitectureViolation).toBe(true); // b-layer may not depend on a-layer
  });

  it("leaves isCrossLayer/isArchitectureViolation undefined with no layers configured (default config)", () => {
    const graph = buildFixtureGraph();
    const anyImportEdge = graph.edges.find((e) => e.type === "import")!;
    expect(anyImportEdge.isCrossLayer).toBeUndefined();
    expect(anyImportEdge.isArchitectureViolation).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/graph/assemble.test.ts`
Expected: FAIL — `src/graph/assemble.ts` does not exist.

- [ ] **Step 3: Implement `assemble.ts`**

`repo-architecture-analyzer/src/graph/assemble.ts`:

```ts
import path from "node:path";
import fs from "node:fs";
import ignore from "ignore";
import { buildEntityId } from "../shared/ids";
import type { AnalyzerConfig, CodeNode, CodeEdge, UnresolvedDependency, ArchitectureRule } from "../shared/types";
import type { WalkedFile } from "../analyzers/filesystem/walk";
import type { LanguageAnalysisResult } from "../analyzers/languages/typescript";
import type { CoChangePair } from "../analyzers/git/coChange";

export interface AssembledGraph {
  nodes: CodeNode[];
  edges: CodeEdge[];
  unresolvedDependencies: UnresolvedDependency[];
}

function folderChain(relativePath: string): string[] {
  const segments = relativePath.split("/").slice(0, -1);
  return segments.map((_, i) => segments.slice(0, i + 1).join("/"));
}

function countLines(absolutePath: string): number {
  try {
    return fs.readFileSync(absolutePath, "utf8").split("\n").length;
  } catch {
    return 0;
  }
}

function topLevelSegment(relativePath: string): string {
  return relativePath.split("/")[0] ?? relativePath;
}

function resolveLayer(relativePath: string, layers: ArchitectureRule[]): string | undefined {
  for (const rule of layers) {
    if (ignore().add(rule.match).ignores(relativePath)) return rule.name;
  }
  return undefined;
}

function isAllowedDependency(sourceLayer: string, targetLayer: string, layers: ArchitectureRule[]): boolean {
  const rule = layers.find((r) => r.name === sourceLayer);
  return rule ? rule.mayDependOn.includes(targetLayer) : true;
}

export function assembleGraph(
  repoRoot: string,
  repoName: string,
  files: WalkedFile[],
  languageResults: LanguageAnalysisResult[],
  coChangePairs: CoChangePair[],
  config: AnalyzerConfig
): AssembledGraph {
  const nodes: CodeNode[] = [];
  const nodeIdByRelativePath = new Map<string, string>();
  const relativePathByFileId = new Map<string, string>();
  const folderNodeIds = new Set<string>();

  const repositoryId = buildEntityId("repository", ".");
  nodes.push({ id: repositoryId, name: repoName, relativePath: ".", kind: "repository" });

  for (const file of files) {
    let parentId = repositoryId;
    for (const folderRel of folderChain(file.relativePath)) {
      const folderId = buildEntityId("folder", folderRel);
      if (!folderNodeIds.has(folderId)) {
        folderNodeIds.add(folderId);
        const parentFolderRel = folderRel.split("/").slice(0, -1).join("/");
        nodes.push({
          id: folderId,
          parentId: parentFolderRel ? buildEntityId("folder", parentFolderRel) : repositoryId,
          name: folderRel.split("/").pop() ?? folderRel,
          relativePath: folderRel,
          kind: "folder",
        });
      }
      parentId = folderId;
    }

    const fileId = buildEntityId("file", file.relativePath);
    nodeIdByRelativePath.set(file.relativePath, fileId);
    relativePathByFileId.set(fileId, file.relativePath);
    nodes.push({
      id: fileId,
      parentId,
      name: file.relativePath.split("/").pop() ?? file.relativePath,
      relativePath: file.relativePath,
      kind: "file",
      language: file.language ?? undefined,
      layer: resolveLayer(file.relativePath, config.layers),
      isTest: file.classification === "test",
      isGenerated: file.classification === "generated",
      loc: countLines(file.absolutePath),
      packageName: topLevelSegment(file.relativePath),
    });
  }

  const entityIdByQualifiedName = new Map<string, string>();
  for (const result of languageResults) {
    for (const entity of result.entities) {
      const fileId = nodeIdByRelativePath.get(entity.relativePath);
      if (!fileId) continue;
      const entityId = buildEntityId(entity.kind, entity.relativePath, entity.qualifiedName);
      const parentQualifiedName =
        entity.kind === "method" ? entity.qualifiedName.split(".").slice(0, -1).join(".") : undefined;
      const parentId = parentQualifiedName
        ? entityIdByQualifiedName.get(`${entity.relativePath}#${parentQualifiedName}`) ?? fileId
        : fileId;

      nodes.push({
        id: entityId,
        parentId,
        name: entity.name,
        qualifiedName: entity.qualifiedName,
        relativePath: entity.relativePath,
        kind: entity.kind,
        loc: entity.loc,
      });
      entityIdByQualifiedName.set(`${entity.relativePath}#${entity.qualifiedName}`, entityId);
    }
  }

  const edges: CodeEdge[] = [];
  const unresolvedDependencies: UnresolvedDependency[] = [];
  const importsByPair = new Map<string, { source: string; target: string; count: number }>();

  for (const result of languageResults) {
    for (const imp of result.imports) {
      const sourceId = nodeIdByRelativePath.get(imp.fromRelativePath);
      if (!sourceId) continue;

      if (!imp.resolvedRelativePath) {
        if (imp.specifier.startsWith(".")) {
          unresolvedDependencies.push({
            fromNodeId: sourceId,
            specifier: imp.specifier,
            reason: "Relative import could not be resolved to a file in the repository.",
          });
        }
        continue;
      }

      const targetId = nodeIdByRelativePath.get(imp.resolvedRelativePath);
      if (!targetId || targetId === sourceId) continue;

      const key = `${sourceId}->${targetId}`;
      const existing = importsByPair.get(key);
      if (existing) existing.count += 1;
      else importsByPair.set(key, { source: sourceId, target: targetId, count: 1 });
    }
  }

  const fanOutByFile = new Map<string, number>();
  const fanInByFile = new Map<string, number>();

  for (const [key, { source, target, count }] of importsByPair) {
    const sourceRel = relativePathByFileId.get(source)!;
    const targetRel = relativePathByFileId.get(target)!;
    const sourceLayer = resolveLayer(sourceRel, config.layers);
    const targetLayer = resolveLayer(targetRel, config.layers);
    const hasLayers = sourceLayer !== undefined && targetLayer !== undefined;

    edges.push({
      id: `edge:import:${key}`,
      source,
      target,
      type: "import",
      weight: count,
      occurrences: count,
      isCrossFolder: path.dirname(sourceRel) !== path.dirname(targetRel),
      isCrossPackage: topLevelSegment(sourceRel) !== topLevelSegment(targetRel),
      isCrossLayer: hasLayers ? sourceLayer !== targetLayer : undefined,
      isArchitectureViolation:
        hasLayers && sourceLayer !== targetLayer
          ? !isAllowedDependency(sourceLayer!, targetLayer!, config.layers)
          : undefined,
    });
    fanOutByFile.set(source, (fanOutByFile.get(source) ?? 0) + 1);
    fanInByFile.set(target, (fanInByFile.get(target) ?? 0) + 1);
  }

  for (const pair of coChangePairs) {
    const sourceId = nodeIdByRelativePath.get(pair.fileA);
    const targetId = nodeIdByRelativePath.get(pair.fileB);
    if (!sourceId || !targetId) continue;
    edges.push({
      id: `edge:co-change:${sourceId}->${targetId}`,
      source: sourceId,
      target: targetId,
      type: "co-change",
      weight: pair.commits,
      occurrences: pair.commits,
      confidence: pair.confidence,
    });
  }

  for (const node of nodes) {
    if (node.kind !== "file") continue;
    node.fanIn = fanInByFile.get(node.id) ?? 0;
    node.fanOut = fanOutByFile.get(node.id) ?? 0;
    const total = node.fanIn + node.fanOut;
    node.instability = total === 0 ? 0 : node.fanOut / total;
  }

  return { nodes, edges, unresolvedDependencies };
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/graph/assemble.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/graph/assemble.ts repo-architecture-analyzer/tests/graph/assemble.test.ts
git commit -m "$(cat <<'EOF'
Add graph assembler: nodes, import/co-change edges, fan-in/out, layers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 9: Cycle detection (Tarjan's SCC)

**Files:**
- Create: `repo-architecture-analyzer/src/graph/cycles.ts`
- Test: `repo-architecture-analyzer/tests/graph/cycles.test.ts`

**Interfaces:**
- Consumes: `CodeNode`, `CodeEdge`, `DependencyCycle` (Task 1).
- Produces: `findCycles(nodes: CodeNode[], edges: CodeEdge[]): DependencyCycle[]` (only `type: "import"` edges count; single nodes without a self-loop are never reported as a cycle) and `annotateCycleCounts(nodes: CodeNode[], cycles: DependencyCycle[]): void` (mutates `node.cycleCount` in place). Task 13's pipeline calls both, in that order, right after Task 8's `assembleGraph`.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/graph/cycles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../src/analyzers/filesystem/walk";
import { analyzeTypeScriptFiles } from "../../src/analyzers/languages/typescript";
import { analyzePythonFiles } from "../../src/analyzers/languages/python";
import { loadConfig } from "../../src/shared/config";
import { assembleGraph } from "../../src/graph/assemble";
import { findCycles, annotateCycleCounts } from "../../src/graph/cycles";
import type { CodeNode, CodeEdge } from "../../src/shared/types";

const FIXTURE_ROOT = fileURLToPath(new URL("../../examples/fixture-repo", import.meta.url));

describe("findCycles — fixture repo", () => {
  const files = walkRepository(FIXTURE_ROOT, loadConfig());
  const ts = analyzeTypeScriptFiles(FIXTURE_ROOT, files);
  const py = analyzePythonFiles(FIXTURE_ROOT, files);
  const graph = assembleGraph(FIXTURE_ROOT, "fixture-repo", files, [ts, py], [], loadConfig());
  const cycles = findCycles(graph.nodes, graph.edges);
  const fileId = (rel: string) => graph.nodes.find((n) => n.relativePath === rel)!.id;

  it("finds the a.ts <-> b.ts cycle", () => {
    expect(cycles).toHaveLength(1);
    expect(cycles[0].nodeIds.sort()).toEqual([fileId("src/a.ts"), fileId("src/b.ts")].sort());
  });

  it("does not include utils/c.ts, which only receives imports", () => {
    expect(cycles.some((c) => c.nodeIds.includes(fileId("src/utils/c.ts")))).toBe(false);
  });

  it("annotates cycleCount on participating nodes only", () => {
    annotateCycleCounts(graph.nodes, cycles);
    const aNode = graph.nodes.find((n) => n.id === fileId("src/a.ts"))!;
    const cNode = graph.nodes.find((n) => n.id === fileId("src/utils/c.ts"))!;
    expect(aNode.cycleCount).toBe(1);
    expect(cNode.cycleCount ?? 0).toBe(0);
  });
});

describe("findCycles — synthetic 3-node cycle", () => {
  it("detects a longer cycle p -> q -> r -> p", () => {
    const nodes: CodeNode[] = ["p", "q", "r"].map((id) => ({ id, name: id, relativePath: id, kind: "file" }));
    const edges: CodeEdge[] = [
      { id: "e1", source: "p", target: "q", type: "import", weight: 1 },
      { id: "e2", source: "q", target: "r", type: "import", weight: 1 },
      { id: "e3", source: "r", target: "p", type: "import", weight: 1 },
    ];
    const cycles = findCycles(nodes, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].nodeIds.sort()).toEqual(["p", "q", "r"]);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/graph/cycles.test.ts`
Expected: FAIL — `src/graph/cycles.ts` does not exist.

- [ ] **Step 3: Implement `cycles.ts`**

`repo-architecture-analyzer/src/graph/cycles.ts`:

```ts
import type { CodeNode, CodeEdge, DependencyCycle } from "../shared/types";

export function findCycles(nodes: CodeNode[], edges: CodeEdge[]): DependencyCycle[] {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    if (edge.type !== "import") continue;
    adjacency.get(edge.source)?.push(edge.target);
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: DependencyCycle[] = [];
  let cycleCounter = 0;

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adjacency.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);

      if (component.length > 1) {
        cycleCounter += 1;
        cycles.push({ id: `cycle:${cycleCounter}`, nodeIds: component });
      }
    }
  }

  for (const node of nodes) {
    if (!indices.has(node.id)) strongConnect(node.id);
  }

  return cycles;
}

export function annotateCycleCounts(nodes: CodeNode[], cycles: DependencyCycle[]): void {
  const countByNodeId = new Map<string, number>();
  for (const cycle of cycles) {
    for (const nodeId of cycle.nodeIds) {
      countByNodeId.set(nodeId, (countByNodeId.get(nodeId) ?? 0) + 1);
    }
  }
  for (const node of nodes) {
    const count = countByNodeId.get(node.id);
    if (count !== undefined) node.cycleCount = count;
  }
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/graph/cycles.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/graph/cycles.ts repo-architecture-analyzer/tests/graph/cycles.test.ts
git commit -m "$(cat <<'EOF'
Add Tarjan SCC cycle detection and cycleCount annotation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 10: Complexity & nesting-depth annotation

A single language-agnostic heuristic (keyword/operator counting + indentation-delta) applied to both TypeScript/JavaScript and Python by slicing each entity's own source lines — reuses the `startLine`/`endLine`/`language` fields Task 6/7 already compute, so nothing gets re-parsed with `ts-morph`. Documented everywhere as an approximation, not real cyclomatic analysis via full control-flow graphs.

**Files:**
- Create: `repo-architecture-analyzer/src/graph/complexity.ts`
- Test: `repo-architecture-analyzer/tests/graph/complexity.test.ts`

**Interfaces:**
- Consumes: `CodeNode` (Task 1), `RawEntity` (Task 6/7), `WalkedFile` (Task 3), `buildEntityId` (Task 1).
- Produces: `annotateComplexity(nodes: CodeNode[], entities: RawEntity[], files: WalkedFile[]): void` — mutates `node.complexity`/`node.nestingDepth` in place for every entity node it can match by id. Task 13's pipeline calls this right after Task 9's `annotateCycleCounts`.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/graph/complexity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { walkRepository } from "../../src/analyzers/filesystem/walk";
import { analyzeTypeScriptFiles } from "../../src/analyzers/languages/typescript";
import { analyzePythonFiles } from "../../src/analyzers/languages/python";
import { loadConfig } from "../../src/shared/config";
import { assembleGraph } from "../../src/graph/assemble";
import { annotateComplexity } from "../../src/graph/complexity";

const FIXTURE_ROOT = fileURLToPath(new URL("../../examples/fixture-repo", import.meta.url));

describe("annotateComplexity", () => {
  const config = loadConfig();
  const files = walkRepository(FIXTURE_ROOT, config);
  const ts = analyzeTypeScriptFiles(FIXTURE_ROOT, files);
  const py = analyzePythonFiles(FIXTURE_ROOT, files);
  const graph = assembleGraph(FIXTURE_ROOT, "fixture-repo", files, [ts, py], [], config);
  annotateComplexity(graph.nodes, [...ts.entities, ...py.entities], files);

  const byQualifiedName = (qn: string) => graph.nodes.find((n) => n.qualifiedName === qn)!;

  it("gives a branch-free function complexity 1", () => {
    expect(byQualifiedName("AService.run").complexity).toBe(1);
  });

  it("adds 1 per if-statement in TypeScript", () => {
    expect(byQualifiedName("bFunction").complexity).toBe(2);
  });

  it("adds 1 per if-statement in Python", () => {
    expect(byQualifiedName("Formatter.render").complexity).toBe(2);
  });

  it("measures deeper nesting for a function with a branch than one without", () => {
    const branchy = byQualifiedName("Formatter.render").nestingDepth ?? 0;
    const flat = byQualifiedName("AService.run").nestingDepth ?? 0;
    expect(branchy).toBeGreaterThan(flat);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/graph/complexity.test.ts`
Expected: FAIL — `src/graph/complexity.ts` does not exist.

- [ ] **Step 3: Implement `complexity.ts`**

`repo-architecture-analyzer/src/graph/complexity.ts`:

```ts
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
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/graph/complexity.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/graph/complexity.ts repo-architecture-analyzer/tests/graph/complexity.test.ts
git commit -m "$(cat <<'EOF'
Add complexity/nesting-depth heuristic shared by TS and Python

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 11: Coverage loader + risk score calculator

**Files:**
- Create: `repo-architecture-analyzer/src/analyzers/metrics/coverage.ts`
- Create: `repo-architecture-analyzer/src/graph/risk.ts`
- Test: `repo-architecture-analyzer/tests/analyzers/metrics/coverage.test.ts`
- Test: `repo-architecture-analyzer/tests/graph/risk.test.ts`

**Interfaces:**
- Consumes: `CodeNode`, `RiskWeights` (Task 1).
- Produces: `parseLcov(content: string, repoRoot: string): Record<string, number>`, `loadCoverage(repoRoot: string): Record<string, number>` (percentage 0–100 per repo-relative path, reading only `coverage/lcov.info` / `coverage/lcov-report/lcov.info` — never runs the target repo's tests); `annotateRiskScores(nodes: CodeNode[], weights: RiskWeights): void` — aggregates each file's child entities' `complexity` onto the file node, then sets `node.riskScore` (0–100) on every file node using the spec §8 weighted formula. Task 13's pipeline calls `loadCoverage`, copies matching percentages onto file nodes' `coverage` field, then calls `annotateRiskScores` last (it needs `complexity`, `churn`, `fanIn`/`fanOut`, `cycleCount`, and `coverage` already set).

- [ ] **Step 1: Write the failing coverage tests**

`repo-architecture-analyzer/tests/analyzers/metrics/coverage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseLcov, loadCoverage } from "../../../src/analyzers/metrics/coverage";

describe("parseLcov", () => {
  it("computes per-file coverage percentage from hit/total lines", () => {
    const lcov = ["SF:src/a.ts", "LH:8", "LF:10", "end_of_record", "SF:src/b.ts", "LH:0", "LF:5", "end_of_record"].join(
      "\n"
    );
    const result = parseLcov(lcov, "/repo");
    expect(result["src/a.ts"]).toBeCloseTo(80);
    expect(result["src/b.ts"]).toBeCloseTo(0);
  });
});

describe("loadCoverage", () => {
  it("reads coverage/lcov.info when present", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-cov-"));
    fs.mkdirSync(path.join(tmp, "coverage"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "coverage", "lcov.info"), ["SF:app.ts", "LH:5", "LF:5", "end_of_record"].join("\n"));

    expect(loadCoverage(tmp)["app.ts"]).toBeCloseTo(100);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns an empty object when no coverage artifact exists", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-nocov-"));
    expect(loadCoverage(tmp)).toEqual({});
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/metrics/coverage.test.ts`
Expected: FAIL — `src/analyzers/metrics/coverage.ts` does not exist.

- [ ] **Step 3: Implement `coverage.ts`**

`repo-architecture-analyzer/src/analyzers/metrics/coverage.ts`:

```ts
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
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/analyzers/metrics/coverage.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing risk-score tests**

`repo-architecture-analyzer/tests/graph/risk.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { annotateRiskScores } from "../../src/graph/risk";
import type { CodeNode } from "../../src/shared/types";

const weights = { complexityWeight: 0.3, churnWeight: 0.25, couplingWeight: 0.2, cycleWeight: 0.15, coverageWeight: 0.1 };

describe("annotateRiskScores", () => {
  it("gives the file with the worst metrics a higher score than a clean file", () => {
    const nodes: CodeNode[] = [
      { id: "file:a", name: "a", relativePath: "a", kind: "file", churn: 100, fanIn: 5, fanOut: 5, cycleCount: 2, coverage: 10 },
      { id: "class:a#A", name: "A", relativePath: "a", kind: "class", qualifiedName: "A", complexity: 20 },
      { id: "file:b", name: "b", relativePath: "b", kind: "file", churn: 1, fanIn: 0, fanOut: 0, cycleCount: 0, coverage: 100 },
      { id: "class:b#B", name: "B", relativePath: "b", kind: "class", qualifiedName: "B", complexity: 1 },
    ];

    annotateRiskScores(nodes, weights);

    const a = nodes.find((n) => n.id === "file:a")!;
    const b = nodes.find((n) => n.id === "file:b")!;
    expect(a.riskScore).toBeGreaterThan(b.riskScore!);
    expect(b.riskScore).toBeGreaterThanOrEqual(0);
  });

  it("gives a file with zero metrics and no cycles a risk score of 0", () => {
    const nodes: CodeNode[] = [{ id: "file:z", name: "z", relativePath: "z", kind: "file", churn: 0, fanIn: 0, fanOut: 0, cycleCount: 0 }];
    annotateRiskScores(nodes, weights);
    expect(nodes[0].riskScore).toBe(0);
  });

  it("aggregates entity complexity onto the owning file node", () => {
    const nodes: CodeNode[] = [
      { id: "file:a", name: "a", relativePath: "a", kind: "file" },
      { id: "fn:a#one", name: "one", relativePath: "a", kind: "function", qualifiedName: "one", complexity: 3 },
      { id: "fn:a#two", name: "two", relativePath: "a", kind: "function", qualifiedName: "two", complexity: 4 },
    ];
    annotateRiskScores(nodes, weights);
    expect(nodes.find((n) => n.id === "file:a")!.complexity).toBe(7);
  });
});
```

- [ ] **Step 6: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/graph/risk.test.ts`
Expected: FAIL — `src/graph/risk.ts` does not exist.

- [ ] **Step 7: Implement `risk.ts`**

`repo-architecture-analyzer/src/graph/risk.ts`:

```ts
import type { CodeNode, RiskWeights } from "../shared/types";

const ENTITY_KINDS = new Set(["class", "interface", "function", "method"]);

export function annotateRiskScores(nodes: CodeNode[], weights: RiskWeights): void {
  const fileNodes = nodes.filter((n) => n.kind === "file");

  const complexityByFile = new Map<string, number>();
  for (const node of nodes) {
    if (!ENTITY_KINDS.has(node.kind)) continue;
    complexityByFile.set(node.relativePath, (complexityByFile.get(node.relativePath) ?? 0) + (node.complexity ?? 0));
  }

  const maxComplexity = Math.max(1, ...fileNodes.map((n) => complexityByFile.get(n.relativePath) ?? 0));
  const maxChurn = Math.max(1, ...fileNodes.map((n) => n.churn ?? 0));
  const maxCoupling = Math.max(1, ...fileNodes.map((n) => (n.fanIn ?? 0) + (n.fanOut ?? 0)));

  for (const node of fileNodes) {
    const complexity = complexityByFile.get(node.relativePath) ?? 0;
    node.complexity = complexity;

    const normalizedComplexity = complexity / maxComplexity;
    const normalizedChurn = (node.churn ?? 0) / maxChurn;
    const normalizedCoupling = ((node.fanIn ?? 0) + (node.fanOut ?? 0)) / maxCoupling;
    const cycleParticipation = (node.cycleCount ?? 0) > 0 ? 1 : 0;
    const missingCoverage = node.coverage === undefined ? 0 : 1 - node.coverage / 100;

    const risk =
      weights.complexityWeight * normalizedComplexity +
      weights.churnWeight * normalizedChurn +
      weights.couplingWeight * normalizedCoupling +
      weights.cycleWeight * cycleParticipation +
      weights.coverageWeight * missingCoverage;

    node.riskScore = Math.round(risk * 100);
  }
}
```

- [ ] **Step 8: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/graph/risk.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add repo-architecture-analyzer/src/analyzers/metrics/coverage.ts repo-architecture-analyzer/src/graph/risk.ts repo-architecture-analyzer/tests/analyzers/metrics/coverage.test.ts repo-architecture-analyzer/tests/graph/risk.test.ts
git commit -m "$(cat <<'EOF'
Add LCOV coverage loader and weighted risk-score calculator

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 12: Content-hash cache store

Per spec §5/§9, v1 does whole-repo analysis on every run — no partial re-analysis pipeline. The one thing genuinely cheap and unambiguous to cache is git history: if `HEAD` hasn't moved, `git log` output for the same `since`/`maxCommits` window cannot have changed, so Task 13's pipeline will key the cache on `HEAD` SHA rather than per-file content hashes (safer than partially invalidating `ts-morph`'s single shared `Project`, which resolves imports across files and isn't safe to invalidate file-by-file in v1).

**Files:**
- Create: `repo-architecture-analyzer/src/cache/store.ts`
- Test: `repo-architecture-analyzer/tests/cache/store.test.ts`

**Interfaces:**
- Produces: `hashContent(content: string): string`, `resolveCacheDir(repoRoot: string): string` (`~/.cache/repo-architecture-analyzer/<repo-slug>/`, slug from the git remote URL or, failing that, the absolute path — never from anything inside the target repo or this skills repo), `class CacheStore { constructor(cacheDir: string); get<T>(key: string): T | undefined; set(key: string, value: unknown): void; clear(): void; save(): void }`. Task 13's pipeline constructs one `CacheStore`, checks it before running Task 4/5's git analyzers (key: `` `git:${headSha}` ``), and calls `.save()` once at the end unless `--no-cache` was passed.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/cache/store.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashContent, resolveCacheDir, CacheStore } from "../../src/cache/store";

describe("hashContent", () => {
  it("is deterministic and content-sensitive", () => {
    expect(hashContent("a")).toBe(hashContent("a"));
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });
});

describe("resolveCacheDir", () => {
  it("is deterministic per repo root, differs across roots, and lives under ~/.cache", () => {
    const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-cache-a-"));
    const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-cache-b-"));

    expect(resolveCacheDir(tmpA)).toBe(resolveCacheDir(tmpA));
    expect(resolveCacheDir(tmpA)).not.toBe(resolveCacheDir(tmpB));
    expect(resolveCacheDir(tmpA).startsWith(path.join(os.homedir(), ".cache", "repo-architecture-analyzer"))).toBe(true);

    fs.rmSync(tmpA, { recursive: true, force: true });
    fs.rmSync(tmpB, { recursive: true, force: true });
  });
});

describe("CacheStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("starts empty when no cache file exists yet", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-store-"));
    dirs.push(dir);
    expect(new CacheStore(dir).get("missing")).toBeUndefined();
  });

  it("persists values across instances after save()", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-arch-store-"));
    dirs.push(dir);

    const first = new CacheStore(dir);
    first.set("git:abc123", { commitsAnalyzed: 42 });
    first.save();

    const second = new CacheStore(dir);
    expect(second.get<{ commitsAnalyzed: number }>("git:abc123")).toEqual({ commitsAnalyzed: 42 });
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/cache/store.test.ts`
Expected: FAIL — `src/cache/store.ts` does not exist.

- [ ] **Step 3: Implement `store.ts`**

`repo-architecture-analyzer/src/cache/store.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export function hashContent(content: string): string {
  return crypto.createHash("sha1").update(content).digest("hex");
}

function resolveRepoSlug(repoRoot: string): string {
  let remote: string | null = null;
  try {
    remote = execFileSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    remote = null;
  }
  const basis = remote || path.resolve(repoRoot);
  return hashContent(basis).slice(0, 16);
}

export function resolveCacheDir(repoRoot: string): string {
  return path.join(os.homedir(), ".cache", "repo-architecture-analyzer", resolveRepoSlug(repoRoot));
}

export class CacheStore {
  private readonly filePath: string;
  private data: Record<string, unknown> = {};

  constructor(cacheDir: string) {
    this.filePath = path.join(cacheDir, "cache.json");
    if (fs.existsSync(this.filePath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      } catch {
        this.data = {};
      }
    }
  }

  get<T>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  clear(): void {
    this.data = {};
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data));
  }
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/cache/store.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/cache/store.ts repo-architecture-analyzer/tests/cache/store.test.ts
git commit -m "$(cat <<'EOF'
Add content-hash cache store for git-history memoization

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 13: `RepositoryData` pipeline assembler

The orchestrator: runs Tasks 3–12 in order against a real repo path and produces one schema-valid `RepositoryData`. This is the last "engine" task — after this, `runAnalysis()` is a complete, independently useful function even before any report exists.

**Files:**
- Create: `repo-architecture-analyzer/src/pipeline.ts`
- Test: `repo-architecture-analyzer/tests/pipeline.test.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 1–12 (`walkRepository`, `analyzeGitHistory`, `computeCoChange`, `analyzeTypeScriptFiles`, `analyzePythonFiles`, `loadCoverage`, `assembleGraph`, `findCycles`/`annotateCycleCounts`, `annotateComplexity`, `annotateRiskScores`, `hashContent`/`resolveCacheDir`/`CacheStore`, `assertRepositoryData`).
- Produces: `RunAnalysisOptions { noCache?: boolean; force?: boolean }`, `runAnalysis(repoRoot: string, config: AnalyzerConfig, options?: RunAnalysisOptions): RepositoryData`. Task 19's CLI is a thin wrapper around this; Task 18's HTML template assembler consumes its return value directly.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/pipeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/shared/config";
import { runAnalysis } from "../src/pipeline";
import { resolveCacheDir } from "../src/cache/store";

const FIXTURE_ROOT = fileURLToPath(new URL("../examples/fixture-repo", import.meta.url));

describe("runAnalysis — fixture repo (no cache)", () => {
  const data = runAnalysis(FIXTURE_ROOT, loadConfig(), { noCache: true });

  it("produces schema-valid RepositoryData without throwing", () => {
    expect(data.metadata.schemaVersion).toBe("1.0.0");
  });

  it("names the repository after the fixture directory", () => {
    expect(data.metadata.repositoryName).toBe("fixture-repo");
  });

  it("fully parses all 5 TS/Python source files", () => {
    expect(data.metadata.parserCoverage.full).toBe(5);
  });

  it("finds the a.ts <-> b.ts cycle", () => {
    expect(data.summary.cycles).toBe(1);
  });

  it("carries the info warning about missing git history", () => {
    expect(data.warnings.some((w) => w.level === "info")).toBe(true);
  });

  it("sets a risk score on every file node", () => {
    const fileNodes = data.nodes.filter((n) => n.kind === "file");
    expect(fileNodes.length).toBeGreaterThan(0);
    expect(fileNodes.every((n) => typeof n.riskScore === "number")).toBe(true);
  });
});

describe("runAnalysis — caching", () => {
  it("writes a cache file under the resolved cache dir when caching is enabled", () => {
    const cacheDir = resolveCacheDir(FIXTURE_ROOT);
    fs.rmSync(cacheDir, { recursive: true, force: true });

    runAnalysis(FIXTURE_ROOT, loadConfig(), {});

    expect(fs.existsSync(`${cacheDir}/cache.json`)).toBe(true);
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/pipeline.test.ts`
Expected: FAIL — `src/pipeline.ts` does not exist.

- [ ] **Step 3: Implement `pipeline.ts`**

`repo-architecture-analyzer/src/pipeline.ts`:

```ts
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
import type { AnalyzerConfig, RepositoryData, AnalysisWarning, LanguageAnalysisResult } from "./shared/types";

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

  let ts: LanguageAnalysisResult = { entities: [], imports: [] };
  try {
    ts = analyzeTypeScriptFiles(absoluteRoot, files);
  } catch (err) {
    warnings.push({ level: "error", message: `TypeScript analysis failed: ${(err as Error).message}` });
  }

  let py: LanguageAnalysisResult = { entities: [], imports: [] };
  try {
    py = analyzePythonFiles(absoluteRoot, files);
  } catch (err) {
    warnings.push({ level: "error", message: `Python analysis failed: ${(err as Error).message}` });
  }

  const configHash = hashContent(JSON.stringify(config));
  const headSha = safeGit(absoluteRoot, ["rev-parse", "HEAD"]);
  const cache = options.noCache ? null : new CacheStore(resolveCacheDir(absoluteRoot));
  const gitCacheKey = `git:${headSha ?? "no-head"}:${configHash}`;

  let gitData = options.force ? undefined : cache?.get<CachedGitData>(gitCacheKey);
  if (!gitData) {
    gitData = {
      history: analyzeGitHistory(absoluteRoot, config.git),
      coChange: computeCoChange(absoluteRoot, config.git),
    };
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

  const fullCoverage = files.filter((f) => f.language !== null && CODE_LANGUAGES.has(f.language)).length;
  const skippedCoverage = files.filter((f) => f.classification === "source" && f.language === null).length;

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
      parserCoverage: { full: fullCoverage, partial: 0, skipped: skippedCoverage, failed: 0 },
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
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/pipeline.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full test suite so far**

Run: `cd repo-architecture-analyzer && npm test`
Expected: PASS — every test file from Tasks 1–13 passes together, confirming the engine half of the skill works end-to-end.

- [ ] **Step 6: Commit**

```bash
git add repo-architecture-analyzer/src/pipeline.ts repo-architecture-analyzer/tests/pipeline.test.ts
git commit -m "$(cat <<'EOF'
Add RepositoryData pipeline: wires analyzers, cache, and risk scoring

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

## Report tasks (browser-side)

Tasks 14–18 live under `src/report/` and run **in the browser**, inside the generated HTML — not in Node. They're still written in TypeScript and unit-tested with `vitest` (in Node, since the logic itself has no DOM dependency beyond what `jsdom`, already a devDependency, provides where needed), but Task 18 bundles them separately from the CLI, targeting `platform: "browser"`.

### Task 14: Report shared state (search/filter/select)

**Files:**
- Create: `repo-architecture-analyzer/src/report/state.ts`
- Test: `repo-architecture-analyzer/tests/report/state.test.ts`

**Interfaces:**
- Produces: `AppFilters { search: string; entityType: string | null; language: string | null; packageName: string | null; showTests: boolean; minEdgeWeight: number; minRisk: number }`, `class AppState { selectedNodeId: string | null; filters: AppFilters; subscribe(listener: () => void): () => void; select(nodeId: string | null): void; setFilter<K extends keyof AppFilters>(key: K, value: AppFilters[K]): void; reset(): void }`, `matchesFilters(node: {...}, filters: AppFilters): boolean`. Tasks 15–17 (the three D3 views) each construct one shared `AppState`, call `matchesFilters` to decide what to render, and call `.select()` on click; Task 18's template wires a search box and filter controls to `setFilter`/`reset`.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/report/state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AppState, matchesFilters } from "../../src/report/state";

describe("AppState", () => {
  it("notifies subscribers when the selection changes", () => {
    const state = new AppState();
    let calls = 0;
    state.subscribe(() => { calls += 1; });
    state.select("file:a.ts");
    expect(state.selectedNodeId).toBe("file:a.ts");
    expect(calls).toBe(1);
  });

  it("notifies subscribers when a filter changes", () => {
    const state = new AppState();
    let calls = 0;
    state.subscribe(() => { calls += 1; });
    state.setFilter("search", "helper");
    expect(state.filters.search).toBe("helper");
    expect(calls).toBe(1);
  });

  it("reset clears selection and filters and notifies once", () => {
    const state = new AppState();
    state.select("x");
    state.setFilter("showTests", false);
    let calls = 0;
    state.subscribe(() => { calls += 1; });
    state.reset();
    expect(state.selectedNodeId).toBeNull();
    expect(state.filters.showTests).toBe(true);
    expect(calls).toBe(1);
  });

  it("unsubscribe stops further notifications", () => {
    const state = new AppState();
    let calls = 0;
    const unsubscribe = state.subscribe(() => { calls += 1; });
    unsubscribe();
    state.select("x");
    expect(calls).toBe(0);
  });
});

describe("matchesFilters", () => {
  const baseFilters = {
    search: "", entityType: null, language: null, packageName: null,
    showTests: true, minEdgeWeight: 0, minRisk: 0,
  };
  const node = {
    name: "Helper", qualifiedName: "Helper", kind: "class",
    language: "typescript", packageName: "src", isTest: false, riskScore: 40,
  };

  it("matches everything with default filters", () => {
    expect(matchesFilters(node, baseFilters)).toBe(true);
  });

  it("filters by case-insensitive search across name and qualifiedName", () => {
    expect(matchesFilters(node, { ...baseFilters, search: "help" })).toBe(true);
    expect(matchesFilters(node, { ...baseFilters, search: "nomatch" })).toBe(false);
  });

  it("filters out test nodes when showTests is false", () => {
    expect(matchesFilters({ ...node, isTest: true }, { ...baseFilters, showTests: false })).toBe(false);
  });

  it("filters by minimum risk score", () => {
    expect(matchesFilters(node, { ...baseFilters, minRisk: 50 })).toBe(false);
    expect(matchesFilters(node, { ...baseFilters, minRisk: 30 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/state.test.ts`
Expected: FAIL — `src/report/state.ts` does not exist.

- [ ] **Step 3: Implement `state.ts`**

`repo-architecture-analyzer/src/report/state.ts`:

```ts
export interface AppFilters {
  search: string;
  entityType: string | null;
  language: string | null;
  packageName: string | null;
  showTests: boolean;
  minEdgeWeight: number;
  minRisk: number;
}

const DEFAULT_FILTERS: AppFilters = {
  search: "",
  entityType: null,
  language: null,
  packageName: null,
  showTests: true,
  minEdgeWeight: 0,
  minRisk: 0,
};

export type Listener = () => void;

export class AppState {
  selectedNodeId: string | null = null;
  filters: AppFilters = { ...DEFAULT_FILTERS };

  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  select(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
    this.notify();
  }

  setFilter<K extends keyof AppFilters>(key: K, value: AppFilters[K]): void {
    this.filters[key] = value;
    this.notify();
  }

  reset(): void {
    this.selectedNodeId = null;
    this.filters = { ...DEFAULT_FILTERS };
    this.notify();
  }
}

export interface FilterableNode {
  name: string;
  qualifiedName?: string;
  kind: string;
  language?: string;
  packageName?: string;
  isTest?: boolean;
  riskScore?: number;
}

export function matchesFilters(node: FilterableNode, filters: AppFilters): boolean {
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = `${node.name} ${node.qualifiedName ?? ""}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (filters.entityType && node.kind !== filters.entityType) return false;
  if (filters.language && node.language !== filters.language) return false;
  if (filters.packageName && node.packageName !== filters.packageName) return false;
  if (!filters.showTests && node.isTest) return false;
  if (filters.minRisk > 0 && (node.riskScore ?? 0) < filters.minRisk) return false;
  return true;
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/state.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/report/state.ts repo-architecture-analyzer/tests/report/state.test.ts
git commit -m "$(cat <<'EOF'
Add report shared state: search/filter/select pub-sub store

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 15: Repo map view (icicle/treemap)

v1 scope note: the hierarchy renders `repository → folder → file` only, not the `class`/`function` leaf tier the spec's ideal hierarchy describes — descending to per-symbol rectangles risks thousands of tiny labels on a real repo, and v1 deliberately has no lazy-expansion/aggregation strategy (that's v2, alongside the other deferred views). Breadcrumb zoom-into-folder is also not built in v1 — the map renders full-depth and relies on the shared search/filter controls (Task 14) instead. Both are documented gaps, not oversights.

**Files:**
- Create: `repo-architecture-analyzer/src/report/repoMap.ts`
- Test: `repo-architecture-analyzer/tests/report/repoMap.test.ts`

**Interfaces:**
- Consumes: `RepositoryData`, `CodeNode` (Task 1), `AppState`, `matchesFilters` (Task 14).
- Produces: `renderRepoMap(container: HTMLElement, data: RepositoryData, state: AppState): { setLayout(layout: "icicle" | "treemap"): void; setMetric(metric: "loc" | "riskScore" | "complexity" | "churn"): void }`. Task 18's template calls this once per report and wires its two setters to the layout-toggle and metric-selector controls.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/report/repoMap.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderRepoMap } from "../../src/report/repoMap";
import { AppState } from "../../src/report/state";
import type { RepositoryData } from "../../src/shared/types";

function sampleData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "r", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 2, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 2, sourceFiles: 2, testFiles: 0, entities: 0, linesOfCode: 30, dependencyEdges: 0, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "repository:.", name: "r", relativePath: ".", kind: "repository" },
      { id: "folder:src", parentId: "repository:.", name: "src", relativePath: "src", kind: "folder" },
      { id: "file:src/a.ts", parentId: "folder:src", name: "a.ts", relativePath: "src/a.ts", kind: "file", loc: 20, riskScore: 70 },
      { id: "file:src/b.ts", parentId: "folder:src", name: "b.ts", relativePath: "src/b.ts", kind: "file", loc: 10, riskScore: 10 },
    ],
    edges: [], cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

describe("renderRepoMap", () => {
  it("renders one rect per visible file node", () => {
    const container = document.createElement("div");
    renderRepoMap(container, sampleData(), new AppState());
    expect(container.querySelectorAll("g.rk-cell rect").length).toBe(2);
  });

  it("re-renders and hides nodes that no longer match an active filter", () => {
    const container = document.createElement("div");
    const state = new AppState();
    renderRepoMap(container, sampleData(), state);
    state.setFilter("minRisk", 50);
    expect(container.querySelectorAll("g.rk-cell rect").length).toBe(1);
  });

  it("clicking a cell selects its node id in shared state", () => {
    const container = document.createElement("div");
    const state = new AppState();
    renderRepoMap(container, sampleData(), state);
    const firstRect = container.querySelector("g.rk-cell rect") as SVGRectElement;
    firstRect.dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).not.toBeNull();
  });

  it("switching layout re-renders without throwing", () => {
    const container = document.createElement("div");
    const handle = renderRepoMap(container, sampleData(), new AppState());
    expect(() => handle.setLayout("treemap")).not.toThrow();
    expect(container.querySelectorAll("g.rk-cell rect").length).toBe(2);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/repoMap.test.ts`
Expected: FAIL — `src/report/repoMap.ts` does not exist.

- [ ] **Step 3: Implement `repoMap.ts`**

`repo-architecture-analyzer/src/report/repoMap.ts`:

```ts
import * as d3 from "d3";
import type { RepositoryData, CodeNode } from "../shared/types";
import { AppState, matchesFilters } from "./state";

export interface RepoMapHandle {
  setLayout(layout: "icicle" | "treemap"): void;
  setMetric(metric: "loc" | "riskScore" | "complexity" | "churn"): void;
}

const STRUCTURAL_KINDS = new Set(["repository", "folder", "file"]);

function buildHierarchy(data: RepositoryData): d3.HierarchyNode<CodeNode> {
  const childrenById = new Map<string, CodeNode[]>();
  for (const node of data.nodes) {
    if (!STRUCTURAL_KINDS.has(node.kind) || !node.parentId) continue;
    const siblings = childrenById.get(node.parentId) ?? [];
    siblings.push(node);
    childrenById.set(node.parentId, siblings);
  }

  const root = data.nodes.find((n) => n.kind === "repository");
  if (!root) throw new Error("RepositoryData has no repository root node");
  return d3.hierarchy(root, (n) => childrenById.get(n.id) ?? []);
}

function riskColor(node: CodeNode): string {
  const risk = node.riskScore ?? 0;
  if (risk >= 60) return "var(--rk-bad, #e06c75)";
  if (risk >= 30) return "var(--rk-warn, #d19a66)";
  return "var(--rk-ok, #98c379)";
}

export function renderRepoMap(container: HTMLElement, data: RepositoryData, state: AppState): RepoMapHandle {
  const width = 760;
  const height = 420;
  let layout: "icicle" | "treemap" = "icicle";
  let metric: "loc" | "riskScore" | "complexity" | "churn" = "loc";

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "rk-repomap-svg");
  const g = svg.append("g");

  function render(): void {
    const root = buildHierarchy(data);
    root.sum((d) => (d.kind === "file" ? Math.max(1, (d as unknown as Record<string, number>)[metric] ?? 0) : 0));

    const laidOut =
      layout === "treemap"
        ? d3.treemap<CodeNode>().size([width, height]).paddingInner(1)(root)
        : d3.partition<CodeNode>().size([width, height])(root);

    const visibleNodes = laidOut
      .descendants()
      .filter((d): d is d3.HierarchyRectangularNode<CodeNode> => d.depth > 0 && matchesFilters(d.data, state.filters));

    const cells = g
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<CodeNode>>("g.rk-cell")
      .data(visibleNodes, (d) => d.data.id);
    cells.exit().remove();

    const entered = cells.enter().append("g").attr("class", "rk-cell");
    entered.append("rect");
    entered.append("title");

    const merged = entered.merge(cells);
    merged.attr("transform", (d) => `translate(${d.x0},${d.y0})`);
    merged
      .select("rect")
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0))
      .style("fill", (d) => riskColor(d.data))
      .style("stroke", "var(--rk-deep, #1e1e2e)")
      .on("click", (_event, d) => state.select(d.data.id));
    merged.select("title").text((d) => `${d.data.relativePath} (${metric}: ${d.value ?? 0})`);
  }

  render();
  state.subscribe(render);

  return {
    setLayout(next) {
      layout = next;
      render();
    },
    setMetric(next) {
      metric = next;
      render();
    },
  };
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/repoMap.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/report/repoMap.ts repo-architecture-analyzer/tests/report/repoMap.test.ts
git commit -m "$(cat <<'EOF'
Add repo map view: icicle/treemap toggle, metric selector, filters

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 16: Dependency matrix view

v1 scope note: file-level granularity only (folder/package/class-level toggles are v2, alongside topological/SCC/community reordering — v1 offers hierarchy-alphabetical and fan-in-descending order only). Renders a full dense N×N grid; large-repo aggregation is out of scope for v1 (spec §13).

**Files:**
- Create: `repo-architecture-analyzer/src/report/depMatrix.ts`
- Test: `repo-architecture-analyzer/tests/report/depMatrix.test.ts`

**Interfaces:**
- Consumes: `RepositoryData`, `CodeNode`, `CodeEdge` (Task 1), `AppState`, `matchesFilters` (Task 14).
- Produces: `renderDepMatrix(container: HTMLElement, data: RepositoryData, state: AppState): { setEdgeType(type: "import" | "co-change"): void; setOrder(order: "hierarchy" | "fanIn"): void }`. Task 18's template wires the two setters to a dependency-type dropdown and a reorder control.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/report/depMatrix.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderDepMatrix } from "../../src/report/depMatrix";
import { AppState } from "../../src/report/state";
import type { RepositoryData } from "../../src/shared/types";

function sampleData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "r", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 2, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 2, sourceFiles: 2, testFiles: 0, entities: 0, linesOfCode: 0, dependencyEdges: 1, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [
      { id: "file:a.ts", name: "a.ts", relativePath: "a.ts", kind: "file" },
      { id: "file:b.ts", name: "b.ts", relativePath: "b.ts", kind: "file" },
    ],
    edges: [{ id: "e1", source: "file:a.ts", target: "file:b.ts", type: "import", weight: 3 }],
    cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

describe("renderDepMatrix", () => {
  it("renders one cell per row/col pair (n^2 for n visible files)", () => {
    const container = document.createElement("div");
    renderDepMatrix(container, sampleData(), new AppState());
    expect(container.querySelectorAll("rect.rk-matrix-cell").length).toBe(4);
  });

  it("renders one row label per visible file", () => {
    const container = document.createElement("div");
    renderDepMatrix(container, sampleData(), new AppState());
    expect(container.querySelectorAll("text.rk-matrix-row-label").length).toBe(2);
  });

  it("clicking a cell selects the row's node id", () => {
    const container = document.createElement("div");
    const state = new AppState();
    renderDepMatrix(container, sampleData(), state);
    const cell = container.querySelector("rect.rk-matrix-cell") as SVGRectElement;
    cell.dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).not.toBeNull();
  });

  it("switching edge type re-renders without throwing", () => {
    const container = document.createElement("div");
    const handle = renderDepMatrix(container, sampleData(), new AppState());
    expect(() => handle.setEdgeType("co-change")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/depMatrix.test.ts`
Expected: FAIL — `src/report/depMatrix.ts` does not exist.

- [ ] **Step 3: Implement `depMatrix.ts`**

`repo-architecture-analyzer/src/report/depMatrix.ts`:

```ts
import * as d3 from "d3";
import type { RepositoryData, CodeNode, CodeEdge } from "../shared/types";
import { AppState, matchesFilters } from "./state";

export interface DepMatrixHandle {
  setEdgeType(type: "import" | "co-change"): void;
  setOrder(order: "hierarchy" | "fanIn"): void;
}

interface Cell {
  row: CodeNode;
  col: CodeNode;
  edge?: CodeEdge;
}

export function renderDepMatrix(container: HTMLElement, data: RepositoryData, state: AppState): DepMatrixHandle {
  const cellSize = 18;
  let edgeType: "import" | "co-change" = "import";
  let order: "hierarchy" | "fanIn" = "hierarchy";

  const svg = d3.select(container).append("svg").attr("class", "rk-matrix-svg");
  const g = svg.append("g").attr("transform", "translate(120,120)");

  function render(): void {
    const fileNodes = data.nodes.filter((n) => n.kind === "file" && matchesFilters(n, state.filters));
    const sorted = [...fileNodes].sort((a, b) =>
      order === "fanIn" ? (b.fanIn ?? 0) - (a.fanIn ?? 0) : a.relativePath.localeCompare(b.relativePath)
    );
    const indexById = new Map(sorted.map((n, i) => [n.id, i]));

    const relevantEdges = data.edges.filter(
      (e) => e.type === edgeType && indexById.has(e.source) && indexById.has(e.target)
    );

    svg.attr("viewBox", `0 0 ${sorted.length * cellSize + 140} ${sorted.length * cellSize + 140}`);

    const maxWeight = Math.max(1, ...relevantEdges.map((e) => e.weight));
    const color = d3
      .scaleLinear<string>()
      .domain([0, maxWeight])
      .range(["var(--rk-surface, #2a2a3a)", "var(--rk-bad, #e06c75)"]);

    const cellData: Cell[] = [];
    for (const row of sorted) {
      for (const col of sorted) {
        cellData.push({ row, col, edge: relevantEdges.find((e) => e.source === row.id && e.target === col.id) });
      }
    }

    const cells = g
      .selectAll<SVGRectElement, Cell>("rect.rk-matrix-cell")
      .data(cellData, (d) => `${d.row.id}->${d.col.id}`);
    cells.exit().remove();

    const mergedCells = cells.enter().append("rect").attr("class", "rk-matrix-cell").merge(cells);
    mergedCells
      .attr("x", (d) => (indexById.get(d.col.id) ?? 0) * cellSize)
      .attr("y", (d) => (indexById.get(d.row.id) ?? 0) * cellSize)
      .attr("width", cellSize - 1)
      .attr("height", cellSize - 1)
      .style("fill", (d) => (d.edge ? color(d.edge.weight) : "var(--rk-deep, #1e1e2e)"))
      .classed("rk-matrix-cell--violation", (d) => Boolean(d.edge?.isArchitectureViolation))
      .on("click", (_event, d) => state.select(d.row.id));

    const labels = g.selectAll<SVGTextElement, CodeNode>("text.rk-matrix-row-label").data(sorted, (d) => d.id);
    labels.exit().remove();
    const mergedLabels = labels.enter().append("text").attr("class", "rk-matrix-row-label").merge(labels);
    mergedLabels
      .attr("x", -4)
      .attr("y", (d) => (indexById.get(d.id) ?? 0) * cellSize + cellSize * 0.75)
      .attr("text-anchor", "end")
      .text((d) => d.name);
  }

  render();
  state.subscribe(render);

  return {
    setEdgeType(next) {
      edgeType = next;
      render();
    },
    setOrder(next) {
      order = next;
      render();
    },
  };
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/depMatrix.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/report/depMatrix.ts repo-architecture-analyzer/tests/report/depMatrix.test.ts
git commit -m "$(cat <<'EOF'
Add dependency matrix view: file-level grid, reorder, edge-type toggle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 17: Hotspot view (churn × complexity bubble chart)

**Files:**
- Create: `repo-architecture-analyzer/src/report/hotspots.ts`
- Test: `repo-architecture-analyzer/tests/report/hotspots.test.ts`

**Interfaces:**
- Consumes: `RepositoryData`, `CodeNode` (Task 1), `AppState`, `matchesFilters` (Task 14).
- Produces: `renderHotspots(container: HTMLElement, data: RepositoryData, state: AppState): { setLogScale(enabled: boolean): void }`. Task 18's template wires the setter to a log-scale toggle checkbox.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/report/hotspots.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHotspots } from "../../src/report/hotspots";
import { AppState } from "../../src/report/state";
import type { RepositoryData } from "../../src/shared/types";

function sampleData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "r", languages: ["typescript"],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 3, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 3, sourceFiles: 3, testFiles: 0, entities: 0, linesOfCode: 0, dependencyEdges: 0, cycles: 0, architectureViolations: 0, hotspots: 1 },
    nodes: [
      { id: "file:a.ts", name: "a.ts", relativePath: "a.ts", kind: "file", churn: 100, complexity: 20, fanIn: 4, riskScore: 80 },
      { id: "file:b.ts", name: "b.ts", relativePath: "b.ts", kind: "file", churn: 5, complexity: 2, fanIn: 0, riskScore: 5 },
      { id: "file:c.ts", name: "c.ts", relativePath: "c.ts", kind: "file", churn: 30, complexity: 8, fanIn: 1, riskScore: 40 },
    ],
    edges: [], cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

describe("renderHotspots", () => {
  it("renders one bubble per visible file", () => {
    const container = document.createElement("div");
    renderHotspots(container, sampleData(), new AppState());
    expect(container.querySelectorAll("circle.rk-hotspot-bubble").length).toBe(3);
  });

  it("labels the top files by risk score", () => {
    const container = document.createElement("div");
    renderHotspots(container, sampleData(), new AppState());
    const labels = Array.from(container.querySelectorAll("text.rk-hotspot-label")).map((el) => el.textContent);
    expect(labels).toContain("a.ts");
  });

  it("clicking a bubble selects its node id", () => {
    const container = document.createElement("div");
    const state = new AppState();
    renderHotspots(container, sampleData(), state);
    const bubble = container.querySelector("circle.rk-hotspot-bubble") as SVGCircleElement;
    bubble.dispatchEvent(new Event("click", { bubbles: true }));
    expect(state.selectedNodeId).not.toBeNull();
  });

  it("toggling log scale re-renders without throwing", () => {
    const container = document.createElement("div");
    const handle = renderHotspots(container, sampleData(), new AppState());
    expect(() => handle.setLogScale(true)).not.toThrow();
  });

  it("hides bubbles filtered out by shared state", () => {
    const container = document.createElement("div");
    const state = new AppState();
    renderHotspots(container, sampleData(), state);
    state.setFilter("minRisk", 50);
    expect(container.querySelectorAll("circle.rk-hotspot-bubble").length).toBe(1);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/hotspots.test.ts`
Expected: FAIL — `src/report/hotspots.ts` does not exist.

- [ ] **Step 3: Implement `hotspots.ts`**

`repo-architecture-analyzer/src/report/hotspots.ts`:

```ts
import * as d3 from "d3";
import type { RepositoryData, CodeNode } from "../shared/types";
import { AppState, matchesFilters } from "./state";

export interface HotspotsHandle {
  setLogScale(enabled: boolean): void;
}

const TOP_LABEL_COUNT = 5;

function riskColor(node: CodeNode): string {
  const risk = node.riskScore ?? 0;
  if (risk >= 60) return "var(--rk-bad, #e06c75)";
  if (risk >= 30) return "var(--rk-warn, #d19a66)";
  return "var(--rk-ok, #98c379)";
}

export function renderHotspots(container: HTMLElement, data: RepositoryData, state: AppState): HotspotsHandle {
  const width = 720;
  const height = 420;
  const margin = { top: 20, right: 20, bottom: 40, left: 50 };
  let logScale = false;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "rk-hotspots-svg");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  function render(): void {
    const fileNodes = data.nodes.filter((n) => n.kind === "file" && matchesFilters(n, state.filters));

    const churnScale = (logScale ? d3.scaleLog() : d3.scaleLinear())
      .domain([1, Math.max(2, d3.max(fileNodes, (n) => n.churn ?? 0) ?? 1)])
      .range([0, innerWidth])
      .clamp(true);
    const complexityScale = (logScale ? d3.scaleLog() : d3.scaleLinear())
      .domain([1, Math.max(2, d3.max(fileNodes, (n) => n.complexity ?? 0) ?? 1)])
      .range([innerHeight, 0])
      .clamp(true);
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, Math.max(1, d3.max(fileNodes, (n) => n.fanIn ?? 0) ?? 1)])
      .range([4, 20]);

    const bubbles = g.selectAll<SVGCircleElement, CodeNode>("circle.rk-hotspot-bubble").data(fileNodes, (d) => d.id);
    bubbles.exit().remove();

    const mergedBubbles = bubbles.enter().append("circle").attr("class", "rk-hotspot-bubble").merge(bubbles);
    mergedBubbles
      .attr("cx", (d) => churnScale(Math.max(1, d.churn ?? 0)))
      .attr("cy", (d) => complexityScale(Math.max(1, d.complexity ?? 0)))
      .attr("r", (d) => radiusScale(d.fanIn ?? 0))
      .style("fill", (d) => riskColor(d))
      .style("opacity", 0.85)
      .on("click", (_event, d) => state.select(d.id));

    const topByRisk = [...fileNodes].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, TOP_LABEL_COUNT);

    const labels = g.selectAll<SVGTextElement, CodeNode>("text.rk-hotspot-label").data(topByRisk, (d) => d.id);
    labels.exit().remove();
    const mergedLabels = labels.enter().append("text").attr("class", "rk-hotspot-label").merge(labels);
    mergedLabels
      .attr("x", (d) => churnScale(Math.max(1, d.churn ?? 0)) + radiusScale(d.fanIn ?? 0) + 4)
      .attr("y", (d) => complexityScale(Math.max(1, d.complexity ?? 0)))
      .text((d) => d.name);
  }

  render();
  state.subscribe(render);

  return {
    setLogScale(enabled) {
      logScale = enabled;
      render();
    },
  };
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/hotspots.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/src/report/hotspots.ts repo-architecture-analyzer/tests/report/hotspots.test.ts
git commit -m "$(cat <<'EOF'
Add hotspot view: churn x complexity bubble chart

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 18: Browser bootstrap, HTML template, and the `report-runtime.js` build

**Files:**
- Create: `repo-architecture-analyzer/src/report/main.ts`
- Create: `repo-architecture-analyzer/src/report/template.ts`
- Create: `repo-architecture-analyzer/bin/report-runtime.js` (generated, not hand-written — see Step 4)
- Test: `repo-architecture-analyzer/tests/report/template.test.ts`

**Interfaces:**
- Consumes: `AppState` (Task 14), `renderRepoMap` (Task 15), `renderDepMatrix` (Task 16), `renderHotspots` (Task 17), `RepositoryData` (Task 1).
- Produces: `bootstrapReport(): void` (`main.ts`, the sole entry point esbuild bundles into `bin/report-runtime.js`; not unit-tested directly — Task 20's jsdom smoke test exercises it end-to-end since it's pure wiring over already-tested pieces), `buildReportHtml(data: RepositoryData, options: { reportRuntimeJs: string }): string` (`template.ts`). Task 19's CLI reads `bin/report-runtime.js` off disk once (relative to its own `import.meta.url`, one directory hop from `src/cli.ts` to `bin/` — a path that resolves identically before and after bundling, since `src/` and `bin/` are both one level below the package root) and passes its contents into `buildReportHtml`.

- [ ] **Step 1: Write `main.ts`, the browser bootstrap**

`repo-architecture-analyzer/src/report/main.ts`:

```ts
import type { RepositoryData } from "../shared/types";
import { AppState } from "./state";
import { renderRepoMap } from "./repoMap";
import { renderDepMatrix } from "./depMatrix";
import { renderHotspots } from "./hotspots";

declare global {
  interface Window {
    __REPO_ARCH_DATA__?: RepositoryData;
  }
}

function renderInspector(container: HTMLElement, data: RepositoryData, nodeId: string | null): void {
  const node = nodeId ? data.nodes.find((n) => n.id === nodeId) : undefined;
  if (!node) {
    container.textContent = "Select a file or symbol to see details.";
    return;
  }
  const incoming = data.edges.filter((e) => e.target === nodeId).length;
  const outgoing = data.edges.filter((e) => e.source === nodeId).length;
  container.innerHTML = "";
  const rows: Array<[string, string]> = [
    ["Path", node.relativePath],
    ["Kind", node.kind],
    ["Language", node.language ?? "—"],
    ["Risk score", String(node.riskScore ?? "—")],
    ["Complexity", String(node.complexity ?? "—")],
    ["Churn", String(node.churn ?? "—")],
    ["Fan-in / Fan-out", `${incoming} / ${outgoing}`],
    ["Cycle membership", node.cycleCount ? `${node.cycleCount} cycle(s)` : "none"],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "rk-inspector__row";
    row.innerHTML = `<span class="rk-inspector__label">${label}</span><span class="rk-inspector__value">${value}</span>`;
    container.appendChild(row);
  }
}

function bindControl(id: string, event: string, handler: (el: HTMLInputElement) => void): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener(event, () => handler(el));
}

export function bootstrapReport(): void {
  const data = window.__REPO_ARCH_DATA__;
  if (!data) return;

  const state = new AppState();

  const mapContainer = document.getElementById("rk-repo-map");
  const matrixContainer = document.getElementById("rk-dep-matrix");
  const hotspotsContainer = document.getElementById("rk-hotspots");
  const inspectorContainer = document.getElementById("rk-inspector");

  const mapHandle = mapContainer ? renderRepoMap(mapContainer, data, state) : null;
  const matrixHandle = matrixContainer ? renderDepMatrix(matrixContainer, data, state) : null;
  const hotspotsHandle = hotspotsContainer ? renderHotspots(hotspotsContainer, data, state) : null;

  if (inspectorContainer) {
    renderInspector(inspectorContainer, data, state.selectedNodeId);
    state.subscribe(() => renderInspector(inspectorContainer, data, state.selectedNodeId));
  }

  bindControl("rk-search", "input", (el) => state.setFilter("search", el.value));
  bindControl("rk-show-tests", "change", (el) => state.setFilter("showTests", el.checked));
  bindControl("rk-min-risk", "input", (el) => state.setFilter("minRisk", Number(el.value) || 0));
  bindControl("rk-reset", "click", () => state.reset());
  bindControl("rk-layout-toggle", "change", (el) => mapHandle?.setLayout(el.value as "icicle" | "treemap"));
  bindControl("rk-metric-select", "change", (el) =>
    mapHandle?.setMetric(el.value as "loc" | "riskScore" | "complexity" | "churn")
  );
  bindControl("rk-edge-type-select", "change", (el) => matrixHandle?.setEdgeType(el.value as "import" | "co-change"));
  bindControl("rk-order-select", "change", (el) => matrixHandle?.setOrder(el.value as "hierarchy" | "fanIn"));
  bindControl("rk-logscale-checkbox", "change", (el) => hotspotsHandle?.setLogScale(el.checked));
}

bootstrapReport();
```

- [ ] **Step 2: Write the failing tests for `template.ts`**

`repo-architecture-analyzer/tests/report/template.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildReportHtml } from "../../src/report/template";
import type { RepositoryData } from "../../src/shared/types";

function minimalData(): RepositoryData {
  return {
    metadata: {
      schemaVersion: "1.0.0", generatedAt: "now", repositoryName: "My Repo", languages: [],
      analyzerVersion: "0.1.0", configurationHash: "x",
      parserCoverage: { full: 0, partial: 0, skipped: 0, failed: 0 },
    },
    summary: { files: 0, sourceFiles: 0, testFiles: 0, entities: 0, linesOfCode: 0, dependencyEdges: 0, cycles: 0, architectureViolations: 0, hotspots: 0 },
    nodes: [], edges: [], cycles: [], communities: [], unresolvedDependencies: [], architectureRules: [], warnings: [],
  };
}

describe("buildReportHtml", () => {
  it("embeds the dataset as a global assignment", () => {
    const html = buildReportHtml(minimalData(), { reportRuntimeJs: "" });
    expect(html).toContain("window.__REPO_ARCH_DATA__ =");
    expect(html).toContain('"repositoryName":"My Repo"');
  });

  it("inlines the provided report runtime JS verbatim", () => {
    const html = buildReportHtml(minimalData(), { reportRuntimeJs: "console.log('marker-xyz');" });
    expect(html).toContain("marker-xyz");
  });

  it("escapes HTML-unsafe characters in the repository name", () => {
    const data = minimalData();
    data.metadata.repositoryName = "<script>evil()</script>";
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the three view containers and the shared controls", () => {
    const html = buildReportHtml(minimalData(), { reportRuntimeJs: "" });
    for (const id of ["rk-repo-map", "rk-dep-matrix", "rk-hotspots", "rk-inspector", "rk-search", "rk-reset"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("prevents a </script> sequence inside embedded data from breaking out of the data script tag", () => {
    const data = minimalData();
    data.metadata.repositoryName = "</script><script>evil()</script>";
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html).not.toContain("</script><script>evil()</script>");
  });
});
```

- [ ] **Step 3: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/template.test.ts`
Expected: FAIL — `src/report/template.ts` does not exist.

- [ ] **Step 4: Implement `template.ts`**

`repo-architecture-analyzer/src/report/template.ts`:

```ts
import type { RepositoryData } from "../shared/types";

export interface BuildReportHtmlOptions {
  reportRuntimeJs: string;
}

const REPORT_CSS = `
:root { --rk-bg:#1e1e2e; --rk-deep:#181825; --rk-surface:#313244; --rk-text:#cdd6f4; --rk-dim:#a6adc8; --rk-accent:#89b4fa; --rk-ok:#a6e3a1; --rk-warn:#f9e2af; --rk-bad:#f38ba8; }
* { box-sizing: border-box; }
body { margin:0; background:var(--rk-bg); color:var(--rk-text); font-family: ui-sans-serif, system-ui, sans-serif; }
header.rk-topbar { padding:12px 20px; background:var(--rk-deep); display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
header.rk-topbar h1 { font-size:16px; margin:0; }
main { padding:20px; display:grid; gap:24px; }
section.rk-view { background:var(--rk-surface); border-radius:8px; padding:16px; overflow-x:auto; }
section.rk-view h2 { margin-top:0; font-size:14px; text-transform:uppercase; letter-spacing:0.04em; color:var(--rk-dim); }
.rk-controls { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:12px; font-size:13px; }
#rk-inspector { background:var(--rk-deep); border-radius:8px; padding:12px; font-size:13px; }
.rk-inspector__row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--rk-surface); }
.rk-matrix-cell--violation { stroke: var(--rk-bad); stroke-width: 2px; }
`;

function escapeHtml(value: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (char) => map[char]);
}

export function buildReportHtml(data: RepositoryData, options: BuildReportHtmlOptions): string {
  const payload = JSON.stringify(data).replace(/</g, "\\u003c");
  const name = escapeHtml(data.metadata.repositoryName);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${name} — Architecture Report</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${REPORT_CSS}</style>
</head>
<body>
<header class="rk-topbar">
  <h1>${name}</h1>
  <span>${escapeHtml(data.metadata.gitBranch ?? "")}</span>
  <input id="rk-search" type="search" placeholder="Search files, classes, functions..." />
  <label><input id="rk-show-tests" type="checkbox" checked /> show tests</label>
  <label>min risk <input id="rk-min-risk" type="range" min="0" max="100" value="0" /></label>
  <button id="rk-reset" type="button">Reset</button>
</header>
<main>
  <section class="rk-view">
    <h2>Repo map</h2>
    <div class="rk-controls">
      <select id="rk-layout-toggle"><option value="icicle">Icicle</option><option value="treemap">Treemap</option></select>
      <select id="rk-metric-select">
        <option value="loc">Lines of code</option>
        <option value="riskScore">Risk score</option>
        <option value="complexity">Complexity</option>
        <option value="churn">Churn</option>
      </select>
    </div>
    <div id="rk-repo-map"></div>
  </section>
  <section class="rk-view">
    <h2>Dependency matrix</h2>
    <div class="rk-controls">
      <select id="rk-edge-type-select"><option value="import">Imports</option><option value="co-change">Co-change</option></select>
      <select id="rk-order-select"><option value="hierarchy">Hierarchy</option><option value="fanIn">Fan-in</option></select>
    </div>
    <div id="rk-dep-matrix"></div>
  </section>
  <section class="rk-view">
    <h2>Hotspots</h2>
    <div class="rk-controls">
      <label><input id="rk-logscale-checkbox" type="checkbox" /> log scale</label>
    </div>
    <div id="rk-hotspots"></div>
  </section>
  <section class="rk-view">
    <h2>Selected entity</h2>
    <div id="rk-inspector">Select a file or symbol to see details.</div>
  </section>
</main>
<script>window.__REPO_ARCH_DATA__ = ${payload};</script>
<script>${options.reportRuntimeJs}</script>
</body>
</html>`;
}
```

- [ ] **Step 5: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/template.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Build the report runtime bundle**

Run: `cd repo-architecture-analyzer && npm run build:report`
Expected: creates `bin/report-runtime.js`. Verify it's non-trivial and self-contained:

Run: `node -e "const s=require('fs').readFileSync('repo-architecture-analyzer/bin/report-runtime.js','utf8'); if (s.length < 1000) throw new Error('unexpectedly small bundle'); console.log('ok', s.length, 'bytes')"`
Expected: prints `ok <size> bytes` with `<size>` in the tens of thousands (D3 alone is a substantial chunk of that).

- [ ] **Step 7: Commit**

```bash
git add repo-architecture-analyzer/src/report/main.ts repo-architecture-analyzer/src/report/template.ts repo-architecture-analyzer/tests/report/template.test.ts repo-architecture-analyzer/bin/report-runtime.js
git commit -m "$(cat <<'EOF'
Add browser bootstrap, HTML template, and build the report-runtime.js bundle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 19: CLI entry point

**Files:**
- Create: `repo-architecture-analyzer/src/cli.ts`
- Test: `repo-architecture-analyzer/tests/cli.test.ts`

**Interfaces:**
- Consumes: `loadConfig`/`mergeConfig` (Task 2), `runAnalysis` (Task 13), `buildReportHtml` (Task 18).
- Produces: `parseArgs(argv: string[]): CliArgs`, `main(argv?: string[]): void`. This is the file `npm run build:cli` (Task 1's script) bundles into `bin/analyze.js` — the CLI's only runtime entry point.

- [ ] **Step 1: Write the failing tests**

`repo-architecture-analyzer/tests/cli.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, main } from "../src/cli";

const FIXTURE_ROOT = fileURLToPath(new URL("../examples/fixture-repo", import.meta.url));

describe("parseArgs", () => {
  it("parses repo, out, and boolean flags", () => {
    const args = parseArgs(["--repo", "/tmp/x", "--out", "/tmp/y.html", "--no-cache", "--force"]);
    expect(args.repo).toBe(path.resolve("/tmp/x"));
    expect(args.out).toBe("/tmp/y.html");
    expect(args.noCache).toBe(true);
    expect(args.force).toBe(true);
  });

  it("accumulates repeated --include/--exclude flags", () => {
    const args = parseArgs(["--include", "a/**", "--include", "b/**", "--exclude", "c/**"]);
    expect(args.include).toEqual(["a/**", "b/**"]);
    expect(args.exclude).toEqual(["c/**"]);
  });

  it("throws on an unknown flag", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("main", () => {
  const outputs: string[] = [];
  afterEach(() => {
    for (const f of outputs.splice(0)) fs.rmSync(f, { force: true });
  });

  it("writes a report file and prints a JSON summary to stdout", () => {
    const outPath = path.join(os.tmpdir(), `repo-arch-cli-${Date.now()}.html`);
    outputs.push(outPath);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    main(["--repo", FIXTURE_ROOT, "--out", outPath, "--no-cache"]);

    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.readFileSync(outPath, "utf8")).toContain("window.__REPO_ARCH_DATA__");
    expect(logSpy).toHaveBeenCalled();
    const printed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(printed.outputPath).toBe(outPath);

    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/cli.test.ts`
Expected: FAIL — `src/cli.ts` does not exist.

- [ ] **Step 3: Implement `cli.ts`**

`repo-architecture-analyzer/src/cli.ts`:

```ts
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
```

The `isMainModule` guard is what keeps `import { main } from "../src/cli"` side-effect-free in tests, while still auto-running when `node bin/analyze.js ...` is invoked directly — `src/` and `bin/` sit at the same depth below the package root, so `import.meta.url` (real in dev, esbuild-shimmed after bundling to CJS) and the `../bin/report-runtime.js` lookup both resolve correctly in either form.

- [ ] **Step 4: Run and verify it passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/cli.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite**

Run: `cd repo-architecture-analyzer && npm test`
Expected: PASS — every test file from Tasks 1–19.

- [ ] **Step 6: Commit**

```bash
git add repo-architecture-analyzer/src/cli.ts repo-architecture-analyzer/tests/cli.test.ts
git commit -m "$(cat <<'EOF'
Add CLI entry point: flag parsing, config merge, report writing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 20: Bundle `bin/analyze.js`, verify it runs standalone, and the full-report jsdom smoke test

This is the task that proves the whole "end users need only Node.js" constraint (spec §11) end to end: bundle the CLI, run the *bundled* artifact (not the TS source) against the fixture repo with `node_modules` temporarily hidden, then load the report it produces into `jsdom` and check it's alive.

**Files:**
- Create: `repo-architecture-analyzer/bin/analyze.js` (generated, not hand-written — see Step 3)
- Test: `repo-architecture-analyzer/tests/reportSmoke.test.ts`

**Interfaces:**
- Consumes: the built `bin/analyze.js` (Task 19's `main()`, bundled) and `bin/report-runtime.js` (Task 18) as black boxes — this task spawns them as a real subprocess and loads real output, it does not import any TS source.

- [ ] **Step 1: Write the failing smoke test**

`repo-architecture-analyzer/tests/reportSmoke.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE_ROOT = path.join(PACKAGE_ROOT, "examples", "fixture-repo");
const CLI_PATH = path.join(PACKAGE_ROOT, "bin", "analyze.js");

describe("bin/analyze.js — standalone bundle", () => {
  const outPath = path.join(os.tmpdir(), `repo-arch-smoke-${Date.now()}.html`);

  afterAll(() => {
    fs.rmSync(outPath, { force: true });
  });

  it("runs as a plain node script against the fixture repo and writes a report", () => {
    const stdout = execFileSync("node", [CLI_PATH, "--repo", FIXTURE_ROOT, "--out", outPath, "--no-cache"], {
      encoding: "utf8",
    });
    const summary = JSON.parse(stdout);
    expect(summary.outputPath).toBe(outPath);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it("produces a report with the embedded dataset, all three view containers, and no script errors on load", () => {
    const html = fs.readFileSync(outPath, "utf8");
    expect(html).toContain("window.__REPO_ARCH_DATA__");

    const errors: unknown[] = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (err) => errors.push(err));

    const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", virtualConsole });

    expect(dom.window.document.getElementById("rk-repo-map")?.querySelector("svg")).toBeTruthy();
    expect(dom.window.document.getElementById("rk-dep-matrix")?.querySelector("svg")).toBeTruthy();
    expect(dom.window.document.getElementById("rk-hotspots")?.querySelector("svg")).toBeTruthy();
    expect(dom.window.document.getElementById("rk-search")).toBeTruthy();
    expect(errors).toEqual([]);

    dom.window.close();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd repo-architecture-analyzer && npx vitest run tests/reportSmoke.test.ts`
Expected: FAIL — `bin/analyze.js` does not exist yet.

- [ ] **Step 3: Build the CLI bundle**

Run: `cd repo-architecture-analyzer && npm run build:cli`
Expected: creates `bin/analyze.js`.

- [ ] **Step 4: Run and verify the smoke test passes**

Run: `cd repo-architecture-analyzer && npx vitest run tests/reportSmoke.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Verify the bundle truly needs no `node_modules` at runtime**

Run:

```bash
cd repo-architecture-analyzer
mv node_modules node_modules.bak
node bin/analyze.js --repo examples/fixture-repo --out /tmp/repo-arch-standalone-check.html --no-cache; STATUS=$?
mv node_modules.bak node_modules
rm -f /tmp/repo-arch-standalone-check.html
exit $STATUS
```

Expected: exit code `0` and the same JSON summary printed as in Step 4 — proving `bin/analyze.js` and `bin/report-runtime.js` are genuinely self-contained. The `mv` back runs unconditionally (sequential `;`, not `&&`) so `node_modules` is restored even if the check fails.

- [ ] **Step 6: Run the complete test suite one final time**

Run: `cd repo-architecture-analyzer && npm test`
Expected: PASS — all tests from Tasks 1–20.

- [ ] **Step 7: Commit**

```bash
git add repo-architecture-analyzer/bin/analyze.js repo-architecture-analyzer/tests/reportSmoke.test.ts
git commit -m "$(cat <<'EOF'
Bundle bin/analyze.js and add a full-report jsdom smoke test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 21: `SKILL.md`, `HANDOFF.md`, `README.md`

Documentation only — no source changes. Mirrors the three-file pattern `rick-explain-diff-html` already uses in this repo, adapted for the fact that this skill has no Claude-authored payload step (see spec §3).

**Files:**
- Create: `repo-architecture-analyzer/SKILL.md`
- Create: `repo-architecture-analyzer/HANDOFF.md`
- Create: `repo-architecture-analyzer/README.md`

- [ ] **Step 1: Write `SKILL.md`**

`repo-architecture-analyzer/SKILL.md`:

```markdown
# repo-architecture-analyzer

Analyzes a repository's structure, dependencies, static metrics, and Git
history, and renders a single self-contained interactive HTML report
(D3.js): what's big, what depends on what, and what's risky.

**Authoritative spec:** `docs/superpowers/specs/2026-08-20-repo-architecture-analyzer-design.md`
in the source repo has the full design rationale; this file is the
operational contract for running the skill.

## Trigger phrases

`/repo-architecture-analyzer [path] [options]`, or natural language:
"analyze this repo's architecture", "show me the dependency structure",
"find architecture hotspots". Defaults to the current repo when no path
is given.

## How this skill works (read this before anything else)

Unlike most Claude Code skills, there is **no Claude-authored payload
step** here. The entire analysis — filesystem walk, git history, TS/JS
AST parsing via `ts-morph`, a custom Python structural parser, dependency
graph, cycle detection, complexity/risk scoring, and the D3 report itself
— is a single pre-built, dependency-free Node.js script
(`bin/analyze.js` + `bin/report-runtime.js`). Claude's job is:

1. Run the bundled tool.
2. Read back the small JSON summary it prints to stdout.
3. Give the user a short chat digest (top hotspots, cycle count, parser
   coverage, warning count) — do not re-derive or restate the full
   graph; the report itself is the detailed view.

## Running it

```bash
node <skill-dir>/bin/analyze.js --repo <path> [--out <path>] [--config <path>] \
  [--include <glob>]... [--exclude <glob>]... \
  [--max-git-commits <n>] [--git-since <date-or-duration>] \
  [--no-cache] [--force] [--verbose]
```

- `--repo` defaults to the current working directory.
- `--out` defaults to `/tmp/YYYY-MM-DD-repo-architecture-<repo-slug>.html`.
- Nothing is ever written into the target repo.
- Requires only Node.js (`>=18`) on PATH — no `npm install`, no Python
  interpreter, no native binaries.

## Reading the summary

`main()` prints a JSON object to stdout:

```json
{
  "outputPath": "/tmp/2026-08-20-repo-architecture-my-repo.html",
  "files": 128,
  "entities": 340,
  "linesOfCode": 18422,
  "cycles": 2,
  "hotspots": 6,
  "architectureViolations": 0,
  "warnings": 1,
  "parserCoverage": { "full": 110, "partial": 0, "skipped": 18, "failed": 0 }
}
```

Use these numbers for the chat digest. If `warnings > 0`, re-run with
`--verbose` (warnings print to stderr) before telling the user anything
is wrong — most warnings are informational (e.g. "no git history").

## Language support (v1)

- **Fully parsed:** TypeScript, JavaScript (`ts-morph`), Python (custom
  structural parser — indentation-based, not a full `ast`-equivalent).
- **Everything else:** appears in the file tree and git-history metrics
  only. `metadata.parserCoverage.skipped` counts these files honestly —
  never claim full coverage for a repo with a lot of `skipped`.

## Report contents (v1)

Three coordinated D3 views: **repo map** (icicle/treemap by folder →
file), **dependency matrix** (file-level import/co-change grid), and
**hotspots** (churn × complexity bubble chart). Shared search/filter
controls and a click-to-inspect panel tie all three together. Edge
bundling, the architectural-tension view, and snapshot/history
comparison are **not built** — v2 backlog, not missing features to
apologize for.

## Common pitfalls

- Don't try to author a payload JSON for this skill — there isn't one.
- Don't claim `hotspots`/`cycles`/`architectureViolations` numbers mean
  something is broken — they're heuristics; frame findings as
  observations, matching the report's own "heuristic, not a quality
  judgment" framing.
- Don't run this against a repo path you haven't confirmed exists —
  `runAnalysis` throws if `--repo` isn't readable.
- Don't suggest `--snapshot`/`--compare-with` — those flags don't exist
  in v1 (see the design spec's v2 backlog).
```

- [ ] **Step 2: Write `HANDOFF.md`**

`repo-architecture-analyzer/HANDOFF.md`:

```markdown
# `repo-architecture-analyzer` — Agent Handoff Brief

Short, self-contained brief for a Claude (or other agent) session
picking this skill up cold.

**Repo:** `github.com/klapen/klapen-ai-skills`
**Path:** `repo-architecture-analyzer/`
**Authoritative spec:** [`SKILL.md`](SKILL.md) for operating the skill;
[`docs/superpowers/specs/2026-08-20-repo-architecture-analyzer-design.md`](../docs/superpowers/specs/2026-08-20-repo-architecture-analyzer-design.md)
for design rationale and the v2 backlog.

## Purpose

Generates a single self-contained interactive HTML report analyzing a
repository's architecture: structure, dependencies, static metrics
(complexity, coupling, cycles), git history (churn, contributors,
co-change), and a heuristic risk score — rendered as 3 coordinated D3
views (repo map, dependency matrix, hotspots).

## Design goal (non-negotiable)

Everything the report needs is computed by deterministic, pre-built
code, not by Claude. Claude runs `bin/analyze.js`, reads back a small
JSON summary, and relays it — see SKILL.md's "How this skill works"
section for why this skill has no payload-authoring step, unlike
`rick-explain-diff-html`.

## File layout

```
repo-architecture-analyzer/
├── SKILL.md / HANDOFF.md / README.md
├── bin/
│   ├── analyze.js          # CLI entry point — the only thing end users run
│   └── report-runtime.js   # browser-side D3 report, inlined into every output HTML
├── config/repo-architecture.default.config.json
├── schema/repository-data.schema.json
├── src/                    # TypeScript source (maintainers only — see README.md)
├── tests/
└── examples/
    ├── fixture-repo/        # tiny synthetic TS+Python repo used by the test suite
    └── example-report.html  # generated by running the finished tool against this repo
```

## Common pitfalls

- Don't edit `bin/analyze.js` or `bin/report-runtime.js` directly —
  they're `esbuild` outputs. Edit `src/`, then `npm run build`.
- Don't add a language parser without updating the
  `metadata.parserCoverage` bookkeeping in `src/pipeline.ts` — coverage
  numbers must stay honest.
- Don't build the v2 backlog items (edge bundling, tension view,
  snapshots) without re-reading the design spec's §9 first — they were
  deliberately deferred, not forgotten.
- Don't skip `--no-cache` when writing a new test that calls
  `runAnalysis` — the default cache path is `~/.cache/...` on the real
  machine, and tests should not depend on or pollute it (see
  `tests/pipeline.test.ts` for the one test that intentionally does,
  and cleans up after itself).

---

*This brief is a summary. When in doubt, read [`SKILL.md`](SKILL.md) and
the design spec — they're the source of truth.*
```

- [ ] **Step 3: Write `README.md`**

`repo-architecture-analyzer/README.md`:

```markdown
# repo-architecture-analyzer — development

This file is for people building or modifying this skill. End users of
the skill never need anything in here — `bin/analyze.js` and
`bin/report-runtime.js` are committed, pre-built artifacts; running the
skill only ever needs Node.js on PATH.

## Setup

```bash
cd repo-architecture-analyzer
npm install
```

## Build

```bash
npm run build          # builds both bundles
npm run build:report   # browser-side D3 report only -> bin/report-runtime.js
npm run build:cli      # Node CLI only -> bin/analyze.js
```

Rebuild and commit both `bin/*.js` files after any change under `src/`.

## Test

```bash
npm test
```

## Regenerate the example report

```bash
npm run build
node bin/analyze.js --repo ../.. --out examples/example-report.html --no-cache
```

(Points `--repo` at the whole `klapen-ai-skills` checkout — a real repo
with real git history, so the example demonstrates non-trivial churn and
hotspot data instead of the intentionally tiny `examples/fixture-repo/`.)

## Architecture

See `docs/superpowers/specs/2026-08-20-repo-architecture-analyzer-design.md`
in the repo root for the full design rationale, and `SKILL.md` for the
operational contract Claude follows when invoking this skill.
```

- [ ] **Step 4: Sanity-check the docs reference real files**

Run:

```bash
cd repo-architecture-analyzer
grep -q "bin/analyze.js" SKILL.md HANDOFF.md README.md && \
grep -q "no Claude-authored payload" SKILL.md HANDOFF.md && \
test -f ../docs/superpowers/specs/2026-08-20-repo-architecture-analyzer-design.md && \
echo "docs OK"
```

Expected: prints `docs OK`.

- [ ] **Step 5: Commit**

```bash
git add repo-architecture-analyzer/SKILL.md repo-architecture-analyzer/HANDOFF.md repo-architecture-analyzer/README.md
git commit -m "$(cat <<'EOF'
Add SKILL.md, HANDOFF.md, and README.md for repo-architecture-analyzer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

### Task 22: Generate the real example report, dogfood against this repo, wire into the top-level README

The last task. `examples/fixture-repo` (used by the whole test suite) is deliberately tiny and has no git history — this task instead runs the *finished* tool against `klapen-ai-skills` itself (real files, real multi-year git history) to produce a genuinely representative `examples/example-report.html`, and registers the skill in the repo's top-level skill list.

**Files:**
- Create: `repo-architecture-analyzer/examples/example-report.html` (generated — see Step 1)
- Modify: `README.md:1-20` (repo root — skills table and Requirements section)

- [ ] **Step 1: Build and run the tool against the whole `klapen-ai-skills` repo**

```bash
cd repo-architecture-analyzer
npm run build
node bin/analyze.js --repo ../.. --out examples/example-report.html --no-cache --verbose
```

Expected: prints a JSON summary to stdout with `files`/`entities`/`linesOfCode` all greater than zero, `outputPath` ending in `examples/example-report.html`, and `parserCoverage.full` counting the TS (`rick-explain-diff-html/template/core.js` is JS, `render.py` is Python — wait, this repo's language mix is actually Python + JS, no TypeScript yet, until this very skill's own `src/**/*.ts` files land) — the key thing to check is `parserCoverage.full > 0`, not a specific number. Any `[warn]`/`[error]` lines on stderr (from `--verbose`) should be read and judged, not ignored — e.g. a warning about `.git` history depth is expected and fine, a `TypeScript analysis failed` warning is not.

- [ ] **Step 2: Sanity-check the generated report**

Run: `node -e "const s=require('fs').readFileSync('repo-architecture-analyzer/examples/example-report.html','utf8'); if (!s.includes('window.__REPO_ARCH_DATA__')) throw new Error('missing embedded dataset'); console.log('ok', s.length, 'bytes')"`
Expected: prints `ok <size> bytes`.

- [ ] **Step 3: Register the skill in the top-level README**

Read `README.md` (repo root) first. In its skills table, add a row after the `rick-explain-diff-html` row:

```markdown
| [`repo-architecture-analyzer`](repo-architecture-analyzer/) | Analyzes a repository's structure, dependencies, static metrics, and Git history, and renders a self-contained interactive D3 HTML report — repo map, dependency matrix, and hotspots. |
```

In the "Requirements" section, add one bullet noting the second runtime this repo's skills can require (keep the existing `python3` bullet — `rick-explain-diff-html` still needs it):

```markdown
- `Node.js` (`>=18`) on PATH — only for skills that need it (currently `repo-architecture-analyzer`); see each skill's `SKILL.md` for its actual requirements
```

- [ ] **Step 4: Commit**

```bash
git add repo-architecture-analyzer/examples/example-report.html README.md
git commit -m "$(cat <<'EOF'
Generate the real example report and register the skill in the README

Runs the finished repo-architecture-analyzer against klapen-ai-skills
itself (real files, real git history) to produce a representative
examples/example-report.html, and adds the skill to the top-level
README's skills table and Requirements section.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UzGy6LprsbUdFwLogiLxCj
EOF
)"
```

---

This completes the plan. After Task 22, `repo-architecture-analyzer` is a fully working, tested, documented skill: `npm test` passes end to end, `bin/analyze.js` runs standalone with only Node.js on PATH, the generated report is a real self-contained HTML file with three coordinated D3 views, and the top-level README lists it alongside `rick-explain-diff-html`.

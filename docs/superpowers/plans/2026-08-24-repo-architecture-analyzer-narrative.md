# repo-architecture-analyzer Narrative Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, AI-authored narrative walkthrough (summary, key insights, a reading list, and per-view commentary) on top of `repo-architecture-analyzer`'s existing deterministic report, without weakening the engine's determinism guarantee.

**Architecture:** The engine (`src/analyzers/`, `src/graph/`, `src/pipeline.ts`) is untouched. A new optional `narrative?: NarrativeContent` field is added to `RepositoryData`, validated by its own JSON Schema. The CLI gains `--data-out` (dump the full analysis for Claude to read), `--narrative` (attach a Claude-authored `narrative.json`), and `--render-only` (re-render from a saved `data.json` without re-running analysis). `template.ts` renders the narrative into the report via the same `escapeHtml`-based static-HTML approach already used for `repositoryName`/`gitBranch` — no new runtime DOM code needed since narrative text is static, not filter-reactive.

**Tech Stack:** TypeScript, `ajv` (schema validation, already a dependency), `esbuild` (bundling), `vitest` + `jsdom` (testing) — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-repo-architecture-analyzer-narrative-design.md` (builds on `docs/superpowers/specs/2026-08-20-repo-architecture-analyzer-design.md`, the base skill's spec)

## Global Constraints

- No new npm dependencies — narrative schema validation reuses the `ajv` instance pattern already in `src/shared/validate.ts`.
- `data.narrative` absent → the report renders pixel-identical to the base skill's output (no empty placeholders, no "no narrative" filler text).
- All fields in a `narrative.json` file are required once the file exists — no partial/broken narrative states.
- Narrative text is rendered via `escapeHtml()` into static HTML — the same mechanism already used for `data.metadata.repositoryName`/`gitBranch` in `template.ts` — never `innerHTML` with unescaped content.
- `--data-out` and `--narrative` have no default path; both must be passed explicitly (unlike `--out`, which falls back to `/tmp/...`).
- Rebuild `bin/analyze.js` and `bin/report-runtime.js` (`npm run build`) and commit both after any `src/` change that could affect the bundled output — per the existing rule in `README.md`.
- All work happens in `repo-architecture-analyzer/` inside the existing worktree/branch for this skill (confirm branch with the user before starting execution — this skill's base PR is still open).

---

## Task 1: Narrative schema and types

**Files:**
- Modify: `repo-architecture-analyzer/src/shared/types.ts`
- Create: `repo-architecture-analyzer/schema/narrative.schema.json`
- Modify: `repo-architecture-analyzer/schema/repository-data.schema.json`
- Modify: `repo-architecture-analyzer/src/shared/validate.ts`
- Create: `repo-architecture-analyzer/tests/shared/validateNarrative.test.ts`
- Modify: `repo-architecture-analyzer/tests/shared/validate.test.ts`

**Interfaces:**
- Produces: `NarrativeContent` type (`{ summary: string; keyInsights: string[]; readingList: ReadingListItem[]; views: { repoMap: string; depMatrix: string; hotspots: string } }`), `ReadingListItem` type (`{ path: string; reason: string }`), both from `src/shared/types.ts`. `RepositoryData.narrative?: NarrativeContent`. `validateNarrativeContent(data: unknown): ValidationResult` and `assertNarrativeContent(data: unknown): asserts data is NarrativeContent`, both from `src/shared/validate.ts`. All of these are consumed by Task 2 (CLI) and Task 4 (template).

- [ ] **Step 1: Write the failing tests**

Create `repo-architecture-analyzer/tests/shared/validateNarrative.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateNarrativeContent } from "../../src/shared/validate";
import type { NarrativeContent } from "../../src/shared/types";

function minimalNarrative(): NarrativeContent {
  return {
    summary: "A small TypeScript service with a single entry point.",
    keyInsights: ["src/index.ts has the highest fan-in (4) of any file."],
    readingList: [
      { path: "src/index.ts", reason: "Main entry point; everything else is imported from here." },
    ],
    views: {
      repoMap: "The map is dominated by the src/ folder.",
      depMatrix: "No cycles were found in this repo.",
      hotspots: "No file crosses the risk threshold.",
    },
  };
}

describe("validateNarrativeContent", () => {
  it("accepts a well-formed narrative", () => {
    const result = validateNarrativeContent(minimalNarrative());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a narrative missing summary", () => {
    const data = minimalNarrative() as any;
    delete data.summary;
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects an empty keyInsights array", () => {
    const data = minimalNarrative();
    data.keyInsights = [];
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects a reading list entry missing reason", () => {
    const data = minimalNarrative() as any;
    data.readingList = [{ path: "src/index.ts" }];
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });

  it("rejects views missing a required key", () => {
    const data = minimalNarrative() as any;
    delete data.views.hotspots;
    const result = validateNarrativeContent(data);
    expect(result.valid).toBe(false);
  });
});
```

Append to `repo-architecture-analyzer/tests/shared/validate.test.ts` (inside the existing `describe("validateRepositoryData", ...)` block, after the last `it`):

```ts
  it("accepts a document with a narrative attached", () => {
    const data = minimalData() as any;
    data.narrative = {
      summary: "x",
      keyInsights: ["x"],
      readingList: [{ path: "a", reason: "b" }],
      views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
    };
    const result = validateRepositoryData(data);
    expect(result.valid).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd repo-architecture-analyzer && npx vitest run tests/shared/validateNarrative.test.ts tests/shared/validate.test.ts`
Expected: FAIL — `validateNarrativeContent` is not exported from `src/shared/validate.ts` yet (TypeScript/import error), and the new `validate.test.ts` case fails schema validation because `narrative` isn't a recognized property.

- [ ] **Step 3: Add the types**

In `repo-architecture-analyzer/src/shared/types.ts`, insert before the `RepositoryData` interface (before line 128):

```ts
export interface ReadingListItem {
  path: string;
  reason: string;
}

export interface NarrativeContent {
  summary: string;
  keyInsights: string[];
  readingList: ReadingListItem[];
  views: {
    repoMap: string;
    depMatrix: string;
    hotspots: string;
  };
}

```

Then modify the `RepositoryData` interface to add the new field (after `warnings: AnalysisWarning[];`):

```ts
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
  narrative?: NarrativeContent;
}
```

- [ ] **Step 4: Create the narrative schema**

Create `repo-architecture-analyzer/schema/narrative.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "repo-architecture-analyzer/narrative.schema.json",
  "title": "NarrativeContent",
  "type": "object",
  "required": ["summary", "keyInsights", "readingList", "views"],
  "properties": {
    "summary": { "type": "string", "minLength": 1 },
    "keyInsights": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "minItems": 1
    },
    "readingList": {
      "type": "array",
      "items": { "$ref": "#/definitions/ReadingListItem" },
      "minItems": 1
    },
    "views": {
      "type": "object",
      "required": ["repoMap", "depMatrix", "hotspots"],
      "properties": {
        "repoMap": { "type": "string", "minLength": 1 },
        "depMatrix": { "type": "string", "minLength": 1 },
        "hotspots": { "type": "string", "minLength": 1 }
      }
    }
  },
  "definitions": {
    "ReadingListItem": {
      "type": "object",
      "required": ["path", "reason"],
      "properties": {
        "path": { "type": "string", "minLength": 1 },
        "reason": { "type": "string", "minLength": 1 }
      }
    }
  }
}
```

- [ ] **Step 5: Add the optional `narrative` property to the RepositoryData schema**

In `repo-architecture-analyzer/schema/repository-data.schema.json`, add `"narrative"` to the top-level `"properties"` object (do **not** add it to the top-level `"required"` array — it stays optional):

```json
    "warnings": { "type": "array", "items": { "$ref": "#/definitions/AnalysisWarning" } },
    "narrative": { "$ref": "#/definitions/NarrativeContent" }
```

Add two new entries to the `"definitions"` object, alongside `AnalysisWarning`:

```json
    "NarrativeContent": {
      "type": "object",
      "required": ["summary", "keyInsights", "readingList", "views"],
      "properties": {
        "summary": { "type": "string", "minLength": 1 },
        "keyInsights": { "type": "array", "items": { "type": "string", "minLength": 1 }, "minItems": 1 },
        "readingList": { "type": "array", "items": { "$ref": "#/definitions/ReadingListItem" }, "minItems": 1 },
        "views": {
          "type": "object",
          "required": ["repoMap", "depMatrix", "hotspots"],
          "properties": {
            "repoMap": { "type": "string", "minLength": 1 },
            "depMatrix": { "type": "string", "minLength": 1 },
            "hotspots": { "type": "string", "minLength": 1 }
          }
        }
      }
    },
    "ReadingListItem": {
      "type": "object",
      "required": ["path", "reason"],
      "properties": {
        "path": { "type": "string", "minLength": 1 },
        "reason": { "type": "string", "minLength": 1 }
      }
    }
```

- [ ] **Step 6: Add narrative validation functions**

Append to `repo-architecture-analyzer/src/shared/validate.ts`:

```ts
import narrativeSchemaJson from "../../schema/narrative.schema.json";
import type { NarrativeContent } from "./types";

const narrativeAjv = new Ajv({ allErrors: true, strict: false });
const validateNarrativeFn: ValidateFunction = narrativeAjv.compile(narrativeSchemaJson);

export function validateNarrativeContent(data: unknown): ValidationResult {
  const valid = validateNarrativeFn(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateNarrativeFn.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`
  );
  return { valid: false, errors };
}

export function assertNarrativeContent(data: unknown): asserts data is NarrativeContent {
  const result = validateNarrativeContent(data);
  if (!result.valid) {
    throw new Error(`NarrativeContent failed schema validation:\n${result.errors.join("\n")}`);
  }
}
```

(Add the two new import lines at the top of the file alongside the existing imports; add the rest at the end of the file.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd repo-architecture-analyzer && npx vitest run tests/shared/validateNarrative.test.ts tests/shared/validate.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 8: Run the full test suite to check for regressions**

Run: `cd repo-architecture-analyzer && npm test`
Expected: PASS (no other test should be affected by an additive, optional schema field).

- [ ] **Step 9: Commit**

```bash
git add repo-architecture-analyzer/src/shared/types.ts repo-architecture-analyzer/src/shared/validate.ts \
  repo-architecture-analyzer/schema/narrative.schema.json repo-architecture-analyzer/schema/repository-data.schema.json \
  repo-architecture-analyzer/tests/shared/validateNarrative.test.ts repo-architecture-analyzer/tests/shared/validate.test.ts
git commit -m "Add NarrativeContent type and schema for repo-architecture-analyzer"
```

---

## Task 2: CLI — `--data-out` and `--narrative` on the default analyze flow

**Files:**
- Modify: `repo-architecture-analyzer/src/cli.ts`
- Modify: `repo-architecture-analyzer/tests/cli.test.ts`

**Interfaces:**
- Consumes: `assertNarrativeContent`, `assertRepositoryData` from `./shared/validate` (Task 1); `NarrativeContent`, `RepositoryData` types from `./shared/types` (Task 1).
- Produces: `CliArgs.dataOut?: string`, `CliArgs.narrative?: string`. `attachNarrative(data: RepositoryData, narrativePath: string): RepositoryData` (module-private helper, reused by Task 3's `runRenderOnly`).

- [ ] **Step 1: Write the failing tests**

Append to `repo-architecture-analyzer/tests/cli.test.ts` (after the existing `describe("main", ...)` block):

```ts
describe("parseArgs — narrative flags", () => {
  it("parses --data-out and --narrative", () => {
    const args = parseArgs(["--data-out", "/tmp/data.json", "--narrative", "/tmp/narrative.json"]);
    expect(args.dataOut).toBe("/tmp/data.json");
    expect(args.narrative).toBe("/tmp/narrative.json");
  });
});

describe("main — --data-out", () => {
  const outputs: string[] = [];
  afterEach(() => {
    for (const f of outputs.splice(0)) fs.rmSync(f, { force: true });
  });

  it("writes the full RepositoryData JSON to --data-out, without a narrative field", () => {
    const outPath = path.join(os.tmpdir(), `repo-arch-cli-out-${Date.now()}.html`);
    const dataPath = path.join(os.tmpdir(), `repo-arch-cli-data-${Date.now()}.json`);
    outputs.push(outPath, dataPath);

    main(["--repo", FIXTURE_ROOT, "--out", outPath, "--data-out", dataPath, "--no-cache"]);

    expect(fs.existsSync(dataPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    expect(data.metadata.repositoryName).toBe("fixture-repo");
    expect(data.narrative).toBeUndefined();
  });
});

describe("main — --narrative", () => {
  const outputs: string[] = [];
  afterEach(() => {
    for (const f of outputs.splice(0)) fs.rmSync(f, { force: true });
  });

  it("attaches and validates a narrative, embedding it in the report", () => {
    const outPath = path.join(os.tmpdir(), `repo-arch-cli-narrated-${Date.now()}.html`);
    const narrativePath = path.join(os.tmpdir(), `repo-arch-cli-narrative-${Date.now()}.json`);
    outputs.push(outPath, narrativePath);
    fs.writeFileSync(
      narrativePath,
      JSON.stringify({
        summary: "A tiny fixture repo.",
        keyInsights: ["a.ts and b.ts form a cycle."],
        readingList: [{ path: "a.ts", reason: "Part of the only cycle." }],
        views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
      })
    );

    main(["--repo", FIXTURE_ROOT, "--out", outPath, "--narrative", narrativePath, "--no-cache"]);

    const html = fs.readFileSync(outPath, "utf8");
    expect(html).toContain('id="rk-narrative"');
    expect(html).toContain("A tiny fixture repo.");
  });

  it("throws when the narrative file fails schema validation", () => {
    const outPath = path.join(os.tmpdir(), `repo-arch-cli-bad-narrated-${Date.now()}.html`);
    const narrativePath = path.join(os.tmpdir(), `repo-arch-cli-bad-narrative-${Date.now()}.json`);
    outputs.push(outPath, narrativePath);
    fs.writeFileSync(narrativePath, JSON.stringify({ summary: "missing other required fields" }));

    expect(() =>
      main(["--repo", FIXTURE_ROOT, "--out", outPath, "--narrative", narrativePath, "--no-cache"])
    ).toThrow(/failed schema validation/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd repo-architecture-analyzer && npx vitest run tests/cli.test.ts`
Expected: FAIL — `--data-out` and `--narrative` throw "Unknown argument" in `parseArgs`.

- [ ] **Step 3: Implement the flags**

In `repo-architecture-analyzer/src/cli.ts`, add two imports at the top:

```ts
import { assertRepositoryData, assertNarrativeContent } from "./shared/validate";
import type { RepositoryData } from "./shared/types";
```

Update `CliArgs` (add two optional fields):

```ts
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
}
```

Add two cases to the `switch` in `parseArgs` (after `case "--verbose": args.verbose = true; break;`):

```ts
      case "--data-out": args.dataOut = next(); break;
      case "--narrative": args.narrative = next(); break;
```

Replace the body of `main()` from `const data = runAnalysis(...)` through the `buildReportHtml(...)` call with:

```ts
  const data = runAnalysis(args.repo, config, { noCache: args.noCache, force: args.force });

  if (args.dataOut) {
    fs.writeFileSync(path.resolve(args.dataOut), JSON.stringify(data));
  }

  const reportData = args.narrative ? attachNarrative(data, args.narrative) : data;

  const reportRuntimePath = resolveReportRuntimePath();
  const reportRuntimeJs = fs.readFileSync(reportRuntimePath, "utf8");
  const html = buildReportHtml(reportData, { reportRuntimeJs });
```

(The `outputPath`/`fs.writeFileSync(outputPath, html)`/`summary`/`console.log` lines below stay unchanged — `summary` must keep reading from `data`, not `reportData`, since the stdout digest is about the hard data regardless of narrative.)

Add a new function after `main()` (before the `if (detectIsMainModule())` line):

```ts
function attachNarrative(data: RepositoryData, narrativePath: string): RepositoryData {
  const raw = JSON.parse(fs.readFileSync(path.resolve(narrativePath), "utf8"));
  assertNarrativeContent(raw);
  const narrated: RepositoryData = { ...data, narrative: raw };
  assertRepositoryData(narrated);
  return narrated;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd repo-architecture-analyzer && npx vitest run tests/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `cd repo-architecture-analyzer && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add repo-architecture-analyzer/src/cli.ts repo-architecture-analyzer/tests/cli.test.ts
git commit -m "Add --data-out and --narrative flags to repo-architecture-analyzer CLI"
```

---

## Task 3: CLI — `--render-only` mode

**Files:**
- Modify: `repo-architecture-analyzer/src/cli.ts`
- Modify: `repo-architecture-analyzer/tests/cli.test.ts`

**Interfaces:**
- Consumes: `attachNarrative` (Task 2, same file), `assertRepositoryData` (Task 1).
- Produces: `CliArgs.renderOnly: boolean`, `CliArgs.data?: string`. Nothing outside `cli.ts` depends on `runRenderOnly` directly — it's invoked only from `main()`.

- [ ] **Step 1: Write the failing tests**

Append to `repo-architecture-analyzer/tests/cli.test.ts`:

```ts
describe("parseArgs — render-only flags", () => {
  it("parses --render-only and --data", () => {
    const args = parseArgs(["--render-only", "--data", "/tmp/data.json"]);
    expect(args.renderOnly).toBe(true);
    expect(args.data).toBe("/tmp/data.json");
  });
});

describe("main — --render-only", () => {
  const outputs: string[] = [];
  afterEach(() => {
    for (const f of outputs.splice(0)) fs.rmSync(f, { force: true });
  });

  it("renders a report from a saved data.json without re-running analysis", () => {
    const dataPath = path.join(os.tmpdir(), `repo-arch-render-data-${Date.now()}.json`);
    const throwawayPath = path.join(os.tmpdir(), `repo-arch-render-throwaway-${Date.now()}.html`);
    const outPath = path.join(os.tmpdir(), `repo-arch-render-out-${Date.now()}.html`);
    outputs.push(dataPath, throwawayPath, outPath);

    main(["--repo", FIXTURE_ROOT, "--out", throwawayPath, "--data-out", dataPath, "--no-cache"]);
    main(["--render-only", "--data", dataPath, "--out", outPath]);

    expect(fs.existsSync(outPath)).toBe(true);
    const html = fs.readFileSync(outPath, "utf8");
    expect(html).toContain("window.__REPO_ARCH_DATA__");
    expect(html).not.toContain("rk-narrative");
  });

  it("attaches narrative when --narrative is also passed", () => {
    const dataPath = path.join(os.tmpdir(), `repo-arch-render-narr-data-${Date.now()}.json`);
    const throwawayPath = path.join(os.tmpdir(), `repo-arch-render-narr-throwaway-${Date.now()}.html`);
    const narrativePath = path.join(os.tmpdir(), `repo-arch-render-narr-narrative-${Date.now()}.json`);
    const outPath = path.join(os.tmpdir(), `repo-arch-render-narr-out-${Date.now()}.html`);
    outputs.push(dataPath, throwawayPath, narrativePath, outPath);

    main(["--repo", FIXTURE_ROOT, "--out", throwawayPath, "--data-out", dataPath, "--no-cache"]);
    fs.writeFileSync(
      narrativePath,
      JSON.stringify({
        summary: "A tiny fixture repo.",
        keyInsights: ["ok"],
        readingList: [{ path: "a.ts", reason: "ok" }],
        views: { repoMap: "x", depMatrix: "x", hotspots: "x" },
      })
    );

    main(["--render-only", "--data", dataPath, "--narrative", narrativePath, "--out", outPath]);

    const html = fs.readFileSync(outPath, "utf8");
    expect(html).toContain('id="rk-narrative"');
  });

  it("throws when --data is missing", () => {
    expect(() => main(["--render-only", "--out", "/tmp/x.html"])).toThrow(/requires --data/);
  });

  it("throws when --out is missing", () => {
    expect(() => main(["--render-only", "--data", "/tmp/whatever.json"])).toThrow(/requires --out/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd repo-architecture-analyzer && npx vitest run tests/cli.test.ts`
Expected: FAIL — `--render-only` and `--data` throw "Unknown argument" in `parseArgs`.

- [ ] **Step 3: Implement render-only mode**

In `repo-architecture-analyzer/src/cli.ts`, update `CliArgs` (add two more optional/required fields):

```ts
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
```

Update the default object in `parseArgs`:

```ts
  const args: CliArgs = { repo: process.cwd(), noCache: false, force: false, verbose: false, renderOnly: false };
```

Add two more cases to the `switch`:

```ts
      case "--render-only": args.renderOnly = true; break;
      case "--data": args.data = next(); break;
```

At the very start of `main()`, before `const baseConfig = loadConfig(args.config);`, add the branch:

```ts
export function main(argv: string[] = process.argv.slice(2)): void {
  const args = parseArgs(argv);

  if (args.renderOnly) {
    runRenderOnly(args);
    return;
  }

  const baseConfig = loadConfig(args.config);
  // ... rest of the function is unchanged from Task 2
```

Add a new function after `attachNarrative` (from Task 2):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd repo-architecture-analyzer && npx vitest run tests/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `cd repo-architecture-analyzer && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add repo-architecture-analyzer/src/cli.ts repo-architecture-analyzer/tests/cli.test.ts
git commit -m "Add --render-only mode to repo-architecture-analyzer CLI"
```

---

## Task 4: Report template — narrative banner and per-view narrative text

**Files:**
- Modify: `repo-architecture-analyzer/src/report/template.ts`
- Modify: `repo-architecture-analyzer/tests/report/template.test.ts`

**Interfaces:**
- Consumes: `NarrativeContent` type from `../shared/types` (Task 1). `RepositoryData.narrative` (optional field, Task 1).
- Produces: nothing new consumed elsewhere — `buildReportHtml`'s exported signature is unchanged.

- [ ] **Step 1: Write the failing tests**

In `repo-architecture-analyzer/tests/report/template.test.ts`, add `NarrativeContent` to the type import on line 3:

```ts
import type { RepositoryData, NarrativeContent } from "../../src/shared/types";
```

Append a new `describe` block at the end of the file:

```ts
function narrativeFixture(): NarrativeContent {
  return {
    summary: "A small TypeScript service with one entry point.",
    keyInsights: ["src/index.ts has the highest fan-in of any file."],
    readingList: [{ path: "src/index.ts", reason: "Main entry point." }],
    views: {
      repoMap: "The map is dominated by src/.",
      depMatrix: "No cycles were found.",
      hotspots: "No file crosses the risk threshold.",
    },
  };
}

describe("buildReportHtml — narrative", () => {
  it("renders nothing narrative-related when data.narrative is absent", () => {
    const html = buildReportHtml(minimalData(), { reportRuntimeJs: "" });
    expect(html).not.toContain("rk-narrative");
  });

  it("renders the narrative banner and per-view narrative paragraphs when present", () => {
    const data = minimalData();
    data.narrative = narrativeFixture();
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html).toContain('id="rk-narrative"');
    expect(html).toContain("A small TypeScript service with one entry point.");
    expect(html).toContain("src/index.ts has the highest fan-in of any file.");
    expect(html).toContain("Main entry point.");
    expect(html).toContain('id="rk-narrative-repo-map"');
    expect(html).toContain("The map is dominated by src/.");
    expect(html).toContain('id="rk-narrative-dep-matrix"');
    expect(html).toContain('id="rk-narrative-hotspots"');
  });

  it("escapes HTML-unsafe characters in narrative text", () => {
    const data = minimalData();
    data.narrative = narrativeFixture();
    data.narrative.summary = "<script>evil()</script>";
    const html = buildReportHtml(data, { reportRuntimeJs: "" });
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/template.test.ts`
Expected: FAIL — narrative-related assertions find nothing in the output.

- [ ] **Step 3: Implement narrative rendering in the template**

In `repo-architecture-analyzer/src/report/template.ts`, change the type import on line 1:

```ts
import type { RepositoryData, NarrativeContent } from "../shared/types";
```

Add three CSS rules to the end of the `REPORT_CSS` template string (before the closing backtick):

```css
.rk-narrative__list { margin:8px 0 16px; padding-left:20px; }
.rk-narrative__list li { margin-bottom:4px; }
.rk-view-narrative { color:var(--rk-dim); font-size:13px; margin:0 0 12px; }
```

Add four new functions after `escapeHtml` and before `buildReportHtml`:

```ts
function renderKeyInsights(insights: string[]): string {
  return `<ul class="rk-narrative__list">${insights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderReadingList(items: NarrativeContent["readingList"]): string {
  return `<ul class="rk-narrative__list">${items
    .map((item) => `<li><code>${escapeHtml(item.path)}</code> — ${escapeHtml(item.reason)}</li>`)
    .join("")}</ul>`;
}

function renderNarrativeBanner(narrative?: NarrativeContent): string {
  if (!narrative) return "";
  return `
  <section class="rk-view rk-narrative" id="rk-narrative">
    <h2>Walkthrough</h2>
    <p id="rk-narrative-summary">${escapeHtml(narrative.summary)}</p>
    <h3>Key insights</h3>
    <div id="rk-narrative-insights">${renderKeyInsights(narrative.keyInsights)}</div>
    <h3>Where to start reading</h3>
    <div id="rk-narrative-reading-list">${renderReadingList(narrative.readingList)}</div>
  </section>`;
}

function renderViewNarrative(id: string, text: string | undefined): string {
  if (!text) return "";
  return `<p class="rk-view-narrative" id="${id}">${escapeHtml(text)}</p>`;
}
```

Inside `buildReportHtml`, insert the banner right after `<main>`:

```html
<main>
  ${renderNarrativeBanner(data.narrative)}
  <section class="rk-view">
    <h2>Repo map</h2>
```

Insert a `renderViewNarrative` call right after each view's `<h2>`, before its `<div class="rk-controls">`:

```html
    <h2>Repo map</h2>
    ${renderViewNarrative("rk-narrative-repo-map", data.narrative?.views.repoMap)}
    <div class="rk-controls">
```

```html
    <h2>Dependency matrix</h2>
    ${renderViewNarrative("rk-narrative-dep-matrix", data.narrative?.views.depMatrix)}
    <div class="rk-controls">
```

```html
    <h2>Hotspots</h2>
    ${renderViewNarrative("rk-narrative-hotspots", data.narrative?.views.hotspots)}
    <div class="rk-controls">
```

(The "Selected entity" inspector section is unchanged — narrative doesn't apply there.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd repo-architecture-analyzer && npx vitest run tests/report/template.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `cd repo-architecture-analyzer && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add repo-architecture-analyzer/src/report/template.ts repo-architecture-analyzer/tests/report/template.test.ts
git commit -m "Render narrative banner and per-view narrative text in repo-architecture-analyzer report"
```

---

## Task 5: End-to-end smoke test through the bundled CLI

**Files:**
- Modify: `repo-architecture-analyzer/tests/reportSmoke.test.ts`
- Modify (rebuild, committed artifacts): `repo-architecture-analyzer/bin/analyze.js`, `repo-architecture-analyzer/bin/report-runtime.js`

**Interfaces:**
- Consumes: the CLI surface from Tasks 2–3 (`--data-out`, `--render-only`, `--data`, `--narrative`) and the template output from Task 4, all exercised through the bundled artifact rather than TS source — this is the only test file in the suite that runs `bin/analyze.js` as a subprocess rather than importing source.

- [ ] **Step 1: Write the failing tests**

Append to `repo-architecture-analyzer/tests/reportSmoke.test.ts`:

```ts
describe("bin/analyze.js — render-only with narrative", () => {
  const dataPath = path.join(os.tmpdir(), `repo-arch-smoke-data-${Date.now()}.json`);
  const narrativePath = path.join(os.tmpdir(), `repo-arch-smoke-narrative-${Date.now()}.json`);
  const narratedOutPath = path.join(os.tmpdir(), `repo-arch-smoke-narrated-${Date.now()}.html`);
  const plainOutPath = path.join(os.tmpdir(), `repo-arch-smoke-plain-${Date.now()}.html`);

  afterAll(() => {
    for (const f of [dataPath, narrativePath, narratedOutPath, plainOutPath]) fs.rmSync(f, { force: true });
  });

  it("writes a data.json file via --data-out alongside a graphs-only report", () => {
    execFileSync(
      "node",
      [CLI_PATH, "--repo", FIXTURE_ROOT, "--out", plainOutPath, "--data-out", dataPath, "--no-cache"],
      { encoding: "utf8" }
    );
    expect(fs.existsSync(dataPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    expect(data.metadata.repositoryName).toBe("fixture-repo");
    const plainHtml = fs.readFileSync(plainOutPath, "utf8");
    expect(plainHtml).not.toContain("rk-narrative");
  });

  it("renders a narrated report from saved data.json without re-running analysis", () => {
    fs.writeFileSync(
      narrativePath,
      JSON.stringify({
        summary: "A tiny fixture repo used for testing.",
        keyInsights: ["a.ts and b.ts import each other, forming a cycle."],
        readingList: [{ path: "a.ts", reason: "Part of the only cycle in this fixture." }],
        views: {
          repoMap: "The map shows a handful of top-level files.",
          depMatrix: "One cycle is visible between a.ts and b.ts.",
          hotspots: "No file crosses the default risk threshold in this tiny fixture.",
        },
      })
    );

    const stdout = execFileSync(
      "node",
      [CLI_PATH, "--render-only", "--data", dataPath, "--narrative", narrativePath, "--out", narratedOutPath],
      { encoding: "utf8" }
    );
    expect(JSON.parse(stdout).outputPath).toBe(narratedOutPath);

    const html = fs.readFileSync(narratedOutPath, "utf8");
    expect(html).toContain('id="rk-narrative"');
    expect(html).toContain("A tiny fixture repo used for testing.");
    expect(html).toContain("a.ts and b.ts import each other, forming a cycle.");

    const errors: unknown[] = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (err) => errors.push(err));
    const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable", virtualConsole });
    expect(dom.window.document.getElementById("rk-narrative")).toBeTruthy();
    expect(errors).toEqual([]);
    dom.window.close();
  });

  it("never renders narrative text as executable markup, even when it looks like a script tag", () => {
    fs.writeFileSync(
      narrativePath,
      JSON.stringify({
        summary: "</script><script>window.__rkPwned = true;</script>",
        keyInsights: ["ok"],
        readingList: [{ path: "a.ts", reason: "ok" }],
        views: { repoMap: "ok", depMatrix: "ok", hotspots: "ok" },
      })
    );

    execFileSync(
      "node",
      [CLI_PATH, "--render-only", "--data", dataPath, "--narrative", narrativePath, "--out", narratedOutPath],
      { encoding: "utf8" }
    );

    const html = fs.readFileSync(narratedOutPath, "utf8");
    expect(html).not.toContain("</script><script>window.__rkPwned = true;</script>");

    const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
    expect((dom.window as unknown as { __rkPwned?: boolean }).__rkPwned).toBeUndefined();
    dom.window.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd repo-architecture-analyzer && npx vitest run tests/reportSmoke.test.ts`
Expected: FAIL — `bin/analyze.js` is still the stale, pre-Task-2/3 bundle and throws `Unknown argument: --data-out` (or similar) for the new flags.

- [ ] **Step 3: Rebuild the bundles**

Run: `cd repo-architecture-analyzer && npm run build`
Expected: both `bin/analyze.js` and `bin/report-runtime.js` are rewritten, incorporating the Tasks 1–4 source changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd repo-architecture-analyzer && npx vitest run tests/reportSmoke.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `cd repo-architecture-analyzer && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add repo-architecture-analyzer/tests/reportSmoke.test.ts repo-architecture-analyzer/bin/analyze.js repo-architecture-analyzer/bin/report-runtime.js
git commit -m "Add end-to-end smoke coverage for repo-architecture-analyzer narrative flow"
```

---

## Task 6: Documentation and dogfooded example regeneration

**Files:**
- Modify: `repo-architecture-analyzer/SKILL.md`
- Modify: `repo-architecture-analyzer/HANDOFF.md`
- Modify: `repo-architecture-analyzer/README.md`
- Modify (regenerated artifact): `repo-architecture-analyzer/examples/example-report.html`

**Interfaces:**
- Consumes: nothing new — this task documents and dogfoods what Tasks 1–5 built. No further code changes.

- [ ] **Step 1: Update `SKILL.md`'s "How this skill works" section**

Replace the section (currently the block starting `## How this skill works (read this before anything else)` through the end of its numbered list) with:

```markdown
## How this skill works (read this before anything else)

The hard data — filesystem walk, git history, TS/JS AST parsing via
`ts-morph`, a custom Python structural parser, dependency graph, cycle
detection, complexity/risk scoring, and the D3 report rendering itself —
is a single pre-built, dependency-free Node.js script (`bin/analyze.js` +
`bin/report-runtime.js`). None of that is Claude-authored, and nothing in
this section changes that.

Claude's baseline job is:

1. Run the bundled tool.
2. Read back the small JSON summary it prints to stdout.
3. Give the user a short chat digest (top hotspots, cycle count, parser
   coverage, warning count) — do not re-derive or restate the full
   graph; the report itself is the detailed view.

Optionally, Claude can add a short AI-authored narrative walkthrough on
top of the hard data — see "Adding a narrative walkthrough" below. That
narrative is the *only* part of this skill's output that's ever
Claude-authored; the graphs and metrics stay fully deterministic either
way.
```

- [ ] **Step 2: Update the "Running it" section's flag list**

Replace the fenced command block and the bullet list immediately after it with:

```markdown
```bash
node <skill-dir>/bin/analyze.js --repo <path> [--out <path>] [--config <path>] \
  [--include <glob>]... [--exclude <glob>]... \
  [--max-git-commits <n>] [--git-since <date-or-duration>] \
  [--no-cache] [--force] [--verbose] [--data-out <path>] [--narrative <path>]
```

- `--repo` defaults to the current working directory.
- `--out` defaults to `/tmp/YYYY-MM-DD-repo-architecture-<repo-slug>.html`.
- `--data-out <path>` additionally dumps the full analysis as JSON — read
  this (not just the stdout summary) before authoring a narrative.
- `--narrative <path>` embeds a narrative walkthrough (see below) into the
  rendered report. Optional; omit it and the report renders exactly as the
  hard-data-only baseline.
- Nothing is ever written into the target repo.
- Requires only Node.js (`>=18`) on PATH — no `npm install`, no Python
  interpreter, no native binaries.
```

- [ ] **Step 3: Add the "Adding a narrative walkthrough" section**

Insert this new section into `SKILL.md` immediately after "## Reading the summary" and its JSON example, before "## Language support (v1)":

```markdown
## Adding a narrative walkthrough (optional)

If asked for a walkthrough, insights, or "what should I read first" — not
just the raw report — run this three-step flow instead of the single
baseline command:

1. **Analyze, keeping the data:**
   ```bash
   node <skill-dir>/bin/analyze.js --repo <path> --out <report-path> --data-out <data-path>
   ```
2. **Read `<data-path>` in full** (not just the stdout summary — you need
   real file paths, scores, and cycle members to write anything grounded).
   Write `<narrative-path>` as JSON matching this shape:
   ```json
   {
     "summary": "2-4 sentences: what kind of system this is, its main layers/modules, overall shape.",
     "keyInsights": ["3-6 short, data-grounded observations"],
     "readingList": [{ "path": "relative/path", "reason": "why start here" }],
     "views": {
       "repoMap": "1-2 sentences framing what to look for in this repo's map.",
       "depMatrix": "1-2 sentences — e.g. name a real dense cluster or cycle.",
       "hotspots": "1-2 sentences — e.g. name the actual top hotspot and why."
     }
   }
   ```
   **Every sentence must cite something concretely present in
   `<data-path>`** — a real file path, a real score, a real cycle, a real
   fan-in count. No generic filler ("this repo has good separation of
   concerns"). Derive `readingList` from real signals in the data (highest
   fan-in files, README/entry-point presence, highest-risk files) — never
   guess independent of the analysis.
3. **Render with the narrative attached:**
   ```bash
   node <skill-dir>/bin/analyze.js --render-only --data <data-path> --narrative <narrative-path> --out <report-path>
   ```
   This overwrites `<report-path>` with the narrated version and does not
   re-run analysis.

If you skip this flow entirely, the report is still complete and correct
— narrative is additive, never required.
```

- [ ] **Step 4: Update the "Common pitfalls" section**

Replace this bullet:

```markdown
- Don't try to author a payload JSON for this skill — there isn't one.
```

with:

```markdown
- Don't author JSON for the hard-data graph — there's no payload step for
  that; it's fully deterministic. The *only* thing Claude ever writes is
  the optional `narrative.json` above, and only its prose fields.
- Don't write narrative content you can't ground in `<data-path>` — every
  claim needs a real file path, score, or cycle behind it.
```

- [ ] **Step 5: Update `HANDOFF.md`**

Replace the `## Design goal (non-negotiable)` section with:

```markdown
## Design goal (non-negotiable for the hard data; narrative is the one exception)

The hard data — graphs, metrics, git history — is computed entirely by
deterministic, pre-built code, never by Claude. That guarantee is
absolute. On top of it, Claude can optionally author a short narrative
walkthrough (`narrative.json`, merged in via `--render-only`) — the one
part of this skill's output that's genuinely AI-authored, closer in spirit
to `rick-explain-diff-html`. See SKILL.md's "How this skill works" and
"Adding a narrative walkthrough" sections for the exact split.
```

In the `## File layout` code block, replace the single line `├── schema/repository-data.schema.json` with:

```
├── schema/
│   ├── repository-data.schema.json
│   └── narrative.schema.json
```

- [ ] **Step 6: Update `README.md`**

Append a new section after the existing "## Regenerate the example report" section:

```markdown
## Regenerate the example report with a narrative

```bash
npm run build
node bin/analyze.js --repo .. --out /tmp/plain.html --data-out /tmp/data.json --no-cache
# Read /tmp/data.json, write /tmp/narrative.json by hand following the
# schema in schema/narrative.schema.json and SKILL.md's grounding rules.
node bin/analyze.js --render-only --data /tmp/data.json --narrative /tmp/narrative.json --out examples/example-report.html
```
```

- [ ] **Step 7: Regenerate `examples/example-report.html` with a real, grounded narrative**

Run, from `repo-architecture-analyzer/`:

```bash
npm run build
node bin/analyze.js --repo .. --out /tmp/repo-arch-plain.html --data-out /tmp/repo-arch-data.json --no-cache
```

Read `/tmp/repo-arch-data.json` (the full file, not a truncated view — use its `summary`, `metadata.parserCoverage`, and by sorting `nodes` on `riskScore`/`fanIn`/`cycleCount` to find real candidates for `keyInsights` and `readingList`). Write `/tmp/repo-arch-narrative.json` conforming to `schema/narrative.schema.json`, satisfying the grounding rule from `SKILL.md` step 3 above — every sentence must cite a real, verifiable fact from `/tmp/repo-arch-data.json` (an actual file path, an actual score, an actual cycle member, an actual fan-in count). Do not invent findings.

Then render the final example:

```bash
node bin/analyze.js --render-only --data /tmp/repo-arch-data.json --narrative /tmp/repo-arch-narrative.json --out examples/example-report.html
```

Verify before committing:
- Open `examples/example-report.html` and confirm it contains a "Walkthrough" section, `id="rk-narrative"`, and per-view narrative paragraphs.
- Cross-check every sentence in `/tmp/repo-arch-narrative.json` against `/tmp/repo-arch-data.json` — each factual claim (a path, a number, a cycle) must actually appear there.
- Run `cd repo-architecture-analyzer && npm test` — expect PASS.

- [ ] **Step 8: Commit**

```bash
git add repo-architecture-analyzer/SKILL.md repo-architecture-analyzer/HANDOFF.md repo-architecture-analyzer/README.md \
  repo-architecture-analyzer/examples/example-report.html
git commit -m "Document narrative walkthrough flow and regenerate example report"
```

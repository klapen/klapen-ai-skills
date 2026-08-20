# `repo-architecture-analyzer` — Design Spec

Status: approved for implementation planning
Date: 2026-08-20
Source material: [`2026-08-20-repo-architecture-analyzer-original-prompt.txt`](2026-08-20-repo-architecture-analyzer-original-prompt.txt)
(original mega-prompt, kept alongside this spec for reference; superseded by
this spec for anything the two disagree on)

## 1. Purpose

A Claude Code skill that inspects a repository's structure, dependencies,
static metrics, and Git history, and produces a single self-contained
interactive HTML report (D3.js) explaining the codebase's architecture:
what's big, what depends on what, and what's risky. Modeled on the existing
`rick-explain-diff-html` skill in this repo, but with a fundamentally
different division of labor between Claude and bundled tooling (see §3).

## 2. Relationship to the original prompt

The original prompt specs an extremely ambitious standalone product: a
TypeScript/Node tool scaffolded into `tools/repo-architecture/` in whatever
repo it's run against, with 5+ language parsers, 6 fully-interactive
coordinated D3 views, snapshot history, incremental caching, Web Workers,
and Playwright tests. Read literally as a skill, it implies Claude
re-authoring that entire system from the prompt text on every invocation,
into every target repo — expensive, slow, and non-deterministic.

This spec keeps the prompt's data model, metrics, safety rules, and overall
visual ambition, but restructures *how* the work gets done and trims v1
scope. Deviations from the prompt, and why, are called out inline.

## 3. Division of labor: bundled tool vs. Claude

This is the single biggest structural difference from `rick-explain-diff-html`,
worth stating plainly:

- **Rick's skill:** mechanical extraction (diff parsing) is cheap, so a small
  script does it, and Claude supplies the valuable editorial layer (risk
  commentary, quiz, narrative) as a per-run JSON payload.
- **This skill:** the mechanical extraction (AST parsing a whole codebase,
  building a dependency graph, computing complexity/coupling/churn) *is* the
  hard and valuable part, and must be deterministic code, not LLM judgment —
  an LLM eyeballing "does file A import file B" across hundreds of files will
  get edges wrong, and doing it by reading files by hand doesn't scale token-
  or accuracy-wise. So there is no Claude-authored payload/sections step here.

The analyzer + report generator is pre-built once, now, as part of shipping
this skill — bundled into the skill folder as plain, dependency-free
JavaScript (built with esbuild at authoring time, not npm-installed by end
users). At invocation time, Claude's job is: run the bundled tool against the
target repo, read back its small `summary`/`warnings` block, and give the
user a short chat digest. Claude does not write JSON, does not write prose
sections, and does not touch the D3 code.

## 4. Trigger & invocation

- Trigger phrases: `/repo-architecture-analyzer [path] [options]`, or natural
  language ("analyze this repo's architecture", "show me the dependency
  structure", "find architecture hotspots").
- Defaults to the current working repo when no path is given.
- Underlying command Claude runs:

```bash
node <skill-dir>/bin/analyze.js --repo <target-path> --out <report-path> [options]
```

- Supported flags (v1): `--repo`, `--out`, `--config <path>`, `--include
  <glob>`, `--exclude <glob>`, `--max-git-commits <n>`, `--git-since
  <date-or-duration>`, `--no-cache`, `--force`, `--verbose`.
- Not implemented in v1 (see §9): `--snapshot`, `--compare-with`.

Output path convention mirrors Rick: `/tmp/YYYY-MM-DD-repo-architecture-
<repo-slug>.html`, unless `--out` overrides it. The tool prints the final
path plus a JSON summary block to stdout; Claude relays a short digest to
the user (top hotspots, cycle count, parser coverage, warning count) — it
must not re-derive or restate the full graph.

## 5. Footprint & storage

Nothing is written into the target repo. This is a deliberate change from
the original prompt's `tools/repo-architecture/` scaffolding design, chosen
because it keeps the skill's footprint at zero regardless of how many
different repos it's pointed at, and avoids polluting a target repo's
working tree with generated/cache files someone would have to `.gitignore`
or clean up.

- Report output: `/tmp/` by default (ephemeral, like Rick), or user-supplied
  `--out`.
- Working cache (content-hash keyed, for incremental reruns — see §8):
  `~/.cache/repo-architecture-analyzer/<repo-slug>/`. Deliberately *outside*
  both the target repo and this skills repo itself — a symlink-installed
  skill lives inside the user's `klapen-ai-skills` checkout, and writing
  runtime data there would show up as untracked files in that repo's own
  `git status`, which is exactly the kind of surprise state this design
  should never create. `repo-slug` is derived from the repo's git remote (if
  any) or absolute path, hashed.

## 6. Language & parsing scope (v1)

- **TypeScript/JavaScript** — fully parsed via bundled `ts-morph`: classes,
  interfaces, functions, methods, imports, inheritance, basic call-graph
  where reliably resolvable.
- **Python** — fully parsed via a bundled equivalent of Python's `ast`
  module semantics (implemented in the Node tool, not by shelling out to a
  Python interpreter, to keep the skill's only runtime requirement being
  Node.js): classes, functions, imports.
- **Everything else** — included in the filesystem hierarchy, static LOC
  count, and full Git-history metrics (churn, commits, contributors,
  co-change), but with no entity/import extraction. Each file's contribution
  to `metadata.parserCoverage` is explicitly `"skipped"` or `"fallback"`, not
  silently dropped, per the original prompt's requirement to be honest about
  coverage.
- Java, C#, and a general Tree-sitter fallback are **v2** (§9).

## 7. Data model

Reuses the original prompt's `RepositoryData` / `CodeNode` / `CodeEdge`
shape as the JSON contract between the analyzer and the report (see
the original prompt §"Stable data model" for the full TypeScript shape) —
`metadata`, `summary`, `nodes[]`, `edges[]`, `cycles[]`, `communities[]`,
`unresolvedDependencies[]`, `architectureRules[]`, `warnings[]`. In v1,
`communities[]` is present in the schema but always emitted empty — no
clustering algorithm is chosen or run until the v2 tension view needs one
(§9, §13). Node/edge fields not needed by any v1 view (e.g. `coverage`,
`instability`) are still populated when cheaply available, so v2 views can
consume the same dataset without a schema migration.

Entity IDs: `<entity-kind>:<normalized-relative-path>#<qualified-symbol-name>`,
stable across runs for unchanged entities — required for snapshot diffing
later and for `--no-cache`-free reruns to actually skip unchanged files now.

Architecture rules / layers: only evaluated if the user supplies a config
(`layers`, `mayDependOn`). With no config, cross-folder/cross-package
dependencies are shown as neutral observations, never flagged as
violations — matches the original prompt's explicit instruction not to
invent violations.

## 8. Metrics

- Static: LOC, logical statement count (best-effort), class/function/method
  counts, cyclomatic complexity and nesting depth (TS/Python only, since
  these require the real AST), fan-in/fan-out, afferent/efferent coupling,
  instability, SCC-based cycle detection.
- Git history (`git log --numstat`, no AST involved — this part applies to
  every file regardless of language): commit count, churn, contributor
  count, last-modified, file age, co-change pairs above a configurable
  co-occurrence threshold, with bulk-formatting/lockfile/merge commits
  down-weighted per the original prompt's heuristics.
- Risk score: the weighted heuristic from the original prompt —
  `risk = complexityWeight·normalizedComplexity + churnWeight·normalizedChurn
  + couplingWeight·normalizedCoupling + cycleWeight·cycleParticipation +
  coverageWeight·missingCoverage`. Weights live in the config file (with
  documented defaults) and are echoed in the report's legend. Labeled
  "heuristic" everywhere it's shown, per the original prompt's requirement.
- Coverage: only consumed from an existing LCOV/Cobertura/JaCoCo artifact if
  one is found; the tool never runs the target repo's test suite.

## 9. Report — v1 views (3, coordinated)

Shared state across all three: text search, entity-type filter, language
filter, package/folder filter, production-vs-test toggle, min-edge-weight
threshold, risk threshold, reset button, an inspector panel for the
selected entity (path, kind, metrics, in/out edges, cycle membership, git
activity, risk breakdown, parser-confidence note).

1. **Repo map** — zoomable icicle (default) / treemap (toggle),
   repository → folder → file → class/function. Size = LOC (or selected
   metric), color = risk/complexity/churn/language (selector), breadcrumb
   nav, search-to-zoom.
2. **Dependency matrix** — package / folder / file granularity (class-level
   only once a subtree is narrowed, to stay usable on large repos). Cell
   intensity = edge weight, reorder by hierarchy / fan-in / fan-out /
   topological order, cycle and violation highlighting.
3. **Hotspot view** — churn (x) × complexity (y) bubble chart, bubble size =
   fan-in, color = risk. Log scale toggle, top-N labeling, click-to-select
   syncs with the other two views.

### v2 backlog (documented here, not built now)

Kept as a literal backlog so this work can resume later without
re-deriving scope from scratch:

- **Hierarchical edge bundling** view (full spec: original prompt §"3").
- **Logical architecture / architectural-tension** view — needs a
  documented community-detection/clustering algorithm and a declared-
  vs-observed interpolation slider (original prompt §"4"). The most
  research-y piece of the whole system; deliberately deferred until the
  simpler views prove the underlying data model out.
- **Snapshot save + evolution/comparison view** — `data/snapshots/`,
  `--snapshot`/`--compare-with` flags, `latest-diff.json`, the dedicated
  evolution UI (original prompt §"6" and "Snapshot and historical
  comparison"). Deferred as a unit since the CLI flags only earn their
  keep once there's a UI consuming the diff.
- Java, C#, and general Tree-sitter-fallback language support.
- Content-hash-based incremental caching + Web Workers for large-repo
  layout performance (v1 still does whole-repo analysis each run, using the
  `~/.cache/...` directory from §5 only for the parts that are cheap to
  memoize now — e.g. per-file AST results keyed by content hash — without
  building the full incremental-rerun pipeline).
- Deep Playwright browser testing (v1 uses the jsdom-based smoke test in
  §11 instead).

## 10. Skill file layout

```
repo-architecture-analyzer/
├── SKILL.md                 # authoritative spec (this doc summarized)
├── HANDOFF.md                # agent-handoff brief, includes the v2 backlog
├── README.md                 # build-from-source instructions for the bundle (dev-only)
├── bin/
│   └── analyze.js            # esbuild-bundled entry point; the only thing end users run
├── src/                       # TypeScript source for the bundle (not shipped raw to users)
│   ├── cli.ts
│   ├── analyzers/
│   │   ├── filesystem/
│   │   ├── git/
│   │   ├── languages/         # ts-morph adapter, python-ast adapter
│   │   └── metrics/
│   ├── graph/                 # cycles, risk score, (communities stubbed for v2)
│   ├── report/                # D3 report generator + templates
│   └── shared/
├── config/
│   └── repo-architecture.default.config.json
├── schema/
│   └── repository-data.schema.json
├── tests/                     # unit tests + jsdom smoke test (source-level, dev-only)
└── examples/
    ├── example-report.html    # rendered demo, small fixture repo
    └── fixture-repo/          # tiny synthetic repo used by the smoke test + example
```

Only `bin/analyze.js` (the bundled output), `config/`, and `schema/` are
required at runtime; `src/` and `tests/` exist for maintaining the skill,
matching how `rick-explain-diff-html/scripts/render.py` is the runtime
artifact while this repo's own tooling stays out of the runtime path.

## 11. Testing

- Unit tests (source-level, run during skill development, not by end
  users): path normalization, stable entity IDs, dependency/alias
  resolution, SCC cycle detection, architecture-rule evaluation, git-log
  parsing, co-change thresholding, risk-score math, JSON-schema validation,
  cache invalidation.
- One smoke test: run the bundled `analyze.js` against `examples/fixture-
  repo/`, then use `jsdom` to assert the output HTML has the embedded JSON
  dataset, the three view containers, and the shared-state controls
  (search box, filters, reset button) present, and that no script errors
  fire during a basic load. No Playwright/real-browser dependency for v1,
  per your instruction to keep this lightweight.

## 12. Safety (carried over from the original prompt, unchanged)

- Never embed source-code contents/snippets in the JSON or report.
- Never collect or store author email addresses — contributor counts only.
- Respect `.gitignore`; allow config overrides (`include`/`exclude`).
- Exclude `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`,
  `coverage`, `.next`, `out`, `bin`, `obj`, `.cache`, `generated`,
  `*.min.js` by default.
- No network calls of any kind — fully local analysis.
- Never modify the target repo's application code; never auto-commit
  anything, in the target repo or this one.
- Never run the target repo's test suite to obtain coverage; only consume
  an existing coverage artifact if present.

## 13. Open assumptions / explicitly out of scope for v1

- No monorepo/workspace-boundary detection beyond what a user-supplied
  config declares (no auto-detection of Lerna/Nx/pnpm workspaces in v1).
- No coverage-artifact auto-discovery heuristics beyond checking a small
  set of conventional paths (`coverage/lcov.info`, etc.) — documented, not
  exhaustive.
- Community detection / clustering algorithm is not chosen or implemented
  in v1 (it only matters for the deferred tension view).
- No Web UI theme toggle is required in v1 beyond what's cheap to inherit
  from the report's static CSS (light/dark via `prefers-color-scheme` is
  fine; no runtime theme switcher like Rick's 6-theme system).

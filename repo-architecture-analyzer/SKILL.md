---
name: repo-architecture-analyzer
description: >
  Use when the user asks to analyze a repository's architecture, structure,
  dependencies, static metrics, or Git history, or to find architecture
  hotspots/risk areas — renders a single self-contained interactive HTML
  report (D3.js) covering a repo map, a dependency matrix, and a hotspots
  view. Trigger phrases include: `/repo-architecture-analyzer [path]
  [options]`, "analyze this repo's architecture", "show me the dependency
  structure", "find architecture hotspots". Defaults to the current repo
  when no path is given.
metadata:
  version: 0.1.0
  author: klapen
---

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
- **Whole-language failure:** a parse error in any single file currently
  discards that whole language's entities/imports for the run (there's no
  per-file isolation yet); `metadata.parserCoverage.failed` reflects this
  honestly when it happens — treat a non-zero `failed` as "this language's
  results are missing for this run," not as a small/partial gap.
- **TypeScript/JavaScript entity extraction currently covers
  `class`/`interface`/`function`/`method` declarations only** —
  arrow-function exports (`export const foo = () => ...`) and re-exports
  (`export ... from`) are not yet extracted as entities, so files relying
  heavily on that style may show lower complexity/risk than their actual
  code warrants.

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
- Don't point `--repo` at a non-git subdirectory nested inside a larger
  git repository — git history analysis will silently pick up the
  *enclosing* repo's history instead of reporting 'no git history.' Point
  `--repo` at an actual repository root.

---
name: repo-architecture-analyzer
description: >
  Use when the user asks to analyze a repository's architecture, structure,
  dependencies, static metrics, or Git history, or to find architecture
  hotspots/risk areas — renders a single self-contained interactive HTML
  report (D3.js) covering a repo map, a dependency matrix, and a hotspots
  view. Also use when the user wants an AI-authored narrative walkthrough,
  key insights, or a reading list on top of that report — e.g. "what
  should I read first" in this repo. Trigger phrases include:
  `/repo-architecture-analyzer [path] [options]`, "analyze this repo's
  architecture", "show me the dependency structure", "find architecture
  hotspots", "give me a walkthrough of this repo", "what should I read
  first", "what are the key insights". Defaults to the current repo when
  no path is given.
metadata:
  version: 0.1.0
  author: klapen
---

# repo-architecture-analyzer

Analyzes a repository's structure, dependencies, static metrics, and Git
history, and renders a single self-contained interactive HTML report
(D3.js): what's big, what depends on what, and what's risky.

**Authoritative spec:** `docs/superpowers/specs/2026-08-20-repo-architecture-analyzer-design.md`
in the source repo has the full design rationale, and
`docs/superpowers/specs/2026-08-24-repo-architecture-analyzer-narrative-design.md`
covers the narrative walkthrough layer built on top of it; this file is the
operational contract for running the skill.

## Trigger phrases

`/repo-architecture-analyzer [path] [options]`, or natural language:
"analyze this repo's architecture", "show me the dependency structure",
"find architecture hotspots". Defaults to the current repo when no path
is given.

Also triggers the optional narrative walkthrough flow (below) on phrases
like "give me a walkthrough of this repo", "what should I read first",
"what are the key insights", or "narrate this repo's architecture".

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

## Running it

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
   re-run analysis. Step 3 does not print a fresh JSON summary (just
   `{ "outputPath": ... }`) — reuse the digest already printed by step 1
   for the chat digest, since the hard-data numbers are unchanged by
   attaching a narrative.

If you skip this flow entirely, the report is still complete and correct
— narrative is additive, never required.

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

- Don't author JSON for the hard-data graph — there's no payload step for
  that; it's fully deterministic. The *only* thing Claude ever writes is
  the optional `narrative.json` above, and only its prose fields.
- Don't write narrative content you can't ground in `<data-path>` — every
  claim needs a real file path, score, or cycle behind it.
- Don't quote a file's actual contents/snippets in narrative text —
  describe it by path and by computed metrics only, same rule as the rest
  of this skill's output.
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

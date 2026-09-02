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
node bin/analyze.js --repo .. --out examples/example-report.html --no-cache
```

This overwrites `examples/example-report.html` with a graphs-only version,
stripping any narrative previously shipped in that file with no warning —
use the narrative recipe below instead if you want to keep the narrative.

(Points `--repo` at the whole `klapen-ai-skills` checkout — a real repo
with real git history, so the example demonstrates non-trivial churn and
hotspot data instead of the intentionally tiny `examples/fixture-repo/`.)

## Regenerate the example report with a narrative

```bash
npm run build
node bin/analyze.js --repo .. --out /tmp/plain.html --data-out /tmp/data.json --no-cache
# Read /tmp/data.json, write /tmp/narrative.json by hand following the
# schema in schema/narrative.schema.json and SKILL.md's grounding rules.
node bin/analyze.js --render-only --data /tmp/data.json --narrative /tmp/narrative.json --out examples/example-report.html
```

## Architecture

See `docs/superpowers/specs/2026-08-20-repo-architecture-analyzer-design.md`
in the repo root for the full design rationale,
`docs/superpowers/specs/2026-08-24-repo-architecture-analyzer-narrative-design.md`
for the narrative walkthrough layer built on top of it, and `SKILL.md` for
the operational contract Claude follows when invoking this skill.

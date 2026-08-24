# `repo-architecture-analyzer` — Narrative Walkthrough Design Spec

Status: approved for implementation planning
Date: 2026-08-24
Builds on: [`2026-08-20-repo-architecture-analyzer-design.md`](2026-08-20-repo-architecture-analyzer-design.md)
(the base skill; PR still open at time of writing on branch
`worktree-repo-architecture-analyzer`)

**Amendment (post-implementation):** implementation deviated from §5/§6 in
one respect — narrative rendering ended up entirely in
`src/report/template.ts` via static `escapeHtml`-based string building
(matching how `repositoryName`/`gitBranch` were already rendered), rather
than via `createElement`/`textContent` in `src/report/main.ts` as
originally specified. This achieves the identical DOM-safety guarantee
with less code and no new runtime JS, and was accepted during Task 4's
review. Also, §5's "reading list ... small card" language shipped as a
`<ul>` list, not a distinct card element.

## 1. Purpose

The base skill produces a report that's all hard data: three D3 views, an
inspector panel, no framing text anywhere. This adds a narrative layer on
top — a short AI-authored walkthrough (summary, key insights, a reading
list of files worth opening first, and per-view commentary) grounded in the
data the engine already computed. Hard data stays exactly as deterministic
as it is today; the narrative is the one part of this skill's output that
is genuinely AI-authored and non-reproducible run-to-run, same as how
`rick-explain-diff-html` narrates a diff.

## 2. Relationship to the base design

The base spec's §3 ("Division of labor") drew a hard line: no
Claude-authored payload step, because the *mechanical extraction* (AST
parsing, graph building) must stay deterministic. That line still holds —
nothing about parsing or graph assembly changes here. What's added is a
second, independent kind of output: editorial commentary *about* the
already-computed graph, which is exactly the kind of judgment call that
should come from Claude, not a heuristic. This spec adds that layer without
touching the engine (`src/analyzers/`, `src/graph/`, `src/pipeline.ts`) or
weakening its determinism guarantee.

## 3. Runtime flow

Base skill flow (single call, unchanged as the default/no-narrative path):

```bash
node bin/analyze.js --repo <target-path> --out <report-path> [options]
```

New three-step flow when a narrative is wanted:

1. **Analyze** (existing command, one new flag):
   ```bash
   node bin/analyze.js --repo <target-path> --out <report-path> --data-out <data.json> [options]
   ```
   Runs the engine exactly as today, writes the graphs-only report to
   `--out` (so this alone remains a complete, working report — see §7), and
   additionally dumps the full, schema-valid `RepositoryData` to
   `--data-out` for Claude to read. The stdout summary block is unchanged
   and still the thing Claude relays as a chat digest.

2. **Narrate** (Claude, no tool code): Claude reads `data.json` and writes
   `narrative.json` conforming to the schema in §4. Pure text authoring —
   no filesystem/graph logic.

3. **Render with narrative** (new CLI mode):
   ```bash
   node bin/analyze.js --render-only --data <data.json> --narrative <narrative.json> --out <report-path>
   ```
   Skips the filesystem walk, git analysis, and language parsing entirely.
   Loads `data.json` (already schema-valid), merges in the narrative,
   re-validates against the updated schema, and re-renders the report to
   the same `--out` path — overwriting the graphs-only version from step 1
   with the narrated one.

`--render-only` requires `--data` and `--out`; `--repo` is not read in this
mode. `--narrative` is optional even in `--render-only` mode (a bare
re-render from a saved `data.json` is a legitimate, if narrow, use case —
e.g. regenerating the report after a template/CSS change without
re-running analysis). Unlike `--out`, which falls back to the base skill's
`/tmp/...` convention, `--data-out` and `--narrative` have no default path:
Claude is scripting a multi-step flow and needs to know exactly where each
file lives, so both must be passed explicitly whenever used.

## 4. Narrative content schema

New `schema/narrative.schema.json`, validated via `ajv` the same way
`repository-data.schema.json` is:

```json
{
  "summary": "string, 2-4 sentences",
  "keyInsights": ["string", "... 3-6 items"],
  "readingList": [
    { "path": "string", "reason": "string" }
  ],
  "views": {
    "repoMap": "string, 1-2 sentences",
    "depMatrix": "string, 1-2 sentences",
    "hotspots": "string, 1-2 sentences"
  }
}
```

All fields required once the file exists (no partial/broken narrative
states); the file itself is optional at the CLI level. `RepositoryData`
gains an optional `narrative?: NarrativeContent` field — never set by the
engine, only ever attached by the `--render-only` merge step.

**Grounding requirement** (enforced by instruction in `SKILL.md`, not by
code — there's no way to mechanically verify prose is "true"): every
sentence in `summary`, `keyInsights`, and `views.*` must cite something
concretely present in `data.json` — a real file path, a real score, a real
cycle, a real fan-in count. No generic filler ("this repo has good
separation of concerns"). `readingList` entries must be derived from real
signals in the data (highest fan-in files, README/entry-point presence,
highest-risk files) — never guessed independent of the analysis.

## 5. Report rendering changes

- A new banner section renders directly under the header, before the three
  view sections: `summary` as a paragraph, `keyInsights` as a bullet list,
  and `readingList` as a small card (path + reason per entry).
- Each of the three view sections gets one new paragraph between its
  `<h2>` and its controls, populated from `views.repoMap` /
  `views.depMatrix` / `views.hotspots` respectively.
- All narrative text renders via `createElement`/`textContent`, never
  `innerHTML` — same discipline as the inspector-panel fix in the base
  skill, since narrative text can reference untrusted repo-derived strings
  (e.g. a malicious file path Claude ends up quoting verbatim).
- When `data.narrative` is absent, none of these elements render — the
  report is pixel-identical to the base skill's output. No empty
  placeholders, no "no narrative available" filler text.

## 6. Skill file layout changes

```
repo-architecture-analyzer/
├── schema/
│   ├── repository-data.schema.json   # updated: optional `narrative` field
│   └── narrative.schema.json         # new
├── src/
│   ├── cli.ts                         # new flags: --data-out, --render-only, --narrative
│   ├── shared/
│   │   ├── types.ts                   # NarrativeContent type added
│   │   └── validate.ts                # narrative schema validation added
│   └── report/
│       ├── template.ts                # narrative banner + per-view paragraphs
│       └── main.ts                    # narrative rendering, textContent-based
```

No new top-level directories; this is additive to the existing structure.

## 7. Backward compatibility / standalone use

The base skill's zero-AI, fully-standalone CLI usage is preserved
unconditionally: running `analyze.js` without `--narrative` (whether or not
`--data-out` is passed) produces exactly the base skill's report, byte-for
-byte unchanged in the graphs/data portions. This matters because the
README's dev-regen command and any direct end-user CLI invocation have no
Claude session to author a narrative — they must keep working exactly as
documented in the base skill's spec.

## 8. Safety

Carries over the base skill's safety section unchanged (§12 of the base
spec): no source-code contents/snippets embedded, no author emails, no
network calls, nothing written into the target repo. The narrative text
itself is subject to the same "never embed source-code contents/snippets"
rule — insights and reading-list reasons describe files by path and by
computed metrics, never by quoting their contents.

## 9. Testing

- Schema validation tests for `narrative.schema.json` (valid shape,
  missing-field rejection).
- CLI smoke test for `--render-only`: given a pre-built `data.json` and a
  `narrative.json` fixture, asserts the rendered HTML contains the
  narrative banner and per-view paragraphs, and that omitting `--narrative`
  reproduces the base skill's graphs-only output.
- Template/render test confirming narrative strings are inserted via safe
  DOM APIs (a fixture narrative containing `<script>`-shaped text must not
  execute or appear as markup in the output).
- `examples/example-report.html` regenerated once at the end with a real,
  dogfooded narrative pass over this repo, so the shipped example reflects
  the finished experience.

## 10. Explicitly out of scope for this iteration

- **Diff/PR-aware narrative** — commentary on *what changed* (recent
  commits, a specific PR/branch diff) rather than describing the analyzed
  snapshot as-is. Deferred; would need a defined base ref, handling for
  repos with no PR context, and `gh` CLI as an optional dependency. Kept
  here as a backlog item so it isn't re-derived from scratch later.
- **Interactive guided tour UX** (step-by-step overlay with highlighting
  and Next/Back navigation). The narrative ships as static prose woven into
  the page, read top-to-bottom like the rest of the report.

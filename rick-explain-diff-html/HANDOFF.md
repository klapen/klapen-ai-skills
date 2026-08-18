# `rick-explain-diff-html` — Agent Handoff Brief

Short, self-contained brief for a Claude (or other agent) session picking
this skill up cold. Paste this into a new session alongside the task.

**Repo:** `github.com/klapen/klapen-ai-skills` (installed at `~/.claude/skills/rick-explain-diff-html/` after symlinking per the repo README).
**Path:** `rick-explain-diff-html/`
**Authoritative spec:** [`SKILL.md`](SKILL.md) &mdash; defer to it on any conflict with this brief.

---

## Purpose

Generates a rich, interactive, single-file HTML report explaining a code
change, narrated by Rick Sanchez inside a "RickOS v137.0" alien-OS UI. Reads
like a real PR review tool: sticky nav header, summary with mechanical
stats, risk breakdown, optional file-shape treemap, interactive flow
diagram, full annotated file-by-file diff, evidence-linked comprehension
quiz, and a verdict panel.

## Design goals (non-negotiable)

1. **Low per-run token cost.** All chrome (CSS, HTML shell, D3, d3-sankey,
   highlight.js, 5 chart renderers, animated SVG banners) is bundled once
   and inlined by the renderer. So is every mechanical fact about the diff
   itself &mdash; per-file line content, adds/dels, file stats, the treemap's
   dataset &mdash; computed by `render.py`'s unified-diff parser, not
   written by Claude. Claude only produces the per-PR **payload JSON**
   (editorial judgment: risk scores, which files get commentary, quiz
   questions, concerns) + **2 prose HTML fragments**.
2. **Variety without extra tokens.** Every run randomly picks from 8 SVG
   banners (or none), 6 themes, 4 OS chromes, pooled boot-log lines, and
   footer quips. All variety lives in files, not in Claude's output.
3. **Rick's voice, technically correct.** Persona is "performative
   nihilist" &mdash; arrogant on the surface, obsessively perfectionist in
   the work. Technical explanations are brutally clear and accurate; the
   snark is decoration.

## Workflow (three-phase)

```bash
# Phase 1 — collect. Resolves branch/range/GitHub-PR-URL/GitLab-MR-URL
# into a diff + PR metadata JSON on stdout, AND persists the raw diff to
# /tmp/rick-diff-<slug>.diff (needed by Phase 3).
python3 rick-explain-diff-html/scripts/render.py collect --target <ref-or-url>

# Phase 2 — Claude reads the diff, writes:
#   /tmp/rick-payload-<slug>.json    (structured payload: pr_meta, risk,
#                                     shape?, chart, files[] annotations,
#                                     look_here?, quiz, concerns?)
#   /tmp/rick-sections-<slug>.html   (two HTML section fragments, delimited
#                                     by <!-- SECTION: summary|core_logic -->)

# Phase 3 — render. Merges Claude's payload with a mechanical diff parse,
# assembles the final HTML. --diff is required (from Phase 1's diff_path).
python3 rick-explain-diff-html/scripts/render.py render \
    --payload  /tmp/rick-payload-<slug>.json \
    --sections /tmp/rick-sections-<slug>.html \
    --diff     /tmp/rick-diff-<slug>.diff \
    [--theme <name>] [--chrome <name>] [--seed <int>] [--lang en|es|pt] [--no-open]
```

Output: `/tmp/YYYY-MM-DD-explanation-<slug>.html`.

**Trigger phrases:** `/rick-explain-diff-html [target] [lang]` or natural
language ("Rick explain this branch", "Rick's take on <URL>",
"Rick, en español, explica este MR"). The optional `lang` is `en`, `es`,
or `pt` — defaults to English.

**Language handling.** When a non-English lang is requested, write the
entire payload prose in that language: risk item names/notes, shape
note, chart labels, file notes and callouts, look_here items, quiz
Q/options/feedback, concerns, plus both section fragments (`summary`,
`core_logic`). Keep code identifiers, function names, and Rick-canon
references (Cronenberg, Mr. Meeseeks) untranslated. Rick's voice —
arrogant, condescending, stutters, `*urp*` — carries over into ES/PT
just fine. Then pass `--lang <code>` to `render.py render` so
`<html lang>` matches. Static UI (section headers, buttons, chrome
brand strings, "Rick flags this ·") auto-switches at runtime and does
NOT need to be in the payload.

## Payload contract (Claude's output)

- `pr_slug` &mdash; kebab-case, drives filename.
- `pr_meta` &mdash; `{title, number?, branch, base, author?, opened?, commits?}`,
  best-effort from Phase 1's PR metadata. Omit unknown optional keys, never
  fabricate.
- `risk.composite` (0&ndash;100) + `risk.label` + `risk.items` &mdash; 2-6
  named dimensions actually relevant to this diff, each
  `{name, score, pct, tone: "ok"|"warn"|"bad", note}`. Drives the risk bars.
- `shape` &mdash; **optional**, `{"note": "..."}`. Omit the key to skip the
  treemap section entirely (e.g. trivial one-file diffs). The treemap's
  actual data is mechanical, not written here.
- `chart.type` &isin; `force | state | sequence | sankey`. Pick per diff
  shape (module graph / logic change / API flow / data pipeline).
  `chart.data` shape depends on type &mdash; see SKILL.md for schemas.
  Unchanged from the previous version of this skill.
- `files` &mdash; array of `{path, note, callout?, open?}`. Only annotate
  files worth commentary &mdash; every changed file appears regardless
  (path/status/adds/dels/full line diff come from the mechanical parse).
- `look_here` &mdash; **optional**, 0-3 `{file, label, note, tone?}`.
- `quiz` &mdash; **exactly 4** items, each
  `{question, options: [4 strings], correct: 0–3, feedback: [4 strings], file?, where?}`.
  - Options must NOT include letter prefixes ("A. ", "B) ") &mdash; the
    JS prepends them.
  - Distractors must be **plausible** engineering choices; no jokes in
    options. Rick's snark goes in `feedback`.
  - **Option order in the payload doesn't matter.** `core.js` shuffles
    each item's options on every page load (Fisher-Yates, with
    `feedback` and `correct` re-anchored in lockstep). Put the correct
    answer wherever it reads naturally.
  - `file`/`where` are optional but encouraged &mdash; renders an
    evidence link into the Files section.
- `concerns` &mdash; **optional**, 0-N `{severity: "HIGH"|"MEDIUM"|"LOW", text, file?, where?}`.

## Prose fragments (two required)

- `summary` &mdash; Rendered into the Summary section's "What it does"
  panel. Now covers what used to be two fragments: 2-sentence executive
  summary, then optionally
  `<div class="callout">Skip if your IQ passes room temperature.</div>`
  followed by broader background. Keep it to a few short paragraphs.
- `core_logic` &mdash; narrative that pairs with the Flow diagram.
  **The diagram is rendered ABOVE this prose**, so if you reference it
  positionally use "above".

There is no `context` or `walkthrough` fragment anymore &mdash; background
folds into `summary`; the file walkthrough is now the mechanical Files
section driven by `payload.files[].note`/`.callout`.

All code snippets go inside `<pre>` or `<pre><code>`; `highlight.js`
auto-detects language.

## Available themes and chromes

- Themes (all IDE-grade, high readability):
  `gruvbox-dark` (default aesthetic), `nord`, `solarized-dark`, `dracula`,
  `tokyo-night`, `catppuccin-mocha`.
- Chromes: `rickos-v137`, `portal-terminal`, `council-hud`,
  `space-cruiser-bridge`.

## File layout

```
rick-explain-diff-html/
├── SKILL.md                    # authoritative spec; read this first
├── HANDOFF.md                  # this file
├── scripts/render.py           # collect + render subcommands + diff parser
├── template/                   # base.html, core.css, core.js,
│                               # d3.min.js, d3-sankey.min.js, highlight.min.js
├── assets/
│   ├── banners/  (8 SVG)       # rotate randomly per run; see banner-svg-guidelines.md
│   ├── themes/   (6 CSS)       # --rk-bg/-deep/-surface/-text/-dim/-accent/-ok/-warn/-bad/-info
│   ├── chrome/   (4 HTML)      # sticky headers, self-contained (nav hardcoded)
│   ├── charts/   (5 JS)        # force-graph, state-machine, sequence-flow, sankey, treemap
│   └── flourishes/             # boot-log.txt, footer-quips.txt
└── examples/
    ├── example.html            # rendered demo report (fictional cache-through PR)
    ├── example-payload.json    # reproducible with --seed 42
    ├── example-sections.html
    └── example.diff            # the synthetic diff the example is rendered from
```

`assets/gauges/` is gone &mdash; the single risk gauge was replaced by named
risk bars (`payload.risk.items`), so gauge widgets have no role anymore.

## Common pitfalls to avoid

- Don't skip `--diff` in Phase 3 &mdash; it's required, and it's the
  `diff_path` printed by Phase 1's `collect`, not something Claude invents.
- Don't emit letter-prefixed quiz options.
- Don't waste tokens re-ordering quiz options for position balance &mdash;
  `core.js` shuffles A/B/C/D on every page load. Write options in
  whatever order reads naturally.
- Don't reference "diagram below" &mdash; the layout puts the diagram
  above the core_logic prose.
- Don't write a `files[]` entry for every changed file just to be thorough
  &mdash; only annotate the ones worth Rick's commentary. The rest still
  show up with their full diff, just no note/callout.
- Don't fabricate `pr_meta` fields (commit count, author) you don't
  actually have from Phase 1 &mdash; omit the key instead.
- Don't add character imagery (real Rick artwork is copyrighted); use
  the abstract SVG banners, and follow `assets/banner-svg-guidelines.md`
  if adding a new one.

---

*This brief is a summary. When in doubt, read
[`SKILL.md`](SKILL.md) &mdash; it's the source of truth.*

---
name: rick-explain-diff-html
description: >
  Use when the user asks for a rich, interactive, single-file HTML explanation
  of a code change, diff, branch, or PR/MR — styled as "RickOS v137.0" with
  Rick Sanchez narration. Trigger phrases include: `/rick-explain-diff-html`,
  "Rick explain this branch", "Rick's take on <URL>", "Rick, look at this diff".
metadata:
  version: 0.2.0
  author: klapen
---

# rick-explain-diff-html

Generates a rich, interactive, single-file HTML report explaining a code
change, narrated by Rick Sanchez inside a "RickOS v137.0" alien-OS UI.

The report reads like a real PR review tool: a sticky nav header, a summary
with mechanical stats, a risk breakdown, an optional file-shape treemap, an
interactive flow diagram, a full annotated file-by-file diff, a comprehension
quiz tied to specific evidence, and a verdict panel. Every run picks random
visual variants (banner, theme, OS chrome, boot log, footer quips), so
consecutive reports look and feel different.

## Persona & Tone

Rick Sanchez — "performative nihilist":
- Arrogant, condescending, cynical. Claims he doesn't care.
- BUT his work contradicts him: obsessively perfectionist. He builds an
  impossibly clean, hyper-detailed report just to prove he's better.
- Speech habits: stutters ("L-l-listen"), burps ("*urp*"), sci-fi analogies.
- Treats the reader like Morty-level intellect, but the technical
  explanation is brutally clear and accurate.

## How to run this skill

The skill has a **three-phase** workflow. Phase 3 needs the raw diff file
that Phase 1 persists — don't skip straight from payload/sections to render.

### Phase 1 — Collect context

Run the renderer's `collect` subcommand to resolve the target into a diff
plus optional PR/MR metadata:

```bash
python3 ~/work/personal/klapen-skils/rick-explain-diff-html/scripts/render.py collect \
    --target "<branch | A..B | https://github.com/... | https://gitlab.../-/merge_requests/N>"
```

If the user did not provide a target, omit `--target` (uses current branch
vs. its merge base).

The command prints a JSON blob on stdout with keys:
- `slug` — kebab-case filename slug.
- `diff` — full git diff text.
- `pr` — `{"title", "body", "comments"}` if a PR/MR URL was resolved, else null.
- `provider` — `"github" | "gitlab" | "local"`.
- `diff_path` — where the raw diff was also persisted (`/tmp/rick-diff-<slug>.diff`).
  Phase 3 needs this path — it's how the renderer mechanically parses the
  diff into per-file line data without spending Claude tokens on it.

If the JSON contains an `error` key instead, print Rick's error to the user
and stop.

### Phase 2 — Analyze + generate payload

Read the diff (and PR metadata if present). Produce two files:

**A. `/tmp/rick-payload-<slug>.json`** — the structured payload for the report.
Only the fields below are Claude's to write — everything else (per-file line
content, adds/dels counts, file stats, the treemap's file-size data) is
computed mechanically by `render.py` from the diff at render time, so it
never costs a token and can never drift from the real diff.

```json
{
  "pr_slug": "add-portal-auth",
  "pr_meta": {
    "title": "Add Redis cache-through layer to /widgets",
    "number": 4821,
    "branch": "feat/widgets-cache-through",
    "base": "main",
    "author": "m.smith",
    "opened": "2d ago",
    "commits": 6
  },
  "risk": {
    "composite": 42,
    "label": "medium",
    "items": [
      {"name": "Blast radius", "score": "3/5", "pct": 60, "tone": "warn",
       "note": "one live endpoint, a handful of existing lines touched."}
    ]
  },
  "shape": { "note": "Two thirds of this PR is a new file and its tests." },
  "chart": {
    "type": "sequence",
    "data": { "actors": ["Client", "Service"], "messages": [] }
  },
  "files": [
    {"path": "services/widgets/cache.py",
     "note": "The whole feature. One class, no globals.",
     "callout": "On a Redis error you return the LRU value with no metric and no log.",
     "open": true}
  ],
  "look_here": [
    {"file": "services/widgets/cache.py", "label": "cache.py · get() fallback path",
     "note": "Fail-open on Redis errors. Confirm you want stale-tolerant reads.", "tone": "bad"}
  ],
  "quiz": [
    {
      "question": "What does the new `authorize()` decorator actually do?",
      "file": "services/widgets/cache.py",
      "where": "cache.py:20",
      "options": ["Nothing.", "Logs.", "Wraps handlers with a permission check.", "Sends portal-fluid samples to Rick."],
      "correct": 2,
      "feedback": ["Wrong. It does something, Morty. Try harder.", "Cute guess. Also wrong.", "Correct. Somehow. Don't get used to being right.", "*urp* Extremely wrong. Almost impressive."]
    }
  ],
  "concerns": [
    {"severity": "HIGH", "text": "Redis fallback is silent — no metric, no log.",
     "file": "services/widgets/cache.py", "where": "cache.py:20"}
  ]
}
```

Payload contract, field by field:

- `pr_slug` — kebab-case, drives the output filename.
- `pr_meta` — best-effort, from Phase 1's `pr` metadata (or just the branch
  name for local diffs). `title` should read like a real PR title. Omit any
  key you don't actually know (`number`, `author`, `opened`, `commits` are
  all optional) — never fabricate a commit count or an author.
- `risk.composite` — integer 0–100. `risk.label` — short tone word
  (`low`/`medium`/`high`, or similar). `risk.items` — **2 to 6** named
  dimensions, picked because they're actually relevant to *this* diff (a
  docs-only PR has no "Migration" risk — don't include it). Each item:
  `name`, `score` (a short display string like `"3/5"`), `pct` (0–100, drives
  the bar width), `tone` (`ok|warn|bad`), `note` (one clause, starts with an
  em dash reads naturally: `"— no schema change, no backfill."`).
  Reasonable candidate dimensions: Blast radius, Test coverage, Migration,
  Dependencies, Rollback, Observability, Security, Performance — pick what
  fits, don't pad to hit a count.
- `shape` — **optional**. Omit the key entirely to skip the "Shape of the
  diff" section (e.g. for a tiny one-file diff where a treemap adds nothing).
  Include it only with `{"note": "..."}` — one editorial sentence. The
  treemap's actual per-file size/color data is built mechanically by
  `render.py` from the diff, not written here.
- `chart` — unchanged from before. `chart.type` ∈ `force | state | sequence
  | sankey`, picked per diff shape (module graph / logic change / API call
  order / data pipeline). `chart.data` shape depends on type:
  - `force` → `{ nodes: [{id, label, group?}], edges: [{source, target, kind?: "added"|"removed"}] }`
  - `state` → `{ before: {states: [{id,label}], transitions: [{from,to,label?}]}, after: {...} }`
  - `sequence` → `{ actors: [string], messages: [{from, to, label, side?: "before"|"after"}] }`
  - `sankey` → `{ nodes: [{name}], flows: [{source, target, value, kind?: "before"|"after"}] }`
    (source/target are integer indices into `nodes`.)
- `files` — array of `{path, note, callout?, open?}`. **You don't need an
  entry for every changed file** — `render.py` discovers every file, its
  status (NEW/EDIT/DELETED/RENAMED), its adds/dels, and its full line-by-line
  diff content mechanically. Any file you don't annotate here still appears
  in the report with an empty note. Only write `note`/`callout` for files
  worth commentary; set `open: true` on the 1-3 files a reviewer should see
  expanded by default. `path` must match a real path from the diff exactly.
- `look_here` — **optional**, 0–3 items: `{file, label, note, tone?}`.
  `tone` ∈ `bad|warn` (omit for the neutral/accent look). These populate the
  Summary section's "Look here first" shortcut list.
- `quiz` — **exactly 4** items, each `{question, options: [4 strings],
  correct: 0-3, feedback: [4 strings], file?, where?}`.
  - `file`/`where` are optional but strongly encouraged — they render as an
    "evidence: <where>" link that jumps to and expands that file in the
    Files section. `where` is a short label like `"cache.py:20"`.
  - Options must NOT include letter prefixes ("A. ", "B) ") — the JS
    prepends them.
  - Distractors must be **plausible** engineering choices; no jokes in
    options. Rick's snark goes in `feedback`.
  - **Option order in the payload doesn't matter.** `core.js` shuffles
    each item's options on every page load (Fisher-Yates over the 4
    slots, with `feedback` and `correct` re-anchored in lockstep). Put
    the correct answer wherever it reads naturally; the reader will see
    it in a different slot each time.
- `concerns` — **optional**, 0–N items: `{severity, text, file?, where?}`.
  `severity` ∈ `HIGH|MEDIUM|LOW`. These drive the Verdict section's "Open
  concerns" list. The Approve/Request-changes/Comment buttons next to it are
  static UI flavor (3 canned Rick reaction lines baked into `core.js`) — you
  don't author those.

**B. `/tmp/rick-sections-<slug>.html`** — **two** HTML section fragments
delimited by `<!-- SECTION: name -->` markers:

```html
<!-- SECTION: summary -->
<p>Two-sentence executive summary in Rick's voice.</p>
<div class="callout">Skip if your IQ passes room temperature.</div>
<p>Broader background for beginners, then narrower context on the before-state.</p>

<!-- SECTION: core_logic -->
<p>Narrative that pairs with the Flow diagram, using toy data and stark analogies.</p>
<pre>optional illustrative snippet</pre>
```

Prose guidance:
- **summary** — Rendered into the Summary section's "What it does" panel.
  Now carries what used to be two separate fragments: start with the
  2-sentence executive summary, then (optionally) the
  `<div class="callout">Skip if your IQ passes room temperature.</div>`
  callout followed by broader background for readers who need it. Keep the
  whole thing to a few short paragraphs — the mechanical stats/risk/files
  sections carry the detail now, this panel doesn't need to.
- **core_logic** — Narrative that pairs with the Flow diagram. The diagram
  is rendered **above** this prose fragment, so if you reference it
  positionally use "above" (e.g., "Look at the diagram above"), never
  "below".

There is no `context` or `walkthrough` fragment anymore. Background folds
into `summary`; the file-by-file walkthrough is now the mechanical Files
section (driven by `payload.files[].note`/`.callout`, see above) rather than
free prose.

All code snippets MUST live inside `<pre>` tags so formatting never collapses.
Freeform Rick voice — burps, stutters, sci-fi analogies, condescension — is
encouraged. Content is *technically accurate* even though tone is snarky.

**Syntax highlighting is automatic.** The template inlines `highlight.js` and
auto-detects the language on every `<pre>` and `<pre><code>` block in the
prose fragments (the Files section's diff lines are colored separately, by
+/- sign, not by language). You can wrap snippets as either `<pre>code</pre>`
or `<pre><code>code</code></pre>` — both are highlighted. Optionally add
`class="language-python"` (or ts, sql, yaml, json, bash, diff, html, css,
xml, markdown) to `<code>` to lock the language; auto-detect is usually
correct without it.

### Phase 3 — Render

Run the renderer's `render` subcommand. `--diff` is required — it's the
`diff_path` that Phase 1's `collect` printed.

```bash
python3 ~/work/personal/klapen-skils/rick-explain-diff-html/scripts/render.py render \
    --payload /tmp/rick-payload-<slug>.json \
    --sections /tmp/rick-sections-<slug>.html \
    --diff /tmp/rick-diff-<slug>.diff
```

Optional flags:
- `--slug <name>` — override output filename slug.
- `--theme <name>` — force a specific theme. Available themes (all IDE-grade
  dark palettes with proven readability): `gruvbox-dark`, `nord`,
  `solarized-dark`, `dracula`, `tokyo-night`, `catppuccin-mocha`.
- `--chrome <name>` — force a specific OS chrome. Available:
  `rickos-v137`, `portal-terminal`, `council-hud`, `space-cruiser-bridge`.
- `--seed <int>` — reproducible RNG seed (controls banner/theme/chrome pick
  and boot-log/footer-quip sampling).
- `--no-open` — skip auto-opening the browser.

The script writes to `/tmp/YYYY-MM-DD-explanation-<slug>.html` and opens it
in the user's default browser (macOS: `open`, Linux: `xdg-open`,
Windows: `os.startfile`). The path is printed on stdout so it's visible
even if auto-open fails.

## Report structure

1. **Sticky header** — one of 4 OS chrome variants (nav links to every
   section, a CRT/effects toggle).
2. **Hero strip** — collapsible: one of 8 animated SVG banners + a sampled
   boot log. Collapses to a one-line tail.
3. **Summary** — PR title/branch/stats (mechanical), the `summary` prose
   fragment, and the optional "Look here first" shortcut list.
4. **Risk breakdown** — named risk bars from `payload.risk`.
5. **Shape of the diff** *(optional)* — treemap of changed files, sized by
   lines changed, colored by add/remove ratio. Click a tile to jump to that
   file below. Omitted entirely when `payload.shape` is absent.
6. **Flow** — the existing force/state/sequence/sankey diagram, paired with
   the `core_logic` prose fragment.
7. **Files** — full annotated diff, every changed file, collapsible,
   syntax-colored by +/-, with your `note`/`callout` where provided.
8. **Quiz** — 4-question comprehension check, each optionally evidence-linked
   into the Files section, plus a final score + Rick-tier rank.
9. **Verdict** — your `concerns` list plus static Approve / Request changes /
   Comment buttons (cosmetic — no data leaves the browser).

## What varies per run (random)

- **Banner** — 8 original abstract SVG banners (portal ring, lab flask, DNA
  helix, retro CRT, rocket, molecule, satellite dish, brain-in-a-jar), or
  none. All animated, all theme-color-aware, all authored fresh — no
  character imagery, zero copyright risk. New variants must follow
  `assets/banner-svg-guidelines.md` if you're asked to add one.
- **Theme** — 6 IDE-grade dark palettes: `gruvbox-dark` (warm, emacs classic),
  `nord` (cool arctic), `solarized-dark`, `dracula`, `tokyo-night`,
  `catppuccin-mocha`. All chosen for hours-of-reading contrast.
- **OS chrome** — 4 sticky-header variants, each with its own nav styling
  and toggle wording (CRT / goop / HUD / viewscreen).
- **Boot log** — 5 lines sampled from a pool of ~30.
- **Footer quips** — 2 sampled from a pool of ~20.

## What's fixed

- Base HTML skeleton (`template/base.html`).
- Core CSS (`template/core.css`).
- Quiz engine, risk-bar/stats/files rendering, hero collapse, chrome
  toggles, chart bootstrap, Before/After toggle (`template/core.js`).
- D3 v7 + d3-sankey (inlined from `template/`).
- The 5 D3 chart renderers (`assets/charts/*.js`: force, state, sequence,
  sankey, treemap).
- The unified-diff parser that produces per-file line data, adds/dels
  counts, and the treemap's dataset (`scripts/render.py`).

None of these come from Claude's token output — they're bundled once and
inlined by the renderer, or computed mechanically from the diff.

## Token budget

The payload+sections hand-off keeps Claude's output focused on editorial
judgment — risk scoring, which files matter, quiz questions, prose. All
per-line diff content, file stats, and treemap data are computed by
`render.py`, not written by Claude. Rough target: **< 3,500 tokens** for a
typical mid-sized PR, same as before — the payload got richer in *shape*,
not in the amount Claude has to type.

## Failure modes

- **Missing sections** — the renderer inserts a Rick-flavored error paragraph
  in place of any prose fragment that isn't found in the sections file.
- **Missing/malformed payload keys** — `core.js` renders inline errors in the
  chart or quiz slot as appropriate; a missing `shape` key just hides that
  section (this is the normal, expected way to skip it).
- **`--diff` not passed, or the file doesn't exist** — `render` fails fast
  with a clear error. This is new in this version — don't skip straight from
  Phase 2 to `render` without Phase 1's `diff_path`.
- **Very large per-file diffs** — capped at ~300 changed lines per file, with
  a "N more lines omitted" notice, so one huge generated file can't blow up
  the report.
- **`gh` / `glab` unavailable** — public URLs fall back to fetching the
  `.diff` URL; private repos error out with a clear "install gh/glab" message.
- **Not in a git repo (and no URL target)** — Rick complains and exits.

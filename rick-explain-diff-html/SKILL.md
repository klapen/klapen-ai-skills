---
name: rick-explain-diff-html
description: >
  Use when the user asks for a rich, interactive, single-file HTML explanation
  of a code change, diff, branch, or PR/MR — styled as "RickOS v137.0" with
  Rick Sanchez narration. Trigger phrases include: `/rick-explain-diff-html`,
  "Rick explain this branch", "Rick's take on <URL>", "Rick, look at this diff".
metadata:
  version: 0.1.0
  author: klapen
---

# rick-explain-diff-html

Generates a rich, interactive, single-file HTML report explaining a code
change, narrated by Rick Sanchez inside a "RickOS v137.0" alien-OS UI.

Every run picks random visual variants (banner, theme, OS chrome, gauge,
boot log, footer quips), so consecutive reports look and feel different.

## Persona & Tone

Rick Sanchez — "performative nihilist":
- Arrogant, condescending, cynical. Claims he doesn't care.
- BUT his work contradicts him: obsessively perfectionist. He builds an
  impossibly clean, hyper-detailed report just to prove he's better.
- Speech habits: stutters ("L-l-listen"), burps ("*urp*"), sci-fi analogies.
- Treats the reader like Morty-level intellect, but the technical
  explanation is brutally clear and accurate.

## How to run this skill

The skill has a **two-phase** workflow:

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

If the JSON contains an `error` key instead, print Rick's error to the user
and stop.

### Phase 2 — Analyze + generate payload

Read the diff (and PR metadata if present). Produce two files:

**A. `/tmp/rick-payload-<slug>.json`** — the structured payload for the report:

```json
{
  "pr_slug": "add-portal-auth",
  "risk": {
    "value": 65,
    "label": "Dumb but survivable"
  },
  "chart": {
    "type": "force",
    "data": {
      "nodes": [{"id": "auth", "label": "auth.py"}, {"id": "api", "label": "api.py"}],
      "edges": [{"source": "auth", "target": "api", "kind": "added"}]
    }
  },
  "quiz": [
    {
      "question": "What does the new `authorize()` decorator actually do?",
      "options": [
        "Nothing.",
        "Logs.",
        "Wraps handlers with a permission check.",
        "Sends portal-fluid samples to Rick."
      ],
      "correct": 2,
      "feedback": [
        "Wrong. It does something, Morty. Try harder.",
        "Cute guess. Also wrong.",
        "Correct. Somehow. Don't get used to being right.",
        "*urp* Extremely wrong. Almost impressive."
      ]
    }
  ]
}
```

Payload contract:
- `pr_slug` — kebab-case, drives the output filename.
- `risk.value` — integer 0-100. Drives the risk gauge.
- `risk.label` — short label under the gauge.
- `chart.type` — one of `force | state | sequence | sankey`.
- `chart.data` — schema depends on `chart.type`:
  - `force` → `{ nodes: [{id, label, group?}], edges: [{source, target, kind?: "added"|"removed"}] }`
  - `state` → `{ before: {states: [{id,label}], transitions: [{from,to,label?}]}, after: {...} }`
  - `sequence` → `{ actors: [string], messages: [{from, to, label, side?: "before"|"after"}] }`
  - `sankey` → `{ nodes: [{name}], flows: [{source, target, value, kind?: "before"|"after"}] }`
    (source/target are integer indices into `nodes`.)
- `quiz` — array of exactly 5 items, each `{question, options: [4 strings], correct: 0-3, feedback: [4 strings]}`.
  - **Option strings must NOT include letter prefixes** ("A. ", "B) ", etc.). The template's JS prepends `A.`, `B.`, `C.`, `D.` automatically. If you accidentally include a leading letter+punct, it is stripped defensively — but the canonical form is prefix-free.
  - **Distractors must be plausible.** All four options should sound like real engineering choices — approaches a competent developer might have taken. No jokes, no absurdist wrong answers, no options that are obviously silly. The wrong answers should be technically-flavored, similar-length, similar-tone. Test whether the reader actually understood the *specific* design choice this MR made, not whether they can spot the joke. Rick's snark goes in the *feedback strings*, not in the options themselves. Aim for questions where a distracted senior engineer could plausibly pick any of the four — only careful reading of the diff surfaces the right answer.

Pick `chart.type` based on what best explains the diff:
- Dependency shifts between modules → `force`
- Logic/workflow change → `state`
- API handler / call-order change → `sequence`
- Data pipeline change → `sankey`

**B. `/tmp/rick-sections-<slug>.html`** — four HTML section fragments delimited
by `<!-- SECTION: name -->` markers:

```html
<!-- SECTION: summary -->
<p>...</p>
<p>...</p>

<!-- SECTION: context -->
<p>...</p>
<div class="callout">Skip if your IQ passes room temperature.</div>
<p>...</p>

<!-- SECTION: core_logic -->
<p>...</p>
<pre>diff snippet</pre>

<!-- SECTION: walkthrough -->
<p>...</p>
<div data-toggle>
  <div class="toggle-pane" data-label="Before"><pre>old code</pre></div>
  <div class="toggle-pane" data-label="After"><pre>new code</pre></div>
</div>
```

Prose guidance:
- **summary** — 2 sentences. Executive summary of the PR in Rick's voice.
- **context** — Background for beginners. Include the callout
  `<div class="callout">Skip if your IQ passes room temperature.</div>`
  before the broad background, then a narrower explanation of the
  broken/before state.
- **core_logic** — Narrative that pairs with the SVG diagram. Explain the
  core shift using toy data and stark analogies.
- **walkthrough** — Grouped code-change walkthrough. Wrap comparable
  before/after snippets in `<div data-toggle>` with two
  `<div class="toggle-pane" data-label="Before|After">` children
  each containing a `<pre>` block. The template's `core.js` wires
  up the tabs automatically.

All code snippets MUST live inside `<pre>` tags so formatting never collapses.
Freeform Rick voice — burps, stutters, sci-fi analogies, condescension — is
encouraged. Content is *technically accurate* even though tone is snarky.

**Syntax highlighting is automatic.** The template inlines `highlight.js` and
auto-detects the language on every `<pre>` and `<pre><code>` block. You can
wrap snippets as either `<pre>code</pre>` or `<pre><code>code</code></pre>` —
both are highlighted. Optionally add `class="language-python"` (or ts, sql,
yaml, json, bash, diff, html, css, xml, markdown) to `<code>` to lock the
language; auto-detect is usually correct without it.

### Phase 3 — Render

Run the renderer's `render` subcommand:

```bash
python3 ~/work/personal/klapen-skils/rick-explain-diff-html/scripts/render.py render \
    --payload /tmp/rick-payload-<slug>.json \
    --sections /tmp/rick-sections-<slug>.html
```

Optional flags:
- `--slug <name>` — override output filename slug.
- `--theme <name>` — force a specific theme. Available themes (all IDE-grade
  dark palettes with proven readability): `gruvbox-dark`, `nord`,
  `solarized-dark`, `dracula`, `tokyo-night`, `catppuccin-mocha`.
- `--chrome <name>` — force a specific OS chrome. Available:
  `rickos-v137`, `portal-terminal`, `council-hud`, `space-cruiser-bridge`.
- `--seed <int>` — reproducible RNG seed.
- `--no-open` — skip auto-opening the browser.

The script writes to `/tmp/YYYY-MM-DD-explanation-<slug>.html` and opens it
in the user's default browser (macOS: `open`, Linux: `xdg-open`,
Windows: `os.startfile`). The path is printed on stdout so it's visible
even if auto-open fails.

## What varies per run (random)

- **Banner** — 8 original abstract SVG banners (portal ring, lab flask, DNA
  helix, retro CRT, rocket, molecule, satellite dish, brain-in-a-jar).
  All animated, all theme-color-aware, all authored fresh — no character
  imagery, zero copyright risk.
- **Theme** — 6 IDE-grade dark palettes: `gruvbox-dark` (warm, emacs classic),
  `nord` (cool arctic), `solarized-dark`, `dracula`, `tokyo-night`,
  `catppuccin-mocha`. All chosen for hours-of-reading contrast.
- **OS chrome** — 4 top-bar variants.
- **Risk gauge** — 4 widget styles (analog dial, LCD bar, portal-fluid tube,
  Geiger needle).
- **Boot log** — 5 lines sampled from a pool of ~30.
- **Footer quips** — 2 sampled from a pool of ~20.

= 768 base chrome combinations before boot-log/footer variety. Consecutive
runs on similar PRs will visibly differ.

## What's fixed

- Base HTML skeleton (`template/base.html`).
- Core CSS (`template/core.css`).
- Quiz engine + gauge animation + Before/After toggle + chart bootstrap
  (`template/core.js`).
- D3 v7 + d3-sankey (inlined from `template/`).
- The 4 D3 chart renderers (`assets/charts/*.js`).

None of these come from Claude's token output — they're bundled once and
inlined by the renderer.

## Token budget

The two-file payload+sections hand-off keeps Claude's output focused on
the actual per-PR content. Rough target: **< 3,500 tokens** for a typical
mid-sized PR. The rest is chrome, and chrome lives in files.

## Failure modes

- **Missing sections** — the renderer inserts a Rick-flavored error paragraph
  in place of any section that isn't found in the sections file.
- **Missing/malformed payload keys** — `core.js` renders inline errors in the
  gauge, chart, or quiz slot as appropriate.
- **`gh` / `glab` unavailable** — public URLs fall back to fetching the
  `.diff` URL; private repos error out with a clear "install gh/glab" message.
- **Not in a git repo (and no URL target)** — Rick complains and exits.

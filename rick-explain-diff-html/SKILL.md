---
name: rick-explain-diff-html
description: >
  Use when the user asks for a rich, interactive, single-file HTML explanation
  of a code change, diff, branch, or PR/MR — styled as "RickOS v137.0" with
  Rick Sanchez narration. Trigger phrases include: `/rick-explain-diff-html
  [<target>] [<lang>]`, "Rick explain this branch", "Rick's take on <URL>",
  "Rick, look at this diff". Optional language argument (`en` | `es` | `pt`)
  makes Rick write the entire report in that language; defaults to English.
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

**Refresh the repo first.** MR branches move: owners push follow-up commits,
rebase after review, absorb suggestions, or their branch gets fast-forwarded
when a stacked parent is merged. Stale local state produces stale reports —
wrong file counts, wrong line numbers, comments on lines that no longer
exist, or (worst) contradicting the reviewer's actual GitLab/GitHub view.

Before Phase 1's `collect`, always run — even if you fetched the same MR
earlier in this session:

```bash
# GitLab MR (adjust ref path for GitHub PRs: refs/pull/N/head:pr-N)
cd <repo-checkout>
git fetch origin main --force
git fetch origin "refs/merge-requests/<N>/head:pr-<N>" --force
```

Then check whether the branch has been rebased or the target moved since
your last look — a one-line ancestry check catches most surprises:

```bash
git log pr-<N> --oneline -5
git merge-base --is-ancestor pr-<N>~1 origin/main && echo "clean base" || echo "diverged"
```

If a previously-open sibling MR (e.g. the request-side pair to a
response-side follow-up) may have merged since your last review, verify:

```bash
glab mr view <sibling-N> --output json | jq -r '.state, .merged_at'
```

If the sibling merged and this branch was stacked on it, the diff you're
about to collect can look very different from what you saw before — even
without any authored changes on this branch. Reset your assumptions from
scratch after every refresh.

Run the renderer's `collect` subcommand to resolve the target into a diff
plus optional PR/MR metadata:

```bash
python3 ~/.claude/skills/rick-explain-diff-html/scripts/render.py collect \
    --target "<branch | A..B | https://github.com/... | https://gitlab.../-/merge_requests/N>" \
    [--repo /absolute/path/to/local/checkout]
```

If the user did not provide a target, omit `--target` (uses current branch
vs. its merge base).

**Pass `--repo` whenever a local checkout is available.** If the current
working directory is inside the project's git repo (i.e. `git rev-parse --show-toplevel` in
the CWD resolves), or the user pointed at a checkout somewhere, pass the
absolute path via `--repo`. This unlocks the fact-checking step in
Phase 2 (see below). If no checkout is available, omit `--repo` and skip
the verification — but say so in the report.

The command prints a JSON blob on stdout with keys:
- `slug` — kebab-case filename slug.
- `diff` — full git diff text.
- `pr` — `{"title", "body", "comments"}` if a PR/MR URL was resolved, else null.
- `provider` — `"github" | "gitlab" | "local"`.
- `diff_path` — where the raw diff was also persisted (`/tmp/rick-diff-<slug>.diff`).
  Phase 3 needs this path — it's how the renderer mechanically parses the
  diff into per-file line data without spending Claude tokens on it.
- `repo` — absolute path to the local checkout, **only when `--repo` was given**.
  Use it in Phase 2 to grep for evidence supporting your concerns.

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
- `chart` — pick `chart.type` per diff shape (module graph / logic change /
  API call order / data pipeline). Reference-resolution rules vary by
  chart type — mismatches produce silently-dropped edges, so **read the
  bullet for your type carefully**. `render.py` runs a lint pass at Phase
  3 that prints an `[warn] chart lint: …` block to stderr if any
  reference is unresolvable, and the chart JS draws a red banner on the
  report itself listing every dropped edge/message.
  - `force` → `{ nodes: [{id, label, group?}], edges: [{source, target, kind?: "added"|"removed"}] }`.
    `source`/`target` are **node `id` strings** (matched by identity).
  - `state` → `{ before: {states: [{id,label}], transitions: [{from,to,label?}]}, after: {...} }`.
    `from`/`to` are **state `id` strings** within the same before/after block.
  - `sequence` → `{ actors: [string], messages: [{from, to, label, side?: "before"|"after"}] }`.
    `from`/`to` are **actor name strings** (matched against the `actors`
    array via `indexOf`). Integer indices are accepted defensively but
    discouraged — use the strings so the payload is human-readable. Example:
    ```json
    {"actors": ["Client", "Server", "DB"],
     "messages": [{"from": "Client", "to": "Server", "label": "POST /widgets", "side": "before"}]}
    ```
  - `sankey` → `{ nodes: [{name}], flows: [{source, target, value, kind?: "before"|"after"}] }`.
    `source`/`target` are **integer indices** into `nodes` (this one is
    the odd one out — every other chart type uses id/name strings).
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
- `mr_review` — **optional**. Copy-paste-ready comments for the reviewer to
  drop into the MR/PR interface. Shape:
  ```json
  "mr_review": {
    "overall": "Optional overall MR-level comment (multi-paragraph, markdown-lite).",
    "comments": [
      {
        "file": "path/to/file.py",
        "line": 44,
        "severity": "suggestion",
        "text": "The comment body — usually 1–3 short paragraphs plus an optional code block."
      }
    ]
  }
  ```
  - `overall` — one string; rendered as the top card in the "MR review kit"
    section, no line binding. Skip the key if not applicable.
  - `comments[]` — each entry needs `text` and typically `file` + `line`.
    `line` is the post-image line number (what the reviewer sees on the
    "Changes" tab). `severity` is a badge shown on the card: one of
    `nit | question | suggestion | issue | praise` (falsy → no badge).
  - **When to author this:** whenever `concerns` names a specific file/line
    the reviewer should leave a comment on. Each concern typically maps to
    one `mr_review.comments[]` entry. Rick's *voice* stays in `concerns`
    (in-report analysis, snarky); `mr_review.text` is drafted in a
    **professional, reviewer-friendly tone** — the reader is going to paste
    this into GitLab/GitHub verbatim.
  - The section is rendered only when at least one of `overall`/`comments`
    is present; the whole panel stays hidden otherwise.

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

#### Fact-checking your concerns (when `repo` is available)

If Phase 1's JSON includes a `repo` field, spend one grep pass per concern
**before writing the final payload**. A concern that names a specific file
outside the diff, or claims "X is not validated / not logged / not tested",
is a factual claim — verify it against the checkout.

Typical checks:

- Claim: *"the schema doesn't enforce X"* → grep the generated model file
  under `repo` for `Field(`, `@field_validator`, `@model_validator`.
- Claim: *"there's no logging around Y"* → grep the surrounding module
  for `logger.`, `log.info`, `logging.` calls.
- Claim: *"the test file doesn't cover the None branch"* → open the test
  file and confirm.
- Claim: *"this helper is only called from one site"* → `grep -rn "helper_name" <repo>`
  and count call sites.

If evidence contradicts a concern → **drop it or rewrite it**. If evidence
confirms a concern → include the file:line pointer in the concern body and
in the matching `mr_review.comments[]` entry (concerns whose claims are
verified become copy-paste-ready MR comments). If `repo` is absent, you may
still author speculative concerns, but soften the language ("looks like…",
"worth checking whether…") rather than asserting.

Rick's voice stays snarky in the report; the `mr_review.text` you paste
into GitLab/GitHub stays professional. Verification quality feeds both.

#### Deduping against existing review threads

Phase 1's `pr.comments` contains every comment already posted on the MR/PR,
in a normalized shape: `{author, body, file, line, resolved, url, kind}`.
`kind` is `"review"` for line-attached comments and `"issue"` for
general MR discussion; `resolved` is `true` when the reviewer marked the
thread resolved. Bot accounts (CI scanners, code-review bots,
service-account users) are still included — the UI has a "hide bot
comments" toggle so users can see them if they want, but you should
ignore them when deduping.

**Before writing each `mr_review.comments[]` entry**, walk `pr.comments`
and ask: is there an unresolved human comment on the same `{file, line}`
that raises the same concern? If yes:

- **Drop** the redundant `mr_review` entry — do not post the same
  question or suggestion twice.
- **Acknowledge** the existing thread in `mr_review.overall` (e.g.
  "Another reviewer already raised the retry-loop question, so I won't
  duplicate it; the constant-hoisting suggestion applies regardless of
  how that thread resolves.").
- If your point is a refinement of the existing thread — a concrete
  code example, a follow-up question — post it *as a reply* by wording
  it as such ("Building on @<reviewer>'s thread: …"), rather than a
  fresh top-level comment.

Concerns in `payload.concerns` are separate: they're Rick's in-report
analysis for the reader, not published to the MR. It's fine to keep an
analytical concern in the Verdict panel even when the matching MR
comment gets dropped for being redundant — the reader benefits from
seeing the reasoning, and the MR isn't polluted.

**Prior review threads section.** The report renders a "Prior review
threads" section automatically from `pr.comments` — you don't need to
duplicate that data in the payload. `render.py` auto-loads a sidecar
file (`/tmp/rick-comments-<slug>.json`) that Phase 1 writes when the
MR/PR had comments. You can override or filter by writing your own JSON
into `payload.prior_comments` (same shape as `pr.comments`), or by
passing `--comments <path>` to `render`.

**Verify every `mr_review.comments[].line` is inside the diff's `+` added
set.** GitLab and GitHub attach line comments only to lines that appear on
the MR's "Changes" view — i.e. lines that are `+` (added) or context lines
within a modified hunk. A `line` value that points at unchanged surrounding
code will silently fail to attach (the reviewer opens GitLab, pastes the
comment, and nothing happens — or worse, the comment lands as an
unassociated general note).

The fact-check is mechanical: for each `{file, line}` pair you're about to
emit, confirm the line is in the diff's post-image `+` set. From the raw
diff at `diff_path`:

```bash
python3 - <<'PY'
import re, sys
target_file = "path/to/changed/file.py"
target_line = 495
diff = open("/tmp/rick-diff-<slug>.diff").read()
in_file, newln, in_hunk = False, 0, False
for line in diff.splitlines():
    if line.startswith("--- ") or line.startswith("+++ "):
        in_file = target_file in line
        in_hunk = False
        continue
    if not in_file: continue
    if line.startswith("@@"):
        m = re.search(r"\+(\d+)", line)
        if m: newln = int(m.group(1)) - 1
        in_hunk = True
        continue
    if not in_hunk: continue
    if line.startswith("-"): continue
    newln += 1
    if line.startswith("+") and newln == target_line:
        print("OK — line is a + addition"); sys.exit(0)
print("BAD — line is not in the + added set")
PY
```

If the target isn't in the `+` set: **pick a nearby `+` line that's still
semantically the right anchor for the comment** (usually the TODO
comment, the new function signature, or the first line of the added block).
Never emit a `line` you haven't verified — the whole point of the review
kit is copy-paste-ready comments, and half-broken comments defeat that.

### Phase 3 — Render

Run the renderer's `render` subcommand. `--diff` is required — it's the
`diff_path` that Phase 1's `collect` printed.

```bash
python3 ~/.claude/skills/rick-explain-diff-html/scripts/render.py render \
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
- `--lang <en|es|pt>` — content language. Bakes `<html lang="…">` and
  becomes the report's default UI language when the reader hasn't set a
  preference. Defaults to `en`. **You must author the payload and section
  prose in this language when it isn't English** — see the Language
  section below.
- `--no-open` — skip auto-opening the browser.

The script writes to `/tmp/YYYY-MM-DD-explanation-<slug>.html` and opens it
in the user's default browser (macOS: `open`, Linux: `xdg-open`,
Windows: `os.startfile`). The path is printed on stdout so it's visible
even if auto-open fails.

## Language

If the trigger includes a language code (`/rick-explain-diff-html <target> pt`,
"Rick, in Portuguese, explain this MR", etc.), write everything Rick says
in that language:

- **Payload prose:** `pr_meta.title` (keep the original — it's PR metadata),
  `risk.items[].name`/`note`, `shape.note`, all `chart.data` labels
  (arrows/actors are the reader's language), every `files[].note` and
  `.callout`, `look_here[]` `label`/`note`, `quiz[].question`/`options`/
  `feedback`, `concerns[].text`.
- **Section fragments:** both `summary` and `core_logic` in the target
  language.

Rick's voice adapts: keep the arrogant-perfectionist tone, the burps
(`*urp*`) and stutters (`L-listen up.`) work in any language.
Keep code identifiers, function names, and Rick-canon references
(Cronenberg, Mr. Meeseeks, etc.) in the original form — you're
translating narration, not proper nouns.

Static UI (section headers, buttons, "Rick flags this ·", chrome brand
strings, the language pill itself) is handled by `core.js` at runtime.
Don't spend tokens translating those — they auto-switch when the reader
clicks EN/ES/PT.

Then call `render.py render` with `--lang es|pt` so `<html lang>` is set
correctly and the report opens in that language by default.

If no language is specified, default to English for everything.

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

---
name: rick-explain-diff-html
description: >
  Use when the user asks for a rich, interactive, single-file HTML explanation
  of a code change, diff, branch, or PR/MR — styled as "RickOS v137.0" with
  Rick Sanchez narration. Trigger phrases include: `/rick-explain-diff-html
  [<target>] [<lang>] [--deep]`, "Rick explain this branch", "Rick's take on
  <URL>", "Rick, look at this diff". Optional language argument (`en` | `es` |
  `pt`) makes Rick write the entire report in that language; defaults to
  English. Optional `--deep` flag adds a full business-logic analysis section
  with Mermaid diagrams explaining *why* each change was made — Jira context,
  chain-of-necessity, decision rationale. Off by default. A consistency review
  comparing the diff's patterns against sibling code is always produced.
metadata:
  version: 0.3.0
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
when a stacked parent is merged. Stale local state produces stale reports.

Before Phase 1's `collect`, always run — even if you fetched the same MR
earlier in this session:

```bash
# GitLab MR (adjust ref path for GitHub PRs: refs/pull/N/head:pr-N)
cd <repo-checkout>
git fetch origin main --force
git fetch origin "refs/merge-requests/<N>/head:pr-<N>" --force
```

Then check whether the branch has been rebased or the target moved:

```bash
git log pr-<N> --oneline -5
git merge-base --is-ancestor pr-<N>~1 origin/main && echo "clean base" || echo "diverged"
```

If a previously-open sibling MR may have merged, verify:

```bash
glab mr view <sibling-N> --output json | jq -r '.state, .merged_at'
```

If the sibling merged and this branch was stacked on it, reset all assumptions.

Run the renderer's `collect` subcommand:

```bash
python3 ~/.claude/skills/rick-explain-diff-html/scripts/render.py collect \
    --target "<branch | A..B | https://github.com/... | https://gitlab.../-/merge_requests/N>"
```

If the user did not provide a target, omit `--target` (uses current branch
vs. its merge base).

**Repo is auto-detected.** `collect` runs `git rev-parse --show-toplevel` from
the CWD automatically — no flag needed. Only pass `--repo /path` explicitly
when the CWD is not the right checkout. If no git repo is found, fact-checking
is skipped and the report notes it.

The command prints a JSON blob on stdout with keys:
- `slug` — kebab-case filename slug.
- `diff` — full git diff text.
- `pr` — `{"title", "body", "comments"}` if a PR/MR URL was resolved, else null.
- `provider` — `"github" | "gitlab" | "local"`.
- `diff_path` — where the raw diff was persisted (`/tmp/rick-diff-<slug>.diff`).
  Phase 3 needs this path.
- `repo` — absolute path to the local checkout when one was detected.

If the JSON contains an `error` key instead, print Rick's error to the user
and stop.

### Phase 2 — Analyze + generate payload

**Run Phase 2 in a subagent.** Spawn a subagent and hand it:
- The full Phase 1 JSON output and `diff_path`
- The contents of `~/.claude/skills/rick-explain-diff-html/phase2-instructions.md`
- If `--deep` was requested: also `~/.claude/skills/rick-explain-diff-html/deep-mode.md`

The subagent writes `/tmp/rick-payload-<slug>.json` and
`/tmp/rick-sections-<slug>.html`, then returns those paths. Use
`superpowers:dispatching-parallel-agents` if available; otherwise use whatever
subagent mechanism the runtime provides (e.g. the `Agent` tool).

### Phase 3 — Render

Run the renderer's `render` subcommand. `--diff` is required.

```bash
python3 ~/.claude/skills/rick-explain-diff-html/scripts/render.py render \
    --payload /tmp/rick-payload-<slug>.json \
    --sections /tmp/rick-sections-<slug>.html \
    --diff /tmp/rick-diff-<slug>.diff
```

Optional flags:
- `--slug <name>` — override output filename slug.
- `--theme <name>` — force a theme: `gruvbox-dark`, `nord`, `solarized-dark`,
  `dracula`, `tokyo-night`, `catppuccin-mocha`.
- `--chrome <name>` — force OS chrome: `rickos-v137`, `portal-terminal`,
  `council-hud`, `space-cruiser-bridge`.
- `--seed <int>` — reproducible RNG seed.
- `--lang <en|es|pt>` — content language; defaults to `en`.
- `--no-open` — skip auto-opening the browser.
- `--deep` — enable the deep business-logic analysis section.

The script writes to `/tmp/YYYY-MM-DD-explanation-<slug>.html` and opens it
in the user's default browser.

## Language

If the trigger includes a language code, the Phase 2 subagent must write all
Rick prose (payload fields, section fragments) in that language. Pass `--lang
es|pt` to `render.py render`. Defaults to English. See `phase2-instructions.md`
for which payload fields to translate. Keep code identifiers, function names,
and Rick-canon references in their original form.

## Deep mode (`--deep`)

**Off by default.** Enable when the user passes `--deep`, says "deep analysis",
"explain why all these changes", or asks for motivation diagrams. When active,
pass `deep-mode.md` to the Phase 2 subagent — it adds a `<!-- SECTION:
deep_analysis -->` fragment with Mermaid diagrams and Jira context.

## Report structure

1. **Sticky header** — one of 4 OS chrome variants.
2. **Hero strip** — collapsible: one of 8 animated SVG banners + boot log.
3. **Summary** — PR title/branch/stats, `summary` prose, "Look here first" list.
4. **Risk breakdown** — named risk bars from `payload.risk`.
5. **Shape of the diff** *(optional)* — treemap; omitted when `payload.shape` absent.
6. **Flow** — force/state/sequence/sankey diagram + `core_logic` prose.
7. **Files** — full annotated diff, collapsible, syntax-colored by +/-.
8. **Quiz** — 4-question comprehension check + Rick-tier rank.
9. **Verdict** — `concerns` list + Approve / Request changes / Comment buttons.

## What varies per run (random)

- **Banner** — 8 animated SVG banners, theme-color-aware.
- **Theme** — 6 IDE-grade dark palettes.
- **OS chrome** — 4 sticky-header variants.
- **Boot log** — 5 lines sampled from a pool of ~30.
- **Footer quips** — 2 sampled from a pool of ~20.

## What's fixed

- Base HTML skeleton, core CSS, quiz engine, risk/stats/files rendering,
  chart bootstrap (`template/`).
- D3 v7 + d3-sankey, 5 chart renderers (`assets/charts/*.js`).
- Unified-diff parser (`scripts/render.py`).

None of these come from Claude's token output — bundled and inlined by the renderer.

## Token budget

Phase 2 runs in a subagent, keeping the diff out of the main context window.
The subagent's output is focused editorial judgment: risk scoring, file notes,
quiz questions, prose. Target: **< 3,500 tokens** in the subagent for a typical
mid-sized PR.

## Failure modes

- **Missing sections** — renderer inserts a Rick-flavored error paragraph.
- **Missing/malformed payload keys** — `core.js` renders inline errors; missing
  `shape` just hides that section (expected behavior).
- **`--diff` not passed or file missing** — `render` fails fast with a clear error.
- **Very large per-file diffs** — capped at ~300 changed lines per file.
- **`gh` / `glab` unavailable** — public URLs fall back to fetching `.diff` URL;
  private repos error with a "install gh/glab" message.
- **Not in a git repo (and no URL target)** — Rick complains and exits.

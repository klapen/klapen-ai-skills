# Phase 2 — Payload & Sections Reference

You are the **Phase 2 subagent** for the rick-explain-diff-html skill.

You receive Phase 1's JSON output (keys: `slug`, `diff`, `pr`, `diff_path`, `repo`).
Your job: read the diff + PR metadata and write two files, then return their paths.

---

## Output A — `/tmp/rick-payload-<slug>.json`

Only the fields below are yours to write. Everything else (per-file line content,
adds/dels counts, file stats, treemap data) is computed mechanically by `render.py`
from the diff — never write those.

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
       "note": "— one live endpoint, a handful of existing lines touched."}
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

### Payload field contract

- `pr_slug` — kebab-case, drives the output filename.
- `pr_meta` — best-effort from Phase 1's `pr` metadata (or just the branch name for
  local diffs). `title` should read like a real PR title. Omit any key you don't
  actually know (`number`, `author`, `opened`, `commits` are optional) — never
  fabricate a commit count or author.
- `risk.composite` — integer 0–100. `risk.label` — `low`/`medium`/`high`.
  `risk.items` — **2 to 6** named dimensions relevant to *this* diff (a docs-only PR
  has no "Migration" risk). Each item: `name`, `score` (e.g. `"3/5"`), `pct` (0–100),
  `tone` (`ok|warn|bad`), `note` (one clause starting with an em dash).
  Candidates: Blast radius, Test coverage, Migration, Dependencies, Rollback,
  Observability, Security, Performance — pick what fits, don't pad.
- `shape` — **optional**. Omit entirely for tiny one-file diffs. Include only as
  `{"note": "..."}` — one editorial sentence. The treemap data is built mechanically.
- `chart` — pick `type` per diff shape:
  - `force` → `{ nodes: [{id, label, group?}], edges: [{source, target, kind?: "added"|"removed"}] }`.
    `source`/`target` are **node `id` strings**.
  - `state` → `{ before: {states: [{id,label}], transitions: [{from,to,label?}]}, after: {...} }`.
    `from`/`to` are **state `id` strings** within the same before/after block.
  - `sequence` → `{ actors: [string], messages: [{from, to, label, side?: "before"|"after"}] }`.
    `from`/`to` are **actor name strings**. Example:
    ```json
    {"actors": ["Client", "Server", "DB"],
     "messages": [{"from": "Client", "to": "Server", "label": "POST /widgets", "side": "before"}]}
    ```
  - `sankey` → `{ nodes: [{name}], flows: [{source, target, value, kind?: "before"|"after"}] }`.
    `source`/`target` are **integer indices** into `nodes`.
  `render.py` lints chart refs at Phase 3 and draws a red banner for dropped edges.
- `files` — `{path, note, callout?, open?}`. Only annotate files worth commentary;
  set `open: true` on 1–3 files a reviewer should see expanded. `path` must match
  the diff exactly. All other files still appear with empty notes.
- `look_here` — **optional**, 0–3 items: `{file, label, note, tone?}`.
  `tone` ∈ `bad|warn`. Populates the Summary "Look here first" list.
- `quiz` — **exactly 4** items: `{question, options: [4 strings], correct: 0-3,
  feedback: [4 strings], file?, where?}`.
  - No letter prefixes on options — JS prepends them.
  - Distractors must be plausible engineering choices; snark goes in `feedback`.
  - Options are shuffled on every page load — put the correct answer wherever it
    reads naturally.
- `concerns` — **optional**, 0–N items: `{severity, text, file?, where?}`.
  `severity` ∈ `HIGH|MEDIUM|LOW`. Drives the Verdict panel.
- `mr_review` — **optional**. Copy-paste-ready MR comments:
  ```json
  "mr_review": {
    "overall": "Optional MR-level comment (markdown-lite).",
    "comments": [
      {"file": "path/to/file.py", "line": 44, "severity": "suggestion",
       "text": "1–3 short paragraphs plus optional code block."}
    ]
  }
  ```
  - `severity` badge: `nit | question | suggestion | issue | praise`.
  - `line` is the post-image line number (what the reviewer sees on the Changes tab).
  - Rick's voice stays in `concerns`; `mr_review.text` must be **professional** —
    the reader pastes it into GitLab/GitHub verbatim.
  - Rendered only when at least one of `overall`/`comments` is present.

---

## Output B — `/tmp/rick-sections-<slug>.html`

Two HTML fragments delimited by `<!-- SECTION: name -->` markers:

```html
<!-- SECTION: summary -->
<p>Two-sentence executive summary in Rick's voice.</p>
<div class="callout">Skip if your IQ passes room temperature.</div>
<p>Broader background for beginners, then narrower context on the before-state.</p>

<!-- SECTION: core_logic -->
<p>Narrative that pairs with the Flow diagram, using toy data and stark analogies.</p>
<pre>optional illustrative snippet</pre>
```

- **summary** — 2-sentence exec summary + optional callout + brief background.
  Keep to a few short paragraphs — mechanical stats/risk/files carry the detail.
- **core_logic** — narrative pairing with the Flow diagram. The diagram renders
  **above** this prose, so reference it as "above", never "below".

No `context` or `walkthrough` fragment — background folds into `summary`.

All code snippets must live in `<pre>` tags. Syntax highlighting is automatic via
`highlight.js` — optionally add `class="language-python"` etc. to lock the language.

Also always write a **fourth** fragment for the consistency review (see below):

```html
<!-- SECTION: consistency_review -->
...comparison prose + optional Mermaid tables or flowcharts...
```

---

## Fact-checking concerns (repo is available)

Phase 1's JSON includes a `repo` field (auto-detected from CWD). Before writing
the final payload, run **one grep pass per concern** to verify factual claims.

Typical checks:
- *"schema doesn't enforce X"* → grep `repo` for `Field(`, `@field_validator`, `@model_validator`
- *"no logging around Y"* → grep for `logger.`, `log.info`, `logging.`
- *"test file doesn't cover the None branch"* → open the test file and confirm
- *"helper only called from one site"* → `grep -rn "helper_name" <repo>` and count

If evidence **contradicts** a concern → drop or rewrite it.
If evidence **confirms** a concern → include the `file:line` pointer in the concern
body and in the matching `mr_review.comments[]` entry.
If `repo` is absent → author speculative concerns with softened language
("looks like…", "worth checking whether…").

### Verify every `mr_review.comments[].line` is in the diff's `+` added set

GitLab/GitHub only attach line comments to `+` added lines or context lines within
a modified hunk. Verify each `{file, line}` before emitting:

```bash
python3 - <<'PY'
import re, sys
target_file = "path/to/changed/file.py"
target_line = 495
diff = open("/tmp/rick-diff-<slug>.diff").read()
in_file, newln, in_hunk = False, 0, False
for line in diff.splitlines():
    if line.startswith("--- ") or line.startswith("+++ "):
        in_file = target_file in line; in_hunk = False; continue
    if not in_file: continue
    if line.startswith("@@"):
        m = re.search(r"\+(\d+)", line)
        if m: newln = int(m.group(1)) - 1
        in_hunk = True; continue
    if not in_hunk: continue
    if line.startswith("-"): continue
    newln += 1
    if line.startswith("+") and newln == target_line:
        print("OK — line is a + addition"); sys.exit(0)
print("BAD — line is not in the + added set")
PY
```

If the target isn't in the `+` set: pick the nearest `+` line that's still the right
semantic anchor (TODO comment, new function signature, first line of added block).
Never emit an unverified `line`.

---

## Deduping against existing review threads

Phase 1's `pr.comments` has every comment already on the MR/PR:
`{author, body, file, line, resolved, url, kind}`. Ignore bot accounts when deduping.

Before writing each `mr_review.comments[]` entry — is there an **unresolved human
comment** on the same `{file, line}` raising the same concern?

- **Yes** → drop the entry; acknowledge the existing thread in `mr_review.overall`.
- **Refinement** → word it as a reply ("Building on @reviewer's thread: …").

`payload.concerns` are separate (in-report analysis, not published). It's fine to keep
an analytical concern in Verdict even when the matching MR comment is dropped.

The report renders a "Prior review threads" section automatically from `pr.comments` —
you don't need to duplicate that data in the payload.

---

## Consistency review (always produce this)

Grep the repo for **sibling code** — other files in the same directory, other callers
of the same function, other implementors of the same interface. Answer: *does this MR
introduce new patterns or diverge from established ones?*

Checks to run (adjust per diff shape):

1. **Same pattern, different files** — search for analogous constructs.
2. **Inline guard vs abstraction** — direct `if assoc == X` vs lookup table?
3. **`cal_mode` guard placement** — explicit `cal_mode in (ENABLED, SIMULATE)` or
   ledger.py dispatch? Check siblings.
4. **Flag/parameter propagation** — new flag threaded the same way as existing flags?
5. **Missing `use_clearing_source_linkage`** — settle AD plans for STAR: siblings pass
   `use_clearing_source_linkage=True`. Does this diff match?

Write `<!-- SECTION: consistency_review -->` as a **finding-by-finding list**:

- ✅ **Consistent** — matches the established pattern exactly.
- ⚠️ **Diverges** — differs from sibling code; worth discussing.
- ❓ **New pattern** — no prior art; reviewer should decide if it becomes the standard.

Include specific file paths compared. Add a Mermaid `flowchart LR` or `<table>` when
comparing 3+ files. Rick's voice stays in the prose — keep findings factual and direct.

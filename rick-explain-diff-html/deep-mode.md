# Deep Mode (`--deep`) — Phase 2 Addendum

Add a **third** HTML section fragment to `/tmp/rick-sections-<slug>.html`:

```html
<!-- SECTION: deep_analysis -->
...Mermaid diagrams + prose...
```

`core_logic` covers the *what*. `deep_analysis` covers the *why*: Jira context,
chain of necessity, decision rationale, diagrams.

---

## What to include

1. **Jira / ticket context** — Pull referenced tickets via `mcp__jira__getIssue`.
   Extract: stated scope, implementation notes, constraint references, sibling tickets.
   Summarise in 2–3 sentences before the diagrams.

2. **Chain-of-necessity flowchart** — Mermaid `flowchart TD`:
   - Each problem discovered (red nodes)
   - Each fix that addresses it (blue nodes)
   - Arrows: "this problem requires this fix", "this fix exposes that problem"

3. **Per-change diagrams** — one per non-trivial change:
   - `sequenceDiagram` for call-order changes
   - `flowchart LR` for condition/guard changes

4. **Policy / config object diagram** — if the diff introduces a new dataclass, enum,
   or mapping that controls behaviour, `flowchart TD` showing which
   associations/networks use which flags.

---

## Mermaid injection template

```html
<!-- SECTION: deep_analysis -->
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
  document.addEventListener("DOMContentLoaded", function() {
    mermaid.initialize({ startOnLoad: true, theme: "dark",
      themeVariables: { fontSize: "13px" } });
  });
</script>
<h3 style="color:var(--accent);margin-top:2rem">Why all these changes?</h3>
<div class="mermaid">
flowchart TD
  ...
</div>
```

Inject the `<script>` tags **once** at the top of the fragment only.

### Node style guide

- Problem nodes: `fill:#4a2d2d,color:#ffb3b3,stroke:#ffb3b3`
- Fix nodes: `fill:#1a3a4a,color:#87ceeb,stroke:#87ceeb`
- Goal/entry nodes: `fill:#2d4a2d,color:#90ee90,stroke:#90ee90`
- Neutral/policy nodes: `fill:#3a3a2d,color:#ffd700`

Keep labels short (≤6 words). Put detail in prose below each diagram, not node labels.

---

## Token budget

Deep mode adds ~800–1 500 tokens. Max 4–6 diagrams, one per major change cluster.

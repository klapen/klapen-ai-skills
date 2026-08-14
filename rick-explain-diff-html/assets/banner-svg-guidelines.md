# Banner SVG guidelines

Contract for the hero-strip banners in `assets/banners/*.svg`. An agent
writing a new variant should be able to follow this file alone and have it
drop in without touching layout, theme, or the boot log next to it.

## 1. Fixed frame

```html
<svg viewBox="0 0 190 60" style="width:190px; height:60px; display:block;"> … </svg>
```

- `viewBox="0 0 190 60"` — always. The slot is 190×60; anything taller
  pushes the summary stats below the fold.
- No `width`/`height` attributes — set them in `style` only, matching 190/60.
- Composition is **centred and horizontal**. Put the subject around `x≈95`,
  `y≈30`. Keep 2px of breathing room inside the frame; nothing should touch
  the edges.
- Optional accents (signal arcs, tick marks, stray particles) may sit out at
  `x<45` or `x>145` — that's the one place asymmetry is welcome, since it
  fills the wide frame.
- Wrap moving groups in `<g transform="translate(95 30)">` and animate the
  group, not the primitives — it keeps rotation origins trivial.

## 2. Colour — variables only, in `style`, never attributes

CSS variables do **not** work reliably in SVG presentation attributes across
browsers. `fill="var(--rk-ok)"` can render black. Always use the `style`
attribute:

```html
<!-- wrong -->            <circle fill="var(--rk-ok)" />
<!-- right -->            <circle style="fill:var(--rk-ok)" />
<!-- right -->            <path fill="none" style="stroke:var(--rk-accent)" stroke-width="1.6" />
```

Non-colour attributes (`stroke-width`, `stroke-dasharray`, `opacity`, `r`,
`cx`, `transform` when static) stay as plain attributes. This applies to any
D3-generated SVG too — set colours with `.style()`, not `.attr()`.

Available tokens — no raw hex, ever:

| token | role in a banner |
|---|---|
| `--rk-accent` | primary structure: glass, casings, frames |
| `--rk-ok` | the "active substance": portal energy, fluid, live traces |
| `--rk-info` | secondary/cool element: coolant, radio, screens |
| `--rk-warn` | heat, thrust, caution |
| `--rk-bad` | danger, organic matter, alarm |
| `--rk-dim` | inert scaffolding: stands, rails, bond lines |
| `--rk-deep` / `--rk-bg` | knockouts and shadow only — the strip background is `--rk-deep` |

Rules:
- **Two accent colours max**, plus `--rk-dim` for scaffolding. Three-plus
  reads as clip art.
- Never `--rk-text` (reserved for prose) and never a hardcoded `#hex` — that
  breaks the six palettes.
- Fill large areas at `opacity 0.12–0.25`, not full strength; the banner
  sits behind content in the visual hierarchy.
- Legibility floor: the whole banner should stay readable at `opacity 0.95`
  on `--rk-deep` in all six themes. Solarized has the lowest contrast —
  check there first.

## 3. Animation — CSS keyframes only

The keyframes below live in `template/core.css` (global, shared with the OS
chrome). Declare any *new* keyframe there too, prefixed `rk-`.

Existing keyframes to reuse before inventing more:

| name | effect | typical use |
|---|---|---|
| `rk-spin` / `rk-spin-rev` | 360° rotate, opposing | portal rings, orbits |
| `rk-pulse` | opacity 0.35→1 + scale 0.94→1.06 | cores, nuclei, lamps |
| `rk-dash` | `stroke-dashoffset` → −240 | travelling traces, helix strands |
| `rk-bob` | ±4px vertical drift | floating bodies |
| `rk-rise` | rise 6px→−16px, fade in/out | bubbles, particles |
| `rk-sweep` | rotate −52°→52° | dishes, radar, scanners |
| `rk-blink` | hard on/off, `steps(1,end)` | terminal cursors, indicator LEDs |
| `rk-flicker` | brief 0.72 dip at 92% | CRT/fluid instability |

Constraints:
- **One primary motion + at most two secondary accents.** More than three
  animated elements in a 190px strip is noise.
- Durations **≥2s** for anything looping continuously (`rk-pulse` 2.4–3.6s,
  `rk-spin` 7–11s). Sub-1s is only for a thrust flame or a cursor.
- Stagger duplicates with a delay (`animation:rk-rise 3.4s linear infinite 0.7s`)
  so paired elements never move in lockstep.
- Any rotate/scale needs an explicit origin: `transform-origin:0 0` inside a
  translated `<g>`, or `transform-origin:95px 14px` on an untranslated
  element.
- No `<animate>`/SMIL, no JS-driven motion, no `requestAnimationFrame`.
- `prefers-reduced-motion: reduce` already kills all animation globally —
  the banner must still read as a finished illustration when frozen. If it
  looks empty without motion, the drawing is under-built.

## 4. Drawing style

- **Line art, not illustration.** Stroke weights `1.2–1.8` for structure,
  `2.4–4` for a few emphatic elements (screen bezel bottom, flask lip, jar
  lid). Nothing above 4.
- 4–14 primitives per banner. Under 4 looks unfinished; over ~18 turns to
  mush at 60px.
- `fill="none"` + stroke for outlines; reserve fills for substance (liquid,
  energy, glow).
- Straight geometry and single-control-point curves (`Q`). Avoid
  multi-segment bézier portraiture — this is instrumentation, not art.
- No text inside the banner. The boot log next to it carries all wording.
- **No character art, likenesses, logos, or trademarked shapes.** Abstract
  lab/sci-fi objects only: apparatus, optics, orbits, signals, containers,
  craft.
- No gradients, no `filter`, no `mask`, no external images. Flat
  stroke-and-fill keeps every theme working and the file self-contained.
- Vary the archetype: a new variant should differ from the existing set in
  *silhouette*, not just colour — a second ring-shape reads as a duplicate
  portal.

## 5. Wiring a new variant

1. Draw the SVG as its own file in `assets/banners/<slug>.svg`, following
   the fixed frame above — no wrapping markup, just the bare `<svg>…</svg>`.
2. `render.py`'s `render` subcommand already picks a random `.svg` from that
   directory (or the one named by `--theme`-style stem override if you add
   one later) and inlines it at `{{BANNER}}` — no code changes needed to
   register a new file, it's picked up automatically.

Slug naming: lowercase, hyphenated, names the object (`portal-ring`,
`lab-flask`, `brain-jar`) — not the mood.

## 6. Self-check before shipping a variant

- Renders identically at 190×60 with no clipping or scrollbars.
- Zero `#hex`; zero colour in presentation attributes.
- ≤3 animated elements; all loops ≥2s; every transform has an origin.
- Legible in all six themes, and still legible with animation disabled.
- Distinct silhouette from the other variants.
- No text, no character art, no external assets.

# bullets — findings

Captured with `--kind=bullets` (wide, both aspects) and `--entrance`. `console.log` empty throughout.

## Scores

| section | before | after |
|---|---|---|
| 1. Containment & safe area | **1** | **4** |
| 2. Typography | **2** | **4** |
| 3. Motion quality | 3 | **4** |
| 4. Cleanliness | **1** | **4** |
| 5. Palette & consistency | 4 | **4** |

## B1 — the entire 3D layer never rendered (severity: critical) — FIXED
`short-p90.png` before: dots and text on a bare background, no glass panels at all, at any p.

This is **not a bullets bug**. `render3D` builds a `ThreeBundle` once per cache key and calls its
`update` every frame — but painters write `update` as a closure over `env`, and that closure captures
whatever `env` object existed on the frame the bundle was built. Every scene starts at p = 0, so
`update` reads p = 0 forever. In bullets that means `if (t <= 0) m.visible = false` on every panel,
permanently.

Proved by rendering the same scene as the *first* paint at p = 0.9 (`/probe?demo=bullets&p=0.9`):
the panels appear. Same code, different first frame.

**29 of 110 painters are affected** — bigtext, bracket, browserframe, bullets, callstack, chain,
chart, code, compare, cycle, diagram, formula, geomap, layers, ledger, lifeline, matrix, memgrid,
quote, schematic, showdown, skyline, stat, statemachine, storyboard, table, terminal, timeline,
trace. Zero of them passed a live context.

Fixed centrally in `three3d.ts`: `render3D` takes a new `liveEnv` argument and does
`Object.assign(entry.capturedEnv, liveEnv)` each frame, refreshing the captured object in place so
existing closures see live values. Applied mechanically to all 29 call sites.

## B2 — half the content sat under the YouTube Shorts UI (severity: high) — FIXED
The list stretched to `h * 0.86`, so bullets 3 and 4 of 4 landed at y ≈ 1440 and y ≈ 1637 on a
1920-tall frame — inside the caption/channel strip (`CLAUDE_PROMPT.md:207`). Now bounded by
`h * SHORTS_SAFE_BOTTOM - unit * SHORTS_SAFE_GAP`, and the list stops stretching at
`MAX_ROW_PITCH` and centres, so a 2-item list no longer scatters across the frame.

## B3 — 16:9 sliced its first and last panel (severity: high) — FIXED
`spreadY` was hardcoded to 4.0 for long, but the camera's frustum half-height there is
`tan(18°) × 11 = 3.574`. The outer panels sat outside the render rect and were clipped, with their
labels drawn above/below the rect entirely (`long-p90.png` before). `spreadY` is now derived:
`halfH - PANEL_H / 2 - PANEL_EDGE_GAP`.

## B4 — labels overflowed the panels they sit on (severity: high) — FIXED
Text wrapped to `contentW`, not to the panel, so it ran past the panel's right edge and its second
line fell outside the panel entirely. Now the panel's left/right edges are projected to pixels and
the label is fitted to that width with `fitFontSize` on a single line.

## B5 — panels were sheared and misaligned with the title (severity: medium) — FIXED
`camera.position.set(2, …)` put the camera off-axis, shearing every panel and pushing the list right
while the title stayed flush left. Camera is now centred, and `PANEL_W` is derived from the frustum
so panels span the content box at either aspect.

## B6 — dead variable (severity: low) — FIXED
`rowGap` was computed and never used.

## Deliberately left
- The active panel is pushed to z = 0.5, which projects it slightly wider than the others — it
  breaches `contentX` by ~12 px at 16:9. It reads as deliberate emphasis; not worth a round.
- `if (!cam) return;` — same missing 2D fallback as bigtext. Logged, not reproducible here.

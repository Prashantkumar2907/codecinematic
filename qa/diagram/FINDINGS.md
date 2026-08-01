# diagram — findings (2026-08-01)

**Outcome: 2/3/3/1/2 → 4/4/4/4/5, passed in 2 fix rounds.** Round 1 is below; round 2 and the
verification are at the bottom.

## Round 1

Scored from `qa/diagram/{short,long}-strip.png`, `long-p90.png`, `console.log`,
`npm run edge-check -- --kind=diagram`, and a full read of `painters/diagram.ts`.

| Axis | Score | Why |
|---|---|---|
| 1 containment & safe area | **2** | nodes overlap each other in 16:9; lowest row reaches 87% of frame height in 9:16 |
| 2 typography | **3** | labels legible, but arrow-label chips are painted over node labels |
| 3 motion | **3** | accent nodes flash bright cyan on entrance; 3D layer frozen at frame 0 |
| 4 cleanliness | **1** | every node shows a second, offset copy of itself (3D slab vs 2D card) |
| 5 palette | **2** | 11 hardcoded colour literals; two are silently dropped by three.js |

`edge-check` reports **0.0% bleed on both aspects** — canvas-edge containment is fine.
Axis 1 fails on the *safe area* and on node-to-node overlap, neither of which that
script measures.

## 1. Every node is drawn twice, offset — `diagram.ts:263-268, 340-356` — CRITICAL

`long-p90.png`: behind each card sits a second, misregistered copy of it (clearest on
`Clients`, `Load Balancer`, `Kafka Bus`). The 2D rect is recovered by projecting a world
box through a **tilted** camera (`camera.position.set(0, 13|10, 9|7)`, `:279`) — the
ground plane maps non-linearly, so the pixel rect never lands back on the slab that
produced it.

This is the documented systemic defect `2d-layout-round-tripped-through-camera`
(`qa/ledger.json` → `systemic`), whose fix pattern is already applied to 10 painters:
*make the pixel layout authoritative, put the camera on-axis at (0,0,D), derive world
positions from pixels via a `mappingAt(camera, z)` mapping.* `diagram` is the
"`worldPos(px,py)` helper plus an off-axis camera" case that entry lists as suspected.

Aggravating factor in the same code:
- `mesh.position.y += Math.sin(elapsedMs / 1500 + p.x) * 0.05` and `+0.2` when
  highlighted (`:326`) bob and lift the slab *after* placement — the exact thing the
  systemic entry forbids, because 2D chrome cannot follow it.

## 2. Nodes overlap; the graph ignores half the frame — `diagram.ts:246-268` — HIGH

`long-p90.png`: `Database` overlaps `API Server 1`; `Kafka Bus` overlaps both API
servers; the arrows between them are hidden underneath. The whole graph sits in the
lower-right, leaving the area under the title empty.

Cause: node rects come from the projection above, not from the 12×12 grid the scene is
authored on. The file *already contains* a correct pixel-space grid layout —
`gridMap` (`:125`) and `nodeRect` (`:155`), which pad every cell by `min(cw,ch)*0.12` so
adjacent cells cannot touch — but **both are dead code** (defined, never called;
`grep -c` → 1 each). `toDisp` and `GRID` are dead with them.

## 3. 9:16 lowest row sits inside the YouTube UI band — `diagram.ts:131, 257` — HIGH

`areaH = Math.min(areaH, layout.h * 0.86 - areaY)` allows content down to 86% of frame
height; `short-strip.png` frames 12-15 put the `Kafka Bus` card's bottom edge at ~87%.
The rubric reserves the bottom ~25%, and row 9.0 added `layout.safeBottom` (9:16 → 69%
of height, caption-aware). The literal appears **twice** in this file — once in the dead
`gridMap`, once in the live path — which is how the two drifted apart in the first place.

## 4. Accent nodes flash bright cyan on entrance — `diagram.ts:302-304, 454` — HIGH

`short-strip.png` frame 01 (`Load Balancer`), frame 10 (`Kafka Bus`, `Database`): the node
appears as a solid bright-cyan filled box, then turns into a dark card by the next frame.
The 3D slab's face is `n.accent ? accent : "#1e293b"` — full accent — while the 2D card
over it fades in on `globalAlpha = clamp01(t * 1.6)`. For the first ~60% of the entrance
the viewer sees the bare accent slab. Same hard-colour-pop class the ledger records
being hand-fixed twice already (bigtext, mythfact).

## 5. The 3D layer is frozen at frame 0 — `diagram.ts:309-336` — HIGH

`update()` reads `reveals`, `livePos`, `highlights` and `ghostIn` from the enclosing
scope. `build()` runs once per key, so those are frame-0 values forever
(`systemic → frozen-painter-local-output-array`; `liveEnv` only refreshes `env`). So slab
positions never follow a `move` step and slab highlighting never changes. Per-frame state
must travel through `render3D`'s `context` argument.

## 6. Arrow labels are painted over node labels — `diagram.ts:527, 533-541` — MEDIUM

`long-p90.png`: `writes` sits across the word `Database`; `events` across `API Server 1`;
`requests` across `Clients`. The label is placed at the polyline midpoint with no
awareness of node rects. The comment at `:516` records an earlier fix that moved these to
a top pass — that fixed z-order, not position.

## 7. Colour literals — `diagram.ts:281, 283, 302, 304, 403, 426, 463, 468, 480-481, 534, 537` — MEDIUM

11 hardcoded values: `"#1e293b"`, `"#31435a"`, `"#0e2433"`, `"#0b0f15"`, `"#eaf6ff"`,
`"#0a0e13"`, three `rgba(148,163,184,…)` variants, `rgba(0,0,0,0.55)`.
`diagram.ts:302` is one of the sites the plan names for the 76%-of-library palette
failure. Two of them are worse than untidy — `console.log` records
`THREE.Color: Alpha component of rgba(148,163,184,0.5) will be ignored` (from
`studioLights(…, "rgba(148,163,184,0.5)")`, `:281`) and the same for `accentGlow` passed
as a block edge colour (`:304`): three.js **drops the alpha**, so both are rendered fully
opaque and the intended dimming silently does not happen.

Also `ctx.lineWidth = 1` (`:537`) is an absolute px stroke, which the rubric forbids
because it cannot hold at both aspects.

## Not a finding

- **Frame 00 is empty in both strips.** `ghostIn = easeOutCubic(enterT(env, 420))` is 0 at
  `elapsedMs = 0`, and the title is on the same clock (`TITLE_IN_MS = 420`). By frame 2
  (~66 ms) `ghostIn` is already 0.40 and the ghosts are visible, which satisfies the
  rubric's "something resolving by frame 2". The strip samples `p=0.00` exactly; there is
  no dead *time*, only a dead first frame that every entrance necessarily has.
- **`rgba(0,0,0,0.55)` drop shadow** (`:463`) is left as a literal deliberately: it is a
  shadow, not a palette colour, and no palette key expresses it.
- **`new THREE.PerspectiveCamera(…, 1, …)` (`:278`) hardcoding aspect 1** looks like a
  second projection error but is not one: `render3D` sets `camera.aspect = pw / ph` and
  calls `updateProjectionMatrix()` on every frame (`three3d.ts:122-125`), so the build-time
  value is overwritten before anything renders. It still has to be passed correctly in the
  rewrite, because `mappingAt` runs *inside* `build()` — before that central correction.

## Round 2 — what the rewrite exposed

Findings 1-7 fixed; the new strips showed five more, all layout/finish rather than structure:

1. **9:16 transposed the wrong way.** `toDisp`'s `maxYo - (y + h)` mirrors the cross-axis, so
   `API Server 2` (authored *below* `API Server 1`) landed to its *left*. A viewer watching the
   long and the short of one script saw the order reversed. Now a plain transpose:
   authored-upper → display-left.
2. **A uniform cell left 38% of the width empty.** Fitting the used grid extent with one cell
   size for both axes keeps node proportions exact, but no graph's grid aspect matches 16:9 or
   9:16, so the fit was always bounded by height. `CELL_ASPECT_MAX = 1.35` lets the roomier axis
   stretch: the demo went from 62% to ~84% of frame width used, with cards at 2:1 instead of 3:2.
3. **Idle cards read as holes.** `THEME.panel` (`#0d1117`) is within 4 RGB steps of
   `THEME.bgTop`, and the flash bug had been masking it — the bright slab was the only thing
   lifting a card off the background. `shade(THEME.panel, 0.09)`.
4. **The slab showed its own side face.** At `SLAB_DEPTH = 0.3` a node near the frame edge
   splayed ~10 px of side, which reads as exactly the misregistration that was just fixed. 0.12.
5. **`writes` was still on top of `Database`.** Stepping the chip perpendicular to the route was
   not enough — up to ±2 steps it stayed inside the box. `labelSpot` now searches *along* the
   route as well (5 positions × 5 offsets), and sliding along is tried before pushing far off.

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npm run edge-check -- --kind=diagram` → short 0.0%, long 0.0%, both aspects.
- `qa/diagram/console.log` → **0 bytes** (was 18 `THREE.Color: Alpha component … will be ignored`).
- `grep` for all 11 round-1 literals plus `lineWidth = 1`, `shadowOffsetY`, `0.86` → no hits.
- Strips re-read at both aspects, `p=0…1` and `--entrance`: no doubled cards, no node-to-node
  overlap, no chip over a node label, no entrance flash, staggered reveals, settled by p≈0.87.

### Left deliberately

- **`step.move` is unverified.** No `DEMO_*` fixture has a diagram with a `move`, so the gliding
  path was never on screen. It runs through the same per-frame rect → `context` route as the
  static case (positions are recomputed every paint and travel to the slabs as data), which is
  strictly better than the frozen closure it replaces — but it has not been watched.
- **The 9:16 action rail.** In the short the graph's right edge lands at 85.6% of frame width,
  and the rubric reserves the right ~15% for the YouTube action rail. `makeLayout`'s `margin`
  does not reserve it, so this is true of every painter; fixing it here would only hide a
  layout-wide gap. Phase 9's `layout` work owns it.
- **Frames 0-500 ms show only the title and the ghosts** in `--entrance`. Node reveals are
  driven by `env.p` and beat windows while the entrance strip advances `elapsedMs`, so the strip
  structurally cannot show them. This is the `enterT`-is-absolute design flaw (plan 6b), not a
  defect in this painter.

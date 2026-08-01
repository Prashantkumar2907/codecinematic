# compare — findings (2026-08-01)

**Outcome: 2/4/3/2/2 → 4/4/4/4/5, passed in 3 fix rounds.** Round 1 is below; rounds 2-3
and the verification are at the bottom.

## Round 1

Scored from `qa/compare/{short,long}-{strip,p50,p90}.png`, `console.log`,
`npm run edge-check -- --kind=compare`, and a full read of `painters/compare.ts`.

| Axis | Score | Why |
|---|---|---|
| 1 containment & safe area | **2** | the verdict chip sits at 82-88% of frame height in 9:16, entirely inside the caption band |
| 2 typography | **4** | legible, wraps correctly, clear tiers — the one axis that was already fine |
| 3 motion | **3** | the "current panel" glow is dead code; 3D dim state frozen at frame 0 |
| 4 cleanliness | **2** | the 2D panel is offset ~85 px from the 3D slab it is supposed to sit on |
| 5 palette | **2** | 4 colour literals, 2 more dropped silently by three.js |

`edge-check` → 0.0% both aspects. As with `diagram`, that script measures the canvas
edge, not the caption band, and cannot see the safe-area failure below.

## 1. The 2D chrome and the 3D slab are placed by two unrelated systems — `compare.ts:53, 64-65, 84-88, 115-117` — CRITICAL

`rect` is a pixel box (`:53`); the slabs are sized and positioned from world literals
`spreadX/spreadY` (`:64-65`) — `blockW = spreadX * 1.5`, `position.x = dir * spreadX * 0.8`.
Nothing ties the two together, and the code says so at `:194-195`: *"we approximated the
3D block to match this 2D bounding box"*.

Measured on `long-p90.png`: the left panel's accent bar spans x≈65-905 while the slab it
belongs to spans x≈137-932 — **~72 px right, ~45 px down, and a different width**. On
`short-p90.png` the offset is ~87 px and the bar overhangs the slab on *both* sides.

The camera is already on-axis (`:59-60`), so unlike `diagram` this needs no camera change —
`projectToRect` is affine here. It needs the slabs sized and placed *from* the panel rects
through a `mappingAt(camera, z)` map, which is the same fix pattern
(`qa/ledger.json` → systemic `2d-layout-round-tripped-through-camera`).

`get2D` (`:145-151`) is a helper that tries to recompute the 2D anchor from the same world
literals — including reproducing the bob below. It is **dead code**: defined, never called
(`grep -c get2D` → 1).

## 2. The verdict chip is drawn inside the caption band — `compare.ts:31, 355` — HIGH

`ty = contentY + contentH - unit * (vertical ? 3.0 : 0.8)` → **1650 px of 1920 (86%)** at
9:16 and **972 of 1080 (90%)** at 16:9. `layout.safeBottom` is 1321 (69%) and 863 (80%).
So the whole chip — the scene's conclusion — lands under the burned-in caption in both
aspects. `availH` (`:31`) is derived from `contentH` for the same reason.

## 3. Each panel is far taller than its content — `compare.ts:50` — HIGH

In the side-by-side variant `ph = availH` unconditionally, so the panel takes the entire
band whatever it holds. `long-p90.png`: items end at y≈590, the panel runs to y≈820 —
**~40% of each panel is empty**, and the pair is not centred in the band. The file already
computes `panelContentH()` (`:33-41`) and uses it in the stacked branch only.

Related latent bug at `:158`: the right panel's `y` is `panelsTop` while the left's is
`blockTop`. They agree today only because `blockTop` is left equal to `panelsTop` in the
side-by-side branch. Centring the pair (the fix above) would desynchronise the two sides.

## 4. The "current panel" glow can never draw — `compare.ts:204-209` — HIGH

```
if (isCurrent && divider) { ctx.shadowColor = glow; ctx.shadowBlur = unit * (…idle…); }
ctx.shadowBlur = 0;
```

The blur is zeroed unconditionally on the next line, so the highlight is dead. With
`alpha` also resolving to 1 for both sides once the verdict beat is active (`:191`), the
active side gets **no visual distinction at all** for most of the scene — on a kind whose
entire job is "look at this side now".

## 5. The 3D layer's dim state is frozen at frame 0 — `compare.ts:93-136` — HIGH

`update()` reads `active` from the enclosing scope (`:104`, `:128`). `build()` runs once per
key, so that is frame 0's value forever; `liveEnv` only refreshes `env`
(`qa/ledger.json` → systemic `frozen-painter-local-output-array`). Per-frame state has to
travel through `render3D`'s `context`.

## 6. The slabs bob out from under the 2D chrome — `compare.ts:121` — HIGH

`group.position.y += Math.sin(elapsedMs / 1200 + i) * 0.08` moves the slab every frame
while the 2D panel is fixed — the drift the systemic entry forbids in as many words. The
dead `get2D` reproduces the same sine, which is the author trying to chase it.

## 7. Colour literals and two silently-dropped alphas — `compare.ts:66, 87-88, 131-132, 319` — MEDIUM

- `mat.color.setStyle("#0b0f15")` + `mat.emissive.setStyle("#0b0f15")` (`:131-132`)
  **overwrite** the `accent`/`secondary` faces passed to `makeBlock` for both non-divider
  variants, so the two sides' slabs are identical near-black and the palette distinction
  survives only in the 2D bar.
- `new THREE.Color("#31435a")` (`:66`), `badgeGrad.addColorStop(1, "#06121a")` (`:319`).
- `makeBlock(…, accentGlow)` / `(…, secondaryGlow)` (`:87-88`) pass **rgba strings** into
  `THREE.Color`, which drops alpha — `console.log` records
  `Alpha component of rgba(56, 189, 248, 0.45) will be ignored` and the same for
  `rgba(139, 92, 246, 0.45)`. Both edge colours render fully opaque.

## 8. The 3D floor grid crosses the panels — `compare.ts:66-82` — MEDIUM

`GridHelper` at `y = -0.5` plus a `ShadowMaterial` plane were built for a tilted camera.
Under this on-axis camera the grid renders as converging perspective lines straight across
the panel bodies (`long-p90.png`, y≈600-700) and the shadow plane receives nothing useful.

## 9. Items can overflow the panel — `compare.ts:252-282` — LOW

The item loop advances `iy` with no bound against `ph`, and `ph` is capped independently
(`:47`). Three short items cannot show it; six long ones would.

## Coverage gap — 2 of 3 variants are unreachable

`variantOf(scene.id, 3)` picks the layout, and **both** compare fixtures in `demo.ts`
(`:323`, `:2104`) use the id `sqlnosql`, which hashes to **variant 0**. So the probe can
only ever show side-by-side-no-divider (16:9) and stacked (9:16). Variant 1 (`divider`, the
dashed-spine layout) and variant 2 (stacked at 16:9) have **never been seen**. The harness
supports `--scene=<id>` precisely for this, but there is no second id to point it at.
Addressed below rather than left as a hole.

## Round 2 — what the rewrite exposed

Findings 1-9 fixed. The safe-area fix (2) shrank the band the panels live in, and the
overflow clamp (9) then started **silently dropping the third item** in 9:16 — trading a
containment failure for lost content. Both panels showed 2 of 3 bullets while the narration
still said all three.

Fixed by compressing instead of dropping: the item block now scales by
`fit = (ph - header) / itemsH`, floored at 0.72 so the item font never drops below ~31 px on
a 1080-wide frame. `verdictBand` also went to a flat `4.0u` — 16:9 reserved `3.2u`, which is
less than the `3.84u` a two-line verdict box actually occupies, so a two-line verdict was
clipped there too.

## Round 3 — the variant that had never been rendered

With `restgrpc` (variant 1) and `tcpudp` (variant 2) added to `demo.ts`, the two unseen
layouts rendered for the first time. Variant 1 (dashed spine) was fine. **Variant 2 —
stacked at 16:9 — was broken beyond repair by tuning:** it gives each panel ~180 px of
height, less than the header needs before a single item is drawn, so *every* item in both
panels was dropped. `tcpudp`'s four-item sides made it unmissable.

`variantOf(scene.id, 3)` → `variantOf(scene.id, 2)`. 16:9 now always compares side by side,
with `divider` as the variety; stacked stays the 9:16 layout, where the frame is tall enough
for it. A wide stacked panel would need a different internal layout (title left, items in a
row) — noted in the code, not built here.

Two more found in the same pass:
- **The verdict's ✓ was prefixed to every wrapped line**, so a two-line verdict read
  "✓Correctness by default, or latency by / ✓default." — and `maxW` measured the tick on
  every line, widening the box to match. Now line 0 only.
- The header zone was `3.4u` when the title and icon share one line at `1.6u`. At `2.8u`,
  four items fit a 9:16 panel; at `3.4u` the fourth was still being clamped away.

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npm run edge-check -- --kind=compare` → short 0.0%, long 0.0%.
- `qa/compare/console.log` → **0 bytes** (was two `THREE.Color: Alpha component … will be
  ignored` warnings per frame).
- Both aspects re-read at `p=0…1`, `p50`, `p90` for **all three fixtures**: `sqlnosql`
  (3 items, side-by-side + stacked), `restgrpc` (divider), `tcpudp` (**4 items**, the
  schema maximum). Every item renders in every case; verdict box inside `safeBottom` in
  every case; slab and chrome registered; the active side's glow is visible in the strip
  (frames 02-05 vs 08+).

### Left deliberately

- **The 9:16 action rail.** Panels span 94% of frame width because that is `layout.contentW`;
  the rubric reserves the right ~15% for the YouTube action rail. Every painter inherits
  this from `makeLayout`, so fixing it here would only mask a layout-wide gap. Same note as
  `diagram`.
- **A wide stacked layout for 16:9** (title left, items in a row) is the thing to build if
  that variety is wanted back. Removing the broken variant is not a substitute for it.

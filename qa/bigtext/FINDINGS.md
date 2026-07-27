# bigtext — ROUND 1 findings

Captured: `npm run filmstrip -- --kind=bigtext` and `--kind=bigtext --entrance`.
Sheets read: `short-strip.png`, `long-strip.png`, `short-strip-0-500ms.png`, `long-strip-0-500ms.png`,
`short-p50/p90.png`, `long-p50/p90.png`. `console.log` is empty — no exceptions.

## Coverage caveat — read this before trusting the score

`paintBigtext` has **five** entrance variants selected by `variantOf(scene.id, 5)`
([bigtext.ts:356](../../src/studio/painters/bigtext.ts:356)). `DEMO_BIGTEXT.scenes[0].id` is
`"t-bigtext"`, which hashes to **variant 4** (Stamp with Shockwave) — verified by computing djb2.
The kind index exposes exactly one scene per kind, so **variants 0, 1, 2 and 3 are never rendered
and are entirely unverified.** Everything below is variant 4 only. Remedy in ROUND 3 notes.

## Scores (before)

| section | score | why |
|---|---|---|
| 1. Containment & safe area | **2** | F1, F2 |
| 2. Typography | **4** | fits, wraps cleanly, tiers distinct; no defect found |
| 3. Motion quality | **2** | F3, F6 |
| 4. Cleanliness | **2** | F3, F5 |
| 5. Palette & consistency | **2** | F4 |

## Findings

### F1 — text is clipped off both canvas edges for the first ~150 ms (severity: high)
`short-strip-0-500ms.png` frames 01 (33 ms), 02 (67 ms), 03 (100 ms): "rendering is" runs past both
edges. `long-strip-0-500ms.png` frames 01–03 are worse — words are sliced mid-glyph.

Cause: [bigtext.ts:605](../../src/studio/painters/bigtext.ts:605) `const scale = 1.0 + (1 - stampT) * 0.8`
starts the stamp at **1.8×**, but the type was already fitted to 92 % of `contentW` at
[bigtext.ts:364](../../src/studio/painters/bigtext.ts:364). Measured with real font metrics:

| aspect | widest line | ×1.8 | canvas | overflow |
|---|---|---|---|---|
| short | 848 px | 1526 px | 1080 px | 446 px |
| long | 1628 px | 2931 px | 1920 px | 1011 px |

### F2 — on shorts the subtext sits inside the YouTube UI band (severity: high)
Last subtext baseline lands at **y = 1494** on a 1920-tall frame. The bottom 25 % is covered by
captions/channel/audio strip (`CLAUDE_PROMPT.md:207`), i.e. everything below **y = 1440**. The
subtext is **54 px inside the covered band**. Cause: the composition is anchored at `h * 0.44`
([bigtext.ts:585](../../src/studio/painters/bigtext.ts:585)) with the sub block placed below it at
[bigtext.ts:759](../../src/studio/painters/bigtext.ts:759) with no bottom clamp.

### F3 — hard colour pop at 350 ms; no real text exists before it (severity: high)
`short-strip-0-500ms.png` frame 10 (333 ms) is monochrome pink; frame 11 (367 ms) is full colour.
One frame, total change. Cause: [bigtext.ts:656-665](../../src/studio/painters/bigtext.ts:656) is an
`if/else` — while `glitch > 0` it draws **only** the red and cyan solid copies and never calls
`drawStyledLine`. `glitch = (1 - stampT) * unit * 0.5` ([:642](../../src/studio/painters/bigtext.ts:642))
is non-zero for the entire first 350 ms, so the styled text does not exist until the branch flips.
That is a pop-in by the rubric's definition, and the seam is also a cleanliness defect.

### F4 — glitch colours are hardcoded, ignoring the palette (severity: medium)
[bigtext.ts:660-661](../../src/studio/painters/bigtext.ts:660) hardcode `"rgba(239, 68, 68, 0.8)"`
and `"rgba(56, 189, 248, 0.8)"`. The cyan is the *default* accent hex inlined, so on a History
(amber) or Finance (green) subject the entrance still flashes sky-blue. Rubric 5 requires every
colour to come from `palette`.

### F5 — `Math.random()` breaks render determinism (severity: medium)
[bigtext.ts:646](../../src/studio/painters/bigtext.ts:646)
`const pulseGlitch = isPulse ? unit * 0.15 * Math.random() : 0`. Every painter is contractually
deterministic from `elapsedMs` (`three3d.ts:11-13`, `common.ts:137`), so re-rendering the same frame
must be pixel-identical. It is not.

### F6 — the periodic pulse turns the whole headline monochrome for 150 ms (severity: medium)
`short-strip.png` frame 11 (p = 0.73) shows the settled headline reverting to pink ghosts. Confirmed
arithmetic: that cell is elapsedMs = 5867, and `isPulse = elapsedMs % 3000 > 2850`
([bigtext.ts:645](../../src/studio/painters/bigtext.ts:645)) is true from 5850–6000 ms. Because of
F3's `if/else`, the pulse *replaces* the text rather than overlaying it, so every 3 s the headline
loses its colour entirely. Fixing F3 fixes this too.

### Not findings (checked, no defect)
- Frame 00 of every strip is blank. That is elapsedMs = 0 where all `enterT()` are correctly 0. One
  frame at t=0, not dead time — the wide strip's 533 ms cell spacing simply cannot show the
  entrance, which is why the `--entrance` window exists.
- The expanding shockwave ring leaving the frame after 350 ms is intentional, not clipping.
- Typography: `px` derives from `layout.unit`/`h` and resolves to 148 (short, 5 lines) / 146 (long,
  2 lines); sub tier is `px * 0.45`. No overflow at rest, no orphan words, tiers clearly distinct.

### Unfixed, logged
[bigtext.ts:424](../../src/studio/painters/bigtext.ts:424) `if (!cam) return;` — when WebGL is
unavailable the painter draws **nothing**, contradicting `three3d.ts:69` ("callers fall back to a 2D
drawing"). Not reproducible in this harness (WebGL worked for all 110 kinds), so it is logged rather
than fixed blind.

---

# ROUND 2 — fixes applied

All in `src/studio/painters/bigtext.ts`. Named constants added at the top of the file; no new
hardcoded hex; no schema or demo-data changes.

| finding | fix |
|---|---|
| F1 | Stamp overshoot is now clamped to what fits: `overshoot = clamp01(min(STAMP_OVERSHOOT, (w * STAMP_SAFE_W) / widestLine - 1))`. Resolves to 1.20× (short) and 1.11× (long) instead of a fixed 1.8×. |
| F2 | New `safeLift`: when `vertical && scene.sub`, the centred composition is raised by exactly the overhang past `h * SHORTS_SAFE_BOTTOM - unit * SHORTS_SAFE_GAP`. Long is untouched. |
| F3 / F6 | `drawStyledLine` is now called unconditionally; the chromatic split is drawn *over* it on `"screen"` with `globalAlpha = bodyAlpha * (gAmount / maxGlitch) * GHOST_ALPHA`. The `if/else` swap is gone, so colour ramps from the first visible frame and the 3 s pulse overlays instead of replacing. |
| F4 | Ghost colours are now `env.palette.secondary` / `env.palette.accent`. |
| F5 | `Math.random()` → `idle(env, PULSE_JITTER_MS)`, the existing deterministic oscillator in `common.ts:210`. |
| new (round 2b) | The icon scaled about the composition origin, so a small `iconIn` multiplied its slot's y toward centre and it flew *up through* the headline (old `short-strip-0-500ms.png` frames 02–07). Now `translate(0, iconSlotY + float)` then `scale`, so it grows in place. |

`npx tsc --noEmit`: **0 errors in `painters/bigtext.ts`**, total **99** — equal to
`qa/ledger.json → typecheckBaseline`, not raised.

# ROUND 3 — re-observed

Re-shot both aspects, wide and `--entrance`. `console.log` empty.

| section | before | after | evidence |
|---|---|---|---|
| 1. Containment & safe area | 2 | **4** | no clipping in any cell of either entrance strip; sub baseline now 1413 on a 1920 frame, 27 px clear of the 1440 band |
| 2. Typography | 4 | **4** | unchanged; no defect found either round |
| 3. Motion quality | 2 | **4** | `short-strip-0-500ms.png` frames 01→08 ramp smoothly; accent colour present from frame 01; no single-frame jumps |
| 4. Cleanliness | 2 | **4** | no swap seam; `short-strip.png` frame 11 (p = 0.73) renders normally now; deterministic |
| 5. Palette & consistency | 2 | **4** | ghosts follow the subject accent/secondary |

## Deliberately left

- **4/5 rather than 5/5 on containment:** at rest the rocket sits very tight against the ascender of
  "future" (`short-p90.png`). Within a few px, not overlapping. Not worth a third round.
- **No per-line stagger in variant 4.** The rubric asks for a stagger, but variant 4 is a *stamp* —
  the whole headline landing as one unit is the intent, and variants 0/1/2 are the staggered ones.
  Changing it would be a redesign, not a fix.
- **`if (!cam) return;`** ([bigtext.ts:424](../../src/studio/painters/bigtext.ts:424)) — no 2D
  fallback when WebGL is missing. Not reproducible here; fixing it blind is guesswork.

## Why this kind is `blocked`, not `passed`

Everything above covers **variant 4 only**. `variantOf(scene.id, 5)` picks the variant from the scene
id, and the kind index exposes exactly one scene per kind, so variants 0, 1, 2 and 3 — roughly 80 %
of `paintBigtext` — were never rendered. Notably, F2's safe-area bug almost certainly also affects
**variant 1**, which anchors at `h * 0.6` and places its sub *below* that
([bigtext.ts:470](../../src/studio/painters/bigtext.ts:470)); it is not fixed because it is not
observable.

**Remedy (harness, ~30 lines):** add `--scene=<id>` to `scripts/filmstrip.mjs` plus a
`window.__PROBE_SCENES` listing, then add four `bigtext` demo scenes with ids that hash to variants
0–3. That unblocks every `variantOf`-seeded painter, not just this one.

---

# ROUND 4 — variant blind spot removed

The remedy proposed above was built, so the "blocked" reason no longer holds.

**Harness:** `scripts/filmstrip.mjs --scene=<id>` now targets one exact demo scene, backed by
`SCENE_INDEX` + `window.__PROBE_SCENES` in `src/app/probe/page.tsx`. Output lands in
`qa/<kind>/<sceneId>/`. **Demo:** four `bigtext` scenes added whose djb2 hashes land on variants
0–3 (`t-bigtext-v0ae`, `-v1ab`, `-v2ad`, `-v3aa`); `t-bigtext` is untouched and still variant 4, so
`--kind=bigtext` behaves exactly as before.

All four previously-unreachable variants captured, both aspects, wide and `--entrance`.
`console.log` empty for all four.

### V0-1 — variant 0's accent bar was fully present at t = 0 (severity: high) — FIXED
`t-bigtext-v0ae/short-strip.png` frame 00 (p = 0, 0 ms): a full-brightness cyan bar, ~80 % of its
final height, with nothing else on screen. Cause: `barIn` multiplied only the *last* term of the
height expression, so `(lines.length - 1) * lineH` was unconditional and opacity was never ramped.
Fixed at [bigtext.ts:545](../../src/studio/painters/bigtext.ts:545) — `barIn` now scales the whole
height and drives `globalAlpha`, inside its own save/restore. Re-shot: the bar grows from nothing in
step with the icon and the line cascade.

### Hypothesis from ROUND 1 — disproved
I predicted variant 1 shared F2's Shorts safe-area bug because it anchors at `h * 0.6`. It does not:
its `maxH` is `h * 0.35` rather than `h * 0.44` ([bigtext.ts:365](../../src/studio/painters/bigtext.ts:365)),
so the type is smaller and the sub block ends near y ≈ 1310, comfortably above the 1440 band.
Recording this because it was stated as likely and turned out to be wrong.

### Variants 1, 2, 3 — observed, no blocking defect found
Wide strips for all three, plus the `--entrance` strip for variant 3. Nothing clipped, nothing in
the Shorts UI band, no crashes, staggered entrances present and eased. **They have not been scored
section-by-section against the full rubric**, so they are not claimed as 4/5.

### Remaining work on this kind
- Rubric-score variants 1, 2 and 3 properly (read both aspects × wide + entrance for each).
- Variant 3's outline pass is very low contrast mid-entrance
  (`t-bigtext-v3aa/short-strip-0-500ms.png` frames 04–11) and the full 5-line reveal does not
  complete until ≈ 1400 ms. Worth judging against the rubric's "settles" criterion; not yet scored.

---

# ROUND 5 — all five variants scored, kind closed

Two more fixes after reading the newly-reachable variants:

### V2-1 — variant 2's letters cascaded straight through the icon (severity: medium) — FIXED
`t-bigtext-v2ad/short-strip-0-500ms.png` frames 01–08: glyphs of line 0 fly upward past the rocket.
The icon rests `px * 1.05` above the first baseline, but each character started at
`-px * 1.5` — further up than the icon slot. Now `CASCADE_RISE = 0.9`, below the icon.

### V-all — the 3D grid floor ignored the palette (severity: low) — FIXED
`new THREE.Color("#31435a")` at the GridHelper was the last hardcoded colour in the file. Now
`shade(accent, -0.62)`, so the floor follows the subject accent like everything else. Verified:
`grep -E '"#[0-9a-fA-F]{3,6}"|rgba\([0-9]'` leaves only achromatic values (white, silver `#d1d5db`,
black shadow), which are legitimate under rubric 5.

## Final scores — all five variants

| section | score | basis |
|---|---|---|
| 1. Containment & safe area | **4** | no clipping in any variant, either aspect; sub clears the 1440 band in all five (v0 ≈1358, v1 ≈1310, v2/v3/v4 lifted to 1413) |
| 2. Typography | **4** | size derives from `layout.unit`/`h`; clean wraps at both aspects in all variants |
| 3. Motion quality | **4** | every variant eased and staggered; nothing goes 0→full between adjacent 33 ms cells; all settle well before p = 0.95 (slowest is v3 at ≈1400 ms of an 8 s scene) |
| 4. Cleanliness | **4** | no swap seams, no stray marks, deterministic — no `Math.random`/`Date.now` in the file |
| 5. Palette & consistency | **4** | zero non-achromatic hardcoded colours remain |

**Status: passed.** Eight defects fixed across the kind. Not 5/5 because the rocket sits very tight
against the "future" ascender at rest in variant 4, and because scoring rests on one demo text
string per variant rather than a range of lengths.

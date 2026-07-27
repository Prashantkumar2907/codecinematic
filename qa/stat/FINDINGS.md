# stat — ROUND 1 findings (diagnosis complete, fix NOT applied)

Captured after the systemic frozen-3D fix, so `stat`'s 3D layer is animating for the first time.
`console.log` empty — it does not crash. It is, however, now visibly broken on 9:16.

## S0 — context: this kind got worse, not better
Before the `three3d.ts` fix, `stat`'s isometric block never rendered, so the scene was a plain
2D odometer on a gradient — wrong, but tidy. Now the block renders and **overflows the entire 9:16
frame** (`short-p90.png`): a giant purple slab at an extreme angle, bleeding off all four edges,
with the label and sub text colliding on top of it.

## S1 — the block is 60 % wider than the camera can see at 9:16 (severity: high)
`isoCamera()` is fixed at (6.5, 5.2, 7.5) with fov 32 → distance 11.8, frustum half-height 3.21.
Half-width is `3.21 × aspect`:

| aspect | frustum halfW | block halfW (5.8/2) | fits |
|---|---|---|---|
| short 9:16 | **1.81** | 2.90 | **no — 60 % over** |
| long 16:9 | 5.71 | 2.90 | yes |

`blockW` is hardcoded to 5.8 at [stat.ts:121](../../src/studio/painters/stat.ts:121) with no reference
to the frustum. Same root cause as bullets B3/B5: fixed world dimensions against an aspect-dependent
camera.

**Fix to apply** — the pattern already proven in `bullets.ts`: derive the size from the frustum
rather than hardcoding it.
```
const dist = camera.position.length();
const halfH = Math.tan((32 * Math.PI) / 360) * dist;
const halfW = halfH * (rect.w / rect.h);
const blockW = Math.min(HARDCODED_MAX, 2 * halfW * FILL);
```
Then re-check `blockH = 3.2` against `halfH = 3.21` — it is at 100 % of the frustum height even at
16:9, which is why the slab touches the top and bottom edges there too.

## S2 — label and sub overlap (severity: high)
`short-p90.png`: "Faster rendering after the WebGL switch" and "Measured across 500 scene renders on
the same machine." are drawn on top of each other with no gap. Likely a consequence of S1 pushing
the projected anchor points around; re-measure after S1 is fixed before treating it as separate.

## S3 — hardcoded colours (severity: low)
[stat.ts:123](../../src/studio/painters/stat.ts:123) `makeBlock(..., "#0f172a", accent)` and
[stat.ts:131](../../src/studio/painters/stat.ts:131) `new THREE.Color("#31435a")` for the grid — the
same two literals cleared out of `bigtext.ts`. Use `shade(accent, …)`.

## Not yet assessed
Motion, Shorts safe area and typography cannot be scored until S1 is fixed — the composition is
unreadable in its current state.

---

# ROUND 2 — fixed, and a correction to ROUND 1

**Correction:** ROUND 1 claimed `blockH = 3.2` was "at 100 % of the frustum height". Wrong — the
frustum spans `2 × 3.21 = 6.42`, so a 3.2-tall block uses half of it. Only the *width* overflowed.

| finding | fix |
|---|---|
| S1 | `blockW` is now `min(designW, 2 × halfW × BLOCK_FILL − BASE_OVERHANG)` with `halfW` read off the live camera and `rect` aspect. 16:9 is unchanged at 5.8; 9:16 clamps to ~2.9 and fits. |
| S2 | The centred branch put the context at a fixed `floatY + 6.0u` while the label occupied 2 lines from `floatY + 3.5u`. Now `floatY + 3.5u + labelLines.length × 1.7u + 1.1u`. |
| S3 | `"#0f172a"` → `shade(accent, -0.78)`, grid `"#31435a"` → `shade(accent, -0.62)`. No hardcoded colour left. |
| S4 (new) | The label faded in at a fixed 320 ms while the odometer reels spin until ≈950 ms, so text sat on rolling digits for ~600 ms (`short-strip-0-500ms.png` frames 10–15). Reel timing is now named (`ODO_DELAY_MS`/`ODO_STAGGER_MS`/`ODO_ROLL_MS`), the settle time is derived from the digit count, and label and context are gated on it. |

## Scores

| section | before | after | evidence |
|---|---|---|---|
| 1. Containment & safe area | 1 | **4** | block inside frame at both aspects; text above the 1440 band |
| 2. Typography | 2 | **4** | value fitted, label wraps to 2 lines, three distinct tiers |
| 3. Motion quality | 2 | **4** | `short-strip-0-1400ms.png`: block flies in → reels spin → digits land 840 ms → label 933 ms → context 1120 ms. Staggered, eased, settles at p ≈ 0.18 |
| 4. Cleanliness | 3 | **4** | no overlap, no stray marks |
| 5. Palette & consistency | 2 | **4** | all colour from `palette` |

**Status: passed.** Same root cause as bullets B3/B5 — fixed three.js world dimensions measured
against an aspect-dependent frustum.

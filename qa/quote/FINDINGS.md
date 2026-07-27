# quote — findings

Found by `npm run edge-audit` (worst offender: left 44 %, right 45 % of the border band at 9:16).

## Q1 — the glass card overhung both side edges at 9:16 (severity: high) — FIXED
`blockW` was a literal `vertical ? 6 : 9`. At 9:16 the camera (fov 40, z 14) has a frustum
half-width of **2.87**, but the block's half-width is **3.0** — a sliver off each side, running the
full height of the card, which is why it showed up as ~45 % of both side bands.

16:9 was never affected (half-width 7.12 vs 4.5), which is exactly how a bug like this survives:
it is invisible in the aspect people check first.

Fixed with a new shared helper `frustumHalfExtent(camera, rect)` in `three3d.ts`, so the block is
`min(designW, 2 × halfW × BLOCK_FILL)`. Re-measured: **0 % on all four edges, both aspects.**

## Q2 — hardcoded grid colour (severity: low) — FIXED
`new THREE.Color("#31435a")` → `shade(accent, -0.62)`. Third occurrence of this same literal
(after bigtext and stat).

## Scores

| section | before | after |
|---|---|---|
| 1. Containment & safe area | 2 | **4** (measured 0 % edge bleed; card bottom ≈1420, clear of the 1440 band) |
| 2. Typography | 4 | **4** |
| 3. Motion quality | 4 | **4** |
| 4. Cleanliness | 4 | **4** |
| 5. Palette & consistency | 3 | **4** |

**Status: passed.**

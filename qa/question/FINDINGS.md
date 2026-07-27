# question — findings

Found by `npm run edge-audit` (long: bottom 32 %, left 3 %; short: left 7 %).

## Qu1 — the entire 2D layer was translated off-frame (severity: high) — FIXED
`long-p90.png` before: the heading "Which visual matches your subject?" sliced at x = 0, and the
"Comment your answer" CTA cut in half by the bottom edge.

Cause: [question.ts:175](../../src/studio/painters/question.ts:175) computed
`offsetX/offsetY = projectedPanelCenter − origPanelCenter` and wrapped **everything after it** —
heading, hint, CTA — in `ctx.translate(offsetX, offsetY)`. The camera is off-axis at
(6.5, 4.8, 8.5), so that difference is not a small parallax nudge, it is the full projection error,
and it dragged the whole composition out of the frame.

Now clamped to ±`unit × MAX_PARALLAX_UNITS`, so the layer still tracks the panel slightly but can
never leave the safe area.

## Qu2 — the CTA sat under the Shorts UI band (severity: high) — FIXED
`by` was clamped to `h * 0.86 − bh`; the caption strip starts at `h * 0.75`. Now
`(vertical ? SHORTS_SAFE_BOTTOM : 0.94) * h − bh − maxNudge`, so the clamped parallax cannot push
it back into the band.

## Qu3 — hardcoded colours (severity: low) — FIXED
`"#31435a"` grid and `"#0d1117"` panel → `shade(accent, …)`.

## Re-measured
`__PROBE_EDGEBLEED`: **0 % on all four edges, both aspects** (was bottom 32 % at 16:9).

## Scores

| section | before | after |
|---|---|---|
| 1. Containment & safe area | 1 | **4** |
| 2. Typography | 4 | **4** |
| 3. Motion quality | 4 | **4** |
| 4. Cleanliness | 3 | **4** |
| 5. Palette & consistency | 3 | **4** |

## Deliberately left
The 3D backboard is a near-black panel on a near-black background, so all that reads is its lit top
edge — a thin dark shelf between the heading and the hint. It does not overlap any text and scans as
a plinth rather than an error. Making it visible would be a design change, not a defect fix, and
would risk clashing with the 2D text layer which is positioned independently of it.

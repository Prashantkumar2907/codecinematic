# showdown — ROUND 1 (diagnosis; needs a layout rework, not a clamp)

`qa/AUDIT.md`: left 4 %, right 1 % at 9:16. The score understates it — the clipped elements are
small, but they are the *labels*.

## Sh1 — a 2D layout round-tripped through a perspective camera does not come back (severity: high)
`short-p90.png`: "SQL" is sliced off the left edge, "NoSQL" off the right, and both fighters' score
digits and the crown emoji are cut with them.

The painter designs in 2D pixels, converts to world space **linearly**
([showdown.ts:85](../../src/studio/painters/showdown.ts:85)):

```
nx = (px - areaX) / areaW - 0.5      →  world x = nx * spreadX * 2   (spreadX = 5.5)
```

…then projects back through a camera at (0, 10, 7) looking down at the origin and expects the pixel
it started from ([showdown.ts:237](../../src/studio/painters/showdown.ts:237) `proj2d`). A tilted
perspective camera maps the ground plane non-linearly, so it does not round-trip: at 9:16 the
frustum half-width is ≈2.23 world units while the design spans ±5.5, and everything near the design's
left and right edges projects well outside the frame.

This is the same family as question's Qu1 but not fixable the same way — question only needed the
offset clamped, whereas here the *entire coordinate mapping* is wrong, so clamping would just pile
elements against the edges.

**Correct fix:** derive `spreadX`/`spreadZ` from the camera so the design's extreme corners project
inside `rect` — solve for the scale `k` where `projectToRect(cam, worldPos(areaX, ·) * k)` lands at
`rect.x`. Needs `cam` before `build` uses `worldPos`, so the spread has to be computed from the
camera parameters directly rather than from the built camera.

## Sh2 — hardcoded card colour (severity: low)
`makeBlock(..., "#0b0f15", accent)` at [showdown.ts:117](../../src/studio/painters/showdown.ts:117)
and the `"#31435a"` grid literal again.

## Also visible, unassessed
Large dead band between the cards and the criterion rows at 9:16; the three criterion rows are
crammed against each other while ~40 % of the frame below them is empty.

**Status: in-progress.** Not attempted — this is a layout rework, and a partial fix would be worse
than none.

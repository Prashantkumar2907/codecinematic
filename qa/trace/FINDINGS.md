# trace — round 1 findings

Capture: `{short,long}-strip.png`, `-p50/p90.png`, `console.log` (empty), `edge-check`.

Scores before: containment 1, typography 3, motion 4, cleanliness 2, palette 2.

1. **(cont, sev 1) The code panel overflowed the left edge at 9:16** — `edge-check` measured
   1.5% left bleed. Same cause as `code`: the 3D viewport was the whole frame
   (`trace.ts:145` `rect = {0,0,layout.w,layout.h}`) with a hardcoded `blockW = 7`
   (`:82`) against a ~3.49 frustum half-width, and the pixel chrome was then fitted to the
   block by `scale = (scaleX + scaleY) / 2` (`:170`) — a mean that matches neither axis.
2. **(clean, sev 2) Group offset, scale, bob and two-axis rotation** (`trace.ts:116-131`)
   moved the block every frame while the code text was drawn in fixed pixels.
3. **(cont, sev 2) The array-cell row was centred in a band measured to `contentH`**
   (`trace.ts:72-73`), i.e. past the Shorts UI edge, so the row sat ~200px lower than the
   visible area and left a dead gap between the code panel and the cells.
4. **(palette, sev 2)** `"#0e2433"` (`trace.ts:269`) and `"#06121a"` (`:323`) hardcoded.

**Not a finding:** the step choreography — line-highlight glide (`easeInOutCubic`), the swap
arc and the i/j pointer pins all read correctly in `short-p50.png` and the strip.

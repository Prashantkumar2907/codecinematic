# vocab — round 1 findings

Capture: `qa/vocab/{short,long}-strip.png`, `-strip-0-500ms.png`, `-p50/-p90.png`. console.log empty.

Scores before: containment 2, typography 3, motion 4, cleanliness 1, palette 2.

1. **(clean, sev 1) The example text does not sit on its slab — the two layers are
   unrelated.** `long-p90.png`: the three slabs are bunched right of centre (x≈700-1270 of
   1920) while the text is left-aligned from x≈70. "Retries are safe because the write is
   idempotent." is drawn straight through slab 1's front-left corner. Cause: the camera is
   off-axis at `(6.5, 4.5, 8.5)` (`painters/vocab.ts:146`) and each row is also staggered in
   Z (`baseZ`, `vocab.ts:185/221`), so a slab's *screen* footprint is a diagonal parallelogram
   whose centre is nowhere near `projectToRect(cam, (0, baseY, baseZ))`. The text is centred
   on that projected point (`vocab.ts:258`) and sized from `contentW`, so alignment is
   impossible by construction.

2. **(cont, sev 1) ~26% of the 9:16 frame is dead black between the meaning and the
   examples.** `short-p90.png`: meaning ends y≈530/1920, first example at y≈1040.
   `vocab.ts:126` centres the example block in the leftover space and `vocab.ts:124` caps row
   height at `unit*3.6`, so the block is small AND pushed to the middle of the void instead
   of starting under the meaning.

3. **(cont, sev 2) The ghost socket boxes are `contentW` wide but centred on the projected
   world origin, so they hang off the left edge.** `short-strip.png` frame 04: the dashed rect
   at the left is cut by the frame edge. `vocab.ts:240` uses `p.x - contentW/2` where `p.x` is
   the projection, not the layout centre.

4. **(typo, sev 2) Adjacent 2-line examples collide.** `short-p90.png`: example 1's second
   line ("idempotent.") baseline sits ~6px above example 2's first line. Row pitch comes from
   a world constant (`1.5`, `vocab.ts:184`) while text height comes from `unit`, so the two
   are never reconciled.

5. **(typo, sev 3) Dimmed rows are grey-on-near-black.** Non-current examples draw at
   `appear * 0.6` (`vocab.ts:253`) over `THEME.bgBottom`; in `short-p90.png` row 0 reads as
   mid-grey, below the "legible at phone size" bar.

6. **(palette, sev 2) Four hardcoded hex.** `vocab.ts:48` `secondary = "#1e293b"` (dead
   default — `PaintEnv.palette.secondary` is required, `painters/index.ts:128`), `vocab.ts:150`
   grid `"#31435a"`, `vocab.ts:167` card face `"#151f30"`, `vocab.ts:205` idle emissive
   `"#151f30"`.

7. **(cont, sev 2) Hardcoded world size.** `makeBlock(6.5, 0.3, 1.8)` (`vocab.ts:167`) ignores
   the frustum; `frustumHalfExtent()` exists for exactly this (`three3d.ts:139`) and the same
   bug class already hit bullets/stat/quote (`qa/ledger.json` → `systemic`).

8. **(cont, sev 3) No Shorts bottom-band guard.** Nothing clamps the example block above the
   YouTube UI band; the passed kinds use `SHORTS_SAFE_BOTTOM = 0.75` (`bullets.ts:11`,
   `bigtext.ts:15`, `question.ts:10`).

**Not a finding:** the entrance is already good — `short-strip-0-500ms.png` shows word (0-300ms),
chip+pron (150-470ms), meaning (260-580ms) cascading with `easeOutBack`/`easeOutCubic` and no
pop-in. Motion scored 4 on entrance; it is the composed layout that fails.

**Deliberately not addressed:** the Shorts right-hand action rail (~15%). No painter in this
repo guards it (grep for `SAFE` in `src/studio/painters`), including the six already passed, so
handling it here alone would diverge from house style. Flagged for a separate systemic pass.

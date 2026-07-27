# mythfact — round 1 findings

Capture: `{short,long}-strip.png`, `short-strip-8000-8900ms.png` (the bust window — beat 1
opens at p=0.5 of a 2-beat 16s probe scene), `{short,long}-p50/p90.png`. console.log empty.

Scores before: containment 1, typography 2, motion 3, cleanliness 1, palette 2.

1. **(clean/cont, sev 1) The card chrome and the 3D slab are unrelated layers.**
   `long-p90.png`: the MYTH chip and the whole first text line sit in empty black above and
   left of the red slab; the ✗ badge floats ~120px right of the slab's right edge; same for
   FACT/✓. Cause: `mythfact.ts:67-84` computes the card rect in *pixels* from `contentW`/
   `usableH`, then `mythfact.ts:220-235` re-centres that rect on `projectToRect(...)` of the
   block while keeping the pixel width and height. The block is `makeBlock(5.0, 0.3, 3.0)`
   (`mythfact.ts:132-139`) seen from `(6.5, 4.8, 8.5)` (`:113`), so its screen footprint is a
   small tilted parallelogram with no relation to `cardW × ch`. Alignment is impossible by
   construction — the same defect class as vocab and `ledger.json` → `2d-layout-round-tripped-
   through-camera`.

2. **(clean, sev 2) The strike-through overshoots into empty space.** `long-p90.png`: the line
   runs ~150px past "copy". `mythfact.ts:257` draws to `mythR.x + unit + (mythR.w - unit*2)`,
   i.e. the full card width, instead of the measured width of the widest struck line.

3. **(motion, sev 2) The myth slab colour pops in one frame.** `short-strip-8000-8900ms.png`
   frame 00 (8000ms) → 01 (8060ms): near-black to full red. `mythfact.ts:162-168` switches on
   the `busted` boolean — emissive jumps `#1c1414`@0.05 → DANGER@0.3 with no ramp.

4. **(cont, sev 2) Hardcoded world sizes.** `bW/bD` are literals (`mythfact.ts:132-133`) so
   the slab is sized for one aspect only; `frustumHalfExtent()` (`three3d.ts:139`) exists for
   this.

5. **(cont, sev 3) The `emphasis` variant is a no-op on the 3D layer.** `variant === 2` changes
   only the pixel rect heights (`mythfact.ts:74-78`); `bW`/`bD` key off `split` alone, so the
   "payoff fact card dominates" intent never reaches the geometry.

6. **(palette, sev 2) Five hardcoded hex.** `mythfact.ts:117` `"#31435a"`, `:135`/`:166`
   `"#1c1414"`, `:138` `"#112215"`, `:322` `"#06121a"`. (`DANGER = "#f87171"` at `:9` is kept:
   THEME has no danger colour and myth/fact red-green is semantic, not subject accent.)

**Not a finding:** the bust choreography itself. `short-strip-8000-8900ms.png` shows the ring
sealing, the cross drawing on stroke-by-stroke, the fact card entering ~180ms later and the tick
drawing last — properly staggered and eased. Only the colour flip in (3) is wrong.

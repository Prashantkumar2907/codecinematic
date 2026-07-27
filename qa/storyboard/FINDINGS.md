# storyboard — round 1 findings

Capture: `{short,long}-strip.png`, `-p50/p90.png`, `console.log`.

Scores before: containment 2, typography 3, motion 3, cleanliness 2, palette 1.

1. **(clean, sev 1) Panel cards keystone-mismatched their slabs.** Camera at
   `(0, 14, 10)` looking down (`storyboard.ts:75`); the 2D card rect is the bounding box of
   two projected mid-height corners inset 5% (`:222-234`), which under a tilt is not the
   visible face. Result in `short-p90.png` (before): each slab is wider at the bottom than the
   top while the card is axis-aligned, so left/right margins differ per row, and the lit top
   faces read as stray silver bars under each card.
2. **(cont, sev 1) The grid ran into the Shorts UI band.** `areaH = contentH - titleBand`
   unconditionally (`storyboard.ts:51`), putting the bottom row's caption — load-bearing text —
   at y≈1690 of 1920.
3. **(clean, sev 2) Panel sizes were unequal.** Perspective made the near row visibly larger
   than the far row, so a storyboard's frames were not the same size.
4. **(motion, sev 2) `easeOutBack` reveal scale plus a y-bob on the active panel**
   (`storyboard.ts:138`, `:141`) moved the slab under a pixel-pinned card; the reveal also
   shrank 1.0→0.9 before growing back, a visible hiccup at each beat boundary.
5. **(palette, sev 1) `rgba(secondary, 0.5)` into `studioLights` and `rgba(accent, 0.6)` as a
   `makeBlock` edge colour** (`storyboard.ts:77`, `:101`) — alpha dropped by `THREE.Color`,
   logged in `console.log`. Plus 8 hardcoded hex/rgba (`:79`, `:101`, `:200`, `:246`, `:261`,
   `:267`, `:268`, `:289`, `:291`).
6. **(clean, sev 3) Fractional card inset** gave a cell twice as wide as tall twice the
   horizontal margin of the vertical one.

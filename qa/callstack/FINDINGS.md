# callstack — round 1 findings

Capture: `{short,long}-strip.png`, `-p50/p90.png`, `console.log` (empty), `edge-check`.

Scores before: containment 2, typography 3, motion 1, cleanliness 2, palette 1.

1. **(motion, sev 0) The 3D stack was frozen at frame 0.** `short-p90.png` (before) shows a
   single `fact(3)` slab for the whole scene while the 2D rows advanced independently.
   `update()` read the painter-local `cur`, `prev`, `pushing`, `popping` and `t`
   (`callstack.ts:122-160`), which the `build()` closure captures on the first frame;
   `render3D`'s `liveEnv` argument only refreshes `env`. Push and pop were therefore invisible
   in the 3D layer. Same family as `qa/ledger.json` → `systemic` → `frozen-3d-layer`.
2. **(cont, sev 1) The stack base sat inside the Shorts UI band.** `stackBottom` clamped to
   `layout.h * 0.86` = y 1651 (`callstack.ts:68`), so the baseline rule and the bottom frame
   were under the YouTube UI. Now `0.75`, matching bullets/bigtext/question.
3. **(clean, sev 2) Frame slabs were world literals** (`blockW = 6`, `blockH = maxH/(depth+1)`,
   `callstack.ts:87-112`) under a camera at `(0, 4, 14)` while the labels were pixel rows, so
   the label row and the slab it belongs to could not line up; a per-frame `sin` bob
   (`:154`) moved the slabs every frame under fixed-pixel text.
4. **(typo, sev 2) The label overhung its slab during a push.** The mesh scaled from 0 while
   the 2D row stayed full width (`callstack.ts:137`, `:255`); the row now takes the same scale
   about the same centre.
5. **(palette, sev 1) `mat.color.setStyle(accentSoft)`** (`callstack.ts:161-162`) — `accentSoft`
   is an `rgba()` string, so `THREE.Color` drops the alpha and paints full accent. Plus 3
   hardcoded hex (`:94`, `:113`, `:165`).
6. **(cont, sev 3) Rows capped at `unit * 2.6`** left the stack occupying under a third of its
   band with ~45% dead space above it.

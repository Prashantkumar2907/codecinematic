# terminal — round 1 findings

Capture: `{short,long}-strip.png`, `-p50/p90.png`, `console.log`.

Scores before: containment 2, typography 3, motion 3, cleanliness 2, palette 2.

1. **(clean, sev 1) The window chrome overhangs the slab.** `short-p90.png` (before): the
   camera sat at `(0, 14, 10)` looking down (`terminal.ts:35`), so the slab projected as a
   keystoned quad — top edge x 200→885, bottom edge x 100→980 — while the title bar is an
   axis-aligned pixel rect ending at x=940. The bar's right end therefore hung ~55px past the
   slab's top-right corner into black. Cause: the 2D frame is the *bounding box* of two
   projected mid-height corners (`terminal.ts:112-123`), which is strictly larger than the
   visible face under a tilted camera.
2. **(motion/clean, sev 2) The slab scaled and bobbed under fixed-pixel chrome.**
   `terminal.ts:81-85` applies `scale = 0.9 + 0.1*in` and a permanent `bob` on y; the chrome
   never follows, so the window and its frame slide against each other every frame.
3. **(cont, sev 2) The window filled the whole content band**, running its bottom edge to
   y≈1745 on 9:16 — inside the Shorts UI band (>1440) — while the terminal body below the last
   line was empty. `rect` was `contentH` unconditionally (`terminal.ts:26`).
4. **(palette, sev 1) Two `rgba()` strings passed into THREE**: `rgba(secondary, 0.5)` to
   `studioLights` (`terminal.ts:37`) and `rgba(accent, 0.6)` as a `makeBlock` edge colour
   (`:59`). Both logged `THREE.Color: Alpha component ... will be ignored` in `console.log`.
   Plus nine hardcoded hex/rgba literals (`:39`, `:59`, `:160`, `:161`, `:164`, `:170`, `:187`,
   `:188`, `:196`).
5. **(typo, sev 3) Mono type capped at `unit*0.8`** (`terminal.ts:135`) when the width budget
   allowed more, leaving the smallest legible size in the batch.

**Deliberately kept literal:** the three macOS traffic-light colours. They are a real-world UI
reference, not subject-accent colours; they are now a named `TRAFFIC_LIGHTS` const with that
rationale rather than an inline array.

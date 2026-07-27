# code — round 1 findings

Capture: `{short,long}-strip.png`, `-p50/p90.png`, `console.log` (empty),
`node scripts/edge-check.mjs --kind=code`.

Scores before: containment 1, typography 3, motion 3, cleanliness 2, palette 1.

1. **(cont, sev 0) The editor window overflowed both side edges at 9:16.** `short-p90.png`
   (before): traffic lights half off at x=0, the `JS` badge and `UTF-8` clipped at x=1080, and
   `console.log(p1.hasOwnProperty("greet` cut mid-string. `edge-check` measured 1.7% left /
   0.7% right. Cause: the 3D viewport was the **whole frame** (`code.ts:148`
   `rect = {0,0,layout.w,layout.h}`) with a hardcoded `blockW = 7.5` (`:90`). At 9:16 the
   frustum half-width is `tan(22.5°)*15*(1080/1920) ≈ 3.49`, so the block's 3.75 half-width hung
   off both sides — and the pixel chrome was then scaled onto the block by the transform at
   `:171-173`, so it overflowed too.
2. **(clean, sev 1) The chrome was fitted to the block by the mean of two axis scales**
   (`code.ts:164-166` `scale = (scaleX + scaleY) / 2`), which matches neither axis whenever the
   block is not square — a built-in mismatch between the window art and its background.
3. **(clean, sev 2) Group bob + two-axis rotation** (`code.ts:131-134`) moved the block every
   frame under chrome that only followed its bounding box, and `easeOutBack(enterT)` overshot
   past 1 on entrance.
4. **(cont, sev 2) `maxFh` clamped to `contentH * 0.92`** (`code.ts:85`), so a full-height
   snippet at 9:16 puts the status bar and last lines below y=1440 — inside the Shorts UI band.
5. **(palette, sev 1) Eleven hardcoded hex/rgba**, including three `"rgba(56,189,248,…)"`
   literals that hardcode the *default* accent and therefore ignore the subject palette
   entirely (`code.ts:253`, `:255`), plus `:103`, `:188`, `:189`, `:193`, `:209`, `:230`, `:256`,
   `:265`, `:299`.

**Deliberately kept literal:** the three macOS traffic-light colours, now a named
`TRAFFIC_LIGHTS` const.

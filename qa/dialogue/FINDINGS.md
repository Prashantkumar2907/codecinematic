# dialogue — round 1 findings

Capture: `{short,long}-strip.png`, `-p50/p90.png`, `console.log`.

Scores before: containment 2, typography 1, motion 2, cleanliness 1, palette 1.

1. **(typo, sev 0 — the scene renders NO message text at all.)** Every frame of
   `short-strip.png` and `long-strip.png` shows the header and a skewed dark panel and
   nothing else: not one bubble, not one word of the conversation. Cause:
   `projectedPoints` is a fresh `const` array created per paint call (`dialogue.ts:147`)
   but it is written inside `update()` (`dialogue.ts:235-239`), and `update` is the closure
   `build()` returned — which runs once and captures **frame 0's** array. From frame 1 on,
   `update` fills a dead array while the live one stays empty, so `if (!p) return`
   (`dialogue.ts:334`) drops every bubble. This is the `frozen-3d-layer` bug in
   `qa/ledger.json` → `systemic`, in its output-array form: the central `liveEnv` fix cannot
   reach it because the frozen value is a painter-local array, not `env`.

2. **(palette, sev 1) `rgba()` strings passed to `THREE.Color`, so transparency is silently
   dropped and the colour renders at full strength.** `console.log`:
   `THREE.Color: Alpha component of rgba(56, 189, 248, 0.14) will be ignored` and the same
   for `rgba(148,163,184,0.3)`. `dialogue.ts:187-188` uses `accentSoft` as a face colour and
   a literal `"rgba(148,163,184,0.3)"` as an edge colour. That is the solid sky-blue slab in
   `short-strip.png` frames 10-15 — a 14%-alpha tint rendering as 100% accent.

3. **(clean, sev 1) The panel wobbles on two axes and is drawn through an off-axis camera.**
   `dialogue.ts:203-204` rotates the group by ±0.02 rad on x and y each frame while the
   camera sits at `(6.5, 4.8, 8.5)` (`:152`), so the "chat window" reads as a randomly
   skewed quadrilateral (visible in every strip frame) rather than a window. Any 2D chrome
   pinned to pixel coordinates — the header, the divider, the clip rect (`:309`, `:318`) —
   cannot follow it.

4. **(cont, sev 2) Hardcoded world sizes.** `panel3DW/H` are literals (`dialogue.ts:175-176`),
   and the bubble world sizes are derived by dividing pixel metrics by them (`:184-185`), so
   the whole mapping is calibrated for one aspect.

5. **(motion, sev 2) `easeOutBack` on the panel's entrance scale** (`dialogue.ts:198-199`)
   overshoots past 1, pushing the panel outside the frustum mid-entrance while the 2D header
   drawn at fixed pixels stays put.

6. **(palette, sev 2) Four hardcoded hex:** `dialogue.ts:156` `"#31435a"`, `:177` `"#0d1117"`,
   `:187` `"#131a22"`, `:393` `"#0e2433"`, `:418` `rgba("#0d1117", 0)`.

**Note:** the 2D layout logic itself is sound — bottom-anchored scroll (`:93-96`), wrap and
bubble measurement (`:79-83`), typing-indicator and pop choreography (`:113-131`), reaction
pop (`:378-412`). None of it was reaching the screen. The fix keeps all of it and makes the 3D
layer align to it, rather than the reverse.

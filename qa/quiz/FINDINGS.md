# quiz — round 1 findings

Capture: `{short,long}-strip.png`, `-p50/p90.png`, `short-strip-4200-4500ms.png`, `console.log`.

Scores before: containment 2, typography 2, motion 3, cleanliness 1, palette 1.

1. **(clean, sev 1) Same frozen-local-array bug as dialogue.** `projectedPoints` was a
   per-paint `const` (`quiz.ts:99`) written inside the `update()` closure `build()` returns
   (`:205-208`), so from frame 1 on the live array stayed empty and `if (!p) return` (`:222`)
   dropped every option's badge, label and tick. See `qa/ledger.json` → `systemic` →
   `frozen-painter-local-output-array`.
2. **(clean, sev 1) Off-axis camera at `(6.5, 4.8, 8.5)` plus a two-axis group wobble**
   (`quiz.ts:121`, `:167-168`) under a pixel-pinned 2D layout: the slab a label belongs to is
   a skewed parallelogram whose screen centre is not the projected world point the label used.
3. **(typo, sev 2) Option text silently truncated.** `wrapText(...)[0]` (`quiz.ts:246`) takes
   only the first wrapped line, so any option past the row width just loses its tail — with no
   ellipsis. The schema allows 52 characters (`schema.ts:236`).
4. **(motion, sev 2) `easeOutBack` on the panel entrance scale** (`quiz.ts:162-163`) overshoots
   past 1 while the 2D question and badges sit at fixed pixels.
5. **(palette, sev 1) `"rgba(148,163,184,0.3)"` passed to `THREE.Color` as an edge colour**
   (`quiz.ts:154`) — alpha dropped, renders at full strength. Confirmed in `console.log`.
   Plus six hardcoded hex/rgba: `:125` `"#31435a"`, `:146` `"#0d1117"`, `:154`/`:196`/`:197`
   `"#131a22"`, `:237` `"#06121a"`, `:75` `"rgba(13,17,23,0.9)"`, `:77` `"rgba(148,163,184,0.25)"`.
6. **(cont, sev 2) `panel3DW` is a literal** (`quiz.ts:144`) while the option width used
   `contentW * 0.9` in 2D — two different widths for the same row.

**Probe caveat:** the think-time countdown HUD (`quiz.ts:65-94`) is unreachable in the probe.
It requires `w1.start > w0.end`, and the probe's synthesised 2-beat windows are contiguous
(`common.ts:303-308` fallback), so it was NOT exercised by this capture. Untouched by this pass.

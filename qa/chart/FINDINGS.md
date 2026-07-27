# chart — ROUND 1

Captured `--kind=chart` (both aspects) and `--entrance`. `console.log` empty.
`scripts/edge-check.mjs`: **0 % on all edges, both aspects.**

## Already in good shape
Unlike bullets/stat/quote, this painter already respects the Shorts caption band via its own
`CAPTION_SAFE_Y` constant ([chart.ts:73](../../src/studio/painters/chart.ts:73),
[:173](../../src/studio/painters/chart.ts:173)), and the columns, value chips, day labels and grid
floor all sit inside the frame at both aspects. Containment and typography needed nothing.

## C1 — hardcoded colours (severity: low) — FIXED
Five literals: `"#06121a"` (in-bar value text), `"#31435a"` (grid), `"#eaf3ff"` (block edge),
`"#0a0e13"` ×2. All replaced with `shade(accent, …)`, so the chart recolours per subject.
`npx tsc --noEmit`: 0 errors in `painters/chart.ts`, total 99 (baseline, not raised).

## C2 — near-empty screen for the whole first 500 ms (severity: high) — NOT FIXED
`short-strip-0-500ms.png`: across all 16 cells the only solid element is the title. The grid and day
labels are present but at roughly 15 % opacity, and **no column has appeared at all by 500 ms**.

The columns are gated on `beatT(...)`, and the probe's first beat window opens at p = 0.05, which on
this 6-beat demo is 2.4 s in.

**This is partly a probe artifact and I could not separate the two causes.** `ANIMATION-QA-PROMPT.md`
"Known caveats" says the probe synthesises evenly-spaced beats while the engine derives them from
real TTS durations (`engine.ts:94`), where beat 0 begins at t = 0. So in a real render the first
column would start growing immediately, and much of this apparent dead time would not exist.

What is *not* a probe artifact: even granting beat 0 at t = 0, the chart's own frame — grid, axis,
day labels — establishes itself at only ~15 % opacity and never resolves during the entrance window.
The scene's structure should be crisp within ~300 ms regardless of when the data arrives.

**Suggested fix**, matching the idiom already used in `steps.ts`: give the grid/labels an absolute-time
entrance via `enterT(env, …)` independent of the beats, and add a ghost socket per column so the
chart's shape is legible before any data lands. `steps.ts` does exactly this with dashed ghost
numerals and it is the best answer to this problem in the codebase.

**Verification needed before fixing:** render with a beat window starting at p = 0 to isolate how much
of the emptiness is the probe. Do not tune beat timing against the probe.

## Scores

| section | before | after |
|---|---|---|
| 1. Containment & safe area | 4 | **4** (measured 0 % bleed) |
| 2. Typography | 4 | **4** |
| 3. Motion quality | 3 | **3** — C2 unresolved |
| 4. Cleanliness | 4 | **4** |
| 5. Palette & consistency | 2 | **4** |

**Status: in-progress.** Four of five sections pass. Motion is held at 3 deliberately rather than
waved through — the dead-time question needs the probe artifact ruled out first.

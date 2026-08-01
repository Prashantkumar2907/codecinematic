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

---

# chart — ROUND 2 (2026-08-01)

**2/4/3/4/4 → 4/4/4/4/5.** Round 1 left this kind `in-progress` at 3 on motion. Re-scoring
found the containment claim was also wrong, for a reason round 1 could not have seen.

## The coverage hole that mattered most

`paintChart` dispatches on `scene.mode` across **six** paths. The only fixture in `demo.ts`
sets `mode: "column"` — and **all 33 chart scenes in `content/` omit `mode` entirely**, so
every chart this product has ever generated renders through `paintBars`, which had **never
been captured**, while the one path ever scored has **zero** traffic.

New `DEMO_CHART_MODES` covers all five missing modes. `cht-bars` runs the schema maximum of
six items, which outranks the five-item column fixture in the probe's richness order, so
plain `--kind=chart` now resolves to the mode that actually ships.

## B1 — every value label was dark-on-dark — `chart.ts:147` (round 1 numbering) — HIGH

`inside ? shade(accent, -0.9) : THEME.text`. Near-black reads well against a full-brightness
bar — but every bar except the current one is drawn at `globalAlpha 0.62`, so its effective
colour is a mid-dark blue and the value on top of it disappears. On the six-item fixture,
**five of six values were illegible in both aspects**. Values now live in a reserved gutter
(`trackW = contentW - widest value - 0.9u`), outside the bar, in `THEME.text` when current
and `THEME.textDim` otherwise. The `inside` branch is gone.

## B2 — `CAPTION_SAFE_Y = 0.86` in all five modes — `chart.ts:28, 74, 174, 277, 409` — HIGH

Round 1 recorded "already respects the Shorts caption band via its own `CAPTION_SAFE_Y`".
It doesn't: 0.86 is one of the three wrong values row 9.0 replaced. `layout.safeBottom` is
**0.69** at 9:16 and **0.80** at 16:9. Measured on the six-item bars fixture, the last two
rows sat at 86-90% of frame height — under the burned-in caption in *both* aspects. All five
modes now read `layout.safeBottom`; the constant is deleted.

## B3 — the column chart distorted its own values — `chart.ts:184-186` — HIGH

`PerspectiveCamera` at `(0, 4, 11)` looking at `(0, 1.5, 0)`: the near column rendered
visibly wider than the far one, so **two equal values would not have looked equal** — the one
thing a chart may not do. Now an `OrthographicCamera` fitted to the plot rect with a shallow
tilt: equal widths, tops and side faces still visible, and because parallel projection is
affine everywhere, `projectToRect` puts the value chips and x-axis labels exactly on their
columns rather than near them. The 3.5-unit block also left the lower half of a 9:16 plot
empty; 4.6 in portrait fills the band.

## B4 — the 3D layer's bar heights were frozen at frame 0 — `chart.ts:209-222` — HIGH

`update()` read `env.p`, `ghostIn` and `scene.items` from the enclosing scope. `build` runs
once per key and `liveEnv` only refreshes `env`, so `ghostIn` — which gates `m.visible` — was
frame 0's value forever. Heights now travel through `render3D`'s `context`, and the 2D value
chip reads the same array the slab does, so the two cannot disagree.

## B5 — pie labels ran off both frame edges — `chart.ts:413, 487-499` — HIGH

First render of this mode. At `R = contentW * 0.4` with labels at `1.16R`, "Dependencies" was
cut to "Dependen" on the right and "Your code" to "r code" on the left. The radius now
reserves a measured label gutter, and each anchor is clamped into the content box. Note
`edge-check` reports 0.0% here — it only ever measures the kind's *default* scene, so a
clipped label in a non-default mode is invisible to it.

## B6 — round 1's open finding: nothing but the title for 500 ms — FIXED

Ghost strength was `0.35` of `THEME.textFaint` (itself a 0.76 alpha), so the chart's shape was
barely there before the first beat. Ghost labels are now `THEME.textDim` at `GHOST_A = 0.55`
and the empty tracks at 0.12, so the full shape of the chart reads from the first frame and
only the values arrive on their beats.

## B7 — two absolute-px strokes and two colour literals — MEDIUM

`ctx.lineWidth = 1.5` twice (baseline, value chip) → `unit * STROKE.thin`.
`"rgba(148,163,184,0.07)"` and `"rgba(148,163,184,0.10)"` → `rgba(THEME.textDim, …)`.

## Verification

- `npx tsc --noEmit` → **0 errors**; `npm run build` green.
- `npm run edge-check -- --kind=chart` → short 0.0%, long 0.0%.
- `qa/chart/console.log` → 0 bytes.
- **All six modes** captured and read at both aspects: `cht-bars` (default, 6 items),
  `cht` (column), `cht-line`, `cht-area`, `cht-pie`, `cht-donut`.

### Left deliberately

- **`paintColumn` still returns early with no 2D fallback when WebGL is missing.** Pre-existing;
  the engine and the probe both have WebGL, and `paintBars` would double-draw the title if
  called as a fallback from inside `paintColumn`.
- **The pie is width-constrained by its label gutters**, so it is smaller than the band would
  allow. Correct-but-conservative; leader lines would let it grow, and that is a design change.

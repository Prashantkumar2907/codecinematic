# Animation QA & Polish — Operating Prompt

Goal: take all **110** registered scene painters from "mixed quality" to "video-editor smooth" —
one at a time, evidence-driven, with no regressions.

This file has three parts:
- **Part A** — the one-time harness build (run once, ~1 session)
- **Part B** — the per-animation loop prompt (paste per batch, or let it run)
- **Part C** — the rubric (the definition of "best"; the loop scores against this)

---

## Ground truth (verified 2026-07-31)

| Fact | Value | Source |
|---|---|---|
| Registered painters | **111** | `src/studio/painters/index.ts:133-244` |
| Painter files | 114 = 110 painter modules + `index.ts` + `common.ts` + `three3d.ts` + `icons.ts`. The `.ts.bak` files are gone. One filename differs from its kind: `sliding_window.ts` registers as `slidingwindow` | `src/studio/painters/` |
| Isolated preview | `/probe?demo=&scene=&p=&ms=&aspect=` — one scene, one frame, no TTS/recorder | `src/app/probe/page.tsx` |
| Probe done-signal | `window.__PROBE_DONE = true` | `probe/page.tsx:308` |
| Screenshot script | `scripts/probe-shot.mjs` (1 browser launch → 1 frame) | `scripts/probe-shot.mjs` |
| Playwright | `^1.49.0`, already a devDependency | `package.json` |
| Dev server | `npm run dev` → port **4321** | `package.json` |
| Available checks | `npm run typecheck` only — **no test, no lint script exists** | `package.json` |
| Typecheck | **clean — 0 errors.** It was 71 at the start of this cleanup (66 in `src/studio/demo.ts`, whose fixtures predated the required `meta` field, plus geometry 3, timeline 1, geomap 1); all were fixed on 2026-07-31. Re-measure, do not trust this cell: `npx tsc --noEmit 2>&1 \| grep -c "error TS"` | `npx tsc --noEmit` |
| ⚠️ Stale baseline | `qa/ledger.json` → `typecheckBaseline` still reads **99**. Typecheck now passes, so the rule is the stronger "**tsc must stay clean**", not "must not exceed the baseline" | `qa/ledger.json` |
| Demo coverage | all 111 kinds have a scene in `demo.ts` — `DEMO_VOCAB` closed the last gap | `demo.ts:4104` |
| Probe `DEMOS` map | 61 named keys; `KIND_INDEX` reaches all 111 regardless, so `--kind=` never needs a `scene=` id | `probe/page.tsx:17-80`, `:271` |

**Two facts that change everything:**

1. `/probe` renders **one static frame**. Smoothness, easing, pop-in and dead-time are *temporal*
   properties — they are physically not judgeable from one frame. The harness must produce a
   **filmstrip**, or the whole exercise is guesswork.
2. Typecheck **now passes**, so the rule has tightened: it used to be "the count must not increase"
   while 71 errors stood. It is now simply **"`npx tsc --noEmit` must stay clean"**. Anything you
   introduce is yours and is visible immediately.

---

# PART A — One-time harness build

> **Already built — kept as the record of what the harness is required to do, not as a task.**
> All four deliverables exist: `KIND_INDEX` + the window hooks (`probe/page.tsx:271-380`),
> `scripts/filmstrip.mjs`, and `qa/LEDGER.md` + `qa/ledger.json`. Its CONTEXT block below is the
> *pre-build* state (44 probe keys, no `vocab` demo); read the ground-truth table above for what is
> true now. Skip to Part B.

```
Build the animation-QA harness for devstudio. Do not modify any painter yet — this task is
harness only.

CONTEXT (already verified, do not re-derive):
- 110 painters are registered in src/studio/painters/index.ts (the `painters` record).
- src/app/probe/page.tsx renders ONE scene at ONE fixed progress p, deterministically, with no
  TTS and no recorder. It reads query params once in useEffect and sets window.__PROBE_DONE.
- Its DEMOS map only exposes ~44 keys, so most kinds are unreachable by name today.
- src/studio/demo.ts exports ~60 DEMO_* SceneScript consts covering 109 of the 110 kinds.
  `vocab` has no demo scene anywhere.
- playwright ^1.49.0 is already installed. Dev server is `npm run dev` on port 4321.

BUILD THESE FOUR THINGS:

1. KIND INDEX inside src/app/probe/page.tsx
   Import every DEMO_* export from src/studio/demo.ts. At module load, walk all of their
   `scenes` arrays and build `KIND_INDEX: Record<SceneKind, Scene>` mapping each kind to the
   richest scene of that kind found (prefer the one with the most beats/steps/items — a
   two-item demo hides layout bugs a six-item demo exposes). Keep the existing DEMOS map and
   query-param behaviour working for back-compat.
   Then author a DEMO_VOCAB scene in demo.ts so all 110 kinds are covered, and assert at module
   load that KIND_INDEX has all 110 — log the missing ones loudly if not.

2. IN-PAGE RENDER HOOKS on the probe page
   Expose two functions on window, both synchronous and both returning only after paint:

   window.__PROBE_RENDER({ kind, p, ms, aspect })
     Repaints the single scene for `kind` at progress p into the existing canvas at full
     ASPECTS[aspect] resolution. No page reload. Used for detail inspection.

   window.__PROBE_FILMSTRIP({ kind, aspect, cols, rows, cellW })
     THE IMPORTANT ONE. Paints a cols x rows contact sheet into one canvas:
       - n = cols*rows frames, frame i at p = i/(n-1)
       - CRITICAL: advance elapsedMs in lockstep with p (ms = p * durationMs). Ambient/idle
         motion keys off elapsedMs independently of p, so holding ms fixed produces frames that
         never occur in the real video and will send you chasing phantom bugs.
       - each cell = the full scene downscaled to cellW wide (default 360), aspect preserved
       - call drawBackground before paintScene per cell, exactly as the engine does
       - burn a small label into each cell: frame index and p to 2 decimals
       - 1px hairline gutter between cells so clipping at a cell edge is distinguishable from
         clipping at the scene edge
     One screenshot of this canvas = the entire timeline in a single image. That is the whole
     point: it turns 16 image reads into 1.

   Both must set window.__PROBE_DONE = true when finished, and must catch painter exceptions and
   draw the error text into the cell rather than throwing (a crashing painter is a finding, not a
   harness failure).

3. scripts/filmstrip.mjs
   node scripts/filmstrip.mjs --kind=<kind> [--aspect=short|long] [--cols=4] [--rows=4]
                              [--out=qa/<kind>/] [--all]
   - ONE chromium launch and ONE page for the entire run. Navigate to /probe once, then drive
     every kind and both aspects through the in-page hooks. Never relaunch per screenshot —
     naive per-frame launching is ~100x slower and will make this project take days.
   - Writes qa/<kind>/<aspect>-strip.png (contact sheet) and qa/<kind>/<aspect>-p50.png,
     -p90.png (full-res detail frames).
   - Captures console errors and pageerrors per kind into qa/<kind>/console.log.
   - --all iterates all 110 kinds from KIND_INDEX.
   - Exits non-zero if any kind threw.
   Add it to package.json scripts as "filmstrip".

4. qa/LEDGER.md + qa/ledger.json
   One row per kind: kind, status (todo|in-progress|passed|blocked), rounds spent, score /5 per
   rubric section, one-line summary of what was fixed, commit sha, date.
   Seed all 110 rows as `todo`. This file is the source of truth for progress — NOT the
   conversation, which will be summarized and lost.

VERIFY BEFORE YOU REPORT DONE:
- `npm run filmstrip -- --all` completes and writes 110 x 2 contact sheets.
- Record the current typecheck error count (`npx tsc --noEmit 2>&1 | grep -c "error TS"`) into
  qa/ledger.json as `typecheckBaseline`. If your harness changed it, you broke something.
- Open 3 contact sheets yourself (bigtext, sankey, orbit) and confirm the frames actually
  progress — if all 16 cells look identical, the p/ms wiring is wrong and you must fix it before
  reporting done.
- Commit as "qa: animation filmstrip harness".
```

---

# PART B — The per-animation loop

> This is the prompt you repeat. Give it a batch of 3-5 kinds at a time, not 60 — context fills
> up and quality collapses past ~5 painters per session.

```
Polish these animations to ship quality: <KIND_1>, <KIND_2>, <KIND_3>.

Read qa/LEDGER.md first for what is already done and ANIMATION-QA-PROMPT.md Part C for the
rubric. Work them ONE AT A TIME, fully finishing one before starting the next.

For each kind, run this loop:

ROUND 1 — OBSERVE (no code changes yet)
  a. npm run filmstrip -- --kind=<kind>            (both aspects)
  b. Read qa/<kind>/short-strip.png and long-strip.png. Read the full-res p50/p90 frames for
     typography and artifact detail.
  c. Read qa/<kind>/console.log.
  d. Open src/studio/painters/<kind>.ts and read it fully.
  e. Score every section of the Part C rubric 1-5 and write the findings as a numbered list into
     qa/<kind>/FINDINGS.md. Every finding must cite the frame that shows it and the source line
     that causes it — "frame 7 (p=0.47): the connector line overshoots the node by ~8px,
     painters/<kind>.ts:142 draws to nx+w instead of nx+w-pad". A finding you cannot pin to a
     line is a guess; mark it as such or drop it.

ROUND 2 — FIX
  f. Fix the findings, highest severity first. Constraints:
     - Use the shared helpers in painters/common.ts (enterT, easeOutCubic, clamp01, roundRect,
       rgba, activeBeatIndex, beatT, drawSceneTitle, render3D). Do NOT re-implement easing or
       rounded rects locally — search common.ts before writing any new helper.
     - All colour must come from the `palette` argument. No new hardcoded hex.
     - Named constants, not magic numbers. Match the file's existing style.
     - Do not change the scene's schema or its demo data to make a bug disappear. If the demo
       data is genuinely unrepresentative, say so explicitly and fix the demo separately.
  g. npx tsc --noEmit must be CLEAN. It passes as of 2026-07-31, so any error at all is yours.
     (qa/ledger.json still records typecheckBaseline: 99 from when the tree was red — ignore it
     in favour of a live run.)

ROUND 3 — RE-OBSERVE
  h. Re-run the filmstrip. Re-read the sheets. Re-score.
  i. If any rubric section is still below 4/5, go back to ROUND 2. Cap at 3 fix rounds — if it is
     still failing after 3, mark it `blocked` in the ledger with the specific reason and move on.
     Do not silently ship a 3/5.

CLOSE OUT
  j. Update qa/LEDGER.md: status, rounds, scores, one-line summary of what changed.
  k. Commit that ONE animation on its own: "polish(<kind>): <what changed>". One animation per
     commit, so a bad polish is revertible without unpicking others.
  l. Every 5th animation, re-run the filmstrip on 2 previously-passed kinds and confirm they
     still score >=4. Shared edits to common.ts regress everything downstream — this is the only
     thing that catches it.

REPORTING
  Report per kind: score before -> after, the 2-3 highest-impact fixes, anything you deliberately
  left. Do not claim smoothness you have not seen in a contact sheet. If you could not verify
  something, say so.
```

---

# PART C — The rubric

Score each section 1-5. **Ship gate: every section >= 4.**

### 1. Containment & safe area
- Nothing clipped at any canvas edge, in any frame, in **both** aspects.
- Content sits inside the layout safe area — do not eyeball it, read the actual insets from
  `makeLayout()` in `painters/common.ts`.
- **Shorts (9:16):** bottom ~25% is covered by the YouTube UI (captions, channel, audio strip)
  and the right ~15% by the action rail. Nothing load-bearing may land there. This is an existing
  documented project constraint — see `CLAUDE_PROMPT.md` §28.
- No element overlaps another unintentionally at any p.

### 2. Typography
- No text overflows its container or its cell.
- No awkward mid-word wrap; no orphan single word on a line.
- Font sizes derive from `layout`/canvas height, never absolute px — must hold at both aspects.
- Legible when the 1080-wide frame is viewed at phone size.
- Consistent type scale within the scene (title / label / value are visibly distinct tiers).

### 3. Motion quality — *this is the one that needs the filmstrip*
- **No pop-in.** Nothing goes 0 → full opacity/scale between two adjacent frames. Everything
  enters through `enterT()` + an easing curve.
- **Eased, not linear.** Linear motion is the single biggest "cheap" tell. `easeOutCubic` for
  entrances, ease-in-out for transitions.
- **No dead time.** Frames 0-15% must not be empty or static — the user's "talking to a blank
  screen" complaint. Something should be resolving by frame 2.
- **Settles.** By p≈0.95 the scene is composed and readable, not still mid-flight.
- **Staggered, not simultaneous.** Sibling elements enter on a small offset cascade, never all on
  the same tick.
- **Continuous.** No element that exists at frame 8, vanishes at 9, and returns at 10.

### 4. Cleanliness — *the user's "unnecessary dot" category*
- No stray dots, orphan pixels, or leftover marker artifacts.
- Connector lines terminate exactly at node borders — no overshoot, no gap, no line emerging from
  empty space.
- Consistent corner radii, stroke widths, and shadow direction across all elements in the scene.
- For the 3D/extruded painters: no z-fighting, no faces drawn in the wrong order, ground shadows
  consistent with a single light direction.
- No double-drawn edges (a visible darker seam where two strokes overlap).

### 5. Palette & consistency
- Every colour comes from the `palette` argument. Zero new hardcoded hex.
- Semantic colours are consistent with the rest of the codebase (accent = focus, `ok`/green =
  success, `warn` = caution).
- Contrast holds against `drawBackground`'s gradient at both the top and bottom of the frame.

---

## Execution order

**Wave 1 — the 60 kinds from your list** (your "44" collapses some groups; these are the real
kind ids, all 60 verified present in the painters registry):

```
Text/general (12) bigtext bullets quote stat steps vocab mythfact dialogue terminal storyboard
                  question quiz
Code (11)         code trace memgrid callstack bits browserframe threads cipher circuit
                  trafficflow eventbus
Charts (12)       chart table timeline ledger sankey gauge pictogram race radar buckets basket
                  probability
Diagrams (9)      diagram tree mindmap statemachine cycle chain lifeline geomap layers
STEM (12)         orbit schematic terrain zoomladder bodymap constellation dayclock geometry
                  numberline molecule formula curves
Compare (4)       compare bracket showdown skyline
```

**Wave 2 — the remaining 50:**

```
iso3d decision pipeline graphwalk matrix queueflow calendar globe3d dp_table_fill sysarch
slidingwindow trendgraph topology scroll tactical_map architecture_blueprint packet_delivery
codediff parliament_arc server_rack jigsaw_puzzle domino_cascade sheet_music canvas_reveal
scalecompare fluidflow ecosystem_web turing_tape grid_flood hash_ring recursion_tree
token_exchange coin_stack btree_index lsm_compaction vdom_diff flamegraph event_loop
dom_event_flow commit_dag partitioned_log container_sandbox control_loop telemetry_trace
spatial_index object_heap vector_space neural_network matrix_convolution consensus_quorum
```

Start Wave 1 with **bigtext, bullets, stat, chart, diagram** — they are the most-used kinds and
they exercise the shared `common.ts` helpers, so fixes there lift everything downstream.

## Known caveats

- The probe synthesises evenly-spaced `beats`; the real engine derives beat windows from actual
  TTS audio durations (`engine.ts:94 beatWindows`). Beat-relative timing looks slightly different
  in a real render. Good enough for QA, but do not tune beat timing to the millisecond against
  the probe.
- The probe always uses background motif 0; the engine varies the motif. Check contrast against
  more than one motif before calling a colour fix done.
- The probe renders one scene into a fresh context, so it cannot see canvas state leaking from one
  scene into the next. That class of bug — an unbalanced `ctx.save()` — is invisible here by
  construction; see `devstudio/CLAUDE.md`.
- A filmstrip that times out is usually a wedged dev server, not a stuck painter: restart
  `npm run dev` before you start debugging the painter (`PROGRESS.md` row 7.3).

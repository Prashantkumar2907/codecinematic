# Phase 19 — Execution runbook

**Audience: the model doing the work (Sonnet 5). One task card at a time, committed between each.**

`improvement_plan.md` Phase 19 is the *spec and the why*. This file is the *how*: every decision
pre-made, every check a command with an expected output, every trap named. If you are reading this,
your job is to execute task cards from §5 in order, one at a time, committing between each.

`ANIMATION-QA-PROMPT.md` Part C is **superseded by §4 of this file** for anything Phase 19 touches.
Its Part A (harness) and Part B (loop shape) are still accurate history.

---

## 0. How to use this

1. Open `PROGRESS.md`, find the **lowest-numbered `19.x` row whose deps are all `verified`**. That is
   your task. Do not pick a different one. Do not do two.
2. Read §1, §2, §3 of this file in full. They are short and they are the whole safety net.
3. Read the task card in §5. Do exactly what it says.
4. Close out per §7. Update your `PROGRESS.md` row **in the same commit** as the work.
5. Then continue to the next card — **unless** a §3 escalation trigger fired, the card is `blocked`, or
   typecheck is red. In those three cases stop and hand back to the user.

**One card at a time, always committed between cards.** `PROGRESS.md` row 9.x records five parallel
workers killed mid-edit by a session limit, leaving ~1,700 rewritten lines unverified and one file with a
duplicate `const` that took `/probe` to HTTP 500 and blocked everyone. Cards may follow one another
back-to-back; what must never happen is two cards in flight at once, or a card starting on top of
uncommitted work from the last one.

**Which model runs which card — owner decision 2026-08-08:**

| Cards | Model | Why |
|---|---|---|
| `19.a` `19.b` `19.d` `19.e` `19.f` | **Opus 5** | These set the standard. `19.b` builds the instrument every later score depends on; `19.d` and `19.e` are judgment calls that get copied 49 times; `19.f` is the template. A weak decision here propagates. |
| `19.g` (all 49 kinds) | **Sonnet 5** | Pattern-following work against a fixed template and mechanical checks. This is ~49 of ~56 sessions, so it is where the bulk of usage goes. |

If you are Sonnet and the next card is **not** `19.g`, say so and stop — the owner switches model with
`/model` and restarts you. Do not attempt `19.b`, `19.d`, `19.e` or `19.f`.

**Driving it hands-free:** the `/phase19` skill (`.claude/skills/phase19/SKILL.md`) runs this loop
start-to-finish — picks the next card, executes, verifies, commits, moves on — and only comes back to you
on a §3 trigger, a `blocked` card, or completion.

---

## 1. Read first — in this order, and nothing else

| # | File | Why |
|---|---|---|
| 1 | `CLAUDE.md` | the invariants. Non-negotiable. |
| 2 | `improvement_plan.md` → Phase 19 | the why, and the standing owner decisions |
| 3 | this file, §2-§4 | rules, escalation, rubric |
| 4 | your task card in §5 | the work |
| 5 | `qa/LEDGER.md` — **only the rows for kinds you are touching** | prior findings for that kind |

**Do not read** `demo.ts` (4,457 lines), `schema.ts` (3,611) or the full `qa/LEDGER.md` end to end. Grep
them. Reading them costs the context you need for the actual work.

---

## 2. Hard rules — violating any of these silently ruins output

**Verification**

- `npx tsc --noEmit` must print **0 errors** before you commit. It passes on `main`; any error is yours.
- **`npm run lint` and `npm test` do not exist.** There is no lint config and no test file. Never claim
  to have run them.
- `safe-check` and `render-audit` have **no npm script** — invoke with `node scripts/...`. Only `dev`,
  `build`, `start`, `typecheck`, `filmstrip`, `edge-audit`, `edge-check` exist as npm scripts.
- **A contact sheet spots candidates; only layout math or a pixel measurement settles anything.** Row 9.x
  records three of the *owner's own* visual readings from downsampled sheets being wrong — a "dead void"
  that was the mandated caption reserve, a "frozen tail" that was a real settle. If you claim a defect,
  cite the number or the source line that causes it.

**The four landmines, all previously shipped**

1. **Unbalanced canvas state.** A painter that `return`s between `ctx.save()` and its `restore()` poisons
   every *later* frame of the video. This walked ~40% of output off-screen across 89 videos undetected.
   `resetContext()` in the engine is a safety net, **not permission** — `/probe` renders into a fresh
   context and is structurally blind to this. Every `save()` needs its `restore()` on every path.
2. **`render3D` closure freeze.** `build()` runs once and its `update()` closure captures frame 0.
   Per-frame values must travel through `render3D`'s `context` argument, never closure capture. Killed
   the 3D layer of 29 painters silently.
3. **2D layout round-tripped through a tilted camera.** The single largest systemic defect class (17+
   painters). Pixel layout is authoritative; camera on-axis at `(0,0,D)`; **never** scale/rotate/bob the
   3D group afterwards — pixel chrome cannot follow it.
4. **Wedged dev server.** A filmstrip that times out is almost always a stale `.next`, not a stuck
   painter. Restart `npm run dev` **before** debugging. Cost a full investigation once already.

**Scope**

- **All colour from `env.palette`.** Zero new hardcoded hex. `THEME.good` / `.warn` / `.danger` exist.
- **All geometry from `env.layout`** (`unit = min(w,h)/24`). Absolute px breaks one aspect.
- **A painter is a pure function of `(ctx, scene, env)`** — no clock, no DOM, no `Math.random()`, no
  mutating the scene. Same inputs, same pixels.
- **Never edit a demo fixture or the schema to make a defect disappear.** If the fixture is genuinely
  unrepresentative, say so and fix it as its own commit.
- Before writing a helper, grep `painters/common.ts`. Re-implementing easing locally is the most common
  duplication in this tree.
- **Do not edit `improvement_plan.md`.** You own your `PROGRESS.md` row and nothing else in either file.

**Git**

- One kind per commit: `polish(<kind>): <what changed>`. A bad polish must be revertible alone.
- This tree holds uncommitted work. Run `git diff --stat` before any `checkout`, `restore` or `clean` —
  an unguarded checkout destroyed 174 lines of polish once.
- `git checkout <branch> -- <paths>` **stages** the files, so plain `git diff` reads empty. Use
  `git diff HEAD`. Three workers burned a run on this.

---

## 3. Stop and ask the human — do not decide these yourself

Post the question and wait. Guessing here costs more than the pause.

- Any edit to `src/studio/schema.ts`'s `Scene` union, or adding/removing a scene kind.
- Any edit to `engine.ts` timing constants, FPS, capture, or the cut behaviour.
- A kind where 2D-first (§4.0) seems wrong — i.e. you believe the 3D is load-bearing teaching content and
  it is not on the retain list.
- Any choice this runbook does not pre-decide.
- A rubric section still below 4 after **3 fix rounds** → mark the row `blocked` with the specific reason
  and stop. Do not ship a 3 and do not keep grinding.
- A shared-layer change (`common.ts`, `three3d.ts`, `icons.ts`) that is not the explicit subject of your
  task card. Shared edits regress everything downstream.

---

## 4. Rubric v2 — the bar

**Ship gate: sections 1-5 ≥ 4, sections 6-10 = 5.** Sections 1-5 are the floor — they are what took the
library to zero edge bleed and must not regress. Sections 6-10 are what Phase 19 exists for, and they
require a **5**, not a 4. A 4 on the expressive axes is what produced the current ceiling; this phase
rebuilds half as many kinds precisely so each can clear the higher bar.

**4.0 — the standing decisions. Do not relitigate; see `improvement_plan.md` Phase 19 for the evidence.**

- **(a) 2D-first.** Rebuild in pure 2D. three.js is retained *only* for `orbit`, `molecule`, `globe3d`,
  `iso3d`, `terrain`, where the third dimension is the teaching content itself.
- **(b) One canonical look per kind.** Delete `variantOf` branches, keep the best, in the same commit as
  that kind's rebuild.
- **(c) 50 kinds rebuilt, not 111.** The set and its order are §5's `19.g` card. The other 61 are **not**
  removed from the generator's menu — owner decision, see the dropped `19.c` card. They stay selectable at
  their current quality until some future phase rebuilds them.
- **(d) Design system before painters.** Card `19.e` establishes the visual language; no painter is
  rebuilt before it lands.
- **(e) Sound is out of scope.** Deferred to Phase 20 by owner decision. Do not add audio in this phase.

### Floor (unchanged)

1. **Containment** — nothing clipped, both aspects. Shorts: bottom band is YouTube UI, right ~15% is the
   action rail. Use `layout.safeBottom` / `safeH`; never re-derive a bare fraction of frame height.
2. **Typography** — no overflow, no orphan words, sizes off `layout` not px, legible at phone size.
3. **Motion floor** — no pop-in (nothing 0→full between adjacent frames), eased not linear, no dead first
   15%, staggered not simultaneous, continuous (nothing vanishes and returns).
4. **Cleanliness** — no stray dots, connectors terminate exactly at borders, consistent radii/strokes.
5. **Palette** — every colour from `palette`, contrast holds against `drawBackground` at top and bottom.

> **Deleted from v1: "Settles — by p≈0.95 the scene is composed."** It rewarded the exact defect this
> phase exists to remove. A scene that is finished at p=0.6 and holds for the remaining 40% now **fails**
> section 6. If you find that criterion quoted anywhere, it is stale.

### New (the point of Phase 19)

6. **Occupancy — no dead hold.** Motion is distributed across the beat, not front-loaded into the first
   380 ms. No window ≥ 2 s of the scene where nothing load-bearing changes. `enterT` is for panel frames;
   stage the *content* with `revealT` so a 12 s card still has something arriving at second six.
   *Measured by the 19.b motion curve, not by eye.*
7. **Rhythm against narration.** A visible change lands on **every** beat window in `env.beats`, not just
   the first. Bind emphasis to `activeBeatIndex` / `beatT`, never to `Math.floor(env.p * n)`.
8. **Departure.** Elements leave on purpose via `exitT`. Since Phase 10 replaced the crossfade with hard
   cuts, anything without an exit simply *vanishes* at the cut. At minimum the scene resolves — spent
   elements recede or dim — rather than accumulating and freezing.
9. **Staging & anticipation.** At any moment the eye knows where to look: one focal element, others
   subordinated. Entrances that carry weight use `anticipate` (wind-up) or `easeSpring`, not a linear fade.
10. **Per-aspect composition — scored separately for 9:16 and 16:9.** Not "does it clip in both" (that is
    section 1). **Is each aspect deliberately composed?** 9:16 is a tall column whose bottom ~30% is lost
    to YouTube UI and captions — it wants a vertical stack, larger type, fewer simultaneous elements.
    16:9 is a wide canvas — it wants horizontal spread and can hold more at once. One layout stretched to
    fit both scores **3, and 3 fails the gate.** Give the score as two numbers, `short/long`; the lower
    one is the section's score. This is the section most likely to send a kind to a second round; budget
    for it rather than being surprised by it.

---

## 5. Task cards

Each card is self-contained. Paste the **PROMPT** block as your instruction, then execute.

### 19.a — Re-baseline the render audit

**Why:** `qa/RENDER.md` is dated 26-28 July, pre-polish, and its two worst rows (96.4% frozen) are the
fixed `paintBigtext` save-leak videos from row 2.9. It describes a bug that no longer exists.

```
PROMPT — 19.a

Re-baseline the rendered-video audit on current main. Do not touch any painter.

1. Fix the metric's blind spot FIRST. scripts/render-audit.mjs calls a frame "frozen" at mean
   per-pixel diff < 0.05. drawBackground drifts two radial glows every frame (common.ts,
   drawBackground, keyed on tMs), so a fully frozen painter still scores non-zero motion and the
   frozen % is a floor, not the truth. Make the number describe CONTENT: subtract a
   background-only reference, or raise the threshold to the measured background-drift level.
   Whichever you choose, write the choice and the measured drift level into the script header.

2. Teeth-test it before trusting it, the way scripts/safe-check.mjs was validated: render or
   synthesise a clip with a known frozen stretch, confirm the tool reports that exact span. If it
   does not, the tool is wrong — fix it before step 3.

3. Render one long and one short on current main (npm run dev, then the Create tab, or
   node scripts/render-script.mjs). Then:
      node scripts/render-audit.mjs --all --out=qa/RENDER.md

4. Report: frozen % and median motion for both new renders, next to the old numbers. State plainly
   whether current output is better, worse or unchanged versus July. Do not editorialise past what
   the numbers support.

Commit before starting the next card. Never begin a card on top of uncommitted work.
```

**Done when:** `qa/RENDER.md` contains rows for two renders made from current `main`; the teeth-test
result is pasted into your `PROGRESS.md` row; `npx tsc --noEmit` → 0.

---

### 19.b — Rubric v2 instrument: per-painter motion curve + fps

**Why:** `render-audit` measures dead stretches only on **whole rendered videos**. There is no per-painter
motion measurement anywhere, so section 6 of the rubric is currently unscoreable. This card builds the
one instrument the whole phase depends on. **This is the highest-risk card — spec adherence matters more
than cleverness here.**

```
PROMPT — 19.b

Build the per-painter motion instrument. Do not touch any painter.

DELIVERABLE 1 — scripts/motion-check.mjs
   node scripts/motion-check.mjs --kind=<kind> [--aspect=short|long]   one kind, writes nothing
   node scripts/motion-check.mjs                                       all kinds -> qa/MOTION.md

   Follow the existing shape of scripts/safe-check.mjs exactly: ONE chromium launch, ONE page,
   navigate to /probe once, drive every kind through an in-page hook. Never relaunch per frame.

   Sample each kind's timeline at >= 30 points, advancing elapsedMs in lockstep with p
   (ms = p * durationMs). Ambient motion keys off elapsedMs independently of p — holding ms fixed
   produces frames that never occur in the real video. Diff consecutive frames at the same
   64x36 greyscale scale render-audit uses, so the two tools' numbers are comparable.

   Report per kind/aspect:
     - motion curve (the per-sample diffs)
     - LONGEST DEAD WINDOW in seconds and the p range where it sits   <- this is the section-6 score
     - front-loading ratio: motion in the first 15% of the scene vs the remaining 85%
   Write qa/MOTION.md worst-first, same format discipline as qa/AUDIT.md. Mark it
   "Generated by ... Do not hand-edit." at the top.

DELIVERABLE 2 — delivered fps
   Rendering is real-time capture at 30fps (engine.ts:66,640) and NOTHING measures whether frames
   are actually delivered. Row 10.x audited bitrate and resolution and found "no defect", which is
   not the same as having measured frame delivery. Add a per-scene paint-time measurement and
   report worst-case ms/frame per kind. Anything over 33ms is a budget failure — flag it, do not
   fix it here.

DELIVERABLE 3 — teeth-test, and say so in your report
   Inject a known 3s freeze into one painter locally, confirm motion-check reports that exact
   window, then REVERT the injection. A number you have not teeth-tested is a guess.

Add motion-check to package.json scripts as "motion-check". Do NOT add lint or test scripts.

Commit before starting the next card. Never begin a card on top of uncommitted work.
```

**Done when:** `qa/MOTION.md` exists with all 111 kinds ranked; the teeth-test span is pasted into your
row; `npm run motion-check -- --kind=bigtext` runs clean; `npx tsc --noEmit` → 0.

---

### 19.c — Shrink the menu to the 50 — **DROPPED**

**Owner decision 2026-08-08: not doing this. All 111 kinds stay available to the generator.**

Kept as a record, not a task. Skip straight to `19.d`. The accepted consequence: until the 50 are
rebuilt, a generated video can mix rebuilt and unrebuilt kinds, so average output improves more slowly
than the rebuilt kinds themselves do. Do not reopen this without the owner.

If it is ever revisited, the cheap version is a *soft preference* rather than a removal —
`buildSceneShape()` already emits a "FEATURED FOR THIS SUBJECT — lean on these" list separate from the
full menu (`prompt.ts:203`), so the rebuilt set can be preferred while every kind stays reachable.

---

### 19.d — The scene timeline in `common.ts`

**Why:** the library implements one motion idea — arrive in 380 ms, then hold. `exitT` and `anticipate`
were built in Phase 9.0 and adopted by **0 of 111** painters.

```
PROMPT — 19.d

Extend painters/common.ts with a four-phase scene timeline. PURE ADDITIONS ONLY — no existing
painter may change behaviour from this card. Verify that claim: after your change,
`npm run filmstrip -- --kind=bigtext` and `--kind=diagram` must be visually identical to before.

Add a phase model — enter -> develop -> emphasise -> exit — as helpers painters opt into:
  - develop:   occupies the MIDDLE of the beat. revealT (common.ts) already does the maths and is
               adopted by 4/111; build on it, do not reinvent it.
  - emphasise: binds to real beat windows via env.beats / activeBeatIndex / beatT, so a change
               lands on EVERY beat, not just the first.
  - exit:      make exitT real and usable. Since Phase 10 replaced the crossfade with hard cuts,
               anything without an exit vanishes at the cut.
  - anticipate / easeSpring already exist. Make them reachable from the phase model.

Camera language, if you add any: per improvement_plan.md Phase 9 §6a-bis, a camera move must shift
the camera AND re-derive the pixel mapping in the SAME call, or 2D chrome detaches from content.
bigtext.ts's local Ken Burns push-in is the model to generalise. If this cannot be done cleanly in
this card, leave it out and say so — do not ship a half-camera.

Do NOT port any painter in this card. 19.f is the first consumer.

Commit before starting the next card.
```

**Done when:** helpers exist and are exported; two reference filmstrips are unchanged; `npx tsc --noEmit`
→ 0. **Adoption count is still 0 and that is correct for this card.**

---

### 19.e — The design system

**Why:** this is the 7/10 ceiling. The painters draw procedural rounded rects, lines, circles and emoji
icons. Motion mechanics applied to undesigned shapes stays competent and never becomes *authored* — no
easing curve makes a rounded rect read as designed artwork. Phase 9.0 gave the library a *motion*
vocabulary; it has never had a *visual* one beyond palette and type scale.

```
PROMPT — 19.e

Establish the visual language in painters/common.ts, as pure additions. No painter changes here.

Decide and implement, as named primitives every painter will use:
  - DEPTH: one shadow language — a single light direction, elevation tiers, and what each tier
    means. Today there are 375 shadowBlur sites, 22 distinct values, 147 "= 0" resets and no
    convention. Note the known conflict: isoBox lights from upper-LEFT (common.ts) while
    studioLights puts the key upper-RIGHT (three3d.ts). Pick one and write it down.
  - SURFACE: the card/panel/chip/badge primitives that do not exist. There are 327 roundRect calls
    across 101 painters, always the same path->fill->path->stroke, and `grep "export function draw"`
    over painters/ returns exactly FOUR hits. RADIUS/STROKE scales already exist from 9.0 - build on
    them, do not add a parallel set.
  - TEXTURE / MATERIAL: what makes a surface look made rather than filled. Keep it cheap - this is
    real-time canvas at 30fps and 19.b measures the frame budget.
  - ICON treatment: emoji are currently dropped in raw at varying sizes. Give them a container,
    a size tier and a consistent optical alignment.
  - PER-ASPECT COMPOSITION (rubric s10): the layout rules for 9:16 vs 16:9 - stack vs spread,
    type-size tiers, how many elements may be on screen at once in each. Write these as helpers or
    named constants painters read, NOT as prose only. This section is scored per aspect and is the
    most common cause of a second round; make it mechanical.

CONSTRAINTS
  - All colour from palette. Extend the palette type if you must, but no hardcoded hex.
  - Cheap enough to hold 30fps. If a treatment is expensive, say so and offer the cheap variant.
  - Pure additions: after this card, `npm run filmstrip -- --kind=bigtext` and `--kind=diagram`
    must be visually IDENTICAL to before. Verify and state it.

DELIVERABLE: the primitives, plus a short "visual language" section at the top of common.ts stating
the light direction, the elevation tiers and the two per-aspect composition rules. 19.f is the first
consumer and the 50 rebuilds copy it.

If you cannot settle a design choice from the code alone, STOP and ask the owner (§3). Taste calls
are theirs, not yours.

Commit before starting the next card.
```

**Done when:** primitives exist and are exported; both reference filmstrips are byte-identical; the
visual-language note is written; typecheck 0.

---

### 19.f — Gold reference painter (`bigtext`)

**Why:** without a reference the library accumulated 25 corner radii and 20 entrance durations. `bigtext`
opens nearly every video, so it earns the first rebuild.

```
PROMPT — 19.f

Rebuild src/studio/painters/bigtext.ts to rubric v2 (PHASE19-RUNBOOK.md §4), using ONLY the 19.d
motion primitives and the 19.e design system. This becomes the template every other painter is
ported against, so favour the obvious, copyable solution over the clever one.

  - Pure 2D. Remove the three.js layer (decision 4.0a — bigtext is not on the retain list).
  - Collapse variantOf to ONE canonical look (decision 4.0b). bigtext has the most variants in the
    library; pick the strongest, delete the rest, and say in the commit message which you kept
    and why.
  - Must clear the FULL gate: sections 1-5 >= 4, sections 6-10 = 5. Section 10 (per-aspect
    composition) is scored twice, short/long, and the lower number is the score.

Verify, and paste each result into your PROGRESS.md row:
  npm run motion-check -- --kind=bigtext        longest dead window, both aspects
  npm run filmstrip -- --kind=bigtext --entrance
  npm run edge-check -- --kind=bigtext
  node scripts/safe-check.mjs --kind=bigtext
  npx tsc --noEmit

Then write the pattern down: a short "reference implementation" section at the top of
bigtext.ts saying which primitive does which job. The next 14 kinds copy this file.

Commit before starting the next card.
```

**Done when:** all four checks pass, the full gate is met (1-5 ≥ 4, 6-10 = 5), `qa/LEDGER.md` row updated in the same commit.

---

### 19.g — The 50 kinds

**One kind per session.** Use the loop in §6. `bigtext` is already done as 19.f, so 49 remain.

**How this set was derived** (2026-08-08, reproducible from `prompt.ts`): the 15 `CORE_KINDS`, plus all
21 kinds with reach ≥ 4 subject kits, plus 12 high-traffic coding kinds (the corpus is 84/91 coding),
plus `vocab` and `terrain` so English and Geography keep a signature. Verified: all 50 registered in
`painters/index.ts`, no duplicates, **every one of the 19 subjects retains ≥ 4 signature kinds**.

**Order — do not reorder.** Traffic-measured first, then structural reach.

**Group 1 — CORE (14 remaining).** Offered to all 19 subjects, so these fill the body of every video:

`compare` (50 scenes) → `diagram` (49) → `chart` (33) → `table` (18) → `bullets` → `stat` →
`question` → `quiz` → `mythfact` → `steps` → `timeline` → `tree` → `mindmap` → `quote`

**Group 2 — high-traffic coding (12).** The corpus is 84/91 coding; `lifeline` alone is 26 scenes:

`lifeline` → `code` → `terminal` → `trace` → `memgrid` → `callstack` → `pipeline` → `statemachine` →
`decision` → `bits` → `browserframe` → `matrix`

**Group 3 — signature kinds by kit reach (23).** Number in brackets is how many of the 19 subject kits
list it:

`cycle` [12] → `radar` [12] → `gauge` [12] → `chain` [11] → `dialogue` [10] → `bracket` [9] →
`storyboard` [8] → `showdown` [8] → `zoomladder` [7] → `race` [7] → `constellation` [7] →
`calendar` [7] → `curves` [7] → `dayclock` [6] → `pictogram` [6] → `formula` [5] → `skyline` [5] →
`ledger` [5] → `sankey` [5] → `layers` [4] → `buckets` [4] → `vocab` → `terrain`

**Checkpoint after Group 1.** Render one long and one short, run `node scripts/render-audit.mjs --all`
and `npm run motion-check`, and report the numbers before starting Group 2. Fourteen CORE kinds at the
new bar should already be visible in a finished video — if it is not, the gate is wrong and grinding
through 35 more kinds will not fix it. **Stop and tell the owner if that checkpoint disappoints.**

**Menu.** Nothing to change — all 111 kinds remain selectable (card `19.c` was dropped by owner
decision). A rebuilt kind simply becomes better the moment it is committed; no wiring step is needed.

---

## 6. The per-painter loop (19.g) — repeat this per kind

```
PROMPT — polish <KIND> to rubric v2

Read PHASE19-RUNBOOK.md §2 (hard rules), §3 (escalation), §4 (rubric v2), and this kind's row in
qa/LEDGER.md. Read src/studio/painters/<KIND>.ts fully. Work ONE kind only.

ROUND 1 — OBSERVE, no code changes
  npm run motion-check -- --kind=<KIND>
  npm run filmstrip -- --kind=<KIND>              both aspects
  npm run filmstrip -- --kind=<KIND> --entrance   motion sections need this; a p=0..1 strip has
                                                  up to 2.7s between cells and steps straight over
                                                  a 380ms entrance
  npm run edge-check -- --kind=<KIND>
  node scripts/safe-check.mjs --kind=<KIND>
  cat qa/<KIND>/console.log

  Score all TEN sections 1-5 into qa/<KIND>/FINDINGS.md. Every finding cites the frame that shows
  it AND the source line that causes it — "frame 7 (p=0.47): connector overshoots the node by ~8px,
  <KIND>.ts:142 draws to nx+w instead of nx+w-pad". A finding you cannot pin to a line is a guess:
  mark it as such or drop it.

  NOTE: edge-check only measures the kind's DEFAULT scene. Clipping in any other variant is
  invisible to it — that is how chart's pie labels ran off both edges unnoticed. If the kind has
  multiple demo scenes, check them with --scene=<id>.

ROUND 2 — FIX, highest severity first
  - Pure 2D unless the kind is on the §4.0a retain list.
  - Collapse variantOf to one canonical look, in THIS commit.
  - 19.d motion primitives + 19.e design system only. Grep common.ts before writing any helper.
  - All colour from palette. All geometry from layout. Named constants, not magic numbers.
  - Match the file's existing style.
  - npx tsc --noEmit must be CLEAN.

ROUND 3 — RE-OBSERVE
  Re-run every command from round 1. Re-score. If any section misses the gate (1-5 >= 4, 6-10 = 5), return to round 2.
  Cap at 3 rounds — then mark the row `blocked` with the specific reason and STOP (§3).

CLOSE OUT
  - Update qa/LEDGER.md: status, rounds, all 10 scores, one-line summary of what changed.
  - Commit ONLY this kind: "polish(<KIND>): <what changed>".
  - Every 5th kind, re-run motion-check + filmstrip on 2 previously-passed kinds and confirm they
    still score >= 4. Shared edits regress everything downstream; this is the only thing that
    catches it.

REPORT
  Per kind: score before -> after per section, the 2-3 highest-impact fixes, anything deliberately
  left. Do not claim smoothness you have not seen in a contact sheet or a motion number. If you
  could not verify something, say so.
```

---

## 7. Close-out template — paste into your `PROGRESS.md` row

A row without pasted command output is not `verified`. Adjectives are not evidence.

```
<what changed, one or two sentences>

  motion-check <kind>  longest dead window: <before>s -> <after>s (short), <before>s -> <after>s (long)
                       front-loading ratio: <before> -> <after>
  edge-check   <kind>  <before>% -> <after>%  (both aspects)
  safe-check   <kind>  <before>px over -> <after>px
  tsc --noEmit         0 errors
  scores               cont/typo/motion/clean/palette/occupancy/rhythm/departure/staging
                       <before 9 numbers> -> <after 9 numbers>

Deliberately left: <or "nothing">
Could not verify: <or "nothing">
```

**Known blind spots — state these rather than papering over them.** `/probe` synthesises evenly-spaced
beat windows while the engine derives them from real audio, so do not tune beat timing to the millisecond
against it. `/probe` always uses background motif 0 while the engine varies it, so check colour against
more than one motif. `/probe` renders into a fresh context and cannot see canvas state leaking between
scenes — landmine 1 is invisible here by construction.

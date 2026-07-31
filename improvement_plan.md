# devstudio improvement plan

**Status:** the spec. Work items live in `PROGRESS.md` next to this file — read that first to see where
the programme currently stands. `CLAUDE_PROMPT.md` is rewritten in Phase 11 to point here as the master
spec; until then it remains the older 30-issue document and is partly stale (see Phase 11).

---

## Context

`devstudio` generates educational YouTube videos: Gemini writes a JSON script → zod validates → a
Canvas engine with 110 scene painters renders it → edge-tts narrates it. The owner's verdict on output:

> "it generates title and subtitle using bigtext but the intro is so long so it looks like powerpoint
> presentation, explaining in so many jargan talk, no way viewers able to relate to the video it feels
> like reading the book"

A previous pass (`CLAUDE_PROMPT.md`, 30 issues) tried to fix this almost entirely by adding prompt
rules. It didn't work, and the corpus shows why: **the prompt already forbids most of these failures and
the model violates them anyway.** The goal is output at the level of channels that teach subject
sub-modules and earn millions of views — across content, narration, animation and the finished video.

**Evidence base.** Every claim below is either measured directly against the 89-script corpus or carries
a `file:line` citation from one of six completed audits (rule-enforcement map, scene-kind inventory,
taxonomy/docs, animation infrastructure, whole-video visual layer, repo hygiene). Two corrections to my
own earlier reporting are recorded inline and flagged as such — an adversarial verifier refuted my first
theory of the beat-length problem, and the animation audit found that "only 36 of 110 kinds are used" has
a one-character cause rather than the behavioural one I assumed. An 8-investigator research workflow
mostly failed on API overload and a session limit; its two surviving verifiers produced the first
correction.

**What is still unresearched, and why.** A second research pass covering short-form craft, long-form craft
per niche, TTS expressiveness, a new-animation catalogue, cross-layer edge cases and pipeline
orchestration **failed entirely** — all seven agents hit a session limit and returned nothing. Phases 12-14
below are therefore written from code I read directly plus craft knowledge, and every claim that needs
external verification is marked **spike** or **research still outstanding** rather than asserted. Phase 13
in particular *begins* with the research that failed. Nothing in this plan pretends to be verified when it
is not.

**Reading order.** Phases are numbered in execution order but do not appear in numeric sequence in this
file — follow the numbers, and see **Sequencing** at the end for the authoritative order.

---

## 0. How to use this document (read first if you are implementing it)

This is a standalone implementation spec. You should not need the conversation that produced it.

1. Copy this file to `devstudio/improvement_plan.md` and commit it.
2. Create `devstudio/PROGRESS.md` from the schema in §7. **Do this before writing any code** — it is how
   the next session knows where you stopped.
3. Work items are the phases in §4, executed in the order given by the **Sequencing** table at the end.
4. **Phase 0 is mandatory and blocking.** 102 source files are untracked; a `git clean` or `git checkout`
   before it lands destroys 93 painters. This has already happened once in this repo.
5. Every claim here carries a `file:line`. If the code disagrees with this document, **trust the code and
   amend this document in the same commit** — a plan that has silently drifted is worse than no plan.
6. Anything marked **SPIKE** is unverified. Run the spike and write the answer into this file before
   building on it.
7. Do not batch phases. One phase, one commit, one `PROGRESS.md` row moved to `verified` with pasted
   evidence. The measurable check for each workstream is in §7b.

---

## 0b. The three architecture decisions (these answer the "what is the solution?" questions)

### Content: NOT 373 prompts. A four-layer content spec plus cached per-submodule research.

Hand-writing a prompt per submodule is unmaintainable and would drift within weeks. The scalable
equivalent, which uses structure the app already has:

| Layer | What it holds | Where it lives | Count |
|---|---|---|---|
| 1. Episode archetype | the act structure, hook type, signposting, payoff placement | `CHANNEL_ARCS` in `prompt.ts` | **~10** clusters, not 19 |
| 2. Subject voice | audience, register, accuracy bar | `subjects.json` `audience`/`style` | 19 (exists) |
| 3. Module + submodule lane brief | what this slice covers and what it must not drift into | `subjects.json` module/submodule `style` | 93 / 373 (exists for 8 subjects, **missing for 11**) |
| 4. Gold exemplar pair | one hand-authored short + one long, shown as few-shot | `exemplarScript` — **already plumbed, never populated** | 2 per archetype = **~20 scripts** |

**Plus the piece that actually answers "see the YouTube creators for all sub-modules":** a
**research-once, cache-forever** step. For each submodule, run one research pass that answers *"how do the
highest-viewed videos on this exact topic structure themselves?"* and store the answer as a
`creatorBrief` string alongside the existing `style`. 373 one-time calls, cached in `subjects.json` (or a
sidecar), injected into the blueprint stage. It is never re-run unless the topic changes. This is the only
version of the request that scales, and it is a batch job, not a per-video cost.

**Why archetypes over per-subject:** a coding how-it-works episode and a science mechanism episode have
the *same* structure (pain → what it is → mechanism → practitioner payoff → challenge). Nine of the 19
subjects collapse into shared shapes. Writing 19 arcs where 10 exist creates drift with no gain.

**Why gold exemplars are non-negotiable:** this plan documents at length that prompt rules do not stick —
101 "let's" against an explicit ban. Rules cannot express *voice*. Examples can. The plumbing exists at
`generate/route.ts:22 → prompt.ts:672-679` and **nothing has ever written to it.**

### Animation: fix the SYSTEM, not the 110 outputs.

The premium feel the owner is describing — After Effects presets, Rive, Lottie — comes from three things
this codebase has none of: **a motion vocabulary** (springs with damping, anticipation, follow-through,
staggers, text animators), **a design system** (one type/spacing/radius/stroke/timing scale), and
**declarative motion** (a painter *declares* "these elements, this stagger, this entrance" rather than
hand-rolling `Math.sin`). Today the shared layer is 3.6% of painter code and contains **three easing
curves**; 50 painters hand-roll their own bob and 48 hand-roll the same ghost entrance.

So the deliverable is not "polish 110 painters" — it is **a motion system that makes a polished painter
the default and an unpolished one hard to write**, then adopt it top-traffic-first. A painter authored
after the toolkit should need no polish pass.

### Narration: role-aware delivery, not one flat voice.

The fix is not a better voice — it is that **every beat is currently spoken identically**. A hook, a
mechanism step, a payoff and a question should differ in rate, pitch and pause. edge-tts exposes
`--rate`, and almost certainly `--pitch`/`--volume`, per call — and the app makes one call per beat
already, so per-beat delivery variation is **free and already architecturally possible.** That plus a real
pronunciation lexicon and enforced pausing is the bulk of the perceived gain, before any paid vendor.

---

## 1. Diagnosis (measured across all 89 generated scripts: 1,857 beats, 39,704 words ≈ 255 min audio)

| Measured fact | Value | Re-measured by `pacing-audit` | Owner symptom |
|---|---|---|---|
| Audio over single-beat static cards | **88 of 255 min = 34%** | **27.8%** (69.4 of 249.9 min) | powerpoint |
| Long videos: static-card scenes | **7 of 17 = 41%**, 25% of runtime | **40.2%** (170 of 423 scenes), 25.9% | powerpoint |
| `bigtext` seconds per card (long) | **15.7 s avg**, worst **26.9 s** | **15.4 s median**, worst 26.5 s | powerpoint |
| `bigtext` share of all scenes | **18.8%** — the #1 kind of 110 | **18.8%** (154 scenes) ✓ exact | powerpoint |
| Videos opening on a static card | **42 of 89** | **64 of 88** — worse than reported | powerpoint |
| First spoken beat is a definition | **27 of 89 = 30%** | **3 of 88** — see the correction below | reading a book |
| Beats shaped "X is a …" | **19% of all beats** | **4.3%** (78 of 1,814) | reading a book |
| Beats over 12 s | *not measured* | **354 of 1,814** | powerpoint |
| Seconds per visual change | *not measured directly* | **8.3 s mean** (target 4-8) | powerpoint |
| Scene kinds ever used | **36 of 110** — but 35 are *unreachable*, see root cause 4 | **36** ✓ exact | powerpoint |
| `"let's"` / `"here is"` (both banned in prompt) | 101 / 61 uses, in 39 / 45 scripts | 89 / 53, in 37 / 42 | reading a book |
| Running example threading all scenes (mandated 4×) | **median 0.29 coverage, 0 of 86 complete** | median **0.50** by a different proxy | unrelatable |
| Factory slots below bar after median 5 attempts | **72 of 86** | **72 of 86** ✓ exact | all of it |

Method: parse every `content/factory/**/*.json` + `content/videos/*/script.json`, replicate
`sceneBeats()`, estimate seconds at 2.6 spoken words/sec (≈156 wpm, matching edge-tts neural default).
The right-hand column is `node scripts/pacing-audit.mjs` (Phase 3), which calls the **real**
`sceneBeats()` rather than replicating it, and excludes the 5 demo-fixture renders. It scores 88
scripts where the original pass claimed 89 — the exact-match rows (bigtext share, kinds used, factory
status, worst beat) confirm it is the same corpus.

> ### ⚠️ Correction: "30% of videos open with a definition" is an artifact of the regex, not a finding.
>
> This was §1's headline evidence for "reading a book" and the entire basis of the Phase 4.3 gate.
> The pattern §4 specifies — `^(a|an|the)?\s*X (is|are|refers to|means)` — reproduces the number
> (**25 of 88**), and it is measuring the wrong thing: it matches *any* `X is Y` sentence. Of its 25
> matches, **21 open `Your…` / `You…` / `This…`**:
>
> - *"Your div-button is a trap. A keyboard user just hit Tab, and your entire UI just broke."*
> - *"Your Python server is sitting idle at 5% CPU, yet it's completely dropping requests."*
> - *"Your computer is lying to you. Every line of your code assumes a perfect, binary world…"*
>
> Those are concrete, second-person, high-tension cold-opens — **exactly what §2 and Phase 5 ask for.**
> A stricter pattern that also requires a category article (`is a` / `refers to a`) finds **3 of 88**,
> and reading those three, even they are metaphor hooks (*"The Atlantic Ocean is a wound, and if you
> could pull the continents back together, you'd heal it."*) rather than definitions.
>
> **Consequences.** (a) The corpus does not have a definition-opener problem — the hooks are broadly
> good. (b) **Phase 4.3 must not ship the loose pattern**: a gate on it would push the model away from
> its best current writing. It is kept in `pacing.ts` as `isDefinitionOpenerLoose` only so this number
> stays reproducible, with the strict version as the reported metric. (c) The "reading a book" feeling
> has to come from somewhere else. On the evidence now available, the strongest candidates are the
> **354 beats over 12 s**, the **8.3 s mean hold** against a 4-6 s target, the **167 crutch hits**, and
> — very likely dominant — the **`bigtext` save-leak** in Phase 2 item 9, which made roughly 40% of all
> output literally unwatchable. Do not treat pacing gates as the fix for voice until that is re-judged
> on output rendered *after* the leak fix.

### Root cause 1 — the prompt *specifies* the PowerPoint

`src/lib/prompt.ts:695-708` mandates, for a 16-22 scene long video: a hook, **"4-6 sections, each a
`bigtext` section card FOLLOWED BY 2-4 teaching scenes"**, and a closing `bigtext` recap. That is
**5-8 mandated static cards.** Corpus median is exactly **5**. The model is complying precisely. This is
the specified architecture, not model misbehaviour — which is why no amount of extra prompt rules fixed it.

### Root cause 2 — `narration` is the one field with no size guidance

`sceneBeats()` returns **exactly one beat** for the 5 single-beat kinds — `bigtext`, `stat`, `quote`,
`question`, `terminal` (`src/studio/schema.ts:2922-2925, 2957-2958, 2977-2978`). Scene duration is the
sum of its beats' real audio (`src/studio/engine.ts:66-87`), so one narration *is* the freeze.

Every **visible** field on those kinds has a char cap in its menu line (`prompt.ts:22`:
`"text":"<=80 chars","sub":"<=110 optional"`) — but `"narration":"..."` is given **no number**. The only
number ever attached to narration is the 400-char hard limit, transcribed **three** times
(`prompt.ts:817, 879, 1164`). Observed corpus max: **397 chars.** The model anchored on the only number
it was handed.

> **Correction to my own earlier diagnosis** (an adversarial verifier caught this and it changed the
> fix). I had claimed the "3-5 full sentences" line at `prompt.ts:712` contradicts the 5-12 s beat rule
> and causes the bloat. It does not:
> - It is scoped to *teaching scenes*, a category `prompt.ts:697-700` explicitly excludes `bigtext` from.
> - The SHORT branch (`prompt.ts:684-693`) has no such clause, yet short `bigtext` still runs median 24
>   / max 58 words. The pathology survives where the clause is absent.
> - The animated kinds are already fine — median beat words: chart 13, trace 14, steps 17, code 17.5,
>   diagram 19, all inside 5-12 s. Long-form median beat is 26.9 words ≈ 10.3 s, *inside* the cap.
>
> **This is a tail problem in 5 kinds, not a systemic beat-length problem** — so a global beat cap, which
> is where I was heading, would have been the wrong fix. The verifier also simulated my proposed caps on
> the real corpus: median total would fall 978 → 842 words, putting **14 of 25** long scripts under the
> 850 floor, so the new gate and the existing word-floor gate would fight inside `REPAIR_ROUNDS = 3` and
> exhaust. Phase 1 below is designed around both findings. There is a genuine third copy of the per-beat
> wording to fix at `scripts/content-factory.mjs:231`.

### Root cause 3 — the judge cannot see it

`src/lib/rate.ts:5-12` grades six sections — `hook_intro`, `structure_flow`, `depth_accuracy`,
`engagement_voice`, `visual_variety`, `ending_cta` — and **none measures pacing, beat length or
seconds-per-visual-change.** It grades text it cannot hear timed. Its own comments say "feels like a
slide deck" while the loop never fixes it.

`qa/LEDGER.md` has the mirror blind spot: "motion quality" is scored on the **first 500 ms**, and "all
settle well before p = 0.95" is recorded as a *passing* score. Early-settle-and-hold is graded as good.

### Root cause 4 — 35 of the 110 scene kinds are invisible to the model (a regex bug)

**This corrects my own earlier reporting.** I told you "only 36 of 110 kinds have ever been used" and
attributed it to menu size and model laziness. The real cause is one character.

`prompt.ts:138-144` builds the menu the model actually sees by extracting kind names with
`/"kind":"([a-z]+)"/`. **`[a-z]+` cannot match `_` or a digit**, so every kind whose name contains an
underscore or a digit yields `""` and is dropped by the following `.filter(([k]) => k)`.
`ALL_KINDS_MENU` describes all 110 kinds; `KIND_LINE` keeps **75**. These **35 have never been offered
to the model and therefore appear in zero videos**:

`iso3d, globe3d, dp_table_fill, tactical_map, architecture_blueprint, packet_delivery, parliament_arc,
server_rack, jigsaw_puzzle, domino_cascade, sheet_music, canvas_reveal, ecosystem_web, turing_tape,
grid_flood, hash_ring, recursion_tree, token_exchange, coin_stack, btree_index, lsm_compaction,
vdom_diff, event_loop, dom_event_flow, commit_dag, partitioned_log, container_sandbox, control_loop,
telemetry_trace, spatial_index, object_heap, vector_space, neural_network, matrix_convolution,
consensus_quorum`

Worse: `iso3d` **is** listed in `SUBJECT_KIT.coding` (`prompt.ts:167`) and named as a hero kind in the
menu header (`prompt.ts:10`), so the model is told to lean on it while never being shown its fields.
Same for `globe3d`. `buildSceneShape` (`:193-201`) is the sole menu path, used by all three script
prompts (`:759, :873, :1159`), so the loss is total.

**Fix: `/"kind":"([a-z0-9_]+)"/`.** One character class. It unlocks 32% of the animation library —
including every kind `NEW_ANIMATIONS.md` was written to justify.

### Root cause 5 — a live bug is failing generations outright

`src/app/api/studio/generate/route.ts:21` caps `directives` at `.max(12)`, but
`scripts/content-factory.mjs:339` posts the whole persisted list, and **16 of 27 keys in
`content/factory/directives.json` already hold 14-15 entries** → HTTP 400 → every remaining attempt for
those slots fails identically. This is contributing directly to the 72 below-bar count.

### Supporting evidence

- **Visual proof of the dead frame**: `qa/bigtext/long-strip.png` frames 02→15 (p=0.13→1.00) are
  identical but for sub-pixel drift. Entrance completes at 970-2375 ms depending on variant
  (`painters/bigtext.ts:515, 582, 743, 789, 817`); after that only ambient drift (`:465, :690-711`).
  **~88% of a bigtext scene carries zero new information.**
- **Live reproduction** (generated with current code): `How JavaScript Closures Actually Work`, 20
  scenes, 942 words → **6 bigtext cards**, opened on the definition *"A JavaScript closure is a function
  that preserves its birthplace…"*, jargon (*"ten megabyte shared context allocation"*, *"V8 does not
  create a tiny isolated…"*), four `Let's…` and four `Here is…` beat openers.
- **The factory is not a refine loop** — it regenerates fresh each attempt and never calls
  `/api/studio/refine`; only the `directives` string array carries forward
  (`content-factory.mjs:306-311, 316, 364`). So "5 attempts" is 5 cold rolls, not 5 improvements.
- **Second desync class**: 7 multi-beat painters ignore `env.beats` entirely and advance on
  `Math.floor(env.p * n)` — `eventbus.ts:47`, `geomap.ts:88`, `geometry.ts:73`, `layers.ts:59`,
  `molecule.ts:79`, `numberline.ts:72`, `trafficflow.ts:47`. Visuals drift off the voice.
- **Degenerate-card hazard**: 18 multi-beat kinds allow `.min(1)` on their beat array, so a 1-element
  scene is a disguised static card (`schema.ts:115` diagram, `:1978` chain, `:578` gauge, …).
- **27 painters have never been seen animating** — see Phase 9c. Largest unknown in the render layer.
- `painters/steps.ts` is the reference implementation: zero `enterT`, zero ambient drift, 100% beat-driven.

---

## 2. Benchmark specification (what "top channel" means as numbers)

| Dimension | Target | Corpus now | Enforced by |
|---|---|---|---|
| Seconds per visual change | **4-6 s** (Fireship: 10-15 cuts/min) | static-card mean 10.4 s, worst 26.9 s | zod cap + pacing gate |
| Narration rate | 120-150 wpm educational | ~156 wpm — **already fine, do not change** | — |
| New visual in long-form | ≥ every ~40 s; re-engagement at 1/3, 2/3 | 26.9 s dead frames | structure block |
| Section signposting | one-sentence **"what's next"** + chapter marks, *not* a title card | 5 static cards | structure block |
| Definitions | **"definitions are an ending point, not a starting point"** (3Blue1Brown) | 30% open with one | new soft gate |
| Structure | hook → payoff → plant next hook → payoff; open loops ≈ +32% watch time | one hook, then lecture | blueprint + rubric |
| Short hook | lands inside **2 s**, ~8-12 spoken words, text on screen by 1-2 s | first scene far longer | zod cap |
| Kinetic text (shorts) | scale-from-zero, OutBack overshoot, centre-outward stagger | letter cascade exists but unsystematised | common.ts helper |
| Motion craft | anticipation, staging, follow-through, easing, parallax depth | **no helper for any of these** | common.ts |

Sources: [Fireship](https://read.engineerscodex.com/p/how-fireship-became-youtubes-favorite) ·
[3Blue1Brown](https://www.3blue1brown.com/about/) ·
[retention architecture](https://www.overseeros.com/blog/youtube-retention-architecture-2026) ·
[Shorts hooks](https://blitzcutai.com/blog/best-youtube-shorts-hooks-2026) ·
[narration rate](https://weesperneonflow.ai/en/blog/2026-05-30-average-speaking-rate-words-per-minute-data-2026/) ·
[RealLifeLore](https://www.ad-hoc-news.de/boerse/news/ueberblick/reallifelore-s-mind-blowing-geography-explainers-captivate-us-youtube-fans/69277812) ·
[Kings and Generals](https://grokipedia.com/page/kings-and-generals) ·
[12 principles](https://www.cgspectrum.com/blog/12-principles-of-animation) ·
[motion design](https://trydemotion.com/blog/motion-design-principles-animation) ·
[Kurzgesagt parallax](https://twitter.com/Kurz_Gesagt/status/1833083193794220283) ·
[kinetic typography](https://www.ikagency.com/graphic-design-typography/kinetic-typography/)

**Key precision: the fix is not faster narration.** 156 wpm sits inside the educational band. The gap is
**visual change rate**.

---

## 3. Decisions taken

1. **Remove the mandated section cards.** Sections signpost via their first teaching scene's title plus
   a forward-hook line closing the previous section. `bigtext` survives as hook + recap only, capped
   short. *(Alternative: keep 5 cards but cap them — rejected, it leaves 5 dead frames and the slide-deck
   rhythm.)*
2. **All 19 subjects get a researched playbook**, deep for the 8 on the enhanced pipeline, compact for
   the 11 that today have only a scene-kind casting sheet.
3. **Validate by generate + measure + watch**, free-tier keys only.
4. **Animation: central motion infrastructure + hand-upgrade the ~25 highest-traffic kinds.** Only 36 of
   110 kinds have ever been chosen; the top 25 cover essentially every scene a viewer sees. The other 85
   inherit the shared improvements.
5. **Cleanup: delete the cruft and drive typecheck to zero** (from the accepted baseline of 99).
6. **Output quality in scope**: typography/brand system, render resolution & encode, comprehension-serving
   transitions. **Reveal sound design and narration ducking are explicitly out of scope.**
7. **Voice: exhaust free edge-tts before paying.** Use what it exposes and the app ignores, measure the
   result, and only then judge whether a paid expressive voice is warranted. Build the voice layer behind
   an interface so a later swap is config, not a rewrite.
8. **Animation order: toolkit → fix → then add.** Shared motion infrastructure first, then unlock the 35
   hidden kinds and fix the 4 crashers, then add new kinds — so new painters are born smooth instead of
   needing a second polish pass.
9. **Deliver against Milestone 1: one genuinely good short and long video for ONE subject**, judged by
   eye, before the same treatment is rolled across the other 18. Catches a wrong assumption once instead
   of nineteen times.

---

## 4. Phases

### ⚠️ Phase 0 — Commit the source tree BEFORE touching anything

**102 of the 158 files in `src/` are untracked by git.** Among them:

- **93 of the 110 painters** (only ~17 Wave-1 kinds are tracked)
- **`painters/three3d.ts` and `painters/icons.ts`** — 805 lines of shared 3D and icon infrastructure that
  **64 painters import**
- `src/app/probe/page.tsx` (the entire 477-line QA harness)
- 4 live API routes: `keys`, `rate`, `refine`, `tune`
- `src/lib/{jsonrepair,rate,speech}.ts` — `speech.ts` is the whole TTS normalisation layer
  (`CLAUDE_PROMPT.md` items 14-22), `jsonrepair.ts` is wired into the Gemini parse path (items 29-30)
- `src/studio/captions.ts`
- **All three scripts that `package.json` actually invokes**: `filmstrip.mjs`, `edge-audit.mjs`,
  `edge-check.mjs`

None of it is covered by a `.gitignore` rule — it is simply uncommitted. **This has already destroyed
work**: `qa/LEDGER.md` records *"~174 lines of uncommitted 3D-staircase work in this file were destroyed
by an unguarded git checkout on 2026-07-27"*, and 8 ledger rows read `commit: (uncommitted)`.

**Any cleanup that runs `git clean` or `git checkout` right now deletes 93 painters.** So:

1. `git add src scripts && git commit` — this must land before a single file is deleted or refactored.
2. Resolve `DESIGN-BRIEF.md`, which is tracked but deleted from disk (`git status` shows ` D`).
3. Note `audit/` and `graphify-out/` are gitignored **and** untracked, so deleting them is an
   unrecoverable `rm -rf` — copy `audit/RANKING.md` and `graphify-out/GRAPH_REPORT.md` aside first if
   they're wanted.

> **Phases 1 and 2 were added after two audits found that several of the worst problems are outright
> defects — including four painters that crash every frame — not design decisions. Cheap, high payoff.**

### Phase 1 — Painters that crash on every frame, and one regex

All recorded as live failures in `qa/LEDGER.md`, not type noise. Most are collateral damage from the
`rewrite_*.js` codemods that already ran against `src/`.

1. **The menu regex** (root cause 4) — `prompt.ts:142` (the plan said :139), `[a-z]+` → `[a-z0-9_]+`.
   Unlocks 35 kinds. **Do this first; it changes the scope of every later animation decision by a third.**
2. **`radar.ts:291`** — `Cannot find name 'cy'`; crashes every frame. `radar` is in **12 of 19 subject
   kits** — the highest-severity single defect in the library. (`TS2304`)
3. **`circuit.ts:197`** — 4 arguments to a 2-arg helper. `qa/LEDGER.md`: *"CAPTURE CRASHES: hex.slice is
   not a function … every frame errors."* (`TS2554`)
4. **`dayclock.ts:135,140`** — reads `.geometry` off a `THREE.Group`; crashes every frame. In 6 kits.
   (`TS2339`)
5. **`tree.ts`** — not a crash but worse, because it's silent: `tree` is a `CORE_KINDS` member available
   to all 19 subjects, and **its entire 3D node layer is frozen at frame 0.** It calls
   `render3D(..., env.elapsedMs)` at `:135` with neither `liveEnv` nor `context`, while `nodeAppear`
   (`:71-76`) closes over `env` *and* painter-local state. Marked `todo`, so nobody has looked.
6. **`cycle.ts:130-131`** — `Cannot find name 'Pt'`. (`TS2304`)
7. **`eventbus.ts:15` / `trafficflow.ts:15`** — import `EventbusScene` / `TrafficflowScene`, **types that
   do not exist** (`TS2305`). They resolve to `any`, cascading into 18 implicit-any errors. Fix is the
   idiom every other painter uses: `Extract<Scene, { kind: "eventbus" }>`.
8. **`drawSceneTitle` times its fade off scene progress.** `common.ts:370` uses `sub(p, 0, 0.12)` —
   scene-fraction timing, the exact anti-pattern that `enterT`'s own doc comment (`common.ts:200-202`)
   exists to forbid. On a 30 s scene the title and its underline take 3.6 s to arrive.

   > **Correction, measured at implementation time.** I wrote "91 painters fade in over 3.6 s". Only
   > **11 of the 94 call sites** actually did: bodymap, calendar, circuit, constellation, dayclock,
   > schematic, skyline, **steps**, storyboard, terrain, zoomladder. The other 83 had already hand-rolled
   > a workaround — **70** passed `Math.max(env.p, enterT(env, 380..460) * 0.12)` (48 of them via a copied
   > `const titleP`), **11** passed `enterT(env, 360)` straight in, which `sub(…, 0, 0.12)` turns into a
   > ~45 ms pop, and 2 aliased it as `titleIn`. So the real defect was **three different title timings
   > across the library**, not one slow one — and note `steps.ts`, cited elsewhere in this plan as the
   > reference painter, was one of the 11 slow ones.
   >
   > It is also **not a one-line fix**: `drawSceneTitle` received only `p` and had no access to
   > `elapsedMs`, so no change inside the function could make it time-based. The fix is a signature
   > change — the 4th parameter becomes the env — plus a sweep of all 94 call sites, which deletes the
   > 70 workarounds and the 50 `titleP`/`titleIn` consts that fed them. Timing is now owned in one place
   > (`TITLE_IN_MS = 420`).

Items 6-7 kill 20 of the 99 typecheck errors. Items 2-5 are user-visible breakage in kinds that are
offered to most subjects.

### Phase 2 — Broken right now (highest payoff per hour of work)

Every item is a confirmed defect with a file:line, not a preference.

1. **The videos render in the wrong font, differently on every machine.** `common.ts:18` sets
   `FONT_SANS` to `'Plus Jakarta Sans', …`; `globals.css:1` `@import`s it — but **no DOM element ever
   uses that family, and canvas `ctx.font` does not trigger a webfont fetch.** So production renders
   fall back to `-apple-system`/`Segoe UI`/`Roboto` depending on the machine. This breaks the
   "same script → identical re-render" guarantee (`README.md:66-67`) *and* invalidates every
   `fitFontSize`/`wrapText` measurement (`common.ts:325-354`) that was tuned to Jakarta metrics.
   **The fix already exists** — `src/app/probe/page.tsx:193-198` has `fontsReady()` doing
   `document.fonts.load(...)` for weights 400-900 plus `await document.fonts.ready`, with a comment
   explaining exactly this hazard. The main render path (`page.tsx:544-608`) never calls it.
   `grep -rn "document.fonts" src/` hits only the probe page. Also: **weight 900 is requested 26 times
   but Plus Jakarta Sans only ships 200-800**, so those are synthetically emboldened.
   *(This is why the `qa/` PNGs look better than real output — they were rendered through the probe.)*
2. **Captions ship OFF.** The engine defaults to karaoke for shorts / pop for long (`engine.ts:508`),
   but the UI hard-codes `useState<CaptionStyle | "auto">("off")` (`page.tsx:192`) and only passes a
   style through when the user explicitly picks "auto" (`page.tsx:574`). **Every Short currently ships
   with no captions at all** — on a surface watched muted. Straight retention leak.
3. **Karaoke captions break mid-beat.** `engine.ts:418` clamps to `wrapText(...).slice(0, 3)` while
   `engine.ts:464-481` computes `spoken = floor(progress * words.length)` against the **full** word
   list. Past ~18 words the highlight index outruns the rendered words, so the accent disappears and
   everything freezes in the "done" state for the rest of the beat. The 3-line clamp also **silently
   truncates** — beats may be 320 chars (`schema.ts:9,16`) but only ~99 chars fit three lines on a
   short, with no ellipsis, so the viewer never sees the end of the sentence they're hearing. Also,
   `progress * words.length` assumes uniform word timing; real per-word timestamps don't exist
   (`pipeline.ts:76` captures only a whole-beat duration).
4. **Every transition dissolves into a frozen still.** `engine.ts:647` paints the incoming scene at
   `timing.startMs + timing.durationMs`, which is exactly the next scene's `startMs` — so the incoming
   scene renders at `p=0, elapsedMs=0` for the whole 420 ms. **This compounds the PowerPoint problem
   at every single scene boundary.** Related: the `alpha²`/`e*e` curves are back-loaded (at the window
   midpoint opacity is 0.25), so a "crossfade" reads as a soft pop; `transitions[0]` is dead code
   (keyed on the incoming id, `engine.ts:521, 648`); captions during a transition belong to the
   *outgoing* scene for the full 420 ms.
5. **No end screen is possible on any video.** `OUTRO_MS_LONG = 0` and `OUTRO_MS_SHORT = 0`
   (`engine.ts:52-53`) make `drawOutro` unreachable — despite a fully implemented subscribe pill 35
   lines above and a comment at `:49-50` claiming "both formats get a subscribe outro". Videos end on
   `END_HOLD_MS = 600` of frozen last frame. **YouTube end screens require ≥5 s of video**, so no
   subscribe button, suggested video, or playlist can be attached to anything this app produces.
   `introOutroMs` is already wired into SRT/chapter offsets (`page.tsx:56, 622`), so re-enabling is safe.
6. **Live colour bug:** `THEME.bgBase` does not exist but is read at `eventbus.ts:237` and `:280`.
   Assigning `undefined` to `fillStyle` is a silent canvas no-op, so those fills inherit whatever
   colour was last set — a real rendering defect.
7. **Contrast failures**, measured: `THEME.textFaint` composites to **2.41:1** (46 uses); karaoke's
   unspoken words to **4.0:1** — the words you're about to hear are the least readable thing on screen;
   the `Art & Culture` accent `#e11d48` gives **4.06:1** as text and **4.09:1** in boxed captions. All
   below the 4.5:1 floor, and worse after VP9 compression at phone size.
8. **No `public/` directory exists**, so `fetch('/music.mp3')` 404s on every render and **every video
   ships as bare narration over silence** (`engine.ts:157`). Even if present, `MUSIC_GAIN = 0.05` is
   ≈ −26 dBFS — inaudible under speech *and* in the gaps. (Music bed only; reveal SFX stay out of scope.)
9. **⚠️ FOUND WHILE IMPLEMENTING PHASE 2 — the worst defect in the repo, and no earlier audit caught it.
   `paintBigtext` leaks a `ctx.save()` on every frame, and it walks the whole video off-screen.**
   `bigtext.ts:461` saves and applies `translate(offsetX, offsetY)`, where `offsetY` tracks
   `Math.sin(env.elapsedMs / 1500)` through a 3D projection. Variants 2/3/4 restore it; **variants 0 and
   1 `return` without restoring** (`:535`, `:600`). Canvas state persists across frames, so each frame
   stacks another translate on the last and the offset *integrates* the sine: measured live, the main
   context's transform went `f = −6.6 → −46 → −118 → −333 → −592` px on a 1080-tall frame within the
   first seconds, after which the render shows almost nothing. A 22-scene long demo produced an
   **18 MB webm for 271 s** (against 86 MB for a 95 s short) — the video is very nearly a still from the
   first scene onward, for its whole length, for every subsequent scene.
   `bigtext` is the **#1 kind at 18.8% of all scenes** and the opener of 42 of 89 videos, and the variant
   is seeded by scene id, so roughly **40% of videos are destroyed from their first scene.** This is
   likely a large part of the owner's verdict, and it is invisible to every existing QA instrument:
   `qa/LEDGER.md` and `npm run filmstrip` render one kind at a time through `/probe`, which never carries
   canvas state from one scene into the next.
   **Two fixes, both landed:** the missing `ctx.restore()` in each variant, and — because trusting 110
   painters to stay balanced is the real design flaw — `resetContext(target)` at the top of the engine's
   `paintAt`, so one unbalanced painter can no longer poison the rest of a video.
   **This also argues for pulling Phase 16 (post-render measurement) much earlier**: nothing in the
   pipeline ever looks at the rendered artifact, which is how a defect this total survived 89 videos.

### Phase 3 — Instrument (nothing after this is verifiable without it)

- **New `src/studio/pacing.ts`** — one shared metric module built on the real `sceneBeats()` so the gate,
  the rater and the audit can never disagree. Exports `pacingReport(script)` → `{ estSeconds,
  staticCardSeconds, staticCardShare, beatSeconds[], overlongBeats[], secondsPerVisualChange, kindMix,
  definitionShapedBeats, crutchHits, runningExampleCoverage }`. Words→seconds via one named constant
  `SPOKEN_WORDS_PER_SEC = 2.6` — the first WPM constant in the codebase (duration is otherwise always
  *measured* from real audio, so this is an estimate used pre-render only and must be labelled as such).
- **New `scripts/pacing-audit.mjs`** — runs it over `content/factory/**` + `content/videos/*`, writes
  `qa/PACING.md` worst-first, in the style of `scripts/edge-audit.mjs`. This is the before/after instrument.

> **How the `.mjs` reuses the TypeScript — resolved at implementation time.** No existing script imports
> anything from `src/`: `edge-audit`, `edge-check` and `filmstrip` all drive the dev server through
> Playwright, and `content-factory` only touches `fs` plus the HTTP API. That would have forced this
> phase to either re-implement `sceneBeats()` (the exact drift the module exists to prevent) or boot a
> browser to do JSON arithmetic. Neither is necessary: **Node 22.20 strips TypeScript types on import**,
> so `pacing-audit.mjs` imports `../src/studio/pacing.ts` and gets the real implementation. Verified end
> to end — `node` runs it, `npx tsc --noEmit` accepts it (with `allowImportingTsExtensions`, safe under
> the existing `noEmit`), and `next build` reports "✓ Compiled successfully" on it. The only cost is
> explicit `.ts` extensions on relative imports inside `pacing.ts`, and the constraint that it may never
> import the engine or a painter (canvas/three would not load outside a browser).
>
> Two things the audit also does, which the spec did not ask for and should keep:
> 1. It **excludes the demo fixtures** by reading their topics out of `demo.ts`, so a `?demo=` render
>    can never contaminate a corpus statistic. Five such renders already existed on disk.
> 2. It **asserts `pacing.countWords` agrees with `schema.narrationWordCount` on every script**, and
>    fails loudly if not. This is the mechanical guard against the deadlock the verifier proved in
>    §"Root cause 2": if the new caps and the existing word-floor gate ever count words differently they
>    will fight for all three repair rounds and exhaust. Currently 88 of 88 agree.

### Phase 4 — Mechanical content gates (schema.ts / sanitize.ts) — the model cannot ignore these

Prompt rules the corpus already violates are proof that prompting alone fails here.

- **Per-kind narration caps** replacing the blanket 400 (`schema.ts:9-17, 26, 69, 194, 215, 276`).
  **Implemented as one cap of 190, not five caps of 150-260** — and it turns out only the 5 single-beat
  kinds use the shared `narration` field at all, so a single change reaches exactly the scenes that
  freeze. `terminal` keeps a larger 260, and that exception is earned: `painters/terminal.ts:144`
  budgets its typewriter at `min(rawTotal, env.durationMs * 0.62)`, so it really is animating.
  **Why 190 rather than the specified 150**, simulated over all 88 scripts:

  | cap | long median words | below 850 floor | below prompt's 950 | overlong beats fixed |
  |---|---|---|---|---|
  | 150 (as specified) | 1028 → 937 | 3 → 7 | 8 → 13 | 354 → 245 |
  | **190 (12 s-derived)** | 1028 → **962** | 3 → 7 | 8 → **11** | 354 → **245** |

  Identical benefit, 25 more words kept and two fewer scripts pushed under the floor — 150 is strictly
  worse. 190 is not a magic number either: it is `OVERLONG_BEAT_SEC × SPOKEN_WORDS_PER_SEC ×` the
  corpus-measured 5.98 chars/word = 187, i.e. the char cap that expresses the 12 s target zod can enforce.

> **⚠️ Two corrections this phase forced, both measured.**
>
> **1. The caps reach less than half the problem.** Of the 354 beats over 12 s, **215 (61%) sit inside
> MULTI-beat scenes** — bullets 34, code 25, diagram 25, trace 24, mythfact 21, compare 20, table 15 —
> where no per-kind narration cap can touch them (a `say` is capped at 320 chars, so a one-item scene can
> hold ~21 s). §"Root cause 2" concluded from medians that the animated kinds were "already fine"; the
> medians are fine and the tail is not (these 215 run median 15.0 s, p90 18.5 s, max 21.9 s). So a
> **kind-agnostic `overlongBeats` gate** was added, which the spec does not contain. It is soft, so the
> model rewrites rather than truncates and the word budget is unaffected.
>
> **2. The prompt and the gate disagree on the word budget, and always have.** `schema.ts:3447-3450`
> accepts short 110-240 / long 850-1900; `prompt.ts:696` demands 130-220 and `:712` demands 950-1700.
> The prompt is the stricter of the two, and 8 of 25 long scripts already fail its 950 floor before any
> cap is applied. `prompt.ts` also implies two different speech rates it never names (220 words / 90 s ≈
> 2.44 w/s at `:696`; 1700 / 540 s ≈ 3.15 w/s at `:712`). Phase 8's "single-source the limits" now has a
> concrete first customer.
- **Mirror the caps in `src/lib/sanitize.ts:91-92, 109-114`** so an over-long card is *deterministically
  trimmed at a sentence boundary* by the existing `clampSpeech`, never bounced into a repair round. This
  is what defuses the deadlock the verifier proved: caps cost words, and the word-floor gate would
  otherwise fight the new cap across all 3 repair rounds and exhaust.
- **New soft gate `staticCardOverrun(script)`** at `schema.ts:3547` (the established soft-gate zone) —
  flags any single-beat scene over its cap, and any long-format single beat over ~12 s. Wire in **three**
  places or the factory degrades to a generic message: `generate/route.ts:136-174` (repair text),
  `:183-204` (warning), `content-factory.mjs:228-244` (`warningsToDirectives`).
- **New soft gate `definitionOpener(script)`** — **reinstated, with the strict pattern only.** Phase 3
  wrote this off after measuring 3 of 88 on the corpus (see §1's correction: the plan's own loose pattern
  flags good `Your…` cold-opens). But a **fresh generation from the raw prompt**, run to verify this
  phase, opened with *"A closure is a function bundled together with references to its surrounding lexical
  environment…"* — a textbook definition. The corpus reads well because its slots accumulated learned
  directives over many attempts, not because the prompt is sound. The strict predicate is exactly the
  right gate: it caught that beat and flags none of the 21 good hooks. Note the existing
  `firstBeatFormulaic` (`schema.ts:3513-3519`) cannot see this shape — it only knows "Have you
  ever/Did you know/Imagine". **Never gate on `isDefinitionOpenerLoose`**; it exists only to keep the
  old number reproducible.
- **New soft gate `crutchPhrases(script)`** — counts banned openers (`let's`, `here is/here's`,
  sentence-initial `Now,/Next,/So,`) and names offending beats. 101 + 61 uses prove the prompt ban isn't enough.
- **New soft gate `runningExampleCoverage(script)`** — the prompt demands one threaded example in **four**
  places (`prompt.ts:264-267, 994, 1053, 1085`); real median coverage is 0.29 and **0 of 86** thread it
  fully. Unmeasured mandates don't happen.
- **New soft gate `jargonDensity(script)`** — **the owner's second stated complaint ("so many jargon
  talk"), and no earlier draft of this plan gated it.** Measure technical terms per 100 narration words
  and, more importantly, **first-use anchoring**: at each technical term's first appearance, is a
  plain-words gloss present in the same beat or the next? `TEACHING_METHOD` (`prompt.ts:268-270`) demands
  this "every single time" and, like every other prompt-only rule here, compliance is unmeasured. Gate the
  anchored *share*, not raw density — the goal is not fewer terms, it is no unexplained term.
- **Degenerate-card gate** — a multi-beat kind reduced to 1 beat in a long video. Soft, not a change to
  the 18 `.min(1)` schemas, to avoid hard-failing legitimate scenes.

> **Throughput tension — state it openly.** Every gate added here makes a repair round more likely, and
> the factory already exhausts 6 attempts on 72 of 86 slots. Free-tier quality quota is ~400 requests/day
> across 5 keys ≈ **40 videos/day if every video passed first try**; the catalogue is 373 submodules × 3
> slots = **1,119 videos**, so 28 days minimum at perfect efficiency. `audit/RANKING.md` already records
> expected 918 / done 190 / missing 658. **More quality per video costs throughput.** Gates must *replace*
> repair rounds by making the first draft right (Phase 17 exemplars), not stack on top of them.
- **Fix the live 400 bug**: raise `directives` `.max(12)` → 24 at `generate/route.ts:21`, slice at
  `content-factory.mjs:339/364`, and dedupe better than exact-string (`:352`) — exact matching is why the
  store visibly accumulates paraphrases.

### Phase 5 — The structural change (prompt.ts)

- **Rewrite the long structure block** (`prompt.ts:695-714`): delete "4-6 sections, each a `bigtext`
  section card"; require each section's first teaching scene to carry the section title, and the previous
  section's last beat to end on a one-sentence forward hook. `bigtext` for hook + recap only. Raise the
  scene aim from "16-22" to **18-26** so the same word budget spreads across more, shorter beats — this
  is the compensation that keeps `NARRATION_BUDGET` reachable after the caps.
- **Give `narration` an explicit number in every single-beat menu line** (`prompt.ts:22, 25, 32, 34, 39`)
  — the direct fix for root cause 2.
- **Decouple chapters from `bigtext`**: `src/app/page.tsx:58-60` hard-codes `if (scene.kind ===
  "bigtext")` to emit YouTube chapter marks. Add an optional `section?: string` scene field and emit a
  chapter wherever a new section starts, any kind.
- **Fix the third per-beat instruction** at `scripts/content-factory.mjs:231`.
- **De-duplicate HARD LIMITS** — one exported constant instead of three hand-maintained transcriptions
  (`prompt.ts:813-842, 878-895, 1163-1177`), already the biggest drift risk in the file.
- **Narration voice**: add concrete-before-abstract and no-definition-opener rules to `NARRATION_RULES`
  (`:204-230`), plus "name the running example in every scene". Fix rule inheritance while here:
  `TEACHING_METHOD` does **not** reach `buildRefinePrompt`, `VARIETY_RULE` reaches only the two script
  prompts, and `buildRepairPrompt` carries **no rules at all** — so any repair-time rule must live inside
  the soft-gate message string.

### Phase 6 — Make the judge able to see pacing (rate.ts)

- Add a 7th section **`pacing_density`**, and **feed it computed facts, not estimates**: inject
  `pacingReport()` output into the rating prompt as measured ground truth, then grade against the 4-6 s
  target. An LLM cannot time audio; asking it to guess is why this is invisible today.
- Requires **5 coordinated edits** or ratings break silently: `RATING_SECTIONS` (`rate.ts:5-12`), the
  criteria text (`:58-74`), **the literal JSON shape example (`:81-82`)** — `normalizeRating` hard-bails
  to `null` on a missing section (`:96`), which becomes a 502, after which `accepted()` is always false —
  plus recognising that `overall` is an unweighted mean (`:111`), so 7 sections shifts every historical
  score, and `worst` (`:112`) can only get stricter against `--bar 8`.
- Recalibrate acceptance in `content-factory.mjs:285-289` and delete the two dead flags (`maxRounds`,
  `stretch`, parsed at `:62`, never read).
- Consider making the factory actually refine rather than re-roll, given it currently discards the prior
  script entirely.

### Phase 7 — Render-layer correctness

- Re-lock the **7 desynced painters** to beat windows (`beatT`/`activeBeatIndex`) instead of
  `Math.floor(env.p * n)`: eventbus, geomap, geometry, layers, molecule, numberline, trafficflow.
- Give the 5 single-beat painters a **progressive reveal** so even a capped card earns its seconds
  (`bigtext`: icon → headline → sub staged across the beat, not all inside the first second).
- Delete `painters/code.ts.bak` and `painters/trace.ts.bak`.

### Phase 12 — Narration & voice ("AI can't express, pause, pronounce")

The least-developed layer in the app and probably the largest perceived-quality gap. Everything below is
verified by reading `src/lib/speech.ts` and `src/app/api/studio/tts/route.ts` directly.

**What already works — do not rebuild it.** `normalizeSpeech()` (`speech.ts:82`) runs **only on the voiced
copy**; captions are built separately from the original beat text via `src/studio/captions.ts`. The
voice/caption split that most TTS work needs **already exists**, which is why "₹10Cr" can be spoken as
"ten crore rupees" while the screen keeps the symbol. Build on this seam.

**12a. The app uses one of edge-tts's several controls.** `tts/route.ts:28-29` passes
`--voice --text --write-media` and optionally `--rate`. Nothing else.

> **SPIKE RESULT (row 12.1, measured against the live `.venv`, `edge-tts 7.2.8`).** All three questions
> answered. The headline: **word timings exist, and the CLI cannot reach them.**
>
> - **`--pitch` and `--volume`: accepted, but NOT usable — see the correction below.** Both are real CLI
>   flags (`edge-tts --help`) and keyword args on `Communicate`. Verified `--pitch=+40Hz` against `-0Hz`
>   on identical text: same byte length, different md5, so it re-synthesises rather than being ignored.
> - **Word-boundary timestamps: YES — but only through the Python API.** `Communicate.__init__` takes
>   `boundary: Literal["WordBoundary","SentenceBoundary"] = "SentenceBoundary"`. The **default is
>   sentence-level**, which is why this looked unavailable: `--write-subtitles` emits one SRT cue per
>   *sentence*, and **the CLI exposes no `--boundary` flag at all**. Passing `boundary="WordBoundary"`
>   yields per-word `offset`/`duration` in 100 ns ticks — 15/15 words on the test sentence, on
>   `en-US-AndrewMultilingualNeural`, `en-IN-NeerjaExpressiveNeural` **and** `hi-IN-SwaraNeural`. It is not
>   a voice property; every voice defaults to sentence and every voice honours the override.
>   **Consequence: the route must stop shelling out to `python -m edge_tts` and call a small in-repo Python
>   helper instead** (one process, returns mp3 + a word-timing sidecar). That is the enabling change for
>   real karaoke (Phase 2 item 3), word-anchored reveals, and 12.7's emphasis marker.
> - **SSML: NO, confirmed.** `<speak><break time="800ms"/>Hello <emphasis level="strong">world</emphasis>.
>   </speak>` passed as `--text` is **spoken literally, tags and all** — 10.6 s of audio reading the markup
>   aloud, versus ~1.3 s for the bare words. So 12.2/12.3 must work through punctuation, `--rate`/`--pitch`
>   /`--volume` per beat, and phonetic respelling (12c) — never SSML.
>
> **Bonus measurement, and it belongs to 12b.** With word timings the per-clip silence that Phase 15
> located by `silencedetect` is now exact: **lead 0.087-0.100 s, trail 0.325-0.462 s.** On a 4.65 s clip
> the trail is 7% dead air; on a 1.75 s question beat it is **26%**. Word timings make this trimmable
> precisely rather than by threshold guessing.

> **CORRECTION from row 12.2 — pitch is not a tonal control, and this plan was wrong to assume it was.**
> The bullet above says "lift pitch slightly on a question beat, drop it on a payoff". Measured, that
> instruction would have injected uncontrolled *pacing* noise into every video:
>
> | control | measured on an 11-word line, baseline 3312 ms, en-US-Andrew |
> |---|---|
> | `rate` | **monotonic and reproducible.** −20% → +17.5%, −10% → +9.9%, −5% → +6.5%, +5% → −4.4%, +15% → −13.7%. Same shape on a second text; repeat passes are byte-identical (edge-tts is fully deterministic — 6 identical calls gave 0.0% spread). |
> | `pitch` | **+8 Hz alone reads 12.1% FASTER**, and it is non-monotonic: −6 Hz → −3.0% but −20 Hz → +2.6%. |
> | `pitch` × `rate` | **non-additive.** −6 Hz with +4% → **−24.5%**. −5% and −2% at +8 Hz produce byte-identical audio, so the service also quantizes. |
> | `volume` | non-monotonic too: −30% → −1.5%, −15% → −3.0%, +15% → −5.3%, +30% → −4.5%. |
>
> No case dropped a word, so this is a timing artifact rather than corruption — but beat duration drives
> the whole timing model and slow pacing is the defect this programme exists to fix, so a knob that
> silently moves duration by up to 25% is worse than no knob. **12.2 therefore ships rate-only delivery**
> (`src/studio/delivery.ts`); pitch and volume stay plumbed through `lib/tts.ts` and the route for a
> future vendor that handles them cleanly. The honest limitation: rate-only varies *pace*, not *pitch*,
> so it reduces the monotone rather than removing it. Real tonal variation needs a different vendor —
> which is exactly what 12.8's interface is for.

**12b. Pausing.** There is no pause control today beyond whatever punctuation the model happens to write.
`prompt.ts` TTS_RULES asks for `...` and ` — ` and nothing checks compliance. Make it mechanical: a soft
gate measuring clause length and pause markers per beat, so "one breath every N words" is enforced rather
than requested. Prompt-only has already failed here in the same way "let's" did.

**12c. Pronunciation — the dictionary is 6 entries deep.** `INDIAN_TERMS` (`speech.ts:49-56`) contains
exactly **Lok Sabha, Rajya Sabha, Kailasa, Kesavananda, Panchayat, Lokpal**. This app covers Indian
history, polity, geography, mythology and art & culture across 373 submodules. Every dynasty, monument,
battle, river, raga and case name is currently mispronounced by an American voice. Needs a real lexicon —
hundreds of entries, organised per subject, ideally generated once per submodule and cached rather than
hand-written. This is the highest-effort, highest-payoff item in the workstream.

**12d. Hindi gets almost no treatment at all.** `speech.ts:88-91` — when `lang === "hi"` the function
applies two symbol replacements and **returns immediately**, skipping every acronym, unit, currency and
code-punctuation rule. A Hindi video saying "API" or "100ms" gets nothing. Given Hindi is a first-class
content language with its own channel, this needs its own normalisation path, not an early return.

**12e. The default voice is American for India-first content.** `tts/route.ts:19` defaults to
`en-US-AndrewMultilingualNeural`, while `en-IN-NeerjaExpressiveNeural` — the only *Expressive* voice in
the curated list (`pipeline.ts:33`) — sits unused. At minimum make the default subject-aware; the
expressive variant is free and already available.

**12f. The emphasis convention collides with the acronym expander.** `prompt.ts` TTS_RULES tells the model
to put a pivotal word in ALL CAPS. `speech.ts:103-105` spells out any token matching its 60-item
`SPELL_ACRONYMS` list letter by letter. An emphasised short word that happens to be in that list is
spoken as letters. ALL CAPS also survives into the caption, which the prompt acknowledges but does not
solve. Needs an emphasis marker that is stripped from the caption and translated for the voice — the
voice/caption seam already exists to carry it.

**12g. Code-punctuation backstop is two characters.** `speech.ts:86` handles `=>` and backticks. Brackets,
underscores, dots-in-identifiers and slashes all still read aloud literally if they leak into a beat.

**12h. Keep the seam swappable.** Put synthesis behind a small interface (`synthesize(text, voice, opts)
→ {mp3, durationMs, wordTimings?}`) so Azure Speech or ElevenLabs can be dropped in later without
touching the engine. The engine measures real audio duration per beat, so a vendor swap is timing-safe by
construction.

### Phase 13 — Short & long-form craft templates

**Research still outstanding.** The dedicated research pass on this failed (see *Evidence base*), so this
phase begins with the research, not the implementation.

- **Shorts**: derive a beat-by-beat template for 45-60 s and 60-90 s educational Shorts — what occupies
  0-2 s, how the middle sustains attention, how the last 2-3 s lands or loops. Express it as a sequence of
  this app's scene kinds with target seconds and words per beat, then encode it in the short structure
  block and check it with a gate. The specific brief: make the intro **relatable, not informative** —
  which is precisely what the 30%-open-with-a-definition finding says it currently is not.
- **Long form**: cluster the 19 subjects into the smallest set of genuinely distinct episode formats
  (the working hypothesis is ~10: technical how-it-works, algorithmic, narrative history, spatial,
  mechanism science, money, rules-and-institutions, language, self/behaviour, culture) rather than
  researching 373 submodules individually. Per cluster: benchmark channels, act structure with minutes
  per act, how they signpost without a title card, where the payoff sits. Feed these into `CHANNEL_ARCS`,
  which today covers only 8 of 19 subjects.
- **Exam vs curiosity audiences** need different treatments and the app serves both; decide this
  explicitly per subject rather than letting the prompt average them.

### Phase 14 — New scene kinds (only after the toolkit lands)

Deliberately sequenced last in the animation work: with the Phase 9 toolkit in place, a new painter is
cheap and born smooth; without it, every new kind is written against the current 3-easing-curve
infrastructure and needs reworking. Prerequisites: Phase 1 (the regex — 35 kinds are already built and
unreachable, so **check whether the gap is actually a missing kind or a hidden one** before building
anything) and Phase 9 (toolkit + house style).

### Phase 15 — Close the content↔narration seam (estimate vs actual) — **DONE, and it moved every number**

> **Measured result.** `scripts/drift-check.mjs` voices a script through the real TTS route and times
> every clip with ffmpeg. On an 85-beat script: **estimated 408.5 s, measured 515 s, ratio 1.26.** The
> plan's 2.6 words/sec (≈156 wpm, "edge-tts's neural default") was 26% optimistic; the effective rate is
> **2.06** (≈124 wpm). Fitting `actual = words/rate + overhead` gives ~3.5 w/s of real speech plus a
> fixed per-clip cost, and `silencedetect` locates it: **~0.15 s of leading and 0.34-1.15 s of trailing
> silence in every clip**, plus sentence-final pauses inside.
>
> Consequences, all of which make the diagnosis WORSE than §1 states:
> - Corpus runtime **249.9 → 315.4 min**; beats over 12 s **354 → 571**; mean hold **8.3 → 10.4 s**.
> - The Phase 4 narration cap was argued at 190 chars on the uncalibrated rate. At the measured rate
>   190 chars is **15.4 s** and 150 chars is **12.2 s** — so **the plan's original 150 was right** and my
>   Phase 4 comparison table was reasoning from a wrong constant. Corrected to 150 (terminal 210).
> - Every prompt number derived from it (`~31 spoken words` → `~24`) corrected in all four places.
> - **Hindi remains uncalibrated.** One global rate across `lang: "en"|"hi"` is an assumption, not a
>   measurement; re-run `drift-check.mjs` with a Hindi script and an `en-IN`/`hi-IN` voice before
>   trusting any Hindi pacing number.
> - The per-clip silence is itself a finding for Phase 12: ~0.5-1.3 s of dead air per beat, on top of the
>   engine's own `INTER_BEAT_GAP_MS`, is a real contributor to the video feeling slow.

> **SUPERSEDED — re-measured at rows 15.2/15.3. `2.06` was wrong; the rate is `2.62`.**
> Everything above stands as the record of how the constant was set; the numbers it produced do not.
>
> Re-running the same instrument on two scripts, plus a direct pass over 12 corpus beats, gives three
> answers that agree to within 3% — and none of them is 2.06:
>
> | source | implied w/s | ratio vs estimate |
> |---|---|---|
> | drift-check, 63-beat scene-kind-tour | **2.62** | 0.786 |
> | drift-check, 17-beat real content short | **2.69** | 0.975 *(at the new constant)* |
> | direct pass, 12 real corpus beats | **2.70** | — |
>
> The second row is the one that matters: the first script is a demo exercising every scene kind, so it
> could have been unrepresentative. Real content agrees. **This is not a Phase 12 regression** — the same
> sentence through the old `python -m edge_tts` CLI and the new `scripts/tts_synth.py` helper gives
> 33,984 vs 34,128 bytes, so the new path is 0.4% *longer*.
>
> Consequences, which reverse most of the block above:
> - Corpus runtime back to **249.9 min**, beats over 12 s **571 → 354**, mean hold **10.4 → 8.2 s**.
>   The §1 diagnosis is what it originally said; the 15.1 revision overstated it.
> - `overlongBeats` was firing on **43.2%** of the corpus at the wrong constant and now fires on
>   **27.3%**, back inside the 14-27% band every other gate holds. At 2.06 it was spending repair rounds
>   on beats that were already fine — the throughput risk this plan red-teams, caused by its own constant.
> - The single-beat schema cap is **9.6 s**, not 12.2 s, against the same 12 s target.
>
> **Hindi is now calibrated, and the plan's stated reason for expecting a difference was wrong.**
> Measured across both curated Hindi voices and both English ones, on the same basis:
>
> | voice | speech-span w/s | effective w/s | silence per clip |
> |---|---|---|---|
> | en-US-Andrew (en default) | 2.87 | **2.70** | 0.44 s |
> | en-IN-Neerja (11 subjects after row 12.6) | 2.75 | **2.44** | 0.99 s |
> | hi-IN-Madhur (hi default) | 2.76 | **2.26** | 1.22 s |
> | hi-IN-Swara | 2.73 | **2.33** | 0.94 s |
>
> Every voice *speaks* at 2.73-2.87 w/s. The languages do **not** differ in speaking rate, contrary to
> this section's assumption — they differ in how much **silence** each clip carries, 0.44 s to 1.22 s.
> And the per-voice spread inside English (2.70 vs 2.44) is wider than the gap between languages, which
> now matters because row 12.6 made `en-IN-Neerja` the default for 11 of 19 subjects.
>
> **The two-parameter model stays unshipped, on evidence.** `actual ≈ words/rate + overhead` beats
> rate-only on both scripts, but its parameters are not stable across them: `words/3.89 + 1.00 s`,
> `words/3.29 + 0.91 s`, and 2.87 w/s + 0.44 s from direct measurement — 18% apart on the rate term. A
> one-parameter constant measured three times and agreeing to 3% is worth more. Settling the two-parameter
> form needs drift-check across many scripts with different beat-length distributions.


**This is the integration hole.** Every pacing threshold in this plan is enforced against an *estimate*
(`SPOKEN_WORDS_PER_SEC = 2.6`, computed pre-TTS), while the video's real timing comes from *measured*
audio (`engine.ts:66-87`). **Nothing compares the two.** A beat gated at an estimated 9 s can voice at
13 s and the gate reports success. Until this closes, every number in Phases 3-6 is unfalsifiable.

- After voicing, compute per-beat drift (`actualMs` vs `estimatedMs`) and store it with the script.
- Calibrate `SPOKEN_WORDS_PER_SEC` from real measurements per voice and per language — Hindi and English
  at the same `--rate` do **not** speak at the same words/second, and the app currently assumes they do.
- Surface drift above a threshold as a warning, so a systematically wrong estimate is visible instead of
  silent.
- This is also the prerequisite for trusting Phase 6's pacing rubric, which feeds the judge computed
  numbers — feeding it wrong numbers is worse than feeding it none.

### Phase 16 — Post-render measurement (nothing currently judges the actual video)

Verified: `grep -rln "pacingReport\|renderCheck\|postRender" src/` returns **no matches**. The rating loop
grades the script *text*. The rendered artifact — the only thing a viewer sees — is never measured.

- After render, measure the real thing: actual duration vs target, real seconds-per-visual-change from
  beat timings, dropped frames, whether audio is still in sync at the end of a long render.
- Feed the result into `PROGRESS.md` evidence and, later, into the factory's accept/reject decision.
- Cheapest useful version: extract N frames from the rendered webm and compute inter-frame difference over
  time — a flat stretch is a dead frame, and that is the owner's original complaint measured directly on
  the output rather than inferred from the script.

### Phase 17 — Gold exemplars (cheap, high impact, do EARLY)

`exemplarScript` is accepted at `generate/route.ts:22`, threaded into `prompt.ts:672-679`, and
**written by no caller anywhere in the repo.** The most reliable quality lever available is built and
switched off.

- Hand-author **one short and one long gold script per episode archetype** (~20 scripts, per §0b), to the
  standard this plan describes: no definition opener, no static card over ~9 s, one running example, real
  pausing, correct scene kinds.
- Wire them in: the factory (`content-factory.mjs:217`) must actually send `exemplarScript`; today it
  sends only `{subject, module, submodule, format, topic, model, keyId, freeOnly, directives}`.
- Rules cannot teach voice; examples can. This is the direct answer to "it should not feel like reading a
  book" — a rule saying "sound human" has already failed 89 times.

### Phase 18 — Thumbnail, title and CTR

Absent from every earlier draft of this plan, and arguably the highest-leverage item for the stated goal
of *views*. `thumbnail.ts` (183 lines) exists and is called from `page.tsx:627`; `videoMeta.ts` builds
titles/descriptions/tags. Neither has been audited against what actually earns clicks.

- Audit the generated thumbnail: is it legible at 168×94 px (the real feed size)? Face/subject, ≤4 words,
  high contrast, does it repeat the title or complement it?
- Titles: the prompt already asks for search-phrase-first shapes — verify against the generated corpus
  rather than assuming.
- This workstream can proceed fully in parallel with everything else; it touches no shared code.

### Phase 11 — Rewrite `CLAUDE_PROMPT.md` as the master spec (do this LAST)

Keep it a standalone tracked spec (it declares itself not-loaded-by-the-app at `:3-5`). New structure:
measured diagnosis → benchmark spec → the four-layer solution → per-subject playbooks (§5 below) →
issue tracker → known-unfixed list (§6 below). Correct two stale entries: **N2 claims 11 orphan painters
— there are zero** (all 110 kinds are registered and painted, `painters/index.ts:129-247`), and N3's
"benign" verdict on the word-budget mismatch needs re-scoping now that a third duration figure exists
(`prompt.ts:600` says 8 minutes vs 6-12 vs 7-11).

### Phase 9 — Animation craft: build the vocabulary once, then upgrade by traffic tier

The existing QA program (`ANIMATION-QA-PROMPT.md` Part C, `qa/LEDGER.md`) grades 5 axes — containment,
typography, motion quality, cleanliness, palette — ship gate ≥4. Current state: **16 passed, 3
in-progress, 91 todo.** At the observed rate (16 kinds in roughly a day of concentrated work, 1-5 rounds
each) the remaining 91 is a very large serial effort — which is the argument for doing the central pass
first. Those 5 axes answer *"is it broken?"*; none answers *"is it authored?"*.

**What the rubric cannot see, by construction:** it scores each kind **in isolation**, and its
consistency line reads "consistent corner radii… *in the scene*". So the 25 different radii, 20 different
entrance durations and 425 hardcoded hex literals across the library are invisible to it — a video cutting
between 8 scenes that each score 5/5 can still feel like 8 different products. It also has no axis for
element *departure* ("settles" actively rewards accumulate-and-hold), none for attention direction or
whether the reveal matches the spoken beat's emphasis, none for frame budget, and none for 3D material
quality. Audio sync is explicitly disclaimed (`ANIMATION-QA-PROMPT.md:266-269` — the probe synthesises
evenly-spaced beats). And the ship gate disagrees with the automated audit: `steps` and `quiz` are marked
`passed` yet still bleed off-frame in `qa/AUDIT.md`.

**Palette compliance is failing in 76% of the library**: 84 of 110 painters contain hardcoded hex,
roughly **425 literals**, including high-traffic kinds (`diagram.ts:302`, `pipeline.ts:151,226`,
`tree.ts:97,113`). That is rubric axis 5, unmeasured because it is only ever checked per-scene.

**The leverage number:** `painters/` is 39,908 lines. Shared infrastructure — `common.ts` (623) +
`three3d.ts` (285) + `icons.ts` (520) — is **1,428 lines, 3.6% of the total**, and it contains **three
easing curves.** There is far less central machinery than a 110-animation pass needs, which is exactly
why a central pass is the right move.

**6a. New shared vocabulary in `painters/common.ts`.** What exists today: `easeOutCubic`,
`easeInOutCubic`, `easeOutBack` (hardcoded `c1 = 1.70158`, no damping), `clamp01`. That's it. The nicest
curve in the codebase — `easeSpring`, a damped-sine elastic-out — is **private to `bigtext.ts:157-160`**
and used by zero other painters. To add:
- **An easing family**: spring with configurable damping/stiffness, `anticipate()` (negative lead-in —
  only `domino_cascade.ts` does anticipation at all today, hand-rolled), elastic, quad/quint in-out.
  Promote `easeSpring` out of `bigtext.ts`.
- **`stagger(i, n, t, opts)`** with direction (in / out / centre-outward). Today the *only* stagger
  primitive is `enterT`'s third `delayMs` argument, hand-computed at every call site: **12 distinct
  per-index increments** across 36 painters (`*70` ×14, `*90` ×6, `*40` ×6, `*45` ×4, …), plus
  re-invented named constants (`memgrid.ts:50`, `stat.ts:13`, `ledger.ts:32`, `coin_stack.ts:35`,
  `radar.ts:110`, `skyline.ts:179`). The other 74 painters don't stagger siblings at all.
- **`secondaryMotion()` / `followThrough()`** — 50 painters hand-roll `Math.sin(elapsedMs / P + phase) * A`
  with a bespoke P and A each (`cipher.ts` has three different ones in one file). 301 `Math.sin` calls
  across painters. `idle()` already exists and 78 painters import it — then don't use it for this.
- **Exit vocabulary — completely absent.** The string `exit` appears in **zero** painters; the only
  fade-out in the codebase is hand-rolled at `bits.ts:413-415`. Everything accumulates and holds, and
  departure is delegated entirely to the engine's 420 ms crossfade. Half of Fireship's and Kurzgesagt's
  energy comes from things leaving deliberately.
- **`lerpColor()`** — there is **no colour interpolation anywhere**. `chroma-js ^3.2.0` is a declared
  dependency imported by **zero files**. Numeric `lerp` is privately redefined in 6 painters with 3
  different signatures. `qa/LEDGER.md` records the same "hard colour pop" bug being found and fixed by
  hand twice (bigtext `:26`, mythfact `:32`) — a central helper prevents the third.
- **Design scales**: `DUR.fast/base/slow` (314 `enterT` calls use **20 distinct durations**),
  `RADIUS` (**25+ distinct expressions** for the same card corner — `compare.ts:175` uses `unit*0.7`
  where `pipeline.ts:150` uses `unit*0.35`, a 2× difference in one frame), `STROKE` (25+ values,
  **including 41 uses of raw `lineWidth = 1`** which violates the rubric's own "never absolute px" rule —
  and `common.ts:539` and `:603` break it inside the shared layer itself), `GLOW` (**375 `shadowBlur`
  sites, 22 distinct values, 147 `= 0` resets** and no shadow-direction convention at all).
- **`drawGhost()`** — the dashed placeholder entrance is the single most duplicated idiom: **48 painters**,
  5 different durations, each re-writing its own dash pattern (156 `setLineDash` calls across 53 files).
  `dp_table_fill`, `grid_flood`, `matrix` and `matrix_convolution` differ only in `*26` vs `*22` vs `*30`.
- **`drawCard()`** — 327 `roundRect` calls across 101 painters, always the same
  path→fill→path→stroke sequence, and **no card/panel/badge/chip/label/legend primitive exists.**
  `grep "export function draw"` over the whole directory returns exactly four hits.
- **`layout.safeBottom` / `safeH`** — the Shorts safe-area clamp is re-derived in **23 painters under 4
  different names with 3 different values** (0.75, 0.86, 0.88, 0.94) and two different gap constants. The
  clamp expression is byte-identical across 13 sites. One `makeLayout` field fixes all 23 — and 4 of the
  5 genuine edge-bleed failures in `qa/AUDIT.md` are this exact class.
  **Confirmed live once Phase 2.2 turned captions on**: in a rendered 9:16 demo the karaoke block lands
  *on top of* `mythfact`'s FACT card (scene 6/8), because no painter reserves the caption band. This was
  invisible before only because every Short shipped without captions. The one `safeBottom` field must be
  caption-aware, and this is now a **shipping-quality** issue rather than a tidiness one.

**6a-bis. Camera language needs a central design, not a helper.** My earlier plan said "add a
`camera()` helper". That would be **correctly rejected as a regression**: `qa/ledger.json` systemic entry
`2d-layout-round-tripped-through-camera` establishes the opposite rule — *"make the PIXEL layout
authoritative and put the camera on-axis at (0,0,D)… **Never scale/rotate/bob the 3D group afterwards —
the pixel chrome cannot follow it**"* — already applied to 10 painters. So a camera move must shift the
camera **and re-derive the pixel mapping in the same call**, or 2D chrome detaches from 3D content. Three
painters hand-roll camera work today (`canvas_reveal.ts:32-70`, `geomap.ts:47,102`, `zoomladder.ts:90`)
and `bigtext.ts:690-693` has a genuinely good local Ken Burns push-in worth generalising.

**6a-ter. Unify the three incompatible 3D-freeze patterns.** Of 64 `render3D` call sites: 33 pass `env`
as `liveEnv`, ~25 pass a per-frame `context`, 5 use a module-level state `Map`, and **`tree.ts` uses none
and is still frozen** (Phase 1, item 5). `liveEnv` only refreshes `env`, so painters whose `update()`
reads other painter-local state stay frozen — already confirmed and hand-fixed in `memgrid`, `dialogue`
and `quiz`. Make `context` mandatory and delete the `liveEnv`/`Object.assign` mutation hack, which
silently mutates a captured object and covers only one of the failure modes.

**6a-quater. Two smaller central defects.** `frustumHalfExtent` (`three3d.ts:133`) is the documented fix
for a systemic 9:16 containment bug and is used by **only 3 painters**. And the 2D and 3D layers are
**lit from opposite sides** — `isoBox` hardcodes light-from-upper-left (`common.ts:61,70`) while
`studioLights` puts the key at `(5,8,6)`, upper-right (`three3d.ts:174`). Also `autoLayoutGrid`
(`common.ts:606`) is dead code, used by zero painters.

**6b. Fix the `enterT` design flaw.** `common.ts:197-203` documents absolute-time entrances *by design*,
so content lands "within a fixed few-hundred ms regardless of scene length". Correct at 6 s, and exactly
the mechanism behind the dead frame at 20 s. Add a duration-aware sibling for scenes that can run long.
`terminal.ts` is the only painter that already scales to duration — and its `budget = min(rawTotal, 0.62
× durationMs)` can only speed *up*, never stretch to fill, so fix that asymmetry too.

**6c. Re-review the 27 never-seen 3D painters — the highest-risk unknown.** `qa/ledger.json` →
`systemic` records that `render3D` cached a closure over frame 0, so the 3D layer of **29 painters was
frozen/invisible in production**. Fixed centrally 2026-07-27, but only `bigtext` and `bullets` reviewed
since. **27 painters are animating for the first time and nobody has watched them move.** Sweep before
judging anything else.

**6d. Repair known defects**: the 7 desynced painters (Phase 7) and the containment failures in
`qa/AUDIT.md` — 7 of 220 kind/aspect pairs bleed off-frame, worst `zoomladder` short at **43.5%**.

**6e. Hand-upgrade by traffic tier, not alphabetically.** Traffic is derivable from `CORE_KINDS`
(`prompt.ts:147-163`), `SUBJECT_KIT` (`:166-186`) and the structure blocks (`:690-712`):

- **Tier 0 — in every video, often several times**: `bigtext`, `question`, `bullets`, `stat`, `mythfact`,
  `quiz`. **All 6 already `passed`** — the ledger's ordering instinct was right.
- **Tier 1 — the named COMMON workhorses, offered to all 19 subjects** (`prompt.ts:8-10`), and
  `VARIETY_RULE` forces ≥3 kinds in a short / ≥6 in a long, so these fill the body of every video:
  `diagram`, `steps`, `compare`, `chart`, `table`, `timeline`, `quote`, `tree`, `mindmap`.
  **Six are still `todo` — `diagram`, `tree`, `mindmap`, `table`, `timeline`, `compare` — and that is the
  largest immediate quality gap in the product.** `chart` is held at 3/5 on motion (*"nothing but the
  title is solid for the whole first 500ms"*); `diagram.ts` is 545 lines and the most complex.
- **Tier 2 — in 8+ of 19 kits**: `cycle` 12, `radar` 12, `gauge` 12, `chain` 11, `dialogue` 10,
  `bracket` 9, `storyboard` 8, `showdown` 8. Only `dialogue`/`storyboard` pass, and **`radar` crashes**
  despite being in 12 kits (Phase 1).
- **Tier 3 — 5-7 kits**: `zoomladder`, `race`, `constellation`, `calendar`, `curves`, `dayclock`
  (crashes), `pictogram`, `formula`, `skyline`, `ledger`, `sankey`.
- **Tier 4 — 1-4 kits**: the remainder, including `circuit` (crashes).
- **Tier 5 — the 35 regex-dropped kinds.** Zero traffic until Phase 1 item 1 lands. **Spend nothing here
  first** — that one-character fix changes this phase's scope by a third.

Copy `painters/steps.ts`. Note 6 of the 16 `passed` rows read `commit: (uncommitted)` — Phase 0 fixes that.

**6f. Extend the QA rubric** with expressive axes above the existing 5 (which stay as the floor):
staging (does the eye know where to look), anticipation & follow-through, camera language, rhythm against
narration (a visual change on every beat), continuity into the next scene.

### Phase 10 — Whole-video look: typography, transitions, encode

- **Typography & brand**: establish a real type scale; `FONT_SANS` is a system stack today — load an
  actual display face, keep captions legible at Shorts size, one system so 110 painters read as one channel.
  Carried over from Phase 2.1: **weight 900 is requested at 26 sites but Plus Jakarta Sans ships 200-800**,
  so those are synthetically emboldened by the browser. Left alone deliberately — changing 26 call sites
  to 800 alters the visual weight across the library, which is a type-scale decision, not a bug fix.
- **Transitions**: the 4 variants at `engine.ts:644-678` (`TRANSITION_MS = 420`) are decorative. Replace
  with comprehension-serving moves — zoom punch-in on the detail just narrated, match cut when adjacent
  scenes share a subject, continuous camera across a section — and make a **hard cut the default**,
  because pro explainers cut rather than dissolve.
- **Encode & resolution**: audit `VIDEO_BPS = 12_000_000`, `AUDIO_BPS = 192_000`, `FPS = 30`
  (`engine.ts:62-64`) and where canvas `width`/`height` are set; confirm true 1080p, check the webm→mp4
  delivery path, and check the rAF + watchdog loop (`engine.ts:699-723`) for dropped frames — a drop
  during recording is baked into the file permanently. *(pending audit)*
- **Dead outro**: `OUTRO_MS_LONG = 0`, `OUTRO_MS_SHORT = 0` (`engine.ts:52-53`) mean `drawOutro` never
  runs. Delete or re-enable deliberately.
- **Permanent overlay**: `drawOverlay` (`engine.ts:178-200`) paints a progress bar and brand watermark on
  *every* frame. Make that a deliberate choice.
- **Captions**: 5 styles, karaoke for shorts / pop for long (`engine.ts:508`). Short-form convention is
  scale-from-zero with OutBack overshoot and centre-outward stagger; the `word` style is closest and is
  likely the better Shorts default.

### Phase 8 — Repo hygiene and structure (before Phases 9-10 touch painters)

**Only after Phase 0 has committed `src/`.**

- **Delete 108 files / ~24 MB of root cruft** and add the missing `.gitignore` rules
  (`screenshot_*.png`, `*.ts.bak`, `*.tsbuildinfo`, `.gemini/`):
  **90 `screenshot_*.png` = 23 MB** — and **21 of them are byte-identical** (the same blank/error frame
  saved 21 times); superseded by `npm run filmstrip` → `qa/<kind>/`. Plus 9 `rewrite_*.js` (112 KB —
  **one-off codemods that already ran and mutated `src/`; they are the direct cause of the Phase 1
  crashes**), 4 `test-*` files, `test_screenshots.sh`, `add_demos.js`, `update_bigtext.js`,
  `bigtext.txt` (a verbatim copy of an older `bigtext.ts`, not a text asset), `list-models.ts`,
  `tsconfig.tsbuildinfo`, 3 `.DS_Store`, `output/` (5 files), 2 `.ts.bak` painters.
  **`test-probe.ts` and `list-models.ts` sit at the repo root inside `tsconfig.include`, so they are
  typechecked forever.**
- **Dead subsystems**: `audit/` (4.9 MB — superseded by `scripts/content-factory.mjs`; died of its own
  bug per `BLOCKED.md`) and `graphify-out/` (4.0 MB, one-shot analysis artifact). Both gitignored *and*
  untracked, so deletion is unrecoverable — copy `RANKING.md` / `GRAPH_REPORT.md` aside first.
  **`.venv/` (154 MB) is LIVE — do not delete**: three runtime paths hardcode it (`tts/route.ts:24`,
  `news/render/route.ts:21`, `exec/route.ts:63`) because TTS is edge-tts and the news renderer is Python.
  Reclaimable without risk: `.next/` (329 MB) and the regenerable `qa/*.png` (**756 MB**).
- **Drive typecheck to zero — this is much cheaper than it looks.** The 99 errors are **two mechanical
  causes plus four real bugs plus a 20-error tail**, not 99 problems:
  - **55 errors (56%)**: `demo.ts` predates the required `meta` field — 48 of 62 `DEMO_*` exports lack it.
    **One type alias (`DemoScript = Omit<SceneScript,"meta">`) kills all 55**, and it's the *correct* fix
    since demo fixtures never pass through `sceneScriptSchema`. ~15 min.
  - **20 errors**: the two missing `EventbusScene`/`TrafficflowScene` types (Phase 1) cascading into 18
    implicit-anys. ~15 min.
  - **4 errors**: the real crashes (Phase 1).
  - **20 errors**: genuine one-offs across 6 files. ~2-3 h.
  **Total ≈ half a day to zero**, then set `qa/ledger.json` → `typecheckBaseline: 0` so the QA rule
  becomes "typecheck must pass" instead of "must not exceed 99".
- **Single-source the limits.** The 3 HARD LIMITS copies (`prompt.ts:813-842, 878-895, 1163-1177`) have
  **already drifted** — the refine copy silently drops `terrain`, `zoomladder`, `queueflow`,
  `browserframe`, `memgrid`, `cycle`, `chain` and `pipeline`, so a refined script is held to a *smaller*
  rule set than the one that generated it. And `sanitize.ts` holds **37 hardcoded clamp literals** across
  16 `case` arms, importing nothing from `schema.ts` (it re-declares `MAX_BEAT`/`MAX_NARRATION` as
  literal copies). Extract one `LIMITS` table in `schema.ts`, build the zod validators from it, clamp
  from it, and *render* the prompt text from it — ~120 scattered magic numbers collapse into one table
  and the three prompt copies become impossible to drift. Bonus: `sanitize.ts` currently display-clamps
  only **16 of 110 kinds**, so over-length labels on the other 94 hard-fail instead of being trimmed.
- **Remove dead code**: 25 unused exports including `buildDirectivesBlock` (`prompt.ts:614`),
  `totalDurationMs` (`engine.ts:89`), `makePalette`/`DEFAULT_PALETTE`/`autoLayoutGrid` (`common.ts`),
  `CODE_COLORS`, and five `*_SHAPES`/`*_PARTS` arrays exported from `schema.ts` for no reason. Make the
  five stray `export type XScene` declarations local, as the other 105 painters do.
- **Extract two shared helpers**: `beatCursor(scene, env, extra)` — **96 of 110 painters repeat the same
  3-line preamble verbatim** (`chart.ts` four times), ≈ −290 lines; and `errorResponse()`/`parseBody()` —
  19 catch blocks across 20 routes use **6 incompatible conventions** with truncation lengths of
  200/300/400 and identical failures returning 404 in one route and 500 in another.
- **Remove 6 unused dependencies**: **`requests`** (a *Python* package name installed from npm — the npm
  package is an abandoned 2013 stub), `chroma-js`, `polylabel`, `d3-array`, `d3-force`, `d3-scale`, plus
  their `@types`. Move `@types/three` from `dependencies` to `devDependencies` (it's the only `@types`
  in the wrong place).
- **Get dev-only code out of the production bundle**: `demo.ts` puts **61.6 KB into the client bundle of
  `/`** to serve a dev-only `?demo=` param — a `await import()` inside that branch fixes it with no
  behaviour change. `/probe` (477 lines) is an ungated production route dragging all of `demo.ts` + 110
  painters + `three` with it. Better still, move the fixtures to `qa/fixtures/*.json` loaded by `fetch`,
  which also removes 66 typecheck errors by construction.
- **Refresh docs**: `README.md` (14 subjects → 19; **15 scene kinds → 110**; "two repair rounds" → 3;
  the whole blueprint→critique→refine pipeline is undocumented; `filmstrip`/`edge-audit`/`edge-check` and
  `content-factory.mjs` are unmentioned; `/probe` and the entire QA subsystem are invisible).
  **Delete `NEW_ANIMATIONS.md`** — all 43 of its proposals shipped, and **17 kinds in its "Existing
  Animations" list never existed**. Mark `CLAUDE_PROMPT.md` N2 **resolved**. Fix 4 stale rows in
  `ANIMATION-QA-PROMPT.md` (painter count, the typecheck file list omits `demo.ts` which holds 66 of 99,
  `vocab` now has a demo, the probe map has 61 keys not 44).
- **Write `devstudio/CLAUDE.md`.** The root `CLAUDE.md` documents only the two `bharat-breifs-*` apps and
  **does not mention `devstudio` at all**, despite it being the largest subproject — while instructing
  readers to "follow ITS CLAUDE.md". Highest-value doc to add.
- **Split, in this order of value**: `src/app/page.tsx` (**1,597 lines, 57 `useState` calls, 3 tabs, two
  state machines** — the file a maintainer actually drowns in; `components/NewsView.tsx` already
  establishes the extraction pattern), then `schema.ts` (3,984 — but only *after* `LIMITS` is extracted,
  and the `qa/LEDGER.md` `group` column is a ready-made partition), then `demo.ts`. `globals.css` (1,288)
  is already sectioned and low value.
- `package.json` defines exactly `dev`, `build`, `start`, `typecheck`, `filmstrip`, `edge-audit`,
  **`edge-check`** (7, not 6). **No lint script, no test script, no ESLint config, no test files.**
  Adding lint is worth it; never invent `npm run lint` or `npm test` when verifying.

---

## 5. Per-subject playbooks (all 19)

**What already exists in code — extend it, don't contradict it.** All 19 subjects have a
`SUBJECT_PLAYBOOKS` entry (`prompt.ts:335-569`) and a `SUBJECT_KIT` (`:166-188`), but those are
*scene-kind casting sheets*, not channel strategy (the `english` entry is the sole exception, written as
real content strategy — use it as the template). `subjects.json` carries `audience` + `style` per subject.

**8 subjects have the full stack** — `ENHANCED_SUBJECTS` (`prompt.ts:920-929`) + `CHANNEL_ARCS`
(`:935-1013`) + module/submodule `style` + `exemplars` + a named `BENCHMARKS` entry (`rate.ts:28-37`):
coding, history, geography, english, polity, economy, environment, artculture.

**11 subjects have a casting sheet and nothing else** — no episode arc, no north-star exemplar, no lane
briefs, no named benchmark channel: math, science, finance, gk, psychology, business, health, philosophy,
lifeskills, mythology, mindset. This is the real gap. Taxonomy totals: **19 subjects / 93 modules / 373
submodules**; the 8 enriched subjects hold 41 of the 93 modules.

Each playbook in the doc gets: **benchmark channels · hook archetype · short shape · long shape ·
signature scene kinds · jargon rule · relatability anchor.** For the 11, also add a `CHANNEL_ARCS` entry
and a real `BENCHMARKS` string in code.

| Subject | Benchmark channels | Hook archetype | Signature kinds |
|---|---|---|---|
| coding | Fireship, ByteByteGo, NeetCode, 3Blue1Brown ✓ | the 3 AM outage / the interview filter | code→terminal, trace, lifeline, memgrid, callstack |
| history | OverSimplified, Kings and Generals ✓ | cold-open in the moment, dated and named | timeline, chain, tactical_map, storyboard, race |
| geography | RealLifeLore, Atlas Pro ✓ | the anomaly — the place that shouldn't exist | terrain, geomap, globe3d, cycle, zoomladder |
| english | English with Lucy, mmmEnglish ✓ | the moment the language fails or wins | vocab, dialogue, storyboard, compare |
| polity | **none named today** → propose Study IQ / Drishti IAS-grade + explainer clarity | the clash — the case where the provision got tested | statemachine, decision, parliament_arc, scroll |
| economy | Economics Explained ✓ + Indian explainers | open in the viewer's pocket (₹100 buys ₹94) | ledger, sankey, gauge, buckets, basket |
| environment | Veritasium-crossed ✓ | one real scene, one number moving the wrong way | cycle, terrain, gauge, pictogram, chain |
| artculture | **none named today** → propose museum-guide channels | one object described so vividly you see it | schematic, architecture_blueprint, canvas_reveal |
| math | 3Blue1Brown, Numberphile, Mathologer | the slow way, then the trick | formula, curves, numberline, geometry, probability |
| science | Veritasium, Kurzgesagt, Steve Mould | the everyday phenomenon nobody questions | bodymap, orbit, circuit, zoomladder, molecule |
| finance | Ben Felix, Two Cents + Indian personal-finance channels | the rupee number that stings | ledger, basket, buckets, curves, coin_stack |
| gk | Vsauce, Half as Interesting, RealLifeLore | the unbelievable fact, then the mechanism | race, pictogram, bracket, showdown, skyline |
| psychology | Veritasium (behavioural), SciShow Psych | make the viewer feel the bias before naming it | cycle, dialogue, probability, storyboard |
| business | Wendover Productions, Company Man, Think School | a company and a stunning number | ledger, sankey, race, pipeline, skyline |
| health | Institute of Human Anatomy, Kurzgesagt | the myth everyone repeats | bodymap, dayclock, buckets, curves |
| philosophy | Philosophy Tube, Wireless Philosophy | a modern concrete dilemma, not a definition | dialogue, showdown, storyboard, decision |
| lifeskills | Ali Abdaal, Matt D'Avella, Struthless | the failure mode first, with rep counts | steps, cycle, calendar, showdown |
| mythology | Overly Sarcastic Productions, Crash Course Mythology | drop into the scene mid-story | storyboard, chain, tree, constellation, cycle |
| mindset | Ali Abdaal, Improvement Pill, Struthless | the hyper-specific painful moment | cycle, showdown, storyboard, calendar |

✓ = already in `BENCHMARKS`. Unticked rows are **proposals from general knowledge, to be verified with
targeted research during Phase 5** rather than committed as researched fact — I web-researched the
coding/history/geography/science/retention clusters directly, not all 19.

---

## 6. Known issues this plan does NOT fix (record in the doc, don't silently drop)

- `enhanceVideoMeta` replaces `meta` *after* validation and is never re-validated; it also drops
  `freeOnly`, so one sub-call can bill a key during a free-only run (`videoMeta.ts:113-134, 117`).
- `refine/route.ts` and `regen-scene/route.ts` run **no soft gates** — a UI refine can push a shipped
  script out of word budget silently, and `regen-scene` can introduce adjacent bigtexts.
- `compare` item arrays are **voiceless**: up to 8 on-screen items with no narration beat
  (`schema.ts:2944-2952`).
- Learned directives declare they "**override generic guidance where they conflict**" with no cap
  (`prompt.ts:614-621`), so one bad directive outranks `NARRATION_RULES`.
- Soft gates are skipped entirely when a script is schema-invalid (they sit in the `else` at
  `generate/route.ts:133`), so a never-valid script never receives content feedback.
- `audit/RANKING.md` records the real production gap: **expected 918 / done 190 / failed 70 / missing 658.**
- **No MP4 deliverable.** Output is webm only (`save/route.ts:33`, `upload/route.ts:25` write it verbatim);
  YouTube accepts it, **Instagram, TikTok, X and WhatsApp do not**. `ffmpeg-static` is already a dependency
  and already used with a good H.264 recipe — but only in the unrelated news pipeline
  (`news/social/route.ts:66-76`). Reusing it for studio output is a small, high-value follow-up.
- **Rendering is real-time and single-threaded**: a 10-minute video takes 10 minutes with React mounted,
  and there is **no dropped-frame telemetry**, so a good render is indistinguishable from a bad one
  without watching it. The structural fix `README.md` already names — offline frame-by-frame encode via
  WebCodecs — would also unlock 4K, 60 fps and supersampling. Out of scope here, worth scheduling.
- **The 2D and 3D layers are lit from opposite sides** (`common.ts:61,70` vs `three3d.ts:174`). Fixing it
  is a judgement call about which direction wins across ~110 painters, so it needs a decision, not a patch.
- **The ship gate and the automated audit disagree**: `steps` and `quiz` are `passed` in `qa/LEDGER.md`
  yet still bleed off-frame in `qa/AUDIT.md`. Reconcile the two before trusting either as a gate.

---

## 7. Progress tracking — so a fresh session never restarts from zero

The owner's explicit requirement. This repo already proves both the need and the pattern: `qa/LEDGER.md`
opens with *"Source of truth for polish progress across all 110 registered painters — **not** the
conversation, which gets summarised and lost."* It works. It also shows the two ways it fails: **8 rows
read `commit: (uncommitted)`**, and one row records *174 lines of work destroyed by an unguarded git
checkout*. Both are addressed by Phase 0 plus a "commit in the same change as the row" rule.

**Files** (all committed, all in `devstudio/`):

| File | Role |
|---|---|
| `improvement_plan.md` | This document. The **why** and the spec. Changes rarely. |
| `PROGRESS.md` | Human-readable status board: one row per work item, newest state visible at a glance. |
| `progress.json` | Machine-readable mirror, so scripts and a fresh agent can query state without parsing prose. |
| `qa/LEDGER.md` + `qa/ledger.json` | **Unchanged** — keeps owning per-painter animation polish. `PROGRESS.md` links to it rather than duplicating 110 rows. |

**Row schema** — one row per independently shippable item, keyed `<phase>.<n>`:

`id · phase · workstream · title · state · evidence · verified_by · commit · date · notes`

- **`state`**: `todo` → `in-progress` → `done` → `verified`. Plus `blocked` (must carry the reason) and
  `wont-do` (must carry why). **`done` means the code is committed; `verified` means the measurable check
  in the Definition of Done passed.** Nothing counts as finished at `done`.
- **`evidence`**: the command and its result — `pacing-audit: static 34% → 7%`, not "improved".
- **`commit`**: required to enter `done`. This is the rule that prevents the `(uncommitted)` failure.

**Filled-in examples** (illustrating each state):

```
| id  | phase | workstream | title                          | state       | evidence                              | commit  |
|-----|-------|------------|--------------------------------|-------------|---------------------------------------|---------|
| 0.1 | 0     | hygiene    | Commit 102 untracked src files | verified    | git ls-files src \| wc -l → 158        | a1b2c3d |
| 1.1 | 1     | content    | Menu regex [a-z]+ → [a-z0-9_]+ | verified    | KIND_LINE.size 75 → 110               | e4f5g6h |
| 1.2 | 1     | animation  | radar.ts:291 `cy` undefined    | done        | renders; filmstrip captured           | i7j8k9l |
| 1.5 | 1     | animation  | tree.ts 3D layer frozen at f0  | in-progress | —                                     | —       |
| 2.1 | 2     | render     | Load Plus Jakarta before render| todo        | —                                     | —       |
|12.1 | 12    | narration  | edge-tts capability spike      | todo        | needs: pitch/volume? word timings?    | —       |
|10.4 | 10    | render     | Re-enable outro for end screens| blocked     | needs a brand mark first              | —       |
```

**The resume protocol** — three lines at the top of `PROGRESS.md`, so a session with zero context knows
exactly what to do: *read this file → the next item is the lowest-numbered `todo` whose dependencies are
`verified` → its spec is in `improvement_plan.md` under that phase.*

**Rules that keep it honest:** update the row in the **same commit** as the work; never mark `verified`
without pasting the measured evidence; a `blocked` row must name what would unblock it; if a phase's spec
turns out wrong, amend `improvement_plan.md` in that commit too, so the two never drift.

## 7b. Definition of done, per workstream

| Workstream | Done when |
|---|---|
| Content/structure | `pacing-audit` on fresh output: static-card audio < 10%, no beat > 12 s, ≤ 2 `bigtext` per long, 4-8 s per visual change, zero definition openers, zero crutch hits |
| Narration | Capability spike answered in writing; per-beat pitch/rate variation live; Indian lexicon covers every proper noun in a generated video; Hindi path no longer early-returns |
| Animation | Toolkit shipped and adopted by the top-25 kinds; `edge-audit` at 0 bleeds; all 27 unreviewed 3D painters swept; every touched kind scored in `qa/LEDGER.md` |
| Pipeline/loop | The factory converges — a slot reaches `pass` in ≤ 3 attempts instead of exhausting 6 at `below-bar` |
| Engine/render | Fonts load before measurement; captions on by default; no frozen transition frame; end screen possible; 1080p verified with no dropped frames |
| Hygiene | `npx tsc --noEmit` → 0; `npm run build` clean; cruft gone; `.gitignore` prevents return |

## 8. Milestone 1 — one genuinely good video

Rather than finishing every workstream before anything is watchable, the first target is **one subject,
one short and one long, end to end, good enough to publish.** Suggested subject: `coding/frontend/
javascript`, because there is already a same-topic baseline generated with the current code to compare
against directly.

Minimum set to get there: Phase 0 (git safety) → Phase 1 (regex + crashes) → Phase 2 (font, captions,
transition freeze) → Phase 3 (instrument) → Phase 4 (mechanical gates incl. jargon) → Phase 5 (structure)
→ Phase 15 (estimate↔actual, so the numbers mean something) → **Phase 17 (write the two gold exemplars
for this archetype and wire them in)** → Phase 12a-b (voice spike + per-beat delivery + pausing) →
generate → **watch it** → tune the bar → only then roll to the other 18 subjects.

Phase 17 is in the minimum set deliberately. Everything else in that list makes the video *structurally*
correct — right pacing, no frozen cards, no definition openers. **None of it makes the writing good.**
The exemplar is the only item that addresses voice, and voice is what "feels like reading a book" is
actually about.

The point of stopping to watch is that several assumptions in this plan are unproven — most of all that
fixing pacing and definitions is *sufficient* to make the writing feel human. If it isn't, that is far
cheaper to discover on one video than on nineteen subjects' worth.

## 9. Verification

Typecheck baseline is **99** (`qa/ledger.json` → `typecheckBaseline`, confirmed via `npx tsc --noEmit`).

**Content (Phases 3-6)**
1. `npm run typecheck` → no rise; touched files clean.
2. `node scripts/pacing-audit.mjs` on the existing corpus → record the before numbers (34% static audio,
   41% static scenes in longs, 15.7 s/card).
3. Generate with `freeOnly: true`, dev server on 4321: a long for `coding/frontend/javascript` (direct
   comparison against today's baseline), a long for `history` or `geography`, and shorts for one enhanced
   plus one non-enhanced subject.
4. Re-run pacing-audit. Targets: static-card audio **< 10%**, no beat > 12 s, `bigtext` ≤ 2 per long,
   seconds-per-visual-change **4-8 s**, zero definition openers, zero crutch hits, ≥ 8 distinct kinds per
   long, running-example coverage > 0.8.
5. Read the new long's narration end to end as a viewer would hear it — the "reading a book" test is the
   one thing no metric settles.

**Animation & look (Phases 9-10)**
6. `node scripts/edge-audit.mjs` → the 7 bleeding pairs drop to 0, nothing new bleeds.
7. `npm run filmstrip -- --kind=<kind>` per upgraded kind, both aspects, plus `--entrance` for the first
   500 ms. Score against the extended rubric and **record every row in `qa/LEDGER.md`** — that ledger
   exists precisely because this context gets summarised and lost.
8. Sweep all **27 unreviewed 3D painters** before trusting any of them.
9. Render one full long and one short, then watch them: resolution, no dropped frames, audio still in
   sync at the end of a 7-minute render (drift shows up late, not early).

**Hygiene (Phases 0, 8)**
10. `npx tsc --noEmit` → **0**, `qa/ledger.json` baseline updated to match.
11. `npm run build` succeeds — cleanup must not remove what the bundle needs (`demo.ts`, `/probe`).
12. `git status` clean of deleted cruft; `.gitignore` prevents its return.

**Sequencing — execute in numeric order:**

| # | Phase | Why here |
|---|---|---|
| **0** | Commit `src/` | 102 untracked files; nothing else is safe until this lands |
| **1** | Crashes + the menu regex | 4 kinds render nothing; the regex changes Phase 9's scope by a third |
| **2** | Broken-now defects | font loading, captions-off, karaoke, transition freeze, end screen |
| **3** | Instrument (`pacing.ts`, audit script) | nothing after this is measurable |
| **4** | Mechanical content gates | the PowerPoint fix the model cannot ignore |
| **5** | Structural prompt change | removes the mandated static cards |
| **6** | Judge sees pacing | so the loop can converge |
| **7** | Render-layer correctness | beat desync, progressive card reveal |
| **8** | Repo hygiene + typecheck → 0 | **before** painters are touched, so 110 files are edited against a clean signal rather than 99 errors of noise |
| **15** | Estimate↔actual reconciliation | **before trusting any pacing number**; closes the content↔narration seam |
| **17** | Gold exemplars | cheap, highest-leverage content fix; plumbing already exists, unused |
| **9** | Animation craft | central vocabulary, then traffic tiers |
| **10** | Whole-video look | typography, transitions, encode |
| **12** | Narration & voice | starts with a capability spike; can run parallel to 9-10 |
| **16** | Post-render measurement | once there is something worth measuring |
| **13** | Craft templates + per-submodule `creatorBrief` | **research first** — the dedicated pass failed and must be redone |
| **14** | New scene kinds | last: needs the toolkit (9) and the regex (1) to be worth doing |
| **18** | Thumbnail / title / CTR | fully parallel — touches no shared code, can start any time |
| **11** | Rewrite `CLAUDE_PROMPT.md` | genuinely last, so it records what shipped, not what was intended |

**Milestone 1** (§8) cuts across this: Phases 0-5 plus 12a-b produce one watchable video before the rest
is built. Phases 0-6 alone fix the owner's three stated complaints. Phases 7-14 are what turns "no longer
a PowerPoint" into "looks like a channel".

**Phase 12 can run in parallel** with 9-10 — narration and painters touch different files. Phase 13's
research is the only item with no code dependency at all, so it can start immediately.

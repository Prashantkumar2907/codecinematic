# devstudio

The repo root `CLAUDE.md` covers the two `bharat-breifs-*` news apps. This is the third
subproject and it shares nothing with them but the monorepo folder: **a local, single-user
AI teaching-video studio.** Next.js 15 App Router, no database, no auth, state on disk under
`content/`. It is not deployed — several routes execute generated code and spawn Python, so
never expose it beyond localhost.

Read `README.md` for what the product does. This file is what you need to not break it.

## Commands — these and no others

```bash
npm run dev          # next dev on port 4321 (PORT overrides)
npm run build
npm run start
npm run typecheck    # tsc --noEmit
npm run filmstrip    # scripts/filmstrip.mjs  — needs the dev server
npm run edge-audit   # scripts/edge-audit.mjs — needs the dev server
npm run edge-check   # scripts/edge-check.mjs — needs the dev server
```

That is the whole of `scripts` in `package.json`. **There is no lint script, no test script, no
ESLint config and no test files.** Never invent `npm run lint` or `npm test` when verifying.

**`npm run typecheck` must stay clean.** It passes as of 2026-07-31. It was red for a long stretch
(71 errors, 66 of them in `src/studio/demo.ts` from fixtures written before `meta` became required),
which is why older docs and `qa/ledger.json` → `typecheckBaseline: 99` still phrase the rule as
"never raise the count". Ignore that framing in favour of a live run: any error is now yours.

Two runtime dependencies are not npm packages and cannot be stubbed: **`.venv/`** with `edge-tts`
(TTS, `api/studio/tts/route.ts:23`) and a Python + headless-Chromium chain for the News renderer.
`.venv/` is large and looks like cruft. It is live. Do not delete it.

## The pipeline

```
subjects.json → /topics → /generate → /exec → /tts → engine.ts (canvas + MediaRecorder) → /save → /upload
```

`/api/studio/generate` (`src/app/api/studio/generate/route.ts`) is the interesting one. It streams
NDJSON stage events and has two paths:

- The 8 subjects in `ENHANCED_SUBJECTS` (`src/lib/prompt.ts:949`) run the creator pipeline:
  **blueprint → script → critique → refine**. Blueprint and critique are *best-effort* — a failure
  falls through to the plain prompt or ships the un-refined draft rather than throwing (`:100-145`).
- Everything else is one-shot `writing`.

Then the gate loop (`:150-251`): zod schema, plus soft gates for word budget, adjacent bigtext
cards, formulaic hooks, vocab examples, short-scene density, and the seven pacing/voice gates in
`PACING_GATES` (`:18-26`). Failures drive up to **`REPAIR_ROUNDS = 3`** (`:50`). Soft gates never
hard-fail: after the last round a schema-valid script ships with `warnings[]`, because a complete
video beats no video. Only a still-invalid script errors.

State ownership is strict and worth preserving: `src/lib/state.ts` is the **only** writer of
history/subjects and the only path that deletes drafts; `/api/studio/save` is the **only** writer
of `content/videos/`.

## The three layers, and where the boundaries are

| Layer | File | Owns |
|---|---|---|
| schema | `src/studio/schema.ts` (4,045 lines) | the `Scene` union, `sceneScriptSchema`, `sceneBeats()`, `NARRATION_BUDGET`, `ASPECTS` |
| painters | `src/studio/painters/*` (110 modules) | drawing one scene at one progress `p` into a 2D context |
| engine | `src/studio/engine.ts` | timings from measured audio, transitions, captions, WebAudio, MediaRecorder |

The rules that keep them apart:

- **A painter is a pure function of `(ctx, scene, env)`.** It never reads the clock, never reads
  the DOM, never mutates the scene. Same inputs must give the same pixels — the QA harness and
  re-renders both depend on it. `Math.random()` in a painter is a bug.
- **`PaintEnv`** (`painters/index.ts:117-129`) is the only channel in: `layout`, `p`, `elapsedMs`,
  `durationMs`, `beats`, `sceneIndex`, `sceneCount`, `palette`.
- **All colour comes from `env.palette`.** No new hardcoded hex in a painter. Subject accents come
  from `paletteForSubject` (`painters/common.ts:139`).
- **All geometry derives from `env.layout`**, whose `unit = min(w,h)/24` (`common.ts:170`) exists so
  a painter written once works at both 1080×1920 and 1920×1080. Absolute px sizes break one aspect.
- **Adding a scene kind touches exactly three places**: the union in `schema.ts`, a module in
  `painters/`, and the `painters` record in `painters/index.ts:133-244`. That record is re-exported
  as `ALL_SCENE_KINDS` (`index.ts:247`) so QA tooling enumerates the real registry and cannot drift.
- Before writing a helper, read `painters/common.ts` — `enterT`, `easeOutCubic`, `clamp01`,
  `roundRect`, `rgba`, `wrapText`, `fitFontSize`, `activeBeatIndex`, `beatT`, `drawSceneTitle`,
  `drawBackground` are all already there. Re-implementing easing locally is the most common
  duplication in this tree.

## Two invariants that were learned the hard way

**1. A painter must leave the canvas state balanced.** Canvas 2D state persists across frames, so
one painter that `return`s between a `ctx.save()` and its `restore()` poisons every *later* frame of
the video. `paintBigtext` did exactly this: two of its five variants returned without restoring a
`translate()` whose offset tracked `sin(elapsedMs/1500)`, so each frame stacked another translate
and the offset *integrated* — the measured transform went −6.6 → −46 → −118 → −333 → −592 px on a
1080-tall frame within seconds, and the rest of the video rendered almost nothing. `bigtext` is the
most-used kind and opens most videos, so this walked roughly **40% of all output** off-screen, for
89 videos, undetected.

Two fixes landed, and you need to know about the second: the missing `restore()`, and
`resetContext()` at the top of the engine's `paintAt` (`engine.ts:382`, called at `:693`), which
clears the saved-state stack before every scene so one unbalanced painter can no longer poison the
rest. **Do not read that safety net as permission to be unbalanced** — `/probe` renders each scene
into a fresh context, so it is structurally blind to this bug class, and the net is the only thing
standing between an unbalanced painter and a ruined video.

**2. `render3D`'s `build()` closure freezes at frame 0.** `render3D` (`painters/three3d.ts:81`)
caches the three.js bundle per `key`, so `build()` runs **once** and its `update()` closure captures
whatever objects existed on that first frame. Anything `update()` reads from an enclosing
scope — `env.p`, `env.beats`, `enterT(env, …)`, or a painter-local array or counter — is frozen
there forever. This silently killed the entire 3D layer of 29 painters, and in `dialogue` and `quiz`
it dropped every message and option from frame 1 onward because a per-paint array was filled inside
the closure while the live array stayed empty.

**Per-frame values must arrive through `render3D`'s `context` argument** (typed `T`, passed to
`update(elapsedMs, context)`), never through closure capture. The `liveEnv` parameter
(`three3d.ts:95`) refreshes the captured `env` object in place as a mitigation, but state you own
must travel through `context`. Note also that `resetThree3D()` exists because geometry is built from
the first rect a key ever saw — rendering 9:16 then 16:9 in one page reuses the wrong build.

## Pacing numbers live in exactly one file

`src/studio/pacing.ts` is the single source. The soft gates in the generate route, the rating rubric
in `src/lib/rate.ts` and `scripts/pacing-audit.mjs` all read their thresholds from it, so they
cannot quietly disagree about what "a 12-second beat" means. Add a threshold there, not at a call
site.

Its imports look wrong and are not: `import { sceneBeats } from "./schema.ts"` carries an **explicit
`.ts` extension** because `scripts/pacing-audit.mjs` and `scripts/drift-check.mjs` import the
TypeScript module *directly* and rely on Node 22 stripping the types on the fly. Consequences:

- Keep the `.ts` extensions on relative imports in that module.
- **Nothing in `pacing.ts` may import the engine or a painter** — those pull in canvas and three.js
  and will not load outside a browser.

Its numbers are estimates derived from word counts, not measurements. `SPOKEN_WORDS_PER_SEC = 2.06`
was calibrated against real synthesised audio (an earlier 2.6 ran 26% short, making every threshold
that much too lenient). Real scene duration comes from measured audio in `computeTimings`
(`engine.ts:69`) and nothing in `pacing.ts` can see it. Re-measure with
`node scripts/drift-check.mjs <script.json> [voice]`; Hindi is uncalibrated.

## Animation QA

110 painters is more than anyone can eyeball. The subsystem:

- **`qa/LEDGER.md` is the source of truth for polish progress — not the conversation**, which gets
  summarised and lost. One row per kind with per-section scores; update the row in the same commit
  that polishes the kind. Rows reading `(uncommitted)` are the known failure mode of this process.
- **`/probe`** (`src/app/probe/page.tsx`) renders one scene at one fixed `p`, deterministically, no
  TTS and no recorder. It builds `KIND_INDEX` over every `DEMO_*` fixture in `src/studio/demo.ts`
  and picks the *richest* scene per kind — a two-item demo hides layout bugs a six-item demo
  exposes — so all 110 kinds are reachable by name. Window hooks `__PROBE_RENDER`,
  `__PROBE_FILMSTRIP` and `__PROBE_EDGEBLEED` (`probe/page.tsx:271-380`) let one browser launch
  drive the whole registry.
- **`npm run filmstrip -- --kind=<kind>`** writes a contact sheet plus full-res p50/p90 frames and
  `console.log` to `qa/<kind>/`. Pop-in, easing and dead time are *temporal* — a single frame cannot
  show them. Motion scoring specifically needs `--entrance`, which samples the first 500 ms at
  ~33 ms/cell (one real frame at 30 fps); a plain `p=0..1` strip has up to 2.7 s between cells and
  will step straight over a 380 ms `enterT()` entrance.
- **`npm run edge-audit`** measures containment across every kind by diffing a 3px border ring
  against the bare background, and writes `qa/AUDIT.md` worst-first. `edge-check -- --kind=<kind>`
  is the same measurement for one kind and writes nothing, so parallel agents cannot collide.
- The rubric and ship gate are `ANIMATION-QA-PROMPT.md` Part C.

**A filmstrip that times out is almost always a wedged dev server, not a stuck painter.** Restart
`npm run dev` before debugging the painter — a stale `.next` cache produced exactly this symptom and
cost a full investigation (`PROGRESS.md` row 7.3). Capture artifacts (`qa/**/*.png`) are gitignored
and regenerable; the ledger is not.

Two known blind spots: `/probe` synthesises evenly-spaced beat windows while the engine derives them
from real audio durations, so do not tune beat timing to the millisecond against it; and the probe
always uses background motif 0 while the engine varies it, so check colour fixes against more than
one motif.

## Working here

- `improvement_plan.md` is the spec and the **why**; `PROGRESS.md` is the status board. Both are
  owned by whoever is driving the plan — do not edit them as a side effect of other work.
- The repo root carries a lot of one-off cruft (`rewrite_*.js` codemods that already ran and mutated
  `src/`, `screenshot_*.png`, `bigtext.txt`). Treat it as dead unless proven otherwise, and never
  re-run a `rewrite_*.js`.
- This tree holds large amounts of uncommitted work. Read `git diff --stat` before any
  `git checkout`, `restore` or `clean` — `qa/LEDGER.md` records 174 lines of polish destroyed by an
  unguarded checkout.
- One polish per commit (`polish(<kind>): <what changed>`), so a bad one is revertible without
  unpicking others.

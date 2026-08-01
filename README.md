# DevStudio

Personal AI teaching-video studio: pick Subject → Module → Sub-module, let
Gemini suggest 10 unmade topics, generate a scene-scripted, narrated,
output-verified YouTube video (Short 9:16 or Long 16:9), review it in the
Library (copy metadata, download webm/thumbnail), and upload on approval.
19 subjects ship: Coding, History, Geography, Math & Aptitude, Science,
Money & Finance, English & Communication, GK & Amazing Facts, Psychology &
the Mind, Business & Startups, Health & Body, Philosophy & Big Ideas, Life
Skills & Productivity, Mythology & Epics, Polity & Governance, Mindset &
Self-Growth, Economy, Environment & Ecology, and Art & Culture — edit
`content/subjects.json`
to add more (give new subjects a palette in `src/studio/painters/common.ts`
and a playbook in `src/lib/prompt.ts`). Any module or sub-module may also
carry an optional `"style"` string in subjects.json — it is injected into the
topics and script prompts as a brief for exactly that slice of the taxonomy.
Scripts follow a dual-track teaching method: one concrete example runs
through the whole video, and every technical term is anchored in plain words
in the same breath, so newcomers follow while practitioners still learn.

## Run

```bash
npm install          # also pulls ffmpeg-static (used by the News tab renderer)
python3 -m venv .venv && .venv/bin/pip install edge-tts
# News tab only — renders branded news Shorts with headless Chromium:
.venv/bin/pip install playwright && .venv/bin/playwright install chromium
npm run dev          # http://localhost:4321
npm run typecheck    # the ONLY check that exists — there is no lint and no test script
node scripts/spike.mjs                                              # demo Short smoke test (dev server must be running)
node scripts/spike.mjs out "gen=1&subject=coding&module=frontend&sub=javascript&format=long&auto=1" 1200   # full-real long run via Gemini
```

`npm run typecheck` is **clean** as of 2026-07-31 and is expected to stay that
way. It was red for a long stretch — 71 errors, 66 of them in `src/studio/demo.ts`
from fixtures predating the required `meta` field — so older notes (and
`qa/ledger.json` → `typecheckBaseline: 99`) still describe a "never raise the
count" rule. That is obsolete: run it and expect zero.

`.env.local` (gitignored) needs: `GEMINI_API_KEY`, `YT_CLIENT_ID`,
`YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`, `NEXT_PUBLIC_BRAND`, `VOICE`. For the
**News tab**, one OAuth triple per channel named in `content/channels.json`
(shipping defaults: `EN_YT_CLIENT_ID/…SECRET/…REFRESH_TOKEN` and `HI_YT_*`).
Optional: `GEMINI_MODELS` / `GEMINI_MODELS_FAST` (comma-separated fallback
chains) or legacy `GEMINI_MODEL` (pins the first quality model);
`GEMINI_MAX_OUTPUT_TOKENS` (default 12288); `GEMINI_THINKING_BUDGET` (unset =
model default; set `0` to disable thinking for the fastest generation — the
2.5/3.x flash models are *thinking* models and spend minutes reasoning per
script otherwise).

> **Free-tier keys are rate-limited to roughly one request per minute** and
> ~20/day for the flagship flash models. A full run makes 2–5 calls (topics +
> generate + up to three repairs), and an `ENHANCED_SUBJECTS` run adds up to
> three more (blueprint + critique + refine), so on a free key generation waits between
> per-minute windows (the client now backs off and retries for up to 2 minutes
> rather than failing instantly). For smooth use, put a **paid / higher-quota
> `GEMINI_API_KEY`** here, or set `GEMINI_THINKING_BUDGET=0` to cut per-call time.

## How it works

1. **Pick & Generate** — `content/subjects.json` defines the taxonomy
   (subject → module → sub-module, each subject with its own audience + style
   fed into prompts). `/api/studio/topics` asks Gemini for the best unmade
   topics (5–12, excluding `content/history.json` for that sub-module);
   `/api/studio/generate` turns the chosen topic into a `SceneScript`
   (strict zod schema in `src/studio/schema.ts` — **110 scene kinds**, one
   painter each, registered in `src/studio/painters/index.ts`; that registry is
   re-exported as `ALL_SCENE_KINDS` so tooling cannot drift from it). Each
   subject carries its own accent **palette** (`paletteForSubject` in
   `src/studio/painters/common.ts`) and a prompt **playbook**
   (`SUBJECT_PLAYBOOKS` in `src/lib/prompt.ts`) steering which kinds it
   favours — so History reads as an amber timeline, English as violet vocab
   cards, Finance as green charts, etc. Videos also vary deterministically by
   script: 4 background motifs, 4 scene-transition styles, 3 bigtext entrance
   styles, 3 bullet marker styles and 3 thumbnail layouts are all seeded from
   scene/topic ids (same script → identical re-render). Non-coding subjects
   use lang-"text" code panels for worked examples instead of executable code.
   NOTE: free-tier gemini-2.5-flash allows only ~20 requests/day (resets
   midnight PT) — switch `GEMINI_MODEL` or enable billing for real volume.
   Requests are counted in `content/quota.json` and shown as a meter in the
   masthead.

   **Two generation paths.** The 8 subjects in `ENHANCED_SUBJECTS`
   (`src/lib/prompt.ts:949` — coding, history, geography, polity, economy,
   environment, artculture, english) run the full **creator pipeline**:

   ```
   planning  → blueprint    (fast model designs the episode arc)
   writing   → script       (quality model writes it, from the blueprint)
   reviewing → critique     (fast model returns {verdict, issues[]})
   refining  → revise       (quality model applies the critique) — only if verdict == "revise"
   ```

   Every other subject goes straight to `writing` in one shot. The blueprint
   and critique stages are **best-effort**: if either call fails, generation
   falls through to the plain prompt / ships the un-refined draft rather than
   dying (`generate/route.ts:100-145`). Both sub-calls honour `freeOnly` so an
   automated run never bills a key on planning or review.

   **Then the gate loop.** Display-only strings are clamped deterministically
   (`src/lib/sanitize.ts`) before validation. A script must pass the zod schema
   *and* a set of soft quality gates — word budget, no adjacent bigtext section
   cards, no card after the ending question, no formulaic hook, vocab examples
   that actually use their word, plus the seven pacing/voice gates imported
   from `src/studio/pacing.ts` (`PACING_GATES`, `generate/route.ts:18-26`).
   Failures drive up to **3 repair rounds** (`REPAIR_ROUNDS`,
   `generate/route.ts:50`). Soft gates never hard-fail: after the last round a
   schema-valid script ships with honest `warnings[]`, because a complete video
   beats no video. Only a still-schema-invalid script errors out.
   `/api/studio/generate` streams NDJSON stage events — `planning` →
   `writing` → `reviewing` → `refining` → `validating` → `repairing` →
   `optimizing` → `done` — so the 30–180s wait shows honest progress in the UI.
2. **Verify** — every runnable code scene (js/ts, python, sql) is executed via
   `/api/studio/exec`; wrong `expectedOutput` and stale terminal scenes are
   patched with the real stdout (badges: verified / patched / failed).
3. **Render** — narration is per-BEAT: every bullet item, diagram step, compare
   side, and code segment carries its own `say` line (see `sceneBeats()` in
   `src/studio/schema.ts`). `/api/studio/tts` (edge-tts in `.venv`) voices each
   beat separately (requested in chunks so the UI can show a true voiced/total
   count); a beat's visual step fires exactly when its audio starts, so
   voice and visuals stay in lockstep. `src/studio/engine.ts` plays the scenes
   on a canvas in real time (crossfades, progress bar, drifting background,
   focus dimming on the current element), schedules beat audio into the
   recording via WebAudio, and records with MediaRecorder (vp9 webm, 12 Mbps).
4. **Library & upload** — saving writes the draft (webm + script + generated
   thumbnail; long videos also get YouTube chapters from real render timings)
   to `content/videos/<slug>/` and records it in `content/history.json`
   (v2 format: entries grouped subject → module → sub-module so per-submodule
   history is a direct lookup; legacy flat arrays are auto-converted on read;
   status: draft). The Library tab lists drafts (`/api/studio/drafts`),
   streams files with Range support (`/api/studio/file`), and offers copy
   (title/description+hashtags/tags), downloads (.webm — YouTube-supported —
   and .png), upload (marks history uploaded + videoId; sets the thumbnail on
   long videos, needs a phone-verified channel), and delete (files removed,
   history entry kept so the topic is never re-suggested).

State ownership: `src/lib/state.ts` is the only writer of history/subjects
files and draft deletion; `/api/studio/save` is the only writer of
`content/videos/`.

Post-generation routes the Create tab also uses: `/api/studio/rate` (LLM rubric
score, with the pacing facts computed rather than guessed — `src/lib/rate.ts`),
`/api/studio/refine` (apply critique to a whole script), `/api/studio/regen-scene`
(re-roll one scene) and `/api/studio/tune` (persist learned directives).

## Animation QA

111 painters is more surface than a human can eyeball, so the visual quality of
the scene kinds has its own subsystem. **`qa/LEDGER.md` is the source of truth
for polish progress — not the conversation**, which gets summarised and lost;
update a kind's row in the same commit that polishes it.

`/probe` (`src/app/probe/page.tsx`) renders **one scene at one fixed progress**,
deterministically, with no TTS and no recorder. It builds a `KIND_INDEX` over
every `DEMO_*` fixture in `src/studio/demo.ts` and picks the *richest* scene per
kind (a two-item demo hides layout bugs a six-item demo exposes), so all 110
kinds are reachable by name. It also exposes window hooks that the scripts drive
— `__PROBE_RENDER`, `__PROBE_FILMSTRIP`, `__PROBE_EDGEBLEED` — which is why one
browser launch can capture the whole registry.

```bash
npm run filmstrip -- --kind=chart          # contact sheet + p50/p90 detail frames -> qa/chart/
npm run filmstrip -- --kind=chart --entrance   # first 500ms at ~33ms/cell (motion scoring needs this)
npm run filmstrip -- --all                 # all 110 kinds, both aspects, one browser
npm run edge-audit                         # containment across every kind -> qa/AUDIT.md, worst-first
npm run edge-check -- --kind=chart         # same measurement, one kind, writes nothing
```

All three need the dev server running. **A filmstrip that times out is almost
always a wedged dev server, not a stuck painter** — restart `npm run dev` before
you start debugging the painter (`PROGRESS.md` row 7.3). Capture output under
`qa/**/*.png` is gitignored and regenerable; the ledger is not.

Why a filmstrip and not a screenshot: pop-in, easing, dead time and "does it
settle" are *temporal* properties that a single frame physically cannot show.
The scoring rubric and the ship gate live in `ANIMATION-QA-PROMPT.md` Part C.

## Content & pacing tooling

```bash
node scripts/content-factory.mjs --subject coding --formats short,long   # generate -> rate -> refine loop
node scripts/pacing-audit.mjs                    # every generated script -> qa/PACING.md, worst-first
node scripts/drift-check.mjs <script.json> [voice]   # estimated vs MEASURED beat timing
```

`content-factory.mjs` walks curriculum submodules and runs generate → rate →
refine until a script clears the bar; it saves scripts and ratings under
`content/factory/` and renders nothing. It is resumable — a submodule+format
with a saved pass is skipped unless `--force`.

**`src/studio/pacing.ts` is the single source for every pacing number.** The
soft gates in the generate route, the rating rubric in `src/lib/rate.ts` and
`scripts/pacing-audit.mjs` all read their thresholds from it, so they cannot
quietly disagree about what "a 12-second beat" means. Surprising detail: the
`.mjs` scripts **import that TypeScript module directly** —
`import { pacingReport } from "../src/studio/pacing.ts"` — relying on Node 22's
on-the-fly type stripping. That is why its own relative imports carry explicit
`.ts` extensions, and why nothing in that module may import the engine or a
painter: those pull in canvas and three.js and would not load outside a browser.

The numbers there are **estimates from word counts**, not measurements.
`SPOKEN_WORDS_PER_SEC = 2.06` was calibrated by voicing a real 85-beat script
and timing every clip; re-measure with `drift-check.mjs`, and note Hindi is
uncalibrated.

## News tab (channel posting)

A third tab reproduces the tldr-social daily GitHub Action inside the app: pick
a **channel** → a **category** → generate a **3-story branded Short** (intro +
3 news stories + outro) and upload it to that channel. It reuses the *exact*
tldr-social renderer (`scripts/news/render_short.py`: fetches
`bharat-briefs.vercel.app/api/v1/feed`, renders 1080×1920 slides with headless
Chromium, voices with edge-tts, assembles with ffmpeg-static) so the output is
pixel-identical to the current channel uploads.

- **Channels are config, not code** — `content/channels.json` lists channels;
  each names its own `EN_YT_*` / `HI_YT_*` OAuth triple, language, voice and
  default categories. Add a channel = add an entry + its three secrets. The
  channel is selected purely by which refresh token is used, exactly like the
  Action.
- **Teaching channels route by subject**: entries with `"type": "teaching"`
  carry a `subjects` list (labels); Create/Library uploads publish each video
  to the channel owning its subject (Coding → DebHarbour, curiosity subjects →
  LoreHarbour, self-growth subjects → GrowHarbour; unmapped subjects fall back
  to the `YT_*` env triple). The UI shows "→ channel" next to Upload. Mint a
  new channel's refresh token with `node scripts/news/get_yt_token.mjs <id>`.
- Routes: `news/config` (channels+categories), `news/render` (runs the Python
  renderer into `content/news/<slug>/`), `news/upload` (per-channel upload),
  `news/drafts` (list + delete), `news/file` (Range-streamed mp4 preview).
  `src/lib/news.ts` owns channel resolution and news-draft state.
- After each render, Gemini rewrites the title/description/tags for CTR and
  search (headline-led title ending in #Shorts, keyword hook line, entity
  tags; Hindi metadata for the Hindi channel) — `src/lib/newsMeta.ts`; if the
  call fails the renderer's template metadata is kept (`metaSource` on the
  draft says which you got). The YouTube category is mapped from the news
  category (Sports→17, Technology→28, Entertainment/Horoscope→24, else 25).

## Publishing & scheduling

Upload defaults to **public**; both the teaching upload (`/api/studio/upload`)
and news upload accept an optional **`publishAt`** (RFC3339). When set, the
video is uploaded *private* and YouTube auto-publishes it at that time (its
scheduling requires private + a channel API in good standing). The Create/News
UIs expose a privacy select + a "Schedule at" datetime picker.

## Notes

- Rendering is real time: a 60s Short takes ~60s to record. Long-form (8-12 min)
  works the same way but has NOT yet been spike-tested for dropped frames —
  run a long demo before trusting it (see ADR in the repo conversation:
  if frame drops or AV drift appear on long captures, move long-form to
  frame-by-frame rendering, keep Shorts as-is).
- Generated code runs locally under a 10s timeout with stdlib only — review
  scenes before rendering; never expose these routes beyond localhost.
- **Music bed**: no track ships. Drop any track you like (e.g. from the
  YouTube Audio Library, which is free for monetized videos) at
  `public/music.mp3` and it is mixed under the narration at low volume with
  fade in/out, in playback and the recording. No file = narration-only.
- **Pacing**: scripts carry a word budget (short 110-240, long 850-1900 words —
  `NARRATION_BUDGET` in `src/studio/schema.ts:3491`), shorts are voiced at +5%
  rate and use tighter beat/scene gaps.
- `?demo=1&auto=1` URL params: load the hardcoded demo script and auto
  render+save (used by `scripts/spike.mjs`).
- **Shorts safe area**: the YouTube UI covers the bottom ~25% and right ~15% of
  a 9:16 frame. Nothing load-bearing may land there; painters are scored on it
  (`ANIMATION-QA-PROMPT.md` Part C §1).

# DevStudio

Personal AI teaching-video studio: pick Subject → Module → Sub-module, let
Gemini suggest 10 unmade topics, generate a scene-scripted, narrated,
output-verified YouTube video (Short 9:16 or Long 16:9), review it in the
Library (copy metadata, download webm/thumbnail), and upload on approval.
14 subjects ship: Coding, History, Geography, Math & Aptitude, Science,
Money & Finance, English & Communication, GK & Amazing Facts, Psychology &
the Mind, Business & Startups, Health & Body, Philosophy & Big Ideas, Life
Skills & Productivity, and Mythology & Epics — edit `content/subjects.json`
to add more (give new subjects a palette in `src/studio/painters/common.ts`
and a playbook in `src/lib/prompt.ts`).

## Run

```bash
npm install          # also pulls ffmpeg-static (used by the News tab renderer)
python3 -m venv .venv && .venv/bin/pip install edge-tts
# News tab only — renders branded news Shorts with headless Chromium:
.venv/bin/pip install playwright && .venv/bin/playwright install chromium
npm run dev          # http://localhost:4321
npm run typecheck
node scripts/spike.mjs                                              # demo Short smoke test (dev server must be running)
node scripts/spike.mjs out "gen=1&subject=coding&module=frontend&sub=javascript&format=long&auto=1" 1200   # full-real long run via Gemini
```

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
> ~20/day for the flagship flash models. A full run makes 2–4 calls (topics +
> generate + up to two repairs), so on a free key generation waits between
> per-minute windows (the client now backs off and retries for up to 2 minutes
> rather than failing instantly). For smooth use, put a **paid / higher-quota
> `GEMINI_API_KEY`** here, or set `GEMINI_THINKING_BUDGET=0` to cut per-call time.

## How it works

1. **Pick & Generate** — `content/subjects.json` defines the taxonomy
   (subject → module → sub-module, each subject with its own audience + style
   fed into prompts). `/api/studio/topics` asks Gemini for the 10 best unmade
   topics (excluding `content/history.json` for that sub-module);
   `/api/studio/generate` turns the chosen topic into a `SceneScript`
   (strict zod schema in `src/studio/schema.ts` — 15 scene kinds:
   bigtext, bullets, code, terminal, diagram, compare, question, timeline,
   stat, steps, quiz, vocab, chart, quote, mythfact). Each subject carries its
   own accent **palette** (`paletteForSubject` in
   `src/studio/painters/common.ts`) and a prompt **playbook**
   (`SUBJECT_PLAYBOOKS` in `src/lib/prompt.ts`) steering which kinds it
   favours — so History reads as an amber timeline, English as violet vocab
   cards, Finance as green charts, etc. Videos also vary deterministically by
   script: 4 background motifs, 4 scene-transition styles, 3 bigtext entrance
   styles, 3 bullet marker styles and 3 thumbnail layouts are all seeded from
   scene/topic ids (same script → identical re-render). Non-coding subjects
   use lang-"text" code panels for worked examples instead of executable code.
   Display-only strings are clamped deterministically
   (`src/lib/sanitize.ts`) before validation; remaining failures get up to two
   Gemini repair rounds. `/api/studio/generate` streams NDJSON stage events
   (`writing` → `validating` → `repairing`) so the 30–180s wait shows honest
   progress in the UI. NOTE: free-tier gemini-2.5-flash allows only
   ~20 requests/day (resets midnight PT) — switch `GEMINI_MODEL` or enable
   billing for real volume. Requests are counted in `content/quota.json` and
   shown as a meter in the masthead.
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
   (status: draft). The Library tab lists drafts (`/api/studio/drafts`),
   streams files with Range support (`/api/studio/file`), and offers copy
   (title/description+hashtags/tags), downloads (.webm — YouTube-supported —
   and .png), upload (marks history uploaded + videoId; sets the thumbnail on
   long videos, needs a phone-verified channel), and delete (files removed,
   history entry kept so the topic is never re-suggested).

State ownership: `src/lib/state.ts` is the only writer of history/subjects
files and draft deletion; `/api/studio/save` is the only writer of
`content/videos/`.

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
- Routes: `news/config` (channels+categories), `news/render` (runs the Python
  renderer into `content/news/<slug>/`), `news/upload` (per-channel upload),
  `news/drafts`, `news/file` (Range-streamed mp4 preview). `src/lib/news.ts`
  owns channel resolution and news-draft state.

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
- **Music bed**: if `public/music.mp3` exists it is mixed under the narration
  at low volume (fade in/out) in playback and the recording. Swap the file to
  change the track; delete it for narration-only videos.
- **Pacing**: scripts carry a hard word budget (short 130-220, long 950-1700
  words), shorts are voiced at +5% rate and use tighter beat/scene gaps.
- `?demo=1&auto=1` URL params: load the hardcoded demo script and auto
  render+save (used by `scripts/spike.mjs`).

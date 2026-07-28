# devstudio improvement — progress board

**Source of truth for this programme — not the conversation, which gets summarised and lost.**
(Same reason `qa/LEDGER.md` exists. That ledger keeps owning per-painter animation polish; this one owns
everything else and links to it.)

## Resume protocol — read these three lines and you know what to do

1. Read this file. The **next item** is the lowest-numbered `todo` whose dependencies are all `verified`.
2. Its full spec is in `improvement_plan.md`, under the phase with the matching number.
3. Do it, commit it, move its row to `done` **with the commit hash**, then run its check and move it to
   `verified` **with the pasted output**.

## Rules that keep this honest

- Update the row in the **same commit** as the work. A row updated later is a row that will be wrong.
- `done` requires a **commit hash**. `verified` requires **pasted measured evidence**, not an adjective.
- `blocked` must name what would unblock it. `wont-do` must say why.
- If the code contradicts `improvement_plan.md`, **trust the code and amend the plan in the same commit.**
- One phase per commit. Do not batch.
- Anything marked **SPIKE** in the plan is unverified — run it and write the answer into the plan before
  building on it.

## States

`todo` → `in-progress` → `done` (committed) → `verified` (checked) · plus `blocked` · `wont-do`

## Baselines captured before any work (2026-07-28)

| Metric | Value | How to re-measure |
|---|---|---|
| Static-card audio share | **34%** (88 of 255 min) | `node scripts/pacing-audit.mjs` (Phase 3 builds it) |
| Long videos: static-card scenes | **41%** (7 of 17), 25% of runtime | same |
| Worst single frozen card | **26.9 s** | same |
| Videos opening on a definition | **30%** (27 of 89) | same |
| `"let's"` / `"here is"` uses | **101 / 61** across 89 scripts | same |
| Running example threading all scenes | **0 of 86** | same |
| Scene kinds reachable by the model | **75 of 110** | `KIND_LINE.size` in `prompt.ts` — **closed by 1.1**, now 110 |
| Typecheck errors | **99** | `npx tsc --noEmit 2>&1 \| grep -c "error TS"` — re-confirmed 99 at 25624d6; **73** after phase 1 (d9e364a) |
| Untracked files in `src/` | **102 of 158** | `git ls-files src \| wc -l` vs `find src -type f \| wc -l` — **closed by 0.1**, now 158/158 |
| Painters passing animation QA | **16 of 110** | `qa/LEDGER.md` |
| Edge-bleed failures | **7 of 220** | `npm run edge-audit` |
| Factory slots below bar | **72 of 86** | `content/factory/**/*.json` `status` field |

## Work items

| id | phase | stream | title | state | deps | evidence | commit |
|---|---|---|---|---|---|---|---|
| 0.1 | 0 | hygiene | Commit 102 untracked `src/` + `scripts/` files | verified | — | `git ls-files src \| wc -l` → **158** (was 56, `find src -type f` → 158); `git ls-files scripts` → **14** (was 6); 149 files in the commit | 25624d6 |
| 0.2 | 0 | hygiene | Resolve deleted-but-tracked `DESIGN-BRIEF.md` | verified | 0.1 | deletion committed; `git status --porcelain \| grep -v '^??'` → empty. Content recoverable at `git show 012afb2:DESIGN-BRIEF.md` (274 lines, desktop-UI wireframe brief) | 25624d6 |
| 1.1 | 1 | content | Menu regex `[a-z]+` → `[a-z0-9_]+` (`prompt.ts:142`, not :139) | verified | 0.1 | `KIND_LINE.size` **75 → 110**, 35 kinds unlocked (replayed the exact map/filter over `ALL_KINDS_MENU`) | d9e364a |
| 1.2 | 1 | animation | `radar.ts:291` `cy` undefined — crashes every frame, in 12/19 kits | verified | 0.1 | `filmstrip --kind=radar`: renders both aspects, legend centred beside the web, `qa/radar/console.log` empty | d9e364a |
| 1.3 | 1 | animation | `circuit.ts:197` 4 args to 2-arg helper | verified | 0.1 | `filmstrip --kind=circuit`: wires unlit→lit across beats, console.log empty (was "hex.slice is not a function" every frame) | d9e364a |
| 1.4 | 1 | animation | `dayclock.ts:135,140` `.geometry` off a Group | verified | 0.1 | `filmstrip --kind=dayclock`: both hands sweep from the hub, console.log empty | d9e364a |
| 1.5 | 1 | animation | `tree.ts` 3D layer frozen at frame 0 (CORE kind) | verified | 0.1 | `filmstrip --kind=tree`: root at p=0.07, depth-1 at p=0.40, leaves at p=0.67 — 3D blocks track the reveal steps | d9e364a |
| 1.6 | 1 | hygiene | `EventbusScene`/`TrafficflowScene` missing types | verified | 0.1 | `tsc` **99 → 73** (−26 across 1.2-1.6); eventbus/trafficflow now typed via `Extract<Scene, …>` | d9e364a |
| 1.7 | 1 | animation | `drawSceneTitle` timing: 3 different fades → one `TITLE_IN_MS` | verified | 0.1 | 94 call sites swept, 50 `titleP`/`titleIn` consts deleted; `filmstrip --kind=steps --entrance`: title+underline complete at ~420 ms (was ~25% opacity at 500 ms). **Plan corrected: 11 slow sites, not 91** | d9e364a |
| 2.1 | 2 | render | Load Plus Jakarta before any text measurement | verified | 0.1 | headless: `document.fonts.check("800 48px 'Plus Jakarta Sans'")` **false → true**; same `measureText("Own vs inherited")` **386.74px → 396.77px**. New `src/studio/fonts.ts`; `/probe` now shares it | 5ca4b50 |
| 2.2 | 2 | render | Captions default on (`page.tsx:192`) | verified | 0.1 | rendered short (8 scenes, 85.8 MB): karaoke captions present on every scene | 5ca4b50 |
| 2.3 | 2 | render | Karaoke highlight breaks past ~18 words; 3-line silent truncation | verified | 2.2 | 108-char beat pages: page 1 "…Comment your" with highlight inside it → page 2 "answer." — a word the old `.slice(0,3)` never displayed | 5ca4b50 |
| 2.4 | 2 | render | Transition paints incoming scene frozen at `p=0` (`engine.ts:647`) | verified | 0.1 | 30 fps frames pulled from the rendered webm across the 4.17 s boundary: outgoing `bigtext` fades out while the incoming `diagram`'s title + underline visibly animate underneath, captions already on the incoming beat | 5ca4b50 |
| 2.5 | 2 | render | Re-enable outro so a YouTube end screen is possible | verified | 0.1 | tail of the rendered long webm shows the brand, the SUBSCRIBE pill and "new videos daily" over the dimmed last scene — 5.2 s, above YouTube's 5 s floor | 5ca4b50 |
| 2.6 | 2 | render | `THEME.bgBase` undefined (`eventbus.ts:237,280`) | verified | 0.1 | `tsc` 73 → 71; both fills now named colours | 5ca4b50 |
| 2.7 | 2 | render | Contrast: `textFaint` 2.41:1, karaoke unspoken 4.0:1 | verified | 0.1 | measured: textFaint **2.42 → 4.67**, karaoke unspoken **3.99 → 6.32**, Art & Culture accent **4.06 → 5.07** (only failing palette of 16) | 5ca4b50 |
| 2.8 | 2 | render | No `public/` → `/music.mp3` 404s; `MUSIC_GAIN` inaudible | verified | 0.1 | `public/` created + documented; render logs `no public/music.mp3` instead of failing silently; gain 0.05 → 0.079 (~−26 → ~−22 dBFS) | 5ca4b50 |
| 2.9 | 2 | render | **NEW, worst defect found so far** — `paintBigtext` leaks a `ctx.save()` every frame; the translate integrates a sine and walks the video off-screen | verified | — | live transform drift `f = −6.6 → −592 px`; same 22-scene script **17.32 MB → 233.69 MB** webm (13.5×). Reproduced identically at `d9e364a`, so **pre-existing, not a Phase 2 regression**. Fixed in `bigtext.ts` variants 0+1 **and** guarded engine-wide by `resetContext()` in `paintAt` | (next) |
| 3.1 | 3 | tooling | `src/studio/pacing.ts` — shared metric on real `sceneBeats()` | todo | 0.1 | unit-checked against corpus | — |
| 3.2 | 3 | tooling | `scripts/pacing-audit.mjs` → `qa/PACING.md` | todo | 3.1 | baseline table above reproduced | — |
| 4.1 | 4 | content | Per-kind narration caps + mirror in `sanitize.ts` | todo | 3.2 | no card > ~9 s | — |
| 4.2 | 4 | content | Soft gate `staticCardOverrun` (3 wiring sites) | todo | 4.1 | fires on the old corpus | — |
| 4.3 | 4 | content | Soft gate `definitionOpener` | todo | 3.2 | flags 27 of 89 historic | — |
| 4.4 | 4 | content | Soft gate `crutchPhrases` | todo | 3.2 | flags 101 "let's" historic | — |
| 4.5 | 4 | content | Soft gate `runningExampleCoverage` | todo | 3.2 | flags 86 of 86 historic | — |
| 4.6 | 4 | content | Soft gate `jargonDensity` (first-use anchoring) | todo | 3.2 | anchored share reported | — |
| 4.7 | 4 | content | Fix `directives` `.max(12)` 400-error bug | todo | 0.1 | 16 broken slots generate again | — |
| 5.1 | 5 | content | Remove mandated bigtext section cards (`prompt.ts:695-708`) | todo | 4.1 | ≤ 2 bigtext per long | — |
| 5.2 | 5 | content | Give `narration` an explicit size in every single-beat menu line | todo | 4.1 | — | — |
| 5.3 | 5 | content | Decouple chapters from `bigtext` (`page.tsx:58-60`) | todo | 5.1 | chapters still emitted | — |
| 5.4 | 5 | content | Fix 3rd per-beat instruction (`content-factory.mjs:231`) | todo | — | — | — |
| 6.1 | 6 | loop | 7th rubric section `pacing_density`, fed computed facts (5 edits) | todo | 3.1, 15.1 | ratings still parse | — |
| 7.1 | 7 | render | Re-lock 7 desynced painters to beat windows | todo | 0.1 | visuals track audio | — |
| 7.2 | 7 | render | Progressive reveal for the 5 single-beat painters | todo | 4.1 | no dead frame at cap | — |
| 15.1 | 15 | integration | **Estimate↔actual drift**: compare gate estimate to measured TTS | todo | 3.1 | drift reported per beat | — |
| 15.2 | 15 | integration | Calibrate words/sec per voice **and per language** | todo | 15.1 | hi vs en measured separately | — |
| 17.1 | 17 | content | Hand-author gold short + long per archetype (~20 scripts) | todo | 5.1 | scripts pass all gates | — |
| 17.2 | 17 | content | Wire `exemplarScript` — factory never sends it today | todo | 17.1 | present in the prompt | — |
| 12.1 | 12 | narration | **SPIKE**: does edge-tts accept `--pitch`/`--volume`? word timings? SSML? | todo | — | written into the plan | — |
| 12.2 | 12 | narration | Per-beat delivery by beat role (hook/teach/payoff/question) | todo | 12.1 | audibly varied | — |
| 12.3 | 12 | narration | Enforced pausing (clause length + pause markers) | todo | 12.1 | gate fires | — |
| 12.4 | 12 | narration | Indian pronunciation lexicon (currently **6 entries**) | todo | — | every proper noun covered in one video | — |
| 12.5 | 12 | narration | Hindi path no longer early-returns (`speech.ts:88-91`) | todo | — | acronyms/units handled in hi | — |
| 12.6 | 12 | narration | Subject-aware default voice (currently `en-US-Andrew`) | todo | — | — | — |
| 12.7 | 12 | narration | Emphasis marker that strips from caption, survives to voice | todo | 12.1 | no letter-spelled emphasis | — |
| 12.8 | 12 | narration | Put synthesis behind a swappable interface | todo | 12.1 | vendor swap is config | — |
| 8.x | 8 | hygiene | Typecheck 99 → 0; delete 108 cruft files; single-source `LIMITS`; 6 dead deps; docs | todo | 0.1 | `tsc` → 0, `npm run build` ok | — |
| 9.x | 9 | animation | Motion toolkit + house style, then top-traffic kinds by tier | todo | 1.1, 8.x | `qa/LEDGER.md` rows | — |
| 10.x | 10 | render | Typography scale, transition language, encode audit | todo | 9.x | — | — |
| 16.1 | 16 | integration | Post-render measurement of the actual video | todo | 3.1 | dead frames measured on output | — |
| 13.1 | 13 | content | **Research** short + long craft per archetype (the failed pass) | todo | — | written into the plan | — |
| 13.2 | 13 | content | Cached `creatorBrief` per submodule (373, one-time) | todo | 13.1 | stored in taxonomy | — |
| 14.x | 14 | animation | New scene kinds — only after 1.1 and 9.x | todo | 1.1, 9.x | — | — |
| 18.x | 18 | growth | Thumbnail legibility at 168×94, title/CTR audit | todo | — | — | — |
| 11.1 | 11 | docs | Rewrite `CLAUDE_PROMPT.md` as the master spec | todo | all | — | — |

## Milestone 1 — one genuinely good video

**Gate:** `0.1 → 1.x → 2.x → 3.x → 4.x → 5.x → 15.1 → 17.1/17.2 → 12.1-12.3` then generate a short and a
long for `coding/frontend/javascript` (a same-topic baseline already exists to compare against),
**watch them**, and only then roll the treatment to the other 18 subjects.

Targets to hit before calling Milestone 1 done: static-card audio **< 10%**, no beat **> 12 s**,
≤ 2 `bigtext` per long, **4-8 s** per visual change, zero definition openers, zero crutch hits,
≥ 8 distinct scene kinds in a long, running-example coverage **> 0.8**.

## Known risks (from the plan's red-team pass)

- **More gates cost throughput.** ~40 videos/day free-tier best case vs 1,119 in the catalogue.
  Gates must replace repair rounds via better first drafts (17.x), not stack on top of them.
- **Structural fixes may not be sufficient.** They make a video correctly *paced*; they do not make the
  writing good. 17.x is the only item aimed at voice. Milestone 1 exists to find out cheaply.
- **Phase 13's research has not been done.** Do not treat the craft templates as settled.

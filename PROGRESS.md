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
| Static-card audio share | ~~34%~~ → **27.8%** (68.9 of 248.0 min) | `node scripts/pacing-audit.mjs` — **built, row 3.2**; minutes restated at the corrected 2.62 w/s (row 15.3) |
| Long videos: static-card scenes | **40.2%** (170 of 423 scenes), 25.9% of runtime | same |
| Worst single frozen card | **26.7 s** (terminal) | same — 26.9 s was the same beat priced at 2.06 w/s |
| Beats over 12 s | **354 of 1,814** | same — 15.1 revised this to 571 on a mis-calibrated 2.06 w/s; **row 15.3 re-measured 2.62 and it is 354 again** |
| Seconds per visual change | **8.2 s** mean (target 4-8) | same — 15.1's 10.4 s came from the wrong constant (row 15.3) |
| Videos opening on a definition | ~~30% (27 of 89)~~ → **3 of 88** | same — the old figure was a regex artifact, see row 3.3 |
| Videos opening on a static card | ~~42 of 89~~ → **64 of 88** (worse) | same |
| `"let's"` / `"here is"` uses | **89 / 53** across 88 scripts | same |
| Running example threading all scenes | median coverage **0.50** by proxy | same (the proxy differs from the original pass — see `pacing.ts`) |
| Scene kinds reachable by the model | **75 of 110** | `KIND_LINE.size` in `prompt.ts` — **closed by 1.1**, now 110 |
| Typecheck errors | **99** | `npx tsc --noEmit 2>&1 \| grep -c "error TS"` — re-confirmed 99 at 25624d6; **73** after phase 1 (d9e364a) |
| Untracked files in `src/` | **102 of 158** | `git ls-files src \| wc -l` vs `find src -type f \| wc -l` — **closed by 0.1**, now 158/158 |
| Painters passing animation QA | **16 of 110** | `qa/LEDGER.md` |
| Edge-bleed failures | **7 of 220** | `npm run edge-audit` |
| Factory slots below bar | **72 of 86** | `content/factory/**/*.json` `status` field |
| `npm run build` | **already failing** (pre-existing) | webpack reports "✓ Compiled successfully" then the type-check dies on `demo.ts:4` — the 55-error `meta` cluster Phase 8 owns. So §7b's "build clean" is not a regression to watch for, it is a target to reach. |

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
| 2.9 | 2 | render | **NEW, worst defect found so far** — `paintBigtext` leaks a `ctx.save()` every frame; the translate integrates a sine and walks the video off-screen | verified | — | live transform drift `f = −6.6 → −592 px`; same 22-scene script **17.32 MB → 233.69 MB** webm (13.5×). Reproduced identically at `d9e364a`, so **pre-existing, not a Phase 2 regression**. Fixed in `bigtext.ts` variants 0+1 **and** guarded engine-wide by `resetContext()` in `paintAt` | bc8c424 |
| 3.1 | 3 | tooling | `src/studio/pacing.ts` — shared metric on real `sceneBeats()` | verified | 0.1 | imports the real `sceneBeats` (no re-implementation): Node 22 strips types, `tsc` clean, `next build` "✓ Compiled successfully". `countWords` agrees with `schema.narrationWordCount` on **88 of 88** scripts | ff63c0b |
| 3.2 | 3 | tooling | `scripts/pacing-audit.mjs` → `qa/PACING.md` | verified | 3.1 | 88 scripts, 1814 beats, 249.9 min. Exact matches to the plan: bigtext share **18.8%**, kinds used **36**, factory status **72/86**, worst beat **26.9 s** — same corpus. New: **354 beats > 12 s**, mean hold **8.3 s** | ff63c0b |
| 3.3 | 3 | content | **Plan correction** — "30% open with a definition" is a regex artifact | verified | 3.2 | the plan's pattern reproduces it (25 of 88) but 21 of those open `Your…/You…/This…` — good cold-opens. Strict pattern: **3 of 88**. §1 amended, **4.3 downgraded** | ff63c0b |
| 4.1 | 4 | content | Per-kind narration caps + mirror in `sanitize.ts` | verified | 3.2 | one cap of **190** (not five of 150-260): same dead-frame reduction as the specified 150 (354→245) while keeping 25 more median words and 2 fewer scripts under the floor. Only the 5 single-beat kinds use `narration`, so one change reaches exactly them; `terminal` keeps 260 (`terminal.ts:144` budgets 62% of the beat). `sanitize.ts` now imports `SPOKEN_LIMITS` instead of re-declaring literals | f05e782 |
| 4.2 | 4 | content | Soft gate `staticCardOverrun` (3 wiring sites) | verified | 4.1 | fires 40/88 historic; retargeted at the cap's own 12.2 s ceiling so a legitimately-capped 190-char card does **not** trip it. Wired in all three sites (repair, warning, `warningsToDirectives`) | f05e782 |
| 4.3 | 4 | content | Soft gate `definitionOpener` — **reinstated** | verified | 3.2 | written off in 3.3 on corpus evidence (3/88), then a live generation from the raw prompt opened *"A closure is a function bundled together with references to…"*. The corpus reads well because of accumulated per-slot directives, not the prompt. Strict pattern only — flags that beat, flags none of the 21 good `Your…` hooks | f05e782 |
| 4.4 | 4 | content | Soft gate `crutchPhrases` | verified | 3.2 | fires 23/88 at ≥3 hits. **"let us" added** after the live script used it 4× to fill mandated section cards — the plain `let's` regex missed it entirely; corpus crutch hits 167 → 174 | f05e782 |
| 4.5 | 4 | content | Soft gate `runningExampleCoverage` | verified | 3.2 | fires 14/88 at coverage <0.40 (<0.50 would have been 44% — too aggressive for a proxy) | f05e782 |
| 4.6 | 4 | content | Soft gate `jargonDensity` (first-use anchoring) | verified | 3.2 | measures the **anchored share**, not term count, per the plan. Fires 9/88. Excludes the script's own code identifiers — on the live script 7 of 15 flagged "terms" were its own `createTracker`/`matchData`, which no gloss could fix | f05e782 |
| 4.7 | 4 | content | Fix `directives` `.max(12)` 400-error bug | verified | 0.1 | confirmed **16 of 27 keys** hold 14-15 entries → every request for those slots 400'd before reaching Gemini. Route → 24; factory dedupes on a normalised 8-word key and caps on the way in **and** out; store now maxes at 15, 0 keys over limit | f05e782 |
| 4.8 | 4 | content | **NEW gate `overlongBeats`** — kind-agnostic beat-length check | verified | 3.2 | the caps reach only 39% of the problem: **215 of 354 overlong beats (61%) sit inside multi-beat scenes** (bullets 34, code 25, diagram 25, trace 24…) where no narration cap can touch them. Fires 24/88 at ≥3 beats | f05e782 |
| 5.1 | 5 | content | Remove mandated bigtext section cards (`prompt.ts:695-708`) | verified | 4.1 | live generation, same topic, before→after: **bigtext 5 → 1**, static-card scenes 39% → **24%**, static-card audio 16.8% → **12.9%**, beats over 12 s 2% → **0%**, mean hold 7.8 s → **4.8 s** (inside the 4-6 s target), p90 11.2 → 5.8 s, distinct kinds 11 → **15**, crutch hits 5 → **1**, gates firing 4 → **1** | f0731de |
| 5.2 | 5 | content | Give `narration` an explicit size in every single-beat menu line | verified | 4.1 | all 5 lines now carry `<=190 chars / ~30 spoken words — this is the WHOLE scene` (terminal 260). Also corrected the stale `narration max 400` in **all three** HARD LIMITS copies, and the bigtext line no longer advertises itself as a "section card" | f0731de |
| 5.3 | 5 | content | Decouple chapters from `bigtext` (`page.tsx:58-60`) | verified | 5.1 | new `sections[{atSceneId,title}]` on the script; `page.tsx` prefers it and falls back to bigtext for older scripts. The live generation emitted **5 sections** pointing at real teaching scenes | f0731de |
| 5.4 | 5 | content | Fix 3rd per-beat instruction (`content-factory.mjs:231`) | verified | — | it said **"3-5 full sentences"** per beat (~40-70 words ≈ 15-27 s), directly contradicting the new 31-word ceiling. Fixed in all three places it appeared: the factory directive, the route's word-floor repair message, and the menu header | f0731de |
| 5.5 | 5 | content | **NEW gate `tooManyBigtext`** — enforce ≤2 title cards per long | verified | 5.1 | the prompt used to *mandate* 5-8 cards and the corpus median was exactly 5, so the model was complying. Fires 24/88 historic; the post-Phase-5 generation produces **1** | f0731de |
| 6.1 | 6 | loop | 7th rubric section `pacing_density`, fed computed facts (5 edits) | verified | 3.1, 15.1 | all 5 coordinated edits landed (section list, criteria, **literal JSON shape** — `normalizeRating` hard-bails to null without it — plus the `overall` mean and `worst` min consequences). Live rating of a gate-passing long script parsed fine: overall 7.1, worst 6, **pacing_density 6** with beat-level issues naming real scene ids (`walkaway-outcomes` holds one bullet card across 4 beats). Dead `--stretch`/`--max-rounds` flags deleted | 2c54a89 |
| 7.1 | 7 | render | Re-lock 7 desynced painters to beat windows | verified | 0.1 | all 7 use `activeBeatIndex(env.beats, …)` instead of `Math.floor(env.p * n)`; 0 desync sites remain, `tsc` unchanged at 71. `filmstrip` **ok on all 7** (both aspects); `layers` steps its highlight Application→Transport→Network→Physical with the caption tracking it | 652cd27 |
| 7.2 | 7 | render | Progressive reveal for the 5 single-beat painters | done | 4.1 | new `revealT(env, from, to)` in `common.ts` — a duration-AWARE sibling to `enterT`, which is absolute by design and is why a card finishes animating 400 ms in and then holds. `stat` context, `question` hint and `quote` attribution now land mid-beat; filmstrip ok. **Effect is subtle at strip scale** — worth an eye before calling it solved | 
| 7.3 | 7 | tooling | ~~`/probe` harness no longer initialises~~ — **not a code bug** | wont-do | — | on a freshly started dev server `__PROBE_DONE: true`, no failed requests, and all 7 filmstrips capture. The failure was stale `.next` state from the dev server that had been wedged for 3 days — a second server on another port shares that cache. **If filmstrip times out, restart the dev server before debugging painters** | — |
| 15.1 | 15 | integration | **Estimate↔actual drift**: compare gate estimate to measured TTS | verified | 3.1 | `scripts/drift-check.mjs` voices a real script and times every clip with ffmpeg. 85-beat script: estimated 408.5 s, **measured 515 s, ratio 1.26** — every threshold was 26% too lenient. 50 of 85 beats off by >25% | 61d75b9 |
| 15.2 | 15 | integration | Calibrate words/sec per voice **and per language** | verified | 15.1 | Hindi calibrated at last: **hi-IN-Madhur 2.26, hi-IN-Swara 2.33** effective w/s vs **en-US-Andrew 2.70, en-IN-Neerja 2.44**. `WORDS_PER_SEC_BY_LANG` + `MEASURED_WORDS_PER_SEC` now hold the real numbers and `pacingReport` prices a Hindi script as Hindi. **Plan correction: the languages do NOT differ in speaking rate** — every voice speaks at 2.73-2.87 w/s on the speech span; what differs is per-clip silence (0.44 s → 1.22 s). The per-voice spread inside English (2.70 vs 2.44) is wider than the gap between languages, which matters now that 12.6 made Neerja the default for 11 of 19 subjects | |
| 15.3 | 15 | integration | **NEW** — English rate was wrong: 2.06 → **2.62** | verified | 15.2 | Three independent measurements agree to 3% and none is 2.06: drift-check on a 63-beat script **2.62** (ratio 0.786), drift-check on a **real content** short **2.69** (ratio 0.975 at the new constant), direct pass over 12 corpus beats **2.70**. **Not a Phase 12 regression** — old CLI vs new helper on the same sentence is 33,984 vs 34,128 bytes, so the new path is 0.4% *longer*. Effects: `overlongBeats` **43.2% → 27.3%** (back inside the 14-27% band; at 2.06 it burned repair rounds on beats that were fine), beats over 12 s **571 → 354**, mean hold **10.4 → 8.2 s**, single-beat cap **12.2 → 9.6 s**. Two-parameter fit deliberately NOT shipped: its parameters move 18% between scripts (`/3.89+1.00s` vs `/3.29+0.91s`) | |
| 17.1 | 17 | content | Hand-author gold short + long per archetype (~20 scripts) | todo | 5.1 | scripts pass all gates | — |
| 17.2 | 17 | content | Wire `exemplarScript` — factory never sends it today | todo | 17.1 | present in the prompt | — |
| 12.1 | 12 | narration | **SPIKE**: does edge-tts accept `--pitch`/`--volume`? word timings? SSML? | verified | — | answers written into §12a. `--pitch`/`--volume` **yes** (+40Hz vs -0Hz: same length, different md5). Word timings **yes, Python-API only** — `Communicate(boundary="WordBoundary")`, default is `SentenceBoundary` and **the CLI has no `--boundary` flag**; 15/15 word events on en-US, en-IN *and* hi-IN. SSML **no** — `<speak>` tags are read aloud (10.6 s vs 1.3 s). Bonus: lead **0.087-0.100 s**, trail **0.325-0.462 s** (26% of a short beat) | |
| 12.2 | 12 | narration | Per-beat delivery by beat role (hook/teach/payoff/question) | verified | 12.1 | new `src/studio/delivery.ts` derives the role (no schema/prompt change, works on all 88 existing scripts). **Plan corrected: rate-only, not pitch** — measured, `+8Hz` alone reads **12.1% faster** and `-6Hz`+`+4%` gives **-24.5%**, while `rate` is monotonic and byte-identical across passes. Live end-to-end: long hook **-7.4%**, question **+8.3%**, payoff **+9.9%**; short hook **-10.0%**, question **+3.0%**, payoff **+11.4%**, 11/11 words intact in every case | |
| 12.3 | 12 | narration | Enforced pausing (clause length + pause markers) | verified | 12.1 | new gate `unbrokenClause` in `pacing.ts`, wired in all **three** sites (route `PACING_GATES`, `pacing-audit.mjs`, factory `warningsToDirectives`). Threshold picked from the corpus like every other gate: 2,037 beats give p50 **10** words unbroken, p90 **16**, worst **31** (≈15 s with nowhere to breathe); `>16 words, ≥2 beats` fires **23 of 88 = 26.1%**, inside the 14-27% band the others hold. Textual by necessity — the gate runs pre-TTS and edge-tts rejects SSML `<break>` (12.1) | |
| 12.4 | 12 | narration | Indian pronunciation lexicon (currently **6 entries**) | verified | — | new `src/lib/lexicon.ts`, **6 → 158 entries** in 7 groups, plus **voice gating**: respellings authored for an American ear are skipped for `en-IN`/`hi-IN` voices (which say the names natively) while tech terms apply to every English voice. Live: US voice → "Cha-look-ya … Ka-joo-raa-ho … engine X"; Indian voice → "Chalukya … Khajuraho … engine X". New `scripts/lexicon-check.mjs` proves overlap-freedom, no `$n` leaks (158/158), no re-mangling by the acronym expander, and gating both ways; it caught 3 real bugs (`Ganesh`→"Ga-nay-sha", `Sundarbans` losing its plural, `PostgreSQL` never matching). **Plan correction: the corpus is 86/93 Coding and contains none of the 6 old terms**, so the Indian half is prospective and the measured risk today was technical vocabulary. **Respellings are NOT ear-verified** — `--voice` renders every pair to listen to | |
| 12.5 | 12 | narration | Hindi path no longer early-returns (`speech.ts:88-91`) | verified | — | `normalizeHindi()` gives Hindi the same coverage as English but **in Devanagari** (letter names, 13 units, magnitudes, currency, `&`/`=`/`+`) instead of 2 symbol rules and a `return`. Live through the route on `hi-IN-MadhurNeural`: `यह API हर बार 250ms लेता है` → **`यह ए पी आई हर बार 250 मिलीसेकंड लेता है`** (was: unchanged). Found and fixed a **pre-existing English bug** in passing — `₹500 rupees` expanded to "500 rupees rupees"; `collapseCurrencyEcho` now covers both languages. English output re-checked, unchanged otherwise | |
| 12.6 | 12 | narration | Subject-aware default voice (currently `en-US-Andrew`) | verified | — | `defaultVoiceFor()` in `pipeline.ts`: the **11 of 19** subjects whose `subjects.json` audience says "India-first"/"Indian … in depth"/names Indian exams get `en-IN-NeerjaExpressiveNeural` (the only Expressive voice, free, unused, and already the sibling news app's English channel); the 8 "worldwide" subjects keep Andrew. Cross-checked every label against `SUBJECT_PALETTES`: **11/11 match, 0 typos** falling silently back to US. Live route call on the Indian voice returns audio + 9 word timings | |
| 12.7 | 12 | narration | Emphasis marker that strips from caption, survives to voice | verified | 12.1 | `*word*` replaces ALL CAPS. `stripEmphasis()` (schema.ts) applied in **both** caption paths — engine `activeCaption` and `buildSrt` — so the screen never shows the marker; `expandEmphasis()` turns it into an em-dash pause, the only emphasis edge-tts affords (SSML is spoken aloud, 12.1). Measured on 12f's own collision: `LED to the outage` → **"L E D to the outage"**, `*led*` → **"— led —"**, while a genuine `*API*` still spells correctly. Prompt TTS_RULES switched and now bans ALL CAPS explicitly | |
| 12.8 | 12 | narration | Put synthesis behind a swappable interface | verified | 12.1 | new `src/lib/tts.ts` (`SpeechSynthesizer` → `{mp3, words, durationMs?}`) + `scripts/tts_synth.py`. Live route call returns **word timings end-to-end**; also collapses **one Python process per beat → one per batch** (was up to 160 spawns/script). Word timings now drive captions: measured against the linear ramp they replace, linear is off by **2.2 words** at t=1050 ms on a 14-word beat and **36.4% of the caption** on a 5-word beat, and finishes **525 ms after the voice stops** | |
| 8.1 | 8 | hygiene | **Typecheck 99 → 0** | verified | 0.1 | `npx tsc --noEmit` → **0 errors** (99 at session start, 71 after phases 1-7). `demo.ts` was 66 of them | 6514f41 |
| 8.2 | 8 | hygiene | `npm run build` green for the first time | verified | 8.1 | build completes and prints the route table; it had failed on `demo.ts` all session | 6514f41 |
| 8.3 | 8 | hygiene | Delete root cruft + close `.gitignore` | verified | 0.1 | 0 `screenshot_*.png` and 0 `rewrite_*.js` remain; only 1 untracked file left in the repo (the new `CLAUDE.md`). `.venv/`, `audit/`, `graphify-out/`, `src/` (158 files) and `scripts/` (18) all intact | 6514f41 |
| 8.4 | 8 | hygiene | Remove 6 dead deps, move `@types/three` | verified | 0.1 | `requests`, `chroma-js`, `polylabel`, `d3-array`, `d3-force`, `d3-scale` all gone; `@types/three` now in devDependencies; build still green | 6514f41 |
| 8.5 | 8 | docs | Refresh README, delete `NEW_ANIMATIONS.md`, fix QA doc | verified | — | `NEW_ANIMATIONS.md` `git rm`'d (all 43 proposals shipped; 17 of its "existing" kinds never existed) | 6514f41 |
| 8.6 | 8 | docs | **Write `devstudio/CLAUDE.md`** | verified | — | 11.7 KB, written from the code. The root `CLAUDE.md` never mentioned devstudio despite telling readers to "follow ITS CLAUDE.md" | 6514f41 |
| 8.7 | 8 | hygiene | Single-source `LIMITS`, split `page.tsx`/`schema.ts`, remove 25 dead exports | todo | 8.1 | **not done** — the remaining Phase 8 scope. `SPOKEN_LIMITS` (Phase 4) is a partial first step | — |
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

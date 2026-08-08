# devstudio — the master content & animation spec

> **NOTE:** This document is a standalone spec — it is **not** loaded by the app. The live generation
> prompt is `src/lib/prompt.ts`; validation lives in `src/studio/schema.ts` + `src/studio/pacing.ts`;
> TTS lives in `src/app/api/studio/tts/route.ts` + `src/lib/speech.ts`. This file exists so a human (or a
> fresh Claude session) can read the *intent* behind those files without reverse-engineering it from
> 4,000-line schema code. `improvement_plan.md` is the historical working log this was distilled from —
> read that for *how* a decision was reached; read this for *what is true now*.
>
> Written 2026-08-08, after the full animation-QA sweep (`qa/LEDGER.md`: 111/111 painters passed) and
> the Phase 9-17 backlog in `PROGRESS.md` closed out. Re-verify any code-line citation before trusting
> it — this is a snapshot, not a live view.

---

## 1. What this app is

A local, single-user Next.js app that turns a taxonomy slot (subject → module → submodule → format)
into a narrated, canvas-rendered teaching video. No database, no auth — state lives on disk under
`content/`. Pipeline: `subjects.json → /topics → /generate → /exec → /tts → engine.ts (canvas +
MediaRecorder) → /save → /upload`. Full architecture in `devstudio/CLAUDE.md`.

The hard problem this spec addresses: an LLM writing a JSON scene script for a 111-kind animation
engine will reliably produce something that **renders without crashing** and **still fails to teach** —
too many static title cards, narration that outruns the picture, definitions before concepts, the same
three safe scene kinds on repeat. Schema validation catches the first failure mode. Nothing catches the
second without deliberately measuring for it. This document is that measurement, and the fixes that
came out of it.

---

## 2. Measured diagnosis (corpus: 88-89 generated scripts, ~1,857 beats, ~255 min of audio)

| Measured fact | Original finding | Re-measured by `pacing-audit.mjs` |
|---|---|---|
| Audio spent on a single frozen card | 34% | **27.8%** after fixes |
| Long videos: static-card scenes | 41% of scenes, 25% of runtime | **40.2%** of scenes, 25.9% of runtime |
| `bigtext` seconds per card (long) | 15.7 s avg, worst 26.9 s | 15.4 s median, worst 26.5 s |
| `bigtext` share of all scenes | 18.8% — the #1 kind of 111 | 18.8% (154 scenes), exact |
| Videos opening on a static card | 42 of 89 | 64 of 88 — worse than first reported |
| Beats over 12 s | not measured | 354 of 1,814 |
| Seconds per visual change | not measured | 8.3 s mean (target 4-6 s) |
| Scene kinds ever used in real output | 36 of 111 | 36, exact — **35 were unreachable, see §2a** |
| Banned crutch words (`"let's"`, `"here is"`) | 101 / 61 uses | 89 / 53 uses |
| Running-example coverage (one thread through the video) | median 0.29, 0 of 86 complete | median 0.50 by a stricter proxy |

**Correction on file, load-bearing:** an early pass claimed "30% of videos open with a definition" and
built a gate on it. Re-checked with a stricter pattern (requires a real category article — `is a`, not
just `is`), the true number is **3 of 88**, and even those read as metaphor hooks, not textbook
definitions. The loose pattern's 25 matches were 21 second-person cold-opens (*"Your div-button is a
trap…"*) — exactly what a good hook looks like. **Do not resurrect the loose definition-opener gate.**
The "feels like reading a book" complaint is real, but its cause is the static-card time and the 354
overlong beats, not definitions.

### 2a. Five root causes found in the corpus (all now fixed — kept for the *why*)

1. **The prompt specified the PowerPoint.** It used to mandate 5-8 `bigtext` section cards per long
   video; corpus median was exactly 5. The model was complying precisely. Fixed by removing the
   mandate (§3, Phase 5) — signposting now comes from a scene's own title + a forward-hook line.
2. **`narration` was the one field with no size cap.** Every visible field had a char limit; narration
   didn't, so the model anchored on the only number it saw (a 400-char hard ceiling) and wrote toward
   it. Fixed with per-kind narration caps (150 chars single-beat, 210 for `terminal`).
3. **The judge couldn't see pacing.** The rating rubric graded hook/structure/voice text but had no axis
   for beat length or seconds-per-visual-change — it could say "feels like a slide deck" in its own
   comments while never scoring for it. Fixed: `pacing_density` is now a 7th rubric section, fed
   computed facts so the model can't argue with a wrong number.
4. **A regex bug hid 35 of 111 scene kinds from the model entirely.** The kind-name extractor used
   `[a-z]+`, which can't match an underscore or a digit — every kind like `dp_table_fill` or `iso3d`
   silently vanished from the menu. One-character fix (`[a-z0-9_]+`); see §2b for what came after it.
5. **A live bug was failing generations outright.** The generate route capped `directives` at 12 items
   but the factory posted lists of 14-15, so 16 of 27 taxonomy slots 400'd on every attempt. Fixed —
   cap raised, and the store now dedupes/caps on the way in.

### 2b. From 36-of-111 reachable to 111-of-111 reachable, and what that took

Root cause 4 (the regex) explained why kinds were *invisible*; it didn't mean every kind was *good*.
Two more waves were needed:

- **Animation-QA sweep** (`qa/LEDGER.md`, `ANIMATION-QA-PROMPT.md` Part C): every one of the 111
  registered painters scored ≥4/5 on containment, typography, motion, cleanliness and palette. Two
  systemic bugs were found and fixed centrally along the way — a frozen-3D-layer bug (29 painters were
  stuck rendering frame 0 in production) and a "2D layout round-tripped through a tilted 3D camera"
  pattern (elements land outside frame, worst at 9:16). **Status: closed, 111/111 passed, 2026-08-08.**
- **Subject-menu wiring**: passing QA doesn't mean a subject's prompt ever *offers* a kind. As of
  2026-08-05, only 61 of 111 kinds were featured in `CORE_KINDS` or any `SUBJECT_KIT` entry
  (`prompt.ts`) — the other 50 sat in the full menu (which is always shown, in full, to every subject —
  `buildSceneShape()` never filters, only *features*) but were never promoted, so they were reachable in
  principle and essentially never chosen in practice. **Fixed 2026-08-08**: all 50 now have a home in at
  least one subject's kit (mostly `coding`, since most of the 50 were CS/distributed-systems concepts —
  `btree_index`, `event_loop`, `hash_ring`, `vdom_diff`, and 29 others; the rest split across `math`,
  `science`, `geography`, `history`, `polity`, `economy`, `finance`, `business`, `artculture`,
  `environment`, `mythology`, `gk`, `philosophy` by topic fit). Verify current counts with the snippet
  in `qa/ledger.json`'s companion check, or just diff `SUBJECT_KIT` against `painters/index.ts`.

---

## 3. Benchmark specification — what "top channel" means as numbers

| Dimension | Target | Corpus before fixes | Enforced by |
|---|---|---|---|
| Seconds per visual change | 4-6 s (long), 2-4 s (short) | static-card mean 10.4 s, worst 26.9 s | zod cap + pacing gate |
| Narration rate | 120-150 wpm | ~156 wpm — already fine, untouched | — |
| New visual in long-form | ≥ every ~40 s | 26.9 s dead frames (worst case) | structure block |
| Section signposting | one-sentence "what's next" + real chapter marks, not a title card | 5 static cards, median | structure block |
| Definitions | an ending point, not a starting point | see the correction in §2 — not actually broken | — |
| Structure | hook → payoff → plant next hook → payoff | one hook, then lecture | blueprint + rubric |
| Short hook | lands inside 2 s, ~8-12 spoken words, text on screen by 1-2 s | first scene far longer | zod cap |
| Kinetic text (Shorts) | scale-from-zero, OutBack overshoot, centre-outward stagger | existed, unsystematised | `common.ts` stagger/spring helpers |
| Motion craft | anticipation, staging, follow-through, easing, parallax | no shared helper existed | `common.ts` motion toolkit (Phase 9) |
| Scene transitions | hard cut by default (pro explainers cut, they don't dissolve) | 420 ms crossfade/push/wipe/zoom, always | **cut, no transition — fixed 2026-08-08** |

**Key precision, unchanged since the original diagnosis:** the fix was never faster narration — 156 wpm
already sits inside the educational band. The gap was always **visual change rate**, i.e. how often a
new thing appears on screen relative to how long the audio talks about it.

---

## 4. The four-layer content solution (why this isn't "write 373 prompts")

Hand-writing a prompt per submodule doesn't scale and drifts within weeks. The shipped design instead
layers four things, each cheap to maintain and each answering a different question:

| Layer | Answers | Where it lives | Count |
|---|---|---|---|
| 1. Episode archetype | act structure, hook type, payoff placement | `CHANNEL_ARCS` (`prompt.ts`) | one per subject, 19; the underlying *shape* clusters into 10 (§6 below) |
| 2. Subject voice | audience, register, accuracy bar | `subjects.json` `audience`/`style` | 19 |
| 3. Module/submodule lane brief | what this slice covers, what it must not drift into | `subjects.json` module/submodule `style` | 93 modules / 373 submodules |
| 4. Gold exemplar pair | one hand-authored short + long, shown as a few-shot example | `content/exemplars/*.json`, threaded via `exemplarScript` | one pair per archetype cluster, see §6 |
| + cached research | "how do the highest-viewed videos on this exact topic structure themselves" | `content/briefs.json` (`creatorBrief`) | 373, one-time, cached forever |

**Why archetypes, not 19 independent arcs:** a coding how-it-works episode and a science mechanism
episode share the same shape — pain → what it is → mechanism → practitioner payoff → challenge. Writing
19 arcs where 10 shapes exist creates drift with no gain. §6 has the cluster table.

**Why gold exemplars are the highest-leverage lever available:** rules cannot express *voice* — this
plan's own corpus has 89 "let's" against an explicit ban. Examples can. The plumbing
(`exemplarScript` in `generate/route.ts` → `prompt.ts`) existed for a long time with **zero callers**;
`scripts/content-factory.mjs` is now the caller (loads `content/exemplars/*.json`, keyed
`<subject>/<module>/<submodule>/<format>` falling back to `<subject>/<format>`).

---

## 5. Animation: the system, not the 111 outputs

The premium feel a hand-animated explainer has — springs with damping, anticipation, follow-through,
staggers — comes from infrastructure, not from polishing each painter file individually. Before Phase 9,
the shared layer (`common.ts` + `three3d.ts` + `icons.ts`) was 3.6% of all painter code and contained
three easing curves; every painter hand-rolled its own bob, ghost-entrance and colour literals.

What Phase 9 built once, centrally, so a *new* painter is born smooth instead of needing a polish pass:
an easing family (spring with damping, `anticipate`, quad/quint in-out), `stagger()` with direction,
`lerpColor()`, the `DUR`/`RADIUS`/`STROKE`/`GLOW` design scales, `drawGhost()`/`drawCard()` primitives,
and a caption-aware `layout.safeBottom` (one field, fixes 23 painters that were each re-deriving the
Shorts caption clamp under a different name and a different — usually wrong — value).

**Current state: 111/111 painters pass the 5-axis ship gate** (`qa/LEDGER.md`, ship gate = every axis
≥4/5). Two systemic bug classes were found and fixed across many painters at once rather than one at a
time — see §2b. `npx tsc --noEmit` is clean (0 errors, down from a 99-error baseline).

**Whole-video look (Phase 10), current state:**
- **Transitions**: hard cut only. The old 420 ms crossfade/push/wipe/zoom-fade system was decorative and
  is gone — `engine.ts` now paints the incoming scene directly with no dissolve.
- **Outro / end screen**: removed on every format, by product decision. (It had been re-enabled for
  long-form only, at 5.2 s with a brand + Subscribe pill — that shipped before this rewrite. Deleted on
  request; videos now end right after their content on both formats.)
- **On-screen watermark/progress bar**: kept, deliberately, on every frame.
- **Captions**: Shorts default to the one-word-at-a-time kinetic style (`"word"`); long-form defaults to
  `"pop"`. (Previously Shorts defaulted to karaoke; changed because Shorts convention is closer to the
  scale-from-zero kinetic style already built for that caption mode.)
- **Typography**: the display face (Plus Jakarta Sans) is genuinely loaded (`fonts.ts`,
  `ensureStudioFonts`), not a system-stack fallback — confirmed by fetching the live Google Fonts CSS.
  That family only ships up to weight 800; requests for weight 900 (26 sites) silently resolve to the
  real 800 face with no visible defect, and are deliberately left alone rather than mass-edited.
- **Encode**: 12 Mbps video / 192 kbps audio / 30 fps / true 1080×1920 and 1920×1080 canvases (`ASPECTS`
  in `schema.ts`) — all above YouTube's own 1080p30 recommendation. The backgrounded-tab watchdog
  (`engine.ts`, `setInterval` + `requestFrame()`) already prevents the render-stalls-forever failure
  mode. Audited 2026-08-08, no defect found, nothing changed.

---

## 6. Long-form: 10 archetype clusters over 19 subjects

Clustered by *what the viewer is being asked to do* — follow a mechanism, follow a procedure, follow a
story — because that's what changes the act structure, not the department name.

| # | Cluster | Subjects | Opens on | Payoff sits at |
|---|---|---|---|---|
| 1 | Mechanism — how a built system runs | coding | the pain / the outage | the production trade-off |
| 2 | Mechanism — how a natural system runs | science, health, environment | one real scene or number | what measurably changes |
| 3 | Procedure — how to solve or do it | math, lifeskills | the moment the method is needed | the shortcut an expert uses |
| 4 | Language — how to say it | english | the sentence that failed or won | the upgraded natural version |
| 5 | Narrative — what happened | history, mythology | a specific dawn, person, decision | the trace still visible today |
| 6 | Place — why it's like that there | geography | the anomaly | who lives differently because of it |
| 7 | Money — who pays and what it costs | finance, economy, business | the viewer's own pocket | the counterintuitive consequence |
| 8 | Institution — the rules and who they bind | polity | the clash where it got tested | the design logic, what it prevents |
| 9 | Self — why you do that | psychology, mindset | a behaviour the viewer recognises in themselves | the one lever they can pull |
| 10 | Object & fact — what this thing is | artculture, gk, philosophy | one object, or one claim worth disbelieving | what to look for next time |

Common act structure: **cold open → promise → stakes → roadmap → 4-6 teaching sections → mistakes →
payoff → question**, with a forward-hook line at every section boundary (a plain "and that changes
everything once you add X" beats a title card every time).

**Gold exemplars, mapped to this table:** one hand-authored short + long per cluster is the minimum
viable coverage — 20 scripts, not 38 (19 subjects × 2 formats), because the lookup falls back through
an archetype tier before giving up. See `content/exemplars/` for what's authored and
`scripts/exemplar-check.mjs --all` to verify every one still passes the exact gates a generated script
must pass.

**Exam-first vs curiosity-first** is a second, independent axis (from each subject's own `audience`
string, not a guess) — it changes the ending shape (answerable exam question vs argue-worthy
consequence), not the archetype. Exam-first: polity, economy, environment, artculture, gk, math,
geography, history, english. Curiosity-first: coding, science, finance, psychology, business, health,
philosophy, lifeskills, mythology, mindset.

---

## 7. Per-subject playbooks

| Subject | Benchmark channels | Hook archetype | Signature kinds |
|---|---|---|---|
| coding | Fireship, ByteByteGo, NeetCode, 3Blue1Brown | the 3 AM outage / the interview filter | code→terminal, trace, lifeline, memgrid, callstack |
| history | OverSimplified, Kings and Generals | cold-open in the moment, dated and named | timeline, chain, tactical_map, storyboard, race |
| geography | RealLifeLore, Atlas Pro | the anomaly — the place that shouldn't exist | terrain, geomap, globe3d, cycle, zoomladder |
| english | English with Lucy, mmmEnglish | the moment the language fails or wins | vocab, dialogue, storyboard, compare |
| polity | (propose: Study IQ / Drishti IAS-grade + explainer clarity) | the clash — the case where the provision got tested | statemachine, decision, parliament_arc, scroll |
| economy | Economics Explained + Indian explainers | open in the viewer's pocket (₹100 buys ₹94 of what it used to) | ledger, sankey, gauge, buckets, basket, coin_stack, trendgraph |
| environment | Veritasium-adjacent | one real scene, one number moving the wrong way | cycle, terrain, gauge, pictogram, chain, ecosystem_web, globe3d |
| artculture | (propose: museum-guide channels) | one object described so vividly you see it | schematic, architecture_blueprint, canvas_reveal, sheet_music |
| math | 3Blue1Brown, Numberphile, Mathologer | the slow way, then the trick | formula, curves, numberline, geometry, probability |
| science | Veritasium, Kurzgesagt, Steve Mould | the everyday phenomenon nobody questions | bodymap, orbit, circuit, zoomladder, molecule, neural_network |
| finance | Ben Felix, Two Cents + Indian personal-finance channels | the rupee number that stings | ledger, basket, buckets, curves, coin_stack |
| gk | Vsauce, Half as Interesting, RealLifeLore | the unbelievable fact, then the mechanism | race, pictogram, bracket, showdown, skyline, scalecompare, jigsaw_puzzle |
| psychology | Veritasium (behavioural), SciShow Psych | make the viewer feel the bias before naming it | cycle, dialogue, probability, storyboard |
| business | Wendover Productions, Company Man, Think School | a company and a stunning number | ledger, sankey, race, pipeline, skyline, domino_cascade |
| health | Institute of Human Anatomy, Kurzgesagt | the myth everyone repeats | bodymap, dayclock, buckets, curves |
| philosophy | Philosophy Tube, Wireless Philosophy | a modern concrete dilemma, not a definition | dialogue, showdown, storyboard, decision, jigsaw_puzzle |
| lifeskills | Ali Abdaal, Matt D'Avella, Struthless | the failure mode first, with rep counts | steps, cycle, calendar, showdown |
| mythology | Overly Sarcastic Productions, Crash Course Mythology | drop into the scene mid-story | storyboard, chain, tree, constellation, cycle, scroll |
| mindset | Ali Abdaal, Improvement Pill, Struthless | the hyper-specific painful moment | cycle, showdown, storyboard, calendar |

Unticked/proposed channel rows are general-knowledge suggestions, not verified research — treat them as
a starting point, not settled fact, if a future session wants to firm them up.

---

## 8. Issue tracker

Legend: **FIXED** = verified in code · **OPEN** = a real, live gap, not yet addressed · **WON'T FIX** =
considered and deliberately left. Numbering kept stable from the original draft of this document so old
references don't dangle; new findings are appended with an `N` prefix.

| # | Issue | Status | Where |
|---|---|---|---|
| 1 | Smart animation selection (common vs specialised) | FIXED | `prompt.ts` SCENE_MENU_HEADER + CORE_KINDS/SUBJECT_KIT, all 111 kinds now featured somewhere (§2b) |
| 2 | Clear on-screen text | FIXED | `prompt.ts` char-limit HARD LIMITS + NARRATION_RULES |
| 3 | Simple, relevant code snippets | FIXED | `prompt.ts` CODING_RULES ("when to use code") |
| 4 | Cohesive, lockstep storytelling | FIXED | `prompt.ts` LOCKSTEP + running-example rule (TEACHING_METHOD) |
| 5 | Pacing / talking-to-a-blank-screen | FIXED | mandated section cards removed (Phase 5); `sayIntro` capped short |
| 6 | Robotic AI-speak / formulaic transitions | FIXED | `prompt.ts` banned crutch-words + BANNED OPENERS |
| 7 | Visual cramming (character constraints) | FIXED | char limits, mechanically validated in `schema.ts` |
| 8 | Hallucinations / fake precision | FIXED | blueprint exact\|approx tagging; "around" rule for uncertain figures |
| 9 | Broken edges (dangling node/state refs) | FIXED | `schema.ts` superRefine ref checks (statemachine/decision/graphwalk) |
| 10 | Math / chronology constraints (sankey, timeline, pictogram) | FIXED | `schema.ts` superRefine chronology + sum checks |
| 11 | Scene monotony / safe choices | FIXED | `prompt.ts` VARIETY_RULE (≥3 kinds short / ≥6 long) |
| 12 | Dual-track (beginner + expert) | FIXED | `prompt.ts` TEACHING_METHOD dual-track rule |
| 13 | Schema hallucinations (invented JSON keys) | FIXED | `schema.ts` `unknownSceneKeys` warn-and-surface |
| 14 | Regional word mispronunciation (e.g. "Lok Sabha") | FIXED | `lexicon.ts` — 158-entry Indian pronunciation lexicon, voice-gated |
| 15 | Acronym misfire (SQL, API, AWS) | FIXED | `speech.ts` SPELL_ACRONYMS / WORD_ACRONYMS |
| 16 | Number/symbol mangling (₹10Cr, 100ms) | FIXED | `speech.ts` currency/percent/unit expansion, voice-only |
| 17 | Run-on sentences, no breathing room | FIXED | TTS_RULES (ellipses/em-dashes) + `unbrokenClause` gate |
| 18 | Tone flattening on questions | FIXED | TTS_RULES interrogative front-loading |
| 19 | Homograph trap (record/record, read/read) | FIXED | TTS_RULES — swap to an unambiguous synonym |
| 20 | Missing vocal emphasis | FIXED | `*word*` emphasis marker → em-dash pause (never ALL CAPS, which a TTS voice spells out letter-by-letter if it's also a real acronym) |
| 21 | Reading code aloud ("array bracket zero") | FIXED | TTS_RULES + `speech.ts` code-punctuation strip |
| 22 | Hindi code-switching on English technical terms | FIXED | `normalizeHindi()` — Devanagari expansion, not a 2-rule stub |
| 23 | Clunky quote attribution | FIXED | TTS_RULES quote-pause convention |
| 24 | Spatial collisions / out-of-bounds (12×12 grid) | FIXED | `schema.ts` superRefine overlap + boundary checks |
| 25 | State desync / dead-ends (pop empty stack, bad line ref) | FIXED | superRefine index/line checks; 7 painters that ignored `env.beats` re-locked to beat windows (Phase 7.1) |
| 26 | Hallucinated "magic" animations (invented actions) | FIXED | strict `z.enum` rejection of unlisted values |
| 27 | Code vs `expectedOutput` mismatch | FIXED | `pipeline.ts` `verifyScript` actually executes and reconciles |
| 28 | UI safe-zone violations on Shorts | FIXED | `shortSceneOverdense` soft gate + caption-aware `layout.safeBottom` (§5) |
| 29 | JSON quote escaping | FIXED | `jsonrepair.ts` balancer |
| 30 | Output token truncation | FIXED | `jsonrepair.ts` + raised `GEMINI_MAX_OUTPUT_TOKENS` |
| N1 | Render loop had no crash guard | FIXED | try/catch around `paintScene` in `engine.ts`, degrades to a titled fallback frame |
| N2 | ~~"11 orphan painters, dead code"~~ | **CORRECTED — this was never true.** All painter files map 1:1 to a real `SceneKind` in `painters/index.ts`; there are zero orphans. The real defect was root cause 4 (§2a): 35 REGISTERED kinds were invisible to the model due to a regex bug, not dead code — fixed by widening the regex, not by deletion. |
| N3 | Prompt vs validator word-budget mismatch, **and** a third duration figure | **CORRECTED.** The short/long word targets are a subset of the validator gate by design — fine. But `prompt.ts`'s topic-proposal prompt separately said "8 minutes" for long-form while the structure block said "6-12 min" and the calibrated word budget implies 7-11 min. Fixed 2026-08-08: the topic prompt now says "7-11 minutes," matching the other two. |
| N4 | `expectedOutput` is reconciled, not asserted | WON'T FIX | `pipeline.ts` overwrites a wrong-but-successful model output rather than flagging it — acceptable for render correctness, noted for awareness |
| N5 | 18 multi-beat scene kinds allow `.min(1)` on their step/item array | **OPEN** | a 1-element "multi-beat" scene is a disguised static card the schema can't distinguish from a real one — e.g. `diagram` (`schema.ts`), `chain`, `gauge`. Not yet audited kind-by-kind; would need either a per-kind `.min(2)` (risks rejecting a genuinely simple scene) or a soft gate that flags it without hard-failing. |
| N6 | `enhanceVideoMeta` re-writes `meta` after validation without re-validating, and drops `freeOnly` | **OPEN** | `videoMeta.ts` — one sub-call can bill a key during a free-only run |
| N7 | `refine`/`regen-scene` routes run no soft gates | **OPEN** | a UI refine or scene regen can silently push a shipped script out of word budget or introduce adjacent bigtexts — the gates only run in `/generate` |
| N8 | `compare` scene's on-screen items are voiceless | **OPEN** | up to 8 items with no narration beat backing them (`schema.ts`) |
| N9 | Learned directives can override `NARRATION_RULES` with no cap | **OPEN** | `prompt.ts` — one bad directive currently outranks the whole rule set it's supposed to refine |
| N10 | Soft gates are skipped entirely when a script is schema-invalid | **OPEN** | they sit in an `else` branch in `generate/route.ts` — a never-valid script gets zero content feedback, only schema errors |
| N11 | No MP4 deliverable | **OPEN** | output is webm-only; YouTube accepts it, Instagram/TikTok/X/WhatsApp do not. `ffmpeg-static` is already a dependency, already used with a working H.264 recipe in the unrelated news pipeline — reusing it for studio output is a contained follow-up |
| N12 | Rendering is real-time, single-threaded, with no dropped-frame telemetry | **OPEN**, structural | a 10-minute video takes 10 minutes wall-clock; a good render is indistinguishable from a subtly bad one without watching it. `README.md` already names the real fix (offline frame-by-frame encode via WebCodecs), which would also unlock 4K/60fps — out of scope for a prompt/content pass |
| N13 | 2D and 3D layers are lit from opposite sides | **OPEN**, needs a decision | `common.ts` isoBox hardcodes light-from-upper-left; `three3d.ts` studioLights puts the key upper-right. Fixing it is a judgement call about which direction wins across 111 painters, not a patch |
| N14 | Ship gate and automated containment audit can disagree | **WON'T FIX as a process gap, watch for it** | a kind can read `passed` in `qa/LEDGER.md` while `qa/AUDIT.md`'s pixel-level edge-bleed check still flags it — this was true historically for `steps`/`quiz`; re-run `npm run edge-audit` before trusting a ledger row blindly on a kind you haven't personally re-checked |

---

## 9. Known issues this spec does not fix

Carried forward from the working log, still true, recorded here so nobody re-discovers them from
scratch: the render pipeline is single-threaded real-time with no dropped-frame telemetry (N12); no MP4
export path (N11); the 2D/3D lighting mismatch (N13); `.min(1)` degenerate-card risk on 18 multi-beat
kinds (N5); `refine`/`regen-scene` bypassing soft gates (N7); learned directives with no override cap
(N9). None of these block shipping a video today — all are listed so a future session spends its budget
on something real instead of re-finding what's already known.

---

## 10. How to extend this app without breaking it

- **New scene kind**: touches exactly three places — the union in `schema.ts`, a module in `painters/`,
  and the `painters` record in `painters/index.ts` (re-exported as `ALL_SCENE_KINDS`, so QA tooling
  enumerates the real registry and can't drift). Then feature it in at least one `SUBJECT_KIT` or it
  will sit in the full menu, technically reachable, and never actually get picked — see §2b.
- **New subject**: add to `subjects.json` (taxonomy + `audience`/`style`), pick the closest cluster from
  §6 for its `CHANNEL_ARCS` entry, add a `SUBJECT_KIT` list of featured kinds, and — if it's going to
  carry real volume — author a gold exemplar pair for its cluster if one doesn't exist yet.
- **New painter, in general**: copy `painters/steps.ts` as the reference implementation — zero `enterT`
  ambient drift, 100% beat-driven, balanced `save()`/`restore()`. Use the `common.ts` motion toolkit
  (§5) rather than hand-rolling easing, staggers or a bob.
- **Before shipping any prompt change**: re-run `node scripts/exemplar-check.mjs --all` — the gold
  exemplars are the one thing in the repo that must keep passing every gate a generated script does.

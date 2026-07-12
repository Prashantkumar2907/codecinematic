# DevStudio — Design Brief for Desktop Figma Wireframes

## 1. What this product is

DevStudio is a **personal desktop web app** (runs locally in the browser, single
user, no accounts) that turns a chosen teaching topic into a finished YouTube
video. The user picks what to teach, an AI (Gemini) suggests topics and writes
the video script, the app **verifies any code in the script by actually running
it**, a neural voice narrates it, and the video is **rendered live on screen in
real time** while being recorded. Finished videos live in a Library where the
user copies metadata, downloads files, uploads to YouTube, or deletes.

It produces two formats:
- **Short** — 9:16 vertical, 45–90 seconds
- **Long** — 16:9 landscape, 6–12 minutes

Design target: **desktop only** (≥1280px). Current theme is dark
(bg `#0c1015`, surface `#12161d`, text `#e6edf3`, muted `#94a3b8`, accent
`#38bdf8` sky-blue, success `#4ade80`, warning `#facc15`, danger `#f87171`).
The designer may evolve the visual language, but dark is strongly preferred —
the videos themselves are dark, and the live preview is the hero of the screen.

Brand: configurable name (currently "DebHarbour"), logo mark is the `</>`
glyph. Voice/model/branding come from config, not UI (a Settings screen is an
optional extra — see §8).

---

## 2. Information architecture

```
Masthead (always visible)
├── Brand + product name
├── Flow hint: pick → generate → verify → render → publish
└── View switch (2 tabs): [ Create ] [ Library (n) ]

View 1: CREATE  — two-column: left control rail, right video stage
View 2: LIBRARY — two-column: left video list, right detail panel
```

There are exactly **two views**. No login, no onboarding, no marketing pages.

---

## 3. CREATE view — step-by-step flow with every state

The Create view is a **pipeline**: each step unlocks the next. A stepper /
wizard treatment is welcome, but all steps should remain visible/scrollable
(users go back and tweak).

### Step 1 — Choose what to teach (taxonomy)

Three **cascading selects**:
- **Subject** (8 today): Coding · History · Geography · Math & Aptitude ·
  Science · Money & Finance · English & Communication · GK & Amazing Facts
- **Module** (per subject, 3–7): e.g. Coding → Frontend, Backend, Database,
  DevOps, System Design, Key Technologies, AI & ML
- **Sub-module** (per module, 3–5): e.g. Frontend → JavaScript, React,
  Angular, CSS & Browser

Behavior: changing Subject resets Module + Sub-module; changing Module resets
Sub-module. Changing any of them **clears the topic suggestions** (step 3).
All three disabled while anything is busy.

States: normal · disabled(busy) · (no error state — data is local).

### Step 2 — Choose format

Segmented toggle: **Short (9:16)** | **Long (16:9)**. Switching it also
switches the aspect of the right-hand video stage (portrait phone frame vs
landscape frame). Disabled while busy.

### Step 3 — Get topics (AI call #1)

Primary button: **"Suggest 10 topics"**.

- **Loading**: 5–20 seconds (Gemini call). Button shows spinner + "Asking
  Gemini…". Design an in-list skeleton or shimmer for where topics will appear.
- **Success**: a vertical list of **10 topic cards**, ordered fundamental →
  advanced. Each card: **title** (≤100 chars, bold) + **angle** (≤140 chars,
  muted — the hook/approach). Cards are single-select (radio behavior);
  selected card gets accent border. Suggestions already **exclude every topic
  previously made** for this sub-module (the app tracks history).
- **Error**: inline error banner with the API message. Two notable real
  errors to design for: *quota exceeded* ("free tier limit … retry in Ns") and
  *generic failure* with a Retry affordance.
- **Alternative path**: a free-text input "Or type your own topic" — typing in
  it overrides any selected card. Both feed the same Generate button.
- Re-clicking "Suggest 10 topics" refreshes the list (new call).

### Step 4 — Generate the script (AI call #2, the big one)

Primary button: **"Generate short" / "Generate long"** (label follows format).
Disabled until a topic is selected or typed.

- **Loading**: **30–180 seconds** — this is the longest AI wait in the app.
  Currently just a button spinner; the designer should propose something more
  engaging for a 1–3 minute wait (staged status text like "writing scenes… /
  validating… / repairing…", an indeterminate progress treatment, etc. — the
  backend does do up to 2 automatic "repair rounds" when validation fails, so
  staged messaging is honest).
- **Error**: inline banner; may include a bullet list of validation issues
  ("Script failed validation after 2 repairs" + details). Needs a Retry.
- **Success** → the script appears (Step 5).

### Step 5 — Review the script

Two panels appear once a script exists:

**Scenes panel** — an ordered list of the video's scenes (a Short has 4–8, a
Long has 14–32; the list scrolls). Each row shows:
- index number
- **scene kind** — one of 7: `bigtext` (title card), `bullets` (key points),
  `code` (typing-animation code editor), `terminal` (command output),
  `diagram` (animated boxes+arrows), `compare` (side-by-side), `question`
  (ending challenge)
- a one-line description (the scene's title/text)
- **verification badge** — only on code scenes, one of:
  - `verified` (green) — the code was executed and its output matched
  - `patched` (yellow) — code ran, the AI's claimed output was wrong and was
    silently corrected with the real output
  - `failed` (red) — code errored/timed out; user should regenerate or edit
  - `skipped` (grey) — display-only language, not executable

Verification runs **automatically right after generation** (a couple of
seconds per code scene) — design a brief "verifying code…" state on the panel.

**Escape hatch**: "Edit JSON" toggles a monospace textarea with the whole
script; "Apply JSON" re-validates and re-verifies. Power-user feature — keep
it discoverable but secondary.

**Metadata panel** — editable **Title** (live character count, target ≤100)
and **Description** (multiline), plus a read-only row of hashtags
(e.g. `#JavaScript #WebDev #Shorts`). These are what get uploaded to YouTube.

### Step 6 — Render (the hero moment)

Right-hand **stage**: a framed canvas in the chosen aspect (portrait
phone-like frame for Shorts, wide frame for Long).

Primary button: **"Render video"**.

- **Voicing state**: 5–60s ("synthesizing narration…") — every narration beat
  is voiced separately before rendering starts.
- **Rendering state**: the video **plays live on the canvas with audible
  narration while it records — in real time**. A 60s Short takes 60s; a 10-min
  Long takes 10 minutes. This is a deliberate, honest constraint. Design:
  - a determinate **progress bar** (true % known) + status line
    ("recording scene 7/21 — 43%")
  - a **Cancel render** button
  - the live canvas IS the entertainment; give it maximum space
- **Done**: the canvas is replaced by a **video player** (with controls) of
  the finished webm; status line shows "done — 34.1 MB webm". Button becomes
  "Re-render" (e.g. after editing metadata/JSON).
- **Error**: banner + return to script state.

### Step 7 — Save & publish

Action row under the stage:
- **"Save to library"** — fast (1–3s); after saving the button locks to
  "Saved to library". Saving also: generates a **thumbnail** automatically,
  appends **YouTube chapters** to the description (Long only, computed from
  the real render timings), and records the video in history.
- **Privacy select**: private / unlisted / public (default private).
- **"Upload to YouTube"** — 10–90s spinner state; success shows a green
  confirmation with the youtu.be link ("review in YouTube Studio, then
  publish"). If unsaved, uploading saves first automatically.
- Errors: banner (e.g. missing credentials, YouTube API failure).

---

## 4. LIBRARY view — step-by-step

### Left: video list
Scrollable list of **draft cards**, newest first. Each card:
- thumbnail (16:9 image, auto-generated) — fallback tile with format label if
  missing
- title (2-line clamp)
- meta row: format pill (`short`/`long`) · subject · file size (MB) ·
  "uploaded" indicator when on YouTube
- selected state (accent border)

**Empty state**: "No videos yet — generate one in the Create tab" with a CTA
that switches to Create.

### Right: detail panel (for the selected video)
Top to bottom:
1. **Video player** — seekable (backend supports range requests), full width.
2. **Copy fields** — three labelled blocks, each with its own Copy button and
   "Copied ✓" feedback (1.5s):
   - Title
   - Description (**"Copy with hashtags"** — appends the hashtag line; for
     Long videos the description already contains a `Chapters:` block with
     timestamps like `0:00 Intro / 0:33 Problem: Linear Scan`)
   - Tags (comma-separated)
3. **Thumbnail preview** (the actual PNG).
4. **Action row**:
   - Download video (**.webm** — YouTube-supported upload format)
   - Download thumbnail (**.png**)
   - privacy select + **Upload to YouTube** (disabled + "Already uploaded"
     when it has a videoId; uploading state as in Create)
   - **Delete** (danger style) — native confirm today; designer may propose a
     nicer confirm. Important copy point: *deleting removes the files but the
     topic stays in history so it will never be re-suggested.*
5. If uploaded: a green block linking to `youtu.be/<id>`.

**Empty-selection state**: "Select a video on the left to see its details,
downloads and upload options."

---

## 5. Global states & feedback inventory (design each)

| State | Where | Duration | Notes |
|---|---|---|---|
| Asking Gemini (topics) | Create step 3 | 5–20s | spinner + skeleton list |
| Generating script | Create step 4 | 30–180s | longest AI wait; staged text honest ("writing / validating / repairing") |
| Verifying code | Scenes panel | 1–10s | per-code-scene, automatic |
| Voicing narration | Stage | 5–60s | before render |
| Rendering/recording | Stage | 60s–12min, real-time | determinate progress + cancel + live canvas w/ sound |
| Saving draft | Stage | 1–3s | then locked "Saved" |
| Uploading | Stage & Library | 10–90s | then success link |
| Copied feedback | Library | 1.5s | per-field |
| Error banner | both views | until dismissed/retried | red, message may be multi-line incl. quota errors |
| Empty states | topics, scenes, library list, library detail | — | each needs an invitation to act |
| Disabled | everything while busy | — | one operation at a time, app-wide |

Accessibility invariants to keep: visible focus rings on all interactive
elements, 44px minimum touch targets, status line uses `aria-live`.

---

## 6. Data available to display (per video)

`slug` (folder id), `format`, `subject`, `module`, `submodule`, `topic`,
`title`, `description` (may contain Chapters block), `tags[]`, `hashtags[]`,
`videoBytes`, `savedAt` (ISO date), `hasVideo`, `hasThumbnail`,
`videoId?` (when uploaded). Scene list additionally: kind, per-scene
description, verify status. Use whatever improves scannability.

---

## 7. Functional invariants (do NOT design these away)

1. Rendering is **real-time** and the live canvas with audio is the preview —
   there is no "instant export".
2. Verification badges (verified/patched/failed/skipped) must stay visible on
   code scenes — they are the trust signal of the product.
3. One pipeline operation at a time (no parallel generate + render).
4. Downloads are .webm + .png (YouTube accepts webm natively — no mp4 step).
5. Upload defaults to **private**; the user publishes manually on YouTube.
6. Delete keeps the topic in history (never re-suggested) — the confirm copy
   must say this.
7. Desktop-only; two views; no auth.

---

## 8. Optional extras the designer MAY propose (not built yet)

- A **Settings** modal/screen: brand name, voice picker, Gemini model,
  channel connection status.
- A stepper/wizard visual for the Create pipeline with step completion states.
- Toast system replacing inline status lines.
- Scene-list thumbnails (mini previews per scene kind — icons exist per kind).
- Filters/search in Library (by subject, format, uploaded state).
- A "quota meter" for the Gemini free tier (20 requests/day).
- Nicer delete confirmation dialog.

Deliverable requested from the designer: desktop wireframes (1440px frame) for
— Create view in its key states (idle, topics loaded, script loaded with
badges, rendering with progress, rendered with player, uploaded), Library view
(list + detail, empty states), error banner treatment, and any proposed
extras — consistent component styles (buttons incl. disabled/loading, selects,
cards, badges, progress, copy fields) so the app feels like one system.

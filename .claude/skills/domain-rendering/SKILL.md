---
name: domain-rendering
description: Load when editing CodeCinematic browser video rendering, Canvas drawing, MediaRecorder capture, typing audio, captions, or creator panels.
---

# Rendering Domain

## When to use this skill
Use this before changing `src/components/editor/create-video-panel.tsx`, `src/components/editor/render-utils.tsx`, or any creator panel/render helper under `src/components/editor`.

## Quick reference
- Main code renderer: `src/components/editor/create-video-panel.tsx`
- Pipeline renderer: `src/components/editor/render-utils.tsx`
- MediaRecorder helpers: `src/components/editor/shared/media-recorder.ts`
- Canvas helpers: `src/components/editor/shared/canvas-utils.ts`
- Audio helpers: `src/components/editor/shared/audio-utils.ts`
- Render status UI: `src/components/editor/shared/render-status-panel.tsx`
- Font catalog: `src/components/editor/shared/font-catalog.ts`

## Core render rules
- Rendering is browser-only; throw or show an error when `window`, `CanvasRenderingContext2D`, or `MediaRecorder` is unavailable.
- Use Canvas plus `captureStream(0)` and `requestFrame()` when supported so every painted frame is captured.
- Keep recorded animation paced to real time; high refresh displays must not speed up exports.
- Keep `AudioContext` as a singleton in `CreateVideoPanel` to avoid browser context limits during repeated renders.
- Use `createWebmRecorder()` and `createWebmBlob()` instead of direct `new MediaRecorder(...)` boilerplate.
- Render output is WebM in current UI/API flow even when API schema also accepts `mp4`.

## Timing and typing
- Code render durations are line-based: focused lines use slower ms-per-character and extra padding.
- Empty lines get a short pause.
- Max render duration is currently 3 minutes and long-render warning starts at 45 seconds in `CreateVideoPanel`.
- Focus lines drive highlighted rows, focus flash particles, and active subtitles.
- Wrapping must keep continuation rows visually distinct and should not repeat the same line number on every continuation.

## Audio and captions
- Typing sounds are scheduled per character with whitespace attenuation.
- Supported code render sounds: `off`, `soft`, `typewriter`, `keyboard`, `chime`.
- Narration is represented by `Narration` in `src/lib/narration.ts`; current create-video flow uses browser `speechSynthesis` for narration timing.
- `RenderStatusPanel` should communicate empty/loading/error/success states for render flows.

## Creator panels
- Word/fact panels use `loadGoogleFonts`, `BgPicker`, `drawBackground`, `wrapText`, `playTypingPulse`, and shared MediaRecorder helpers.
- Hindi/Bollywood panels have format-specific presets and font loading; preserve their specialized background/font choices.
- Background uploads use object URLs and should revoke URLs on cleanup.
- Creator panels currently keep settings in local component state, unlike Code Studio drafts.

## Do not
- Do not move rendering server-side without a deliberate architecture change; current product value is browser-native rendering.
- Do not close the shared `AudioContext` between code-video renders.
- Do not add reusable canvas/audio/MediaRecorder logic directly into large panels when it can live in `src/components/editor/shared`.
- Do not silently cut off long code; validate duration and show a visible error/warning.

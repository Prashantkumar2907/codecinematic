import { sceneBeats, type SceneScript, type SceneTiming } from "./schema";
import { paintScene, type BeatWindow } from "./painters";
import {
  drawBackground,
  makeLayout,
  paletteForSubject,
  variantOf,
  BG_MOTIFS,
  THEME,
  FONT_SANS,
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  easeOutBack,
  wrapText,
  roundRect,
  rgba,
  type Palette,
} from "./painters/common";

/** One narration beat's audio; beatId is `${sceneId}#${index}` (see sceneBeats). */
export type BeatAudio = { beatId: string; mp3: ArrayBuffer; durationMs: number };

export type RenderPlan = {
  script: SceneScript;
  timings: SceneTiming[];
  audio: BeatAudio[];
  width: number;
  height: number;
  brand: string;
};

export type RenderHandle = {
  done: Promise<Blob | null>;
  cancel: () => void;
};

const MIN_SCENE_MS = 2800;
const INTER_BEAT_GAP_MS = 180;
/** Thinking time between a quiz question and its answer reveal — the painter
 *  shows a countdown ring over this window so viewers actually get to guess. */
export const QUIZ_THINK_MS = 3200;
const SCENE_TAIL_MS = 750;
/* Shorts live or die on pace — trim the pauses between beats and scenes. */
const SHORT_INTER_BEAT_GAP_MS = 140;
const SHORT_SCENE_TAIL_MS = 450;
const TRANSITION_MS = 420;
const END_HOLD_MS = 600;
/* Branded intro sting / outro end-card. Shorts get NO intro — the hook must own
 * second zero or the swipe is lost — and no outro either: Shorts have no end
 * screens and any non-content tail costs the loop. Long-form needs >= 5 s of
 * tail or YouTube will not let an end screen (subscribe / next video / playlist)
 * be attached at all, which is why this was 0 and drawOutro was unreachable. */
const INTRO_MS_LONG = 900;
const OUTRO_MS_LONG = 5200;
const OUTRO_MS_SHORT = 0;

/** Intro/outro extents for a format — page.tsx uses this to offset SRT captions
 *  and YouTube chapter timestamps so they match the final video timeline. */
export function introOutroMs(format: "short" | "long"): { introMs: number; outroMs: number } {
  return format === "long"
    ? { introMs: INTRO_MS_LONG, outroMs: OUTRO_MS_LONG }
    : { introMs: 0, outroMs: OUTRO_MS_SHORT };
}
const VIDEO_BPS = 12_000_000;
const AUDIO_BPS = 192_000;
const FPS = 30;

export function computeTimings(script: SceneScript, audio: BeatAudio[]): SceneTiming[] {
  const byBeatId = new Map(audio.map((a) => [a.beatId, a.durationMs]));
  const gapMs = script.format === "short" ? SHORT_INTER_BEAT_GAP_MS : INTER_BEAT_GAP_MS;
  const tailMs = script.format === "short" ? SHORT_SCENE_TAIL_MS : SCENE_TAIL_MS;
  const timings: SceneTiming[] = [];
  let cursor = 0;
  for (const scene of script.scenes) {
    const beats: { startMs: number; durationMs: number }[] = [];
    let beatCursor = 0;
    sceneBeats(scene).forEach(({ beatId }, k) => {
      const durationMs = byBeatId.get(beatId) ?? 1200;
      beats.push({ startMs: beatCursor, durationMs });
      // Quiz gets a think-time window between question and reveal.
      const thinkMs = scene.kind === "quiz" && k === 0 ? QUIZ_THINK_MS : 0;
      beatCursor += durationMs + gapMs + thinkMs;
    });
    const durationMs = Math.max(MIN_SCENE_MS, beatCursor - gapMs + tailMs);
    timings.push({ sceneId: scene.id, startMs: cursor, durationMs, beats });
    cursor += durationMs;
  }
  return timings;
}

export function totalDurationMs(timings: SceneTiming[]): number {
  const last = timings[timings.length - 1];
  return last ? last.startMs + last.durationMs + END_HOLD_MS : 0;
}

function beatWindows(timing: SceneTiming): BeatWindow[] {
  return timing.beats.map((b) => ({
    start: b.startMs / timing.durationMs,
    end: Math.min(1, (b.startMs + b.durationMs) / timing.durationMs),
  }));
}

function pickMime(): string | undefined {
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) =>
    MediaRecorder.isTypeSupported(m)
  );
}

async function scheduleNarration(
  audioCtx: AudioContext,
  dest: MediaStreamAudioDestinationNode | null,
  plan: RenderPlan,
  startAt: number
) {
  const sceneStartById = new Map(plan.timings.map((t) => [t.sceneId, t] as const));
  const beatOffset = new Map<string, number>();
  for (const scene of plan.script.scenes) {
    const timing = sceneStartById.get(scene.id);
    if (!timing) continue;
    sceneBeats(scene).forEach(({ beatId }, k) => {
      const beat = timing.beats[k];
      if (beat) beatOffset.set(beatId, timing.startMs + beat.startMs);
    });
  }
  const decoded = await Promise.all(
    plan.audio.map(async (a) => ({
      beatId: a.beatId,
      buffer: await audioCtx.decodeAudioData(a.mp3.slice(0)),
    }))
  );
  for (const { beatId, buffer } of decoded) {
    const offset = beatOffset.get(beatId);
    if (offset === undefined) continue;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.value = 1.0;
    source.connect(gain);
    if (dest) gain.connect(dest);
    gain.connect(audioCtx.destination);
    source.start(startAt + offset / 1000);
  }
}

/** Quiet music bed under the narration; fades in/out with the video. */
/** ~-22 dBFS: audible under narration without ducking, which is out of scope.
 *  0.05 was ~-26 dBFS — inaudible even in the gaps between beats. */
const MUSIC_GAIN = 0.079;
const MUSIC_FADE_IN_S = 0.8;
const MUSIC_FADE_OUT_S = 1.5;

/** Mixes public/music.mp3 (if present) into playback + recording. Absent file = silent no-op. */
async function scheduleMusic(
  audioCtx: AudioContext,
  dest: MediaStreamAudioDestinationNode | null,
  startAt: number,
  totalMs: number
) {
  try {
    const res = await fetch("/music.mp3");
    if (!res.ok) {
      // There was no public/ directory at all, so this 404'd on every render and
      // every video shipped as bare narration over silence — silently, because
      // the failure is a no-op by design. Say so once per render instead.
      console.warn("[engine] no public/music.mp3 — rendering narration over silence");
      return;
    }
    const buffer = await audioCtx.decodeAudioData(await res.arrayBuffer());
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = audioCtx.createGain();
    const totalS = totalMs / 1000;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(MUSIC_GAIN, startAt + MUSIC_FADE_IN_S);
    gain.gain.setValueAtTime(MUSIC_GAIN, startAt + Math.max(MUSIC_FADE_IN_S, totalS - MUSIC_FADE_OUT_S));
    gain.gain.linearRampToValueAtTime(0, startAt + totalS);
    source.connect(gain);
    if (dest) gain.connect(dest);
    gain.connect(audioCtx.destination);
    source.start(startAt);
    source.stop(startAt + totalS + 0.1);
  } catch {
    /* no or undecodable music file — render narration-only */
  }
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  overallP: number,
  brand: string,
  palette: Palette
) {
  const unit = Math.min(w, h) / 24;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, 0, w, unit * 0.22);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, w * clamp01(overallP), unit * 0.22);

  ctx.font = `700 ${unit * 0.62}px ${FONT_SANS}`;
  const label = `</>  ${brand}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(230,237,243,0.4)";
  ctx.fillText(label, w - unit * 0.8, h - unit * 0.7);
  ctx.textAlign = "start";
  ctx.restore();
}

/** Branded intro sting. Four seeded openers (`variant`) so back-to-back videos
 *  don't share one animation: 0 mark-stack, 1 typed brand, 2 staggered letters,
 *  3 expanding rings. t is 0-1 across the intro. */
function drawIntro(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, brand: string, palette: Palette, variant = 0) {
  const unit = Math.min(w, h) / 24;
  const inP = easeInOutCubic(clamp01(t / 0.35));
  const outP = clamp01((t - 0.78) / 0.22); // fade the card away over the last fifth
  ctx.save();
  ctx.globalAlpha = 1 - outP;
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h * 0.46, 0, w / 2, h * 0.46, Math.min(w, h) * 0.45);
  glow.addColorStop(0, rgba(palette.accent, 0.16 * inP));
  glow.addColorStop(1, rgba(palette.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(w / 2, h * 0.46);

  if (variant === 1) {
    // Typed brand with a blinking caret under a small kicker.
    ctx.globalAlpha = (1 - outP) * inP;
    ctx.font = `700 ${unit * 0.8}px ${FONT_SANS}`;
    ctx.fillStyle = palette.accent;
    ctx.fillText("PRESENTS", 0, -unit * 2.0);
    ctx.font = `900 ${unit * 2.1}px ${FONT_SANS}`;
    const chars = Array.from(brand);
    const shown = Math.max(0, Math.round(chars.length * clamp01((t - 0.12) / 0.5)));
    const typed = chars.slice(0, shown).join("");
    const fullW = ctx.measureText(brand).width;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "left";
    ctx.fillText(typed, -fullW / 2, unit * 0.2);
    const caretX = -fullW / 2 + ctx.measureText(typed).width + unit * 0.12;
    if (t < 0.8 && Math.floor(t * 10) % 2 === 0) {
      ctx.fillStyle = palette.accent;
      ctx.fillRect(caretX, -unit * 0.75, unit * 0.16, unit * 1.5);
    }
    ctx.textAlign = "center";
  } else if (variant === 2) {
    // Letters rise with a stagger; accent ticks flank the wordmark.
    ctx.font = `900 ${unit * 2.1}px ${FONT_SANS}`;
    const chars = Array.from(brand);
    const widths = chars.map((c) => ctx.measureText(c).width);
    const totalW = widths.reduce((a, b) => a + b, 0);
    let x = -totalW / 2;
    chars.forEach((c, i) => {
      const ci = easeOutCubic(clamp01((t - 0.1 - i * 0.05) / 0.3));
      ctx.globalAlpha = (1 - outP) * ci;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "left";
      ctx.fillText(c, x, unit * 0.2 + (1 - ci) * unit * 0.9);
      x += widths[i];
    });
    ctx.textAlign = "center";
    ctx.globalAlpha = (1 - outP) * inP;
    const tickW = unit * 1.6 * easeOutCubic(clamp01((t - 0.3) / 0.3));
    ctx.fillStyle = palette.accent;
    ctx.fillRect(-totalW / 2 - unit * 0.5 - tickW, -unit * 0.1, tickW, unit * 0.18);
    ctx.fillRect(totalW / 2 + unit * 0.5, -unit * 0.1, tickW, unit * 0.18);
  } else if (variant === 3) {
    // Expanding concentric rings behind a scaling wordmark.
    for (let i = 0; i < 3; i++) {
      const rp = clamp01((t - 0.05 - i * 0.12) / 0.5);
      if (rp <= 0) continue;
      ctx.globalAlpha = (1 - outP) * (1 - rp) * 0.6;
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = unit * 0.1;
      ctx.beginPath();
      ctx.arc(0, 0, rp * Math.min(w, h) * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    const s = 0.6 + 0.4 * easeOutBack(inP);
    ctx.globalAlpha = (1 - outP) * inP;
    ctx.save();
    ctx.scale(s, s);
    ctx.font = `900 ${unit * 2.1}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(brand, 0, unit * 0.2);
    ctx.restore();
  } else {
    // 0 — mark stack: </> glyph over the wordmark with an underline sweep.
    const scale = 0.82 + 0.18 * easeInOutCubic(inP);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.font = `900 ${unit * 1.6}px ${FONT_SANS}`;
    ctx.fillStyle = palette.accent;
    ctx.fillText("</>", 0, -unit * 1.5);
    ctx.font = `900 ${unit * 2.1}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.globalAlpha = (1 - outP) * inP;
    ctx.fillText(brand, 0, unit * 0.4);
    const underW = unit * 7 * easeInOutCubic(clamp01((t - 0.2) / 0.35));
    ctx.fillStyle = palette.accent;
    ctx.fillRect(-underW / 2, unit * 1.7, underW, unit * 0.16);
    ctx.restore();
  }
  ctx.restore();
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/** Outro end-card: the last frame dims, brand + a Subscribe pill pop in. */
function drawOutro(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, brand: string, palette: Palette) {
  const unit = Math.min(w, h) / 24;
  const inP = easeInOutCubic(clamp01(t / 0.4));
  ctx.save();
  ctx.fillStyle = rgba("#05070a", 0.72 * inP);
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = inP;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${unit * 1.5}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.fillText(brand, w / 2, h * 0.42 - unit * 1.4);
  // Subscribe pill pops with a slight overshoot, then breathes.
  const pillPop = clamp01((t - 0.25) / 0.3);
  const s = pillPop < 1 ? 0.7 + 0.3 * (1 + 1.7 * Math.pow(pillPop - 1, 3) + 1.7 * Math.pow(pillPop - 1, 2)) : 1 + 0.02 * Math.sin(t * 24);
  const pillW = unit * 8.6;
  const pillH = unit * 1.9;
  ctx.translate(w / 2, h * 0.42 + unit * 0.6);
  ctx.scale(Math.max(0.01, s), Math.max(0.01, s));
  ctx.fillStyle = "#e11d48";
  ctx.beginPath();
  const r = pillH / 2;
  ctx.roundRect ? ctx.roundRect(-pillW / 2, -pillH / 2, pillW, pillH, r) : ctx.rect(-pillW / 2, -pillH / 2, pillW, pillH);
  ctx.fill();
  ctx.font = `800 ${unit * 0.92}px ${FONT_SANS}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("SUBSCRIBE", 0, unit * 0.04);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = inP * 0.85;
  ctx.font = `600 ${unit * 0.72}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.fillText("new videos daily", w / 2, h * 0.42 + unit * 2.6);
  ctx.restore();
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

export type CaptionStyle = "off" | "karaoke" | "word" | "pop" | "boxed";
export const CAPTION_STYLES: CaptionStyle[] = ["off", "karaoke", "word", "pop", "boxed"];
export type CaptionPos = "top" | "center" | "bottom";
export const CAPTION_POSITIONS: CaptionPos[] = ["top", "center", "bottom"];

/** The line being spoken right now in this scene, plus how far through it we are. */
function activeCaption(scene: SceneScript["scenes"][number], timing: SceneTiming, sceneElapsedMs: number) {
  const texts = sceneBeats(scene);
  let idx = -1;
  for (let k = 0; k < timing.beats.length; k++) {
    const b = timing.beats[k];
    if (sceneElapsedMs >= b.startMs) idx = k; // last beat that has started
    if (sceneElapsedMs < b.startMs + b.durationMs) break;
  }
  if (idx < 0) return null;
  const b = timing.beats[idx];
  const text = (texts[idx]?.text ?? "").trim();
  if (!text) return null;
  return { text, progress: clamp01((sceneElapsedMs - b.startMs) / Math.max(1, b.durationMs)) };
}

/** Lines of caption on screen at once. More than this and the lower third
 *  starts eating the frame; the rest of the beat pages in behind it. */
const CAPTION_LINES = 3;

type CaptionPage = {
  lines: string[];
  /** Index, within the whole beat, of this page's first word. */
  firstWord: number;
  totalWords: number;
  /** 0-1 through this page, for per-page entrance animations. */
  localProgress: number;
};

/**
 * The slice of a wrapped beat that is on screen at `progress`. Pages advance in
 * proportion to their word count, so the page turns roughly when the narration
 * reaches it — the same linear assumption karaoke already makes, which is the
 * best available until edge-tts word timings land (see improvement_plan Phase 12a).
 */
function paginate(allLines: string[], perPage: number, progress: number): CaptionPage {
  const wordsIn = (line: string) => line.split(/\s+/).filter(Boolean).length;
  const totalWords = allLines.reduce((n, l) => n + wordsIn(l), 0);
  if (allLines.length <= perPage || totalWords === 0) {
    return { lines: allLines, firstWord: 0, totalWords, localProgress: progress };
  }
  const spoken = clamp01(progress) * totalWords;
  let firstWord = 0;
  for (let start = 0; start < allLines.length; start += perPage) {
    const lines = allLines.slice(start, start + perPage);
    const pageWords = lines.reduce((n, l) => n + wordsIn(l), 0);
    const isLast = start + perPage >= allLines.length;
    if (isLast || spoken < firstWord + pageWords) {
      return { lines, firstWord, totalWords, localProgress: clamp01((spoken - firstWord) / pageWords) };
    }
    firstWord += pageWords;
  }
  return { lines: allLines.slice(0, perPage), firstWord: 0, totalWords, localProgress: progress };
}

/**
 * Burned-in captions from the spoken beat text, drawn in the lower third so muted
 * autoplay still reads. Three deterministic looks: karaoke (word-by-word fill),
 * pop (whole line springs in), boxed (bold accent bars, "hormozi" style).
 */
function drawCaptions(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  progress: number,
  style: CaptionStyle,
  pos: CaptionPos,
  palette: Palette
) {
  if (style === "off" || !text) return;
  const unit = Math.min(w, h) / 24;
  const isShort = h > w;
  const cx = w / 2;

  // "word" is a one-word-at-a-time kinetic caption (TikTok/Reels style).
  if (style === "word") {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const idx = Math.min(words.length - 1, Math.floor(progress * words.length));
    const word = words[idx];
    const wordP = progress * words.length - idx; // 0-1 within this word
    const cy = pos === "top" ? h * 0.2 : pos === "center" ? h * 0.5 : isShort ? h * 0.74 : h * 0.82;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const px = unit * (isShort ? 2.2 : 1.7);
    ctx.font = `900 ${px}px ${FONT_SANS}`;
    const pop = easeInOutCubic(clamp01(wordP / 0.25));
    const scale = 0.8 + 0.2 * pop;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    const tw = ctx.measureText(word).width;
    ctx.fillStyle = rgba("#05070a", 0.6);
    roundRect(ctx, -tw / 2 - unit * 0.5, -px * 0.62, tw + unit, px * 1.24, unit * 0.25);
    ctx.fill();
    ctx.fillStyle = palette.accent;
    ctx.fillText(word.toUpperCase(), 0, 0);
    ctx.restore();
    return;
  }

  const fontPx = unit * (isShort ? 1.15 : 0.92);
  const lineH = fontPx * 1.28;
  const maxW = w * 0.86;
  ctx.save();
  ctx.font = `800 ${fontPx}px ${FONT_SANS}`;
  ctx.textBaseline = "middle";
  // A beat may be 320 chars but only ~3 lines fit. Page through the wrap in step
  // with the narration instead of `.slice(0, 3)`, which dropped the end of the
  // sentence with no ellipsis and left karaoke's word index pointing past the
  // last rendered word — the highlight vanished and the block froze "done".
  const page = paginate(wrapText(ctx, text, maxW), CAPTION_LINES, progress);
  const lines = page.lines;
  const blockH = lines.length * lineH;
  const bottomY = isShort ? h * 0.7 : h * 0.82;
  const centerAnchor = pos === "top" ? h * 0.18 : pos === "center" ? h * 0.5 : bottomY;
  const baseY = centerAnchor - blockH / 2;

  if (style === "boxed") {
    ctx.textAlign = "center";
    lines.forEach((line, i) => {
      const y = baseY + i * lineH + lineH / 2;
      const tw = ctx.measureText(line).width;
      const padX = unit * 0.5;
      const boxW = tw + padX * 2;
      const boxH = lineH * 0.92;
      ctx.fillStyle = palette.accent;
      roundRect(ctx, cx - boxW / 2, y - boxH / 2, boxW, boxH, unit * 0.18);
      ctx.fill();
      ctx.fillStyle = "#0b0f14";
      ctx.fillText(line, cx, y);
    });
    ctx.restore();
    return;
  }

  // Shared dark backdrop for karaoke/pop legibility over any scene.
  const pad = unit * 0.5;
  ctx.fillStyle = rgba("#05070a", 0.55);
  roundRect(ctx, cx - maxW / 2 - pad, baseY - pad, maxW + pad * 2, blockH + pad * 2, unit * 0.3);
  ctx.fill();

  if (style === "pop") {
    const inP = easeInOutCubic(clamp01(page.localProgress / 0.18));
    ctx.textAlign = "center";
    ctx.globalAlpha = inP;
    ctx.translate(cx, 0);
    ctx.scale(0.94 + 0.06 * inP, 0.94 + 0.06 * inP);
    lines.forEach((line, i) => {
      const y = baseY + i * lineH + lineH / 2;
      ctx.fillStyle = THEME.text;
      ctx.fillText(line, 0, y);
    });
    ctx.restore();
    return;
  }

  // karaoke: fill words up to the spoken position; the current word glows accent.
  // `spoken` counts from the start of the whole beat, so it is rebased onto the
  // page actually on screen.
  const spoken = Math.floor(progress * page.totalWords) - page.firstWord;
  ctx.textAlign = "left";
  let wi = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineWords = lines[i].split(/\s+/).filter(Boolean);
    const lineW = ctx.measureText(lines[i]).width;
    let x = cx - lineW / 2;
    const y = baseY + i * lineH + lineH / 2;
    for (const word of lineWords) {
      const done = wi < spoken;
      const current = wi === spoken;
      // Unspoken at 0.45 measured 4.0:1 — the words you are about to hear were
      // the least readable thing on screen. 0.6 is 6.3:1, still well below the
      // 16.7:1 of the words already spoken.
      ctx.fillStyle = current ? palette.accent : done ? THEME.text : rgba("#e6edf3", 0.6);
      ctx.fillText(word + " ", x, y);
      x += ctx.measureText(word + " ").width;
      wi++;
    }
  }
  ctx.restore();
}

/**
 * Plays the plan on `canvas` in real time. When `record` is set, returns the
 * recorded webm; otherwise resolves null when playback finishes.
 */
export function runPlan(
  canvas: HTMLCanvasElement,
  plan: RenderPlan,
  opts: {
    record: boolean;
    muted?: boolean;
    /**
     * Pass a context created synchronously inside the user's click. One created
     * here (after voicing's long awaits) starts "suspended" in real browsers and
     * resume() never settles — the render then hangs at 0% forever.
     */
    audioCtx?: AudioContext;
    captionStyle?: CaptionStyle;
    captionPos?: CaptionPos;
    onProgress?: (p: number, label: string) => void;
  }
): RenderHandle {
  const { width, height } = plan;
  // Captions default on: karaoke for shorts (muted autoplay), pop for long-form.
  const captionStyle: CaptionStyle = opts.captionStyle ?? (plan.script.format === "short" ? "karaoke" : "pop");
  const captionPos: CaptionPos = opts.captionPos ?? "bottom";
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const layout = makeLayout(width, height);
  const palette = paletteForSubject(plan.script.subject);
  // One background motif per video, one transition style per scene boundary —
  // both deterministic so a re-render of the same script looks identical.
  const motif = variantOf(`${plan.script.topic}|${plan.script.subject}`, BG_MOTIFS);
  const introVariant = variantOf(`intro:${plan.script.topic}|${plan.brand}`, 4);
  // Each scene owns the transition it ARRIVES on, keyed by its own id so the
  // choice is deterministic. Index 0 is intentionally never read: the first
  // scene arrives out of the intro, not out of another scene.
  const transitions = plan.script.scenes.map((s) => variantOf(`tr:${s.id}`, 4));
  const { introMs, outroMs } = introOutroMs(plan.script.format);
  const contentMs = totalDurationMs(plan.timings);
  const total = introMs + contentMs + outroMs;
  const sceneCount = plan.script.scenes.length;
  const sceneCanvas = document.createElement("canvas");
  sceneCanvas.width = width;
  sceneCanvas.height = height;
  const sceneCtx = sceneCanvas.getContext("2d")!;

  let cancelled = false;
  let recorder: MediaRecorder | null = null;
  const chunks: BlobPart[] = [];

  const done = (async (): Promise<Blob | null> => {
    const audioCtx = opts.audioCtx ?? new AudioContext();
    if (audioCtx.state === "suspended") {
      // resume() stays pending forever when autoplay policy blocks it — never
      // await it bare. Race a deadline and fail loud instead of hanging.
      const resumed = await Promise.race([
        audioCtx.resume().then(() => true),
        new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
      ]);
      if (!resumed && (audioCtx.state as AudioContextState) !== "running") {
        await audioCtx.close().catch(() => {});
        throw new Error("The browser blocked audio start — click “Render video” again (audio unlocks on a click).");
      }
    }
    const audioDest = opts.record ? audioCtx.createMediaStreamDestination() : null;

    let stopped: Promise<Blob | null> = Promise.resolve(null);
    let videoTrack: MediaStreamTrack | null = null;
    if (opts.record) {
      const mime = pickMime();
      if (!mime) {
        await audioCtx.close().catch(() => {});
        throw new Error("This browser can't record webm video (MediaRecorder). Use Chrome or Edge.");
      }
      videoTrack = canvas.captureStream(FPS).getVideoTracks()[0] ?? null;
      const stream = new MediaStream([
        ...(videoTrack ? [videoTrack] : []),
        ...(audioDest ? audioDest.stream.getAudioTracks() : []),
      ]);
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: VIDEO_BPS,
        audioBitsPerSecond: AUDIO_BPS,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      stopped = new Promise<Blob | null>((resolve) => {
        recorder!.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: "video/webm" }));
        };
      });
      recorder.start(250);
    }

    const AUDIO_LEAD_S = 0.15;
    const startAt = audioCtx.currentTime + AUDIO_LEAD_S;
    try {
      // Narration waits for the intro sting; music runs under intro AND outro.
      await scheduleNarration(audioCtx, audioDest, plan, startAt + introMs / 1000);
      await scheduleMusic(audioCtx, audioDest, startAt, total);
    } catch (err) {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      await audioCtx.close().catch(() => {});
      throw err;
    }
    const t0 = performance.now() + AUDIO_LEAD_S * 1000;

    const scenesWithTiming = plan.script.scenes.map((scene, i) => ({
      scene,
      timing: plan.timings[i],
      windows: beatWindows(plan.timings[i]),
      index: i,
    }));

    const paintAt = (target: CanvasRenderingContext2D, entryIndex: number, elapsed: number) => {
      const { scene, timing, windows, index } = scenesWithTiming[entryIndex];
      drawBackground(target, width, height, elapsed, palette, motif);
      try {
        paintScene(target, scene, {
          layout,
          p: clamp01((elapsed - timing.startMs) / timing.durationMs),
          elapsedMs: elapsed - timing.startMs,
          durationMs: timing.durationMs,
          beats: windows,
          sceneIndex: index,
          sceneCount,
          palette,
        });
      } catch (err) {
        // A painter throwing on a field the schema didn't guard must not kill the whole
        // render loop — degrade to a titled fallback frame so the rest of the video renders.
        console.error(`[engine] scene "${scene.id}" (${scene.kind}) failed to paint:`, err);
        const label = (scene as { title?: string; text?: string }).title
          ?? (scene as { title?: string; text?: string }).text
          ?? `Scene ${index + 1}`;
        target.save();
        target.fillStyle = rgba(THEME.text, 0.5);
        target.font = `500 ${Math.round(height * 0.022)}px system-ui, -apple-system, sans-serif`;
        target.textAlign = "center";
        target.textBaseline = "middle";
        target.fillText(label, width / 2, height / 2);
        target.restore();
      }
    };

    let lastPaintAt = performance.now();
    const paintFrame = (): boolean => {
      const videoElapsed = Math.max(0, Math.min(performance.now() - t0, total));
      // Scenes + captions run on CONTENT time; the intro/outro cards live outside it.
      const elapsed = Math.max(0, Math.min(videoElapsed - introMs, contentMs));
      let idx = plan.timings.findIndex((t) => elapsed < t.startMs + t.durationMs);
      if (idx === -1) idx = sceneCount - 1;

      paintAt(ctx, idx, elapsed);

      // The transition runs over the INCOMING scene's first frames: the outgoing
      // scene is finished, so holding its last frame and clearing it away is
      // correct, whereas the reverse — which this used to do — painted the
      // incoming scene at p=0/elapsedMs=0 for the whole 420 ms and turned every
      // scene boundary into a dissolve onto a frozen still.
      const timing = plan.timings[idx];
      const sinceStart = elapsed - timing.startMs;
      if (idx > 0 && sinceStart < TRANSITION_MS) {
        const e = easeInOutCubic(clamp01(sinceStart / TRANSITION_MS));
        const prev = plan.timings[idx - 1];
        paintAt(sceneCtx, idx - 1, prev.startMs + prev.durationMs);
        const mode = transitions[idx];
        ctx.save();
        if (mode === 1) {
          // push: the outgoing scene slides off to the left
          ctx.drawImage(sceneCanvas, -e * width, 0);
        } else if (mode === 2) {
          // wipe: the incoming scene is revealed left-to-right behind an accent edge
          ctx.beginPath();
          ctx.rect(width * e, 0, width * (1 - e), height);
          ctx.clip();
          ctx.drawImage(sceneCanvas, 0, 0);
          ctx.restore();
          ctx.save();
          if (e > 0) {
            ctx.fillStyle = palette.accentGlow;
            ctx.fillRect(width * e - 2, 0, 4, height);
          }
        } else if (mode === 3) {
          // zoom-fade: the outgoing scene pushes past the lens to 1.05x as it goes
          const s = 1 + 0.05 * e;
          ctx.globalAlpha = 1 - e;
          ctx.translate(width / 2, height / 2);
          ctx.scale(s, s);
          ctx.translate(-width / 2, -height / 2);
          ctx.drawImage(sceneCanvas, 0, 0);
        } else {
          // classic crossfade with a slight sink
          ctx.globalAlpha = 1 - e;
          ctx.drawImage(sceneCanvas, 0, e * layout.unit * 0.4);
        }
        ctx.restore();
      }

      drawOverlay(ctx, width, height, videoElapsed / total, plan.brand, palette);
      if (captionStyle !== "off") {
        const cur = scenesWithTiming[idx];
        const cap = activeCaption(cur.scene, cur.timing, elapsed - cur.timing.startMs);
        if (cap) drawCaptions(ctx, width, height, cap.text, cap.progress, captionStyle, captionPos, palette);
      }
      if (introMs > 0 && videoElapsed < introMs) {
        drawIntro(ctx, width, height, videoElapsed / introMs, plan.brand, palette, introVariant);
      } else if (outroMs > 0 && videoElapsed >= introMs + contentMs) {
        drawOutro(ctx, width, height, (videoElapsed - introMs - contentMs) / outroMs, plan.brand, palette);
      }
      lastPaintAt = performance.now();
      // Hidden tabs stop automatic canvas capture; force this paint into the recording.
      (videoTrack as CanvasCaptureMediaStreamTrack | null)?.requestFrame?.();
      opts.onProgress?.(videoElapsed / total, `scene ${idx + 1}/${sceneCount}`);
      return videoElapsed >= total;
    };

    await new Promise<void>((resolve) => {
      let settled = false;
      let watchdog: ReturnType<typeof setInterval> | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (watchdog) clearInterval(watchdog);
        resolve();
      };
      const tick = () => {
        if (settled) return;
        if (cancelled || paintFrame()) return finish();
        requestAnimationFrame(tick);
      };
      // rAF freezes in hidden/occluded tabs, which used to stall the render
      // forever. This timer (browser-throttled to ~1 Hz in background, which the
      // playing narration keeps from intensive throttling) keeps painting and
      // finishing the render there — at a reduced frame rate.
      watchdog = setInterval(() => {
        if (settled) return;
        if (cancelled) return finish();
        if (performance.now() - lastPaintAt > 450 && paintFrame()) finish();
      }, 250);
      requestAnimationFrame(tick);
    });

    if (recorder && recorder.state !== "inactive") {
      await new Promise((r) => setTimeout(r, 350));
      recorder.stop();
    }
    const blob = await stopped;
    await audioCtx.close();
    return cancelled ? null : blob;
  })();

  return {
    done,
    cancel: () => {
      cancelled = true;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    },
  };
}

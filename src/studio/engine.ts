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
const SCENE_TAIL_MS = 750;
const TRANSITION_MS = 420;
const END_HOLD_MS = 600;
const VIDEO_BPS = 12_000_000;
const AUDIO_BPS = 192_000;
const FPS = 30;

export function computeTimings(script: SceneScript, audio: BeatAudio[]): SceneTiming[] {
  const byBeatId = new Map(audio.map((a) => [a.beatId, a.durationMs]));
  const timings: SceneTiming[] = [];
  let cursor = 0;
  for (const scene of script.scenes) {
    const beats: { startMs: number; durationMs: number }[] = [];
    let beatCursor = 0;
    for (const { beatId } of sceneBeats(scene)) {
      const durationMs = byBeatId.get(beatId) ?? 1200;
      beats.push({ startMs: beatCursor, durationMs });
      beatCursor += durationMs + INTER_BEAT_GAP_MS;
    }
    const durationMs = Math.max(MIN_SCENE_MS, beatCursor - INTER_BEAT_GAP_MS + SCENE_TAIL_MS);
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
    onProgress?: (p: number, label: string) => void;
  }
): RenderHandle {
  const { width, height } = plan;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const layout = makeLayout(width, height);
  const palette = paletteForSubject(plan.script.subject);
  // One background motif per video, one transition style per scene boundary —
  // both deterministic so a re-render of the same script looks identical.
  const motif = variantOf(`${plan.script.topic}|${plan.script.subject}`, BG_MOTIFS);
  const transitions = plan.script.scenes.map((s) => variantOf(`tr:${s.id}`, 4));
  const total = totalDurationMs(plan.timings);
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
      await scheduleNarration(audioCtx, audioDest, plan, startAt);
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
    };

    let lastPaintAt = performance.now();
    const paintFrame = (): boolean => {
      const elapsed = Math.max(0, Math.min(performance.now() - t0, total));
      let idx = plan.timings.findIndex((t) => elapsed < t.startMs + t.durationMs);
      if (idx === -1) idx = sceneCount - 1;

      paintAt(ctx, idx, elapsed);

      const timing = plan.timings[idx];
      const untilEnd = timing.startMs + timing.durationMs - elapsed;
      if (idx < sceneCount - 1 && untilEnd < TRANSITION_MS) {
        const alpha = 1 - untilEnd / TRANSITION_MS;
        const e = easeInOutCubic(alpha);
        paintAt(sceneCtx, idx + 1, timing.startMs + timing.durationMs);
        const mode = transitions[idx + 1];
        ctx.save();
        if (mode === 1) {
          // push: the next scene slides in over the current one
          ctx.drawImage(sceneCanvas, (1 - e) * width, 0);
        } else if (mode === 2) {
          // wipe: reveal left-to-right behind a soft accent edge
          ctx.beginPath();
          ctx.rect(0, 0, width * e, height);
          ctx.clip();
          ctx.drawImage(sceneCanvas, 0, 0);
          ctx.restore();
          ctx.save();
          if (e < 1) {
            ctx.fillStyle = palette.accentGlow;
            ctx.fillRect(width * e - 2, 0, 4, height);
          }
        } else if (mode === 3) {
          // zoom-fade: next scene settles from 1.05x
          const s = 1.05 - 0.05 * e;
          ctx.globalAlpha = e * e;
          ctx.translate(width / 2, height / 2);
          ctx.scale(s, s);
          ctx.translate(-width / 2, -height / 2);
          ctx.drawImage(sceneCanvas, 0, 0);
        } else {
          // classic crossfade with a slight rise
          ctx.globalAlpha = alpha * alpha;
          ctx.drawImage(sceneCanvas, 0, (1 - alpha) * layout.unit * 0.4);
        }
        ctx.restore();
      }

      drawOverlay(ctx, width, height, elapsed / total, plan.brand, palette);
      lastPaintAt = performance.now();
      // Hidden tabs stop automatic canvas capture; force this paint into the recording.
      (videoTrack as CanvasCaptureMediaStreamTrack | null)?.requestFrame?.();
      opts.onProgress?.(elapsed / total, `scene ${idx + 1}/${sceneCount}`);
      return elapsed >= total;
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

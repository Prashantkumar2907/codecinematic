import { sceneBeats, type SceneScript, type SceneTiming } from "./schema";

function srtTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(millis, 3)}`;
}

/**
 * SRT subtitle track built from the real per-beat render timings — one cue per
 * spoken beat, so captions land exactly when the voice does. Upload alongside
 * the video as an accurate replacement for YouTube's auto-captions.
 */
export function buildSrt(script: SceneScript, timings: SceneTiming[], offsetMs = 0): string {
  const timingById = new Map(timings.map((t) => [t.sceneId, t] as const));
  const cues: string[] = [];
  let n = 0;
  for (const scene of script.scenes) {
    const timing = timingById.get(scene.id);
    if (!timing) continue;
    sceneBeats(scene).forEach(({ text }, k) => {
      const beat = timing.beats[k];
      const line = text.trim();
      if (!beat || !line) return;
      const startMs = offsetMs + timing.startMs + beat.startMs;
      const endMs = startMs + beat.durationMs;
      n += 1;
      cues.push(`${n}\n${srtTime(startMs)} --> ${srtTime(endMs)}\n${line}\n`);
    });
  }
  return cues.join("\n");
}

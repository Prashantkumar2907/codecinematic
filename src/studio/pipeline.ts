import type { SceneScript, VerifyResult } from "./schema";
import { EXECUTABLE_LANGS, sceneBeats } from "./schema";
import type { BeatAudio } from "./engine";

/* Beats are voiced in chunks so onProgress reports a true voiced/total count. */
const TTS_CHUNK_SIZE = 12;
/* Server bounds each segment at 2×30s; 4 workers over 12 segments worst-case ≈ 180s.
   The abort turns a wedged request into a visible error instead of an endless "voicing". */
const TTS_CHUNK_TIMEOUT_MS = 200_000;

/** Shorts are narrated a touch brisker; beat windows follow the real audio, so sync holds. */
const SHORT_TTS_RATE = "+5%";

export async function fetchNarration(
  script: SceneScript,
  voice?: string,
  onProgress?: (voiced: number, total: number) => void
): Promise<BeatAudio[]> {
  const beats = script.scenes.flatMap((s) => sceneBeats(s));
  const rate = script.format === "short" ? SHORT_TTS_RATE : undefined;
  onProgress?.(0, beats.length);

  const audioCtx = new AudioContext();
  try {
    const out: BeatAudio[] = [];
    for (let offset = 0; offset < beats.length; offset += TTS_CHUNK_SIZE) {
      const chunk = beats.slice(offset, offset + TTS_CHUNK_SIZE);
      const res = await fetch("/api/studio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: chunk.map((b) => ({ id: b.beatId, text: b.text })),
          voice,
          rate,
        }),
        signal: AbortSignal.timeout(TTS_CHUNK_TIMEOUT_MS),
      }).catch((err) => {
        throw err instanceof DOMException && err.name === "TimeoutError"
          ? new Error(`narration timed out after ${Math.round(TTS_CHUNK_TIMEOUT_MS / 1000)}s (beats ${offset + 1}–${offset + chunk.length}) — check the dev server / network, then retry`)
          : err;
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `tts failed (${res.status})`);
      const decoded = await Promise.all(
        (data.segments as { id: string; mp3Base64: string }[]).map(async (seg) => {
          const mp3 = base64ToArrayBuffer(seg.mp3Base64);
          const audio = await audioCtx.decodeAudioData(mp3.slice(0));
          return { beatId: seg.id, mp3, durationMs: audio.duration * 1000 };
        })
      );
      out.push(...decoded);
      onProgress?.(out.length, beats.length);
    }
    return out;
  } finally {
    await audioCtx.close();
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function normalizeOutput(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/**
 * Executes every runnable code scene and reconciles the script with reality:
 * wrong expectedOutput is patched, and a terminal scene immediately following a
 * code scene gets its output lines replaced with the real stdout.
 * Returns the (possibly patched) script plus per-scene results.
 */
export async function verifyScript(
  script: SceneScript,
  onScene?: (sceneId: string, resultsSoFar: VerifyResult[]) => void
): Promise<{ script: SceneScript; results: VerifyResult[] }> {
  const results: VerifyResult[] = [];
  const scenes = script.scenes.map((s) => ({ ...s }));

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (scene.kind !== "code") continue;
    onScene?.(scene.id, [...results]);
    if (!EXECUTABLE_LANGS.includes(scene.lang) && scene.lang !== "ts") {
      results.push({ sceneId: scene.id, status: "skipped", detail: `${scene.lang} is display-only` });
      continue;
    }

    const res = await fetch("/api/studio/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: scene.lang, code: scene.code }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      results.push({ sceneId: scene.id, status: "failed", detail: data.error ?? `exec ${res.status}` });
      continue;
    }
    if (data.skipped) {
      results.push({ sceneId: scene.id, status: "skipped", detail: data.reason });
      continue;
    }
    if (data.timedOut || data.exitCode !== 0) {
      results.push({
        sceneId: scene.id,
        status: "failed",
        detail: data.timedOut ? "timed out after 10s" : `exit ${data.exitCode}: ${String(data.stderr).slice(0, 200)}`,
      });
      continue;
    }

    const actual = normalizeOutput(String(data.stdout));
    const expected = scene.expectedOutput === undefined ? undefined : normalizeOutput(scene.expectedOutput);
    let status: VerifyResult["status"] = "verified";

    if (expected !== undefined && actual !== expected) {
      scene.expectedOutput = actual;
      status = "patched";
    }

    const next = scenes[i + 1];
    if (next?.kind === "terminal") {
      const commands = next.lines.filter((l) => l.startsWith("$"));
      const outputLines = actual === "" ? [] : actual.split("\n").slice(0, 10 - commands.length);
      const patchedLines = [...commands, ...outputLines.map((l) => l.slice(0, 60))];
      if (JSON.stringify(patchedLines) !== JSON.stringify(next.lines)) {
        next.lines = patchedLines;
        if (status === "verified") status = "patched";
      }
    }

    results.push({ sceneId: scene.id, status, actualOutput: actual });
  }

  return { script: { ...script, scenes }, results };
}

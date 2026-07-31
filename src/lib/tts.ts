/**
 * The synthesis seam. Everything above this file talks about *speech*; only the
 * implementations below know that today's speech comes from edge-tts.
 *
 * The engine derives every scene duration from measured audio (`computeTimings`,
 * `engine.ts:69`), so swapping in Azure Speech or ElevenLabs is timing-safe by
 * construction — a new vendor only has to satisfy `SpeechSynthesizer`.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { WordTiming } from "@/studio/schema";

export type { WordTiming };

/** Prosody applied to the whole batch unless a segment overrides it. */
export type SynthProsody = {
  voice: string;
  /** edge-tts forms: rate/volume as `"+5%"`, pitch as `"+25Hz"`. */
  rate?: string;
  pitch?: string;
  volume?: string;
};

export type SynthSegment = { id: string; text: string } & Partial<SynthProsody>;

export type SynthResult = {
  id: string;
  mp3: Buffer;
  words: WordTiming[];
  /**
   * Only set by vendors that report it. edge-tts does not, and decoding mp3
   * server-side would mean shipping a decoder — the browser already decodes for
   * playback, so `pipeline.ts` fills this in from `decodeAudioData`.
   */
  durationMs?: number;
};

export interface SpeechSynthesizer {
  readonly id: string;
  synthesize(segments: SynthSegment[], prosody: SynthProsody): Promise<SynthResult[]>;
}

/** The helper bounds each segment at 30 s × 2 attempts, 4 at a time. */
const BATCH_TIMEOUT_MS = 300_000;

function venvPython(): string {
  return path.join(process.cwd(), ".venv", "bin", "python");
}

/**
 * Run the helper with `request` on stdin and return its stdout.
 *
 * `spawn` rather than `execFile` because the request has to go in over stdin —
 * a 160-beat batch is ~80 KB of JSON, well past a comfortable argv — and only
 * the sync `execFile` variant accepts `input`.
 */
function runHelper(script: string, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(venvPython(), [script], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`tts_synth.py timed out after ${Math.round(BATCH_TIMEOUT_MS / 1000)}s`));
    }, BATCH_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stdout);
      // The helper reports its own failure as JSON on stdout before exiting 1;
      // a crash before that leaves only a traceback on stderr.
      let reason = stderr.trim().slice(-300);
      try {
        reason = (JSON.parse(stdout) as { error?: string }).error ?? reason;
      } catch {
        /* not JSON — keep the traceback tail */
      }
      reject(new Error(`edge-tts failed: ${reason}`));
    });

    child.stdin.on("error", () => {
      /* the close handler already owns the failure path */
    });
    child.stdin.end(request);
  });
}

/**
 * edge-tts via `scripts/tts_synth.py`. The helper exists because per-word
 * timings are reachable only through the Python API's `boundary="WordBoundary"`
 * — the CLI has no such flag (improvement_plan.md §12a).
 */
export const edgeTtsSynthesizer: SpeechSynthesizer = {
  id: "edge-tts",
  async synthesize(segments, prosody) {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "devstudio-tts-"));
    try {
      const stdout = await runHelper(
        path.join(process.cwd(), "scripts", "tts_synth.py"),
        JSON.stringify({ outDir, ...prosody, segments })
      );
      const parsed = JSON.parse(stdout) as {
        segments: { id: string; file: string; words: WordTiming[] }[];
      };
      return await Promise.all(
        parsed.segments.map(async (seg) => ({
          id: seg.id,
          mp3: await fs.readFile(seg.file),
          words: seg.words,
        }))
      );
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  },
};

export function activeSynthesizer(): SpeechSynthesizer {
  return edgeTtsSynthesizer;
}

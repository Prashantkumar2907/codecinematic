// Estimate-vs-measured calibration (improvement_plan.md Phase 15).
//
// Every pacing threshold in the app is enforced against a word-count ESTIMATE
// computed before a script is voiced; the finished video's timing comes from the
// measured length of the synthesised audio. Nothing compared the two, so a beat
// gated at an estimated 9 s could voice at 13 s and the gate would report success.
// This voices a script for real and reports the drift, per beat and in aggregate,
// including the words/sec the measurement implies for SPOKEN_WORDS_PER_SEC.
//
//   node scripts/drift-check.mjs <script.json> [voice]
//
// Needs the dev server (for /api/studio/tts) and edge-tts in .venv.
import { readFile } from "node:fs/promises";
import { writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { sceneBeats } from "../src/studio/schema.ts";
import { driftReport, SPOKEN_WORDS_PER_SEC } from "../src/studio/pacing.ts";

const BASE = process.env.STUDIO_BASE ?? "http://localhost:4321";
const file = process.argv[2];
const voice = process.argv[3] ?? undefined;
if (!file) {
  console.error("usage: node scripts/drift-check.mjs <script.json> [voice]");
  process.exit(1);
}

const script = JSON.parse(await readFile(file, "utf8"));
const beats = script.scenes.flatMap((s) => sceneBeats(s) ?? []);
console.log(`${beats.length} beats, lang=${script.lang ?? "en"}${voice ? `, voice=${voice}` : ""}`);

// The TTS route takes segments; chunk so one slow request cannot time the whole run out.
const CHUNK = 12;
const measured = [];
for (let i = 0; i < beats.length; i += CHUNK) {
  const chunk = beats.slice(i, i + CHUNK);
  const res = await fetch(`${BASE}/api/studio/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      segments: chunk.map((b) => ({ id: b.beatId, text: b.text })),
      ...(voice ? { voice } : {}),
      lang: script.lang ?? "en",
    }),
    signal: AbortSignal.timeout(300_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `tts failed (${res.status})`);
  // Duration is decoded in the browser normally; here it comes from the mp3 bytes.
  for (const seg of data.segments) {
    measured.push({ beatId: seg.id, durationMs: mp3DurationMs(Buffer.from(seg.mp3Base64, "base64")) });
  }
  process.stdout.write(`  voiced ${Math.min(i + CHUNK, beats.length)}/${beats.length}\r`);
}
console.log();

/**
 * Real duration of an mp3 buffer, via ffmpeg.
 *
 * A hand-rolled MPEG frame walker was tried first and was wrong by ~1.8x: it
 * assumed MPEG1 (1152 samples/frame, 144*bitrate/freq frame length, 44.1 kHz
 * sample-rate table) while edge-tts emits 24 kHz MPEG2 (576 samples/frame,
 * 72*bitrate/freq, halved rate table). It reported an implied 4.63 words/sec —
 * 278 wpm, which no neural voice produces — and had that number been believed it
 * would have miscalibrated every pacing threshold in the app. ffmpeg is already a
 * dependency and is authoritative, so the arithmetic is not ours to get wrong.
 */
function mp3DurationMs(buf) {
  const tmp = path.join(tmpdir(), `drift-${randomUUID()}.mp3`);
  writeFileSync(tmp, buf);
  try {
    // `-f null` decodes without writing output; the final progress line carries
    // the true decoded duration, which beats trusting a container header.
    const out = spawnSync(ffmpeg, ["-hide_banner", "-i", tmp, "-f", "null", "-"], { encoding: "utf8" });
    const text = `${out.stderr ?? ""}`;
    const times = [...text.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
    if (times.length) {
      const [, h, m, s] = times[times.length - 1];
      return (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000;
    }
    const dur = text.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (dur) return (Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])) * 1000;
    throw new Error(`ffmpeg reported no duration:\n${text.slice(-400)}`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

const d = driftReport(script, measured);
const f = (n) => n.toFixed(1);
console.log(`\nestimated  ${f(d.estSeconds)}s   (${f(d.estSeconds / 60)} min)`);
console.log(`measured   ${f(d.actualSeconds)}s   (${f(d.actualSeconds / 60)} min)`);
console.log(`ratio      ${d.ratio.toFixed(3)}  ${d.ratio > 1 ? "→ we speak SLOWER than estimated" : "→ we speak FASTER than estimated"}`);
console.log(`\nSPOKEN_WORDS_PER_SEC is ${SPOKEN_WORDS_PER_SEC}; this run measures ${d.measuredWordsPerSec.toFixed(2)}`);
console.log(`beats matched ${d.beats}${d.unmatchedBeats.length ? `, UNMATCHED ${d.unmatchedBeats.length}` : ""}`);
console.log(`beats off by >25%: ${d.outliers.length}`);
for (const o of d.outliers.slice(0, 8)) {
  console.log(`  ${o.beatId.padEnd(34)} ${o.words}w  est ${f(o.estSeconds)}s  actual ${f(o.actualSeconds)}s  ×${o.ratio.toFixed(2)}`);
}
// Least-squares fit of actual = words/rate + overhead. The outliers above are all
// SHORT beats skewed the same way, which is the signature of a fixed cost per clip
// (edge-tts leading/trailing silence) rather than a wrong speaking rate: a 9-word
// beat pays the same silence as a 30-word one, so its ratio looks far worse.
{
  const pts = [];
  for (const s of script.scenes) {
    for (const b of sceneBeats(s) ?? []) {
      const m = measured.find((x) => x.beatId === b.beatId);
      if (m) pts.push({ w: (b.text ?? "").trim().split(/\s+/).filter(Boolean).length, t: m.durationMs / 1000 });
    }
  }
  const n = pts.length;
  const sw = pts.reduce((a, p) => a + p.w, 0);
  const st = pts.reduce((a, p) => a + p.t, 0);
  const sww = pts.reduce((a, p) => a + p.w * p.w, 0);
  const swt = pts.reduce((a, p) => a + p.w * p.t, 0);
  const slope = (n * swt - sw * st) / (n * sww - sw * sw); // seconds per word
  const intercept = (st - slope * sw) / n; // seconds of fixed overhead per beat
  const rate = 1 / slope;
  const resid = pts.map((p) => Math.abs(p.t - (p.w * slope + intercept)));
  const mae1 = pts.reduce((a, p) => a + Math.abs(p.t - p.w / d.measuredWordsPerSec), 0) / n;
  const mae2 = resid.reduce((a, r) => a + r, 0) / n;
  console.log(`\nTWO-PARAMETER FIT  actual ≈ words / ${rate.toFixed(2)} + ${intercept.toFixed(2)}s per beat`);
  console.log(`  mean abs error: rate-only ${mae1.toFixed(2)}s  vs  rate+overhead ${mae2.toFixed(2)}s`);
  console.log(`  → ${mae2 < mae1 ? "the fixed per-beat cost is real; model the overhead" : "a single rate is sufficient"}`);
}

if (d.missedOverlong.length) {
  console.log(`\nGATE BLIND SPOTS — passed on estimate, actually over 12s: ${d.missedOverlong.length}`);
  for (const m of d.missedOverlong) console.log(`  ${m.beatId.padEnd(34)} est ${f(m.estSeconds)}s → actual ${f(m.actualSeconds)}s`);
} else {
  console.log(`\nNo beat passed the 12s gate on estimate and then exceeded it in reality.`);
}

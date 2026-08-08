// Post-render measurement (improvement_plan.md Phase 16).
//
// Everything else in this repo judges the SCRIPT. The rating loop grades text,
// the pacing gates grade word counts, and `drift-check` grades the audio. The
// rendered video — the only artifact a viewer ever sees — was measured by
// nothing. This measures it directly:
//
//   * real duration, against the estimate pacing.ts computed from the script
//   * seconds per visual change, from actual inter-frame difference
//   * DEAD STRETCHES: spans where consecutive frames are effectively identical,
//     which is the owner's original complaint ("frozen cards") observed on the
//     output instead of inferred from word counts
//   * audio vs video stream length, so drift at the end of a long render shows up
//
//   node scripts/render-audit.mjs <video.webm> [script.json]
//   node scripts/render-audit.mjs content/videos/<slug>          both, by folder
//   node scripts/render-audit.mjs --all                          every rendered video
//   node scripts/render-audit.mjs --all --out=qa/RENDER.md
//
// No dev server needed. ffmpeg comes from the ffmpeg-static dependency, the same
// one drift-check.mjs uses, so the arithmetic is not ours to get wrong.
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";
import { pacingReport } from "../src/studio/pacing.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
};
const OUT = flag("out", null);
const positional = args.filter((a) => !a.startsWith("--"));

/* Sampling rate for the frame walk. 4 fps resolves a 250 ms pop-in while keeping
 * a 10-minute video under 2,400 frames. */
const SAMPLE_FPS = 4;
/* Frames are diffed at thumbnail size: a visual change big enough to matter is
 * still visible at 64x36, and this keeps a whole video's pixels under 6 MB. */
const GRID_W = 64;
const GRID_H = 36;
/* Mean per-pixel difference (0-255) below which nothing perceptible changed.
 *
 * MEASURED, not chosen, over the whole distribution of three rendered videos:
 *
 *   video                        p10     p50    p90    share < 0.05
 *   broken 22-scene long (18 MB) 0.000   0.000  0.000      98%
 *   healthy 22-scene long        0.024   0.22   2.64       25%
 *   healthy captioned short      0.057   0.22   3.27        9%
 *
 * A genuinely frozen frame is bit-identical — 0.000, not "small". So the
 * separator sits just above zero, and an earlier guess of 0.5 was badly wrong:
 * it swept up the 0.1-0.5 band, which is the karaoke caption advancing under a
 * still scene, and would have reported a healthy short as 73% dead.
 *
 * Kept at 0.05: background drift measures 0.0090 worst (`scripts/bg-drift.mjs`),
 * 5.5x below this, so it cannot mask frozen content. Details in PROGRESS.md 19.a. */
const STILL_DIFF = 0.05;
/* A jump this large is a scene cut or a full-frame reveal, not in-between
 * motion: only ~2% of sampled gaps reach it, and the per-video maxima are
 * 18-34. */
const CUT_DIFF = 8;
/* Only report a frozen span once it is long enough for a viewer to notice. */
const DEAD_STRETCH_SEC = 3;

function ffmpegRun(fileArgs) {
  return spawnSync(ffmpeg, ["-hide_banner", ...fileArgs], { encoding: "buffer", maxBuffer: 1 << 30 });
}

/** Decoded duration of one stream, in seconds. `-f null` decodes without writing. */
function streamSeconds(file, kind) {
  const drop = kind === "audio" ? "-vn" : "-an";
  const out = ffmpegRun(["-i", file, drop, "-f", "null", "-"]).stderr.toString("utf8");
  const times = [...out.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (!times.length) return null;
  const [, h, m, s] = times[times.length - 1];
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Mean absolute difference between consecutive sampled frames. */
function frameDiffs(file) {
  const res = ffmpegRun([
    "-i", file,
    "-vf", `fps=${SAMPLE_FPS},scale=${GRID_W}:${GRID_H}`,
    "-pix_fmt", "gray", "-f", "rawvideo", "-",
  ]);
  const buf = res.stdout;
  const frameBytes = GRID_W * GRID_H;
  const frames = Math.floor(buf.length / frameBytes);
  if (frames < 2) throw new Error(`decoded only ${frames} frame(s) from ${path.basename(file)}`);
  const diffs = new Array(frames - 1);
  for (let f = 1; f < frames; f++) {
    const a = f * frameBytes;
    const b = (f - 1) * frameBytes;
    let sum = 0;
    for (let i = 0; i < frameBytes; i++) sum += Math.abs(buf[a + i] - buf[b + i]);
    diffs[f - 1] = sum / frameBytes;
  }
  return diffs;
}

/** Runs of consecutive near-identical frames, in seconds. */
function deadStretches(diffs) {
  const out = [];
  let runStart = null;
  for (let i = 0; i <= diffs.length; i++) {
    const still = i < diffs.length && diffs[i] < STILL_DIFF;
    if (still && runStart === null) runStart = i;
    if (!still && runStart !== null) {
      const seconds = (i - runStart) / SAMPLE_FPS;
      if (seconds >= DEAD_STRETCH_SEC) out.push({ atSec: runStart / SAMPLE_FPS, seconds });
      runStart = null;
    }
  }
  return out.sort((a, b) => b.seconds - a.seconds);
}

async function auditOne(videoPath, scriptPath) {
  const bytes = (await stat(videoPath)).size;
  const videoSec = streamSeconds(videoPath, "video");
  const audioSec = streamSeconds(videoPath, "audio");
  const diffs = frameDiffs(videoPath);
  const dead = deadStretches(diffs);
  const cuts = diffs.filter((d) => d >= CUT_DIFF).length;
  const sorted = [...diffs].sort((a, b) => a - b);
  const medianDiff = sorted[Math.floor(sorted.length / 2)];
  const deadSec = dead.reduce((n, d) => n + d.seconds, 0);

  let estSec = null;
  let scriptName = null;
  if (scriptPath) {
    try {
      const script = JSON.parse(await readFile(scriptPath, "utf8"));
      if (Array.isArray(script?.scenes)) {
        estSec = pacingReport(script).estSeconds;
        scriptName = `${script.format} · ${script.scenes.length} scenes`;
      }
    } catch {
      /* a missing or unparseable script only costs the comparison column */
    }
  }

  return {
    file: path.relative(ROOT, videoPath),
    scriptName,
    mb: bytes / 1e6,
    videoSec,
    audioSec,
    estSec,
    // Speech estimate excludes the engine's inter-beat gaps, scene tails and
    // intro/outro, so it is a floor. Reported as a ratio, not a pass/fail.
    estRatio: estSec && videoSec ? videoSec / estSec : null,
    avSkewSec: videoSec != null && audioSec != null ? videoSec - audioSec : null,
    cuts,
    secPerCut: cuts ? diffs.length / SAMPLE_FPS / cuts : null,
    // Motion energy of the typical frame gap. Separates "holding a still card"
    // from "animating" in a way the frozen-share threshold cannot.
    medianDiff,
    deadSec,
    deadShare: videoSec ? deadSec / videoSec : 0,
    worstDead: dead.slice(0, 5),
  };
}

async function videoFolders() {
  const base = path.join(ROOT, "content/videos");
  const out = [];
  for (const e of await readdir(base, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(base, e.name);
    try {
      await stat(path.join(dir, "video.webm"));
      out.push(dir);
    } catch {
      /* rendered artifact not kept for this slug */
    }
  }
  return out;
}

function resolveTargets() {
  if (flag("all")) return null;
  const [a, b] = positional;
  if (!a) return null;
  return [{ dir: null, video: path.resolve(a), script: b ? path.resolve(b) : null }];
}

let targets = resolveTargets();
if (!targets) {
  const folders = await videoFolders();
  if (!folders.length) {
    console.error("no rendered videos under content/videos/*/video.webm");
    process.exit(1);
  }
  targets = folders.map((dir) => ({
    dir,
    video: path.join(dir, "video.webm"),
    script: path.join(dir, "script.json"),
  }));
} else if (targets[0].script === null) {
  // A bare video path next to a script.json still gets the comparison.
  const guess = path.join(path.dirname(targets[0].video), "script.json");
  targets[0].script = guess;
}

const results = [];
for (const t of targets) {
  process.stdout.write(`measuring ${path.basename(path.dirname(t.video))}…\r`);
  try {
    results.push(await auditOne(t.video, t.script));
  } catch (err) {
    console.error(`\n${t.video}: ${err.message}`);
  }
}
console.log(" ".repeat(60));

results.sort((a, b) => b.deadShare - a.deadShare);

const f1 = (n) => (n == null ? "—" : n.toFixed(1));
const lines = [];
lines.push("# Rendered-video audit");
lines.push("");
lines.push("Generated by `node scripts/render-audit.mjs --all`. Worst-first. **Do not hand-edit.**");
lines.push("");
lines.push(
  `Frames sampled at ${SAMPLE_FPS} fps and diffed at ${GRID_W}×${GRID_H} greyscale. ` +
    `"Frozen" = mean per-pixel difference < ${STILL_DIFF} for ≥ ${DEAD_STRETCH_SEC}s — nothing perceptible ` +
    `changed. A "cut" is a gap ≥ ${CUT_DIFF}. Median motion is the typical gap: it separates "holding a ` +
    `still card" from "animating", which the frozen threshold alone cannot.`
);
lines.push("");
lines.push(
  "A/V skew is video length minus audio length, and a positive number is **expected**, not drift: " +
    "long-form ends with a 5.2 s outro plus a 0.6 s hold and a scene tail, so ~7 s is correct. What would " +
    "be a real defect is a *negative* skew, or a long-form skew far from ~7 s."
);
lines.push("");
lines.push(
  "`actual/est` compares the render against `pacingReport().estSeconds`, which counts **speech only** — " +
    "it excludes inter-beat gaps, scene tails and the intro/outro. So it is a floor, and 1.03-1.17 is the " +
    "engine's own padding, not an estimate error."
);
lines.push("");
lines.push("| Frozen | Frozen s | Video s | Audio s | A/V skew | Cuts | s/cut | Median motion | Est s | actual/est | MB | File |");
lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  lines.push(
    `| **${(r.deadShare * 100).toFixed(1)}%** | ${f1(r.deadSec)} | ${f1(r.videoSec)} | ${f1(r.audioSec)} | ` +
      `${r.avSkewSec == null ? "—" : `${r.avSkewSec >= 0 ? "+" : ""}${r.avSkewSec.toFixed(2)}`} | ` +
      `${r.cuts} | ${f1(r.secPerCut)} | ${r.medianDiff.toFixed(2)} | ${f1(r.estSec)} | ${r.estRatio ? r.estRatio.toFixed(2) : "—"} | ` +
      `${r.mb.toFixed(0)} | \`${path.basename(path.dirname(r.file))}\` |`
  );
}
lines.push("");
lines.push("## Longest frozen stretches");
lines.push("");
for (const r of results) {
  if (!r.worstDead.length) continue;
  lines.push(`**${path.basename(path.dirname(r.file))}** — ${r.worstDead
    .map((d) => `${d.seconds.toFixed(1)}s at ${d.atSec.toFixed(0)}s`)
    .join(", ")}`);
  lines.push("");
}

const report = lines.join("\n");
if (OUT && OUT !== "-") {
  await mkdir(path.join(ROOT, path.dirname(OUT)), { recursive: true });
  await writeFile(path.join(ROOT, OUT), `${report}\n`);
  console.log(`wrote ${OUT}`);
} else {
  console.log(report);
}

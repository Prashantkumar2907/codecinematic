// Per-painter motion, measured on /probe where the progress bar and captions do
// not exist — so a flat stretch means the PAINTER stopped, not that the overlay
// was still moving. render-audit cannot separate those on a finished video.
//
// Scores rubric v2 section 6 (occupancy): longest dead window, and how much of a
// scene's motion is dumped into its first 15%. Also reports paint cost per frame,
// since rendering is real-time capture at 30fps (33.3ms budget).
//
//   node scripts/motion-check.mjs --kind=bigtext [--aspect=short|long]
//   node scripts/motion-check.mjs                    all kinds -> qa/MOTION.md
//
// Requires a dev server. PROBE_BASE overrides http://localhost:4321.
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([a-zA-Z]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE = process.env.PROBE_BASE ?? "http://localhost:4321";
const SAMPLES = Number(args.samples) || 60;
/* Same separator render-audit uses, measured against background drift (0.0090
 * worst) rather than chosen. Below this, nothing perceptible changed. */
const STILL_DIFF = 0.05;
/* Share of a scene's own timeline that may sit still. Scored as a FRACTION, not
 * seconds: /probe synthesises 8s per beat (median scene 32s, max 112s) against
 * real beats of ~4-6s, so absolute seconds here are inflated and only the
 * fraction transfers to a real render. */
const DEAD_FRAC_BAD = 0.40;
const DEAD_FRAC_WARN = 0.25;
/* Share of the whole timeline that may sit below the still threshold, however it
 * is distributed. A scene alternating just-above/just-below never forms a long
 * run, so the dead-window figure alone reads it as alive. */
const STILL_FRAC_BAD = 0.60;
const STILL_FRAC_WARN = 0.40;
/* Real-time capture at 30fps. Over this and frames drop. */
const FRAME_BUDGET_MS = 33.3;
/* Entrances land inside the first 15% of a scene; motion beyond that is what
 * separates an authored scene from a card that arrives and freezes. */
const HEAD_FRACTION = 0.15;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const pct = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};

/** Longest run of consecutive near-still samples, in seconds and p range. */
function longestDeadWindow(diffs, durationMs) {
  const stepMs = durationMs / (diffs.length + 1);
  let best = { seconds: 0, fromP: 0, toP: 0 };
  let runStart = null;
  for (let i = 0; i <= diffs.length; i++) {
    const still = i < diffs.length && diffs[i] < STILL_DIFF;
    if (still && runStart === null) runStart = i;
    if (!still && runStart !== null) {
      const seconds = ((i - runStart) * stepMs) / 1000;
      if (seconds > best.seconds) {
        best = { seconds, fromP: runStart / diffs.length, toP: i / diffs.length };
      }
      runStart = null;
    }
  }
  return best;
}

/* A reveal spikes well above the scene's own drift; ambient float does not. */
const EVENT_MULTIPLE = 3;

/** Discrete reveals: samples spiking above EVENT_MULTIPLE x the median. Separates
 *  an authored scene (few large spikes) from one slowly floating in place. */
function eventCount(diffs) {
  const med = pct(diffs, 0.5);
  if (med <= 0) return 0;
  let n = 0;
  let armed = true;
  for (const d of diffs) {
    if (d > med * EVENT_MULTIPLE) {
      if (armed) n++;
      armed = false;
    } else armed = true;
  }
  return n;
}

/** Share of ALL samples below STILL_DIFF. Catches a scene that is motionless most
 *  of the time in short bursts, which longestDeadWindow misses by only counting
 *  the longest CONSECUTIVE run. */
function stillFraction(diffs) {
  if (!diffs.length) return 1;
  return diffs.filter((d) => d < STILL_DIFF).length / diffs.length;
}

/** Share of all motion spent in the first HEAD_FRACTION of the scene. */
function frontLoadRatio(diffs) {
  const head = Math.max(1, Math.round(diffs.length * HEAD_FRACTION));
  const total = sum(diffs);
  if (total <= 0) return 1;
  return sum(diffs.slice(0, head)) / total;
}

function score(row) {
  if (row.failed) return 1;
  if (row.deadFrac >= DEAD_FRAC_BAD || row.stillFrac >= STILL_FRAC_BAD) return 1;
  if (row.deadFrac >= DEAD_FRAC_WARN || row.stillFrac >= STILL_FRAC_WARN) return 2;
  if (row.frontLoad > 0.8) return 3;
  if (row.events < 2 || row.frontLoad > 0.6) return 4;
  return 5;
}

const res = await fetch(`${BASE}/probe`).catch(() => null);
if (!res?.ok) {
  console.error(`Cannot reach ${BASE}/probe — start the dev server: npm run dev`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.goto(`${BASE}/probe`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__PROBE_DONE === true, null, { timeout: 180000 });

const kinds = args.kind ? [args.kind] : await page.evaluate(() => window.__PROBE_KINDS ?? []);
const aspects = args.aspect ? [args.aspect] : ["short", "long"];
const rows = [];

for (const kind of kinds) {
  for (const aspect of aspects) {
    const r = await page.evaluate(
      (a) => window.__PROBE_MOTION(a),
      { kind, sceneId: args.scene || undefined, aspect, samples: SAMPLES }
    );
    if (!r) continue;
    const dead = longestDeadWindow(r.diffs, r.durationMs);
    const row = {
      kind,
      aspect,
      deadSec: dead.seconds,
      deadFrom: dead.fromP,
      deadTo: dead.toP,
      deadFrac: dead.toP - dead.fromP,
      stillFrac: stillFraction(r.diffs),
      frontLoad: frontLoadRatio(r.diffs),
      events: eventCount(r.diffs),
      median: pct(r.diffs, 0.5),
      worstPaintMs: Math.max(...r.paintMs, 0),
      p90PaintMs: pct(r.paintMs, 0.9),
      failed: r.failed,
    };
    row.score = score(row);
    rows.push(row);
  }
}

await browser.close();

const fmt = (r) =>
  `${r.aspect}: score ${r.score}/5  dead ${(r.deadFrac * 100).toFixed(0)}% of scene (${r.deadSec.toFixed(1)}s synthetic) ` +
  `(p=${r.deadFrom.toFixed(2)}-${r.deadTo.toFixed(2)})  ` +
  `still ${(r.stillFrac * 100).toFixed(0)}%  front-load ${(r.frontLoad * 100).toFixed(0)}%  events ${r.events}  median ${r.median.toFixed(3)}  ` +
  `paint p90 ${r.p90PaintMs.toFixed(1)}ms worst ${r.worstPaintMs.toFixed(1)}ms` +
  (r.p90PaintMs > FRAME_BUDGET_MS ? "  OVER-BUDGET" : "") +
  (r.failed ? `  THREW: ${r.failed}` : "");

if (args.kind) {
  for (const r of rows) console.log(fmt(r));
  const worst = Math.min(...rows.map((r) => r.score));
  console.log(`WORST_SCORE ${worst}/5  ${worst >= 5 ? "PASS" : "FAIL"}`);
} else {
  const sorted = [...rows].sort((a, b) => a.score - b.score || b.deadFrac - a.deadFrac);
  const overBudget = rows.filter((r) => r.p90PaintMs > FRAME_BUDGET_MS);
  const lines = [
    "# Per-painter motion audit",
    "",
    "Generated by `node scripts/motion-check.mjs`. Worst-first. **Do not hand-edit.**",
    "",
    `Measured on \`/probe\`, ${SAMPLES} samples across each scene's own timeline, diffed at 64x36 grey —`,
    "the same grid `render-audit` uses, but without the progress bar and captions that repaint over a",
    "frozen scene in a finished video. A flat stretch here means the painter stopped.",
    "",
    `**Dead window** = longest run under ${STILL_DIFF} mean per-pixel change, as a FRACTION of the scene.`,
    `Seconds are shown too but are SYNTHETIC — /probe assumes 8s per beat (median scene 32s, max 112s)`,
    `against real beats of ~4-6s, so only the fraction transfers to a real render. **Front-load** = share of all`,
    `motion spent in the first ${HEAD_FRACTION * 100}% of the scene; a card that arrives and freezes approaches 100%.`,
    `**Events** = discrete reveals (spikes > ${EVENT_MULTIPLE}x median); an ambient float has none, an authored scene has several.`,
    `**Still %** = share of ALL samples below the threshold, however scattered — the metric that catches a scene`,
    `motionless in short bursts. **Score** (rubric v2 s6, occupancy): 5 needs dead < ${DEAD_FRAC_WARN * 100}%, still < ${STILL_FRAC_WARN * 100}%, front-load <= 60%, >= 2 events.`,
    "",
    `**Paint budget**: real-time capture at 30fps allows ${FRAME_BUDGET_MS}ms/frame, judged on p90 (frame 0 pays three.js build cost).`,
    `${overBudget.length} of ${rows.length} kind/aspect pairs exceed it.`,
    "",
    "| score | kind | aspect | dead % | still % | at p | front-load | events | median | paint p90 | paint worst | note |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...sorted.map(
      (r) =>
        `| ${r.score} | \`${r.kind}\` | ${r.aspect} | ${(r.deadFrac * 100).toFixed(0)}% | ` +
        `${(r.stillFrac * 100).toFixed(0)}% | ${r.deadFrom.toFixed(2)}-${r.deadTo.toFixed(2)} | ${(r.frontLoad * 100).toFixed(0)}% | ${r.events} | ` +
        `${r.median.toFixed(3)} | ${r.p90PaintMs.toFixed(1)} | ${r.worstPaintMs.toFixed(1)} | ` +
        `${r.failed ? "THREW: " + r.failed : r.p90PaintMs > FRAME_BUDGET_MS ? "over budget" : ""} |`
    ),
  ];
  await mkdir(path.join(ROOT, "qa"), { recursive: true });
  await writeFile(path.join(ROOT, "qa", "MOTION.md"), lines.join("\n") + "\n");
  const failing = rows.filter((r) => r.score < 5).length;
  console.log(`wrote qa/MOTION.md — ${rows.length} pairs, ${failing} below 5/5, ${overBudget.length} over frame budget`);
}

if (pageErrors.length) {
  console.error(`page errors: ${pageErrors.slice(0, 5).join(" | ")}`);
  process.exit(1);
}

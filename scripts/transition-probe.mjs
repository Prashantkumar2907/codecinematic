// Verification probe for the scene-boundary transition (improvement_plan Phase 2.4).
// Renders the short demo and screenshots the canvas as fast as it can for a fixed
// window, so a 420 ms transition lands in several consecutive frames. Compares each
// frame to the one before it: a transition that dissolves onto a frozen still shows
// a run of near-identical frames, a live one does not.
//
//   node scripts/transition-probe.mjs [outDir] [windowSec]
//
// Requires the dev server (npm run dev) to already be running.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = process.argv[2] ?? "output/transition-probe";
const WINDOW_S = Number(process.argv[3] || 20);
const BASE = "http://localhost:4321";

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(`${BASE}/?demo=1&auto=1`, { waitUntil: "domcontentloaded" });

const stateOf = () => page.evaluate(() => window.__STUDIO_STATE ?? null);
const started = Date.now();
while (Date.now() - started < 180_000) {
  const s = await stateOf();
  if (s?.stage === "rendering") break;
  if (s?.error) throw new Error(s.error);
  await new Promise((r) => setTimeout(r, 200));
}

const canvas = page.locator("canvas");
const shots = [];
const t0 = Date.now();
while (Date.now() - t0 < WINDOW_S * 1000) {
  const at = Date.now() - t0;
  const buf = await canvas.screenshot();
  const p = (await stateOf())?.renderProgress ?? 0;
  shots.push({ at, p, buf });
}

// Cheap per-frame difference: mean absolute byte delta over the PNG-decoded pixels
// is overkill here, so compare raw PNG bytes length + a sampled byte diff.
const diffs = [];
for (let i = 1; i < shots.length; i++) {
  const a = shots[i - 1].buf;
  const b = shots[i].buf;
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let k = 0; k < n; k += 97) d += a[k] === b[k] ? 0 : 1;
  diffs.push({ at: shots[i].at, p: shots[i].p, changed: d / Math.ceil(n / 97) });
}

const lines = diffs.map((d) => `${String(d.at).padStart(6)}ms  p=${(d.p * 100).toFixed(1).padStart(5)}%  changed=${(d.changed * 100).toFixed(1)}%`);
await writeFile(path.join(OUT_DIR, "frame-deltas.txt"), lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\n${shots.length} frames over ${WINDOW_S}s (~${(shots.length / WINDOW_S).toFixed(1)}/s)`);
const frozen = diffs.filter((d) => d.changed < 0.005).length;
console.log(`frames identical to their predecessor: ${frozen}/${diffs.length}`);

// Keep the run of frames around the largest sustained change for eyeballing.
for (let i = 0; i < shots.length; i += Math.max(1, Math.floor(shots.length / 24))) {
  await writeFile(path.join(OUT_DIR, `f-${String(shots[i].at).padStart(6, "0")}ms.png`), shots[i].buf);
}
await browser.close();

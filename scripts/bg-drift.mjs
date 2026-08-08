// Measures how much per-frame motion `drawBackground` contributes alone, at the
// same 64x36 grey scale render-audit diffs video at, so its "frozen" threshold
// can be set from evidence. Requires a dev server.
//
//   node scripts/bg-drift.mjs

import { chromium } from "playwright";

const BASE = process.env.STUDIO_BASE ?? "http://localhost:4321";
const FRAMES = 240;
const FPS = 4;

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${BASE}/probe`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__PROBE_BGDRIFT !== undefined, null, { timeout: 30_000 })
  .catch(() => {});

const rows = [];
for (const aspect of ["short", "long"]) {
  const res = await page.evaluate(
    ([aspect, frames, fps]) => window.__PROBE_BGDRIFT({ aspect, frames, fps }),
    [aspect, FRAMES, FPS]
  );
  for (const [motif, diffs] of Object.entries(res)) {
    const s = [...diffs].sort((a, b) => a - b);
    rows.push({
      aspect,
      motif,
      n: s.length,
      p50: pct(s, 0.5),
      p90: pct(s, 0.9),
      p99: pct(s, 0.99),
      max: s[s.length - 1],
    });
  }
}

await browser.close();

console.log("\nBackground-only per-frame difference (64x36 grey, 4fps sampling)\n");
console.log("aspect  motif    n     p50      p90      p99      max");
for (const r of rows) {
  console.log(
    `${r.aspect.padEnd(7)} ${r.motif.padEnd(8)} ${String(r.n).padEnd(5)} ` +
      [r.p50, r.p90, r.p99, r.max].map((v) => v.toFixed(4).padEnd(8)).join("")
  );
}
const worstP99 = Math.max(...rows.map((r) => r.p99));
const worstMax = Math.max(...rows.map((r) => r.max));
console.log(`\nworst p99 across all motifs/aspects: ${worstP99.toFixed(4)}`);
console.log(`worst max across all motifs/aspects: ${worstMax.toFixed(4)}`);
console.log(
  `\n=> STILL_DIFF must sit ABOVE ${worstMax.toFixed(4)} for "frozen" to mean the CONTENT froze.\n`
);
if (errors.length) {
  console.error("page errors:", errors);
  process.exit(1);
}

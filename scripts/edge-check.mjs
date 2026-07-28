// Per-kind containment measurement. Same measurement as edge-audit.mjs but scoped to
// one kind and writes nothing, so parallel QA agents cannot collide on qa/AUDIT.md.
//   node scripts/edge-check.mjs --kind=chart
import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([a-zA-Z]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
if (!args.kind && !args.scene) {
  console.error("pass --kind=<kind> [--scene=<sceneId>]");
  process.exit(1);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:4321";
const res = await fetch(`${BASE}/probe`).catch(() => null);
if (!res?.ok) {
  console.error(`Cannot reach ${BASE}/probe — start the dev server: npm run dev`);
  process.exit(1);
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${BASE}/probe`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__PROBE_DONE === true, null, { timeout: 180000 });
let worstOverall = 0;
for (const aspect of ["short", "long"]) {
  const r = await page.evaluate((a) => window.__PROBE_EDGEBLEED(a), {
    kind: args.kind,
    sceneId: args.scene || undefined,
    aspect,
  });
  if (!r) {
    console.log(`${aspect}: no demo scene`);
    continue;
  }
  const worst = Math.max(r.top, r.bottom, r.left, r.right);
  worstOverall = Math.max(worstOverall, worst);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  console.log(
    `${aspect}: worst ${pct(worst)}  (top ${pct(r.top)} bottom ${pct(r.bottom)} left ${pct(r.left)} right ${pct(r.right)})`
  );
}
console.log(`WORST_OVERALL ${(worstOverall * 100).toFixed(1)}%  ${worstOverall < 0.02 ? "PASS" : "FAIL"}`);
await browser.close();

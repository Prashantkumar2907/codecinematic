// Render spike: drives the studio headlessly through generate -> render -> save,
// captures canvas frames for visual inspection, and reports the saved draft.
// Usage: node scripts/spike.mjs [outDir] [query] [timeoutSec]
//   query defaults to "demo=1&auto=1"; use "gen=1&track=database&format=long&auto=1" for a full-real run.
import { chromium } from "playwright";
import path from "node:path";

const OUT_DIR = process.argv[2] ?? "output";
const QUERY = process.argv[3] ?? "demo=1&auto=1";
const BASE = "http://localhost:4321";
const TIMEOUT_MS = (Number(process.argv[4]) || 240) * 1000;
const SNAP_AT = [0.12, 0.35, 0.55, 0.8];

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("[page error]", msg.text().slice(0, 200));
});

await page.goto(`${BASE}/?${QUERY}`, { waitUntil: "domcontentloaded" });

const started = Date.now();
let lastStage = "";
const pending = new Set(SNAP_AT);

while (Date.now() - started < TIMEOUT_MS) {
  const state = await page.evaluate(() => window.__STUDIO_STATE ?? null);
  if (state) {
    if (state.stage !== lastStage) {
      console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] stage: ${state.stage}${state.error ? " error: " + state.error : ""}`);
      lastStage = state.stage;
    }
    for (const target of [...pending]) {
      if (state.stage === "rendering" && state.renderProgress >= target) {
        pending.delete(target);
        const file = path.join(OUT_DIR, `frame-${Math.round(target * 100)}.png`);
        await page.locator("canvas").screenshot({ path: file });
        console.log(`  captured ${file} at ${(state.renderProgress * 100).toFixed(0)}%`);
      }
    }
    if (state.error) {
      console.log("FAILED:", state.error);
      process.exitCode = 1;
      break;
    }
    if (state.savedSlug) {
      console.log(`topic: ${state.topic}`);
      console.log(`scenes: ${state.sceneKinds.join(",")}`);
      console.log(`verify: ${state.verify.join(" ") || "(none)"}`);
      console.log(`SAVED: ${state.savedSlug} (${(state.videoBytes / 1e6).toFixed(2)} MB webm)`);
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 400));
}
if (!process.exitCode && lastStage !== "rendered") {
  const state = await page.evaluate(() => window.__STUDIO_STATE ?? null);
  if (!state?.savedSlug) {
    console.log("TIMEOUT — final state:", JSON.stringify(state));
    process.exitCode = 1;
  }
}
await browser.close();

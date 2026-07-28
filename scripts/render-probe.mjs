// Full-render diagnostic: drives the studio through a demo render like
// kinds-spike.mjs, but captures EVERY console message and a frame per scene
// change, so degradation that only appears late in a long render is visible.
//
//   node scripts/render-probe.mjs <outDir> "<query>" [timeoutSec]
//
// Requires the dev server (npm run dev) to already be running.
import { chromium } from "playwright";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = process.argv[2] ?? "output/render-probe";
const QUERY = process.argv[3] ?? "demo=2&auto=1";
const TIMEOUT_MS = (Number(process.argv[4]) || 900) * 1000;
const BASE = process.env.STUDIO_BASE ?? "http://localhost:4321";

await mkdir(OUT_DIR, { recursive: true });
const logPath = path.join(OUT_DIR, "console.log");
await writeFile(logPath, "");

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on("console", (msg) => void appendFile(logPath, `[${msg.type()}] ${msg.text()}\n`));
page.on("pageerror", (err) => void appendFile(logPath, `[pageerror] ${err.message}\n`));

await page.goto(`${BASE}/?${QUERY}`, { waitUntil: "domcontentloaded" });

const started = Date.now();
let lastStage = "";
let lastLabel = "";
while (Date.now() - started < TIMEOUT_MS) {
  const state = await page.evaluate(() => window.__STUDIO_STATE ?? null);
  if (state) {
    if (state.stage !== lastStage) {
      console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] stage: ${state.stage}${state.error ? " error: " + state.error : ""}`);
      lastStage = state.stage;
    }
    // One frame the moment the engine reports a new scene label.
    const label = await page.evaluate(() => document.querySelector("[data-render-label]")?.textContent ?? null);
    const key = label ?? `${Math.round((state.renderProgress ?? 0) * 100)}`;
    if (state.stage === "rendering" && key !== lastLabel) {
      lastLabel = key;
      const pct = String(Math.round((state.renderProgress ?? 0) * 100)).padStart(3, "0");
      await page.locator("canvas").screenshot({ path: path.join(OUT_DIR, `p${pct}.png`) });
    }
    if (state.error) { console.log("FAILED:", state.error); process.exitCode = 1; break; }
    if (state.savedSlug) { console.log(`SAVED: ${state.savedSlug} (${(state.videoBytes / 1e6).toFixed(2)} MB)`); break; }
  }
  await new Promise((r) => setTimeout(r, 400));
}
await browser.close();
console.log(`console log: ${logPath}`);

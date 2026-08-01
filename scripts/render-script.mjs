// Render an ARBITRARY script file to a video, headlessly.
//
// The studio could already render a demo (`?demo=`) or generate-then-render a
// fresh topic (`?gen=1&...&auto=1`), but there was no way to render a script you
// already had on disk. That is exactly what 17.1 needs -- it is blocked on
// "watch one video from each A/B arm", and the arms are two saved scripts.
//
// No new app code: this drives the real UI the way a person would -- open the
// JSON editor, paste the script, Apply -- and `?auto=1` then renders and saves
// through the same path the studio always uses. /api/studio/save stays the only
// writer of content/videos.
//
//   node scripts/render-script.mjs qa/exemplar-ab/with-1.json [timeoutSec]
//
// Requires a dev server. Set STUDIO_BASE if it is not on :4321.
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = process.argv[2];
const TIMEOUT_MS = (Number(process.argv[3]) || 900) * 1000;
const BASE = process.env.STUDIO_BASE ?? "http://localhost:4321";

if (!SCRIPT_PATH) {
  console.error("usage: node scripts/render-script.mjs <script.json> [timeoutSec]");
  process.exit(1);
}

const raw = await readFile(path.resolve(ROOT, SCRIPT_PATH), "utf8");
const script = JSON.parse(raw);
console.log(`rendering ${SCRIPT_PATH} — ${script.format}, ${script.scenes.length} scenes, "${script.topic}"`);

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));

await page.goto(`${BASE}/?auto=1`, { waitUntil: "domcontentloaded" });

// "Paste JSON" sits beside "Load demo" and is only offered while no script is
// loaded, which is the state a fresh page is in.
await page.getByRole("button", { name: /Paste JSON/i }).first().click();
await page.locator("textarea").first().fill(JSON.stringify(script));
await page.getByRole("button", { name: /Apply JSON/i }).first().click();

const started = Date.now();
let lastStage = "";
let slug = null;
while (Date.now() - started < TIMEOUT_MS) {
  const state = await page.evaluate(() => globalThis.__STUDIO_STATE ?? null);
  if (state) {
    if (state.stage !== lastStage) {
      const t = ((Date.now() - started) / 1000).toFixed(0);
      console.log(`[${t}s] ${state.stage}${state.error ? "  error: " + state.error : ""}`);
      lastStage = state.stage;
    }
    if (state.error) {
      console.error(`failed: ${state.error}`);
      break;
    }
    if (state.savedSlug) {
      slug = state.savedSlug;
      console.log(`saved: content/videos/${slug}  (${(state.videoBytes / 1e6).toFixed(1)} MB)`);
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 1000));
}

await browser.close();
if (errors.length) console.log(`page errors: ${[...new Set(errors)].slice(0, 5).join(" | ")}`);
if (!slug) {
  console.error("no video saved before timeout");
  process.exit(1);
}
console.log(slug);

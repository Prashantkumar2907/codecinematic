// Animation-QA capture: one contact sheet per scene kind per aspect, plus two
// full-resolution detail frames. Smoothness, pop-in and dead time are temporal
// properties — a single frame cannot show them, a filmstrip can.
//
//   node scripts/filmstrip.mjs --kind=bigtext              whole scene, p=0..1
//   node scripts/filmstrip.mjs --kind=bigtext --entrance   first 500ms, ~33ms/cell
//   node scripts/filmstrip.mjs --kind=bigtext --window=0:1200
//   node scripts/filmstrip.mjs --scene=t-bigtext-v0ae         one exact scene by id
//   node scripts/filmstrip.mjs --all --cols=4 --rows=4
//
// Requires the dev server (npm run dev) to already be running.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULTS = {
  base: "http://localhost:4321",
  cols: 4,
  rows: 4,
  cellW: 360,
  out: "qa",
  // Per-kind wall-clock ceiling. A painter stuck in a loop blocks the page's
  // single JS thread, so the only escape is tearing the browser down.
  timeout: 120000,
};
const DETAIL_PS = [0.5, 0.9];
// enterT()'s default entrance is 380ms; 500ms over 16 cells is ~33ms per cell,
// i.e. one real frame at the engine's 30fps, so no entrance frame is skipped.
const ENTRANCE_WINDOW = "0:500";

function parseArgs(argv) {
  const opts = { ...DEFAULTS, all: false, kind: null, aspect: null, window: null, scene: null };
  for (const arg of argv) {
    const m = /^--([a-zA-Z]+)(?:=(.*))?$/.exec(arg);
    if (!m) throw new Error(`unrecognised argument: ${arg}`);
    const [, key, value] = m;
    if (key === "all") opts.all = true;
    else if (key === "entrance") opts.window = ENTRANCE_WINDOW;
    else if (key in opts) opts[key] = typeof DEFAULTS[key] === "number" ? Number(value) : value;
    else throw new Error(`unknown flag: --${key}`);
  }
  if (opts.scene && opts.all) throw new Error("--scene targets one scene; it cannot be combined with --all");
  if (!opts.all && !opts.kind && !opts.scene) throw new Error("pass --kind=<kind>, --scene=<id>, or --all");
  if (opts.aspect && opts.aspect !== "short" && opts.aspect !== "long")
    throw new Error(`--aspect must be short or long, got ${opts.aspect}`);
  if (typeof opts.window === "string") {
    const [from, to] = opts.window.split(":").map(Number);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
      throw new Error(`--window must be <fromMs>:<toMs> with to > from, got ${opts.window}`);
    opts.window = { fromMs: from, toMs: to };
  }
  return opts;
}

async function writeDataUrl(file, dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  await writeFile(file, Buffer.from(base64, "base64"));
}

const opts = parseArgs(process.argv.slice(2));
const aspects = opts.aspect ? [opts.aspect] : ["short", "long"];

const probeUrl = `${opts.base}/probe`;
try {
  const res = await fetch(probeUrl, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (err) {
  console.error(`Cannot reach ${probeUrl} (${err.message}). Start the dev server first: npm run dev`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

let currentKind = "startup";
const logs = new Map(); // kind -> { line, fatal }[]
const record = (kind, line, fatal = true) => {
  if (!logs.has(kind)) logs.set(kind, []);
  logs.get(kind).push({ line, fatal });
};
page.on("console", (m) => {
  // Warnings (three.js chatter) are worth reading but are not a failure.
  if (m.type() === "error") record(currentKind, `[console.error] ${m.text()}`);
  else if (m.type() === "warning") record(currentKind, `[console.warning] ${m.text()}`, false);
});
page.on("pageerror", (e) => record(currentKind, `[pageerror] ${String(e)}`));

await page.goto(probeUrl, { waitUntil: "domcontentloaded" });
// options are the THIRD arg — passing them second makes Playwright treat them as
// the page-function argument and silently fall back to the 30s default.
await page.waitForFunction(() => window.__PROBE_DONE === true, null, { timeout: 180000 });

const indexed = await page.evaluate(() => window.__PROBE_KINDS ?? []);
const missing = await page.evaluate(() => window.__PROBE_MISSING_KINDS ?? []);
if (missing.length) console.warn(`WARN ${missing.length} kind(s) have no demo scene: ${missing.join(", ")}`);

// --scene pins one exact demo scene, which is the only way to reach the other
// entrance styles of a painter that seeds its variant from scene.id.
const scenes = await page.evaluate(() => window.__PROBE_SCENES ?? []);
if (opts.scene) {
  const hit = scenes.find((s) => s.id === opts.scene);
  if (!hit) {
    console.error(`No demo scene with id "${opts.scene}". Known ids: ${scenes.length}`);
    await browser.close();
    process.exit(1);
  }
  if (opts.kind && opts.kind !== hit.kind) {
    console.error(`Scene "${opts.scene}" is kind "${hit.kind}", not "${opts.kind}"`);
    await browser.close();
    process.exit(1);
  }
  opts.kind = hit.kind;
}

const kinds = opts.all ? indexed : [opts.kind];
const unknown = kinds.filter((k) => !indexed.includes(k));
if (unknown.length) {
  console.error(`No demo scene for: ${unknown.join(", ")}`);
  await browser.close();
  process.exit(1);
}

const failed = [];
const deadline = (ms, label) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${label}`)), ms).unref());

let fatalStall = null;
for (const kind of kinds) {
  currentKind = kind;
  const dir = opts.scene ? path.join(opts.out, kind, opts.scene) : path.join(opts.out, kind);
  await mkdir(dir, { recursive: true });
  let kindOk = true;
  try {
    for (const aspect of aspects) {
      const stripOk = await Promise.race([
        page.evaluate((a) => window.__PROBE_FILMSTRIP(a), {
          kind,
          sceneId: opts.scene ?? undefined,
          aspect,
          cols: opts.cols,
          rows: opts.rows,
          cellW: opts.cellW,
          ...(opts.window ?? {}),
        }),
        deadline(opts.timeout, `${kind}/${aspect} filmstrip`),
      ]);
      kindOk &&= stripOk;
      const stripName = opts.window
        ? `${aspect}-strip-${opts.window.fromMs}-${opts.window.toMs}ms.png`
        : `${aspect}-strip.png`;
      await writeDataUrl(
        path.join(dir, stripName),
        await page.evaluate(() => document.querySelector("canvas").toDataURL("image/png"))
      );

      // Detail frames are p-based and identical across windows — shoot them once.
      for (const p of opts.window ? [] : DETAIL_PS) {
        const frameOk = await Promise.race([
          page.evaluate((a) => window.__PROBE_RENDER(a), { kind, sceneId: opts.scene ?? undefined, aspect, p }),
          deadline(opts.timeout, `${kind}/${aspect} p=${p}`),
        ]);
        kindOk &&= frameOk;
        await writeDataUrl(
          path.join(dir, `${aspect}-p${Math.round(p * 100)}.png`),
          await page.evaluate(() => document.querySelector("canvas").toDataURL("image/png"))
        );
      }
    }
  } catch (err) {
    record(kind, `[harness] ${err.message}`);
    kindOk = false;
    // A blocked page thread never recovers, so every later kind would hang too.
    if (err.message.startsWith("timed out")) fatalStall = kind;
  }

  const painterErrors = fatalStall
    ? []
    : await page
        .evaluate(() => {
          const errs = window.__PROBE_ERRORS ?? [];
          window.__PROBE_ERRORS = [];
          return errs;
        })
        .catch(() => []);
  for (const e of painterErrors) record(kind, `[painter] ${e}`);

  const entries = logs.get(kind) ?? [];
  await writeFile(path.join(dir, "console.log"), entries.length ? `${entries.map((e) => e.line).join("\n")}\n` : "");
  const ok = kindOk && !entries.some((e) => e.fatal);
  if (!ok) failed.push(kind);
  console.log(`${ok ? "ok  " : "FAIL"} ${kind}  (${aspects.join(",")})`);
  if (fatalStall) break;
}

await browser.close();

if (fatalStall) {
  console.error(`\nAborted: ${fatalStall} blocked the page thread. Fix it, then re-run.`);
  process.exit(1);
}
if (failed.length) {
  console.error(`\n${failed.length}/${kinds.length} kind(s) reported errors: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`\n${kinds.length} kind(s) captured into ${opts.out}/`);

// Measures rubric section 1 (containment) across every kind, both aspects, without
// a human looking at 220 contact sheets. Renders the scene and the bare background
// separately and diffs a 3px border ring: content in that ring is clipped at the
// frame edge. Writes qa/AUDIT.md sorted worst-first.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.PROBE_BASE ?? "http://localhost:4321";
// Below this, a ring hit is antialiasing or an intentional full-bleed backdrop.
const FLAG_FRACTION = 0.02;

const res = await fetch(`${BASE}/probe`).catch(() => null);
if (!res?.ok) {
  console.error(`Cannot reach ${BASE}/probe — start the dev server first: npm run dev`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${BASE}/probe`, { waitUntil: "domcontentloaded" });
// options are the THIRD arg — passing them second makes Playwright treat them as
// the page-function argument and silently fall back to the 30s default.
await page.waitForFunction(() => window.__PROBE_DONE === true, null, { timeout: 180000 });

const kinds = await page.evaluate(() => window.__PROBE_KINDS ?? []);
const rows = [];
for (const kind of kinds) {
  for (const aspect of ["short", "long"]) {
    const r = await page
      .evaluate((a) => window.__PROBE_EDGEBLEED(a), { kind, aspect })
      .catch((e) => ({ error: String(e).slice(0, 120) }));
    if (!r) continue;
    if (r.error) {
      rows.push({ kind, aspect, worst: -1, note: r.error });
      continue;
    }
    const worst = Math.max(r.top, r.bottom, r.left, r.right);
    const edges = Object.entries(r)
      .filter(([k, v]) => k !== "worstP" && v >= FLAG_FRACTION)
      .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
      .join(", ");
    rows.push({ kind, aspect, worst, edges });
  }
  process.stdout.write(".");
}
process.stdout.write("\n");
await browser.close();

const flagged = rows.filter((r) => r.worst >= FLAG_FRACTION).sort((a, b) => b.worst - a.worst);
await mkdir("qa", { recursive: true });
await writeFile(
  "qa/AUDIT.md",
  `# Edge-bleed audit\n\nAutomated containment measurement — see \`scripts/edge-audit.mjs\`. A row means painted\ncontent sits in the outer 3px of the frame at p=0.5 or p=0.9, i.e. it is clipped.\nThreshold: ${FLAG_FRACTION * 100}% of a border band.\n\n**${flagged.length} of ${rows.length} kind/aspect combinations bleed off-frame.**\n\n| kind | aspect | worst edge | edges over threshold |\n|---|---|---|---|\n` +
    flagged.map((r) => `| ${r.kind} | ${r.aspect} | ${(r.worst * 100).toFixed(1)}% | ${r.edges || r.note || ""} |`).join("\n") +
    "\n"
);
console.log(`${flagged.length}/${rows.length} combinations bleed off-frame -> qa/AUDIT.md`);
console.log(flagged.slice(0, 15).map((r) => `  ${(r.worst * 100).toFixed(1).padStart(5)}%  ${r.kind} (${r.aspect})  ${r.edges}`).join("\n"));

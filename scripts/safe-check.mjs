// Caption-band intrusion measurement — the failure edge-check/edge-audit cannot see.
//
// They sample a 3px ring at the FRAME edge. Content can sit entirely inside the
// frame and still be drawn underneath the burned-in karaoke caption and the
// YouTube UI, which live above `layout.safeBottom`. That happened in showdown,
// race, constellation and calendar while edge-bleed read 0.0% throughout.
//
//   node scripts/safe-check.mjs --kind=calendar   -> one kind, writes nothing
//   node scripts/safe-check.mjs                   -> all kinds, writes qa/SAFEAREA.md
//
// The write-only-when-sweeping split mirrors edge-check vs edge-audit so parallel
// QA agents scoped to one kind cannot collide on a shared report file.
//
// KNOWN LIMITATION — read before "fixing" a row. This reports the lowest
// hard-contrast pixel, but the documented rule is that nothing LOAD-BEARING may
// sit in the band (`CLAUDE_PROMPT.md` §28): a decorative backdrop is allowed to
// overhang, and several painters set their 3D viewport to the full frame on
// purpose. `stat` is the worked example — at 9:16 its context sentence finished
// at y=1345 against a safeBottom of 1321.5 (a real defect, fixed), while its
// slab and plinth reach y=1663 (deliberate, left alone). The row said 341px
// either way. So a row here is a CANDIDATE: open the frame and decide whether
// what crosses the line is content or backdrop.
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
const res = await fetch(`${BASE}/probe`).catch(() => null);
if (!res?.ok) {
  console.error(`Cannot reach ${BASE}/probe — start the dev server: npm run dev`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${BASE}/probe`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__PROBE_DONE === true, null, { timeout: 180000 });

const kinds = args.kind ? [args.kind] : await page.evaluate(() => window.__PROBE_KINDS ?? []);
const rows = [];

for (const kind of kinds) {
  for (const aspect of ["short", "long"]) {
    const r = await page.evaluate(
      (a) => window.__PROBE_SAFEBOTTOM(a),
      { kind, sceneId: args.scene || undefined, aspect }
    );
    if (!r) {
      if (args.kind) console.log(`${aspect}: no demo scene`);
      continue;
    }
    rows.push({ kind, aspect, ...r });
    if (args.kind) {
      const verdict = r.clearance < 0 ? "INTRUDES" : "clear";
      console.log(
        `${aspect}: ${verdict}  lowest painted row ${r.lowest} vs safeBottom ${r.safeBottom.toFixed(1)} ` +
          `(clearance ${r.clearance.toFixed(1)}px, ${(r.over * 100).toFixed(2)}% of band, worst p=${r.worstP})`
      );
    }
  }
}

const bad = rows.filter((r) => r.clearance < 0).sort((a, b) => a.clearance - b.clearance);

if (args.kind) {
  console.log(`WORST_CLEARANCE ${Math.min(...rows.map((r) => r.clearance)).toFixed(1)}px  ${bad.length ? "FAIL" : "PASS"}`);
} else {
  const lines = [
    "# Caption-band (safe-area) audit",
    "",
    "Automated measurement of content drawn BELOW `layout.safeBottom` — the band holding the",
    "burned-in karaoke caption and the YouTube UI. See `scripts/safe-check.mjs`.",
    "",
    "**This is not the same check as `qa/AUDIT.md`.** Edge-bleed samples a 3px ring at the frame",
    "edge, so content can sit fully inside the frame and still be drawn under the caption; four",
    "kinds did exactly that while edge-bleed read 0.0%. A row here means painted content crossed",
    "`safeBottom` at one or more sampled progress values.",
    "",
    "**A row is a CANDIDATE, not a verdict.** The rule is that nothing LOAD-BEARING may sit in the",
    "band; a decorative backdrop may overhang, and several painters set their 3D viewport to the full",
    "frame deliberately. `stat` showed both at once: its context sentence ended below the line (a real",
    "defect) while its slab and plinth reach 340px lower by design. Open the frame before fixing.",
    "",
    `**${bad.length} of ${rows.length} kind/aspect combinations intrude into the caption band.**`,
    "",
  ];
  if (bad.length) {
    lines.push("| kind | aspect | lowest row | safeBottom | over by | % of band | worst p |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const r of bad) {
      lines.push(
        `| ${r.kind} | ${r.aspect} | ${r.lowest} | ${r.safeBottom.toFixed(1)} | ` +
          `**${Math.abs(r.clearance).toFixed(1)}px** | ${(r.over * 100).toFixed(2)}% | ${r.worstP} |`
      );
    }
    lines.push("");
  }
  const tight = rows
    .filter((r) => r.clearance >= 0 && r.clearance < 12)
    .sort((a, b) => a.clearance - b.clearance);
  if (tight.length) {
    lines.push("## Clear, but by less than 12px", "");
    lines.push("| kind | aspect | clearance |");
    lines.push("|---|---|---|");
    for (const r of tight) lines.push(`| ${r.kind} | ${r.aspect} | ${r.clearance.toFixed(1)}px |`);
    lines.push("");
  }
  await mkdir(path.join(ROOT, "qa"), { recursive: true });
  await writeFile(path.join(ROOT, "qa/SAFEAREA.md"), lines.join("\n"), "utf8");
  console.log(`${bad.length} of ${rows.length} intrude — wrote qa/SAFEAREA.md`);
  for (const r of bad.slice(0, 20)) {
    console.log(`  ${r.kind} ${r.aspect}: over by ${Math.abs(r.clearance).toFixed(1)}px (p=${r.worstP})`);
  }
}

await browser.close();

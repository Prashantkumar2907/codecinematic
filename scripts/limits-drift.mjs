// Guard against the HARD LIMITS blocks in prompt.ts drifting apart again.
//
// They already had. The refine prompt named 43 scene kinds where the regen
// prompt named 54, silently dropping 11 -- so a refined script was held to a
// smaller rule set than the one that generated it, and a refine round could
// introduce a violation the generate round would have rejected.
//
// The compact block is now a single constant used by both of those prompts, so
// they cannot diverge. The bulleted block inside the main generation prompt is a
// different PRESENTATION of the same rules and stays its own text -- this checks
// that the two presentations still cover the same scene kinds.
//
//   node scripts/limits-drift.mjs        exit 1 if they disagree
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prompt = await readFile(path.join(ROOT, "src/lib/prompt.ts"), "utf8");
const registry = await readFile(path.join(ROOT, "src/studio/painters/index.ts"), "utf8");

/** Every registered scene kind, from the painters record ALL_SCENE_KINDS is built from. */
const KINDS = [...new Set([...registry.matchAll(/^\s*"?([a-z0-9_]+)"?:/gm)].map((m) => m[1]))];

const compact = prompt.split("const HARD_LIMITS_COMPACT = `")[1]?.split("`;")[0];
if (!compact) {
  console.error("could not find HARD_LIMITS_COMPACT — has prompt.ts been restructured?");
  process.exit(1);
}

const bulletStart = prompt.indexOf("HARD LIMITS — validated mechanically");
if (bulletStart < 0) {
  console.error("could not find the bulleted HARD LIMITS block");
  process.exit(1);
}
// The bulleted block runs to the first blank line followed by a non-list line.
const bulleted = prompt.slice(bulletStart).split("\n\n")[0];

const named = (block) => new Set(KINDS.filter((k) => new RegExp(`\\b${k}\\b`).test(block.toLowerCase())));
const inCompact = named(compact);
const inBulleted = named(bulleted);

const onlyCompact = [...inCompact].filter((k) => !inBulleted.has(k)).sort();
const onlyBulleted = [...inBulleted].filter((k) => !inCompact.has(k)).sort();

console.log(`registered kinds: ${KINDS.length}`);
console.log(`named by the compact block:  ${inCompact.size}`);
console.log(`named by the bulleted block: ${inBulleted.size}`);

if (onlyCompact.length || onlyBulleted.length) {
  console.error("\nHARD LIMITS blocks have drifted:");
  if (onlyCompact.length) console.error(`  only in compact:  ${onlyCompact.join(", ")}`);
  if (onlyBulleted.length) console.error(`  only in bulleted: ${onlyBulleted.join(", ")}`);
  process.exit(1);
}
console.log("\n✓ both blocks name the same scene kinds");

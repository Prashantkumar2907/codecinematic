// Validate a hand-authored gold exemplar (improvement_plan.md Phase 17).
//
// A gold script is only worth shipping into the prompt if it passes everything a
// generated script must pass, so this runs the SAME checks the generate route
// runs -- the zod schema, the narration budget, and every soft gate -- rather
// than a second opinion that could drift from it.
//
//   node scripts/exemplar-check.mjs content/exemplars/<file>.json
//   node scripts/exemplar-check.mjs --all
//
// No dev server. Exit code is non-zero if anything fails.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sceneScriptSchema, narrationWordCount, NARRATION_BUDGET, sceneBeats,
  firstAdjacentBigtext, vocabExampleMissingWord, bigtextAfterLastQuestion,
  firstBeatFormulaic, shortSceneOverdense,
} from "../src/studio/schema.ts";
import {
  staticCardOverrun, overlongBeats, definitionOpener, tooManyBigtext,
  crutchPhrases, runningExampleWeak, jargonUnanchored, unbrokenClause, pacingReport,
} from "../src/studio/pacing.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

const GATES = [
  ["definition opener", definitionOpener],
  ["too many title cards", tooManyBigtext],
  ["frozen card", staticCardOverrun],
  ["beat length", overlongBeats],
  ["filler openers", crutchPhrases],
  ["no breathing room", unbrokenClause],
  ["no running example", runningExampleWeak],
  ["unexplained jargon", jargonUnanchored],
];

async function check(file) {
  const raw = JSON.parse(await readFile(file, "utf8"));
  const name = path.relative(ROOT, file);
  const problems = [];

  const parsed = sceneScriptSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 12)) {
      problems.push(`schema · ${i.path.join(".")}: ${i.message}`);
    }
    return { name, problems, fatal: true };
  }
  const script = parsed.data;

  const budget = NARRATION_BUDGET[script.format];
  const words = narrationWordCount(script);
  if (words < budget.min || words > budget.max) {
    problems.push(`word budget · ${words} words, must be ${budget.min}-${budget.max}`);
  }

  if (firstAdjacentBigtext(script) >= 0) problems.push("two bigtext scenes back to back");
  if (vocabExampleMissingWord(script)) problems.push("a vocab example never uses its word");
  if (bigtextAfterLastQuestion(script) >= 0) problems.push("a card follows the ending question");
  const hook = firstBeatFormulaic(script);
  if (hook) problems.push(`formulaic hook · "${hook}…"`);
  const dense = shortSceneOverdense(script);
  if (dense) problems.push(`too dense for 9:16 · ${dense.id}: ${dense.detail}`);

  for (const [label, gate] of GATES) {
    const hit = gate(script);
    if (hit) problems.push(`${label} · ${hit.detail}`);
  }

  const r = pacingReport(script);
  const kinds = new Set(script.scenes.map((s) => s.kind));
  const beats = script.scenes.flatMap((s) => sceneBeats(s));
  const stats =
    `${script.format} · ${script.scenes.length} scenes · ${beats.length} beats · ${words} words · ` +
    `${kinds.size} distinct kinds · est ${r.estSeconds.toFixed(0)}s · ` +
    `mean hold ${(r.estSeconds / beats.length).toFixed(1)}s · ` +
    `static-card audio ${(r.staticCardSeconds / r.estSeconds * 100).toFixed(0)}%`;

  return { name, problems, stats };
}

let files = args.filter((a) => !a.startsWith("--")).map((a) => path.resolve(a));
if (args.includes("--all") || !files.length) {
  const dir = path.join(ROOT, "content/exemplars");
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
  } catch {
    console.error("no content/exemplars/ yet");
    process.exit(1);
  }
}
if (!files.length) {
  console.error("no exemplar files found");
  process.exit(1);
}

let failed = 0;
for (const f of files) {
  const r = await check(f);
  const ok = r.problems.length === 0;
  if (!ok) failed++;
  console.log(`\n${ok ? "PASS" : "FAIL"}  ${r.name}`);
  if (r.stats) console.log(`      ${r.stats}`);
  for (const p of r.problems) console.log(`   ✗  ${p}`);
}
console.log(`\n${files.length - failed}/${files.length} exemplar(s) pass every gate`);
process.exit(failed ? 1 : 0);

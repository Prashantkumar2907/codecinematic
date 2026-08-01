// Does the gold exemplar actually change the draft? (improvement_plan.md Phase 17)
//
// This is the kill-gate for 17.1b: writing ~18 more exemplars is only worth it if
// ONE of them measurably moves the output. Generates the same topic with and
// without `exemplarScript` and scores both with the same gates the route uses.
//
//   node scripts/exemplar-ab.mjs --runs=2 --key=billed-1
//
// Spends real Gemini quota. Defaults to free keys; pass --key/--allow-billed to
// use a billed one.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sceneScriptSchema, narrationWordCount, NARRATION_BUDGET, sceneBeats } from "../src/studio/schema.ts";
import {
  pacingReport, countWords, staticCardOverrun, overlongBeats, definitionOpener, tooManyBigtext,
  crutchPhrases, runningExampleWeak, jargonUnanchored, unbrokenClause, hookTooLong,
} from "../src/studio/pacing.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.STUDIO_BASE ?? "http://localhost:4321";
const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const h = args.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  return h ? (h.includes("=") ? h.slice(h.indexOf("=") + 1) : true) : d;
};
const RUNS = Number(flag("runs", 2));
const KEY_ID = flag("key", null);
const MODEL = flag("model", null);
const FREE_ONLY = !KEY_ID && !flag("allow-billed");
const TIMEOUT_MS = 600_000;

const TARGET = {
  subject: "coding",
  module: "frontend",
  submodule: "javascript",
  format: "short",
  // Deliberately NOT the exemplar's topic, so a win cannot be plagiarism.
  topic: "How the event loop decides what runs next",
};

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

async function generate(exemplarScript) {
  const res = await fetch(`${BASE}/api/studio/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...TARGET,
      lang: "en",
      freeOnly: FREE_ONLY,
      ...(KEY_ID ? { keyId: KEY_ID } : {}),
      ...(MODEL ? { model: MODEL } : {}),
      ...(exemplarScript ? { exemplarScript } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  const lines = text.trim().split("\n").filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]);
  if (last.error) throw new Error(String(last.error).slice(0, 200));
  if (!last.script) throw new Error("stream ended without a script");
  // Repair rounds are the cost side of the ledger: a better first draft should
  // need fewer of them, which is the throughput argument in the plan's red team.
  const repairs = lines.filter((l) => l.includes('"repairing"')).length;
  return { script: last.script, warnings: last.warnings ?? [], repairs };
}

function score(raw) {
  const parsed = sceneScriptSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, gates: ["SCHEMA INVALID"] };
  const s = parsed.data;
  const r = pacingReport(s);
  const beats = s.scenes.flatMap((x) => sceneBeats(x));
  const budget = NARRATION_BUDGET[s.format];
  const words = narrationWordCount(s);
  const failing = GATES.filter(([, g]) => g(s)).map(([l]) => l);
  return {
    valid: true,
    words,
    inBudget: words >= budget.min && words <= budget.max,
    scenes: s.scenes.length,
    beats: beats.length,
    kinds: new Set(s.scenes.map((x) => x.kind)).size,
    bigtext: s.scenes.filter((x) => x.kind === "bigtext").length,
    meanHold: r.estSeconds / beats.length,
    staticShare: r.staticCardSeconds / r.estSeconds,
    overlong: r.overlongBeats.length,
    crutch: r.crutchHits.length,
    // 13.1c set the hook budget from the viewer rather than the corpus, so the
    // only honest test is whether a FRESH draft complies on the first pass.
    hookWords: sceneBeats(s.scenes[0])[0] ? countWords(sceneBeats(s.scenes[0])[0].text) : 0,
    hookOver: !!hookTooLong(s),
    gates: failing,
  };
}

const exemplar = await readFile(
  path.join(ROOT, "content/exemplars/coding-frontend-javascript-short.json"), "utf8"
);

const results = { with: [], without: [] };
for (let i = 0; i < RUNS; i++) {
  for (const arm of ["without", "with"]) {
    process.stdout.write(`run ${i + 1}/${RUNS} ${arm} exemplar… `);
    try {
      const g = await generate(arm === "with" ? exemplar : undefined);
      const sc = score(g.script);
      sc.repairs = g.repairs;
      // The first A/B saved metrics only, so 17.1 could not be unblocked the way
      // its own row says to unblock it -- by watching one video per arm. Keep the
      // scripts so they can be rendered.
      const scriptPath = path.join(ROOT, "qa/exemplar-ab", `${arm}-${i + 1}.json`);
      await mkdir(path.join(ROOT, "qa/exemplar-ab"), { recursive: true });
      await writeFile(scriptPath, JSON.stringify(g.script, null, 2));
      sc.scriptPath = path.relative(ROOT, scriptPath);
      results[arm].push(sc);
      console.log(`ok — ${sc.gates.length} gate(s) failing, ${g.repairs} repair round(s)`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }
}

const mean = (xs, f) => (xs.length ? xs.reduce((a, b) => a + f(b), 0) / xs.length : NaN);
const fmt = (n, d = 1) => (Number.isNaN(n) ? "—" : n.toFixed(d));
const ROWS = [
  ["gates failing", (x) => x.gates.length, 0, "lower"],
  ["repair rounds", (x) => x.repairs, 1, "lower"],
  ["distinct kinds", (x) => x.kinds, 1, "higher"],
  ["bigtext cards", (x) => x.bigtext, 1, "lower"],
  ["mean hold (s)", (x) => x.meanHold, 1, "lower"],
  ["static-card share", (x) => x.staticShare * 100, 0, "lower"],
  ["beats over 12s", (x) => x.overlong, 1, "lower"],
  ["crutch hits", (x) => x.crutch, 1, "lower"],
  ["hook words", (x) => x.hookWords, 1, "lower"],
  ["hook over budget", (x) => (x.hookOver ? 1 : 0), 1, "lower"],
  ["narration words", (x) => x.words, 0, "—"],
];

console.log(`\n${"metric".padEnd(20)}${"without".padStart(10)}${"with".padStart(10)}   better`);
console.log("-".repeat(52));
for (const [label, f, d, dir] of ROWS) {
  console.log(`${label.padEnd(20)}${fmt(mean(results.without, f), d).padStart(10)}${fmt(mean(results.with, f), d).padStart(10)}   ${dir}`);
}
console.log(`\nn = ${results.without.length} without, ${results.with.length} with. Generation is nondeterministic — treat a single run per arm as directional only.`);
for (const arm of ["without", "with"]) {
  for (const [i, r] of results[arm].entries()) {
    if (r.gates.length) console.log(`  ${arm} #${i + 1} failing: ${r.gates.join(", ")}`);
  }
}

await mkdir(path.join(ROOT, "qa"), { recursive: true });
// Only overwrite on a run that produced something. A patch bug once made every
// generation throw, and the empty result set replaced a good A/B on disk.
if (results.with.length || results.without.length) {
  await writeFile(path.join(ROOT, "qa/exemplar-ab.json"), JSON.stringify(results, null, 2));
  console.log("\nwrote qa/exemplar-ab.json");
} else {
  console.log("\nevery run failed — leaving qa/exemplar-ab.json untouched");
}

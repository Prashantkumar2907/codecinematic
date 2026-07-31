// Pacing audit: runs src/studio/pacing.ts over every generated script and writes
// qa/PACING.md worst-first. This is the before/after instrument for the content
// workstream — nothing in improvement_plan.md Phases 4-6 is verifiable without it.
//
//   node scripts/pacing-audit.mjs                 whole corpus -> qa/PACING.md
//   node scripts/pacing-audit.mjs --out=-         print the report instead
//   node scripts/pacing-audit.mjs --json=qa/pacing.json   also emit machine-readable
//   node scripts/pacing-audit.mjs --include-demos aggregate the demo fixtures too
//
// No dev server needed, unlike filmstrip/edge-audit: this is pure JSON maths.
// The pacing logic is NOT reimplemented here — it is imported from the same
// TypeScript module the soft gates and the rating prompt use, so the audit and
// the gate can never disagree. Node 22 strips the types on import, which is why
// these specifiers carry explicit .ts extensions.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  pacingReport, jargonReport, singleBeatCapSeconds,
  staticCardOverrun, overlongBeats, definitionOpener, tooManyBigtext, crutchPhrases, runningExampleWeak, jargonUnanchored, unbrokenClause,
  OVERLONG_BEAT_SEC, SPOKEN_WORDS_PER_SEC, STATIC_CARD_SHARE_TARGET, VISUAL_CHANGE_ACCEPT_SEC, GATE_THRESHOLDS,
} from "../src/studio/pacing.ts";
import { narrationWordCount } from "../src/studio/schema.ts";
import * as DEMO from "../src/studio/demo.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
};
const OUT = flag("out", "qa/PACING.md");
const JSON_OUT = flag("json", null);
const INCLUDE_DEMOS = flag("include-demos", false) === true;

/** Topics of the hand-written fixtures in demo.ts, so a demo render never
 *  contaminates a corpus statistic. Read from demo.ts rather than hardcoded,
 *  so a new fixture is excluded automatically. */
const DEMO_TOPICS = new Set(
  Object.entries(DEMO)
    .filter(([k, v]) => k.startsWith("DEMO_") && v && typeof v === "object" && typeof v.topic === "string")
    .map(([, v]) => v.topic)
);

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (e.isFile() && e.name.endsWith(".json")) out.push(full);
  }
  return out;
}

/** Every script in the corpus, with where it came from and how it was rated. */
async function loadCorpus() {
  const items = [];

  for (const file of await walk(path.join(ROOT, "content/factory"))) {
    if (path.basename(file) === "directives.json") continue;
    let raw;
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      items.push({ file, error: `unparseable: ${String(err).slice(0, 80)}` });
      continue;
    }
    // A factory slot wraps the script alongside its status/rating/attempts.
    const script = raw?.script;
    if (!script || !Array.isArray(script.scenes)) {
      items.push({ file, error: "no script.scenes" });
      continue;
    }
    items.push({
      file: path.relative(ROOT, file),
      source: "factory",
      status: raw.status ?? null,
      rating: raw.rating?.overall ?? null,
      attempts: raw.attemptsUsed ?? null,
      script,
    });
  }

  for (const file of await walk(path.join(ROOT, "content/videos"))) {
    if (path.basename(file) !== "script.json") continue;
    let script;
    try {
      script = JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      items.push({ file, error: `unparseable: ${String(err).slice(0, 80)}` });
      continue;
    }
    if (!Array.isArray(script?.scenes)) {
      items.push({ file, error: "no scenes" });
      continue;
    }
    items.push({ file: path.relative(ROOT, file), source: "video", status: "saved", rating: null, attempts: null, script });
  }

  return items;
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const s1 = (n) => n.toFixed(1);

const corpus = await loadCorpus();
const broken = corpus.filter((c) => c.error);
const usable = corpus.filter((c) => !c.error);
const demos = usable.filter((c) => DEMO_TOPICS.has(c.script.topic));
const scored = INCLUDE_DEMOS ? usable : usable.filter((c) => !DEMO_TOPICS.has(c.script.topic));

const rows = scored.map((c) => {
  const r = pacingReport(c.script);
  // The gate and the audit must agree with the existing word-floor gate, or a new
  // narration cap and the floor will fight each other for all three repair rounds.
  const schemaWords = narrationWordCount(c.script);
  return { ...c, report: r, wordCountAgrees: schemaWords === r.words, schemaWords };
});

const disagreements = rows.filter((r) => !r.wordCountAgrees);

const totals = rows.reduce(
  (a, r) => {
    const p = r.report;
    a.scripts += 1;
    a.scenes += p.scenes;
    a.beats += p.beats;
    a.words += p.words;
    a.seconds += p.estSeconds;
    a.staticSeconds += p.staticCardSeconds;
    a.staticScenes += p.staticCardScenes;
    a.overlong += p.overlongBeats.length;
    a.crutch += p.crutchHits.length;
    if (p.opensWithStaticCard) a.opensStatic += 1;
    if (p.opensWithInherentCard) a.opensInherentCard += 1;
    if (p.opensWithDefinition) a.opensDefinition += 1;
    if (p.opensWithDefinitionLoose) a.opensDefinitionLoose += 1;
    a.definitionBeats += p.definitionShapedBeats.length;
    a.coverage.push(p.runningExample.coverage);
    for (const k of p.kindMix) a.kinds.set(k.kind, (a.kinds.get(k.kind) ?? 0) + k.scenes);
    for (const c of p.crutchHits) a.crutchBy.set(c.phrase, (a.crutchBy.get(c.phrase) ?? 0) + 1);
    if (p.format === "long") {
      a.long += 1;
      a.longScenes += p.scenes;
      a.longStaticScenes += p.staticCardScenes;
      a.longSeconds += p.estSeconds;
      a.longStaticSeconds += p.staticCardSeconds;
    } else a.short += 1;
    return a;
  },
  {
    scripts: 0, scenes: 0, beats: 0, words: 0, seconds: 0, staticSeconds: 0, staticScenes: 0,
    overlong: 0, crutch: 0, opensStatic: 0, opensInherentCard: 0, opensDefinition: 0,
    opensDefinitionLoose: 0, definitionBeats: 0,
    long: 0, short: 0, longScenes: 0, longStaticScenes: 0, longSeconds: 0, longStaticSeconds: 0,
    coverage: [], kinds: new Map(), crutchBy: new Map(),
  }
);

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// Every bigtext beat across the corpus, since bigtext is the #1 kind and the
// single biggest contributor to dead frames.
const bigtextBeats = rows.flatMap((r) => r.report.beatSeconds.filter((b) => b.kind === "bigtext"));
const bigtextLong = rows
  .filter((r) => r.report.format === "long")
  .flatMap((r) => r.report.beatSeconds.filter((b) => b.kind === "bigtext"));

const worstScripts = [...rows].sort((a, b) => b.report.staticCardShare - a.report.staticCardShare);
const worstBeats = rows
  .flatMap((r) => r.report.beatSeconds.map((b) => ({ ...b, topic: r.report.topic, file: r.file })))
  .sort((a, b) => b.seconds - a.seconds)
  .slice(0, 25);

const lines = [];
lines.push("# Pacing audit");
lines.push("");
lines.push("Generated by `node scripts/pacing-audit.mjs`. Worst-first. **Do not hand-edit.**");
lines.push("");
lines.push(
  `Seconds are ESTIMATES at \`SPOKEN_WORDS_PER_SEC = ${SPOKEN_WORDS_PER_SEC}\` (≈${Math.round(SPOKEN_WORDS_PER_SEC * 60)} wpm), ` +
    "speech only — inter-beat gaps and scene tails are engine constants and are excluded. " +
    "Real durations come from measured audio; Phase 15 of `improvement_plan.md` reconciles the two."
);
lines.push("");
lines.push("## Corpus");
lines.push("");
lines.push("| | |");
lines.push("|---|---|");
lines.push(`| Scripts scored | **${totals.scripts}** (${totals.long} long, ${totals.short} short) |`);
lines.push(`| Scenes | ${totals.scenes} |`);
lines.push(`| Beats | ${totals.beats} |`);
lines.push(`| Narration words | ${totals.words} |`);
lines.push(`| Estimated audio | ${s1(totals.seconds / 60)} min |`);
lines.push(`| Demo fixtures excluded | ${demos.length}${INCLUDE_DEMOS ? " (INCLUDED via --include-demos)" : ""} |`);
lines.push(`| Unreadable files | ${broken.length} |`);
lines.push(
  `| Word count matches \`narrationWordCount()\` | ${disagreements.length === 0 ? "**yes, all " + rows.length + "**" : "**NO — " + disagreements.length + " disagree**"} |`
);
lines.push("");
lines.push("## Headline metrics");
lines.push("");
lines.push("| Metric | Value | Target |");
lines.push("|---|---|---|");
lines.push(
  `| Audio over single-beat static cards | **${pct(totals.seconds ? totals.staticSeconds / totals.seconds : 0)}** (${s1(totals.staticSeconds / 60)} of ${s1(totals.seconds / 60)} min) | < ${pct(STATIC_CARD_SHARE_TARGET)} |`
);
lines.push(
  `| Long videos: static-card scenes | **${pct(totals.longScenes ? totals.longStaticScenes / totals.longScenes : 0)}** (${totals.longStaticScenes} of ${totals.longScenes}), ${pct(totals.longSeconds ? totals.longStaticSeconds / totals.longSeconds : 0)} of runtime | — |`
);
lines.push(`| Seconds per visual change (mean beat) | **${s1(totals.beats ? totals.seconds / totals.beats : 0)} s** | ${VISUAL_CHANGE_ACCEPT_SEC.min}-${VISUAL_CHANGE_ACCEPT_SEC.max} s |`);
lines.push(`| Beats over ${OVERLONG_BEAT_SEC} s | **${totals.overlong}** of ${totals.beats} | 0 |`);
lines.push(`| Worst single beat | **${s1(worstBeats[0]?.seconds ?? 0)} s** (${worstBeats[0]?.kind ?? "—"}) | ≤ ${OVERLONG_BEAT_SEC} s |`);
lines.push(`| \`bigtext\` share of all scenes | **${pct(totals.scenes ? (totals.kinds.get("bigtext") ?? 0) / totals.scenes : 0)}** (${totals.kinds.get("bigtext") ?? 0} scenes) | — |`);
lines.push(`| \`bigtext\` seconds per card (long) | **${s1(median(bigtextLong.map((b) => b.seconds)))} s** median, ${s1(Math.max(0, ...bigtextLong.map((b) => b.seconds)))} s worst | — |`);
lines.push(`| Videos opening on a static card | **${totals.opensStatic}** of ${totals.scripts} (${totals.opensInherentCard} an inherently single-beat kind, ${totals.opensStatic - totals.opensInherentCard} a multi-beat kind collapsed to one) | — |`);
lines.push(`| Videos opening on a definition (strict) | **${totals.opensDefinition}** of ${totals.scripts} | 0 |`);
lines.push(`| …with the plan's own loose pattern | ${totals.opensDefinitionLoose} of ${totals.scripts} | see note |`);
lines.push(`| Definition-shaped beats | **${totals.definitionBeats}** of ${totals.beats} (${pct(totals.beats ? totals.definitionBeats / totals.beats : 0)}) | — |`);
lines.push(`| Crutch-phrase hits | **${totals.crutch}** | 0 |`);
lines.push(`| Running-example coverage (proxy) | median **${median(totals.coverage).toFixed(2)}** | > 0.8 |`);
lines.push(`| Distinct scene kinds used | **${totals.kinds.size}** of 110 | ≥ 8 per long |`);
lines.push("");

lines.push("> **On the two definition-opener rows.** The loose pattern is the one");
lines.push("> `improvement_plan.md` §1 used to report \"first spoken beat is a definition — 30%\".");
lines.push("> It reproduces that number, and it is wrong: it matches any `X is Y` sentence, so it");
lines.push("> flags concrete second-person cold-opens (\"Your div-button is a trap. A keyboard user");
lines.push("> just hit Tab, and your entire UI just broke.\") as definitions. Of its matches, the");
lines.push("> overwhelming majority open `Your…`/`You…`/`This…`. The strict row is the honest");
lines.push("> measurement. **Do not build a gate on the loose pattern** — it punishes the exact");
lines.push("> writing the plan is asking for.");
lines.push("");

if (totals.crutchBy.size) {
  lines.push("### Crutch phrases");
  lines.push("");
  lines.push("| Phrase | Hits | Scripts |");
  lines.push("|---|---|---|");
  for (const [phrase, hits] of [...totals.crutchBy].sort((a, b) => b[1] - a[1])) {
    const scripts = rows.filter((r) => r.report.crutchHits.some((c) => c.phrase === phrase)).length;
    lines.push(`| ${phrase} | ${hits} | ${scripts} |`);
  }
  lines.push("");
}

// How often each Phase 4 gate would demand a repair. A gate that fires on almost
// everything costs throughput without improving anything, and the factory already
// exhausts its attempts on 72 of 86 slots.
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
lines.push("## Soft-gate firing rate");
lines.push("");
lines.push(
  `Thresholds (\`GATE_THRESHOLDS\` in pacing.ts): ≥${GATE_THRESHOLDS.overlongBeatCount} overlong beats · ` +
    `≥${GATE_THRESHOLDS.crutchHits} crutch hits · ` +
    `≥${GATE_THRESHOLDS.unbrokenClauseCount} beats over ${GATE_THRESHOLDS.maxClauseWords} words unbroken · ` +
    `running-example coverage <${GATE_THRESHOLDS.runningExampleCoverage} · ` +
    `≥${GATE_THRESHOLDS.jargonMinTerms} terms with <${GATE_THRESHOLDS.jargonAnchoredShare} anchored. ` +
    `Single-beat schema cap = ${singleBeatCapSeconds().toFixed(1)}s against a ${OVERLONG_BEAT_SEC}s target.`
);
lines.push("");
lines.push("| Gate | Fires on | Share |");
lines.push("|---|---|---|");
for (const [label, fn] of GATES) {
  const n = rows.filter((r) => fn(r.script) !== null).length;
  lines.push(`| ${label} | ${n} of ${rows.length} | ${pct(rows.length ? n / rows.length : 0)} |`);
}
const anyGate = rows.filter((r) => GATES.some(([, fn]) => fn(r.script) !== null)).length;
lines.push(`| **any gate** | **${anyGate} of ${rows.length}** | **${pct(rows.length ? anyGate / rows.length : 0)}** |`);
lines.push("");

const jargon = rows.map((r) => jargonReport(r.script));
lines.push("### Jargon anchoring");
lines.push("");
lines.push("| | |");
lines.push("|---|---|");
lines.push(`| Technical terms introduced | ${jargon.reduce((a, j) => a + j.terms, 0)} (median ${median(jargon.map((j) => j.terms))} per script) |`);
lines.push(`| Terms per 100 narration words | median ${median(jargon.map((j) => j.perHundredWords)).toFixed(1)} |`);
lines.push(`| Glossed at first use | median **${median(jargon.map((j) => j.anchoredShare)).toFixed(2)}** of terms |`);
lines.push("");
lines.push("> Anchoring is a proxy: \"technical\" is detected by shape (acronym, CamelCase, snake_case,");
lines.push("> letter+digit, backticked code) and a gloss by cue (apposition, dash, \"which means\", \"think of");
lines.push("> it as\"). Both halves under-count, so a low share is a real signal and a high one only means");
lines.push("> \"no obvious violation\".");
lines.push("");

lines.push("## Worst scripts by static-card share");
lines.push("");
lines.push("| Static share | Est. | Scenes | Static | Worst beat | Opens | Kinds | Topic |");
lines.push("|---|---|---|---|---|---|---|---|");
for (const r of worstScripts.slice(0, 30)) {
  const p = r.report;
  const opens = [p.opensWithStaticCard ? "card" : "", p.opensWithDefinition ? "definition" : ""].filter(Boolean).join("+") || "—";
  lines.push(
    `| **${pct(p.staticCardShare)}** | ${s1(p.estSeconds)}s | ${p.scenes} | ${p.staticCardScenes} | ${s1(p.worstVisualHoldSeconds)}s | ${opens} | ${p.distinctKinds} | ${p.topic.slice(0, 46)} |`
  );
}
lines.push("");

lines.push(`## Longest single beats (dead frames)`);
lines.push("");
lines.push("| Seconds | Words | Kind | Whole scene? | Scene | Topic |");
lines.push("|---|---|---|---|---|---|");
for (const b of worstBeats) {
  lines.push(`| **${s1(b.seconds)}** | ${b.words} | ${b.kind} | ${b.isWholeScene ? "yes" : "no"} | ${b.sceneId} | ${b.topic.slice(0, 40)} |`);
}
lines.push("");

lines.push("## Scene-kind mix");
lines.push("");
lines.push("| Kind | Scenes | Share |");
lines.push("|---|---|---|");
for (const [kind, n] of [...totals.kinds].sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${kind} | ${n} | ${pct(totals.scenes ? n / totals.scenes : 0)} |`);
}
lines.push("");

if (broken.length) {
  lines.push("## Unreadable");
  lines.push("");
  for (const b of broken) lines.push(`- \`${path.relative(ROOT, b.file)}\` — ${b.error}`);
  lines.push("");
}

if (disagreements.length) {
  lines.push("## Word-count disagreements (MUST be empty)");
  lines.push("");
  lines.push("`pacing.countWords` and `schema.narrationWordCount` returned different totals:");
  lines.push("");
  for (const d of disagreements) lines.push(`- \`${d.file}\` — pacing ${d.report.words} vs schema ${d.schemaWords}`);
  lines.push("");
}

const report = lines.join("\n");
if (OUT === "-") {
  console.log(report);
} else {
  await mkdir(path.dirname(path.join(ROOT, OUT)), { recursive: true });
  await writeFile(path.join(ROOT, OUT), report);
  console.log(`wrote ${OUT} — ${totals.scripts} scripts, ${totals.beats} beats, ${s1(totals.seconds / 60)} min est`);
  console.log(
    `static-card audio ${pct(totals.seconds ? totals.staticSeconds / totals.seconds : 0)} | ` +
      `${totals.overlong} beats > ${OVERLONG_BEAT_SEC}s | ${totals.opensDefinition} definition openers | ${totals.crutch} crutch hits`
  );
  if (disagreements.length) console.error(`WARNING: ${disagreements.length} word-count disagreements — see ${OUT}`);
}

if (JSON_OUT) {
  await writeFile(
    path.join(ROOT, JSON_OUT),
    JSON.stringify(
      {
        generatedBy: "scripts/pacing-audit.mjs",
        spokenWordsPerSec: SPOKEN_WORDS_PER_SEC,
        totals: { ...totals, kinds: Object.fromEntries(totals.kinds), crutchBy: Object.fromEntries(totals.crutchBy) },
        scripts: rows.map((r) => ({ file: r.file, status: r.status, rating: r.rating, ...r.report, beatSeconds: undefined })),
      },
      null,
      2
    )
  );
  console.log(`wrote ${JSON_OUT}`);
}

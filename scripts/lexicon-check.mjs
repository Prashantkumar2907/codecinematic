// Lexicon audit for the pronunciation respellings in src/lib/lexicon.ts.
//
//   node scripts/lexicon-check.mjs              static checks only (no network)
//   node scripts/lexicon-check.mjs --voice      also synthesise every entry raw
//                                               vs respelled into qa/lexicon/
//
// The static half is what can be proven: every pattern matches the term it
// claims to, no two patterns fight over the same text, no respelling is
// re-mangled by the acronym expander that runs after it, and no respelling
// leaks a character the voice reads literally.
//
// The --voice half exists because the thing that actually matters — whether
// "Ka-joo-raa-ho" sounds more like Khajuraho than "Khajuraho" does — cannot be
// established by code. It writes pairs of mp3s so a person can listen.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { LEXICON_GROUPS, INDIAN_TERMS, TECH_TERMS } from "../src/lib/lexicon.ts";
import { normalizeSpeech } from "../src/lib/speech.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOICE_MODE = process.argv.includes("--voice");
const OUT_DIR = path.join(ROOT, "qa", "lexicon");

/** A representative source word for a pattern, recovered from its own source. */
function sampleFor(re) {
  return re.source
    .replace(/\\b/g, "")
    .replace(/\(\?[:=!][^)]*\)/g, "")
    .replace(/\([^)]*\)\?/g, "")
    .replace(/\([^|)]*\|[^)]*\)/g, (m) => m.slice(1, -1).split("|")[0])
    .replace(/\(([^)]*)\)/g, "$1")
    .replace(/[?]/g, "")
    .replace(/\\/g, "")
    .replace(/ \?/g, " ");
}

const problems = [];
const entries = [];
for (const [group, list] of Object.entries(LEXICON_GROUPS)) {
  for (const [re, out] of list) entries.push({ group, re, out, sample: sampleFor(re) });
}

// 1. Every pattern matches its own sample.
for (const e of entries) {
  const re = new RegExp(e.re.source, e.re.flags);
  if (!re.test(e.sample)) problems.push(`${e.group}: /${e.re.source}/ does not match its own sample "${e.sample}"`);
}

// 2. No two patterns claim the same sample text.
for (const e of entries) {
  const hits = entries.filter((o) => o !== e && new RegExp(o.re.source, o.re.flags).test(e.sample));
  for (const h of hits) {
    problems.push(`overlap: "${e.sample}" (${e.group}) is also matched by /${h.re.source}/ (${h.group})`);
  }
}

// 3. The respelling must survive the rest of normalizeSpeech — the acronym
//    expander runs AFTER the lexicon and spells any all-caps token letter by
//    letter, so a respelling containing one would come out mangled.
for (const e of entries) {
  const spoken = normalizeSpeech(e.sample);
  const expected = e.sample.replace(new RegExp(e.re.source, e.re.flags), e.out);
  if (spoken.replace(/\s+/g, " ").trim() !== expected.replace(/\s+/g, " ").trim()) {
    problems.push(`post-processing changed "${e.sample}": lexicon says "${expected}", normalizeSpeech says "${spoken}"`);
  }
}

// 4. Respellings must not carry characters a voice reads out loud.
for (const e of entries) {
  const bad = e.out.match(/[^\w\s$-]/g);
  if (bad) problems.push(`${e.group}: respelling "${e.out}" contains ${JSON.stringify(bad.join(""))}`);
}

// 5. The Indian list must be skipped for a native voice, and tech must not be.
const indianSample = "The Kesavananda case reached the Lok Sabha.";
const techSample = "We put nginx in front of Redis.";
if (normalizeSpeech(indianSample, "en", { nativeIndianVoice: true }) !== indianSample) {
  problems.push("native-voice gating failed: Indian terms were still respelled");
}
if (normalizeSpeech(techSample, "en", { nativeIndianVoice: true }) === techSample) {
  problems.push("native-voice gating over-applied: tech terms must respell for every English voice");
}

console.log(`lexicon: ${entries.length} entries across ${Object.keys(LEXICON_GROUPS).length} groups`);
for (const [g, l] of Object.entries(LEXICON_GROUPS)) console.log(`  ${g.padEnd(12)} ${l.length}`);
console.log(`  ${"→ Indian".padEnd(12)} ${INDIAN_TERMS.length} (skipped for en-IN/hi-IN voices)`);
console.log(`  ${"→ tech".padEnd(12)} ${TECH_TERMS.length} (always applied on the en path)`);
console.log();
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
} else {
  console.log("✓ all static checks pass");
}

if (!VOICE_MODE) {
  console.log("\nRespellings are NOT verified by ear. Re-run with --voice to render them.");
  process.exit(problems.length ? 1 : 0);
}

await mkdir(OUT_DIR, { recursive: true });
const python = path.join(ROOT, ".venv", "bin", "python");
const helper = path.join(ROOT, "scripts", "tts_synth.py");
const VOICE = "en-US-AndrewMultilingualNeural";

const segments = [];
for (const e of entries) {
  segments.push({ id: `${e.group}__${e.sample.replace(/\W+/g, "_")}__raw`, text: e.sample });
  segments.push({ id: `${e.group}__${e.sample.replace(/\W+/g, "_")}__say`, text: e.out.replace(/\$\d/g, "") });
}

const stdout = await new Promise((resolve, reject) => {
  const child = spawn(python, [helper]);
  let out = "";
  let err = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (err += c));
  child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.slice(-400) || out.slice(-400)))));
  child.stdin.end(JSON.stringify({ outDir: OUT_DIR, voice: VOICE, segments }));
});

const { segments: done } = JSON.parse(stdout);
const index = done.map((s) => `${s.id}  ${path.basename(s.file)}`).join("\n");
await writeFile(path.join(OUT_DIR, "INDEX.txt"), index);
console.log(`\nrendered ${done.length} clips to qa/lexicon/ — listen to each __raw / __say pair`);
process.exit(problems.length ? 1 : 0);

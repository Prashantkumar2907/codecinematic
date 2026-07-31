#!/usr/bin/env node
/**
 * Content factory: generate → rate → refine loop over curriculum submodules.
 * No rendering — scripts + ratings only, saved under content/factory/.
 *
 * Usage:
 *   node scripts/content-factory.mjs --subject coding [--module dsa] [--sub big-o]
 *     [--formats short,long] [--bar 9] [--max-rounds 3] [--limit N] [--force] [--dry]
 *
 * Title sources:
 *   coding            → ../coding yt/m*.json   (day 1: shorts[0] / long)
 *   lore subjects     → ../loreharbour-yt/*.json (day 1: short1 / long)
 *   anything else     → /api/studio/topics (first suggestion)
 *
 * Resumable: a submodule+format with a saved "pass" (or exhausted rounds) is
 * skipped unless --force. Every attempt appends to content/factory/checkpoint.jsonl.
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(ROOT, "..");
const OUT_ROOT = path.join(ROOT, "content", "factory");
const BASE = process.env.STUDIO_BASE ?? "http://localhost:4321";

const CODING_FILES = {
  "m1_cs_fundamentals.json": "cs-fundamentals",
  "m2_dsa.json": "dsa",
  "m3_backend.json": "backend",
  "m4_database.json": "database",
  "m5_frontend.json": "frontend",
  "m6_keytech.json": "key-tech",
  "m7_devops.json": "devops",
  "m8_systemdesign.json": "system-design",
  "m9_ai.json": "ai",
};
// loreharbour file → { devstudio subject id, devstudio module id }
const LORE_FILES = {
  "polity.json": { subject: "polity" },
  "economy.json": { subject: "economy" },
  "environment.json": { subject: "environment" },
  "artculture.json": { subject: "artculture" },
  "geography.json": { subject: "geography" },
  "history_indian.json": { subject: "history" },
  "history_world.json": { subject: "history" },
};

const GENERATE_TIMEOUT_MS = 420_000;
const RATE_TIMEOUT_MS = 300_000;

function parseArgs(argv) {
  // Per submodule we produce 3 slots: 2 shorts + 1 long, each looped to bar 9 on
  // the FAST (flash) models over free-first-then-billed keys. Pro escalation is
  // OFF by default — if a fast model can't reach a section ≥9, Pro won't reliably
  // either, so it's wasted cost; opt in with --escalate-model for a one-off.
  // Acceptance: every section >= bar (8) AND overall >= overallBar (9). Refine keeps
  // pushing sections toward the stretch target 9, but a slot is "done" once accepted.
  const args = {
    slots: ["short-1", "short-2", "long"],
    bar: 8, overallBar: 9, stretch: 9, maxRounds: 3, attempts: 6, escalateAfter: 3, escalateModel: null,
    limit: Infinity, force: false, dry: false,
    // Testing default: never spend a billed key. Every request the factory makes
    // (generate/rate/tune/topics, incl. blueprint/critique sub-calls) is restricted
    // to free-tier keys server-side. Pass --allow-billed for a run that may bill.
    freeOnly: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--subject") args.subject = argv[++i];
    else if (a === "--module") args.module = argv[++i];
    else if (a === "--sub") args.sub = argv[++i];
    else if (a === "--slots") args.slots = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--bar") args.bar = Number(argv[++i]);
    else if (a === "--overall-bar") args.overallBar = Number(argv[++i]);
    else if (a === "--stretch") args.stretch = Number(argv[++i]);
    else if (a === "--max-rounds") args.maxRounds = Number(argv[++i]);
    else if (a === "--attempts") args.attempts = Number(argv[++i]);
    else if (a === "--escalate-after") args.escalateAfter = Number(argv[++i]);
    else if (a === "--escalate-model") args.escalateModel = argv[++i];
    else if (a === "--no-escalate") args.escalateModel = null;
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--key") args.keyId = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--force") args.force = true;
    else if (a === "--allow-billed") args.freeOnly = false;
    else if (a === "--free-only") args.freeOnly = true;
    else if (a === "--dry") args.dry = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!args.subject) throw new Error("--subject is required");
  return args;
}

async function readJson(p) {
  return JSON.parse(await readFile(p, "utf8"));
}

async function subjectsTaxonomy() {
  const data = await readJson(path.join(ROOT, "content", "subjects.json"));
  return Array.isArray(data) ? data : data.subjects;
}

/** Build the work list: one {subject,module,submodule,titles:{shorts:[a,b],long}} per submodule. */
async function buildWorklist(subjectId) {
  const items = [];
  if (subjectId === "coding") {
    for (const [fname, moduleId] of Object.entries(CODING_FILES)) {
      const curriculum = await readJson(path.join(REPO, "coding yt", fname));
      for (const sm of curriculum) {
        const day1 = sm.days[0];
        items.push({
          subject: "coding",
          module: moduleId,
          submodule: sm.submodule_id,
          titles: { shorts: [day1.shorts[0], day1.shorts[1]], long: day1.long },
        });
      }
    }
    return items;
  }

  const loreEntries = Object.entries(LORE_FILES).filter(([, v]) => v.subject === subjectId);
  if (loreEntries.length > 0) {
    const subjects = await subjectsTaxonomy();
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) throw new Error(`subject ${subjectId} not in subjects.json`);
    const findModule = (submoduleId) => subject.modules.find((m) => m.submodules.some((x) => x.id === submoduleId));
    for (const [fname] of loreEntries) {
      const curriculum = await readJson(path.join(REPO, "loreharbour-yt", fname));
      for (const sm of curriculum) {
        const module = findModule(sm.submodule_id);
        if (!module) {
          console.warn(`  ! ${fname}:${sm.submodule_id} has no home in subjects.json yet — skipped`);
          continue;
        }
        const day1 = sm.days[0];
        items.push({
          subject: subjectId,
          module: module.id,
          submodule: sm.submodule_id,
          titles: { shorts: [day1.short1, day1.short2], long: day1.long },
        });
      }
    }
    return items;
  }

  // No curriculum file: every submodule in subjects.json, titles from the topics API.
  const subjects = await subjectsTaxonomy();
  const subject = subjects.find((s) => s.id === subjectId);
  if (!subject) throw new Error(`subject ${subjectId} not in subjects.json`);
  for (const module of subject.modules) {
    for (const sm of module.submodules) {
      items.push({ subject: subjectId, module: module.id, submodule: sm.id, titles: null });
    }
  }
  return items;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(route, body, timeoutMs) {
  // The dev server can briefly return an HTML error/loading page (recompile,
  // restart, transient 5xx). Those are not real failures — retry a few times so
  // one blip can't wipe a whole submodule/subject on a long unattended run.
  let last = { ok: false, status: 0, text: "" };
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/studio/${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      const looksHtml = text.trimStart().startsWith("<");
      const transient = !res.ok && (res.status >= 500 || res.status === 0 || looksHtml);
      if (!transient) return { ok: res.ok, status: res.status, text };
      last = { ok: res.ok, status: res.status, text };
    } catch (err) {
      last = { ok: false, status: 0, text: String(err?.message ?? err) };
    }
    if (attempt < 4) await sleep(3000 * attempt);
  }
  return last;
}

const SLOT_FORMAT = { "short-1": "short", "short-2": "short", long: "long" };

/** Resolve a submodule's requested slots to {slot, format, topic}. Curriculum
 *  items carry the two short titles + the long; topics-API subjects fetch once. */
async function resolveSlots(item, slotNames) {
  if (item.titles) {
    return slotNames.map((slot) => ({
      slot,
      format: SLOT_FORMAT[slot],
      topic: slot === "long" ? item.titles.long : item.titles.shorts[slot === "short-1" ? 0 : 1],
    }));
  }
  const { ok, text } = await post("topics", { subject: item.subject, module: item.module, submodule: item.submodule, freeOnly: opts.freeOnly }, RATE_TIMEOUT_MS);
  if (!ok) throw new Error(`topics failed: ${text.slice(0, 200)}`);
  const topics = JSON.parse(text).topics;
  if (!topics?.length) throw new Error("topics returned empty");
  const pick = (i) => (topics[i] ?? topics[topics.length - 1]).title;
  return slotNames.map((slot) => ({
    slot,
    format: SLOT_FORMAT[slot],
    topic: slot === "long" ? pick(0) : pick(slot === "short-1" ? 1 : 2),
  }));
}

async function generate(item, format, topic, model, directives) {
  const { ok, text } = await post(
    "generate",
    { subject: item.subject, module: item.module, submodule: item.submodule, format, topic, model: model ?? opts.model, keyId: opts.keyId, freeOnly: opts.freeOnly, directives },
    GENERATE_TIMEOUT_MS
  );
  const lines = text.trim().split("\n").filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]);
  if (!ok || last.error) throw new Error(`generate failed: ${JSON.stringify(last.error ?? last).slice(0, 300)}`);
  if (!last.done || !last.script) throw new Error(`generate stream ended without a script`);
  return { script: last.script, warnings: last.warnings ?? [] };
}

/** The generate route rejects more than this many directives with a 400. */
const MAX_DIRECTIVES = 24;

/**
 * Two directives are "the same" if they normalise to the same text, or share the
 * same first eight words. Exact-string comparison was why the store visibly
 * accumulated paraphrases of one instruction until the list blew past the route's
 * limit and every request 400'd.
 */
function directiveKey(d) {
  const norm = String(d).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return norm.split(" ").slice(0, 8).join(" ");
}
function dedupeDirectives(list) {
  const seen = new Set();
  const out = [];
  // Keep the NEWEST wording of a repeated instruction: it reflects the latest failure.
  for (const d of [...list].reverse()) {
    const k = directiveKey(d);
    if (seen.has(k)) continue;
    seen.add(k);
    out.unshift(d);
  }
  return out.slice(-MAX_DIRECTIVES);
}

/* Deterministic soft-gate warnings → reusable generation directives (no LLM needed). */
function warningsToDirectives(warnings) {
  return warnings.map((w) => {
    // Pacing gates from studio/pacing.ts, wired in the generate route. Without
    // these arms every one degrades to the generic `Fix: ${w}` below, which hands
    // the model back its own diagnostic instead of an instruction.
    if (/^too many title cards:/.test(w))
      return "A long video contains exactly TWO bigtext scenes: the opening hook and the closing recap. Sections are announced by the title of their first teaching scene plus a forward-hook line closing the previous section, and listed in the \"sections\" array for chapters — never by a title card.";
    if (/^definition opener:/.test(w))
      return "Never open by defining the topic. The first beat is a concrete moment — the thing going wrong, a number that stings, or the exact line of code that betrays the reader. The definition arrives later, once it is needed.";
    if (/^frozen card:/.test(w))
      return "No single-beat scene may run past ~12 seconds of speech: keep bigtext/stat/quote/question narration under 31 words, and give any multi-beat kind at least 3 beats so the visual advances.";
    if (/^beat length:/.test(w))
      return "Every beat is one visual step, so no beat may exceed ~12 seconds of speech (~31 words). Split a long explanation into two beats rather than holding one frame.";
    if (/^filler openers:/.test(w))
      return "Never open a beat with \"Let's\", \"Here is/Here's\", or a sentence-initial \"Now,/Next,/So,\" — start on the thing itself.";
    if (/^no running example:/.test(w))
      return "Choose ONE concrete example in the hook and carry it by name into every following scene; do not switch examples mid-video.";
    if (/^unexplained jargon:/.test(w))
      return "Every technical term gets a six-word everyday translation the first time it is spoken, in the same beat or the next one.";
    if (/narration is \d+ words/.test(w) && /short/.test(w))
      return "Write more depth: reach the word budget by adding MORE BEATS, not longer ones. No beat may exceed ~24 spoken words — a beat is one visual step. Add the missing mechanism step, the worked number, the trade-off, each as its own beat with its own visual.";
    if (/narration is \d+ words/.test(w) && /long/.test(w))
      return "Tighten: cut to the word budget — trim every beat to its sharpest form, keep each scene's meaning.";
    if (/back to back|section cards/.test(w))
      return "Never place two bigtext scenes consecutively; every section card is immediately followed by a real teaching scene.";
    if (/vocab example/.test(w))
      return "Every vocab example sentence must literally contain the exact word being taught, used naturally.";
    if (/after the ending question/.test(w))
      return "The ending question scene is the final scene — nothing comes after it (no recap/outro card).";
    if (/formulaic opener/.test(w))
      return "Open on a fresh hook — a concrete number, a mini-scene, or a myth-strike — never 'Have you ever/Did you know/Imagine/What if'.";
    return `Fix: ${w}`;
  });
}

/** Turn a below-bar rating into durable generation directives for this slot. */
async function tune(item, format, topic, rating, existingDirectives) {
  const sections = Object.entries(rating.sections).map(([name, s]) => ({ name, score: s.score, issues: s.issues ?? [] }));
  const { ok, text } = await post(
    "tune",
    { subject: item.subject, module: item.module, submodule: item.submodule, format, topic, sections, existingDirectives, freeOnly: opts.freeOnly },
    RATE_TIMEOUT_MS
  );
  if (!ok) throw new Error(`tune failed: ${text.slice(0, 200)}`);
  return JSON.parse(text).directives ?? [];
}

async function rate(item, format, topic, script) {
  const { ok, text } = await post("rate", { subject: item.subject, module: item.module, submodule: item.submodule, format, topic, script, freeOnly: opts.freeOnly }, RATE_TIMEOUT_MS);
  if (!ok) throw new Error(`rate failed: ${text.slice(0, 300)}`);
  return JSON.parse(text).rating;
}

function checkpoint(row) {
  appendFileSync(path.join(OUT_ROOT, "checkpoint.jsonl"), JSON.stringify({ ...row, ts: new Date().toISOString() }) + "\n");
}

async function exists(p) {
  return access(p).then(() => true, () => false);
}

/** Prefer fewer mechanical warnings, then a higher advisory rating. */
function betterOf(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.warnings.length !== b.warnings.length) return b.warnings.length < a.warnings.length ? b : a;
  return (b.rating?.overall ?? 0) > (a.rating?.overall ?? 0) ? b : a;
}

/** DONE requires BOTH: (a) deterministic — cleared every soft gate (no warnings),
 *  and (b) quality — the LLM rating meets the bar (overall >= overallBar AND every
 *  section >= bar). Warnings-clean alone can still be mediocre (seen: 0 warnings yet
 *  overall 5.5); the rating is noisy but "keep the best across attempts" exploits that
 *  favourably. After the attempt cap we save the best effort regardless. */
function accepted(cand) {
  if (cand.warnings.length > 0) return false;
  if (!cand.rating) return false;
  return cand.rating.worst >= opts.bar && cand.rating.overall >= opts.overallBar;
}

/* Per-slot learned directives, persisted so improvements carry across runs. */
const DIRECTIVES_FILE = path.join(OUT_ROOT, "directives.json");
let directivesStore = {};
function loadDirectivesStore() {
  try {
    directivesStore = JSON.parse(readFileSync(DIRECTIVES_FILE, "utf8"));
  } catch {
    directivesStore = {};
  }
}
function saveDirectives(key, list) {
  directivesStore[key] = list;
  writeFileSync(DIRECTIVES_FILE, JSON.stringify(directivesStore, null, 2));
}

/**
 * Generate → check deterministic soft-gate warnings (the GATE) + LLM rating (advisory).
 * If warnings remain, convert them (and the rating's weak sections) into durable prompt
 * directives and regenerate FRESH — a smarter attempt, never a blind re-roll. Keeps the
 * best candidate (fewest warnings, then highest advisory rating). Directives persist.
 */
async function runSlot(item, slot, format, topic, opts) {
  const dir = path.join(OUT_ROOT, item.subject, item.module, item.submodule);
  const outFile = path.join(dir, `${slot}.json`);
  const dirKey = `${item.subject}/${item.module}/${item.submodule}/${slot}`;
  // Dedupe+cap on the way IN as well: 16 of the 27 keys already on disk hold 14-15
  // entries, so a stored list would 400 the very first request for those slots.
  let directives = dedupeDirectives(directivesStore[dirKey] ?? []);
  let best = null;
  let attemptsDone = 0;
  if (!opts.force && (await exists(outFile))) {
    const prev = await readJson(outFile).catch(() => null);
    if (prev?.script) {
      attemptsDone = prev.attemptsUsed ?? 1;
      const prevCand = { script: prev.script, warnings: prev.warnings ?? [], rating: prev.rating ?? null };
      if (accepted(prevCand) || attemptsDone >= opts.attempts) {
        console.log(`  = ${item.submodule}/${slot}: already ${prev.status} (${prevCand.warnings.length} warn, overall ${prev.rating?.overall ?? "?"}) — skip`);
        return accepted(prevCand) ? "pass" : "below-bar";
      }
      best = prevCand;
    }
  }
  console.log(`  > ${item.submodule}/${slot}: "${topic}"${directives.length ? ` (${directives.length} learned directive(s))` : ""}`);

  let attempt = attemptsDone;
  while (attempt < opts.attempts && (!best || !accepted(best))) {
    attempt++;
    const model = opts.escalateModel && attempt > opts.escalateAfter ? opts.escalateModel : opts.model;
    const tag = model ? ` [${model.replace("gemini-", "")}]` : "";
    try {
      const { script, warnings } = await generate(item, format, topic, model, directives);
      let rating = null;
      try {
        rating = await rate(item, format, topic, script);
      } catch (e) {
        console.log(`      (rating unavailable — advisory only: ${e.message.slice(0, 80)})`);
      }
      const cand = { script, warnings, rating };
      console.log(`    a${attempt}${tag}: ${warnings.length} warning(s)${rating ? `, overall ${rating.overall} worst ${rating.worst}` : ""}${directives.length ? ` [${directives.length} dir]` : ""}`);
      best = betterOf(best, cand);
      if (accepted(cand)) break;
      // Warnings remain → build directives (mechanical warnings + rating weak-sections) and regenerate fresh.
      if (attempt < opts.attempts) {
        const known = new Set(directives.map(directiveKey));
        let fresh = warningsToDirectives(warnings).filter((d) => !known.has(directiveKey(d)));
        if (rating) {
          try {
            const freshKeys = new Set(fresh.map(directiveKey));
            const tuned = (await tune(item, format, topic, rating, [...directives, ...fresh])).filter(
              (d) => !known.has(directiveKey(d)) && !freshKeys.has(directiveKey(d))
            );
            fresh = [...fresh, ...tuned];
          } catch (e) {
            console.log(`      tune error — ${e.message.slice(0, 100)}`);
          }
        }
        if (fresh.length) {
          directives = dedupeDirectives([...directives, ...fresh]);
          saveDirectives(dirKey, directives);
          fresh.forEach((d) => console.log(`      + ${d.slice(0, 90)}`));
        }
      }
    } catch (err) {
      console.log(`    a${attempt}: attempt error — ${err.message.slice(0, 160)}${best ? " (keeping best)" : " (will retry)"}`);
      if (attempt >= opts.attempts && !best) throw err;
    }
  }

  const status = accepted(best) ? "pass" : "below-bar";
  await mkdir(dir, { recursive: true });
  await writeFile(
    outFile,
    JSON.stringify(
      { subject: item.subject, module: item.module, submodule: item.submodule, slot, format, topic, status, attemptsUsed: attempt, directives, warnings: best.warnings, rating: best.rating, script: best.script, generatedAt: new Date().toISOString() },
      null,
      2
    )
  );
  checkpoint({ subject: item.subject, module: item.module, submodule: item.submodule, slot, format, topic, status, warnings: best.warnings.length, overall: best.rating?.overall ?? null, attempts: attempt, directives: directives.length });
  const why = best.warnings.length ? `${best.warnings.length} warning(s)` : `below quality bar (overall ${best.rating?.overall ?? "?"} worst ${best.rating?.worst ?? "?"})`;
  console.log(`    ${status === "pass" ? `✓ PASS (overall ${best.rating?.overall ?? "?"})` : `✗ best effort — ${why}`} → ${path.relative(ROOT, outFile)}`);
  return status;
}

const opts = parseArgs(process.argv);
let items = await buildWorklist(opts.subject);
if (opts.module) items = items.filter((i) => i.module === opts.module);
if (opts.sub) items = items.filter((i) => i.submodule === opts.sub);
if (items.length === 0) throw new Error("work list is empty after filters");

const escalation = opts.escalateModel ? `escalate→${opts.escalateModel.replace("gemini-", "")} after ${opts.escalateAfter}` : "no escalation";
console.log(`Content factory: ${items.length} submodules × [${opts.slots}] | GATE: warnings clear AND overall ≥${opts.overallBar} AND every section ≥${opts.bar} | attempts ${opts.attempts} | ${escalation} | model ${opts.model ?? "chain-default"} | keys ${opts.freeOnly ? "FREE-ONLY (no billing)" : "free-first-then-billed"}${opts.dry ? " | DRY RUN" : ""}`);
if (opts.dry) {
  for (const i of items) console.log(` - ${i.subject}/${i.module}/${i.submodule}  shorts=${JSON.stringify(i.titles?.shorts ?? "(topics API)")}  long=${JSON.stringify(i.titles?.long ?? "(topics API)")}`);
  process.exit(0);
}

await mkdir(OUT_ROOT, { recursive: true });
loadDirectivesStore();
const tally = { pass: 0, "below-bar": 0, error: 0 };
let done = 0;
outer: for (const item of items) {
  let slots;
  try {
    slots = await resolveSlots(item, opts.slots);
  } catch (err) {
    tally.error++;
    console.log(`  ! ${item.submodule}: could not resolve topics — ${err.message.slice(0, 160)}`);
    continue;
  }
  for (const { slot, format, topic } of slots) {
    if (done >= opts.limit) break outer;
    done++;
    try {
      const status = await runSlot(item, slot, format, topic, opts);
      tally[status] = (tally[status] ?? 0) + 1;
    } catch (err) {
      tally.error++;
      console.log(`  ! ${item.submodule}/${slot}: ${err.message.slice(0, 200)}`);
      checkpoint({ subject: item.subject, module: item.module, submodule: item.submodule, slot, status: "error", error: err.message.slice(0, 300) });
    }
  }
}
console.log(`\nDone. pass=${tally.pass} below-bar=${tally["below-bar"]} error=${tally.error}`);

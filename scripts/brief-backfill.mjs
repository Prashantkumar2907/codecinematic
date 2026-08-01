// Research each sub-module ONCE and cache the answer (improvement_plan.md row 13.2).
//
// 373 sub-modules, one call each, cached forever in content/briefs.json and
// injected into the blueprint stage. This is a batch job, not a per-video cost.
//
//   node scripts/brief-backfill.mjs                 every missing sub-module
//   node scripts/brief-backfill.mjs --subject=math  one subject
//   node scripts/brief-backfill.mjs --limit=10      first 10 missing
//   node scripts/brief-backfill.mjs --force         redo ones already cached
//   node scripts/brief-backfill.mjs --concurrency=3
//
// RESUMABLE, because 373 calls will hit a quota wall or a transient 502 at some
// point and losing the completed ones would be the whole cost again: every
// success is written to content/briefs.json immediately, and a re-run skips
// whatever is already there. Safe to Ctrl-C.
//
// Requires the dev server (the route owns key selection and quota accounting).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.STUDIO_BASE ?? "http://localhost:4321";
const BRIEFS = path.join(ROOT, "content/briefs.json");

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const h = args.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  return h ? (h.includes("=") ? h.slice(h.indexOf("=") + 1) : true) : d;
};
const ONLY_SUBJECT = flag("subject", null);
const LIMIT = Number(flag("limit", 0)) || 0;
const FORCE = !!flag("force");
const CONCURRENCY = Math.max(1, Number(flag("concurrency", 2)) || 2);
const FREE_ONLY = !flag("allow-billed");

const key = (s, m, sub) => [s, m, sub].join("/").toLowerCase();

const taxonomy = JSON.parse(await readFile(path.join(ROOT, "content/subjects.json"), "utf8"));
const subjects = Array.isArray(taxonomy) ? taxonomy : taxonomy.subjects;

const briefs = existsSync(BRIEFS) ? JSON.parse(await readFile(BRIEFS, "utf8")) : {};

const work = [];
for (const s of subjects) {
  if (ONLY_SUBJECT && s.id !== ONLY_SUBJECT) continue;
  for (const m of s.modules) {
    for (const sub of m.submodules) {
      const k = key(s.id, m.id, sub.id);
      if (!FORCE && briefs[k]) continue;
      work.push({ k, subject: s.id, module: m.id, submodule: sub.id, label: `${s.label} → ${m.label} → ${sub.label}` });
    }
  }
}
const queue = LIMIT ? work.slice(0, LIMIT) : work;

const total = subjects.reduce((n, s) => n + s.modules.reduce((k, m) => k + m.submodules.length, 0), 0);
console.log(`${total} sub-modules total · ${Object.keys(briefs).length} already cached · ${queue.length} to fetch`);
if (!queue.length) {
  console.log("nothing to do");
  process.exit(0);
}

let done = 0;
let failed = 0;
const failures = [];
let writing = Promise.resolve();

/** Serialise writes so two finishing requests cannot interleave a JSON write. */
function persist() {
  writing = writing.then(() =>
    mkdir(path.dirname(BRIEFS), { recursive: true }).then(() => writeFile(BRIEFS, JSON.stringify(briefs, null, 2)))
  );
  return writing;
}

async function fetchOne(item) {
  const res = await fetch(`${BASE}/api/studio/brief`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: item.subject,
      module: item.module,
      submodule: item.submodule,
      ...(FREE_ONLY ? { freeOnly: true } : {}),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.brief;
}

async function worker() {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    try {
      briefs[item.k] = await fetchOne(item);
      await persist();
      done++;
      console.log(`[${done + failed}/${done + failed + queue.length}] ok   ${item.label}`);
    } catch (err) {
      failed++;
      failures.push({ key: item.k, error: String(err.message ?? err).slice(0, 200) });
      console.log(`[${done + failed}/${done + failed + queue.length}] FAIL ${item.label} — ${String(err.message ?? err).slice(0, 120)}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await writing;

console.log(`\ncached ${done}, failed ${failed}, total in file ${Object.keys(briefs).length}/${total}`);
if (failures.length) {
  console.log("failures (re-run to retry — successes are already saved):");
  for (const f of failures.slice(0, 15)) console.log(`  ${f.key}: ${f.error}`);
  if (failures.length > 15) console.log(`  …and ${failures.length - 15} more`);
}

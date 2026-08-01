// Prove sanitize.ts still trims every scene kind to the schema's own maxima.
//
// sanitize.ts used to hold 37 literal copies of schema.ts's numbers inside 16
// `case` arms. The copies happened to agree, but nothing made them -- and 94 of
// the 110 kinds (26.5% of scenes in the corpus) had no arm at all, so an
// over-long label on one of them hard-failed validation into a repair round
// instead of being trimmed. The limits are now DERIVED from the zod schemas
// (src/studio/limits.ts), which closes both by construction.
//
// This is the teeth for that claim, and it deliberately does NOT consult
// `SCENE_LIMITS`. A first version did, and it was worthless: it built its test
// input from the same table it was checking, so dropping a field from the table
// removed it from the input too and the check still passed. The oracle here is
// zod itself -- inflate every string past any conceivable cap, sanitize, then
// count the `too_big` issues `sceneSchema` still reports. A field missing from
// the derived table now shows up as a validation failure, which is the exact
// production symptom being guarded against.
//
//   node scripts/limits-check.mjs        exit 1 if any kind leaks
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const { sceneSchema, id: ID_SCHEMA } = await load("src/studio/schema.ts");
const { sanitizeScript } = await load("src/lib/sanitize.ts");

/**
 * Independently restated from `limits.ts`'s NEVER_CLAMP. These are the fields a
 * trim would corrupt rather than tidy, so they are fed VALID values here and
 * asserted untouched by the guards below. If limits.ts ever grows this list,
 * this check fails until the same exemption is justified here too -- which is
 * the point.
 */
const EXEMPT = new Set(["code", "expectedOutput", "icon", "icons"]);
const HUGE = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do ".repeat(90); // ~5.5k chars

const defOf = (s) => s?._def;

/** Build a maximally over-long but structurally valid value for any zod node. */
function build(schema, field, depth = 0) {
  const def = defOf(schema);
  const t = def?.typeName;
  if (depth > 7) return undefined;
  switch (t) {
    case "ZodOptional":
    case "ZodNullable":
    case "ZodDefault":
    case "ZodReadonly":
      return build(def.innerType, field, depth);
    case "ZodEffects":
      return build(def.schema, field, depth);
    case "ZodLiteral":
      return def.value;
    case "ZodEnum":
      return def.values[0];
    case "ZodBoolean":
      return true;
    case "ZodNumber": {
      const min = (def.checks ?? []).find((c) => c.kind === "min")?.value;
      return min ?? 1;
    }
    case "ZodString": {
      if (schema === ID_SCHEMA) return "s1"; // a link, not text -- must stay valid
      if (EXEMPT.has(field)) return "ok";
      const re = (def.checks ?? []).find((c) => c.kind === "regex");
      if (re) return "#Tag"; // hashtags etc. -- length is not what is under test
      return HUGE;
    }
    case "ZodArray": {
      const n = (def.maxLength?.value ?? def.exactLength?.value ?? 6) + 2;
      return Array.from({ length: n }, () => build(def.type, field, depth + 1));
    }
    case "ZodObject": {
      const o = {};
      for (const [k, v] of Object.entries(def.shape())) o[k] = build(v, k, depth + 1);
      return o;
    }
    case "ZodUnion":
      return build(def.options[0], field, depth + 1);
    case "ZodRecord":
      return {};
    default:
      return undefined;
  }
}

/** Only length failures on strings/arrays are this module's business. */
const tooBig = (result) =>
  result.success
    ? []
    : result.error.issues.filter((i) => i.code === "too_big" && (i.type === "string" || i.type === "array"));

const kinds = defOf(sceneSchema).options.map((o) => [defOf(o).shape().kind._def.value, o]);
let injected = 0;
let leaked = 0;
const leaks = [];

for (const [kind, option] of kinds) {
  const scene = build(option, "", 0);
  scene.kind = kind;
  scene.id = "s1";
  injected += tooBig(sceneSchema.safeParse(scene)).length;
  const clean = sanitizeScript({ scenes: [scene] }).scenes[0];
  const remaining = tooBig(sceneSchema.safeParse(clean));
  if (remaining.length) {
    leaked += remaining.length;
    leaks.push(`${kind}: ${[...new Set(remaining.map((i) => i.path.join(".")))].join(", ")}`);
  }
}

console.log(`scene kinds checked:            ${kinds.length}`);
console.log(`zod "too_big" issues before:    ${injected}`);
console.log(`zod "too_big" issues after:     ${leaked}`);

// The fields sanitize must NOT touch, asserted directly rather than by absence.
const one = (scene) => sanitizeScript({ scenes: [scene] }).scenes[0];
const LONG_ID = "a".repeat(70);
const CODE = "const x = 1;\n".repeat(40);
const EMOJI = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
const diagram = one({
  kind: "diagram",
  id: LONG_ID,
  title: "t",
  nodes: [{ id: LONG_ID, label: "x" }],
  arrows: [{ from: LONG_ID, to: LONG_ID, label: "y" }],
});
const code = one({ kind: "code", id: "s", lang: "js", code: CODE, segments: [{ fromLine: 1, toLine: 2, say: "a" }] });
const big = one({ kind: "bigtext", id: "s", narration: "n", text: "t", icon: EMOJI });
const spoken = one({ kind: "bullets", id: "s", title: "t", sayIntro: "This is a sentence. ".repeat(40), items: [{ text: "x" }] });

const guards = [
  ["scene id not truncated", diagram.id === LONG_ID],
  ["node id not truncated", diagram.nodes[0].id === LONG_ID],
  ["arrow from/to not truncated", diagram.arrows[0].from === LONG_ID && diagram.arrows[0].to === LONG_ID],
  ["code byte-exact", code.code === CODE],
  ["multi-codepoint icon intact", big.icon === EMOJI],
  ["spoken text carries no ellipsis", !spoken.sayIntro.includes("…")],
  ["spoken text trimmed at a boundary", spoken.sayIntro.length <= 320 && spoken.sayIntro.endsWith(".")],
];
for (const [name, ok] of guards) console.log(`  ${ok ? "✓" : "✗"} ${name}`);
const failed = guards.filter(([, ok]) => !ok).map(([name]) => name);

if (leaked || failed.length) {
  if (leaks.length) console.error(`\nkinds still failing validation on length:\n  ${leaks.join("\n  ")}`);
  if (failed.length) console.error(`\nguards failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\n✓ every kind clamps, and nothing that must not be trimmed was");

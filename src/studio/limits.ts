/**
 * The one limits table, DERIVED from the zod schemas rather than transcribed
 * beside them.
 *
 * `schema.ts` declares 928 string maxima and 237 array maxima across the 110
 * scene kinds. `sanitize.ts` used to re-state 37 of those numbers as literals so
 * it could trim over-long display strings before validation, which meant two
 * problems at once:
 *
 *  - **Coverage.** Only 16 of 110 kinds were listed, so an over-long label on any
 *    of the other 94 — **26.5% of all scenes in the 94-script corpus** — had no
 *    trim path and hard-failed validation into a repair round instead.
 *  - **Drift.** The copies happened to agree when this was written, but nothing
 *    made them agree; lowering a cap in `schema.ts` left `sanitize.ts` behind.
 *
 * Reading the maxima back off the schemas fixes both by construction: there is
 * exactly one place a number is written, and every kind is covered the moment it
 * joins the union. The alternative — hand-authoring a `LIMITS` table and building
 * the validators from it — was rejected because it adds a transcription step per
 * number without removing a source of truth.
 *
 * Zod 3 keeps this introspectable on `_def`; the casts below are the price of
 * reading it. Everything is computed once at module load.
 */
import { z } from "zod";
// Explicit `.ts`, like `pacing.ts` and `speech.ts`: `scripts/limits-check.mjs`
// imports this module directly and relies on Node stripping the types.
import { id as ID_SCHEMA, metaSchema, sceneSchema } from "./schema.ts";

export type FieldLimit =
  | { t: "string"; max: number; spoken: boolean }
  | { t: "array"; maxItems: number | null; el: FieldLimit | null }
  | { t: "object"; fields: Record<string, FieldLimit> };

/**
 * Fields a trim would corrupt rather than tidy:
 * `code`/`expectedOutput` are compared byte-for-byte by the exec route, and an
 * icon is a possibly multi-codepoint emoji that `slice()` would cut mid-sequence
 * into mojibake.
 */
const NEVER_CLAMP = new Set(["code", "expectedOutput", "icon", "icons"]);

/** Spoken text is voiced by TTS, so it is trimmed at a sentence/word boundary
 *  instead of taking an ellipsis. Matches `narration`, `say` and every `sayX`. */
function isSpoken(field: string): boolean {
  return field === "narration" || field === "say" || /^say[A-Z]/.test(field);
}

type Def = { typeName?: string; [k: string]: unknown };
const defOf = (s: unknown) => (s as { _def?: Def })?._def;

/** Peel optional/nullable/default/effects wrappers off to the schema underneath. */
function unwrap(schema: unknown): unknown {
  let cur = schema;
  for (let i = 0; i < 12; i++) {
    const def = defOf(cur);
    const t = def?.typeName;
    if (t === "ZodOptional" || t === "ZodNullable" || t === "ZodDefault" || t === "ZodReadonly") {
      cur = def!.innerType;
    } else if (t === "ZodEffects") {
      cur = def!.schema;
    } else {
      return cur;
    }
  }
  return cur;
}

function maxCheck(def: Def): number | null {
  const checks = (def.checks ?? []) as { kind: string; value: number }[];
  return checks.find((c) => c.kind === "max")?.value ?? null;
}

/**
 * `field` is the name the value arrives under, which is the only signal for
 * spoken-vs-display; it is threaded down so `items[].say` is still recognised.
 * Returns null for anything with no limit worth enforcing, so the walker in
 * `sanitize.ts` never sees a node it cannot act on.
 */
function describe(schema: unknown, field: string, depth = 0): FieldLimit | null {
  if (depth > 8) return null;
  const s = unwrap(schema);
  const def = defOf(s);
  const t = def?.typeName;

  if (t === "ZodString") {
    // Identity, not the name or the number: 293 reference fields share this exact
    // instance, and truncating one breaks the scene it points at.
    if (s === ID_SCHEMA) return null;
    if (NEVER_CLAMP.has(field)) return null;
    const max = maxCheck(def!);
    if (max == null) return null;
    return { t: "string", max, spoken: isSpoken(field) };
  }

  if (t === "ZodArray") {
    const el = describe(def!.type, field, depth + 1);
    const len = def!.maxLength as { value: number } | null | undefined;
    const exact = def!.exactLength as { value: number } | null | undefined;
    const maxItems = len?.value ?? exact?.value ?? null;
    if (el == null && maxItems == null) return null;
    return { t: "array", maxItems, el };
  }

  if (t === "ZodObject") {
    const shape = (def!.shape as () => Record<string, unknown>)();
    const fields: Record<string, FieldLimit> = {};
    for (const [k, v] of Object.entries(shape)) {
      const d = describe(v, k, depth + 1);
      if (d) fields[k] = d;
    }
    return Object.keys(fields).length ? { t: "object", fields } : null;
  }

  return null;
}

function fieldsOf(objectSchema: unknown): Record<string, FieldLimit> {
  const described = describe(objectSchema, "", 0);
  return described && described.t === "object" ? described.fields : {};
}

/** Per-kind clampable fields, keyed by the `kind` literal. Covers all 110. */
export const SCENE_LIMITS: Record<string, Record<string, FieldLimit>> = (() => {
  const out: Record<string, Record<string, FieldLimit>> = {};
  const options = defOf(sceneSchema)!.options as z.ZodObject<z.ZodRawShape>[];
  for (const option of options) {
    const shape = defOf(option)!.shape as () => Record<string, unknown>;
    const kindDef = defOf(shape().kind) as { value?: string } | undefined;
    const kind = kindDef?.value;
    if (!kind) continue;
    const fields = fieldsOf(option);
    delete fields.kind;
    out[kind] = fields;
  }
  return out;
})();

/** Script-level `meta` (title/description/tags), same derivation. */
export const META_LIMITS: Record<string, FieldLimit> = fieldsOf(metaSchema);

/**
 * Deterministic pre-validation cleanup of a raw Gemini script: display-only
 * strings are clamped to schema limits so the model-repair round only has to
 * fix meaning-critical failures (code shape, narration length, structure).
 * Code and narration are never touched here.
 */
// Explicit `.ts` and relative, like `speech.ts`: `scripts/limits-check.mjs`
// imports this module directly and cannot resolve the `@/` alias.
import { META_LIMITS, SCENE_LIMITS, type FieldLimit } from "../studio/limits.ts";

const ELLIPSIS = "…";

/**
 * Below this cap a field is a symbol, code or number-as-string (`molecule.el` ≤2,
 * `turing_tape.blank` ≤2, `steps.write` ≤4, `trace…pointers.label` ≤6), not prose.
 * An ellipsis there spends one of very few characters to signal "there is more",
 * which is not information anyone can use — "Carbon" wants to become "Ca", not
 * "C…". Those fields are still trimmed, just plainly. 8 is the smallest cap the
 * previous hand-written clamps used (`chart.items.unit`), so every field they
 * covered keeps its exact old behaviour.
 */
const ELLIPSIS_MIN = 8;

/** Strip leaked markdown emphasis (*word*, **word**, _word_) the model sometimes
 *  emits despite the "no markdown" rule — it renders literally on canvas and is
 *  read aloud as "asterisk" by TTS. Real prose asterisks/underscores are rare. */
function stripEmphasis(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,!?])/g, "$1$2");
}

function clamp(value: unknown, max: number): unknown {
  if (typeof value !== "string") return value;
  const cleaned = stripEmphasis(value);
  if (cleaned.length <= max) return cleaned;
  if (max < ELLIPSIS_MIN) return cleaned.slice(0, max).trimEnd();
  return cleaned.slice(0, max - 1).trimEnd() + ELLIPSIS;
}

/**
 * Spoken text (narration/beats) is voiced by TTS, so it can't take a "…" and must
 * end cleanly. Over-limit spoken strings used to be left for a model-repair round,
 * which unreliably trimmed them and could fail a whole video; clamping to the last
 * sentence (or word) boundary before `max` turns that hard-fail into a clean trim.
 */
function clampSpeech(value: unknown, max: number): unknown {
  if (typeof value !== "string") return value;
  const cleaned = stripEmphasis(value);
  if (cleaned.length <= max) return cleaned;
  const window = cleaned.slice(0, max);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentenceEnd >= max * 0.5) return window.slice(0, sentenceEnd + 1).trimEnd();
  const wordEnd = window.lastIndexOf(" ");
  return (wordEnd > 0 ? window.slice(0, wordEnd) : window).trimEnd();
}

/**
 * Trim one value against its derived limit. Every per-kind number this used to
 * hardcode now arrives in `limit`, so the 16 hand-written `case` arms are gone
 * and all 110 kinds are covered — including the four spoken fields (`sayLeft`,
 * `sayRight`, `sayReact`, `sayResult`) the old explicit key list never listed.
 */
function applyLimit(value: unknown, limit: FieldLimit): unknown {
  if (value == null) return value;
  if (limit.t === "string") {
    return limit.spoken ? clampSpeech(value, limit.max) : clamp(value, limit.max);
  }
  if (limit.t === "array") {
    if (!Array.isArray(value)) return value;
    const sliced = limit.maxItems == null ? value : value.slice(0, limit.maxItems);
    return limit.el ? sliced.map((v) => applyLimit(v, limit.el!)) : sliced;
  }
  if (typeof value !== "object" || Array.isArray(value)) return value;
  const out = { ...(value as Record<string, unknown>) };
  for (const [key, field] of Object.entries(limit.fields)) {
    if (key in out) out[key] = applyLimit(out[key], field);
  }
  return out;
}

function applyFields(target: Record<string, unknown>, fields: Record<string, FieldLimit>) {
  for (const [key, limit] of Object.entries(fields)) {
    if (key in target) target[key] = applyLimit(target[key], limit);
  }
}

/**
 * Models reliably fail at tiling line ranges exactly, so segments are snapped
 * deterministically: each starts where the previous ended, the last one covers
 * the final line. The narration text ("say") is never altered.
 */
function normalizeSegments(scene: Record<string, unknown>) {
  if (typeof scene.code !== "string" || !Array.isArray(scene.segments) || scene.segments.length === 0) return;
  const lineCount = scene.code.split("\n").length;
  const segments = (scene.segments as Record<string, unknown>[])
    .filter((s) => s && typeof s === "object")
    .sort((a, b) => (Number(a.fromLine) || 0) - (Number(b.fromLine) || 0));

  let cursor = 1;
  const tiled: Record<string, unknown>[] = [];
  for (const [i, seg] of segments.entries()) {
    if (cursor > lineCount) break;
    const isLast = i === segments.length - 1;
    const requestedTo = Number(seg.toLine) || cursor;
    const toLine = isLast ? lineCount : Math.min(Math.max(requestedTo, cursor), lineCount);
    tiled.push({ ...seg, fromLine: cursor, toLine });
    cursor = toLine + 1;
  }
  const last = tiled[tiled.length - 1];
  if (last && Number(last.toLine) < lineCount) last.toLine = lineCount;
  if (tiled.length > 0) scene.segments = tiled;
}

export function sanitizeScript(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const script = raw as Record<string, unknown>;
  if (Array.isArray(script.scenes)) {
    script.scenes = script.scenes.map((s) => sanitizeScene(s));
  }
  const meta = script.meta as Record<string, unknown> | undefined;
  if (meta && typeof meta === "object") applyFields(meta, META_LIMITS);
  return script;
}

/**
 * Fixups that are semantic, not dimensional — no table of maxima can express
 * them, so they stay hand-written while every length/count limit is derived.
 * Run BEFORE the generic clamp: chart lifts a unit out of `value` into `unit`,
 * which then needs clamping like any other string.
 */
function preFixups(scene: Record<string, unknown>) {
  if (scene.kind === "code") normalizeSegments(scene);
  if (scene.kind === "chart" && Array.isArray(scene.items)) {
    scene.items = scene.items.map((it) => {
      if (typeof it !== "object" || it === null) return it;
      const item = it as Record<string, unknown>;
      // Models often write value as a string with the unit baked in
      // ("100x", "200 ms", "1,000"). Coerce to a plain number and lift a
      // trailing unit into `unit` so the bar chart renders instead of failing.
      if (typeof item.value !== "string") return item;
      const raw = item.value.replace(/,/g, "");
      const match = raw.match(/-?\d+\.?\d*/);
      if (!match) return item;
      const num = parseFloat(match[0]);
      if (Number.isNaN(num)) return item;
      const suffix = raw.replace(match[0], "").trim();
      return { ...item, value: num, unit: item.unit || suffix || undefined };
    });
  }
}

/**
 * Run AFTER the clamp, because it counts columns that the clamp may have sliced:
 * each row is padded or truncated to the column count so the grid is rectangular.
 */
function postFixups(scene: Record<string, unknown>) {
  if (scene.kind !== "table") return;
  const cols = Array.isArray(scene.columns) ? scene.columns : [];
  if (!Array.isArray(scene.rows)) return;
  scene.rows = scene.rows.map((r) => {
    if (typeof r !== "object" || r === null) return r;
    const row = r as Record<string, unknown>;
    const cells = Array.isArray(row.cells) ? [...row.cells] : [];
    while (cells.length < cols.length) cells.push("");
    return { ...row, cells: cells.slice(0, cols.length) };
  });
}

function sanitizeScene(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const scene = { ...(raw as Record<string, unknown>) };
  preFixups(scene);
  // One derived pass replaces 16 hand-written `case` arms and their 37 literal
  // copies of schema.ts's numbers. Unknown kinds fall through untouched rather
  // than throwing, exactly as the old `switch` did.
  const fields = typeof scene.kind === "string" ? SCENE_LIMITS[scene.kind] : undefined;
  if (fields) applyFields(scene, fields);
  postFixups(scene);
  return scene;
}

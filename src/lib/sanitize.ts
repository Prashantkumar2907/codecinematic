/**
 * Deterministic pre-validation cleanup of a raw Gemini script: display-only
 * strings are clamped to schema limits so the model-repair round only has to
 * fix meaning-critical failures (code shape, narration length, structure).
 * Code and narration are never touched here.
 */

const ELLIPSIS = "…";

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

function clampArray(value: unknown, maxItems: number, maxLen: number): unknown {
  if (!Array.isArray(value)) return value;
  return value.slice(0, maxItems).map((v) => clamp(v, maxLen));
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
  if (meta && typeof meta === "object") {
    meta.title = clamp(meta.title, 95);
    meta.description = clamp(meta.description, 3500);
    meta.tags = clampArray(meta.tags, 15, 30);
  }
  return script;
}

const MAX_NARRATION = 400;
const MAX_BEAT = 320;

/** Clamp a spoken "say" on an item/panel object in place (used for arrays). */
function clampItemSay(item: unknown): unknown {
  if (typeof item !== "object" || item === null) return item;
  const rec = item as Record<string, unknown>;
  if (typeof rec.say === "string") return { ...rec, say: clampSpeech(rec.say, MAX_BEAT) };
  return item;
}

function sanitizeScene(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const scene = { ...(raw as Record<string, unknown>) };

  // Spoken fields are voiced by TTS and drive beat timing; over-limit ones used
  // to force a model-repair round that could fail the whole video. Clamp them
  // deterministically at a sentence/word boundary across every kind.
  for (const key of ["narration"]) {
    if (typeof scene[key] === "string") scene[key] = clampSpeech(scene[key], MAX_NARRATION);
  }
  for (const key of ["sayIntro", "sayMyth", "sayFact", "sayQuestion", "sayReveal", "sayVerdict"]) {
    if (typeof scene[key] === "string") scene[key] = clampSpeech(scene[key], MAX_BEAT);
  }
  for (const key of ["items", "steps", "events", "examples", "segments"]) {
    if (Array.isArray(scene[key])) scene[key] = (scene[key] as unknown[]).map(clampItemSay);
  }
  for (const side of ["left", "right"]) {
    const panel = scene[side];
    if (panel && typeof panel === "object" && typeof (panel as Record<string, unknown>).say === "string") {
      scene[side] = clampItemSay(panel);
    }
  }

  switch (scene.kind) {
    case "bigtext":
      scene.text = clamp(scene.text, 80);
      scene.sub = clamp(scene.sub, 110);
      break;
    case "bullets":
      scene.title = clamp(scene.title, 60);
      if (Array.isArray(scene.items)) {
        scene.items = scene.items.slice(0, 5).map((item) =>
          typeof item === "object" && item !== null
            ? { ...item, text: clamp((item as Record<string, unknown>).text, 110) }
            : item
        );
      }
      break;
    case "code":
      scene.title = clamp(scene.title, 40);
      normalizeSegments(scene);
      break;
    case "terminal":
      scene.lines = clampArray(scene.lines, 10, 60);
      break;
    case "diagram": {
      scene.title = clamp(scene.title, 60);
      if (Array.isArray(scene.nodes)) {
        scene.nodes = scene.nodes.map((n) =>
          typeof n === "object" && n !== null ? { ...n, label: clamp((n as Record<string, unknown>).label, 28) } : n
        );
      }
      if (Array.isArray(scene.arrows)) {
        scene.arrows = scene.arrows.map((a) =>
          typeof a === "object" && a !== null ? { ...a, label: clamp((a as Record<string, unknown>).label, 24) } : a
        );
      }
      break;
    }
    case "compare": {
      scene.title = clamp(scene.title, 60);
      scene.verdict = clamp(scene.verdict, 110);
      for (const side of ["left", "right"]) {
        const panel = scene[side] as Record<string, unknown> | undefined;
        if (panel && typeof panel === "object") {
          panel.title = clamp(panel.title, 30);
          panel.items = clampArray(panel.items, 4, 70);
        }
      }
      break;
    }
    case "question":
      scene.text = clamp(scene.text, 180);
      scene.hint = clamp(scene.hint, 110);
      break;
    case "timeline":
      scene.title = clamp(scene.title, 60);
      if (Array.isArray(scene.events)) {
        scene.events = scene.events.slice(0, 6).map((e) =>
          typeof e === "object" && e !== null
            ? { ...e, when: clamp((e as Record<string, unknown>).when, 18), label: clamp((e as Record<string, unknown>).label, 52) }
            : e
        );
      }
      break;
    case "stat":
      scene.value = clamp(scene.value, 14);
      scene.label = clamp(scene.label, 60);
      scene.context = clamp(scene.context, 100);
      break;
    case "steps":
      scene.title = clamp(scene.title, 60);
      if (Array.isArray(scene.steps)) {
        scene.steps = scene.steps.slice(0, 5).map((s) =>
          typeof s === "object" && s !== null
            ? { ...s, text: clamp((s as Record<string, unknown>).text, 80), detail: clamp((s as Record<string, unknown>).detail, 90) }
            : s
        );
      }
      break;
    case "quiz":
      scene.question = clamp(scene.question, 120);
      if (Array.isArray(scene.options)) {
        scene.options = scene.options.slice(0, 4).map((o) =>
          typeof o === "object" && o !== null ? { ...o, text: clamp((o as Record<string, unknown>).text, 52) } : o
        );
      }
      break;
    case "vocab":
      scene.word = clamp(scene.word, 28);
      scene.pron = clamp(scene.pron, 32);
      scene.pos = clamp(scene.pos, 16);
      scene.meaning = clamp(scene.meaning, 90);
      scene.synonym = clamp(scene.synonym, 48);
      if (Array.isArray(scene.examples)) {
        scene.examples = scene.examples.slice(0, 3).map((e) =>
          typeof e === "object" && e !== null ? { ...e, text: clamp((e as Record<string, unknown>).text, 90) } : e
        );
      }
      break;
    case "chart":
      scene.title = clamp(scene.title, 60);
      if (Array.isArray(scene.items)) {
        scene.items = scene.items.slice(0, 6).map((it) => {
          if (typeof it !== "object" || it === null) return it;
          const item = it as Record<string, unknown>;
          // Models often write value as a string with the unit baked in
          // ("100x", "200 ms", "1,000"). Coerce to a plain number and lift a
          // trailing unit into `unit` so the bar chart renders instead of failing.
          let value = item.value;
          let unit = item.unit;
          if (typeof value === "string") {
            const match = value.replace(/,/g, "").match(/-?\d+\.?\d*/);
            if (match) {
              const num = parseFloat(match[0]);
              const suffix = value.replace(/,/g, "").replace(match[0], "").trim();
              if (!Number.isNaN(num)) {
                value = num;
                if (!unit && suffix) unit = suffix;
              }
            }
          }
          return { ...item, value, unit: clamp(unit, 8), label: clamp(item.label, 24) };
        });
      }
      break;
    case "quote":
      scene.text = clamp(scene.text, 200);
      scene.author = clamp(scene.author, 40);
      break;
    case "mythfact":
      scene.myth = clamp(scene.myth, 140);
      scene.fact = clamp(scene.fact, 160);
      break;
  }
  return scene;
}

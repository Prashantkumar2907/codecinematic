import { z } from "zod";
// Runtime import: the script-level gates below call `sceneBeats`. `scene-beats.ts`
// imports back only `import type { Scene }`, which is erased, so there is no cycle.
import { sceneBeats } from "./scene-beats.ts";

export const CODE_LANGS = ["js", "ts", "python", "sql", "bash", "yaml", "text"] as const;
export type CodeLang = (typeof CODE_LANGS)[number];

/** Languages the exec route can actually run and verify. */
export const EXECUTABLE_LANGS: CodeLang[] = ["js", "python", "sql"];

const MAX_BEAT_CHARS = 320;
/**
 * A single-beat scene cannot advance while its narration plays, so its narration
 * length IS how long the frame is frozen. 150 chars ≈ 25 words ≈ 12 s at the
 * MEASURED 2.06 words/sec and 5.98 chars/word — i.e. exactly
 * `pacing.OVERLONG_BEAT_SEC`, where a card stops being read and starts being
 * stared at.
 *
 * This was briefly 190, argued from the uncalibrated 2.6 words/sec. Once the rate
 * was measured against real TTS (Phase 15), 190 chars turned out to be 15.4 s —
 * well over the target — and 150 to be 12.2 s. The plan's original 150 was right;
 * the reasoning for it here is now measured rather than asserted.
 *
 * Was 400, and 400 was the ONLY number the prompt ever attached to `narration`
 * (transcribed three times as a hard limit), so the model anchored on it: the
 * corpus maximum is 397. Measured effect of dropping to 190, simulated over all
 * 88 scripts: 139 of the 354 overlong beats disappear, long-format median falls
 * 1028 → 962 words, and 4 more long scripts land under the 850-word floor —
 * which is why Phase 5's scene-count raise is a hard dependency, not a nicety.
 */
const MAX_SINGLE_BEAT_CHARS = 150;
/**
 * `terminal` earns more: its typewriter is the one painter that paces itself to
 * the beat's real duration (`painters/terminal.ts:144` budgets 62% of
 * `env.durationMs`), so the card is genuinely animating rather than held.
 */
const MAX_TERMINAL_NARRATION_CHARS = 210;
/** Kept only for the three HARD LIMITS blocks in prompt.ts that still quote it. */
const MAX_NARRATION_CHARS = 400;
const MAX_CODE_LINES = 22;
/** Prompt asks for 46; renderer shrinks the font up to this hard ceiling. */
const MAX_CODE_COLS = 60;
const GRID = 12;

const say = z.string().min(6).max(MAX_BEAT_CHARS);
/** Only the five inherently single-beat kinds use this field, so capping it here
 *  caps exactly the scenes that freeze: bigtext, terminal, question, stat, quote. */
const narration = z.string().min(6).max(MAX_SINGLE_BEAT_CHARS);
const terminalNarration = z.string().min(6).max(MAX_TERMINAL_NARRATION_CHARS);
/**
 * Every scene id AND every cross-reference to one (`arrows.from`, `steps.reveal`,
 * `sections.atSceneId`, …) is this exact schema *instance*, which is what lets
 * `limits.ts` recognise a reference by identity rather than by guessing from the
 * field name. 293 fields share it against 11 unrelated display fields that also
 * happen to cap at 40, so name- or value-based detection would silently truncate
 * an id and break the reference it points at. Keep it a single shared const.
 */
export const id = z.string().min(1).max(40);

/**
 * Per-kind ceilings on spoken text, exported so `sanitize.ts` trims to the same
 * numbers the validator enforces and `pacing.ts` can assert they still match its
 * OVERLONG_BEAT_SEC. Before this, sanitize re-declared its own literal copies and
 * the two could drift apart silently.
 */
export const SPOKEN_LIMITS = {
  beat: MAX_BEAT_CHARS,
  narration: MAX_SINGLE_BEAT_CHARS,
  terminalNarration: MAX_TERMINAL_NARRATION_CHARS,
  /** The old blanket cap, still quoted by prompt.ts's HARD LIMITS blocks. */
  legacyNarration: MAX_NARRATION_CHARS,
} as const;

/** One emoji (possibly multi-codepoint) used as a visual icon. */
const icon = z.string().min(1).max(16).optional();

const bigtextScene = z.object({
  kind: z.literal("bigtext"),
  id,
  narration,
  text: z.string().min(2).max(80),
  sub: z.string().max(110).optional(),
  icon,
});

const bulletsScene = z.object({
  kind: z.literal("bullets"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  items: z
    .array(z.object({ text: z.string().min(2).max(110), say }))
    .min(2)
    .max(5),
});

const codeScene = z.object({
  kind: z.literal("code"),
  id,
  sayIntro: say.optional(),
  lang: z.enum(CODE_LANGS),
  title: z.string().min(1).max(40),
  code: z
    .string()
    .min(10)
    .refine((c) => c.split("\n").length <= MAX_CODE_LINES, {
      message: `code must be <= ${MAX_CODE_LINES} lines`,
    })
    .refine((c) => c.split("\n").every((l) => l.length <= MAX_CODE_COLS), {
      message: `every code line must be <= ${MAX_CODE_COLS} characters`,
    }),
  segments: z
    .array(z.object({ fromLine: z.number().int().min(1), toLine: z.number().int().min(1), say }))
    .min(1)
    .max(8),
  focusLines: z.array(z.number().int().min(1)).max(8).default([]),
  expectedOutput: z.string().max(400).optional(),
});

const terminalScene = z.object({
  kind: z.literal("terminal"),
  id,
  narration: terminalNarration,
  lines: z.array(z.string().max(60)).min(1).max(10),
});

const diagramNode = z.object({
  id,
  label: z.string().min(1).max(28),
  x: z.number().int().min(0).max(GRID - 1),
  y: z.number().int().min(0).max(GRID - 1),
  w: z.number().int().min(2).max(GRID).default(3),
  h: z.number().int().min(1).max(4).default(1),
  accent: z.boolean().default(false),
  icon,
});

const diagramScene = z.object({
  kind: z.literal("diagram"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  nodes: z.array(diagramNode).min(2).max(8),
  arrows: z
    .array(
      z.object({
        from: id,
        to: id,
        label: z.string().max(24).optional(),
        /** Bow the arrow with a quadratic curve instead of orthogonal routing (default straight). */
        curve: z.boolean().optional(),
        /** Stroke style; omitted = "solid", the original look. */
        style: z.enum(["solid", "dashed", "double"]).optional(),
      })
    )
    .max(10)
    .default([]),
  steps: z
    .array(
      z.object({
        reveal: z.array(id).default([]),
        highlight: z.array(id).default([]),
        move: z
          .array(z.object({ node: id, x: z.number().int().min(0).max(GRID - 1), y: z.number().int().min(0).max(GRID - 1) }))
          .max(4)
          .default([]),
        say,
      })
    )
    .min(1)
    .max(8),
});

const treeNode = z.object({
  id,
  label: z.string().min(1).max(24),
  /** Parent node id; null (or omitted) marks the single root. */
  parent: id.nullable().optional(),
  icon,
});

const treeScene = z.object({
  kind: z.literal("tree"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  nodes: z.array(treeNode).min(2).max(14),
  /** Reveal groups (usually one per depth level); beat k reveals its ids. */
  steps: z.array(z.object({ reveal: z.array(id).min(1), say })).min(1).max(6),
});

const orbitScene = z.object({
  kind: z.literal("orbit"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** The central body (Sun, nucleus, planet). */
  center: z.string().min(1).max(20),
  /** Bodies orbiting it on concentric rings, revealed one per beat (inner→outer). */
  bodies: z.array(z.object({ label: z.string().min(1).max(18), say })).min(1).max(6),
});

const mindmapScene = z.object({
  kind: z.literal("mindmap"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Same shape as tree; laid out RADIALLY (centre + branches curving outward). */
  nodes: z.array(treeNode).min(2).max(14),
  steps: z.array(z.object({ reveal: z.array(id).min(1), say })).min(1).max(6),
});

const iso3dScene = z.object({
  kind: z.literal("iso3d"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Ordered stages laid left→right in a real-3-D isometric scene; a packet
   *  flows into each stage as its beat plays. `shape` picks the 3-D model. */
  stages: z
    .array(
      z.object({
        label: z.string().min(1).max(20),
        shape: z.enum(["client", "server", "database", "cache", "queue", "cloud", "disk", "cpu", "loadbalancer"]).optional(),
        say,
      })
    )
    .min(2)
    .max(5),
  /** Flow returns to the first stage after the last (e.g. request/response). */
  loop: z.boolean().optional(),
});

const compareScene = z.object({
  kind: z.literal("compare"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  left: z.object({ title: z.string().min(1).max(30), items: z.array(z.string().max(70)).min(1).max(4), say, icon }),
  right: z.object({ title: z.string().min(1).max(30), items: z.array(z.string().max(70)).min(1).max(4), say, icon }),
  verdict: z.string().max(110).optional(),
  sayVerdict: say.optional(),
});

const questionScene = z.object({
  kind: z.literal("question"),
  id,
  narration,
  text: z.string().min(10).max(180),
  hint: z.string().max(110).optional(),
});

const timelineScene = z.object({
  kind: z.literal("timeline"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Layout. Omitted = "vertical", reproducing the original dated spine. */
  orient: z.enum(["vertical", "horizontal"]).optional(),
  events: z
    .array(z.object({ when: z.string().min(1).max(18), label: z.string().min(2).max(52), say, icon, era: z.string().max(20).optional() }))
    .min(2)
    .max(6),
});

const statScene = z.object({
  kind: z.literal("stat"),
  id,
  narration,
  value: z.string().min(1).max(14),
  label: z.string().min(2).max(60),
  context: z.string().max(100).optional(),
});

const stepsScene = z.object({
  kind: z.literal("steps"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  steps: z
    .array(z.object({ text: z.string().min(2).max(80), detail: z.string().max(90).optional(), say }))
    .min(2)
    .max(5),
});

const quizScene = z.object({
  kind: z.literal("quiz"),
  id,
  question: z.string().min(6).max(120),
  options: z.array(z.object({ text: z.string().min(1).max(52), correct: z.boolean().default(false) })).min(2).max(4),
  sayQuestion: say,
  sayReveal: say,
});

const vocabScene = z.object({
  kind: z.literal("vocab"),
  id,
  sayIntro: say.optional(),
  word: z.string().min(1).max(28),
  pron: z.string().max(32).optional(),
  pos: z.string().max(16).optional(),
  meaning: z.string().min(2).max(90),
  examples: z.array(z.object({ text: z.string().min(2).max(90), say })).min(1).max(3),
  synonym: z.string().max(48).optional(),
});

const chartScene = z.object({
  kind: z.literal("chart"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Visual form. Omitted = "bars", reproducing the original horizontal bars. */
  mode: z.enum(["bars", "column", "line", "area", "pie", "donut"]).optional(),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(24),
        value: z.number().finite().min(0).max(1e12),
        unit: z.string().max(8).optional(),
        say,
      })
    )
    .min(2)
    .max(6),
});

const quoteScene = z.object({
  kind: z.literal("quote"),
  id,
  narration,
  text: z.string().min(10).max(200),
  author: z.string().max(40).optional(),
});

const mythfactScene = z.object({
  kind: z.literal("mythfact"),
  id,
  myth: z.string().min(6).max(140),
  fact: z.string().min(6).max(160),
  sayMyth: say,
  sayFact: say,
});

const tableScene = z.object({
  kind: z.literal("table"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Reveal order. Omitted = "row" (slides rows in per beat); "column" wipes columns in left-to-right. */
  revealBy: z.enum(["row", "column"]).optional(),
  columns: z.array(z.string().min(1).max(18)).min(2).max(5),
  rows: z
    .array(
      z.object({
        cells: z.array(z.string().max(24)).min(1).max(5),
        say,
        highlight: z.boolean().default(false),
      })
    )
    .min(1)
    .max(6),
  /** Optional 0-based column to tint throughout (e.g. the key/join column). */
  highlightCol: z.number().int().min(0).max(4).optional(),
  caption: z.string().max(90).optional(),
});

const traceScene = z.object({
  kind: z.literal("trace"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  code: z.array(z.string().max(44)).min(2).max(12),
  cells: z.array(z.string().max(8)).min(3).max(10),
  steps: z
    .array(
      z.object({
        line: z.number().int().min(1),
        pointers: z
          .array(z.object({ label: z.string().min(1).max(6), index: z.number().int().min(0) }))
          .max(3)
          .default([]),
        mark: z
          .array(z.object({ index: z.number().int().min(0), state: z.enum(["focus", "done", "visit"]) }))
          .max(10)
          .default([]),
        swap: z.object({ a: z.number().int().min(0), b: z.number().int().min(0) }).optional(),
        say,
      })
    )
    .min(1)
    .max(10),
});

const memgridScene = z.object({
  kind: z.literal("memgrid"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  cells: z
    .array(z.object({ addr: z.string().min(1).max(6), value: z.string().max(10).optional() }))
    .min(4)
    .max(12),
  steps: z
    .array(
      z.object({
        write: z.array(z.object({ index: z.number().int().min(0), value: z.string().min(1).max(10) })).max(4).default([]),
        free: z.array(z.number().int().min(0)).max(4).default([]),
        pointer: z.object({ label: z.string().min(1).max(8), index: z.number().int().min(0) }).optional(),
        highlight: z.array(z.number().int().min(0)).max(6).default([]),
        say,
      })
    )
    .min(1)
    .max(8),
});

const callstackScene = z.object({
  kind: z.literal("callstack"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  steps: z
    .array(
      z.object({
        op: z.enum(["push", "pop"]),
        frame: z.string().max(24).optional(),
        note: z.string().max(40).optional(),
        ret: z.string().max(12).optional(),
        say,
      })
    )
    .min(2)
    .max(10),
});

const lifelineScene = z.object({
  kind: z.literal("lifeline"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  actors: z.array(z.object({ id, label: z.string().min(1).max(16), icon })).min(2).max(4),
  messages: z
    .array(
      z.object({
        from: id,
        to: id,
        label: z.string().min(1).max(28),
        style: z.enum(["call", "return", "data"]).default("call"),
        say,
      })
    )
    .min(1)
    .max(8),
});

const bitsScene = z.object({
  kind: z.literal("bits"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  width: z.number().int().min(4).max(12),
  steps: z
    .array(
      z.object({
        op: z.enum(["set", "and", "or", "xor", "not", "shl", "shr"]),
        value: z.string().regex(/^[01]+$/).optional(),
        note: z.string().max(30).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});

const browserframeScene = z.object({
  kind: z.literal("browserframe"),
  id,
  sayIntro: say.optional(),
  url: z.string().min(1).max(48),
  blocks: z
    .array(
      z.object({
        id,
        role: z.enum(["header", "hero", "text", "image", "button", "card"]),
        x: z.number().int().min(0).max(GRID - 1),
        y: z.number().int().min(0).max(GRID - 1),
        w: z.number().int().min(1).max(GRID),
        h: z.number().int().min(1).max(6),
      })
    )
    .min(2)
    .max(8),
  steps: z
    .array(
      z.object({
        show: z.array(id).default([]),
        paint: z.array(id).default([]),
        shift: z.object({ block: id, y: z.number().int().min(0).max(GRID - 1) }).optional(),
        badge: z.string().max(24).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});

const cycleScene = z.object({
  kind: z.literal("cycle"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  nodes: z
    .array(z.object({ label: z.string().min(1).max(22), icon, detail: z.string().max(40).optional(), say }))
    .min(3)
    .max(8),
});

const statemachineScene = z.object({
  kind: z.literal("statemachine"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  states: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(18),
        x: z.number().int().min(0).max(GRID - 1),
        y: z.number().int().min(0).max(GRID - 1),
        accent: z.boolean().default(false),
      })
    )
    .min(2)
    .max(6),
  edges: z.array(z.object({ from: id, to: id, label: z.string().max(16).optional() })).min(1).max(10),
  steps: z.array(z.object({ go: id, say })).min(1).max(8),
});

const decisionScene = z.object({
  kind: z.literal("decision"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  nodes: z
    .array(
      z.object({
        id,
        shape: z.enum(["question", "outcome"]),
        label: z.string().min(1).max(40),
        x: z.number().int().min(0).max(GRID - 1),
        y: z.number().int().min(0).max(GRID - 1),
      })
    )
    .min(2)
    .max(8),
  edges: z.array(z.object({ from: id, to: id, label: z.string().max(10).optional() })).min(1).max(10),
  steps: z.array(z.object({ go: id, say })).min(1).max(8),
});

const chainScene = z.object({
  kind: z.literal("chain"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  links: z.array(z.object({ text: z.string().min(2).max(60), icon, say })).min(3).max(7),
});

const pipelineScene = z.object({
  kind: z.literal("pipeline"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  item: z.object({ label: z.string().min(1).max(16), icon }),
  stations: z
    .array(z.object({ label: z.string().min(1).max(20), icon, out: z.string().min(1).max(16), say }))
    .min(2)
    .max(6),
});

const ledgerScene = z.object({
  kind: z.literal("ledger"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  unit: z.string().max(4).default("₹"),
  parties: z
    .array(z.object({ id, label: z.string().min(1).max(16), icon, start: z.number().finite().min(0).max(1e12) }))
    .min(2)
    .max(4),
  transfers: z
    .array(
      z.object({
        from: id,
        to: id,
        amount: z.number().finite().gt(0).max(1e12),
        label: z.string().max(24).optional(),
        say,
      })
    )
    .min(1)
    .max(6),
});

const sankeyScene = z.object({
  kind: z.literal("sankey"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  source: z.object({
    label: z.string().min(1).max(24),
    total: z.number().finite().gt(0).max(1e12),
    unit: z.string().max(8).optional(),
  }),
  branches: z
    .array(z.object({ label: z.string().min(1).max(22), value: z.number().finite().gt(0).max(1e12), say }))
    .min(2)
    .max(6),
});

const gaugeScene = z.object({
  kind: z.literal("gauge"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  min: z.number().finite(),
  max: z.number().finite(),
  unit: z.string().max(8).optional(),
  zones: z
    .array(z.object({ upTo: z.number().finite(), label: z.string().max(12).optional(), tone: z.enum(["good", "warn", "danger"]) }))
    .max(3)
    .default([]),
  readings: z.array(z.object({ label: z.string().min(1).max(24), value: z.number().finite(), say })).min(1).max(4),
});

const pictogramScene = z.object({
  kind: z.literal("pictogram"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  mode: z.enum(["grid", "arc"]).default("grid"),
  total: z.number().int().min(10).max(100),
  groups: z.array(z.object({ label: z.string().min(1).max(22), count: z.number().int().min(1), say })).min(1).max(4),
  /** arc mode: seat count where the majority tick is drawn (e.g. 272 of 543 scaled). */
  majorityAt: z.number().int().min(1).optional(),
});

const raceScene = z.object({
  kind: z.literal("race"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  unit: z.string().max(8).optional(),
  racers: z.array(z.object({ label: z.string().min(1).max(16), icon })).min(2).max(5),
  checkpoints: z
    .array(
      z.object({
        when: z.string().min(1).max(12),
        values: z.array(z.number().finite().min(0).max(1e12)).min(2).max(5),
        say,
      })
    )
    .min(2)
    .max(6),
});

const SCHEMATIC_SHAPES = [
  "dome",
  "onion-dome",
  "spire",
  "finial",
  "pillar",
  "arch",
  "gateway",
  "platform",
  "stairs",
  "wall",
  "tower",
  "cone",
  "umbrella",
  "flag",
  "orb",
  "wave",
  "mound",
  "ring",
  "block",
] as const;

const schematicScene = z.object({
  kind: z.literal("schematic"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  parts: z
    .array(
      z.object({
        id,
        shape: z.enum(SCHEMATIC_SHAPES),
        x: z.number().int().min(0).max(GRID - 1),
        y: z.number().int().min(0).max(GRID - 1),
        w: z.number().int().min(1).max(GRID),
        h: z.number().int().min(1).max(8),
        label: z.string().max(24).optional(),
      })
    )
    .min(2)
    .max(12),
  steps: z
    .array(z.object({ reveal: z.array(id).default([]), highlight: z.array(id).default([]), say }))
    .min(1)
    .max(8),
});

const TERRAIN_FEATURES = [
  "peak",
  "glacier",
  "dam",
  "city",
  "delta",
  "rain",
  "wind",
  "plate",
  "volcano",
  "forest",
] as const;

const terrainScene = z.object({
  kind: z.literal("terrain"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Elevation samples left->right, 0 (sea level) to 10 (highest ridge). */
  profile: z.array(z.number().min(0).max(10)).min(4).max(12),
  river: z.boolean().default(false),
  features: z
    .array(
      z.object({
        at: z.number().min(0).max(11),
        kind: z.enum(TERRAIN_FEATURES),
        label: z.string().min(1).max(20),
        say,
      })
    )
    .min(1)
    .max(6),
});

const zoomladderScene = z.object({
  kind: z.literal("zoomladder"),
  id,
  sayIntro: say.optional(),
  title: z.string().max(60).optional(),
  direction: z.enum(["out", "in"]).default("out"),
  rungs: z
    .array(z.object({ label: z.string().min(1).max(24), scale: z.string().min(1).max(14), icon, say }))
    .min(2)
    .max(6),
});

const dialogueScene = z.object({
  kind: z.literal("dialogue"),
  id,
  sayIntro: say.optional(),
  title: z.string().max(40).optional(),
  left: z.object({ name: z.string().min(1).max(14), icon }),
  right: z.object({ name: z.string().min(1).max(14), icon }),
  messages: z
    .array(
      z.object({
        from: z.enum(["left", "right"]),
        text: z.string().min(1).max(110),
        reaction: z.string().max(4).optional(),
        say,
      })
    )
    .min(2)
    .max(8),
});

const graphwalkScene = z.object({
  kind: z.literal("graphwalk"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  nodes: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(16),
        x: z.number().int().min(0).max(GRID - 1),
        y: z.number().int().min(0).max(GRID - 1),
      })
    )
    .min(3)
    .max(8),
  edges: z
    .array(z.object({ from: id, to: id, weight: z.number().int().min(1).max(99).optional() }))
    .min(2)
    .max(12),
  steps: z
    .array(
      z.object({
        visit: z.array(id).default([]),
        frontier: z.array(id).default([]),
        dist: z.array(z.object({ node: id, value: z.string().min(1).max(6) })).max(6).default([]),
        path: z.array(id).default([]),
        say,
      })
    )
    .min(1)
    .max(8),
});

const matrixScene = z.object({
  kind: z.literal("matrix"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  rows: z.number().int().min(2).max(8),
  cols: z.number().int().min(2).max(10),
  rowLabels: z.array(z.string().max(8)).max(8).default([]),
  colLabels: z.array(z.string().max(8)).max(10).default([]),
  steps: z
    .array(
      z.object({
        set: z
          .array(
            z.object({
              r: z.number().int().min(0),
              c: z.number().int().min(0),
              value: z.string().max(6).optional(),
              tone: z.enum(["accent", "good", "warn", "dim"]).default("accent"),
            })
          )
          .max(12)
          .default([]),
        sweep: z.object({ kind: z.enum(["row", "col", "diag"]), index: z.number().int().min(0) }).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});

const threadsScene = z.object({
  kind: z.literal("threads"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  lanes: z.array(z.object({ label: z.string().min(1).max(12) })).min(2).max(4),
  tasks: z
    .array(
      z.object({
        id,
        lane: z.number().int().min(0),
        label: z.string().min(1).max(14),
        start: z.number().int().min(0).max(11),
        len: z.number().int().min(1).max(12),
        kind: z.enum(["run", "wait", "crit"]).default("run"),
      })
    )
    .min(2)
    .max(12),
  steps: z
    .array(
      z.object({
        reveal: z.array(id).default([]),
        marker: z.object({ at: z.number().int().min(0).max(11), label: z.string().min(1).max(16) }).optional(),
        clash: z.array(id).default([]),
        say,
      })
    )
    .min(1)
    .max(8),
});

const queueflowScene = z.object({
  kind: z.literal("queueflow"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  servers: z.number().int().min(1).max(4).default(1),
  steps: z
    .array(
      z.object({
        arrive: z.number().int().min(0).max(6).default(0),
        serve: z.number().int().min(0).max(6).default(0),
        note: z.string().max(24).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});

const cipherScene = z.object({
  kind: z.literal("cipher"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  mode: z.enum(["shift", "hash"]),
  text: z.string().regex(/^[A-Z ]+$/).min(2).max(12),
  shift: z.number().int().min(1).max(25).optional(),
  steps: z
    .array(
      z.object({
        op: z.enum(["map", "input", "mix", "digest", "avalanche"]),
        upTo: z.number().int().min(1).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});

const CIRCUIT_PARTS = ["battery", "bulb", "switch", "resistor", "and", "or", "not", "led"] as const;

const circuitScene = z.object({
  kind: z.literal("circuit"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  parts: z
    .array(
      z.object({
        id,
        kind: z.enum(CIRCUIT_PARTS),
        x: z.number().int().min(0).max(GRID - 1),
        y: z.number().int().min(0).max(GRID - 1),
        label: z.string().max(10).optional(),
      })
    )
    .min(2)
    .max(10),
  wires: z.array(z.object({ from: id, to: id })).min(1).max(12),
  steps: z
    .array(
      z.object({
        close: z.array(id).default([]),
        on: z.array(id).default([]),
        signal: z.boolean().default(false),
        highlight: z.array(id).default([]),
        say,
      })
    )
    .min(1)
    .max(8),
});

const formulaScene = z.object({
  kind: z.literal("formula"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  lhs: z.object({ symbol: z.string().min(1).max(10), gloss: z.string().min(2).max(30) }),
  terms: z
    .array(
      z.object({
        op: z.enum(["", "+", "−", "×", "÷", "^"]).default(""),
        symbol: z.string().min(1).max(10),
        gloss: z.string().min(2).max(30),
        value: z.string().max(10).optional(),
        say,
      })
    )
    .min(1)
    .max(6),
  resultValue: z.string().max(12).optional(),
  sayResult: say.optional(),
});

const CURVE_SHAPES = ["linear", "exp", "log", "sine", "bell", "supply", "demand", "scurve", "ushape"] as const;

const curvesScene = z.object({
  kind: z.literal("curves"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  xLabel: z.string().max(14).optional(),
  yLabel: z.string().max(14).optional(),
  curves: z
    .array(z.object({ label: z.string().min(1).max(16), shape: z.enum(CURVE_SHAPES), say }))
    .min(1)
    .max(3),
  mark: z.object({ x: z.number().min(0).max(100), label: z.string().min(1).max(20), say }).optional(),
});

const bucketsScene = z.object({
  kind: z.literal("buckets"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  unit: z.string().max(4).default("₹"),
  buckets: z
    .array(
      z.object({
        label: z.string().min(1).max(16),
        capacity: z.number().finite().gt(0).max(1e12),
        rate: z.string().max(8).optional(),
      })
    )
    .min(2)
    .max(5),
  pours: z.array(z.object({ amount: z.number().finite().gt(0).max(1e12), say })).min(1).max(6),
});

const probabilityScene = z.object({
  kind: z.literal("probability"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  segments: z
    .array(z.object({ label: z.string().min(1).max(12), weight: z.number().int().min(1).max(10), win: z.boolean().default(false) }))
    .min(2)
    .max(8),
  spins: z.array(z.object({ land: z.number().int().min(0), say })).min(1).max(6),
  verdict: z.string().max(60).optional(),
  sayVerdict: say.optional(),
});

const basketScene = z.object({
  kind: z.literal("basket"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  unit: z.string().max(4).default("₹"),
  items: z
    .array(z.object({ label: z.string().min(1).max(14), icon, prices: z.array(z.number().finite().min(0).max(1e9)).min(2).max(4) }))
    .min(2)
    .max(6),
  years: z.array(z.object({ when: z.string().min(1).max(8), say })).min(2).max(4),
});

const radarScene = z.object({
  kind: z.literal("radar"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  axes: z.array(z.string().min(1).max(14)).min(3).max(6),
  entities: z
    .array(z.object({ label: z.string().min(1).max(16), values: z.array(z.number().min(0).max(100)).min(3).max(6), say }))
    .min(1)
    .max(3),
});

const BODY_REGIONS = [
  "brain",
  "eyes",
  "ears",
  "throat",
  "heart",
  "lungs",
  "stomach",
  "liver",
  "kidneys",
  "intestines",
  "muscles",
  "bones",
  "skin",
  "blood",
] as const;

const bodymapScene = z.object({
  kind: z.literal("bodymap"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  path: z.boolean().default(false),
  marks: z
    .array(z.object({ region: z.enum(BODY_REGIONS), label: z.string().min(1).max(20), say }))
    .min(1)
    .max(6),
});

const constellationScene = z.object({
  kind: z.literal("constellation"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  points: z
    .array(
      z.object({
        id,
        x: z.number().int().min(0).max(GRID - 1),
        y: z.number().int().min(0).max(GRID - 1),
        label: z.string().max(12).optional(),
      })
    )
    .min(4)
    .max(12),
  steps: z
    .array(z.object({ connect: z.array(z.object({ a: id, b: id })).min(1).max(6), say }))
    .min(1)
    .max(8),
  finale: z.object({ label: z.string().min(1).max(24), say }).optional(),
});

const dayclockScene = z.object({
  kind: z.literal("dayclock"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  face: z.enum(["12h", "24h"]).default("12h"),
  pins: z
    .array(
      z.object({
        at: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/),
        label: z.string().min(1).max(24),
        icon,
        say,
      })
    )
    .min(2)
    .max(8),
});

const storyboardScene = z.object({
  kind: z.literal("storyboard"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  panels: z
    .array(z.object({ icons: z.array(z.string().min(1).max(16)).min(1).max(4), caption: z.string().min(2).max(60), say }))
    .min(2)
    .max(6),
});

const bracketScene = z.object({
  kind: z.literal("bracket"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  contenders: z.array(z.object({ label: z.string().min(1).max(14), icon })).min(4).max(8),
  matches: z.array(z.object({ winner: z.number().int().min(0), say })).min(3).max(7),
});

const showdownScene = z.object({
  kind: z.literal("showdown"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  left: z.object({ label: z.string().min(1).max(14), icon }),
  right: z.object({ label: z.string().min(1).max(14), icon }),
  rounds: z
    .array(
      z.object({
        criterion: z.string().min(1).max(18),
        winner: z.enum(["left", "right", "tie"]),
        note: z.string().max(40).optional(),
        say,
      })
    )
    .min(2)
    .max(6),
  verdict: z.string().max(60).optional(),
  sayVerdict: say.optional(),
});

export const SKYLINE_BUILDINGS = ["hut", "house", "mill", "tower", "skyscraper", "temple", "dome", "landmark"] as const;

const skylineScene = z.object({
  kind: z.literal("skyline"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  eras: z
    .array(
      z.object({
        when: z.string().min(1).max(12),
        buildings: z
          .array(z.object({ kind: z.enum(SKYLINE_BUILDINGS), h: z.number().int().min(1).max(10) }))
          .min(1)
          .max(5),
        stat: z.string().max(14).optional(),
        say,
      })
    )
    .min(2)
    .max(6),
});

const calendarScene = z.object({
  kind: z.literal("calendar"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  marks: z
    .array(
      z.object({
        from: z.number().int().min(1).max(12),
        to: z.number().int().min(1).max(12),
        label: z.string().min(1).max(16),
        tone: z.enum(["accent", "secondary", "good", "warn"]).default("accent"),
        say,
      })
    )
    .min(1)
    .max(6),
});

const geomapScene = z.object({
  kind: z.literal("geomap"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  base: z.enum(["india", "world", "asia", "subcontinent", "europe"]),
  markers: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(24),
        lon: z.number(),
        lat: z.number(),
        kind: z.enum(["city", "battle", "capital", "port", "peak", "dot"]).default("dot"),
        icon: z.string().optional(),
      })
    )
    .max(8)
    .optional(),
  routes: z
    .array(
      z.object({
        id,
        points: z.array(z.object({ lon: z.number(), lat: z.number() })).min(2).max(12),
        label: z.string().max(24).optional(),
        style: z.enum(["route", "river", "wind", "front"]).default("route"),
      })
    )
    .max(4)
    .optional(),
  regions: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(40),
        bounds: z.array(z.object({ lon: z.number(), lat: z.number() })).optional(),
      })
    )
    .max(8)
    .optional(),
  steps: z
    .array(
      z.object({
        reveal: z.array(id).optional(),
        highlight: z.array(id).optional(),
        focus: z.object({ lon: z.number(), lat: z.number(), zoom: z.number().optional() }).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});

const numberlineScene = z.object({
  kind: z.literal("numberline"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  min: z.number(),
  max: z.number(),
  tickUnit: z.string().max(8).optional(),
  mode: z.enum(["line", "plane"]).default("line"),
  marks: z
    .array(
      z.object({
        value: z.number(),
        y: z.number().optional(),
        label: z.string().min(1).max(20),
        kind: z.enum(["point", "jump", "range"]).default("point"),
        to: z.number().optional(),
        say: say.optional(),
      })
    )
    .min(1)
    .max(6),
});

const geometryScene = z.object({
  kind: z.literal("geometry"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  points: z
    .array(
      z.object({
        id,
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        label: z.string().max(8).optional(),
      })
    )
    .max(10),
  segments: z
    .array(
      z.object({
        a: id,
        b: id,
        label: z.string().max(12).optional(),
        style: z.enum(["side", "aux", "ray", "radius"]).default("side"),
      })
    )
    .optional(),
  angles: z
    .array(
      z.object({
        at: id,
        from: id,
        to: id,
        label: z.string().max(8).optional(),
        right: z.boolean().optional(),
      })
    )
    .max(4)
    .optional(),
  fills: z
    .array(
      z.object({
        pts: z.array(id),
        label: z.string().max(14).optional(),
        value: z.string().max(10).optional(),
      })
    )
    .max(3)
    .optional(),
  steps: z
    .array(
      z.object({
        reveal: z.array(id).optional(),
        highlight: z.array(id).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});

const moleculeScene = z.object({
  kind: z.literal("molecule"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  mode: z.enum(["equation", "structure"]),
  equation: z
    .object({
      left: z.array(z.object({ formula: z.string().max(12), count: z.number().int().min(1).max(6) })),
      right: z.array(z.object({ formula: z.string().max(12), count: z.number().int().min(1).max(6) })),
      sayLeft: say,
      sayReact: say,
      sayRight: say,
    })
    .optional(),
  structure: z
    .object({
      atoms: z.array(z.object({ el: z.string().max(2), x: z.number(), y: z.number() })),
      bonds: z.array(z.object({ a: z.number().int(), b: z.number().int(), order: z.number().int().min(1).max(3) })),
      steps: z.array(z.object({ reveal: z.array(z.number().int()).optional(), say })),
    })
    .optional(),
});

const layersScene = z.object({
  kind: z.literal("layers"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  shape: z.enum(["stack", "rings", "dome"]).default("stack"),
  layers: z
    .array(
      z.object({
        label: z.string().min(1).max(26),
        detail: z.string().max(60).optional(),
        icon: z.string().optional(),
        say,
      })
    )
    .min(2)
    .max(7),
});

const trafficflowScene = z.object({
  kind: z.literal("trafficflow"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  algorithm: z.enum(["round-robin", "least-connections", "hash"]).optional(),
  clients: z.number().int().default(1),
  servers: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(24),
        load: z.number().min(0).max(100),
        status: z.enum(["healthy", "overloaded", "drained"]).optional(),
      })
    )
    .min(2)
    .max(6),
  steps: z
    .array(
      z.object({
        targetServer: id.optional(),
        rate: z.string().optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});

const eventbusScene = z.object({
  kind: z.literal("eventbus"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  busName: z.string().max(40).optional(),
  producers: z.array(z.object({ id, label: z.string().min(1).max(20), icon: z.string().optional() })).min(1).max(4),
  topics: z.array(z.object({ id, name: z.string().min(1).max(24), partitions: z.number().int().optional() })).min(1).max(4),
  consumers: z.array(z.object({ id, label: z.string().min(1).max(20), topicId: id })).min(1).max(4),
  steps: z
    .array(
      z.object({
        publish: z.object({ producerId: id, topicId: id, event: z.string() }).optional(),
        consume: z.object({ consumerId: id, topicId: id }).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});

const globe3dScene = z.object({
  kind: z.literal("globe3d"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Pins placed on a real 3-D rotating Earth by lon/lat; kind picks the marker style. */
  markers: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(24),
        lon: z.number().min(-180).max(180),
        lat: z.number().min(-90).max(90),
        kind: z.enum(["city", "wind", "current", "zone", "peak", "dot"]).default("dot"),
      })
    )
    .min(1)
    .max(8),
  /** Great-circle arcs (jet streams, ocean currents, routes) drawn over the globe. */
  arcs: z
    .array(
      z.object({
        fromLon: z.number().min(-180).max(180),
        fromLat: z.number().min(-90).max(90),
        toLon: z.number().min(-180).max(180),
        toLat: z.number().min(-90).max(90),
        label: z.string().max(24).optional(),
        style: z.enum(["wind", "current", "route", "jet"]).default("route"),
      })
    )
    .max(5)
    .default([]),
  steps: z
    .array(
      z.object({
        reveal: z.array(id).default([]),
        highlight: z.array(id).default([]),
        /** Indices into `arcs` to draw this step. */
        arcs: z.array(z.number().int().min(0)).default([]),
        /** Rotate the globe so this lon/lat faces the camera. */
        focus: z.object({ lon: z.number(), lat: z.number() }).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});

const dpTableFillScene = z.object({
  kind: z.literal("dp_table_fill"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  rows: z.number().int().min(2).max(12),
  cols: z.number().int().min(2).max(12),
  rowLabels: z.array(z.string().max(8)).max(12).default([]),
  colLabels: z.array(z.string().max(8)).max(12).default([]),
  steps: z
    .array(
      z.object({
        /** Cells computed this beat; last one is treated as the focus if none given. */
        cells: z.array(z.object({ r: z.number().int().min(0), c: z.number().int().min(0), value: z.string().max(6) })).min(1).max(12),
        /** The current cell being computed (highlighted; dependency arrows point in). */
        focus: z.object({ r: z.number().int().min(0), c: z.number().int().min(0) }).optional(),
        /** Cells whose values feed the focus cell — arrows drawn from each into focus. */
        deps: z.array(z.object({ r: z.number().int().min(0), c: z.number().int().min(0) })).max(4).default([]),
        say,
      })
    )
    .min(1)
    .max(10),
});

const sysarchScene = z.object({
  kind: z.literal("sysarch"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Ordered infrastructure tiers, revealed one per beat; `kind` picks the glyph,
   *  `count` shows horizontally-scaled replicas. */
  tiers: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(20),
        kind: z.enum(["client", "cdn", "gateway", "lb", "app", "worker", "cache", "queue", "db", "storage"]).default("app"),
        count: z.number().int().min(1).max(5).default(1),
        say,
      })
    )
    .min(2)
    .max(6),
  flows: z
    .array(z.object({ from: id, to: id, label: z.string().max(16).optional(), style: z.enum(["solid", "dashed"]).optional() }))
    .max(12)
    .default([]),
});

const slidingwindowScene = z.object({
  kind: z.literal("slidingwindow"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** The sequence the window slides over (array / byte stream / packet queue). */
  values: z.array(z.string().max(5)).min(3).max(18),
  /** What the running aggregate readout is called (e.g. "sum", "in flight", "jumps"). */
  metric: z.string().max(14).default("sum"),
  /** One window position per beat; the frame slides/resizes from the previous beat's bounds. */
  steps: z
    .array(
      z.object({
        /** Inclusive window bounds as indices into values — the L and R pointers. */
        left: z.number().int().min(0),
        right: z.number().int().min(0),
        /** Running aggregate readout for this window; defaults to the cell count. */
        value: z.string().max(10).optional(),
        /** Short caption shown under the panel (e.g. "receiver buffer full"). */
        note: z.string().max(28).optional(),
        /** accent = normal, good = healthy/growing, warn = throttled/shrinking. */
        tone: z.enum(["accent", "good", "warn"]).default("accent"),
        say,
      })
    )
    .min(1)
    .max(10),
});
const trendgraphScene = z.object({
  kind: z.literal("trendgraph"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Value-axis unit: currency symbols (₹$€£) prefix, "%"/text suffix. */
  unit: z.string().max(8).optional(),
  /** 2–3 lines sharing one value axis; the band shades between the first two. */
  series: z
    .array(
      z.object({
        label: z.string().min(1).max(24),
        /** One value per step, in step order (length must equal steps.length). */
        values: z.array(z.number().finite()).min(2).max(10),
        /** Colour role: accent/secondary are solid glowing lines, muted is a dashed reference line. */
        role: z.enum(["accent", "secondary", "muted"]).default("accent"),
      })
    )
    .min(2)
    .max(3),
  /** Shade the divergence area between series[0] and series[1] and mark the widest gap. */
  band: z.boolean().default(true),
  /** Time points revealed left→right, one per beat. */
  steps: z.array(z.object({ x: z.string().min(1).max(10), say })).min(2).max(10),
});
const topologyScene = z.object({
  kind: z.literal("topology"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  nodes: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(16),
        kind: z.enum(["hub", "switch", "router", "host", "node"]).default("host"),
        x: z.number().int().min(0).max(GRID - 1),
        y: z.number().int().min(0).max(GRID - 1),
      })
    )
    .min(2)
    .max(9),
  links: z.array(z.object({ from: id, to: id })).min(1).max(16),
  steps: z
    .array(
      z.object({
        focus: id,
        emit: z.enum(["none", "one", "all"]).default("none"),
        target: id.optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});
const scrollScene = z.object({
  kind: z.literal("scroll"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Document header shown at the top of the sheet under an ink rule. */
  heading: z.string().min(2).max(40).optional(),
  /** One emoji pressed into the wax seal at the foot when the last line lands. */
  seal: icon,
  /** Text lines revealed one per beat; `label` is an optional clause/era marker. */
  lines: z
    .array(z.object({ text: z.string().min(2).max(90), label: z.string().max(16).optional(), say }))
    .min(2)
    .max(6),
});
const tacticalMapScene = z.object({
  kind: z.literal("tactical_map"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Labels for the two sides shown in the map legend (side a = accent, side b = secondary). */
  sideALabel: z.string().min(1).max(20).default("Attacker"),
  sideBLabel: z.string().min(1).max(20).default("Defender"),
  /** Abstract terrain backdrop drawn under the units. */
  terrain: z.enum(["hills", "plain", "river", "fort"]).default("hills"),
  /** Troop blocks placed on a 0..12 grid; `side` picks the colour, `strength` the pip count. */
  units: z
    .array(
      z.object({
        id,
        side: z.enum(["a", "b"]).default("a"),
        label: z.string().min(1).max(16),
        x: z.number().min(0).max(GRID),
        y: z.number().min(0).max(GRID),
        strength: z.number().int().min(1).max(9).default(3),
      })
    )
    .min(2)
    .max(10),
  /** One beat per step: MOVE slides the named units to new grid cells trailing flanking arrows; CLASH bursts where the lines meet. */
  steps: z
    .array(
      z.object({
        kind: z.enum(["move", "clash"]).default("move"),
        moves: z
          .array(z.object({ unit: id, toX: z.number().min(0).max(GRID), toY: z.number().min(0).max(GRID) }))
          .max(6)
          .default([]),
        /** Grid point of a clash burst; defaults to the centroid of all units. */
        clashAt: z.object({ x: z.number().min(0).max(GRID), y: z.number().min(0).max(GRID) }).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});
const architectureBlueprintScene = z.object({
  kind: z.literal("architecture_blueprint"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Top-down plan parts on a 12x12 grid; parts MAY overlap to compose (a court
   *  inside a room, a gate on a wall) — earlier parts draw behind. */
  parts: z
    .array(
      z.object({
        id,
        shape: z.enum(["wall", "room", "dome", "minaret", "court", "road", "gate"]),
        x: z.number().int().min(0).max(GRID - 1),
        y: z.number().int().min(0).max(GRID - 1),
        w: z.number().int().min(1).max(GRID),
        h: z.number().int().min(1).max(GRID),
        label: z.string().max(24).optional(),
      })
    )
    .min(2)
    .max(14),
  steps: z
    .array(z.object({ reveal: z.array(id).default([]), highlight: z.array(id).default([]), say }))
    .min(1)
    .max(8),
});
const packetDeliveryScene = z.object({
  kind: z.literal("packet_delivery"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Ordered network hops laid in a row; an envelope travels between them. */
  hops: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(20),
        kind: z.enum(["host", "router", "proxy", "firewall"]).default("host"),
      })
    )
    .min(2)
    .max(6),
  /** One packet event per beat, animated on the envelope. */
  steps: z
    .array(
      z.object({
        action: z.enum(["send", "drop", "retransmit", "inspect", "ack"]).default("send"),
        from: id,
        to: id,
        /** Hop id where a drop or inspect happens (defaults to the mid hop / first proxy|firewall). */
        at: id.optional(),
        /** Envelope contents label, e.g. "SEQ 1024", "GET /chat". */
        payload: z.string().max(18).optional(),
        /** Rewritten contents after an inspect/modify (spoof, upgrade). */
        payloadAfter: z.string().max(18).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});
const codediffScene = z.object({
  kind: z.literal("codediff"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  filename: z.string().min(1).max(32).default("diff"),
  lang: z.string().min(1).max(12).default("diff"),
  lines: z
    .array(
      z.object({
        text: z.string().max(52),
        kind: z.enum(["same", "add", "del"]).default("same"),
      })
    )
    .min(2)
    .max(16),
  steps: z
    .array(
      z.object({
        /** 0-based line indices this hunk reveals/highlights; add/del lines stay ghosted until their step. */
        focus: z.array(z.number().int().min(0)).max(16).default([]),
        say,
      })
    )
    .min(1)
    .max(8),
});
const parliamentArcScene = z.object({
  kind: z.literal("parliament_arc"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Total seats in the chamber = the hemicycle dot count. */
  total: z.number().int().min(6).max(600).default(100),
  /** Seat index where the majority tick sits (e.g. 272 for Lok Sabha, the two-thirds line for Article 368); the threshold line flashes as the running tally crosses it. */
  majorityAt: z.number().int().min(1).max(600).optional(),
  /** Factions fill their contiguous block of seat dots left→right, one per beat; the centre readout tallies filled-of-total. */
  factions: z
    .array(
      z.object({
        label: z.string().min(1).max(22),
        seats: z.number().int().min(0).max(600),
        tone: z.enum(["for", "against", "abstain", "accent", "secondary"]).default("accent"),
        say,
      })
    )
    .min(1)
    .max(6),
});

const serverRackScene = z.object({
  kind: z.literal("server_rack"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Physical cabinets, left→right (or top→bottom in 9:16). `active` is the
   *  initial healthy-blade count (defaults to `slots` — a fully-populated rack);
   *  racks sharing a `group` get a dashed isolation boundary (container/VPC
   *  networks, regions). */
  racks: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(20),
        slots: z.number().int().min(1).max(8),
        active: z.number().int().min(0).max(8).optional(),
        group: z.string().max(20).optional(),
      })
    )
    .min(1)
    .max(5),
  /** One beat per step, mutating individual blades (latest write wins, replayed
   *  from the top each frame so scrubbing is stable). */
  steps: z
    .array(
      z.object({
        op: z.enum(["crash", "recover", "scale", "lead", "failover", "probe"]),
        rack: id,
        /** 0-based blade index; omit to let the op pick a sensible target
         *  (e.g. crash picks the first healthy blade, scale picks the first
         *  empty slot). */
        slot: z.number().int().min(0).max(7).optional(),
        /** Destination blade for "failover" — required for that op. */
        to: z.object({ rack: id, slot: z.number().int().min(0).max(7) }).optional(),
        note: z.string().max(28).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});
const jigsawPuzzleScene = z.object({
  kind: z.literal("jigsaw_puzzle"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Interlocking pieces revealed one per beat, sliding in from alternating
   *  sides. `fits` (default true) snaps the piece into its neighbour's cut so
   *  tab and blank mate exactly; false makes it hover just off the seam and
   *  rattle, showing the two halves don't actually complete one another. */
  pieces: z
    .array(
      z.object({
        label: z.string().min(1).max(26),
        icon: icon,
        sub: z.string().max(28).optional(),
        fits: z.boolean().default(true),
        say,
      })
    )
    .min(2)
    .max(6),
});
const dominoCascadeScene = z.object({
  kind: z.literal("domino_cascade"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  dominoes: z
    .array(z.object({ label: z.string().min(1).max(24), icon, say }))
    .min(3)
    .max(7),
});
const sheetMusicScene = z.object({
  kind: z.literal("sheet_music"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Raga/tala/instrument context chip shown under the title, e.g. "Raga Yaman". */
  keyLabel: z.string().max(28).optional(),
  /** Up to two colour-coded voices sharing one staff (e.g. comparing two instruments). */
  legend: z.array(z.object({ voice: z.enum(["a", "b"]), label: z.string().min(1).max(16) })).max(2).default([]),
  /** Rhythmic cycle (tala) drawn as a tick strip; `sam` is the accented first beat. */
  tala: z
    .object({
      beats: z.number().int().min(2).max(16),
      sam: z.number().int().min(1).max(16).default(1),
      label: z.string().max(16).optional(),
    })
    .optional(),
  /** One phrase per beat; each becomes its own staff row, revealed top-down in order. */
  steps: z
    .array(
      z.object({
        notes: z
          .array(
            z.object({
              /** Staff position: 0 = middle line, ±2 per line/space step, ±4 = outer lines, ±5/±6 = ledger notes. */
              pos: z.number().int().min(-6).max(6),
              dur: z.enum(["whole", "half", "quarter", "eighth", "sixteenth"]).default("quarter"),
              label: z.string().max(10).optional(),
              voice: z.enum(["a", "b"]).default("a"),
              /** Meend/glide tie into the next note (same voice, same phrase). */
              slideToNext: z.boolean().default(false),
            })
          )
          .min(1)
          .max(8),
        /** Which matra (1-indexed) of `tala` this phrase lands on, for the tick-strip highlight. */
        matra: z.number().int().min(1).max(16).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});
const canvasRevealScene = z.object({
  kind: z.literal("canvas_reveal"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Museum-placard caption for the whole piece, e.g. "Warli painting, Maharashtra". */
  artLabel: z.string().min(1).max(30).optional(),
  /** Base pigment/ground colour of the canvas the motifs sit on. */
  canvasColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7a2e22"),
  /** Painted motifs placed on a 12x12 grid over the canvas; parts MAY overlap — earlier ones draw behind. */
  regions: z
    .array(
      z.object({
        id,
        x: z.number().int().min(0).max(GRID - 1),
        y: z.number().int().min(0).max(GRID - 1),
        w: z.number().int().min(1).max(GRID),
        h: z.number().int().min(1).max(GRID),
        label: z.string().min(1).max(24),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        shape: z.enum(["rect", "blob", "triangle"]).default("blob"),
      })
    )
    .min(1)
    .max(6),
  /** The artwork's named colour palette, revealed into a swatch strip beneath the frame. */
  swatches: z
    .array(z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), label: z.string().min(1).max(20) }))
    .max(6)
    .default([]),
  steps: z
    .array(
      z.object({
        /** Region the camera zooms/pans to this beat; omit for a full-canvas overview beat. */
        focus: id.optional(),
        /** Index into swatches[] revealed this beat. */
        swatchIndex: z.number().int().min(0).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});
const scalecompareScene = z.object({
  kind: z.literal("scalecompare"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** "height" = bars rise from a shared floor (falls, mountains, towers);
   *  "length" = bars grow from a shared left edge (routes, distances, durations). */
  axis: z.enum(["height", "length"]).default("height"),
  /** "log" compresses wildly disproportionate values (ns vs months) so the
   *  smaller item stays a visible sliver instead of vanishing entirely. */
  scale: z.enum(["linear", "log"]).default("linear"),
  /** Shared unit suffix for every item's counted-up value — the comparison
   *  only makes sense measured on one common yardstick. */
  unit: z.string().max(10).optional(),
  items: z
    .array(z.object({ id, label: z.string().min(1).max(24), value: z.number().finite().min(0).max(1e15), icon, say }))
    .min(2)
    .max(5),
  verdict: z.string().max(110).optional(),
  sayVerdict: say.optional(),
});
const fluidflowScene = z.object({
  kind: z.literal("fluidflow"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** One point of origin per current/tributary/front. Particles emit along flowDeg
   *  (screen-space degrees: 0=east,90=south,180=west,270=north) and are bent into an
   *  organic streamline by a shared noise field. Several sources sharing one spot with
   *  different headings read as radial drainage; a single source alone reads as one
   *  current or wind belt. */
  sources: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(24),
        x: z.number().min(0).max(GRID),
        y: z.number().min(0).max(GRID),
        flowDeg: z.number().min(0).max(359).default(90),
        icon,
      })
    )
    .min(1)
    .max(6),
  /** Optional destination markers (a sea, a city, a basin) the flow visually reads toward. */
  sinks: z
    .array(z.object({ id, label: z.string().min(1).max(24), x: z.number().min(0).max(GRID), y: z.number().min(0).max(GRID) }))
    .max(4)
    .default([]),
  steps: z
    .array(
      z.object({
        reveal: z.array(id).default([]),
        highlight: z.array(id).default([]),
        revealSinks: z.array(id).default([]),
        say,
      })
    )
    .min(1)
    .max(8),
});
const ecosystemWebScene = z.object({
  kind: z.literal("ecosystem_web"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Producers/consumers/environmental factors scattered on an organic radial
   *  web; `kind` drives the node's colour, shape and legend entry. */
  nodes: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(20),
        kind: z.enum(["producer", "consumer", "factor"]).default("consumer"),
        icon,
      })
    )
    .min(3)
    .max(10),
  /** Directed strand between two node ids: "eats" = energy flow prey->predator,
   *  "affects" = an environmental factor disrupting/impacting a node. */
  links: z
    .array(
      z.object({
        id,
        from: id,
        to: id,
        type: z.enum(["eats", "affects"]).default("eats"),
        label: z.string().max(20).optional(),
      })
    )
    .min(1)
    .max(14),
  /** One or more link ids drawn on per beat as the narration walks the chain;
   *  each node pops in the moment its first incident link is revealed. */
  steps: z.array(z.object({ reveal: z.array(id).min(1).max(4), say })).min(1).max(8),
});
const turingTapeScene = z.object({
  kind: z.literal("turing_tape"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Cells known before step 0; the head starts at headStart (index into this
   *  conceptual array). Cells outside this array — in EITHER direction — render
   *  as `blank` until a step writes them: the illusion of an infinite tape. */
  initial: z.array(z.string().max(4)).min(1).max(12).default(["0"]),
  headStart: z.number().int().min(0).max(11).default(0),
  blank: z.string().max(2).default("0"),
  showIndex: z.boolean().default(false),
  steps: z
    .array(
      z.object({
        write: z.string().max(4).optional(),
        move: z.enum(["L", "R", "none"]).default("none"),
        state: z.string().max(16).optional(),
        say,
      })
    )
    .min(1)
    .max(10),
});
const gridFloodScene = z.object({
  kind: z.literal("grid_flood"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** bfs = simultaneous expanding ripple fronts (flood fill); dfs = a single snake path with a visible parent chain. */
  mode: z.enum(["bfs", "dfs"]),
  rows: z.number().int().min(2).max(12),
  cols: z.number().int().min(2).max(12),
  /** Impassable cells (water for Number of Islands, blocked cells for a maze) — traversal never enters these. */
  walls: z.array(z.object({ r: z.number().int().min(0), c: z.number().int().min(0) })).max(60).default([]),
  /** Optional static per-cell overlay text (e.g. "1"/"0" land-water grid, a pixel's colour code). */
  cells: z
    .array(z.object({ r: z.number().int().min(0), c: z.number().int().min(0), value: z.string().max(3) }))
    .max(144)
    .default([]),
  /** Named colour-coded fronts shown as legend chips (e.g. "Island 1", "Pacific", "Atlantic"). */
  groups: z.array(z.object({ label: z.string().min(1).max(14) })).max(4).default([]),
  /** Seed cell(s) for each traversal front; `group` picks its colour (0-3, cycled if more). */
  starts: z
    .array(
      z.object({
        r: z.number().int().min(0),
        c: z.number().int().min(0),
        label: z.string().max(10).optional(),
        group: z.number().int().min(0).max(3).default(0),
      })
    )
    .min(1)
    .max(6),
  /** One beat = one wavefront layer (bfs, usually several cells) or one stack push (dfs, usually one cell).
   *  `from` draws the parent edge (dependency/backtrack line); omit it for a freshly-seeded root. */
  steps: z
    .array(
      z.object({
        visit: z
          .array(
            z.object({
              r: z.number().int().min(0),
              c: z.number().int().min(0),
              group: z.number().int().min(0).max(3).default(0),
              from: z.object({ r: z.number().int().min(0), c: z.number().int().min(0) }).optional(),
            })
          )
          .min(1)
          .max(24),
        say,
      })
    )
    .min(1)
    .max(14),
});

const hashRingScene = z.object({
  kind: z.literal("hash_ring"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Ring nodes (servers/shards). `angle` (0-360, clockwise from top) is deterministic
   *  from id when omitted. `tokens` = virtual-node count (e.g. 256) shown as a token-cloud + ×N badge. */
  nodes: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(20),
        angle: z.number().min(0).max(360).optional(),
        tokens: z.number().int().min(1).max(512).default(1),
      })
    )
    .min(1)
    .max(8),
  /** Keys/requests hashed onto the ring; `angle` deterministic from id when omitted. */
  keys: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(16),
        angle: z.number().min(0).max(360).optional(),
      })
    )
    .min(1)
    .max(10),
  /** One ring event per beat: add/remove a node (existing keys reshuffle to the
   *  next clockwise node only), or place a key (it snaps to its owning node). */
  steps: z
    .array(
      z.object({
        action: z.enum(["addNode", "removeNode", "placeKey"]),
        nodeId: id.optional(),
        keyId: id.optional(),
        say,
      })
    )
    .min(1)
    .max(12),
});
const recursionTreeNode = z.object({
  id,
  label: z.string().min(1).max(20),
  /** Parent node id; null/omitted marks the single root (the initial call). */
  parent: id.nullable().optional(),
});

const recursionTreeScene = z.object({
  kind: z.literal("recursion_tree"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Every call in the recursion tree, addressed by parent pointer — positions are automatic. */
  nodes: z.array(recursionTreeNode).min(2).max(24),
  /** One beat per step: which calls are newly explored (expand), fail fast with no
   *  children (prune), reach a complete valid leaf (accept), or return control to
   *  their parent (backtrack). `accept` is separate from "no children" so a
   *  dead-end leaf doesn't read as a found solution. */
  steps: z
    .array(
      z.object({
        expand: z.array(id).max(6).default([]),
        prune: z.array(id).max(6).default([]),
        accept: z.array(id).max(6).default([]),
        backtrack: z.array(id).max(6).default([]),
        note: z.string().max(40).optional(),
        say,
      })
    )
    .min(1)
    .max(16),
});
const tokenExchangeScene = z.object({
  kind: z.literal("token_exchange"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  tokenLabel: z.string().min(1).max(20).default("JWT"),
  actors: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(16),
        role: z.enum(["client", "gateway", "auth", "resource"]).default("client"),
      })
    )
    .min(2)
    .max(4),
  steps: z
    .array(
      z.object({
        from: id,
        to: id,
        action: z.enum(["issue", "present", "verify", "expire"]).default("present"),
        valid: z.boolean().default(true),
        note: z.string().max(24).optional(),
        say,
      })
    )
    .min(1)
    .max(7),
});
const coinStackScene = z.object({
  kind: z.literal("coin_stack"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  unit: z.string().max(4).default("₹"),
  stacks: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(18),
        coins: z.number().finite().min(0).max(1e12),
        tone: z.enum(["good", "warn", "danger"]).optional(),
        icon,
      })
    )
    .min(2)
    .max(5),
  steps: z
    .array(
      z
        .object({
          from: id.optional(),
          to: id.optional(),
          amount: z.number().finite().gt(0).max(1e12),
          label: z.string().max(24).optional(),
          say,
        })
        .refine((s) => !!s.from || !!s.to, { message: "coin_stack step needs from and/or to" })
    )
    .min(1)
    .max(6),
});
const btreeIndexNode = z.object({
  id,
  /** Parent node id; null (or omitted) marks the single root. */
  parent: id.nullable().optional(),
  /** Ordered keys stored in this node — drawn as a mini row of key cells. */
  keys: z.array(z.string().min(1).max(6)).min(1).max(5),
  /** Marks a data (leaf) node; nodes with no children render as leaves regardless. */
  leaf: z.boolean().default(false),
});

const btreeIndexScene = z.object({
  kind: z.literal("btree_index"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  nodes: z.array(btreeIndexNode).min(3).max(16),
  /** Left-to-right leaf ids for the B+Tree leaf chain; omit to infer left-to-right from the auto layout. */
  leafChain: z.array(id).max(16).default([]),
  steps: z
    .array(
      z.object({
        /** "descend": light up the root->target path node by node (a lookup). "scan": sweep a run of leaves along the chain (a range scan). */
        mode: z.enum(["descend", "scan"]).default("descend"),
        /** descend: the leaf/node the lookup reaches. scan: the first leaf in the run. */
        target: id,
        /** Key cell to glow: the matched key (descend) or the range-start key (scan). */
        keyIndex: z.number().int().min(0).default(0),
        /** scan only: how many chained leaves (including target) ride the chain this beat. */
        scanCount: z.number().int().min(1).max(8).default(1),
        say,
      })
    )
    .min(1)
    .max(10),
});
const lsmCompactionScene = z.object({
  kind: z.literal("lsm_compaction"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** On-disk SSTable levels rendered as rows (L0..Ln). */
  levelCount: z.number().int().min(1).max(4).default(2),
  /** Visual capacity of the memtable slot bar (not a real byte size). */
  memtableCapacity: z.number().int().min(2).max(8).default(4),
  steps: z
    .array(
      z.object({
        op: z.enum(["write", "flush", "compact"]),
        /** write: the key inserted into the memtable. */
        key: z.string().min(1).max(10).optional(),
        /** write: true if this is a delete marker (tombstone), not a value write. */
        tombstone: z.boolean().default(false),
        /** flush/compact: source level (flush's implicit source is the memtable). */
        fromLevel: z.number().int().min(0).max(3).optional(),
        /** flush/compact: the level the resulting SSTable lands in (defaults to fromLevel+1 for compact, 0 for flush). */
        toLevel: z.number().int().min(0).max(3).optional(),
        /** compact: ids of the SSTables merged away this beat (same level = size-tiered, different levels = leveled). */
        fileIds: z.array(z.string().min(1).max(12)).max(6).default([]),
        /** flush/compact: id of the new SSTable this step produces. */
        resultId: z.string().min(1).max(12).optional(),
        /** compact: keys the merged SSTable ends up holding. */
        keys: z.array(z.string().min(1).max(10)).max(8).default([]),
        /** compact: tombstones permanently removed during this merge. */
        droppedTombstones: z.number().int().min(0).max(6).default(0),
        say,
      })
    )
    .min(2)
    .max(14),
});
const vdomDiffScene = z.object({
  kind: z.literal("vdom_diff"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Component tree; parent links only — layout is automatic (see "tree"). */
  nodes: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(20),
        parent: id.nullable().optional(),
        icon,
      })
    )
    .min(2)
    .max(14),
  /** One beat per step. `render` mounts a node plainly; `add`/`remove`/`update`
   *  colour it green/red/yellow for THIS beat only (diffing), with a +/-/~
   *  badge. `drill` animates a "props" token from an ancestor down through
   *  every intermediate node to a descendant (prop drilling / lifting state up). */
  steps: z
    .array(
      z.object({
        render: z.array(id).default([]),
        add: z.array(id).default([]),
        remove: z.array(id).default([]),
        update: z.array(id).default([]),
        drill: z.object({ from: id, to: id }).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});
const flamegraphScene = z.object({
  kind: z.literal("flamegraph"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** "flame" stacks rows by call-stack depth (siblings share a row, callees
   *  nest below) — a blocking main-thread task or a React render tree.
   *  "waterfall" gives each bar its own row in authored order — a request
   *  waterfall / network panel. */
  mode: z.enum(["flame", "waterfall"]).default("waterfall"),
  /** Total timeline span the bars are plotted against. */
  totalMs: z.number().min(1).max(600000),
  unitLabel: z.string().min(1).max(6).default("ms"),
  /** Bars at/above this duration auto-tint as slow/blocking unless a bar sets its own `tone`. */
  warnAtMs: z.number().min(0).max(600000).optional(),
  bars: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(28),
        /** Call-stack/nesting depth (0 = root). In waterfall mode, a depth
         *  increase from the previous row is read as "waits on" that row. */
        depth: z.number().int().min(0).max(8).default(0),
        startMs: z.number().min(0),
        durMs: z.number().min(1),
        tone: z.enum(["normal", "warn", "good"]).optional(),
        say,
      })
    )
    .min(1)
    .max(14),
});
const eventLoopScene = z.object({
  kind: z.literal("event_loop"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** The hub's own label, e.g. "event loop" / "reactor". */
  loopLabel: z.string().min(1).max(20).default("event loop"),
  tasks: z.array(z.object({ id, label: z.string().min(1).max(20), icon })).min(2).max(6),
  /** One beat per step. `run` sends the single token to taskId (any other
   *  running task implicitly returns to ready); `await` suspends taskId to
   *  the dashed waiting arc; `resume` returns it to the ready ring;
   *  `done` retires it. `blocking:true` on a `run`/`await` step freezes the
   *  loop's spin and pings every ready task, dramatizing a synchronous call
   *  (e.g. time.sleep) starving the one thread of control. */
  steps: z
    .array(
      z.object({
        taskId: id,
        action: z.enum(["run", "await", "resume", "done"]),
        blocking: z.boolean().default(false),
        detail: z.string().max(28).optional(),
        say,
      })
    )
    .min(2)
    .max(14),
});

const domEventFlowScene = z.object({
  kind: z.literal("dom_event_flow"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  eventLabel: z.string().min(1).max(24).default("click"),
  delegateAt: id.optional(),
  synthetic: z.boolean().default(false),
  nodes: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(20),
        parent: id.optional(),
        icon,
        portal: z.boolean().default(false),
      })
    )
    .min(2)
    .max(7),
  targetId: id,
  steps: z
    .array(
      z.object({
        nodeId: id,
        phase: z.enum(["capture", "target", "bubble"]),
        say,
      })
    )
    .min(2)
    .max(13),
});
const commitDagScene = z.object({
  kind: z.literal("commit_dag"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** The full commit DAG declared up front; steps only reveal/annotate it. */
  commits: z
    .array(
      z.object({
        id,
        /** 0-2 parent commit ids; 2 parents renders as a curved merge join. */
        parents: z.array(id).max(2).default([]),
        /** Branch lane: 0 = first lane (e.g. main), higher = other branches. */
        lane: z.number().int().min(0).max(5),
        label: z.string().min(1).max(14),
      })
    )
    .min(2)
    .max(16),
  steps: z
    .array(
      z.object({
        /** Commit ids that pop into view this beat. */
        reveal: z.array(id).max(6).default([]),
        /** A new named pointer created/first shown this beat (e.g. `git branch`). */
        newRef: z.object({ name: z.string().min(1).max(16), at: id }).optional(),
        /** An existing ref re-pointed this beat (fast-forward, merge, rebase finish). */
        moveRef: z.object({ ref: z.string().min(1).max(16), to: id }).optional(),
        /** Where HEAD points this beat: a ref name (attached) or a commit id (detached). Holds until changed. */
        head: z.string().max(16).optional(),
        /** Commit ids to render as rewritten-away / orphaned history (rebase). */
        fade: z.array(id).max(8).default([]),
        /** Small caption badge for this beat only, e.g. "FAST-FORWARD", "3-WAY MERGE", "REBASING", "DETACHED HEAD". */
        note: z.string().max(22).optional(),
        say,
      })
    )
    .min(1)
    .max(12),
});
const partitionedLogScene = z.object({
  kind: z.literal("partitioned_log"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Horizontal lanes (a topic's partitions); each lane's tail grows rightward as records append. */
  partitions: z.array(z.object({ id, label: z.string().min(1).max(16) })).min(1).max(6),
  /** Independent read-heads. `offset` is the record index (0 = oldest) this consumer has read up to. */
  consumers: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(16),
        partitionId: id,
        offset: z.number().int().min(0).default(0),
      })
    )
    .max(6)
    .default([]),
  steps: z
    .array(
      z.object({
        op: z.enum(["append", "advance", "rebalance"]),
        /** append: the lane the new record lands in. */
        partitionId: id.optional(),
        /** append: the record's short label, e.g. "ord:42" (falls back to an auto index if omitted). */
        value: z.string().min(1).max(8).optional(),
        /** advance/rebalance: which consumer moves. */
        consumerId: id.optional(),
        /** advance: offset the consumer's read-head jumps to on its CURRENT lane.
         *  rebalance: offset it resumes from on its NEW lane (default 0). */
        toOffset: z.number().int().min(0).optional(),
        /** rebalance: REQUIRED — the lane the consumer is reassigned to; this is what
         *  triggers the visible stop-the-world pause + banner. */
        toPartitionId: id.optional(),
        say,
      })
    )
    .min(2)
    .max(14),
});
const containerSandboxScene = z.object({
  kind: z.literal("container_sandbox"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  processLabel: z.string().min(1).max(24).default("App process"),
  /** Host resources shown as chips; `shared` keeps a resource visible to a sibling
   *  process even after isolation (e.g. containers in one pod sharing net). */
  resources: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(20),
        kind: z.enum(["pid", "net", "mount", "user", "ipc", "hostname"]).default("pid"),
        shared: z.boolean().default(false),
      })
    )
    .min(2)
    .max(7),
  cgroupLimit: z
    .object({ label: z.string().min(1).max(20).default("Memory"), capPct: z.number().min(10).max(100).default(60) })
    .optional(),
  steps: z
    .array(
      z.object({
        kind: z.enum(["isolate", "limit"]).default("isolate"),
        /** Resource ids this beat hides from the process (cumulative; once hidden it stays hidden). */
        hide: z.array(id).max(7).default([]),
        /** For "limit" steps: the cgroup meter animates toward this percentage. */
        usagePct: z.number().min(0).max(100).optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});
const controlLoopScene = z.object({
  kind: z.literal("control_loop"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** The node that watches and drives actual -> desired; its gear glyph keeps turning. */
  controllerLabel: z.string().min(1).max(20).default("Controller"),
  /** Static declared entities compared each loop iteration (left=desired, right=actual). */
  items: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(22),
        desiredValue: z.string().min(1).max(18),
        icon,
      })
    )
    .min(2)
    .max(6),
  /** One loop iteration per beat: either the actual side drifts away from desired
   *  (red) or the controller reconciles it back to match (green). */
  steps: z
    .array(
      z.object({
        itemId: id,
        action: z.enum(["drift", "reconcile"]),
        actualValue: z.string().min(1).max(18),
        say,
      })
    )
    .min(1)
    .max(10),
});
const telemetryTraceScene = z.object({
  kind: z.literal("telemetry_trace"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Total timeline span every span's startMs/durMs is plotted against. */
  totalMs: z.number().min(1).max(600000),
  unitLabel: z.string().min(1).max(6).default("ms"),
  spans: z
    .array(
      z.object({
        id,
        /** Parent span id — omit for the root (the entry gateway). */
        parentId: id.optional(),
        service: z.string().min(1).max(24),
        kind: z.enum(["gateway", "service", "db", "cache", "queue", "external"]).default("service"),
        startMs: z.number().min(0),
        durMs: z.number().min(1),
        status: z.enum(["ok", "error"]).default("ok"),
        say,
      })
    )
    .min(1)
    .max(14),
  /** Trailing beat: a sampling/SLA verdict over the whole trace — spans glow
   *  kept (green) or dim dropped (amber) while a one-line reason banner reads
   *  out, e.g. tail sampling keeping a trace because it contains an error. */
  verdict: z
    .object({
      outcome: z.enum(["keep", "drop"]),
      reason: z.string().min(2).max(60),
      say,
    })
    .optional(),
});
const spatialIndexScene = z.object({
  kind: z.literal("spatial_index"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Max points a quadrant holds before it splits into 4 sub-quadrants — the real
   *  quadtree insert threshold. The painter runs the actual insert/split algorithm
   *  itself from steps[].points every frame; it never takes hand-authored split geometry. */
  capacity: z.number().int().min(1).max(4).default(1),
  steps: z
    .array(
      z.object({
        /** Points inserted this beat, normalized to a 0-100 x 0-100 square region. */
        points: z
          .array(
            z.object({
              id,
              x: z.number().min(0).max(100),
              y: z.number().min(0).max(100),
              label: z.string().max(10).optional(),
            })
          )
          .max(6)
          .default([]),
        /** Optional nearby-search query: highlights the cell containing (x,y) plus every
         *  cell within `radius` — the "proximity search" moment (geohash/H3 nearby lookup). */
        query: z
          .object({
            x: z.number().min(0).max(100),
            y: z.number().min(0).max(100),
            radius: z.number().min(2).max(60).default(18),
          })
          .optional(),
        say,
      })
    )
    .min(1)
    .max(9),
});

const objectHeapScene = z.object({
  kind: z.literal("object_heap"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Variable name tags in the left/top "stack" column; steps bind them to heap objects. */
  vars: z.array(z.object({ id, name: z.string().min(1).max(16) })).min(1).max(8),
  /** Distinct heap-allocated blocks on the right/bottom. `mutable` draws an inner border
   *  cue for immutable objects (ints/strings/tuples) vs plain mutable ones (lists/dicts). */
  objects: z
    .array(z.object({ id, label: z.string().min(1).max(16), icon, mutable: z.boolean().default(true) }))
    .min(1)
    .max(8),
  /** One beat per step. `bind` (re)points a name at an object: pointing it at a brand-new
   *  object id already declared in `objects` is a deep copy (fresh block, refcount 1); pointing
   *  it at an object another name already holds is a shallow copy/alias (same block, refcount
   *  ticks up). `link`/`unlink` are object->object references (containers, cyclic self-refs)
   *  that also count toward the pointee's live refcount. `mutate` flashes an object and every
   *  arrow feeding it — the "every alias sees the change" moment. `collect` frees objects
   *  (fades them, even a doomed reference cycle) once GC actually runs. */
  steps: z
    .array(
      z.object({
        bind: z.object({ name: id, obj: id }).optional(),
        link: z.object({ from: id, to: id }).optional(),
        unlink: z.object({ from: id, to: id }).optional(),
        mutate: id.optional(),
        collect: z.array(id).max(4).default([]),
        note: z.string().max(60).optional(),
        say,
      })
    )
    .min(1)
    .max(10),
});
const vectorSpaceScene = z.object({
  kind: z.literal("vector_space"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  mode: z.enum(["2d", "3d"]).default("2d"),
  xLabel: z.string().max(14).optional(),
  yLabel: z.string().max(14).optional(),
  points: z
    .array(
      z.object({
        id,
        label: z.string().max(20).optional(),
        cluster: z.string().min(1).max(16),
        x: z.number().min(-60).max(60),
        y: z.number().min(-60).max(60),
        z: z.number().min(-60).max(60).optional(),
      })
    )
    .min(2)
    .max(14),
  boundary: z
    .object({
      x1: z.number().min(-60).max(60),
      y1: z.number().min(-60).max(60),
      x2: z.number().min(-60).max(60),
      y2: z.number().min(-60).max(60),
      margin: z.number().min(0).max(20).default(0),
    })
    .optional(),
  distances: z
    .array(z.object({ from: id, to: id, label: z.string().max(16).optional() }))
    .max(6)
    .default([]),
  steps: z
    .array(
      z.object({
        reveal: z.array(id).default([]),
        showBoundary: z.boolean().default(false),
        showDistances: z.array(z.number().int().min(0)).default([]),
        focus: id.optional(),
        say,
      })
    )
    .min(1)
    .max(8),
});
const neuralNetworkScene = z.object({
  kind: z.literal("neural_network"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  /** Ordered layers (input -> hidden(s) -> output), auto-arranged into
   *  columns of node circles (rows in 9:16), each fully connected to the next. */
  layers: z
    .array(
      z.object({
        size: z.number().int().min(1).max(6),
        label: z.string().max(20).optional(),
        /** e.g. "ReLU", "softmax", "Q·Kᵀ" — shown under the layer's label. */
        activation: z.string().max(16).optional(),
      })
    )
    .min(2)
    .max(6),
  /** One step per beat. `forward` activates `layerIndex` (pulsing the edges
   *  feeding it, left-to-right / top-to-bottom in 9:16); `backward` colors the
   *  edges between `layerIndex` and `layerIndex+1` for a gradient, animated in
   *  reverse. `layerIndex = layers.length-1` on a backward step just
   *  highlights the output layer itself (the loss, before any weight is touched). */
  steps: z
    .array(
      z.object({
        direction: z.enum(["forward", "backward"]).default("forward"),
        layerIndex: z.number().int().min(0),
        label: z.string().max(24).optional(),
        say,
      })
    )
    .min(1)
    .max(12),
});
const matrixConvolutionScene = z.object({
  kind: z.literal("matrix_convolution"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  inputRows: z.number().int().min(2).max(8),
  inputCols: z.number().int().min(2).max(8),
  kernelRows: z.number().int().min(1).max(5),
  kernelCols: z.number().int().min(1).max(5),
  outputRows: z.number().int().min(1).max(8),
  outputCols: z.number().int().min(1).max(8),
  /** Flattened row-major input grid values (length inputRows*inputCols). */
  inputValues: z.array(z.string().max(5)).min(4).max(64),
  /** Flattened row-major kernel/filter weights (length kernelRows*kernelCols). */
  kernelValues: z.array(z.string().max(5)).min(1).max(25),
  /** One kernel position -> one output cell revealed per beat. */
  steps: z
    .array(
      z.object({
        /** Top-left input row/col the kernel window covers this step. */
        atRow: z.number().int().min(0),
        atCol: z.number().int().min(0),
        /** The output feature-map cell this position writes. */
        outRow: z.number().int().min(0),
        outCol: z.number().int().min(0),
        /** Elementwise products under the window, row-major (length kernelRows*kernelCols). */
        products: z.array(z.string().max(6)).min(1).max(25),
        /** The summed value written into the output cell. */
        result: z.string().max(6),
        say,
      })
    )
    .min(1)
    .max(12),
});
const consensusQuorumScene = z.object({
  kind: z.literal("consensus_quorum"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  nodes: z
    .array(
      z.object({
        id,
        label: z.string().min(1).max(14),
        role: z.enum(["leader", "follower"]).default("follower"),
      })
    )
    .min(3)
    .max(7),
  quorumSize: z.number().int().min(2).max(7).optional(),
  steps: z
    .array(
      z.object({
        kind: z.enum(["propose", "ack", "commit", "fail", "reset"]),
        from: id.optional(),
        ackFrom: z.array(id).max(6).default([]),
        note: z.string().min(1).max(24).optional(),
        say,
      })
    )
    .min(2)
    .max(9),
});

export const sceneSchema = z.discriminatedUnion("kind", [
  bigtextScene,
  bulletsScene,
  codeScene,
  terminalScene,
  diagramScene,
  treeScene,
  mindmapScene,
  orbitScene,
  iso3dScene,
  compareScene,
  questionScene,
  timelineScene,
  statScene,
  stepsScene,
  quizScene,
  vocabScene,
  chartScene,
  quoteScene,
  mythfactScene,
  tableScene,
  traceScene,
  memgridScene,
  callstackScene,
  lifelineScene,
  bitsScene,
  browserframeScene,
  cycleScene,
  statemachineScene,
  decisionScene,
  chainScene,
  pipelineScene,
  ledgerScene,
  sankeyScene,
  gaugeScene,
  pictogramScene,
  raceScene,
  schematicScene,
  terrainScene,
  zoomladderScene,
  dialogueScene,
  graphwalkScene,
  matrixScene,
  threadsScene,
  queueflowScene,
  cipherScene,
  circuitScene,
  formulaScene,
  curvesScene,
  bucketsScene,
  probabilityScene,
  basketScene,
  radarScene,
  bodymapScene,
  constellationScene,
  dayclockScene,
  storyboardScene,
  bracketScene,
  showdownScene,
  skylineScene,
  calendarScene,
  geomapScene,
  numberlineScene,
  geometryScene,
  moleculeScene,
  layersScene,
  trafficflowScene,
  eventbusScene,
  globe3dScene,
  dpTableFillScene,
  sysarchScene,
  slidingwindowScene,
  trendgraphScene,
  topologyScene,
  scrollScene,
  tacticalMapScene,
  architectureBlueprintScene,
  packetDeliveryScene,
  codediffScene,
  parliamentArcScene,
  serverRackScene,
  jigsawPuzzleScene,
  dominoCascadeScene,
  sheetMusicScene,
  canvasRevealScene,
  scalecompareScene,
  fluidflowScene,
  ecosystemWebScene,
  turingTapeScene,
  gridFloodScene,
  hashRingScene,
  recursionTreeScene,
  tokenExchangeScene,
  coinStackScene,
  btreeIndexScene,
  lsmCompactionScene,
  vdomDiffScene,
  flamegraphScene,
  eventLoopScene,
  domEventFlowScene,
  commitDagScene,
  partitionedLogScene,
  containerSandboxScene,
  controlLoopScene,
  telemetryTraceScene,
  spatialIndexScene,
  objectHeapScene,
  vectorSpaceScene,
  neuralNetworkScene,
  matrixConvolutionScene,
  consensusQuorumScene,
]);

export type Scene = z.infer<typeof sceneSchema>;
export type SceneKind = Scene["kind"];

/**
 * `sceneBeats` / `introBeatCount` live in `scene-beats.ts` (527 lines of beat
 * analysis, not schema) and are re-exported here so the 97 painters and ten
 * other modules that import them from `@/studio/schema` keep working.
 */
export { sceneBeats, introBeatCount } from "./scene-beats.ts";

const SHORT_SCENES = { min: 4, max: 8 } as const;
const LONG_SCENES = { min: 14, max: 32 } as const;

/** Video length IS narration length; scripts outside these word budgets get a repair round. */
export const NARRATION_BUDGET = {
  short: { min: 110, max: 240 },
  long: { min: 850, max: 1900 },
} as const;

/**
 * Index of the first scene that is a "bigtext" immediately followed by another
 * "bigtext", or -1. A bare section card with no teaching scene beneath it teaches
 * nothing; a legitimate recap is a single card before the ending question, which
 * never lands two side by side. Soft-checked in the generate route (drives a
 * repair round) rather than hard-rejected, so a stubborn script still ships.
 */
export function firstAdjacentBigtext(script: SceneScript): number {
  for (let i = 0; i + 1 < script.scenes.length; i++) {
    if (script.scenes[i].kind === "bigtext" && script.scenes[i + 1].kind === "bigtext") return i;
  }
  return -1;
}

/**
 * A "vocab" example must actually use the word it teaches — models often write
 * examples that only paraphrase the meaning ("everyone knew but nobody said it"
 * for "elephant in the room"), which defeats the auto-highlight and teaches
 * nothing. Returns the id of the first vocab scene whose examples ALL omit the
 * word, or null. Matched loosely (case-insensitive, ignoring "the "/"a " and
 * trailing punctuation) so inflections like borrow/borrowed still count only
 * when the stem appears. Soft-checked in the generate route.
 */
export function vocabExampleMissingWord(script: SceneScript): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (const scene of script.scenes) {
    if (scene.kind !== "vocab") continue;
    const word = norm(scene.word).replace(/^(the|a|an) /, "");
    const stem = word.split(" ")[0]?.slice(0, 5) ?? word;
    const key = word.includes(" ") ? word : stem; // phrase: match whole; single word: match stem
    if (!key) continue;
    const anyUses = scene.examples.some((e) => norm(e.text).includes(key));
    if (!anyUses) return scene.id;
  }
  return null;
}

/**
 * The ending "question" is meant to be the finale, but longs keep appending a
 * "thank you for watching / stay curious" bigtext outro after it. Returns the
 * index of a bigtext scene that appears after the last question scene, or -1.
 * Soft-checked in the generate route (drives a repair, never hard-fails).
 */
export function bigtextAfterLastQuestion(script: SceneScript): number {
  let lastQ = -1;
  script.scenes.forEach((s, i) => {
    if (s.kind === "question") lastQ = i;
  });
  if (lastQ < 0) return -1;
  for (let i = lastQ + 1; i < script.scenes.length; i++) {
    if (script.scenes[i].kind === "bigtext") return i;
  }
  return -1;
}

/**
 * The opening beat is the retention decision. Models fall back on a few tired
 * crutches ("Have you ever wondered", "Think you need X? / You think X? Wrong")
 * until every video sounds identical. Returns the offending opener if the first
 * beat uses one, else null. Soft-checked so it drives a repair, never hard-fails.
 */
const FORMULAIC_OPENER = /^\s*(have you ever|did you know|think you|you think|imagine (that|a |you)|picture this|let'?s (talk|dive|explore)|क्या आप जानते|क्या आपने कभी|कल्पना कीज)/i;
export function firstBeatFormulaic(script: SceneScript): string | null {
  const first = script.scenes[0];
  if (!first) return null;
  const opener = sceneBeats(first)[0]?.text ?? "";
  return FORMULAIC_OPENER.test(opener) ? opener.slice(0, 60) : null;
}

export function narrationWordCount(script: SceneScript): number {
  let words = 0;
  for (const scene of script.scenes) {
    for (const { text } of sceneBeats(scene)) {
      words += text.trim().split(/\s+/).filter(Boolean).length;
    }
  }
  return words;
}

/**
 * A 9:16 Short covers its bottom quarter and right edge with the YouTube UI, so a
 * dense diagram/table/chart overflows behind it (#28). Returns the first over-dense
 * scene in a short, or null. Soft-checked in the generate route (drives a repair,
 * never hard-fails) so a legitimately busy short still ships.
 */
export function shortSceneOverdense(script: SceneScript): { id: string; detail: string } | null {
  if (script.format !== "short") return null;
  for (const s of script.scenes) {
    if (s.kind === "diagram" && s.nodes.length > 5) return { id: s.id, detail: `diagram has ${s.nodes.length} nodes (keep <= 5 in a 9:16 short)` };
    if ((s.kind === "tree" || s.kind === "mindmap") && s.nodes.length > 6) return { id: s.id, detail: `${s.kind} has ${s.nodes.length} nodes (keep <= 6 in a short)` };
    if (s.kind === "table" && s.rows.length > 5) return { id: s.id, detail: `table has ${s.rows.length} rows (keep <= 5 in a short)` };
    if (s.kind === "chart" && s.items.length > 5) return { id: s.id, detail: `chart has ${s.items.length} items (keep <= 5 in a short)` };
  }
  return null;
}

/** Keys present in `raw` but absent from `parsed` — i.e. dropped by zod. */
function extraKeys(raw: unknown, parsed: unknown, path: (string | number)[] = []): string[] {
  const out: string[] = [];
  if (raw && typeof raw === "object" && !Array.isArray(raw) && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const r = raw as Record<string, unknown>;
    const p = parsed as Record<string, unknown>;
    for (const k of Object.keys(r)) {
      if (!(k in p)) out.push([...path, k].join("."));
      else out.push(...extraKeys(r[k], p[k], [...path, k]));
    }
  } else if (Array.isArray(raw) && Array.isArray(parsed)) {
    for (let i = 0; i < Math.min(raw.length, parsed.length); i++) out.push(...extraKeys(raw[i], parsed[i], [...path, i]));
  }
  return out;
}

/**
 * Properties the model invented that zod silently stripped (#13/#26): a fake
 * "color":"red" or a node "z":5 parses clean and the mistake vanishes. This diffs
 * the raw (post-sanitize, pre-validate) object against the validated one to surface
 * what was dropped, per scene. Reported as a non-fatal warning, not an error —
 * zod already removed the key, so the scene renders; surfacing it aids prompt tuning.
 * Ignores the schema defaults zod ADDS (those are parsed-only, never raw-only).
 */
export function unknownSceneKeys(rawScenes: unknown, parsed: SceneScript): { id: string; keys: string[] }[] {
  if (!Array.isArray(rawScenes)) return [];
  const out: { id: string; keys: string[] }[] = [];
  parsed.scenes.forEach((scene, i) => {
    const keys = extraKeys(rawScenes[i], scene);
    if (keys.length) out.push({ id: scene.id, keys });
  });
  return out;
}

export const metaSchema = z.object({
  title: z.string().min(10).max(95),
  description: z.string().min(40).max(3500),
  tags: z.array(z.string().min(2).max(30)).min(4).max(15),
  hashtags: z.array(z.string().regex(/^#[A-Za-z0-9]+$/)).min(3).max(8),
});
export type VideoMeta = z.infer<typeof metaSchema>;

export const CONTENT_LANGS = ["en", "hi"] as const;
export type ContentLang = (typeof CONTENT_LANGS)[number];

export const sceneScriptSchema = z
  .object({
    format: z.enum(["short", "long"]),
    lang: z.enum(CONTENT_LANGS).default("en"),
    subject: z.string().min(2).max(60),
    module: z.string().min(2).max(60),
    submodule: z.string().min(2).max(60),
    topic: z.string().min(3).max(120),
    scenes: z.array(sceneSchema),
    /**
     * YouTube chapters, declared at the video level instead of inferred from
     * `bigtext` scenes. Chapters used to be derived by `page.tsx` from every
     * bigtext, which is why the prompt had to mandate 4-6 "section card" title
     * slides to get them — the single biggest cause of the slide-deck feel. A
     * section now points at the id of the teaching scene that OPENS it, so the
     * chapter exists without a card sitting in front of it.
     */
    sections: z
      .array(
        z.object({
          atSceneId: id,
          title: z.string().min(2).max(50),
        })
      )
      .max(10)
      .optional(),
    meta: metaSchema,
  })
  .superRefine((script, ctx) => {
    const range = script.format === "short" ? SHORT_SCENES : LONG_SCENES;
    if (script.scenes.length < range.min || script.scenes.length > range.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${script.format} needs ${range.min}-${range.max} scenes, got ${script.scenes.length}`,
        path: ["scenes"],
      });
    }
    const ids = new Set<string>();
    for (const s of script.scenes) {
      if (ids.has(s.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate scene id "${s.id}"`, path: ["scenes"] });
      }
      ids.add(s.id);
    }
    for (const [i, s] of script.scenes.entries()) {
      if (s.kind === "diagram") {
        const nodeIds = new Set(s.nodes.map((n) => n.id));
        for (const a of s.arrows) {
          if (!nodeIds.has(a.from) || !nodeIds.has(a.to)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `arrow ${a.from}->${a.to} references missing node`,
              path: ["scenes", i, "arrows"],
            });
          }
        }
        const stepIds = s.steps.flatMap((st) => [...st.reveal, ...st.highlight, ...st.move.map((m) => m.node)]);
        for (const sid of stepIds) {
          if (!nodeIds.has(sid)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `step references missing node "${sid}"`,
              path: ["scenes", i, "steps"],
            });
          }
        }
      }
      if (s.kind === "tree" || s.kind === "mindmap") {
        const nodeIds = new Set(s.nodes.map((n) => n.id));
        const roots = s.nodes.filter((n) => n.parent === null || n.parent === undefined);
        if (roots.length !== 1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `tree needs exactly one root (parent null), got ${roots.length}`, path: ["scenes", i, "nodes"] });
        }
        for (const n of s.nodes) {
          if (n.parent != null && !nodeIds.has(n.parent)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `tree node "${n.id}" parent "${n.parent}" not found`, path: ["scenes", i, "nodes"] });
          }
        }
        for (const st of s.steps) {
          for (const r of st.reveal) {
            if (!nodeIds.has(r)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `tree reveal references missing node "${r}"`, path: ["scenes", i, "steps"] });
            }
          }
        }
      }
      if (s.kind === "code") {
        const lineCount = s.code.split("\n").length;
        for (const f of s.focusLines) {
          if (f > lineCount) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `focusLine ${f} beyond ${lineCount} lines`,
              path: ["scenes", i, "focusLines"],
            });
          }
        }
        let expected = 1;
        for (const [k, seg] of s.segments.entries()) {
          if (seg.fromLine !== expected || seg.toLine < seg.fromLine) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `segments must be contiguous from line 1: segment ${k + 1} should start at line ${expected}`,
              path: ["scenes", i, "segments"],
            });
            break;
          }
          expected = seg.toLine + 1;
        }
        if (expected !== lineCount + 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `segments must cover all ${lineCount} lines (covered through ${expected - 1})`,
            path: ["scenes", i, "segments"],
          });
        }
      }
      if (s.kind === "quiz") {
        const correct = s.options.filter((o) => o.correct).length;
        if (correct !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `quiz must have exactly one correct option, got ${correct}`,
            path: ["scenes", i, "options"],
          });
        }
      }
      const issue = (message: string, ...path: (string | number)[]) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["scenes", i, ...path] });
      if (s.kind === "trace") {
        const lines = s.code.length;
        const cells = s.cells.length;
        s.steps.forEach((st, k) => {
          if (st.line > lines) issue(`step ${k + 1} line ${st.line} beyond ${lines} code lines`, "steps", k);
          const idxs = [
            ...st.pointers.map((p) => p.index),
            ...st.mark.map((m) => m.index),
            ...(st.swap ? [st.swap.a, st.swap.b] : []),
          ];
          for (const idx of idxs) {
            if (idx >= cells) issue(`step ${k + 1} references cell ${idx} beyond ${cells} cells`, "steps", k);
          }
        });
      }
      if (s.kind === "memgrid") {
        const cells = s.cells.length;
        s.steps.forEach((st, k) => {
          const idxs = [
            ...st.write.map((w) => w.index),
            ...st.free,
            ...st.highlight,
            ...(st.pointer ? [st.pointer.index] : []),
          ];
          for (const idx of idxs) {
            if (idx >= cells) issue(`step ${k + 1} references cell ${idx} beyond ${cells} cells`, "steps", k);
          }
        });
      }
      if (s.kind === "callstack") {
        let depth = 0;
        s.steps.forEach((st, k) => {
          if (st.op === "push") {
            if (!st.frame) issue(`step ${k + 1} push needs a frame label`, "steps", k);
            depth++;
          } else {
            depth--;
            if (depth < 0) issue(`step ${k + 1} pops an empty stack`, "steps", k);
          }
        });
      }
      if (s.kind === "lifeline") {
        const actorIds = new Set(s.actors.map((a) => a.id));
        s.messages.forEach((m, k) => {
          if (!actorIds.has(m.from) || !actorIds.has(m.to))
            issue(`message ${m.from}->${m.to} references missing actor`, "messages", k);
          if (m.from === m.to) issue(`message ${k + 1} cannot go from an actor to itself`, "messages", k);
        });
      }
      if (s.kind === "bits") {
        s.steps.forEach((st, k) => {
          const needsValue = st.op === "set" || st.op === "and" || st.op === "or" || st.op === "xor";
          if (needsValue && (!st.value || st.value.length !== s.width))
            issue(`step ${k + 1} op "${st.op}" needs a ${s.width}-bit value`, "steps", k);
        });
      }
      if (s.kind === "browserframe") {
        const blockIds = new Set(s.blocks.map((b) => b.id));
        s.steps.forEach((st, k) => {
          const refs = [...st.show, ...st.paint, ...(st.shift ? [st.shift.block] : [])];
          for (const r of refs) {
            if (!blockIds.has(r)) issue(`step ${k + 1} references missing block "${r}"`, "steps", k);
          }
        });
      }
      if (s.kind === "statemachine" || s.kind === "decision") {
        const nodeIds = new Set((s.kind === "statemachine" ? s.states : s.nodes).map((n) => n.id));
        s.edges.forEach((e, k) => {
          if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) issue(`edge ${e.from}->${e.to} references missing node`, "edges", k);
        });
        const edgeKeys = new Set(s.edges.map((e) => `${e.from}>${e.to}`));
        let cur = (s.kind === "statemachine" ? s.states : s.nodes)[0]?.id;
        s.steps.forEach((st, k) => {
          if (!nodeIds.has(st.go)) {
            issue(`step ${k + 1} goes to missing node "${st.go}"`, "steps", k);
            return;
          }
          if (cur && st.go !== cur && !edgeKeys.has(`${cur}>${st.go}`))
            issue(`step ${k + 1} walks ${cur}->${st.go} but no such edge exists`, "steps", k);
          cur = st.go;
        });
      }
      if (s.kind === "ledger") {
        const partyIds = new Set(s.parties.map((p) => p.id));
        s.transfers.forEach((t, k) => {
          if (!partyIds.has(t.from) || !partyIds.has(t.to))
            issue(`transfer ${t.from}->${t.to} references missing party`, "transfers", k);
          if (t.from === t.to) issue(`transfer ${k + 1} cannot pay itself`, "transfers", k);
        });
      }
      if (s.kind === "sankey") {
        const sum = s.branches.reduce((acc, b) => acc + b.value, 0);
        if (sum > s.source.total * 1.02)
          issue(`branch values sum to ${sum}, more than the source total ${s.source.total}`, "branches");
      }
      if (s.kind === "gauge") {
        if (s.min >= s.max) issue(`gauge min ${s.min} must be below max ${s.max}`, "min");
        let prev = s.min;
        s.zones.forEach((zn, k) => {
          if (zn.upTo <= prev || zn.upTo > s.max) issue(`zones must ascend within (min, max]`, "zones", k);
          prev = zn.upTo;
        });
        s.readings.forEach((r, k) => {
          if (r.value < s.min || r.value > s.max)
            issue(`reading ${r.value} outside gauge range ${s.min}-${s.max}`, "readings", k);
        });
      }
      if (s.kind === "pictogram") {
        const sum = s.groups.reduce((acc, g) => acc + g.count, 0);
        if (sum > s.total) issue(`group counts sum to ${sum}, more than total ${s.total}`, "groups");
        if (s.majorityAt !== undefined && s.majorityAt > s.total)
          issue(`majorityAt ${s.majorityAt} beyond total ${s.total}`, "majorityAt");
      }
      if (s.kind === "race") {
        s.checkpoints.forEach((c, k) => {
          if (c.values.length !== s.racers.length)
            issue(`checkpoint "${c.when}" has ${c.values.length} values for ${s.racers.length} racers`, "checkpoints", k);
        });
      }
      if (s.kind === "schematic") {
        const partIds = new Set(s.parts.map((p) => p.id));
        s.steps.forEach((st, k) => {
          for (const r of [...st.reveal, ...st.highlight]) {
            if (!partIds.has(r)) issue(`step ${k + 1} references missing part "${r}"`, "steps", k);
          }
        });
      }
      if (s.kind === "graphwalk") {
        const nodeIds = new Set(s.nodes.map((n) => n.id));
        s.edges.forEach((e, k) => {
          if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) issue(`edge ${e.from}->${e.to} references missing node`, "edges", k);
        });
        s.steps.forEach((st, k) => {
          for (const r of [...st.visit, ...st.frontier, ...st.path, ...st.dist.map((d) => d.node)]) {
            if (!nodeIds.has(r)) issue(`step ${k + 1} references missing node "${r}"`, "steps", k);
          }
        });
      }
      if (s.kind === "matrix") {
        s.steps.forEach((st, k) => {
          for (const c of st.set) {
            if (c.r >= s.rows || c.c >= s.cols) issue(`step ${k + 1} cell (${c.r},${c.c}) outside ${s.rows}x${s.cols} grid`, "steps", k);
          }
          if (st.sweep) {
            const lim = st.sweep.kind === "row" ? s.rows : st.sweep.kind === "col" ? s.cols : s.rows + s.cols - 1;
            if (st.sweep.index >= lim) issue(`step ${k + 1} ${st.sweep.kind} sweep index ${st.sweep.index} out of range`, "steps", k);
          }
        });
        if (s.rowLabels.length && s.rowLabels.length !== s.rows) issue(`rowLabels must be empty or length ${s.rows}`, "rowLabels");
        if (s.colLabels.length && s.colLabels.length !== s.cols) issue(`colLabels must be empty or length ${s.cols}`, "colLabels");
      }
      if (s.kind === "threads") {
        const taskIds = new Set(s.tasks.map((t) => t.id));
        s.tasks.forEach((t, k) => {
          if (t.lane >= s.lanes.length) issue(`task "${t.label}" lane ${t.lane} beyond ${s.lanes.length} lanes`, "tasks", k);
        });
        s.steps.forEach((st, k) => {
          for (const r of [...st.reveal, ...st.clash]) {
            if (!taskIds.has(r)) issue(`step ${k + 1} references missing task "${r}"`, "steps", k);
          }
        });
      }
      if (s.kind === "cipher") {
        if (s.mode === "shift" && s.shift === undefined) issue(`shift-mode cipher needs a "shift" value`, "shift");
      }
      if (s.kind === "circuit") {
        const partIds = new Set(s.parts.map((p) => p.id));
        s.wires.forEach((wire, k) => {
          if (!partIds.has(wire.from) || !partIds.has(wire.to)) issue(`wire ${wire.from}->${wire.to} references missing part`, "wires", k);
        });
        s.steps.forEach((st, k) => {
          for (const r of [...st.close, ...st.on, ...st.highlight]) {
            if (!partIds.has(r)) issue(`step ${k + 1} references missing part "${r}"`, "steps", k);
          }
        });
      }
      if (s.kind === "basket") {
        const nYears = s.years.length;
        s.items.forEach((it, k) => {
          if (it.prices.length !== nYears) issue(`item "${it.label}" has ${it.prices.length} prices for ${nYears} years`, "items", k);
        });
      }
      if (s.kind === "radar") {
        const n = s.axes.length;
        s.entities.forEach((e, k) => {
          if (e.values.length !== n) issue(`entity "${e.label}" has ${e.values.length} values for ${n} axes`, "entities", k);
        });
      }
      if (s.kind === "probability") {
        s.spins.forEach((sp, k) => {
          if (sp.land >= s.segments.length) issue(`spin ${k + 1} lands on segment ${sp.land} beyond ${s.segments.length}`, "spins", k);
        });
      }
      if (s.kind === "constellation") {
        const ptIds = new Set(s.points.map((p) => p.id));
        s.steps.forEach((st, k) => {
          for (const c of st.connect) {
            if (!ptIds.has(c.a) || !ptIds.has(c.b)) issue(`step ${k + 1} connects missing point`, "steps", k);
          }
        });
      }
      if (s.kind === "bracket") {
        // Single-elimination: match count = contenders - 1; each winner index < the round's field size.
        if (s.matches.length !== s.contenders.length - 1)
          issue(`${s.contenders.length} contenders need exactly ${s.contenders.length - 1} matches, got ${s.matches.length}`, "matches");
      }
      if (s.kind === "calendar") {
        s.marks.forEach((m, k) => {
          if (m.from > m.to) issue(`mark "${m.label}" spans ${m.from}->${m.to} (from must be <= to; split a wrap-around into two)`, "marks", k);
        });
      }
      // Spatial integrity (#24): nodes on the 12x12 grid must stay in bounds and,
      // for diagram/browserframe, not share cells. Schematic parts MAY overlap on
      // purpose (a dome ON a wall), so they are bounds-checked only.
      if (s.kind === "diagram" || s.kind === "browserframe") {
        const field = s.kind === "diagram" ? "nodes" : "blocks";
        const items = (s.kind === "diagram" ? s.nodes : s.blocks) as ReadonlyArray<{
          id: string; x: number; y: number; w: number; h: number;
        }>;
        items.forEach((n, k) => {
          if (n.x + n.w > GRID) issue(`"${n.id}" runs off the grid horizontally (x ${n.x} + w ${n.w} > ${GRID})`, field, k);
          if (n.y + n.h > GRID) issue(`"${n.id}" runs off the grid vertically (y ${n.y} + h ${n.h} > ${GRID})`, field, k);
        });
        for (let a = 0; a < items.length; a++) {
          for (let b = a + 1; b < items.length; b++) {
            const p = items[a], q = items[b];
            if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h)
              issue(`"${p.id}" and "${q.id}" overlap — nodes on the ${GRID}x${GRID} grid must not share cells`, field);
          }
        }
      }
      if (s.kind === "schematic") {
        s.parts.forEach((p, k) => {
          if (p.x + p.w > GRID) issue(`part "${p.id}" runs off the grid horizontally (x ${p.x} + w ${p.w} > ${GRID})`, "parts", k);
          if (p.y + p.h > GRID) issue(`part "${p.id}" runs off the grid vertically (y ${p.y} + h ${p.h} > ${GRID})`, "parts", k);
        });
      }
      // Chronology (#10): a timeline must progress in time. Only enforced when EVERY
      // event carries a real 3-4 digit year (BCE negated); mixed era labels
      // ("Ancient", "5th century") are unparseable and skip the check to avoid false hits.
      if (s.kind === "timeline") {
        const parseYear = (w: string): number | null => {
          const nums = w.match(/\d{3,4}/g);
          if (!nums) return null;
          const val = parseInt(nums[nums.length - 1], 10);
          return /\b(bce|bc)\b/i.test(w) ? -val : val;
        };
        const years = s.events.map((e) => parseYear(e.when));
        if (years.every((y) => y !== null)) {
          for (let k = 1; k < years.length; k++) {
            if ((years[k] as number) < (years[k - 1] as number))
              issue(`events out of chronological order: "${s.events[k].when}" should not precede "${s.events[k - 1].when}"`, "events", k);
          }
        }
      }
    }
  });
export type SceneScript = z.infer<typeof sceneScriptSchema>;

/** Per-scene verification result from the exec route. */
export type VerifyResult = {
  sceneId: string;
  status: "verified" | "patched" | "failed" | "skipped";
  actualOutput?: string;
  detail?: string;
};

/**
 * Emphasis marker: `*word*` in a spoken beat.
 *
 * It replaces the old ALL-CAPS convention, which had two defects the prompt
 * acknowledged and did not solve (row 12.7): the capitals survived into the
 * on-screen caption, so the video shouted; and `normalizeSpeech` spells any
 * token in its 60-item acronym list letter by letter, so emphasising a short
 * word that happens to be on that list ("the OS decides") got it spelled out.
 *
 * The marker is stripped here for the screen and translated to an em-dash pause
 * for the voice (`speech.ts`) — pauses being the only emphasis edge-tts affords,
 * since it speaks SSML `<emphasis>` tags aloud (row 12.1).
 */
export const EMPHASIS_RE = /\*([^*\n]{1,60})\*/g;

/** The caption form of a spoken beat: markers removed, word kept. */
export function stripEmphasis(text: string): string {
  return text.replace(EMPHASIS_RE, "$1");
}

/**
 * One spoken word located inside its own beat clip, from edge-tts's
 * `boundary="WordBoundary"` stream. Declared here rather than in `lib/tts.ts`
 * because the engine and the caption renderer read it in the browser, and
 * `lib/tts.ts` imports `node:child_process`.
 *
 * These are timed against the NORMALIZED speech copy (`normalizeSpeech`), which
 * does not tokenize one-to-one with the on-screen caption text — "API" is spoken
 * as three words. Use it as a rhythm curve over the utterance, never as an index
 * into the caption.
 */
export type WordTiming = { t: string; startMs: number; durationMs: number };

/** Narration timing computed after TTS: scene i plays [startMs, startMs+durationMs). */
export type SceneTiming = {
  sceneId: string;
  startMs: number;
  durationMs: number;
  /** Beat windows relative to scene start, same order as sceneBeats(). */
  beats: { startMs: number; durationMs: number }[];
};

export const ASPECTS = {
  short: { width: 1080, height: 1920 },
  long: { width: 1920, height: 1080 },
} as const;

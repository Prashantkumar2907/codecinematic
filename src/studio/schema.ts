import { z } from "zod";

export const CODE_LANGS = ["js", "ts", "python", "sql", "bash", "yaml", "text"] as const;
export type CodeLang = (typeof CODE_LANGS)[number];

/** Languages the exec route can actually run and verify. */
export const EXECUTABLE_LANGS: CodeLang[] = ["js", "python", "sql"];

const MAX_BEAT_CHARS = 320;
const MAX_NARRATION_CHARS = 400;
const MAX_CODE_LINES = 22;
/** Prompt asks for 46; renderer shrinks the font up to this hard ceiling. */
const MAX_CODE_COLS = 60;
const GRID = 12;

const say = z.string().min(6).max(MAX_BEAT_CHARS);
const narration = z.string().min(6).max(MAX_NARRATION_CHARS);
const id = z.string().min(1).max(40);

const bigtextScene = z.object({
  kind: z.literal("bigtext"),
  id,
  narration,
  text: z.string().min(2).max(80),
  sub: z.string().max(110).optional(),
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
  narration,
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
      })
    )
    .max(10)
    .default([]),
  steps: z
    .array(
      z.object({
        reveal: z.array(id).default([]),
        highlight: z.array(id).default([]),
        say,
      })
    )
    .min(1)
    .max(8),
});

const compareScene = z.object({
  kind: z.literal("compare"),
  id,
  sayIntro: say.optional(),
  title: z.string().min(2).max(60),
  left: z.object({ title: z.string().min(1).max(30), items: z.array(z.string().max(70)).min(1).max(4), say }),
  right: z.object({ title: z.string().min(1).max(30), items: z.array(z.string().max(70)).min(1).max(4), say }),
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
  events: z
    .array(z.object({ when: z.string().min(1).max(18), label: z.string().min(2).max(52), say }))
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

export const sceneSchema = z.discriminatedUnion("kind", [
  bigtextScene,
  bulletsScene,
  codeScene,
  terminalScene,
  diagramScene,
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
]);
export type Scene = z.infer<typeof sceneSchema>;
export type SceneKind = Scene["kind"];

/**
 * Ordered narration beats of a scene. Beat k's audio playing is what drives
 * the k-th visual step, so this order must match each painter's beat mapping.
 */
export function sceneBeats(scene: Scene): { beatId: string; text: string }[] {
  const beat = (index: number, text: string) => ({ beatId: `${scene.id}#${index}`, text });
  switch (scene.kind) {
    case "bigtext":
    case "terminal":
    case "question":
      return [beat(0, scene.narration)];
    case "bullets": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.items.map((i) => i.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "diagram": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "compare": {
      const texts = [
        ...(scene.sayIntro ? [scene.sayIntro] : []),
        scene.left.say,
        scene.right.say,
        ...(scene.sayVerdict ? [scene.sayVerdict] : []),
      ];
      return texts.map((t, k) => beat(k, t));
    }
    case "code": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.segments.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "stat":
      return [beat(0, scene.narration)];
    case "timeline": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.events.map((e) => e.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "steps": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.steps.map((s) => s.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "vocab": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.examples.map((e) => e.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "quiz":
      return [beat(0, scene.sayQuestion), beat(1, scene.sayReveal)];
    case "chart": {
      const texts = [...(scene.sayIntro ? [scene.sayIntro] : []), ...scene.items.map((i) => i.say)];
      return texts.map((t, k) => beat(k, t));
    }
    case "quote":
      return [beat(0, scene.narration)];
    case "mythfact":
      return [beat(0, scene.sayMyth), beat(1, scene.sayFact)];
  }
}

/** Number of leading beats that precede the first visual step (0 or 1). */
export function introBeatCount(scene: Scene): number {
  switch (scene.kind) {
    case "bullets":
    case "diagram":
    case "code":
    case "compare":
    case "timeline":
    case "steps":
    case "vocab":
    case "chart":
      return scene.sayIntro ? 1 : 0;
    default:
      return 0;
  }
}

const SHORT_SCENES = { min: 4, max: 8 } as const;
const LONG_SCENES = { min: 14, max: 32 } as const;

/** Video length IS narration length; scripts outside these word budgets get a repair round. */
export const NARRATION_BUDGET = {
  short: { min: 110, max: 240 },
  long: { min: 850, max: 1900 },
} as const;

export function narrationWordCount(script: SceneScript): number {
  let words = 0;
  for (const scene of script.scenes) {
    for (const { text } of sceneBeats(scene)) {
      words += text.trim().split(/\s+/).filter(Boolean).length;
    }
  }
  return words;
}

export const metaSchema = z.object({
  title: z.string().min(10).max(95),
  description: z.string().min(40).max(3500),
  tags: z.array(z.string().min(2).max(30)).min(4).max(15),
  hashtags: z.array(z.string().regex(/^#[A-Za-z0-9]+$/)).min(3).max(8),
});
export type VideoMeta = z.infer<typeof metaSchema>;

export const sceneScriptSchema = z
  .object({
    format: z.enum(["short", "long"]),
    subject: z.string().min(2).max(60),
    module: z.string().min(2).max(60),
    submodule: z.string().min(2).max(60),
    topic: z.string().min(3).max(120),
    scenes: z.array(sceneSchema),
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
        const stepIds = s.steps.flatMap((st) => [...st.reveal, ...st.highlight]);
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

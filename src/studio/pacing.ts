import { sceneBeats, type Scene, type SceneScript } from "./schema.ts";

/**
 * One shared pacing metric, computed from the real `sceneBeats()`.
 *
 * Everything that judges pacing — the soft gates in `schema.ts`, the rating
 * rubric in `rate.ts`, and `scripts/pacing-audit.mjs` — reads its numbers from
 * here, so they can never quietly disagree about what "a 12-second beat" means.
 * The audit script imports this file directly (Node 22 strips the types on the
 * fly), which is why the relative import above carries an explicit `.ts`
 * extension and why nothing in this module may import the engine or a painter:
 * those pull in canvas and three.js and would not load outside a browser.
 *
 * ESTIMATE, NOT MEASUREMENT. Every second here is derived from a word count.
 * Real scene duration comes from the measured length of the synthesised audio
 * (`computeTimings` in engine.ts) and nothing in this module can see it.
 * Inter-beat gaps and scene tails are engine constants and are deliberately
 * excluded, so these are *speech* seconds. Phase 15 of improvement_plan.md
 * closes the gap by comparing these estimates against measured audio and
 * recalibrating SPOKEN_WORDS_PER_SEC per voice and per language.
 */

/**
 * Spoken words per second. 2.6 ≈ 156 wpm, which is edge-tts's neural default and
 * already sits inside the 120-150 wpm educational band — narration *rate* is not
 * the problem this module exists to find, visual change rate is.
 *
 * This is the only words-per-second constant in the codebase; duration is
 * otherwise always measured. Treat every second produced here as a pre-render
 * approximation.
 */
export const SPOKEN_WORDS_PER_SEC = 2.6;

/**
 * A beat holds one visual state, so a beat longer than this is a frame the
 * viewer finished reading seconds ago. improvement_plan.md §7b: "no beat > 12 s".
 */
export const OVERLONG_BEAT_SEC = 12;

/** Seconds between visual changes: §2 targets 4-6 s, §7b accepts 4-8 s. */
export const VISUAL_CHANGE_TARGET_SEC = { min: 4, max: 6 } as const;
export const VISUAL_CHANGE_ACCEPT_SEC = { min: 4, max: 8 } as const;

/** Share of total audio allowed to play over a single-beat card (§7b: < 10%). */
export const STATIC_CARD_SHARE_TARGET = 0.1;

/**
 * The kinds `sceneBeats()` gives exactly one beat no matter what the model writes
 * (schema.ts:2922-2925, :2957, :2977). Distinguished from a static card because a
 * MULTI-beat kind reduced to one entry is also a static card — the plan calls that
 * a disguised one — and the two want different fixes: a cap here, a floor there.
 */
export const INHERENTLY_SINGLE_BEAT_KINDS: ReadonlySet<string> = new Set([
  "bigtext",
  "terminal",
  "question",
  "stat",
  "quote",
]);

/**
 * Counted exactly as `narrationWordCount()` in schema.ts counts, so the new
 * pacing caps and the existing word-floor gate measure the same thing. If the two
 * ever diverge the gates fight each other across all three repair rounds and
 * exhaust; `scripts/pacing-audit.mjs` asserts they agree on every script.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function secondsForWords(words: number): number {
  return words / SPOKEN_WORDS_PER_SEC;
}

export type BeatMetric = {
  sceneIndex: number;
  sceneId: string;
  kind: Scene["kind"];
  beatId: string;
  words: number;
  seconds: number;
  /**
   * This beat IS the whole scene, so nothing on screen can advance while it
   * plays. True both for the kinds that are inherently single-beat
   * (bigtext/stat/quote/question/terminal) and for a multi-beat kind the model
   * collapsed to one entry — a disguised static card.
   */
  isWholeScene: boolean;
};

export type SceneMetric = {
  index: number;
  id: string;
  kind: Scene["kind"];
  beats: number;
  words: number;
  seconds: number;
  isStaticCard: boolean;
};

export type CrutchHit = { phrase: string; sceneId: string; beatId: string; excerpt: string };

export type PacingReport = {
  format: SceneScript["format"];
  lang: SceneScript["lang"];
  topic: string;
  scenes: number;
  beats: number;
  words: number;
  /** Speech seconds only — see the module note on gaps. */
  estSeconds: number;

  beatSeconds: BeatMetric[];
  sceneSeconds: SceneMetric[];
  overlongBeats: BeatMetric[];

  staticCardScenes: number;
  staticCardSeconds: number;
  staticCardShare: number;

  /**
   * A beat is the engine's unit of visual advance, so mean beat seconds IS mean
   * seconds-per-visual-change. A mean hides the tail that produced the owner's
   * complaint, so the percentiles and the worst single hold ship beside it.
   */
  secondsPerVisualChange: number;
  visualHoldP50: number;
  visualHoldP90: number;
  worstVisualHoldSeconds: number;

  kindMix: { kind: string; scenes: number; share: number }[];
  distinctKinds: number;

  opensWithStaticCard: boolean;
  /** The opening scene is single-beat because its KIND has only one beat. */
  opensWithInherentCard: boolean;
  opensWithDefinition: boolean;
  /** Same test with the plan's own loose pattern — see isDefinitionOpenerLoose. */
  opensWithDefinitionLoose: boolean;
  definitionShapedBeats: BeatMetric[];
  crutchHits: CrutchHit[];
  runningExample: { token: string | null; coverage: number; scenesMentioning: number };
};

/**
 * "X is a …" where a concrete moment should be. 3Blue1Brown's rule is that a
 * definition is an ending point, not a starting point, and 30% of the corpus
 * opens with one.
 *
 * The leading negative lookahead is what keeps this honest: "This is why…",
 * "It is…" and "There are…" are ordinary narration, not definitions, and a naive
 * `\w+ is` pattern flags every one of them. The trailing article requirement does
 * the same job at the other end — a definition names a category ("a function
 * that…"), where plain narration usually does not.
 */
const PRONOUN_OPENERS =
  "this|that|these|those|it|its|there|here|they|we|you|i|he|she|what|why|how|when|where|" +
  "if|but|so|and|now|next|because|every|most|each|one|two|both|all|no|not|nothing|" +
  "something|anyone|everyone|your|our|their|his|her";
const DEFINITION_VERB = "is|are|was|were|refers\\s+to|means|stands\\s+for";
const DEFINITION_ARTICLE = "a|an|the|any|simply|basically|essentially|just|when|what";
const DEFINITION_OPENER = new RegExp(
  `^\\s*(?:the\\s+|a\\s+|an\\s+)?(?!(?:${PRONOUN_OPENERS})\\b)` +
    `[\\p{L}][\\p{L}\\p{M}'’\\-]*(?:\\s+[\\p{L}][\\p{L}\\p{M}'’\\-]*){0,3}\\s+` +
    `(?:${DEFINITION_VERB})\\s+(?:${DEFINITION_ARTICLE})\\b`,
  "iu"
);

export function isDefinitionOpener(text: string): boolean {
  return DEFINITION_OPENER.test(text);
}

/**
 * improvement_plan.md's own pattern — `^(a|an|the)?\s*X (is|are|refers to|means)`
 * — kept only so its headline "30% of videos open with a definition" stays
 * reproducible. **It does not measure definitions.** On the real corpus it flags
 * 25 of 88 first beats, and 21 of those 25 begin "Your…/You…/This…": they are
 * concrete second-person cold-opens ("Your div-button is a trap. A keyboard user
 * just hit Tab, and your entire UI just broke.") — precisely the hook the plan
 * asks for. Any predicate this loose punishes good writing, so the gate must not
 * be built on it. See the correction recorded in §1 of the plan.
 */
const DEFINITION_OPENER_LOOSE = /^\s*(?:a|an|the)?\s*[\w'’-]+(?:\s+[\w'’-]+){0,3}\s+(?:is|are|refers to|means)\b/i;

export function isDefinitionOpenerLoose(text: string): boolean {
  return DEFINITION_OPENER_LOOSE.test(text);
}

/**
 * Openers the prompt already bans and the model writes anyway — 101 "let's" and
 * 61 "here is" across 89 scripts. Prompting has demonstrably failed on these,
 * which is the entire argument for measuring them instead.
 */
const CRUTCHES: { phrase: string; re: RegExp }[] = [
  { phrase: "let's", re: /\blet'?s\b/i },
  { phrase: "here is / here's", re: /\bhere'?s\b|\bhere is\b/i },
  { phrase: "sentence-initial Now,", re: /^\s*now\s*,/i },
  { phrase: "sentence-initial Next,", re: /^\s*next\s*,/i },
  { phrase: "sentence-initial So,", re: /^\s*so\s*,/i },
  { phrase: "in this video", re: /\bin this (?:video|short)\b/i },
];

export function crutchPhrasesIn(text: string): string[] {
  return CRUTCHES.filter((c) => c.re.test(text)).map((c) => c.phrase);
}

/**
 * PROXY, not the real thing — read the doc comment before trusting the number.
 *
 * The prompt demands one concrete example threaded through every scene, in four
 * separate places, and nothing has ever measured compliance. Identifying "the
 * coffee-shop loyalty card" needs semantics. What this does instead is find the
 * most widely-threaded content word that is NOT part of the topic, subject or
 * module — the topic's own head noun recurs in every video by construction and
 * would report perfect coverage for a script that has no example at all.
 *
 * Read it as "how well does ANY single concrete thread run through this script",
 * and treat a low value as a signal to look, not as a verdict.
 */
const STOPWORDS = new Set(
  ("the a an and or but if then than that this these those is are was were be been being do does did done " +
    "have has had will would can could should may might must not no nor so as at by for from in into of off " +
    "on onto out over to up with without your you our we they it its their his her them us who whom whose " +
    "which what when where why how all any both each few more most other some such only own same too very " +
    "just about after again against because before below between during down further here now once there " +
    "through under until while less like also even still one two three first second next last thing things " +
    "way ways lot lots kind kinds part parts make makes made get gets got take takes need needs want wants " +
    "look looks see sees know knows think thinks call calls work works")
    .split(/\s+/)
);

function contentTokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}][\p{L}\p{M}'’\-]{3,}/gu) ?? []).filter((t) => !STOPWORDS.has(t));
}

function runningExampleOf(script: SceneScript, perScene: string[][]): PacingReport["runningExample"] {
  const topicTokens = new Set(
    contentTokens(`${script.topic} ${script.subject} ${script.module} ${script.submodule}`)
  );
  const sceneCount = perScene.length;
  if (!sceneCount) return { token: null, coverage: 0, scenesMentioning: 0 };

  const scenesWith = new Map<string, number>();
  for (const tokens of perScene) {
    for (const token of new Set(tokens)) {
      if (topicTokens.has(token)) continue;
      scenesWith.set(token, (scenesWith.get(token) ?? 0) + 1);
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [token, count] of scenesWith) {
    // Ties break toward the longer token: a longer word is more likely to be the
    // named example than a short generic one that happens to recur as often.
    if (count > bestCount || (count === bestCount && best !== null && token.length > best.length)) {
      best = token;
      bestCount = count;
    }
  }
  return bestCount >= 2
    ? { token: best, coverage: bestCount / sceneCount, scenesMentioning: bestCount }
    : { token: null, coverage: 0, scenesMentioning: 0 };
}

/** Nearest-rank percentile of an ascending array. */
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const at = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[at];
}

export function pacingReport(script: SceneScript): PacingReport {
  const beatSeconds: BeatMetric[] = [];
  const sceneSeconds: SceneMetric[] = [];
  const definitionShapedBeats: BeatMetric[] = [];
  const crutchHits: CrutchHit[] = [];
  const kindScenes = new Map<string, number>();
  const perSceneTokens: string[][] = [];
  let firstBeatText = "";

  script.scenes.forEach((scene, index) => {
    // sceneBeats has a case for all 110 registered kinds, but it has no default
    // arm, so a kind added to the schema without one returns undefined rather
    // than throwing. Treat that as "no narration" instead of crashing the audit.
    const beats = sceneBeats(scene) ?? [];
    const isWholeScene = beats.length === 1;
    const tokens: string[] = [];
    let sceneWords = 0;

    beats.forEach(({ beatId, text }, localIndex) => {
      const beatText = text ?? "";
      if (index === 0 && localIndex === 0) firstBeatText = beatText;
      const words = countWords(beatText);
      sceneWords += words;
      tokens.push(...contentTokens(beatText));

      const metric: BeatMetric = {
        sceneIndex: index,
        sceneId: scene.id,
        kind: scene.kind,
        beatId,
        words,
        seconds: secondsForWords(words),
        isWholeScene,
      };
      beatSeconds.push(metric);
      if (isDefinitionOpener(beatText)) definitionShapedBeats.push(metric);
      for (const phrase of crutchPhrasesIn(beatText)) {
        crutchHits.push({ phrase, sceneId: scene.id, beatId, excerpt: beatText.slice(0, 70) });
      }
    });

    perSceneTokens.push(tokens);
    kindScenes.set(scene.kind, (kindScenes.get(scene.kind) ?? 0) + 1);
    sceneSeconds.push({
      index,
      id: scene.id,
      kind: scene.kind,
      beats: beats.length,
      words: sceneWords,
      seconds: secondsForWords(sceneWords),
      isStaticCard: isWholeScene,
    });
  });

  const words = beatSeconds.reduce((n, b) => n + b.words, 0);
  const estSeconds = secondsForWords(words);
  const staticCards = sceneSeconds.filter((s) => s.isStaticCard);
  const staticCardSeconds = staticCards.reduce((n, s) => n + s.seconds, 0);
  const holds = beatSeconds.map((b) => b.seconds).sort((a, b) => a - b);

  return {
    format: script.format,
    lang: script.lang,
    topic: script.topic,
    scenes: script.scenes.length,
    beats: beatSeconds.length,
    words,
    estSeconds,

    beatSeconds,
    sceneSeconds,
    overlongBeats: beatSeconds.filter((b) => b.seconds > OVERLONG_BEAT_SEC),

    staticCardScenes: staticCards.length,
    staticCardSeconds,
    staticCardShare: estSeconds > 0 ? staticCardSeconds / estSeconds : 0,

    secondsPerVisualChange: beatSeconds.length ? estSeconds / beatSeconds.length : 0,
    visualHoldP50: percentile(holds, 0.5),
    visualHoldP90: percentile(holds, 0.9),
    worstVisualHoldSeconds: holds.length ? holds[holds.length - 1] : 0,

    kindMix: [...kindScenes.entries()]
      .map(([kind, scenes]) => ({ kind, scenes, share: scenes / Math.max(1, script.scenes.length) }))
      .sort((a, b) => b.scenes - a.scenes),
    distinctKinds: kindScenes.size,

    opensWithStaticCard: sceneSeconds[0]?.isStaticCard ?? false,
    opensWithInherentCard: INHERENTLY_SINGLE_BEAT_KINDS.has(script.scenes[0]?.kind ?? ""),
    opensWithDefinition: isDefinitionOpener(firstBeatText),
    opensWithDefinitionLoose: isDefinitionOpenerLoose(firstBeatText),
    definitionShapedBeats,
    crutchHits,
    runningExample: runningExampleOf(script, perSceneTokens),
  };
}

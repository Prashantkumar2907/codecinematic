import { sceneBeats, SPOKEN_LIMITS, type Scene, type SceneScript } from "./schema.ts";

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
  // "let us" is not a stylistic variant to be generous about — it is the same
  // crutch in a collar, and it is what the model reaches for when a section card
  // needs filling ("Let us start at the fundamental machine level").
  { phrase: "let's / let us", re: /\blet'?s\b|\blet us\b/i },
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

/**
 * Corpus-measured characters per spoken word (88 scripts, 38,988 words). Used
 * only to check that the schema's character caps still express the second-based
 * targets in this module — a char cap is what zod can enforce, but seconds are
 * what actually matter.
 */
export const CHARS_PER_WORD = 5.98;

/**
 * The character cap the schema enforces on a single-beat scene, expressed back in
 * seconds. If this drifts far from OVERLONG_BEAT_SEC the two halves of the design
 * have come apart; `scripts/pacing-audit.mjs` prints both so it is visible.
 */
export function singleBeatCapSeconds(): number {
  return SPOKEN_LIMITS.narration / CHARS_PER_WORD / SPOKEN_WORDS_PER_SEC;
}

/**
 * Every threshold below is set from the corpus, not chosen: each fires on roughly
 * the worst quartile of the 88 historic scripts, so a repair round is spent on
 * output that is genuinely bad rather than marginally over a line.
 *
 * This matters more than it looks. At their natural "fires on any violation"
 * settings these five gates trip on **81 of 88** historic scripts, and the factory
 * already burns all 6 attempts on 72 of 86 slots — stacking gates that fire on 92%
 * of drafts would collapse throughput without improving anything, which is the
 * tension improvement_plan.md §4 states openly and then does not resolve. Tuned as
 * below they fire on 14-27% each. The real fix is still Phase 17: make the FIRST
 * draft right instead of adding rounds.
 *
 * Measured firing rates on the historic corpus, at these values:
 *   overlongBeats ≥3        27%   (≥1 would be 59%)
 *   crutchHits ≥3           26%   (≥1 would be 73%)
 *   runningExample <0.40    16%   (<0.50 would be 44%)
 *   jargon anchored <0.40   14%   (<0.60 would be 26%)
 */
export const GATE_THRESHOLDS = {
  overlongBeatCount: 3,
  crutchHits: 3,
  runningExampleCoverage: 0.4,
  jargonMinTerms: 4,
  jargonAnchoredShare: 0.4,
} as const;

/* ────────────────────────────── soft gates ──────────────────────────────────
 * These live here rather than in schema.ts's soft-gate zone for one reason: they
 * need `pacingReport`, `pacing.ts` already imports `schema.ts`, and putting them
 * the other way round would make the two files circular. They follow the same
 * contract as the gates in schema.ts — a pure function of the script, returning
 * null when clean and the offender otherwise, never hard-failing.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A single-beat scene that holds longer than the schema cap allows — which after
 * Phase 4 means, in practice, a MULTI-beat kind the model collapsed to one entry.
 * `narration` is capped at 190 chars, but a `say` is capped at 320, so a one-item
 * `steps` or `bullets` scene is a disguised static card that can hold ~21 s and no
 * per-kind narration cap can reach it.
 *
 * The threshold is the cap's own ceiling rather than OVERLONG_BEAT_SEC: a card
 * written exactly to the 190-char limit lands at 12.2 s, and a gate at 12 s would
 * fire on output that is already obeying the rule.
 */
export function staticCardOverrun(script: SceneScript): { id: string; detail: string } | null {
  const report = pacingReport(script);
  const ceiling = singleBeatCapSeconds();
  const worst = report.sceneSeconds
    .filter((s) => s.isStaticCard && s.seconds > ceiling + 0.1)
    .sort((a, b) => b.seconds - a.seconds)[0];
  if (!worst) return null;
  const collapsed = !INHERENTLY_SINGLE_BEAT_KINDS.has(worst.kind);
  return {
    id: worst.id,
    detail:
      `${worst.kind} scene "${worst.id}" is a single beat of ${worst.words} words ≈ ` +
      `${worst.seconds.toFixed(0)}s. Nothing on screen can change for that whole time. ` +
      (collapsed
        ? `${worst.kind} supports several beats — give it at least 3 so the visual advances.`
        : `Cut it to under ${Math.floor(OVERLONG_BEAT_SEC * SPOKEN_WORDS_PER_SEC)} words, or use a multi-beat kind.`),
  };
}

/**
 * Any beat over the hold target, in any kind. This is the gate the plan did not
 * specify and needs most: measured over the corpus, **215 of 354 overlong beats
 * (61%) sit inside MULTI-beat scenes** — bullets, code, diagram, trace, mythfact,
 * compare, table — where no per-kind narration cap can reach them. The plan's own
 * correction concluded the animated kinds were "already fine" from their medians;
 * the medians are fine and the tail is not (median 15.0 s, p90 18.5 s, max 21.9 s).
 *
 * Soft on purpose: a repair rewrites the offending beats, where a hard cap would
 * truncate them and cost the word budget.
 */
export function overlongBeats(
  script: SceneScript,
  minCount = GATE_THRESHOLDS.overlongBeatCount,
  limit = 4
): { count: number; detail: string } | null {
  const report = pacingReport(script);
  if (report.overlongBeats.length < minCount) return null;
  const worst = [...report.overlongBeats].sort((a, b) => b.seconds - a.seconds).slice(0, limit);
  const list = worst.map((b) => `${b.beatId} (${b.kind}, ${b.words}w ≈ ${b.seconds.toFixed(0)}s)`).join(", ");
  return {
    count: report.overlongBeats.length,
    detail:
      `${report.overlongBeats.length} beat(s) run over ${OVERLONG_BEAT_SEC}s, so the visual holds ` +
      `while the voice keeps going. Worst: ${list}. Split each into two beats, or shorten it.`,
  };
}

/**
 * The video opens by defining its subject instead of showing it.
 *
 * Reinstated after being written off. Phase 3 measured the historic corpus at
 * 3 of 88 and concluded there was no problem — the corpus opens with good
 * second-person hooks ("Your div-button is a trap"). But the corpus was generated
 * with per-slot learned directives accumulated over many attempts; a **fresh
 * generation from the raw prompt** opened with:
 *
 *   "A closure is a function bundled together with references to its surrounding
 *    lexical environment, allowing it to access variables from an outer scope…"
 *
 * So the prompt does produce this and the corpus merely grew out of it. The strict
 * predicate is the right one to gate on precisely because it is rare: it caught
 * that beat and flagged none of the 21 good `Your…` cold-opens the plan's own
 * loose pattern would have punished. The existing `firstBeatFormulaic` gate cannot
 * see this shape — it only knows "Have you ever/Did you know/Imagine".
 */
export function definitionOpener(script: SceneScript): { opener: string; detail: string } | null {
  const first = script.scenes[0];
  if (!first) return null;
  const opener = sceneBeats(first)?.[0]?.text ?? "";
  if (!isDefinitionOpener(opener)) return null;
  return {
    opener: opener.slice(0, 80),
    detail:
      `The video opens by defining its subject: "${opener.slice(0, 90)}…". A definition is where an ` +
      `explanation ENDS, not where it starts. Open on the concrete moment instead — the thing going ` +
      `wrong, the surprising number, the line of code that betrays the reader — and let the definition ` +
      `arrive once they need it.`,
  };
}

/**
 * Openers the prompt bans and the model writes anyway. 89 "let's" and 53
 * "here's" across 88 scripts is what a prompt-only rule is worth here.
 */
export function crutchPhrases(
  script: SceneScript,
  minHits = GATE_THRESHOLDS.crutchHits
): { count: number; detail: string } | null {
  const { crutchHits } = pacingReport(script);
  if (crutchHits.length < minHits) return null;
  const byPhrase = new Map<string, string[]>();
  for (const hit of crutchHits) {
    byPhrase.set(hit.phrase, [...(byPhrase.get(hit.phrase) ?? []), hit.beatId]);
  }
  const detail = [...byPhrase]
    .map(([phrase, beats]) => `"${phrase}" in ${beats.slice(0, 3).join(", ")}${beats.length > 3 ? ` +${beats.length - 3} more` : ""}`)
    .join("; ");
  return { count: crutchHits.length, detail: `Banned filler openers: ${detail}. Rewrite those beats to start on the thing itself.` };
}

/**
 * Whether ANY single concrete thread runs through the script. See
 * `runningExampleOf` for why this is a proxy and what it can and cannot see —
 * the threshold is deliberately loose so the gate fires on scripts with no
 * thread at all rather than on scripts whose thread it failed to name.
 */
export function runningExampleWeak(
  script: SceneScript,
  minCoverage = GATE_THRESHOLDS.runningExampleCoverage
): { coverage: number; detail: string } | null {
  const { runningExample, scenes } = pacingReport(script);
  if (runningExample.coverage >= minCoverage) return null;
  return {
    coverage: runningExample.coverage,
    detail:
      `No example threads the video: the most-repeated concrete term is ` +
      `${runningExample.token ? `"${runningExample.token}"` : "(none)"} in ` +
      `${runningExample.scenesMentioning} of ${scenes} scenes. Pick ONE concrete case in the hook and ` +
      `carry it by name into every scene.`,
  };
}

/**
 * Jargon, measured the way the owner's complaint actually means it.
 *
 * "So many jargan talk" is not a count of technical terms — a teaching video about
 * B-trees has to say "B-tree". It is about terms arriving *unexplained*.
 * `TEACHING_METHOD` in prompt.ts demands a plain-words gloss at every term's first
 * use, "every single time", and like every other prompt-only rule here compliance
 * has never been measured. So this gates the **anchored share**: of the technical
 * terms the script introduces, how many get glossed at or just after first use.
 *
 * PROXY. "Technical" is detected by shape — acronyms, CamelCase, snake_case,
 * letter+digit tokens, backticked code — which catches API/JSON/O(1)/useState and
 * misses ordinary-looking jargon like "idempotent" or "arbitrage". A gloss is
 * detected by cue — an apposition, a dash, "which means", "think of it as". Both
 * halves under-count, so read a low anchored share as a real signal and a high one
 * as merely "no obvious violation".
 */
const TECHNICAL_TOKEN =
  /(?:`[^`]+`)|(?:\b[A-Z]{2,6}s?\b)|(?:\b[a-z]+[A-Z][A-Za-z]*\b)|(?:\b[a-z]+_[a-z_]+\b)|(?:\b[A-Za-z]+\d+[A-Za-z0-9]*\b)|(?:\bO\(\w+\))/g;
/** Shapes that match TECHNICAL_TOKEN but are not jargon. */
const NOT_JARGON = new Set(["A", "I", "OK", "TV", "US", "UK", "AM", "PM", "AND", "OR", "IF", "THE", "IT", "IS", "NO", "SO", "ALL", "ONE", "NOT", "YOU"]);
const GLOSS_CUE =
  /(\s[—–-]\s)|(\()|(,\s*(?:which|who|that is|i\.?e\.?|meaning|a kind of|the))|(\bmeans\b)|(\bin other words\b)|(\bthink of (?:it|this|them) as\b)|(\bbasically\b)|(\bthat is,)|(\bor simply\b)|(\bis just\b)|(\bare just\b)/i;

export type JargonReport = {
  terms: number;
  anchored: number;
  anchoredShare: number;
  perHundredWords: number;
  unanchoredTerms: { term: string; beatId: string }[];
};

export function jargonReport(script: SceneScript): JargonReport {
  const beats: { beatId: string; text: string }[] = [];
  // Identifiers the script itself defines on screen — `createTracker`,
  // `setupBoardListeners`, `matchData` — match the camelCase shape but are not
  // jargon: they are the worked example, and "give createTracker a plain-words
  // gloss" is not an instruction anyone can follow. Measured on a live
  // generation, these were 5 of the 6 terms the gate complained about.
  const ownIdentifiers = new Set<string>();
  for (const scene of script.scenes) {
    const source =
      scene.kind === "code" ? scene.code : scene.kind === "terminal" ? scene.lines.join("\n") : null;
    if (!source) continue;
    for (const token of source.match(/[A-Za-z_$][\w$]*/g) ?? []) ownIdentifiers.add(token.toLowerCase());
  }
  for (const scene of script.scenes) {
    for (const b of sceneBeats(scene) ?? []) beats.push({ beatId: b.beatId, text: b.text ?? "" });
  }
  const seen = new Set<string>();
  const unanchoredTerms: { term: string; beatId: string }[] = [];
  let terms = 0;
  let anchored = 0;

  beats.forEach((beat, i) => {
    for (const raw of beat.text.match(TECHNICAL_TOKEN) ?? []) {
      const term = raw.replace(/`/g, "");
      const key = term.toLowerCase();
      if (NOT_JARGON.has(term.toUpperCase()) || seen.has(key) || ownIdentifiers.has(key)) continue;
      seen.add(key);
      terms += 1;
      // A gloss may land in the same breath or the one after it.
      const window = `${beat.text} ${beats[i + 1]?.text ?? ""}`;
      if (GLOSS_CUE.test(window)) anchored += 1;
      else unanchoredTerms.push({ term, beatId: beat.beatId });
    }
  });

  const words = beats.reduce((n, b) => n + countWords(b.text), 0);
  return {
    terms,
    anchored,
    anchoredShare: terms ? anchored / terms : 1,
    perHundredWords: words ? (terms / words) * 100 : 0,
    unanchoredTerms,
  };
}

/** Fires when a script introduces several technical terms and glosses few of them. */
export function jargonUnanchored(
  script: SceneScript,
  minTerms = GATE_THRESHOLDS.jargonMinTerms,
  minAnchoredShare = GATE_THRESHOLDS.jargonAnchoredShare
): { anchoredShare: number; detail: string } | null {
  const j = jargonReport(script);
  if (j.terms < minTerms || j.anchoredShare >= minAnchoredShare) return null;
  const worst = j.unanchoredTerms.slice(0, 5).map((u) => `"${u.term}" (${u.beatId})`).join(", ");
  return {
    anchoredShare: j.anchoredShare,
    detail:
      `${j.terms - j.anchored} of ${j.terms} technical terms arrive with no plain-words gloss ` +
      `(${Math.round(j.anchoredShare * 100)}% anchored). Unexplained: ${worst}. Give each one a ` +
      `six-word everyday translation the first time it is spoken.`,
  };
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

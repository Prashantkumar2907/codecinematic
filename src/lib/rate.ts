import type { Subject } from "@/lib/state";
import { SUBJECT_PLAYBOOKS } from "@/lib/prompt";
import type { SceneScript } from "@/studio/schema";
import {
  pacingReport,
  jargonReport,
  OVERLONG_BEAT_SEC,
  SPOKEN_WORDS_PER_SEC,
  STATIC_CARD_SHARE_TARGET,
  VISUAL_CHANGE_TARGET_SEC,
} from "@/studio/pacing";

/** Sections a script is graded on, benchmarked against the best channels in the niche. */
export const RATING_SECTIONS = [
  "hook_intro",
  "structure_flow",
  "depth_accuracy",
  "engagement_voice",
  "visual_variety",
  "ending_cta",
  "pacing_density",
] as const;
export type RatingSection = (typeof RATING_SECTIONS)[number];

export type SectionRating = {
  score: number;
  evidence: string;
  issues: { where: string; problem: string; fix: string }[];
};

export type ScriptRating = {
  sections: Record<RatingSection, SectionRating>;
  overall: number;
  worst: number;
  benchmark: string;
};

const BENCHMARKS: Record<string, string> = {
  coding: "Fireship, NeetCode, ByteByteGo, 3Blue1Brown — channels whose coding explainers earn millions of views",
  english: "the most-watched English-learning channels (English with Lucy, mmmEnglish) — warm, example-first, zero textbook stiffness",
  history: "OverSimplified, Kings and Generals, and India's top UPSC history educators — story-first, date-precise",
  geography: "Atlas Pro, RealLifeLore, and India's top UPSC geography educators — map-first, mechanism-driven",
  polity: "India's most-subscribed polity educators (Laxmikanth-grade accuracy) with the clarity of a great explainer channel",
  economy: "Economics Explained and India's top UPSC economy educators — number-anchored, jargon translated in the same breath",
  environment: "India's top UPSC environment educators crossed with Veritasium-style curiosity — species/act/convention precision",
  artculture: "India's best art & culture educators — visually evocative, site- and dynasty-precise",
};

export function ratingBenchmark(subjectId: string): string {
  return BENCHMARKS[subjectId] ?? "the best educational channels in this niche (1M+ subscriber, top-retention creators)";
}

export function buildRatingPrompt(scriptJson: string, opts: {
  subject: Subject;
  format: "short" | "long";
  topic: string;
  lang?: "en" | "hi";
  /** The parsed script, so pacing can be COMPUTED rather than guessed at. */
  script?: SceneScript;
}): string {
  const { subject, format, topic, lang } = opts;
  const playbook = SUBJECT_PLAYBOOKS[subject.id] ?? "";
  const benchmark = ratingBenchmark(subject.id);
  return `You are a ruthless YouTube content strategist. Grade this ${format} video script on "${topic}"
for a ${subject.label} channel against the bar of the very best in the niche: ${benchmark}.
A 9 means "would stand proudly next to their best work"; a 10 means "better than most of it".
Most first drafts deserve 6-8. Do not grade on a curve and do not reward mere competence.
${lang === "hi" ? "The script is in Hindi — apply the same bars to natural spoken Hindi." : ""}
${playbook ? `Subject playbook the script should honour:\n${playbook}\n` : ""}${opts.script ? measuredFactsBlock(opts.script) : ""}
Grade each section 1-10 with specific evidence from the script:

1. hook_intro — Do the first beats open a specific curiosity loop (no "Have you ever", no greeting,
   no definition-first)? Within two scenes, does a spoken beat say what the thing IS in plain words
   AND why the viewer should care? Would the ${format === "short" ? "first 2 seconds survive the swipe" : "first 30 seconds survive the back button"}?
2. structure_flow — Clear act structure with signposts; every scene ADVANCES (no restating a prior
   scene in a new costume); section cards deliver what they promise; difficulty ladders smoothly.
3. depth_accuracy — Real, subject-grade specifics (dates, article numbers, commands, ₹ figures,
   latencies); facts correct as far as you can verify; one concrete worked example threads through;
   no invented precision, no hand-waving where a specific belongs.
4. engagement_voice — A creator talking, not a textbook: concrete images in nearly every beat, varied
   sentence rhythm, no academic register ("utilize", "furthermore"), no formulaic transitions;
   moments engineered for retention (pattern breaks, "wait, what?" turns, payoffs).
5. visual_variety — The scene kinds fit and vary (not a wall of bullet scenes); beats map to visual
   steps a viewer can follow; diagrams/charts/tables used where they beat words.
6. ending_cta — A payoff/recap beat lands the promise; the final question is answerable from the
   video and genuinely argue-worthy (drives comments); nothing after the question scene.
7. pacing_density — Grade ONLY against the MEASURED FACTS block below. You cannot hear this script
   timed, so do not estimate: the numbers there were computed from the real beat structure at a
   speaking rate measured against actual TTS output. A viewer needs a new visual every 4-6 seconds.
   Score 9-10 only if the mean hold is inside 4-6s with no beat over 12s and under 10% of the audio
   playing over a single-beat card. Drop to 5-6 if the mean hold exceeds 8s or several beats run
   over 12s. Score 1-3 if a single card holds for 20s or more, or if a long video carries more than
   two "bigtext" cards — a title slide is read in two seconds and stared at for the rest.
   Your issues for this section must name the offending beat ids from the facts block.

For EVERY section scoring below 9, list 1-3 issues with surgically concrete fixes ("replace scene
hook-1's first beat with ...", not "make it more engaging"). Fixes must be applicable directly by a
scriptwriter without further judgment.

Return STRICT JSON only:
{"sections": {"hook_intro": {"score": n, "evidence": "...", "issues": [{"where": "scene id or 'meta'", "problem": "...", "fix": "..."}]},
  "structure_flow": {...}, "depth_accuracy": {...}, "engagement_voice": {...}, "visual_variety": {...}, "ending_cta": {...},
  "pacing_density": {...}}}

Script to grade:
${scriptJson}`;
}

/**
 * Ground truth for the `pacing_density` section.
 *
 * An LLM cannot time audio, and asking it to estimate is precisely why pacing was
 * invisible to this rubric for 89 videos: it graded the text it could read and had
 * no way to know a card sat frozen for 27 seconds. These numbers come from
 * `pacingReport`, at a words/sec rate measured against real TTS output, so the
 * judge grades a measurement instead of an impression.
 */
function measuredFactsBlock(script: SceneScript): string {
  const p = pacingReport(script);
  const j = jargonReport(script);
  const s1 = (n: number) => n.toFixed(1);
  const worst = [...p.overlongBeats].sort((a, b) => b.seconds - a.seconds).slice(0, 5);
  const bigtext = p.kindMix.find((k) => k.kind === "bigtext")?.scenes ?? 0;
  return `
MEASURED FACTS (computed from the beat structure at ${SPOKEN_WORDS_PER_SEC} spoken words/sec, itself
measured against real TTS output — treat these as ground truth, do NOT re-estimate them):
- runtime ≈ ${s1(p.estSeconds / 60)} min across ${p.scenes} scenes / ${p.beats} beats / ${p.words} words
- mean hold between visual changes: ${s1(p.secondsPerVisualChange)}s   (target ${VISUAL_CHANGE_TARGET_SEC.min}-${VISUAL_CHANGE_TARGET_SEC.max}s)
- p90 hold ${s1(p.visualHoldP90)}s, worst single hold ${s1(p.worstVisualHoldSeconds)}s
- beats over ${OVERLONG_BEAT_SEC}s: ${p.overlongBeats.length} of ${p.beats}${worst.length ? ` — worst: ${worst.map((b) => `${b.beatId} (${b.kind}, ${s1(b.seconds)}s)`).join(", ")}` : ""}
- audio playing over a single-beat static card: ${(p.staticCardShare * 100).toFixed(1)}% (target < ${STATIC_CARD_SHARE_TARGET * 100}%), ${p.staticCardScenes} of ${p.scenes} scenes
- "bigtext" cards: ${bigtext}${script.format === "long" ? " (a long video is allowed 2: hook + recap)" : ""}
- distinct scene kinds: ${p.distinctKinds}
- opens on a static card: ${p.opensWithStaticCard ? "yes" : "no"}; opens on a definition: ${p.opensWithDefinition ? "YES" : "no"}
- banned filler openers ("let's"/"here's"/"Now,"): ${p.crutchHits.length} hit(s)
- one running example threaded: ${p.runningExample.token ? `"${p.runningExample.token}" in ${p.runningExample.scenesMentioning} of ${p.scenes} scenes` : "none found"}
- technical terms glossed at first use: ${Math.round(j.anchoredShare * 100)}% of ${j.terms}
`;
}

/** Coerce the model's verdict into a well-formed ScriptRating (clamped scores, arrays present). */
export function normalizeRating(raw: unknown, subjectId: string): ScriptRating | null {
  if (!raw || typeof raw !== "object") return null;
  const sectionsIn = (raw as { sections?: unknown }).sections;
  if (!sectionsIn || typeof sectionsIn !== "object") return null;
  const sections = {} as Record<RatingSection, SectionRating>;
  for (const name of RATING_SECTIONS) {
    const s = (sectionsIn as Record<string, unknown>)[name];
    if (!s || typeof s !== "object") return null;
    const scoreRaw = Number((s as { score?: unknown }).score);
    const score = Number.isFinite(scoreRaw) ? Math.min(10, Math.max(1, scoreRaw)) : 1;
    const issuesRaw = (s as { issues?: unknown }).issues;
    const issues = Array.isArray(issuesRaw)
      ? issuesRaw
          .filter((i): i is { where?: unknown; problem?: unknown; fix?: unknown } => !!i && typeof i === "object")
          .map((i) => ({ where: String(i.where ?? "meta"), problem: String(i.problem ?? ""), fix: String(i.fix ?? "") }))
          .filter((i) => i.problem || i.fix)
      : [];
    sections[name] = { score, evidence: String((s as { evidence?: unknown }).evidence ?? ""), issues };
  }
  const scores = RATING_SECTIONS.map((n) => sections[n].score);
  return {
    sections,
    overall: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    worst: Math.min(...scores),
    benchmark: ratingBenchmark(subjectId),
  };
}

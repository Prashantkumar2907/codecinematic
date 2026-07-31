import { sceneBeats, type SceneScript } from "./schema";

/**
 * Per-beat vocal delivery — the fix for the flat "list voice" every beat is read in.
 *
 * The role is *derived*, not authored. A `role` field on the beat would need a
 * schema change, a prompt change, a gate, and would still be filled
 * inconsistently by the model — and it would do nothing for the 88 scripts that
 * already exist. Position and punctuation already carry the information.
 *
 * ## Why rate is the only knob here
 *
 * The plan (§12a) assumed pitch was the instrument: "lift pitch slightly on a
 * question beat, drop it on a payoff". Measured against the live service, pitch
 * is not tonal-only and is not safe:
 *
 * | control            | behaviour (en-US-Andrew, 11-word line, baseline 3312 ms)   |
 * |--------------------|------------------------------------------------------------|
 * | `rate`             | monotonic, reproducible: -20% → +17.5%, -5% → +6.5%,        |
 * |                    | +5% → -4.4%, +15% → -13.7%. Same shape on a second text,    |
 * |                    | byte-identical across repeat passes.                        |
 * | `pitch`            | **+8 Hz alone reads 12.1% FASTER.** Non-monotonic:          |
 * |                    | -6 Hz → -3.0% but -20 Hz → +2.6%.                           |
 * | `pitch` × `rate`   | non-additive: -6 Hz with +4% → **-24.5%**, and -5% vs -2%   |
 * |                    | at +8 Hz produce byte-identical audio.                      |
 * | `volume`           | also non-monotonic: -30% → -1.5%, +15% → -5.3%.             |
 *
 * Beat duration drives the entire timing model, and slow pacing is this app's
 * core defect — so a knob that silently moves duration by up to 25% is worse
 * than no knob. `rate` alone it is. Pitch and volume stay wired through the
 * route and `lib/tts.ts` for a future vendor that handles them cleanly.
 *
 * SSML is not an alternative: edge-tts speaks `<emphasis>` tags aloud (row 12.1).
 */
export type BeatRole = "hook" | "question" | "payoff" | "teach";

/**
 * Rate deltas in percent, composed onto the batch rate (shorts run the whole
 * script at +5%). Duration moves roughly -1.1× the delta, so +6% reads about 6%
 * quicker. Deliberately modest: a human varying their delivery, not a character
 * voice.
 */
const DELIVERY_RATE_PCT: Record<BeatRole, number> = {
  /** Opening line: quicker, because it competes with a scrolling thumb. */
  hook: 6,
  /** Slower, so the question lands and the viewer has a moment to answer it. */
  question: -8,
  /** The line that lands. Slower reads as certainty. */
  payoff: -10,
  teach: 0,
};

/** Stay inside the range measured as monotonic; well within edge-tts's own ±100%. */
const RATE_LIMIT_PCT = 25;

const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, Math.round(n)));

/**
 * Role per beatId for a whole script. Question beats win over position: a closing
 * "so what will you build?" should land like a question, not like a verdict.
 */
export function beatRoles(script: SceneScript): Map<string, BeatRole> {
  const flat = script.scenes.flatMap((scene) =>
    sceneBeats(scene).map((beat) => ({ ...beat, kind: scene.kind }))
  );
  const roles = new Map<string, BeatRole>();
  flat.forEach((beat, i) => {
    const isQuestion = beat.kind === "question" || /\?\s*$/.test(beat.text.trim());
    const role: BeatRole = isQuestion
      ? "question"
      : i === 0
        ? "hook"
        : i === flat.length - 1
          ? "payoff"
          : "teach";
    roles.set(beat.beatId, role);
  });
  return roles;
}

/**
 * Absolute edge-tts prosody for a role, composed onto the batch base rate.
 * Returns `{}` for a neutral beat so the request carries no redundant override.
 */
export function deliveryFor(role: BeatRole, baseRatePct = 0): { rate?: string } {
  const delta = DELIVERY_RATE_PCT[role];
  if (delta === 0) return {};
  const pct = clamp(baseRatePct + delta, RATE_LIMIT_PCT);
  return { rate: `${pct >= 0 ? "+" : "-"}${Math.abs(pct)}%` };
}

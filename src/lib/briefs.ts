/**
 * Cached per-submodule creator briefs (improvement_plan.md §0b, row 13.2).
 *
 * Research once for each of the 373 submodules, cache forever, inject into the
 * blueprint stage. Never re-run unless the lane itself changes.
 *
 * Stored as a SIDECAR rather than inline in `subjects.json`, which the plan
 * allowed for ("or a sidecar"). `subjects.json` is hand-maintained taxonomy;
 * folding 373 generated paragraphs into it would make every future taxonomy
 * diff unreadable and put generated text one careless edit away from loss. This
 * keeps the same key shape the exemplar lookup already uses, so there is one
 * addressing convention for per-slot data instead of two.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export type CreatorBrief = {
  hookAngles: string[];
  runningExamples: string[];
  misconception?: { myth: string; fact: string };
  payoff: string;
  anchors: string[];
  avoid: string[];
};

export const BRIEFS_PATH = path.join(process.cwd(), "content", "briefs.json");

/** `<subject>/<module>/<submodule>`, lower-cased — same shape as the exemplar key. */
export function briefKey(subject: string, module_: string, submodule: string): string {
  return [subject, module_, submodule].join("/").toLowerCase();
}

export async function loadBriefs(): Promise<Record<string, CreatorBrief>> {
  try {
    return JSON.parse(await readFile(BRIEFS_PATH, "utf8")) as Record<string, CreatorBrief>;
  } catch {
    // Absent until the backfill has run; generation must work without it.
    return {};
  }
}

/**
 * Render a brief as the prompt text the blueprint stage sees. Kept here rather
 * than in `prompt.ts` so the storage shape and its rendering move together.
 */
export function renderBrief(brief: CreatorBrief): string {
  const lines: string[] = [];
  if (brief.hookAngles?.length) lines.push(`Hook angles that work here: ${brief.hookAngles.join(" | ")}`);
  if (brief.runningExamples?.length) lines.push(`Running examples strong enough to carry a whole video: ${brief.runningExamples.join(" | ")}`);
  if (brief.misconception?.myth) lines.push(`Common misconception: "${brief.misconception.myth}" — actually: ${brief.misconception.fact}`);
  if (brief.payoff) lines.push(`The payoff viewers remember: ${brief.payoff}`);
  if (brief.anchors?.length) lines.push(`Credibility anchors: ${brief.anchors.join("; ")}`);
  if (brief.avoid?.length) lines.push(`Avoid: ${brief.avoid.join("; ")}`);
  return lines.join("\n");
}

export async function briefFor(subject: string, module_: string, submodule: string): Promise<string | undefined> {
  const briefs = await loadBriefs();
  const brief = briefs[briefKey(subject, module_, submodule)];
  return brief ? renderBrief(brief) : undefined;
}

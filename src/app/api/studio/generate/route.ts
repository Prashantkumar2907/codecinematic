import { NextResponse } from "next/server";
import { z } from "zod";
import { sceneScriptSchema, narrationWordCount, firstAdjacentBigtext, NARRATION_BUDGET, type SceneScript } from "@/studio/schema";
import { generateJson, geminiQuotaSnapshot, GeminiError } from "@/lib/gemini";
import { buildScriptPrompt, buildRepairPrompt } from "@/lib/prompt";
import { sanitizeScript } from "@/lib/sanitize";
import { enhanceVideoMeta } from "@/lib/videoMeta";
import { coveredTopics, resolveTaxonomy } from "@/lib/state";

const requestSchema = z.object({
  subject: z.string().min(1),
  module: z.string().min(1),
  submodule: z.string().min(1),
  format: z.enum(["short", "long"]),
  topic: z.string().min(3).max(120),
  angle: z.string().max(160).optional(),
});

/* Soft gates (word budget, bare section cards) often need more than two tries —
 * the third round is only spent when the first two leave a real issue. */
const REPAIR_ROUNDS = 3;

/**
 * NDJSON stream so the 30–180s wait can show true pipeline stages:
 *   {stage:"writing"} → {stage:"validating"} → {stage:"repairing",round:n}?
 * ending with {done,script,quota} or {error,details?,raw?,quota}.
 */
export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  const { format, topic, angle } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const quota = () => geminiQuotaSnapshot().catch(() => undefined);
      try {
        const { subject, module: module_, submodule } = await resolveTaxonomy(
          parsed.data.subject,
          parsed.data.module,
          parsed.data.submodule
        );
        const recentTopics = (await coveredTopics(subject.label, module_.label, submodule.label)).slice(-15);

        const prompt = buildScriptPrompt({
          subject,
          moduleLabel: module_.label,
          submoduleLabel: submodule.label,
          moduleStyle: module_.style,
          submoduleStyle: submodule.style,
          format,
          topic,
          angle,
          recentTopics,
        });
        emit({ stage: "writing" });
        let raw = sanitizeScript(await generateJson(prompt));
        const budget = NARRATION_BUDGET[format];
        const warnings: string[] = [];
        let accepted: SceneScript | null = null;

        for (let round = 0; ; round++) {
          emit({ stage: "validating" });
          const validated = sceneScriptSchema.safeParse(raw);
          let issues: string[] = [];
          if (!validated.success) {
            issues = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
          } else {
            // Schema-valid — enforce soft quality gates (word budget, no bare section cards).
            // Both drive a repair round but never hard-fail: a complete video beats none.
            const words = narrationWordCount(validated.data);
            if (words < budget.min || words > budget.max) {
              issues.push(
                `total spoken narration across all beats is ${words} words but a ${format} needs ${budget.min}-${budget.max} — ${
                  words > budget.max
                    ? "tighten every beat: cut filler words, keep every scene's meaning"
                    : "deepen the teaching with substance (concrete facts, not padding)"
                }`
              );
            }
            const bt = firstAdjacentBigtext(validated.data);
            if (bt >= 0) {
              issues.push(
                `scenes ${bt + 1}-${bt + 2} are both "bigtext" section cards with no teaching scene between them — replace the second card, or the content it introduces, with a real diagram/bullets/compare/chart/steps scene (a bare title card teaches nothing)`
              );
            }
            if (issues.length === 0) {
              accepted = validated.data;
              break;
            }
          }
          if (round >= REPAIR_ROUNDS) {
            if (validated.success) {
              // Soft gates still off after all repairs — ship with honest warnings.
              const words = narrationWordCount(validated.data);
              if (words < budget.min || words > budget.max) {
                warnings.push(
                  `narration is ${words} words (target ${budget.min}-${budget.max}) — the video may run ${words > budget.max ? "long" : "short"}`
                );
              }
              if (firstAdjacentBigtext(validated.data) >= 0) {
                warnings.push("two section cards appear back to back with no teaching scene between them");
              }
              accepted = validated.data;
              break;
            }
            emit({
              error: `Script failed validation after ${REPAIR_ROUNDS} repairs`,
              details: issues.slice(0, 8),
              raw: JSON.stringify(raw, null, 2),
              quota: await quota(),
            });
            return;
          }
          emit({ stage: "repairing", round: round + 1 });
          raw = sanitizeScript(await generateJson(buildRepairPrompt(JSON.stringify(raw), issues.join("\n"))));
        }

        if (!accepted) throw new Error("validation loop exited without a script");
        const script = {
          ...accepted,
          subject: subject.label,
          module: module_.label,
          submodule: submodule.label,
          topic,
        };
        emit({ stage: "optimizing" });
        const { meta, source: metaSource } = await enhanceVideoMeta(script);
        emit({
          done: true,
          script: { ...script, meta },
          topic,
          metaSource,
          warnings: warnings.length ? warnings : undefined,
          quota: await quota(),
        });
      } catch (err) {
        const message = err instanceof GeminiError ? err.message : `generation failed: ${String(err).slice(0, 300)}`;
        emit({ error: message, quota: await quota() });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}

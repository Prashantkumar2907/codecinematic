import { NextResponse } from "next/server";
import { z } from "zod";
import { sceneScriptSchema, narrationWordCount, NARRATION_BUDGET, type SceneScript } from "@/studio/schema";
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

const REPAIR_ROUNDS = 2;

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
            // Schema-valid — enforce the narration word budget (video length IS narration length).
            const words = narrationWordCount(validated.data);
            if (words < budget.min || words > budget.max) {
              issues = [
                `total spoken narration across all beats is ${words} words but a ${format} needs ${budget.min}-${budget.max} — ${
                  words > budget.max
                    ? "tighten every beat: cut filler words, keep every scene's meaning"
                    : "deepen the teaching with substance (concrete facts, not padding)"
                }`,
              ];
            } else {
              accepted = validated.data;
              break;
            }
          }
          if (round >= REPAIR_ROUNDS) {
            if (validated.success) {
              // Only the word budget is off after all repairs — ship it with an honest warning.
              const words = narrationWordCount(validated.data);
              warnings.push(
                `narration is ${words} words (target ${budget.min}-${budget.max}) — the video may run ${words > budget.max ? "long" : "short"}`
              );
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

import { NextResponse } from "next/server";
import { z } from "zod";
import { sceneScriptSchema } from "@/studio/schema";
import { generateJson, geminiQuotaSnapshot, GeminiError } from "@/lib/gemini";
import { buildScriptPrompt, buildRepairPrompt } from "@/lib/prompt";
import { sanitizeScript } from "@/lib/sanitize";
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
          format,
          topic,
          angle,
          recentTopics,
        });
        emit({ stage: "writing" });
        let raw = sanitizeScript(await generateJson(prompt));
        emit({ stage: "validating" });
        let validated = sceneScriptSchema.safeParse(raw);

        for (let round = 0; round < REPAIR_ROUNDS && !validated.success; round++) {
          const errors = validated.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("\n");
          emit({ stage: "repairing", round: round + 1 });
          raw = sanitizeScript(await generateJson(buildRepairPrompt(JSON.stringify(raw), errors)));
          emit({ stage: "validating" });
          validated = sceneScriptSchema.safeParse(raw);
        }
        if (!validated.success) {
          const errors = validated.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`);
          emit({
            error: `Script failed validation after ${REPAIR_ROUNDS} repairs`,
            details: errors,
            raw: JSON.stringify(raw, null, 2),
            quota: await quota(),
          });
          return;
        }
        const script = {
          ...validated.data,
          subject: subject.label,
          module: module_.label,
          submodule: submodule.label,
          topic,
        };
        emit({ done: true, script, topic, quota: await quota() });
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

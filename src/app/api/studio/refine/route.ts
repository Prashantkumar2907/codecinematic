import { NextResponse } from "next/server";
import { z } from "zod";
import { sceneScriptSchema } from "@/studio/schema";
import { generateJson, GeminiError } from "@/lib/gemini";
import { buildRefinePrompt, buildRepairPrompt } from "@/lib/prompt";
import { sanitizeScript } from "@/lib/sanitize";
import { resolveTaxonomy } from "@/lib/state";

const requestSchema = z.object({
  subject: z.string().min(1),
  module: z.string().min(1),
  submodule: z.string().min(1),
  format: z.enum(["short", "long"]),
  topic: z.string().min(3).max(160),
  script: z.record(z.unknown()),
  issues: z
    .array(z.object({ where: z.string(), problem: z.string(), fix: z.string() }))
    .min(1)
    .max(18),
  model: z.string().max(60).optional(),
  keyId: z.string().max(40).optional(),
});

const REPAIR_ROUNDS = 2;

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  const { format, topic, script, issues, model, keyId } = parsed.data;
  const gen = model || keyId ? { ...(model ? { model } : {}), ...(keyId ? { keyId } : {}) } : undefined;
  try {
    const { subject } = await resolveTaxonomy(parsed.data.subject, parsed.data.module, parsed.data.submodule);
    const critiqueJson = JSON.stringify({ verdict: "revise", issues });
    let raw = sanitizeScript(
      await generateJson(buildRefinePrompt(JSON.stringify(script), critiqueJson, { subject, format, topic }), "quality", gen)
    );
    let result = sceneScriptSchema.safeParse(raw);
    for (let round = 1; !result.success && round <= REPAIR_ROUNDS; round++) {
      const errors = result.error.issues
        .slice(0, 12)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n");
      raw = sanitizeScript(await generateJson(buildRepairPrompt(JSON.stringify(raw), errors), "quality", gen));
      result = sceneScriptSchema.safeParse(raw);
    }
    if (!result.success) {
      return NextResponse.json(
        { error: "refined script failed validation", details: result.error.issues.slice(0, 6) },
        { status: 502 }
      );
    }
    return NextResponse.json({ script: result.data });
  } catch (err) {
    const status = err instanceof GeminiError ? 502 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "refine failed" }, { status });
  }
}

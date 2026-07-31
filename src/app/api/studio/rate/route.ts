import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJson, GeminiError } from "@/lib/gemini";
import { buildRatingPrompt, normalizeRating } from "@/lib/rate";
import { sceneScriptSchema } from "@/studio/schema";
import { resolveTaxonomy } from "@/lib/state";

const requestSchema = z.object({
  subject: z.string().min(1),
  module: z.string().min(1),
  submodule: z.string().min(1),
  format: z.enum(["short", "long"]),
  topic: z.string().min(3).max(160),
  lang: z.enum(["en", "hi"]).default("en"),
  freeOnly: z.boolean().optional(),
  script: z.record(z.unknown()),
});

const RATE_TRIES = 2;

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  const { format, topic, lang, freeOnly, script } = parsed.data;
  try {
    const { subject } = await resolveTaxonomy(parsed.data.subject, parsed.data.module, parsed.data.submodule);
    // Pass the PARSED script too, so buildRatingPrompt can compute the measured
    // pacing facts the new `pacing_density` section grades against. Parsing may
    // legitimately fail on a draft mid-repair; the rubric then simply omits the
    // facts block rather than failing the whole rating.
    const validated = sceneScriptSchema.safeParse(script);
    const prompt = buildRatingPrompt(JSON.stringify(script), {
      subject,
      format,
      topic,
      lang,
      ...(validated.success ? { script: validated.data } : {}),
    });
    for (let attempt = 1; attempt <= RATE_TRIES; attempt++) {
      const raw = await generateJson(prompt, "quality", { temperature: 0.15, ...(freeOnly ? { freeOnly } : {}) });
      const rating = normalizeRating(raw, subject.id);
      if (rating) return NextResponse.json({ rating });
    }
    return NextResponse.json({ error: "rating came back malformed" }, { status: 502 });
  } catch (err) {
    const status = err instanceof GeminiError ? 502 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "rate failed" }, { status });
  }
}

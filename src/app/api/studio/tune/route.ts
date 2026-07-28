import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJson, GeminiError } from "@/lib/gemini";
import { buildTunePrompt } from "@/lib/prompt";
import { resolveTaxonomy } from "@/lib/state";

const requestSchema = z.object({
  subject: z.string().min(1),
  module: z.string().min(1),
  submodule: z.string().min(1),
  format: z.enum(["short", "long"]),
  topic: z.string().min(3).max(160),
  sections: z
    .array(
      z.object({
        name: z.string(),
        score: z.number(),
        issues: z.array(z.object({ where: z.string(), problem: z.string(), fix: z.string() })).default([]),
      })
    )
    .min(1),
  existingDirectives: z.array(z.string()).default([]),
  freeOnly: z.boolean().optional(),
});

/** Turn a below-bar rating into 1-3 durable generation directives for the submodule. */
export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  const { format, topic, sections, existingDirectives, freeOnly } = parsed.data;
  try {
    const { subject } = await resolveTaxonomy(parsed.data.subject, parsed.data.module, parsed.data.submodule);
    const raw = await generateJson(
      buildTunePrompt({ subject, format, topic, sections, existingDirectives }),
      "fast",
      { temperature: 0.4, ...(freeOnly ? { freeOnly } : {}) }
    );
    const list = (raw as { directives?: unknown }).directives;
    const directives = Array.isArray(list)
      ? list.map((d) => String(d).trim()).filter((d) => d.length > 3 && d.length <= 400).slice(0, 3)
      : [];
    return NextResponse.json({ directives });
  } catch (err) {
    const status = err instanceof GeminiError ? 502 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "tune failed" }, { status });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJson, geminiQuotaSnapshot, GeminiError } from "@/lib/gemini";
import { buildTopicsPrompt } from "@/lib/prompt";
import { coveredTopics, resolveTaxonomy } from "@/lib/state";

const requestSchema = z.object({
  subject: z.string().min(1),
  module: z.string().min(1),
  submodule: z.string().min(1),
});

const topicsSchema = z.object({
  topics: z
    .array(z.object({ title: z.string().min(8).max(110), angle: z.string().max(160).optional() }))
    .min(5)
    .max(12),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "expected {subject, module, submodule} ids" }, { status: 400 });
  }
  try {
    const { subject, module: module_, submodule } = await resolveTaxonomy(
      parsed.data.subject,
      parsed.data.module,
      parsed.data.submodule
    );
    const covered = await coveredTopics(subject.label, module_.label, submodule.label);
    const siblingLabels = module_.submodules.filter((s) => s.id !== submodule.id).map((s) => s.label);
    // topics are the easy call — run them on the high-quota lite chain first
    const raw = await generateJson(
      buildTopicsPrompt({
        subject,
        moduleLabel: module_.label,
        submoduleLabel: submodule.label,
        moduleStyle: module_.style,
        submoduleStyle: submodule.style,
        covered,
        siblingLabels,
      }),
      "fast"
    );
    const topics = topicsSchema.safeParse(raw);
    if (!topics.success) {
      return NextResponse.json({ error: "topic list failed validation, try again" }, { status: 502 });
    }
    return NextResponse.json({ topics: topics.data.topics, covered: covered.length, quota: await geminiQuotaSnapshot() });
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : String(err).slice(0, 300);
    return NextResponse.json({ error: message, quota: await geminiQuotaSnapshot().catch(() => undefined) }, { status: 502 });
  }
}

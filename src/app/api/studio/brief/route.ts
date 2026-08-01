import { NextResponse } from "next/server";
import { z } from "zod";
import { generateJson, geminiQuotaSnapshot, GeminiError } from "@/lib/gemini";
import { buildCreatorBriefPrompt } from "@/lib/prompt";
import { resolveTaxonomy } from "@/lib/state";

/**
 * One cached research pass per submodule (row 13.2). Called 373 times by
 * `scripts/brief-backfill.mjs` and then effectively never again, so it runs on
 * the "fast" chain like `topics` rather than the quality chain — this is recall
 * and structuring, not script writing.
 *
 * The route does NOT write `content/briefs.json`. The backfill script owns that
 * file, the same way `state.ts` owns history/subjects and `save` owns
 * `content/videos/` — one writer per piece of state.
 */
const requestSchema = z.object({
  subject: z.string().min(1),
  module: z.string().min(1),
  submodule: z.string().min(1),
  freeOnly: z.boolean().optional(),
});

const briefSchema = z.object({
  hookAngles: z.array(z.string().min(4).max(160)).min(1).max(4),
  runningExamples: z.array(z.string().min(4).max(200)).min(1).max(4),
  misconception: z.object({ myth: z.string().min(4).max(240), fact: z.string().min(4).max(240) }).optional(),
  payoff: z.string().min(8).max(300),
  anchors: z.array(z.string().min(2).max(200)).min(1).max(6),
  avoid: z.array(z.string().min(4).max(240)).min(1).max(4),
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
    const raw = await generateJson(
      buildCreatorBriefPrompt({
        subject,
        moduleLabel: module_.label,
        submoduleLabel: submodule.label,
        moduleStyle: module_.style,
        submoduleStyle: submodule.style,
        siblingLabels: module_.submodules.filter((s) => s.id !== submodule.id).map((s) => s.label),
      }),
      "fast",
      parsed.data.freeOnly ? { freeOnly: parsed.data.freeOnly } : undefined
    );
    const brief = briefSchema.safeParse(raw);
    if (!brief.success) {
      return NextResponse.json(
        { error: `brief failed validation: ${brief.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ brief: brief.data, quota: await geminiQuotaSnapshot() });
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : String(err).slice(0, 300);
    return NextResponse.json({ error: message, quota: await geminiQuotaSnapshot().catch(() => undefined) }, { status: 502 });
  }
}

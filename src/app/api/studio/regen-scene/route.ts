import { NextResponse } from "next/server";
import { z } from "zod";
import { sceneScriptSchema, type SceneScript } from "@/studio/schema";
import { generateJson, GeminiError } from "@/lib/gemini";
import { buildRegenScenePrompt, buildRepairPrompt } from "@/lib/prompt";
import { sanitizeScript } from "@/lib/sanitize";

const requestSchema = z.object({
  script: z.unknown(),
  sceneId: z.string().min(1),
});

const RETRIES = 1;

function summarize(scene: SceneScript["scenes"][number] | undefined): string | undefined {
  if (!scene) return undefined;
  return `(${scene.kind}) ${JSON.stringify(scene).slice(0, 320)}`;
}

/** Runs the raw model output through the script-level sanitizer as a one-scene script. */
function sanitizeScene(raw: unknown): unknown {
  const wrapped = sanitizeScript({ scenes: [raw] }) as { scenes?: unknown[] };
  return wrapped.scenes?.[0] ?? raw;
}

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "expected {script, sceneId}" }, { status: 400 });
  }
  const scriptParsed = sceneScriptSchema.safeParse(parsed.data.script);
  if (!scriptParsed.success) {
    return NextResponse.json({ error: "script failed validation — apply valid JSON first" }, { status: 400 });
  }
  const script = scriptParsed.data;
  const index = script.scenes.findIndex((s) => s.id === parsed.data.sceneId);
  if (index === -1) {
    return NextResponse.json({ error: `scene "${parsed.data.sceneId}" not found` }, { status: 404 });
  }

  const scene = script.scenes[index];
  const prompt = buildRegenScenePrompt({
    format: script.format,
    subject: script.subject,
    moduleLabel: script.module,
    submoduleLabel: script.submodule,
    topic: script.topic,
    sceneJson: JSON.stringify(scene, null, 1),
    sceneId: scene.id,
    sceneIndex: index,
    sceneCount: script.scenes.length,
    beforeSummary: summarize(script.scenes[index - 1]),
    afterSummary: summarize(script.scenes[index + 1]),
  });

  try {
    let raw = sanitizeScene(await generateJson(prompt));
    for (let attempt = 0; ; attempt++) {
      const candidate = { ...(raw as Record<string, unknown>), id: scene.id };
      const updated = {
        ...script,
        scenes: script.scenes.map((s, i) => (i === index ? candidate : s)),
      };
      const validated = sceneScriptSchema.safeParse(updated);
      if (validated.success) {
        return NextResponse.json({ script: validated.data, sceneIndex: index });
      }
      if (attempt >= RETRIES) {
        const details = validated.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
        return NextResponse.json({ error: `rewritten scene failed validation: ${details.join("; ")}` }, { status: 502 });
      }
      const errors = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
      raw = sanitizeScene(await generateJson(buildRepairPrompt(JSON.stringify(candidate), errors)));
    }
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : String(err).slice(0, 300);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { sceneScriptSchema, narrationWordCount, firstAdjacentBigtext, vocabExampleMissingWord, bigtextAfterLastQuestion, firstBeatFormulaic, shortSceneOverdense, unknownSceneKeys, NARRATION_BUDGET, type SceneScript } from "@/studio/schema";
import { generateJson, geminiQuotaSnapshot, GeminiError } from "@/lib/gemini";
import { buildScriptPrompt, buildRepairPrompt, buildBlueprintPrompt, buildScriptFromBlueprintPrompt, buildCritiquePrompt, buildRefinePrompt, ENHANCED_SUBJECTS, type ScriptCritique } from "@/lib/prompt";
import { sanitizeScript } from "@/lib/sanitize";
import { enhanceVideoMeta } from "@/lib/videoMeta";
import { coveredTopics, resolveTaxonomy } from "@/lib/state";
import { staticCardOverrun, overlongBeats, definitionOpener, tooManyBigtext, crutchPhrases, runningExampleWeak, jargonUnanchored, unbrokenClause } from "@/studio/pacing";

/**
 * Pacing/voice soft gates, in the order a viewer would notice them. Each returns
 * null when clean and a repair-ready `detail` otherwise; thresholds are tuned in
 * `pacing.ts` so each fires on roughly the worst quartile rather than on any
 * violation — five gates at their natural settings tripped 81 of 88 historic
 * scripts, and the factory already exhausts its attempts on 72 of 86 slots.
 */
const PACING_GATES: { label: string; run: (s: SceneScript) => { detail: string } | null }[] = [
  { label: "definition opener", run: definitionOpener },
  { label: "too many title cards", run: tooManyBigtext },
  { label: "frozen card", run: staticCardOverrun },
  { label: "beat length", run: overlongBeats },
  { label: "filler openers", run: crutchPhrases },
  { label: "no breathing room", run: unbrokenClause },
  { label: "no running example", run: runningExampleWeak },
  { label: "unexplained jargon", run: jargonUnanchored },
];

const requestSchema = z.object({
  subject: z.string().min(1),
  module: z.string().min(1),
  submodule: z.string().min(1),
  format: z.enum(["short", "long"]),
  topic: z.string().min(3).max(120),
  angle: z.string().max(160).optional(),
  lang: z.enum(["en", "hi"]).default("en"),
  model: z.string().max(60).optional(),
  keyId: z.string().max(40).optional(),
  freeOnly: z.boolean().optional(),
  // 24, not 12: content-factory.mjs posts the whole persisted list for a slot, and
  // 16 of the 27 keys in content/factory/directives.json already hold 14-15 entries.
  // Every request for those slots was rejected with a 400 before reaching Gemini,
  // so each remaining attempt failed identically — a live contributor to the 72 of
  // 86 slots sitting below bar. The factory now also slices to this ceiling.
  directives: z.array(z.string().max(400)).max(24).optional(),
  exemplarScript: z.string().max(60000).optional(),
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
  const { format, topic, angle, lang, model, keyId, freeOnly, directives, exemplarScript } = parsed.data;
  const gen =
    model || keyId || freeOnly
      ? { ...(model ? { model } : {}), ...(keyId ? { keyId } : {}), ...(freeOnly ? { freeOnly } : {}) }
      : undefined;
  // The blueprint/critique stages don't take a model/key pin, but they must still
  // honor freeOnly so an automated run never bills via a planning/review sub-call.
  const fastOpts = freeOnly ? { freeOnly } : undefined;

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

        const promptOpts = {
          subject,
          moduleLabel: module_.label,
          submoduleLabel: submodule.label,
          moduleStyle: module_.style,
          submoduleStyle: submodule.style,
          format,
          topic,
          angle,
          recentTopics,
          lang,
          directives,
          exemplarScript,
        };

        let raw: unknown;
        if (ENHANCED_SUBJECTS.has(subject.id)) {
          /* Creator pipeline: blueprint → script → critique → refine. The blueprint
           * and critique stages are best-effort — if either fails, generation falls
           * through to the plain path / ships the draft rather than dying. */
          let blueprint: unknown = null;
          emit({ stage: "planning" });
          try {
            blueprint = await generateJson(
              buildBlueprintPrompt({ ...promptOpts, exemplar: module_.exemplars?.[format] }),
              "fast",
              fastOpts
            );
          } catch {
            blueprint = null;
          }
          emit({ stage: "writing" });
          raw = sanitizeScript(
            await generateJson(
              blueprint ? buildScriptFromBlueprintPrompt(JSON.stringify(blueprint), promptOpts) : buildScriptPrompt(promptOpts),
              "quality",
              gen
            )
          );
          try {
            emit({ stage: "reviewing" });
            const critique = (await generateJson(
              buildCritiquePrompt(JSON.stringify(raw), { subject, format, topic, lang }),
              "fast",
              fastOpts
            )) as Partial<ScriptCritique> | null;
            const issues = Array.isArray(critique?.issues)
              ? critique.issues.filter((i) => i && typeof i.problem === "string" && typeof i.fix === "string")
              : [];
            if (critique?.verdict === "revise" && issues.length > 0) {
              emit({ stage: "refining" });
              raw = sanitizeScript(
                await generateJson(buildRefinePrompt(JSON.stringify(raw), JSON.stringify(issues), { subject, format, topic }), "quality", gen)
              );
            }
          } catch {
            /* keep the un-refined draft; validation below still gates it */
          }
        } else {
          emit({ stage: "writing" });
          raw = sanitizeScript(await generateJson(buildScriptPrompt(promptOpts), "quality", gen));
        }
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
              const target = Math.round((budget.min + budget.max) / 2);
              issues.push(
                words > budget.max
                  ? `total spoken narration is ${words} words but a ${format} must be ${budget.min}-${budget.max} — cut about ${words - budget.max} words: tighten every beat, keep every scene's meaning`
                  : `total spoken narration is only ${words} words but a ${format} must be ${budget.min}-${budget.max}: add about ${target - words} more words of REAL teaching. Depth comes from MORE BEATS, not longer ones: no single beat may exceed ~24 spoken words, because a beat is one visual step and the picture cannot change while it is still being read. Add the missing mechanism step, the worked number, the trade-off — split each into its own beat with its own visual. Do NOT add filler, new sign-off cards, or repeat yourself.`
              );
            }
            const bt = firstAdjacentBigtext(validated.data);
            if (bt >= 0) {
              issues.push(
                `scenes ${bt + 1}-${bt + 2} are both "bigtext" section cards with no teaching scene between them — replace the second card, or the content it introduces, with a real diagram/bullets/compare/chart/steps scene (a bare title card teaches nothing)`
              );
            }
            const vId = vocabExampleMissingWord(validated.data);
            if (vId) {
              issues.push(
                `the vocab scene "${vId}" has example sentences that never actually use its word/phrase — rewrite every example so it literally contains the word, used naturally in a real sentence (not a description of the meaning)`
              );
            }
            const outro = bigtextAfterLastQuestion(validated.data);
            if (outro >= 0) {
              issues.push(
                `scene ${outro + 1} is a "bigtext" that comes AFTER the ending question — delete it. The question is the finale; no "thank you for watching", "stay curious" or recap card may follow it`
              );
            }
            const hook = firstBeatFormulaic(validated.data);
            if (hook) {
              issues.push(
                `the opening beat "${hook}…" uses a tired formulaic hook — rewrite the first beat with a fresh opener (a shocking number, a concrete mini-scene, or a blunt myth-strike), NOT "Have you ever…/Did you know…/Think you…/You think…"`
              );
            }
            const dense = shortSceneOverdense(validated.data);
            if (dense) {
              issues.push(
                `scene "${dense.id}" is too dense for a 9:16 short — ${dense.detail}. The YouTube UI covers the bottom quarter and right edge, so split it into two scenes or drop the least important items`
              );
            }
            // Pacing/voice gates from studio/pacing.ts. Their `detail` strings are
            // already written as repair instructions, so they are pushed verbatim.
            for (const gate of PACING_GATES) {
              const hit = gate.run(validated.data);
              if (hit) issues.push(hit.detail);
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
              if (vocabExampleMissingWord(validated.data)) {
                warnings.push("a vocab example does not use the word it teaches");
              }
              if (bigtextAfterLastQuestion(validated.data) >= 0) {
                warnings.push("a section/outro card appears after the ending question");
              }
              if (firstBeatFormulaic(validated.data)) {
                warnings.push("the opening hook uses a formulaic opener");
              }
              const dense = shortSceneOverdense(validated.data);
              if (dense) {
                warnings.push(`scene "${dense.id}" may crowd behind the YouTube UI (${dense.detail})`);
              }
              for (const gate of PACING_GATES) {
                const hit = gate.run(validated.data);
                if (hit) warnings.push(`${gate.label}: ${hit.detail}`);
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
          raw = sanitizeScript(await generateJson(buildRepairPrompt(JSON.stringify(raw), issues.join("\n")), "quality", gen));
        }

        if (!accepted) throw new Error("validation loop exited without a script");
        // Surface invented properties zod silently stripped (#13/#26) — the scene still
        // renders (the key is gone), so this warns for prompt-tuning rather than repairs.
        const invented = unknownSceneKeys((raw as { scenes?: unknown }).scenes, accepted);
        if (invented.length) {
          const preview = invented.slice(0, 4).map((s) => `${s.id}: ${s.keys.join(", ")}`).join("; ");
          console.warn(`[generate] dropped unknown scene keys — ${preview}`);
          warnings.push(`ignored unsupported field(s) the model invented (${preview})`);
        }
        const script = {
          ...accepted,
          lang,
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

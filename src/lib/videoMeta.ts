import { z } from "zod";
import { generateJson } from "@/lib/gemini";
import { metaSchema, type SceneScript, type VideoMeta } from "@/studio/schema";

/** What the video actually covers, distilled for the metadata prompt. */
function sceneInventory(script: SceneScript): string {
  const lines: string[] = [];
  for (const s of script.scenes) {
    switch (s.kind) {
      case "bigtext":
        lines.push(`section: ${s.text}`);
        break;
      case "stat":
        lines.push(`stat shown: ${s.value} — ${s.label}`);
        break;
      case "chart":
        lines.push(`chart: ${s.title} (${s.items.map((i) => i.label).join(", ")})`);
        break;
      case "mythfact":
        lines.push(`myth busted: ${s.myth}`);
        break;
      case "quiz":
        lines.push(`quiz: ${s.question}`);
        break;
      case "vocab":
        lines.push(`word taught: ${s.word}`);
        break;
      case "code":
        lines.push(`code demo: ${s.title} (${s.lang})`);
        break;
      case "question":
        lines.push(`ending question: ${s.text}`);
        break;
      case "quote":
        if (s.author) lines.push(`quote by ${s.author}`);
        break;
      case "bullets":
      case "diagram":
      case "compare":
      case "timeline":
      case "steps":
        lines.push(`${s.kind}: ${s.title}`);
        break;
      case "terminal":
        break;
    }
  }
  return lines.slice(0, 18).join("\n");
}

const responseSchema = z.object({
  title: z.string().min(10).max(120),
  description: z.string().min(40).max(3800),
  tags: z.array(z.string().min(2).max(40)).min(4).max(24),
  hashtags: z.array(z.string()).min(2).max(12),
});

function buildMetaPrompt(script: SceneScript): string {
  const isShort = script.format === "short";
  const hi = (script as { lang?: string }).lang === "hi";
  const langLine = hi
    ? `\nLANGUAGE: this is a HINDI video. Write the title and description in natural Hindi (Devanagari),
keeping searched English/proper terms as-is (Article 21, UPSC, GDP). tags & hashtags: include BOTH
Hindi and English search phrases people actually type. Hashtags stay ASCII (#UPSC, #Polity, #Hindi).\n`
    : "";
  return `You optimize YouTube metadata for an education channel so videos rank in search AND earn the click.
${langLine}
Video: ${isShort ? "9:16 Short (45-90s)" : "16:9 long-form (6-12 min)"}
Subject: ${script.subject} → ${script.module} → ${script.submodule}
Topic: ${script.topic}
What the video actually covers:
${sceneInventory(script)}

Current draft metadata (improve it; keep anything already strong):
title: ${script.meta.title}
description: ${script.meta.description.split("\n").slice(0, 4).join(" / ")}
tags: ${script.meta.tags.join(", ")}

Rules:
- "title": 35-${isShort ? "70" : "90"} chars${isShort ? ', MUST end with " #Shorts"' : ""}. Lead with the exact phrase people
  search (the concrete concept), then the curiosity gap. Proven shapes: "How X actually works",
  "Why X ...", "X vs Y: ...", "The X mistake ...", "What happens when ...". Use a number only if the
  video truly shows it. No clickbait lies, no ALL-CAPS words, no emoji.${
    isShort ? "\n  Shorts titles get truncated in the feed — front-load the payoff in the first ~40 chars." : ""
  }
- "description": lines 1-2 are the search hook — restate the topic using the exact phrases viewers
  type into YouTube (these first ~120 chars are the snippet). Then 3-5 short lines on what the viewer
  will learn, using the concrete facts covered above. Then ONE line inviting them to answer the
  ending question in the comments. Close with one natural sentence that weaves in 2-3 RELATED search
  phrases (things people also search around this topic) — a sentence, not a keyword dump.
  NO links, NO hashtags, NO timestamps (those are added automatically).
- "tags": 12-15, each under 30 chars. The FIRST tag must be the exact main search phrase for this
  video. Then: broad subject terms, the specific concepts/entities covered, common variations
  (singular/plural, abbreviation vs full form), and 2-3 learner phrases
  (e.g. "${script.submodule.toLowerCase()} tutorial", "learn ${script.submodule.toLowerCase()}").
- "hashtags": 5-8, ASCII letters/digits only. Mix reach and niche: ${
    isShort ? '"#Shorts" first, then ' : ""
  }1-2 broad (#Coding, #Science), 2-3 topic-specific (#JavaScript, #DNS), 1-2 audience ones
  (#LearnToCode, #ExamPrep). The first three are shown above the title — order them by relevance.

Return STRICT JSON only: {"title":"...","description":"...","tags":["..."],"hashtags":["#..."]}`;
}

const SHORTS_SUFFIX = " #Shorts";
const TITLE_MAX = 95;
const HASHTAG_RE = /^#[A-Za-z0-9]+$/;

/**
 * Focused metadata pass over a validated script. Returns metaSchema-valid meta
 * (so downstream save/upload validation can never break) or the script's own
 * meta when the model call/shape fails.
 */
export async function enhanceVideoMeta(
  script: SceneScript
): Promise<{ meta: VideoMeta; source: "gemini" | "script" }> {
  try {
    const raw = await generateJson(buildMetaPrompt(script), "fast");
    const parsed = responseSchema.parse(raw);

    let title = parsed.title.trim().replace(/\s+/g, " ");
    if (script.format === "short" && !/#shorts$/i.test(title)) {
      title = `${title.slice(0, TITLE_MAX - SHORTS_SUFFIX.length).trimEnd()}${SHORTS_SUFFIX}`;
    }
    const candidate: VideoMeta = metaSchema.parse({
      title: title.slice(0, TITLE_MAX),
      description: parsed.description.trim().slice(0, 3500),
      tags: parsed.tags.map((t) => t.trim().slice(0, 30)).filter((t) => t.length >= 2).slice(0, 15),
      hashtags: parsed.hashtags.map((h) => h.trim()).filter((h) => HASHTAG_RE.test(h)).slice(0, 8),
    });
    return { meta: candidate, source: "gemini" };
  } catch {
    return { meta: script.meta, source: "script" };
  }
}

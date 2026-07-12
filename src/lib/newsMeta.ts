import { z } from "zod";
import { generateJson } from "@/lib/gemini";
import type { NewsStory } from "@/lib/news";

const APP_LINK =
  process.env.APP_LINK ?? "https://play.google.com/store/apps/details?id=com.prashant.tldrbharat";

/** News category → YouTube categoryId (default 25 News & Politics). */
const YT_CATEGORY_BY_NEWS: Record<string, string> = {
  Sports: "17",
  Technology: "28",
  Entertainment: "24",
  Horoscope: "24",
  Education: "27",
};
const YT_NEWS_AND_POLITICS = "25";

export function ytCategoryFor(newsCategory: string): string {
  return YT_CATEGORY_BY_NEWS[newsCategory] ?? YT_NEWS_AND_POLITICS;
}

export type NewsMeta = {
  title: string;
  description: string;
  tags: string[];
  source: "gemini" | "template";
};

const responseSchema = z.object({
  title: z.string().min(10).max(110),
  description: z.string().min(20).max(2500),
  tags: z.array(z.string().min(2).max(40)).min(5).max(20),
  hashtags: z.array(z.string().regex(/^#\S{2,30}$/)).min(2).max(8),
});

function buildPrompt(opts: { lang: string; category: string; stories: NewsStory[] }): string {
  const { lang, category, stories } = opts;
  const language = lang === "hi" ? "Hindi (Devanagari script)" : "English";
  const storyLines = stories
    .map((s, i) => `${i + 1}. ${s.title}${s.bullets?.length ? `\n   - ${s.bullets.join("\n   - ")}` : ""}`)
    .join("\n");
  return `You write high-CTR YouTube Shorts metadata for "Bharat Briefs", a daily Indian news channel.
Write ALL metadata in ${language}.

Category: ${category}. Today's ${stories.length} stories:
${storyLines}

Rules:
- "title": <=90 chars and it MUST end with " #Shorts". Lead with the most gripping concrete story
  angle (a name, a number, a decision) — never a generic label like "News Today". Include one search
  keyword people actually type (e.g. the company/person/place). No ALL-CAPS words, no fake claims.
- "description": line 1 is a hook with the main search keywords (this line decides search ranking);
  then one short line per story starting with "• "; nothing else. Do NOT include links or hashtags —
  they are appended automatically.
- "tags": 10-15 — mix broad (india news, daily news, ${category.toLowerCase()}) with the specific
  entities in these stories (people, companies, places, events).
- "hashtags": 3-6, first "#Shorts", then topical ones like #IndiaNews #${category.replace(/[^A-Za-z0-9ऀ-ॿ]/g, "")}.

Return STRICT JSON only:
{"title":"...","description":"...","tags":["..."],"hashtags":["#..."]}`;
}

/** Ask Gemini for SEO metadata; on any failure return the renderer's template meta unchanged. */
export async function enhanceNewsMeta(opts: {
  lang: string;
  category: string;
  stories: NewsStory[];
  fallback: { title: string; description: string; tags: string[] };
}): Promise<NewsMeta> {
  try {
    const raw = await generateJson(buildPrompt(opts), "fast");
    const parsed = responseSchema.parse(raw);
    let title = parsed.title.trim();
    if (!/#Shorts$/i.test(title)) title = `${title.slice(0, 81).trimEnd()} #Shorts`;
    const description =
      `${parsed.description.trim()}` +
      `\n\n📲 Get Bharat Briefs on Google Play (5 languages, free):\n${APP_LINK}` +
      `\n\n${parsed.hashtags.join(" ")}`;
    return {
      title: title.slice(0, 100),
      description: description.slice(0, 4900),
      tags: parsed.tags.map((t) => t.slice(0, 40)).slice(0, 15),
      source: "gemini",
    };
  } catch {
    return { ...opts.fallback, source: "template" };
  }
}

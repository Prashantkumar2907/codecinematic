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
  /** YouTube */
  title: string;
  description: string;
  tags: string[];
  /** Instagram Reels caption (hashtag-rich, no clickable link — "link in bio"). */
  instagramCaption: string;
  /** Facebook Reels caption (clickable app link, moderate hashtags). */
  facebookCaption: string;
  source: "gemini" | "template";
};

const responseSchema = z.object({
  title: z.string().min(10).max(110),
  description: z.string().min(20).max(2500),
  tags: z.array(z.string().min(2).max(40)).min(5).max(20),
  hashtags: z.array(z.string().regex(/^#\S{2,30}$/)).min(2).max(8),
  igHashtags: z.array(z.string().regex(/^#\S{2,30}$/)).min(6).max(25).optional(),
});

/**
 * Each platform surfaces text differently, so we tune per platform rather than
 * reuse one blob:
 *  - YouTube: title + long description; only the first ~3 hashtags render as
 *    chips and >15 makes YouTube ignore ALL of them, so keep it tight; tags[]
 *    and categoryId are separate API fields.
 *  - Instagram Reels: one caption field, links are NOT clickable (so "link in
 *    bio"), and hashtags still aid reach — 10-20 relevant ones is the sweet spot.
 *  - Facebook Reels: one description field, links ARE clickable, hashtags help
 *    less — a handful is enough.
 */
export function buildPlatformCaptions(opts: {
  hookAndBody: string;
  ytHashtags: string[];
  igHashtags: string[];
}): { instagramCaption: string; facebookCaption: string } {
  const { hookAndBody, ytHashtags, igHashtags } = opts;
  const instagramCaption = `${hookAndBody}\n\n📲 Bharat Briefs — daily news in 5 languages. Link in bio.\n\n${igHashtags.join(" ")}`.slice(0, 2190);
  const facebookCaption = `${hookAndBody}\n\n📲 Get the Bharat Briefs app (5 languages, free):\n${APP_LINK}\n\n${ytHashtags.join(" ")}`.slice(0, 4900);
  return { instagramCaption, facebookCaption };
}

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
- "tags": 12-15 — the FIRST tag is the main search phrase for today's lead story; then broad terms
  (india news, daily news, ${category.toLowerCase()}) and the specific entities in these stories
  (people, companies, places, events).
- "hashtags": 5-8 for YouTube, first "#Shorts", then topical ones like #IndiaNews #${category.replace(/[^A-Za-z0-9ऀ-ॿ]/g, "")}
  plus 1-2 entity tags from the lead stories (#Cricket, #ISRO) — order by relevance.
- "igHashtags": 12-20 for Instagram Reels — a broader mix: reach tags (#news #india
  #trending #reels #viral), topical (#${category.replace(/[^A-Za-z0-9ऀ-ॿ]/g, "")} #IndiaNews #currentaffairs),
  and the specific entities/people/places from today's stories. Do NOT include "#Shorts". No duplicates.

Return STRICT JSON only:
{"title":"...","description":"...","tags":["..."],"hashtags":["#..."],"igHashtags":["#..."]}`;
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
    const body = parsed.description.trim();
    const description = `${body}\n\n📲 Get Bharat Briefs on Google Play (5 languages, free):\n${APP_LINK}\n\n${parsed.hashtags.join(" ")}`;
    const igHashtags = (parsed.igHashtags?.length ? parsed.igHashtags : parsed.hashtags.filter((h) => !/^#shorts$/i.test(h)));
    const { instagramCaption, facebookCaption } = buildPlatformCaptions({
      hookAndBody: body,
      ytHashtags: parsed.hashtags.filter((h) => !/^#shorts$/i.test(h)),
      igHashtags,
    });
    return {
      title: title.slice(0, 100),
      description: description.slice(0, 4900),
      tags: parsed.tags.map((t) => t.slice(0, 40)).slice(0, 15),
      instagramCaption,
      facebookCaption,
      source: "gemini",
    };
  } catch {
    const { instagramCaption, facebookCaption } = buildPlatformCaptions({
      hookAndBody: opts.fallback.title.replace(/ #Shorts$/i, ""),
      ytHashtags: [],
      igHashtags: [],
    });
    return { ...opts.fallback, instagramCaption, facebookCaption, source: "template" };
  }
}

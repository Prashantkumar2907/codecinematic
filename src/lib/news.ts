import fs from "node:fs/promises";
import path from "node:path";

/**
 * Channel + news-draft state for the News tab. Channels are configured in
 * content/channels.json (expandable — add an entry + its 3 secrets). A channel
 * is selected purely by which OAuth triple its `creds` env names resolve to,
 * exactly like the tldr-social GitHub Action.
 */

const CONTENT_DIR = path.join(process.cwd(), "content");
const CHANNELS_PATH = path.join(CONTENT_DIR, "channels.json");
const NEWS_DIR = path.join(CONTENT_DIR, "news");

export type ChannelCredEnv = { clientId: string; clientSecret: string; refreshToken: string };
export type ChannelConfig = {
  id: string;
  /** "news" channels appear in the News tab; "teaching" channels receive Create uploads by subject. */
  type?: "news" | "teaching";
  label: string;
  lang: string;
  voice: string;
  defaultCategories: string[];
  /** Teaching channels: subject LABELS whose videos publish to this channel. */
  subjects?: string[];
  creds: ChannelCredEnv;
};
type ChannelsFile = { categories: string[]; channels: ChannelConfig[] };

/** Channel shape safe to send to the browser (no secret values). */
export type ChannelPublic = {
  id: string;
  label: string;
  lang: string;
  voice: string;
  defaultCategories: string[];
  hasCreds: boolean;
};

export type NewsStory = { title: string; bullets?: string[] };
export type NewsInfo = {
  slug: string;
  channelId: string;
  channelLabel: string;
  category: string;
  lang: string;
  createdAt: string;
  title: string;
  description: string;
  tags: string[];
  /** YouTube categoryId for the upload (mapped from the news category). */
  categoryId?: string;
  /** Whether title/description/tags were AI-optimized or fell back to the template. */
  metaSource?: "gemini" | "template";
  stories: NewsStory[];
  videoBytes: number;
  videoId?: string;
  uploadedAt?: string;
  privacy?: string;
  publishAt?: string;
};

async function readChannelsFile(): Promise<ChannelsFile> {
  const raw = JSON.parse(await fs.readFile(CHANNELS_PATH, "utf8")) as ChannelsFile;
  if (!Array.isArray(raw.channels)) throw new Error("channels.json has no channels array");
  return raw;
}

export async function readCategories(): Promise<string[]> {
  return (await readChannelsFile()).categories ?? [];
}

export function channelCreds(ch: ChannelConfig): ChannelCredEnv | null {
  const clientId = process.env[ch.creds.clientId];
  const clientSecret = process.env[ch.creds.clientSecret];
  const refreshToken = process.env[ch.creds.refreshToken];
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

export async function listChannels(): Promise<ChannelPublic[]> {
  const { channels } = await readChannelsFile();
  return channels
    .filter((c) => (c.type ?? "news") === "news")
    .map((c) => ({
      id: c.id,
      label: c.label,
      lang: c.lang,
      voice: c.voice,
      defaultCategories: c.defaultCategories,
      hasCreds: channelCreds(c) !== null,
    }));
}

export async function resolveChannel(id: string): Promise<ChannelConfig> {
  const { channels } = await readChannelsFile();
  const ch = channels.find((c) => c.id === id);
  if (!ch) throw new Error(`unknown channel: ${id}`);
  return ch;
}

/** Teaching channel that owns a subject label, or null (caller falls back to YT_* env). */
export async function teachingChannelForSubject(subjectLabel: string): Promise<ChannelConfig | null> {
  const { channels } = await readChannelsFile();
  return channels.find((c) => c.type === "teaching" && c.subjects?.includes(subjectLabel)) ?? null;
}

/** subject label → teaching channel label, for showing where a video will publish. */
export async function teachingChannelMap(): Promise<Record<string, string>> {
  const { channels } = await readChannelsFile();
  const map: Record<string, string> = {};
  for (const c of channels) {
    if (c.type !== "teaching") continue;
    for (const s of c.subjects ?? []) map[s] = c.label;
  }
  return map;
}

export function newsDir(slug: string): string {
  return path.join(NEWS_DIR, slug);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function readNewsInfo(slug: string): Promise<NewsInfo | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(NEWS_DIR, slug, "info.json"), "utf8")) as NewsInfo;
  } catch {
    return null;
  }
}

export async function writeNewsInfo(info: NewsInfo): Promise<void> {
  const dir = path.join(NEWS_DIR, info.slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "info.json"), JSON.stringify(info, null, 2));
}

export async function markNewsUploaded(
  slug: string,
  patch: { videoId: string; uploadedAt: string; privacy: string; publishAt?: string }
): Promise<void> {
  const info = await readNewsInfo(slug);
  if (!info) return;
  await writeNewsInfo({ ...info, ...patch });
}

export async function deleteNewsDraft(slug: string): Promise<void> {
  await fs.rm(path.join(NEWS_DIR, slug), { recursive: true, force: true });
}

export async function listNewsDrafts(): Promise<NewsInfo[]> {
  let slugs: string[];
  try {
    slugs = (await fs.readdir(NEWS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const infos = await Promise.all(slugs.map((s) => readNewsInfo(s)));
  return infos.filter((i): i is NewsInfo => i !== null).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

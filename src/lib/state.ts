import fs from "node:fs/promises";
import path from "node:path";

/**
 * Sole writer of content/history.json and content/videos/.
 * Routes must mutate library state only through these functions.
 */

const CONTENT_DIR = path.join(process.cwd(), "content");
const VIDEOS_DIR = path.join(CONTENT_DIR, "videos");
const HISTORY_PATH = path.join(CONTENT_DIR, "history.json");
const SUBJECTS_PATH = path.join(CONTENT_DIR, "subjects.json");
const QUOTA_PATH = path.join(CONTENT_DIR, "quota.json");

export type Submodule = { id: string; label: string };
export type Module = { id: string; label: string; submodules: Submodule[] };
export type Subject = {
  id: string;
  label: string;
  audience: string;
  style: string;
  modules: Module[];
};

export type HistoryEntry = {
  date: string;
  subject: string;
  module: string;
  submodule: string;
  topic: string;
  title: string;
  format: "short" | "long";
  slug: string;
  status: "draft" | "uploaded";
  videoId?: string;
};

export async function readSubjects(): Promise<Subject[]> {
  const raw = JSON.parse(await fs.readFile(SUBJECTS_PATH, "utf8")) as { subjects: Subject[] };
  if (!Array.isArray(raw.subjects)) throw new Error("subjects.json has no subjects array");
  return raw.subjects;
}

export async function resolveTaxonomy(subjectId: string, moduleId: string, submoduleId: string) {
  const subjects = await readSubjects();
  const subject = subjects.find((s) => s.id === subjectId);
  const module_ = subject?.modules.find((m) => m.id === moduleId);
  const submodule = module_?.submodules.find((s) => s.id === submoduleId);
  if (!subject || !module_ || !submodule) {
    throw new Error(`unknown taxonomy: ${subjectId}/${moduleId}/${submoduleId}`);
  }
  return { subject, module: module_, submodule };
}

export async function readHistory(): Promise<HistoryEntry[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(HISTORY_PATH, "utf8")) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeHistory(entries: HistoryEntry[]): Promise<void> {
  await fs.writeFile(HISTORY_PATH, JSON.stringify(entries, null, 2));
}

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const history = await readHistory();
  history.push(entry);
  await writeHistory(history);
}

export async function markUploaded(slug: string, videoId: string): Promise<void> {
  const history = await readHistory();
  const entry = history.find((h) => h.slug === slug);
  if (entry) {
    entry.status = "uploaded";
    entry.videoId = videoId;
    await writeHistory(history);
  }
}

/** Gemini free-tier quota resets at midnight Pacific, not local midnight. */
function pacificDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

async function readQuota(): Promise<{ date: string; used: Record<string, number> }> {
  try {
    const parsed = JSON.parse(await fs.readFile(QUOTA_PATH, "utf8")) as { date?: string; used?: unknown };
    if (parsed.date === pacificDate()) {
      // pre-chain files stored one number; those requests were served by gemini-2.5-flash
      if (typeof parsed.used === "number") return { date: parsed.date, used: { "gemini-2.5-flash": parsed.used } };
      if (parsed.used && typeof parsed.used === "object") {
        return { date: parsed.date, used: parsed.used as Record<string, number> };
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return { date: pacificDate(), used: {} };
}

export async function recordGeminiRequest(model: string): Promise<void> {
  const quota = await readQuota();
  quota.used[model] = (quota.used[model] ?? 0) + 1;
  await fs.writeFile(QUOTA_PATH, JSON.stringify(quota, null, 2));
}

export async function geminiUsageToday(): Promise<Record<string, number>> {
  return (await readQuota()).used;
}

/** Topics already made for a submodule (any status) — used to exclude repeats. */
export async function coveredTopics(subjectLabel: string, moduleLabel: string, submoduleLabel: string): Promise<string[]> {
  const history = await readHistory();
  return history
    .filter((h) => h.subject === subjectLabel && h.module === moduleLabel && h.submodule === submoduleLabel)
    .map((h) => h.topic);
}

export type DraftInfo = {
  slug: string;
  hasVideo: boolean;
  hasThumbnail: boolean;
  videoBytes: number;
  savedAt: string;
  format: string;
  subject: string;
  module: string;
  submodule: string;
  topic: string;
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  videoId?: string;
};

export async function listDrafts(): Promise<DraftInfo[]> {
  let slugs: string[];
  try {
    slugs = (await fs.readdir(VIDEOS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const history = await readHistory();
  const drafts = await Promise.all(
    slugs.map(async (slug): Promise<DraftInfo | null> => {
      const dir = path.join(VIDEOS_DIR, slug);
      try {
        const raw = JSON.parse(await fs.readFile(path.join(dir, "script.json"), "utf8")) as Record<string, unknown>;
        const meta = (raw.meta ?? {}) as Record<string, unknown>;
        const videoStat = await fs.stat(path.join(dir, "video.webm")).catch(() => null);
        const thumbStat = await fs.stat(path.join(dir, "thumbnail.png")).catch(() => null);
        const entry = history.find((h) => h.slug === slug);
        return {
          slug,
          hasVideo: Boolean(videoStat),
          hasThumbnail: Boolean(thumbStat),
          videoBytes: videoStat?.size ?? 0,
          savedAt: videoStat?.mtime.toISOString() ?? "",
          format: String(raw.format ?? "short"),
          subject: String(raw.subject ?? ""),
          module: String(raw.module ?? raw.track ?? ""),
          submodule: String(raw.submodule ?? ""),
          topic: String(raw.topic ?? slug),
          title: String(meta.title ?? slug),
          description: String(meta.description ?? ""),
          tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
          hashtags: Array.isArray(meta.hashtags) ? meta.hashtags.map(String) : [],
          videoId: entry?.videoId,
        };
      } catch {
        return null;
      }
    })
  );
  return drafts
    .filter((d): d is DraftInfo => d !== null)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

export async function deleteDraft(slug: string): Promise<void> {
  await fs.rm(path.join(VIDEOS_DIR, slug), { recursive: true, force: true });
}

export function draftFilePath(slug: string, name: "video.webm" | "thumbnail.png" | "script.json"): string {
  return path.join(VIDEOS_DIR, slug, name);
}

export async function draftDir(slug: string): Promise<string> {
  const dir = path.join(VIDEOS_DIR, slug);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function videosDir() {
  return VIDEOS_DIR;
}

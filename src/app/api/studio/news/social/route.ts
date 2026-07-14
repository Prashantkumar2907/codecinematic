import { NextResponse } from "next/server";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { newsDir, readNewsInfo, markNewsSocial } from "@/lib/news";

/**
 * Publishes a rendered news short (already MP4/H.264 9:16) to Instagram Reels
 * and/or a Facebook Page as a Reel via the Meta Graph API. Both flows push the
 * LOCAL file with Meta's resumable upload protocol, so no public hosting of the
 * video is needed.
 *
 * Required in .env.local:
 *   META_ACCESS_TOKEN  — long-lived Page token (or System User token) with
 *                        pages_manage_posts, pages_read_engagement,
 *                        instagram_basic, instagram_content_publish
 *   META_PAGE_ID       — the Facebook Page id
 *   META_IG_USER_ID    — the Instagram professional-account user id linked to that Page
 */

const requestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  targets: z.array(z.enum(["instagram", "facebook"])).min(1).default(["instagram", "facebook"]),
});

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const RUPLOAD = `https://rupload.facebook.com/ig-api-upload/${process.env.META_GRAPH_VERSION || "v21.0"}`;
/** IG container processing can take a while for 60s clips. */
const IG_STATUS_TRIES = 30;
const IG_STATUS_INTERVAL_MS = 3000;

type GraphError = { error?: { message?: string; code?: number } };

async function graphJson<T>(res: Response, label: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || data.error) {
    throw new Error(`${label}: ${data.error?.message ?? `HTTP ${res.status}`}`);
  }
  return data;
}

/** Caption: title + hashtags derived from the video's tags (IG-style). */
function buildCaption(title: string, description: string, tags: string[]): string {
  const hashtags = tags
    .slice(0, 12)
    .map((t) => "#" + t.replace(/[^A-Za-z0-9ऀ-ॿ]/g, ""))
    .filter((h) => h.length > 2)
    .join(" ");
  const firstLine = description.split("\n").find((l) => l.trim()) ?? "";
  return [title, firstLine, hashtags].filter(Boolean).join("\n\n").slice(0, 2100);
}

async function publishInstagram(igUserId: string, token: string, file: Buffer, caption: string): Promise<string> {
  const create = await graphJson<{ id: string; uri?: string }>(
    await fetch(`${GRAPH}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "REELS",
        upload_type: "resumable",
        caption,
        access_token: token,
      }),
    }),
    "instagram create container"
  );

  const uploadUri = create.uri ?? `${RUPLOAD}/${create.id}`;
  await graphJson(
    await fetch(uploadUri, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        offset: "0",
        file_size: String(file.byteLength),
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(file),
    }),
    "instagram upload"
  );

  for (let i = 0; i < IG_STATUS_TRIES; i++) {
    const status = await graphJson<{ status_code?: string }>(
      await fetch(`${GRAPH}/${create.id}?fields=status_code&access_token=${encodeURIComponent(token)}`),
      "instagram container status"
    );
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR") throw new Error("instagram: container processing failed");
    if (i === IG_STATUS_TRIES - 1) throw new Error("instagram: container not ready after 90s");
    await new Promise((r) => setTimeout(r, IG_STATUS_INTERVAL_MS));
  }

  const publish = await graphJson<{ id: string }>(
    await fetch(`${GRAPH}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: create.id, access_token: token }),
    }),
    "instagram publish"
  );
  return publish.id;
}

async function publishFacebookReel(pageId: string, token: string, file: Buffer, description: string): Promise<string> {
  const start = await graphJson<{ video_id: string; upload_url: string }>(
    await fetch(`${GRAPH}/${pageId}/video_reels`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ upload_phase: "start", access_token: token }),
    }),
    "facebook start"
  );

  await graphJson(
    await fetch(start.upload_url, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        offset: "0",
        file_size: String(file.byteLength),
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(file),
    }),
    "facebook upload"
  );

  await graphJson(
    await fetch(`${GRAPH}/${pageId}/video_reels`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        upload_phase: "finish",
        video_id: start.video_id,
        video_state: "PUBLISHED",
        description,
        access_token: token,
      }),
    }),
    "facebook finish"
  );
  return start.video_id;
}

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "expected {slug, targets?: ['instagram'|'facebook']}" }, { status: 400 });
  }
  const { slug, targets } = parsed.data;

  const token = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  const igUserId = process.env.META_IG_USER_ID;
  if (!token || (targets.includes("facebook") && !pageId) || (targets.includes("instagram") && !igUserId)) {
    return NextResponse.json(
      { error: "set META_ACCESS_TOKEN, META_PAGE_ID and META_IG_USER_ID in .env.local (see route docs)" },
      { status: 500 }
    );
  }

  const info = await readNewsInfo(slug);
  if (!info) return NextResponse.json({ error: `news draft ${slug} not found` }, { status: 404 });
  const videoPath = path.join(newsDir(slug), "short.mp4");
  let file: Buffer;
  try {
    file = await fsp.readFile(videoPath);
  } catch {
    return NextResponse.json({ error: `video for ${slug} not found` }, { status: 404 });
  }

  const caption = buildCaption(info.title, info.description, info.tags);
  const results: Record<string, string> = {};
  const errors: Record<string, string> = {};
  const postedAt = new Date().toISOString();

  for (const target of targets) {
    try {
      if (target === "instagram") {
        const mediaId = await publishInstagram(igUserId!, token, file, caption);
        results.instagram = mediaId;
        await markNewsSocial(slug, { instagram: { mediaId, postedAt } });
      } else {
        const videoId = await publishFacebookReel(pageId!, token, file, caption);
        results.facebook = videoId;
        await markNewsSocial(slug, { facebook: { videoId, postedAt } });
      }
    } catch (err) {
      errors[target] = String(err instanceof Error ? err.message : err).slice(0, 300);
    }
  }

  const ok = Object.keys(results).length > 0;
  return NextResponse.json(
    { ok, results, errors: Object.keys(errors).length ? errors : undefined },
    { status: ok ? 200 : 502 }
  );
}

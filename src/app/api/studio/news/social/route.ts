import { NextResponse } from "next/server";
import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { z } from "zod";
import { newsDir, readNewsInfo, markNewsSocial } from "@/lib/news";
import { buildPlatformCaptions } from "@/lib/newsMeta";

const execFileAsync = promisify(execFile);

/**
 * Publishes a rendered news short to Instagram Reels and/or a Facebook Page Reel
 * via the Meta Graph API, pushing the LOCAL file (no public hosting).
 *
 * Two hard-won details baked in here:
 *  - The news renderer outputs a low-bitrate / mono-audio MP4. Facebook accepts
 *    it, but Instagram's ingestion stalls for minutes on it. So we re-encode to
 *    IG-friendly specs first (H.264 high, yuv420p, stereo 48kHz AAC, faststart)
 *    and cache it as short-social.mp4.
 *  - IG's resumable upload endpoint returns a spurious "ProcessingFailedError"
 *    body even when the bytes were accepted. So the upload is best-effort and we
 *    treat the CONTAINER STATUS poll as the real source of truth.
 *
 * .env.local: META_ACCESS_TOKEN, META_PAGE_ID, META_IG_USER_ID.
 */

const requestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  targets: z.array(z.enum(["instagram", "facebook"])).min(1).default(["instagram", "facebook"]),
});

const V = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${V}`;
const IG_STATUS_TRIES = 40;
const IG_STATUS_INTERVAL_MS = 3000;

type GraphError = { error?: { message?: string } };

async function graphJson<T>(res: Response, label: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || data.error) throw new Error(`${label}: ${data.error?.message ?? `HTTP ${res.status}`}`);
  return data;
}

/** Re-encode to an Instagram/Facebook-Reels-safe MP4, cached per draft. */
async function ensureSocialMp4(dir: string): Promise<string> {
  const src = path.join(dir, "short.mp4");
  const out = path.join(dir, "short-social.mp4");
  try {
    const [s, o] = await Promise.all([fsp.stat(src), fsp.stat(out)]);
    if (o.mtimeMs >= s.mtimeMs) return out; // cache valid
  } catch {}
  // Next's bundler rewrites ffmpeg-static's exported path into .next/, so prefer
  // the real binary in node_modules and only fall back to the import.
  const nmBin = path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  const ffmpegBin = fs.existsSync(nmBin) ? nmBin : ffmpegStatic;
  if (!ffmpegBin) throw new Error("ffmpeg binary not found");
  await execFileAsync(
    ffmpegBin,
    [
      "-y", "-i", src,
      "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-crf", "20", "-maxrate", "8M", "-bufsize", "12M", "-r", "30",
      "-c:a", "aac", "-ac", "2", "-ar", "48000", "-b:a", "128k",
      "-movflags", "+faststart",
      out,
    ],
    { timeout: 180_000, maxBuffer: 1 << 24 }
  );
  return out;
}

async function uploadBytes(uri: string, token: string, file: Buffer): Promise<void> {
  // Best-effort: IG/FB rupload can return a spurious error body on success, so
  // we don't parse/throw here — the caller verifies via status poll (IG) or the
  // finish phase (FB).
  await fetch(uri, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(file.byteLength),
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(file),
  }).catch(() => {});
}

async function publishInstagram(igUserId: string, token: string, file: Buffer, caption: string): Promise<string> {
  const create = await graphJson<{ id: string; uri?: string }>(
    await fetch(`${GRAPH}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ media_type: "REELS", upload_type: "resumable", share_to_feed: "true", caption, access_token: token }),
    }),
    "instagram create container"
  );

  await uploadBytes(create.uri ?? `https://rupload.facebook.com/ig-api-upload/${V}/${create.id}`, token, file);

  let ready = false;
  for (let i = 0; i < IG_STATUS_TRIES; i++) {
    await new Promise((r) => setTimeout(r, IG_STATUS_INTERVAL_MS));
    const status = await graphJson<{ status_code?: string }>(
      await fetch(`${GRAPH}/${create.id}?fields=status_code&access_token=${encodeURIComponent(token)}`),
      "instagram container status"
    );
    if (status.status_code === "FINISHED") { ready = true; break; }
    if (status.status_code === "ERROR") throw new Error("instagram: media processing failed (ERROR)");
  }
  if (!ready) throw new Error(`instagram: still processing after ${(IG_STATUS_TRIES * IG_STATUS_INTERVAL_MS) / 1000}s`);

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

  await uploadBytes(start.upload_url, token, file);

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
  const dir = newsDir(slug);
  if (!fs.existsSync(path.join(dir, "short.mp4"))) {
    return NextResponse.json({ error: `video for ${slug} not found` }, { status: 404 });
  }

  // Per-platform captions: use what render stored; fall back to building them for
  // drafts made before captions existed.
  const fallback = buildPlatformCaptions({
    hookAndBody: info.title.replace(/ #Shorts$/i, ""),
    ytHashtags: [],
    igHashtags: [],
  });
  const igCaption = info.instagramCaption ?? fallback.instagramCaption;
  const fbCaption = info.facebookCaption ?? fallback.facebookCaption;

  let file: Buffer;
  try {
    file = await fsp.readFile(await ensureSocialMp4(dir));
  } catch (err) {
    return NextResponse.json({ error: `could not prepare video: ${String(err).slice(0, 200)}` }, { status: 500 });
  }

  const results: Record<string, string> = {};
  const errors: Record<string, string> = {};
  const postedAt = new Date().toISOString();

  for (const target of targets) {
    try {
      if (target === "instagram") {
        const mediaId = await publishInstagram(igUserId!, token, file, igCaption);
        results.instagram = mediaId;
        await markNewsSocial(slug, { instagram: { mediaId, postedAt } });
      } else {
        const videoId = await publishFacebookReel(pageId!, token, file, fbCaption);
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

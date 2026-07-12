import { NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { z } from "zod";
import { sceneScriptSchema } from "@/studio/schema";
import { markUploaded, videosDir } from "@/lib/state";

const requestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  privacy: z.enum(["private", "unlisted", "public"]).default("public"),
  publishAt: z.string().datetime().optional(),
});

const EDUCATION_CATEGORY_ID = "27";

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "expected {slug, privacy?}" }, { status: 400 });
  }
  const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
    return NextResponse.json({ error: "YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN missing in .env.local" }, { status: 500 });
  }

  const dir = path.join(videosDir(), parsed.data.slug);
  const videoPath = path.join(dir, "video.webm");
  let script;
  try {
    script = sceneScriptSchema.parse(JSON.parse(await fsp.readFile(path.join(dir, "script.json"), "utf8")));
    await fsp.access(videoPath);
  } catch {
    return NextResponse.json({ error: `draft ${parsed.data.slug} not found or invalid` }, { status: 404 });
  }

  const auth = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: YT_REFRESH_TOKEN });
  const youtube = google.youtube({ version: "v3", auth });

  const description = `${script.meta.description}\n\n${script.meta.hashtags.join(" ")}`;
  // Scheduled publish (publishAt) requires the upload to be private; YouTube
  // flips it public automatically at that time.
  const { publishAt } = parsed.data;
  const effectivePrivacy = publishAt ? "private" : parsed.data.privacy;
  const status: { privacyStatus: string; selfDeclaredMadeForKids: boolean; publishAt?: string } = {
    privacyStatus: effectivePrivacy,
    selfDeclaredMadeForKids: false,
  };
  if (publishAt) status.publishAt = publishAt;
  try {
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: script.meta.title.slice(0, 100),
          description: description.slice(0, 4800),
          tags: script.meta.tags,
          categoryId: EDUCATION_CATEGORY_ID,
          defaultLanguage: "en",
          defaultAudioLanguage: "en",
        },
        status,
      },
      media: { body: fs.createReadStream(videoPath) },
    });

    const videoId = res.data.id ?? undefined;
    let thumbnailSet = false;
    if (videoId && script.format === "long") {
      try {
        await fsp.access(path.join(dir, "thumbnail.png"));
        await youtube.thumbnails.set({
          videoId,
          media: { mimeType: "image/png", body: fs.createReadStream(path.join(dir, "thumbnail.png")) },
        });
        thumbnailSet = true;
      } catch {
        /* custom thumbnails need a phone-verified channel; the upload itself succeeded */
      }
    }
    if (videoId) await markUploaded(parsed.data.slug, videoId);

    return NextResponse.json({
      videoId,
      url: videoId ? `https://youtu.be/${videoId}` : null,
      thumbnailSet,
      scheduled: Boolean(publishAt),
      privacy: effectivePrivacy,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `upload failed: ${message.slice(0, 400)}` }, { status: 502 });
  }
}

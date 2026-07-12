import { NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { z } from "zod";
import { resolveChannel, channelCreds, newsDir, readNewsInfo, markNewsUploaded } from "@/lib/news";

const requestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  channelId: z.string().min(1),
  privacy: z.enum(["private", "unlisted", "public"]).default("public"),
  publishAt: z.string().datetime().optional(),
});

const NEWS_CATEGORY_ID = "25"; // News & Politics

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "expected {slug, channelId, privacy?, publishAt?}" }, { status: 400 });
  }
  const { slug, channelId, privacy, publishAt } = parsed.data;

  let channel;
  try {
    channel = await resolveChannel(channelId);
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 404 });
  }

  const creds = channelCreds(channel);
  if (!creds) {
    return NextResponse.json(
      {
        error: `channel "${channel.label}" is missing credentials — set ${channel.creds.clientId} / ${channel.creds.clientSecret} / ${channel.creds.refreshToken} in .env.local`,
      },
      { status: 500 }
    );
  }

  const info = await readNewsInfo(slug);
  if (!info) return NextResponse.json({ error: `news draft ${slug} not found` }, { status: 404 });
  const videoPath = path.join(newsDir(slug), "short.mp4");
  try {
    await fsp.access(videoPath);
  } catch {
    return NextResponse.json({ error: `video for ${slug} not found` }, { status: 404 });
  }

  // Scheduled publish (publishAt) requires the video to be uploaded private;
  // YouTube then flips it public automatically at that time.
  const effectivePrivacy = publishAt ? "private" : privacy;
  const status: { privacyStatus: string; selfDeclaredMadeForKids: boolean; publishAt?: string } = {
    privacyStatus: effectivePrivacy,
    selfDeclaredMadeForKids: false,
  };
  if (publishAt) status.publishAt = publishAt;

  const auth = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  auth.setCredentials({ refresh_token: creds.refreshToken });
  const youtube = google.youtube({ version: "v3", auth });

  try {
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: info.title.slice(0, 100),
          description: info.description.slice(0, 4900),
          tags: info.tags,
          categoryId: NEWS_CATEGORY_ID,
        },
        status,
      },
      media: { body: fs.createReadStream(videoPath) },
    });
    const videoId = res.data.id ?? undefined;
    if (videoId) {
      await markNewsUploaded(slug, {
        videoId,
        uploadedAt: new Date().toISOString(),
        privacy: effectivePrivacy,
        publishAt,
      });
    }
    return NextResponse.json({
      videoId,
      url: videoId ? `https://youtu.be/${videoId}` : null,
      scheduled: Boolean(publishAt),
      privacy: effectivePrivacy,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `upload failed: ${message.slice(0, 400)}` }, { status: 502 });
  }
}

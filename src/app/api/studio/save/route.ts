import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { sceneScriptSchema } from "@/studio/schema";
import { appendHistory, draftDir } from "@/lib/state";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "expected multipart form" }, { status: 400 });

  const video = form.get("video");
  const scriptRaw = form.get("script");
  if (!(video instanceof File) || typeof scriptRaw !== "string") {
    return NextResponse.json({ error: "expected fields: video (file), script (json string)" }, { status: 400 });
  }
  const script = sceneScriptSchema.safeParse(JSON.parse(scriptRaw));
  if (!script.success) {
    return NextResponse.json({ error: "script failed validation" }, { status: 400 });
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const slug = `${stamp}-${script.data.format}-${slugify(script.data.topic)}`;
  const dir = await draftDir(slug);

  await fs.writeFile(path.join(dir, "video.webm"), Buffer.from(await video.arrayBuffer()));
  await fs.writeFile(path.join(dir, "script.json"), JSON.stringify(script.data, null, 2));
  const thumbnail = form.get("thumbnail");
  if (thumbnail instanceof File) {
    await fs.writeFile(path.join(dir, "thumbnail.png"), Buffer.from(await thumbnail.arrayBuffer()));
  }

  await appendHistory({
    date: new Date().toISOString().slice(0, 10),
    subject: script.data.subject,
    module: script.data.module,
    submodule: script.data.submodule,
    topic: script.data.topic,
    title: script.data.meta.title,
    format: script.data.format,
    slug,
    status: "draft",
  });

  return NextResponse.json({ slug, dir });
}

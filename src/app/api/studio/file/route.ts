import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { draftFilePath } from "@/lib/state";

const ALLOWED = {
  "video.webm": "video/webm",
  "thumbnail.png": "image/png",
  "script.json": "application/json",
} as const;

const SLUG_RE = /^[a-z0-9-]+$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const name = url.searchParams.get("name") as keyof typeof ALLOWED | null;
  if (!SLUG_RE.test(slug) || !name || !(name in ALLOWED)) {
    return new Response("bad request", { status: 400 });
  }

  const filePath = draftFilePath(slug, name);
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": ALLOWED[name],
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };

  const range = req.headers.get("range");
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), stat.size - 1) : stat.size - 1;
      if (start <= end && start < stat.size) {
        headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
        headers["Content-Length"] = String(end - start + 1);
        const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream;
        return new Response(stream, { status: 206, headers });
      }
    }
    return new Response("range not satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}` },
    });
  }

  headers["Content-Length"] = String(stat.size);
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { status: 200, headers });
}

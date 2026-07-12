import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveChannel, newsDir, slugify, writeNewsInfo, type NewsInfo } from "@/lib/news";

const execFileAsync = promisify(execFile);

const requestSchema = z.object({
  channelId: z.string().min(1),
  category: z.string().min(1),
  nStories: z.number().int().min(1).max(5).default(3),
});

const RENDER_TIMEOUT_MS = 5 * 60_000;

function venvPython(): string {
  return path.join(process.cwd(), ".venv", "bin", "python");
}

/** Local wall-clock stamp for a readable, sortable slug (YYYY-MM-DD-HHMM). */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "expected {channelId, category, nStories?}" }, { status: 400 });
  }
  const { channelId, category, nStories } = parsed.data;

  let channel;
  try {
    channel = await resolveChannel(channelId);
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 404 });
  }

  const slug = `${stamp()}-${channelId}-${slugify(category)}`;
  const out = newsDir(slug);
  await fs.mkdir(out, { recursive: true });

  const script = path.join(process.cwd(), "scripts", "news", "render_short.py");
  const env = {
    ...process.env,
    NEWS_OUT: out,
    LANG_CODE: channel.lang,
    CATEGORY: category,
    N_STORIES: String(nStories),
    VOICE: channel.voice,
  };

  try {
    const { stdout } = await execFileAsync(venvPython(), [script], {
      env,
      timeout: RENDER_TIMEOUT_MS,
      maxBuffer: 1 << 24,
    });
    const metaRaw = JSON.parse(await fs.readFile(path.join(out, "meta.json"), "utf8")) as {
      title: string;
      description: string;
      tags: string[];
      stories: string[];
    };
    const stat = await fs.stat(path.join(out, "short.mp4"));
    const info: NewsInfo = {
      slug,
      channelId,
      channelLabel: channel.label,
      category,
      lang: channel.lang,
      createdAt: new Date().toISOString(),
      title: metaRaw.title,
      description: metaRaw.description,
      tags: metaRaw.tags ?? [],
      stories: (metaRaw.stories ?? []).map((t) => ({ title: t })),
      videoBytes: stat.size,
    };
    await writeNewsInfo(info);
    return NextResponse.json({ slug, info, log: String(stdout).slice(-500) });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = ((e.stderr ?? "") + (e.stdout ?? "") || e.message || String(err)).slice(-900);
    const hint = /playwright|chromium|Executable doesn't exist|No module named/i.test(detail)
      ? " — in devstudio/ run: .venv/bin/pip install playwright && .venv/bin/playwright install chromium"
      : "";
    await fs.rm(out, { recursive: true, force: true }).catch(() => {});
    return NextResponse.json({ error: `render failed: ${detail}${hint}` }, { status: 502 });
  }
}

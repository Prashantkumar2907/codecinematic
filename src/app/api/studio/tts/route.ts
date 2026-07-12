import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const requestSchema = z.object({
  segments: z.array(z.object({ id: z.string(), text: z.string().min(1).max(520) })).min(1).max(160),
  voice: z.string().optional(),
  /** edge-tts prosody rate, e.g. "+5%" — shorts use a slightly brisker pace. */
  rate: z.string().regex(/^[+-]\d{1,3}%$/).optional(),
});

const DEFAULT_VOICE = "en-US-AndrewMultilingualNeural";
const SEGMENT_TIMEOUT_MS = 30_000;
const CONCURRENCY = 4;

function venvPython(): string {
  return path.join(process.cwd(), ".venv", "bin", "python");
}

async function synthesize(text: string, voice: string, outPath: string, rate?: string): Promise<void> {
  const args = ["-m", "edge_tts", "--voice", voice, "--text", text, "--write-media", outPath];
  if (rate) args.push(`--rate=${rate}`);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await execFileAsync(venvPython(), args, { timeout: SEGMENT_TIMEOUT_MS });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`edge-tts failed for "${text.slice(0, 60)}...": ${String(lastErr).slice(0, 200)}`);
}

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "expected {segments:[{id,text}], voice?}" }, { status: 400 });
  }
  const voice = parsed.data.voice || process.env.VOICE || DEFAULT_VOICE;
  const rate = parsed.data.rate;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "devstudio-tts-"));

  try {
    const segments = parsed.data.segments;
    const results: { id: string; mp3Base64: string }[] = new Array(segments.length);
    let cursor = 0;
    async function worker() {
      while (cursor < segments.length) {
        const index = cursor++;
        const segment = segments[index];
        const outPath = path.join(tmpDir, `${index}.mp3`);
        await synthesize(segment.text, voice, outPath, rate);
        const mp3 = await fs.readFile(outPath);
        results[index] = { id: segment.id, mp3Base64: mp3.toString("base64") };
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, segments.length) }, worker));
    return NextResponse.json({ voice, segments: results });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 400) }, { status: 502 });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

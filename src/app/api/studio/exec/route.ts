import { NextResponse } from "next/server";
import { execFile, type ExecFileOptions } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { EXECUTABLE_LANGS, CODE_LANGS } from "@/studio/schema";

const requestSchema = z.object({
  lang: z.enum(CODE_LANGS),
  code: z.string().min(1).max(8000),
});

const EXEC_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

type ExecResult = { stdout: string; stderr: string; exitCode: number; timedOut: boolean };

function run(cmd: string, args: string[], opts: ExecFileOptions & { input?: string }): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { ...opts, timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
      (err, stdout, stderr) => {
        resolve({
          stdout: String(stdout),
          stderr: String(stderr),
          exitCode: err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === "number"
            ? ((err as unknown as { code: number }).code)
            : err ? 1 : 0,
          timedOut: Boolean(err && (err as Error & { killed?: boolean }).killed),
        });
      }
    );
    if (opts.input !== undefined) {
      child.stdin?.write(opts.input);
      child.stdin?.end();
    }
  });
}

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "expected {lang, code}" }, { status: 400 });
  }
  const { lang, code } = parsed.data;
  if (!EXECUTABLE_LANGS.includes(lang) && lang !== "ts") {
    return NextResponse.json({ skipped: true, reason: `${lang} is display-only` });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "devstudio-exec-"));
  try {
    let result: ExecResult;
    if (lang === "js" || lang === "ts") {
      const file = path.join(tmpDir, "snippet.mjs");
      await fs.writeFile(file, code);
      result = await run("node", ["--no-warnings", file], { cwd: tmpDir });
    } else if (lang === "python") {
      const file = path.join(tmpDir, "snippet.py");
      await fs.writeFile(file, code);
      result = await run(path.join(process.cwd(), ".venv", "bin", "python"), [file], { cwd: tmpDir });
    } else {
      result = await run("sqlite3", ["-batch", ":memory:"], { cwd: tmpDir, input: code });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 400) }, { status: 500 });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

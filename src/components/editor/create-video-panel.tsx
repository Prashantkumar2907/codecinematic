"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultEditorDraft, useEditorStore } from "@/lib/editor-store";
import type { Narration } from "@/lib/narration";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

type Job = {
  exportId: string;
  aspectRatio: string;
  format: string;
  watermarked: boolean;
  storageAllowed: boolean;
};

type RenderedVideo = {
  exportId: string;
  aspectRatio: string;
  url: string;
  filename: string;
};

const aspectDimensions: Record<string, { width: number; height: number; maxVisibleLines: number; fontSize: number; maxCharsPerLine: number }> = {
  "9:16": { width: 720, height: 1280, maxVisibleLines: 16, fontSize: 32, maxCharsPerLine: 34 },
  "16:9": { width: 1280, height: 720,  maxVisibleLines: 14, fontSize: 22, maxCharsPerLine: 56 }
};

export function CreateVideoPanel({
  projectId,
  title,
  language,
  aspect,
  focus,
  code,
  normalSpeed,
  focusSpeed,
  sound,
  soundVolume
}: {
  projectId: string;
  title: string;
  language: string;
  aspect: string;
  focus: string[];
  code: string;
  normalSpeed: string;
  focusSpeed: string;
  sound: string;
  soundVolume: string;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [videos, setVideos] = useState<RenderedVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storedDraft = useEditorStore((state) => state.drafts[projectId]);
  const resolvedDraft = storedDraft ?? {
    ...defaultEditorDraft,
    title,
    language,
    aspect: aspect as "9:16" | "16:9",
    normalSpeed,
    focusSpeed,
    sound: sound as "off" | "soft" | "typewriter",
    soundVolume,
    focus: focus.map((line) => Number(line)).filter((line) => !Number.isNaN(line)),
    code,
    narration: null as Narration | null,
  };
  const resolvedCode = resolvedDraft.code;
  const resolvedFocus = resolvedDraft.focus.map((line) => String(line));
  const resolvedNormalSpeed = resolvedDraft.normalSpeed;
  const resolvedFocusSpeed = resolvedDraft.focusSpeed;
  const resolvedSound = resolvedDraft.sound;
  const resolvedSoundVolume = resolvedDraft.soundVolume;
  const resolvedNarration = resolvedDraft.narration;
  const aspectRatios = [aspect];
  const renderLineCount = useMemo(
    () => resolvedCode.split("\n").length,
    [resolvedCode]
  );

  useEffect(() => {
    setError(null);
  }, [projectId, storedDraft]);

  async function createJobs() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId,
          aspectRatios,
          format: "mp4"
        })
        // Client renders webm then converts to mp4 via ffmpeg.wasm
      });

      const data = (await response.json()) as { jobs?: Job[]; error?: string };
      if (!response.ok) {
        setError(data.error ?? "Unable to create export jobs.");
        setLoading(false);
        return [];
      }

      const nextJobs = data.jobs ?? [];
      setJobs(nextJobs);
      setLoading(false);
      return nextJobs;
    } catch {
      setError("Network error while creating export jobs.");
      setLoading(false);
      return [];
    }
  }

  async function renderJobs(targetJobs: Job[]) {
    setRendering(true);
    setError(null);

    try {
      const nextVideos: RenderedVideo[] = [];
      for (const job of targetJobs) {
        const blob = await renderVideoBlob({
          title,
          language,
          aspectRatio: job.aspectRatio,
          code: resolvedCode,
          focusLines: resolvedFocus.map((line) => Number(line)).filter((line) => !Number.isNaN(line)),
          watermarked: job.watermarked,
          normalSpeed: resolvedNormalSpeed,
          focusSpeed: resolvedFocusSpeed,
          sound: resolvedSound,
          soundVolume: resolvedSoundVolume,
          narration: resolvedNarration,
        });

        const url = URL.createObjectURL(blob);
        nextVideos.push({
          exportId: job.exportId,
          aspectRatio: job.aspectRatio,
          url,
          filename: `${slugify(title)}-${job.aspectRatio.replace(":", "x")}.mp4`
        });
      }

      setVideos((current) => {
        current.forEach((video) => URL.revokeObjectURL(video.url));
        return nextVideos;
      });
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Video rendering failed.");
    } finally {
      setRendering(false);
    }
  }

  async function handleCreateAndRender() {
    const nextJobs = await createJobs();
    if (nextJobs.length > 0) {
      await renderJobs(nextJobs);
    }
  }

  async function handleRenderVideos() {
    if (jobs.length === 0) {
      setError("Create video jobs first.");
      return;
    }

    await renderJobs(jobs);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-2">
      <div className="flex-1 min-h-0 grid gap-2 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="flex flex-col min-h-0 border-border/40 bg-card shadow-sm">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-base">Create video</CardTitle>
            <CardDescription className="text-xs">Generate and export your code video with the settings from the editor.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-3 px-3 pb-3">
            <div className="grid gap-2 md:grid-cols-2">
              <Meta label="Project" value={title} />
              <Meta label="Language" value={language} />
              <Meta label="Aspect mode" value={aspect} />
              <Meta label="Normal line speed" value={formatMultiplier(resolvedNormalSpeed)} />
              <Meta label="Focused line speed" value={formatMultiplier(resolvedFocusSpeed)} />
              <Meta label="Typing sound" value={resolvedSound} />
              <Meta label="Insertion volume" value={`${Math.round(Number(resolvedSoundVolume) * 100)}%`} />
              <Meta label="Focus lines" value={resolvedFocus.length ? resolvedFocus.join(", ") : "None"} />
              <Meta label="Render source lines" value={`${renderLineCount}`} />
              <Meta label="Narration" value={resolvedNarration ? `${resolvedNarration.segments.length} segments` : "None"} />
            </div>

            <div className="flex flex-wrap gap-1">
              {aspectRatios.map((ratio) => (
                <Badge key={ratio} className="text-[10px] bg-secondary/50 text-secondary-foreground">{ratio}</Badge>
              ))}
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 h-9 text-xs font-semibold glow-primary-sm hover:glow-primary transition-all" onClick={handleCreateAndRender} disabled={loading || rendering || renderLineCount === 0}>
                {loading || rendering ? "Creating video…" : "Create video"}
              </Button>
              <Button className="flex-1 h-8 text-xs font-semibold hover:shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0" onClick={handleRenderVideos} disabled={rendering || jobs.length === 0 || renderLineCount === 0} variant="secondary">
                {rendering ? "Rendering videos..." : "Render again"}
              </Button>
            </div>
            
            {renderLineCount === 0 ? (
              <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                No code payload reached this step yet. Go back to the editor and continue again.
              </div>
            ) : null}
            {error ? <div className="rounded-md border border-destructive/30 bg-destructive/8 p-2 text-xs text-destructive">{error}</div> : null}
          </CardContent>
        </Card>

        <Card className="flex flex-col min-h-0 border-border/40 bg-card shadow-sm">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-base">Export jobs</CardTitle>
            <CardDescription className="text-xs">Plan-aware export jobs with format and watermark settings.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-3 px-3 pb-3">
            {jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 p-6 text-xs text-muted-foreground text-center">
                <p className="font-medium text-foreground/60 mb-1">No export jobs yet</p>
                <p className="text-[11px]">Click &quot;Create video&quot; on the left to start rendering.</p>
              </div>
            ) : null}

            {jobs.map((job) => (
              <div key={job.exportId} className="rounded-md border border-border bg-card shadow-sm p-3 hover:border-primary/50 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{job.aspectRatio} export</p>
                  <div className="flex gap-1">
                    <Badge className="text-[10px] py-0 border border-border bg-transparent text-foreground">{job.format}</Badge>
                    <Badge className={`text-[10px] py-0 ${job.watermarked ? 'bg-secondary/50 text-secondary-foreground' : 'bg-primary text-primary-foreground'}`}>{job.watermarked ? "watermarked" : "clean"}</Badge>
                    <Badge className="text-[10px] py-0 border border-border bg-transparent text-foreground">{job.storageAllowed ? "stored allowed" : "download only"}</Badge>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground font-mono truncate">{job.exportId}</p>
              </div>
            ))}

            {videos.map((video) => (
              <div key={video.exportId} className="rounded-xl border border-primary/25 bg-primary/5 p-3 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-primary">{video.aspectRatio} video ready</p>
                  <a href={video.url} download={video.filename}>
                    <Button size="sm" className="h-7 text-[11px] px-3 glow-primary-sm hover:glow-primary transition-all">Download .mp4</Button>
                  </a>
                </div>
                <video src={video.url} controls playsInline className="w-full rounded-lg border border-border/50 bg-black shadow-inner" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-2 hover:border-border/60 transition-colors">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-medium">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-foreground truncate max-w-full">{value}</p>
    </div>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * VIDEO GENERATION ENGINE
 *
 * Approach:
 * 1. Split code into lines (keep empty lines).
 * 2. Pre-compute a per-character timeline: every character has a wall-clock
 *    millisecond at which it should appear. Empty lines get a short pause.
 * 3. For each frame at 30 fps, compute virtual ms, figure out which chars
 *    are visible, word-wrap visible text, and paint the IDE frame.
 * 4. captureStream(0) + requestFrame() ensures every painted frame is
 *    captured; wall-clock pacing keeps audio in sync.
 * 5. Audio clicks are pre-scheduled on AudioContext for each character.
 * ═══════════════════════════════════════════════════════════════════════════ */

async function renderVideoBlob(opts: {
  title: string;
  language: string;
  aspectRatio: string;
  code: string;
  focusLines: number[];
  watermarked: boolean;
  normalSpeed: string;
  focusSpeed: string;
  sound: string;
  soundVolume: string;
  narration: Narration | null;
}) {
  const {
    title, language, aspectRatio, code, focusLines, watermarked,
    normalSpeed, focusSpeed, sound, soundVolume, narration,
  } = opts;

  if (typeof window === "undefined") throw new Error("Browser only.");
  if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder not available.");

  const preset = aspectDimensions[aspectRatio];
  if (!preset) throw new Error(`Unknown aspect ratio: ${aspectRatio}`);

  // ── Canvas ──
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const ctx = canvas.getContext("2d")!;
  if (!ctx) throw new Error("Canvas unavailable.");

  // ── Compute actual maxCharsPerLine from measured monospace char width ──
  const vert = preset.width < preset.height;
  const fw = vert ? preset.width * 0.9 : preset.width * 0.84;
  const fx = (preset.width - fw) / 2;
  const codeAreaLeft = fx + 78;
  const codeAreaRight = fx + fw;
  const drawableWidth = codeAreaRight - codeAreaLeft - 30; // padding
  ctx.font = `${preset.fontSize}px ui-monospace, SFMono-Regular, monospace`;
  const charWidth = ctx.measureText("M").width; // use widest char
  const actualMaxChars = Math.max(10, Math.floor(drawableWidth / charWidth));
  const effectivePreset = { ...preset, maxCharsPerLine: actualMaxChars };

  // ── Streams ──
  const vStream = (canvas as any).captureStream(0) as MediaStream;
  const vTrack = vStream.getVideoTracks()[0] as any;
  const audioCtx = typeof AudioContext !== "undefined" ? new AudioContext() : null;
  const audioDest = audioCtx ? audioCtx.createMediaStreamDestination() : null;
  const combined = new MediaStream([
    ...vStream.getVideoTracks(),
    ...(audioDest ? audioDest.stream.getAudioTracks() : []),
  ]);

  // ── Recorder ──
  const chunks: BlobPart[] = [];
  const mime = pickMime();
  const rec = mime ? new MediaRecorder(combined, { mimeType: mime }) : new MediaRecorder(combined);
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  // ── Lines & timeline ──
  const allLines = code.split("\n");
  const focusSet = new Set(focusLines);

  // Build per-line durations (ms) based on character count and speed
  const lineDurations = allLines.map((lineText, i) => {
    const lineNum = i + 1;
    const isFocused = focusSet.has(lineNum);
    const chars = lineText.length;
    if (chars === 0) {
      // Empty line: brief pause
      return Math.round(180 / Math.max(0.5, Number(normalSpeed) || 1));
    }
    const mult = Math.max(0.5, Number(isFocused ? focusSpeed : normalSpeed) || 1);
    const msPerChar = isFocused ? 150 : 110;
    const pad = isFocused ? 280 : 160;
    return Math.round((chars * msPerChar + pad) / mult);
  });

  // Cumulative end times
  const cumEnd: number[] = [];
  let sum = 0;
  for (const d of lineDurations) { sum += d; cumEnd.push(sum); }
  const totalMs = Math.max(3000, sum);

  // ── Start recording ──
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      combined.getTracks().forEach((t) => t.stop());
      if (audioCtx) void audioCtx.close();
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
  });
  rec.start(200);
  if (audioCtx?.state === "suspended") await audioCtx.resume();

  // ── Schedule audio clicks ──
  if (audioCtx && audioDest && sound !== "off" && Number(soundVolume) > 0) {
    const vol = Number(soundVolume);
    const t0 = audioCtx.currentTime + 0.06;
    let elapsed = 0;
    for (let li = 0; li < allLines.length; li++) {
      const lineText = allLines[li]!;
      const dur = lineDurations[li]!;
      const chars = lineText.length;
      if (chars === 0) { elapsed += dur; continue; }
      for (let ci = 0; ci < chars; ci++) {
        const frac = (ci + 1) / (chars + 1);
        const when = t0 + (elapsed + dur * frac) / 1000;
        emitClick(audioCtx, audioDest, when, sound, vol, lineText[ci]!, ci === chars - 1);
      }
      elapsed += dur;
    }
  }

  const ttsCleanup = narration ? scheduleNarrationTTS(narration, allLines, cumEnd, totalMs) : null;

  // ── Frame loop ── render at 30 fps virtual time, paced to wall-clock
  const FPS = 30;
  const frameDur = 1000 / FPS;
  const totalFrames = Math.ceil(totalMs / frameDur) + 15;
  const wallStart = performance.now();

  for (let f = 0; f <= totalFrames; f++) {
    const ms = Math.min(f * frameDur, totalMs);

    // Figure out which line is active at this ms
    let activeIdx = cumEnd.findIndex((c) => ms <= c);
    if (activeIdx === -1) activeIdx = allLines.length - 1;

    // Progress within the active line (0→1)
    const prevEnd = activeIdx === 0 ? 0 : cumEnd[activeIdx - 1]!;
    const dur = lineDurations[activeIdx]!;
    const progress = Math.min(1, Math.max(0, ms - prevEnd) / dur);

    // Build visible lines array
    const visLines = buildVisibleLines(allLines, activeIdx, progress, effectivePreset.maxCharsPerLine);
    const activeLine = activeIdx + 1; // 1-based

    const subtitle = narration ? getNarrationText(narration, activeLine) : null;

    paintFrame(ctx, effectivePreset, title, language, visLines, activeLine,
      focusSet, watermarked, subtitle);

    // Push frame
    if (vTrack && typeof vTrack.requestFrame === "function") vTrack.requestFrame();

    // Pace to wall-clock
    const target = wallStart + (f + 1) * frameDur;
    const wait = target - performance.now();
    if (wait > 1) await delay(wait);
    else await delay(0); // yield
  }

  if (ttsCleanup) ttsCleanup();
  await delay(300);
  rec.stop();
  const webmBlob = await done;

  // Convert webm → mp4 using ffmpeg.wasm
  const mp4Blob = await convertWebmToMp4(webmBlob);
  return mp4Blob;
}

function delay(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

async function convertWebmToMp4(webmBlob: Blob): Promise<Blob> {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  const webmData = await fetchFile(webmBlob);
  await ffmpeg.writeFile("input.webm", webmData);
  await ffmpeg.exec(["-i", "input.webm", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", "output.mp4"]);
  const mp4Data = await ffmpeg.readFile("output.mp4") as Uint8Array;
  ffmpeg.terminate();
  return new Blob([new Uint8Array(mp4Data)], { type: "video/mp4" });
}

function pickMime() {
  for (const m of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

/* ── Build visible lines for a given time snapshot ─────────────────────── */

interface VLine {
  lineNum: number;     // original 1-based line number
  text: string;        // text to render (may be partial for active line)
  gutterLabel: string; // "  1" or "   " for continuation rows
  isCont: boolean;     // is this a continuation (word-wrapped) row?
  isEmpty: boolean;    // true for blank lines
  baseColor?: string;  // color to use for this line (if continuation, inherited from parent)
}

function buildVisibleLines(
  allLines: string[],
  activeIdx: number,
  progress: number,
  maxChars: number,
): VLine[] {
  const out: VLine[] = [];

  for (let i = 0; i <= activeIdx; i++) {
    const raw = allLines[i]!;
    const lineNum = i + 1;
    const isActive = i === activeIdx;

    if (raw.length === 0) {
      // Empty line
      out.push({ lineNum, text: "", gutterLabel: String(lineNum).padStart(3, " "), isCont: false, isEmpty: true });
      continue;
    }

    // For completed lines show full text; for active line show partial (char by char)
    const displayText = isActive
      ? raw.slice(0, Math.max(1, Math.ceil(raw.length * progress)))
      : raw;

    // Determine base color for this line (for inherited color on continuations)
    const trimmed = raw.trimStart();
    let baseColor: string | undefined;
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
      baseColor = "#67e8f9"; // comment color
    }

    // Word-wrap (same logic for active and completed lines)
    const segments = wordWrap(displayText, maxChars);
    for (let s = 0; s < segments.length; s++) {
      out.push({
        lineNum,
        text: segments[s]!,
        gutterLabel: s === 0 ? String(lineNum).padStart(3, " ") : "   ",
        isCont: s > 0,
        isEmpty: false,
        baseColor,
      });
    }
  }

  return out;
}

function wordWrap(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const segments: string[] = [];
  let rem = text;
  while (rem.length > max) {
    // Find the last space within the allowed width
    let cut = rem.lastIndexOf(" ", max);
    if (cut <= 0) cut = max; // no space found: hard break
    segments.push(rem.slice(0, cut));
    rem = rem.slice(cut).replace(/^ /, ""); // trim leading space on next segment
  }
  if (rem.length > 0) segments.push(rem);
  return segments;
}

/** Hard-break wrap: split at exactly `max` chars so earlier rows never change. */
function hardWrap(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const segments: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    segments.push(text.slice(i, i + max));
  }
  return segments;
}

/* ── Typing audio ──────────────────────────────────────────────────────── */

function emitClick(
  ctx: AudioContext, dest: MediaStreamAudioDestinationNode,
  when: number, sound: string, vol: number, ch: string, accent: boolean,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.setValueAtTime(sound === "typewriter" ? 900 : 700, when);
  filt.Q.setValueAtTime(0.7, when);

  const ws = ch.trim().length === 0;
  osc.type = sound === "typewriter" ? "square" : "triangle";
  osc.frequency.setValueAtTime(
    sound === "typewriter"
      ? ws ? 150 : accent ? 320 : 240
      : ws ? 480 : accent ? 900 : 700,
    when,
  );

  const peak = (sound === "typewriter" ? (accent ? 0.12 : 0.08) : (accent ? 0.07 : 0.045)) * vol * (ws ? 0.45 : 1);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + (sound === "typewriter" ? 0.016 : 0.012));

  osc.connect(filt); filt.connect(gain); gain.connect(dest);
  osc.start(when);
  osc.stop(when + (sound === "typewriter" ? 0.018 : 0.014));
}

/* ── Narration (TTS) ───────────────────────────────────────────────────── */

function scheduleNarrationTTS(
  narration: Narration,
  allLines: string[],
  cumEnd: number[],
  totalMs: number,
): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  const synth = window.speechSynthesis;
  const timers: ReturnType<typeof setTimeout>[] = [];

  if (narration.intro) {
    const u = new SpeechSynthesisUtterance(narration.intro);
    u.rate = 1; u.volume = 0.9;
    synth.speak(u);
  }

  for (const seg of narration.segments) {
    // seg.lineStart is 1-based
    const idx = seg.lineStart - 1;
    if (idx < 0 || idx >= allLines.length) continue;
    const startMs = idx === 0 ? 0 : cumEnd[idx - 1]!;
    const d = Math.max(0, startMs + (narration.intro ? 2000 : 0));
    timers.push(setTimeout(() => {
      const u = new SpeechSynthesisUtterance(seg.text);
      u.rate = 1.05; u.volume = 0.9;
      synth.speak(u);
    }, d));
  }

  if (narration.outro) {
    timers.push(setTimeout(() => {
      const u = new SpeechSynthesisUtterance(narration.outro);
      u.rate = 1; u.volume = 0.9;
      synth.speak(u);
    }, totalMs - 500));
  }

  return () => { timers.forEach(clearTimeout); synth.cancel(); };
}

function getNarrationText(narration: Narration, activeLine: number): string | null {
  for (const seg of narration.segments) {
    if (activeLine >= seg.lineStart && activeLine <= seg.lineEnd) return seg.text;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PAINT FRAME — VS Code–style IDE look
 * ═══════════════════════════════════════════════════════════════════════════ */

function paintFrame(
  ctx: CanvasRenderingContext2D,
  preset: { width: number; height: number; maxVisibleLines: number; fontSize: number; maxCharsPerLine: number },
  title: string,
  language: string,
  visLines: VLine[],
  activeLine: number,
  focusSet: Set<number>,
  watermarked: boolean,
  subtitle: string | null,
) {
  const W = preset.width;
  const H = preset.height;
  const fs = preset.fontSize;
  const maxVis = preset.maxVisibleLines;
  const vert = W < H;

  ctx.clearRect(0, 0, W, H);

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#08101a"); bg.addColorStop(1, "#03080d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Atmospheric glow
  ctx.fillStyle = "rgba(45, 212, 191, 0.05)";
  ctx.beginPath();
  ctx.arc(W * 0.3, H * 0.2, Math.min(W, H) * 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Frame dimensions
  const fw = vert ? W * 0.9 : W * 0.84;
  const fh = vert ? H - 360 : H * 0.84;
  const fx = (W - fw) / 2;
  const fy = vert ? 160 : (H - fh) / 2;

  // Frame shadow + fill
  ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 25;
  rr(ctx, fx, fy, fw, fh, 20);
  ctx.fillStyle = "rgba(10,16,24,0.75)"; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; ctx.stroke();

  // Title bar
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  rr(ctx, fx + 12, fy + 12, fw - 24, 44, 12); ctx.fill();

  // Glass gutter bg
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  rr(ctx, fx + 12, fy + 68, 54, fh - 80, 12); ctx.fill();

  // Traffic dots
  (["#ef4444", "#f59e0b", "#10b981"] as const).forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(fx + 32 + i * 18, fy + 34, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Title text
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 16px ui-sans-serif, system-ui";
  ctx.fillText(title, fx + 100, fy + 39);

  // Language label
  ctx.fillStyle = "rgba(148,163,184,0.8)";
  ctx.font = "500 12px ui-sans-serif, system-ui";
  ctx.fillText(language, fx + fw - 80, fy + 38);

  // ── Code area (clipped to frame) ──
  const codeAreaTop = fy + 68;
  const codeAreaBottom = fy + fh;
  const codeAreaLeft = fx + 78;
  const codeAreaRight = fx + fw;
  const lineH = fs * 1.55;

  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, codeAreaTop, fw, codeAreaBottom - codeAreaTop);
  ctx.clip();

  // Only show the last maxVis rows (scroll effect), but reserve buffer for wrapping
  const WRAP_BUFFER = 4;
  const effMaxVis = Math.max(4, maxVis - WRAP_BUFFER);
  let startIdx = Math.max(0, visLines.length - effMaxVis);
  // Back up if startIdx lands on a continuation row — show the full source line
  while (startIdx > 0 && visLines[startIdx]!.isCont) startIdx--;
  const viewport = visLines.slice(startIdx);
  let y = codeAreaTop + 17 + fs;

  for (const vl of viewport) {
    const isActive = vl.lineNum === activeLine;
    const isFocused = focusSet.has(vl.lineNum);

    // Highlight bar
    if ((isActive || isFocused) && !vl.isEmpty) {
      ctx.fillStyle = isActive ? "rgba(45,212,191,0.15)" : "rgba(255,255,255,0.04)";
      rr(ctx, codeAreaLeft, y - lineH + 6, codeAreaRight - codeAreaLeft - 10, lineH, 8);
      ctx.fill();
    }

    // Gutter number
    ctx.fillStyle = vl.isCont ? "rgba(100,116,139,0.7)" : "rgba(148,163,184,0.9)";
    ctx.font = `${fs - 4}px ui-monospace, SFMono-Regular, monospace`;
    ctx.fillText(vl.gutterLabel, fx + 22, y);

    if (vl.isCont) {
      ctx.fillStyle = "rgba(45,212,191,0.6)";
      ctx.fillText(">", fx + 50, y);
    }

    // Code tokens (with overflow guard)
    if (vl.text.length > 0) {
      drawTokenized(ctx, vl.text, codeAreaLeft + 10, y, fs, codeAreaRight - codeAreaLeft - 20, vl.baseColor);
    }

    y += lineH;
  }

  ctx.restore();

  // Watermark
  if (watermarked) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = "600 14px ui-sans-serif, system-ui";
    ctx.fillText("CodeCinematic", fx + fw - 120, fy + fh + 30);
  }

  // Subtitle overlay
  if (subtitle) {
    const sf = vert ? 14 : 13;
    const sy = vert ? H - 60 : H - 24;
    const mw = W - 60;
    ctx.font = `500 ${sf}px ui-sans-serif, system-ui`;
    const tw = Math.min(ctx.measureText(subtitle).width, mw);
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    rr(ctx, (W - tw) / 2 - 14, sy - sf - 5, tw + 28, sf + 14, 8); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 0.5;
    rr(ctx, (W - tw) / 2 - 14, sy - sf - 5, tw + 28, sf + 14, 8); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.textAlign = "center";
    ctx.fillText(subtitle, W / 2, sy, mw); ctx.textAlign = "start";
  }
}

/* ── Syntax-highlighted code drawing (stops at maxWidth) ───────────────── */

function drawTokenized(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontSize: number, maxWidth: number, baseColor?: string) {
  ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, monospace`;
  // If baseColor is provided, use it uniformly (for continuation lines)
  if (baseColor) {
    ctx.fillStyle = baseColor;
    ctx.fillText(text, x, y);
    return;
  }
  const tokens = tokenize(text);
  let cx = x;
  for (const tok of tokens) {
    ctx.fillStyle = tok.color;
    ctx.fillText(tok.text, cx, y);
    cx += ctx.measureText(tok.text).width;
  }
}

/* ── Simple tokenizer ──────────────────────────────────────────────────── */

function tokenize(line: string): Array<{ text: string; color: string }> {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
    return [{ text: line, color: "#67e8f9" }];
  }

  const patterns: Array<{ regex: RegExp; color: string }> = [
    { regex: /^(".*?"|'.*?'|`.*?`)/, color: "#fda4af" },
    { regex: /^(const|let|var|function|return|async|await|class|new|if|else|for|while|console|map|log)\b/, color: "#7dd3fc" },
    { regex: /^(\d+(\.\d+)?)/, color: "#facc15" },
    { regex: /^([{}()[\]])/, color: "#c084fc" },
    { regex: /^([.,:;])/, color: "#94a3b8" },
    { regex: /^(=>|===|!==|==|!=|\+|-|\*|\/)/, color: "#f97316" },
  ];

  const tokens: Array<{ text: string; color: string }> = [];
  let rem = line;
  while (rem.length > 0) {
    let matched = false;
    for (const p of patterns) {
      const m = rem.match(p.regex);
      if (m) {
        tokens.push({ text: m[0], color: p.color });
        rem = rem.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({ text: rem[0]!, color: "#e6edf3" });
      rem = rem.slice(1);
    }
  }
  return tokens;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function formatMultiplier(value: string) {
  return `${Number(value).toFixed(2)}x`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

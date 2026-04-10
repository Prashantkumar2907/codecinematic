"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultEditorDraft, useEditorStore } from "@/lib/editor-store";
import type { Narration, NarrationSegment } from "@/lib/narration";

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
  "9:16": { width: 720, height: 1280, maxVisibleLines: 16, fontSize: 30, maxCharsPerLine: 24 },
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

async function renderVideoBlob({
  title,
  language,
  aspectRatio,
  code,
  focusLines,
  watermarked,
  normalSpeed,
  focusSpeed,
  sound,
  soundVolume,
  narration,
}: {
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
  if (typeof window === "undefined") {
    throw new Error("Rendering is only available in the browser.");
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser does not support MediaRecorder video export.");
  }

  const preset = aspectDimensions[aspectRatio];
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const ctxRaw = canvas.getContext("2d");
  if (!ctxRaw) {
    throw new Error("Canvas rendering is unavailable.");
  }
  const context: CanvasRenderingContext2D = ctxRaw;

  const videoStream = canvas.captureStream(30);
  const audioContext = typeof AudioContext !== "undefined" ? new AudioContext() : null;
  const audioDestination = audioContext ? audioContext.createMediaStreamDestination() : null;
  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...(audioDestination ? audioDestination.stream.getAudioTracks() : [])
  ]);
  const chunks: BlobPart[] = [];
  const mimeType = getSupportedMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const lines = code
    .split("\n")
    .map((line, index) => ({ number: index + 1, content: line }));

  const focusSet = new Set(focusLines);
  const lineSchedule = buildLineSchedule(lines, focusSet, normalSpeed, focusSpeed);
  const durationMs = lineSchedule.totalDurationMs;

  const stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (audioContext) {
        void audioContext.close();
      }
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
  });

  recorder.start(250);
  if (audioContext && audioContext.state === "suspended") {
    await audioContext.resume();
  }
  const startTime = performance.now();
  scheduleTypingAudio({
    audioContext,
    audioDestination,
    lines,
    lineSchedule,
    sound,
    volume: Number(soundVolume)
  });

  // Schedule TTS narration using SpeechSynthesis if narration is available
  const ttsCleanup = narration
    ? scheduleNarrationTTS(narration, lines, lineSchedule)
    : null;

  await new Promise<void>((resolve) => {
    function draw(now: number) {
      const elapsed = now - startTime;
      const safeElapsed = Math.min(elapsed, durationMs);
      const renderState = getRenderState(safeElapsed, lines, lineSchedule, preset.maxCharsPerLine);

      // Find the current narration segment based on active line
      const currentNarrationText = narration
        ? getCurrentNarrationText(narration, renderState.activeLine)
        : null;

      paintFrame({
        context,
        width: preset.width,
        height: preset.height,
        title,
        language,
        visibleLines: renderState.visibleLines,
        activeLine: renderState.activeLine,
        maxVisibleLines: preset.maxVisibleLines,
        fontSize: preset.fontSize,
        focusSet,
        watermarked,
        subtitleText: currentNarrationText,
      });

      if (safeElapsed < durationMs) {
        requestAnimationFrame(draw);
      } else {
        if (ttsCleanup) ttsCleanup();
        window.setTimeout(() => {
          recorder.stop();
          resolve();
        }, 500);
      }
    }

    requestAnimationFrame(draw);
  });

  return stopPromise;
}

/**
 * Schedule narration speech using the browser SpeechSynthesis API.
 * Speaks each segment's text when the corresponding lines start typing.
 * Returns a cleanup function to cancel any pending speech.
 */
function scheduleNarrationTTS(
  narration: Narration,
  lines: Array<{ number: number; content: string }>,
  lineSchedule: { cumulativeDurations: number[]; totalDurationMs: number }
): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return () => {};
  }

  const synth = window.speechSynthesis;
  const timeouts: ReturnType<typeof setTimeout>[] = [];

  // Speak intro immediately
  if (narration.intro) {
    const utterance = new SpeechSynthesisUtterance(narration.intro);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;
    synth.speak(utterance);
  }

  // Build a map from line number to line index
  const lineIndexMap = new Map<number, number>();
  lines.forEach((line, idx) => lineIndexMap.set(line.number, idx));

  // Schedule each segment to start speaking when its first line starts typing
  for (const segment of narration.segments) {
    const lineIdx = lineIndexMap.get(segment.lineStart);
    if (lineIdx === undefined) continue;

    // Time when this line begins = cumulative of all previous lines
    const startMs = lineIdx === 0 ? 0 : lineSchedule.cumulativeDurations[lineIdx - 1] ?? 0;
    // Add a small buffer for intro to finish
    const delayMs = Math.max(0, startMs + (narration.intro ? 2000 : 0));

    const tid = setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(segment.text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;
      synth.speak(utterance);
    }, delayMs);

    timeouts.push(tid);
  }

  // Schedule outro after all code is typed
  if (narration.outro) {
    const tid = setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(narration.outro);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;
      synth.speak(utterance);
    }, lineSchedule.totalDurationMs - 500);
    timeouts.push(tid);
  }

  return () => {
    timeouts.forEach(clearTimeout);
    synth.cancel();
  };
}

/**
 * Find the narration text for the current active line.
 */
function getCurrentNarrationText(narration: Narration, activeLine: number): string | null {
  for (const seg of narration.segments) {
    if (activeLine >= seg.lineStart && activeLine <= seg.lineEnd) {
      return seg.text;
    }
  }
  return null;
}

function getSupportedMimeType() {
  const options = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return options.find((option) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(option)) ?? null;
}

function scheduleTypingAudio({
  audioContext,
  audioDestination,
  lines,
  lineSchedule,
  sound,
  volume
}: {
  audioContext: AudioContext | null;
  audioDestination: MediaStreamAudioDestinationNode | null;
  lines: Array<{ number: number; content: string }>;
  lineSchedule: { perLineDurations: number[]; totalDurationMs: number };
  sound: string;
  volume: number;
}) {
  if (!audioContext || !audioDestination || sound === "off" || lines.length === 0 || volume <= 0) {
    return;
  }

  let elapsedMs = 0;
  const startAt = audioContext.currentTime + 0.06;

  lines.forEach((line, lineIndex) => {
    const charsInLine = Math.max(line.content.length, 1);
    const lineDurationMs = lineSchedule.perLineDurations[lineIndex] ?? 400;

    for (let index = 0; index < charsInLine; index += 1) {
      const lineProgress = (index + 1) / (charsInLine + 1);
      const when = startAt + (elapsedMs + lineDurationMs * lineProgress) / 1000;
      const character = line.content[index] ?? "";
      playTypingPulse(audioContext, audioDestination, when, sound, volume, character, index === charsInLine - 1);
    }

    elapsedMs += lineDurationMs;
  });
}

function buildLineSchedule(
  lines: Array<{ number: number; content: string }>,
  focusSet: Set<number>,
  normalSpeed: string,
  focusSpeed: string
) {
  const perLineDurations = lines.map((line) => {
    const charsInLine = Math.max(line.content.length, 1);
    return focusSet.has(line.number)
      ? getLineDurationForSpeed(charsInLine, focusSpeed, true)
      : getLineDurationForSpeed(charsInLine, normalSpeed, false);
  });
  const totalDurationMs = Math.max(3000, perLineDurations.reduce((sum, duration) => sum + duration, 0));
  const cumulativeDurations: number[] = [];
  let running = 0;
  perLineDurations.forEach((duration) => {
    running += duration;
    cumulativeDurations.push(running);
  });

  return {
    perLineDurations,
    cumulativeDurations,
    totalDurationMs
  };
}

function getLineDurationForSpeed(charCount: number, speed: string, isFocused: boolean) {
  const multiplier = Math.max(0.05, Number(speed) || 1);
  const msPerChar = isFocused ? 150 : 110;
  const linePadding = isFocused ? 280 : 160;
  return Math.round((charCount * msPerChar + linePadding) / multiplier);
}

function getVisibleLineCount(elapsedMs: number, cumulativeDurations: number[]) {
  const index = cumulativeDurations.findIndex((value) => elapsedMs <= value);
  return index === -1 ? cumulativeDurations.length : index + 1;
}

function getRenderState(
  elapsedMs: number,
  lines: Array<{ number: number; content: string }>,
  lineSchedule: { perLineDurations: number[]; cumulativeDurations: number[] },
  maxCharsPerLine: number
) {
  const activeIndex = Math.max(0, getVisibleLineCount(elapsedMs, lineSchedule.cumulativeDurations) - 1);
  const previousElapsed = activeIndex === 0 ? 0 : lineSchedule.cumulativeDurations[activeIndex - 1] ?? 0;
  const currentDuration = lineSchedule.perLineDurations[activeIndex] ?? 1;
  const localElapsed = Math.max(0, elapsedMs - previousElapsed);
  const activeProgress = Math.min(1, localElapsed / currentDuration);
  const activeRawLine = lines[activeIndex];

  const visibleLines: Array<{ number: number; content: string; lineNumberLabel: string; continuation: boolean; fullLineContent: string; charOffset: number }> = [];

  function addWrapped(lineContent: string, lineNum: number, limit?: number) {
    const text = limit !== undefined ? Array.from(lineContent).slice(0, limit).join("") : lineContent;
    const segs = wrapLine(text, maxCharsPerLine);
    let offset = 0;
    segs.forEach((s, si) => {
      visibleLines.push({
        number: lineNum,
        content: s,
        lineNumberLabel: si === 0 ? String(lineNum).padStart(2, " ") : "  ",
        continuation: si > 0,
        fullLineContent: lineContent,
        charOffset: offset,
      });
      offset += Array.from(s).length;
    });
  }

  lines.slice(0, activeIndex).forEach((line) => addWrapped(line.content, line.number));

  if (activeRawLine) {
    const revealedCharacters = Math.max(1, Math.ceil(Array.from(activeRawLine.content).length * activeProgress));
    addWrapped(activeRawLine.content, activeRawLine.number, revealedCharacters);
  }

  return {
    visibleLines,
    activeLine: activeRawLine?.number ?? 1
  };
}

function wrapLine(content: string, maxCharsPerLine: number) {
  const chars = Array.from(content);
  if (chars.length <= maxCharsPerLine) {
    return [content];
  }

  const segments: string[] = [];
  let remChars = chars;
  const max = maxCharsPerLine;

  while (remChars.length > max) {
    let cut = -1;
    // Search within bounds: index max-1 is the last valid char in this segment
    for (let i = max - 1; i >= Math.max(Math.floor(max * 0.3), 4); i--) {
      if (remChars[i] === " ") { cut = i; break; }
    }
    // If no space found, try symbol boundaries
    if (cut < 0) {
      for (let i = max - 1; i >= Math.max(Math.floor(max * 0.3), 4); i--) {
        const ch = remChars[i];
        if (ch === "." || ch === "(" || ch === "," || ch === "[" || ch === "{" || ch === "=" || ch === ">" || ch === "|" || ch === "&" || ch === "+" || ch === "-") {
          cut = i;
          break;
        }
      }
    }
    // Hard cut at max if no break point found
    if (cut < 0) cut = max;

    segments.push(remChars.slice(0, cut).join(""));
    remChars = remChars.slice(cut);
    // Trim leading spaces on the continuation
    while (remChars.length > 0 && remChars[0] === " ") remChars = remChars.slice(1);
  }

  if (remChars.length > 0) {
    segments.push(remChars.join(""));
  }

  return segments;
}

function playTypingPulse(
  audioContext: AudioContext,
  destination: MediaStreamAudioDestinationNode,
  when: number,
  sound: string,
  volume: number,
  character: string,
  accent: boolean
) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();

  filter.type = "highpass";
  filter.frequency.setValueAtTime(sound === "typewriter" ? 900 : 700, when);
  filter.Q.setValueAtTime(0.7, when);

  const isWhitespace = character.trim().length === 0;
  oscillator.type = sound === "typewriter" ? "square" : "triangle";
  oscillator.frequency.setValueAtTime(
    sound === "typewriter"
      ? isWhitespace
        ? 150
        : accent
          ? 320
          : 240
      : isWhitespace
        ? 480
        : accent
          ? 900
          : 700,
    when
  );

  const basePeakGain = sound === "typewriter" ? (accent ? 0.12 : 0.08) : accent ? 0.07 : 0.045;
  const peakGain = basePeakGain * volume * (isWhitespace ? 0.45 : 1);
  gainNode.gain.setValueAtTime(0.0001, when);
  gainNode.gain.exponentialRampToValueAtTime(peakGain, when + 0.0015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, when + (sound === "typewriter" ? 0.016 : 0.012));

  oscillator.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(destination);

  oscillator.start(when);
  oscillator.stop(when + (sound === "typewriter" ? 0.018 : 0.014));
}

function paintFrame({
  context,
  width,
  height,
  title,
  language,
  visibleLines,
  activeLine,
  maxVisibleLines,
  fontSize,
  focusSet,
  watermarked,
  subtitleText,
}: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  title: string;
  language: string;
  visibleLines: Array<{ number: number; content: string; lineNumberLabel: string; continuation: boolean; fullLineContent?: string; charOffset?: number }>;
  activeLine: number;
  maxVisibleLines: number;
  fontSize: number;
  focusSet: Set<number>;
  watermarked: boolean;
  subtitleText?: string | null;
}) {
  const ctx = context;
  const w = width;
  const h = height;
  const vert = w < h;
  ctx.clearRect(0, 0, w, h);

  // Rich deep-space IDE background
  ctx.fillStyle = "#080c10";
  ctx.fillRect(0, 0, w, h);

  // Subtle dot grid
  ctx.fillStyle = "rgba(255,255,255,0.012)";
  for (let dx = 20; dx < w; dx += 28) for (let dy = 20; dy < h; dy += 28) { ctx.beginPath(); ctx.arc(dx, dy, 0.7, 0, Math.PI * 2); ctx.fill(); }

  // Ambient glows — primary cyan + accent purple
  const g1 = ctx.createRadialGradient(w * 0.15, h * 0.08, 0, w * 0.15, h * 0.08, Math.min(w, h) * 0.45);
  g1.addColorStop(0, "rgba(56,189,248,0.07)"); g1.addColorStop(1, "rgba(56,189,248,0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h);
  const g2 = ctx.createRadialGradient(w * 0.88, h * 0.82, 0, w * 0.88, h * 0.82, Math.min(w, h) * 0.35);
  g2.addColorStop(0, "rgba(139,92,246,0.06)"); g2.addColorStop(1, "rgba(139,92,246,0)");
  ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
  // Subtle bottom gradient fade
  const gBot = ctx.createLinearGradient(0, h * 0.7, 0, h);
  gBot.addColorStop(0, "rgba(0,0,0,0)"); gBot.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = gBot; ctx.fillRect(0, 0, w, h);

  const fw = vert ? w * 0.94 : w * 0.88;
  const fh = vert ? h - 300 : h * 0.86;
  const fx = (w - fw) / 2;
  const fy = vert ? 120 : (h - fh) / 2;

  // Outer glow
  ctx.shadowColor = "rgba(56,189,248,0.05)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 0;
  roundRect(ctx, fx - 2, fy - 2, fw + 4, fh + 4, 16);
  ctx.strokeStyle = "rgba(56,189,248,0.06)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

  // Frame shadow
  ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  roundRect(ctx, fx, fy, fw, fh, 12);
  ctx.fillStyle = "#0d1117"; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Frame border
  roundRect(ctx, fx, fy, fw, fh, 12);
  ctx.strokeStyle = "rgba(48,54,64,0.6)"; ctx.lineWidth = 1; ctx.stroke();

  // Title bar
  const tbH = vert ? 40 : 44;
  ctx.save();
  roundRect(ctx, fx, fy, fw, tbH, 12); ctx.clip();
  const tb = ctx.createLinearGradient(fx, fy, fx, fy + tbH);
  tb.addColorStop(0, "#161b22"); tb.addColorStop(1, "#12161d");
  ctx.fillStyle = tb; ctx.fillRect(fx, fy, fw, tbH);
  ctx.restore();
  ctx.strokeStyle = "rgba(48,54,64,0.45)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(fx, fy + tbH); ctx.lineTo(fx + fw, fy + tbH); ctx.stroke();

  // Traffic lights
  const dotR = vert ? 4.5 : 5.5;
  const dotGap = vert ? 16 : 20;
  [["#ff5f57","#e0443e"],["#febc2e","#dea123"],["#28c840","#1aab29"]].forEach(([c, g], i) => {
    const cx = fx + 16 + i * dotGap; const cy = fy + tbH / 2;
    ctx.fillStyle = c!; ctx.beginPath(); ctx.arc(cx, cy, dotR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g!; ctx.beginPath(); ctx.arc(cx, cy + 0.3, dotR - 1, 0, Math.PI * 2); ctx.fill();
  });

  // File tab — active tab with underline indicator
  const tabFont = `500 ${vert ? 10 : 11}px ui-sans-serif,system-ui`;
  ctx.font = tabFont;
  const tabX = fx + (vert ? 64 : 90);
  const titleShort = title.length > 28 ? title.slice(0, 26) + "…" : title;
  const tabW = Math.min(ctx.measureText(titleShort).width + 32, fw * 0.42);
  // Tab background
  const tabGrad = ctx.createLinearGradient(tabX, fy + 2, tabX, fy + tbH);
  tabGrad.addColorStop(0, "#1c2128"); tabGrad.addColorStop(1, "#0d1117");
  ctx.fillStyle = tabGrad;
  // Draw tab with rounded top corners only (8px radius)
  ctx.beginPath();
  ctx.moveTo(tabX, fy + tbH);
  ctx.lineTo(tabX, fy + 11);
  ctx.arcTo(tabX, fy + 3, tabX + 8, fy + 3, 8);
  ctx.lineTo(tabX + tabW - 8, fy + 3);
  ctx.arcTo(tabX + tabW, fy + 3, tabX + tabW, fy + 11, 8);
  ctx.lineTo(tabX + tabW, fy + tbH);
  ctx.closePath(); ctx.fill();
  // Tab border sides
  ctx.strokeStyle = "rgba(48,54,64,0.5)"; ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(tabX, fy + tbH); ctx.lineTo(tabX, fy + 4);
  ctx.arcTo(tabX, fy + 2, tabX + 8, fy + 2, 6);
  ctx.lineTo(tabX + tabW - 8, fy + 2);
  ctx.arcTo(tabX + tabW, fy + 2, tabX + tabW, fy + 10, 6);
  ctx.lineTo(tabX + tabW, fy + tbH);
  ctx.stroke();
  // Active tab indicator (top highlight)
  ctx.fillStyle = "rgba(56,189,248,0.75)";
  roundRect(ctx, tabX + 6, fy + 3, tabW - 12, 2, 2); ctx.fill();
  // File icon dot
  ctx.fillStyle = "rgba(56,189,248,0.4)";
  ctx.beginPath(); ctx.arc(tabX + 12, fy + tbH / 2, 3, 0, Math.PI * 2); ctx.fill();
  // Title text
  ctx.fillStyle = "rgba(230,237,243,0.95)";
  ctx.font = tabFont;
  ctx.fillText(titleShort, tabX + 20, fy + tbH / 2 + 4, tabW - 26);

  // Language badge — right side of title bar
  ctx.font = `600 ${vert ? 8 : 9}px ui-sans-serif,system-ui`;
  const langTxt = language.toUpperCase();
  const lw = ctx.measureText(langTxt).width + 14;
  const langX = fx + fw - lw - 12;
  const langY = fy + tbH / 2 - 9;
  // Badge background
  const langGrad = ctx.createLinearGradient(langX, langY, langX, langY + 18);
  langGrad.addColorStop(0, "rgba(56,189,248,0.18)");
  langGrad.addColorStop(1, "rgba(56,189,248,0.08)");
  ctx.fillStyle = langGrad;
  roundRect(ctx, langX, langY, lw, 18, 4); ctx.fill();
  ctx.strokeStyle = "rgba(56,189,248,0.25)"; ctx.lineWidth = 0.5;
  roundRect(ctx, langX, langY, lw, 18, 4); ctx.stroke();
  ctx.fillStyle = "rgba(56,189,248,0.9)";
  ctx.fillText(langTxt, langX + 7, langY + 12);

  // Activity bar — landscape only
  const abW = vert ? 0 : 32;
  if (!vert) {
    ctx.fillStyle = "rgba(13,17,23,0.5)";
    ctx.fillRect(fx, fy + tbH, abW, fh - tbH);
    ctx.strokeStyle = "rgba(48,54,64,0.3)"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(fx + abW, fy + tbH); ctx.lineTo(fx + abW, fy + fh); ctx.stroke();
    [0.2, 0.32, 0.44, 0.56].forEach((r) => {
      const iy = fy + tbH + (fh - 60) * r;
      ctx.fillStyle = "rgba(100,116,139,0.2)";
      roundRect(ctx, fx + 8, iy, 16, 16, 3); ctx.fill();
    });
  }

  // Line gutter
  const gutterW = vert ? 36 : 42;
  const gutterX = fx + abW;
  ctx.fillStyle = "rgba(13,17,23,0.3)";
  ctx.fillRect(gutterX, fy + tbH, gutterW, fh - tbH);
  ctx.strokeStyle = "rgba(48,54,64,0.25)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(gutterX + gutterW, fy + tbH); ctx.lineTo(gutterX + gutterW, fy + fh); ctx.stroke();

  // Code area (clipped) — 24px right margin so last char is never cut
  const codeLeft = gutterX + gutterW + 10;
  const codeRight = fx + fw - 24;
  const codeMaxW = codeRight - codeLeft;

  ctx.save();
  ctx.beginPath();
  // Leave 24px for status bar; subtract 2 so bottom line chars don't get clipped
  ctx.rect(fx, fy + tbH, fw, fh - tbH - 22);
  ctx.clip();

  const lineHeight = fontSize * 1.5;
  const startIndex = Math.max(0, visibleLines.length - maxVisibleLines);
  const viewportLines = visibleLines.slice(startIndex);
  let y = fy + tbH + 10 + fontSize;

  viewportLines.forEach((line) => {
    const isActive = line.number === activeLine;
    const isFocused = focusSet.has(line.number);

    // Active / focused line highlight (no cursor bar — removed)
    if (isActive || isFocused) {
      ctx.fillStyle = isActive ? "rgba(56,189,248,0.06)" : "rgba(255,255,255,0.02)";
      ctx.fillRect(gutterX, y - lineHeight + 6, fx + fw - gutterX, lineHeight);
    }

    // Gutter: show line number OR the continuation arrow
    ctx.font = `${fontSize - 4}px ui-monospace, SFMono-Regular, monospace`;
    ctx.textAlign = "right";
    if (line.continuation) {
      // Arrow goes in the gutter column (line-number side), not the code area
      ctx.fillStyle = "rgba(56,189,248,0.45)";
      ctx.font = `${fontSize - 3}px ui-monospace, SFMono-Regular, monospace`;
      ctx.fillText("\u21B3", gutterX + gutterW - 6, y);
    } else {
      ctx.fillStyle = isActive ? "rgba(56,189,248,0.55)" : "rgba(100,116,139,0.4)";
      ctx.fillText(line.lineNumberLabel, gutterX + gutterW - 6, y);
    }
    ctx.textAlign = "start";

    drawCodeColored(ctx, line.fullLineContent ?? line.content, line.charOffset ?? 0, Array.from(line.content).length, codeLeft, y, fontSize, codeMaxW);

    y += lineHeight;
  });

  ctx.restore();

  // Status bar — VSCode-style
  const sbH = 22;
  const sbGrad = ctx.createLinearGradient(fx, fy + fh - sbH, fx, fy + fh);
  sbGrad.addColorStop(0, "#1c2736"); sbGrad.addColorStop(1, "#142030");
  ctx.fillStyle = sbGrad;
  ctx.fillRect(fx, fy + fh - sbH, fw, sbH);
  ctx.strokeStyle = "rgba(56,189,248,0.12)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(fx, fy + fh - sbH); ctx.lineTo(fx + fw, fy + fh - sbH); ctx.stroke();
  // Branch icon
  ctx.fillStyle = "rgba(56,189,248,0.7)";
  roundRect(ctx, fx + 4, fy + fh - sbH + 4, 12, 14, 3); ctx.fill();
  ctx.fillStyle = "#0d1117"; ctx.font = "bold 7px ui-monospace"; ctx.fillText("β", fx + 5.5, fy + fh - 6);
  // Status items
  ctx.fillStyle = "rgba(148,163,184,0.6)";
  ctx.font = `500 ${vert ? 8 : 9}px ui-sans-serif,system-ui`;
  ctx.fillText(`Ln ${activeLine}`, fx + 22, fy + fh - 6);
  if (!vert) {
    ctx.fillText("✓ 0 errors", fx + 70, fy + fh - 6);
    ctx.fillText("Spaces: 2", fx + 150, fy + fh - 6);
    ctx.fillText(language, fx + fw - 80, fy + fh - 6);
  }
  ctx.fillText("UTF-8", fx + fw - 36, fy + fh - 6);

  if (watermarked) {
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.font = "600 11px ui-sans-serif,system-ui";
    ctx.textAlign = "center";
    ctx.fillText("CodeCinematic", w / 2, fy + fh + 20);
    ctx.textAlign = "start";
  }

  if (subtitleText) {
    const sf = vert ? 14 : 13;
    const sy = vert ? h - 60 : h - 24;
    const mw = w - 60;
    ctx.font = `500 ${sf}px ui-sans-serif, system-ui`;
    const tw = Math.min(ctx.measureText(subtitleText).width, mw);
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    roundRect(ctx, (w - tw) / 2 - 14, sy - sf - 5, tw + 28, sf + 14, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 0.5;
    roundRect(ctx, (w - tw) / 2 - 14, sy - sf - 5, tw + 28, sf + 14, 8); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textAlign = "center";
    ctx.fillText(subtitleText, w / 2, sy, mw);
    ctx.textAlign = "start";
  }
}

/** Draw code with syntax coloring, clamped to maxW so no char is ever clipped by the right edge. */
function drawCodeColored(
  context: CanvasRenderingContext2D, fullLine: string, charOffset: number, charCount: number,
  x: number, y: number, fontSize: number, maxW: number
) {
  context.font = `${fontSize}px ui-monospace, SFMono-Regular, monospace`;
  const tokens = tokenize(fullLine);
  let charIdx = 0;
  let cx = x;
  const rightEdge = x + maxW; // absolute right boundary
  for (const t of tokens) {
    const codePoints = Array.from(t.text);
    for (const cp of codePoints) {
      if (charIdx >= charOffset && charIdx < charOffset + charCount) {
        const charW = context.measureText(cp).width;
        // Only draw if the character fits fully within the right boundary
        if (cx + charW <= rightEdge) {
          context.fillStyle = t.color;
          context.fillText(cp, cx, y);
        }
        cx += charW;
      }
      charIdx++;
    }
  }
}

/**
 * Tokenizes a line of code into colored segments.
 * Key fix: identifiers (including camelCase like `evenNumbers`) are matched
 * as a WHOLE token first, THEN checked against keyword lists — so the full
 * name gets a single color, not split at case boundaries.
 */
function tokenize(line: string) {
  // Full-line comment shortcut
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
    return [{ text: line, color: "rgba(100,220,200,0.75)" }];
  }

  const KEYWORDS_MODULE = new Set([
    "import", "export", "from", "default", "type", "interface", "enum",
    "implements", "extends", "public", "private", "protected", "static",
    "readonly", "abstract", "declare", "namespace", "module",
  ]);
  const KEYWORDS_CONTROL = new Set([
    "const", "let", "var", "function", "return", "async", "await", "class",
    "new", "if", "else", "for", "while", "do", "switch", "case", "break",
    "continue", "try", "catch", "finally", "throw", "typeof", "instanceof",
    "in", "of", "void", "delete", "yield", "super", "this", "null",
    "undefined", "true", "false",
  ]);
  const BUILTINS = new Set([
    "console", "map", "filter", "reduce", "forEach", "find", "includes",
    "push", "pop", "shift", "length", "log", "warn", "error", "debug", "info",
    "Math", "Array", "Object", "String", "Number", "Boolean", "Promise",
    "JSON", "Date", "parseInt", "parseFloat", "setTimeout", "setInterval",
  ]);

  // Ordered patterns (identifier MUST come AFTER strings but before symbol patterns)
  const patterns: Array<{ regex: RegExp; resolver: (m: string) => string }> = [
    // Strings (template literals, single/double quoted)
    { regex: /^(`[^`]*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/, resolver: () => "#fda4af" },
    // Full identifier — matches entire camelCase/PascalCase/snake_case name
    { regex: /^([a-zA-Z_$][a-zA-Z0-9_$]*)/, resolver: (m) => {
      if (KEYWORDS_MODULE.has(m)) return "#c084fc";
      if (KEYWORDS_CONTROL.has(m)) return "#7dd3fc";
      if (BUILTINS.has(m)) return "#7dd3fc";
      // PascalCase = type/class name
      if (/^[A-Z]/.test(m)) return "#4ade80";
      return "#e6edf3";
    }},
    // Numbers
    { regex: /^(\d+(\.\d+)?)/, resolver: () => "#facc15" },
    // Brackets
    { regex: /^([{}()[\]])/, resolver: () => "#c084fc" },
    // Punctuation
    { regex: /^([.,:;])/, resolver: () => "#94a3b8" },
    // Operators
    { regex: /^(=>|===|!==|==|!=|>=|<=|&&|\|\||\?\?|\+\+|--|\+=|-=|\*=|\/=|\+|-|\*|\/|%|!|<|>|=|&|\||\?|:)/, resolver: () => "#f97316" },
  ];

  const tokens: Array<{ text: string; color: string }> = [];
  let remaining = line;

  while (remaining.length > 0) {
    let matched = false;
    for (const { regex, resolver } of patterns) {
      const match = remaining.match(regex);
      if (match) {
        tokens.push({ text: match[0], color: resolver(match[0]) });
        remaining = remaining.slice(match[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      const ch = remaining.match(/^./u)?.[0] ?? remaining[0];
      tokens.push({ text: ch, color: "#e6edf3" });
      remaining = remaining.slice(ch.length);
    }
  }

  return tokens;
}

function formatMultiplier(value: string) {
  return `${Number(value).toFixed(2)}x`;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

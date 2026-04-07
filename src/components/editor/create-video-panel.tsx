"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultEditorDraft, useEditorStore } from "@/lib/editor-store";

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
  "9:16": { width: 720, height: 1280, maxVisibleLines: 12, fontSize: 24, maxCharsPerLine: 30 },
  "16:9": { width: 1280, height: 720, maxVisibleLines: 14, fontSize: 22, maxCharsPerLine: 54 }
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
    code
  };
  const resolvedCode = resolvedDraft.code;
  const resolvedFocus = resolvedDraft.focus.map((line) => String(line));
  const resolvedNormalSpeed = resolvedDraft.normalSpeed;
  const resolvedFocusSpeed = resolvedDraft.focusSpeed;
  const resolvedSound = resolvedDraft.sound;
  const resolvedSoundVolume = resolvedDraft.soundVolume;
  const aspectRatios = [aspect];
  const renderLineCount = useMemo(
    () => resolvedCode.split("\n").filter((line) => line.trim().length > 0).length,
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
          soundVolume: resolvedSoundVolume
        });

        const url = URL.createObjectURL(blob);
        nextVideos.push({
          exportId: job.exportId,
          aspectRatio: job.aspectRatio,
          url,
          filename: `${slugify(title)}-${job.aspectRatio.replace(":", "x")}.webm`
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
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Card className="bg-white/5">
        <CardHeader>
          <CardTitle>Create video</CardTitle>
          <CardDescription>This is the next workflow step after the editor. It uses your demo account plan to create export jobs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Meta label="Project" value={title} />
            <Meta label="Language" value={language} />
            <Meta label="Aspect mode" value={aspect} />
            <Meta label="Normal line speed" value={formatMultiplier(resolvedNormalSpeed)} />
            <Meta label="Focused line speed" value={formatMultiplier(resolvedFocusSpeed)} />
            <Meta label="Typing sound" value={resolvedSound} />
            <Meta label="Insertion volume" value={`${Math.round(Number(resolvedSoundVolume) * 100)}%`} />
            <Meta label="Focus lines" value={resolvedFocus.length ? resolvedFocus.join(", ") : "None"} />
            <Meta label="Render source lines" value={`${renderLineCount}`} />
          </div>

          <div className="flex flex-wrap gap-2">
            {aspectRatios.map((ratio) => (
              <Badge key={ratio}>{ratio}</Badge>
            ))}
          </div>

          <Button onClick={handleCreateAndRender} disabled={loading || rendering || renderLineCount === 0}>
            {loading || rendering ? "Creating video..." : "Create video"}
          </Button>
          <Button onClick={handleRenderVideos} disabled={rendering || jobs.length === 0 || renderLineCount === 0} variant="secondary">
            {rendering ? "Rendering videos..." : "Render again"}
          </Button>
          {renderLineCount === 0 ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              No code payload reached this step yet. Go back to the editor and continue again.
            </div>
          ) : null}
          {error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}
        </CardContent>
      </Card>

      <Card className="bg-white/5">
        <CardHeader>
          <CardTitle>Export jobs</CardTitle>
          <CardDescription>The demo route returns plan-aware export jobs so all four demo accounts can complete the workflow.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
              No export jobs created yet. Use the button on the left to generate the vertical, landscape, or dual-format job list.
            </div>
          ) : null}

          {jobs.map((job) => (
            <div key={job.exportId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{job.aspectRatio} export</p>
                <div className="flex gap-2">
                  <Badge>{job.format}</Badge>
                  <Badge>{job.watermarked ? "watermarked" : "clean"}</Badge>
                  <Badge>{job.storageAllowed ? "stored allowed" : "download only"}</Badge>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{job.exportId}</p>
            </div>
          ))}

          {videos.map((video) => (
            <div key={video.exportId} className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{video.aspectRatio} video ready</p>
                <a href={video.url} download={video.filename}>
                  <Button size="sm">Download .webm</Button>
                </a>
              </div>
              <video src={video.url} controls playsInline className="w-full rounded-2xl border border-white/10 bg-black/40" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
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
  soundVolume
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
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas rendering is unavailable.");
  }

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
    .map((line, index) => ({ number: index + 1, content: line }))
    .filter((line) => line.content.trim().length > 0);

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

  await new Promise<void>((resolve) => {
    function draw(now: number) {
      const elapsed = now - startTime;
      const safeElapsed = Math.min(elapsed, durationMs);
      const renderState = getRenderState(safeElapsed, lines, lineSchedule, preset.maxCharsPerLine);

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
        watermarked
      });

      if (safeElapsed < durationMs) {
        requestAnimationFrame(draw);
      } else {
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

  const visibleLines: Array<{ number: number; content: string }> = [];

  lines.slice(0, activeIndex).forEach((line) => {
    wrapLine(line.content, maxCharsPerLine).forEach((segment, index) => {
      visibleLines.push({
        number: index === 0 ? line.number : line.number,
        content: segment
      });
    });
  });

  if (activeRawLine) {
    const revealedCharacters = Math.max(1, Math.ceil(activeRawLine.content.length * activeProgress));
    const partial = activeRawLine.content.slice(0, revealedCharacters);
    wrapLine(partial, maxCharsPerLine).forEach((segment) => {
      visibleLines.push({
        number: activeRawLine.number,
        content: segment
      });
    });
  }

  return {
    visibleLines,
    activeLine: activeRawLine?.number ?? 1
  };
}

function wrapLine(content: string, maxCharsPerLine: number) {
  if (content.length <= maxCharsPerLine) {
    return [content];
  }

  const segments: string[] = [];
  let remaining = content;

  while (remaining.length > maxCharsPerLine) {
    let cut = remaining.lastIndexOf(" ", maxCharsPerLine);
    if (cut <= 0) {
      cut = maxCharsPerLine;
    }

    segments.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining.length > 0) {
    segments.push(remaining);
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
  watermarked
}: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  title: string;
  language: string;
  visibleLines: Array<{ number: number; content: string }>;
  activeLine: number;
  maxVisibleLines: number;
  fontSize: number;
  focusSet: Set<number>;
  watermarked: boolean;
}) {
  context.clearRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07111b");
  gradient.addColorStop(1, "#041019");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(24, 190, 198, 0.08)";
  context.beginPath();
  context.arc(width * 0.2, height * 0.12, Math.min(width, height) * 0.18, 0, Math.PI * 2);
  context.fill();

  const frameX = width * 0.08;
  const frameY = height * 0.08;
  const frameW = width * 0.84;
  const frameH = height * 0.84;

  roundRect(context, frameX, frameY, frameW, frameH, 28);
  context.fillStyle = "rgba(7, 17, 27, 0.86)";
  context.fill();
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  context.stroke();

  context.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(context, frameX + 18, frameY + 18, frameW - 36, 48, 16);
  context.fill();

  const dots = ["#ff6b6b", "#ffd166", "#06d6a0"];
  dots.forEach((color, index) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(frameX + 42 + index * 22, frameY + 42, 6, 0, Math.PI * 2);
    context.fill();
  });

  context.fillStyle = "#d9f7f8";
  context.font = "600 20px ui-sans-serif, system-ui";
  context.fillText(title, frameX + 120, frameY + 48);

  context.fillStyle = "rgba(173, 224, 227, 0.7)";
  context.font = "500 14px ui-sans-serif, system-ui";
  context.fillText(language, frameX + frameW - 90, frameY + 48);

  const lineHeight = fontSize * 1.65;
  const startIndex = Math.max(0, visibleLines.length - maxVisibleLines);
  const viewportLines = visibleLines.slice(startIndex);
  let y = frameY + 100;

  viewportLines.forEach((line) => {
    const isActive = line.number === activeLine;
    const isFocused = focusSet.has(line.number);

    if (isActive || isFocused) {
      context.fillStyle = isActive ? "rgba(24, 190, 198, 0.16)" : "rgba(255, 255, 255, 0.05)";
      roundRect(context, frameX + 24, y - lineHeight + 8, frameW - 48, lineHeight, 12);
      context.fill();
    }

    context.fillStyle = "rgba(148, 163, 184, 0.9)";
    context.font = `${fontSize - 4}px ui-monospace, SFMono-Regular, monospace`;
    context.fillText(String(line.number).padStart(2, " "), frameX + 32, y);

    drawHighlightedCode(context, line.content, frameX + 80, y, fontSize);
    y += lineHeight;
  });

  if (watermarked) {
    context.fillStyle = "rgba(255,255,255,0.14)";
    context.font = "600 18px ui-sans-serif, system-ui";
    context.fillText("CodeCinematic Free", frameX + frameW - 210, frameY + frameH - 28);
  }
}

function drawHighlightedCode(context: CanvasRenderingContext2D, codeLine: string, x: number, y: number, fontSize: number) {
  context.font = `${fontSize}px ui-monospace, SFMono-Regular, monospace`;
  const tokens = tokenize(codeLine);
  let cursor = x;

  tokens.forEach((token) => {
    context.fillStyle = token.color;
    context.fillText(token.text, cursor, y);
    cursor += context.measureText(token.text).width;
  });
}

function tokenize(line: string) {
  if (line.trim().startsWith("//") || line.trim().startsWith("#")) {
    return [{ text: line, color: "#67e8f9" }];
  }

  const patterns = [
    { regex: /^(".*?"|'.*?'|`.*?`)/, color: "#fda4af" },
    { regex: /^(const|let|var|function|return|async|await|class|new|if|else|for|while|console|map|log)\b/, color: "#7dd3fc" },
    { regex: /^(\d+(\.\d+)?)/, color: "#facc15" },
    { regex: /^([{}()[\]])/, color: "#c084fc" },
    { regex: /^([.,:;])/ , color: "#94a3b8" },
    { regex: /^(=>|==|===|!=|!==|\+|-|\*|\/)/, color: "#f97316" }
  ];

  const tokens: Array<{ text: string; color: string }> = [];
  let remaining = line;

  while (remaining.length > 0) {
    let matched = false;

    for (const pattern of patterns) {
      const match = remaining.match(pattern.regex);
      if (match) {
        tokens.push({ text: match[0], color: pattern.color });
        remaining = remaining.slice(match[0].length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      tokens.push({ text: remaining[0], color: "#e6edf3" });
      remaining = remaining.slice(1);
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

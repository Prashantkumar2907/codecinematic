"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { defaultEditorDraft, useEditorStore } from "@/lib/editor-store";
import type { Narration } from "@/lib/narration";
import { BG_PRESETS, type BgPreset, drawBackground } from "@/components/editor/shared/canvas-utils";
import { loadGoogleFonts } from "@/components/editor/shared/font-catalog";
import { createWebmBlob, createWebmRecorder } from "@/components/editor/shared/media-recorder";
import { RenderStatusPanel } from "@/components/editor/shared/render-status-panel";
import { cn } from "@/lib/cn";

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
  format: string;
  url: string;
  filename: string;
};

// ─── Singleton AudioContext (avoids Chrome's ~6 ctx-per-page limit) ──────────
let _sharedAudioCtx: AudioContext | null = null;
function acquireAudioCtx(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (_sharedAudioCtx && _sharedAudioCtx.state !== "closed") {
    if (_sharedAudioCtx.state === "suspended") void _sharedAudioCtx.resume();
    return _sharedAudioCtx;
  }
  _sharedAudioCtx = new AudioContext();
  return _sharedAudioCtx;
}

type RenderSignal = { cancelled: boolean };

const aspectDimensions: Record<string, { width: number; height: number; maxVisibleLines: number; fontSize: number; maxCharsPerLine: number }> = {
  "9:16": { width: 1080, height: 1920, maxVisibleLines: 20, fontSize: 36, maxCharsPerLine: 36 },
  "16:9": { width: 1280, height: 720,  maxVisibleLines: 16, fontSize: 24, maxCharsPerLine: 60 }
};

const RECORDING_FPS = 30;
const RECORDING_FRAME_MS = 1000 / RECORDING_FPS;
const RECORDING_AUDIO_BITS_PER_SECOND = 128_000;
const RECORDING_VIDEO_BITS_PER_SECOND: Record<string, number> = {
  "9:16": 10_000_000,
  "16:9": 7_000_000,
};
const VISIBLE_LINE_OVERSCAN = 8;
const LONG_RENDER_WARNING_MS = 45_000;
const MAX_RENDER_DURATION_MS = 3 * 60_000;

// ── Code Color Themes ────────────────────────────────────────────────────
type CodeTheme = {
  bg0: string; bg1: string;
  atmoColor: string;
  frameGlass: string; frameBorder: string;
  titleBar: string; gutterBg: string;
  activeLineBg: string; focusLineBg: string;
  gutterText: string;
  cursorColor: string; accentColor: string;
  tokens: { string: string; keyword: string; number: string; bracket: string; punct: string; operator: string; comment: string; type: string; default: string };
};

const CODE_THEMES: Record<string, CodeTheme> = {
  "vscode": {
    bg0: "#08101a", bg1: "#03080d",
    atmoColor: "rgba(45,212,191,0.06)",
    frameGlass: "rgba(10,16,24,0.82)", frameBorder: "rgba(255,255,255,0.12)",
    titleBar: "rgba(255,255,255,0.03)", gutterBg: "rgba(0,0,0,0.32)",
    activeLineBg: "rgba(45,212,191,0.15)", focusLineBg: "rgba(255,255,255,0.04)",
    gutterText: "rgba(148,163,184,0.9)", cursorColor: "#2dd4bf", accentColor: "#2dd4bf",
    tokens: { string: "#fda4af", keyword: "#7dd3fc", number: "#facc15", bracket: "#c084fc", punct: "#94a3b8", operator: "#f97316", comment: "#67e8f9", type: "#4ade80", default: "#e6edf3" }
  },
  "dracula": {
    bg0: "#1e1e2e", bg1: "#161625",
    atmoColor: "rgba(189,147,249,0.06)",
    frameGlass: "rgba(24,24,40,0.95)", frameBorder: "rgba(189,147,249,0.20)",
    titleBar: "rgba(189,147,249,0.05)", gutterBg: "rgba(0,0,0,0.28)",
    activeLineBg: "rgba(189,147,249,0.13)", focusLineBg: "rgba(255,255,255,0.04)",
    gutterText: "rgba(98,114,164,0.9)", cursorColor: "#bd93f9", accentColor: "#bd93f9",
    tokens: { string: "#f1fa8c", keyword: "#ff79c6", number: "#bd93f9", bracket: "#8be9fd", punct: "#6272a4", operator: "#ff79c6", comment: "#6272a4", type: "#50fa7b", default: "#f8f8f2" }
  },
  "monokai": {
    bg0: "#1b1b1b", bg1: "#121212",
    atmoColor: "rgba(249,38,114,0.05)",
    frameGlass: "rgba(20,20,20,0.95)", frameBorder: "rgba(249,38,114,0.15)",
    titleBar: "rgba(255,255,255,0.02)", gutterBg: "rgba(0,0,0,0.30)",
    activeLineBg: "rgba(249,38,114,0.10)", focusLineBg: "rgba(255,255,255,0.03)",
    gutterText: "rgba(117,113,94,0.9)", cursorColor: "#f92672", accentColor: "#f92672",
    tokens: { string: "#e6db74", keyword: "#f92672", number: "#ae81ff", bracket: "#a6e22e", punct: "#75715e", operator: "#f92672", comment: "#75715e", type: "#66d9e8", default: "#f8f8f2" }
  },
  "nord": {
    bg0: "#2e3440", bg1: "#242933",
    atmoColor: "rgba(129,161,193,0.05)",
    frameGlass: "rgba(36,41,51,0.95)", frameBorder: "rgba(129,161,193,0.20)",
    titleBar: "rgba(129,161,193,0.05)", gutterBg: "rgba(0,0,0,0.20)",
    activeLineBg: "rgba(136,192,208,0.14)", focusLineBg: "rgba(255,255,255,0.04)",
    gutterText: "rgba(76,86,106,0.9)", cursorColor: "#88c0d0", accentColor: "#88c0d0",
    tokens: { string: "#a3be8c", keyword: "#81a1c1", number: "#b48ead", bracket: "#88c0d0", punct: "#4c566a", operator: "#81a1c1", comment: "#616e88", type: "#8fbcbb", default: "#eceff4" }
  },
  "github-dark": {
    bg0: "#0d1117", bg1: "#090d13",
    atmoColor: "rgba(88,166,255,0.04)",
    frameGlass: "rgba(13,17,23,0.95)", frameBorder: "rgba(48,54,61,0.80)",
    titleBar: "rgba(255,255,255,0.02)", gutterBg: "rgba(0,0,0,0.30)",
    activeLineBg: "rgba(88,166,255,0.10)", focusLineBg: "rgba(255,255,255,0.03)",
    gutterText: "rgba(139,148,158,0.9)", cursorColor: "#58a6ff", accentColor: "#58a6ff",
    tokens: { string: "#a5d6ff", keyword: "#ff7b72", number: "#79c0ff", bracket: "#ffa657", punct: "#8b949e", operator: "#ff7b72", comment: "#8b949e", type: "#7ee787", default: "#c9d1d9" }
  },
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
  // Cancellation ref: when set + cancelled=true, the in-flight render loop exits cleanly
  const renderSignalRef = useRef<RenderSignal | null>(null);
  const videosRef = useRef<RenderedVideo[]>([]);
  const storedDraft = useEditorStore((state) => state.drafts[projectId]);
  const resolvedDraft = storedDraft ?? {
    ...defaultEditorDraft,
    title,
    language,
    aspect: aspect === "16:9" ? "16:9" : "9:16",
    normalSpeed,
    focusSpeed,
    sound: sound as "off" | "soft" | "typewriter" | "keyboard" | "chime",
    soundVolume,
    focus: focus.map((line) => Number(line)).filter((line) => !Number.isNaN(line)),
    code,
    narration: null as Narration | null,
  };
  const resolvedTitle = resolvedDraft.title;
  const resolvedLanguage = resolvedDraft.language;
  const resolvedAspect = resolvedDraft.aspect === "16:9" ? "16:9" : "9:16";
  const resolvedCode = resolvedDraft.code;
  const resolvedFocus = resolvedDraft.focus.map((line) => String(line));
  const resolvedNormalSpeed = resolvedDraft.normalSpeed;
  const resolvedFocusSpeed = resolvedDraft.focusSpeed;
  const resolvedSound = resolvedDraft.sound;
  const resolvedSoundVolume = resolvedDraft.soundVolume;
  const resolvedNarration = resolvedDraft.narration;
  const resolvedTheme = resolvedDraft.theme ?? "vscode";
  const resolvedBgPresetId = resolvedDraft.bgPresetId ?? "cosmic";
  const resolvedCodeFont = resolvedDraft.codeFont ?? "ui-monospace";
  const resolvedCursorBlink = resolvedDraft.cursorBlink ?? true;
  const resolvedFocusFlash = resolvedDraft.focusFlash ?? true;
  const aspectRatios = [resolvedAspect];
  const renderLineCount = useMemo(
    () => (resolvedCode.trim().length > 0 ? resolvedCode.split("\n").length : 0),
    [resolvedCode]
  );
  const hasRenderableCode = renderLineCount > 0;

  const estimatedDurationMs = useMemo(
    () => calculateRenderDurationMs(resolvedCode, resolvedFocus, resolvedNormalSpeed, resolvedFocusSpeed),
    [resolvedCode, resolvedFocus, resolvedNormalSpeed, resolvedFocusSpeed]
  );
  const estimatedDuration = formatDuration(estimatedDurationMs);
  const renderTooLong = estimatedDurationMs > MAX_RENDER_DURATION_MS;
  const renderLongEnoughToWarn = estimatedDurationMs > LONG_RENDER_WARNING_MS;
  const canRender = hasRenderableCode && !renderTooLong;
  const renderStatus = error
    ? {
        status: "error" as const,
        title: "Render could not start",
        description: error,
      }
    : loading || rendering
      ? {
          status: "loading" as const,
          title: rendering ? "Rendering video" : "Creating export job",
          description: rendering
            ? "The browser renderer is painting frames and encoding the WebM file."
            : "The server is validating plan limits and creating the export job.",
        }
      : videos.length > 0
        ? {
            status: "success" as const,
            title: "Video ready",
            description: "Preview the export on the right or download the generated WebM file.",
          }
        : renderTooLong
          ? {
              status: "error" as const,
              title: "Render duration is too long",
              description: "Increase typing speeds or reduce the project length before exporting.",
            }
        : hasRenderableCode
          ? {
              status: "empty" as const,
              title: "Ready to render",
              description: renderLongEnoughToWarn
                ? "This export runs in real time in the browser. Keep the tab active or increase typing speeds for a faster render."
                : "Create a browser export job to generate the first video.",
            }
          : {
              status: "empty" as const,
              title: "No code payload",
              description: "Open the saved project in the editor, add code, and continue again from that workspace.",
            };

  useEffect(() => {
    setError(null);
  }, [projectId, storedDraft]);

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  useEffect(() => {
    return () => {
      if (renderSignalRef.current) {
        renderSignalRef.current.cancelled = true;
      }
      videosRef.current.forEach((video) => URL.revokeObjectURL(video.url));
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
          format: "webm"
        })
      });

      const data = (await response.json()) as {
        jobs?: Job[];
        data?: { jobs?: Job[] };
        error?: string | { message?: string };
      };
      if (!response.ok) {
        const message = typeof data.error === "string" ? data.error : data.error?.message;
        setError(message ?? "Unable to create export jobs.");
        setLoading(false);
        return [];
      }

      const nextJobs = data.data?.jobs ?? data.jobs ?? [];
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
    // Cancel any in-flight render before starting a new one
    if (renderSignalRef.current) {
      renderSignalRef.current.cancelled = true;
    }
    // Stop any queued speech synthesis from a previous render
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    const signal: RenderSignal = { cancelled: false };
    renderSignalRef.current = signal;

    setRendering(true);
    setError(null);

    try {
      const nextVideos: RenderedVideo[] = [];
      for (const job of targetJobs) {
        if (signal.cancelled) break;
        const blob = await renderVideoBlob({
          title: resolvedTitle,
          language: resolvedLanguage,
          aspectRatio: job.aspectRatio,
          code: resolvedCode,
          focusLines: resolvedFocus.map((line) => Number(line)).filter((line) => !Number.isNaN(line)),
          watermarked: job.watermarked,
          normalSpeed: resolvedNormalSpeed,
          focusSpeed: resolvedFocusSpeed,
          sound: resolvedSound,
          soundVolume: resolvedSoundVolume,
          narration: resolvedNarration,
          theme: resolvedTheme,
          bgPresetId: resolvedBgPresetId,
          codeFont: resolvedCodeFont,
          cursorBlink: resolvedCursorBlink,
          focusFlash: resolvedFocusFlash,
          signal,
        });
        if (signal.cancelled) break;

        const url = URL.createObjectURL(blob);
        nextVideos.push({
          exportId: job.exportId,
          aspectRatio: job.aspectRatio,
          format: job.format,
          url,
          filename: `${slugify(resolvedTitle)}-${job.aspectRatio.replace(":", "x")}.${getFileExtension(job.format)}`
        });
      }

      if (!signal.cancelled) {
        setVideos((current) => {
          current.forEach((video) => URL.revokeObjectURL(video.url));
          return nextVideos;
        });
      }
    } catch (renderError) {
      if (!signal.cancelled) {
        setError(renderError instanceof Error ? renderError.message : "Video rendering failed.");
      }
    } finally {
      if (!signal.cancelled) {
        setRendering(false);
      }
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
            <CardContent className="flex-1 overflow-y-auto app-scroll space-y-3 px-3 pb-3">
            <div className="grid gap-2 md:grid-cols-2">
              <Meta label="Project" value={resolvedTitle} />
              <Meta label="Language" value={resolvedLanguage} />
              <Meta label="Aspect mode" value={resolvedAspect} />
              <Meta label="Normal line speed" value={formatMultiplier(resolvedNormalSpeed)} />
              <Meta label="Focused line speed" value={formatMultiplier(resolvedFocusSpeed)} />
              <Meta label="Typing sound" value={resolvedSound} />
              <Meta label="Insertion volume" value={`${Math.round(Number(resolvedSoundVolume) * 100)}%`} />
              <Meta label="Focus lines" value={resolvedFocus.length ? resolvedFocus.join(", ") : "None"} />
              <Meta label="Render source lines" value={`${renderLineCount}`} />
              <Meta label="Est. duration" value={estimatedDuration} />
              <Meta label="Theme" value={resolvedTheme} />
              <Meta label="Background" value={resolvedBgPresetId} />
              <Meta label="Narration" value={resolvedNarration ? `${resolvedNarration.segments.length} segments` : "None"} />
            </div>

            <div className="flex flex-wrap gap-1">
              {aspectRatios.map((ratio) => (
                <Badge key={ratio} className="text-[10px] bg-secondary/50 text-secondary-foreground">{ratio}</Badge>
              ))}
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 h-9 text-xs font-semibold glow-primary-sm hover:glow-primary transition-all" onClick={handleCreateAndRender} disabled={loading || rendering || !canRender}>
                {loading || rendering ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Creating video...
                  </>
                ) : (
                  "Create video"
                )}
              </Button>
              <Button className="flex-1 h-9 text-xs font-semibold hover:shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0" onClick={handleRenderVideos} disabled={rendering || jobs.length === 0 || !canRender} variant="secondary">
                {rendering ? "Rendering..." : "Render again"}
              </Button>
              {rendering && (
                <Button
                  variant="outline"
                  className="h-8 text-xs px-2 border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (renderSignalRef.current) {
                      renderSignalRef.current.cancelled = true;
                    }
                    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
                    setRendering(false);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
            
            <RenderStatusPanel {...renderStatus} />
          </CardContent>
        </Card>

        <Card className="flex flex-col min-h-0 border-border/40 bg-card shadow-sm">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-base">Export jobs</CardTitle>
            <CardDescription className="text-xs">Plan-aware export jobs with format and watermark settings.</CardDescription>
          </CardHeader>
            <CardContent className="flex-1 overflow-y-auto app-scroll space-y-3 px-3 pb-3">
            {jobs.length === 0 ? (
              <RenderStatusPanel
                status="empty"
                title="No export jobs yet"
                description="Click Create video on the left to validate the payload and start rendering."
              />
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
                  <a
                    href={video.url}
                    download={video.filename}
                    className={cn(
                      buttonVariants({ size: "sm" }),
                      "h-7 text-[11px] px-3 glow-primary-sm hover:glow-primary transition-all",
                    )}
                  >
                    Download .{getFileExtension(video.format)}
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

function getFileExtension(format: string) {
  return format === "mp4" ? "mp4" : "webm";
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
  theme: string;
  bgPresetId: string;
  codeFont: string;
  cursorBlink: boolean;
  focusFlash: boolean;
  signal: RenderSignal;
}) {
  const {
    title, language, aspectRatio, code, focusLines, watermarked,
    normalSpeed, focusSpeed, sound, soundVolume, narration,
    theme, bgPresetId, codeFont, cursorBlink, focusFlash, signal,
  } = opts;

  if (typeof window === "undefined") throw new Error("Browser only.");
  if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder not available.");

  // Resolve preset first
  const preset = aspectDimensions[aspectRatio];
  if (!preset) throw new Error(`Unknown aspect ratio: ${aspectRatio}`);

  // Resolve theme and background
  const codeTheme = CODE_THEMES[theme] ?? CODE_THEMES["vscode"]!;
  const bgPreset: BgPreset = BG_PRESETS.find((p) => p.id === bgPresetId) ?? BG_PRESETS[0]!;
  const resolvedFont = codeFont || "ui-monospace";

  // Pre-load custom font if needed
  if (resolvedFont !== "ui-monospace" && resolvedFont !== "Courier New" && resolvedFont !== "monospace") {
    loadGoogleFonts();
    try { await document.fonts.load(`${preset.fontSize}px "${resolvedFont}"`); } catch { /* fallback ok */ }
  }

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
  let vStream = canvas.captureStream(0);
  let vTrack = vStream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
  let manualFrameCapture = typeof vTrack?.requestFrame === "function";
  if (!manualFrameCapture) {
    vStream.getTracks().forEach((track) => track.stop());
    vStream = canvas.captureStream(RECORDING_FPS);
    vTrack = vStream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
    manualFrameCapture = false;
  }
  // Use singleton AudioContext (avoids Chrome 6-ctx-per-page limit on repeated renders)
  const audioCtx = acquireAudioCtx();
  if (audioCtx?.state === "suspended") await audioCtx.resume();
  const audioDest = audioCtx ? audioCtx.createMediaStreamDestination() : null;
  const combined = new MediaStream([
    ...vStream.getVideoTracks(),
    ...(audioDest ? audioDest.stream.getAudioTracks() : []),
  ]);

  // ── Recorder ──
  const chunks: BlobPart[] = [];
  const rec = createWebmRecorder(combined, {
    videoBitsPerSecond: RECORDING_VIDEO_BITS_PER_SECOND[aspectRatio] ?? 8_000_000,
    audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
  }, true);
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
    const mult = Math.max(0.25, Number(isFocused ? focusSpeed : normalSpeed) || 1);
    const msPerChar = isFocused ? 150 : 110;
    const pad = isFocused ? 280 : 160;
    return Math.round((chars * msPerChar + pad) / mult);
  });

  // Cumulative end times
  const cumEnd: number[] = [];
  let sum = 0;
  for (const d of lineDurations) { sum += d; cumEnd.push(sum); }
  const totalMs = Math.max(3000, sum);
  const wrappedLines = allLines.map((lineText, index) =>
    buildWrappedLineRows(lineText, index + 1, effectivePreset.maxCharsPerLine)
  );
  const visibleLineBudget = effectivePreset.maxVisibleLines + VISIBLE_LINE_OVERSCAN;

  // ── Start recording ──
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      combined.getTracks().forEach((t) => t.stop());
      // Note: audioCtx is a singleton — do NOT close it between renders
      resolve(createWebmBlob(chunks, rec.mimeType));
    };
  });
  rec.start(200);

  // ── Startup delay: let recorder buffer initialize before audio begins ──
  const STARTUP_MS = 350;
  await delay(STARTUP_MS);
  if (signal.cancelled) {
    try { rec.stop(); } catch { /* ignore */ }
    await done.catch(() => {});
    return createWebmBlob([], rec.mimeType);
  }

  // ── Schedule audio AFTER startup (so audio aligns with the recorded stream) ──
  // t0Audio is the AudioContext absolute time when char-0 of line-0 starts
  const t0Audio = audioCtx ? (audioCtx.currentTime + 0.04) : null;
  if (audioCtx && audioDest && t0Audio !== null && sound !== "off" && Number(soundVolume) > 0) {
    const vol = Number(soundVolume);
    let elapsed = 0;
    for (let li = 0; li < allLines.length; li++) {
      const lineText = allLines[li]!;
      const dur = lineDurations[li]!;
      const chars = lineText.length;
      if (chars === 0) { elapsed += dur; continue; }
      for (let ci = 0; ci < chars; ci++) {
        const frac = (ci + 1) / (chars + 1);
        const when = t0Audio + (elapsed + dur * frac) / 1000;
        emitClick(audioCtx, audioDest, when, sound, vol, lineText[ci]!, ci === chars - 1);
      }
      elapsed += dur;
    }
  }

  const ttsCleanup = narration ? scheduleNarrationTTS(narration, allLines, cumEnd, totalMs) : null;

  // ── rAF frame loop — AudioContext is the master clock ──
  // Video virtual-time = audioCtx.currentTime - t0Audio (in ms).
  // This guarantees audio clicks are always in sync with the animation,
  // even if rAF or setTimeout are throttled by the browser.
  type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
  const particles: Particle[] = [];
  let prevActiveIdx = -1;
  let frameNum = 0;
  const perf0 = performance.now();
  let lastFrameAt = Number.NEGATIVE_INFINITY;

  // Derive virtual animation time from the master clock
  const getMs = (): number => {
    if (audioCtx && t0Audio !== null) return Math.max(0, (audioCtx.currentTime - t0Audio) * 1000);
    return performance.now() - perf0;
  };

  await new Promise<void>((resolve) => {
    let stopped = false;

    function rafFrame(now: number) {
      if (signal.cancelled || stopped) { resolve(); return; }

      const ms = Math.min(getMs(), totalMs);
      const shouldPaint = ms >= totalMs || now - lastFrameAt >= RECORDING_FRAME_MS - 1;
      if (!shouldPaint) {
        requestAnimationFrame(rafFrame);
        return;
      }
      lastFrameAt = now;

      let activeIdx = cumEnd.findIndex((c) => ms <= c);
      if (activeIdx === -1) activeIdx = allLines.length - 1;

      const prevEnd = activeIdx === 0 ? 0 : cumEnd[activeIdx - 1]!;
      const dur = lineDurations[activeIdx]!;
      const progress = Math.min(1, Math.max(0, ms - prevEnd) / Math.max(1, dur));

      // Spawn particles on focus-line entry
      if (focusFlash && activeIdx !== prevActiveIdx && focusSet.has(activeIdx + 1)) {
        const spawnX = effectivePreset.width * 0.5;
        const spawnY = effectivePreset.height * 0.55;
        for (let i = 0; i < 14; i++) {
          const angle = (Math.PI * 2 * i) / 14;
          const speed = 2 + Math.random() * 4;
          particles.push({ x: spawnX, y: spawnY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2, life: 1, color: codeTheme.accentColor, size: 2 + Math.random() * 3 });
        }
      }
      prevActiveIdx = activeIdx;

      // Advance particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.x += p.vx; p.y += p.vy; p.vy += 0.2;
        p.life -= 0.025;
        if (p.life <= 0) particles.splice(i, 1);
      }

      const visLines = buildVisibleLines(
        wrappedLines,
        allLines,
        activeIdx,
        progress,
        effectivePreset.maxCharsPerLine,
        visibleLineBudget,
      );
      const activeLine = activeIdx + 1;
      const subtitle = narration ? getNarrationText(narration, activeLine) : null;

      paintFrame(ctx, effectivePreset, title, language, visLines, activeLine,
        focusSet, watermarked, subtitle, codeTheme, bgPreset, frameNum, cursorBlink, particles, resolvedFont);

      frameNum++;
      if (manualFrameCapture && typeof vTrack?.requestFrame === "function") vTrack.requestFrame();

      if (ms >= totalMs) {
        stopped = true;
        if (ttsCleanup) ttsCleanup();
        // 400ms tail-buffer so recorder captures last frames
        setTimeout(() => { rec.stop(); resolve(); }, 400);
      } else {
        requestAnimationFrame(rafFrame);
      }
    }

    requestAnimationFrame(rafFrame);
  });

  if (signal.cancelled) return createWebmBlob([], rec.mimeType);

  const webmBlob = await done;

  return webmBlob;
}

function delay(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }


/* ── Build visible lines for a given time snapshot ─────────────────────── */

interface VLine {
  lineNum: number;     // original 1-based line number
  text: string;        // text to render (may be partial for active line)
  gutterLabel: string; // "  1" or "   " for continuation rows
  isCont: boolean;     // is this a continuation (word-wrapped) row?
  isEmpty: boolean;    // true for blank lines
  baseColor?: string;  // color to use for this line (if continuation, inherited from parent)
}

type WrappedLineRows = {
  rows: VLine[];
  baseColor?: string;
};

function buildVisibleLines(
  wrappedLines: WrappedLineRows[],
  allLines: string[],
  activeIdx: number,
  progress: number,
  maxChars: number,
  rowBudget: number,
): VLine[] {
  const activeRaw = allLines[activeIdx] ?? "";
  const activeRows = activeRaw.length === 0
    ? buildWrappedLineRows(activeRaw, activeIdx + 1, maxChars).rows
    : buildRowsForText(
        activeRaw.slice(0, Math.max(1, Math.ceil(activeRaw.length * progress))),
        activeIdx + 1,
        maxChars,
        getBaseColor(activeRaw),
      );

  const previousRows: VLine[] = [];
  let rowsCollected = activeRows.length;

  for (let i = activeIdx - 1; i >= 0 && rowsCollected < rowBudget; i--) {
    const rows = wrappedLines[i]?.rows ?? [];
    previousRows.unshift(...rows);
    rowsCollected += rows.length;
  }

  return [...previousRows, ...activeRows];
}

function buildWrappedLineRows(raw: string, lineNum: number, maxChars: number): WrappedLineRows {
  const baseColor = getBaseColor(raw);
  return {
    baseColor,
    rows: raw.length === 0
      ? [{ lineNum, text: "", gutterLabel: String(lineNum).padStart(3, " "), isCont: false, isEmpty: true }]
      : buildRowsForText(raw, lineNum, maxChars, baseColor),
  };
}

function buildRowsForText(
  text: string,
  lineNum: number,
  maxChars: number,
  baseColor?: string,
): VLine[] {
  return wordWrap(text, maxChars).map((segment, index) => ({
    lineNum,
    text: segment,
    gutterLabel: index === 0 ? String(lineNum).padStart(3, " ") : "   ",
    isCont: index > 0,
    isEmpty: false,
    baseColor,
  }));
}

function getBaseColor(raw: string): string | undefined {
  const trimmed = raw.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("#") ? "#67e8f9" : undefined;
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
  const ws = ch.trim().length === 0;

  if (sound === "chime") {
    // Soft piano/xylophone-like sound: sine wave with quick decay
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // Map character to a pentatonic-ish note (pleasant, not jarring)
    const notes = [523, 587, 659, 784, 880, 988, 1047]; // C5 pentatonic ish
    const noteIdx = (ch.charCodeAt(0) ?? 65) % notes.length;
    osc.type = "sine";
    osc.frequency.setValueAtTime(accent ? (notes[noteIdx]! * 1.5) : notes[noteIdx]!, when);
    const peak = (accent ? 0.08 : 0.05) * vol * (ws ? 0.3 : 1);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    osc.connect(gain); gain.connect(dest);
    osc.start(when); osc.stop(when + 0.09);
    return;
  }

  if (sound === "keyboard") {
    // Deep mechanical keyboard: noise burst + resonant click
    const bufLen = Math.floor(ctx.sampleRate * 0.012);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(ws ? 120 : accent ? 380 : 260, when);
    filt.Q.setValueAtTime(1.2, when);
    const gain = ctx.createGain();
    const peak = (accent ? 0.22 : 0.14) * vol * (ws ? 0.5 : 1);
    gain.gain.setValueAtTime(peak, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.014);
    src.connect(filt); filt.connect(gain); gain.connect(dest);
    src.start(when); src.stop(when + 0.016);
    return;
  }

  // Original soft / typewriter logic
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.setValueAtTime(sound === "typewriter" ? 900 : 700, when);
  filt.Q.setValueAtTime(0.7, when);
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
  theme: CodeTheme,
  bgPreset: BgPreset,
  frameNum: number,
  cursorBlink: boolean,
  particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }>,
  codeFont: string,
) {
  const W = preset.width;
  const H = preset.height;
  const fs = preset.fontSize;
  const maxVis = preset.maxVisibleLines;
  const vert = W < H;

  ctx.clearRect(0, 0, W, H);

  // ── Background (themed gradient) ──
  drawBackground(ctx, W, H, bgPreset, null);

  // ── Atmospheric accent glow (theme-colored) ──
  ctx.fillStyle = theme.atmoColor;
  ctx.beginPath();
  ctx.arc(W * 0.25, H * 0.18, Math.min(W, H) * 0.30, 0, Math.PI * 2);
  ctx.fill();
  // Secondary softer glow opposite corner
  ctx.fillStyle = theme.atmoColor.replace("0.06", "0.03").replace("0.05", "0.025").replace("0.04", "0.02");
  ctx.beginPath();
  ctx.arc(W * 0.75, H * 0.82, Math.min(W, H) * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // Frame dimensions
  const fw = vert ? W * 0.90 : W * 0.84;
  const fh = vert ? H - 380 : H * 0.84;
  const fx = (W - fw) / 2;
  const fy = vert ? 170 : (H - fh) / 2;

  // ── Frame shadow + glass fill ──
  ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
  rr(ctx, fx, fy, fw, fh, 22);
  ctx.fillStyle = theme.frameGlass; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // Frame border (theme-colored subtle glow ring)
  ctx.strokeStyle = theme.frameBorder; ctx.lineWidth = 1.5; ctx.stroke();

  // ── Title bar ──
  ctx.fillStyle = theme.titleBar;
  rr(ctx, fx + 12, fy + 12, fw - 24, 46, 12); ctx.fill();

  // ── Gutter background ──
  ctx.fillStyle = theme.gutterBg;
  rr(ctx, fx + 12, fy + 70, 56, fh - 82, 12); ctx.fill();

  // ── Traffic-light dots ──
  (["#ef4444", "#f59e0b", "#10b981"] as const).forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(fx + 34 + i * 19, fy + 35, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── Title text ──
  ctx.fillStyle = "#e2e8f0";
  ctx.font = `600 ${vert ? 18 : 16}px ui-sans-serif, system-ui`;
  const maxTitleW = fw - 200;
  ctx.fillText(title, fx + 108, fy + 41, maxTitleW);

  // ── Language badge ──
  const langW = vert ? 80 : 70;
  const langX = fx + fw - langW - 14;
  const langY = fy + 20;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  rr(ctx, langX, langY, langW, 24, 6); ctx.fill();
  ctx.fillStyle = theme.accentColor;
  ctx.font = `500 ${vert ? 13 : 11}px ui-sans-serif, system-ui`;
  ctx.textAlign = "center";
  ctx.fillText(language, langX + langW / 2, langY + 16);
  ctx.textAlign = "start";

  // ── Code area (clipped to frame) ──
  const codeAreaTop = fy + 70;
  const codeAreaBottom = fy + fh;
  const codeAreaLeft = fx + 80;
  const codeAreaRight = fx + fw;
  const lineH = fs * 1.58;

  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, codeAreaTop, fw, codeAreaBottom - codeAreaTop);
  ctx.clip();

  const WRAP_BUFFER = 4;
  const effMaxVis = Math.max(4, maxVis - WRAP_BUFFER);
  let startIdx = Math.max(0, visLines.length - effMaxVis);
  while (startIdx > 0 && visLines[startIdx]!.isCont) startIdx--;
  const viewport = visLines.slice(startIdx);
  let y = codeAreaTop + 18 + fs;

  // Track cursor position for blinking cursor
  let cursorX = -1, cursorY = -1;

  for (const vl of viewport) {
    const isActive = vl.lineNum === activeLine;
    const isFocused = focusSet.has(vl.lineNum);

    // ── Active line highlight bar ──
    if (isActive && !vl.isEmpty) {
      ctx.fillStyle = theme.activeLineBg;
      rr(ctx, codeAreaLeft - 4, y - lineH + 6, codeAreaRight - codeAreaLeft + 4, lineH, 8);
      ctx.fill();
      // Accent left border
      ctx.fillStyle = theme.accentColor;
      ctx.fillRect(fx + 12, y - lineH + 8, 3, lineH - 4);
    }

    // ── Focus line highlight (non-active) ──
    if (isFocused && !isActive && !vl.isEmpty) {
      ctx.fillStyle = theme.focusLineBg;
      rr(ctx, codeAreaLeft - 4, y - lineH + 6, codeAreaRight - codeAreaLeft + 4, lineH, 8);
      ctx.fill();
    }

    // ── Gutter line number ──
    ctx.fillStyle = vl.isCont ? "rgba(100,116,139,0.5)" : theme.gutterText;
    ctx.font = `${fs - 6}px ${codeFont}, ui-monospace, monospace`;
    ctx.fillText(vl.gutterLabel, fx + 22, y);

    if (vl.isCont) {
      ctx.fillStyle = `${theme.accentColor}99`;
      ctx.font = `${fs - 8}px ui-sans-serif, system-ui`;
      ctx.fillText("↳", fx + 52, y);
    }

    // ── Code text (tokenized + theme-aware) ──
    if (vl.text.length > 0) {
      const monoFont = `${fs}px ${codeFont}, ui-monospace, SFMono-Regular, monospace`;
      drawTokenized(ctx, vl.text, codeAreaLeft + 10, y, fs, codeAreaRight - codeAreaLeft - 20, vl.baseColor, theme, monoFont);

      // Track cursor at end of last active segment
      if (isActive) {
        ctx.font = monoFont;
        cursorX = codeAreaLeft + 10 + ctx.measureText(vl.text).width + 2;
        cursorY = y;
      }
    } else if (isActive) {
      cursorX = codeAreaLeft + 10;
      cursorY = y;
    }

    y += lineH;
  }

  // ── Blinking cursor ──
  if (cursorBlink && cursorX >= 0 && cursorY >= 0) {
    const showCursor = frameNum % 30 < 18; // blinks at ~1Hz at 30fps
    if (showCursor) {
      ctx.fillStyle = theme.cursorColor;
      ctx.shadowColor = theme.cursorColor;
      ctx.shadowBlur = 8;
      ctx.fillRect(cursorX, cursorY - fs + 2, Math.max(2, fs * 0.07), fs * 1.05);
      ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    }
  }

  // ── Particles (focus flash effect) ──
  for (const p of particles) {
    const alpha = Math.max(0, p.life);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  // ── Watermark ──
  if (watermarked) {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.font = `600 ${vert ? 16 : 13}px ui-sans-serif, system-ui`;
    ctx.fillText("CodeCinematic", fx + fw - (vert ? 155 : 130), fy + fh + (vert ? 40 : 28));
  }

  // ── Subtitle overlay ──
  if (subtitle) {
    const sf = vert ? 16 : 13;
    const sy = vert ? H - 72 : H - 28;
    const mw = W - 80;
    ctx.font = `500 ${sf}px ui-sans-serif, system-ui`;
    const tw = Math.min(ctx.measureText(subtitle).width, mw);
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    rr(ctx, (W - tw) / 2 - 16, sy - sf - 5, tw + 32, sf + 16, 10); ctx.fill();
    ctx.strokeStyle = `${theme.accentColor}33`; ctx.lineWidth = 1;
    rr(ctx, (W - tw) / 2 - 16, sy - sf - 5, tw + 32, sf + 16, 10); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.textAlign = "center";
    ctx.fillText(subtitle, W / 2, sy, mw); ctx.textAlign = "start";
  }
}

/* ── Syntax-highlighted code drawing ──────────────────────────────────── */

function drawTokenized(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  maxWidth: number,
  baseColor: string | undefined,
  theme: CodeTheme,
  monoFont: string,
) {
  ctx.font = monoFont;
  if (baseColor) {
    ctx.fillStyle = baseColor;
    ctx.fillText(text, x, y, maxWidth);
    return;
  }
  const tokens = getCachedTokens(text, theme);
  let cx = x;
  const right = x + maxWidth;
  for (const tok of tokens) {
    if (cx >= right) break;
    ctx.fillStyle = tok.color;
    const availW = right - cx;
    ctx.fillText(tok.text, cx, y, availW);
    cx += ctx.measureText(tok.text).width;
  }
}

/* ── Multi-language theme-aware tokenizer ─────────────────────────────── */

const TOKEN_CACHE_LIMIT = 3000;
const tokenCache = new Map<string, Array<{ text: string; color: string }>>();

function getCachedTokens(text: string, theme: CodeTheme): Array<{ text: string; color: string }> {
  const key = `${theme.tokens.keyword}|${theme.tokens.string}|${theme.tokens.comment}|${theme.tokens.default}|${text}`;
  const cached = tokenCache.get(key);
  if (cached) return cached;
  const tokens = tokenize(text, theme);
  if (tokenCache.size > TOKEN_CACHE_LIMIT) tokenCache.clear();
  tokenCache.set(key, tokens);
  return tokens;
}

const KEYWORDS_BY_LANGUAGE: Record<string, string[]> = {
  typescript: ["const","let","var","function","return","async","await","class","new","if","else","for","while","import","export","from","type","interface","extends","implements","void","null","undefined","true","false","this","super","try","catch","throw"],
  javascript: ["const","let","var","function","return","async","await","class","new","if","else","for","while","import","export","from","null","undefined","true","false","this","super","try","catch","throw"],
  python: ["def","class","return","import","from","if","elif","else","for","while","in","not","and","or","True","False","None","with","as","try","except","finally","raise","lambda","self","pass","yield","async","await"],
  go: ["func","var","const","type","struct","interface","return","if","else","for","range","import","package","nil","true","false","go","defer","select","case","switch","break","continue","make","new","map","chan","error"],
  rust: ["fn","let","mut","const","struct","enum","impl","trait","use","pub","mod","return","if","else","for","while","match","Some","None","Ok","Err","true","false","self","Self","async","await","move","ref","dyn","where"],
  java: ["public","private","protected","static","void","class","interface","extends","implements","return","new","if","else","for","while","import","package","null","true","false","this","super","try","catch","throw","final","abstract","synchronized"],
  kotlin: ["fun","val","var","class","interface","object","return","if","else","for","while","when","import","package","null","true","false","this","super","try","catch","throw","companion","data","sealed","override","open"],
  swift: ["func","var","let","class","struct","enum","protocol","extension","return","if","else","for","while","guard","switch","case","default","import","nil","true","false","self","super","try","catch","throw","async","await","init","deinit"],
  csharp: ["public","private","protected","static","void","class","interface","namespace","return","new","if","else","for","while","foreach","using","null","true","false","this","base","try","catch","throw","async","await","var","string","int","bool"],
  cpp: ["auto","const","class","struct","enum","namespace","return","new","delete","if","else","for","while","switch","case","include","nullptr","true","false","this","public","private","protected","virtual","override","template","typename"],
  bash: ["if","then","else","elif","fi","for","while","do","done","case","esac","function","return","in","echo","exit","export","source","local","readonly"],
  sql: ["SELECT","FROM","WHERE","JOIN","INNER","LEFT","RIGHT","ON","GROUP","BY","ORDER","HAVING","INSERT","INTO","UPDATE","SET","DELETE","CREATE","TABLE","DROP","ALTER","INDEX","VIEW","AS","AND","OR","NOT","IN","IS","NULL","DISTINCT","LIMIT","OFFSET"],
  default: ["const","let","var","function","return","async","await","class","new","if","else","for","while","import","export","null","true","false"],
};

function tokenize(line: string, theme: CodeTheme): Array<{ text: string; color: string }> {
  const trimmed = line.trimStart();

  // ── Full-line comment ──
  if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("--")) {
    return [{ text: line, color: theme.tokens.comment }];
  }
  if (trimmed.startsWith("/*") || trimmed.startsWith("*")) {
    return [{ text: line, color: theme.tokens.comment }];
  }
  if (trimmed.startsWith("<!--")) {
    return [{ text: line, color: theme.tokens.comment }];
  }

  const patterns: Array<{ regex: RegExp; color: string }> = [
    // Strings
    { regex: /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/, color: theme.tokens.string },
    // Numbers (including hex, floats)
    { regex: /^(0x[0-9a-fA-F]+|\d+(\.\d+)?([eE][+-]?\d+)?)/, color: theme.tokens.number },
    // Type annotations (: Type or <Type>)
    { regex: /^(:\s*[A-Z][a-zA-Z0-9_<>[\]|]+)/, color: theme.tokens.type },
    // Decorators (@something)
    { regex: /^@[a-zA-Z_][a-zA-Z0-9_]*/, color: theme.tokens.operator },
    // Brackets and parens
    { regex: /^([{}()[\]])/, color: theme.tokens.bracket },
    // Operators
    { regex: /^(=>|===|!==|==|!=|<=|>=|&&|\|\||\.\.\.|\+\+|--|[.,:;?!+\-*/&|^~%<>])/, color: theme.tokens.operator },
  ];

  const tokens: Array<{ text: string; color: string }> = [];
  let rem = line;
  while (rem.length > 0) {
    let matched = false;

    // Check if current word is a keyword
    const wordMatch = rem.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (wordMatch) {
      const word = wordMatch[1]!;
      // Check against known keywords
      const allKws = [
        ...(KEYWORDS_BY_LANGUAGE["typescript"] ?? []),
        ...(KEYWORDS_BY_LANGUAGE["python"] ?? []),
        ...(KEYWORDS_BY_LANGUAGE["go"] ?? []),
      ];
      if (allKws.includes(word)) {
        tokens.push({ text: word, color: theme.tokens.keyword });
        rem = rem.slice(word.length);
        matched = true;
      } else if (/^[A-Z][A-Za-z0-9]*$/.test(word)) {
        // PascalCase → likely a type/class name
        tokens.push({ text: word, color: theme.tokens.type });
        rem = rem.slice(word.length);
        matched = true;
      }
    }

    if (!matched) {
      for (const p of patterns) {
        const m = rem.match(p.regex);
        if (m) {
          tokens.push({ text: m[0], color: p.color });
          rem = rem.slice(m[0].length);
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      tokens.push({ text: rem[0]!, color: theme.tokens.default });
      rem = rem.slice(1);
    }
  }
  return tokens;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function formatMultiplier(value: string) {
  return `${Number(value).toFixed(2)}x`;
}

function calculateRenderDurationMs(
  code: string,
  focus: string[],
  normalSpeed: string,
  focusSpeed: string,
) {
  const allLines = code.split("\n");
  const focusSet = new Set(focus.map(Number).filter((line) => !Number.isNaN(line)));
  let totalMs = 0;

  for (let i = 0; i < allLines.length; i++) {
    const chars = allLines[i]!.length;
    const isFocused = focusSet.has(i + 1);
    const mult = Math.max(0.25, Number(isFocused ? focusSpeed : normalSpeed) || 1);
    if (chars === 0) {
      totalMs += Math.round(180 / mult);
      continue;
    }

    const msPerChar = isFocused ? 150 : 110;
    const pad = isFocused ? 280 : 160;
    totalMs += Math.round((chars * msPerChar + pad) / mult);
  }

  return Math.max(3000, totalMs);
}

function formatDuration(ms: number) {
  const secs = Math.ceil(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `~${m}m ${s}s` : `~${s}s`;
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Maximize2, Play, Type, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { loadGoogleFonts } from "./shared/font-catalog";
import { FontPickerModal } from "./shared/font-picker-modal";
import { BgPicker } from "./shared/bg-picker";
import { BG_PRESETS, type BgPreset, drawBackground, wrapText } from "./shared/canvas-utils";
import { playTypingPulse } from "./shared/audio-utils";
import { createWebmBlob, createWebmRecorder } from "./shared/media-recorder";

const ASPECT_OPTIONS = [
  { value: "9:16", label: "Vertical 9:16", w: 720, h: 1280 },
  { value: "16:9", label: "Landscape 16:9", w: 1280, h: 720 },
] as const;

/* ═══════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════ */
export function WordOfDayPanel({ projectId }: { projectId: string }) {
  // Content
  const [word, setWord] = useState("Ephemeral");
  const [meaning, setMeaning] = useState("lasting for a very short time");

  // Appearance
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [selectedFont, setSelectedFont] = useState("Playfair Display");
  const [wordFontSize, setWordFontSize] = useState(72);
  const [meaningFontSize, setMeaningFontSize] = useState(26);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [bgPreset, setBgPreset] = useState<BgPreset>(BG_PRESETS[0]);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<ImageBitmap | null>(null);

  // Speed & Sound
  const [titleSpeed, setTitleSpeed] = useState(1.0);
  const [wordSpeed, setWordSpeed] = useState(1.0);
  const [meaningSpeed, setMeaningSpeed] = useState(1.0);
  const [sound, setSound] = useState<"off" | "soft" | "typewriter">("soft");
  const [soundVolume, setSoundVolume] = useState(0.3);

  // Render state
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [expandPreview, setExpandPreview] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // Load Google Fonts once
  useEffect(() => { loadGoogleFonts(); }, []);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => () => {
    if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
  }, [uploadedImageUrl]);

  // Handle image upload
  function handleImageUpload(file: File) {
    const url = URL.createObjectURL(file);
    setUploadedImageUrl(url);
    createImageBitmap(file).then(setBgImage);
  }
  function handleImageClear() {
    setUploadedImageUrl(null);
    setBgImage(null);
  }

  // Live preview (16:9 viewport always)
  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    // Always render preview in 16:9 for clean UI layout
    c.width = 640;
    c.height = 360;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawWordFrame(ctx, 640, 360, word, meaning, selectedFont, 1.0, 0.5, bgPreset, bgImage, wordFontSize, meaningFontSize);
  }, [word, meaning, aspect, selectedFont, bgPreset, bgImage, wordFontSize, meaningFontSize]);

  /* ── Render video ── */
  const handleRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !word.trim()) return;
    setRendering(true);
    setVideoUrl(null);
    setProgress("Preparing...");

    const dim = ASPECT_OPTIONS.find((a) => a.value === aspect)!;
    canvas.width = dim.w;
    canvas.height = dim.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setRendering(false); return; }

    const fps = 30;
    const titleDuration = 1.2 / titleSpeed;
    const fadeDuration = 0.8 / titleSpeed;

    // Chars-per-second determines typing duration (matches Code Studio rate)
    const wordCPS = (1000 / 110) * wordSpeed;    // characters per second for word
    const meaningCPS = (1000 / 110) * meaningSpeed; // characters per second for meaning

    const wordTypingDuration = Math.max(0.5, word.length / wordCPS);
    const meaningTypingDuration = Math.max(0.5, meaning.length / meaningCPS);
    const wordDuration = wordTypingDuration + meaningTypingDuration;
    const holdDuration = 1.0;
    const totalFrames = Math.ceil((titleDuration + fadeDuration + wordDuration + holdDuration) * fps);
    const wordSplit = wordTypingDuration / wordDuration;

    // Audio setup
    const audioCtx = typeof AudioContext !== "undefined" ? new AudioContext() : null;
    const audioDest = audioCtx ? audioCtx.createMediaStreamDestination() : null;

    const videoStream = canvas.captureStream(0);
    const videoTrack = videoStream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...(audioDest ? audioDest.stream.getAudioTracks() : []),
    ]);

    const recorder = createWebmRecorder(combinedStream, {
      videoBitsPerSecond: 4_000_000,
    }, true);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(createWebmBlob(chunks, recorder.mimeType));
    });

    // Schedule typing sounds: evenly spaced, one sound per character
    if (audioCtx && audioDest && sound !== "off" && soundVolume > 0) {
      const typeStart = audioCtx.currentTime + titleDuration + fadeDuration + 0.05;
      const wordChars = Array.from(word);
      const meaningChars = Array.from(meaning);

      wordChars.forEach((ch, i) => {
        const when = typeStart + (i / wordCPS);
        playTypingPulse(audioCtx, audioDest, when, sound, soundVolume, ch, i === wordChars.length - 1);
      });
      const meaningStart = typeStart + wordTypingDuration;
      meaningChars.forEach((ch, i) => {
        const when = meaningStart + (i / meaningCPS);
        playTypingPulse(audioCtx, audioDest, when, sound, soundVolume, ch, i === meaningChars.length - 1);
      });
    }

    recorder.start();

    // Wall-clock pacing: each frame advances by exactly 1/fps seconds of animation
    // time, and we wait until the corresponding wall-clock time has elapsed.
    // This prevents the video from being 2-4x too fast on high-refresh-rate displays.
    const renderStart = performance.now();

    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / fps;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (t < titleDuration) {
        drawTitlePhase(ctx, canvas.width, canvas.height, selectedFont, 1.0, bgPreset, bgImage);
      } else if (t < titleDuration + fadeDuration) {
        const fadeProgress = (t - titleDuration) / fadeDuration;
        drawCrumblePhase(ctx, canvas.width, canvas.height, selectedFont, fadeProgress, bgPreset, bgImage);
      } else {
        const wordT = (t - titleDuration - fadeDuration) / wordDuration;
        drawWordFrame(ctx, canvas.width, canvas.height, word, meaning, selectedFont, Math.min(wordT, 1.0), wordSplit, bgPreset, bgImage, wordFontSize, meaningFontSize);
      }

      setProgress(`Rendering... ${Math.round((frame / totalFrames) * 100)}%`);

      // Explicitly capture the painted frame into the MediaRecorder stream
      videoTrack?.requestFrame?.();
      // Pace to wall-clock time so recorded video matches real-time duration
      const targetWall = renderStart + (frame + 1) * (1000 / fps);
      const remainingMs = targetWall - performance.now();
      if (remainingMs > 1) {
        await new Promise((r) => setTimeout(r, remainingMs));
      }
    }

    recorder.stop();
    const blob = await done;
    if (audioCtx) audioCtx.close();
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setRendering(false);
    setProgress("");
  }, [word, meaning, aspect, selectedFont, titleSpeed, wordSpeed, meaningSpeed, sound, soundVolume, bgPreset, bgImage, wordFontSize, meaningFontSize]);

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `word-of-the-day-${word.toLowerCase().replace(/\s+/g, "-")}.webm`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full min-h-0 space-y-2 overflow-y-auto app-scroll">
      <div className="grid gap-2 xl:grid-cols-[1fr_1fr] xl:flex-1 xl:min-h-0">

        {/* LEFT: Settings */}
        <div className="flex flex-col space-y-2 min-h-0 overflow-y-auto app-scroll">
          <Card className="border-border/40 bg-card shadow-sm">
            <CardHeader className="py-2 px-3 border-b border-border/30 mb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Type className="h-4 w-4 text-primary" />
                Word of the Day
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-3">

              {/* Word + Meaning */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">WORD</span>
                <Input
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  className="h-8 text-sm font-semibold border-input shadow-sm"
                  placeholder="Enter the word"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">MEANING</span>
                <Textarea
                  value={meaning}
                  onChange={(e) => setMeaning(e.target.value)}
                  className="min-h-[60px] text-xs border-input shadow-sm resize-none"
                  placeholder="Enter the meaning / definition"
                />
              </div>

              {/* Ratio + Font */}
              <div className="grid gap-2 grid-cols-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">RATIO</span>
                  <select
                    value={aspect}
                    onChange={(e) => setAspect(e.target.value as "9:16" | "16:9")}
                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                  >
                    {ASPECT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">FONT</span>
                  <button
                    type="button"
                    onClick={() => setShowFontPicker(true)}
                    className="flex h-7 w-full rounded-md border border-input shadow-sm bg-transparent px-2 text-xs items-center justify-between hover:border-primary/50 transition-colors"
                  >
                    <span className="truncate" style={{ fontFamily: selectedFont }}>{selectedFont}</span>
                    <Type className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                </div>
              </div>

              {/* Font sizes */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground">WORD SIZE</span>
                    <span className="text-[10px] text-muted-foreground">{wordFontSize}px</span>
                  </div>
                  <input type="range" min={36} max={120} step={2} value={wordFontSize}
                    onChange={(e) => setWordFontSize(parseInt(e.target.value))}
                    className="w-full h-1 accent-primary" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground">MEANING SIZE</span>
                    <span className="text-[10px] text-muted-foreground">{meaningFontSize}px</span>
                  </div>
                  <input type="range" min={14} max={56} step={1} value={meaningFontSize}
                    onChange={(e) => setMeaningFontSize(parseInt(e.target.value))}
                    className="w-full h-1 accent-primary" />
                </div>
              </div>

              {/* Background picker */}
              <div className="pt-1 border-t border-white/5">
                <BgPicker
                  selectedId={bgPreset.id}
                  onSelect={(p) => { setBgPreset(p); handleImageClear(); }}
                  uploadedImageUrl={uploadedImageUrl}
                  onImageUpload={handleImageUpload}
                  onImageClear={handleImageClear}
                />
              </div>

              {/* Speed / Sound / Volume */}
              <div className="space-y-1.5 pt-1 border-t border-white/5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground">TITLE SPEED</span>
                    <span className="text-[10px] text-muted-foreground">{titleSpeed.toFixed(2)}x</span>
                  </div>
                  <input type="range" min={0.5} max={1.5} step={0.05} value={titleSpeed}
                    onChange={(e) => setTitleSpeed(parseFloat(e.target.value))}
                    className="w-full h-1 accent-primary" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">WORD SPEED</span>
                      <span className="text-[10px] text-muted-foreground">{wordSpeed.toFixed(2)}x</span>
                    </div>
                    <input type="range" min={0.5} max={1.5} step={0.05} value={wordSpeed}
                      onChange={(e) => setWordSpeed(parseFloat(e.target.value))}
                      className="w-full h-1 accent-primary" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">MEANING SPEED</span>
                      <span className="text-[10px] text-muted-foreground">{meaningSpeed.toFixed(2)}x</span>
                    </div>
                    <input type="range" min={0.5} max={1.5} step={0.05} value={meaningSpeed}
                      onChange={(e) => setMeaningSpeed(parseFloat(e.target.value))}
                      className="w-full h-1 accent-primary" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">SOUND</span>
                    <select
                      value={sound}
                      onChange={(e) => setSound(e.target.value as "off" | "soft" | "typewriter")}
                      className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                    >
                      <option value="off">Sound off</option>
                      <option value="soft">Soft keys</option>
                      <option value="typewriter">Typewriter</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">VOLUME</span>
                      <span className="text-[10px] text-muted-foreground">{Math.round(soundVolume * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Volume2 className="h-3 w-3 text-muted-foreground shrink-0" />
                      <input type="range" min={0} max={1} step={0.05} value={soundVolume}
                        onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                        className="w-full h-1 accent-primary" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1 h-8 text-xs font-semibold gap-1.5"
                  onClick={handleRender}
                  disabled={rendering || !word.trim()}
                >
                  {rendering ? <><Loader2 className="h-3 w-3 animate-spin" />{progress}</> : <><Play className="h-3 w-3" />Render Video</>}
                </Button>
                {videoUrl && (
                  <Button variant="secondary" className="h-8 text-xs font-semibold gap-1.5" onClick={handleDownload}>
                    <Download className="h-3 w-3" />Download .webm
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {showFontPicker && (
            <FontPickerModal
              currentFont={selectedFont}
              onSelect={(font) => { setSelectedFont(font); setShowFontPicker(false); }}
              onClose={() => setShowFontPicker(false)}
              sampleText={word || "Ephemeral"}
            />
          )}
        </div>

        {/* RIGHT: Preview + Video */}
        <div className="flex flex-col space-y-2">
          <Card className="flex-1 flex flex-col border-border/40 bg-card shadow-sm overflow-hidden">
            <div className="bg-muted/40 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider border-b flex items-center justify-between">
              <span className="text-muted-foreground font-mono tracking-widest">// preview</span>
              <button
                type="button"
                onClick={() => setExpandPreview(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Always 16:9 in panel */}
            <div className="flex-1 flex items-center justify-center p-3 bg-black/50">
              <canvas
                ref={previewRef}
                className="max-w-full max-h-full rounded-md shadow-xl"
                style={{ aspectRatio: "16/9" }}
              />
            </div>
          </Card>

          {videoUrl && (
            <Card className="border-border/40 bg-card shadow-sm overflow-hidden">
              <div className="bg-muted/40 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider border-b">
                <span className="text-muted-foreground ml-1">Rendered Video</span>
              </div>
              <div className="p-3 flex items-center justify-center">
                {/* Show as 16:9 in the panel; user can fullscreen for real ratio */}
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  className="w-full rounded-md shadow-lg"
                  style={{ aspectRatio: "16/9", objectFit: "contain", background: "#000" }}
                />
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Hidden render canvas (full resolution) */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Expanded preview lightbox */}
      {expandPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setExpandPreview(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <canvas
              className="rounded-lg shadow-2xl"
              ref={(el) => {
                if (!el) return;
                const dim = ASPECT_OPTIONS.find((a) => a.value === aspect)!;
                const scale = Math.min(
                  (window.innerWidth * 0.9) / dim.w,
                  (window.innerHeight * 0.9) / dim.h
                );
                el.width = dim.w * scale;
                el.height = dim.h * scale;
                const ctx = el.getContext("2d");
                if (ctx) drawWordFrame(ctx, el.width, el.height, word, meaning, selectedFont, 1.0, 0.5, bgPreset, bgImage, wordFontSize, meaningFontSize);
              }}
            />
            <p className="text-center text-xs text-white/50 mt-2">Click anywhere to close · {aspect} actual ratio</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Drawing helpers
   ═══════════════════════════════════════════════════════ */

function drawTitlePhase(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  font: string, opacity: number,
  bgPreset: BgPreset, bgImage: ImageBitmap | null
) {
  drawBackground(ctx, w, h, bgPreset, bgImage);

  // Subtle overlay gradient
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.6);
  g.addColorStop(0, "rgba(255,255,255,0.03)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // Decorative thin lines
  ctx.strokeStyle = `rgba(255,255,255,${0.12 * opacity})`;
  ctx.lineWidth = 1;
  const lineY = h / 2;
  ctx.beginPath(); ctx.moveTo(w * 0.12, lineY - 48); ctx.lineTo(w * 0.88, lineY - 48); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 0.12, lineY + 48); ctx.lineTo(w * 0.88, lineY + 48); ctx.stroke();

  // Small diamond at line centers
  const drawDiamond = (cx: number, cy: number, size: number) => {
    ctx.fillStyle = `rgba(255,255,255,${0.3 * opacity})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size); ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx, cy + size); ctx.lineTo(cx - size, cy);
    ctx.closePath(); ctx.fill();
  };
  drawDiamond(w / 2, lineY - 48, 4);
  drawDiamond(w / 2, lineY + 48, 4);

  const vert = w < h;
  const titleSize = vert ? 32 : 40;
  ctx.font = `300 ${titleSize}px "${font}", Georgia, serif`;
  ctx.fillStyle = `rgba(255,255,255,${0.95 * opacity})`;
  ctx.textAlign = "center";
  ctx.letterSpacing = "10px";
  ctx.fillText("WORD OF THE DAY", w / 2, h / 2 + titleSize / 3);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "start";
}

function drawCrumblePhase(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  font: string, progress: number,
  bgPreset: BgPreset, bgImage: ImageBitmap | null
) {
  drawBackground(ctx, w, h, bgPreset, bgImage);

  const vert = w < h;
  const titleSize = vert ? 32 : 40;
  const text = "WORD OF THE DAY";

  ctx.font = `300 ${titleSize}px "${font}", Georgia, serif`;
  ctx.textAlign = "center";
  const textW = ctx.measureText(text).width;
  const startX = (w - textW) / 2;
  const baseY = h / 2 + titleSize / 3;

  ctx.textAlign = "start";
  let cx = startX;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const charW = ctx.measureText(ch).width;
    const charDelay = (i / text.length) * 0.3;
    const charProgress = Math.max(0, Math.min(1, (progress - charDelay) / 0.7));
    const alpha = 1 - charProgress;
    const offsetY = charProgress * (40 + Math.sin(i) * 30);
    const offsetX = (Math.sin(i * 3) - 0.5) * charProgress * 30;
    const scale = 1 - charProgress * 0.5;

    if (alpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx + charW / 2 + offsetX, baseY + offsetY);
      ctx.scale(scale, scale);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(ch, -charW / 2, 0);
      ctx.restore();
    }
    cx += charW;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";
}

function drawWordFrame(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  word: string, meaning: string,
  font: string,
  progress: number,
  wordSplit: number,
  bgPreset: BgPreset,
  bgImage: ImageBitmap | null,
  wordFontSize: number,
  meaningFontSize: number,
) {
  drawBackground(ctx, w, h, bgPreset, bgImage);

  // Subtle ambient overlay
  const g = ctx.createRadialGradient(w / 2, h * 0.38, 0, w / 2, h * 0.38, Math.min(w, h) * 0.5);
  g.addColorStop(0, "rgba(255,255,255,0.025)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // Scale font sizes for canvas dimensions (designed for 720w base)
  const scale = w / 720;
  const scaledWordSize = Math.round(wordFontSize * scale);
  const scaledMeaningSize = Math.round(meaningFontSize * scale);

  // Word (italic, centered) — use Math.ceil + Math.max(1,...) like Code Studio
  const wordFrac = Math.min(progress / wordSplit, 1);
  const wordChars = wordFrac > 0 ? Math.max(1, Math.ceil(word.length * wordFrac)) : 0;
  const visibleWord = word.substring(0, wordChars);

  ctx.font = `italic 700 ${scaledWordSize}px "${font}", Georgia, serif`;
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 20;
  ctx.fillText(visibleWord, w / 2, h * 0.40);
  ctx.shadowBlur = 0;

  // Meaning (appears after word is fully typed, no cursor)
  if (progress > wordSplit) {
    const meaningProgress = (progress - wordSplit) / (1 - wordSplit);
    const meaningChars = meaningProgress > 0 ? Math.max(1, Math.ceil(meaning.length * meaningProgress)) : 0;
    const visibleMeaning = meaning.substring(0, meaningChars);

    ctx.font = `300 ${scaledMeaningSize}px "${font}", Georgia, serif`;
    const baseAlpha = Math.min(meaningProgress * 1.5, 0.9);
    ctx.fillStyle = `rgba(220,220,220,${baseAlpha})`;
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 10;

    // Word-wrap meaning
    const maxW = w * 0.72;
    const lines = wrapText(ctx, visibleMeaning, maxW);
    const lineH = scaledMeaningSize * 1.7;
    const startY = h * 0.40 + scaledWordSize * 1.0;

    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * lineH);
    });
    ctx.shadowBlur = 0;
  }

  ctx.textAlign = "start";
}

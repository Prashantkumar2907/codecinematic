"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Maximize2, Play, Type, ToggleLeft, ToggleRight, Volume2 } from "lucide-react";

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
export function DidYouKnowPanel({ projectId }: { projectId: string }) {
  // Content
  const [factText, setFactText] = useState(
    "Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still perfectly edible."
  );
  const [showTitle, setShowTitle] = useState(true);
  const [titleMode, setTitleMode] = useState<"didyouknow" | "thoughtofday" | "custom">("didyouknow");
  const [customTitle, setCustomTitle] = useState("");

  // Appearance
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [selectedFont, setSelectedFont] = useState("Playfair Display");
  const [factFontSize, setFactFontSize] = useState(34);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [bgPreset, setBgPreset] = useState<BgPreset>(BG_PRESETS[1]); // Midnight Blue default
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<ImageBitmap | null>(null);

  // Speed & Sound
  const [titleSpeed, setTitleSpeed] = useState(1.0);
  const [textSpeed, setTextSpeed] = useState(1.0);
  const [sound, setSound] = useState<"off" | "soft" | "typewriter">("soft");
  const [soundVolume, setSoundVolume] = useState(0.3);

  // Render state
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [expandPreview, setExpandPreview] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const titleText = titleMode === "didyouknow" ? "DID YOU KNOW ?" : titleMode === "thoughtofday" ? "THOUGHT OF THE DAY" : (customTitle || "THOUGHT OF THE DAY");

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

  // Live preview — always 16:9
  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    c.width = 640;
    c.height = 360;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawFactFrame(ctx, 640, 360, factText, selectedFont, 1.0, bgPreset, bgImage, factFontSize);
  }, [factText, aspect, selectedFont, bgPreset, bgImage, factFontSize]);

  /* ── Render video ── */
  const handleRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !factText.trim()) return;
    setRendering(true);
    setVideoUrl(null);
    setProgress("Preparing…");

    const dim = ASPECT_OPTIONS.find((a) => a.value === aspect)!;
    canvas.width = dim.w;
    canvas.height = dim.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setRendering(false); return; }

    const fps = 30;
    const titleDuration = showTitle ? 1.2 / titleSpeed : 0;
    const fadeDuration = showTitle ? 0.8 / titleSpeed : 0;

    // Chars per second: matches Code Studio rate
    const cps = Math.max(2, (1000 / 110) * textSpeed);
    const typingDuration = Math.max(1.0, factText.length / cps);
    const holdDuration = 3.0;
    const totalFrames = Math.ceil((titleDuration + fadeDuration + typingDuration + holdDuration) * fps);

    // Audio
    const audioCtx = typeof AudioContext !== "undefined" ? new AudioContext() : null;
    const audioDest = audioCtx ? audioCtx.createMediaStreamDestination() : null;

    const videoStream = canvas.captureStream(0);
    const videoTrack = videoStream.getVideoTracks()[0];
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

    // Schedule typing sounds — evenly spaced at the real CPS rate
    if (audioCtx && audioDest && sound !== "off" && soundVolume > 0) {
      const typeStart = audioCtx.currentTime + titleDuration + fadeDuration + 0.05;
      const chars = Array.from(factText);
      chars.forEach((ch, i) => {
        const when = typeStart + (i / cps);
        playTypingPulse(audioCtx, audioDest, when, sound, soundVolume, ch, i === chars.length - 1);
      });
    }

    recorder.start();

    // Wall-clock pacing: prevent video from being too fast on high-refresh displays
    const renderStart = performance.now();

    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / fps;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (showTitle && t < titleDuration) {
        drawTitleScreen(ctx, canvas.width, canvas.height, titleText, selectedFont, 1.0, bgPreset, bgImage);
      } else if (showTitle && t < titleDuration + fadeDuration) {
        const fadeProgress = (t - titleDuration) / fadeDuration;
        drawCrumbleEffect(ctx, canvas.width, canvas.height, titleText, selectedFont, fadeProgress, bgPreset, bgImage);
      } else {
        const factStartTime = titleDuration + fadeDuration;
        const factT = (t - factStartTime) / typingDuration;
        drawFactFrame(ctx, canvas.width, canvas.height, factText, selectedFont, Math.min(factT, 1.0), bgPreset, bgImage, factFontSize);
      }

      setProgress(`Rendering… ${Math.round((frame / totalFrames) * 100)}%`);

      // Explicitly capture the painted frame into the MediaRecorder stream
      if (videoTrack && 'requestFrame' in videoTrack) {
        (videoTrack as any).requestFrame();
      }
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
  }, [factText, aspect, selectedFont, showTitle, titleText, titleSpeed, textSpeed, sound, soundVolume, bgPreset, bgImage, factFontSize]);

  const handleDownload = () => {
    if (!videoUrl) return;
    const slug = titleMode === "didyouknow" ? "did-you-know" : titleMode === "thoughtofday" ? "thought-of-the-day" : "custom";
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `${slug}-${Date.now()}.webm`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full space-y-2 overflow-y-auto">
      <div className="grid gap-2 xl:grid-cols-[1fr_1fr] xl:flex-1 xl:min-h-0">

        {/* LEFT: Settings */}
        <div className="flex flex-col space-y-2 min-h-0 overflow-y-auto">
          <Card className="border-border/40 bg-card shadow-sm">
            <CardHeader className="py-2 px-3 border-b border-border/30 mb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Type className="h-4 w-4 text-primary" />
                {titleMode === "didyouknow" ? "Did You Know?" : titleMode === "thoughtofday" ? "Thought of the Day" : (customTitle || "Custom Title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-3">

              {/* Title mode selector */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">MODE</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTitleMode("didyouknow")}
                    className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                      titleMode === "didyouknow"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    Did You Know?
                  </button>
                  <button
                    type="button"
                    onClick={() => setTitleMode("thoughtofday")}
                    className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                      titleMode === "thoughtofday"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    Thought of Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setTitleMode("custom")}
                    className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
                      titleMode === "custom"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    Custom
                  </button>
                </div>
                {titleMode === "custom" && (
                  <Input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Enter custom title…"
                    className="mt-1.5 text-xs h-8"
                  />
                )}
              </div>

              {/* Toggle title */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">SHOW TITLE SCREEN</span>
                <button
                  type="button"
                  onClick={() => setShowTitle(!showTitle)}
                  className="text-primary hover:opacity-80 transition"
                >
                  {showTitle ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                </button>
              </div>

              {/* Content textarea */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {titleMode === "didyouknow" ? "FACT / CONTENT" : "YOUR THOUGHT"}
                </span>
                <Textarea
                  value={factText}
                  onChange={(e) => setFactText(e.target.value)}
                  className="min-h-[90px] text-xs border-input shadow-sm resize-none"
                  placeholder={titleMode === "didyouknow" ? "Enter an interesting fact…" : "Enter a thought or quote…"}
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

              {/* Font size slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground">TEXT SIZE</span>
                  <span className="text-[10px] text-muted-foreground">{factFontSize}px</span>
                </div>
                <input type="range" min={18} max={72} step={1} value={factFontSize}
                  onChange={(e) => setFactFontSize(parseInt(e.target.value))}
                  className="w-full h-1 accent-primary" />
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">TITLE SPEED</span>
                      <span className="text-[10px] text-muted-foreground">{titleSpeed.toFixed(2)}×</span>
                    </div>
                    <input type="range" min={0.5} max={1.5} step={0.05} value={titleSpeed}
                      onChange={(e) => setTitleSpeed(parseFloat(e.target.value))}
                      className="w-full h-1 accent-primary" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">TEXT SPEED</span>
                      <span className="text-[10px] text-muted-foreground">{textSpeed.toFixed(2)}×</span>
                    </div>
                    <input type="range" min={0.5} max={1.5} step={0.05} value={textSpeed}
                      onChange={(e) => setTextSpeed(parseFloat(e.target.value))}
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
                  disabled={rendering || !factText.trim()}
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
              sampleText={factText.substring(0, 30) || "Sample text"}
            />
          )}
        </div>

        {/* RIGHT: Preview + Video */}
        <div className="flex flex-col space-y-2">
          <Card className="flex-1 flex flex-col border-border/40 bg-card shadow-sm overflow-hidden">
            <div className="bg-muted/30 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider border-b border-border/30 flex items-center justify-between">
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

      {/* Hidden render canvas */}
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
                if (ctx) drawFactFrame(ctx, el.width, el.height, factText, selectedFont, 1.0, bgPreset, bgImage, factFontSize);
              }}
            />
            <p className="text-center text-xs text-white/50 mt-2">Click to close · {aspect} actual ratio</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Drawing helpers
   ═══════════════════════════════════════════════════════ */

function drawTitleScreen(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  titleText: string, font: string, opacity: number,
  bgPreset: BgPreset, bgImage: ImageBitmap | null
) {
  drawBackground(ctx, w, h, bgPreset, bgImage);

  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.6);
  g.addColorStop(0, "rgba(255,255,255,0.04)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // Decorative lines
  ctx.strokeStyle = `rgba(255,255,255,${0.12 * opacity})`;
  ctx.lineWidth = 1;
  const lineY = h / 2;
  ctx.beginPath(); ctx.moveTo(w * 0.1, lineY - 52); ctx.lineTo(w * 0.9, lineY - 52); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 0.1, lineY + 52); ctx.lineTo(w * 0.9, lineY + 52); ctx.stroke();

  // Diamonds
  const drawDiamond = (cx: number, cy: number, sz: number) => {
    ctx.fillStyle = `rgba(255,255,255,${0.3 * opacity})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy - sz); ctx.lineTo(cx + sz, cy);
    ctx.lineTo(cx, cy + sz); ctx.lineTo(cx - sz, cy);
    ctx.closePath(); ctx.fill();
  };
  drawDiamond(w / 2, lineY - 52, 5);
  drawDiamond(w / 2, lineY + 52, 5);

  const vert = w < h;
  const titleSize = vert ? 28 : 36;
  ctx.font = `400 ${titleSize}px "${font}", Georgia, serif`;
  ctx.fillStyle = `rgba(255,255,255,${0.95 * opacity})`;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 12;
  ctx.letterSpacing = "8px";
  ctx.fillText(titleText, w / 2, h / 2 + titleSize / 3);
  ctx.letterSpacing = "0px";
  ctx.shadowBlur = 0;
  ctx.textAlign = "start";
}

function drawCrumbleEffect(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  titleText: string, font: string, progress: number,
  bgPreset: BgPreset, bgImage: ImageBitmap | null
) {
  drawBackground(ctx, w, h, bgPreset, bgImage);

  const vert = w < h;
  const titleSize = vert ? 28 : 36;
  ctx.font = `400 ${titleSize}px "${font}", Georgia, serif`;
  ctx.textAlign = "center";
  const textW = ctx.measureText(titleText).width;
  const startX = (w - textW) / 2;
  const baseY = h / 2 + titleSize / 3;

  ctx.textAlign = "start";
  let cx = startX;
  for (let i = 0; i < titleText.length; i++) {
    const ch = titleText[i];
    const charW = ctx.measureText(ch).width;
    const charDelay = (i / titleText.length) * 0.35;
    const charProgress = Math.max(0, Math.min(1, (progress - charDelay) / 0.65));
    const alpha = 1 - charProgress;
    const offsetY = charProgress * (30 + Math.sin(i) * 30);
    const offsetX = (Math.sin(i * 2.5) - 0.5) * charProgress * 25;
    const rotate = Math.sin(i) * charProgress * 0.3;

    if (alpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx + charW / 2 + offsetX, baseY + offsetY);
      ctx.rotate(rotate);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(ch, -charW / 2, 0);
      ctx.restore();
    }
    cx += charW;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "start";
}

function drawFactFrame(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  text: string, font: string, progress: number,
  bgPreset: BgPreset, bgImage: ImageBitmap | null,
  factFontSize: number,
) {
  drawBackground(ctx, w, h, bgPreset, bgImage);

  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.55);
  g.addColorStop(0, "rgba(255,255,255,0.02)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  const scale = w / 720;
  const fontSize = Math.round(factFontSize * scale);
  const lineHeight = fontSize * 1.85;
  const maxW = w * 0.78;

  const totalChars = text.length;
  const visibleChars = progress > 0 ? Math.max(1, Math.ceil(totalChars * progress)) : 0;
  const visibleText = text.substring(0, visibleChars);

  ctx.font = `400 ${fontSize}px "${font}", Georgia, serif`;
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 16;

  const lines = wrapText(ctx, visibleText, maxW);
  const totalHeight = lines.length * lineHeight;
  const startY = (h - totalHeight) / 2 + fontSize;

  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, startY + i * lineHeight);
  });
  ctx.shadowBlur = 0;

  // Decorative opening quote (no cursor)
  if (progress > 0.2) {
    const quoteAlpha = Math.min((progress - 0.2) * 2, 0.1);
    ctx.font = `italic ${Math.round(80 * scale)}px "${font}", Georgia, serif`;
    ctx.fillStyle = `rgba(255,255,255,${quoteAlpha})`;
    ctx.textAlign = "center";
    ctx.fillText("\u201C", w * 0.08, startY - fontSize * 0.3);
    ctx.fillText("\u201D", w * 0.92, startY + totalHeight + fontSize * 0.3);
  }

  ctx.textAlign = "start";
}

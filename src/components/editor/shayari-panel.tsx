"use client";

/**
 * Shayari Studio — Hindi/Urdu poetry panel
 *
 * YouTube channel type: "Shayari World" style.
 * Line-by-line dramatic reveal with ornate borders, golden text, romantic bg.
 * Hindi/Devanagari text works on canvas via Noto Sans Devanagari.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Play, Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { BgPicker } from "./shared/bg-picker";
import { BG_PRESETS, type BgPreset, drawBackground } from "./shared/canvas-utils";
import { createWebmBlob, createWebmRecorder } from "./shared/media-recorder";

// ── Shayari-specific background presets ─────────────────────────────────────
const SHAYARI_BG: BgPreset[] = [
  {
    id: "rose_night",
    label: "Rose Night",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#1a0010"], [0.5, "#3d0030"], [1, "#0f0008"]] },
    preview: "linear-gradient(135deg,#1a0010,#3d0030,#0f0008)",
  },
  {
    id: "midnight_gold",
    label: "Midnight Gold",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#0f0900"], [0.5, "#2a1a00"], [1, "#0a0600"]] },
    preview: "linear-gradient(135deg,#0f0900,#2a1a00,#0a0600)",
  },
  {
    id: "sapphire",
    label: "Sapphire",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#000d2e"], [0.5, "#001a5c"], [1, "#00091a"]] },
    preview: "linear-gradient(135deg,#000d2e,#001a5c,#00091a)",
  },
  {
    id: "velvet",
    label: "Velvet Purple",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#0d0020"], [0.5, "#250048"], [1, "#070010"]] },
    preview: "linear-gradient(135deg,#0d0020,#250048,#070010)",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    stops: { x0: 0, y0: 0, x1: 0, y1: 1, colors: [[0, "#111"], [1, "#000"]] },
    preview: "linear-gradient(180deg,#111,#000)",
  },
  ...BG_PRESETS.filter((p) => ["cosmic", "nebula", "plum", "indigo"].includes(p.id)),
];

const ASPECT_OPTIONS = [
  { value: "9:16", label: "Vertical 9:16", w: 1080, h: 1920 },
  { value: "16:9", label: "Landscape 16:9", w: 1280, h: 720 },
] as const;

const FONT_OPTIONS = [
  { value: "Noto Serif Devanagari", label: "Noto Serif (Hindi)" },
  { value: "Baloo 2", label: "Baloo 2 (Hindi Bold)" },
  { value: "Noto Sans Devanagari", label: "Noto Sans (Hindi)" },
  { value: "Georgia", label: "Georgia (English)" },
  { value: "Playfair Display", label: "Playfair Display" },
] as const;

// ── Helper: load Hindi-capable Google Font ───────────────────────────────────
const loadedFonts = new Set<string>();
function loadHindiFont(family: string) {
  if (typeof document === "undefined" || loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const encoded = family.replace(/ /g, "+");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

// ── Canvas helpers ───────────────────────────────────────────────────────────
function drawOrnament(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  // Central diamond
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.5);
  ctx.lineTo(cx + size * 0.3, cy);
  ctx.lineTo(cx, cy + size * 0.5);
  ctx.lineTo(cx - size * 0.3, cy);
  ctx.closePath();
  ctx.stroke();
  // Side dots
  [-size * 0.7, size * 0.7].forEach((dx) => {
    ctx.beginPath();
    ctx.arc(cx + dx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
  ctx.restore();
}

function drawFrame(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  bgPreset: BgPreset, bgImage: ImageBitmap | null, lines: string[], author: string,
  font: string, textColor: string, accentColor: string,
  revealProgress: number, // 0→1 for each line as array
  lineProgress: number[], // per-line reveal (0→1)
  fontSize: number,
) {
  // Background
  drawBackground(ctx, W, H, bgPreset, bgImage);

  const vert = H > W;
  const lineH = fontSize * 1.8;
  const totalTextH = lines.length * lineH + (author ? lineH * 1.2 : 0);
  const startY = (H - totalTextH) / 2;

  // Decorative top ornament
  drawOrnament(ctx, W / 2, startY - 60, 36, accentColor);

  // Lines reveal
  ctx.textAlign = "center";
  for (let i = 0; i < lines.length; i++) {
    const prog = lineProgress[i] ?? 0;
    if (prog <= 0) continue;
    const y = startY + i * lineH + fontSize;

    const partialLen = Math.max(1, Math.ceil(Array.from(lines[i]!).length * prog));
    const displayText = Array.from(lines[i]!).slice(0, partialLen).join("");

    // Glow behind active line
    if (prog < 1) {
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 18;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = Math.min(1, prog + 0.2);
    ctx.fillStyle = prog >= 1 ? textColor : accentColor;
    ctx.font = `${prog >= 1 ? "400" : "700"} ${fontSize}px "${font}", "Noto Serif Devanagari", serif`;
    ctx.fillText(displayText, W / 2, y);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Underline for completed lines
    if (prog >= 1) {
      const tw = ctx.measureText(displayText).width;
      ctx.strokeStyle = `${accentColor}55`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2 - tw / 2, y + 6);
      ctx.lineTo(W / 2 + tw / 2, y + 6);
      ctx.stroke();
    }
  }

  // Author
  if (author && revealProgress >= 1) {
    const ay = startY + lines.length * lineH + fontSize * 1.4;
    ctx.font = `400 ${Math.round(fontSize * 0.55)}px "${font}", "Noto Sans Devanagari", sans-serif`;
    ctx.fillStyle = `${accentColor}cc`;
    ctx.shadowBlur = 0;
    ctx.fillText(`— ${author}`, W / 2, ay);
  }

  // Bottom ornament
  drawOrnament(ctx, W / 2, startY + totalTextH + 50, 36, accentColor);

  // Watermark
  ctx.textAlign = "start";
  ctx.font = `500 ${vert ? 14 : 11}px ui-sans-serif, system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillText("CodeCinematic", W - (vert ? 160 : 140), H - (vert ? 40 : 28));
}

// ── Component ────────────────────────────────────────────────────────────────
export function ShayariPanel({ projectId }: { projectId: string }) {
  const [lines, setLines] = useState(
    "दिल को छूने की, आदत है मुझे\nतेरी आँखों में खो जाने की, हसरत है मुझे\nये जहाँ चाहे जो भी सोचे\nतुझसे मिलने की, ख़्वाहिश है मुझे"
  );
  const [author, setAuthor] = useState("Gulzar");
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [font, setFont] = useState("Noto Serif Devanagari");
  const [fontSize, setFontSize] = useState(52);
  const [textColor, setTextColor] = useState("#f5e6c8");
  const [accentColor, setAccentColor] = useState("#d4af37");
  const [lineDelay, setLineDelay] = useState(1.2); // seconds between lines appearing
  const [charSpeed, setCharSpeed] = useState(1.0); // typing speed multiplier
  const [bgPreset, setBgPreset] = useState<BgPreset>(SHAYARI_BG[0]!);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<ImageBitmap | null>(null);
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [expandPreview, setExpandPreview] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => { loadHindiFont(font); }, [font]);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => () => {
    if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
  }, [uploadedImageUrl]);

  // Live preview
  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    c.width = 320; c.height = 568;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const linesArr = lines.split("\n").filter(Boolean);
    drawFrame(ctx, 320, 568, bgPreset, bgImage, linesArr, author, font, textColor, accentColor, 1, linesArr.map(() => 1), Math.round(fontSize * 0.38));
  }, [lines, author, font, fontSize, textColor, accentColor, bgPreset, bgImage]);

  function handleImageUpload(file: File) {
    const url = URL.createObjectURL(file);
    setUploadedImageUrl(url);
    createImageBitmap(file).then(setBgImage);
  }
  function handleImageClear() { setUploadedImageUrl(null); setBgImage(null); }

  const handleRender = useCallback(async () => {
    const canvas = canvasRef.current;
    const linesArr = lines.split("\n").filter(Boolean);
    if (!canvas || linesArr.length === 0) return;

    cancelRef.current = false;
    setRendering(true);
    setVideoUrl(null);

    const dim = ASPECT_OPTIONS.find((a) => a.value === aspect)!;
    canvas.width = dim.w; canvas.height = dim.h;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) { setRendering(false); return; }

    // Ensure font loaded
    loadHindiFont(font);
    try { await document.fonts.load(`700 ${fontSize}px "${font}"`); } catch { /* fallback */ }

    const fps = 30;
    // Per-line timing: lineDelay seconds to reach line, then charSpeed-dependent typing
    const msPerChar = 80 / charSpeed;
    const lineDurations = linesArr.map((l) => Math.max(800, Array.from(l).length * msPerChar + 600));
    const lineStarts: number[] = [];
    let acc = 500; // intro pause
    for (const d of lineDurations) { lineStarts.push(acc); acc += d + lineDelay * 1000; }
    const totalMs = acc + 1200; // outro hold

    // Streams
    const vStream = (canvas as any).captureStream(0) as MediaStream;
    const vTrack = vStream.getVideoTracks()[0] as any;
    const chunks: Blob[] = [];
    const rec = createWebmRecorder(vStream, { videoBitsPerSecond: 6_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const done = new Promise<Blob>((resolve) => { rec.onstop = () => resolve(createWebmBlob(chunks, rec.mimeType)); });

    rec.start(200);
    await new Promise<void>((res) => setTimeout(res, 300));

    if (cancelRef.current) { rec.stop(); setRendering(false); return; }

    const t0 = performance.now();

    await new Promise<void>((resolve) => {
      function frame() {
        if (cancelRef.current) { resolve(); return; }
        const elapsed = performance.now() - t0;
        const ms = Math.min(elapsed, totalMs);

        // Compute per-line progress
        const lineProgress = linesArr.map((l, i) => {
          const start = lineStarts[i]!;
          if (ms < start) return 0;
          const dur = lineDurations[i]!;
          return Math.min(1, (ms - start) / dur);
        });
        const overallProgress = lineProgress.every((p) => p >= 1) ? 1 : 0;

        drawFrame(ctx, dim.w, dim.h, bgPreset, bgImage, linesArr, author, font, textColor, accentColor,
          overallProgress, lineProgress, fontSize);

        vTrack?.requestFrame?.();

        if (ms >= totalMs) {
          rec.stop();
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      }
      requestAnimationFrame(frame);
    });

    const webm = await done;
    if (cancelRef.current) { setRendering(false); return; }

    const url = URL.createObjectURL(webm);
    setVideoUrl(url);
    setRendering(false);
  }, [lines, author, aspect, font, fontSize, textColor, accentColor, lineDelay, charSpeed, bgPreset, bgImage]);

  return (
    <div className="flex flex-col h-full min-h-0 space-y-2 overflow-y-auto app-scroll">
      <div className="grid gap-2 xl:grid-cols-[1fr_1fr] xl:flex-1 xl:min-h-0">
        {/* Settings */}
        <div className="flex flex-col space-y-2 min-h-0 overflow-y-auto app-scroll">
          <Card className="border-border/40 bg-card shadow-sm">
            <CardHeader className="py-2 px-3 border-b border-border/30">
              <CardTitle className="text-sm font-semibold">✦ Shayari Studio</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-3 space-y-3">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">SHAYARI (one line per stanza)</span>
                <Textarea
                  value={lines}
                  onChange={(e) => setLines(e.target.value)}
                  className="min-h-[100px] text-sm border-input shadow-sm resize-none font-serif"
                  placeholder={"दिल को छूने की आदत है मुझे\nतेरी याद में खो जाने की ख़्वाहिश है"}
                  dir="auto"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">AUTHOR / SHAYAR</span>
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} className="h-7 text-xs" placeholder="e.g. Gulzar, Mirza Ghalib" dir="auto" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">RATIO</span>
                  <select value={aspect} onChange={(e) => setAspect(e.target.value as any)}
                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1">
                    {ASPECT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">FONT</span>
                  <select value={font} onChange={(e) => setFont(e.target.value)}
                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1">
                    {FONT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground">FONT SIZE</span>
                    <span className="text-[10px] text-muted-foreground">{fontSize}px</span>
                  </div>
                  <input type="range" min={28} max={96} step={2} value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-full h-1 accent-primary" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground">LINE PAUSE</span>
                    <span className="text-[10px] text-muted-foreground">{lineDelay.toFixed(1)}s</span>
                  </div>
                  <input type="range" min={0.3} max={3.0} step={0.1} value={lineDelay}
                    onChange={(e) => setLineDelay(parseFloat(e.target.value))} className="w-full h-1 accent-primary" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground">CHAR SPEED</span>
                    <span className="text-[10px] text-muted-foreground">{charSpeed.toFixed(1)}×</span>
                  </div>
                  <input type="range" min={0.3} max={3.0} step={0.1} value={charSpeed}
                    onChange={(e) => setCharSpeed(parseFloat(e.target.value))} className="w-full h-1 accent-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">TEXT COLOR</span>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)}
                      className="w-7 h-6 rounded cursor-pointer border border-border" />
                    <span className="text-[10px] text-muted-foreground">{textColor}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">ACCENT COLOR</span>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
                      className="w-7 h-6 rounded cursor-pointer border border-border" />
                    <span className="text-[10px] text-muted-foreground">{accentColor}</span>
                  </div>
                </div>
              </div>
              <div className="pt-1 border-t border-white/5">
                <BgPicker selectedId={bgPreset.id}
                  presets={SHAYARI_BG}
                  onSelect={(p) => { setBgPreset(p); handleImageClear(); }}
                  uploadedImageUrl={uploadedImageUrl}
                  onImageUpload={handleImageUpload}
                  onImageClear={handleImageClear}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button className="flex-1 h-9 text-xs font-semibold glow-primary-sm hover:glow-primary" onClick={handleRender} disabled={rendering}>
                  {rendering ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Rendering…</> : <><Play className="h-3.5 w-3.5 mr-1.5" />Render Shayari</>}
                </Button>
                {rendering && (
                  <Button variant="outline" className="h-9 text-xs px-3 border-destructive/50 text-destructive" onClick={() => { cancelRef.current = true; setRendering(false); }}>
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: preview + download */}
        <div className="flex flex-col space-y-2">
          <Card className="flex-1 flex flex-col border-border/40 bg-card shadow-sm">
            <CardHeader className="py-2 px-3 border-b border-border/30 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Preview</CardTitle>
              <button type="button" onClick={() => setExpandPreview(!expandPreview)} className="text-muted-foreground hover:text-primary">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col items-center justify-center gap-3 p-3">
              <canvas ref={previewRef}
                className={`rounded-lg border border-border/50 shadow-inner ${expandPreview ? "w-full max-w-xs" : "h-52"}`}
                style={expandPreview ? {} : { width: "auto" }}
              />
              {videoUrl && (
                <div className="w-full space-y-2">
                  <video src={videoUrl} controls playsInline className="w-full rounded-lg border border-border/50 bg-black" />
                  <a href={videoUrl} download="shayari.webm">
                    <Button className="w-full h-8 text-xs glow-primary-sm hover:glow-primary">
                      <Download className="h-3.5 w-3.5 mr-1.5" />Download .webm
                    </Button>
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

"use client";

/**
 * Bollywood Dialogue Studio — iconic filmy dialogues, cinematic reveal
 *
 * YouTube channels: "Bollywood Dialogues", "Filmy Shorts" style.
 * Dark cinematic feel, letterbox bars, dramatic line-by-line reveal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { BgPicker } from "./shared/bg-picker";
import { BG_PRESETS, type BgPreset, drawBackground } from "./shared/canvas-utils";
import { createWebmBlob, createWebmRecorder } from "./shared/media-recorder";

const CINEMA_BG: BgPreset[] = [
  {
    id: "cinema_black",
    label: "Cinema Black",
    stops: { x0: 0, y0: 0, x1: 0, y1: 1, colors: [[0, "#000000"], [1, "#0a0a0a"]] },
    preview: "linear-gradient(180deg,#000,#0a0a0a)",
  },
  {
    id: "cinema_noir",
    label: "Dark Noir",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#050510"], [0.5, "#0a0a20"], [1, "#000008"]] },
    preview: "linear-gradient(135deg,#050510,#0a0a20,#000008)",
  },
  {
    id: "sepia_film",
    label: "Sepia Film",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#120b00"], [0.5, "#1e1200"], [1, "#0a0600"]] },
    preview: "linear-gradient(135deg,#120b00,#1e1200,#0a0600)",
  },
  {
    id: "drama_red",
    label: "Drama Red",
    stops: { x0: 0, y0: 0, x1: 0, y1: 1, colors: [[0, "#0a0000"], [0.5, "#180000"], [1, "#080000"]] },
    preview: "linear-gradient(180deg,#0a0000,#180000,#080000)",
  },
  ...BG_PRESETS.filter((p) => ["cosmic", "slate", "aurora"].includes(p.id)),
];

const DIALOG_PRESETS = [
  { label: "DDLJ", lines: ["Ja Simran Ja,", "jee le apni zindagi."], movie: "Dilwale Dulhania Le Jayenge", year: "1995" },
  { label: "Sholay", lines: ["Kitne aadmi the?"], movie: "Sholay", year: "1975" },
  { label: "Mughal-E-Azam", lines: ["Pyaar kiya toh darna kya?"], movie: "Mughal-E-Azam", year: "1960" },
  { label: "Don", lines: ["Don ko pakadna mushkil hi nahi,", "namumkin hai."], movie: "Don", year: "1978" },
  { label: "Mother India", lines: ["Mere paas maa hai."], movie: "Deewar", year: "1975" },
];

const loadedFonts = new Set<string>();
function loadFont(family: string) {
  if (typeof document === "undefined" || loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawCinemaFrame(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  bgPreset: BgPreset, bgImage: ImageBitmap | null,
  dialogLines: string[], movieTitle: string, movieYear: string,
  font: string, fontSize: number,
  lineReveal: number[], // 0→1 per line
  showMeta: boolean,
  textColor: string, accentColor: string,
) {
  drawBackground(ctx, W, H, bgPreset, bgImage);
  const vert = H > W;
  const pad = W * 0.08;
  const maxW = W - pad * 2;

  // Letterbox bars (cinematic look)
  const barH = vert ? H * 0.09 : H * 0.13;
  ctx.fillStyle = "#000000cc";
  ctx.fillRect(0, 0, W, barH);
  ctx.fillRect(0, H - barH, W, barH);

  // Dialog lines
  ctx.font = `italic 700 ${fontSize}px "${font}", "Noto Serif Devanagari", serif`;
  ctx.textAlign = "center";
  const lineH = fontSize * 1.8;
  const totalH = dialogLines.length * lineH;
  const startY = H / 2 - totalH / 2 + fontSize * 0.4;

  dialogLines.forEach((line, i) => {
    const prog = lineReveal[i] ?? 0;
    if (prog <= 0) return;
    const y = startY + i * lineH;
    const visLen = Math.ceil(Array.from(line).length * prog);
    const visText = Array.from(line).slice(0, visLen).join("");

    ctx.globalAlpha = Math.min(1, prog * 2 + 0.1);
    // Glow / shadow for cinematic feel
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = textColor;
    ctx.fillText(visText, W / 2, y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  });

  // Quotation marks
  if (lineReveal[0]! > 0.05) {
    const firstY = startY;
    ctx.font = `700 ${Math.round(fontSize * 2.2)}px Georgia, serif`;
    ctx.fillStyle = `${accentColor}44`;
    ctx.fillText("\u201C", pad - 4, firstY - fontSize * 0.2);
  }
  if ((lineReveal[dialogLines.length - 1] ?? 0) > 0.6) {
    const lastLineIdx = dialogLines.length - 1;
    const lastY = startY + lastLineIdx * lineH;
    ctx.font = `700 ${Math.round(fontSize * 2.2)}px Georgia, serif`;
    ctx.fillStyle = `${accentColor}44`;
    ctx.fillText("\u201D", W - pad - Math.round(fontSize * 1.2), lastY);
  }

  // Movie meta (fade in after dialog done)
  if (showMeta && movieTitle) {
    const metaY = H - barH * 0.55;
    ctx.font = `500 ${Math.round(fontSize * 0.38)}px "${font}", sans-serif`;
    ctx.fillStyle = `${accentColor}bb`;
    ctx.textAlign = "center";
    ctx.fillText(`— ${movieTitle}${movieYear ? ` (${movieYear})` : ""}`, W / 2, metaY);
  }

  ctx.textAlign = "start";
  ctx.font = `400 ${vert ? 13 : 11}px ui-sans-serif, system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillText("CodeCinematic", W - (vert ? 156 : 136), H - (vert ? 7 : 6));
}

export function BollywoodPanel({ projectId }: { projectId: string }) {
  const [dialog, setDialog] = useState("Ja Simran ja,\njee le apni zindagi.");
  const [movieTitle, setMovieTitle] = useState("Dilwale Dulhania Le Jayenge");
  const [movieYear, setMovieYear] = useState("1995");
  const [font, setFont] = useState("Uncial Antiqua");
  const [fontSize, setFontSize] = useState(68);
  const [textColor, setTextColor] = useState("#fffde7");
  const [accentColor, setAccentColor] = useState("#ffd700");
  const [charSpeed, setCharSpeed] = useState(0.8);
  const [bgPreset, setBgPreset] = useState<BgPreset>(CINEMA_BG[0]!);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<ImageBitmap | null>(null);
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => { loadFont(font); }, [font]);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => () => {
    if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
  }, [uploadedImageUrl]);

  // Refresh preview
  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    c.width = 320; c.height = 568;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const lines = dialog.split("\n").filter(Boolean);
    const filled = lines.map(() => 1);
    drawCinemaFrame(ctx, 320, 568, bgPreset, bgImage, lines, movieTitle, movieYear, font, Math.round(fontSize * 0.42), filled, true, textColor, accentColor);
  }, [dialog, movieTitle, movieYear, font, fontSize, textColor, accentColor, bgPreset, bgImage]);

  function handleImageUpload(file: File) {
    const url = URL.createObjectURL(file);
    setUploadedImageUrl(url);
    createImageBitmap(file).then(setBgImage);
  }

  function handleImageClear() {
    setUploadedImageUrl(null);
    setBgImage(null);
  }

  function applyPreset(p: typeof DIALOG_PRESETS[number]) {
    setDialog(p.lines.join("\n"));
    setMovieTitle(p.movie);
    setMovieYear(p.year);
  }

  const handleRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !dialog.trim()) return;
    cancelRef.current = false;
    setRendering(true);
    setVideoUrl(null);

    const dim = aspect === "9:16" ? { w: 1080, h: 1920 } : { w: 1280, h: 720 };
    canvas.width = dim.w; canvas.height = dim.h;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) { setRendering(false); return; }

    loadFont(font);
    try { await document.fonts.load(`italic 700 ${fontSize}px "${font}"`); } catch { /* ok */ }

    const lines = dialog.split("\n").filter(Boolean);
    const msPerChar = 60 / charSpeed;
    const perLineDur = lines.map((l) => Math.max(600, Array.from(l).length * msPerChar));
    const cumEnd = perLineDur.reduce<number[]>((acc, d, i) => [...acc, (acc[i - 1] ?? 0) + d + 600], []);
    const totalMs = (cumEnd[cumEnd.length - 1] ?? 3000) + 2000;

    const vStream = (canvas as any).captureStream(0) as MediaStream;
    const vTrack = vStream.getVideoTracks()[0] as any;
    const chunks: Blob[] = [];
    const rec = createWebmRecorder(vStream, { videoBitsPerSecond: 6_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const done = new Promise<Blob>((resolve) => { rec.onstop = () => resolve(createWebmBlob(chunks, rec.mimeType)); });

    rec.start(200);
    await new Promise<void>((r) => setTimeout(r, 300));
    if (cancelRef.current) { rec.stop(); setRendering(false); return; }

    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      function frame() {
        if (cancelRef.current) { resolve(); return; }
        const elapsed = Math.min(performance.now() - t0, totalMs);

        const lineReveal = lines.map((l, i) => {
          const start = i === 0 ? 0 : (cumEnd[i - 1] ?? 0) + 600;
          const lineDur = perLineDur[i]!;
          if (elapsed < start) return 0;
          return Math.min(1, (elapsed - start) / lineDur);
        });
        const showMeta = elapsed > (cumEnd[cumEnd.length - 1] ?? 0);

        drawCinemaFrame(ctx, dim.w, dim.h, bgPreset, bgImage, lines, movieTitle, movieYear, font, fontSize, lineReveal, showMeta, textColor, accentColor);
        vTrack?.requestFrame?.();

        if (elapsed >= totalMs) { rec.stop(); resolve(); }
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    const webm = await done;
    if (cancelRef.current) { setRendering(false); return; }

    setVideoUrl(URL.createObjectURL(webm));
    setRendering(false);
  }, [dialog, movieTitle, movieYear, aspect, font, fontSize, textColor, accentColor, charSpeed, bgPreset, bgImage]);

  return (
    <div className="flex flex-col h-full min-h-0 space-y-2 overflow-y-auto app-scroll">
      {/* Quick Presets */}
      <div className="flex items-center gap-1.5 flex-wrap px-1">
        <span className="text-[10px] text-muted-foreground mr-1">Presets:</span>
        {DIALOG_PRESETS.map((p) => (
          <button key={p.label} onClick={() => applyPreset(p)}
            className="h-6 px-2 text-[10px] rounded border border-border/40 hover:border-primary/50 hover:bg-primary/5 transition-colors">
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 xl:grid-cols-[1fr_1fr]">
        <Card className="border-border/40 bg-card shadow-sm">
          <CardHeader className="py-2 px-3 border-b border-border/30">
            <CardTitle className="text-sm font-semibold">🎬 Bollywood Dialogue Studio</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-3 space-y-3">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground">DIALOGUE (one line per row)</span>
              <Textarea value={dialog} onChange={(e) => setDialog(e.target.value)}
                className="min-h-[72px] text-sm border-input resize-none italic" placeholder="Enter dialogue lines…" dir="auto" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">MOVIE TITLE</span>
                <Input value={movieTitle} onChange={(e) => setMovieTitle(e.target.value)} className="h-7 text-xs" placeholder="Movie name" />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">YEAR</span>
                <Input value={movieYear} onChange={(e) => setMovieYear(e.target.value)} className="h-7 text-xs" placeholder="1995" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">RATIO</span>
                <select value={aspect} onChange={(e) => setAspect(e.target.value as any)}
                  className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                  <option value="9:16">Vertical 9:16</option>
                  <option value="16:9">Landscape 16:9</option>
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">FONT</span>
                <select value={font} onChange={(e) => setFont(e.target.value)}
                  className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                  <option value="Uncial Antiqua">Uncial Antiqua</option>
                  <option value="Cinzel">Cinzel</option>
                  <option value="Playfair Display">Playfair Display</option>
                  <option value="Noto Serif Devanagari">Noto Serif (Hindi)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground">FONT SIZE</span>
                  <span className="text-[10px] text-muted-foreground">{fontSize}px</span>
                </div>
                <input type="range" min={32} max={120} step={2} value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-full h-1 accent-primary" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground">REVEAL SPEED</span>
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
                  <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-7 h-6 rounded border border-border cursor-pointer" />
                  <span className="text-[10px] text-muted-foreground">{textColor}</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">ACCENT COLOR</span>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-7 h-6 rounded border border-border cursor-pointer" />
                  <span className="text-[10px] text-muted-foreground">{accentColor}</span>
                </div>
              </div>
            </div>
            <div className="pt-1 border-t border-white/5">
              <BgPicker selectedId={bgPreset.id}
                presets={CINEMA_BG}
                onSelect={(p) => { setBgPreset(p); handleImageClear(); }}
                uploadedImageUrl={uploadedImageUrl}
                onImageUpload={handleImageUpload}
                onImageClear={handleImageClear}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 h-9 text-xs font-semibold glow-primary-sm hover:glow-primary" onClick={handleRender} disabled={rendering}>
                {rendering ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Rendering…</> : <><Play className="h-3.5 w-3.5 mr-1.5" />Render Dialogue</>}
              </Button>
              {rendering && (
                <Button variant="outline" className="h-9 text-xs px-3 border-destructive/50 text-destructive" onClick={() => { cancelRef.current = true; setRendering(false); }}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col border-border/40 bg-card shadow-sm">
          <CardHeader className="py-2 px-3 border-b border-border/30">
            <CardTitle className="text-sm font-semibold">Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center gap-3 p-3">
            <canvas ref={previewRef} className="rounded-lg border border-border/50 shadow-inner h-52" style={{ width: "auto" }} />
            {videoUrl && (
              <div className="w-full space-y-2">
                <video src={videoUrl} controls playsInline className="w-full rounded-lg border border-border/50 bg-black" />
                <a href={videoUrl} download="bollywood-dialogue.webm">
                  <Button className="w-full h-8 text-xs glow-primary-sm hover:glow-primary">
                    <Download className="h-3.5 w-3.5 mr-1.5" />Download .webm
                  </Button>
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

"use client";

/**
 * Suvichar Studio — Hindi motivational quotes / thought of the day
 *
 * YouTube channels: "Suvichar", "Anmol Vachan", "Motivational Hindi" style.
 * Energetic, bold typography, word-by-word or char-by-char reveal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Play, Maximize2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { BgPicker } from "./shared/bg-picker";
import { BG_PRESETS, type BgPreset, drawBackground } from "./shared/canvas-utils";
import { createWebmBlob, createWebmRecorder } from "./shared/media-recorder";

const SUVICHAR_BG: BgPreset[] = [
  {
    id: "sunrise",
    label: "Sunrise Energy",
    stops: { x0: 0, y0: 0, x1: 0, y1: 1, colors: [[0, "#1a0800"], [0.4, "#4a1a00"], [0.7, "#8b3a00"], [1, "#2a0c00"]] },
    preview: "linear-gradient(180deg,#1a0800,#4a1a00,#8b3a00,#2a0c00)",
  },
  {
    id: "ocean_calm",
    label: "Ocean Calm",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#001a2e"], [0.5, "#003d5c"], [1, "#00111e"]] },
    preview: "linear-gradient(135deg,#001a2e,#003d5c,#00111e)",
  },
  {
    id: "forest_wisdom",
    label: "Forest Wisdom",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#071a0a"], [0.5, "#0f3014"], [1, "#041008"]] },
    preview: "linear-gradient(135deg,#071a0a,#0f3014,#041008)",
  },
  {
    id: "golden_hour",
    label: "Golden Hour",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#1a1200"], [0.5, "#3d2d00"], [1, "#100c00"]] },
    preview: "linear-gradient(135deg,#1a1200,#3d2d00,#100c00)",
  },
  ...BG_PRESETS.filter((p) => ["cosmic", "slate", "aurora", "ashen"].includes(p.id)),
];

const TITLE_OPTIONS = [
  { value: "suvichar", label: "✦ Suvichar ✦" },
  { value: "anmol_vachan", label: "✦ Anmol Vachan ✦" },
  { value: "thought", label: "✦ Thought of the Day ✦" },
  { value: "motivation", label: "✦ Motivation ✦" },
  { value: "gyaan", label: "✦ आज का ज्ञान ✦" },
  { value: "custom", label: "Custom…" },
] as const;

const ASPECT_OPTIONS = [
  { value: "9:16", label: "Vertical 9:16", w: 1080, h: 1920 },
  { value: "16:9", label: "Landscape 16:9", w: 1280, h: 720 },
] as const;

const loadedFonts = new Set<string>();
function loadHindiFont(family: string) {
  if (typeof document === "undefined" || loadedFonts.has(family)) return;
  loadedFonts.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
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

function drawSuvicharFrame(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  bgPreset: BgPreset, bgImage: ImageBitmap | null, title: string, quote: string, source: string,
  font: string, titleProgress: number, quoteProgress: number, // 0→1
  fontSize: number, accentColor: string, textColor: string,
) {
  drawBackground(ctx, W, H, bgPreset, bgImage);
  const vert = H > W;
  const pad = vert ? W * 0.08 : W * 0.06;
  const maxW = W - pad * 2;

  // Title reveal (fade in from top)
  if (titleProgress > 0) {
    const titleFs = Math.round(fontSize * 0.5);
    ctx.font = `700 ${titleFs}px "${font}", "Noto Sans Devanagari", sans-serif`;
    ctx.textAlign = "center";
    ctx.globalAlpha = Math.min(1, titleProgress * 2);
    ctx.fillStyle = accentColor;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 16;
    ctx.fillText(title, W / 2, vert ? H * 0.14 : H * 0.18);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Divider
    const lineY = vert ? H * 0.18 : H * 0.26;
    const lineW = maxW * Math.min(1, titleProgress * 3);
    ctx.strokeStyle = `${accentColor}88`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - lineW / 2, lineY);
    ctx.lineTo(W / 2 + lineW / 2, lineY);
    ctx.stroke();
  }

  // Quote text (char by char)
  if (quoteProgress > 0) {
    ctx.font = `700 ${fontSize}px "${font}", "Noto Serif Devanagari", serif`;
    ctx.textAlign = "center";
    ctx.shadowBlur = 0;
    const quoteLines = wrapCanvasText(ctx, quote, maxW);
    const lineH = fontSize * 1.7;
    const totalH = quoteLines.length * lineH;
    const startY = (H - totalH) / 2 + (vert ? 60 : 30);

    // How many characters to show
    const totalChars = Array.from(quote).length;
    const visibleChars = Math.ceil(totalChars * quoteProgress);
    let charsLeft = visibleChars;

    for (let i = 0; i < quoteLines.length; i++) {
      const lineChars = Array.from(quoteLines[i]!).length;
      if (charsLeft <= 0) break;
      const shown = Array.from(quoteLines[i]!).slice(0, Math.min(lineChars, charsLeft)).join("");
      charsLeft -= lineChars;

      const y = startY + i * lineH;
      ctx.fillStyle = textColor;
      ctx.globalAlpha = Math.min(1, quoteProgress + 0.15);
      ctx.fillText(shown, W / 2, y);
      ctx.globalAlpha = 1;
    }

    // Source / attribution
    if (quoteProgress >= 1 && source) {
      const sourceY = startY + quoteLines.length * lineH + fontSize * 0.9;
      ctx.font = `400 ${Math.round(fontSize * 0.44)}px "${font}", "Noto Sans Devanagari", sans-serif`;
      ctx.fillStyle = `${accentColor}cc`;
      ctx.fillText(`— ${source}`, W / 2, sourceY);
    }
  }

  ctx.textAlign = "start";
  ctx.font = `500 ${vert ? 13 : 11}px ui-sans-serif, system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillText("CodeCinematic", W - (vert ? 156 : 136), H - (vert ? 38 : 26));
}

export function SuvicharPanel({ projectId }: { projectId: string }) {
  const [quote, setQuote] = useState(
    "जीवन में सफलता उन्हें मिलती है जो\nहार मानने से इनकार करते हैं।\nठोकर खाओ, गिरो, पर उठो ज़रूर —\nक्योंकि यही असली जीत है।"
  );
  const [source, setSource] = useState("Chanakya Niti");
  const [titleMode, setTitleMode] = useState<typeof TITLE_OPTIONS[number]["value"]>("suvichar");
  const [customTitle, setCustomTitle] = useState("");
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [font, setFont] = useState("Noto Serif Devanagari");
  const [fontSize, setFontSize] = useState(56);
  const [textColor, setTextColor] = useState("#f0ead6");
  const [accentColor, setAccentColor] = useState("#f5a623");
  const [charSpeed, setCharSpeed] = useState(1.0);
  const [bgPreset, setBgPreset] = useState<BgPreset>(SUVICHAR_BG[0]!);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<ImageBitmap | null>(null);
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [expandPreview, setExpandPreview] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);

  const resolvedTitle = titleMode === "custom" ? customTitle : TITLE_OPTIONS.find((t) => t.value === titleMode)?.label ?? "✦ Suvichar ✦";

  useEffect(() => { loadHindiFont(font); }, [font]);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => () => {
    if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
  }, [uploadedImageUrl]);

  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    c.width = 320; c.height = 568;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    drawSuvicharFrame(ctx, 320, 568, bgPreset, bgImage, resolvedTitle, quote, source, font, 1, 1, Math.round(fontSize * 0.4), accentColor, textColor);
  }, [quote, source, resolvedTitle, font, fontSize, accentColor, textColor, bgPreset, bgImage]);

  function handleImageUpload(file: File) { const url = URL.createObjectURL(file); setUploadedImageUrl(url); createImageBitmap(file).then(setBgImage); }
  function handleImageClear() { setUploadedImageUrl(null); setBgImage(null); }

  const handleRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !quote.trim()) return;
    cancelRef.current = false;
    setRendering(true);
    setVideoUrl(null);

    const dim = ASPECT_OPTIONS.find((a) => a.value === aspect)!;
    canvas.width = dim.w; canvas.height = dim.h;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) { setRendering(false); return; }

    loadHindiFont(font);
    try { await document.fonts.load(`700 ${fontSize}px "${font}"`); } catch { /* ok */ }

    const fps = 30;
    const titleDur = 1200;
    const msPerChar = (60 / charSpeed);
    const quoteDur = Math.max(1500, Array.from(quote).length * msPerChar + 800);
    const holdDur = 1500;
    const totalMs = titleDur + quoteDur + holdDur;

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

        const titleProg = Math.min(1, elapsed / titleDur);
        const quoteProg = elapsed > titleDur ? Math.min(1, (elapsed - titleDur) / quoteDur) : 0;

        drawSuvicharFrame(ctx, dim.w, dim.h, bgPreset, bgImage, resolvedTitle, quote, source, font, titleProg, quoteProg, fontSize, accentColor, textColor);
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
  }, [quote, source, aspect, font, fontSize, textColor, accentColor, charSpeed, bgPreset, bgImage, resolvedTitle]);

  return (
    <div className="flex flex-col h-full min-h-0 space-y-2 overflow-y-auto app-scroll">
      <div className="grid gap-2 xl:grid-cols-[1fr_1fr] xl:flex-1 xl:min-h-0">
        <div className="flex flex-col space-y-2 min-h-0 overflow-y-auto app-scroll">
          <Card className="border-border/40 bg-card shadow-sm">
            <CardHeader className="py-2 px-3 border-b border-border/30">
              <CardTitle className="text-sm font-semibold">✦ Suvichar Studio</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-3 space-y-3">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">QUOTE / SUVICHAR</span>
                <Textarea value={quote} onChange={(e) => setQuote(e.target.value)}
                  className="min-h-[90px] text-sm border-input resize-none font-serif" placeholder="अपना सुविचार यहाँ लिखें…" dir="auto" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">SOURCE / AUTHOR</span>
                  <Input value={source} onChange={(e) => setSource(e.target.value)} className="h-7 text-xs" placeholder="e.g. Chanakya" dir="auto" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">TITLE STYLE</span>
                  <select value={titleMode} onChange={(e) => setTitleMode(e.target.value as any)}
                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1">
                    {TITLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              {titleMode === "custom" && (
                <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} className="h-7 text-xs" placeholder="Custom title text" />
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">RATIO</span>
                  <select value={aspect} onChange={(e) => setAspect(e.target.value as any)}
                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                    {ASPECT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <span className="text-[10px] font-semibold text-muted-foreground">FONT</span>
                  <select value={font} onChange={(e) => setFont(e.target.value)}
                    className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                    {[
                      { value: "Noto Serif Devanagari", label: "Noto Serif (Hindi)" },
                      { value: "Baloo 2", label: "Baloo 2" },
                      { value: "Noto Sans Devanagari", label: "Noto Sans (Hindi)" },
                      { value: "Playfair Display", label: "Playfair Display" },
                    ].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
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
                    <span className="text-[10px] font-semibold text-muted-foreground">TYPE SPEED</span>
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
                  presets={SUVICHAR_BG}
                  onSelect={(p) => { setBgPreset(p); handleImageClear(); }}
                  uploadedImageUrl={uploadedImageUrl}
                  onImageUpload={handleImageUpload}
                  onImageClear={handleImageClear}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button className="flex-1 h-9 text-xs font-semibold glow-primary-sm hover:glow-primary" onClick={handleRender} disabled={rendering}>
                  {rendering ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Rendering…</> : <><Play className="h-3.5 w-3.5 mr-1.5" />Render Suvichar</>}
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
                  <a
                    href={videoUrl}
                    download="suvichar.webm"
                    className={cn(
                      buttonVariants(),
                      "w-full h-8 text-xs glow-primary-sm hover:glow-primary",
                    )}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />Download .webm
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

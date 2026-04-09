"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Play, Type, ToggleLeft, ToggleRight, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

/* ═══════════════════════════════════════════════
   Font catalog (shared with word-of-day)
   ═══════════════════════════════════════════════ */
const FONT_CATALOG = [
  { name: "Playfair Display", style: "serif", google: true },
  { name: "Lora", style: "serif", google: true },
  { name: "Merriweather", style: "serif", google: true },
  { name: "Cormorant Garamond", style: "serif", google: true },
  { name: "DM Serif Display", style: "serif", google: true },
  { name: "Space Grotesk", style: "sans-serif", google: true },
  { name: "Inter", style: "sans-serif", google: true },
  { name: "Outfit", style: "sans-serif", google: true },
  { name: "Sora", style: "sans-serif", google: true },
  { name: "JetBrains Mono", style: "monospace", google: true },
  { name: "Georgia", style: "serif", google: false },
  { name: "Times New Roman", style: "serif", google: false },
] as const;

const ASPECT_OPTIONS = [
  { value: "9:16", label: "Vertical 9:16", w: 720, h: 1280 },
  { value: "16:9", label: "Landscape 16:9", w: 1280, h: 720 },
] as const;

/* ═══════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════ */
export function DidYouKnowPanel({ projectId }: { projectId: string }) {
  // Form state
  const [factText, setFactText] = useState("Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still perfectly edible.");
  const [showTitle, setShowTitle] = useState(true);
  const [titleMode, setTitleMode] = useState<"didyouknow" | "thoughtofday">("didyouknow");
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [selectedFont, setSelectedFont] = useState<string>("Playfair Display");
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [titleSpeed, setTitleSpeed] = useState(1.0);
  const [textSpeed, setTextSpeed] = useState(1.0);
  const [sound, setSound] = useState<"off" | "soft" | "typewriter">("soft");
  const [soundVolume, setSoundVolume] = useState(0.3);

  // Render state
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // Load Google Fonts
  useEffect(() => {
    const googleFonts = FONT_CATALOG.filter((f) => f.google).map((f) => f.name.replace(/ /g, "+"));
    const families = googleFonts.map((f) => `family=${f}:ital,wght@0,400;0,700;1,400;1,700`).join("&");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, []);

  // Live preview
  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    const dim = ASPECT_OPTIONS.find((a) => a.value === aspect)!;
    const scale = 0.25;
    c.width = dim.w * scale;
    c.height = dim.h * scale;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Show the fact text phase in preview
    drawFactFrame(ctx, c.width, c.height, factText, selectedFont, 1.0);
  }, [factText, aspect, selectedFont]);

  const titleText = titleMode === "didyouknow" ? "DID YOU KNOW ?" : "THOUGHT OF THE DAY";

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
    const charsPerSec = 40 * textSpeed;
    const typingDuration = Math.max(2, factText.length / charsPerSec);
    const holdDuration = 1.5;
    const totalFrames = Math.ceil((titleDuration + fadeDuration + typingDuration + holdDuration) * fps);

    // Audio setup
    const audioCtx = typeof AudioContext !== "undefined" ? new AudioContext() : null;
    const audioDest = audioCtx ? audioCtx.createMediaStreamDestination() : null;

    const videoStream = canvas.captureStream(fps);
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...(audioDest ? audioDest.stream.getAudioTracks() : []),
    ]);

    const recorder = new MediaRecorder(combinedStream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: 4_000_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    });

    // Schedule typing sounds
    if (audioCtx && audioDest && sound !== "off" && soundVolume > 0) {
      const typeStart = audioCtx.currentTime + titleDuration + fadeDuration + 0.06;
      const chars = Array.from(factText);
      chars.forEach((ch, i) => {
        const when = typeStart + (i / chars.length) * typingDuration;
        playTypingPulse(audioCtx, audioDest, when, sound, soundVolume, ch, i === chars.length - 1);
      });
    }

    recorder.start();

    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / fps;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (showTitle && t < titleDuration) {
        drawTitleScreen(ctx, canvas.width, canvas.height, titleText, selectedFont, 1.0);
      } else if (showTitle && t < titleDuration + fadeDuration) {
        const fadeProgress = (t - titleDuration) / fadeDuration;
        drawCrumbleEffect(ctx, canvas.width, canvas.height, titleText, selectedFont, fadeProgress);
      } else {
        const factStartTime = titleDuration + fadeDuration;
        const factT = (t - factStartTime) / typingDuration;
        drawFactFrame(ctx, canvas.width, canvas.height, factText, selectedFont, Math.min(factT, 1.0));
      }

      setProgress(`Rendering… ${Math.round((frame / totalFrames) * 100)}%`);
      await new Promise((r) => requestAnimationFrame(r));
    }

    recorder.stop();
    const blob = await done;
    if (audioCtx) audioCtx.close();
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setRendering(false);
    setProgress("");
  }, [factText, aspect, selectedFont, showTitle, titleText, titleSpeed, textSpeed, sound, soundVolume]);

  const handleDownload = () => {
    if (!videoUrl) return;
    const slug = titleMode === "didyouknow" ? "did-you-know" : "thought-of-the-day";
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `${slug}-${Date.now()}.webm`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full space-y-2 overflow-y-auto xl:overflow-hidden">
      <div className="grid gap-2 xl:grid-cols-[1fr_1fr] xl:flex-1 xl:min-h-0">

        {/* LEFT: Settings */}
        <div className="flex flex-col space-y-2">
          <Card className="border-white/5 bg-background shadow-lg dark:bg-card">
            <CardHeader className="py-2 px-3 border-b border-white/5 mb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Type className="h-4 w-4 text-primary" />
                {titleMode === "didyouknow" ? "Did You Know?" : "Thought of the Day"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-3">
              {/* Title mode selector */}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">MODE</span>
                <div className="grid grid-cols-2 gap-1.5">
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
                    Thought of the Day
                  </button>
                </div>
              </div>

              {/* Toggle title visibility */}
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

              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {titleMode === "didyouknow" ? "FACT / CONTENT" : "YOUR THOUGHT"}
                </span>
                <Textarea
                  value={factText}
                  onChange={(e) => setFactText(e.target.value)}
                  className="min-h-[100px] text-xs border-input shadow-sm resize-none"
                  placeholder={titleMode === "didyouknow" ? "Enter an interesting fact…" : "Enter a thought or quote…"}
                />
              </div>

              <div className="grid gap-2 grid-cols-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">RATIO</span>
                  <select
                    value={aspect}
                    onChange={(e) => setAspect(e.target.value as "9:16" | "16:9")}
                    className="flex h-7 w-full rounded-md border border-input shadow-sm bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                  >
                    {ASPECT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} className="dark:bg-slate-950">{o.label}</option>
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

              {/* Speed / Sound / Volume */}
              <div className="space-y-1.5 pt-1 border-t border-white/5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">TITLE SPEED</span>
                      <span className="text-[10px] text-muted-foreground">{titleSpeed.toFixed(1)}×</span>
                    </div>
                    <input type="range" min={0.2} max={3.0} step={0.1} value={titleSpeed}
                      onChange={(e) => setTitleSpeed(parseFloat(e.target.value))}
                      className="w-full h-1 accent-primary" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">TEXT SPEED</span>
                      <span className="text-[10px] text-muted-foreground">{textSpeed.toFixed(1)}×</span>
                    </div>
                    <input type="range" min={0.2} max={3.0} step={0.1} value={textSpeed}
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
                      className="flex h-7 w-full rounded-md border border-input shadow-sm bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
                    >
                      <option value="off" className="dark:bg-slate-950">Sound off</option>
                      <option value="soft" className="dark:bg-slate-950">Soft keys</option>
                      <option value="typewriter" className="dark:bg-slate-950">Typewriter</option>
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
                    <Download className="h-3 w-3" />Download
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Font Picker Modal */}
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
          <Card className="flex-1 flex flex-col border-white/5 bg-background shadow-lg dark:bg-card overflow-hidden">
            <div className="bg-muted/40 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider border-b flex items-center justify-between">
              <span className="text-muted-foreground ml-1">Preview</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 bg-black/50">
              <canvas
                ref={previewRef}
                className="max-w-full max-h-full rounded-md shadow-xl"
                style={{ aspectRatio: aspect === "9:16" ? "9/16" : "16/9" }}
              />
            </div>
          </Card>

          {videoUrl && (
            <Card className="border-white/5 bg-background shadow-lg dark:bg-card overflow-hidden">
              <div className="bg-muted/40 px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider border-b">
                <span className="text-muted-foreground ml-1">Rendered Video</span>
              </div>
              <div className="p-3 flex items-center justify-center">
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  className="max-w-full max-h-[360px] rounded-md shadow-lg"
                  style={{ aspectRatio: aspect === "9:16" ? "9/16" : "16/9" }}
                />
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Hidden render canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Audio helpers
   ═══════════════════════════════════════════════════════ */

function playTypingPulse(
  ac: AudioContext, dest: MediaStreamAudioDestinationNode,
  when: number, sound: string, vol: number, ch: string, accent: boolean
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(sound === "typewriter" ? 900 : 700, when);
  filter.Q.setValueAtTime(0.7, when);
  const ws = ch.trim().length === 0;
  osc.type = sound === "typewriter" ? "square" : "triangle";
  osc.frequency.setValueAtTime(
    sound === "typewriter" ? (ws ? 150 : accent ? 320 : 240) : (ws ? 480 : accent ? 900 : 700), when
  );
  const pk = (sound === "typewriter" ? (accent ? 0.12 : 0.08) : (accent ? 0.07 : 0.045)) * vol * (ws ? 0.45 : 1);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(pk, when + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + (sound === "typewriter" ? 0.016 : 0.012));
  osc.connect(filter); filter.connect(gain); gain.connect(dest);
  osc.start(when); osc.stop(when + (sound === "typewriter" ? 0.018 : 0.014));
}

/* ═══════════════════════════════════════════════════════
   Drawing helpers
   ═══════════════════════════════════════════════════════ */

function drawTitleScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  titleText: string,
  font: string,
  opacity: number
) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);

  // Subtle gradient
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.6);
  g.addColorStop(0, "rgba(139,92,246,0.03)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // Decorative lines
  ctx.strokeStyle = `rgba(255,255,255,${0.06 * opacity})`;
  ctx.lineWidth = 0.5;
  const lineY = h / 2;
  ctx.beginPath(); ctx.moveTo(w * 0.12, lineY - 45); ctx.lineTo(w * 0.88, lineY - 45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 0.12, lineY + 45); ctx.lineTo(w * 0.88, lineY + 45); ctx.stroke();

  // Small diamond decoration at center of lines
  const drawDiamond = (cx: number, cy: number, size: number) => {
    ctx.fillStyle = `rgba(255,255,255,${0.15 * opacity})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size, cy);
    ctx.closePath();
    ctx.fill();
  };
  drawDiamond(w / 2, lineY - 45, 3);
  drawDiamond(w / 2, lineY + 45, 3);

  // Title text
  const vert = w < h;
  const titleSize = vert ? 26 : 30;
  ctx.font = `400 ${titleSize}px "${font}", Georgia, serif`;
  ctx.fillStyle = `rgba(255,255,255,${0.92 * opacity})`;
  ctx.textAlign = "center";
  ctx.letterSpacing = "6px";
  ctx.fillText(titleText, w / 2, h / 2 + titleSize / 3);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "start";
}

function drawCrumbleEffect(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  titleText: string,
  font: string,
  progress: number
) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);

  const vert = w < h;
  const titleSize = vert ? 26 : 30;

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
    const offsetY = charProgress * (30 + Math.random() * 50);
    const offsetX = (Math.random() - 0.5) * charProgress * 25;
    const rotate = (Math.random() - 0.5) * charProgress * 0.4;

    if (alpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx + charW / 2 + offsetX, baseY + offsetY);
      ctx.rotate(rotate);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(ch, -charW / 2, 0);
      ctx.restore();
    }

    // Dust particles
    if (charProgress > 0.05 && charProgress < 0.85) {
      for (let p = 0; p < 2; p++) {
        const px = cx + charW / 2 + (Math.random() - 0.5) * 18;
        const py = baseY + offsetY + (Math.random() - 0.5) * 18;
        ctx.fillStyle = `rgba(255,255,255,${(1 - charProgress) * 0.4})`;
        ctx.beginPath();
        ctx.arc(px, py, (1 - charProgress) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    cx += charW;
  }

  ctx.globalAlpha = 1;
  ctx.textAlign = "start";
}

function drawFactFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  font: string,
  progress: number
) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);

  // Subtle ambient glow
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.5);
  g.addColorStop(0, "rgba(56,189,248,0.015)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  const vert = w < h;
  const fontSize = vert ? 32 : 36;
  const lineHeight = fontSize * 1.8;
  const maxW = w * 0.78;
  const totalChars = text.length;
  const visibleChars = Math.floor(totalChars * progress);
  const visibleText = text.substring(0, visibleChars);

  ctx.font = `400 ${fontSize}px "${font}", Georgia, serif`;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "center";

  // Word-wrap the visible text
  const lines = wrapText(ctx, visibleText, maxW);
  const totalHeight = lines.length * lineHeight;
  const startY = (h - totalHeight) / 2 + fontSize;

  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, startY + i * lineHeight);
  });

  // Blinking cursor at end
  if (visibleChars < totalChars) {
    const lastLine = lines[lines.length - 1] || "";
    const lastW = ctx.measureText(lastLine).width;
    const cursorX = w / 2 + lastW / 2 + 4;
    const cursorY = startY + (lines.length - 1) * lineHeight;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillRect(cursorX, cursorY - fontSize + 6, 2, fontSize - 4);
  }

  // Decorative subtle quotes on the sides
  if (progress > 0.3) {
    const quoteAlpha = Math.min((progress - 0.3) * 2, 0.08);
    ctx.font = `italic 64px "${font}", Georgia, serif`;
    ctx.fillStyle = `rgba(255,255,255,${quoteAlpha})`;
    ctx.textAlign = "center";
    ctx.fillText("\u201C", w * 0.08, startY - 10);
    ctx.fillText("\u201D", w * 0.92, startY + totalHeight + 10);
  }

  ctx.textAlign = "start";
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/* ═══════════════════════════════════════════════════════
   Font Picker Modal (same as word-of-day)
   ═══════════════════════════════════════════════════════ */
function FontPickerModal({
  currentFont,
  onSelect,
  onClose,
  sampleText,
}: {
  currentFont: string;
  onSelect: (font: string) => void;
  onClose: () => void;
  sampleText: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <Card
        className="w-full max-w-md max-h-[70vh] border-white/10 bg-background shadow-2xl dark:bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="py-2.5 px-4 border-b border-white/5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Type className="h-4 w-4 text-primary" />
            Choose Font
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 overflow-y-auto max-h-[55vh] space-y-1">
          {FONT_CATALOG.map((font) => (
            <button
              key={font.name}
              type="button"
              onClick={() => onSelect(font.name)}
              className={`w-full rounded-lg border p-3 text-left transition hover:border-primary/50 ${
                currentFont === font.name
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{font.name}</span>
                <span className="text-[9px] text-muted-foreground/60">{font.style}</span>
              </div>
              <p
                className="text-lg truncate"
                style={{ fontFamily: `"${font.name}", ${font.style}` }}
              >
                {sampleText}
              </p>
              <p
                className="text-xs text-muted-foreground italic truncate mt-0.5"
                style={{ fontFamily: `"${font.name}", ${font.style}` }}
              >
                The quick brown fox jumps over the lazy dog
              </p>
            </button>
          ))}
        </CardContent>
        <div className="p-2 border-t border-white/5">
          <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}

"use client";

/**
 * Facts Hindi Studio — "Kya Aap Jaante Hain?" style Hindi fact videos
 *
 * YouTube channels: "Rochak Tathya", "Amazing Facts Hindi" style.
 * Clean title bar, fact text reveal, emoji decoration.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Play, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BgPicker } from "./shared/bg-picker";
import { BG_PRESETS, type BgPreset, drawBackground } from "./shared/canvas-utils";

const FACTS_BG: BgPreset[] = [
  {
    id: "deep_teal",
    label: "Deep Teal",
    stops: { x0: 0, y0: 0, x1: 0, y1: 1, colors: [[0, "#00111e"], [0.5, "#002233"], [1, "#000d18"]] },
    preview: "linear-gradient(180deg,#00111e,#002233,#000d18)",
  },
  {
    id: "royal_navy",
    label: "Royal Navy",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#050a1f"], [0.5, "#0a1440"], [1, "#020610"]] },
    preview: "linear-gradient(135deg,#050a1f,#0a1440,#020610)",
  },
  {
    id: "emerald_night",
    label: "Emerald Night",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#00120a"], [0.5, "#00221a"], [1, "#000c06"]] },
    preview: "linear-gradient(135deg,#00120a,#00221a,#000c06)",
  },
  {
    id: "purple_galaxy",
    label: "Purple Galaxy",
    stops: { x0: 0, y0: 0, x1: 1, y1: 1, colors: [[0, "#0d0020"], [0.5, "#180a35"], [1, "#06000f"]] },
    preview: "linear-gradient(135deg,#0d0020,#180a35,#06000f)",
  },
  ...BG_PRESETS.filter((p) => ["cosmic", "slate", "aurora", "sapphire"].includes(p.id)),
];

const CATEGORY_OPTIONS = [
  { value: "science", label: "🔬 Science" },
  { value: "history", label: "🏛️ History" },
  { value: "india", label: "🇮🇳 India" },
  { value: "world", label: "🌍 World" },
  { value: "tech", label: "💻 Technology" },
  { value: "nature", label: "🌿 Nature" },
  { value: "sport", label: "🏏 Sports" },
  { value: "film", label: "🎬 Film" },
];

const FACT_EMOJI_MAP: Record<string, string> = {
  science: "🔬", history: "🏛️", india: "🇮🇳", world: "🌍", tech: "💻", nature: "🌿", sport: "🏏", film: "🎬",
};

interface Fact { id: string; text: string; source?: string; category: string; }

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

function drawFactFrame(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  bgPreset: BgPreset, titleText: string, fact: Fact, factProgress: number,
  titleProgress: number, font: string, fontSize: number,
  textColor: string, accentColor: string,
) {
  drawBackground(ctx, W, H, bgPreset, null);
  const vert = H > W;
  const pad = W * 0.07;
  const maxW = W - pad * 2;

  // Top banner: "Kya Aap Jaante Hain?" / title
  if (titleProgress > 0) {
    const bannerH = vert ? H * 0.13 : H * 0.18;
    const bannerAlpha = Math.min(1, titleProgress * 2);
    ctx.globalAlpha = bannerAlpha;

    // Banner bg
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, `${accentColor}33`);
    grad.addColorStop(0.5, `${accentColor}55`);
    grad.addColorStop(1, `${accentColor}33`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    const r = vert ? 20 : 14;
    const by = bannerH * 0.1;
    const bh = bannerH * 0.8;
    ctx.roundRect(pad * 0.3, by, W - pad * 0.6, bh, r);
    ctx.fill();

    const titleFs = vert ? Math.round(fontSize * 0.48) : Math.round(fontSize * 0.38);
    ctx.font = `700 ${titleFs}px "${font}", "Noto Sans Devanagari", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = textColor;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 10;
    ctx.fillText(titleText, W / 2, bannerH * 0.65);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Divider
    const divY = bannerH + (vert ? 24 : 12);
    const divAlpha = Math.min(1, titleProgress * 3) * 0.5;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = divAlpha;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(pad, divY); ctx.lineTo(W - pad, divY); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  // Category emoji chip
  if (titleProgress > 0.4) {
    const emoji = FACT_EMOJI_MAP[fact.category] ?? "💡";
    const chipY = vert ? H * 0.17 : H * 0.26;
    const catLabel = CATEGORY_OPTIONS.find((c) => c.value === fact.category)?.label ?? "";
    ctx.font = `600 ${Math.round(fontSize * 0.36)}px "${font}", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = `${accentColor}cc`;
    ctx.globalAlpha = Math.min(1, (titleProgress - 0.4) * 3);
    ctx.fillText(`${catLabel}`, W / 2, chipY);
    ctx.globalAlpha = 1;
  }

  // Fact text (char by char reveal)
  if (factProgress > 0) {
    ctx.font = `700 ${fontSize}px "${font}", "Noto Sans Devanagari", sans-serif`;
    ctx.textAlign = "center";
    const factLines = wrapText(ctx, fact.text, maxW);
    const lineH = fontSize * 1.65;
    const totalH = factLines.length * lineH;
    const startY = H * 0.5 - totalH * 0.4;

    const totalChars = Array.from(fact.text).length;
    const visChars = Math.ceil(totalChars * factProgress);
    let remaining = visChars;

    factLines.forEach((line, i) => {
      const nChars = Array.from(line).length;
      if (remaining <= 0) return;
      const shown = Array.from(line).slice(0, Math.min(nChars, remaining)).join("");
      remaining -= nChars;

      const y = startY + i * lineH;
      ctx.fillStyle = textColor;
      ctx.shadowColor = `${accentColor}66`;
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.92;
      ctx.fillText(shown, W / 2, y);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });

    // Source attribution
    if (factProgress >= 1 && fact.source) {
      const srcY = startY + factLines.length * lineH + fontSize * 0.8;
      ctx.font = `400 ${Math.round(fontSize * 0.38)}px "${font}", sans-serif`;
      ctx.fillStyle = `${accentColor}99`;
      ctx.fillText(`Source: ${fact.source}`, W / 2, srcY);
    }
  }

  ctx.textAlign = "start";
  ctx.font = `400 ${vert ? 13 : 11}px ui-sans-serif, system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillText("CodeCinematic", W - (vert ? 156 : 136), H - (vert ? 38 : 26));
}

let _nextId = 1;
function makeId() { return `fact_${_nextId++}`; }

export function FactsHindiPanel({ projectId }: { projectId: string }) {
  const [facts, setFacts] = useState<Fact[]>([
    {
      id: makeId(),
      text: "भारत दुनिया का सबसे बड़ा लोकतंत्र है, जहाँ लगभग 90 करोड़ से ज़्यादा मतदाता हैं।",
      source: "Election Commission of India",
      category: "india",
    },
  ]);
  const [titleText, setTitleText] = useState("क्या आप जानते हैं?");
  const [titlePreset, setTitlePreset] = useState("kya_aap_jante");
  const [font, setFont] = useState("Noto Sans Devanagari");
  const [fontSize, setFontSize] = useState(52);
  const [textColor, setTextColor] = useState("#e8f4fd");
  const [accentColor, setAccentColor] = useState("#00d4ff");
  const [charSpeed, setCharSpeed] = useState(1.0);
  const [bgPreset, setBgPreset] = useState<BgPreset>(FACTS_BG[0]!);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [previewFactIdx, setPreviewFactIdx] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);

  const TITLE_PRESETS = [
    { value: "kya_aap_jante", label: "क्या आप जानते हैं?" },
    { value: "did_you_know", label: "Did You Know? 💡" },
    { value: "amazing_fact", label: "Amazing Fact 🤯" },
    { value: "rochak_tathya", label: "रोचक तथ्य" },
    { value: "achi_baat", label: "आज की अच्छी बात" },
    { value: "custom", label: "Custom…" },
  ];

  useEffect(() => { loadFont(font); }, [font]);
  useEffect(() => {
    if (titlePreset !== "custom") {
      setTitleText(TITLE_PRESETS.find((p) => p.value === titlePreset)?.label ?? "क्या आप जानते हैं?");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titlePreset]);

  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    c.width = 320; c.height = 568;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const fact = facts[previewFactIdx] ?? facts[0];
    if (!fact) return;
    drawFactFrame(ctx, 320, 568, bgPreset, titleText, fact, 1, 1, font, Math.round(fontSize * 0.42), textColor, accentColor);
  }, [facts, previewFactIdx, titleText, font, fontSize, textColor, accentColor, bgPreset]);

  function addFact() {
    setFacts((f) => [...f, { id: makeId(), text: "", source: "", category: "india" }]);
  }
  function removeFact(id: string) {
    setFacts((f) => f.filter((x) => x.id !== id));
  }
  function updateFact(id: string, patch: Partial<Fact>) {
    setFacts((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  const handleRender = useCallback(async () => {
    const canvas = canvasRef.current;
    const validFacts = facts.filter((f) => f.text.trim());
    if (!canvas || validFacts.length === 0) return;
    cancelRef.current = false;
    setRendering(true);
    setVideoUrl(null);

    const dim = aspect === "9:16" ? { w: 1080, h: 1920 } : { w: 1280, h: 720 };
    canvas.width = dim.w; canvas.height = dim.h;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) { setRendering(false); return; }

    loadFont(font);
    try { await document.fonts.load(`700 ${fontSize}px "${font}"`); } catch { /* ok */ }

    const ms: number[] = validFacts.map((f) => Math.max(1200, Array.from(f.text).length * (55 / charSpeed) + 800));
    const totalMs = ms.reduce((a, b) => a + b, 0) + validFacts.length * 800 + 1500;

    const vStream = (canvas as any).captureStream(0) as MediaStream;
    const vTrack = vStream.getVideoTracks()[0] as any;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(vStream, { videoBitsPerSecond: 6_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const done = new Promise<Blob>((resolve) => { rec.onstop = () => resolve(new Blob(chunks, { type: "video/webm" })); });

    rec.start(200);
    await new Promise<void>((r) => setTimeout(r, 300));
    if (cancelRef.current) { rec.stop(); setRendering(false); return; }

    // Build cumulative timeline
    const titleDur = 900;
    const cumEnds: number[] = [];
    let cumT = titleDur;
    validFacts.forEach((_, i) => { cumT += ms[i]! + 800; cumEnds.push(cumT); });

    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      function frame() {
        if (cancelRef.current) { resolve(); return; }
        const elapsed = Math.min(performance.now() - t0, totalMs);

        const titleProg = Math.min(1, elapsed / titleDur);
        const factIdx = cumEnds.findIndex((e) => elapsed <= e);
        const activeFact = validFacts[factIdx === -1 ? validFacts.length - 1 : factIdx]!;
        const factStart = factIdx === 0 || factIdx === -1 ? titleDur : (cumEnds[factIdx - 1] ?? titleDur);
        const factDur = ms[factIdx === -1 ? validFacts.length - 1 : factIdx]!;
        const factProg = Math.min(1, Math.max(0, (elapsed - factStart) / factDur));

        drawFactFrame(ctx, dim.w, dim.h, bgPreset, titleText, activeFact, factProg, titleProg, font, fontSize, textColor, accentColor);
        vTrack?.requestFrame?.();

        if (elapsed >= totalMs) { rec.stop(); resolve(); }
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    const webm = await done;
    if (cancelRef.current) { setRendering(false); return; }

    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { fetchFile } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    await ff.load();
    await ff.writeFile("in.webm", await fetchFile(webm));
    await ff.exec(["-i", "in.webm", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-movflags", "+faststart", "out.mp4"]);
    const mp4 = await ff.readFile("out.mp4") as Uint8Array;
    ff.terminate();

    setVideoUrl(URL.createObjectURL(new Blob([new Uint8Array(mp4)], { type: "video/mp4" })));
    setRendering(false);
  }, [facts, aspect, font, fontSize, textColor, accentColor, charSpeed, bgPreset, titleText]);

  return (
    <div className="flex flex-col h-full space-y-2 overflow-y-auto">
      <div className="grid gap-2 xl:grid-cols-[1fr_1fr]">
        <Card className="border-border/40 bg-card shadow-sm">
          <CardHeader className="py-2 px-3 border-b border-border/30">
            <CardTitle className="text-sm font-semibold">💡 Facts Hindi Studio</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">TITLE STYLE</span>
                <select value={titlePreset} onChange={(e) => setTitlePreset(e.target.value)}
                  className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                  {TITLE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {titlePreset === "custom" && (
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">CUSTOM TITLE</span>
                  <Input value={titleText} onChange={(e) => setTitleText(e.target.value)} className="h-7 text-xs" dir="auto" />
                </div>
              )}
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">FONT</span>
                <select value={font} onChange={(e) => setFont(e.target.value)}
                  className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                  <option value="Noto Sans Devanagari">Noto Sans (Hindi)</option>
                  <option value="Baloo 2">Baloo 2</option>
                  <option value="Poppins">Poppins</option>
                  <option value="Inter">Inter</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground">FONT SIZE</span>
                  <span className="text-[10px] text-muted-foreground">{fontSize}px</span>
                </div>
                <input type="range" min={28} max={80} step={2} value={fontSize}
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
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">RATIO</span>
                <select value={aspect} onChange={(e) => setAspect(e.target.value as any)}
                  className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs">
                  <option value="9:16">Vertical 9:16</option>
                  <option value="16:9">Landscape 16:9</option>
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">TEXT COLOR</span>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-7 h-6 rounded border border-border cursor-pointer" />
                  <span className="text-[10px] text-muted-foreground truncate">{textColor}</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">ACCENT</span>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-7 h-6 rounded border border-border cursor-pointer" />
                  <span className="text-[10px] text-muted-foreground truncate">{accentColor}</span>
                </div>
              </div>
            </div>

            {/* Facts list */}
            <div className="space-y-2 pt-1 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground">FACTS ({facts.length})</span>
                <button type="button" onClick={addFact} className="h-5 px-1.5 text-[10px] rounded border border-border/40 hover:border-primary/50 flex items-center gap-0.5 text-muted-foreground hover:text-primary">
                  <Plus className="h-2.5 w-2.5" />Add fact
                </button>
              </div>
              {facts.map((fact, idx) => (
                <div key={fact.id} className={`rounded border p-2 space-y-1.5 transition-colors cursor-pointer ${previewFactIdx === idx ? "border-primary/50 bg-primary/5" : "border-border/40"}`}
                  onClick={() => setPreviewFactIdx(idx)}>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground flex-1">Fact {idx + 1}</span>
                    <select value={fact.category} onChange={(e) => { e.stopPropagation(); updateFact(fact.id, { category: e.target.value }); }}
                      className="h-5 rounded border border-input bg-background px-1 text-[10px]"
                      onClick={(e) => e.stopPropagation()}>
                      {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    {facts.length > 1 && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeFact(fact.id); }}
                        className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <Textarea value={fact.text} onChange={(e) => { e.stopPropagation(); updateFact(fact.id, { text: e.target.value }); }}
                    className="min-h-[52px] text-xs resize-none border-input" placeholder="Fact text (Hindi or English)…" dir="auto"
                    onClick={(e) => e.stopPropagation()} />
                  <Input value={fact.source ?? ""} onChange={(e) => { e.stopPropagation(); updateFact(fact.id, { source: e.target.value }); }}
                    className="h-6 text-[10px] border-input" placeholder="Source (optional)"
                    onClick={(e) => e.stopPropagation()} />
                </div>
              ))}
            </div>

            <div className="pt-1 border-t border-white/5">
              <BgPicker selectedId={bgPreset.id}
                onSelect={(p) => { setBgPreset(p); setUploadedImageUrl(null); }}
                uploadedImageUrl={uploadedImageUrl}
                onImageUpload={(f) => { setUploadedImageUrl(URL.createObjectURL(f)); }}
                onImageClear={() => setUploadedImageUrl(null)}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 h-9 text-xs font-semibold glow-primary-sm hover:glow-primary" onClick={handleRender} disabled={rendering}>
                {rendering ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Rendering…</> : <><Play className="h-3.5 w-3.5 mr-1.5" />Render Facts Video</>}
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
            <CardTitle className="text-sm font-semibold">Preview (Fact {previewFactIdx + 1})</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center gap-3 p-3">
            <canvas ref={previewRef} className="rounded-lg border border-border/50 shadow-inner h-52" style={{ width: "auto" }} />
            {videoUrl && (
              <div className="w-full space-y-2">
                <video src={videoUrl} controls playsInline className="w-full rounded-lg border border-border/50 bg-black" />
                <a href={videoUrl} download="facts-hindi.mp4">
                  <Button className="w-full h-8 text-xs glow-primary-sm hover:glow-primary">
                    <Download className="h-3.5 w-3.5 mr-1.5" />Download .mp4
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

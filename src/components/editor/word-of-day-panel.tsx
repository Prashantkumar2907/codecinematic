"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Play, Type, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/* ═══════════════════════════════════════════════
   Font catalog — safe web fonts + Google Fonts
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

type FontEntry = (typeof FONT_CATALOG)[number];

const ASPECT_OPTIONS = [
  { value: "9:16", label: "Vertical 9:16", w: 720, h: 1280 },
  { value: "16:9", label: "Landscape 16:9", w: 1280, h: 720 },
] as const;

/* ═══════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════ */
export function WordOfDayPanel({ projectId }: { projectId: string }) {
  // Form state
  const [word, setWord] = useState("Ephemeral");
  const [meaning, setMeaning] = useState("lasting for a very short time");
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [selectedFont, setSelectedFont] = useState<string>("Playfair Display");
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [titleSpeed, setTitleSpeed] = useState(1.0);
  const [wordSpeed, setWordSpeed] = useState(1.0);
  const [meaningSpeed, setMeaningSpeed] = useState(1.0);
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
    drawWordFrame(ctx, c.width, c.height, word, meaning, selectedFont, 1.0, 0.5);
  }, [word, meaning, aspect, selectedFont]);

  /* ── Render video ── */
  const handleRender = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !word.trim()) return;
    setRendering(true);
    setVideoUrl(null);
    setProgress("Preparing…");

    const dim = ASPECT_OPTIONS.find((a) => a.value === aspect)!;
    canvas.width = dim.w;
    canvas.height = dim.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setRendering(false); return; }

    const fps = 30;
    const titleDuration = 1.0 / titleSpeed;
    const fadeDuration = 0.8 / titleSpeed;
    const wordPhaseDur = 1.5 / wordSpeed;    // word typing phase
    const meaningPhaseDur = 1.5 / meaningSpeed; // meaning typing phase
    const wordDuration = wordPhaseDur + meaningPhaseDur;
    const holdDuration = 0.5;
    const totalFrames = Math.ceil((titleDuration + fadeDuration + wordDuration + holdDuration) * fps);

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
      const wordChars = Array.from(word);
      const meaningChars = Array.from(meaning);

      wordChars.forEach((ch, i) => {
        const when = typeStart + (i / wordChars.length) * wordPhaseDur;
        playTypingPulse(audioCtx, audioDest, when, sound, soundVolume, ch, i === wordChars.length - 1);
      });
      meaningChars.forEach((ch, i) => {
        const when = typeStart + wordPhaseDur + (i / meaningChars.length) * meaningPhaseDur;
        playTypingPulse(audioCtx, audioDest, when, sound, soundVolume, ch, i === meaningChars.length - 1);
      });
    }

    // wordSplit = fraction of wordDuration spent on the word (vs meaning)
    const wordSplit = wordPhaseDur / wordDuration;

    recorder.start();

    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / fps;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (t < titleDuration) {
        drawTitlePhase(ctx, canvas.width, canvas.height, selectedFont, 1.0);
      } else if (t < titleDuration + fadeDuration) {
        const fadeProgress = (t - titleDuration) / fadeDuration;
        drawCrumblePhase(ctx, canvas.width, canvas.height, selectedFont, fadeProgress);
      } else {
        const wordT = (t - titleDuration - fadeDuration) / wordDuration;
        drawWordFrame(ctx, canvas.width, canvas.height, word, meaning, selectedFont, Math.min(wordT, 1.0), wordSplit);
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
  }, [word, meaning, aspect, selectedFont, titleSpeed, wordSpeed, meaningSpeed, sound, soundVolume]);

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `word-of-the-day-${word.toLowerCase().replace(/\s+/g, "-")}.webm`;
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
                Word of the Day
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-3">
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
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground">TITLE SPEED</span>
                    <span className="text-[10px] text-muted-foreground">{titleSpeed.toFixed(1)}×</span>
                  </div>
                  <input type="range" min={0.2} max={3.0} step={0.1} value={titleSpeed}
                    onChange={(e) => setTitleSpeed(parseFloat(e.target.value))}
                    className="w-full h-1 accent-primary" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">WORD SPEED</span>
                      <span className="text-[10px] text-muted-foreground">{wordSpeed.toFixed(1)}×</span>
                    </div>
                    <input type="range" min={0.2} max={3.0} step={0.1} value={wordSpeed}
                      onChange={(e) => setWordSpeed(parseFloat(e.target.value))}
                      className="w-full h-1 accent-primary" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">MEANING SPEED</span>
                      <span className="text-[10px] text-muted-foreground">{meaningSpeed.toFixed(1)}×</span>
                    </div>
                    <input type="range" min={0.2} max={3.0} step={0.1} value={meaningSpeed}
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
                  disabled={rendering || !word.trim()}
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
              sampleText={word || "Ephemeral"}
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

function drawTitlePhase(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  font: string,
  opacity: number
) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);

  // Subtle gradient overlay
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.6);
  g.addColorStop(0, "rgba(56,189,248,0.03)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // Decorative thin lines
  ctx.strokeStyle = `rgba(255,255,255,${0.05 * opacity})`;
  ctx.lineWidth = 0.5;
  const lineY = h / 2;
  ctx.beginPath(); ctx.moveTo(w * 0.15, lineY - 40); ctx.lineTo(w * 0.85, lineY - 40); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 0.15, lineY + 40); ctx.lineTo(w * 0.85, lineY + 40); ctx.stroke();

  // Title text
  const vert = w < h;
  const titleSize = vert ? 28 : 32;
  ctx.font = `300 ${titleSize}px "${font}", Georgia, serif`;
  ctx.fillStyle = `rgba(255,255,255,${0.9 * opacity})`;
  ctx.textAlign = "center";
  ctx.letterSpacing = "8px";
  ctx.fillText("WORD OF THE DAY", w / 2, h / 2 + titleSize / 3);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "start";
}

function drawCrumblePhase(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  font: string,
  progress: number
) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);

  const vert = w < h;
  const titleSize = vert ? 28 : 32;
  const text = "WORD OF THE DAY";

  ctx.font = `300 ${titleSize}px "${font}", Georgia, serif`;
  ctx.textAlign = "center";
  const textW = ctx.measureText(text).width;
  const startX = (w - textW) / 2;
  const baseY = h / 2 + titleSize / 3;

  // Draw each character with individual displacement
  ctx.textAlign = "start";
  let cx = startX;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const charW = ctx.measureText(ch).width;

    // Each char starts fading at a slightly different time
    const charDelay = (i / text.length) * 0.3;
    const charProgress = Math.max(0, Math.min(1, (progress - charDelay) / 0.7));

    const alpha = 1 - charProgress;
    const offsetY = charProgress * (40 + Math.random() * 60);
    const offsetX = (Math.random() - 0.5) * charProgress * 30;
    const scale = 1 - charProgress * 0.5;

    if (alpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx + charW / 2 + offsetX, baseY + offsetY);
      ctx.scale(scale, scale);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(ch, -charW / 2, 0);
      ctx.restore();
    }

    // Particle dust effect
    if (charProgress > 0.1 && charProgress < 0.9) {
      const numParticles = 3;
      for (let p = 0; p < numParticles; p++) {
        const px = cx + charW / 2 + (Math.random() - 0.5) * 20;
        const py = baseY + offsetY + (Math.random() - 0.5) * 20;
        const pAlpha = (1 - charProgress) * 0.5;
        const pSize = (1 - charProgress) * 2;
        ctx.fillStyle = `rgba(255,255,255,${pAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    cx += charW;
  }

  ctx.globalAlpha = 1;
  ctx.textAlign = "start";
}

function drawWordFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  word: string,
  meaning: string,
  font: string,
  progress: number, // 0-1 for typewriter
  wordSplit: number = 0.5 // fraction of progress for word vs meaning
) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);

  // Subtle ambient
  const g = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, Math.min(w, h) * 0.5);
  g.addColorStop(0, "rgba(139,92,246,0.02)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  const vert = w < h;
  const wordSize = vert ? 64 : 72;
  const meaningSize = vert ? 22 : 24;

  // Word (italic, centered)
  const wordChars = Math.floor(word.length * Math.min(progress / wordSplit, 1));
  const visibleWord = word.substring(0, wordChars);

  ctx.font = `italic 700 ${wordSize}px "${font}", Georgia, serif`;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.textAlign = "center";
  ctx.fillText(visibleWord, w / 2, h * 0.42);

  // Cursor after word
  if (progress < wordSplit && wordChars < word.length) {
    const partialW = ctx.measureText(visibleWord).width;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(w / 2 + partialW / 2 + 4, h * 0.42 - wordSize + 8, 2, wordSize - 4);
  }

  // Meaning (appears after word is fully typed)
  if (progress > wordSplit) {
    const meaningProgress = (progress - wordSplit) / (1 - wordSplit);
    const meaningChars = Math.floor(meaning.length * meaningProgress);
    const visibleMeaning = meaning.substring(0, meaningChars);

    ctx.font = `300 ${meaningSize}px "${font}", Georgia, serif`;
    ctx.fillStyle = `rgba(180,180,180,${Math.min(meaningProgress * 2, 0.85)})`;
    ctx.textAlign = "center";

    // Word-wrap meaning
    const maxW = w * 0.7;
    const lines = wrapText(ctx, visibleMeaning, maxW);
    const lineH = meaningSize * 1.6;
    const startY = h * 0.42 + wordSize * 0.6;

    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * lineH);
    });

    // Cursor after meaning
    if (meaningChars < meaning.length) {
      const lastLine = lines[lines.length - 1] || "";
      const lastW = ctx.measureText(lastLine).width;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(
        w / 2 + lastW / 2 + 3,
        startY + (lines.length - 1) * lineH - meaningSize + 4,
        1.5,
        meaningSize - 4
      );
    }
  }

  // Decorative underline below word
  const underlineAlpha = Math.min(progress * 3, 0.15);
  ctx.strokeStyle = `rgba(255,255,255,${underlineAlpha})`;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.42 + 12);
  ctx.lineTo(w * 0.7, h * 0.42 + 12);
  ctx.stroke();

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
   Font Picker Modal
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

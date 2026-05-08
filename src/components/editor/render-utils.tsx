"use client";

import type { Narration } from "@/lib/narration";
import { createWebmBlob, createWebmRecorder, pickWebmMimeType } from "./shared/media-recorder";

/**
 * Stripped-down render function for the pipeline flow.
 * Re-implements the core rendering from create-video-panel as a standalone export.
 */

const aspectDimensions: Record<string, { width: number; height: number; maxVisibleLines: number; fontSize: number; maxCharsPerLine: number }> = {
  "9:16": { width: 720, height: 1280, maxVisibleLines: 24, fontSize: 26, maxCharsPerLine: 34 },
  "16:9": { width: 1280, height: 720, maxVisibleLines: 14, fontSize: 22, maxCharsPerLine: 65 },
};

export async function renderVideoBlobFromPipeline({
  title,
  language,
  aspectRatio,
  code,
  focusLines,
  watermarked,
  normalSpeed,
  focusSpeed,
  sound,
  soundVolume,
  narration,
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
  narration: Narration | null;
}): Promise<Blob> {
  if (typeof window === "undefined") throw new Error("Rendering is only available in the browser.");
  if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder not supported.");

  const preset = aspectDimensions[aspectRatio] ?? aspectDimensions["9:16"];
  const canvas = document.createElement("canvas");
  canvas.width = preset.width;
  canvas.height = preset.height;
  const ctxRaw = canvas.getContext("2d");
  if (!ctxRaw) throw new Error("Canvas 2D not available.");
  const ctx: CanvasRenderingContext2D = ctxRaw;

  const videoStream = canvas.captureStream(30);
  const audioCtx = typeof AudioContext !== "undefined" ? new AudioContext() : null;
  const audioDest = audioCtx ? audioCtx.createMediaStreamDestination() : null;
  const stream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...(audioDest ? audioDest.stream.getAudioTracks() : []),
  ]);

  const chunks: BlobPart[] = [];
  const mime = pickWebmMimeType();
  const recorder = createWebmRecorder(stream, mime ? { mimeType: mime } : {});
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const lines = code.split("\n").map((c, i) => ({ number: i + 1, content: c }));
  const focusSet = new Set(focusLines);
  const lineSchedule = buildSchedule(lines, focusSet, normalSpeed, focusSpeed);

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (audioCtx) void audioCtx.close();
      resolve(createWebmBlob(chunks, recorder.mimeType));
    };
  });

  recorder.start(250);
  if (audioCtx?.state === "suspended") await audioCtx.resume();

  // Schedule typing audio
  if (audioCtx && audioDest && sound !== "off" && Number(soundVolume) > 0) {
    scheduleKeyAudio(audioCtx, audioDest, lines, lineSchedule, sound, Number(soundVolume));
  }

  const t0 = performance.now();
  const dur = lineSchedule.totalMs;

  await new Promise<void>((resolve) => {
    function draw(now: number) {
      const elapsed = Math.min(now - t0, dur);
      const state = getState(elapsed, lines, lineSchedule, preset.maxCharsPerLine);
      const subtitle = narration ? findSubtitle(narration, state.activeLine) : null;

      paint(ctx, preset.width, preset.height, title, language, state.visible, state.activeLine, preset.maxVisibleLines, preset.fontSize, focusSet, watermarked, subtitle);

      if (elapsed < dur) {
        requestAnimationFrame(draw);
      } else {
        setTimeout(() => { recorder.stop(); resolve(); }, 500);
      }
    }
    requestAnimationFrame(draw);
  });

  return done;
}

// ——— helpers ———

function buildSchedule(lines: { number: number; content: string }[], focusSet: Set<number>, ns: string, fs: string) {
  const per = lines.map((l) => {
    const c = Math.max(l.content.length, 1);
    const m = Math.max(0.05, Number(focusSet.has(l.number) ? fs : ns) || 1);
    const mspc = focusSet.has(l.number) ? 150 : 110;
    const pad = focusSet.has(l.number) ? 280 : 160;
    return Math.round((c * mspc + pad) / m);
  });
  const totalMs = Math.max(3000, per.reduce((a, b) => a + b, 0));
  const cum: number[] = [];
  let r = 0;
  per.forEach((d) => { r += d; cum.push(r); });
  return { per, cum, totalMs };
}

function getState(elapsed: number, lines: { number: number; content: string }[], sched: { per: number[]; cum: number[] }, maxChars: number) {
  const idx = Math.max(0, (sched.cum.findIndex((v) => elapsed <= v) === -1 ? sched.cum.length : sched.cum.findIndex((v) => elapsed <= v) + 1) - 1);
  const prev = idx === 0 ? 0 : sched.cum[idx - 1] ?? 0;
  const dur = sched.per[idx] ?? 1;
  const prog = Math.min(1, Math.max(0, elapsed - prev) / dur);
  const active = lines[idx];

  const visible: { number: number; content: string; label: string; cont: boolean; fullLineContent: string; charOffset: number }[] = [];

  function addWrapped(lineContent: string, lineNum: number, limit?: number) {
    const text = limit !== undefined ? Array.from(lineContent).slice(0, limit).join("") : lineContent;
    const segs = wrap(text, maxChars);
    let offset = 0;
    segs.forEach((s, si) => {
      visible.push({
        number: lineNum,
        content: s,
        label: si === 0 ? String(lineNum).padStart(2, " ") : "  ",
        cont: si > 0,
        fullLineContent: lineContent,
        charOffset: offset,
      });
      offset += Array.from(s).length;
    });
  }

  lines.slice(0, idx).forEach((l) => addWrapped(l.content, l.number));
  if (active) {
    const chars = Math.max(1, Math.ceil(Array.from(active.content).length * prog));
    addWrapped(active.content, active.number, chars);
  }
  return { visible, activeLine: active?.number ?? 1 };
}

function wrap(c: string, max: number) {
  const chars = Array.from(c);
  if (chars.length <= max) return [c];
  const segs: string[] = [];
  let remChars = chars;
  while (remChars.length > max) {
    let cut = -1;
    // First try space within first `max` characters
    for (let i = max; i >= 0; i--) {
      if (remChars[i] === " ") { cut = i; break; }
    }
    // If no space or too early, try symbol boundaries
    if (cut <= Math.max(max * 0.3, 4)) {
      for (let i = max; i > Math.max(max * 0.3, 4); i--) {
        const ch = remChars[i];
        if (ch === "." || ch === "(" || ch === "," || ch === "[" || ch === "{" || ch === "=" || ch === ">" || ch === "|" || ch === "&" || ch === "+" || ch === "-") {
          cut = i;
          break;
        }
      }
    }
    if (cut <= Math.max(max * 0.3, 4)) cut = max;
    segs.push(remChars.slice(0, cut).join(""));
    remChars = remChars.slice(cut);
    if (remChars[0] === " ") {
      while (remChars.length > 0 && remChars[0] === " ") remChars = remChars.slice(1);
    }
  }
  if (remChars.length > 0) segs.push(remChars.join(""));
  return segs;
}

function findSubtitle(n: Narration, line: number) {
  for (const s of n.segments) if (line >= s.lineStart && line <= s.lineEnd) return s.text;
  return null;
}

function scheduleKeyAudio(ac: AudioContext, dest: MediaStreamAudioDestinationNode, lines: { number: number; content: string }[], sched: { per: number[] }, sound: string, vol: number) {
  let ms = 0;
  const start = ac.currentTime + 0.06;
  lines.forEach((line, li) => {
    const chars = Math.max(line.content.length, 1);
    const dur = sched.per[li] ?? 400;
    for (let i = 0; i < chars; i++) {
      const when = start + (ms + dur * ((i + 1) / (chars + 1))) / 1000;
      const ch = line.content[i] ?? "";
      const isWs = ch.trim().length === 0;
      const accent = i === chars - 1;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = sound === "typewriter" ? "square" : "triangle";
      osc.frequency.setValueAtTime(sound === "typewriter" ? (isWs ? 150 : accent ? 320 : 240) : (isWs ? 480 : accent ? 900 : 700), when);
      const pk = (sound === "typewriter" ? (accent ? 0.12 : 0.08) : (accent ? 0.07 : 0.045)) * vol * (isWs ? 0.45 : 1);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(pk, when + 0.0015);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.014);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(when);
      osc.stop(when + 0.018);
    }
    ms += dur;
  });
}

function paint(
  ctx: CanvasRenderingContext2D, w: number, h: number, title: string, lang: string,
  vis: { number: number; content: string; label: string; cont: boolean; fullLineContent?: string; charOffset?: number }[],
  activeLine: number, maxVis: number, fontSize: number, focusSet: Set<number>,
  watermarked: boolean, subtitle: string | null
) {
  ctx.clearRect(0, 0, w, h);
  const vert = w < h;

  // Rich dark background
  const bg = ctx.createLinearGradient(0, 0, w * 0.4, h);
  bg.addColorStop(0, "#0f1318"); bg.addColorStop(0.4, "#0c1015"); bg.addColorStop(1, "#090d12");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  // Dot grid texture
  ctx.fillStyle = "rgba(255,255,255,0.012)";
  for (let dx = 20; dx < w; dx += 24) for (let dy = 20; dy < h; dy += 24) { ctx.beginPath(); ctx.arc(dx, dy, 0.8, 0, Math.PI * 2); ctx.fill(); }

  // Ambient glows
  const g1 = ctx.createRadialGradient(w * 0.2, h * 0.12, 0, w * 0.2, h * 0.12, Math.min(w, h) * 0.35);
  g1.addColorStop(0, "rgba(56,189,248,0.04)"); g1.addColorStop(1, "rgba(56,189,248,0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h);
  const g2 = ctx.createRadialGradient(w * 0.85, h * 0.75, 0, w * 0.85, h * 0.75, Math.min(w, h) * 0.25);
  g2.addColorStop(0, "rgba(139,92,246,0.03)"); g2.addColorStop(1, "rgba(139,92,246,0)");
  ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);

  const fw = vert ? w * 0.94 : w * 0.88;
  const fh = vert ? h - 300 : h * 0.86;
  const fx = (w - fw) / 2;
  const fy = vert ? 120 : (h - fh) / 2;

  // Outer glow
  ctx.shadowColor = "rgba(56,189,248,0.05)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 0;
  rr(ctx, fx - 2, fy - 2, fw + 4, fh + 4, 16);
  ctx.strokeStyle = "rgba(56,189,248,0.06)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

  // Frame shadow
  ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  rr(ctx, fx, fy, fw, fh, 12);
  ctx.fillStyle = "#0d1117"; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Frame border
  rr(ctx, fx, fy, fw, fh, 12);
  ctx.strokeStyle = "rgba(48,54,64,0.6)"; ctx.lineWidth = 1; ctx.stroke();

  // Title bar
  const tbH = vert ? 40 : 44;
  ctx.save();
  rr(ctx, fx, fy, fw, tbH, 12); ctx.clip();
  const tb = ctx.createLinearGradient(fx, fy, fx, fy + tbH);
  tb.addColorStop(0, "#161b22"); tb.addColorStop(1, "#12161d");
  ctx.fillStyle = tb; ctx.fillRect(fx, fy, fw, tbH);
  ctx.restore();
  ctx.strokeStyle = "rgba(48,54,64,0.45)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(fx, fy + tbH); ctx.lineTo(fx + fw, fy + tbH); ctx.stroke();

  // Traffic lights
  const dotR = vert ? 4.5 : 5.5;
  const dotGap = vert ? 16 : 20;
  [["#ff5f57","#e0443e"],["#febc2e","#dea123"],["#28c840","#1aab29"]].forEach(([c, g], i) => {
    const cx = fx + 16 + i * dotGap; const cy = fy + tbH / 2;
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, dotR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy + 0.3, dotR - 1, 0, Math.PI * 2); ctx.fill();
  });

  // File tab
  ctx.font = `500 ${vert ? 11 : 12}px ui-sans-serif,system-ui`;
  const tabX = fx + (vert ? 64 : 88);
  const tabW = Math.min(ctx.measureText(title).width + 32, fw * 0.45);
  ctx.fillStyle = "#0d1117";
  rr(ctx, tabX, fy + 4, tabW, tbH - 4, 8); ctx.fill();
  ctx.fillStyle = "rgba(56,189,248,0.6)";
  ctx.fillRect(tabX + 6, fy + 4, tabW - 12, 2);
  ctx.fillStyle = "#e6edf3";
  ctx.fillText(title, tabX + 12, fy + tbH / 2 + 4);

  // Language badge
  ctx.font = `500 ${vert ? 9 : 10}px ui-sans-serif,system-ui`;
  const langTxt = lang.toUpperCase();
  const lw = ctx.measureText(langTxt).width + 12;
  ctx.fillStyle = "rgba(56,189,248,0.1)";
  rr(ctx, fx + fw - lw - 10, fy + tbH / 2 - 8, lw, 16, 4); ctx.fill();
  ctx.fillStyle = "rgba(56,189,248,0.65)";
  ctx.fillText(langTxt, fx + fw - lw - 4, fy + tbH / 2 + 3);

  // Activity bar — only on landscape
  const abW = vert ? 0 : 32;
  if (!vert) {
    ctx.fillStyle = "rgba(13,17,23,0.5)";
    ctx.fillRect(fx, fy + tbH, abW, fh - tbH);
    ctx.strokeStyle = "rgba(48,54,64,0.3)"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(fx + abW, fy + tbH); ctx.lineTo(fx + abW, fy + fh); ctx.stroke();
    [0.2, 0.32, 0.44, 0.56].forEach((r) => {
      const iy = fy + tbH + (fh - 60) * r;
      ctx.fillStyle = "rgba(100,116,139,0.2)";
      rr(ctx, fx + 8, iy, 16, 16, 3); ctx.fill();
    });
  }

  // Line gutter
  const gutterW = vert ? 36 : 42;
  const gutterX = fx + abW;
  ctx.fillStyle = "rgba(13,17,23,0.3)";
  ctx.fillRect(gutterX, fy + tbH, gutterW, fh - tbH);
  ctx.strokeStyle = "rgba(48,54,64,0.25)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(gutterX + gutterW, fy + tbH); ctx.lineTo(gutterX + gutterW, fy + fh); ctx.stroke();

  // Code area (clipped)
  const codeLeft = gutterX + gutterW + 10;
  const codeRight = fx + fw - 16;
  const codeMaxW = codeRight - codeLeft;

  ctx.save();
  ctx.beginPath();
  ctx.rect(fx, fy + tbH, fw, fh - tbH - 24);
  ctx.clip();

  const lh = fontSize * 1.5;
  const si = Math.max(0, vis.length - maxVis);
  const vp = vis.slice(si);
  let y = fy + tbH + 10 + fontSize;

  vp.forEach((line) => {
    const isA = line.number === activeLine;
    const isF = focusSet.has(line.number);

    if (isA || isF) {
      ctx.fillStyle = isA ? "rgba(56,189,248,0.06)" : "rgba(255,255,255,0.02)";
      ctx.fillRect(gutterX, y - lh + 6, fx + fw - gutterX, lh);
      if (isA) {
        ctx.fillStyle = "rgba(56,189,248,0.45)";
        ctx.fillRect(gutterX + gutterW, y - lh + 6, 2, lh);
      }
    }

    // Line number
    ctx.fillStyle = line.cont ? "rgba(100,116,139,0.25)" : (isA ? "rgba(56,189,248,0.55)" : "rgba(100,116,139,0.4)");
    ctx.font = `${fontSize - 4}px ui-monospace,SFMono-Regular,monospace`;
    ctx.textAlign = "right";
    ctx.fillText(line.label, gutterX + gutterW - 6, y);
    ctx.textAlign = "start";

    if (line.cont) {
      ctx.fillStyle = "rgba(56,189,248,0.3)";
      ctx.font = `${fontSize - 6}px ui-monospace,SFMono-Regular,monospace`;
      ctx.textAlign = "right";
      ctx.fillText("\u21B3", gutterX + gutterW - 6, y);
      ctx.textAlign = "start";
    }

    drawCodeColored(ctx, line.fullLineContent ?? line.content, line.charOffset ?? 0, Array.from(line.content).length, codeLeft, y, fontSize, codeMaxW);

    y += lh;
  });
  ctx.restore();

  // Status bar
  const sbH = 24;
  ctx.fillStyle = "#161b22";
  ctx.fillRect(fx, fy + fh - sbH, fw, sbH);
  ctx.strokeStyle = "rgba(48,54,64,0.35)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(fx, fy + fh - sbH); ctx.lineTo(fx + fw, fy + fh - sbH); ctx.stroke();
  ctx.fillStyle = "rgba(56,189,248,0.6)"; rr(ctx, fx + 4, fy + fh - sbH + 4, 14, 14, 3); ctx.fill();
  ctx.fillStyle = "#0d1117"; ctx.font = "bold 8px ui-monospace"; ctx.fillText("><", fx + 5.5, fy + fh - 7);
  ctx.fillStyle = "rgba(148,163,184,0.45)";
  ctx.font = `500 ${vert ? 8 : 10}px ui-sans-serif,system-ui`;
  ctx.fillText(`Ln ${activeLine}`, fx + 24, fy + fh - 7);
  if (!vert) {
    ctx.fillText("Spaces: 2", fx + 80, fy + fh - 7);
    ctx.fillText(lang, fx + fw - 100, fy + fh - 7);
  }
  ctx.fillText("UTF-8", fx + fw - 42, fy + fh - 7);

  if (watermarked) {
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.font = "600 11px ui-sans-serif,system-ui";
    ctx.textAlign = "center";
    ctx.fillText("CodeCinematic", w / 2, fy + fh + 20);
    ctx.textAlign = "start";
  }

  if (subtitle) {
    const sf = vert ? 14 : 13;
    const sy = vert ? h - 60 : h - 24;
    const mw = w - 60;
    ctx.font = `500 ${sf}px ui-sans-serif,system-ui`;
    const tw = Math.min(ctx.measureText(subtitle).width, mw);
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    rr(ctx, (w - tw) / 2 - 14, sy - sf - 5, tw + 28, sf + 14, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 0.5;
    rr(ctx, (w - tw) / 2 - 14, sy - sf - 5, tw + 28, sf + 14, 8); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textAlign = "center";
    ctx.fillText(subtitle, w / 2, sy, mw);
    ctx.textAlign = "start";
  }
}

/** Draw code with syntax coloring, starting from charOffset into the full line. */
function drawCodeColored(
  ctx: CanvasRenderingContext2D, fullLine: string, charOffset: number, charCount: number,
  x: number, y: number, fs: number, maxW: number
) {
  ctx.font = `${fs}px ui-monospace,SFMono-Regular,monospace`;
  // Tokenize the full line to get proper colors
  const tokens = tokenize(fullLine);
  let charIdx = 0;
  let cx = x;
  for (const t of tokens) {
    const codePoints = Array.from(t.text);
    for (const cp of codePoints) {
      if (charIdx >= charOffset && charIdx < charOffset + charCount) {
        ctx.fillStyle = t.color;
        ctx.fillText(cp, cx, y);
        cx += ctx.measureText(cp).width;
      }
      charIdx++;
    }
  }
}

function tokenize(line: string) {
  if (line.trim().startsWith("//") || line.trim().startsWith("#") || line.trim().startsWith("/*") || line.trim().startsWith("*")) return [{ text: line, color: "#67e8f9" }];
  const pats: [RegExp, string][] = [
    [/^(".*?"|'.*?'|`.*?`)/, "#fda4af"],
    [/^(import|export|from|default|type|interface|enum|implements|extends|public|private|protected|static|readonly|abstract|declare|namespace|module)\b/, "#c084fc"],
    [/^(const|let|var|function|return|async|await|class|new|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|typeof|instanceof|in|of|void|delete|yield|super|this|null|undefined|true|false|console|map|filter|reduce|forEach|find|includes|push|pop|shift|length|log|warn|error|debug|info)\b/, "#7dd3fc"],
    [/^(\d+(\.\d+)?)/, "#facc15"],
    [/^([{}()[\]])/, "#c084fc"],
    [/^([.,:;])/, "#94a3b8"],
    [/^(=>|===|!==|==|!=|>=|<=|&&|\|\||\?\?|\+\+|--|\+=|-=|\*=|\/=|\+|-|\*|\/|%|!|<|>|=|&|\||\?|:)/, "#f97316"],
    [/^([A-Z][a-zA-Z0-9]*)/, "#4ade80"],
    [/^([a-z_$][a-zA-Z0-9_$]*)/, "#e6edf3"],
  ];
  const toks: { text: string; color: string }[] = [];
  let rem = line;
  while (rem.length > 0) {
    let matched = false;
    for (const [re, col] of pats) { const m = rem.match(re); if (m) { toks.push({ text: m[0], color: col }); rem = rem.slice(m[0].length); matched = true; break; } }
    if (!matched) { const ch = rem.match(/^./u)?.[0] ?? rem[0]; toks.push({ text: ch, color: "#e6edf3" }); rem = rem.slice(ch.length); }
  }
  return toks;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

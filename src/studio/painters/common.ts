export const THEME = {
  bgTop: "#0f1318",
  bgMid: "#0c1015",
  bgBottom: "#090d12",
  panel: "#0d1117",
  panelBorder: "rgba(48,54,64,0.6)",
  accent: "#38bdf8",
  accentSoft: "rgba(56,189,248,0.14)",
  accentGlow: "rgba(56,189,248,0.45)",
  secondary: "#8b5cf6",
  text: "#e6edf3",
  textDim: "#94a3b8",
  textFaint: "rgba(148,163,184,0.45)",
  good: "#4ade80",
  warn: "#facc15",
} as const;

export const FONT_SANS = "-apple-system, 'SF Pro Display', 'Segoe UI', Roboto, ui-sans-serif, sans-serif";
export const FONT_MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";

/** #rrggbb -> rgba(r,g,b,a). Lets one accent hex drive every derived glow/tint. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * Per-subject accent set. `accent` (hex) and `secondary` (hex) are the two
 * brand colours; the derived rgba strings replace what used to be hard-coded
 * sky-blue everywhere so History reads amber, Finance green, etc.
 */
export type Palette = {
  accent: string;
  accentSoft: string;
  accentGlow: string;
  secondary: string;
  secondaryGlow: string;
  bgGlow: string;
  bgGlow2: string;
};

export function makePalette(accent: string, secondary: string): Palette {
  return {
    accent,
    accentSoft: rgba(accent, 0.14),
    accentGlow: rgba(accent, 0.45),
    secondary,
    secondaryGlow: rgba(secondary, 0.45),
    bgGlow: rgba(accent, 0.05),
    bgGlow2: rgba(secondary, 0.04),
  };
}

export const DEFAULT_PALETTE = makePalette("#38bdf8", "#8b5cf6");

/** Keyed by the subject LABEL stored in the script (see content/subjects.json). */
const SUBJECT_PALETTES: Record<string, Palette> = {
  Coding: DEFAULT_PALETTE,
  History: makePalette("#f59e0b", "#ef4444"),
  Geography: makePalette("#34d399", "#22d3ee"),
  "Math & Aptitude": makePalette("#818cf8", "#f472b6"),
  Science: makePalette("#22d3ee", "#a3e635"),
  "Money & Finance": makePalette("#4ade80", "#fbbf24"),
  "English & Communication": makePalette("#a78bfa", "#38bdf8"),
  "GK & Amazing Facts": makePalette("#fb923c", "#c084fc"),
  "Psychology & the Mind": makePalette("#ec4899", "#8b5cf6"),
  "Business & Startups": makePalette("#fbbf24", "#f87171"),
  "Health & Body": makePalette("#2dd4bf", "#fb7185"),
  "Philosophy & Big Ideas": makePalette("#60a5fa", "#c084fc"),
  "Life Skills & Productivity": makePalette("#a3e635", "#22d3ee"),
  "Mythology & Epics": makePalette("#f43f5e", "#fbbf24"),
  "Polity & Governance": makePalette("#f97316", "#38bdf8"),
  "Mindset & Self-Growth": makePalette("#e879f9", "#34d399"),
  Economy: makePalette("#10b981", "#f59e0b"),
  "Environment & Ecology": makePalette("#22c55e", "#14b8a6"),
  "Art & Culture": makePalette("#e11d48", "#f59e0b"),
};

export function paletteForSubject(subjectLabel: string): Palette {
  return SUBJECT_PALETTES[subjectLabel] ?? DEFAULT_PALETTE;
}

/** Deterministic djb2 hash — same script must render identically across runs. */
export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable pick of one of n variants for a scene/video id. */
export function variantOf(id: string, n: number): number {
  return hashStr(id) % n;
}

export const BG_MOTIFS = 4;

export type Layout = {
  w: number;
  h: number;
  vertical: boolean;
  margin: number;
  contentX: number;
  contentY: number;
  contentW: number;
  contentH: number;
  /** Base unit: all font sizes/paddings scale from this so 9:16 and 16:9 both look right. */
  unit: number;
};

export function makeLayout(w: number, h: number): Layout {
  const vertical = h > w;
  const unit = Math.min(w, h) / 24;
  const margin = unit * 1.4;
  const topBand = vertical ? unit * 4 : unit * 2.4;
  const bottomBand = vertical ? unit * 3 : unit * 1.6;
  return {
    w,
    h,
    vertical,
    margin,
    unit,
    contentX: margin,
    contentY: topBand,
    contentW: w - margin * 2,
    contentH: h - topBand - bottomBand,
  };
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Progress of a sub-animation that starts at `from` and lasts `len` within scene progress p (all 0-1). */
export function sub(p: number, from: number, len: number): number {
  return clamp01((p - from) / len);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tMs = 0,
  palette: Palette = DEFAULT_PALETTE,
  motif = 0
) {
  const bg = ctx.createLinearGradient(0, 0, w * 0.4, h);
  bg.addColorStop(0, THEME.bgTop);
  bg.addColorStop(0.4, THEME.bgMid);
  bg.addColorStop(1, THEME.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // One texture motif per video (seeded from the script) so videos differ.
  if (motif === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.012)";
    const step = 24;
    for (let dx = 20; dx < w; dx += step)
      for (let dy = 20; dy < h; dy += step) {
        ctx.beginPath();
        ctx.arc(dx, dy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
  } else if (motif === 1) {
    ctx.strokeStyle = "rgba(255,255,255,0.014)";
    ctx.lineWidth = 1;
    const gap = 56;
    for (let x = -h; x < w + h; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }
  } else if (motif === 2) {
    ctx.strokeStyle = rgba(palette.accent, 0.03);
    ctx.lineWidth = 1.5;
    const cx = w * 0.86;
    const cy = h * 0.12;
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, i * Math.min(w, h) * 0.14, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    for (let i = 0; i < 34; i++) {
      const px = ((i * 197) % 997) / 997;
      const py = ((i * 431) % 991) / 991;
      const drift = Math.sin(tMs / 6000 + i * 1.7) * 8;
      ctx.beginPath();
      ctx.arc(px * w, py * h + drift, i % 3 === 0 ? 1.6 : 1.0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const c1x = w * (0.2 + 0.04 * Math.sin(tMs / 9000));
  const c1y = h * (0.12 + 0.03 * Math.cos(tMs / 11000));
  const g1 = ctx.createRadialGradient(c1x, c1y, 0, c1x, c1y, Math.min(w, h) * 0.4);
  g1.addColorStop(0, palette.bgGlow);
  g1.addColorStop(1, rgba(palette.accent, 0));
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);
  const c2x = w * (0.85 + 0.03 * Math.cos(tMs / 13000));
  const c2y = h * (0.8 + 0.03 * Math.sin(tMs / 10000));
  const g2 = ctx.createRadialGradient(c2x, c2y, 0, c2x, c2y, Math.min(w, h) * 0.3);
  g2.addColorStop(0, palette.bgGlow2);
  g2.addColorStop(1, rgba(palette.secondary, 0));
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
}

/** Safe beat window k, falling back to an even split when timings are missing. */
export function beatWindow(beats: { start: number; end: number }[], k: number, total: number): { start: number; end: number } {
  const win = beats[k];
  if (win) return win;
  const n = Math.max(total, 1);
  return { start: 0.08 + (0.84 * k) / n, end: 0.08 + (0.84 * (k + 1)) / n };
}

/** 0-1 progress within beat k. */
export function beatT(beats: { start: number; end: number }[], k: number, total: number, p: number): number {
  const { start, end } = beatWindow(beats, k, total);
  return clamp01((p - start) / Math.max(end - start, 0.001));
}

/** Index of the beat containing p, or total-1 after the last beat, or -1 before the first. */
export function activeBeatIndex(beats: { start: number; end: number }[], total: number, p: number): number {
  let active = -1;
  for (let k = 0; k < total; k++) {
    if (p >= beatWindow(beats, k, total).start) active = k;
  }
  return active;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxW || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest font size in [minPx, startPx] that fits `text` within maxW on one line. */
export function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { maxW: number; startPx: number; minPx: number; weight?: number; family?: string }
): number {
  const { maxW, startPx, minPx, weight = 800, family = FONT_SANS } = opts;
  for (let px = startPx; px >= minPx; px -= 2) {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxW) return px;
  }
  return minPx;
}

/**
 * Scene title that can never overflow the frame: shrinks to fit one line,
 * falls back to a two-line wrap, draws the accent underline, and returns the
 * band height consumed below contentY so painters can lay out beneath it.
 */
export function drawSceneTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  layout: Layout,
  p: number,
  accent: string,
  opts: { centered?: boolean } = {}
): number {
  const { unit, contentX, contentY, contentW, w } = layout;
  const titleIn = easeOutCubic(sub(p, 0, 0.12));
  ctx.save();
  ctx.globalAlpha = titleIn;
  let px = fitFontSize(ctx, text, { maxW: contentW, startPx: unit * 1.5, minPx: unit * 1.05, weight: 800 });
  ctx.font = `800 ${px}px ${FONT_SANS}`;
  let lines = [text];
  if (ctx.measureText(text).width > contentW) {
    px = unit * 0.95;
    ctx.font = `800 ${px}px ${FONT_SANS}`;
    lines = wrapText(ctx, text, contentW).slice(0, 2);
  }
  const lineH = px * 1.22;
  const x = opts.centered ? w / 2 : contentX;
  if (opts.centered) ctx.textAlign = "center";
  ctx.fillStyle = THEME.text;
  lines.forEach((line, i) => ctx.fillText(line, x, contentY + px + i * lineH));
  const lastBaseline = contentY + px + (lines.length - 1) * lineH;
  ctx.fillStyle = accent;
  const underW = unit * 3 * titleIn;
  ctx.fillRect(opts.centered ? w / 2 - underW / 2 : contentX, lastBaseline + unit * 0.45, underW, unit * 0.2);
  ctx.textAlign = "start";
  ctx.restore();
  return lastBaseline + unit * 1.1 - contentY;
}

export function drawArrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.55);
  ctx.lineTo(-size, size * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Stroke a polyline partially (0-1), for draw-on arrow animation. */
export function strokePolylineProgress(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], progress: number) {
  if (pts.length < 2 || progress <= 0) return { x: pts[0].x, y: pts[0].y, angle: 0, done: false };
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segLens.push(len);
    total += len;
  }
  let remaining = total * clamp01(progress);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  let tip = { x: pts[0].x, y: pts[0].y, angle: 0, done: progress >= 1 };
  for (let i = 1; i < pts.length; i++) {
    const len = segLens[i - 1];
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    if (remaining >= len) {
      ctx.lineTo(pts[i].x, pts[i].y);
      remaining -= len;
      tip = { x: pts[i].x, y: pts[i].y, angle: Math.atan2(dy, dx), done: tip.done };
    } else {
      const f = len === 0 ? 0 : remaining / len;
      const px = pts[i - 1].x + dx * f;
      const py = pts[i - 1].y + dy * f;
      ctx.lineTo(px, py);
      tip = { x: px, y: py, angle: Math.atan2(dy, dx), done: tip.done };
      break;
    }
  }
  ctx.stroke();
  return tip;
}

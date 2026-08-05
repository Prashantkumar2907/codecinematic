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
  // 0.45 composited to 2.4:1 on the background — below the 4.5:1 floor and gone
  // entirely after VP9 compression at phone size. 0.76 measures 4.67:1 while
  // staying clearly subordinate to textDim's 7.4:1.
  textFaint: "rgba(148,163,184,0.76)",
  good: "#4ade80",
  warn: "#facc15",
  /**
   * The third semantic state. `good` and `warn` existed and this did not, so 17
   * painters hardcoded a red of their own and 12 of them re-typed this exact
   * value — the palette gap was the cause, not carelessness. The one in this
   * file's `SUBJECT_PALETTES` is a Business & Startups accent, not a semantic
   * token, so it could not be reused.
   */
  danger: "#f87171",
} as const;

export const FONT_SANS = "'Plus Jakarta Sans', -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, ui-sans-serif, sans-serif";
export const FONT_MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace";

/** #rrggbb -> rgba(r,g,b,a). Lets one accent hex drive every derived glow/tint. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Lighten (amt>0 toward white) or darken (amt<0 toward black) a #rrggbb.
 *  Used to shade the lit/shadowed faces of pseudo-3D boxes so a single accent
 *  hex yields a consistent top/front/side family. */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amt < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amt));
  const mix = (c: number) => Math.round((target - c) * p + c);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/**
 * Pseudo-3D extruded rounded box: a front face plus a lit top bevel and a
 * shadowed right bevel, giving Canvas shapes real depth (the ByteByteGo look)
 * without WebGL. `depth` is the extrusion offset in px; faces are shaded from
 * `face`. Draw order is back→front so it composites correctly.
 */
export function isoBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  depth: number,
  face: string,
  r = Math.min(w, h) * 0.12
) {
  // Right (shadow) face.
  ctx.beginPath();
  ctx.moveTo(x + w, y + r);
  ctx.lineTo(x + w + depth, y + r + depth * 0.5);
  ctx.lineTo(x + w + depth, y + h - r + depth * 0.5);
  ctx.lineTo(x + w, y + h - r);
  ctx.closePath();
  ctx.fillStyle = shade(face, -0.42);
  ctx.fill();
  // Top (lit) face.
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.lineTo(x + w - r + depth, y + depth * 0.5);
  ctx.lineTo(x + r + depth, y + depth * 0.5);
  ctx.closePath();
  ctx.fillStyle = shade(face, 0.22);
  ctx.fill();
  // Front face with a soft vertical gradient.
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(face, 0.08));
  g.addColorStop(1, shade(face, -0.16));
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
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
  // The only accent below the 4.5:1 floor: #e11d48 measured 4.06:1 as text and
  // 4.09:1 behind a boxed caption. #ef4444 is 5.07:1 and moves away from
  // Mythology's #f43f5e rather than onto it. Every other palette already passes.
  "Art & Culture": makePalette("#ef4444", "#f59e0b"),
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
  /**
   * Lowest y a painter may draw to without colliding with the burned-in caption.
   *
   * The Shorts safe-area clamp is currently re-derived in 23 painters under 4
   * different names with 3 different values (0.75, 0.86, 0.88, 0.94), and the
   * clamp expression is byte-identical across 13 of them. Four of the five
   * genuine edge-bleed failures in `qa/AUDIT.md` are this class.
   *
   * Caption-aware on purpose: captions default ON since row 2.2, and the karaoke
   * block was confirmed landing on top of `mythfact`'s FACT card in a rendered
   * 9:16 demo because no painter reserved the band. The values track the engine's
   * own caption geometry (`engine.ts:544`: `h*0.7` short, `h*0.82` long).
   */
  safeBottom: number;
  /** Height from `contentY` down to `safeBottom`. */
  safeH: number;
};

export function makeLayout(w: number, h: number): Layout {
  const vertical = h > w;
  const unit = Math.min(w, h) / 24;
  const margin = unit * 1.4;
  const topBand = vertical ? unit * 4 : unit * 2.4;
  const bottomBand = vertical ? unit * 3 : unit * 1.6;
  // Reserve the caption band, plus a small gap so a descender never touches it.
  const captionTop = (vertical ? h * 0.7 : h * 0.82) - unit * 0.5;
  const safeBottom = Math.min(h - bottomBand, captionTop);
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
    safeBottom,
    safeH: safeBottom - topBand,
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

/**
 * Clamp into `[lo, hi]`, collapsing to the midpoint when the range is inverted.
 *
 * Containment is rubric axis 1 and the range inverts exactly when a caller's
 * element is wider than the box it must sit in — returning the midpoint keeps it
 * centred and symmetrically overflowing instead of jammed against one edge,
 * which is the readable failure. Callers that must not overflow at all cap the
 * size against the box first and then clamp the position.
 */
export const clampRange = (v: number, lo: number, hi: number) =>
  hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));

/* ─────────────────────────── motion vocabulary ───────────────────────────────
 * Phase 9 of improvement_plan.md: `painters/` is ~40,000 lines and its shared
 * layer held THREE easing curves, so every painter invented its own timing,
 * radius, stroke and stagger. These are the shared words. They are additions
 * only — no painter changes with them — so adopting one is a per-painter
 * decision made in that painter's own polish commit.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Damped elastic settle. Was private to `bigtext.ts` and used by zero other
 * painters despite being the nicest curve in the tree; promoted verbatim so the
 * overshoot reads the same wherever it is used.
 */
export const easeSpring = (t: number): number => {
  const c4 = (2 * Math.PI) / 2.2;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -8 * t) * Math.sin((t * 8 - 0.75) * c4) + 1;
};

/**
 * Pulls genuinely BACKWARD before moving forward — the return value goes
 * negative over the first `leadIn` of the curve, so a caller mapping it onto a
 * position sees the element wind up before it travels. Only `domino_cascade.ts`
 * does anticipation today, hand-rolled; without it every entrance starts from
 * rest and reads mechanical.
 *
 * Callers that cannot accept a negative (opacity, scale) should clamp01 it.
 */
export const anticipate = (t: number, amount = 0.12, leadIn = 0.3): number => {
  const k = clamp01(t);
  if (k <= 0) return 0;
  if (k < leadIn) return -amount * Math.sin(Math.PI * (k / leadIn));
  return easeOutCubic((k - leadIn) / (1 - leadIn));
};

export const easeInOutQuint = (t: number) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

/** Linear interpolation. Was privately redefined in 6 painters with 3 signatures. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Interpolate between two `#rrggbb` colours.
 *
 * There was no colour interpolation anywhere in the tree, and `qa/LEDGER.md`
 * records the same "hard colour pop" bug being found and hand-fixed twice
 * (bigtext, mythfact). Interpolating in sRGB is not perceptually ideal, but it
 * is what the palette values already are and it removes the pop.
 */
export function lerpColor(from: string, to: string, t: number): string {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const k = clamp01(t);
  const mix = (shift: number) =>
    Math.round(lerp((a >> shift) & 255, (b >> shift) & 255, k));
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

/**
 * Per-index entrance delay in ms, for revealing siblings in sequence.
 *
 * The only stagger primitive was `enterT`'s third argument, hand-computed at
 * every call site — 12 distinct per-index increments across 36 painters, plus
 * six painters that re-invented a named constant for it. The other 74 do not
 * stagger siblings at all.
 */
export function stagger(
  i: number,
  n: number,
  stepMs = DUR.step,
  direction: "in" | "out" | "center" = "in"
): number {
  if (n <= 1) return 0;
  const idx =
    direction === "in" ? i
    : direction === "out" ? n - 1 - i
    : Math.abs(i - (n - 1) / 2);
  return idx * stepMs;
}

/**
 * Departure progress: 1 → 0 over the last `durMs` of the scene.
 *
 * The string "exit" appears in ZERO painters. Everything accumulates and holds,
 * and departure is delegated entirely to the engine's 420 ms crossfade — which
 * is why scenes feel like they pile up rather than resolve.
 */
export function exitT(env: { elapsedMs: number; durationMs?: number }, durMs = DUR.base): number {
  const total = env.durationMs ?? 0;
  if (!(total > 0)) return 1;
  return 1 - clamp01((env.elapsedMs - (total - durMs)) / Math.max(1, durMs));
}

/**
 * Design scales. 314 `enterT` calls used 20 distinct durations; the same card
 * corner was written 25 different ways (`unit*0.7` in one painter against
 * `unit*0.35` in another, a 2× difference inside one frame).
 *
 * RADIUS and STROKE are multiples of `unit`, never absolute px — a painter has
 * to work at both 1080×1920 and 1920×1080, and 41 raw `lineWidth = 1` sites
 * violate that rule today (two of them inside this very file).
 */
export const DUR = { fast: 220, base: 380, slow: 620, step: 70 } as const;
export const RADIUS = { sm: 0.18, md: 0.3, lg: 0.5 } as const;
export const STROKE = { hair: 0.02, thin: 0.035, base: 0.055, bold: 0.09 } as const;
export const GLOW = { none: 0, soft: 0.5, base: 1.1, strong: 2.2 } as const;

/** Progress of a sub-animation that starts at `from` and lasts `len` within scene progress p (all 0-1). */
export function sub(p: number, from: number, len: number): number {
  return clamp01((p - from) / len);
}

/**
 * Absolute-time ENTRANCE progress: 0→1 over `durMs`, starting `delayMs` into the
 * scene. Use this (not sub(env.p, …)) for panel/title/frame entrances so content
 * is on screen within a fixed few-hundred ms regardless of scene length — a
 * scene-fraction entrance on a 40s scene leaves the viewer staring at emptiness
 * while the first beat's narration already plays.
 */
export function enterT(env: { elapsedMs: number }, durMs = 380, delayMs = 0): number {
  return clamp01((env.elapsedMs - delayMs) / Math.max(1, durMs));
}

/**
 * Duration-AWARE reveal: 0→1 across the window `[from, to]` expressed as fractions
 * of the scene's own length.
 *
 * `enterT` is absolute by design, so content lands within a few hundred ms however
 * long the scene runs — right for a panel frame, and exactly why a single-beat card
 * is finished animating 400 ms in and then holds for another eleven seconds. Stage
 * the *secondary* parts of a card with this instead, so a 12 s card still has
 * something arriving at second six.
 *
 * Falls back to `enterT` when the painter has no duration (the QA probe drives some
 * kinds without one), so a missing duration degrades to the old behaviour rather
 * than dividing by zero.
 */
export function revealT(
  env: { elapsedMs: number; durationMs?: number },
  from: number,
  to: number,
  minMs = 260
): number {
  const dur = env.durationMs ?? 0;
  if (!(dur > 0)) return enterT(env, Math.max(minMs, (to - from) * 1000));
  const startMs = from * dur;
  const spanMs = Math.max(minMs, (to - from) * dur);
  return clamp01((env.elapsedMs - startMs) / spanMs);
}

/** Gentle deterministic 0-1 oscillator for idle "life" after reveal (breathing
 *  glow, soft bob). Same elapsedMs → same value, so re-renders are identical. */
export function idle(env: { elapsedMs: number }, periodMs = 2400, phase = 0): number {
  return 0.5 + 0.5 * Math.sin((env.elapsedMs / periodMs) * Math.PI * 2 + phase);
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

/** How long a scene title takes to arrive, for every painter. */
export const TITLE_IN_MS = 420;

/**
 * Scene title that can never overflow the frame: shrinks to fit one line,
 * falls back to a two-line wrap, draws the accent underline, and returns the
 * band height consumed below contentY so painters can lay out beneath it.
 *
 * Timing is absolute and owned here. It used to take scene progress and fade
 * over `sub(p, 0, 0.12)` — 3.6 s on a 30 s scene — so 70 of 94 call sites hand-
 * rolled `Math.max(env.p, enterT(env, 420) * 0.12)` to cancel it out, 11 passed
 * `enterT(env, …)` straight in (a ~45 ms pop) and 11 still wore the slow fade.
 */
export function drawSceneTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  layout: Layout,
  env: { elapsedMs: number },
  accent: string,
  opts: { centered?: boolean } = {}
): number {
  const { unit, contentX, contentY, contentW, w } = layout;
  const titleIn = easeOutCubic(enterT(env, TITLE_IN_MS));
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

/** Point at fraction f (0-1) along a polyline, by cumulative segment length. */
export function pointAlongPolyline(pts: { x: number; y: number }[], f: number): { x: number; y: number } {
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segLens.push(len);
    total += len;
  }
  let target = clamp01(f) * total;
  for (let i = 1; i < pts.length; i++) {
    const len = segLens[i - 1];
    if (target <= len || i === pts.length - 1) {
      const r = len === 0 ? 0 : target / len;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * r, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * r };
    }
    target -= len;
  }
  return pts[pts.length - 1];
}

/** Insert rounded corners at each interior vertex of a polyline (quadratic
 *  fillet), returning a denser polyline. Reusable for elbow connectors and any
 *  right-angle routing that should read as ByteByteGo-clean, not sharp. */
export function roundedCorners(pts: { x: number; y: number }[], r: number, seg = 6): { x: number; y: number }[] {
  if (pts.length < 3) return pts.slice();
  const out: { x: number; y: number }[] = [pts[0]];
  const unit = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const da = Math.min(r, Math.hypot(a.x - p.x, a.y - p.y) / 2);
    const db = Math.min(r, Math.hypot(b.x - p.x, b.y - p.y) / 2);
    const va = unit(p, a), vb = unit(p, b);
    const c1 = { x: p.x + va.x * da, y: p.y + va.y * da };
    const c2 = { x: p.x + vb.x * db, y: p.y + vb.y * db };
    out.push(c1);
    for (let s = 1; s <= seg; s++) {
      const t = s / seg, u = 1 - t;
      out.push({ x: u * u * c1.x + 2 * u * t * p.x + t * t * c2.x, y: u * u * c1.y + 2 * u * t * p.y + t * t * c2.y });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Animated packets flowing along a polyline — the canonical directional-flow
 *  motion for every connector/edge/pipe/wire. Deterministic from elapsedMs;
 *  dots fade in/out at the ends so the loop is seamless. */
export function flowDots(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  env: { elapsedMs: number },
  opts: { count?: number; speedMs?: number; r: number; color: string; glow?: boolean }
) {
  const { count = 3, speedMs = 2000, r, color, glow = true } = opts;
  if (pts.length < 2) return;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const f = ((env.elapsedMs / speedMs) + i / count) % 1;
    const p = pointAlongPolyline(pts, f);
    const fade = Math.sin(clamp01(f) * Math.PI); // 0 at ends, 1 mid
    ctx.globalAlpha = fade;
    ctx.fillStyle = color;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = r * 2.4;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
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

/** Animated pulsing ring around a focused node or marker pin. */
export function glowRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  env: { elapsedMs: number },
  speedMs = 1800
) {
  const p = (env.elapsedMs % speedMs) / speedMs;
  const radius = r + p * r * 1.5;
  const alpha = (1 - p) * 0.7;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** Eased smooth pulse multiplier (1.0 -> maxScale -> 1.0) for active beat elements. */
export function smoothPulse(env: { elapsedMs: number }, periodMs = 1200, maxScale = 1.08): number {
  const phase = (env.elapsedMs % periodMs) / periodMs;
  return 1 + Math.sin(phase * Math.PI * 2) * (maxScale - 1);
}

/**
 * Enhanced pseudo-3D card box with lit top face, right shadow face, and optional glowing border.
 * Used across architecture diagrams (diagram, pipeline, statemachine, decision) to give nodes depth.
 */
export function isoBox3D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  depth: number,
  face: string,
  glowColor?: string,
  r = Math.min(w, h) * 0.14
) {
  // Glow shadow behind node if active
  if (glowColor) {
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = depth * 2.5;
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = rgba(face, 0.2);
    ctx.fill();
    ctx.restore();
  }

  // Right (shadow) face
  ctx.beginPath();
  ctx.moveTo(x + w, y + r);
  ctx.lineTo(x + w + depth, y + r + depth * 0.55);
  ctx.lineTo(x + w + depth, y + h - r + depth * 0.55);
  ctx.lineTo(x + w, y + h - r);
  ctx.closePath();
  ctx.fillStyle = shade(face, -0.45);
  ctx.fill();

  // Top (lit) face
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.lineTo(x + w - r + depth, y + depth * 0.55);
  ctx.lineTo(x + r + depth, y + depth * 0.55);
  ctx.closePath();
  ctx.fillStyle = shade(face, 0.25);
  ctx.fill();

  // Front face with gradient
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(face, 0.1));
  g.addColorStop(1, shade(face, -0.18));
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = glowColor ?? shade(face, 0.3);
  ctx.lineWidth = glowColor ? 2 : 1.2;
  ctx.stroke();
}

/**
 * Transpose 12x12 grid coordinates automatically for 9:16 vertical shorts layout.
 * Turns left-to-right horizontal flows into top-to-bottom vertical flows.
 */
export function autoLayoutGrid(
  x: number,
  y: number,
  w: number,
  h: number,
  isVertical: boolean
): { gx: number; gy: number; gw: number; gh: number } {
  if (!isVertical) return { gx: x, gy: y, gw: w, gh: h };
  // Swap grid x & y axes for top-to-bottom flow in 9:16
  return { gx: y, gy: x, gw: h, gh: w };
}



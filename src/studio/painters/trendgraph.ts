import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  flowDots,
  glowRing,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type TrendScene = Extract<Scene, { kind: "trendgraph" }>;
type Series = TrendScene["series"][number];

const CURRENCY_RE = /^[₹$€£]$/;
const CAPTION_SAFE_Y = 0.86;
const MUTED_HEX = "#94a3b8";

/** Series colour by its palette role. muted → the neutral slate used for reference lines. */
function seriesColor(role: Series["role"], accent: string, secondary: string): string {
  return role === "secondary" ? secondary : role === "muted" ? MUTED_HEX : accent;
}

/** Value label: currency symbols prefix (Indian grouping for ₹), % / units suffix.
 *  `t` (0..1) drives a count-up so the newest value animates in. */
function fmtValue(value: number, unit: string | undefined, t: number): string {
  const u = unit?.trim() ?? "";
  const v = value * t;
  const locale = u === "₹" ? "en-IN" : "en-US";
  const num = Number.isInteger(value) ? Math.round(v).toLocaleString(locale) : v.toFixed(1);
  if (CURRENCY_RE.test(u)) return `${u}${num}`;
  return u ? `${num}${u.startsWith("%") ? u : ` ${u}`}` : num;
}

/**
 * A macro-economic multi-line trend graph: 2–3 series share one value axis and
 * reveal left→right, one time-point per beat. The area between the FIRST two
 * series is shaded as a divergence band (Actual vs Potential GDP, Nominal vs
 * Real, WPI vs CPI) and the widest gap is marked with a value chip. A legend
 * counts each series' newest value up. Deterministic; works in 9:16 and 16:9.
 */
export function paintTrendgraph(ctx: CanvasRenderingContext2D, scene: TrendScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;

  const offset = introBeatCount(scene);
  const n = scene.steps.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const allIn = activeStep >= n - 1 && stepT >= 0.999;

  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);
  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.3;
  const introIn = easeOutCubic(enterT(env, 420));

  // Stable value axis over ALL points so the plot never rescales as data reveals.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of scene.series) {
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      if (v === undefined) continue;
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  const pad = (yMax - yMin) * 0.14 || Math.abs(yMax) * 0.14 || 1;
  yMin -= pad;
  yMax += pad;
  const range = yMax - yMin || 1;

  // ---- geometry ----
  const legendH = unit * (vertical ? 1.5 : 1.3);
  const plotTop = contentY + band + legendH + unit * 0.5;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const labelH = unit * 1.25;
  const baseY = safeBottom - labelH;
  const plotH = Math.max(unit, baseY - plotTop);
  const padX = (contentW / n) * 0.5;
  const spanW = contentW - padX * 2;
  const px = (i: number) => contentX + padX + (n === 1 ? spanW / 2 : (spanW * i) / (n - 1));
  const yFor = (v: number) => baseY - ((v - yMin) / range) * plotH;
  const zeroInside = yMin < 0 && yMax > 0;
  const zeroY = yFor(0);

  // ---- legend (colour swatch + label + counting value) ----
  drawLegend(ctx, scene, {
    x: contentX,
    y: contentY + band + unit * 0.1,
    w: contentW,
    h: legendH,
    unit,
    vertical,
    activeStep,
    stepT,
    introIn,
    accent,
    secondary,
    n,
  });

  // ---- background gridlines + zero line ----
  ctx.save();
  ctx.globalAlpha = introIn;
  ctx.lineWidth = 1;
  const GRID_LINES = 3;
  for (let g = 0; g <= GRID_LINES; g++) {
    const gy = plotTop + (plotH * g) / GRID_LINES;
    ctx.strokeStyle = rgba(MUTED_HEX, 0.08);
    ctx.setLineDash([unit * 0.2, unit * 0.28]);
    ctx.beginPath();
    ctx.moveTo(contentX, gy);
    ctx.lineTo(contentX + contentW, gy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Baseline (or the zero line when the range straddles 0 — critical for gaps that go negative).
  const axisY = zeroInside ? zeroY : baseY;
  ctx.strokeStyle = rgba(MUTED_HEX, zeroInside ? 0.4 : 0.28);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(contentX, axisY);
  ctx.lineTo(contentX + contentW, axisY);
  ctx.stroke();
  if (zeroInside) {
    ctx.font = `700 ${unit * 0.6}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "start";
    ctx.textBaseline = "middle";
    ctx.fillText("0", contentX + unit * 0.15, zeroY - unit * 0.45);
  }
  ctx.restore();

  // ---- revealed paths per series (tip interpolates along the active segment) ----
  const last = Math.min(activeStep, n - 1);
  const paths = scene.series.map((s) => revealedPath(s, last, stepT, px, yFor));

  // ---- divergence band between series[0] and series[1] ----
  if (scene.band && scene.series.length >= 2 && paths[0].length >= 2 && paths[1].length >= 2) {
    const a = paths[0];
    const b = paths[1];
    const m = Math.min(a.length, b.length);
    ctx.save();
    ctx.globalAlpha = introIn * (0.85 + 0.15 * idle(env, 3200));
    ctx.beginPath();
    ctx.moveTo(a[0].x, a[0].y);
    for (let i = 1; i < m; i++) ctx.lineTo(a[i].x, a[i].y);
    for (let i = m - 1; i >= 0; i--) ctx.lineTo(b[i].x, b[i].y);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, plotTop, 0, baseY);
    grad.addColorStop(0, rgba(accent, 0.16));
    grad.addColorStop(1, rgba(secondary, 0.16));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  // ---- series lines ----
  scene.series.forEach((s, si) => {
    const pts = paths[si];
    if (pts.length < 1) return;
    const col = seriesColor(s.role, accent, secondary);
    if (pts.length >= 2) {
      ctx.save();
      ctx.globalAlpha = introIn;
      ctx.strokeStyle = col;
      ctx.lineWidth = unit * (s.role === "muted" ? 0.12 : 0.16);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (s.role === "muted") ctx.setLineDash([unit * 0.5, unit * 0.4]);
      else {
        ctx.shadowColor = rgba(col, 0.5);
        ctx.shadowBlur = unit * 0.35;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
      if (allIn && s.role !== "muted") {
        flowDots(ctx, pts, env, { count: 2, speedMs: 2800, r: unit * 0.12, color: col });
      }
    }
    // Newest point marker (glowing) so the eye tracks the reveal.
    const tip = pts[pts.length - 1];
    const isTip = last < n; // there is always a tip once revealed
    ctx.save();
    ctx.globalAlpha = introIn;
    if (isTip && si === 0) glowRing(ctx, tip.x, tip.y, unit * 0.32, col, env, 1700);
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, unit * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.shadowColor = rgba(col, 0.6);
    ctx.shadowBlur = unit * 0.5;
    ctx.fill();
    ctx.restore();
  });

  // ---- divergence marker at the widest revealed gap ----
  if (scene.band && scene.series.length >= 2 && paths[0].length >= 2) {
    const a = paths[0];
    const b = paths[1];
    const m = Math.min(a.length, b.length);
    let mi = 0;
    let mgap = -1;
    for (let i = 0; i < m; i++) {
      const d = Math.abs(a[i].y - b[i].y);
      if (d > mgap) {
        mgap = d;
        mi = i;
      }
    }
    if (mgap > unit * 0.6 && mi < scene.series[0].values.length) {
      const x = a[mi].x;
      const y0 = a[mi].y;
      const y1 = b[mi].y;
      const midY = (y0 + y1) / 2;
      ctx.save();
      ctx.globalAlpha = introIn * (0.7 + 0.3 * idle(env, 2000));
      ctx.strokeStyle = rgba(THEME.text, 0.55);
      ctx.lineWidth = unit * 0.06;
      ctx.setLineDash([unit * 0.22, unit * 0.2]);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      const diff = Math.abs(scene.series[0].values[mi] - scene.series[1].values[mi]);
      const chip = fmtValue(diff, scene.unit, 1);
      ctx.font = `800 ${unit * (vertical ? 0.72 : 0.66)}px ${FONT_SANS}`;
      const cw = ctx.measureText(chip).width;
      const rightSpace = contentX + contentW - x;
      const chipX = rightSpace > cw + unit * 1.6 ? x + unit * 0.45 : x - cw - unit * 1.25;
      const chipY = midY - unit * 0.55;
      roundRect(ctx, chipX, chipY, cw + unit * 0.8, unit * 1.1, unit * 0.3);
      ctx.globalAlpha = introIn;
      ctx.fillStyle = "#0a0e13";
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(chip, chipX + unit * 0.4, chipY + unit * 0.78);
      ctx.restore();
    }
  }

  // ---- x-axis labels (ghost before their beat, lit after) ----
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `600 ${unit * (vertical ? 0.68 : 0.6)}px ${FONT_SANS}`;
  scene.steps.forEach((s, i) => {
    const revealed = i <= last;
    ctx.globalAlpha = introIn * (revealed ? 1 : 0.32);
    ctx.fillStyle = revealed ? THEME.textDim : THEME.textFaint;
    ctx.fillText(s.x, px(i), baseY + unit * 0.95);
  });
  ctx.restore();

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/** Build a series' revealed polyline; the last (active) segment interpolates by stepT. */
function revealedPath(
  s: Series,
  last: number,
  stepT: number,
  px: (i: number) => number,
  yFor: (v: number) => number
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const top = Math.min(last, s.values.length - 1);
  if (top < 0) return pts;
  for (let i = 0; i < top; i++) {
    const v = s.values[i];
    if (v !== undefined) pts.push({ x: px(i), y: yFor(v) });
  }
  const vTop = s.values[top];
  if (vTop === undefined) return pts;
  if (top >= 1 && s.values[top - 1] !== undefined) {
    const t = easeOutCubic(clamp01(stepT));
    const p0 = { x: px(top - 1), y: yFor(s.values[top - 1] as number) };
    const p1 = { x: px(top), y: yFor(vTop) };
    pts.push({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
  } else {
    pts.push({ x: px(top), y: yFor(vTop) });
  }
  return pts;
}

type LegendCtx = {
  x: number;
  y: number;
  w: number;
  h: number;
  unit: number;
  vertical: boolean;
  activeStep: number;
  stepT: number;
  introIn: number;
  accent: string;
  secondary: string;
  n: number;
};

/** Horizontal legend row: swatch + label + the series' newest revealed value. */
function drawLegend(ctx: CanvasRenderingContext2D, scene: TrendScene, c: LegendCtx) {
  const { unit, vertical, activeStep, stepT, introIn, accent, secondary, n } = c;
  const last = Math.min(Math.max(activeStep, 0), n - 1);
  const labelPx = unit * (vertical ? 0.68 : 0.64);
  const valPx = unit * (vertical ? 0.76 : 0.72);
  const swR = unit * 0.28;

  const chips = scene.series.map((s) => {
    const idx = Math.min(last, s.values.length - 1);
    const v = idx >= 0 ? s.values[idx] : 0;
    const countT = activeStep >= 0 && idx === activeStep ? easeOutCubic(clamp01(stepT)) : activeStep < 0 ? 0 : 1;
    const valText = activeStep < 0 ? "" : fmtValue(v, scene.unit, countT);
    return { s, valText };
  });

  ctx.save();
  ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
  const widths = chips.map((ch) => {
    const lw = ctx.measureText(ch.s.label).width;
    ctx.font = `800 ${valPx}px ${FONT_SANS}`;
    const vw = ch.valText ? ctx.measureText(ch.valText).width : 0;
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    return swR * 2 + unit * 0.4 + lw + (vw ? unit * 0.5 + vw : 0);
  });
  const gap = unit * 1.1;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
  let cx = c.x + Math.max(0, (c.w - total) / 2);
  const cy = c.y + c.h * 0.5;

  chips.forEach((ch, i) => {
    const col = seriesColor(ch.s.role, accent, secondary);
    ctx.globalAlpha = introIn;
    ctx.beginPath();
    ctx.arc(cx + swR, cy, swR, 0, Math.PI * 2);
    ctx.fillStyle = col;
    if (ch.s.role !== "muted") {
      ctx.shadowColor = rgba(col, 0.6);
      ctx.shadowBlur = unit * 0.4;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    let tx = cx + swR * 2 + unit * 0.4;
    ctx.textAlign = "start";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(ch.s.label, tx, cy);
    if (ch.valText) {
      tx += ctx.measureText(ch.s.label).width + unit * 0.5;
      ctx.font = `800 ${valPx}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.fillText(ch.valText, tx, cy);
    }
    cx += widths[i] + gap;
  });
  ctx.restore();
}

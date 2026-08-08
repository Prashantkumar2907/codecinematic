import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  enterT,
  idle,
  clamp01,
  clampRange,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  drawArrowhead,
  strokePolylineProgress,
  beatWindow,
  activeBeatIndex,
  rgba,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

type CurvesScene = Extract<Scene, { kind: "curves" }>;
type Shape = CurvesScene["curves"][number]["shape"];

const SAMPLES = 96;
const BELL_EDGE = Math.exp(-2.25);
/** Fraction of a curve's own beat spent drawing; the rest holds so the narration lands. */
const DRAW_SHARE = 0.55;
const FRAME_IN_MS = 320;
/** Widest plot box allowed, so a function keeps a readable slope at 16:9. */
const MAX_PLOT_ASPECT = 2.2;
/** Beats a finished curve takes to hand its glow to the next one, instead of snapping. */
const FOCUS_FADE_BEATS = 0.35;
/** Draw fraction at which a curve's label starts arriving, so it lands with the stroke. */
const CHIP_AT = 0.8;

/** Function value in 0..1 for input t in 0..1. */
function fn(shape: Shape, t: number): number {
  switch (shape) {
    case "linear":
      return t;
    case "exp":
      return (Math.exp(3 * t) - 1) / (Math.exp(3) - 1);
    case "log":
      return Math.log(1 + 9 * t) / Math.log(10);
    case "sine":
      return 0.5 + 0.4 * Math.sin(2 * Math.PI * t);
    case "bell":
      return (Math.exp(-Math.pow((t - 0.5) * 3, 2)) - BELL_EDGE) / (1 - BELL_EDGE);
    case "supply":
      return 0.1 + 0.8 * t;
    case "demand":
      return 0.9 - 0.8 * t;
    case "scurve":
      return 1 / (1 + Math.exp(-10 * (t - 0.5)));
    case "ushape":
      return Math.pow(2 * t - 1, 2);
  }
}

const curveColor = (i: number, palette: PaintEnv["palette"]): string =>
  i === 0 ? palette.accent : i === 1 ? palette.secondary : THEME.good;

type Chip = { x: number; y: number; w: number; h: number; label: string; color: string; alpha: number };

export function paintCurves(ctx: CanvasRenderingContext2D, scene: CurvesScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentH, contentW, vertical, safeBottom } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.curves.length + (scene.mark ? 1 : 0);
  const markBeat = scene.mark ? totalBeats - 1 : -1;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const leave = departT(env, 380);
  if (leave <= 0) return;
  const frameIn = easeOutCubic(enterT(env, FRAME_IN_MS)) * leave;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + band;
  // The 9:16 caption band starts far above contentH's bottom; the plot and its
  // x-axis label row must both clear it, so safeBottom is the authority here.
  const areaBottom = Math.min(contentY + contentH, safeBottom);
  const areaH = Math.max(unit * 6, areaBottom - areaY);

  const marginL = unit * (scene.yLabel ? 1.35 : 0.5);
  const marginR = unit * 0.5;
  const marginT = unit * 0.9;
  const marginB = unit * (scene.xLabel ? 1.7 : 0.6);
  const plotY = areaY + marginT;
  const plotH = areaH - marginT - marginB;
  // 16:9 leaves a 3.4:1 plot box if the full content width is used, which flattens
  // every shape to a near-horizontal smear. Cap the box aspect and centre the
  // whole axis-label + plot block instead.
  const plotW = Math.min(contentW - marginL - marginR, plotH * MAX_PLOT_ASPECT);
  const plotX = contentX + (contentW - (marginL + plotW + marginR)) / 2 + marginL;

  // Axes span the whole plot box and end in arrowheads; the data range stops one
  // arrow-length short of each tip, so a curve terminates ON the axis at t=0 and
  // v=0 yet never overshoots the frame or collides with an arrowhead.
  const arrowPad = unit * 0.7;
  const axisY = plotY + plotH;
  const dataW = plotW - arrowPad;
  const dataH = plotH - arrowPad;
  const cxOf = (t: number) => plotX + t * dataW;
  const cyOf = (v: number) => axisY - v * dataH;

  const beatFrac = (b: number) => {
    const win = beatWindow(env.beats, b, totalBeats);
    return {
      started: env.p >= win.start,
      t: clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001)),
    };
  };

  // Continuous playhead in beat units. The glow used to key off the boolean
  // `active === myBeat`, so 59% of the plot box's lit pixels vanished in the one
  // frame the next beat began; emphasis has to be a ramp, not a flag.
  const beatPos = active < 0 ? -1 : active + beatFrac(active).t;
  const focusOf = (b: number) => clamp01(1 - clamp01(beatPos - b - 1) / FOCUS_FADE_BEATS);

  // ── grid + axes ──────────────────────────────────────────────────────────────
  const gridIn = easeOutCubic(enterT(env, FRAME_IN_MS + 160, 120)) * leave;
  ctx.save();
  ctx.globalAlpha = gridIn;
  ctx.strokeStyle = rgba(THEME.textDim, 0.16);
  ctx.lineWidth = unit * 0.03;
  ctx.beginPath();
  for (let k = 1; k <= 3; k++) {
    const gx = cxOf(k / 4);
    ctx.moveTo(gx, axisY);
    ctx.lineTo(gx, cyOf(1));
    const gy = cyOf(k / 4);
    ctx.moveTo(plotX, gy);
    ctx.lineTo(cxOf(1), gy);
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = frameIn;
  ctx.strokeStyle = rgba(THEME.textDim, 0.62);
  ctx.fillStyle = rgba(THEME.textDim, 0.62);
  ctx.lineWidth = unit * 0.055;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(plotX, plotY);
  ctx.lineTo(plotX, axisY);
  ctx.lineTo(plotX + plotW, axisY);
  ctx.stroke();
  drawArrowhead(ctx, plotX + plotW, axisY, 0, unit * 0.4);
  drawArrowhead(ctx, plotX, plotY, -Math.PI / 2, unit * 0.4);
  ctx.restore();

  const axisPx = unit * 0.68;
  if (scene.xLabel) {
    ctx.save();
    ctx.globalAlpha = frameIn;
    ctx.font = `600 ${axisPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(scene.xLabel, plotX + dataW / 2, axisY + unit * 1.15);
    ctx.restore();
  }
  if (scene.yLabel) {
    ctx.save();
    ctx.globalAlpha = frameIn;
    const yPx = fitFontSize(ctx, scene.yLabel, {
      maxW: plotH * 0.85,
      startPx: axisPx,
      minPx: unit * 0.48,
      weight: 600,
    });
    ctx.translate(plotX - unit * 0.73, plotY + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `600 ${yPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(scene.yLabel, 0, 0);
    ctx.restore();
  }

  // ── curves ───────────────────────────────────────────────────────────────────
  const chipPx = unit * (vertical ? 0.78 : 0.74);
  const chipH = chipPx * 1.7;
  const chips: Chip[] = [];

  const chipTop = plotY;
  const chipBottom = axisY - chipH - unit * 0.12;

  scene.curves.forEach((cv, i) => {
    const { started, t } = beatFrac(offset + i);
    const color = curveColor(i, env.palette);
    const focus = focusOf(offset + i);

    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const ct = k / SAMPLES;
      pts.push({ x: cxOf(ct), y: cyOf(clamp01(fn(cv.shape, ct))) });
    }

    // easeOut, not easeInOut: an ease-in draw-on spends the first fifth of the
    // beat producing sub-pixel length, which measured as ~40 frames of a lone
    // head dot with no line behind it.
    const drawProg = started ? easeOutCubic(clamp01(t / DRAW_SHARE)) : 0;

    // The dashed shape stays under the stroke and fades as the stroke covers it,
    // so it never blinks out of existence the frame its beat opens.
    if (drawProg < 1) {
      ctx.save();
      ctx.globalAlpha = gridIn * 0.16 * (1 - drawProg);
      ctx.strokeStyle = color;
      ctx.lineWidth = unit * 0.07;
      ctx.lineCap = "round";
      ctx.setLineDash([unit * 0.3, unit * 0.28]);
      ctx.beginPath();
      pts.forEach((pt, k) => (k === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
      ctx.restore();
    }
    if (!started) return;

    const breathe = drawProg >= 1 ? idle(env, 2600, i * 1.2) : 0;
    const glow = focus * (0.55 + 0.45 * breathe);
    // The focused curve's own stroke breathes, not just its shadow blur — a glow
    // pulse alone is edge-only and too little area to keep the plot from reading
    // as still once the line has finished drawing and is just holding.
    const strokeBreathe = 1 - 0.18 * focus * (1 - breathe);

    ctx.save();
    ctx.globalAlpha = frameIn * strokeBreathe;
    ctx.strokeStyle = color;
    ctx.lineWidth = unit * 0.13;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (glow > 0.01) {
      ctx.shadowColor = rgba(color, 0.5 * glow);
      ctx.shadowBlur = unit * 0.7 * glow;
    }
    const tip = strokePolylineProgress(ctx, pts, drawProg);
    ctx.shadowBlur = 0;
    // Leading head. Gated on drawProg at both ends so it can neither appear as a
    // bare disc before the stroke has length nor blink off as the stroke lands.
    const headIn = clamp01(drawProg / 0.04) * clamp01((1 - drawProg) / 0.2);
    if (headIn > 0) {
      ctx.globalAlpha = frameIn * headIn;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, unit * 0.15 * headIn, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (drawProg > CHIP_AT) {
      const chipIn = easeOutCubic(clamp01((drawProg - CHIP_AT) / (1 - CHIP_AT)));
      const end = pts[pts.length - 1];
      ctx.save();
      ctx.font = `700 ${chipPx}px ${FONT_SANS}`;
      const cw = ctx.measureText(cv.label).width + unit * 0.8;
      ctx.restore();
      const chipX = clampRange(end.x - cw, plotX + unit * 0.12, plotX + plotW - cw);
      // Clear the curve across the chip's WHOLE x-span, not just at the endpoint:
      // clearing the endpoint alone put "Demand" straight through the line it
      // names, because a falling curve is higher everywhere left of its end.
      let spanTop = end.y;
      let spanBottom = end.y;
      for (const pt of pts) {
        if (pt.x < chipX - unit * 0.1 || pt.x > chipX + cw + unit * 0.1) continue;
        if (pt.y < spanTop) spanTop = pt.y;
        if (pt.y > spanBottom) spanBottom = pt.y;
      }
      const gap = unit * 0.3;
      const up = spanTop - chipH - gap;
      const down = spanBottom + gap;
      const fits = (y: number) => y >= chipTop && y <= chipBottom;
      const wantY = fits(up) ? up : fits(down) ? down : up;
      chips.push({
        x: chipX,
        y: clampRange(wantY, chipTop, chipBottom),
        w: cw,
        h: chipH,
        label: cv.label,
        color,
        alpha: frameIn * chipIn,
      });
    }
  });

  // Push overlapping chips apart before drawing, then re-clamp inside the plot.
  chips.sort((a, b) => a.y - b.y);
  for (let i = 1; i < chips.length; i++) {
    const prev = chips[i - 1];
    const cur = chips[i];
    const overlapsX = cur.x < prev.x + prev.w && prev.x < cur.x + cur.w;
    if (overlapsX && cur.y < prev.y + prev.h + unit * 0.16) {
      cur.y = clampRange(prev.y + prev.h + unit * 0.16, chipTop, chipBottom);
    }
  }
  for (const chip of chips) {
    ctx.save();
    ctx.globalAlpha = chip.alpha;
    ctx.font = `700 ${chipPx}px ${FONT_SANS}`;
    roundRect(ctx, chip.x, chip.y, chip.w, chip.h, unit * 0.28);
    ctx.fillStyle = rgba(THEME.panel, 0.94);
    ctx.fill();
    ctx.strokeStyle = rgba(chip.color, 0.75);
    ctx.lineWidth = unit * 0.035;
    ctx.stroke();
    ctx.fillStyle = chip.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(chip.label, chip.x + chip.w / 2, chip.y + chip.h * 0.54);
    ctx.restore();
  }

  // ── mark / intersection beat ─────────────────────────────────────────────────
  if (markBeat >= 0 && scene.mark && active >= markBeat) {
    const { t } = beatFrac(markBeat);
    let f = scene.mark.x / 100;
    let my: number;
    let color: string;

    if (scene.curves.length >= 2) {
      const inter = intersectionNear(scene.curves[0].shape, scene.curves[1].shape, f);
      f = inter.f;
      my = inter.y;
      color = accent;
    } else {
      my = clamp01(fn(scene.curves[0].shape, f));
      color = curveColor(0, env.palette);
    }

    const mx = cxOf(f);
    const myPx = cyOf(my);
    const crossIn = easeOutCubic(clamp01(t / 0.3));
    const ringIn = easeOutCubic(clamp01((t - 0.12) / 0.3));
    const chipIn = easeOutCubic(clamp01((t - 0.32) / 0.36));

    if (crossIn > 0) {
      ctx.save();
      ctx.globalAlpha = frameIn * crossIn * 0.9;
      ctx.strokeStyle = rgba(color, 0.6);
      ctx.lineWidth = unit * 0.055;
      ctx.setLineDash([unit * 0.3, unit * 0.25]);
      ctx.beginPath();
      ctx.moveTo(mx, myPx);
      ctx.lineTo(mx, axisY - (axisY - myPx) * (1 - crossIn));
      ctx.moveTo(mx, myPx);
      ctx.lineTo(mx - (mx - plotX) * crossIn, myPx);
      ctx.stroke();
      ctx.restore();
    }

    if (ringIn > 0) {
      const pulse = idle(env, 1900, 1);
      ctx.save();
      ctx.globalAlpha = frameIn * ringIn;
      ctx.strokeStyle = color;
      ctx.lineWidth = unit * 0.065;
      ctx.beginPath();
      ctx.arc(mx, myPx, unit * (0.46 + 0.12 * pulse) * (0.6 + 0.4 * ringIn), 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowColor = rgba(color, 0.7);
      ctx.shadowBlur = unit * (0.55 + 0.35 * pulse);
      ctx.fillStyle = THEME.text;
      ctx.beginPath();
      ctx.arc(mx, myPx, unit * 0.2 * ringIn, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    if (chipIn > 0) {
      const markPx = unit * (vertical ? 0.9 : 0.8);
      const markH = markPx * 1.75;
      ctx.save();
      ctx.globalAlpha = frameIn * chipIn;
      ctx.font = `800 ${markPx}px ${FONT_SANS}`;
      const cw = ctx.measureText(scene.mark.label).width + unit * 0.9;
      const chX = clampRange(mx - cw / 2, plotX, plotX + plotW - cw);
      // Every direction out of an intersection has a curve in it, so the badge is
      // lifted clear of the crossing wedge and tied back with a leader instead of
      // hugging the mark, where it sat straight on top of both lines.
      const ringR = unit * 0.46;
      const lift = unit * 2.6;
      const above = myPx - markH - lift >= plotY;
      const chY = clampRange(
        above ? myPx - markH - lift : myPx + lift,
        plotY,
        axisY - markH - unit * 0.12
      );
      ctx.strokeStyle = rgba(color, 0.55);
      ctx.lineWidth = unit * 0.045;
      ctx.beginPath();
      ctx.moveTo(mx, above ? chY + markH : chY);
      ctx.lineTo(mx, above ? myPx - ringR : myPx + ringR);
      ctx.stroke();
      // The badge fill breathes with the ring's own pulse — once it lands this is
      // the largest element on screen and the only thing keeping the tail alive.
      const badgePulse = idle(env, 1900, 1);
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.3 + 0.5 * badgePulse);
      roundRect(ctx, chX, chY, cw, markH, unit * 0.3);
      ctx.fillStyle = color;
      ctx.globalAlpha = frameIn * chipIn * (0.85 + 0.15 * badgePulse);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = frameIn * chipIn;
      ctx.fillStyle = THEME.bgMid;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(scene.mark.label, chX + cw / 2, chY + markH * 0.54);
      ctx.restore();
    }
  }
}

/** Sign-change crossing of two curves closest to fraction `near`. */
function intersectionNear(a: Shape, b: Shape, near: number): { f: number; y: number } {
  let best: { f: number; y: number } | null = null;
  let bestDist = Infinity;
  let prevDiff = fn(a, 0) - fn(b, 0);
  for (let i = 1; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const diff = fn(a, t) - fn(b, t);
    if (prevDiff === 0 || diff === 0 || prevDiff * diff < 0) {
      const t0 = (i - 1) / SAMPLES;
      const r = prevDiff === diff ? 0 : prevDiff / (prevDiff - diff);
      const cf = t0 + r / SAMPLES;
      const cy = clamp01(fn(a, cf));
      const dist = Math.abs(cf - near);
      if (dist < bestDist) {
        bestDist = dist;
        best = { f: cf, y: cy };
      }
    }
    prevDiff = diff;
  }
  if (best) return best;
  // No crossing: fall back to the requested x on curve a.
  return { f: near, y: clamp01(fn(a, near)) };
}

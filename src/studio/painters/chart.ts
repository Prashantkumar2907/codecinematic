import { line as d3line, area as d3area, curveMonotoneX } from "d3-shape";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  STROKE,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  clamp01,
  roundRect,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  flowDots,
  rgba,
  shade,
  departT,
  applyElevation,
  clearShadow,
} from "./common";
import type { PaintEnv } from "./index";

type ChartScene = Extract<Scene, { kind: "chart" }>;

const CURRENCY_RE = /^[₹$€£]$/;
/**
 * Ghost strength before a series' beat plays. The chart used to open on nothing but
 * the title for a full 500 ms — its own round-1 finding C2 — because the ghost sat at
 * 0.35 of an already-faint colour. The shape of the chart should be readable from the
 * first frame; only the values arrive on their beats.
 */
const GHOST_A = 0.55;
const GHOST_TRACK_A = 0.12;
const TRACK_A = 0.16;

/** Count-up value: integers stay integers, fractional values keep one decimal. */
function fmtValue(target: number, t: number, locale: string): string {
  const v = target * t;
  if (Number.isInteger(target)) return Math.round(v).toLocaleString(locale);
  return v.toFixed(1);
}

/** Value label with unit (₹ prefixed & grouped Indian-style, % suffixed tight). */
function valueLabel(value: number, unit: string | undefined, t: number): string {
  const u = unit?.trim() ?? "";
  const locale = u === "₹" ? "en-IN" : "en-US";
  return CURRENCY_RE.test(u)
    ? `${u}${fmtValue(value, t, locale)}`
    : `${fmtValue(value, t, locale)}${u ? (u.startsWith("%") ? u : ` ${u}`) : ""}`;
}

/** Dispatch by mode; "bars" (default) keeps the original horizontal bar chart. */
export function paintChart(ctx: CanvasRenderingContext2D, scene: ChartScene, env: PaintEnv) {
  const leave = departT(env, 380);
  if (leave <= 0) return;
  const mode = scene.mode ?? "bars";
  ctx.save();
  ctx.globalAlpha = leave;
  if (mode === "bars") paintBars(ctx, scene, env, leave);
  else if (mode === "column") paintColumn(ctx, scene, env, leave);
  else if (mode === "line" || mode === "area") paintLineArea(ctx, scene, env, mode === "area", leave);
  else paintPie(ctx, scene, env, mode === "donut");
  ctx.restore();
}

/** Horizontal bar chart: one bar grows (with a counting value) per beat. */
function paintBars(ctx: CanvasRenderingContext2D, scene: ChartScene, env: PaintEnv, leave: number) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const lastEnd = beatWindow(env.beats, totalBeats - 1, totalBeats).end;

  // drawSceneTitle finishes its fade at p=0.12; feed it absolute time so the title lands in ~360ms.
  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;

  const maxVal = Math.max(...scene.items.map((i) => i.value), 1e-9);
  let maxIdx = 0;
  scene.items.forEach((item, i) => {
    if (item.value > scene.items[maxIdx].value) maxIdx = i;
  });
  const n = scene.items.length;
  const availH = safeBottom - (contentY + band);
  const rowGap = Math.min(availH / n, unit * (vertical ? 4.0 : 3.1));
  // Center the bar block vertically so sparse charts don't bunch at the top.
  const listTop = contentY + band + Math.max(0, (availH - n * rowGap) / 2);
  const barH = Math.min(rowGap * 0.42, unit * 1.35);

  const labelPx = unit * (vertical ? 0.88 : 0.85);
  const valuePx = unit * (vertical ? 0.95 : 0.85);
  const trackX = contentX;
  // Values live in a reserved gutter, never on top of the bar. Inside-the-bar text was
  // drawn in shade(accent, -0.9) — near-black, which only reads against a full-bright
  // bar. Every bar except the current one is dimmed to 0.62, so on a real chart five of
  // six values were dark-on-dark.
  ctx.font = `800 ${valuePx}px ${FONT_SANS}`;
  const valueGutter =
    Math.max(...scene.items.map((it) => ctx.measureText(valueLabel(it.value, it.unit, 1)).width)) + unit * 0.9;
  const trackW = Math.max(unit * 4, contentW - valueGutter);
  const ghostIn = easeOutCubic(enterT(env, 420));
  const settledAll = env.p >= lastEnd;

  scene.items.forEach((item, i) => {
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    if (t <= 0) {
      // Ghost track + label so the chart's full shape is visible before each
      // bar's beat instead of bars materialising into an empty lower half.
      if (ghostIn > 0) {
        const rowY = listTop + i * rowGap;
        const barY = rowY + unit * 1.15;
        ctx.save();
        ctx.globalAlpha = GHOST_A * ghostIn * leave;
        ctx.font = `600 ${labelPx}px ${FONT_SANS}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(item.label, trackX, rowY + unit * 0.75);
        roundRect(ctx, trackX, barY, trackW, barH, barH / 2);
        ctx.fillStyle = rgba(THEME.textDim, GHOST_TRACK_A);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    const appear = easeOutCubic(Math.min(1, t * 3));
    const grow = easeOutCubic(clamp01(t * 1.6));
    const growBar = easeOutBack(clamp01(t * 1.6));
    const isCurrent = active === offset + i;
    const rowY = listTop + i * rowGap;
    const barY = rowY + unit * 1.15;

    ctx.save();
    ctx.globalAlpha = appear * (isCurrent || active < offset + i ? 1 : 0.62) * leave;

    ctx.font = `${isCurrent ? 700 : 600} ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
    ctx.fillText(item.label, trackX, rowY + unit * 0.75);

    roundRect(ctx, trackX, barY, trackW, barH, barH / 2);
    ctx.fillStyle = rgba(THEME.textDim, TRACK_A);
    ctx.fill();

    const frac = item.value / maxVal;
    const barW = Math.max(barH, Math.min(trackW, trackW * frac * growBar));
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
    } else if (settledAll && i === maxIdx) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.3 + 0.35 * idle(env, 2200));
    }
    roundRect(ctx, trackX, barY, barW, barH, barH / 2);
    const grad = ctx.createLinearGradient(trackX, 0, trackX + barW, 0);
    grad.addColorStop(0, rgba(accent, isCurrent ? 0.55 : 0.35));
    grad.addColorStop(1, accent);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    const valueText = valueLabel(item.value, item.unit, grow);
    ctx.font = `800 ${valuePx}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
    ctx.fillText(valueText, trackX + barW + unit * 0.45, barY + barH * 0.72);
    ctx.restore();
  });
}

/** Vertical columns: one bar grows up per beat, value chip riding its top. */
function paintColumn(ctx: CanvasRenderingContext2D, scene: ChartScene, env: PaintEnv, leave: number) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const n = scene.items.length;
  const maxVal = Math.max(...scene.items.map((i) => i.value), 1e-9);

  const labelH = unit * 1.4;
  const plotTop = contentY + band + unit * 1.1; // room for the value chip above the tallest column
  const baseY = safeBottom - labelH;
  const maxH = Math.max(unit, baseY - plotTop);
  const gap = unit * (vertical ? 0.6 : 0.9);
  const colW = Math.min(unit * (vertical ? 2.6 : 3.2), (contentW - gap * (n - 1)) / n);
  const rowW = colW * n + gap * (n - 1);
  const startX = contentX + (contentW - rowW) / 2;
  const labelPx = unit * (vertical ? 0.74 : 0.7);
  const valuePx = unit * (vertical ? 0.85 : 0.78);
  const ghostIn = easeOutCubic(enterT(env, 420));

  scene.items.forEach((item, i) => {
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    const cx = startX + i * (colW + gap) + colW / 2;

    ctx.save();
    ctx.font = `600 ${labelPx}px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillStyle = t <= 0 ? THEME.textFaint : active === offset + i ? THEME.text : THEME.textDim;
    ctx.globalAlpha = (t <= 0 ? 0.3 * ghostIn : 1) * leave;
    ctx.fillText(item.label, cx, baseY + unit * 0.95);
    ctx.restore();

    if (t <= 0) {
      if (ghostIn > 0) {
        ctx.save();
        ctx.globalAlpha = GHOST_TRACK_A * ghostIn * leave;
        roundRect(ctx, cx - colW / 2, baseY - unit * 0.3, colW, unit * 0.3, unit * 0.1);
        ctx.fillStyle = THEME.textDim;
        ctx.fill();
        ctx.restore();
      }
      return;
    }

    const grow = easeOutCubic(clamp01(t * 1.6));
    const growBar = easeOutBack(clamp01(t * 1.6));
    const isCurrent = active === offset + i;
    const h = Math.max(unit * 0.3, maxH * (item.value / maxVal) * growBar);

    ctx.save();
    ctx.globalAlpha = easeOutCubic(Math.min(1, t * 3)) * leave;
    applyElevation(ctx, unit, isCurrent ? "floating" : "raised");
    const grad = ctx.createLinearGradient(0, baseY - h, 0, baseY);
    grad.addColorStop(0, accent);
    grad.addColorStop(1, rgba(accent, isCurrent ? 0.55 : 0.35));
    ctx.fillStyle = grad;
    roundRect(ctx, cx - colW / 2, baseY - h, colW, h, Math.min(colW, h) * 0.22);
    ctx.fill();
    clearShadow(ctx);

    const text = valueLabel(item.value, item.unit, grow);
    ctx.font = `800 ${valuePx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(text, cx, baseY - h - unit * 0.4);
    ctx.restore();
  });
  ctx.textAlign = "start";
}

/** Line / area chart: a point plots per beat, segments draw on, tip carries a value chip. */
function paintLineArea(ctx: CanvasRenderingContext2D, scene: ChartScene, env: PaintEnv, area: boolean, leave: number) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const n = scene.items.length;
  const maxVal = Math.max(...scene.items.map((i) => i.value), 1e-9);

  const plotTop = contentY + band + unit * 0.9; // value chips ride above the highest point
  const labelH = unit * 1.4;
  const baseY = safeBottom - labelH;
  const maxH = Math.max(unit, baseY - plotTop);
  const padX = (contentW / n) * 0.5;
  const spanW = contentW - padX * 2;
  const px = (i: number) => contentX + padX + (n === 1 ? spanW / 2 : (spanW * i) / (n - 1));
  const labelPx = unit * (vertical ? 0.74 : 0.68);
  const ghostIn = easeOutCubic(enterT(env, 420));

  // Baseline.
  ctx.save();
  ctx.globalAlpha = ghostIn * leave;
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = unit * STROKE.thin;
  ctx.beginPath();
  ctx.moveTo(contentX, baseY);
  ctx.lineTo(contentX + contentW, baseY);
  ctx.stroke();
  ctx.restore();

  // Each point rises from the baseline to its value as its beat plays.
  const pts = scene.items.map((item, i) => {
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    const grow = easeOutCubic(clamp01(t * 1.6));
    const yFull = baseY - (item.value / maxVal) * maxH;
    return { x: px(i), y: baseY - (baseY - yFull) * grow, t, grow, item, i };
  });
  const shown = pts.filter((p) => p.t > 0);

  // Smooth monotone curve (d3-shape) through the revealed points — no overshoot,
  // far cleaner than straight segments. Area fill uses the same curve.
  type LP = (typeof pts)[number];
  if (area && shown.length >= 2) {
    const areaGen = d3area<LP>().x((d) => d.x).y0(baseY).y1((d) => d.y).curve(curveMonotoneX).context(ctx);
    ctx.save();
    ctx.beginPath();
    areaGen(shown);
    // A slow breathing opacity on the fill — the area otherwise goes fully still
    // once settled, and the fill covers enough of the frame for it to register.
    const breathe = 0.35 + 0.06 * idle(env, 2600);
    const grad = ctx.createLinearGradient(0, plotTop, 0, baseY);
    grad.addColorStop(0, rgba(accent, breathe));
    grad.addColorStop(1, rgba(accent, 0.02));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  if (shown.length >= 2) {
    const lineGen = d3line<LP>().x((d) => d.x).y((d) => d.y).curve(curveMonotoneX).context(ctx);
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.16;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.4;
    ctx.beginPath();
    lineGen(shown);
    ctx.stroke();
    ctx.restore();
    // A packet glides along the settled curve, giving the trend continuous life.
    // Travels the drawn portion of the curve from the second point onward, not just
    // once the whole series has arrived — a chart with 6+ points otherwise sits
    // motionless for most of the scene waiting for the last beat.
    flowDots(ctx, shown.map((p) => ({ x: p.x, y: p.y })), env, { count: 2, speedMs: 2600, r: unit * 0.13, color: accent });
  }

  // Dots, x labels, and the value chip on the newest point.
  const newest = shown.length ? shown[shown.length - 1] : undefined;
  pts.forEach((p) => {
    if (p.t <= 0) {
      if (ghostIn > 0) {
        ctx.save();
        ctx.globalAlpha = 0.3 * ghostIn * leave;
        ctx.font = `600 ${labelPx}px ${FONT_SANS}`;
        ctx.fillStyle = THEME.textFaint;
        ctx.textAlign = "center";
        ctx.fillText(p.item.label, p.x, baseY + unit * 0.95);
        ctx.textAlign = "start";
        ctx.restore();
      }
      return;
    }
    const appear = easeOutCubic(Math.min(1, p.t * 3));
    const isCurrent = active === offset + p.i;
    ctx.save();
    ctx.globalAlpha = appear * leave;
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, unit * (isCurrent ? 0.32 : 0.24), 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = `600 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(p.item.label, p.x, baseY + unit * 0.95);
    ctx.textAlign = "start";
    ctx.restore();
  });

  if (newest) {
    const text = valueLabel(newest.item.value, newest.item.unit, newest.grow);
    ctx.save();
    ctx.font = `800 ${unit * (vertical ? 0.85 : 0.78)}px ${FONT_SANS}`;
    const tw = ctx.measureText(text).width;
    const chipX = clamp01((newest.x - contentX) / contentW) > 0.85 ? newest.x - tw - unit * 0.7 : newest.x - tw / 2;
    const chipY = Math.max(plotTop - unit * 0.2, newest.y - unit * 1.35);
    roundRect(ctx, chipX - unit * 0.4, chipY, tw + unit * 0.8, unit * 1.1, unit * 0.3);
    ctx.fillStyle = shade(accent, -0.92);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * STROKE.thin;
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.fillText(text, chipX, chipY + unit * 0.78);
    ctx.restore();
  }
}

/** Pie / donut: each slice sweeps its arc on its beat; active slice pulls out. */
function paintPie(ctx: CanvasRenderingContext2D, scene: ChartScene, env: PaintEnv, donut: boolean) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const plotTop = contentY + band;
  const plotH = Math.max(unit * 4, safeBottom - plotTop);
  const cx = contentX + contentW / 2;
  const cy = plotTop + plotH / 2;
  // Labels sit at 1.16R with textAlign left/right, so the radius has to leave room for
  // the widest of them — at 0.4 of the content width both end labels ran off the frame
  // ("Dependencies" cut to "Dependen", "Your code" to "r code").
  ctx.font = `700 ${unit * (vertical ? 0.68 : 0.6)}px ${FONT_SANS}`;
  const widestLabel = Math.max(...scene.items.map((it) => ctx.measureText(it.label).width));
  const labelRoom = Math.min(widestLabel + unit * 0.6, contentW * 0.22);
  const R = Math.min((contentW - labelRoom * 2) * 0.46, plotH * 0.42);
  const rInner = donut ? R * 0.56 : 0;
  const total = scene.items.reduce((acc, it) => acc + it.value, 0) || 1;

  // Alternate accent / secondary with a stepped alpha so adjacent slices differ.
  const sliceColor = (i: number) => {
    const base = i % 2 === 0 ? accent : secondary;
    return rgba(base, clamp01(0.9 - Math.floor(i / 2) * 0.13));
  };

  let ang = -Math.PI / 2; // start at 12 o'clock
  let runningTotal = 0;
  let currentArc = { a0: 0, a1: 0, ox: 0, oy: 0 };
  let hasCurrent = false;
  const labels: { x: number; y: number; text: string; pct: number; on: boolean }[] = [];

  scene.items.forEach((item, i) => {
    const slice = (item.value / total) * Math.PI * 2;
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    const sweep = easeOutCubic(clamp01(t * 1.3));
    const grow = easeOutCubic(clamp01(t * 1.6));
    if (t > 0) runningTotal += item.value * grow;
    const a0 = ang;
    const a1 = ang + slice * sweep;
    const mid = ang + slice / 2;
    const isCurrent = active === offset + i;
    const pull = isCurrent ? R * 0.06 : 0;
    const ox = Math.cos(mid) * pull;
    const oy = Math.sin(mid) * pull;

    if (t > 0 && a1 > a0) {
      ctx.save();
      ctx.beginPath();
      if (donut) {
        ctx.arc(cx + ox, cy + oy, R, a0, a1);
        ctx.arc(cx + ox, cy + oy, rInner, a1, a0, true);
      } else {
        ctx.moveTo(cx + ox, cy + oy);
        ctx.arc(cx + ox, cy + oy, R, a0, a1);
      }
      ctx.closePath();
      ctx.fillStyle = sliceColor(i);
      ctx.fill();
      ctx.strokeStyle = shade(accent, -0.92);
      ctx.lineWidth = unit * 0.08;
      ctx.stroke();
      ctx.restore();

      const lr = R * 1.16;
      labels.push({
        x: cx + ox + Math.cos(mid) * lr,
        y: cy + oy + Math.sin(mid) * lr,
        text: item.label,
        pct: Math.round((item.value / total) * 100),
        on: sweep > 0.6,
      });
    }
    if (isCurrent && t > 0) {
      currentArc = { a0, a1, ox, oy };
      hasCurrent = true;
    }
    ang += slice; // advance by the FULL slice so positions stay stable
  });

  // Continuous life on the active wedge — bars pulses its max bar, donut counts its
  // centre total up; pie had neither, so once all slices land it goes fully still.
  if (hasCurrent) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = unit * (0.5 + 0.4 * idle(env, 1800));
    ctx.beginPath();
    ctx.arc(cx + currentArc.ox, cy + currentArc.oy, R, currentArc.a0, currentArc.a1);
    if (donut) ctx.arc(cx + currentArc.ox, cy + currentArc.oy, rInner, currentArc.a1, currentArc.a0, true);
    else ctx.lineTo(cx + currentArc.ox, cy + currentArc.oy);
    ctx.closePath();
    ctx.strokeStyle = THEME.text;
    ctx.lineWidth = unit * 0.05;
    ctx.stroke();
    ctx.restore();
  }

  // Donut centre: running total counts up as slices arrive.
  if (donut) {
    const centreText = valueLabel(runningTotal, scene.items[0]?.unit, 1);
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `800 ${unit * (vertical ? 1.15 : 1.0)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(centreText, cx, cy + unit * 0.3);
    ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText("total", cx, cy + unit * 1.15);
    ctx.textAlign = "start";
    ctx.restore();
  }

  // Slice labels (label + percent) sit just outside their wedge.
  for (const l of labels) {
    if (!l.on) continue;
    ctx.save();
    const toLeft = l.x < cx;
    ctx.textAlign = toLeft ? "end" : "start";
    ctx.font = `700 ${unit * (vertical ? 0.68 : 0.6)}px ${FONT_SANS}`;
    // Clamp the anchor so a long label cannot run past the content edge, whichever
    // side of the pie it is on.
    const wLabel = ctx.measureText(l.text).width;
    const left = toLeft ? l.x - wLabel : l.x;
    const clamped = Math.min(Math.max(left, contentX), contentX + contentW - wLabel);
    const ax = toLeft ? clamped + wLabel : clamped;
    ctx.fillStyle = THEME.text;
    ctx.fillText(l.text, ax, l.y);
    ctx.font = `600 ${unit * (vertical ? 0.6 : 0.54)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`${l.pct}%`, ax, l.y + unit * 0.75);
    ctx.textAlign = "start";
    ctx.restore();
  }
}

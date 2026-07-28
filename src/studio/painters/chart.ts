import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { line as d3line, area as d3area, curveMonotoneX } from "d3-shape";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
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
} from "./common";
import type { PaintEnv } from "./index";

type ChartScene = Extract<Scene, { kind: "chart" }>;

const CURRENCY_RE = /^[₹$€£]$/;
// Captions sit in the bottom ~14% of vertical frames; keep bars/values above.
const CAPTION_SAFE_Y = 0.86;

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
  const mode = scene.mode ?? "bars";
  if (mode === "bars") return paintBars(ctx, scene, env);
  if (mode === "column") return paintColumn(ctx, scene, env);
  if (mode === "line" || mode === "area") return paintLineArea(ctx, scene, env, mode === "area");
  return paintPie(ctx, scene, env, mode === "donut");
}

/** Horizontal bar chart: one bar grows (with a counting value) per beat. */
function paintBars(ctx: CanvasRenderingContext2D, scene: ChartScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
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
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const availH = safeBottom - (contentY + band);
  const rowGap = Math.min(availH / n, unit * (vertical ? 4.0 : 3.1));
  // Center the bar block vertically so sparse charts don't bunch at the top.
  const listTop = contentY + band + Math.max(0, (availH - n * rowGap) / 2);
  const barH = Math.min(rowGap * 0.42, unit * 1.35);

  const trackX = contentX;
  const trackW = contentW;
  const labelPx = unit * (vertical ? 0.88 : 0.85);
  const valuePx = unit * (vertical ? 0.95 : 0.85);
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
        ctx.globalAlpha = 0.35 * ghostIn;
        ctx.font = `600 ${labelPx}px ${FONT_SANS}`;
        ctx.fillStyle = THEME.textFaint;
        ctx.fillText(item.label, trackX, rowY + unit * 0.75);
        roundRect(ctx, trackX, barY, trackW, barH, barH / 2);
        ctx.fillStyle = "rgba(148,163,184,0.07)";
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
    ctx.globalAlpha = appear * (isCurrent || active < offset + i ? 1 : 0.62);

    ctx.font = `${isCurrent ? 700 : 600} ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
    ctx.fillText(item.label, trackX, rowY + unit * 0.75);

    roundRect(ctx, trackX, barY, trackW, barH, barH / 2);
    ctx.fillStyle = "rgba(148,163,184,0.10)";
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
    const vw = ctx.measureText(valueText).width;
    const inside = barW > vw + unit * 1.2;
    ctx.fillStyle = inside ? shade(accent, -0.9) : THEME.text;
    ctx.fillText(valueText, inside ? trackX + barW - vw - unit * 0.5 : trackX + barW + unit * 0.45, barY + barH * 0.72);
    ctx.restore();
  });
}

/** Vertical columns: one bar grows up per beat, value chip riding its top. */
function paintColumn(ctx: CanvasRenderingContext2D, scene: ChartScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const lastEnd = beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const settledAll = env.p >= lastEnd;
  const key = scene.id + "-col3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const n = scene.items.length;
  const maxVal = Math.max(...scene.items.map((i) => i.value), 1e-9);
  let maxIdx = 0;
  scene.items.forEach((item, i) => {
    if (item.value > scene.items[maxIdx].value) maxIdx = i;
  });

  const plotTop = contentY + band;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const rect = { x: contentX, y: plotTop, w: contentW, h: safeBottom - plotTop };
  const spread = vertical ? 2.8 : 4.0;
  const maxBarH3D = 3.5;
  const ghostIn = easeOutCubic(enterT(env, 420));
  
  const colX = (i: number) => n === 1 ? 0 : -spread + (i / (n - 1)) * spread * 2;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 32, 1, 0.1, 100);
    camera.position.set(0, 4.0, vertical ? 14 : 11);
    camera.lookAt(0, 1.5, 0);
    studioLights(s, accent, secondary);
    
    // Add grid/baseline
    const grid = new THREE.GridHelper(spread * 3.5, 10, new THREE.Color(accent), new THREE.Color(shade(accent, -0.62)));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.3;
    s.add(grid);
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spread * 4, spread * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models = scene.items.map((item, i) => {
      const g = makeBlock(0.85, 1.0, 0.85, accent, shade(accent, 0.86));
      g.position.set(colX(i), 0, 0);
      s.add(g);
      return g;
    });

    const update = () => {
      models.forEach((m, i) => {
        const t = beatT(env.beats, offset + i, totalBeats, env.p);
        const growBar = easeOutBack(clamp01(t * 1.6));
        const targetH = Math.max(0.01, maxBarH3D * (scene.items[i].value / maxVal) * growBar);
        m.scale.y = targetH;
        m.position.y = targetH / 2;
        m.visible = ghostIn > 0 || targetH > 0.05;
        if (t <= 0) {
            m.scale.y = 0.01;
            m.position.y = 0.005;
        }
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return; // Fallback could be added, but we assume WebGL works for devstudio

  // Draw 2D labels projected from 3D coords
  const labelPx = unit * (vertical ? 0.8 : 0.72);
  const valuePx = unit * (vertical ? 0.85 : 0.78);

  scene.items.forEach((item, i) => {
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    const grow = easeOutCubic(clamp01(t * 1.6));
    const growBar = easeOutBack(clamp01(t * 1.6));
    const isCurrent = active === offset + i;

    // Label at bottom
    const baseWorld = new THREE.Vector3(colX(i), 0, 0);
    const baseP = projectToRect(cam, baseWorld, rect);
    
    ctx.save();
    ctx.globalAlpha = t <= 0 ? 0.3 * ghostIn : easeOutCubic(Math.min(1, t * 3));
    ctx.font = `${isCurrent ? 700 : 600} ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = (t <= 0) ? THEME.textFaint : (isCurrent ? THEME.text : THEME.textDim);
    ctx.textAlign = "center";
    ctx.fillText(item.label, baseP.x, baseP.y + unit * 1.5);

    if (t > 0) {
        // Value chip at top of column
        const topWorld = new THREE.Vector3(colX(i), maxBarH3D * (item.value / maxVal) * growBar, 0);
        const topP = projectToRect(cam, topWorld, rect);
        
        ctx.font = `800 ${valuePx}px ${FONT_SANS}`;
        ctx.fillStyle = THEME.text;
        ctx.fillText(valueLabel(item.value, item.unit, grow), topP.x, topP.y - unit * 0.7);
    }
    ctx.restore();
  });
}

/** Line / area chart: a point plots per beat, segments draw on, tip carries a value chip. */
function paintLineArea(ctx: CanvasRenderingContext2D, scene: ChartScene, env: PaintEnv, area: boolean) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const n = scene.items.length;
  const maxVal = Math.max(...scene.items.map((i) => i.value), 1e-9);

  const plotTop = contentY + band + unit * 0.9; // value chips ride above the highest point
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
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
  ctx.globalAlpha = ghostIn;
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1.5;
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
    const grad = ctx.createLinearGradient(0, plotTop, 0, baseY);
    grad.addColorStop(0, rgba(accent, 0.35));
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
    const allIn = shown.length === n;
    if (allIn) flowDots(ctx, shown.map((p) => ({ x: p.x, y: p.y })), env, { count: 2, speedMs: 2600, r: unit * 0.13, color: accent });
  }

  // Dots, x labels, and the value chip on the newest point.
  const newest = shown.length ? shown[shown.length - 1] : undefined;
  pts.forEach((p) => {
    if (p.t <= 0) {
      if (ghostIn > 0) {
        ctx.save();
        ctx.globalAlpha = 0.3 * ghostIn;
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
    ctx.globalAlpha = appear;
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
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.fillText(text, chipX, chipY + unit * 0.78);
    ctx.restore();
  }
}

/** Pie / donut: each slice sweeps its arc on its beat; active slice pulls out. */
function paintPie(ctx: CanvasRenderingContext2D, scene: ChartScene, env: PaintEnv, donut: boolean) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const plotTop = contentY + band;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const plotH = safeBottom - plotTop;
  const cx = contentX + contentW / 2;
  const cy = plotTop + plotH / 2;
  const R = Math.min(contentW * 0.4, plotH * 0.42);
  const rInner = donut ? R * 0.56 : 0;
  const total = scene.items.reduce((acc, it) => acc + it.value, 0) || 1;

  // Alternate accent / secondary with a stepped alpha so adjacent slices differ.
  const sliceColor = (i: number) => {
    const base = i % 2 === 0 ? accent : secondary;
    return rgba(base, clamp01(0.9 - Math.floor(i / 2) * 0.13));
  };

  let ang = -Math.PI / 2; // start at 12 o'clock
  let runningTotal = 0;
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
    ang += slice; // advance by the FULL slice so positions stay stable
  });

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
    ctx.textAlign = l.x < cx ? "end" : "start";
    ctx.font = `700 ${unit * (vertical ? 0.68 : 0.6)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(l.text, l.x, l.y);
    ctx.font = `600 ${unit * (vertical ? 0.6 : 0.54)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`${l.pct}%`, l.x, l.y + unit * 0.75);
    ctx.textAlign = "start";
    ctx.restore();
  }
}

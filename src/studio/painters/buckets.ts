import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
  shade,
  stagger,
  STROKE,
  RADIUS,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

type BucketsScene = Extract<Scene, { kind: "buckets" }>;
type Pt = { x: number; y: number };

const FILL_FRAC = 0.85;
const FULL_EPS = 1e-9;
const BUCKET_FILL = 0.7;

export function paintBuckets(ctx: CanvasRenderingContext2D, scene: BucketsScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.pours.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const leave = departT(env, 380);
  if (leave <= 0) return;
  const ghostIn = easeOutCubic(enterT(env, 400)) * leave;

  const wholes =
    scene.buckets.every((b) => Number.isInteger(b.capacity)) && scene.pours.every((p) => Number.isInteger(p.amount));
  const u = scene.unit.trim();
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (v: number): string => {
    const body = wholes
      ? Math.round(v).toLocaleString(locale)
      : v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (/^[₹$€£]$/.test(u)) return `${u}${body}`;
    return u ? `${body} ${u}` : body;
  };

  let poured = 0;
  let flowing = false;
  scene.pours.forEach((pour, k) => {
    const bk = offset + k;
    if (active > bk) {
      poured += pour.amount;
    } else if (active === bk) {
      const t = beatT(env.beats, bk, totalBeats, env.p);
      poured += pour.amount * easeInOutCubic(clamp01(t / FILL_FRAC));
      if (t < 1) flowing = true;
    }
  });

  let rem = poured;
  const fills = scene.buckets.map((b) => {
    const f = Math.min(rem, b.capacity);
    rem = Math.max(0, rem - b.capacity);
    return f;
  });
  let fillingIndex = fills.findIndex((f, i) => f < scene.buckets[i].capacity - FULL_EPS);
  if (fillingIndex === -1) fillingIndex = scene.buckets.length - 1;

  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const ah = contentH - band;
  const topPad = unit * 1.7;
  const labelH = unit * (vertical ? 2.6 : 2.3);
  const areaTop = ay + topPad;
  const baseline = ay + ah - labelH;

  const n = scene.buckets.length;
  const maxCap = Math.max(...scene.buckets.map((b) => b.capacity), 1e-9);
  const maxContainerH = baseline - areaTop;
  const colW = aw / n;
  const bucketW = colW * BUCKET_FILL;
  const bucketCx = (i: number) => ax + i * colW + colW / 2;
  const containerH = (i: number) => clamp01(scene.buckets[i].capacity / maxCap) * maxContainerH * 0.58 + maxContainerH * 0.42;
  const containerTop = (i: number) => baseline - containerH(i);
  const fillAmt = (i: number) => clamp01(fills[i] / scene.buckets[i].capacity);
  const liquidTop = (i: number) => baseline - containerH(i) * fillAmt(i);

  // Siblings enter on a stagger, not all on the same tick (rubric axis 3).
  const ghostIns = scene.buckets.map((_, i) => easeOutCubic(enterT(env, 400, stagger(i, n))) * leave);

  const get2D = (i: number, isTop: boolean): Pt => ({ x: bucketCx(i), y: isTop ? containerTop(i) : liquidTop(i) });
  const get2DBottom = (i: number): Pt => ({ x: bucketCx(i), y: baseline + unit * 0.3 });

  // Containers + liquid, drawn directly in 2D — the camera was already exactly
  // on-axis, so nothing about the removed "glass block" needed a 3D projection
  // to line up with these 2D overlays in the first place.
  ctx.save();
  scene.buckets.forEach((bucket, i) => {
    const gIn = ghostIns[i];
    if (gIn <= 0) return;
    const isFilling = flowing && i === fillingIndex;
    const full = fills[i] >= bucket.capacity - FULL_EPS && fills[i] > 0;
    const cTop = containerTop(i);
    const cx0 = bucketCx(i) - bucketW / 2;

    ctx.save();
    ctx.globalAlpha = gIn;
    roundRect(ctx, cx0, cTop, bucketW, baseline - cTop, unit * 0.25);
    ctx.fillStyle = rgba(THEME.textDim, 0.05);
    ctx.fill();
    ctx.strokeStyle = rgba(isFilling ? accent : THEME.textDim, isFilling ? 0.8 : 0.4);
    ctx.lineWidth = unit * STROKE.thin;
    ctx.stroke();

    const fa = fillAmt(i);
    if (fa > 0) {
      const bob = isFilling ? unit * 0.05 * Math.sin(env.elapsedMs / 100) : 0;
      const lTop = liquidTop(i) + bob;
      ctx.save();
      roundRect(ctx, cx0 + bucketW * 0.025, lTop, bucketW * 0.95, baseline + bob - lTop, unit * 0.2);
      ctx.clip();
      ctx.globalAlpha = gIn * 0.9;
      ctx.fillStyle = full ? THEME.good : accent;
      ctx.fillRect(cx0, lTop, bucketW, baseline + bob - lTop + unit * 0.3);
      ctx.restore();
    }
    ctx.restore();
  });
  ctx.restore();

  // 2D overlays
  ctx.save();
  ctx.globalAlpha = ghostIn;

  scene.buckets.forEach((bucket, i) => {
    const isFilling = flowing && i === fillingIndex;
    const has = fills[i] > 0;
    const gIn = ghostIns[i];

    // Rate chip
    if (bucket.rate) {
      const topP = get2D(i, true);
      ctx.save();
      ctx.globalAlpha = gIn * (isFilling ? 1 : 0.8);
      ctx.font = `800 ${unit * 0.6}px ${FONT_MONO}`;
      const rw = ctx.measureText(bucket.rate).width + unit * 0.6;
      const rx = topP.x - rw / 2;
      const ryc = topP.y - unit * 1.0;
      roundRect(ctx, rx, ryc - unit * 0.5, rw, unit * 1.0, unit * RADIUS.md);
      ctx.fillStyle = THEME.bgBottom;
      ctx.fill();
      ctx.strokeStyle = rgba(accent, 0.55);
      ctx.lineWidth = unit * STROKE.hair;
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.textAlign = "center";
      ctx.fillText(bucket.rate, topP.x, ryc + unit * 0.22);
      ctx.textAlign = "start";
      ctx.restore();
    }

    // Labels
    const botP = get2DBottom(i);
    ctx.save();
    ctx.globalAlpha = gIn * (isFilling ? 1 : has ? 0.9 : 0.55);
    ctx.textAlign = "center";
    const bw2D = contentW / n * 0.8;
    const lpx = fitFontSize(ctx, bucket.label, { maxW: bw2D, startPx: unit * 0.72, minPx: unit * 0.5, weight: 700 });
    ctx.font = `700 ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = isFilling ? THEME.text : THEME.textDim;
    ctx.fillText(bucket.label, botP.x, botP.y + unit * 1.0);
    const amt = fmt(fills[i]);
    ctx.font = `800 ${unit * (vertical ? 0.8 : 0.72)}px ${FONT_MONO}`;
    ctx.fillStyle = has ? (isFilling ? accent : THEME.text) : THEME.textFaint;
    ctx.fillText(amt, botP.x, botP.y + unit * 1.9);
    ctx.textAlign = "start";
    ctx.restore();
  });

  // Overflow 2D waterfall effects
  if (flowing) {
    for (let i = 0; i < fillingIndex; i++) {
      if (fills[i] < scene.buckets[i].capacity - FULL_EPS) continue;
      const fromP = get2D(i, true);
      const toP = get2D(i + 1, false);
      // Offset slightly to represent edge of bucket
      const bw2D = contentW / n * 0.4;
      fromP.x += bw2D;

      const midX = (fromP.x + toP.x) / 2;
      ctx.save();
      ctx.globalAlpha = ghostIn * 0.85;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
      ctx.strokeStyle = shade(accent, 0.82);
      ctx.lineWidth = unit * 0.16;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(fromP.x, fromP.y);
      ctx.quadraticCurveTo(midX, fromP.y - unit * 0.15, toP.x, toP.y);
      ctx.stroke();

      for (let d = 0; d < 3; d++) {
        const f = (env.elapsedMs / 600 + d / 3) % 1;
        const dx = fromP.x + (toP.x - fromP.x) * f;
        const dy = fromP.y + (toP.y - fromP.y) * f * f;
        ctx.globalAlpha = ghostIn * Math.sin(Math.PI * f);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(dx, dy, unit * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Pour stream into the frontier bucket
    const sP = get2D(fillingIndex, false);
    ctx.save();
    ctx.globalAlpha = ghostIn;
    const sg = ctx.createLinearGradient(0, areaTop - unit * 0.6, 0, sP.y);
    sg.addColorStop(0, rgba(accent, 0.15));
    sg.addColorStop(1, rgba(accent, 0.7));
    ctx.strokeStyle = sg;
    ctx.lineWidth = unit * 0.28;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sP.x, areaTop - unit * 0.6);
    ctx.lineTo(sP.x, sP.y);
    ctx.stroke();
    for (let d = 0; d < 3; d++) {
      const f = (env.elapsedMs / 420 + d / 3) % 1;
      const dy = areaTop - unit * 0.6 + (sP.y - (areaTop - unit * 0.6)) * f;
      ctx.globalAlpha = ghostIn * Math.sin(Math.PI * f);
      ctx.fillStyle = shade(accent, 0.82);
      ctx.beginPath();
      ctx.arc(sP.x + Math.sin(env.elapsedMs / 200 + d) * unit * 0.1, dy, unit * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Running total chip
  const totalText = `${fmt(poured)}`;
  const totPx = unit * (vertical ? 0.9 : 0.82);
  ctx.save();
  ctx.globalAlpha = ghostIn;
  const labelTxt = "Total ";
  ctx.font = `800 ${totPx}px ${FONT_MONO}`;
  const tw = ctx.measureText(totalText).width;
  ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
  const lw = ctx.measureText(labelTxt).width;
  const chipW = lw + tw + unit * 1.2;
  const chipX = ax + aw / 2 - chipW / 2;
  const chipY = ay + unit * 0.15;
  if (flowing) {
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.35 + 0.45 * idle(env, 1700));
  } else if (poured > 0) {
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.15 + 0.25 * idle(env, 2600));
  }
  const chipH = totPx * 1.45;
  roundRect(ctx, chipX, chipY, chipW, chipH, unit * RADIUS.md);
  ctx.fillStyle = THEME.bgBottom;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(accent, 0.5);
  ctx.lineWidth = unit * STROKE.hair;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.fillText(labelTxt, chipX + unit * 0.6, chipY + chipH * 0.66);
  ctx.font = `800 ${totPx}px ${FONT_MONO}`;
  ctx.fillStyle = accent;
  ctx.fillText(totalText, chipX + unit * 0.6 + lw, chipY + chipH * 0.68);
  ctx.textAlign = "start";
  ctx.restore();

  ctx.restore();
}

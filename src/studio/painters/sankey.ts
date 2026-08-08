import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  pointAlongPolyline,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
  seriesTints,
  shade,
  lerpColor,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

type SankeyScene = Extract<Scene, { kind: "sankey" }>;
type Pt = { x: number; y: number };
type Block = { x: number; y: number; w: number; h: number; cx: number; cy: number };
type Ribbon = { top: Pt[]; bot: Pt[]; center: Pt[]; tint: string };

const SAMPLES = 24;
const GROW_SPAN = 0.55;
const ARRIVE_AT = 0.75;
// Captions sit in the bottom ~14% of vertical frames; keep branch blocks above.
const CAPTION_SAFE_Y = 0.86;
// Breathing room reserved between two adjacent branch label/value slots, as a
// fraction of unit. Sized against the nearest-neighbour screen gap so two
// narrow branches converging close together (e.g. two 20% slices side by
// side) shrink their text instead of overlapping it.
const LABEL_GUTTER = 0.35;
const THICK_UNITS = 1.3;
const GAP_UNITS = 0.5;
const IDLE_FACE_LIFT = 0.1;

function branchTints(accent: string, secondary: string): string[] {
  return seriesTints(accent, secondary, 6);
}

function sampleCubic(p0: Pt, c1: Pt, c2: Pt, p1: Pt): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const mt = 1 - t;
    pts.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y,
    });
  }
  return pts;
}

const lerpPt = (a: Pt, b: Pt, f: number): Pt => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });

/** Close the band up to fraction e of its samples with a straight cap; returns the cap. */
function bandPath(ctx: CanvasRenderingContext2D, top: Pt[], bot: Pt[], e: number): { capTop: Pt; capBot: Pt } {
  const last = top.length - 1;
  const pos = clamp01(e) * last;
  const idx = Math.min(Math.floor(pos), last - 1);
  const frac = pos - idx;
  const capTop = pos >= last ? top[last] : lerpPt(top[idx], top[idx + 1], frac);
  const capBot = pos >= last ? bot[last] : lerpPt(bot[idx], bot[idx + 1], frac);
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  for (let i = 1; i <= idx; i++) ctx.lineTo(top[i].x, top[i].y);
  ctx.lineTo(capTop.x, capTop.y);
  ctx.lineTo(capBot.x, capBot.y);
  for (let i = idx; i >= 0; i--) ctx.lineTo(bot[i].x, bot[i].y);
  ctx.closePath();
  return { capTop, capBot };
}

function strokeCurve(ctx: CanvasRenderingContext2D, pts: Pt[], e: number, cap: Pt) {
  const last = pts.length - 1;
  const idx = Math.min(Math.floor(clamp01(e) * last), last - 1);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i <= idx; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineTo(cap.x, cap.y);
  ctx.stroke();
}

const mkBlock = (x: number, y: number, w: number, h: number): Block => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });

export function paintSankey(ctx: CanvasRenderingContext2D, scene: SankeyScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.branches.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const ah = safeBottom - ay;
  const n = scene.branches.length;
  const total = scene.source.total;
  const tints = branchTints(accent, secondary);

  const u = (scene.source.unit ?? "").trim();
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (target: number, t: number): string => {
    const v = target * clamp01(t);
    const text = Number.isInteger(target) ? Math.round(v).toLocaleString(locale) : v.toFixed(1);
    if (/^[₹$€£]$/.test(u)) return `${u}${text}`;
    return u ? `${text}${u.startsWith("%") ? u : ` ${u}`}` : text;
  };

  const ghostIn = easeOutCubic(enterT(env, 420));
  const thick = unit * THICK_UNITS;
  const gap = unit * GAP_UNITS;

  // Flat 2D layout: no genuine 3D content here, just a source bar splitting
  // into proportional branch bars — the same split-and-flow idea every sankey
  // diagram uses, so it is laid out directly in pixel space with no camera.
  let srcBlock: Block;
  const branchBlocks: Block[] = [];
  if (!vertical) {
    const usableH = ah * 0.82;
    const centerY = ay + ah / 2;
    const srcCx = ax + aw * 0.08;
    const branchCx = ax + aw * 0.84;
    srcBlock = mkBlock(srcCx - thick / 2, centerY - usableH / 2, thick, usableH);
    const availH = usableH - gap * (n - 1);
    let cumY = centerY - usableH / 2;
    scene.branches.forEach((b) => {
      const h = (b.value / total) * availH;
      branchBlocks.push(mkBlock(branchCx - thick / 2, cumY, thick, h));
      cumY += h + gap;
    });
  } else {
    const usableW = aw * 0.82;
    const centerX = ax + aw / 2;
    const srcCy = ay + ah * 0.1;
    const branchCy = ay + ah * 0.82;
    srcBlock = mkBlock(centerX - usableW / 2, srcCy - thick / 2, usableW, thick);
    const availW = usableW - gap * (n - 1);
    let cumX = centerX - usableW / 2;
    scene.branches.forEach((b) => {
      const w = (b.value / total) * availW;
      branchBlocks.push(mkBlock(cumX, branchCy - thick / 2, w, thick));
      cumX += w + gap;
    });
  }

  // Screen-space gap to the nearest neighbouring branch, per branch — caps how
  // wide a label/value row may grow so close-together branches never collide
  // (measured defect: two adjacent 20% branches overlapped their text at 9:16).
  const branchAxis = branchBlocks.map((bb) => (vertical ? bb.cx : bb.cy));
  const branchSlotPx = branchAxis.map((v, i) => {
    const left = i > 0 ? Math.abs(v - branchAxis[i - 1]) : Infinity;
    const right = i < n - 1 ? Math.abs(branchAxis[i + 1] - v) : Infinity;
    return Math.min(left, right);
  });

  const times = scene.branches.map((_, i) => beatT(env.beats, offset + i, totalBeats, env.p));

  const ribbons: Ribbon[] = [];
  let srcCum = vertical ? srcBlock.x : srcBlock.y;
  scene.branches.forEach((b, i) => {
    const br = branchBlocks[i];
    let top: Pt[], bot: Pt[];
    if (!vertical) {
      const segH = (b.value / total) * srcBlock.h;
      const y1 = srcCum;
      const y2 = srcCum + segH;
      srcCum += segH;
      const pSrc1 = { x: srcBlock.x + srcBlock.w, y: y1 };
      const pSrc2 = { x: srcBlock.x + srcBlock.w, y: y2 };
      const pDst1 = { x: br.x, y: br.y };
      const pDst2 = { x: br.x, y: br.y + br.h };
      const cx1 = (pSrc1.x + pDst1.x) / 2;
      const cx2 = (pSrc2.x + pDst2.x) / 2;
      top = sampleCubic(pSrc1, { x: cx1, y: pSrc1.y }, { x: cx1, y: pDst1.y }, pDst1);
      bot = sampleCubic(pSrc2, { x: cx2, y: pSrc2.y }, { x: cx2, y: pDst2.y }, pDst2);
    } else {
      const segW = (b.value / total) * srcBlock.w;
      const x1 = srcCum;
      const x2 = srcCum + segW;
      srcCum += segW;
      const pSrc1 = { x: x1, y: srcBlock.y + srcBlock.h };
      const pSrc2 = { x: x2, y: srcBlock.y + srcBlock.h };
      const pDst1 = { x: br.x, y: br.y };
      const pDst2 = { x: br.x + br.w, y: br.y };
      const cy1 = (pSrc1.y + pDst1.y) / 2;
      const cy2 = (pSrc2.y + pDst2.y) / 2;
      top = sampleCubic(pSrc1, { x: pSrc1.x, y: cy1 }, { x: pDst1.x, y: cy1 }, pDst1);
      bot = sampleCubic(pSrc2, { x: pSrc2.x, y: cy2 }, { x: pDst2.x, y: cy2 }, pDst2);
    }
    ribbons.push({ top, bot, center: top.map((p, j) => lerpPt(p, bot[j], 0.5)), tint: tints[i % tints.length] });
  });

  // Ribbons drawing
  scene.branches.forEach((b, i) => {
    const t = times[i];
    if (t <= 0) return;
    const rb = ribbons[i];
    const e = easeInOutCubic(clamp01(t / GROW_SPAN));
    const isActive = active === offset + i && t < 1;
    ctx.save();
    ctx.globalAlpha = leave;
    const p0 = rb.top[0];
    const p1 = rb.top[rb.top.length - 1];
    const grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    grad.addColorStop(0, rgba(rb.tint, 0.16));
    grad.addColorStop(1, rgba(rb.tint, 0.42));
    const { capTop, capBot } = bandPath(ctx, rb.top, rb.bot, e);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = rgba(rb.tint, 0.35);
    ctx.lineWidth = unit * 0.05;
    strokeCurve(ctx, rb.top, e, capTop);
    strokeCurve(ctx, rb.bot, e, capBot);
    if (isActive && e < 1) {
      ctx.strokeStyle = rb.tint;
      ctx.lineWidth = unit * 0.1;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
      ctx.beginPath();
      ctx.moveTo(capTop.x, capTop.y);
      ctx.lineTo(capBot.x, capBot.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (isActive && e > 0.15) {
      for (let d = 0; d < 2; d++) {
        const f = (((env.elapsedMs % 1400) / 1400) + d * 0.5) % 1;
        const dot = pointAlongPolyline(rb.center, f * e);
        ctx.globalAlpha = 0.85 * Math.sin(Math.PI * f) * leave;
        ctx.fillStyle = THEME.text;
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.6;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    if (t >= 1) {
      const f = (env.elapsedMs / 2400 + i * 0.17) % 1;
      const dot = pointAlongPolyline(rb.center, f);
      ctx.globalAlpha = 0.5 * Math.sin(Math.PI * f) * leave;
      ctx.fillStyle = rb.tint;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, unit * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  // Source block, drawn directly in 2D.
  ctx.save();
  ctx.globalAlpha = ghostIn * leave;
  roundRect(ctx, srcBlock.x, srcBlock.y, srcBlock.w, srcBlock.h, Math.min(unit * 0.3, thick * 0.3));
  ctx.fillStyle = shade(THEME.panel, IDLE_FACE_LIFT);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.6);
  ctx.lineWidth = unit * 0.05;
  ctx.stroke();
  ctx.restore();

  // Branch blocks, drawn directly in 2D — the active one lifts and brightens
  // in place of the removed 3D pop/face-swap.
  scene.branches.forEach((b, i) => {
    const t = times[i];
    const arriveT = Math.max(0, clamp01((t - ARRIVE_AT) / 0.18));
    if (arriveT <= 0) return;
    const br = branchBlocks[i];
    const isActive = active === offset + i && t < 1;
    const pop = easeOutBack(arriveT);
    const scale = Math.max(0.001, 0.85 + 0.15 * pop);
    const lift = isActive ? unit * 0.12 : 0;
    ctx.save();
    ctx.globalAlpha = clamp01(arriveT * 1.4) * leave;
    ctx.translate(br.cx, br.cy - lift);
    ctx.scale(scale, scale);
    ctx.translate(-br.cx, -(br.cy - lift));
    if (isActive) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.5 + 0.3 * idle(env, 900));
    }
    roundRect(ctx, br.x, br.y - lift, br.w, br.h, Math.min(unit * 0.3, thick * 0.3));
    ctx.fillStyle = isActive ? lerpColor(THEME.panel, tints[i % tints.length], 0.3) : shade(THEME.panel, IDLE_FACE_LIFT);
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, br.x, br.y - lift, br.w, br.h, Math.min(unit * 0.3, thick * 0.3));
    ctx.strokeStyle = rgba(tints[i % tints.length], isActive ? 0.9 : 0.5);
    ctx.lineWidth = unit * 0.05;
    ctx.stroke();
    ctx.restore();
  });

  // Source block text overlay
  ctx.save();
  ctx.globalAlpha = ghostIn * leave;
  ctx.textAlign = "center";
  const scx = srcBlock.cx;
  const scy = srcBlock.cy;
  const srcPx = vertical ? aw * 0.35 : aw * 0.15;
  const slpx = fitFontSize(ctx, scene.source.label, { maxW: srcPx, startPx: unit * 0.8, minPx: unit * 0.4, weight: 600 });
  ctx.font = `600 ${slpx}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.fillText(scene.source.label, scx, scy - unit * 0.55);
  const totText = fmt(total, easeOutCubic(enterT(env, 700, 150)));
  const stpx = fitFontSize(ctx, fmt(total, 1), {
    maxW: srcPx,
    startPx: unit * 1.05,
    minPx: unit * 0.55,
    weight: 800,
    family: FONT_MONO,
  });
  ctx.font = `800 ${stpx}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.text;
  ctx.fillText(totText, scx, scy + unit * 0.5);
  ctx.restore();

  // Branch block text overlays
  scene.branches.forEach((b, i) => {
    const t = times[i];
    if (t <= ARRIVE_AT * 0.6) return;
    const pop = easeOutBack(clamp01((t - ARRIVE_AT) / 0.18));
    if (pop <= 0) return;
    const br = branchBlocks[i];
    const isActive = active === offset + i && t < 1;
    const lift = isActive ? unit * 0.12 : 0;
    const bcy = br.cy - lift;

    ctx.save();
    ctx.globalAlpha = clamp01(pop * 1.4) * leave;
    ctx.textAlign = "center";
    const bcx = br.cx;

    const slotPx = Math.max(unit * 1.2, branchSlotPx[i] - unit * LABEL_GUTTER);
    const branchPx = Math.min(vertical ? aw * 0.25 : aw * 0.15, slotPx);
    const lpx = fitFontSize(ctx, b.label, { maxW: branchPx, startPx: unit * 0.75, minPx: unit * 0.45, weight: 700 });
    ctx.font = `700 ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(b.label, bcx, bcy - unit * 0.2);

    const cIn = clamp01((t - (1 - 0.4)) / 0.4);
    if (cIn > 0) {
      const pctText = `${Math.round((b.value / total) * 100)}%`;
      const valText = fmt(b.value, easeOutCubic(cIn));
      ctx.globalAlpha *= easeOutCubic(cIn);
      const rowGap = unit * 0.55 + unit * 0.35;
      const rowSlot = Math.min(vertical ? aw * 0.25 : aw * 0.15, slotPx);
      let pctPx = unit * 0.6;
      let valPx = unit * 0.72;
      ctx.font = `800 ${pctPx}px ${FONT_MONO}`;
      let pw = ctx.measureText(pctText).width;
      ctx.font = `700 ${valPx}px ${FONT_MONO}`;
      let vw = ctx.measureText(valText).width;
      let rowW = pw + rowGap + vw;
      if (rowW > rowSlot) {
        // Shrink both tiers together, keeping their ratio, rather than
        // letting the row overflow into the next branch's slot.
        const scale = Math.max(0.55, rowSlot / rowW);
        pctPx *= scale;
        valPx *= scale;
        ctx.font = `800 ${pctPx}px ${FONT_MONO}`;
        pw = ctx.measureText(pctText).width;
        ctx.font = `700 ${valPx}px ${FONT_MONO}`;
        vw = ctx.measureText(valText).width;
        rowW = pw + rowGap + vw;
      }
      const rowX = bcx - rowW / 2;
      const rowY = bcy + unit * 0.8;

      const tint = tints[i % tints.length];
      roundRect(ctx, rowX - unit * 0.12, rowY - unit * 0.52, pw + unit * 0.55, unit * 0.95, unit * 0.28);
      ctx.fillStyle = rgba(tint, 0.18);
      ctx.fill();
      ctx.textAlign = "start";
      ctx.font = `800 ${pctPx}px ${FONT_MONO}`;
      ctx.fillStyle = tint;
      ctx.fillText(pctText, rowX + unit * 0.15, rowY + unit * 0.18);
      ctx.font = `700 ${valPx}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.text;
      ctx.fillText(valText, rowX + pw + unit * 0.55 + unit * 0.35, rowY + unit * 0.22);
    }
    ctx.textAlign = "start";
    ctx.restore();
  });
}

import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  clamp01,
  sub,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  wrapText,
  beatT,
  activeBeatIndex,
  isoBox,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type ScalecompareScene = Extract<Scene, { kind: "scalecompare" }>;

/**
 * Overlaps scaled silhouettes of real-world magnitudes (waterfall heights,
 * trade-route lengths, latency ratios) on one shared baseline so the size gap
 * reads instantly, then narrates each one in with a counting value and a live
 * "N× bigger" callout. Generalizes "A vs B: which is bigger" and "if X were 1
 * unit, Y would take..." videos — anything reducible to {label, value, unit}.
 */

/** Bars overlap their neighbour's slot by this fraction of the slot width —
 *  enough to read as overlaid silhouettes without a larger revealed item
 *  fully swallowing a smaller one drawn after it. */
const OVERLAP = 0.42;
/** Even a value dwarfed by the rest keeps this fraction of the max extent, so
 *  it stays a visible sliver instead of a literal zero-height bar (the whole
 *  point when the story IS "this is almost nothing next to that"). */
const MIN_VISUAL_FRAC = 0.035;
/** Below this max/min ratio, call it a tie instead of printing "x1.0". */
const TIE_RATIO = 1.05;

/** Count-up formatted value: whole numbers stay whole, else one decimal. */
function fmtNum(target: number, t: number): string {
  const v = target * t;
  return Number.isInteger(target) ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
}

/** Linear or log-compressed 0-1 fraction of value against the group max.
 *  Log keeps a value orders of magnitude smaller than the max from vanishing
 *  to literally nothing (CPU-cycle-vs-disk-read-scale gaps). */
function scaledFrac(value: number, maxValue: number, log: boolean): number {
  if (maxValue <= 0) return 0;
  if (!log) return clamp01(value / maxValue);
  const den = Math.log10(maxValue + 1);
  return den <= 0 ? 0 : clamp01(Math.log10(value + 1) / den);
}

/** Dark rounded chip used for every floating label in this scene. */
function pillBg(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, border: string, alpha: number) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgba(9,14,20,0.86)";
  ctx.fill();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = rgba(border, alpha);
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.stroke();
}

export function paintScalecompare(ctx: CanvasRenderingContext2D, scene: ScalecompareScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const items = scene.items;
  const n = items.length;
  const axis = scene.axis;
  const log = scene.scale === "log";
  const offset = introBeatCount(scene);
  const hasVerdictBeat = !!scene.sayVerdict;
  const totalBeats = offset + n + (hasVerdictBeat ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset; // -1 intro, 0..n-1 an item's beat, n verdict
  const introIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.4;
  // Reserved up-front (not only once triggered) so the silhouette geometry
  // below never has to shift when the ratio badge pops in mid-scene.
  const ratioBandH = unit * (vertical ? 1.55 : 1.25);
  const areaTop = contentY + band + ratioBandH;
  // A verdict caption sits below the bars, so their floor must leave room for
  // it instead of running to the very bottom of the content box.
  const verdictH = scene.verdict ? unit * 2.4 : 0;
  const bottom = vertical
    ? Math.min(contentY + contentH, layout.h * 0.86) - verdictH
    : contentY + contentH - verdictH;
  const areaH = Math.max(unit * 4, bottom - areaTop);

  const stepT = activeStep >= 0 && activeStep < n ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : activeStep >= n ? 1 : 0;
  const revealed = activeStep < 0 ? 0 : Math.min(n, activeStep + easeOutCubic(clamp01(stepT * 1.5)));
  const localOf = (i: number) => clamp01(revealed - i);

  const maxValue = Math.max(...items.map((it) => it.value), 1e-9);
  let maxIdx = 0;
  items.forEach((it, i) => {
    if (it.value > items[maxIdx].value) maxIdx = i;
  });

  // ---- Geometry: "height" bars rise from a shared floor; "length" bars grow
  // from a shared left edge. Chosen by the concept (falls/towers vs
  // routes/durations), independent of the frame's own aspect ratio. ----
  let groundY = 0, groundX = 0, maxBarH = 0, maxBarW = 0, barW = 0, barH = 0;
  const centerX = (i: number) => contentX + (i + 0.5) * (contentW / n);
  const centerY = (i: number) => areaTop + (i + 0.5) * (areaH / n);
  if (axis === "height") {
    groundY = areaTop + areaH - unit * 0.15;
    maxBarH = Math.max(unit * 2, areaH - unit * 2.6);
    const gapX = contentW / n;
    barW = Math.min(Math.max(gapX * (1 + OVERLAP), unit * 2.0), unit * 6.0);
  } else {
    groundX = contentX + unit * 0.15;
    maxBarW = Math.max(unit * 3, contentW - unit * 4.4);
    const gapY = areaH / n;
    barH = Math.min(Math.max(gapY * (1 + OVERLAP), unit * 1.4), unit * 3.0);
  }

  type Rect = { x: number; y: number; w: number; h: number };
  const rectFor = (i: number, frac: number): Rect =>
    axis === "height"
      ? { x: centerX(i) - barW / 2, y: groundY - maxBarH * frac, w: barW, h: maxBarH * frac }
      : { x: groundX, y: centerY(i) - barH / 2, w: maxBarW * frac, h: barH };
  const tipOf = (r: Rect) => (axis === "height" ? { x: r.x + r.w / 2, y: r.y } : { x: r.x + r.w, y: r.y + r.h / 2 });

  // Ground line every silhouette shares — the whole point of the composition.
  ctx.save();
  ctx.globalAlpha = introIn * (0.35 + 0.25 * idle(env, 2600));
  ctx.strokeStyle = rgba(accent, 0.6);
  ctx.lineWidth = unit * 0.08;
  ctx.beginPath();
  if (axis === "height") {
    ctx.moveTo(contentX, groundY);
    ctx.lineTo(contentX + contentW, groundY);
  } else {
    ctx.moveTo(groundX, areaTop);
    ctx.lineTo(groundX, areaTop + areaH);
  }
  ctx.stroke();
  ctx.restore();

  // Faint reference ticks at 1/4, 1/2, 3/4 of the max extent (linear only —
  // evenly-spaced ticks on a log axis would misrepresent the scale).
  if (!log) {
    ctx.save();
    ctx.globalAlpha = introIn * 0.16;
    ctx.strokeStyle = THEME.textFaint;
    ctx.setLineDash([unit * 0.18, unit * 0.22]);
    ctx.lineWidth = unit * 0.045;
    [0.25, 0.5, 0.75].forEach((f) => {
      ctx.beginPath();
      if (axis === "height") {
        const y = groundY - maxBarH * f;
        ctx.moveTo(contentX, y);
        ctx.lineTo(contentX + contentW, y);
      } else {
        const x = groundX + maxBarW * f;
        ctx.moveTo(x, areaTop);
        ctx.lineTo(x, areaTop + areaH);
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Ghost slots for items whose beat hasn't started, so the full shape of the
  // comparison reads before narration gets to it.
  items.forEach((it, i) => {
    if (localOf(i) > 0) return;
    const ghostIn = enterT(env, 300, 100 + i * 60);
    if (ghostIn <= 0) return;
    const r = rectFor(i, Math.max(scaledFrac(it.value, maxValue, log), MIN_VISUAL_FRAC));
    ctx.save();
    ctx.globalAlpha = 0.12 * introIn * easeOutCubic(ghostIn);
    ctx.strokeStyle = "rgba(148,163,184,0.9)";
    ctx.lineWidth = unit * 0.05;
    ctx.setLineDash([unit * 0.26, unit * 0.22]);
    roundRect(ctx, r.x, r.y, Math.max(r.w, unit * 0.3), Math.max(r.h, unit * 0.3), unit * 0.25);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  });

  // Silhouettes, drawn back-to-front by DESCENDING value so a revealed larger
  // item never fully hides a smaller one that is drawn after it in narration
  // order; position on the shared axis still follows narration order.
  const order = items
    .map((_, i) => i)
    .filter((i) => localOf(i) > 0)
    .sort((a, b) => items[b].value - items[a].value);

  order.forEach((i) => {
    const it = items[i];
    const l = localOf(i);
    const isActive = i === activeStep;
    const isHero = i === maxIdx;
    const appear = easeOutCubic(l);
    const sizeGrow = easeOutBack(clamp01(l * 1.15));
    const countT = easeOutCubic(clamp01(l * 1.6));
    const frac = Math.max(scaledFrac(it.value, maxValue, log), MIN_VISUAL_FRAC) * sizeGrow;
    const r = rectFor(i, frac);
    const face = isHero ? accent : secondary;
    const depth = unit * (axis === "height" ? 0.4 : 0.32);

    ctx.save();
    ctx.globalAlpha = introIn * appear;
    if (isActive) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.6 + 0.5 * idle(env, 1500));
    }
    isoBox(ctx, r.x, r.y, Math.max(r.w, unit * 0.25), Math.max(r.h, unit * 0.25), depth, face);
    ctx.shadowBlur = 0;
    if (isActive) {
      roundRect(ctx, r.x - unit * 0.06, r.y - unit * 0.06, r.w + unit * 0.12, r.h + unit * 0.12, unit * 0.3);
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.08;
      ctx.globalAlpha = introIn * appear * (0.55 + 0.45 * idle(env, 1400));
      ctx.stroke();
    }
    ctx.restore();

    // Leader dot + label/value pill anchored to the silhouette's tip.
    const tip = tipOf(r);
    ctx.save();
    ctx.globalAlpha = introIn * appear;
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, unit * 0.14, 0, Math.PI * 2);
    ctx.fill();

    const valueText = `${fmtNum(it.value, countT)}${scene.unit ? ` ${scene.unit}` : ""}`;
    const labelPx = fitFontSize(ctx, it.label, { maxW: unit * 6.5, startPx: unit * 0.72, minPx: unit * 0.48, weight: 700 });
    const valuePx = Math.max(unit * 0.5, labelPx * 0.9);
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    const labelW = ctx.measureText(it.label).width;
    ctx.font = `800 ${valuePx}px ${FONT_MONO}`;
    const valueW = ctx.measureText(valueText).width;
    const iconW = it.icon ? labelPx * 1.1 : 0;
    const pillW = Math.max(labelW, valueW) + iconW + unit * 1.0;
    const pillH = labelPx + valuePx + unit * 0.65;
    const px = axis === "height" ? tip.x - pillW / 2 : tip.x + unit * 0.4;
    const py = axis === "height" ? tip.y - pillH - unit * 0.3 : tip.y - pillH / 2;
    pillBg(ctx, px, py, pillW, pillH, unit * 0.3, face, isActive ? 0.9 : 0.55);

    let tx = px + unit * 0.5;
    if (it.icon) {
      drawIcon(ctx, it.icon, tx + iconW / 2 - unit * 0.2, py + pillH / 2, labelPx * 1.3, env, face);
      tx += iconW;
    }
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(it.label, tx, py + labelPx + unit * 0.18);
    ctx.font = `800 ${valuePx}px ${FONT_MONO}`;
    ctx.fillStyle = face;
    ctx.fillText(valueText, tx, py + pillH - unit * 0.16);
    ctx.restore();
  });

  // Ratio callout: recomputed live from whichever items have SETTLED (not
  // mid-reveal), so it updates as the story adds items rather than only at
  // the very end.
  const settled = items.map((_, i) => i).filter((i) => localOf(i) >= 0.92);
  if (settled.length >= 2) {
    let hi = settled[0], lo = settled[0];
    settled.forEach((i) => {
      if (items[i].value > items[hi].value) hi = i;
      if (items[i].value < items[lo].value) lo = i;
    });
    if (items[hi].value > 0) {
      const ratio = items[hi].value / Math.max(items[lo].value, 1e-9);
      const label = ratio < TIE_RATIO ? "≈ about the same" : `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× bigger`;
      ctx.save();
      ctx.globalAlpha = introIn;
      ctx.font = `800 ${unit * 0.72}px ${FONT_SANS}`;
      const tw = ctx.measureText(label).width;
      const bw = tw + unit * 1.6, bh = unit * 1.15;
      const bx = contentX + contentW / 2 - bw / 2;
      const by = contentY + band + ratioBandH / 2 - bh / 2;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.4 + 0.4 * idle(env, 2000));
      pillBg(ctx, bx, by, bw, bh, bh / 2, accent, 0.8);
      ctx.shadowBlur = 0;
      ctx.fillStyle = accent;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx + bw / 2, by + bh / 2 + unit * 0.03);
      ctx.restore();
    }
  }

  // Closing verdict, mirroring compare.ts's checkmark pill.
  if (scene.verdict) {
    const verdictBeatIdx = offset + n;
    const t = hasVerdictBeat
      ? easeOutCubic(Math.min(1, beatT(env.beats, verdictBeatIdx, totalBeats, env.p) * 3))
      : easeOutCubic(sub(env.p, 0.8, 0.15));
    if (t > 0) {
      const pop = easeOutBack(t);
      ctx.save();
      ctx.globalAlpha = t;
      ctx.textAlign = "center";
      ctx.font = `700 ${unit * 0.9}px ${FONT_SANS}`;
      const ty = contentY + contentH - unit * (vertical ? 2.6 : 0.7);
      const lines = wrapText(ctx, scene.verdict, contentW * 0.9);
      const lineH = unit * 1.25;
      const totalH = lines.length * lineH;
      const startY = ty - (lines.length - 1) * lineH;
      ctx.translate(layout.w / 2, startY + totalH / 2 - lineH * 0.4);
      ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
      ctx.translate(-layout.w / 2, -(startY + totalH / 2 - lineH * 0.4));
      const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const padX = unit * 1.4, padY = unit * 0.7;
      ctx.fillStyle = rgba(accent, 0.1);
      ctx.strokeStyle = rgba(accent, 0.35);
      ctx.lineWidth = unit * 0.07;
      roundRect(ctx, layout.w / 2 - maxW / 2 - padX, startY - lineH * 0.75 - padY / 2, maxW + padX * 2, totalH + padY * 1.4, unit * 0.7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      lines.forEach((line, i) => ctx.fillText(line, layout.w / 2, startY + i * lineH));
      ctx.restore();
    }
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

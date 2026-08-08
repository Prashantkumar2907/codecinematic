import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  clamp01,
  wrapText,
  fitFontSize,
  roundRect,
  beatT,
  beatWindow,
  activeBeatIndex,
  departT,
  applyElevation,
  clearShadow,
  lerpColor,
} from "./common";
import type { PaintEnv } from "./index";

type BulletsScene = Extract<Scene, { kind: "bullets" }>;

const DIM_ALPHA = 0.55;
/** On 9:16 the bottom quarter is covered by the YouTube Shorts UI. */
const SHORTS_SAFE_BOTTOM = 0.75;
const SHORTS_SAFE_GAP = 0.8;
/** Tallest a row may get before the list stops stretching and centres instead. */
const MAX_ROW_PITCH = 4.0;
const ROW_H_UNITS = 3.0;
const ROW_GAP_UNITS = 0.5;
const PULSE_MS = 2200;

export function paintBullets(ctx: CanvasRenderingContext2D, scene: BulletsScene, env: PaintEnv) {
  const { layout } = env;
  const { h, unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStart = active >= 0 ? beatWindow(env.beats, active, totalBeats).start : 0;
  const dimE = easeOutCubic(clamp01(((env.p - activeStart) * env.durationMs) / 220));

  const leave = departT(env, 380);
  if (leave <= 0) return;

  const titleIn = easeOutCubic(enterT(env, 380));
  ctx.save();
  ctx.globalAlpha = titleIn * leave;
  ctx.translate((1 - titleIn) * -unit, 0);
  ctx.font = `800 ${unit * 1.7}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  const titleLines = wrapText(ctx, scene.title, contentW);
  titleLines.forEach((line, i) => ctx.fillText(line, contentX, contentY + unit * 1.6 + i * unit * 2.1));
  const titleBottom = contentY + unit * 1.6 + titleLines.length * unit * 2.1;
  ctx.fillStyle = accent;
  ctx.fillRect(contentX, titleBottom - unit * 0.5, unit * 3.4 * titleIn, unit * 0.22);
  ctx.restore();

  const n = scene.items.length;
  const listTop = titleBottom + unit * (vertical ? 1.6 : 1.0);
  // 0.86h put the last two of four bullets under the Shorts caption strip — half
  // the scene's content was invisible on the platform it is mainly made for.
  const listBottom = vertical
    ? Math.min(contentY + contentH, h * SHORTS_SAFE_BOTTOM - unit * SHORTS_SAFE_GAP)
    : contentY + contentH;
  const available = listBottom - listTop;
  const listH = Math.min(available, n * unit * MAX_ROW_PITCH);
  const pitch = listH / n;
  const listStart = listTop + (available - listH) / 2;

  const rowH = Math.min(unit * ROW_H_UNITS, pitch - unit * ROW_GAP_UNITS);

  scene.items.forEach((item, i) => {
    const beatIdx = offset + i;
    const t = beatT(env.beats, beatIdx, totalBeats, env.p);
    if (t <= 0) return;

    const msB = (env.p - beatWindow(env.beats, beatIdx, totalBeats).start) * env.durationMs;
    const appear = easeOutCubic(clamp01(msB / 320));
    const pop = easeOutBack(clamp01(msB / 320));
    const isCurrent = active === beatIdx;
    const alpha = (isCurrent ? 1 : 1 - (1 - DIM_ALPHA) * dimE) * leave;

    const rowY = listStart + i * pitch + (pitch - rowH) / 2;
    const cx = contentX + contentW / 2;
    const cy = rowY + rowH / 2;
    const slide = (1 - appear) * unit * 2.0;

    ctx.save();
    ctx.globalAlpha = appear * alpha;
    ctx.translate(cx + slide, cy);
    ctx.scale(Math.max(0.001, pop), Math.max(0.001, pop));
    ctx.translate(-cx, -cy);

    applyElevation(ctx, unit, isCurrent ? "floating" : "raised");
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7 * (0.75 + 0.25 * idle(env, PULSE_MS));
    }
    roundRect(ctx, contentX, rowY, contentW, rowH, unit * 0.45);
    // The active row's whole fill breathes — a border-only pulse covers too little
    // of the frame to register once a long list finishes entering and just holds.
    ctx.fillStyle = isCurrent ? lerpColor(THEME.panel, accent, 0.14 + 0.08 * idle(env, PULSE_MS)) : THEME.panel;
    ctx.fill();
    clearShadow(ctx);
    roundRect(ctx, contentX, rowY, contentW, rowH, unit * 0.45);
    ctx.strokeStyle = isCurrent ? accent : THEME.panelBorder;
    ctx.lineWidth = unit * (isCurrent ? 0.07 : 0.035);
    ctx.stroke();

    const pad = contentW * 0.04;
    const markR = unit * 0.3;
    const markX = contentX + pad + markR;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(markX, cy, markR, 0, Math.PI * 2);
    ctx.fill();

    // One fitted line rather than a 2-line wrap: the row is a fixed height, so a
    // second line would land outside it.
    const weight = isCurrent ? 600 : 500;
    const textX = markX + markR + pad;
    const px = fitFontSize(ctx, item.text, {
      maxW: contentX + contentW - pad - textX,
      startPx: unit * 1.1,
      minPx: unit * 0.72,
      weight,
    });
    ctx.font = `${weight} ${px}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textBaseline = "middle";
    ctx.fillText(item.text, textX, cy);
    ctx.restore();
  });
}

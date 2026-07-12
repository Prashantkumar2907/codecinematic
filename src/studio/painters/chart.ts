import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutCubic, sub, clamp01, roundRect, beatT, activeBeatIndex, rgba } from "./common";
import type { PaintEnv } from "./index";

type ChartScene = Extract<Scene, { kind: "chart" }>;

/** Count-up value: integers stay integers, fractional values keep one decimal. */
function fmtValue(target: number, t: number): string {
  const v = target * t;
  if (Number.isInteger(target)) return Math.round(v).toLocaleString("en-US");
  return v.toFixed(1);
}

/** Horizontal bar chart: one bar grows (with a counting value) per beat. */
export function paintChart(ctx: CanvasRenderingContext2D, scene: ChartScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const titleIn = easeOutCubic(sub(env.p, 0, 0.12));
  ctx.save();
  ctx.globalAlpha = titleIn;
  ctx.font = `800 ${unit * 1.5}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.fillText(scene.title, contentX, contentY + unit * 1.3);
  ctx.fillStyle = accent;
  ctx.fillRect(contentX, contentY + unit * 1.8, unit * 3 * titleIn, unit * 0.2);
  ctx.restore();

  const maxVal = Math.max(...scene.items.map((i) => i.value), 1e-9);
  const listTop = contentY + unit * 3.1;
  const n = scene.items.length;
  const rowGap = Math.min((contentH - (listTop - contentY)) / n, unit * (vertical ? 4.0 : 3.1));
  const barH = Math.min(rowGap * 0.42, unit * 1.35);

  ctx.font = `600 ${unit * 0.85}px ${FONT_SANS}`;
  const labelW = Math.min(
    Math.max(...scene.items.map((i) => ctx.measureText(i.label).width)) + unit * 0.6,
    contentW * 0.34
  );
  const trackX = contentX;
  const trackW = contentW;

  scene.items.forEach((item, i) => {
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    if (t <= 0) return;
    const appear = easeOutCubic(Math.min(1, t * 3));
    const grow = easeOutCubic(clamp01(t * 1.6));
    const isCurrent = active === offset + i;
    const rowY = listTop + i * rowGap;
    const barY = rowY + unit * 1.15;

    ctx.save();
    ctx.globalAlpha = appear * (isCurrent || active < offset + i ? 1 : 0.62);

    ctx.font = `${isCurrent ? 700 : 600} ${unit * 0.85}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
    ctx.fillText(item.label, trackX, rowY + unit * 0.75);

    roundRect(ctx, trackX, barY, trackW, barH, barH / 2);
    ctx.fillStyle = "rgba(148,163,184,0.10)";
    ctx.fill();

    const frac = item.value / maxVal;
    const barW = Math.max(barH, trackW * frac * grow);
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
    }
    roundRect(ctx, trackX, barY, barW, barH, barH / 2);
    const grad = ctx.createLinearGradient(trackX, 0, trackX + barW, 0);
    grad.addColorStop(0, rgba(accent, isCurrent ? 0.55 : 0.35));
    grad.addColorStop(1, accent);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    const valueText = `${fmtValue(item.value, grow)}${item.unit ? item.unit : ""}`;
    ctx.font = `800 ${unit * 0.85}px ${FONT_SANS}`;
    const vw = ctx.measureText(valueText).width;
    const inside = barW > vw + unit * 1.2;
    ctx.fillStyle = inside ? "#06121a" : THEME.text;
    ctx.fillText(valueText, inside ? trackX + barW - vw - unit * 0.5 : trackX + barW + unit * 0.45, barY + barH * 0.72);
    ctx.restore();
  });
}

import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, clamp01, wrapText, fitFontSize, rgba } from "./common";
import type { PaintEnv } from "./index";

type StatScene = Extract<Scene, { kind: "stat" }>;

/** One big number made visceral: value scales in, label and context follow. */
export function paintStat(ctx: CanvasRenderingContext2D, scene: StatScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentW } = layout;
  const { accent, accentGlow } = env.palette;

  const cx = w / 2;
  const cy = h * 0.4;

  const glowIn = easeOutCubic(sub(env.p, 0, 0.4));
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.42);
  glow.addColorStop(0, rgba(accent, 0.12 * glowIn));
  glow.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const pop = easeOutBack(sub(env.p, 0.04, 0.45));
  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha = clamp01(sub(env.p, 0.04, 0.25));
  ctx.translate(cx, cy);
  ctx.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
  const vpx = fitFontSize(ctx, scene.value, { maxW: contentW * 0.92, startPx: unit * 7, minPx: unit * 3, weight: 900 });
  ctx.font = `900 ${vpx}px ${FONT_SANS}`;
  ctx.fillStyle = accent;
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * 1.3;
  ctx.fillText(scene.value, 0, vpx * 0.34);
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha = clamp01(sub(env.p, 0.28, 0.25));
  const lpx = fitFontSize(ctx, scene.label, { maxW: contentW * 0.92, startPx: unit * 1.7, minPx: unit, weight: 700 });
  ctx.font = `700 ${lpx}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  const labelLines = wrapText(ctx, scene.label, contentW * 0.92);
  const ly = cy + unit * 4.2;
  labelLines.forEach((line, i) => ctx.fillText(line, cx, ly + i * lpx * 1.25));
  ctx.restore();

  if (scene.context) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.globalAlpha = clamp01(sub(env.p, 0.46, 0.3));
    ctx.font = `500 ${unit * 0.95}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    const cLines = wrapText(ctx, scene.context, contentW * 0.85);
    const cyc = cy + unit * 6.8;
    cLines.forEach((line, i) => ctx.fillText(line, cx, cyc + i * unit * 1.35));
    ctx.restore();
  }
  ctx.textAlign = "start";
}

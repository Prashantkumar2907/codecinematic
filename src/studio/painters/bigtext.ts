import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, clamp01, fitFontSize, wrapText, rgba, variantOf } from "./common";
import type { PaintEnv } from "./index";

type BigtextScene = Extract<Scene, { kind: "bigtext" }>;

/**
 * Three deterministic entrance styles (seeded by scene id) so title cards
 * don't all look alike: 0 center pop, 1 word-by-word rise, 2 editorial left.
 */
export function paintBigtext(ctx: CanvasRenderingContext2D, scene: BigtextScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentX, contentW } = layout;
  const { accent, accentGlow } = env.palette;
  const variant = variantOf(scene.id, 3);

  const glowIn = easeOutCubic(sub(env.p, 0, 0.4));
  const gx = variant === 2 ? w * 0.3 : w / 2;
  const glow = ctx.createRadialGradient(gx, h * 0.42, 0, gx, h * 0.42, Math.min(w, h) * 0.5);
  glow.addColorStop(0, rgba(accent, 0.08 * glowIn));
  glow.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const maxW = contentW * 0.92;
  const px = fitFontSize(ctx, scene.text, { maxW, startPx: unit * 3.4, minPx: unit * 1.6, weight: 900 });
  ctx.font = `900 ${px}px ${FONT_SANS}`;
  const lines = wrapText(ctx, scene.text, maxW);
  const lineH = px * 1.14;

  if (variant === 2) {
    // Editorial: left-aligned, accent bar on the left, underline sweeps from left.
    const blockTop = h * 0.42 - ((lines.length - 1) * lineH) / 2;
    const textX = contentX + unit * 1.1;
    const barIn = easeOutCubic(sub(env.p, 0, 0.18));
    ctx.save();
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.5;
    ctx.fillRect(contentX, blockTop - px * 0.85, unit * 0.28, (lines.length - 1) * lineH + px * 1.1 * barIn);
    ctx.shadowBlur = 0;
    lines.forEach((line, i) => {
      const tIn = easeOutCubic(sub(env.p, 0.05 + i * 0.07, 0.2));
      ctx.globalAlpha = tIn;
      ctx.fillStyle = THEME.text;
      ctx.font = `900 ${px}px ${FONT_SANS}`;
      ctx.fillText(line, textX + (1 - tIn) * unit, blockTop + i * lineH);
    });
    const underW = unit * 5 * easeOutCubic(sub(env.p, 0.3, 0.25));
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.fillRect(textX, blockTop + (lines.length - 1) * lineH + px * 0.55, underW, unit * 0.26);
    if (scene.sub) {
      ctx.globalAlpha = sub(env.p, 0.38, 0.25);
      ctx.font = `500 ${unit * 1.02}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      wrapText(ctx, scene.sub, maxW - unit * 1.1).forEach((line, i) =>
        ctx.fillText(line, textX, blockTop + (lines.length - 1) * lineH + px * 0.55 + unit * 1.6 + i * unit * 1.5)
      );
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.translate(w / 2, h * 0.44);
  const startY = (-(lines.length - 1) * lineH) / 2;

  if (variant === 1) {
    // Word-by-word rise across the first third of the scene.
    const totalWords = lines.reduce((acc, l) => acc + l.split(" ").length, 0);
    const perWord = 0.22 / Math.max(totalWords, 1);
    let wi = 0;
    ctx.textAlign = "start";
    lines.forEach((line, li) => {
      const lineW = ctx.measureText(line).width;
      let x = -lineW / 2;
      const y = startY + li * lineH;
      for (const word of line.split(" ")) {
        const tIn = easeOutCubic(clamp01((env.p - 0.05 - wi * perWord) / 0.09));
        ctx.globalAlpha = tIn;
        ctx.fillStyle = THEME.text;
        ctx.fillText(word, x, y + (1 - tIn) * unit * 0.8);
        x += ctx.measureText(word + " ").width;
        wi++;
      }
    });
    ctx.textAlign = "center";
  } else {
    const appear = easeOutBack(sub(env.p, 0.04, 0.3));
    ctx.scale(0.94 + 0.06 * appear, 0.94 + 0.06 * appear);
    ctx.globalAlpha = sub(env.p, 0.04, 0.22);
    ctx.fillStyle = THEME.text;
    lines.forEach((line, i) => ctx.fillText(line, 0, startY + i * lineH));
  }

  const underlineW = unit * 5 * easeOutCubic(sub(env.p, 0.24, 0.28));
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent;
  ctx.fillRect(-underlineW / 2, startY + lines.length * lineH - px * 0.4, underlineW, unit * 0.28);

  if (scene.sub) {
    ctx.globalAlpha = sub(env.p, 0.34, 0.25);
    ctx.font = `500 ${unit * 1.05}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    const subLines = wrapText(ctx, scene.sub, maxW);
    subLines.forEach((line, i) =>
      ctx.fillText(line, 0, startY + lines.length * lineH + unit * 0.9 + i * unit * 1.5)
    );
  }
  ctx.restore();
}

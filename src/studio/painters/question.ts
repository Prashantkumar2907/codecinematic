import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, wrapText, roundRect } from "./common";
import type { PaintEnv } from "./index";

type QuestionScene = Extract<Scene, { kind: "question" }>;

export function paintQuestion(ctx: CanvasRenderingContext2D, scene: QuestionScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentW } = layout;
  const { accent, accentSoft, accentGlow } = env.palette;

  const markIn = easeOutBack(sub(env.p, 0, 0.25));
  const pulse = 1 + 0.03 * Math.sin(env.elapsedMs / 320);
  ctx.save();
  ctx.textAlign = "center";
  ctx.translate(w / 2, h * 0.24);
  ctx.scale(markIn * pulse, markIn * pulse);
  ctx.font = `900 ${unit * 5}px ${FONT_SANS}`;
  ctx.fillStyle = accentSoft;
  ctx.fillText("?", 0, unit * 1.6);
  ctx.font = `900 ${unit * 3.6}px ${FONT_SANS}`;
  ctx.fillStyle = accent;
  ctx.fillText("?", 0, unit * 1.2);
  ctx.restore();

  const textIn = easeOutCubic(sub(env.p, 0.16, 0.3));
  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha = textIn;
  ctx.font = `800 ${unit * 1.5}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  const lines = wrapText(ctx, scene.text, contentW * 0.9);
  const lineH = unit * 2.0;
  const startY = h * 0.42;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineH));

  let cursor = startY + lines.length * lineH + unit * 0.6;
  if (scene.hint) {
    ctx.globalAlpha = sub(env.p, 0.36, 0.25);
    ctx.font = `500 ${unit * 0.95}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    const hintLines = wrapText(ctx, `Hint: ${scene.hint}`, contentW * 0.85);
    hintLines.forEach((line, i) => ctx.fillText(line, w / 2, cursor + i * unit * 1.4));
    cursor += hintLines.length * unit * 1.4 + unit * 0.8;
  }

  const ctaIn = easeOutBack(sub(env.p, 0.5, 0.25));
  if (ctaIn > 0) {
    const label = "Comment your answer 👇";
    ctx.font = `700 ${unit * 1.05}px ${FONT_SANS}`;
    const tw = ctx.measureText(label).width;
    const padX = unit * 1.2;
    const bw = tw + padX * 2;
    const bh = unit * 2.2;
    const bx = w / 2 - bw / 2;
    const by = Math.max(cursor + unit * 0.8, h * 0.68);
    ctx.save();
    ctx.globalAlpha = Math.min(1, ctaIn);
    ctx.translate(w / 2, by + bh / 2);
    ctx.scale(ctaIn, ctaIn);
    ctx.translate(-w / 2, -(by + bh / 2));
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.9;
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#06121a";
    ctx.fillText(label, w / 2, by + bh * 0.66);
    ctx.restore();
  }
  ctx.restore();
}

import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, clamp01, wrapText, rgba } from "./common";
import type { PaintEnv } from "./index";

type QuoteScene = Extract<Scene, { kind: "quote" }>;

/** Editorial quotation card: giant quotemark, word-staggered text, author line. */
export function paintQuote(ctx: CanvasRenderingContext2D, scene: QuoteScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentW } = layout;
  const { accent, accentGlow } = env.palette;

  const glowIn = easeOutCubic(sub(env.p, 0, 0.4));
  const glow = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.min(w, h) * 0.5);
  glow.addColorStop(0, rgba(accent, 0.07 * glowIn));
  glow.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const markIn = easeOutBack(sub(env.p, 0, 0.22));
  ctx.save();
  ctx.textAlign = "center";
  ctx.translate(w / 2, h * 0.22);
  ctx.scale(Math.max(0.01, markIn), Math.max(0.01, markIn));
  ctx.font = `900 ${unit * 4.4}px Georgia, ${FONT_SANS}`;
  ctx.fillStyle = accent;
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * 0.8;
  ctx.fillText("“", 0, unit * 1.4);
  ctx.restore();

  const maxW = contentW * 0.86;
  ctx.font = `italic 600 ${unit * 1.35}px Georgia, ${FONT_SANS}`;
  const lines = wrapText(ctx, scene.text, maxW);
  const lineH = unit * 1.95;
  const startY = h * 0.34;

  // Words fade in one after another across the first ~40% of the scene.
  const totalWords = lines.reduce((acc, l) => acc + l.split(" ").length, 0);
  const perWord = 0.3 / Math.max(totalWords, 1);
  let wordIndex = 0;

  ctx.save();
  ctx.textAlign = "start";
  lines.forEach((line, li) => {
    const words = line.split(" ");
    const lineW = ctx.measureText(line).width;
    let x = w / 2 - lineW / 2;
    const y = startY + li * lineH;
    for (const word of words) {
      const wIn = clamp01((env.p - 0.1 - wordIndex * perWord) / 0.07);
      ctx.globalAlpha = easeOutCubic(wIn);
      ctx.fillStyle = THEME.text;
      ctx.fillText(word, x, y);
      x += ctx.measureText(word + " ").width;
      wordIndex++;
    }
  });
  ctx.restore();

  const tailY = startY + lines.length * lineH;
  const ruleIn = easeOutCubic(sub(env.p, 0.42, 0.2));
  ctx.save();
  ctx.fillStyle = accent;
  ctx.fillRect(w / 2 - unit * 2.6 * ruleIn, tailY + unit * 0.3, unit * 5.2 * ruleIn, unit * 0.18);
  if (scene.author) {
    ctx.globalAlpha = sub(env.p, 0.5, 0.22);
    ctx.font = `700 ${unit * 0.95}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(`— ${scene.author}`, w / 2, tailY + unit * 1.7);
  }
  ctx.restore();
  ctx.textAlign = "start";
}

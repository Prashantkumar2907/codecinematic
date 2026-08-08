import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, enterT, clamp01, wrapText, revealT, departT } from "./common";
import type { PaintEnv } from "./index";

type QuoteScene = Extract<Scene, { kind: "quote" }>;

const BOB_UNITS = 0.2;

/**
 * Editorial quotation card: giant quotemark, word-staggered text, author line.
 * Composition follows the ASPECT, not a per-scene coin flip: long (16:9) gets
 * a left-rail editorial treatment; short (9:16) is centered, reading better in
 * a narrow column — two intentional compositions (rubric v2 s10) rather than
 * a random variant. The former "fullBleed" giant-watermark treatment is
 * dropped: it competed with the text for attention rather than supporting it.
 */
export function paintQuote(ctx: CanvasRenderingContext2D, scene: QuoteScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentX, contentW, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const leftBar = !vertical;

  const leave = departT(env, 380);
  if (leave <= 0) return;

  const maxW = contentW * (leftBar ? 0.82 : 0.86);
  const leftEdge = contentX + unit * 1.4;
  const startY = h * (leftBar ? 0.32 : 0.34);
  const maxBottom = h * (vertical ? 0.82 : 0.88);

  let qpx = unit * 1.35;
  ctx.font = `italic 600 ${qpx}px Georgia, ${FONT_SANS}`;
  let lines = wrapText(ctx, scene.text, maxW);
  let lineH = qpx * 1.44;
  if (startY + lines.length * lineH + unit * 2.4 > maxBottom) {
    qpx = unit * (vertical ? 1.05 : 1.0);
    ctx.font = `italic 600 ${qpx}px Georgia, ${FONT_SANS}`;
    lines = wrapText(ctx, scene.text, maxW);
    lineH = qpx * 1.44;
  }

  // Gentle continuous float on the whole card — kept from the previous 3D
  // version's block bob, now a plain pixel offset instead of a camera round-trip.
  const bob = Math.sin(env.elapsedMs / 1500) * unit * BOB_UNITS;

  ctx.save();
  ctx.globalAlpha = leave;
  ctx.translate(0, bob);

  const markIn = easeOutBack(enterT(env, 420));
  if (leftBar) {
    ctx.textAlign = "left";
    ctx.globalAlpha = clamp01(markIn) * leave;
    ctx.font = `900 ${unit * 2.6}px Georgia, ${FONT_SANS}`;
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.6;
    ctx.fillText("“", leftEdge, startY - qpx * 0.4);
    ctx.shadowBlur = 0;
  } else {
    ctx.textAlign = "center";
    ctx.globalAlpha = clamp01(markIn) * leave;
    ctx.font = `900 ${unit * 4.4}px Georgia, ${FONT_SANS}`;
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.8;
    ctx.fillText("“", w / 2, startY - unit * 0.5);
    ctx.shadowBlur = 0;
  }

  // Words rise in.
  const totalWords = lines.reduce((acc, l) => acc + l.split(" ").length, 0);
  const perWordMs = Math.min(90, 1500 / Math.max(totalWords, 1));
  let wordIndex = 0;

  ctx.textAlign = "start";
  ctx.font = `italic 600 ${qpx}px Georgia, ${FONT_SANS}`;
  lines.forEach((line, li) => {
    const words = line.split(" ");
    const lineW = ctx.measureText(line).width;
    let x = leftBar ? leftEdge : w / 2 - lineW / 2;
    const y = startY + li * lineH;
    for (const word of words) {
      const wIn = easeOutCubic(enterT(env, 200, 300 + wordIndex * perWordMs));
      ctx.globalAlpha = wIn * leave;
      ctx.fillStyle = THEME.text;
      ctx.fillText(word, x, y + (1 - wIn) * unit * 0.5);
      x += ctx.measureText(word + " ").width;
      wordIndex++;
    }
  });

  const tailY = startY + lines.length * lineH;
  const wordsDoneMs = 300 + totalWords * perWordMs + 150;
  const ruleIn = easeOutCubic(enterT(env, 380, wordsDoneMs));

  if (leftBar) {
    const barTop = startY - qpx;
    const barBottom = tailY + unit * 0.4;
    const barGrow = easeOutCubic(enterT(env, 500));
    ctx.globalAlpha = leave;
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.5;
    ctx.fillRect(contentX, barTop, unit * 0.28, (barBottom - barTop) * barGrow);
    ctx.shadowBlur = 0;
    if (scene.author) {
      // Duration-aware: attribution lands once the quotation has been read.
      ctx.globalAlpha = easeOutCubic(Math.max(revealT(env, 0.5, 0.68), enterT(env, 380, wordsDoneMs + 150) * 0.3)) * leave;
      ctx.font = `700 ${unit * 0.95}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "left";
      ctx.fillText(`— ${scene.author}`, leftEdge, tailY + unit * 1.6);
    }
  } else {
    ctx.globalAlpha = leave;
    ctx.fillStyle = accent;
    ctx.fillRect(w / 2 - unit * 2.6 * ruleIn, tailY + unit * 0.3, unit * 5.2 * ruleIn, unit * 0.18);
    if (scene.author) {
      ctx.globalAlpha = easeOutCubic(enterT(env, 380, wordsDoneMs + 150)) * leave;
      ctx.font = `700 ${unit * 0.95}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(`— ${scene.author}`, w / 2, tailY + unit * 1.7);
    }
  }
  ctx.restore();
  ctx.textAlign = "start";
}

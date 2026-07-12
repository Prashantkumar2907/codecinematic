import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, clamp01, wrapText, roundRect, fitFontSize, beatT, activeBeatIndex, rgba } from "./common";
import type { PaintEnv } from "./index";

type VocabScene = Extract<Scene, { kind: "vocab" }>;

/** Draw one line left-to-right, tinting occurrences of the target word. */
function drawHighlightedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  word: string,
  baseColor: string,
  accentColor: string
) {
  const lower = line.toLowerCase();
  const wl = word.toLowerCase();
  let cx = x;
  let idx = 0;
  while (idx < line.length) {
    const found = wl ? lower.indexOf(wl, idx) : -1;
    if (found === -1) {
      ctx.fillStyle = baseColor;
      ctx.fillText(line.slice(idx), cx, y);
      return;
    }
    if (found > idx) {
      const before = line.slice(idx, found);
      ctx.fillStyle = baseColor;
      ctx.fillText(before, cx, y);
      cx += ctx.measureText(before).width;
    }
    const match = line.slice(found, found + wl.length);
    ctx.fillStyle = accentColor;
    ctx.fillText(match, cx, y);
    cx += ctx.measureText(match).width;
    idx = found + wl.length;
  }
}

/** English-vocabulary flashcard: word + pronunciation + meaning, then usage examples. */
export function paintVocab(ctx: CanvasRenderingContext2D, scene: VocabScene, env: PaintEnv) {
  const { layout } = env;
  const { w, unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow, accentSoft } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.examples.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const cx = w / 2;

  const wordIn = easeOutBack(sub(env.p, 0, 0.3));
  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha = clamp01(sub(env.p, 0, 0.2));
  ctx.translate(cx, contentY + unit * 1.9);
  ctx.scale(0.8 + 0.2 * wordIn, 0.8 + 0.2 * wordIn);
  const wpx = fitFontSize(ctx, scene.word, { maxW: contentW * 0.9, startPx: unit * 3.2, minPx: unit * 1.6, weight: 900 });
  ctx.font = `900 ${wpx}px ${FONT_SANS}`;
  ctx.fillStyle = accent;
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * 0.8;
  ctx.fillText(scene.word, 0, 0);
  ctx.restore();

  const metaAlpha = clamp01(sub(env.p, 0.12, 0.2));
  ctx.save();
  ctx.globalAlpha = metaAlpha;
  ctx.textAlign = "center";
  const chipFont = `700 ${unit * 0.65}px ${FONT_SANS}`;
  const pronFont = `italic 500 ${unit * 0.95}px ${FONT_SANS}`;
  const pos = scene.pos ? scene.pos.toUpperCase() : "";
  ctx.font = chipFont;
  const chipW = pos ? ctx.measureText(pos).width + unit * 1.0 : 0;
  ctx.font = pronFont;
  const pronW = scene.pron ? ctx.measureText(scene.pron).width : 0;
  const gapW = pos && scene.pron ? unit * 0.7 : 0;
  const rowY = contentY + unit * 3.3;
  let rowX = cx - (chipW + gapW + pronW) / 2;
  if (pos) {
    roundRect(ctx, rowX, rowY - unit * 0.75, chipW, unit * 1.1, unit * 0.35);
    ctx.fillStyle = accentSoft;
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = chipFont;
    ctx.textAlign = "center";
    ctx.fillText(pos, rowX + chipW / 2, rowY - unit * 0.02);
    rowX += chipW + gapW;
  }
  if (scene.pron) {
    ctx.font = pronFont;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "left";
    ctx.fillText(scene.pron, rowX, rowY);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = clamp01(sub(env.p, 0.2, 0.25));
  ctx.textAlign = "center";
  ctx.font = `600 ${unit * 1.15}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  const meaningText = scene.synonym ? `${scene.meaning}  ·  syn. ${scene.synonym}` : scene.meaning;
  const mLines = wrapText(ctx, meaningText, contentW * 0.9);
  const mTop = contentY + unit * 5.1;
  mLines.forEach((line, i) => ctx.fillText(line, cx, mTop + i * unit * 1.5));
  ctx.restore();
  ctx.textAlign = "start";

  const exTop = contentY + unit * 7.6;
  const nEx = scene.examples.length;
  const exGap = unit * 0.8;
  const exH = Math.min((contentH - (exTop - contentY) - (nEx - 1) * exGap) / nEx, unit * (layout.vertical ? 3.6 : 2.7));

  scene.examples.forEach((ex, i) => {
    const t = beatT(env.beats, offset + i, totalBeats, env.p);
    if (t <= 0) return;
    const appear = easeOutCubic(Math.min(1, t * 3));
    const isCurrent = active === offset + i;
    const y = exTop + i * (exH + exGap);

    ctx.save();
    ctx.globalAlpha = appear * (isCurrent ? 1 : 0.6);
    ctx.translate((1 - appear) * unit * 1.2, 0);
    roundRect(ctx, contentX, y, contentW, exH, unit * 0.4);
    ctx.fillStyle = isCurrent ? rgba(accent, 0.06) : THEME.panel;
    ctx.fill();
    ctx.fillStyle = isCurrent ? accent : rgba(accent, 0.4);
    ctx.fillRect(contentX, y, unit * 0.22, exH);

    ctx.font = `500 ${unit * 0.92}px ${FONT_SANS}`;
    const textX = contentX + unit * 0.9;
    const lines = wrapText(ctx, ex.text, contentW - unit * 1.6).slice(0, 2);
    const baseY = y + exH / 2 + unit * 0.3 - (lines.length - 1) * unit * 0.6;
    lines.forEach((line, li) =>
      drawHighlightedLine(ctx, line, textX, baseY + li * unit * 1.2, scene.word, THEME.text, accent)
    );
    ctx.restore();
  });
}

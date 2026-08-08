import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, clamp01, wrapText, roundRect, fitFontSize, beatT, activeBeatIndex, enterT, idle, shade, rgba, departT } from "./common";
import type { PaintEnv } from "./index";

type VocabScene = Extract<Scene, { kind: "vocab" }>;

/** Card width as a fraction of the visible frustum width, so 9:16 and 16:9 both
 *  fit — a world-space literal only ever fits one aspect (see three3d.ts:139). */
const CARD_W_FRAC = 0.94;
/** Vertical gap between cards as a fraction of the row pitch. */
const CARD_GAP_FRAC = 0.28;
/** Entrance scale. A positional slide is not usable here: the card is already
 *  CARD_W_FRAC of the frustum, so any translation pushes it off frame mid-entrance
 *  and drags its text with it. Scaling about the card's own centre cannot. */
const CARD_ENTER_SCALE = 0.9;
/** Idle bob amplitude as a fraction of row pitch. */
const BOB_FRAC = 0.035;
/** Opacity of an example that is not the active beat. */
const ROW_DIM_ALPHA = 0.72;
const TEXT_PAD_FRAC = 0.06;
/** Fraction of a card's entrance that passes before its text starts fading in. */
const TEXT_LAG = 0.3;
/** Card face: THEME.panel alone renders as flat near-black at this exposure, so
 *  the extrusion reads as a 2D outline. Lifted just enough to catch the lights. */
const CARD_FACE = shade(THEME.panel, 0.18);

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
  const { w, unit, contentX, contentY, contentW, vertical } = layout;
  const { accent, accentGlow, accentSoft, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.examples.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const cx = w / 2;

  const leave = departT(env, 380);
  if (leave <= 0) return;
  const wordIn = easeOutBack(enterT(env, 440));
  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha = clamp01(enterT(env, 300)) * leave;
  ctx.translate(cx, contentY + unit * 1.9);
  ctx.scale(0.8 + 0.2 * wordIn, 0.8 + 0.2 * wordIn);
  const wpx = fitFontSize(ctx, scene.word, { maxW: contentW * 0.9, startPx: unit * 3.2, minPx: unit * 1.6, weight: 900 });
  ctx.font = `900 ${wpx}px ${FONT_SANS}`;
  ctx.fillStyle = accent;
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * 0.8 * (0.82 + 0.18 * idle(env, 2600));
  ctx.fillText(scene.word, 0, 0);
  ctx.restore();

  const metaAlpha = clamp01(enterT(env, 320, 150));
  ctx.save();
  ctx.globalAlpha = metaAlpha * leave;
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
  ctx.globalAlpha = clamp01(enterT(env, 320, 260)) * leave;
  ctx.textAlign = "center";
  let mpx = unit * 1.15;
  ctx.font = `600 ${mpx}px ${FONT_SANS}`;
  const meaningText = scene.synonym ? `${scene.meaning}  ·  syn. ${scene.synonym}` : scene.meaning;
  let mLines = wrapText(ctx, meaningText, contentW * 0.9);
  if (mLines.length > 2) {
    mpx = unit * 0.98;
    ctx.font = `600 ${mpx}px ${FONT_SANS}`;
    mLines = wrapText(ctx, meaningText, contentW * 0.9);
  }
  ctx.fillStyle = THEME.text;
  const mTop = contentY + unit * 5.1;
  const mLineH = mpx * 1.32;
  mLines.forEach((line, i) => ctx.fillText(line, cx, mTop + i * mLineH));
  ctx.restore();
  ctx.textAlign = "start";

  // The example stack fills everything between the measured meaning and the safe
  // bottom. Centring it in the leftover space instead left a dead void on 9:16.
  const availTop = mTop + mLines.length * mLineH + unit * 1.0;
  // Was `(vertical ? 0.75 : 0.94) * layout.h`, a local clamp that SHADOWED the
  // caption-aware bound and sat below it on both aspects (0.94h = 1015px against a
  // safeBottom of 863). Measured 55.4% of the caption band covered at 16:9 — the
  // worst intrusion in the library — while edge-bleed read 0.0%.
  const safeBottom = layout.safeBottom;
  const nEx = scene.examples.length;

  const rect = { x: contentX, y: availTop, w: contentW, h: Math.max(unit * 5, safeBottom - availTop) };

  const ghostIn = easeOutCubic(enterT(env, 360));

  const contextData = {
    examples: scene.examples.map((ex, i) => {
      const t = beatT(env.beats, offset + i, totalBeats, env.p);
      const appear = easeOutCubic(Math.min(1, t * 3));
      const isCurrent = active === offset + i;
      return { t, appear, isCurrent };
    }),
    ghostIn,
  };

  // Flat 2D card stack — no genuine 3D content here (the removed camera was
  // already nearly front-on), so cards are laid out directly in pixel space
  // with one column, top to bottom.
  const pitch = rect.h / nEx;
  const cardW = rect.w * CARD_W_FRAC;
  const cardH = pitch * (1 - CARD_GAP_FRAC);
  const cardCx = rect.x + rect.w / 2;

  /** Single source of truth for where a card is, so its face and the text on
   *  top of it can never drift apart. */
  const cardBox = (i: number) => {
    const bob = Math.sin(env.elapsedMs / 1600 + i * 0.9) * pitch * BOB_FRAC;
    const cy = rect.y + i * pitch + pitch / 2 + bob;
    return { cx: cardCx, cy, w: cardW, h: cardH };
  };

  scene.examples.forEach((ex, i) => {
    const item = contextData.examples[i];
    if (!item) return;
    const { t, appear, isCurrent } = item;

    if (t <= 0) {
      if (ghostIn > 0) {
        const box = cardBox(i);
        ctx.save();
        ctx.globalAlpha = 0.16 * ghostIn * leave;
        roundRect(ctx, box.cx - box.w / 2, box.cy - box.h / 2, box.w, box.h, unit * 0.4);
        ctx.strokeStyle = accent;
        ctx.lineWidth = unit * 0.05;
        ctx.setLineDash([unit * 0.3, unit * 0.28]);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    const scale = CARD_ENTER_SCALE + (1 - CARD_ENTER_SCALE) * appear;
    const raw = cardBox(i);
    const box = { cx: raw.cx, cy: raw.cy, w: raw.w * scale, h: raw.h * scale };

    ctx.save();
    ctx.globalAlpha = 0.92 * appear * leave;
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.4 + 0.3 * idle(env, 1400));
    }
    roundRect(ctx, box.cx - box.w / 2, box.cy - box.h / 2, box.w, box.h, unit * 0.4);
    ctx.fillStyle = CARD_FACE;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, box.cx - box.w / 2, box.cy - box.h / 2, box.w, box.h, unit * 0.4);
    ctx.strokeStyle = rgba(accent, isCurrent ? 0.85 : 0.4);
    ctx.lineWidth = unit * (isCurrent ? 0.07 : 0.04);
    ctx.stroke();
    ctx.restore();

    // Text trails its card rather than arriving on the same tick.
    const textIn = easeOutCubic(clamp01((appear - TEXT_LAG) / (1 - TEXT_LAG)));
    ctx.save();
    ctx.globalAlpha = textIn * (isCurrent ? 1 : ROW_DIM_ALPHA) * leave;
    const textW = box.w * (1 - TEXT_PAD_FRAC * 2);
    // Type scale follows the card, not `unit`, because the card shrinks as the
    // example count grows. fitFontSize measures one line, so the budget is two
    // card widths — the size at which the text wraps to at most two lines.
    const px = fitFontSize(ctx, ex.text, {
      maxW: textW * 2,
      startPx: Math.min(unit * 0.92, box.h * 0.34),
      minPx: unit * 0.5,
      weight: 500,
    });
    ctx.font = `500 ${px}px ${FONT_SANS}`;
    const lines = wrapText(ctx, ex.text, textW).slice(0, 2);
    const lineH = px * 1.28;
    const firstBaseline = box.cy + px * 0.36 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, li) =>
      drawHighlightedLine(ctx, line, box.cx - textW / 2, firstBaseline + li * lineH, scene.word, THEME.text, accent)
    );
    ctx.restore();
  });
}

import type { Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  wrapText,
  rgba,
  revealT,
  departT,
  roundRect,
  applyElevation,
  clearShadow,
  RADIUS,
} from "./common";
import type { PaintEnv } from "./index";

type StatScene = Extract<Scene, { kind: "stat" }>;

const DIGIT = /[0-9]/;

/** Odometer reel timing; the label waits on these so it never lands on spinning digits. */
const ODO_DELAY_MS = 120;
const ODO_STAGGER_MS = 90;
const ODO_ROLL_MS = 650;
const PULSE_MS = 2600;
const BOB_MS = 3000;

/** Widest glyph among 0-9 at the current font, so digit columns don't jitter. */
function maxDigitWidth(ctx: CanvasRenderingContext2D): number {
  let mw = 0;
  for (let d = 0; d < 10; d++) mw = Math.max(mw, ctx.measureText(String(d)).width);
  return mw;
}

/** Total width of `value` when every digit occupies a fixed-width odometer cell. */
function valueWidth(ctx: CanvasRenderingContext2D, value: string, digitW: number): number {
  let total = 0;
  for (const ch of value) total += DIGIT.test(ch) ? digitW : ctx.measureText(ch).width;
  return total;
}

/**
 * Draw `value` with each digit rolling like an odometer reel to its final digit
 * (staggered left→right, easeOutCubic) while non-digit glyphs pop/fade in. At
 * roll progress 1 every reel lands exactly on its target so the frame is crisp.
 */
function drawOdometer(
  ctx: CanvasRenderingContext2D,
  env: PaintEnv,
  value: string,
  leftEdge: number,
  baseline: number,
  vpx: number,
  digitW: number,
  color: string
) {
  const cellH = vpx * 1.05;
  const clipTop = baseline - vpx * 0.82;
  let x = leftEdge;
  let digitIdx = 0;
  ctx.fillStyle = color;
  for (const ch of value) {
    if (DIGIT.test(ch)) {
      const d = Number(ch);
      const r = easeOutCubic(enterT(env, ODO_ROLL_MS, ODO_DELAY_MS + digitIdx * ODO_STAGGER_MS));
      const pos = (2 * 10 + d) * r; // two full spins, then settle on d
      const frac = pos - Math.floor(pos);
      const base = ((Math.floor(pos) % 10) + 10) % 10;
      const colCx = x + digitW / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - vpx * 0.05, clipTop, digitW + vpx * 0.1, cellH);
      ctx.clip();
      ctx.textAlign = "center";
      ctx.fillText(String(base), colCx, baseline - frac * cellH);
      ctx.fillText(String((base + 1) % 10), colCx, baseline - frac * cellH + cellH);
      ctx.restore();
      x += digitW;
      digitIdx++;
    } else {
      const pop = easeOutCubic(enterT(env, 400, 100));
      ctx.save();
      ctx.textAlign = "left";
      ctx.globalAlpha = pop;
      ctx.fillText(ch, x, baseline + (1 - pop) * vpx * 0.16);
      ctx.restore();
      x += ctx.measureText(ch).width;
    }
  }
}

/**
 * One big number made visceral. Digits ODOMETER-ROLL into place onto a glass
 * card. Composition follows the ASPECT, not a per-scene coin flip: long (16:9)
 * has room to sit the number left and the context beside it; short (9:16) is a
 * narrow column, so it goes centered with the context below — two intentional
 * compositions rather than one layout squeezed into both (rubric v2 s10).
 */
export function paintStat(ctx: CanvasRenderingContext2D, scene: StatScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentX, contentW, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const leftLayout = !vertical;

  const leave = departT(env, 380);
  if (leave <= 0) return;

  // Fit the value using the fixed-width digit metric the odometer actually uses.
  const maxW = (leftLayout ? contentW * 0.5 : contentW) * 0.9;
  let vpx = unit * 7;
  const minPx = unit * 3;
  for (; vpx > minPx; vpx -= 2) {
    ctx.font = `900 ${vpx}px ${FONT_SANS}`;
    if (valueWidth(ctx, scene.value, maxDigitWidth(ctx)) <= maxW) break;
  }
  ctx.font = `900 ${vpx}px ${FONT_SANS}`;
  const digitW = maxDigitWidth(ctx);
  const totalW = valueWidth(ctx, scene.value, digitW);

  const panelCx = leftLayout ? contentX + contentW * 0.28 : w / 2;
  const panelCy = h * 0.4;
  // Clamped to the frame: on a narrow value-free-form width, totalW * 1.35 alone
  // could exceed contentW and bleed the panel off both edges at 9:16.
  const panelWRaw = Math.max(totalW * 1.35, leftLayout ? contentW * 0.46 : contentW * 0.6);
  const panelW = Math.min(panelWRaw, (leftLayout ? contentW * 0.56 : contentW) * 0.94);
  const panelH = panelW * 0.42;

  const gIn = easeOutCubic(enterT(env, 500));
  const popVal = easeOutBack(enterT(env, 450, 60));
  const scale = 0.7 + 0.3 * popVal;
  // Amplitude large enough to register at the coarse motion-check grid — a few
  // px of vertical drift on a large panel falls inside one downsampled cell and
  // reads as fully still.
  const bob = Math.sin(env.elapsedMs / BOB_MS) * unit * 0.4;
  const floatY = panelCy + bob;
  const breathScale = 1 + 0.025 * Math.sin(env.elapsedMs / (BOB_MS * 0.7));

  ctx.save();
  ctx.globalAlpha = gIn * leave;
  ctx.translate(panelCx, floatY);
  ctx.scale(Math.max(0.001, scale * breathScale), Math.max(0.001, scale * breathScale));
  applyElevation(ctx, unit, "floating");
  roundRect(ctx, -panelW / 2, -panelH / 2, panelW, panelH, unit * RADIUS.lg);
  const grad = ctx.createLinearGradient(0, -panelH / 2, 0, panelH / 2);
  grad.addColorStop(0, rgba(secondary, 0.28));
  grad.addColorStop(1, rgba(THEME.panel, 0.9));
  ctx.fillStyle = grad;
  ctx.fill();
  clearShadow(ctx);
  roundRect(ctx, -panelW / 2, -panelH / 2, panelW, panelH, unit * RADIUS.lg);
  ctx.strokeStyle = rgba(accent, 0.35);
  ctx.lineWidth = unit * 0.05;
  ctx.stroke();
  ctx.restore();

  const pop = easeOutBack(enterT(env, 450, 60));
  const s = 0.7 + 0.3 * pop;
  ctx.save();
  ctx.globalAlpha = enterT(env, 300, 60) * leave;
  ctx.translate(panelCx, floatY - vpx * 0.08);
  ctx.scale(s, s);
  ctx.font = `900 ${vpx}px ${FONT_SANS}`;
  ctx.shadowColor = accentGlow;
  const breathe = idle(env, PULSE_MS);
  ctx.shadowBlur = unit * (1.15 + 0.35 * breathe);
  const leftEdge = -totalW / 2;
  drawOdometer(ctx, env, scene.value, leftEdge, vpx * 0.34, vpx, digitW, accent);
  clearShadow(ctx);
  ctx.restore();

  // Label. It must wait for the reels: at a fixed 320ms it faded in over digits
  // that keep spinning until ~950ms, so the two overlapped for most of a second.
  const digitCount = [...scene.value].filter((c) => DIGIT.test(c)).length;
  const odoSettleMs = ODO_DELAY_MS + Math.max(0, digitCount - 1) * ODO_STAGGER_MS + ODO_ROLL_MS;
  const labelIn = easeOutCubic(enterT(env, 380, odoSettleMs - 150));
  ctx.save();
  ctx.globalAlpha = labelIn * leave;
  ctx.font = `700 ${unit * 1.5}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  const labelLines = wrapText(ctx, scene.label, (leftLayout ? contentW * 0.5 : contentW) * 0.92);
  if (leftLayout) {
    ctx.textAlign = "left";
    const ly = floatY + panelH / 2 + unit * 1.6;
    labelLines.forEach((line, i) => ctx.fillText(line, contentX, ly + i * unit * 1.7));
  } else {
    ctx.textAlign = "center";
    const ly = floatY + panelH / 2 + unit * 1.6;
    labelLines.forEach((line, i) => ctx.fillText(line, w / 2, ly + i * unit * 1.7));
  }
  ctx.restore();

  // Context: beside the panel in the wide layout, below the label in the narrow one.
  if (scene.context) {
    ctx.save();
    // Duration-aware: on a long card the context line arrives mid-beat rather
    // than 1.5s in, so the frame is still changing when the viewer looks back.
    ctx.globalAlpha =
      easeOutCubic(Math.max(revealT(env, 0.42, 0.62), enterT(env, 380, odoSettleMs + 120) * 0.35)) * leave;
    ctx.font = `500 ${unit * 0.95}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    if (leftLayout) {
      ctx.textAlign = "left";
      const cxr = w * 0.58;
      const cLines = wrapText(ctx, scene.context, w * 0.36);
      const blockH = cLines.length * unit * 1.35;
      const cyc = floatY - blockH / 2;
      // Accent rail marks the context column apart from the value.
      ctx.fillStyle = rgba(accent, 0.5);
      ctx.fillRect(cxr - unit * 0.5, cyc - unit * 0.6, unit * 0.1, blockH + unit * 0.4);
      ctx.fillStyle = THEME.textDim;
      cLines.forEach((line, i) => ctx.fillText(line, cxr, cyc + i * unit * 1.35));
    } else {
      ctx.textAlign = "center";
      // Must follow the label's actual line count — a fixed offset would overlap
      // the context onto the label's second line.
      const cLines = wrapText(ctx, scene.context, contentW * 0.85);
      const cyc = floatY + panelH / 2 + unit * 1.6 + labelLines.length * unit * 1.7 + unit * 1.1;
      const lastY = cyc + (cLines.length - 1) * unit * 1.35;
      // Nothing load-bearing may sit in the caption band.
      const lift = Math.max(0, lastY - (layout.safeBottom - unit * 0.4));
      cLines.forEach((line, i) => ctx.fillText(line, w / 2, cyc - lift + i * unit * 1.35));
    }
    ctx.restore();
  }
  ctx.textAlign = "start";
}

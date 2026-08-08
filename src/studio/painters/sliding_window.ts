import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  easeInOutCubic,
  clamp01,
  enterT,
  departT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  flowDots,
  glowRing,
  rgba,
  type Palette,
} from "./common";
import type { PaintEnv } from "./index";

type SlidingWindowScene = Extract<Scene, { kind: "slidingwindow" }>;
type Step = SlidingWindowScene["steps"][number];

const MAX_CELL_UNIT = 2.4;
/** Dark ink on a bright accent-tone badge — same convention as cipher.ts's `INK_ON_ACCENT`. */
const INK_ON_ACCENT = "#06121a";

/** Tone → the hex the window frame + in-window cells derive from. */
function toneHex(tone: Step["tone"], palette: Palette): string {
  if (tone === "good") return THEME.good;
  if (tone === "warn") return THEME.warn;
  return palette.accent;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A movable, resizable window frame sliding over a row of value cells (an
 * array / byte stream / packet queue). Each beat sets the inclusive [left..right]
 * bounds; the translucent accent frame slides AND resizes from the previous beat's
 * bounds to the current one, dragging L / R pointer chips with it while cells it
 * covers light up and a running aggregate readout (sum / max / count / throughput)
 * pops to the new value. Generalises TCP flow-control windows, download-rate
 * windows, and greedy jump windows. Horizontal strip is centred in both 16:9 and
 * 9:16 with the cell size fit to the available width.
 */
export function paintSlidingWindow(ctx: CanvasRenderingContext2D, scene: SlidingWindowScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow } = env.palette;
  const n = scene.values.length;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const leave = departT(env, 380);
  if (leave <= 0) return;
  const introIn = easeOutCubic(enterT(env, 380)) * leave;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  // Strip geometry (single horizontal row, centred).
  const gap = unit * 0.34;
  const cell = Math.max(unit * 0.9, Math.min((contentW - gap * (n - 1)) / n, unit * MAX_CELL_UNIT));
  const stripW = n * cell + gap * (n - 1);
  const stripX = contentX + (contentW - stripW) / 2;
  const pad = cell * 0.26;
  const chipH = unit * 1.15;
  const readoutH = unit * 3.0;
  const groupH = chipH + unit * 0.4 + (cell + pad * 2) + unit * 1.0 + readoutH;
  const top = areaY + Math.max(0, (areaH - groupH) / 2);
  const stripTop = top + chipH + unit * 0.4 + pad;
  const frameTop = stripTop - pad;
  const frameBot = stripTop + cell + pad;
  const readoutY = frameBot + unit * 1.0;
  const radius = cell * 0.16;

  const cellX = (i: number) => stripX + i * (cell + gap);
  const cellCX = (i: number) => cellX(i) + cell / 2;
  const cellCY = stripTop + cell / 2;
  const edgeL = (i: number) => cellX(i) - gap / 2;
  const edgeR = (i: number) => cellX(i) + cell + gap / 2;
  const clampIdx = (i: number) => Math.max(0, Math.min(n - 1, i));

  // Current + previous window bounds (interpolate for the slide/resize).
  const step: Step | undefined = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const ease = easeInOutCubic(clamp01(stepT * 1.25));

  let winL = 0;
  let winR = 0;
  let leftPx = 0;
  let rightPx = 0;
  let toneCol = accent;
  if (step) {
    winL = clampIdx(step.left);
    winR = clampIdx(Math.max(step.left, step.right));
    const prev = activeStep >= 1 ? scene.steps[activeStep - 1] : undefined;
    const prevL = prev ? clampIdx(prev.left) : winL;
    const prevR = prev ? clampIdx(Math.max(prev.left, prev.right)) : winL; // first frame expands from a collapsed edge
    leftPx = lerp(edgeL(prevL), edgeL(winL), ease);
    rightPx = lerp(edgeR(prevR), edgeR(winR), ease);
    toneCol = toneHex(step.tone, env.palette);
  }

  // Directional "stream" under the strip (order flows left→right).
  if (introIn > 0.3) {
    flowDots(ctx, [{ x: stripX, y: frameBot + pad * 0.7 }, { x: stripX + stripW, y: frameBot + pad * 0.7 }], env, {
      count: Math.min(4, Math.ceil(n / 3)),
      speedMs: 2600,
      r: unit * 0.11,
      color: rgba(accent, 0.55),
      glow: true,
    });
  }

  // Value cells — the sequence, present from the start (staggered entrance).
  for (let i = 0; i < n; i++) {
    const cellIn = easeOutCubic(enterT(env, 300, 70 + i * 45));
    if (cellIn <= 0) continue;
    const x = cellX(i);
    const cx = cellCX(i);
    const inWin = step != null && cellCX(i) >= leftPx && cellCX(i) <= rightPx;
    const breathe = inWin ? 0.82 + 0.18 * idle(env, 1700, i * 0.6) : 1;

    ctx.save();
    ctx.globalAlpha = introIn * cellIn;
    if (inWin) {
      ctx.shadowColor = rgba(toneCol, 0.5);
      ctx.shadowBlur = unit * 0.7 * breathe;
    }
    roundRect(ctx, x, stripTop, cell, cell, radius);
    ctx.fillStyle = inWin ? rgba(toneCol, 0.2) : THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, x, stripTop, cell, cell, radius);
    ctx.strokeStyle = inWin ? rgba(toneCol, 0.9 * breathe) : rgba(THEME.textDim, 0.32);
    ctx.lineWidth = unit * (inWin ? 0.1 : 0.055);
    ctx.stroke();

    const val = scene.values[i];
    const fontPx = fitFontSize(ctx, val, {
      maxW: cell * 0.78,
      startPx: cell * 0.5,
      minPx: Math.min(unit * 0.7, cell * 0.42),
      weight: 800,
      family: FONT_MONO,
    });
    ctx.font = `800 ${fontPx}px ${FONT_MONO}`;
    ctx.fillStyle = inWin ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(val, cx, cellCY);

    // Index rail beneath each cell (dim monospace).
    ctx.globalAlpha = introIn * cellIn * 0.5;
    ctx.font = `600 ${unit * 0.5}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.textFaint;
    ctx.fillText(String(i), cx, frameBot + unit * 0.45);
    ctx.restore();
  }

  // The sliding window frame + pointer chips.
  if (step && stepT > 0.001) {
    const fw = rightPx - leftPx;
    const glow = 0.5 + 0.5 * idle(env, 1500);

    ctx.save();
    ctx.globalAlpha = introIn;
    // Translucent fill.
    roundRect(ctx, leftPx, frameTop, fw, frameBot - frameTop, radius + pad * 0.4);
    ctx.fillStyle = rgba(toneCol, 0.1);
    ctx.fill();
    // Glowing frame border (breathes).
    ctx.shadowColor = rgba(toneCol, 0.55);
    ctx.shadowBlur = unit * 0.9 * glow;
    roundRect(ctx, leftPx, frameTop, fw, frameBot - frameTop, radius + pad * 0.4);
    ctx.strokeStyle = toneCol;
    ctx.lineWidth = unit * 0.13;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Width badge on the frame top edge.
    const width = winR - winL + 1;
    const wLabel = `w = ${width}`;
    ctx.font = `800 ${unit * 0.62}px ${FONT_SANS}`;
    const wtw = ctx.measureText(wLabel).width;
    const wbx = (leftPx + rightPx) / 2 - wtw / 2 - unit * 0.4;
    ctx.fillStyle = toneCol;
    roundRect(ctx, wbx, frameTop - unit * 0.55, wtw + unit * 0.8, unit * 1.05, unit * 0.28);
    ctx.fill();
    ctx.fillStyle = INK_ON_ACCENT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(wLabel, (leftPx + rightPx) / 2, frameTop - unit * 0.02);
    ctx.restore();

    // L / R pointer chips that ride the moving edges.
    drawPointer(ctx, "L", leftPx, frameTop, unit, toneCol, introIn);
    drawPointer(ctx, "R", rightPx, frameTop, unit, toneCol, introIn);
  }

  // Aggregate readout panel.
  if (step) {
    const width = winR - winL + 1;
    const value = step.value && step.value.length ? step.value : String(width);
    const panelW = Math.min(stripW, Math.max(unit * 9, unit * 12));
    const panelX = contentX + (contentW - panelW) / 2;
    const enter = easeOutCubic(enterT(env, 420, 120));
    const pop = 1 + (1 - easeOutBack(clamp01(stepT * 2.2))) * 0.18; // value snaps on each new step

    ctx.save();
    ctx.globalAlpha = introIn * enter;
    ctx.shadowColor = rgba(toneCol, 0.28);
    ctx.shadowBlur = unit * 0.8;
    roundRect(ctx, panelX, readoutY, panelW, readoutH, unit * 0.5);
    ctx.fillStyle = rgba(THEME.bgBottom, 0.9);
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, panelX, readoutY, panelW, readoutH, unit * 0.5);
    ctx.strokeStyle = rgba(toneCol, 0.4);
    ctx.lineWidth = unit * 0.06;
    ctx.stroke();

    // Metric label (dim caption) + big value (tone).
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${unit * 0.62}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(scene.metric.toUpperCase(), panelX + unit * 0.9, readoutY + unit * 1.05);
    const valPx = fitFontSize(ctx, value, {
      maxW: panelW * 0.5,
      startPx: unit * 1.55,
      minPx: unit * 0.9,
      weight: 800,
      family: FONT_MONO,
    });
    ctx.font = `800 ${valPx * pop}px ${FONT_MONO}`;
    ctx.fillStyle = toneCol;
    ctx.fillText(value, panelX + unit * 0.9, readoutY + readoutH - unit * 0.7);

    // L / R / width chips on the right.
    const chips = [`L ${winL}`, `R ${winR}`, `× ${width}`];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let chipX = panelX + panelW - unit * 0.9;
    for (let i = chips.length - 1; i >= 0; i--) {
      ctx.font = `800 ${unit * 0.6}px ${FONT_MONO}`;
      const cw = ctx.measureText(chips[i]).width + unit * 0.9;
      chipX -= cw;
      roundRect(ctx, chipX, readoutY + readoutH / 2 - unit * 0.62, cw, unit * 1.24, unit * 0.3);
      ctx.fillStyle = i < 2 ? rgba(toneCol, 0.16) : rgba(THEME.textDim, 0.14);
      ctx.fill();
      ctx.fillStyle = i < 2 ? toneCol : THEME.textDim;
      ctx.fillText(chips[i], chipX + cw / 2, readoutY + readoutH / 2);
      chipX -= unit * 0.35;
    }

    // Note caption under the panel.
    if (step.note) {
      const noteIn = easeOutCubic(clamp01((stepT - 0.15) / 0.5));
      ctx.globalAlpha = introIn * enter * noteIn;
      ctx.font = `600 ${unit * 0.66}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(step.note, contentX + contentW / 2, readoutY + readoutH + unit * 1.15);
    }
    ctx.restore();

    // Pulsing focus ring on the readout when the value just changed.
    if (stepT < 0.4) glowRing(ctx, panelX + unit * 0.9 + unit * 0.4, readoutY + readoutH - unit * 1.1, unit * 0.5, toneCol, env, 1400);
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/** A rounded pointer chip with a downward beak that rides a moving window edge. */
function drawPointer(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  frameTop: number,
  unit: number,
  color: string,
  alpha: number
) {
  const w = unit * 1.25;
  const h = unit * 1.1;
  const cy = frameTop - unit * 0.95;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = rgba(color, 0.5);
  ctx.shadowBlur = unit * 0.5;
  roundRect(ctx, x - w / 2, cy - h / 2, w, h, unit * 0.28);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  // Downward beak toward the frame edge.
  ctx.beginPath();
  ctx.moveTo(x - unit * 0.28, cy + h / 2 - unit * 0.02);
  ctx.lineTo(x + unit * 0.28, cy + h / 2 - unit * 0.02);
  ctx.lineTo(x, cy + h / 2 + unit * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK_ON_ACCENT;
  ctx.font = `800 ${unit * 0.68}px ${FONT_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, cy);
  ctx.restore();
}

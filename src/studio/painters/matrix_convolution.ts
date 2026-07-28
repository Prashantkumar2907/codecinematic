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
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  flowDots,
  glowRing,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type ConvScene = Extract<Scene, { kind: "matrix_convolution" }>;
type Step = ConvScene["steps"][number];
type Rect = { x: number; y: number; w: number; h: number };

const MAX_INPUT_CELL_UNIT = 2.0;
const MAX_KERNEL_CELL_UNIT = 1.55;
const MAX_OUTPUT_CELL_UNIT = 2.15;
const SLIDE_END = 0.4; // stepT boundary: kernel finishes sliding to its new position
const MULT_END = 0.78; // stepT boundary: elementwise products finish popping in

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Largest cell size that fits `rows x cols` (with `gap` between cells) inside w x h. */
function fitCell(w: number, h: number, rows: number, cols: number, gap: number, maxUnit: number, unit: number): number {
  return Math.max(unit * 0.5, Math.min((w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows, unit * maxUnit));
}

/** Draws a small dim caption at the top-left of `rect` and returns the rect below it. */
function withHeader(ctx: CanvasRenderingContext2D, rect: Rect, text: string, unit: number, alpha: number): Rect {
  ctx.save();
  ctx.globalAlpha = alpha * 0.8;
  ctx.font = `800 ${unit * 0.52}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, rect.x, rect.y + unit * 0.5);
  ctx.restore();
  const h = unit * 0.9;
  return { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h };
}

/**
 * A kernel/filter window sliding over a larger input grid: it lands on a
 * position, pops the elementwise products over every covered input cell, then
 * a beam carries the summed value into the matching feature-map cell. Three
 * grids share the frame — input (left/top, large), a static kernel legend
 * (small, always-visible reference), and the output feature map (right/bottom,
 * filling in one cell per beat). Models convolution as "slide, multiply, sum"
 * for any kernel/stride/padding scheme, since each step gives its own explicit
 * kernel position and output cell rather than the painter deriving one from a
 * stride formula (simpler and robust to non-uniform traversal or same-padding).
 */
export function paintMatrixConvolution(ctx: CanvasRenderingContext2D, scene: ConvScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const { inputRows, inputCols, kernelRows, kernelCols, outputRows, outputCols } = scene;
  const inAt = (r: number, c: number) => scene.inputValues[r * inputCols + c] ?? "";
  const kAt = (r: number, c: number) => scene.kernelValues[r * kernelCols + c] ?? "";

  // Three regions, laid side-by-side in 16:9 and stacked in 9:16.
  let inputRectFull: Rect, kernelRectFull: Rect, outputRectFull: Rect;
  if (!vertical) {
    const gapCol = contentW * 0.045;
    const inputW = contentW * 0.56;
    const rightX = contentX + inputW + gapCol;
    const rightW = contentW - inputW - gapCol;
    inputRectFull = { x: contentX, y: areaY, w: inputW, h: areaH };
    kernelRectFull = { x: rightX, y: areaY, w: rightW, h: areaH * 0.32 };
    outputRectFull = { x: rightX, y: areaY + areaH * 0.4, w: rightW, h: areaH * 0.6 };
  } else {
    const gapRow = areaH * 0.05;
    const inputH = areaH * 0.46;
    const belowY = areaY + inputH + gapRow;
    const belowH = areaH - inputH - gapRow;
    inputRectFull = { x: contentX, y: areaY, w: contentW, h: inputH };
    kernelRectFull = { x: contentX, y: belowY, w: contentW * 0.4, h: belowH };
    outputRectFull = { x: contentX + contentW * 0.46, y: belowY, w: contentW * 0.54, h: belowH };
  }

  const panelIn = easeOutCubic(enterT(env, 420, 80));
  const inputRect = withHeader(ctx, inputRectFull, "INPUT", unit, introIn * panelIn);
  const kernelRect = withHeader(ctx, kernelRectFull, "KERNEL", unit, introIn * panelIn);
  const outputRect = withHeader(ctx, outputRectFull, "OUTPUT", unit, introIn * panelIn);

  // Input grid geometry.
  const gapIn = unit * 0.2;
  const cellIn = fitCell(inputRect.w, inputRect.h, inputRows, inputCols, gapIn, MAX_INPUT_CELL_UNIT, unit);
  const gridInW = inputCols * cellIn + gapIn * (inputCols - 1);
  const gridInH = inputRows * cellIn + gapIn * (inputRows - 1);
  const gridInX = inputRect.x + Math.max(0, (inputRect.w - gridInW) / 2);
  const gridInY = inputRect.y + Math.max(0, (inputRect.h - gridInH) / 2);
  const inCellX = (c: number) => gridInX + c * (cellIn + gapIn);
  const inCellY = (r: number) => gridInY + r * (cellIn + gapIn);

  // Kernel legend geometry (static reference, always visible once entered).
  const gapK = unit * 0.14;
  const cellK = fitCell(kernelRect.w, kernelRect.h, kernelRows, kernelCols, gapK, MAX_KERNEL_CELL_UNIT, unit);
  const gridKW = kernelCols * cellK + gapK * (kernelCols - 1);
  const gridKH = kernelRows * cellK + gapK * (kernelRows - 1);
  const gridKX = kernelRect.x + Math.max(0, (kernelRect.w - gridKW) / 2);
  const gridKY = kernelRect.y + Math.max(0, (kernelRect.h - gridKH) / 2);

  // Output grid geometry.
  const gapOut = unit * 0.22;
  const cellOut = fitCell(outputRect.w, outputRect.h, outputRows, outputCols, gapOut, MAX_OUTPUT_CELL_UNIT, unit);
  const gridOutW = outputCols * cellOut + gapOut * (outputCols - 1);
  const gridOutH = outputRows * cellOut + gapOut * (outputRows - 1);
  const gridOutX = outputRect.x + Math.max(0, (outputRect.w - gridOutW) / 2);
  const gridOutY = outputRect.y + Math.max(0, (outputRect.h - gridOutH) / 2);
  const outCellX = (c: number) => gridOutX + c * (cellOut + gapOut);
  const outCellY = (r: number) => gridOutY + r * (cellOut + gapOut);
  const outCentre = (r: number, c: number) => ({ x: outCellX(c) + cellOut / 2, y: outCellY(r) + cellOut / 2 });
  const radiusOut = cellOut * 0.16;

  // Replay: which output cells are already written, and with what.
  const filled = new Map<string, { value: string; step: number }>();
  for (let k = 0; k <= activeStep; k++) {
    const s = scene.steps[k];
    if (s.outRow < outputRows && s.outCol < outputCols) filled.set(`${s.outRow},${s.outCol}`, { value: s.result, step: k });
  }
  const step: Step | undefined = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const prevStep: Step | undefined = activeStep >= 1 ? scene.steps[activeStep - 1] : undefined;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const slideT = easeInOutCubic(clamp01(stepT / SLIDE_END));
  const multT = clamp01((stepT - SLIDE_END) / (MULT_END - SLIDE_END));
  const flowT = clamp01((stepT - MULT_END) / (1 - MULT_END));

  // Kernel window pixel bounds, interpolated from the previous step's position.
  const fromAtRow = prevStep?.atRow ?? step?.atRow ?? 0;
  const fromAtCol = prevStep?.atCol ?? step?.atCol ?? 0;
  const curAtRow = step ? lerp(fromAtRow, step.atRow, slideT) : 0;
  const curAtCol = step ? lerp(fromAtCol, step.atCol, slideT) : 0;
  const winL = gridInX + curAtCol * (cellIn + gapIn) - gapIn / 2;
  const winT = gridInY + curAtRow * (cellIn + gapIn) - gapIn / 2;
  const winW = kernelCols * cellIn + gapIn * (kernelCols - 1) + gapIn;
  const winH = kernelRows * cellIn + gapIn * (kernelRows - 1) + gapIn;
  const winCentre = { x: winL + winW / 2, y: winT + winH / 2 };

  // --- Kernel legend: static grid of weights, breathes while multiplying. ---
  {
    const legendGlow = step && multT > 0 && multT < 1 ? 0.5 + 0.5 * idle(env, 900) : 0.35;
    for (let r = 0; r < kernelRows; r++) {
      for (let c = 0; c < kernelCols; c++) {
        const cellInMs = enterT(env, 260, 140 + (r * kernelCols + c) * 30);
        if (cellInMs <= 0) continue;
        const x = gridKX + c * (cellK + gapK);
        const y = gridKY + r * (cellK + gapK);
        ctx.save();
        ctx.globalAlpha = introIn * easeOutCubic(cellInMs);
        ctx.shadowColor = rgba(secondary, 0.4 * legendGlow);
        ctx.shadowBlur = unit * 0.5 * legendGlow;
        roundRect(ctx, x, y, cellK, cellK, cellK * 0.16);
        ctx.fillStyle = rgba(secondary, 0.14);
        ctx.fill();
        ctx.shadowBlur = 0;
        roundRect(ctx, x, y, cellK, cellK, cellK * 0.16);
        ctx.strokeStyle = rgba(secondary, 0.55 + 0.35 * legendGlow);
        ctx.lineWidth = unit * 0.06;
        ctx.stroke();
        const val = kAt(r, c);
        const fontPx = fitFontSize(ctx, val, {
          maxW: cellK * 0.78,
          startPx: cellK * 0.5,
          minPx: Math.min(unit * 0.6, cellK * 0.4),
          weight: 800,
          family: FONT_MONO,
        });
        ctx.font = `800 ${fontPx}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(val, x + cellK / 2, y + cellK / 2);
        ctx.restore();
      }
    }
  }

  // --- Input grid: every value cell, dim by default, lit while under the window. ---
  for (let r = 0; r < inputRows; r++) {
    for (let c = 0; c < inputCols; c++) {
      const cellInMs = enterT(env, 300, 60 + (r * inputCols + c) * 18);
      if (cellInMs <= 0) continue;
      const x = inCellX(c);
      const y = inCellY(r);
      const cx = x + cellIn / 2;
      const cy = y + cellIn / 2;
      const covered = !!step && cx >= winL && cx <= winL + winW && cy >= winT && cy <= winT + winH;
      const breathe = covered ? 0.82 + 0.18 * idle(env, 1400, (r + c) * 0.4) : 1;
      ctx.save();
      ctx.globalAlpha = introIn * easeOutCubic(cellInMs);
      if (covered) {
        ctx.shadowColor = rgba(accent, 0.5);
        ctx.shadowBlur = unit * 0.6 * breathe;
      }
      roundRect(ctx, x, y, cellIn, cellIn, cellIn * 0.14);
      ctx.fillStyle = covered ? rgba(accent, 0.2) : THEME.panel;
      ctx.fill();
      ctx.shadowBlur = 0;
      roundRect(ctx, x, y, cellIn, cellIn, cellIn * 0.14);
      ctx.strokeStyle = covered ? rgba(accent, 0.9 * breathe) : "rgba(148,163,184,0.3)";
      ctx.lineWidth = unit * (covered ? 0.09 : 0.05);
      ctx.stroke();
      const val = inAt(r, c);
      const fontPx = fitFontSize(ctx, val, {
        maxW: cellIn * 0.78,
        startPx: cellIn * 0.48,
        minPx: Math.min(unit * 0.6, cellIn * 0.38),
        weight: 700,
        family: FONT_MONO,
      });
      ctx.font = `700 ${fontPx}px ${FONT_MONO}`;
      ctx.fillStyle = covered ? THEME.text : THEME.textDim;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(val, cx, cy);
      ctx.restore();
    }
  }

  // --- Sliding kernel window frame over the input. ---
  if (step) {
    const glow = 0.5 + 0.5 * idle(env, 1500);
    ctx.save();
    ctx.globalAlpha = introIn;
    roundRect(ctx, winL, winT, winW, winH, cellIn * 0.2);
    ctx.fillStyle = rgba(accent, 0.08);
    ctx.fill();
    ctx.shadowColor = rgba(accent, 0.55);
    ctx.shadowBlur = unit * 0.85 * glow;
    roundRect(ctx, winL, winT, winW, winH, cellIn * 0.2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.11;
    ctx.stroke();
    ctx.restore();

    // Elementwise products, popped in over each covered input cell.
    if (multT > 0) {
      const n = kernelRows * kernelCols;
      for (let r = 0; r < kernelRows; r++) {
        for (let c = 0; c < kernelCols; c++) {
          const idx = r * kernelCols + c;
          const local = clamp01((multT - (idx / n) * 0.6) / 0.55);
          if (local <= 0) continue;
          const inR = step.atRow + r;
          const inC = step.atCol + c;
          if (inR >= inputRows || inC >= inputCols) continue;
          const cx = inCellX(inC) + cellIn / 2;
          const cy = inCellY(inR) + cellIn / 2;
          const val = step.products[idx] ?? "";
          const pop = easeOutBack(local);
          const fontPx = Math.min(unit * 0.62, cellIn * 0.42);
          ctx.save();
          ctx.globalAlpha = introIn * easeOutCubic(local);
          ctx.font = `800 ${fontPx * pop}px ${FONT_MONO}`;
          ctx.fillStyle = "rgba(6,10,15,0.82)";
          const tw = ctx.measureText(val).width;
          roundRect(ctx, cx - tw / 2 - unit * 0.14, cy - fontPx * 0.62, tw + unit * 0.28, fontPx * 1.24, fontPx * 0.3);
          ctx.fill();
          ctx.fillStyle = secondary;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(val, cx, cy);
          ctx.restore();
        }
      }
    }

    // Beam carrying the sum from the window to the target output cell.
    if (flowT > 0 && step.outRow < outputRows && step.outCol < outputCols) {
      const tgt = outCentre(step.outRow, step.outCol);
      const drawT = easeOutCubic(flowT);
      const tip = { x: winCentre.x + (tgt.x - winCentre.x) * drawT, y: winCentre.y + (tgt.y - winCentre.y) * drawT };
      ctx.save();
      ctx.globalAlpha = introIn * (0.4 + 0.5 * drawT);
      ctx.strokeStyle = rgba(secondary, 0.75);
      ctx.lineWidth = unit * 0.08;
      ctx.setLineDash([unit * 0.24, unit * 0.2]);
      ctx.beginPath();
      ctx.moveTo(winCentre.x, winCentre.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      flowDots(ctx, [winCentre, tip], env, { count: 2, speedMs: 700, r: unit * 0.16, color: secondary });
    }
  }

  // --- Output feature map: dashed ghosts until written, then pop the result. ---
  for (let r = 0; r < outputRows; r++) {
    for (let c = 0; c < outputCols; c++) {
      const x = outCellX(c);
      const y = outCellY(r);
      const st = filled.get(`${r},${c}`);
      const isActiveWrite = !!step && step.outRow === r && step.outCol === c;
      if (!st) {
        const ghostIn = enterT(env, 260, 100 + (r * outputCols + c) * 26);
        if (ghostIn <= 0) continue;
        ctx.save();
        ctx.globalAlpha = 0.14 * introIn * easeOutCubic(ghostIn);
        ctx.strokeStyle = "rgba(148,163,184,0.9)";
        ctx.lineWidth = unit * 0.05;
        ctx.setLineDash([unit * 0.24, unit * 0.2]);
        roundRect(ctx, x, y, cellOut, cellOut, radiusOut);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        continue;
      }
      const local = isActiveWrite ? flowT : 1;
      if (local <= 0) continue;
      const appear = easeOutCubic(local);
      const pop = isActiveWrite ? easeOutBack(local) : 1;
      const cx = x + cellOut / 2;
      const cy = y + cellOut / 2;
      const breathe = isActiveWrite ? 0.75 + 0.25 * idle(env, 1200) : 1;
      ctx.save();
      ctx.globalAlpha = appear * introIn;
      if (isActiveWrite && local < 1) {
        ctx.shadowColor = secondaryGlow;
        ctx.shadowBlur = unit * 0.8;
      }
      roundRect(ctx, x, y, cellOut, cellOut, radiusOut);
      ctx.fillStyle = isActiveWrite ? rgba(secondary, 0.24) : rgba(accent, 0.14);
      ctx.fill();
      ctx.shadowBlur = 0;
      roundRect(ctx, x, y, cellOut, cellOut, radiusOut);
      ctx.strokeStyle = isActiveWrite ? secondary : rgba(accent, 0.6);
      ctx.lineWidth = unit * (isActiveWrite ? 0.1 : 0.06);
      ctx.globalAlpha = appear * introIn * breathe;
      ctx.stroke();
      const fontPx = fitFontSize(ctx, st.value, {
        maxW: cellOut * 0.78,
        startPx: cellOut * 0.48,
        minPx: Math.min(unit * 0.65, cellOut * 0.4),
        weight: 800,
        family: FONT_MONO,
      });
      ctx.font = `800 ${fontPx * pop}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.text;
      ctx.globalAlpha = appear * introIn;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(st.value, cx, cy);
      ctx.restore();
      if (isActiveWrite && local > 0.7 && local < 1) glowRing(ctx, cx, cy, cellOut * 0.5, secondary, env, 900);
    }
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

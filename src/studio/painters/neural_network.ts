import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
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

type NNScene = Extract<Scene, { kind: "neural_network" }>;
type Step = NNScene["steps"][number];
type Pt = { x: number; y: number };

/** Fraction of a boundary's/layer's cross-axis span used to spread its nodes. */
const CROSS_SPAN = 0.62;

/**
 * A layered feed-forward network (input → hidden(s) → output), auto-arranged
 * into columns of node circles fully connected to the next column. A `forward`
 * step lights the edges feeding `layerIndex` and pops that layer's nodes in
 * (activations flowing left→right, top→bottom in 9:16); a `backward` step
 * colors the edges between `layerIndex` and `layerIndex+1` and animates the
 * flow in reverse (gradients flowing right→left). `layerIndex === n-1` on a
 * backward step just highlights the output layer itself (where the loss is
 * computed, before any weights are touched). Generalizes both a full
 * forward+backward pass (backprop) and a forward-only walk through named
 * pieces (e.g. a transformer block's sub-layers).
 */
export function paintNeuralNetwork(ctx: CanvasRenderingContext2D, scene: NNScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const layers = scene.layers;
  const n = layers.length;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.5;
  const areaY = contentY + band;
  const bottom = vertical ? Math.min(contentY + contentH, layout.h * 0.88) : contentY + contentH;
  const areaH = bottom - areaY;
  const areaX = contentX;
  const areaW = contentW;

  const mainBase = vertical ? areaY : areaX;
  const mainSpan = vertical ? areaH : areaW;
  const colCenter = (i: number) => mainBase + ((i + 0.5) / n) * mainSpan;

  const crossBase = vertical ? areaX + areaW / 2 : areaY + areaH * 0.46;
  const crossDim = vertical ? areaW : areaH;
  const crossAvail = crossDim * CROSS_SPAN;
  const maxSize = Math.max(...layers.map((l) => l.size));
  const nodeGap = Math.min(unit * 1.5, crossAvail / Math.max(maxSize, 1));
  const nodeR = Math.min(unit * 0.5, nodeGap * 0.4);

  const nodePos = (li: number, ni: number, size: number): Pt => {
    const c = colCenter(li);
    const cross = crossBase + (ni - (size - 1) / 2) * nodeGap;
    return vertical ? { x: cross, y: c } : { x: c, y: cross };
  };
  const chipAt = (li: number): Pt => {
    const cross = crossBase - crossAvail / 2 - unit * 0.9;
    return vertical ? { x: cross, y: colCenter(li) } : { x: colCenter(li), y: cross };
  };
  const chipMid = (a: number, b: number): Pt => {
    const cross = crossBase - crossAvail / 2 - unit * 0.9;
    const c = (colCenter(a) + colCenter(b)) / 2;
    return vertical ? { x: cross, y: c } : { x: c, y: cross };
  };
  const labelAt = (li: number): Pt => {
    const cross = crossBase + crossAvail / 2 + unit * 0.9;
    return vertical ? { x: cross, y: colCenter(li) } : { x: colCenter(li), y: cross };
  };

  // Replay steps 0..activeStep: first step that touches a layer/boundary wins.
  const forwardStep = new Map<number, number>();
  const backwardStep = new Map<number, number>();
  for (let k = 0; k <= activeStep; k++) {
    const st = scene.steps[k];
    const li = clamp01Idx(st.layerIndex, n - 1);
    const map = st.direction === "backward" ? backwardStep : forwardStep;
    if (!map.has(li)) map.set(li, k);
  }
  const curStepRaw: Step | undefined = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const curStep = curStepRaw ? { ...curStepRaw, layerIndex: clamp01Idx(curStepRaw.layerIndex, n - 1) } : undefined;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  // Layer labels + activation tags fade in early so the network's shape reads immediately.
  layers.forEach((layer, i) => {
    if (!layer.label && !layer.activation) return;
    const labIn = enterT(env, 340, 120 + i * 70);
    if (labIn <= 0) return;
    const p = labelAt(i);
    ctx.save();
    ctx.globalAlpha = introIn * easeOutCubic(labIn);
    ctx.textAlign = vertical ? "left" : "center";
    ctx.textBaseline = "middle";
    if (layer.label) {
      const px = fitFontSize(ctx, layer.label, { maxW: unit * 5, startPx: unit * 0.62, minPx: unit * 0.42, weight: 700 });
      ctx.font = `700 ${px}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.fillText(layer.label, p.x, p.y - (layer.activation ? unit * 0.42 : 0));
    }
    if (layer.activation) {
      ctx.font = `600 ${unit * 0.46}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(layer.activation, p.x, p.y + (layer.label ? unit * 0.42 : 0));
    }
    ctx.restore();
  });

  // Edges: ghost lines under everything, then forward/backward tints on top.
  for (let b = 0; b < n - 1; b++) {
    const sizeA = layers[b].size;
    const sizeB = layers[b + 1].size;
    const fLit = forwardStep.has(b + 1);
    const bwLit = backwardStep.has(b);
    const isFwdActive = curStep?.direction === "forward" && curStep.layerIndex === b + 1;
    const isBwActive = curStep?.direction === "backward" && curStep.layerIndex === b;
    const fAppear = isFwdActive ? easeOutCubic(clamp01(stepT * 1.4)) : 1;
    const bAppear = isBwActive ? easeOutCubic(clamp01(stepT * 1.4)) : 1;

    for (let ai = 0; ai < sizeA; ai++) {
      const pa = nodePos(b, ai, sizeA);
      for (let bi = 0; bi < sizeB; bi++) {
        const pb = nodePos(b + 1, bi, sizeB);
        ctx.save();
        ctx.globalAlpha = introIn * 0.14;
        ctx.strokeStyle = rgba(THEME.textDim, 0.85);
        ctx.lineWidth = unit * 0.032;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
        ctx.restore();

        if (fLit) {
          ctx.save();
          ctx.globalAlpha = introIn * 0.5 * fAppear;
          ctx.strokeStyle = accent;
          ctx.lineWidth = unit * 0.05;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
          ctx.restore();
        }
        if (bwLit) {
          ctx.save();
          ctx.globalAlpha = introIn * 0.58 * bAppear;
          ctx.strokeStyle = secondary;
          ctx.lineWidth = unit * 0.065;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Representative traveling packets on the active boundary (one per source
    // node, not all-to-all, so the direction reads clearly without clutter).
    if (isFwdActive) {
      for (let ai = 0; ai < sizeA; ai++) {
        const bi = ai % sizeB;
        flowDots(ctx, [nodePos(b, ai, sizeA), nodePos(b + 1, bi, sizeB)], env, {
          count: 1,
          speedMs: 900,
          r: unit * 0.13,
          color: accent,
        });
      }
    }
    if (isBwActive) {
      for (let bi = 0; bi < sizeB; bi++) {
        const ai = bi % sizeA;
        flowDots(ctx, [nodePos(b + 1, bi, sizeB), nodePos(b, ai, sizeA)], env, {
          count: 1,
          speedMs: 900,
          r: unit * 0.13,
          color: secondary,
        });
      }
    }
  }

  // Once the whole forward/backward pass has swept through, add a faint
  // continuous "spine" flow along the network's centerline as idle life.
  if (forwardStep.size === n) {
    const spine = layers.map((_, i) => (vertical ? { x: crossBase, y: colCenter(i) } : { x: colCenter(i), y: crossBase }));
    flowDots(ctx, spine, env, { count: 3, speedMs: 2600, r: unit * 0.12, color: accent, glow: false });
  }
  // Every boundary 0..n-2 colored — regardless of whether a special
  // layerIndex===n-1 "highlight the output" step was also authored (that key
  // sits outside the boundary range, so checking map SIZE would under-count).
  const backwardComplete = n > 1 && Array.from({ length: n - 1 }, (_, i) => i).every((i) => backwardStep.has(i));
  if (backwardComplete) {
    const spine = layers.map((_, i) => (vertical ? { x: crossBase, y: colCenter(i) } : { x: colCenter(i), y: crossBase })).reverse();
    flowDots(ctx, spine, env, { count: 2, speedMs: 3000, r: unit * 0.12, color: secondary, glow: false });
  }

  // Nodes on top.
  layers.forEach((layer, li) => {
    for (let ni = 0; ni < layer.size; ni++) {
      const p = nodePos(li, ni, layer.size);
      const baseIn = enterT(env, 340, 100 + li * 90 + ni * 30);
      if (baseIn <= 0) continue;
      const isActivated = forwardStep.has(li);
      const isFwdFocus = curStep?.direction === "forward" && curStep.layerIndex === li;
      const isBwTouched = backwardStep.has(li) || backwardStep.has(li - 1);
      const isBwFocus = curStep?.direction === "backward" && (curStep.layerIndex === li || curStep.layerIndex === li - 1);

      const pop = isFwdFocus ? 0.7 + 0.3 * easeOutBack(clamp01(stepT * 1.3)) : 1;
      const breathe = isActivated ? 0.94 + 0.06 * idle(env, 1700, li * 0.7 + ni * 0.4) : 1;
      const scale = pop * breathe;

      ctx.save();
      ctx.globalAlpha = introIn * easeOutCubic(baseIn);
      ctx.translate(p.x, p.y);
      ctx.scale(scale, scale);
      ctx.translate(-p.x, -p.y);

      if (isActivated) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * (isFwdFocus ? 1.1 : 0.45);
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeR, 0, Math.PI * 2);
      ctx.fillStyle = isActivated ? rgba(accent, 0.22) : THEME.panel;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeR, 0, Math.PI * 2);
      ctx.strokeStyle = isActivated ? accent : rgba(THEME.textDim, 0.45);
      ctx.lineWidth = isActivated ? unit * 0.09 : unit * 0.05;
      ctx.stroke();

      if (isBwTouched) {
        ctx.globalAlpha = introIn * 0.85;
        ctx.strokeStyle = secondary;
        ctx.lineWidth = unit * 0.06;
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeR * 1.22, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      if (isFwdFocus) glowRing(ctx, p.x, p.y, nodeR, accent, env, 1400);
      if (isBwFocus) glowRing(ctx, p.x, p.y, nodeR, secondary, env, 1400);
    }
  });

  // Chip for the active step's label, anchored to the layer (or boundary midpoint) it explains.
  if (curStep?.label) {
    const anchor =
      curStep.direction === "forward"
        ? curStep.layerIndex === 0
          ? chipAt(0)
          : chipMid(curStep.layerIndex - 1, curStep.layerIndex)
        : curStep.layerIndex === n - 1
          ? chipAt(n - 1)
          : chipMid(curStep.layerIndex, curStep.layerIndex + 1);
    const col = curStep.direction === "forward" ? accent : secondary;
    const glow = curStep.direction === "forward" ? accentGlow : secondaryGlow;
    drawStepChip(ctx, anchor.x, anchor.y, curStep.label, unit, col, glow, introIn * easeOutCubic(clamp01(stepT * 2)));
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function clamp01Idx(i: number, max: number): number {
  return Math.max(0, Math.min(max, i));
}

function drawStepChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  unit: number,
  color: string,
  glowColor: string,
  alpha: number
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${unit * 0.52}px ${FONT_MONO}`;
  const tw = ctx.measureText(text).width;
  const w = tw + unit * 0.7;
  const h = unit * 0.92;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = unit * 0.5;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, unit * 0.24);
  ctx.fillStyle = rgba(THEME.bgBottom, 0.9);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, unit * 0.24);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + unit * 0.02);
  ctx.textAlign = "start";
  ctx.restore();
}

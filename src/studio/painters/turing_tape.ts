import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_MONO,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  easeInOutCubic,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  drawArrowhead,
  flowDots,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type TapeScene = Extract<Scene, { kind: "turing_tape" }>;

const WRITE_END = 0.42;
/** Dark ink on a bright accent-tone badge — same convention as cipher.ts's `INK_ON_ACCENT`. */
const INK_ON_ACCENT = "#06121a";

/** Head index before each step executes; positions[n] is the final resting index. */
function headPositions(scene: TapeScene): number[] {
  const out = [scene.headStart];
  for (const st of scene.steps) {
    const d = st.move === "L" ? -1 : st.move === "R" ? 1 : 0;
    out.push(out[out.length - 1] + d);
  }
  return out;
}

/** Tape contents after replaying steps [0, uptoExclusive) onto the initial cells. */
function valuesUpTo(scene: TapeScene, positions: number[], uptoExclusive: number): Map<number, string> {
  const map = new Map<number, string>();
  scene.initial.forEach((v, i) => map.set(i, v));
  for (let k = 0; k < uptoExclusive; k++) {
    const st = scene.steps[k];
    if (st.write !== undefined) map.set(positions[k], st.write);
  }
  return map;
}

/** Last defined state label at or before step k (persists like a status chip). */
function stateAt(scene: TapeScene, k: number): string | undefined {
  let label: string | undefined;
  for (let i = 0; i <= k && i < scene.steps.length; i++) if (scene.steps[i].state) label = scene.steps[i].state;
  return label;
}

/**
 * An infinite tape: a head reads/writes the cell under it, then glides left or
 * right. The tape (not the head) scrolls so the active cell always sits at a
 * fixed screen anchor — cells beyond what has been touched fade into the
 * distance, selling the "infinite" read. A chip above the head tracks the
 * current machine/instruction state. Models a Turing-machine tape, a CPU
 * register/memory strip, or a single storage bit (cellCount effectively 1,
 * move:"none" throughout).
 */
export function paintTuringTape(ctx: CanvasRenderingContext2D, scene: TapeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const positions = headPositions(scene);
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = Math.min(active - offset, scene.steps.length - 1);
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const cellW = vertical ? unit * 2.15 : unit * 2.5;
  const cellH = cellW * 0.86;
  const centerX = contentX + contentW / 2;
  const tapeY = areaY + areaH * 0.56 - cellH / 2;
  const centerY = tapeY + cellH / 2;
  const headAnchorY = tapeY - unit * 0.55;

  const writeLocal = activeStep >= 0 ? clamp01(stepT / WRITE_END) : 1;
  const moveLocal = activeStep >= 0 ? easeInOutCubic(clamp01((stepT - WRITE_END) / (1 - WRITE_END))) : 0;
  const basePos = activeStep >= 0 ? positions[activeStep] : positions[0];
  const targetPos = activeStep >= 0 ? positions[activeStep + 1] : positions[0];
  const animHead = basePos + (targetPos - basePos) * moveLocal;
  const moving = activeStep >= 0 && scene.steps[activeStep].move !== "none";

  const valuesBase = valuesUpTo(scene, positions, Math.max(activeStep, 0));
  const writeVal = activeStep >= 0 ? scene.steps[activeStep].write : undefined;

  // Clip so scrolling cells never bleed past the content box.
  ctx.save();
  ctx.beginPath();
  ctx.rect(contentX, areaY, contentW, areaH);
  ctx.clip();

  const visW = contentW / 2 + cellW * 1.5;
  const jMin = Math.floor(animHead - visW / cellW) - 1;
  const jMax = Math.ceil(animHead + visW / cellW) + 1;

  for (let j = jMin; j <= jMax; j++) {
    const x = centerX + (j - animHead) * cellW;
    const distNorm = Math.abs(x - centerX) / (contentW / 2 + cellW);
    const edgeFade = clamp01(1.25 - distNorm * 1.25);
    if (edgeFade <= 0) continue;
    const enter = easeOutCubic(enterT(env, 300, 60 + Math.abs(j - scene.headStart) * 18));
    const isWriteTarget = activeStep >= 0 && j === positions[activeStep] && writeVal !== undefined;
    const known = valuesBase.has(j) || (isWriteTarget && writeLocal > 0);
    const oldVal = valuesBase.get(j) ?? scene.blank;
    const flipped = isWriteTarget && writeLocal > 0.5;
    const val = flipped ? writeVal! : oldVal;
    const pop = flipped ? easeOutBack(clamp01((writeLocal - 0.5) * 2)) : 1;
    const glowing = isWriteTarget && writeLocal > 0 && writeLocal < 1;

    ctx.save();
    ctx.globalAlpha = edgeFade * enter * introIn;
    if (glowing) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
    }
    roundRect(ctx, x - cellW / 2 + unit * 0.08, tapeY, cellW - unit * 0.16, cellH, unit * 0.28);
    ctx.fillStyle = known ? rgba(accent, 0.12) : THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (!known) ctx.setLineDash([unit * 0.22, unit * 0.2]);
    ctx.strokeStyle = known ? rgba(accent, 0.6) : rgba(THEME.textDim, 0.35);
    ctx.lineWidth = known ? unit * 0.07 : unit * 0.05;
    roundRect(ctx, x - cellW / 2 + unit * 0.08, tapeY, cellW - unit * 0.16, cellH, unit * 0.28);
    ctx.stroke();
    ctx.setLineDash([]);

    const fontPx = fitFontSize(ctx, val, {
      maxW: cellW * 0.7,
      startPx: cellH * 0.5,
      minPx: unit * 0.5,
      weight: 800,
      family: FONT_MONO,
    });
    ctx.save();
    ctx.translate(x, tapeY + cellH / 2);
    ctx.scale(pop, pop);
    ctx.font = `800 ${fontPx}px ${FONT_MONO}`;
    ctx.fillStyle = known ? THEME.text : THEME.textFaint;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(val, 0, 0);
    ctx.restore();

    if (scene.showIndex) {
      ctx.font = `500 ${unit * 0.42}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.textFaint;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(String(j), x, tapeY + cellH + unit * 0.55);
    }
    ctx.restore();
  }
  ctx.restore(); // clip

  // Directional glide cue: a short arrow that appears only while moving.
  if (moving) {
    const arrowAlpha = Math.min(clamp01(moveLocal / 0.2), clamp01((1 - moveLocal) / 0.2));
    if (arrowAlpha > 0) {
      const dir = targetPos > basePos ? 1 : -1;
      const ay = headAnchorY - unit * 1.65;
      const halfSpan = Math.min(cellW * 0.9, unit * 1.5);
      ctx.save();
      ctx.globalAlpha = arrowAlpha * 0.6 * introIn;
      ctx.strokeStyle = secondary;
      ctx.fillStyle = secondary;
      ctx.lineWidth = unit * 0.09;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(centerX - halfSpan * dir, ay);
      ctx.lineTo(centerX + halfSpan * dir, ay);
      ctx.stroke();
      drawArrowhead(ctx, centerX + halfSpan * dir, ay, dir > 0 ? 0 : Math.PI, unit * 0.42);
      ctx.restore();
    }
    flowDots(ctx, [{ x: centerX - cellW * 0.6, y: centerY }, { x: centerX + cellW * 0.6, y: centerY }], env, {
      count: 2,
      speedMs: 900,
      r: unit * 0.1,
      color: rgba(secondary, 0.7),
      glow: false,
    });
  }

  // Focus ring on the cell currently under the head.
  const ringPulse = 0.5 + 0.5 * idle(env, 1500);
  ctx.save();
  ctx.globalAlpha = introIn * (0.55 + 0.35 * ringPulse);
  ctx.strokeStyle = accent;
  ctx.lineWidth = unit * 0.1;
  roundRect(ctx, centerX - cellW / 2 - unit * 0.14, tapeY - unit * 0.14, cellW - unit * 0.16 + unit * 0.28, cellH + unit * 0.28, unit * 0.34);
  ctx.stroke();
  ctx.restore();

  // Head glyph: a downward triangle pointing at the focus cell, with a state chip above.
  const headPop = easeOutBack(enterT(env, 340, 140));
  const bob = Math.sin(env.elapsedMs / 1100) * unit * 0.06;
  ctx.save();
  ctx.globalAlpha = introIn;
  ctx.translate(centerX, headAnchorY + bob);
  ctx.scale(headPop, headPop);
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * 0.55;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, unit * 0.05);
  ctx.lineTo(-unit * 0.32, -unit * 0.42);
  ctx.lineTo(unit * 0.32, -unit * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  const label = stateAt(scene, Math.max(activeStep, 0));
  if (label) {
    // The head triangle spans roughly [headAnchorY-0.42u, headAnchorY+0.05u];
    // at the old -0.75u offset the chip's own bottom edge (chipY+0.55u) cut
    // into the triangle's top, hiding part of the head pointer behind it.
    const chipY = headAnchorY - unit * 1.05 + bob;
    const chipPop = easeOutBack(enterT(env, 300, 160));
    ctx.save();
    ctx.globalAlpha = introIn * clamp01(chipPop * 3);
    ctx.font = `800 ${unit * 0.6}px ${FONT_SANS}`;
    const tw = ctx.measureText(label).width;
    ctx.translate(centerX, chipY);
    ctx.scale(chipPop, chipPop);
    ctx.translate(-centerX, -chipY);
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.4;
    roundRect(ctx, centerX - tw / 2 - unit * 0.4, chipY - unit * 0.55, tw + unit * 0.8, unit * 1.1, unit * 0.3);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = INK_ON_ACCENT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, centerX, chipY + unit * 0.03);
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

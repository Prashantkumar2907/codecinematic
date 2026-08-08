import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  clamp01,
  clampRange,
  roundRect,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
  shade,
  STROKE,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

type ZoomladderScene = Extract<Scene, { kind: "zoomladder" }>;

const FACTOR = 6.5;
const FILL_FRAC = 0.72;
/** `THEME.panel` is within a few RGB steps of the background; lift a rung's face off it. */
const FACE_LIFT = 0.1;

export function paintZoomladder(ctx: CanvasRenderingContext2D, scene: ZoomladderScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const n = scene.rungs.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = Math.min(Math.max(active - offset, 0), n - 1);
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const titleBand = scene.title ? drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3 : 0;
  const stageY = contentY + titleBand;
  // Bounded by safeBottom, not contentH: at 9:16 contentH runs under the burned-in
  // caption and the YouTube UI band, which is where this painter's 43.5% bottom
  // bleed came from (`qa/AUDIT.md`).
  const stageH = Math.min(contentY + contentH, layout.safeBottom) - stageY;
  const stageCx = contentX + contentW / 2;
  const stageCy = stageY + stageH / 2;
  const stageMin = Math.min(contentW, stageH);
  const S = stageMin * 0.055;

  // Nesting depth per rung: "out" climbs 0->n-1, "in" reverses so beat 0
  // starts at the outermost rung and dives toward depth 0.
  const depthOf = (step: number) => (scene.direction === "in" ? n - 1 - step : step);

  const zoomFor = (step: number) => (stageMin * FILL_FRAC) / (2 * S * Math.pow(FACTOR, depthOf(step)));
  const tA = beatT(env.beats, offset + activeStep, totalBeats, env.p);
  const glide = easeInOutCubic(clamp01(tA / 0.62));

  const dPrev = depthOf(Math.max(0, activeStep - 1));
  const dCurr = depthOf(activeStep);
  const dInterp = activeStep === 0 ? dCurr : dPrev + (dCurr - dPrev) * glide;

  const logZ =
    activeStep === 0
      ? Math.log(zoomFor(0))
      : Math.log(zoomFor(activeStep - 1)) + (Math.log(zoomFor(activeStep)) - Math.log(zoomFor(activeStep - 1))) * glide;
  const zoom = Math.exp(logZ);

  // Every rung is a square concentric on the stage centre — a continuous zoom
  // through nested scale, not a camera flying past receding walls. This is the
  // same visual language Powers-of-Ten style zooms use, and it has no perspective
  // or camera-aim math left to desync from the 2D labels drawn on top of it.
  // Clipped to the stage rect: an outer rung's square is routinely many times
  // larger than the frame, and an unclipped fill/stroke reaches past safeBottom.
  ctx.save();
  ctx.beginPath();
  ctx.rect(contentX, stageY, contentW, stageH);
  ctx.clip();
  scene.rungs.forEach((rung, step) => {
    const d = depthOf(step);
    const half = zoom * S * Math.pow(FACTOR, d);
    const apparent = 2 * half;
    if (apparent < unit * 0.3) return;
    const wall = clamp01(1 - (d - dInterp - 0.3) / 0.5);
    if (wall <= 0) return;
    const isActive = step === activeStep;
    ctx.save();
    ctx.globalAlpha = wall * leave * (isActive ? 1 : 0.5);
    roundRect(ctx, stageCx - half, stageCy - half, half * 2, half * 2, Math.min(half * 0.08, unit * 0.4));
    ctx.fillStyle = shade(THEME.panel, FACE_LIFT);
    ctx.fill();
    ctx.strokeStyle = isActive ? accent : THEME.textDim;
    ctx.lineWidth = Math.max(1, unit * (isActive ? STROKE.base : STROKE.hair));
    if (isActive) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.3;
    }
    ctx.stroke();
    ctx.restore();
  });
  ctx.restore();

  // 2D chrome: icons, scale chips, breadcrumb and caption.
  scene.rungs.forEach((rung, step) => {
    const d = depthOf(step);
    // Only draw chrome for rungs close to the current zoom level.
    if (Math.abs(d - dInterp) > 2) return;

    const half = zoom * S * Math.pow(FACTOR, d);
    const apparent = 2 * half;

    if (apparent < unit * 0.5) return;
    const lowRamp = clamp01((apparent - unit * 0.5) / (unit * 0.6));
    const highRamp = clamp01(1 - (apparent - stageMin * 3) / (stageMin * 2));
    const win = lowRamp * highRamp;
    if (win <= 0) return;

    const isActive = step === activeStep;
    const stateAlpha = isActive ? 1 : step < activeStep ? 0.55 : 0.4;

    ctx.save();
    ctx.globalAlpha = win * stateAlpha * leave;

    ctx.textAlign = "center";
    // The icon is a glyph, so its ink box is ~1 em square. Capped against the
    // stage and its centre clamped so the box cannot leave the stage even
    // though the rung is mid-zoom.
    // The zoom glide finishes at 62% of the beat and the last rung has nowhere
    // further to travel, so the tail of the scene held four identical frames.
    // A slow push across the WHOLE beat keeps something resolving.
    const push = isActive ? 0.97 + 0.06 * easeInOutCubic(clamp01(tA)) : 1;
    const iconPx = Math.min(half * 0.9, Math.min(contentW, stageH) * 0.52) * push;
    let iconCx = stageCx;
    let iconBaseline = stageCy + iconPx * 0.3;
    if (iconPx > unit * 0.4) {
      iconCx = clampRange(iconCx, contentX + iconPx * 0.5, contentX + contentW - iconPx * 0.5);
      iconBaseline = clampRange(iconBaseline, stageY + iconPx * 0.8, stageY + stageH - iconPx * 0.1);
      ctx.font = `${iconPx}px ${FONT_SANS}`;
      ctx.fillText(rung.icon ?? rung.label.slice(0, 1).toUpperCase(), iconCx, iconBaseline);
    }
    // The floating per-rung label is gone. Rungs nest by design, so a label under
    // one glyph necessarily lands on its neighbour's. `drawCaption` below already
    // prints the active rung's scale AND label at a fixed readable position, and
    // the breadcrumb prints the trail, so the floating copy was duplicated
    // information whose only contribution was the collision.

    // Scale chip — active rung only, for the same reason.
    if (half > unit * 1.4 && isActive) {
      const chipPx = Math.min(Math.max(half * 0.12, unit * 0.32), unit * 0.7);
      ctx.font = `600 ${chipPx}px ${FONT_MONO}`;
      const tw = ctx.measureText(rung.scale).width;
      const chipW = tw + chipPx * 1.2;
      const chipHh = chipPx * 1.7;
      const topLeftX = stageCx - half;
      const topLeftY = stageCy - half;
      const chipX = clampRange(topLeftX, contentX, contentX + contentW - chipW);
      const chipY = clampRange(topLeftY, stageY, stageY + stageH - chipHh);
      roundRect(ctx, chipX, chipY, chipW, chipHh, chipPx * 0.5);
      ctx.fillStyle = THEME.bgBottom;
      ctx.fill();
      ctx.strokeStyle = rgba(accent, 0.4);
      ctx.lineWidth = Math.max(1, chipPx * 0.06);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillText(rung.scale, chipX + chipW / 2, chipY + chipHh * 0.68);
    }
    ctx.textAlign = "start";
    ctx.restore();
  });

  // Breadcrumb trail of visited scales across the top of the stage.
  ctx.save();
  ctx.font = `600 ${unit * 0.55}px ${FONT_MONO}`;
  let bx = contentX;
  const by = stageY + unit * 0.35;
  for (let step = 0; step <= activeStep && active >= offset; step++) {
    const tS = beatT(env.beats, offset + step, totalBeats, env.p);
    const popIn = easeOutBack(clamp01(tS / 0.12));
    const tw = ctx.measureText(scene.rungs[step].scale).width;
    const cw = tw + unit * 0.6;
    const ch = unit * 0.95;
    if (bx + cw > contentX + contentW) break;
    ctx.save();
    ctx.globalAlpha = clamp01(tS * 6) * leave;
    ctx.translate(bx + cw / 2, by + ch / 2);
    ctx.scale(Math.max(0.01, popIn), Math.max(0.01, popIn));
    ctx.translate(-(bx + cw / 2), -(by + ch / 2));
    roundRect(ctx, bx, by, cw, ch, unit * 0.28);
    ctx.fillStyle = step === activeStep ? rgba(accent, 0.16) : THEME.bgBottom;
    ctx.fill();
    ctx.strokeStyle = step === activeStep ? rgba(accent, 0.7) : THEME.panelBorder;
    ctx.lineWidth = Math.max(1, unit * STROKE.hair);
    ctx.stroke();
    ctx.fillStyle = step === activeStep ? accent : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(scene.rungs[step].scale, bx + cw / 2, by + ch * 0.7);
    ctx.textAlign = "start";
    ctx.restore();
    bx += cw + unit * 0.15;
    if (step < activeStep) {
      ctx.fillStyle = THEME.textFaint;
      ctx.fillText("›", bx, by + ch * 0.7);
      bx += ctx.measureText("›").width + unit * 0.15;
    }
  }
  ctx.restore();

  // Fixed-size caption panel: the active rung is always readable regardless
  // of where the zoom is, crossfading between beats.
  const drawCaption = (step: number, alpha: number) => {
    if (alpha <= 0 || step < 0) return;
    const rung = scene.rungs[step];
    ctx.save();
    ctx.globalAlpha = alpha * leave;
    const capX = contentX + unit * 0.2;
    // stageH is now safeBottom-bounded, so the two-line panel below capY clears
    // the caption band instead of being drawn under it.
    const capY = stageY + stageH - unit * 2.4;
    const pop = step === activeStep ? easeOutBack(clamp01(tA / 0.2)) : 1;
    ctx.font = `800 ${unit * 1.3 * (0.85 + 0.15 * pop)}px ${FONT_MONO}`;
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.4;
    ctx.fillText(rung.scale, capX, capY + unit * 1.2);
    ctx.shadowBlur = 0;
    ctx.font = `600 ${unit * 0.72}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(rung.label, capX, capY + unit * 2.2);
    ctx.restore();
  };
  if (active >= offset) {
    const fade = easeOutCubic(clamp01(tA / 0.15));
    drawCaption(activeStep - 1, 1 - fade);
    drawCaption(activeStep, fade);
  }
  ctx.textAlign = "start";
}

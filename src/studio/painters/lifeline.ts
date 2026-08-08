import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  sub,
  enterT,
  clamp01,
  roundRect,
  drawArrowhead,
  drawSceneTitle,
  strokePolylineProgress,
  fitFontSize,
  beatWindow,
  beatT,
  activeBeatIndex,
  lerpColor,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type LifelineScene = Extract<Scene, { kind: "lifeline" }>;

const PAST_ALPHA = 0.55;
const MIN_SLOTS = 4;
const CROSS = 0.45;
const HOT_TINT = 0.2;

export function paintLifeline(ctx: CanvasRenderingContext2D, scene: LifelineScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, vertical } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.messages.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const introIn = easeOutCubic(enterT(env, 380));

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;

  const n = scene.actors.length;
  const colW = contentW / n;
  const actorX = (i: number) => contentX + (i + 0.5) * colW;
  const xById = new Map(scene.actors.map((a, i) => [a.id, actorX(i)]));
  const chipH = unit * 1.5;
  const chipW = Math.min(colW - unit * 0.5, unit * 7);
  const chipY = contentY + titleBand + unit * 1.0; // shifted down slightly for 3D room
  const lifelinesTop = chipY + chipH + unit * 0.35;
  // `h * 0.86` ran the lifelines and their last message under the caption band.
  const lifelinesBottom = layout.safeBottom;
  const lifelinesH = lifelinesBottom - lifelinesTop;
  const slotY = (k: number) => lifelinesTop + (k + 0.5) * (lifelinesH / Math.max(scene.messages.length, MIN_SLOTS));

  const activeStep = Math.min(active - offset, scene.messages.length - 1);
  const hot = activeStep >= 0 ? scene.messages[activeStep] : null;
  const hotT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  /**
   * No 3D layer. The server racks and database stacks behind this diagram were placed
   * by mapping pixel coordinates into world space and viewing them through a camera at
   * (0, 15, 12), so they could not line up with a pixel-true lifeline: they sat between
   * the lanes, overlapped the message rows, and one of them projected a bar off the
   * left edge of the frame. They carried nothing the actor chips do not already say —
   * each chip has the actor's icon — so a sequence diagram is clearer without them.
   */

  /**
   * The 2D layer is pixel-true. Round-tripping every point through the tilted camera
   * made the lifelines splay outward as they descended, so each one drifted away from
   * the chip that names it and the message arrows landed short of their own lifeline.
   * The 3D racks behind stay as ambient scenery; they carry no information the 2D
   * layer does not.
   */
  const getProjPos = (px: number, py: number) => ({ x: px, y: py });

  for (let i = 0; i < n; i++) {
    const actor = scene.actors[i];
    const x = actorX(i);
    const isHot = !!hot && (hot.from === actor.id || hot.to === actor.id);
    const topProj = getProjPos(x, lifelinesTop);
    const botProj = getProjPos(x, lifelinesBottom);

    ctx.save();
    ctx.globalAlpha = introIn * (isHot ? 0.9 : 0.55);
    ctx.strokeStyle = THEME.textFaint;
    ctx.lineWidth = unit * 0.06;
    ctx.setLineDash([unit * 0.3, unit * 0.3]);
    if (isHot) ctx.lineDashOffset = -env.elapsedMs / 40;
    ctx.beginPath();
    ctx.moveTo(topProj.x, topProj.y);
    ctx.lineTo(botProj.x, botProj.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (hot) {
    const barIn = clamp01(hotT * 4);
    for (const actorId of new Set([hot.from, hot.to])) {
      let firstIdx = activeStep;
      for (let i = 0; i <= activeStep; i++) {
        const m = scene.messages[i];
        if (m.from === actorId || m.to === actorId) {
          firstIdx = i;
          break;
        }
      }
      const x = xById.get(actorId);
      if (x === undefined) continue;
      
      // A plain vertical bar on the lane. It used to be drawn by rotating to
      // atan2(dy, dx): when an actor's first message came AFTER the current step dy went
      // negative, the bar rotated to -90 degrees and was drawn horizontally off the left
      // edge of the frame.
      const y0 = Math.min(slotY(firstIdx), slotY(activeStep)) - unit * 0.5;
      const y1 = Math.max(slotY(firstIdx), slotY(activeStep)) + unit * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.25 * barIn;
      ctx.fillStyle = accent;
      roundRect(ctx, x - unit * 0.13, y0, unit * 0.26, y1 - y0, unit * 0.13);
      ctx.fill();
      ctx.restore();
    }
  }

  scene.messages.forEach((msg, k) => {
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0) return;
    const fromX = xById.get(msg.from) ?? contentX;
    const toX = xById.get(msg.to) ?? contentX + contentW;
    const y = slotY(k);
    
    const fromProj = getProjPos(fromX, y);
    const toProj = getProjPos(toX, y);
    
    const isCurrent = activeStep === k;
    const prog = easeInOutCubic(clamp01(t / CROSS));
    const color = msg.style === "call" ? accent : secondary;
    const glow = msg.style === "call" ? accentGlow : secondaryGlow;

    ctx.save();
    ctx.globalAlpha = isCurrent ? 1 : PAST_ALPHA;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = unit * 0.12;
    ctx.lineCap = "round";
    if (msg.style === "return") ctx.setLineDash([unit * 0.45, unit * 0.32]);
    if (isCurrent) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = unit * 0.35;
    }
    const tip = strokePolylineProgress(ctx, [fromProj, toProj], prog);
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    if (prog > 0.15) drawArrowhead(ctx, tip.x, tip.y, tip.angle, unit * 0.5);

    if (prog < 1) {
      const trailX = fromProj.x + (toProj.x - fromProj.x) * Math.max(prog - 0.07, 0);
      const trailY = fromProj.y + (toProj.y - fromProj.y) * Math.max(prog - 0.07, 0);
      
      ctx.globalAlpha = (isCurrent ? 1 : PAST_ALPHA) * 0.35;
      ctx.fillStyle = THEME.text;
      ctx.beginPath();
      ctx.arc(trailX, trailY, unit * 0.12, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = isCurrent ? 1 : PAST_ALPHA;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9;
      if (msg.style === "return") {
        ctx.strokeStyle = THEME.text;
        ctx.lineWidth = unit * 0.08;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, unit * 0.2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = THEME.text;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, unit * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    const ringT = sub(t, CROSS, 0.25);
    if (ringT > 0 && ringT < 1) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rgba(color, 0.7 * (1 - ringT));
      ctx.lineWidth = unit * 0.07;
      ctx.beginPath();
      // project an ellipse or just draw a circle in projected space
      ctx.arc(toProj.x, toProj.y, unit * (0.25 + 1.05 * easeOutCubic(ringT)), 0, Math.PI * 2);
      ctx.stroke();
    }

    const flowing =
      prog >= 1 &&
      ((msg.style === "data" && isCurrent && !inTail) || (inTail && k === scene.messages.length - 1));
    if (flowing) {
      const dir = Math.sign(toX - fromX) || 1;
      for (let j = 0; j < 2; j++) {
        const f = (env.elapsedMs / 1400 + j * 0.5) % 1;
        const dx = fromProj.x + (toProj.x - fromProj.x) * f;
        const dy = fromProj.y + (toProj.y - fromProj.y) * f;
        ctx.globalAlpha = 0.85 * Math.sin(Math.PI * f);
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.7;
        ctx.fillStyle = THEME.text;
        ctx.beginPath();
        ctx.arc(dx - dir * unit * 0.1, dy, unit * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  });

  scene.actors.forEach((actor, i) => {
    const cx = actorX(i);
    const chipIn = easeOutCubic(enterT(env, 320, 40 + i * 70));
    if (chipIn <= 0) return;
    const isHot = !!hot && (hot.from === actor.id || hot.to === actor.id);
    const pop = easeOutBack(chipIn) * (isHot ? 1 + 0.012 * Math.sin(env.elapsedMs / 220) : 1);
    
    // The chip sits where its LIFELINE is, in pixels. Anchoring it to the projected
    // front-top of the 3D prop pulled the three chips toward the vanishing point until
    // they overlapped each other ("Auth server" was covered by "API"), and detached
    // every chip from the dashed lifeline that belongs to it.
    const chipX = cx;
    const cyMid = chipY + chipH / 2;

    ctx.save();
    ctx.globalAlpha = chipIn;
    ctx.translate(chipX, cyMid);
    ctx.scale(pop, pop);
    ctx.translate(-chipX, -cyMid);
    
    if (isHot) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9;
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = unit * 0.4;
      ctx.shadowOffsetY = 3;
    }
    roundRect(ctx, chipX - chipW / 2, cyMid - chipH / 2, chipW, chipH, chipH / 2);
    ctx.fillStyle = isHot ? lerpColor(THEME.panel, accent, HOT_TINT) : THEME.panel;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    roundRect(ctx, chipX - chipW / 2, cyMid - chipH / 2, chipW, chipH, chipH / 2);
    ctx.strokeStyle = isHot ? accent : rgba(THEME.textDim, 0.55);
    ctx.lineWidth = isHot ? unit * 0.1 : unit * 0.06;
    ctx.stroke();

    const labelPx = fitFontSize(ctx, actor.label, {
      maxW: chipW - unit * (actor.icon ? 2.2 : 1.0),
      startPx: unit * 0.72,
      minPx: unit * 0.4,
      weight: 700,
    });
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    const lw = ctx.measureText(actor.label).width;
    ctx.fillStyle = isHot ? THEME.text : THEME.textDim;
    if (actor.icon) {
      const iconPx = unit * 0.85;
      const total = iconPx + unit * 0.25 + lw;
      const start = chipX - total / 2;
      ctx.font = `${iconPx}px ${FONT_SANS}`;
      ctx.fillText(actor.icon, start, cyMid + iconPx * 0.35);
      ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
      ctx.fillText(actor.label, start + iconPx + unit * 0.25, cyMid + labelPx * 0.35);
    } else {
      ctx.fillText(actor.label, chipX - lw / 2, cyMid + labelPx * 0.35);
    }
    ctx.restore();
  });

  scene.messages.forEach((msg, k) => {
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    const labelIn = easeOutCubic(sub(t, 0.6, 0.3));
    if (labelIn <= 0) return;
    const fromX = xById.get(msg.from) ?? contentX;
    const toX = xById.get(msg.to) ?? contentX + contentW;
    const midX = (fromX + toX) / 2;
    const y = slotY(k) - unit * 0.8 + (1 - labelIn) * unit * 0.25;
    
    const projMid = getProjPos(midX, y);
    
    const isCurrent = activeStep === k;

    ctx.save();
    ctx.globalAlpha = labelIn * (isCurrent ? 1 : PAST_ALPHA);
    ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
    const tw = ctx.measureText(msg.label).width;
    roundRect(ctx, projMid.x - tw / 2 - unit * 0.4, projMid.y - unit * 0.55, tw + unit * 0.8, unit * 1.1, unit * 0.3);
    ctx.fillStyle = THEME.bgBottom;
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(msg.label, projMid.x, projMid.y + unit * 0.22);
    ctx.restore();
  });
  ctx.textAlign = "start";
}

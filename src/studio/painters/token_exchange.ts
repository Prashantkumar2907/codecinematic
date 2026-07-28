import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  clamp01,
  sub,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  strokePolylineProgress,
  fitFontSize,
  beatT,
  activeBeatIndex,
  glowRing,
  rgba,
  shade,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type TokenExchangeScene = Extract<Scene, { kind: "token_exchange" }>;
type Actor = TokenExchangeScene["actors"][number];
type Step = TokenExchangeScene["steps"][number];

const PAST_ALPHA = 0.5;
/** Sparse scenes still spread step slots as if there were this many (see lifeline.ts). */
const MIN_SLOTS = 4;
/** Fraction of a step's beat spent snapping header+payload+signature into one card (issue only). */
const ASSEMBLE_FRAC = 0.32;
/** Fraction of a step's beat spent in flight before the landing effect (verify badge / expiry stamp) plays. */
const TRAVEL_END = 0.7;
/** THEME has no error color (only `good`/`warn`) — scoped here for invalid/expired tokens. */
const DENY = "#f87171";

const ROLE_ICON: Record<Actor["role"], string> = {
  client: "client",
  gateway: "api",
  auth: "shield",
  resource: "server",
};

const ACTION_LABEL: Record<Step["action"], string> = {
  issue: "Issued & signed",
  present: "Presented",
  verify: "Verifying signature",
  expire: "Expired",
};

/**
 * The token itself as a first-class visual: a card split into three colored
 * segments (header, payload, signature — the JWT dot-separated blobs). On
 * "issue" the segments snap together from scratch; "present" carries the
 * assembled card between actor columns; "verify" (from === to) checks it in
 * place with a check/X badge; "expire" desaturates it and stamps EXPIRED.
 * Modeled on lifeline.ts's actor-column + per-beat-slot structure.
 */
export function paintTokenExchange(ctx: CanvasRenderingContext2D, scene: TokenExchangeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const sigColor = shade(accent, -0.5);
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = Math.min(active - offset, scene.steps.length - 1);
  const introIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.3;

  const n = scene.actors.length;
  const colW = contentW / n;
  const actorX = (i: number) => contentX + (i + 0.5) * colW;
  const xById = new Map(scene.actors.map((a, i) => [a.id, actorX(i)] as const));
  const chipH = unit * 1.5;
  const chipW = Math.min(colW - unit * 0.5, unit * 6.5);
  const chipY = contentY + band;
  const lifelinesTop = chipY + chipH + unit * 0.7;
  const lifelinesBottom = vertical ? Math.min(contentY + contentH, layout.h * 0.86) : contentY + contentH;
  const lifelinesH = lifelinesBottom - lifelinesTop;
  const slotY = (k: number) => lifelinesTop + (k + 0.5) * (lifelinesH / Math.max(scene.steps.length, MIN_SLOTS));

  const hot = activeStep >= 0 ? scene.steps[activeStep] : null;

  // Dashed lifelines per actor column — the standing "session" each token moves along.
  for (let i = 0; i < n; i++) {
    const actor = scene.actors[i];
    const x = actorX(i);
    const isHot = !!hot && (hot.from === actor.id || hot.to === actor.id);
    ctx.save();
    ctx.globalAlpha = introIn * (isHot ? 0.85 : 0.5);
    ctx.strokeStyle = THEME.textFaint;
    ctx.lineWidth = unit * 0.06;
    ctx.setLineDash([unit * 0.3, unit * 0.3]);
    if (isHot) ctx.lineDashOffset = -env.elapsedMs / 40;
    ctx.beginPath();
    ctx.moveTo(x, lifelinesTop);
    ctx.lineTo(x, lifelinesBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const cardW = Math.min(colW * 0.56, unit * 3.3);
  const cardH = unit * 1.0;

  scene.steps.forEach((step, k) => {
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0) return;
    const isCurrent = activeStep === k;
    const rowAlpha = introIn * (isCurrent ? 1 : PAST_ALPHA);
    const selfLoop = step.from === step.to;
    const fromX = xById.get(step.from) ?? contentX;
    const toX = xById.get(step.to) ?? contentX + contentW;
    const y = slotY(k);
    const hasAssemble = step.action === "issue" && !selfLoop;
    const assembleEnd = hasAssemble ? ASSEMBLE_FRAC : 0;
    const travelEnd = selfLoop ? Math.max(assembleEnd, 0.001) : TRAVEL_END;
    const travelP = clamp01((t - assembleEnd) / Math.max(travelEnd - assembleEnd, 0.001));
    const landingP = clamp01((t - travelEnd) / Math.max(1 - travelEnd, 0.001));
    const assembleP = hasAssemble ? clamp01(t / assembleEnd) : 1;

    // Path the card travels: a straight hop between columns, or a small arc
    // above the actor when the check happens locally (from === to, e.g. a
    // gateway verifying a JWT's signature without calling the auth server).
    const path = selfLoop
      ? [
          { x: fromX - cardW * 0.7, y: y + unit * 0.35 },
          { x: fromX, y: y - unit * 0.6 },
          { x: fromX + cardW * 0.7, y: y + unit * 0.35 },
        ]
      : [
          { x: fromX, y },
          { x: toX, y },
        ];
    const lineColor = step.action === "expire" ? DENY : step.action === "issue" ? secondary : accent;

    ctx.save();
    ctx.globalAlpha = rowAlpha;
    ctx.strokeStyle = rgba(lineColor, isCurrent ? 0.65 : 0.3);
    ctx.lineWidth = unit * 0.06;
    ctx.lineCap = "round";
    if (isCurrent) {
      ctx.shadowColor = rgba(lineColor, 0.6);
      ctx.shadowBlur = unit * 0.3;
    }
    const tip = strokePolylineProgress(ctx, path, Math.max(travelP, 0.001));
    ctx.shadowBlur = 0;
    ctx.restore();

    const bob = isCurrent ? (idle(env, 900) - 0.5) * unit * 0.08 : 0;
    const cardX = travelP > 0 ? tip.x : path[0].x;
    const cardY = (travelP > 0 ? tip.y : path[0].y) + bob;

    // Assembling mini-segments (issue only) crossfade into the unified card.
    const cardAlpha = hasAssemble ? easeOutCubic(clamp01((assembleP - 0.7) / 0.3)) : 1;
    if (hasAssemble && assembleP < 1) {
      const conv = easeOutCubic(assembleP);
      const chipsAlpha = 1 - cardAlpha;
      const segColors = [accent, secondary, sigColor];
      for (let i = 0; i < 3; i++) {
        const spread = (i - 1) * unit * 1.5 * (1 - conv);
        const chipBob = (i % 2 === 0 ? -1 : 1) * unit * 0.3 * (1 - conv);
        ctx.save();
        ctx.globalAlpha = rowAlpha * chipsAlpha;
        roundRect(ctx, cardX + spread - unit * 0.32, cardY + chipBob - unit * 0.32, unit * 0.64, unit * 0.64, unit * 0.14);
        ctx.fillStyle = segColors[i];
        ctx.fill();
        ctx.restore();
      }
    }

    // The unified token card: header | payload | signature segments, dot separators, sealed with a shield glyph.
    if (cardAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = rowAlpha * cardAlpha;
      const x0 = cardX - cardW / 2;
      const segW = cardW / 3;
      const r = cardH * 0.28;
      roundRect(ctx, x0, cardY - cardH / 2, cardW, cardH, r);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.save();
      roundRect(ctx, x0, cardY - cardH / 2, cardW, cardH, r);
      ctx.clip();
      [accent, secondary, sigColor].forEach((c, i) => {
        ctx.fillStyle = rgba(c, 0.85);
        ctx.fillRect(x0 + i * segW, cardY - cardH / 2, segW, cardH);
      });
      ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (const i of [1, 2]) {
        ctx.beginPath();
        ctx.arc(x0 + i * segW, cardY, unit * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      drawIcon(ctx, "shield", x0 + 2 * segW + segW / 2, cardY, cardH * 0.6, env, "#eaf3ff");
      roundRect(ctx, x0, cardY - cardH / 2, cardW, cardH, r);
      ctx.strokeStyle = isCurrent ? accent : "rgba(148,163,184,0.5)";
      ctx.lineWidth = isCurrent ? unit * 0.07 : unit * 0.045;
      if (isCurrent) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.35;
      }
      ctx.stroke();
      ctx.restore();
    }

    // Landing effects, keyed off the step's action.
    if (step.action === "issue" && landingP > 0) {
      if (isCurrent) glowRing(ctx, cardX, cardY, cardW * 0.6, secondary, env, 1400);
    } else if (step.action === "verify") {
      if (landingP > 0 && landingP < 0.55) {
        const sweepX = cardX + (landingP / 0.55 - 0.5) * cardW * 0.7;
        const glassY = cardY - cardH * 1.1;
        ctx.save();
        ctx.globalAlpha = rowAlpha;
        ctx.strokeStyle = THEME.text;
        ctx.lineWidth = unit * 0.06;
        ctx.beginPath();
        ctx.arc(sweepX, glassY, unit * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sweepX + unit * 0.2, glassY + unit * 0.2);
        ctx.lineTo(sweepX + unit * 0.42, glassY + unit * 0.42);
        ctx.stroke();
        ctx.restore();
      }
      const badgeP = clamp01((landingP - 0.5) / 0.5);
      if (badgeP > 0) {
        const pop = easeOutBack(badgeP);
        const color = step.valid ? THEME.good : DENY;
        ctx.save();
        ctx.globalAlpha = rowAlpha;
        ctx.translate(cardX, cardY - cardH * 1.1);
        ctx.scale(pop, pop);
        ctx.beginPath();
        ctx.arc(0, 0, unit * 0.36, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#08131f";
        ctx.lineWidth = unit * 0.09;
        ctx.lineCap = "round";
        ctx.beginPath();
        if (step.valid) {
          ctx.moveTo(-unit * 0.15, 0);
          ctx.lineTo(-unit * 0.03, unit * 0.14);
          ctx.lineTo(unit * 0.18, -unit * 0.15);
        } else {
          ctx.moveTo(-unit * 0.14, -unit * 0.14);
          ctx.lineTo(unit * 0.14, unit * 0.14);
          ctx.moveTo(unit * 0.14, -unit * 0.14);
          ctx.lineTo(-unit * 0.14, unit * 0.14);
        }
        ctx.stroke();
        ctx.restore();
        if (isCurrent && step.valid) glowRing(ctx, cardX, cardY, cardW * 0.6, THEME.good, env, 1600);
      }
    } else if (step.action === "expire") {
      const fade = easeOutCubic(landingP);
      if (fade > 0) {
        ctx.save();
        ctx.globalAlpha = rowAlpha * fade * 0.55;
        roundRect(ctx, cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, cardH * 0.28);
        ctx.fillStyle = "#000000";
        ctx.fill();
        ctx.restore();
      }
      if (!step.valid && landingP > 0.5) {
        const pop = easeOutBack(clamp01((landingP - 0.5) / 0.5));
        ctx.save();
        ctx.globalAlpha = rowAlpha * pop;
        ctx.translate(cardX, cardY);
        ctx.rotate(-0.2);
        const stampW = cardW * 0.94;
        roundRect(ctx, -stampW / 2, -unit * 0.32, stampW, unit * 0.64, unit * 0.12);
        ctx.strokeStyle = DENY;
        ctx.lineWidth = unit * 0.06;
        ctx.stroke();
        const px = fitFontSize(ctx, "EXPIRED", { maxW: stampW * 0.9, startPx: unit * 0.55, minPx: unit * 0.32, weight: 800 });
        ctx.font = `800 ${px}px ${FONT_SANS}`;
        ctx.fillStyle = DENY;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("EXPIRED", 0, unit * 0.03);
        ctx.restore();
      }
    }

    // Caption: the author's note (exp time, mismatch reason, header field…) or a default action label.
    const labelIn = easeOutCubic(sub(t, 0.45, 0.3));
    if (labelIn > 0) {
      const text = step.note ?? ACTION_LABEL[step.action];
      ctx.save();
      ctx.globalAlpha = rowAlpha * labelIn;
      ctx.font = `600 ${unit * 0.55}px ${FONT_SANS}`;
      const tw = ctx.measureText(text).width;
      const ly = cardY - cardH * 1.9;
      ctx.textAlign = "center";
      roundRect(ctx, cardX - tw / 2 - unit * 0.35, ly - unit * 0.5, tw + unit * 0.7, unit * 0.95, unit * 0.28);
      ctx.fillStyle = "rgba(10,14,19,0.85)";
      ctx.fill();
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
      ctx.fillText(text, cardX, ly + unit * 0.2);
      ctx.restore();
    }
  });

  // Actor chips (client / gateway / auth / resource) with vector role glyphs.
  scene.actors.forEach((actor, i) => {
    const cx = actorX(i);
    const chipIn = easeOutCubic(enterT(env, 320, 40 + i * 70));
    if (chipIn <= 0) return;
    const isHot = !!hot && (hot.from === actor.id || hot.to === actor.id);
    const pop = easeOutBack(chipIn) * (isHot ? 1 + 0.012 * Math.sin(env.elapsedMs / 220) : 1);
    const cyMid = chipY + chipH / 2;

    ctx.save();
    ctx.globalAlpha = chipIn;
    ctx.translate(cx, cyMid);
    ctx.scale(pop, pop);
    ctx.translate(-cx, -cyMid);
    if (isHot) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9;
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = unit * 0.4;
      ctx.shadowOffsetY = 3;
    }
    roundRect(ctx, cx - chipW / 2, chipY, chipW, chipH, chipH / 2);
    ctx.fillStyle = isHot ? "#0e2433" : THEME.panel;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    roundRect(ctx, cx - chipW / 2, chipY, chipW, chipH, chipH / 2);
    ctx.strokeStyle = isHot ? accent : "rgba(148,163,184,0.55)";
    ctx.lineWidth = isHot ? unit * 0.1 : unit * 0.06;
    ctx.stroke();

    const iconSize = unit * 0.9;
    const labelPx = fitFontSize(ctx, actor.label, {
      maxW: chipW - iconSize - unit * 0.6,
      startPx: unit * 0.68,
      minPx: unit * 0.4,
      weight: 700,
    });
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    const lw = ctx.measureText(actor.label).width;
    const total = iconSize + unit * 0.3 + lw;
    const start = cx - total / 2;
    drawIcon(ctx, ROLE_ICON[actor.role], start + iconSize / 2, cyMid, iconSize, env, isHot ? accent : "#c8d3e0");
    ctx.fillStyle = isHot ? THEME.text : THEME.textDim;
    ctx.fillText(actor.label, start + iconSize + unit * 0.3, cyMid + labelPx * 0.35);
    ctx.restore();
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

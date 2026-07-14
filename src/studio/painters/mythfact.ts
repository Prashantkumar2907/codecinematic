import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, sub, clamp01, wrapText, roundRect, beatT, rgba } from "./common";
import type { PaintEnv } from "./index";

type MythfactScene = Extract<Scene, { kind: "mythfact" }>;

const DANGER = "#f87171";

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string, unit: number) {
  ctx.font = `800 ${unit * 0.68}px ${FONT_SANS}`;
  const tw = ctx.measureText(label).width;
  roundRect(ctx, x, y - unit * 0.78, tw + unit * 1.1, unit * 1.15, unit * 0.35);
  ctx.fillStyle = rgba(color, 0.16);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(label, x + unit * 0.55, y);
}

/** Beat 0: the myth card appears. Beat 1: a ❌ stamps it and the fact card slides up. */
export function paintMythfact(ctx: CanvasRenderingContext2D, scene: MythfactScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const t0 = beatT(env.beats, 0, 2, env.p);
  const t1 = beatT(env.beats, 1, 2, env.p);

  const gap = unit * (vertical ? 1.1 : 1.0);

  // Cards hug their text and the pair centers vertically — fixed half-height
  // cards left a 9:16 frame mostly empty panel.
  const textW = contentW - unit * 2;
  let fontPx = unit * 1.05;
  ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
  let mLines = wrapText(ctx, scene.myth, textW);
  let fLines = wrapText(ctx, scene.fact, textW);
  if (Math.max(mLines.length, fLines.length) > 3) {
    fontPx = unit * 0.9;
    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    mLines = wrapText(ctx, scene.myth, textW);
    fLines = wrapText(ctx, scene.fact, textW);
  }
  mLines = mLines.slice(0, 5);
  fLines = fLines.slice(0, 5);
  const lineStep = fontPx * 1.4;
  const textTop = unit * 3.0;
  const neededH = (lines: number) => textTop + (lines - 1) * lineStep + fontPx + unit * 0.9;
  const cardH = Math.min((contentH - gap) / 2, Math.max(neededH(mLines.length), neededH(fLines.length), unit * 5.4));
  const mythY = contentY + (contentH - (cardH * 2 + gap)) / 2;
  const factY = mythY + cardH + gap;

  // ── Myth card ──────────────────────────────────────────────────────────────
  const mythIn = easeOutCubic(clamp01(t0 * 2.2));
  if (mythIn > 0) {
    const busted = t1 > 0;
    // Impact shake for ~0.35s as the bust lands.
    const shakeT = clamp01(t1 * 3);
    const shake = busted && shakeT < 1 ? Math.sin(shakeT * 28) * unit * 0.14 * (1 - shakeT) : 0;
    ctx.save();
    ctx.globalAlpha = mythIn * (busted ? 0.72 : 1);
    ctx.translate(shake, (1 - mythIn) * unit * 1.2);

    roundRect(ctx, contentX, mythY, contentW, cardH, unit * 0.6);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    roundRect(ctx, contentX, mythY, contentW, cardH, unit * 0.6);
    ctx.strokeStyle = busted ? rgba(DANGER, 0.75) : "rgba(148,163,184,0.45)";
    ctx.lineWidth = busted ? unit * 0.09 : unit * 0.05;
    ctx.stroke();

    chip(ctx, contentX + unit * 0.9, mythY + unit * 1.45, "MYTH", DANGER, unit);

    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    mLines.forEach((line, i) => ctx.fillText(line, contentX + unit, mythY + textTop + i * lineStep));

    // strike-through on bust
    if (busted) {
      const strike = easeOutCubic(clamp01(t1 * 2.5));
      ctx.strokeStyle = rgba(DANGER, 0.8);
      ctx.lineWidth = unit * 0.12;
      const sy = mythY + textTop + ((mLines.length - 1) * lineStep) / 2 - fontPx * 0.33;
      ctx.beginPath();
      ctx.moveTo(contentX + unit, sy);
      ctx.lineTo(contentX + unit + (contentW - unit * 2) * strike, sy);
      ctx.stroke();
    }
    ctx.restore();

    // ❌ badge: red ring seals in, then the cross strokes draw on.
    if (busted) {
      const stampIn = easeOutBack(clamp01(t1 * 2.2));
      const r = unit * 0.85;
      ctx.save();
      ctx.translate(contentX + contentW - unit * 1.9, mythY + unit * 1.35);
      ctx.rotate(-0.12 * (1 - clamp01(t1 * 2.5)));
      ctx.scale(Math.max(0.01, stampIn), Math.max(0.01, stampIn));
      ctx.shadowColor = rgba(DANGER, 0.55);
      ctx.shadowBlur = unit * 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(DANGER, 0.16);
      ctx.fill();
      ctx.strokeStyle = DANGER;
      ctx.lineWidth = unit * 0.14;
      ctx.stroke();
      ctx.shadowBlur = 0;
      const draw = clamp01(t1 * 3 - 0.4);
      const a = r * 0.48;
      ctx.lineWidth = unit * 0.22;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-a, -a);
      ctx.lineTo(-a + 2 * a * Math.min(1, draw * 2), -a + 2 * a * Math.min(1, draw * 2));
      ctx.stroke();
      if (draw > 0.5) {
        const d2 = (draw - 0.5) * 2;
        ctx.beginPath();
        ctx.moveTo(a, -a);
        ctx.lineTo(a - 2 * a * d2, -a + 2 * a * d2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Fact card ──────────────────────────────────────────────────────────────
  const factIn = easeOutCubic(clamp01(t1 * 1.8 - 0.15));
  if (factIn > 0) {
    ctx.save();
    ctx.globalAlpha = factIn;
    ctx.translate(0, (1 - factIn) * unit * 2.2);

    ctx.shadowColor = rgba(THEME.good, 0.35);
    ctx.shadowBlur = unit * 0.9;
    roundRect(ctx, contentX, factY, contentW, cardH, unit * 0.6);
    ctx.fillStyle = rgba(THEME.good, 0.08);
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, contentX, factY, contentW, cardH, unit * 0.6);
    ctx.strokeStyle = THEME.good;
    ctx.lineWidth = unit * 0.09;
    ctx.stroke();

    chip(ctx, contentX + unit * 0.9, factY + unit * 1.45, "FACT", THEME.good, unit);

    // ✓ badge: green disc pops, then the tick draws on stroke by stroke.
    const checkIn = easeOutBack(clamp01(t1 * 2.5 - 0.3));
    if (checkIn > 0) {
      const r = unit * 0.85;
      ctx.save();
      ctx.translate(contentX + contentW - unit * 1.9, factY + unit * 1.35);
      ctx.scale(Math.max(0.01, checkIn), Math.max(0.01, checkIn));
      ctx.shadowColor = rgba(THEME.good, 0.6);
      ctx.shadowBlur = unit * 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = THEME.good;
      ctx.fill();
      ctx.shadowBlur = 0;
      const draw = clamp01(t1 * 3 - 0.6);
      if (draw > 0) {
        ctx.strokeStyle = "#06121a";
        ctx.lineWidth = unit * 0.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const p1 = { x: -r * 0.45, y: r * 0.05 };
        const p2 = { x: -r * 0.1, y: r * 0.42 };
        const p3 = { x: r * 0.5, y: -r * 0.35 };
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        if (draw < 0.45) {
          const f = draw / 0.45;
          ctx.lineTo(p1.x + (p2.x - p1.x) * f, p1.y + (p2.y - p1.y) * f);
        } else {
          ctx.lineTo(p2.x, p2.y);
          const f = (draw - 0.45) / 0.55;
          ctx.lineTo(p2.x + (p3.x - p2.x) * f, p2.y + (p3.y - p2.y) * f);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    fLines.forEach((line, i) => ctx.fillText(line, contentX + unit, factY + textTop + i * lineStep));
    ctx.restore();
  }
}

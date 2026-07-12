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
  const cardH = (contentH - gap) / 2;
  const mythY = contentY + unit * 0.3;
  const factY = mythY + cardH + gap;

  // ── Myth card ──────────────────────────────────────────────────────────────
  const mythIn = easeOutCubic(clamp01(t0 * 2.2));
  if (mythIn > 0) {
    const busted = t1 > 0;
    ctx.save();
    ctx.globalAlpha = mythIn * (busted ? 0.66 : 1);
    ctx.translate(0, (1 - mythIn) * unit * 1.2);

    roundRect(ctx, contentX, mythY, contentW, cardH, unit * 0.6);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    roundRect(ctx, contentX, mythY, contentW, cardH, unit * 0.6);
    ctx.strokeStyle = busted ? rgba(DANGER, 0.75) : "rgba(148,163,184,0.45)";
    ctx.lineWidth = busted ? unit * 0.09 : unit * 0.05;
    ctx.stroke();

    chip(ctx, contentX + unit * 0.9, mythY + unit * 1.45, "MYTH", DANGER, unit);

    ctx.font = `700 ${unit * 1.05}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    const mLines = wrapText(ctx, scene.myth, contentW - unit * 2).slice(0, 3);
    mLines.forEach((line, i) => ctx.fillText(line, contentX + unit, mythY + unit * 3.0 + i * unit * 1.45));

    // strike-through on bust
    if (busted) {
      const strike = easeOutCubic(clamp01(t1 * 2.5));
      ctx.strokeStyle = rgba(DANGER, 0.8);
      ctx.lineWidth = unit * 0.12;
      const sy = mythY + unit * 3.0 + ((mLines.length - 1) * unit * 1.45) / 2 - unit * 0.35;
      ctx.beginPath();
      ctx.moveTo(contentX + unit, sy);
      ctx.lineTo(contentX + unit + (contentW - unit * 2) * strike, sy);
      ctx.stroke();
    }
    ctx.restore();

    // ❌ stamp
    if (busted) {
      const stampIn = easeOutBack(clamp01(t1 * 2.2));
      ctx.save();
      ctx.translate(contentX + contentW - unit * 2.4, mythY + unit * 2.2);
      ctx.rotate(-0.18);
      ctx.scale(Math.max(0.01, stampIn), Math.max(0.01, stampIn));
      ctx.strokeStyle = DANGER;
      ctx.lineWidth = unit * 0.28;
      ctx.lineCap = "round";
      ctx.shadowColor = rgba(DANGER, 0.5);
      ctx.shadowBlur = unit * 0.7;
      const r = unit * 0.9;
      ctx.beginPath();
      ctx.moveTo(-r, -r);
      ctx.lineTo(r, r);
      ctx.moveTo(r, -r);
      ctx.lineTo(-r, r);
      ctx.stroke();
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

    const checkIn = easeOutBack(clamp01(t1 * 2.5 - 0.3));
    ctx.save();
    ctx.translate(contentX + contentW - unit * 1.9, factY + unit * 1.25);
    ctx.scale(Math.max(0.01, checkIn), Math.max(0.01, checkIn));
    ctx.font = `900 ${unit * 1.5}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.good;
    ctx.textAlign = "center";
    ctx.fillText("✓", 0, unit * 0.5);
    ctx.restore();
    ctx.textAlign = "start";

    ctx.font = `700 ${unit * 1.05}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    const fLines = wrapText(ctx, scene.fact, contentW - unit * 2).slice(0, 3);
    fLines.forEach((line, i) => ctx.fillText(line, contentX + unit, factY + unit * 3.0 + i * unit * 1.45));
    ctx.restore();
  }
}

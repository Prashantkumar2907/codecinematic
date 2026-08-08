import type { Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  clamp01,
  wrapText,
  roundRect,
  beatT,
  beatWindow,
  rgba,
  shade,
  departT,
  applyElevation,
  clearShadow,
  RADIUS,
} from "./common";
import type { PaintEnv } from "./index";

type MythfactScene = Extract<Scene, { kind: "mythfact" }>;

const DANGER = "#f87171";

/** Lowest usable baseline as a fraction of frame height; the 9:16 bottom band is
 *  covered by the Shorts UI. Matches bullets.ts / bigtext.ts / question.ts. */
const SAFE_BOTTOM_SHORT = 0.75;
const GAP_UNITS = 0.7;
const CARD_FACE_DARKEN = -0.86;
const MYTH_BUST_FADE = 0.22;
const MYTH_TEXT_FADE = 0.18;
/** Text block: chip band above the first baseline, line step, wrap ceiling. */
const CHIP_BAND = 2.3;
const LINE_STEP = 1.34;
const MAX_LINES = 5;
const MIN_FONT_UNITS = 0.72;
const BOB_AMPLITUDE_UNITS = 0.16;
/** How long the myth card takes to go from idle to busted colour. */
const BUST_RAMP_MS = 320;
const BUST_SHAKE_MS = 350;

type Rect = { x: number; y: number; w: number; h: number };

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

/**
 * Beat 0: the myth card appears. Beat 1: a ❌ stamps it and the fact card
 * reveals. Composition follows the ASPECT: long (16:9) has the horizontal room
 * for the two cards side by side; short (9:16) stacks them — two intentional
 * compositions rather than a per-scene coin flip (rubric v2 s10).
 */
export function paintMythfact(ctx: CanvasRenderingContext2D, scene: MythfactScene, env: PaintEnv) {
  const { layout } = env;
  const { h, unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const split = !vertical;

  const leave = departT(env, 380);
  if (leave <= 0) return;

  const t1 = beatT(env.beats, 1, 2, env.p);
  // Bust choreography runs on absolute ms into beat 1 — beat-fraction timing
  // dragged the stamp/strike out over seconds when the fact narration was long.
  const ms1 = t1 > 0 ? (env.p - beatWindow(env.beats, 1, 2).start) * env.durationMs : 0;
  const busted = t1 > 0;

  const mythIn = easeOutCubic(enterT(env, 380));
  const factIn = easeOutCubic(clamp01((ms1 - 120) / 420));
  const bustRamp = busted ? easeOutCubic(clamp01(ms1 / BUST_RAMP_MS)) : 0;

  // Reserve the bob's full excursion so a card's floating bottom edge can never
  // cross into the caption band at any phase — safe-check caught -6.9px at p=0.6.
  const bobReserve = unit * BOB_AMPLITUDE_UNITS * 2;
  const usableH =
    (vertical ? Math.min(contentY + contentH, h * SAFE_BOTTOM_SHORT) : contentY + contentH) - contentY - bobReserve;
  const rect: Rect = { x: contentX, y: contentY, w: contentW, h: usableH };

  const gap = unit * GAP_UNITS;
  const cards: { myth: Rect; fact: Rect } = split
    ? {
        myth: { x: rect.x, y: rect.y, w: (rect.w - gap) / 2, h: rect.h },
        fact: { x: rect.x + (rect.w - gap) / 2 + gap, y: rect.y, w: (rect.w - gap) / 2, h: rect.h },
      }
    : {
        myth: { x: rect.x, y: rect.y, w: rect.w, h: (rect.h - gap) / 2 },
        fact: { x: rect.x, y: rect.y + (rect.h - gap) / 2 + gap, w: rect.w, h: (rect.h - gap) / 2 },
      };

  const mythShake =
    busted && ms1 < BUST_SHAKE_MS ? Math.sin((ms1 / BUST_SHAKE_MS) * 28) * unit * 0.5 * (1 - ms1 / BUST_SHAKE_MS) : 0;
  const bobOf = (elapsedMs: number, phase: number) => Math.sin(elapsedMs / 1400 + phase) * unit * BOB_AMPLITUDE_UNITS;
  const mythR = { ...cards.myth, x: cards.myth.x + mythShake, y: cards.myth.y + bobOf(env.elapsedMs, 0) };
  const factR = { ...cards.fact, y: cards.fact.y + bobOf(env.elapsedMs, 2) };

  // Type scale is fitted to the SMALLER of the two cards so both read at the same
  // size. The constraint is the wrapped line count against the card's height.
  const padX = unit;
  const textW = Math.min(mythR.w, factR.w) - padX * 2;
  const boxH = Math.min(mythR.h, factR.h);
  let fontPx = unit * 1.15;
  let mLines = [scene.myth];
  let fLines = [scene.fact];
  for (;;) {
    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    mLines = wrapText(ctx, scene.myth, textW).slice(0, MAX_LINES);
    fLines = wrapText(ctx, scene.fact, textW).slice(0, MAX_LINES);
    const step = fontPx * LINE_STEP;
    const need = unit * CHIP_BAND + fontPx + (Math.max(mLines.length, fLines.length) - 1) * step;
    if (need <= boxH - unit * 0.5 || fontPx <= unit * MIN_FONT_UNITS) break;
    fontPx -= unit * 0.05;
  }
  const lineStep = fontPx * LINE_STEP;

  /** Vertically centre chip + text as one group inside the card. */
  const groupTop = (box: Rect, lines: number) => {
    const groupH = unit * CHIP_BAND + fontPx + (lines - 1) * lineStep + fontPx * 0.25;
    return box.y + Math.max(unit * 0.4, (box.h - groupH) / 2);
  };

  const drawCardFace = (r: Rect, accentColor: string, opacity: number) => {
    ctx.save();
    ctx.globalAlpha = opacity * leave;
    applyElevation(ctx, unit, "raised");
    roundRect(ctx, r.x, r.y, r.w, r.h, unit * RADIUS.lg);
    ctx.fillStyle = shade(accentColor, CARD_FACE_DARKEN);
    ctx.fill();
    clearShadow(ctx);
    roundRect(ctx, r.x, r.y, r.w, r.h, unit * RADIUS.lg);
    ctx.strokeStyle = rgba(accentColor, 0.4);
    ctx.lineWidth = unit * 0.045;
    ctx.stroke();
    ctx.restore();
  };

  // ── Myth card ──────────────────────────────────────────────────────────────────
  if (mythIn > 0) {
    drawCardFace(mythR, DANGER, mythIn * (1 - MYTH_BUST_FADE * bustRamp));
    const top = groupTop(mythR, mLines.length);
    ctx.save();
    ctx.globalAlpha = mythIn * (1 - MYTH_TEXT_FADE * bustRamp) * leave;

    chip(ctx, mythR.x + padX, top + unit, "MYTH", DANGER, unit);

    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    const firstBaseline = top + unit * CHIP_BAND + fontPx;
    mLines.forEach((line, i) => ctx.fillText(line, mythR.x + padX, firstBaseline + i * lineStep));

    if (busted) {
      // The strike spans the TEXT, not the card: running it to the card edge left
      // a red line hanging in empty space past the last word.
      const strike = easeOutCubic(clamp01(ms1 / 400));
      const struckW = Math.max(...mLines.map((line) => ctx.measureText(line).width));
      ctx.strokeStyle = rgba(DANGER, 0.8);
      ctx.lineWidth = unit * 0.12;
      const sy = firstBaseline + ((mLines.length - 1) * lineStep) / 2 - fontPx * 0.33;
      ctx.beginPath();
      ctx.moveTo(mythR.x + padX, sy);
      ctx.lineTo(mythR.x + padX + struckW * strike, sy);
      ctx.stroke();
    }
    ctx.restore();

    // ❌ badge: red ring seals in, then the cross strokes draw on.
    if (busted) {
      const stampIn = easeOutBack(clamp01(ms1 / 380));
      const r = unit * 0.85;
      ctx.save();
      ctx.globalAlpha *= leave;
      ctx.translate(mythR.x + mythR.w - unit * 1.9, top + unit);
      ctx.rotate(-0.12 * (1 - clamp01(ms1 / 400)));
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
      const draw = clamp01((ms1 - 260) / 320);
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

  // ── Fact card ──────────────────────────────────────────────────────────────────
  if (factIn > 0) {
    drawCardFace(factR, THEME.good, factIn);
    const top = groupTop(factR, fLines.length);
    ctx.save();
    ctx.globalAlpha = factIn * leave;

    chip(ctx, factR.x + padX, top + unit, "FACT", THEME.good, unit);

    // ✓ badge: green disc pops, then the tick draws on stroke by stroke.
    const checkIn = easeOutBack(clamp01((ms1 - 300) / 380));
    if (checkIn > 0) {
      const r = unit * 0.85;
      ctx.save();
      ctx.globalAlpha *= leave;
      ctx.translate(factR.x + factR.w - unit * 1.9, top + unit);
      ctx.scale(Math.max(0.01, checkIn), Math.max(0.01, checkIn));
      ctx.shadowColor = rgba(THEME.good, 0.6);
      ctx.shadowBlur = unit * 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = THEME.good;
      ctx.fill();
      ctx.shadowBlur = 0;
      const draw = clamp01((ms1 - 480) / 350);
      if (draw > 0) {
        ctx.strokeStyle = THEME.bgBottom;
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
    const firstBaseline = top + unit * CHIP_BAND + fontPx;
    fLines.forEach((line, i) => ctx.fillText(line, factR.x + padX, firstBaseline + i * lineStep));
    ctx.restore();
  }
}

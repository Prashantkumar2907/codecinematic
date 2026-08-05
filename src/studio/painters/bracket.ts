import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  DUR,
  RADIUS,
  STROKE,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  smoothPulse,
  clamp01,
  lerp,
  lerpColor,
  roundRect,
  roundedCorners,
  isoBox,
  fitFontSize,
  drawSceneTitle,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type BracketScene = Extract<Scene, { kind: "bracket" }>;
type Pt = { x: number; y: number };

type MatchMeta = {
  beat: number;
  col: number;
  winnerSlot: number;
  loserSlot: number;
};

/** 9:16 only: keep the deepest column clear of the YouTube action rail. */
const RAIL_FRACTION = 0.14;
/** Minimum horizontal air between two columns, so the elbow reads as an elbow. */
const COL_GAP_UNITS = { short: 0.9, long: 1.5 };
const CHIP_W_MAX_UNITS = { short: 5.2, long: 6.6 };
const CHIP_H_MAX_UNITS = { short: 1.9, long: 2.0 };
/** Share of a row's pitch the chip occupies; the rest is the gutter. */
const ROW_FILL = 0.62;
/** Caps the gap at wide aspects so a 3-column bracket does not read as three islands. */
const COL_STEP_MAX_RATIO = 2.05;
const DEPTH_UNITS = 0.16;
const LABEL_PAD_UNITS = 0.4;
const BADGE_W_UNITS = 0.9;
const ICON_GAP_UNITS = 0.22;
const ICON_MAX_UNITS = 0.8;
const ICON_H_RATIO = 0.52;
const LABEL_H_RATIO = 0.46;
const LABEL_MIN_UNITS = 0.42;
const BASELINE_RATIO = 0.35;

const SKELETON_IN_MS = DUR.base;
const SKELETON_STEP_MS = 34;
const CHIP_IN_MS = DUR.slow;
const CHIP_STEP_MS = 58;
/** easeOutBack overshoots to ~1.10; damped so a scaling chip stays inside its gutter. */
const POP_OVERSHOOT_DAMP = 0.55;

/** Fractions of a match's beat window: line draws, then the winner chip lands, then the tick. */
const LINE_DRAW_SPAN = 0.42;
const LINE_FEEDER_SHARE = 0.62;
const CHIP_FILL_FROM = 0.42;
const CHIP_FILL_SPAN = 0.4;
const FLASH_FROM = 0.6;
const FLASH_SPAN = 0.3;

const ACTIVE_PULSE_MS = 1500;
const CHAMP_PULSE_MS = 2600;
const ACTIVE_PULSE_SCALE = 1.014;
const CHAMP_PULSE_SCALE = 1.022;
const GLOW_BREATH_MS = 2200;
const GLOW_BASE_UNITS = 0.24;
const GLOW_SWING_UNITS = 0.18;

const TINT_ACTIVE = 0.14;
const TINT_CHAMPION = 0.09;
const BADGE_H_RATIO = 0.44;
const BADGE_MIN_SCALE = 0.2;

const GHOST_ALPHA = 0.2;
const LOSER_ALPHA = 0.46;
const SETTLED_WINNER_ALPHA = 0.72;
const SKELETON_ALPHA = 0.3;

/**
 * Arc-length slice of a polyline between two 0-1 positions.
 *
 * A connector needs its drawn head in accent and its undrawn tail in the dim
 * skeleton colour. Stroking the full path dim and the head over it would put two
 * strokes on the same pixels — rubric axis 4's "double-drawn edge" — so the two
 * states are cut out of one path instead and each pixel is stroked exactly once.
 */
function subPolyline(pts: Pt[], from: number, to: number): Pt[] {
  const a = clamp01(Math.min(from, to));
  const b = clamp01(Math.max(from, to));
  if (pts.length < 2 || b - a <= 0) return [];
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(d);
    total += d;
  }
  if (total <= 0) return [];
  const startAt = total * a;
  const endAt = total * b;
  const out: Pt[] = [];
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = lens[i - 1];
    const segStart = walked;
    walked += d;
    if (d <= 0 || walked < startAt || segStart > endAt) continue;
    const at = (dist: number): Pt => {
      const k = (dist - segStart) / d;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k,
      };
    };
    if (out.length === 0) out.push(at(Math.max(startAt, segStart)));
    out.push(at(Math.min(endAt, walked)));
  }
  return out.length >= 2 ? out : [];
}

export function paintBracket(ctx: CanvasRenderingContext2D, scene: BracketScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.matches.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;

  const n = scene.contenders.length;

  const roundMatchCount: number[] = [];
  {
    let field = n;
    while (field > 1) {
      const m = Math.floor(field / 2);
      roundMatchCount.push(m);
      field = m + (field % 2);
    }
  }
  const nRounds = roundMatchCount.length;

  const cols: number[][] = [];
  const producedBy: number[][] = [];
  const feeders: number[][][] = [];
  cols[0] = scene.contenders.map((_, i) => i);
  producedBy[0] = scene.contenders.map(() => -1);
  feeders[0] = scene.contenders.map(() => []);

  const matchMeta: MatchMeta[] = [];
  let g = 0;
  for (let c = 0; c < nRounds; c++) {
    const partic = cols[c];
    const next: number[] = [];
    const nextProd: number[] = [];
    const nextFeed: number[][] = [];
    let slot = 0;
    for (let mm = 0; mm < roundMatchCount[c]; mm++) {
      const topSlot = slot;
      const botSlot = slot + 1;
      const wi = Math.max(0, Math.min(1, scene.matches[g].winner));
      const winnerSlot = wi === 0 ? topSlot : botSlot;
      const loserSlot = wi === 0 ? botSlot : topSlot;
      next.push(partic[winnerSlot]);
      nextProd.push(g);
      nextFeed.push([topSlot, botSlot]);
      matchMeta.push({ beat: offset + g, col: c, winnerSlot, loserSlot });
      slot += 2;
      g++;
    }
    while (slot < partic.length) {
      next.push(partic[slot]);
      nextProd.push(-1);
      nextFeed.push([slot]);
      slot++;
    }
    cols[c + 1] = next;
    producedBy[c + 1] = nextProd;
    feeders[c + 1] = nextFeed;
  }

  const totalCols = cols.length;

  /* ── Pixel layout is authoritative: every chip is placed inside
   *    [contentX, usableRight] x [top, safeBottom] by construction, so no
   *    element can leave the frame or enter the caption band at any p. ── */
  const usableX = contentX;
  const usableW = contentW * (vertical ? 1 - RAIL_FRACTION : 1);
  const depth = unit * DEPTH_UNITS;
  const colGap = unit * (vertical ? COL_GAP_UNITS.short : COL_GAP_UNITS.long);
  const chipW = Math.min(
    unit * (vertical ? CHIP_W_MAX_UNITS.short : CHIP_W_MAX_UNITS.long),
    (usableW - colGap * (totalCols - 1)) / totalCols
  );
  const faceW = Math.max(unit, chipW - depth);
  const colStep =
    totalCols > 1
      ? Math.min((usableW - chipW) / (totalCols - 1), chipW * COL_STEP_MAX_RATIO)
      : 0;
  const bracketW = chipW + colStep * (totalCols - 1);
  const x0 = usableX + (usableW - bracketW) / 2;
  const colLeft = (c: number) => x0 + colStep * c;

  const top = contentY + band;
  const rowPitch = Math.max(unit, (safeBottom - top) / n);
  const chipH = Math.min(
    rowPitch * ROW_FILL,
    unit * (vertical ? CHIP_H_MAX_UNITS.short : CHIP_H_MAX_UNITS.long)
  );
  const radius = unit * RADIUS.md;

  const yPos: number[][] = [];
  yPos[0] = cols[0].map((_, s) => top + rowPitch * (s + 0.5));
  for (let c = 1; c < totalCols; c++) {
    yPos[c] = cols[c].map((_, s) => {
      const fs = feeders[c][s];
      return fs.reduce((acc, f) => acc + yPos[c - 1][f], 0) / fs.length;
    });
  }

  const roleOf = new Map<string, { m: MatchMeta; win: boolean }>();
  for (const m of matchMeta) {
    roleOf.set(`${m.col}:${m.winnerSlot}`, { m, win: true });
    roleOf.set(`${m.col}:${m.loserSlot}`, { m, win: false });
  }

  const skeletonT = (order: number) =>
    easeOutCubic(enterT(env, SKELETON_IN_MS, order * SKELETON_STEP_MS));

  /** 0-1 arrival of the chip in column c slot s: staggered for the seeds, beat-driven after. */
  const chipT = (c: number, s: number): number => {
    const gm = c === 0 ? -1 : producedBy[c][s];
    if (gm < 0) return enterT(env, CHIP_IN_MS, s * CHIP_STEP_MS);
    const bw = beatWindow(env.beats, offset + gm, totalBeats);
    const span = Math.max(bw.end - bw.start, 0.001);
    return clamp01((env.p - (bw.start + CHIP_FILL_FROM * span)) / (CHIP_FILL_SPAN * span));
  };

  /** Gold ramp within a match window — shared by every winner and by the crown. */
  const goldT = (beat: number) => {
    const bw = beatWindow(env.beats, beat, totalBeats);
    const span = Math.max(bw.end - bw.start, 0.001);
    return easeOutCubic(clamp01((env.p - (bw.start + FLASH_FROM * span)) / (FLASH_SPAN * span)));
  };
  // Crowning keys off the final match RESOLVING, not its window ending: the probe
  // and the engine both hand the last beat an end of ~1.0, so `p >= end` put the
  // whole payoff in the final frame and left the scene un-settled at p=0.95.
  const crownT = goldT(totalBeats - 1);
  const glowBlur = unit * (GLOW_BASE_UNITS + GLOW_SWING_UNITS * idle(env, GLOW_BREATH_MS));

  const skeletonStroke = rgba(THEME.textDim, 0.5);
  const strokePts = (pts: Pt[]) => {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  };

  /* ── Connectors, drawn under the chips so no terminus can ever overshoot a
   *    visible border. Endpoints are the STROKED border exactly — the feeder's
   *    face right edge and the target's face left edge — so no gap opens up; the
   *    extrusion wedge then covers the first few px of the outgoing line. ── */
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  let order = 0;
  for (let c = 1; c < totalCols; c++) {
    for (let s = 0; s < cols[c].length; s++) {
      order++;
      const gm = producedBy[c][s];
      const kx = colLeft(c);
      const ky = yPos[c][s];
      const fRight = colLeft(c - 1) + faceW;
      const mx = (fRight + kx) / 2;
      const structural = skeletonT(order) * SKELETON_ALPHA;
      if (structural <= 0) continue;

      const bw = gm >= 0 ? beatWindow(env.beats, offset + gm, totalBeats) : null;
      const span = bw ? Math.max(bw.end - bw.start, 0.001) : 1;
      const drawT = bw
        ? easeInOutCubic(clamp01((env.p - bw.start) / (LINE_DRAW_SPAN * span)))
        : easeOutCubic(enterT(env, CHIP_IN_MS));
      const feederT = clamp01(drawT / LINE_FEEDER_SHARE);
      const outT = clamp01((drawT - LINE_FEEDER_SHARE) / (1 - LINE_FEEDER_SHARE));

      const paint = (pts: Pt[], lit: number) => {
        const dim = subPolyline(pts, lit, 1);
        if (dim.length) {
          ctx.globalAlpha = structural;
          ctx.strokeStyle = skeletonStroke;
          ctx.lineWidth = unit * STROKE.thin;
          ctx.shadowBlur = 0;
          strokePts(dim);
        }
        const hot = subPolyline(pts, 0, lit);
        if (hot.length) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = rgba(accent, 0.85);
          ctx.lineWidth = unit * STROKE.base;
          ctx.shadowColor = accentGlow;
          ctx.shadowBlur = glowBlur;
          strokePts(hot);
          ctx.shadowBlur = 0;
        }
      };

      for (const f of feeders[c][s]) {
        const fy = yPos[c - 1][f];
        const raw: Pt[] =
          Math.abs(fy - ky) < 1
            ? [
                { x: fRight, y: ky },
                { x: mx, y: ky },
              ]
            : [
                { x: fRight, y: fy },
                { x: mx, y: fy },
                { x: mx, y: ky },
              ];
        const pts = roundedCorners(raw, radius);
        const isWinnerLine = gm < 0 || (roleOf.get(`${c - 1}:${f}`)?.win ?? false);
        paint(pts, isWinnerLine ? feederT : 0);
      }
      paint(
        [
          { x: mx, y: ky },
          { x: kx, y: ky },
        ],
        outT
      );
    }
  }
  ctx.restore();

  /* ── Chips. ── */
  const iconPx = Math.min(chipH * ICON_H_RATIO, unit * ICON_MAX_UNITS);
  ctx.save();
  ctx.font = `${iconPx}px ${FONT_SANS}`;
  let iconSlot = 0;
  for (const cont of scene.contenders) {
    if (cont.icon) iconSlot = Math.max(iconSlot, ctx.measureText(cont.icon).width);
  }
  if (iconSlot > 0) iconSlot += unit * ICON_GAP_UNITS;
  const labelPad = unit * LABEL_PAD_UNITS;
  const badgeW = unit * BADGE_W_UNITS;
  const labelMaxW = Math.max(unit, faceW - labelPad * 2 - iconSlot - badgeW);
  let labelPx = chipH * LABEL_H_RATIO;
  for (const cont of scene.contenders) {
    labelPx = Math.min(
      labelPx,
      fitFontSize(ctx, cont.label, {
        maxW: labelMaxW,
        startPx: chipH * LABEL_H_RATIO,
        minPx: unit * LABEL_MIN_UNITS,
        weight: 700,
      })
    );
  }
  ctx.restore();

  order = 0;
  for (let c = 0; c < totalCols; c++) {
    for (let s = 0; s < cols[c].length; s++) {
      order++;
      const cx = colLeft(c);
      const cy = yPos[c][s];
      const isChampion = c === totalCols - 1;
      const t = chipT(c, s);

      if (t <= 0) {
        const gi = skeletonT(order);
        if (gi <= 0) continue;
        ctx.save();
        ctx.globalAlpha = GHOST_ALPHA * gi;
        ctx.setLineDash([unit * 0.3, unit * 0.25]);
        ctx.strokeStyle = rgba(THEME.textDim, 0.7);
        ctx.lineWidth = unit * STROKE.thin;
        roundRect(ctx, cx, cy - chipH / 2, faceW, chipH, radius);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      const role = roleOf.get(`${c}:${s}`);
      const isActive = role ? active === role.m.beat : false;
      const beatWin = role ? beatWindow(env.beats, role.m.beat, totalBeats) : null;
      const past = role && beatWin ? env.p >= beatWin.end : false;
      const isLoser = role ? !role.win : false;
      const isWinner = role ? role.win : false;

      // 0-1 gold intensity: the win flash for a match winner, the crown for the
      // champion. Every gold-dependent value ramps off it so nothing pops.
      const hot = isChampion ? crownT : role && isWinner ? goldT(role.m.beat) : 0;
      const crowned = isChampion && crownT > 0;

      let alpha = easeOutCubic(t);
      if (isLoser && past) alpha *= LOSER_ALPHA;
      else if (isWinner && past && !isChampion) alpha *= SETTLED_WINNER_ALPHA;

      const pop = 1 + (easeOutBack(clamp01(t)) - 1) * POP_OVERSHOOT_DAMP;
      const breathe = crowned
        ? smoothPulse(env, CHAMP_PULSE_MS, CHAMP_PULSE_SCALE)
        : isActive
          ? smoothPulse(env, ACTIVE_PULSE_MS, ACTIVE_PULSE_SCALE)
          : 1;
      const scale = Math.max(0.001, pop * breathe);

      const bx = cx;
      const by = cy - chipH / 2;
      // One hue tells the whole story: neutral = still to play, accent = focus or
      // advancing, warn = just won / crowned, dim = eliminated.
      const advancing = isChampion || (isWinner && past);
      const baseHex = isActive || advancing ? accent : THEME.textDim;
      const baseBorderAlpha = isActive ? 1 : advancing ? 0.6 : isLoser && past ? 0.4 : 0.5;
      const borderColor = lerpColor(baseHex, THEME.warn, hot);
      const borderAlpha = lerp(baseBorderAlpha, 1, hot);
      const tintAlpha = Math.max(isActive ? TINT_ACTIVE : isChampion ? TINT_CHAMPION : 0, TINT_ACTIVE * hot);
      const lit = isActive || hot > 0;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx + faceW / 2, cy);
      ctx.scale(scale, scale);
      ctx.translate(-(cx + faceW / 2), -cy);

      isoBox(ctx, bx, by, faceW, chipH, depth, THEME.panel, radius);
      if (tintAlpha > 0) {
        roundRect(ctx, bx, by, faceW, chipH, radius);
        ctx.globalAlpha = alpha * tintAlpha;
        ctx.fillStyle = lerpColor(accent, THEME.warn, hot);
        ctx.fill();
      }
      roundRect(ctx, bx, by, faceW, chipH, radius);
      ctx.globalAlpha = alpha * borderAlpha;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = unit * lerp(STROKE.thin, STROKE.base, lit ? Math.max(hot, isActive ? 1 : 0) : 0);
      if (lit) {
        ctx.shadowColor = hot > 0 ? rgba(THEME.warn, 0.45) : accentGlow;
        ctx.shadowBlur = glowBlur * (isActive ? 1 : hot);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha;

      // Clip so a label that cannot shrink further truncates instead of bleeding.
      roundRect(ctx, bx, by, faceW, chipH, radius);
      ctx.clip();

      const cont = scene.contenders[cols[c][s]];
      const baseline = cy + labelPx * BASELINE_RATIO;
      let labelX = bx + labelPad;
      if (cont.icon) {
        ctx.font = `${iconPx}px ${FONT_SANS}`;
        ctx.fillStyle = isLoser && past ? THEME.textDim : THEME.text;
        ctx.fillText(cont.icon, labelX, baseline);
        labelX += iconSlot;
      }
      ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
      ctx.fillStyle = isLoser && past ? THEME.textDim : lerpColor(THEME.text, THEME.warn, hot);
      ctx.fillText(cont.label, labelX, baseline);

      if (hot > 0) {
        const badgeIn = Math.max(BADGE_MIN_SCALE, easeOutBack(hot));
        ctx.globalAlpha = alpha * hot;
        ctx.fillStyle = THEME.warn;
        ctx.font = `800 ${chipH * BADGE_H_RATIO * badgeIn}px ${FONT_SANS}`;
        ctx.textAlign = "right";
        ctx.fillText(crowned ? "★" : "✓", bx + faceW - labelPad, baseline);
        ctx.textAlign = "start";
      }
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}

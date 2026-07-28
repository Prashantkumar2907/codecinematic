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
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type ParliamentArcScene = Extract<Scene, { kind: "parliament_arc" }>;
type Faction = ParliamentArcScene["factions"][number];
type Seat = { x: number; y: number; angle: number };

// A faction's fill wave: seat j starts at (j/count)*WAVE_SPAN and pops over POP_LEN,
// so the whole block has finished landing at WAVE_DONE of its beat.
const WAVE_SPAN = 0.55;
const POP_LEN = 0.2;
const WAVE_DONE = WAVE_SPAN + POP_LEN;
// Captions sit in the bottom ~14% of vertical frames; keep the chamber above them.
const CAPTION_SAFE_Y = 0.86;

/** Tone → colour, always drawn from the subject palette or THEME (never hard-coded). */
function toneColor(tone: Faction["tone"], accent: string, secondary: string): string {
  switch (tone) {
    case "for":
      return THEME.good;
    case "against":
      return THEME.warn;
    case "abstain":
      return THEME.textDim;
    case "secondary":
      return secondary;
    default:
      return accent;
  }
}

/**
 * Hemicycle seats: concentric rows of a semicircle, seat count per row weighted by
 * radius so the arc reads evenly. Fill order is swept left→right (angle 180→0) so
 * consecutive factions block up contiguously like a real chamber.
 */
function buildArc(total: number, cx: number, baseY: number, rMax: number) {
  const rows = total <= 40 ? 3 : total <= 90 ? 4 : total <= 160 ? 5 : 6;
  const r0 = rMax * 0.44;
  const gapR = (rMax - r0) / (rows - 1);
  const radii = Array.from({ length: rows }, (_, i) => r0 + gapR * i);
  const wSum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((rr) => Math.max(1, Math.round((total * rr) / wSum)));
  let guard = 0;
  let diff = total - counts.reduce((a, b) => a + b, 0);
  while (diff !== 0 && guard++ < 128) {
    const i = rows - 1 - (guard % rows);
    counts[i] = Math.max(1, counts[i] + Math.sign(diff));
    diff = total - counts.reduce((a, b) => a + b, 0);
  }
  const seats: Seat[] = [];
  let minChord = Infinity;
  radii.forEach((rr, ri) => {
    const m = counts[ri];
    minChord = Math.min(minChord, (Math.PI * rr) / m);
    for (let j = 0; j < m; j++) {
      const angle = 180 - ((j + 0.5) / m) * 180;
      const a = (angle * Math.PI) / 180;
      seats.push({ x: cx + Math.cos(a) * rr, y: baseY - Math.sin(a) * rr, angle });
    }
  });
  seats.sort((a, b) => b.angle - a.angle);
  return { seats, dotR: Math.min(gapR, minChord) * 0.34, r0, gapR };
}

export function paintParliamentArc(ctx: CanvasRenderingContext2D, scene: ParliamentArcScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const total = scene.total;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.factions.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const ah = safeBottom - ay;

  // Legend chips beneath the chamber (works in both aspects).
  const perRow = vertical ? 2 : Math.min(scene.factions.length, 3);
  const legendRows = Math.ceil(scene.factions.length / perRow);
  const legendH = legendRows * unit * 1.6 + unit * 0.4;
  const arcH = ah - legendH;

  const cx = ax + aw / 2;
  const rMax = Math.min(aw / 2 - unit * 0.4, arcH * 0.9);
  const baseY = ay + (arcH - rMax) / 2 + rMax;
  const { seats, dotR, r0, gapR } = buildArc(total, cx, baseY, rMax);

  // Cumulative seat offsets per faction (fill order = declaration order, left→right).
  const starts: number[] = [];
  let cum = 0;
  scene.factions.forEach((f) => {
    starts.push(cum);
    cum += f.seats;
  });

  const ghostIn = easeOutCubic(enterT(env, 440));

  // Empty chamber: dim ghost dots so the hemicycle shape reads immediately.
  if (ghostIn > 0) {
    ctx.save();
    ctx.globalAlpha = ghostIn;
    seats.forEach((s) => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(148,163,184,0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,0.22)";
      ctx.lineWidth = Math.max(1, dotR * 0.18);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Live filled tally, synced to the pop waves of every revealed faction.
  let filled = 0;
  scene.factions.forEach((f, fi) => {
    const t = beatT(env.beats, offset + fi, totalBeats, env.p);
    if (t <= 0) return;
    filled += Math.round(f.seats * clamp01(t / WAVE_DONE));
  });
  const majority = scene.majorityAt;
  const reached = majority !== undefined && filled >= majority;

  // Seat dots per faction.
  scene.factions.forEach((f, fi) => {
    const t = beatT(env.beats, offset + fi, totalBeats, env.p);
    if (t <= 0) return;
    const isActive = active === offset + fi && t < 1;
    const color = toneColor(f.tone, accent, secondary);
    ctx.save();
    for (let j = 0; j < f.seats; j++) {
      const seat = seats[starts[fi] + j];
      if (!seat) break;
      const pr = clamp01((t - (j / Math.max(f.seats, 1)) * WAVE_SPAN) / POP_LEN);
      if (pr <= 0) continue;
      const settled = pr >= 1;
      const breathe = settled ? 0.9 + 0.1 * idle(env, 2600, j * 0.4) : 1;
      const shimmer = isActive && settled ? 0.85 + 0.15 * Math.sin(env.elapsedMs / 300 + j * 0.6) : 1;
      const scale = (0.55 + 0.45 * easeOutBack(pr)) * breathe;
      ctx.globalAlpha = clamp01(pr) * shimmer;
      if (isActive && !settled) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = dotR * 3;
      }
      ctx.beginPath();
      ctx.arc(seat.x, seat.y, dotR * scale, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  });

  // Majority threshold: a radial tick across the arc + a flag; flashes as the
  // running total crosses it, then locks accent once reached.
  if (majority !== undefined) {
    const seatIdx = Math.min(Math.max(majority - 1, 0), total - 1);
    const angle = seats[seatIdx]?.angle ?? 90;
    const a = (angle * Math.PI) / 180;
    const inner = r0 - gapR * 0.5;
    const outer = rMax + gapR * 0.6;

    // Which faction's wave straddles the threshold seat, and how far along it is.
    let flash = 0;
    scene.factions.forEach((f, fi) => {
      if (starts[fi] < majority && starts[fi] + f.seats >= majority) {
        const t = beatT(env.beats, offset + fi, totalBeats, env.p);
        const jCross = majority - starts[fi] - 1;
        const tCross = (jCross / Math.max(f.seats, 1)) * WAVE_SPAN + POP_LEN;
        const fl = (t - tCross) / 0.5;
        if (fl > 0 && fl < 1) flash = Math.abs(Math.sin(fl * Math.PI * 2));
      }
    });
    const lineColor = reached ? THEME.good : flash > 0 ? accent : THEME.textDim;

    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.globalAlpha = ghostIn * (reached ? 0.85 : 0.35 + 0.6 * flash);
    ctx.lineWidth = unit * (0.08 + 0.06 * flash);
    ctx.setLineDash([unit * 0.32, unit * 0.26]);
    if (flash > 0 || reached) {
      ctx.shadowColor = reached ? rgba(THEME.good, 0.6) : accentGlow;
      ctx.shadowBlur = unit * (0.6 + flash);
    }
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, baseY - Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, baseY - Math.sin(a) * outer);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Flag label at the outer end (falls back to the bare number if it would clip).
    ctx.font = `700 ${unit * 0.6}px ${FONT_SANS}`;
    const flagX = cx + Math.cos(a) * (outer + unit * 0.55);
    const flagY = baseY - Math.sin(a) * (outer + unit * 0.55);
    const full = `majority ${majority}`;
    const fullW = ctx.measureText(full).width + unit * 0.6;
    const fits = flagX - fullW / 2 > contentX && flagX + fullW / 2 < contentX + contentW && flagY - unit * 0.9 > contentY;
    const text = fits ? full : String(majority);
    const tw = ctx.measureText(text).width;
    ctx.globalAlpha = ghostIn;
    roundRect(ctx, flagX - tw / 2 - unit * 0.3, flagY - unit * 0.95, tw + unit * 0.6, unit * 0.95, unit * 0.26);
    ctx.fillStyle = "#0a0e13";
    ctx.fill();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = unit * 0.06;
    ctx.stroke();
    ctx.fillStyle = lineColor;
    ctx.textAlign = "center";
    ctx.fillText(text, flagX, flagY - unit * 0.3);
    ctx.restore();
  }

  // Central tally readout in the empty well of the hemicycle.
  {
    const ty = baseY - rMax * 0.16;
    const numColor = reached ? THEME.good : accent;
    ctx.save();
    ctx.globalAlpha = ghostIn;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (reached) {
      ctx.shadowColor = rgba(THEME.good, 0.5 + 0.4 * idle(env, 1400));
      ctx.shadowBlur = unit * 1.2;
    }
    ctx.font = `800 ${unit * 2.0}px ${FONT_MONO}`;
    ctx.fillStyle = numColor;
    ctx.fillText(String(filled), cx, ty);
    ctx.shadowBlur = 0;
    ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`of ${total} seats`, cx, ty + unit * 0.95);
    if (majority !== undefined) {
      const tag = reached ? "MAJORITY REACHED" : `needs ${majority}`;
      ctx.font = `800 ${unit * 0.6}px ${FONT_SANS}`;
      ctx.fillStyle = reached ? THEME.good : THEME.textFaint;
      ctx.fillText(tag, cx, ty + unit * 1.85);
    }
    ctx.restore();
  }

  // Legend chips: tone dot, label, counting-up seat total — laid out as ONE
  // contiguous group (dot+label+count) centred in its cell, so a faction's
  // count always sits right beside ITS OWN label instead of drifting to the
  // cell's far edge where it can visually pair with the NEXT faction's label.
  scene.factions.forEach((f, fi) => {
    const t = beatT(env.beats, offset + fi, totalBeats, env.p);
    const isActive = active === offset + fi && t < 1;
    const color = toneColor(f.tone, accent, secondary);
    const shown = Math.round(f.seats * clamp01(t / WAVE_DONE));
    const alpha = ghostIn * (t <= 0 ? 0.35 : isActive ? 1 : 0.8);
    const col = fi % perRow;
    const row = Math.floor(fi / perRow);
    const cellW = aw / perRow;
    const ex = ax + col * cellW;
    const ey = ay + arcH + unit * 0.6 + row * unit * 1.6;
    ctx.save();
    ctx.globalAlpha = alpha;

    const dR = unit * 0.26 * (isActive ? 1 + 0.15 * Math.sin(env.elapsedMs / 300) : 1);
    const dotSpan = unit * 0.6;
    const gap = unit * 0.3;

    const lpx = fitFontSize(ctx, f.label, { maxW: cellW * 0.6, startPx: unit * 0.72, minPx: unit * 0.46, weight: isActive ? 700 : 600 });
    ctx.font = `${isActive ? 700 : 600} ${lpx}px ${FONT_SANS}`;
    const labelW = ctx.measureText(f.label).width;

    ctx.font = `800 ${unit * 0.82}px ${FONT_MONO}`;
    const cText = String(t <= 0 ? f.seats : shown);
    const cw = ctx.measureText(cText).width;

    const chipW = dotSpan + labelW + gap + cw;
    const startX = ex + (cellW - chipW) / 2;

    if (isActive) {
      ctx.shadowColor = rgba(color, 0.6);
      ctx.shadowBlur = unit * 0.5;
    }
    ctx.beginPath();
    ctx.arc(startX + unit * 0.28, ey, dR, 0, Math.PI * 2);
    ctx.fillStyle = t <= 0 ? THEME.textFaint : color;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.font = `${isActive ? 700 : 600} ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = isActive ? THEME.text : THEME.textDim;
    ctx.fillText(f.label, startX + dotSpan, ey + unit * 0.26);

    ctx.font = `800 ${unit * 0.82}px ${FONT_MONO}`;
    ctx.fillStyle = isActive ? THEME.text : THEME.textDim;
    ctx.fillText(cText, startX + dotSpan + labelW + gap, ey + unit * 0.28);
    ctx.restore();
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

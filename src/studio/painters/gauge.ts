import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

type GaugeScene = Extract<Scene, { kind: "gauge" }>;

/** Dial sweep, as maths angles (CCW from +X, +y up) — 220° opening downward. */
const A_START = 200;
const A_END = -20;
const OVERSHOOT_PAD = 4;
const MINOR_TICKS = 9;
const TONE_COLORS: Record<GaugeScene["zones"][number]["tone"], string> = {
  good: THEME.good,
  warn: THEME.warn,
  danger: THEME.danger,
};

const TRACK_TUBE = 0.085;
const HUB_R = 0.15;
const NEEDLE_LEN = 0.86;
const NEEDLE_W = 0.055;
const NEEDLE_D = 0.06;
const TICK_LEN = 0.11;
const TICK_W = 0.03;
const TICK_R = 0.845;
const TRACK_OPACITY = 0.24;
const ZONE_OPACITY = 0.86;
const ZONE_PULSE_GAIN = 0.13;

// Pixel dial geometry, as multiples of the dial radius R. The PIXEL layout is
// authoritative: the 3D dial is built at radius 1 and scaled to R, so 2D chrome
// and 3D never disagree. Nothing here may be animated for the same reason.
const READOUT_R = 0.44;
const CHIP_R = 0.74;
const MARKER_IN_R = 0.9;
const MARKER_OUT_R = 1.14;
/** Outer silhouette of the arc tube; every annotation is anchored beyond it. */
const ARC_OUTER_R = 1 + TRACK_TUBE;
const LABEL_PAD_U = 0.7;
const DIAL_TOP_PAD_U = LABEL_PAD_U + 0.35;
const DIAL_BOT_PAD_U = 0.7;
/** |cos| above which a radial label reads better flush-left/right than centred. */
const SIDE_ALIGN_COS = 0.4;

// Entrance staging: everything arrives inside ~800ms, cascaded so no two tiers
// land on the same tick, and nothing starts from zero scale.
const TRACK_IN_MS = 300;
const ZONE_IN_MS = 300;
const ZONE_STAGGER_MS = 90;
const TICK_IN_MS = 220;
const TICK_STAGGER_MS = 18;
const NEEDLE_IN_MS = 320;
const NEEDLE_DELAY_MS = 190;
const CHROME_IN_MS = 260;
const ZONE_LABEL_DELAY_MS = 200;
const MINMAX_DELAY_MS = 300;
const READOUT_DELAY_MS = 340;
const LEGEND_DELAY_MS = 400;
const LEGEND_STAGGER_MS = 90;
/** Idle life that outlasts the last reading, so long beats never freeze. */
const PULSE_MS = 1800;
const TREMOR_MS = 900;
const TREMOR_DEG = 0.45;
/** Needle reaches its target at 80% of the beat rather than 67% — less hold. */
const SETTLE_SPEED = 1.25;

const LEGEND_ROW_H_U = 2;
const LEGEND_MAX_W_U = 14;
const LEGEND_COL_W_U = 9;

export function paintGauge(ctx: CanvasRenderingContext2D, scene: GaugeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const n = scene.readings.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const ah = layout.safeBottom - ay;

  const range = Math.max(scene.max - scene.min, 1e-9);
  const v2a = (v: number) => A_START + (A_END - A_START) * clamp01((v - scene.min) / range);
  const rad = (deg: number) => (deg * Math.PI) / 180;

  const u = (scene.unit ?? "").trim();
  const locale = u === "₹" ? "en-IN" : "en-US";
  const wholes =
    Number.isInteger(scene.min) && Number.isInteger(scene.max) && scene.readings.every((rd) => Number.isInteger(rd.value));
  const fmt = (v: number): string => {
    const sign = v < 0 ? "−" : "";
    const abs = Math.abs(v);
    const text = wholes
      ? Math.round(abs).toLocaleString(locale)
      : abs.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (/^[₹$€£]$/.test(u)) return `${sign}${u}${text}`;
    return u ? `${sign}${text}${u.startsWith("%") ? u : ` ${u}`}` : `${sign}${text}`;
  };

  const k = Math.min(active - offset, n - 1);
  const t = k >= 0 ? beatT(env.beats, offset + k, totalBeats, env.p) : 0;
  let needleVal = scene.min;
  if (k >= 0) {
    const fromV = k === 0 ? scene.min : scene.readings[k - 1].value;
    needleVal = fromV + (scene.readings[k].value - fromV) * easeOutBack(clamp01(t * SETTLE_SPEED));
  }
  const rawAngle = v2a(scene.min) + ((A_END - A_START) * (needleVal - scene.min)) / range;
  const tremor = TREMOR_DEG * (idle(env, TREMOR_MS) * 2 - 1);
  const needleAngle = Math.min(A_START + OVERSHOOT_PAD, Math.max(A_END - OVERSHOOT_PAD, rawAngle)) + tremor;

  const zoneIndexOf = (v: number): number => {
    let prev = scene.min;
    for (let i = 0; i < scene.zones.length; i++) {
      if (v <= scene.zones[i].upTo && v >= prev) return i;
      prev = scene.zones[i].upTo;
    }
    return -1;
  };
  const liveZone = zoneIndexOf(needleVal);
  const pulse = idle(env, PULSE_MS);

  // ---- pixel layout: legend box first, dial takes what is left ----------------
  const legendRowH = Math.min(vertical ? unit * LEGEND_ROW_H_U : unit * 3, ah / Math.max(n, 1));
  const legendBlockH = n * legendRowH + unit * 0.5;
  const legW = vertical ? Math.min(aw, unit * LEGEND_MAX_W_U) : Math.min(aw * 0.34, unit * LEGEND_COL_W_U);
  const legGutter = unit;
  const regionW = vertical ? aw : aw - legW - legGutter;
  const regionH = vertical ? ah - legendBlockH : ah;

  const zonePx = unit * 0.66;
  const minmaxPx = unit * 0.62;
  // Annotations are anchored radially OUTSIDE the arc, so the dial's horizontal
  // reach is the arc plus one whole label — measure it, do not guess.
  ctx.font = `700 ${zonePx}px ${FONT_SANS}`;
  let labelW = 0;
  for (const zn of scene.zones) if (zn.label) labelW = Math.max(labelW, ctx.measureText(zn.label).width);
  ctx.font = `600 ${minmaxPx}px ${FONT_MONO}`;
  labelW = Math.max(labelW, ctx.measureText(fmt(scene.min)).width, ctx.measureText(fmt(scene.max)).width);

  const rByW = (regionW / 2 - unit * LABEL_PAD_U - labelW) / ARC_OUTER_R;
  const rByH = (regionH - unit * (DIAL_TOP_PAD_U + DIAL_BOT_PAD_U)) / (ARC_OUTER_R + CHIP_R);
  const R = Math.max(unit * 2, Math.min(rByW, rByH));
  const dialHalfW = ARC_OUTER_R * R + unit * LABEL_PAD_U + labelW;
  const dialTop = ARC_OUTER_R * R + unit * DIAL_TOP_PAD_U;
  const usedH = dialTop + CHIP_R * R + unit * DIAL_BOT_PAD_U;

  // 16:9 keeps dial and legend adjacent and centres the pair, so neither the
  // gap between them nor the outer margins reads as a void.
  const blockW = vertical ? 2 * dialHalfW : 2 * dialHalfW + legGutter + legW;
  const blockX = ax + Math.max(0, (aw - blockW) / 2);
  const cx = blockX + dialHalfW;
  const cy = ay + Math.max(0, (regionH - usedH) / 2) + dialTop;
  const legX = vertical ? ax + (aw - legW) / 2 : blockX + 2 * dialHalfW + legGutter;
  const legTop = vertical ? ay + ah - legendBlockH : ay + (ah - n * legendRowH) / 2;
  const at = (rf: number, deg: number) => ({ x: cx + Math.cos(rad(deg)) * R * rf, y: cy - Math.sin(rad(deg)) * R * rf });
  /** Anchor for a label sitting just outside the arc at `deg`, aligned away from it. */
  const radialLabel = (deg: number) => {
    const c = Math.cos(rad(deg));
    const p = at(ARC_OUTER_R + (unit * LABEL_PAD_U) / R, deg);
    return { x: p.x, y: p.y, align: (c > SIDE_ALIGN_COS ? "left" : c < -SIDE_ALIGN_COS ? "right" : "center") as CanvasTextAlign };
  };

  // ---- dial, drawn directly in 2D — pixel geometry already decided it ----
  const trackIn = easeOutCubic(enterT(env, TRACK_IN_MS));
  const zoneIn = scene.zones.map((_, i) => easeOutCubic(enterT(env, ZONE_IN_MS, i * ZONE_STAGGER_MS)));
  const tickIn = Array.from({ length: MINOR_TICKS }, (_, i) =>
    easeOutCubic(enterT(env, TICK_IN_MS, TRACK_IN_MS * 0.5 + i * TICK_STAGGER_MS))
  );
  const needleIn = easeOutCubic(enterT(env, NEEDLE_IN_MS, NEEDLE_DELAY_MS));

  ctx.save();
  ctx.globalAlpha = leave;
  ctx.lineWidth = R * TRACK_TUBE * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, rad(-A_START), rad(-A_END));
  ctx.strokeStyle = rgba(THEME.textDim, TRACK_OPACITY * trackIn);
  ctx.stroke();
  let flatStart = scene.min;
  scene.zones.forEach((zn, i) => {
    const live = i === liveZone;
    ctx.beginPath();
    ctx.arc(cx, cy, R, rad(-v2a(flatStart)), rad(-v2a(zn.upTo)));
    ctx.strokeStyle = rgba(TONE_COLORS[zn.tone], ZONE_OPACITY * (zoneIn[i] ?? 0) * (live ? 1 - ZONE_PULSE_GAIN + ZONE_PULSE_GAIN * pulse : 0.78));
    if (live) {
      ctx.shadowColor = rgba(TONE_COLORS[zn.tone], 0.5);
      ctx.shadowBlur = unit * (0.3 + 0.5 * pulse);
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.stroke();
    flatStart = zn.upTo;
  });
  ctx.shadowBlur = 0;
  for (let i = 0; i < MINOR_TICKS; i++) {
    const ti = tickIn[i] ?? 0;
    if (ti <= 0) continue;
    const a = A_START + ((A_END - A_START) * i) / (MINOR_TICKS - 1);
    const from = at(TICK_R - TICK_LEN / 2, a);
    const to = at(TICK_R + TICK_LEN / 2, a);
    ctx.lineWidth = R * TICK_W;
    ctx.lineCap = "butt";
    ctx.strokeStyle = rgba(THEME.textDim, 0.7 * ti);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  const tip = at(NEEDLE_LEN * needleIn, needleAngle);
  ctx.lineWidth = R * NEEDLE_W;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(tip.x, tip.y);
  ctx.strokeStyle = rgba(accent, needleIn);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R * HUB_R, 0, Math.PI * 2);
  ctx.fillStyle = rgba(THEME.panel, trackIn);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, trackIn * 0.8);
  ctx.lineWidth = R * HUB_R * 0.25;
  ctx.stroke();
  ctx.restore();

  // ---- reading markers on the arc --------------------------------------------
  scene.readings.forEach((rd, i) => {
    const markerIn = i < k ? 1 : i === k ? easeOutCubic(clamp01(t * 1.2)) : 0;
    if (markerIn <= 0) return;
    const a = v2a(rd.value);
    const from = at(MARKER_IN_R, a);
    const to = at(MARKER_OUT_R, a);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = unit * 0.16;
    if (i === k) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.5 + 0.4 * pulse);
    }
    ctx.strokeStyle = rgba(accent, (i === k ? 0.95 : 0.4) * markerIn * leave);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  });

  // ---- zone labels -----------------------------------------------------------
  let zoneStart2 = scene.min;
  scene.zones.forEach((zn, i) => {
    if (zn.label) {
      const labelIn = easeOutCubic(enterT(env, CHROME_IN_MS, ZONE_LABEL_DELAY_MS + i * ZONE_STAGGER_MS));
      const lp = radialLabel((v2a(zoneStart2) + v2a(zn.upTo)) / 2);
      const live = i === liveZone;
      ctx.save();
      ctx.globalAlpha = labelIn * leave;
      ctx.font = `700 ${zonePx}px ${FONT_SANS}`;
      ctx.textAlign = lp.align;
      ctx.textBaseline = "middle";
      ctx.fillStyle = rgba(TONE_COLORS[zn.tone], live ? 0.75 + 0.25 * pulse : 0.62);
      ctx.fillText(zn.label, lp.x, lp.y);
      ctx.restore();
    }
    zoneStart2 = zn.upTo;
  });

  // ---- min / max labels ------------------------------------------------------
  const minmaxIn = easeOutCubic(enterT(env, CHROME_IN_MS, MINMAX_DELAY_MS));
  ctx.save();
  ctx.globalAlpha = minmaxIn * leave;
  ctx.font = `600 ${minmaxPx}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.textFaint;
  ctx.textBaseline = "middle";
  // Both ends use the shared radial anchor, so they sit outside the arc at the
  // same offset as every other dial label and align AWAY from it — centring them
  // on the arc ends is what pushed them back over the track.
  const minA = radialLabel(A_START);
  const maxA = radialLabel(A_END);
  ctx.textAlign = minA.align;
  ctx.fillText(fmt(scene.min), minA.x, minA.y);
  ctx.textAlign = maxA.align;
  ctx.fillText(fmt(scene.max), maxA.x, maxA.y);
  ctx.restore();

  // ---- live readout ----------------------------------------------------------
  const readoutIn = easeOutCubic(enterT(env, CHROME_IN_MS, READOUT_DELAY_MS));
  const readoutW = Math.min(regionW * 0.62, R * 1.5);
  const vpx = fitFontSize(ctx, fmt(scene.max), {
    maxW: readoutW,
    startPx: unit * 1.9,
    minPx: unit * 0.9,
    weight: 800,
    family: FONT_MONO,
  });
  ctx.save();
  ctx.globalAlpha = readoutIn * leave;
  ctx.font = `800 ${vpx}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * (0.2 + 0.5 * pulse);
  ctx.fillText(fmt(needleVal), cx, cy + READOUT_R * R);
  ctx.restore();

  // ---- reading label chip ----------------------------------------------------
  const chipY = cy + CHIP_R * R;
  const chipPx = unit * 0.7;
  const drawLabelChip = (label: string, alpha: number) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha * leave;
    ctx.font = `600 ${chipPx}px ${FONT_SANS}`;
    const tw = Math.min(ctx.measureText(label).width, readoutW);
    roundRect(ctx, cx - tw / 2 - unit * 0.45, chipY - unit * 0.6, tw + unit * 0.9, unit * 1.2, unit * 0.34);
    ctx.fillStyle = rgba(THEME.panel, 0.92);
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = unit * 0.06;
    ctx.stroke();
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, chipY);
    ctx.restore();
  };
  if (k >= 0) {
    const chipIn = easeOutCubic(clamp01(t * 3)) * easeOutCubic(enterT(env, CHROME_IN_MS, READOUT_DELAY_MS));
    if (k > 0 && chipIn < 1) drawLabelChip(scene.readings[k - 1].label, 1 - chipIn);
    drawLabelChip(scene.readings[k].label, chipIn);
  }

  // ---- readings legend -------------------------------------------------------
  scene.readings.forEach((rd, i) => {
    const rowIn = easeOutCubic(enterT(env, CHROME_IN_MS, LEGEND_DELAY_MS + i * LEGEND_STAGGER_MS));
    if (rowIn <= 0) return;
    const reached = offset + i <= active;
    const isCurrent = k >= 0 && i === k;
    const rowY = legTop + unit * 0.25 + i * legendRowH + legendRowH / 2;
    ctx.save();
    ctx.globalAlpha = rowIn * leave * (isCurrent ? 1 : reached ? 0.72 : 0.3);
    ctx.textBaseline = "middle";
    const dotR = unit * 0.22 * (isCurrent ? 1 + 0.14 * pulse : 1);
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
    }
    ctx.beginPath();
    ctx.arc(legX + unit * 0.3, rowY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = reached ? accent : THEME.textFaint;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `800 ${unit * 0.88}px ${FONT_MONO}`;
    const vText = fmt(rd.value);
    const vw = ctx.measureText(vText).width;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
    ctx.fillText(vText, legX + legW - vw, rowY);
    const lpx = fitFontSize(ctx, rd.label, {
      maxW: legW - unit * 1.4 - vw,
      startPx: unit * 0.8,
      minPx: unit * 0.52,
      weight: isCurrent ? 700 : 600,
    });
    ctx.font = `${isCurrent ? 700 : 600} ${lpx}px ${FONT_SANS}`;
    ctx.fillText(rd.label, legX + unit * 0.9, rowY);
    ctx.restore();
  });
}

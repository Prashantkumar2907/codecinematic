import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  clamp01,
  sub,
  roundRect,
  shade,
  lerpColor,
  fitFontSize,
  drawSceneTitle,
  drawArrowhead,
  pointAlongPolyline,
  strokePolylineProgress,
  beatT,
  activeBeatIndex,
  rgba,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

type LedgerScene = Extract<Scene, { kind: "ledger" }>;
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };
type Pt = { x: number; y: number };

const COINS = 6;
const COIN_STAGGER = 0.09;
const COIN_SPEED = 1 + (COINS - 1) * COIN_STAGGER;
const SETTLED_ARC_ALPHA = 0.13;
const ARC_SAMPLES = 24;
// Perpendicular bow offset for a transfer's connector curve, capped as a fraction of the
// chord itself. Portrait 3-4 party layouts pack party cards close enough that a fixed
// unit*2 bow can dangle past both cards instead of bowing between them. Capping by chord
// length keeps the curve visually attached regardless of aspect or party count.
const ARC_BOW_UNITS = 2;
const ARC_BOW_MAX_FRAC = 0.55;
// Idle (uninvolved) party card face/edge, matching the shade(THEME.panel, lift) +
// THEME.textDim convention other painters use for an unlit block (e.g. memgrid.ts,
// callstack.ts) instead of a hand-rolled hex.
const IDLE_FACE_LIFT = 0.12;
const IDLE_FACE = shade(THEME.panel, IDLE_FACE_LIFT);
const CHIP_BORDER_UNITS = 0.033;
const CARD_TINT = 0.28;

function transferArc(a: Rect, b: Rect, unit: number): Pt[] {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  let p0: Pt;
  let p1: Pt;
  if (Math.abs(dx) >= Math.abs(dy)) {
    p0 = { x: dx >= 0 ? a.x + a.w : a.x, y: a.cy };
    p1 = { x: dx >= 0 ? b.x : b.x + b.w, y: b.cy };
  } else {
    p0 = { x: a.cx, y: dy >= 0 ? a.y + a.h : a.y };
    p1 = { x: b.cx, y: dy >= 0 ? b.y : b.y + b.h };
  }
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const nx = -(p1.y - p0.y) / len;
  const ny = (p1.x - p0.x) / len;
  const bow = Math.min(unit * ARC_BOW_UNITS, len * ARC_BOW_MAX_FRAC);
  const c: Pt = { x: (p0.x + p1.x) / 2 + nx * bow, y: (p0.y + p1.y) / 2 + ny * bow };
  const pts: Pt[] = [];
  for (let i = 0; i < ARC_SAMPLES; i++) {
    const f = i / (ARC_SAMPLES - 1);
    const mf = 1 - f;
    pts.push({
      x: mf * mf * p0.x + 2 * mf * f * c.x + f * f * p1.x,
      y: mf * mf * p0.y + 2 * mf * f * c.y + f * f * p1.y,
    });
  }
  return pts;
}

function drawChip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, unit: number, alpha: number, color: string) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${unit * 0.66}px ${FONT_MONO}`;
  const tw = ctx.measureText(text).width;
  roundRect(ctx, x - tw / 2 - unit * 0.4, y - unit * 0.55, tw + unit * 0.8, unit * 1.1, unit * 0.32);
  ctx.fillStyle = THEME.bgBottom;
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.6);
  ctx.lineWidth = unit * CHIP_BORDER_UNITS;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + unit * 0.23);
  ctx.textAlign = "start";
  ctx.restore();
}

/**
 * Flat 2D party layout. The removed 3D scatter placed parties at fixed world
 * offsets (2 side-by-side or stacked, 3 as one-far-two-near, 4 as a 2x2 grid)
 * viewed through a tilted camera — no genuine 3D spatial content, just a
 * network of balance cards, so the same qualitative arrangement is reproduced
 * directly in pixel space: one function, no camera, no projection.
 */
function partyCenters(n: number, vertical: boolean, gx0: number, gx1: number, gy0: number, gy1: number): Pt[] {
  const midX = (gx0 + gx1) / 2;
  const midY = (gy0 + gy1) / 2;
  if (n <= 2) {
    if (vertical) return [{ x: midX, y: gy0 }, { x: midX, y: gy1 }];
    return [{ x: gx0, y: midY }, { x: gx1, y: midY }];
  }
  if (n === 3) {
    return [{ x: midX, y: gy0 }, { x: gx0, y: gy1 }, { x: gx1, y: gy1 }];
  }
  return [{ x: gx0, y: gy0 }, { x: gx1, y: gy0 }, { x: gx0, y: gy1 }, { x: gx1, y: gy1 }];
}

export function paintLedger(ctx: CanvasRenderingContext2D, scene: LedgerScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, safeBottom } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.transfers.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;

  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const ah = safeBottom - ay;

  const nParties = scene.parties.length;
  const cw = vertical ? contentW * 0.44 : unit * 6.4;
  const ch = vertical ? unit * 4.0 : unit * 3.6;
  const marginX = cw / 2 + unit * 0.4;
  // The glow-party card's shadowBlur blooms up to unit*1.25 past its own edge and
  // is not clipped by the fill it hangs off, so the bottom row needs that reserved
  // above safeBottom, not just the card's own half-height.
  const marginY = ch / 2 + unit * 1.4;
  const gx0 = ax + marginX;
  const gx1 = ax + aw - marginX;
  const gy0 = ay + marginY;
  const gy1 = ay + ah - marginY;

  const centers = partyCenters(nParties, vertical, gx0, gx1, gy0, gy1);
  const rects = new Map<string, Rect>();
  scene.parties.forEach((party, i) => {
    const c = centers[i];
    rects.set(party.id, { x: c.x - cw / 2, y: c.y - ch / 2, w: cw, h: ch, cx: c.x, cy: c.y });
  });
  const anchorFor = (id: string): Rect | undefined => rects.get(id);

  const wholes = scene.parties.every((p) => Number.isInteger(p.start)) && scene.transfers.every((t) => Number.isInteger(t.amount));
  const u = scene.unit.trim();
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (v: number): string => {
    const sign = v < 0 ? "−" : "";
    const abs = Math.abs(v);
    const text = wholes ? Math.round(abs).toLocaleString(locale) : abs.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (/^[₹$€£]$/.test(u)) return `${sign}${u}${text}`;
    return u ? `${sign}${text} ${u}` : `${sign}${text}`;
  };

  const balances = new Map(scene.parties.map((p) => [p.id, p.start]));
  const pulses: Record<string, number> = {};
  const tints: Record<string, string> = {};
  let glowParty: string | null = null;
  let lastSettled = -1;

  scene.transfers.forEach((tr, k) => {
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0) return;
    const e = easeInOutCubic(sub(t, 0.2, 0.6));
    balances.set(tr.from, (balances.get(tr.from) ?? 0) - tr.amount * e);
    balances.set(tr.to, (balances.get(tr.to) ?? 0) + tr.amount * e);
    if (t >= 1) lastSettled = k;
    if (active === offset + k && t < 1) {
      tints[tr.from] = THEME.danger;
      tints[tr.to] = THEME.good;
      glowParty = tr.to;
      const tt = sub(t, 0.15, 0.65);
      let bump = 0;
      for (let j = 0; j < COINS; j++) {
        const land = (1 + j * COIN_STAGGER) / COIN_SPEED;
        const since = tt - land;
        if (since >= 0 && since <= 0.14) bump = Math.max(bump, Math.sin((Math.PI * since) / 0.14));
      }
      pulses[tr.to] = 1 + 0.02 * easeOutBack(bump);
    }
  });

  let activeArc: { pts: Pt[]; tr: LedgerScene["transfers"][number]; t: number } | null = null;

  scene.transfers.forEach((tr, k) => {
    const a = anchorFor(tr.from);
    const b = anchorFor(tr.to);
    if (!a || !b) return;
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0) return;
    const pts = transferArc(a, b, unit);
    const isActive = active === offset + k && t < 1;
    ctx.save();
    ctx.lineCap = "round";
    if (isActive) {
      activeArc = { pts, tr, t };
      ctx.globalAlpha = 0.3 * leave;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.12;
      strokePolylineProgress(ctx, pts, easeOutCubic(clamp01(t / 0.15)));
    } else {
      ctx.globalAlpha = SETTLED_ARC_ALPHA * leave;
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = unit * 0.12;
      ctx.beginPath();
      pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
      const tip = pts[ARC_SAMPLES - 1];
      const prev = pts[ARC_SAMPLES - 2];
      drawArrowhead(ctx, tip.x, tip.y, Math.atan2(tip.y - prev.y, tip.x - prev.x), unit * 0.4);
      if (k === lastSettled) {
        const f = (env.elapsedMs % 2200) / 2200;
        const dot = pointAlongPolyline(pts, f);
        ctx.globalAlpha = 0.45 * Math.sin(Math.PI * f) * leave;
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.5;
        ctx.fillStyle = THEME.text;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  });

  scene.parties.forEach((party, i) => {
    const r = rects.get(party.id);
    if (!r) return;
    const enter = enterT(env, 350, i * 70);
    if (enter <= 0) return;
    const appear = easeOutCubic(clamp01(enter * 1.5));
    const involved = !!tints[party.id];
    const tint = tints[party.id];
    const pulse = pulses[party.id] ?? 1;
    const bob = Math.sin(env.elapsedMs / 1200 + i * 0.5) * unit * 0.6;

    ctx.save();
    ctx.globalAlpha = appear * leave;
    ctx.translate(r.cx, r.cy - bob);
    ctx.scale(pulse, pulse);
    ctx.translate(-r.cx, -(r.cy - bob));

    // Card, drawn directly in 2D — replaces the removed 3D slab, same idle/tint
    // colour states.
    if (party.id === glowParty) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.9 + 0.35 * Math.sin(env.elapsedMs / 260));
    }
    roundRect(ctx, r.cx - r.w / 2, r.cy - bob - r.h / 2, r.w, r.h, unit * 0.34);
    ctx.fillStyle = involved ? lerpColor(IDLE_FACE, tint, CARD_TINT) : IDLE_FACE;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, r.cx - r.w / 2, r.cy - bob - r.h / 2, r.w, r.h, unit * 0.34);
    ctx.strokeStyle = involved ? rgba(tint, 0.7) : rgba(THEME.textDim, 0.35);
    ctx.lineWidth = unit * (involved ? 0.07 : 0.04);
    ctx.stroke();

    ctx.textAlign = "center";
    const header = party.icon ? `${party.icon} ${party.label}` : party.label;
    const hpx = fitFontSize(ctx, header, { maxW: r.w - unit * 0.7, startPx: unit * 0.82, minPx: unit * 0.55, weight: 700 });
    ctx.font = `700 ${hpx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(header, r.cx, r.cy - bob - unit * 0.2);

    const balText = fmt(balances.get(party.id) ?? party.start);
    const bpx = fitFontSize(ctx, balText, { maxW: r.w - unit * 0.8, startPx: unit * 1.05, minPx: unit * 0.6, weight: 800, family: FONT_MONO });
    ctx.font = `800 ${bpx}px ${FONT_MONO}`;
    ctx.fillStyle = tints[party.id] ?? THEME.text;
    ctx.fillText(balText, r.cx, r.cy - bob + unit * 1.0);
    ctx.textAlign = "start";
    ctx.restore();
  });

  if (activeArc) {
    const { pts, tr, t } = activeArc as { pts: Pt[]; tr: LedgerScene["transfers"][number]; t: number };
    const tt = sub(t, 0.15, 0.65);
    if (tt > 0) {
      ctx.save();
      for (let j = 0; j < COINS; j++) {
        const f = clamp01(tt * COIN_SPEED - j * COIN_STAGGER);
        if (f <= 0 || f >= 1) continue;
        const dot = pointAlongPolyline(pts, f);
        ctx.globalAlpha = Math.sin(Math.PI * f) * leave;
        ctx.fillStyle = accent;
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.7;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    const minusA = easeOutCubic(sub(t, 0.05, 0.1)) * (1 - sub(t, 0.32, 0.16));
    if (minusA > 0) {
      const at = pointAlongPolyline(pts, 0.07);
      drawChip(ctx, at.x, at.y - unit * 0.85, fmt(-tr.amount), unit, minusA * leave, THEME.danger);
    }
    const fc = clamp01(tt * COIN_SPEED - (COIN_STAGGER * (COINS - 1)) / 2);
    if (fc > 0 && fc < 1) {
      const at = pointAlongPolyline(pts, fc);
      const alpha = Math.min(1, fc * 6, (1 - fc) * 6);
      drawChip(ctx, at.x, at.y - unit * 0.85, tr.label ?? `+${fmt(tr.amount)}`, unit, alpha * leave, THEME.good);
    }
  }
  ctx.textAlign = "start";
}

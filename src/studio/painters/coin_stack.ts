import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  rgba,
  clamp01,
  sub,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  enterT,
  idle,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  isoBox3D,
  beatT,
  activeBeatIndex,
  glowRing,
} from "./common";
import type { PaintEnv } from "./index";

type CoinStackScene = Extract<Scene, { kind: "coin_stack" }>;
type Pt = { x: number; y: number };
type Flight = { from?: Pt; to?: Pt; e: number; amount: number; label: string; up: boolean };

/** Established codebase red for a "danger" tone (matches browserframe.ts / geomap.ts). */
const DANGER = "#f87171";
const MIN_COIN_H_UNIT = 0.16;
const MAX_COIN_H_UNIT = 0.85;
// Captions sit in the bottom ~12% of vertical frames; keep stacks above it (see ledger.ts).
const CAPTION_SAFE_Y = 0.88;
const FLIGHT_COINS = 5;
const FLIGHT_STAGGER = 0.12;
// Last flying coin (offset 4*0.12) must still land at flight progress 1.
const FLIGHT_SPEED = 1 + (FLIGHT_COINS - 1) * FLIGHT_STAGGER;

function toneColor(tone: CoinStackScene["stacks"][number]["tone"], accent: string): string {
  switch (tone) {
    case "good":
      return THEME.good;
    case "warn":
      return THEME.warn;
    case "danger":
      return DANGER;
    default:
      return accent;
  }
}

/** Point at fraction f (0-1) along a single quadratic bezier p0->c->p1. */
function quadPoint(p0: Pt, c: Pt, p1: Pt, f: number): Pt {
  const mf = 1 - f;
  return { x: mf * mf * p0.x + 2 * mf * f * c.x + f * f * p1.x, y: mf * mf * p0.y + 2 * mf * f * c.y + f * f * p1.y };
}

/** Peak coin count any single stack ever holds across the whole step timeline —
 *  fixes the px-per-coin scale so bar heights never rescale mid-video. */
function peakCoins(scene: CoinStackScene): number {
  const counts = new Map(scene.stacks.map((s) => [s.id, s.coins]));
  let peak = Math.max(1, ...scene.stacks.map((s) => s.coins));
  scene.steps.forEach((st) => {
    if (st.from) counts.set(st.from, Math.max(0, (counts.get(st.from) ?? 0) - st.amount));
    if (st.to) {
      const v = (counts.get(st.to) ?? 0) + st.amount;
      counts.set(st.to, v);
      peak = Math.max(peak, v);
    }
  });
  return peak;
}

/**
 * Stacks of coins/bullion that grow, shrink, and arc coins to one another as
 * money is added, taxed, redistributed, or drained. Each step moves `amount`
 * coins from an optional source stack to an optional destination stack —
 * omitting `from` reads as new money created (dropped in from above);
 * omitting `to` reads as money leaving the system (rises and fades). Bar
 * height is scaled to the peak count any stack ever reaches so heights never
 * jump mid-video. Works in both aspect ratios: stacks sit in a single row
 * with a shared baseline, which naturally has more headroom in 9:16.
 */
export function paintCoinStack(ctx: CanvasRenderingContext2D, scene: CoinStackScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;

  const u = scene.unit.trim();
  // ₹ amounts group Indian-style (₹23,00,000); other currencies Western (see ledger.ts).
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (v: number): string => {
    const text = Math.round(Math.max(0, v)).toLocaleString(locale);
    if (/^[₹$€£]$/.test(u)) return `${u}${text}`;
    return u ? `${text} ${u}` : text;
  };

  // Geometry: one shared baseline, coins stacking upward, laid in a single row.
  const n = scene.stacks.length;
  const areaY = contentY + band;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const areaH = safeBottom - areaY;
  const labelH = unit * (vertical ? 2.7 : 2.3);
  const topPad = unit * 1.7;
  const baseline = areaY + areaH - labelH;
  const maxStackH = Math.max(baseline - (areaY + topPad), unit * 3);

  const gap = unit * (vertical ? 0.5 : 0.7);
  const stackW = Math.min((contentW - gap * (n - 1)) / n, unit * (vertical ? 3.6 : 4.6));
  const rowW = stackW * n + gap * (n - 1);
  const startX = contentX + (contentW - rowW) / 2;
  const stackCx = (i: number) => startX + i * (stackW + gap) + stackW / 2;

  const peak = peakCoins(scene);
  const coinH = Math.min(Math.max(maxStackH / Math.max(peak, 4), unit * MIN_COIN_H_UNIT), unit * MAX_COIN_H_UNIT);

  const idxOf = new Map(scene.stacks.map((s, i) => [s.id, i] as const));
  const curStep = activeStep >= 0 && activeStep < scene.steps.length ? scene.steps[activeStep] : undefined;
  const curStepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  // Replay steps 0..activeStep fully (past steps settle at e=1); the active
  // step is animated with an eased fraction of its amount.
  const counts = new Map(scene.stacks.map((s) => [s.id, s.coins]));
  let flight: Flight | null = null;
  scene.steps.forEach((st, k) => {
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0) return;
    const isActive = k === activeStep && t < 1;
    const e = isActive ? easeInOutCubic(sub(t, 0.12, 0.7)) : 1;
    if (st.from) counts.set(st.from, Math.max(0, (counts.get(st.from) ?? 0) - st.amount * e));
    if (st.to) counts.set(st.to, (counts.get(st.to) ?? 0) + st.amount * e);
    if (isActive) {
      const fromIdx = st.from ? idxOf.get(st.from) : undefined;
      const toIdx = st.to ? idxOf.get(st.to) : undefined;
      const fromCount = st.from ? counts.get(st.from) ?? 0 : 0;
      const toCount = st.to ? counts.get(st.to) ?? 0 : 0;
      flight = {
        from: fromIdx != null ? { x: stackCx(fromIdx), y: baseline - fromCount * coinH } : undefined,
        to: toIdx != null ? { x: stackCx(toIdx), y: baseline - toCount * coinH } : undefined,
        e,
        amount: st.amount,
        label: st.label ?? (st.from && st.to ? `→${st.amount}` : st.to ? `+${st.amount}` : `−${st.amount}`),
        up: !st.to,
      };
    }
  });

  // Faint persistent connectors hinting which stacks ever exchange coins.
  const pairs = new Set<string>();
  scene.steps.forEach((st) => {
    if (!st.from || !st.to) return;
    const aI = idxOf.get(st.from);
    const bI = idxOf.get(st.to);
    if (aI == null || bI == null) return;
    pairs.add(`${aI}:${bI}`);
  });
  pairs.forEach((key) => {
    const [aI, bI] = key.split(":").map(Number);
    const a = { x: stackCx(aI), y: baseline - (counts.get(scene.stacks[aI].id) ?? 0) * coinH };
    const b = { x: stackCx(bI), y: baseline - (counts.get(scene.stacks[bI].id) ?? 0) * coinH };
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - unit * 1.6 };
    ctx.save();
    ctx.globalAlpha = introIn * 0.12;
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.06;
    ctx.setLineDash([unit * 0.22, unit * 0.22]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mid.x, mid.y, b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  });

  // Stacks: bevelled coin slabs (reusing isoBox3D, the codebase's one depth
  // motif) grown bottom-up, capped at the fixed px-per-coin scale.
  scene.stacks.forEach((stack, i) => {
    const cx = stackCx(i);
    const count = counts.get(stack.id) ?? stack.coins;
    const face = toneColor(stack.tone, accent);
    const isActive = !!curStep && (curStep.from === stack.id || curStep.to === stack.id) && curStepT < 1;
    const enter = enterT(env, 360, i * 70);
    if (enter <= 0) return;
    const popScale = 0.92 + 0.08 * easeOutBack(clamp01(enter));
    const appear = easeOutCubic(clamp01(enter * 1.4));

    ctx.save();
    ctx.globalAlpha = introIn * appear;
    ctx.translate(cx, baseline);
    ctx.scale(popScale, popScale);
    ctx.translate(-cx, -baseline);

    roundRect(ctx, cx - stackW / 2, baseline, stackW, unit * 0.14, unit * 0.06);
    ctx.fillStyle = "rgba(148,163,184,0.25)";
    ctx.fill();

    const height = Math.min(count * coinH, maxStackH);
    const full = Math.floor(height / coinH);
    const frac = clamp01(height / coinH - full);
    for (let k = 0; k < full; k++) {
      const y = baseline - (k + 1) * coinH;
      const isTop = k === full - 1;
      const glow = isActive && isTop ? rgba(accent, 0.65) : isTop ? rgba(accent, 0.05 + 0.08 * idle(env, 2200 + i * 260)) : undefined;
      isoBox3D(ctx, cx - stackW / 2, y, stackW, coinH * 0.92, unit * 0.16, face, glow, coinH * 0.22);
    }
    if (frac > 0.03) {
      const y = baseline - full * coinH - coinH * frac;
      ctx.globalAlpha = introIn * appear * (0.4 + 0.6 * frac);
      isoBox3D(ctx, cx - stackW / 2, y, stackW, coinH * 0.92 * frac, unit * 0.16 * frac, face, undefined, coinH * 0.22 * frac);
      ctx.globalAlpha = introIn * appear;
    }

    if (isActive) glowRing(ctx, cx, baseline - height - unit * 0.3, stackW * 0.32, accent, env, 1400);

    ctx.textAlign = "center";
    const header = stack.icon ? `${stack.icon} ${stack.label}` : stack.label;
    const lpx = fitFontSize(ctx, header, { maxW: stackW + gap * 0.6, startPx: unit * 0.68, minPx: unit * 0.48, weight: 700 });
    ctx.font = `700 ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(header, cx, baseline + unit * 1.05);
    const amt = fmt(count);
    ctx.font = `800 ${unit * (vertical ? 0.78 : 0.7)}px ${FONT_MONO}`;
    ctx.fillStyle = isActive ? accent : THEME.text;
    ctx.fillText(amt, cx, baseline + unit * 1.95);
    ctx.textAlign = "start";
    ctx.restore();
  });

  // Active step: coins fly source->dest (bowed arc), drop in from above (add),
  // or rise and fade (remove) — plus a floating +/- amount chip.
  if (flight) {
    const { from, to, e, amount, label, up } = flight as Flight;
    const spawnY = areaY + topPad * 0.4;
    const p0: Pt = from ?? { x: to?.x ?? contentX + contentW / 2, y: spawnY - unit * 1.2 };
    const p1: Pt = to ?? { x: from?.x ?? contentX + contentW / 2, y: spawnY - unit * 1.6 };
    const midX = (p0.x + p1.x) / 2;
    const control: Pt = { x: midX, y: Math.min(p0.y, p1.y) - (from && to ? unit * 2.2 : unit * 0.6) };
    const flyCount = Math.min(FLIGHT_COINS, Math.max(1, amount));

    ctx.save();
    for (let j = 0; j < flyCount; j++) {
      const f = clamp01(e * FLIGHT_SPEED - j * FLIGHT_STAGGER);
      if (f <= 0 || f >= 1) continue;
      const pos = quadPoint(p0, control, p1, f);
      ctx.globalAlpha = introIn * Math.sin(Math.PI * f);
      ctx.fillStyle = accent;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, unit * 0.26, unit * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const chipAt = quadPoint(p0, control, p1, 0.5);
    const chipAlpha = Math.sin(Math.PI * clamp01(e));
    if (chipAlpha > 0.05) {
      ctx.save();
      ctx.globalAlpha = introIn * chipAlpha;
      ctx.font = `700 ${unit * 0.62}px ${FONT_MONO}`;
      const tw = ctx.measureText(label).width;
      const tone = up ? DANGER : THEME.good;
      roundRect(ctx, chipAt.x - tw / 2 - unit * 0.4, chipAt.y - unit * 1.5, tw + unit * 0.8, unit * 1.05, unit * 0.3);
      ctx.fillStyle = "#0a0e13";
      ctx.fill();
      ctx.strokeStyle = rgba(tone, 0.6);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = tone;
      ctx.textAlign = "center";
      ctx.fillText(label, chipAt.x, chipAt.y - unit * 0.78);
      ctx.textAlign = "start";
      ctx.restore();
    }
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

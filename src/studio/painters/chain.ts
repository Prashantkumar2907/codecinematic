import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  RADIUS,
  STROKE,
  DUR,
  rgba,
  isoBox3D,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  sub,
  clamp01,
  enterT,
  stagger,
  idle,
  wrapText,
  roundRect,
  flowDots,
  drawArrowhead,
  drawSceneTitle,
  strokePolylineProgress,
  beatT,
  beatWindow,
  activeBeatIndex,
} from "./common";
import type { PaintEnv } from "./index";

type ChainScene = Extract<Scene, { kind: "chain" }>;
type Card = { x: number; y: number; w: number; h: number; cx: number; cy: number };
type Pt = { x: number; y: number };

const DEG = Math.PI / 180;

/** Peak tilt while a domino knocks its neighbour, and where it comes to rest. */
const TIP_DEG = 11;
const LEAN_DEG = 4;
/** How far back a domino is tilted when it arrives, before it stands up. */
const ENTER_TILT_DEG = 13;
const WOBBLE_DEG = 0.7;
const WOBBLE_MS = 900;
const TAIL_BREATH_MS = 1900;

/** Beat-fractions: stand-up, knock impulse, settle back to the resting lean. */
const RISE_FRAC = 0.35;
const KNOCK_FRAC = 0.18;
const SETTLE_FRAC = 0.22;
const RING_FROM = 0.3;
const RING_LEN = 0.24;

const GHOST_ALPHA = 0.26;
/** Once the last link lands, a highlight walks the whole chain on a loop so the
 *  closing third of the beat keeps resolving instead of holding a frozen frame. */
const SWEEP_MS = 2600;
const SWEEP_WIDTH = 0.9;
/** Below this multiple of `unit`, a wrapped two-line label beats a shrunken one-liner. */
const ONE_LINE_FLOOR = 0.6;
const PAST_ALPHA = 0.75;
const RELAY_MS = 900;
/** Fraction of the inter-card gap a single card's tilt may sweep, so two leaning
 *  neighbours can never meet. Derived from the measured gap, not guessed. */
const TILT_BUDGET = 0.45;
/** Dots stay inside the middle of a connector so none ever sits on a border. */
const DOT_INSET = 0.16;

/** 9:16 only: the right ~15% is the YouTube action rail, so no card may reach it. */
const RAIL_FRAC = 0.84;

export function paintChain(ctx: CanvasRenderingContext2D, scene: ChainScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, w } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const n = scene.links.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const bandTop = contentY + titleBand;
  const bottomLimit = Math.min(contentY + contentH, layout.safeBottom);
  const availH = Math.max(unit * 4, bottomLimit - bandTop);

  const depth = unit * 0.3;
  const zig = unit * (vertical ? 0.85 : 1.1);
  const minGap = unit * 0.9;
  const rects: Card[] = [];
  /** Clearance between neighbours along the flow axis, and the arm a tilt swings. */
  let gap = minGap;
  let swingArm = unit;

  if (!vertical) {
    const usableW = contentW - depth;
    const cardW = Math.min(unit * 7, (usableW - (n - 1) * minGap) / n);
    const cardH = Math.min(unit * 4.6, availH * 0.42, availH - 2 * zig - depth);
    gap = Math.max(minGap, Math.min(unit * 1.8, (usableW - n * cardW) / Math.max(1, n - 1)));
    const totalW = n * cardW + (n - 1) * gap;
    const startX = contentX + (usableW - totalW) / 2;
    const baseY = bandTop + (availH - depth - cardH) / 2;
    for (let i = 0; i < n; i++) {
      const x = startX + i * (cardW + gap);
      const y = baseY + (i % 2 === 0 ? -1 : 1) * zig;
      rects.push({ x, y, w: cardW, h: cardH, cx: x + cardW / 2, cy: y + cardH / 2 });
    }
    swingArm = cardH;
  } else {
    // Keep the widest card (plus its zig-zag offset and extrusion) clear of the action rail.
    const halfRoom = w * RAIL_FRAC - w / 2 - zig - depth;
    const cardW = Math.min(contentW * 0.66, halfRoom * 2);
    const cardH = Math.min(unit * 4.2, (availH - depth - (n - 1) * minGap) / n);
    gap = Math.max(minGap, Math.min(unit * 1.8, (availH - depth - n * cardH) / Math.max(1, n - 1)));
    const totalH = n * cardH + (n - 1) * gap;
    const baseX = w / 2 - cardW / 2;
    const startY = bandTop + (availH - depth - totalH) / 2;
    for (let i = 0; i < n; i++) {
      const x = baseX + (i % 2 === 0 ? -1 : 1) * zig;
      const y = startY + i * (cardH + gap);
      rects.push({ x, y, w: cardW, h: cardH, cx: x + cardW / 2, cy: y + cardH / 2 });
    }
    swingArm = cardW / 2;
  }

  const tiltCapDeg = Math.asin(clamp01((gap * TILT_BUDGET) / Math.max(swingArm, 1))) / DEG;
  const tipDeg = Math.min(TIP_DEG, tiltCapDeg);
  const leanDeg = Math.min(LEAN_DEG, tiltCapDeg);
  const enterDeg = Math.min(ENTER_TILT_DEG, tiltCapDeg);

  const cardT = (i: number) => beatT(env.beats, offset + i, totalBeats, env.p);
  /** Staggered skeleton reveal so the chain is legible in the first ~500 ms. */
  const ghostT = (i: number) => easeOutCubic(enterT(env, DUR.base, stagger(i, n, DUR.step)));

  /** Which way this domino falls: toward its successor, or inheriting the last direction. */
  const leanSign = (i: number): 1 | -1 => {
    const a = i < n - 1 ? i : Math.max(0, i - 1);
    const b = Math.min(n - 1, a + 1);
    return (Math.sign(rects[b].cx - rects[a].cx) || 1) as 1 | -1;
  };
  /** Horizontal chains tip over a bottom corner; a stacked one pivots on its
   *  bottom centre, halving the arc its wide ends sweep toward a neighbour. */
  const pivotOf = (i: number): Pt => {
    const r = rects[i];
    if (vertical) return { x: r.cx, y: r.y + r.h };
    return { x: leanSign(i) > 0 ? r.x + r.w : r.x, y: r.y + r.h };
  };

  const angleOf = (i: number) => {
    const t = cardT(i);
    if (t <= 0) return 0;
    const lean = leanSign(i);
    let deg = -lean * enterDeg * (1 - easeOutBack(clamp01(t / RISE_FRAC)));
    if (i < n - 1) {
      const t2 = cardT(i + 1);
      if (t2 > 0) {
        const knock =
          t2 <= KNOCK_FRAC
            ? tipDeg * easeInOutCubic(t2 / KNOCK_FRAC)
            : tipDeg + (leanDeg - tipDeg) * easeOutCubic(sub(t2, KNOCK_FRAC, SETTLE_FRAC));
        deg += lean * knock;
      }
    }
    if (active === offset + i && t > 0.5) deg += Math.sin(env.elapsedMs / WOBBLE_MS) * WOBBLE_DEG;
    return deg * DEG;
  };

  const resolved = active >= totalBeats - 1 && cardT(n - 1) >= 0.6;
  const sweepHead = resolved ? ((env.elapsedMs % SWEEP_MS) / SWEEP_MS) * (n + 1) - 0.5 : -n;
  const sweepAt = (i: number) => Math.max(0, 1 - Math.abs(sweepHead - i) / SWEEP_WIDTH);

  const scaleOf = (i: number) => {
    const t = cardT(i);
    if (t <= 0) return 0.9 + 0.06 * ghostT(i);
    return 0.94 + 0.06 * easeOutCubic(clamp01(t / RISE_FRAC));
  };

  /** Same pivot rotate+scale the canvas transform applies, so connectors land on the drawn border. */
  const xform = (pt: Pt, i: number): Pt => {
    const piv = pivotOf(i);
    const s = scaleOf(i);
    const a = angleOf(i);
    const dx = (pt.x - piv.x) * s;
    const dy = (pt.y - piv.y) * s;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    return { x: piv.x + dx * c - dy * sn, y: piv.y + dx * sn + dy * c };
  };

  const edgeToward = (i: number, j: number): Pt => {
    const a = rects[i];
    const b = rects[j];
    if (!vertical) return { x: b.cx > a.cx ? a.x + a.w : a.x, y: a.cy };
    return { x: a.cx, y: b.cy > a.cy ? a.y + a.h : a.y };
  };

  const applyCardTransform = (i: number) => {
    const piv = pivotOf(i);
    const s = scaleOf(i);
    ctx.translate(piv.x, piv.y);
    ctx.rotate(angleOf(i));
    ctx.scale(s, s);
    ctx.translate(-piv.x, -piv.y);
  };

  const drawBadge = (i: number, hot: boolean, grow: number) => {
    const r = rects[i];
    const chipR = unit * 0.42 * (0.72 + 0.28 * grow);
    const chipX = r.x + unit * 0.58;
    const chipY = r.y + unit * 0.58;
    ctx.beginPath();
    ctx.arc(chipX, chipY, chipR, 0, Math.PI * 2);
    ctx.fillStyle = hot ? accent : rgba(THEME.textDim, 0.18);
    ctx.fill();
    ctx.font = `700 ${unit * 0.48}px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = hot ? THEME.bgBottom : THEME.text;
    ctx.fillText(String(i + 1), chipX, chipY + unit * 0.17);
    ctx.textAlign = "start";
  };

  /** Largest type size whose wrapped block fits the card. A one-line label beats a
   *  bigger two-line one down to ONE_LINE_FLOOR; the icon is dropped only as a last resort. */
  const fitLabel = (text: string, icon: string | undefined, card: Card) => {
    const maxW = card.w - unit * 2.1;
    const regionH = card.h - unit * 0.6;
    for (const withIcon of icon ? [true, false] : [false]) {
      const iconPx = withIcon ? Math.min(card.h * 0.26, unit * 1.0) : 0;
      for (const maxLines of [1, withIcon ? 2 : 3]) {
        const floor = maxLines === 1 ? ONE_LINE_FLOOR : 0;
        for (let step = 0; step <= 12; step++) {
          const px = unit * (1.05 - step * 0.05);
          if (px < unit * floor) break;
          ctx.font = `600 ${px}px ${FONT_SANS}`;
          const lines = wrapText(ctx, text, maxW);
          const blockH = iconPx * 1.3 + lines.length * px * 1.25;
          if (lines.length <= maxLines && blockH <= regionH) return { px, lines, iconPx };
        }
      }
    }
    const px = unit * 0.5;
    ctx.font = `600 ${px}px ${FONT_SANS}`;
    return { px, lines: wrapText(ctx, text, maxW).slice(0, 3), iconPx: 0 };
  };

  const appearOf = (i: number) => easeOutCubic(clamp01(cardT(i) / RISE_FRAC));

  // Ghost skeleton: every card that has not fully arrived, so nothing pops in and the
  // outline cross-fades into the solid card instead of blinking out for a frame.
  scene.links.forEach((_link, i) => {
    const gt = ghostT(i);
    const gi = gt * (1 - appearOf(i));
    if (gi <= 0) return;
    const r = rects[i];
    ctx.save();
    applyCardTransform(i);
    ctx.globalAlpha = GHOST_ALPHA * gi;
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * STROKE.thin;
    roundRect(ctx, r.x, r.y, r.w, r.h, unit * RADIUS.md);
    ctx.stroke();
    drawBadge(i, false, gt);
    ctx.restore();
  });

  // Dominoes, back to front so each extrusion sits behind its right-hand neighbour.
  for (let i = n - 1; i >= 0; i--) {
    const t = cardT(i);
    if (t <= 0) continue;
    const link = scene.links[i];
    const r = rects[i];
    const appear = appearOf(i);
    const isActive = active === offset + i;
    const isLast = i === n - 1;
    const lit = isActive || (isLast && inTail);
    const sweep = sweepAt(i);
    const alpha = Math.min(1, (lit ? 1 : active > offset + i ? PAST_ALPHA : 1) + 0.25 * sweep);

    ctx.save();
    ctx.globalAlpha = appear * alpha;
    applyCardTransform(i);

    const breath = isLast && inTail ? idle(env, TAIL_BREATH_MS) : 0;
    const glow = lit ? rgba(accent, 0.55 + 0.35 * breath) : undefined;
    isoBox3D(ctx, r.x, r.y, r.w, r.h, depth, THEME.panel, glow, unit * RADIUS.md);

    if (sweep > 0) {
      ctx.save();
      ctx.strokeStyle = rgba(accent, 0.6 * sweep);
      ctx.lineWidth = unit * STROKE.thin;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5 * sweep;
      roundRect(ctx, r.x, r.y, r.w, r.h, unit * RADIUS.md);
      ctx.stroke();
      ctx.restore();
    }

    drawBadge(i, lit, easeOutBack(clamp01(t / RISE_FRAC)));

    const { px, lines, iconPx } = fitLabel(link.text, link.icon, r);
    const lineH = px * 1.25;
    const blockH = iconPx * 1.3 + lines.length * lineH;
    const top = r.cy - blockH / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = lit ? THEME.text : THEME.textDim;
    if (iconPx > 0 && link.icon) {
      ctx.font = `${iconPx}px ${FONT_SANS}`;
      ctx.fillText(link.icon, r.cx, top + iconPx * 0.95);
    }
    ctx.font = `600 ${px}px ${FONT_SANS}`;
    lines.forEach((line, li) =>
      ctx.fillText(line, r.cx, top + iconPx * 1.3 + px * 0.85 + li * lineH)
    );
    ctx.textAlign = "start";
    ctx.restore();
  }

  // Connectors last: both endpoints ride the same transform as the cards they touch,
  // so the shaft starts on one border and the arrow tip lands exactly on the next.
  for (let k = 1; k < n; k++) {
    const t = cardT(k);
    if (t <= 0) continue;
    const from = xform(edgeToward(k - 1, k), k - 1);
    const to = xform(edgeToward(k, k - 1), k);
    const isCurrent = active === offset + k;
    const head = unit * 0.46;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const shaftEnd = { x: to.x - (dx / len) * head * 0.92, y: to.y - (dy / len) * head * 0.92 };
    const pts = [from, shaftEnd];
    const progress = easeInOutCubic(sub(t, 0.04, 0.3));

    ctx.save();
    ctx.globalAlpha = Math.min(1, (isCurrent ? 0.95 : 0.45) + 0.45 * sweepAt(k - 0.5));
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = unit * STROKE.base;
    ctx.lineCap = "round";
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.4;
    }
    strokePolylineProgress(ctx, pts, progress);
    ctx.shadowBlur = 0;
    if (progress >= 1) drawArrowhead(ctx, to.x, to.y, Math.atan2(dy, dx), head);
    ctx.restore();

    const rt = sub(t, RING_FROM, RING_LEN);
    if (rt > 0 && rt < 1) {
      ctx.save();
      ctx.globalAlpha = (1 - rt) * 0.8;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * STROKE.thin;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
      ctx.beginPath();
      ctx.arc(to.x, to.y, unit * 0.3 + unit * 1.1 * easeOutCubic(rt), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Settled links keep relaying a pulse, so the scene never freezes on its tail.
    if (t >= 1) {
      const a = { x: from.x + dx * DOT_INSET, y: from.y + dy * DOT_INSET };
      const b = { x: to.x - dx * DOT_INSET, y: to.y - dy * DOT_INSET };
      ctx.save();
      ctx.globalAlpha = 0.55;
      flowDots(ctx, [a, b], { elapsedMs: env.elapsedMs + (n - k) * RELAY_MS }, {
        count: 1,
        speedMs: RELAY_MS * n,
        r: unit * 0.12,
        color: accent,
      });
      ctx.restore();
    }
  }

  ctx.textAlign = "start";
}

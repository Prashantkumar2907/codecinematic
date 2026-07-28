import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  clamp01,
  roundRect,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type QueueflowScene = Extract<Scene, { kind: "queueflow" }>;
type Pt = { x: number; y: number };

const DOT_R_UNIT = 0.42;

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function drawDot(ctx: CanvasRenderingContext2D, p: Pt, r: number, fill: string, glow: string | null, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = r * 2.2;
  }
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

export function paintQueueflow(ctx: CanvasRenderingContext2D, scene: QueueflowScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.4;
  const areaX = contentX;
  const areaY = contentY + band;
  const areaW = contentW;
  const areaH = contentH - band;

  const note = activeStep >= 0 ? scene.steps[activeStep].note : undefined;
  const noteBand = note ? unit * 2 : 0;
  const areaTop = areaY + noteBand;
  const areaHH = areaH - noteBand;

  // Geometry: horizontal flow (source left, queue mid, servers right) for long;
  // top->down for vertical shorts.
  const servers = scene.servers;
  const dotR = unit * DOT_R_UNIT;
  const serverGap = unit * 0.6;
  let source: Pt;
  let slot0: Pt;
  let slotVec: Pt;
  let slotGap: number;
  let capacity: number;
  const serverCenters: Pt[] = [];
  let serverSize: number;

  if (!vertical) {
    const midY = areaTop + areaHH / 2;
    serverSize = Math.min((areaHH / servers) * 0.72, unit * 2.6, areaW * 0.16);
    const serversCX = areaX + areaW - serverSize / 2 - unit * 0.3;
    const totalH = servers * serverSize + (servers - 1) * serverGap;
    const startY = midY - totalH / 2 + serverSize / 2;
    for (let i = 0; i < servers; i++) serverCenters.push({ x: serversCX, y: startY + i * (serverSize + serverGap) });
    source = { x: areaX + unit * 1.4, y: midY };
    const railRight = serversCX - serverSize / 2 - unit * 1.2;
    const railLeft = source.x + unit * 1.8;
    slotGap = Math.min(unit * 1.3, Math.max((railRight - railLeft) / 8, unit * 0.9));
    capacity = Math.max(1, Math.floor((railRight - railLeft) / slotGap) + 1);
    slot0 = { x: railRight, y: midY };
    slotVec = { x: -slotGap, y: 0 };
  } else {
    const midX = areaX + areaW / 2;
    serverSize = Math.min((areaW / servers) * 0.72, unit * 2.6, areaHH * 0.16);
    const serverY = areaTop + areaHH - serverSize / 2 - unit * 0.3;
    const totalW = servers * serverSize + (servers - 1) * serverGap;
    const startX = midX - totalW / 2 + serverSize / 2;
    for (let i = 0; i < servers; i++) serverCenters.push({ x: startX + i * (serverSize + serverGap), y: serverY });
    source = { x: midX, y: areaTop + unit * 1.4 };
    const railBottom = serverY - serverSize / 2 - unit * 1.2;
    const railTop = source.y + unit * 1.8;
    slotGap = Math.min(unit * 1.3, Math.max((railBottom - railTop) / 8, unit * 0.9));
    capacity = Math.max(1, Math.floor((railBottom - railTop) / slotGap) + 1);
    slot0 = { x: midX, y: railBottom };
    slotVec = { x: 0, y: -slotGap };
  }
  const slotPos = (i: number): Pt => ({ x: slot0.x + slotVec.x * i, y: slot0.y + slotVec.y * i });

  // Replay completed steps for the carried queue length.
  let queueBefore = 0;
  for (let k = 0; k < activeStep; k++) {
    const s = scene.steps[k];
    const served = Math.min(s.serve, queueBefore + s.arrive);
    queueBefore = Math.max(0, queueBefore + s.arrive - served);
  }
  const step = activeStep >= 0 ? scene.steps[activeStep] : { arrive: 0, serve: 0 };
  const arriveN = step.arrive;
  const serveN = Math.min(step.serve, queueBefore + arriveN);
  const bt = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  const arriveDur = 0.28;
  const serveGlide = 0.34;
  const pa = (a: number) => clamp01((bt - (arriveN > 0 ? (a / arriveN) * 0.32 : 0)) / arriveDur);
  const ps = (s: number) => clamp01((bt - (0.42 + (serveN > 0 ? (s / serveN) * 0.32 : 0))) / serveGlide);

  let arrivalsLanded = 0;
  for (let a = 0; a < arriveN; a++) if (pa(a) >= 1) arrivalsLanded++;
  let servicesStarted = 0;
  let headShift = 0;
  for (let s = 0; s < serveN; s++) {
    const p = ps(s);
    if (p > 0) servicesStarted++;
    headShift += easeInOutCubic(clamp01(p / 0.5));
  }
  const queueCount = Math.max(0, queueBefore + arrivalsLanded - servicesStarted);

  // Ghost slot rail.
  ctx.save();
  ctx.globalAlpha = 0.14 * introIn;
  ctx.strokeStyle = "rgba(148,163,184,0.9)";
  ctx.lineWidth = unit * 0.05;
  ctx.setLineDash([unit * 0.24, unit * 0.2]);
  for (let i = 0; i < capacity; i++) {
    const p = slotPos(i);
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR * 1.15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  // Source spawn point with idle pulse.
  const pulse = 0.5 + 0.5 * Math.sin(env.elapsedMs / 700);
  ctx.save();
  ctx.globalAlpha = introIn * (0.25 + 0.25 * pulse);
  ctx.strokeStyle = accent;
  ctx.lineWidth = unit * 0.06;
  ctx.beginPath();
  ctx.arc(source.x, source.y, unit * (0.7 + 0.4 * pulse), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  drawDot(ctx, source, unit * 0.55, "#0e2433", accentGlow, introIn);
  ctx.save();
  ctx.globalAlpha = introIn;
  ctx.strokeStyle = accent;
  ctx.lineWidth = unit * 0.08;
  ctx.beginPath();
  ctx.arc(source.x, source.y, unit * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Servers.
  serverCenters.forEach((c, si) => {
    const busy = (() => {
      for (let s = 0; s < serveN; s++) if (s % servers === si) { const p = ps(s); if (p > 0 && p < 0.85) return true; }
      return false;
    })();
    const half = serverSize / 2;
    ctx.save();
    ctx.globalAlpha = introIn;
    if (busy) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9;
    }
    roundRect(ctx, c.x - half, c.y - half, serverSize, serverSize, unit * 0.4);
    ctx.fillStyle = busy ? rgba(accent, 0.16) : THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, c.x - half, c.y - half, serverSize, serverSize, unit * 0.4);
    ctx.strokeStyle = busy ? accent : "rgba(148,163,184,0.4)";
    ctx.lineWidth = busy ? unit * 0.11 : unit * 0.06;
    ctx.stroke();
    // Spinner arc (rotates while busy; static tick when idle).
    const ang = busy ? (env.elapsedMs / 500) * Math.PI * 2 + si : 0;
    ctx.strokeStyle = busy ? accent : "rgba(148,163,184,0.35)";
    ctx.lineWidth = unit * 0.14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(c.x, c.y, serverSize * 0.28, ang, ang + Math.PI * 1.3);
    ctx.stroke();
    ctx.restore();
  });

  // Resident queued dots (packed; head consumed slots omitted so the queue
  // shortens from the head without repack snaps).
  const tail = queueBefore + arriveN - 1;
  let drawn = 0;
  let overflow = 0;
  for (let j = 0; j <= tail; j++) {
    const exists = j < queueBefore ? true : pa(j - queueBefore) >= 1;
    if (!exists) continue;
    const stillQueued = j < serveN ? ps(j) <= 0 : true;
    if (!stillQueued) continue;
    const rSlot = j - headShift;
    if (rSlot > capacity - 0.5) {
      overflow++;
      continue;
    }
    const p = slotPos(rSlot);
    const bob = unit * 0.06 * Math.sin(env.elapsedMs / 500 + j);
    drawDot(ctx, { x: p.x, y: p.y + bob }, dotR, accent, null, introIn);
    drawn++;
  }

  // Served dots gliding head -> server -> fade past.
  for (let s = 0; s < serveN; s++) {
    const p = ps(s);
    if (p <= 0) continue;
    const si = s % servers;
    const c = serverCenters[si];
    const head = slotPos(0);
    let pos: Pt;
    let alpha = 1;
    if (p <= 0.7) {
      pos = lerp(head, c, easeInOutCubic(clamp01(p / 0.7)));
    } else {
      const dp = (p - 0.7) / 0.3;
      // Depart just beyond the server, fading out ("done").
      const beyond = { x: c.x + (c.x - head.x) * 0.12, y: c.y + (c.y - head.y) * 0.12 };
      pos = lerp(c, beyond, dp);
      alpha = 1 - dp;
    }
    const fade = p > 0.7 ? THEME.textDim : accent;
    drawDot(ctx, pos, dotR, fade, p <= 0.7 ? accentGlow : null, introIn * alpha);
  }

  // Arriving dots flying source -> tail slot.
  for (let a = 0; a < arriveN; a++) {
    const p = pa(a);
    if (p <= 0 || p >= 1) continue;
    const target = slotPos(Math.min(queueBefore + a - headShift, capacity - 1));
    const pos = lerp(source, target, easeOutCubic(p));
    drawDot(ctx, pos, dotR, accent, accentGlow, introIn);
  }

  // Queue length chip.
  const chipText = `queue: ${queueCount}`;
  ctx.save();
  ctx.globalAlpha = introIn;
  ctx.font = `700 ${unit * 0.68}px ${FONT_MONO}`;
  const tw = ctx.measureText(chipText).width;
  const cx = vertical ? areaX + areaW - tw - unit * 1.2 : slot0.x + slotVec.x * (Math.min(capacity, 3) + 1);
  const cy = vertical ? areaTop + unit * 0.3 : slot0.y - (areaHH / 2) * 0.72;
  roundRect(ctx, cx - unit * 0.4, cy - unit * 0.6, tw + unit * 0.8, unit * 1.2, unit * 0.3);
  ctx.fillStyle = "#0e2433";
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "start";
  ctx.fillText(chipText, cx, cy + unit * 0.24);
  ctx.restore();

  // Overflow / backpressure chip beyond the last visible slot.
  if (overflow > 0) {
    const p = slotPos(capacity - 1);
    const ox = p.x + slotVec.x * 0.9;
    const oy = p.y + slotVec.y * 0.9;
    ctx.save();
    ctx.globalAlpha = introIn;
    ctx.font = `800 ${unit * 0.6}px ${FONT_MONO}`;
    const t = `+${overflow}`;
    const w = ctx.measureText(t).width + unit * 0.6;
    roundRect(ctx, ox - w / 2, oy - unit * 0.5, w, unit * 1.0, unit * 0.25);
    ctx.fillStyle = rgba(THEME.warn, 0.2);
    ctx.fill();
    ctx.strokeStyle = THEME.warn;
    ctx.lineWidth = unit * 0.05;
    ctx.stroke();
    ctx.fillStyle = THEME.warn;
    ctx.textAlign = "center";
    ctx.fillText(t, ox, oy + unit * 0.22);
    ctx.textAlign = "start";
    ctx.restore();
  }

  // Note chip above the scene.
  if (note) {
    ctx.save();
    ctx.globalAlpha = introIn;
    ctx.font = `700 ${unit * 0.72}px ${FONT_SANS}`;
    const tw2 = ctx.measureText(note).width;
    const nx = areaX + areaW / 2;
    const ny = areaY + unit * 0.5;
    roundRect(ctx, nx - tw2 / 2 - unit * 0.6, ny, tw2 + unit * 1.2, unit * 1.3, unit * 0.35);
    ctx.fillStyle = rgba(accent, 0.14);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText(note, nx, ny + unit * 0.9);
    ctx.textAlign = "start";
    ctx.restore();
  }
  ctx.textAlign = "start";
}

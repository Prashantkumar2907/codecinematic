import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  GLOW,
  RADIUS,
  STROKE,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  clamp01,
  enterT,
  idle,
  lerpColor,
  shade,
  rgba,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  stagger,
} from "./common";
import type { PaintEnv } from "./index";

type JsEventLoopScene = Extract<Scene, { kind: "js_event_loop" }>;
type Step = JsEventLoopScene["steps"][number];
type Chip = { label: string; via?: string };
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };
type State = { stack: Chip[]; micro: Chip[]; macro: Chip[]; refused: boolean; painted: boolean };

const GHOST_A = 0.5;
const IDLE_FACE_LIFT = 0.09;
const CHIP_TINT = 0.26;
const FRAME_TINT = 0.16;
const LANE_A = 0.05;
const PULSE_MS = 1600;
/** Cap so a deep stack or a long queue never squeezes its own labels to nothing. */
const FRAME_MAX_UNITS = 2.6;
const CHIP_MAX_UNITS = 5.0;
const MIN_SLOTS = 3;

function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/**
 * Replay steps 0..upto to get the machine's state. `takeMacro` is REFUSED while the
 * microtask queue still has anything in it — that is the whole rule this kind exists to
 * teach, so it is enforced here rather than trusted to the script.
 */
function replay(scene: JsEventLoopScene, upto: number): State {
  const st: State = { stack: [], micro: [], macro: [], refused: false, painted: false };
  for (let k = 0; k <= upto && k < scene.steps.length; k++) {
    const s = scene.steps[k];
    st.refused = false;
    st.painted = false;
    switch (s.op) {
      case "push":
        st.stack.push({ label: s.label ?? "fn()" });
        break;
      case "pop":
        st.stack.pop();
        break;
      case "enqueue":
        (s.queue === "macro" ? st.macro : st.micro).push({ label: s.label ?? "callback", via: s.via });
        break;
      case "drainMicro":
        // Every microtask runs, in order, before the loop looks anywhere else.
        st.micro = [];
        break;
      case "takeMacro":
        if (st.micro.length > 0) st.refused = true;
        else st.macro.shift();
        break;
      case "render":
        st.painted = true;
        break;
    }
  }
  return st;
}

const PHASE: Record<Step["op"], string> = {
  push: "call stack",
  pop: "call stack",
  enqueue: "queued",
  drainMicro: "drain ALL microtasks",
  takeMacro: "take ONE macrotask",
  render: "render",
};

/**
 * The JS event loop as a machine: a call stack, a microtask queue, a macrotask queue, and
 * the rule that connects them — the stack must empty, then EVERY microtask runs, and only
 * then does one macrotask get picked up. That ordering is what makes `Promise.then` beat
 * `setTimeout(…, 0)`, and it is the one thing the asyncio-style `event_loop` kind cannot
 * express, because it has no queues in it.
 *
 * Deliberately 2D. Every region is a pixel rect and every chip is drawn where its rect
 * says — no camera, so none of the `2d-layout-round-tripped-through-camera` failure modes
 * that this kind's fourteen predecessors were all fixed for can apply here.
 */
export function paintJsEventLoop(ctx: CanvasRenderingContext2D, scene: JsEventLoopScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  /**
   * The four regions enter on a cascade, not all on one tick. `stagger` is the shared
   * helper row 9.0 added for exactly this and that no painter had used yet; the rubric's
   * motion axis asks for siblings on a small offset rather than simultaneous.
   */
  const REGION_COUNT = 4;
  const regionIn = (i: number) => easeOutCubic(enterT(env, 420, stagger(i, REGION_COUNT)));
  const introIn = regionIn(REGION_COUNT - 1);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const top = contentY + band;
  const availH = Math.max(unit * 8, safeBottom - top);

  // Slot counts come from the WHOLE scene, so a lane never resizes between beats.
  let maxStack = MIN_SLOTS;
  let maxMicro = MIN_SLOTS;
  let maxMacro = MIN_SLOTS;
  for (let k = 0; k < scene.steps.length; k++) {
    const s = replay(scene, k);
    maxStack = Math.max(maxStack, s.stack.length);
    maxMicro = Math.max(maxMicro, s.micro.length);
    maxMacro = Math.max(maxMacro, s.macro.length);
  }

  /**
   * Region heights come from their CONTENT, then the whole group is centred in the band.
   * Splitting the band proportionally instead left each lane about twice the height of the
   * chips inside it, with the chips floating in the middle of an empty box.
   */
  const gap = unit * 0.5;
  const labelPx = unit * (vertical ? 0.6 : 0.56);
  const headerH = labelPx * 1.9;
  const rowPad = unit * 0.34;
  let frameH = unit * FRAME_MAX_UNITS;
  let chipH = unit * 2.6;
  const apiH = headerH + unit * 2.2;

  // Solve for the scale factor exactly rather than approximating it: only the frames and
  // chips scale, so `fixed + scalable * fit = availH` has one answer. Scaling the whole
  // group instead let it overrun safeBottom by a few px, because the headers, gaps and
  // paddings counted toward the estimate but do not actually grow.
  const scalable = vertical ? maxStack * frameH + chipH * 2 : Math.max(maxStack * frameH, chipH * 2);
  const fixed = vertical
    ? headerH * 4 + rowPad * 5 + apiH + gap * 3
    : Math.max(headerH + rowPad, headerH * 3 + rowPad * 4 + apiH + gap * 2);
  const fit = Math.max(0.5, Math.min(1.5, (availH - fixed) / Math.max(1, scalable)));
  frameH *= fit;
  chipH *= fit;
  const hStack = headerH + maxStack * frameH + rowPad;
  const hLane = headerH + chipH + rowPad * 2;
  const hApi = apiH * Math.min(1, fit);

  let stackR: Rect;
  let apiR: Rect;
  let microR: Rect;
  let macroR: Rect;
  if (vertical) {
    const total = hStack + hApi + hLane * 2 + gap * 3;
    let y = top + Math.max(0, (availH - total) / 2);
    stackR = rect(contentX, y, contentW, hStack);
    y += hStack + gap;
    apiR = rect(contentX, y, contentW, hApi);
    y += hApi + gap;
    microR = rect(contentX, y, contentW, hLane);
    y += hLane + gap;
    macroR = rect(contentX, y, contentW, hLane);
  } else {
    const wStack = contentW * 0.32;
    const wRight = contentW - wStack - gap;
    const rx = contentX + wStack + gap;
    const rightH = hApi + hLane * 2 + gap * 2;
    const total = Math.max(hStack, rightH);
    const y0 = top + Math.max(0, (availH - total) / 2);
    stackR = rect(contentX, y0 + Math.max(0, (total - hStack) / 2), wStack, hStack);
    let y = y0 + Math.max(0, (total - rightH) / 2);
    apiR = rect(rx, y, wRight, hApi);
    y += hApi + gap;
    microR = rect(rx, y, wRight, hLane);
    y += hLane + gap;
    macroR = rect(rx, y, wRight, hLane);
  }

  const frameW = Math.min(stackR.w - unit * 1.0, unit * 9);
  const frameX = stackR.cx - frameW / 2;
  const stackFloor = stackR.y + stackR.h - unit * 0.2;
  /** Pixel rect of stack level `i` (0 = bottom of the stack). */
  const frameRect = (i: number) => rect(frameX, stackFloor - (i + 1) * frameH, frameW, frameH - unit * 0.12);

  const laneOf = (r: Rect, n: number) => {
    const inner = rect(r.x, r.y + headerH, r.w, Math.max(unit, r.h - headerH));
    const chipW = Math.min((inner.w - unit * 0.4) / Math.max(n, 1), unit * CHIP_MAX_UNITS);
    return { inner, chipW, chipH: Math.min(inner.h - rowPad, chipH) };
  };
  const microLane = laneOf(microR, maxMicro);
  const macroLane = laneOf(macroR, maxMacro);
  /** Pixel rect of slot `i` in a queue lane, head at the LEFT (it is a FIFO). */
  const slotRect = (lane: ReturnType<typeof laneOf>, i: number) =>
    rect(lane.inner.x + unit * 0.2 + i * lane.chipW, lane.inner.cy - lane.chipH / 2, lane.chipW - unit * 0.16, lane.chipH);

  const now = replay(scene, activeStep);
  const prev = replay(scene, activeStep - 1);
  const step = activeStep >= 0 && activeStep < scene.steps.length ? scene.steps[activeStep] : undefined;
  const t = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  const microFace = lerpColor(THEME.panel, accent, CHIP_TINT);
  const macroFace = lerpColor(THEME.panel, secondary, CHIP_TINT);
  const frameFace = lerpColor(THEME.panel, accent, FRAME_TINT);
  const idleFace = shade(THEME.panel, IDLE_FACE_LIFT);

  const drawRegion = (r: Rect, title: string, tone: string, appear: number, sub?: string) => {
    ctx.save();
    ctx.globalAlpha = appear;
    roundRect(ctx, r.x, r.y, r.w, r.h, unit * RADIUS.md);
    ctx.fillStyle = rgba(tone, LANE_A);
    ctx.fill();
    roundRect(ctx, r.x, r.y, r.w, r.h, unit * RADIUS.md);
    ctx.strokeStyle = rgba(tone, 0.3);
    ctx.lineWidth = unit * STROKE.thin;
    ctx.stroke();
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = rgba(tone, 0.95);
    ctx.fillText(title, r.x + unit * 0.45, r.y + labelPx * 1.25);
    if (sub) {
      ctx.font = `500 ${labelPx * 0.85}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.textDim;
      const tw = ctx.measureText(sub).width;
      ctx.fillText(sub, r.x + r.w - unit * 0.45 - tw, r.y + labelPx * 1.22);
    }
    ctx.restore();
  };

  drawRegion(stackR, "call stack", accent, regionIn(0), "LIFO");
  drawRegion(apiR, "web APIs / timers", THEME.textDim, regionIn(1));
  drawRegion(microR, "microtask queue", accent, regionIn(2), "promises");
  drawRegion(macroR, "macrotask queue", secondary, regionIn(3), "timers, events");

  /** Empty slot outlines, so the shape of each lane is readable from frame one. */
  const drawSlots = (lane: ReturnType<typeof laneOf>, n: number, tone: string, appear: number) => {
    ctx.save();
    ctx.globalAlpha = appear * 0.25;
    ctx.strokeStyle = rgba(tone, 0.5);
    ctx.lineWidth = unit * STROKE.hair;
    ctx.setLineDash([unit * 0.22, unit * 0.2]);
    for (let i = 0; i < n; i++) {
      const s = slotRect(lane, i);
      roundRect(ctx, s.x, s.y, s.w, s.h, unit * RADIUS.sm);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  };
  drawSlots(microLane, maxMicro, accent, regionIn(2));
  drawSlots(macroLane, maxMacro, secondary, regionIn(3));

  ctx.save();
  ctx.globalAlpha = regionIn(0) * GHOST_A;
  ctx.strokeStyle = rgba(THEME.textDim, 0.4);
  ctx.lineWidth = unit * STROKE.hair;
  ctx.setLineDash([unit * 0.2, unit * 0.2]);
  for (let i = 0; i < maxStack; i++) {
    const f = frameRect(i);
    roundRect(ctx, f.x, f.y, f.w, f.h, unit * RADIUS.sm);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  const drawChip = (r: Rect, chip: Chip, face: string, edge: string, hot: boolean, alpha = 1, appear = introIn) => {
    ctx.save();
    ctx.globalAlpha = appear * alpha;
    if (hot) {
      ctx.shadowColor = edge === accent ? accentGlow : secondaryGlow;
      ctx.shadowBlur = unit * GLOW.base * (0.7 + 0.3 * idle(env, PULSE_MS));
    }
    roundRect(ctx, r.x, r.y, r.w, r.h, unit * RADIUS.sm);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    roundRect(ctx, r.x, r.y, r.w, r.h, unit * RADIUS.sm);
    ctx.strokeStyle = rgba(edge, hot ? 0.95 : 0.5);
    ctx.lineWidth = unit * (hot ? STROKE.base : STROKE.thin);
    ctx.stroke();

    const hasVia = !!chip.via;
    const px = fitFontSize(ctx, chip.label, {
      maxW: r.w - unit * 0.4,
      startPx: unit * 0.68,
      minPx: unit * 0.44,
      weight: 700,
      family: FONT_MONO,
    });
    ctx.font = `700 ${px}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText(chip.label, r.cx, r.cy + (hasVia ? -px * 0.1 : px * 0.34));
    if (hasVia) {
      const vpx = px * 0.78;
      ctx.font = `500 ${vpx}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(chip.via!, r.cx, r.cy + px * 0.95);
    }
    ctx.textAlign = "start";
    ctx.restore();
  };

  const lerpRect = (a: Rect, b: Rect, f: number): Rect =>
    rect(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.w + (b.w - a.w) * f, a.h + (b.h - a.h) * f);

  // ── call stack ────────────────────────────────────────────────────────────
  const pushing = step?.op === "push";
  const popping = step?.op === "pop";
  now.stack.forEach((frame, i) => {
    const isTop = i === now.stack.length - 1;
    const f = frameRect(i);
    if (pushing && isTop) {
      // Drops in from above rather than appearing: the eye should see it arrive.
      const e = easeOutBack(clamp01(t / 0.5));
      const from = rect(f.x, f.y - frameH * 1.6, f.w, f.h);
      drawChip(lerpRect(from, f, e), frame, frameFace, accent, true, clamp01(t * 3), regionIn(0));
    } else {
      drawChip(f, frame, isTop ? frameFace : idleFace, isTop ? accent : THEME.textDim, isTop && !popping, 1, regionIn(0));
    }
  });
  if (popping && prev.stack.length > now.stack.length) {
    // The frame that just left, on its way out. Nothing else in this painter
    // accumulates — every departure is drawn leaving.
    const e = easeOutCubic(clamp01(t / 0.55));
    const f = frameRect(prev.stack.length - 1);
    const to = rect(f.x, f.y - frameH * 1.8, f.w, f.h);
    drawChip(lerpRect(f, to, e), prev.stack[prev.stack.length - 1], frameFace, accent, false, 1 - e, regionIn(0));
  }

  // ── the arriving callback, from the web-API lane into its queue ────────────
  const enqueuing = step?.op === "enqueue";
  const apiSlot = rect(apiR.cx - microLane.chipW / 2, apiR.cy - microLane.chipH / 2, microLane.chipW - unit * 0.16, Math.min(microLane.chipH, apiR.h - unit * 0.3));

  // ── queues ────────────────────────────────────────────────────────────────
  const drawQueue = (
    chips: Chip[],
    lane: ReturnType<typeof laneOf>,
    face: string,
    edge: string,
    isMicro: boolean
  ) => {
    chips.forEach((chip, i) => {
      const target = slotRect(lane, i);
      const isNewest = enqueuing && i === chips.length - 1 && (step?.queue === "macro") !== isMicro;
      const appear = regionIn(isMicro ? 2 : 3);
      if (isNewest) {
        const e = easeInOutCubic(clamp01(t / 0.6));
        drawChip(lerpRect(apiSlot, target, e), chip, face, edge, true, clamp01(t * 3), appear);
      } else {
        drawChip(target, chip, face, edge, false, 1, appear);
      }
    });
  };
  drawQueue(now.micro, microLane, microFace, accent, true);
  drawQueue(now.macro, macroLane, macroFace, secondary, false);

  // Departures: microtasks drain one at a time WITHIN this one beat, so the viewer sees
  // that all of them go before anything else does.
  if (step?.op === "drainMicro" && prev.micro.length > 0) {
    const n = prev.micro.length;
    prev.micro.forEach((chip, i) => {
      const from = slotRect(microLane, i);
      const to = frameRect(now.stack.length);
      const startF = i / n;
      const e = easeInOutCubic(clamp01((t - startF) / (1 / n)));
      if (e <= 0) drawChip(from, chip, microFace, accent, i === 0, 1, regionIn(2));
      else if (e < 1) drawChip(lerpRect(from, to, e), chip, microFace, accent, true, 1 - e * 0.25, regionIn(2));
    });
  }
  if (step?.op === "takeMacro" && !now.refused && prev.macro.length > now.macro.length) {
    const e = easeInOutCubic(clamp01(t / 0.65));
    const from = slotRect(macroLane, 0);
    const to = frameRect(now.stack.length);
    drawChip(lerpRect(from, to, e), prev.macro[0], macroFace, secondary, true, 1 - e * 0.2, regionIn(3));
  }

  // ── the loop's own verdict ────────────────────────────────────────────────
  const phase = step ? PHASE[step.op] : undefined;
  // Inside the web-API lane, not in the gap under it: the caption is the loop's running
  // commentary and it belongs in the box that has room for it.
  const captionY = apiR.y + headerH + (apiR.h - headerH) * 0.42;
  if (now.refused) {
    // A takeMacro that the rule forbids. Refusing it visibly IS the lesson.
    const text = "microtasks first";
    ctx.save();
    ctx.globalAlpha = introIn * easeOutCubic(clamp01(t * 3));
    ctx.font = `800 ${unit * 0.66}px ${FONT_SANS}`;
    const tw = ctx.measureText(text).width;
    const bx = macroR.cx - tw / 2 - unit * 0.5;
    const by = macroR.y - unit * 0.55;
    ctx.shadowColor = rgba(THEME.warn, 0.6);
    ctx.shadowBlur = unit * GLOW.base;
    roundRect(ctx, bx, by, tw + unit, unit * 1.1, unit * RADIUS.sm);
    ctx.fillStyle = lerpColor(THEME.panel, THEME.warn, 0.22);
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, bx, by, tw + unit, unit * 1.1, unit * RADIUS.sm);
    ctx.strokeStyle = THEME.warn;
    ctx.lineWidth = unit * STROKE.base;
    ctx.stroke();
    ctx.fillStyle = THEME.warn;
    ctx.textAlign = "center";
    ctx.fillText(text, macroR.cx, by + unit * 0.78);
    ctx.textAlign = "start";
    ctx.restore();
  }
  if (now.painted) {
    // The paint step: a sweep across the frame, which is the only moment the user sees
    // anything change on screen.
    const e = easeInOutCubic(clamp01(t / 0.8));
    ctx.save();
    ctx.globalAlpha = introIn * (1 - Math.abs(e - 0.5) * 1.4);
    const sweepW = unit * 2.2;
    const gx = contentX + (contentW + sweepW) * e - sweepW;
    const g = ctx.createLinearGradient(gx, 0, gx + sweepW, 0);
    g.addColorStop(0, rgba(THEME.good, 0));
    g.addColorStop(0.5, rgba(THEME.good, 0.5));
    g.addColorStop(1, rgba(THEME.good, 0));
    ctx.fillStyle = g;
    ctx.fillRect(gx, top, sweepW, availH);
    ctx.restore();
  }

  const note = step?.note;
  if (phase || note) {
    ctx.save();
    ctx.globalAlpha = introIn * easeOutCubic(clamp01(t * 2.5));
    ctx.textAlign = "center";
    if (phase) {
      ctx.font = `800 ${unit * 0.62}px ${FONT_SANS}`;
      ctx.fillStyle = now.refused ? THEME.warn : now.painted ? THEME.good : THEME.text;
      ctx.fillText(phase, apiR.cx, captionY);
    }
    if (note) {
      ctx.font = `500 ${unit * 0.56}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(note, apiR.cx, captionY + unit * 0.8);
    }
    ctx.textAlign = "start";
    ctx.restore();
  }
  ctx.textAlign = "start";
}

import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  beatWindow,
  activeBeatIndex,
  drawArrowhead,
  strokePolylineProgress,
  flowDots,
  isoBox3D,
  rgba,
  hashStr,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type HeapScene = Extract<Scene, { kind: "object_heap" }>;
type Pt = { x: number; y: number };

/** Bindings/links/collections as of (and including) step index `upto`; -1 = nothing has run yet.
 *  A single replay function (mirrors dp_table_fill's cumulative-write pattern) is the one source
 *  of truth for "what does the heap look like right now" — refcounts, arrows and GC status are
 *  all derived from it so they can never disagree with each other. */
function stateAt(scene: HeapScene, upto: number) {
  const bindings = new Map<string, string | null>(scene.vars.map((v) => [v.id, null]));
  const links = new Set<string>();
  const collected = new Set<string>();
  for (let k = 0; k <= upto && k < scene.steps.length; k++) {
    const st = scene.steps[k];
    if (st.bind) bindings.set(st.bind.name, st.bind.obj);
    if (st.link) links.add(`${st.link.from}->${st.link.to}`);
    if (st.unlink) links.delete(`${st.unlink.from}->${st.unlink.to}`);
    st.collect.forEach((id) => collected.add(id));
  }
  return { bindings, links, collected };
}

/** Live reference count = names pointing at it + still-alive objects linking into it.
 *  A cycle of two collected-but-mutually-linked objects must NOT keep each other's count
 *  above zero once both are in `collected` — otherwise a reference cycle could never be
 *  shown as reclaimed by a cycle-collector `collect` step. */
function refcount(objId: string, s: ReturnType<typeof stateAt>): number {
  let n = 0;
  s.bindings.forEach((v) => { if (v === objId) n++; });
  s.links.forEach((edge) => {
    const [from, to] = edge.split("->");
    if (to === objId && !s.collected.has(from)) n++;
  });
  return n;
}

/** Step index that first mentions an object — its reveal moment (diagram.ts pattern). */
function firstStepOf(scene: HeapScene, objId: string): number {
  for (let k = 0; k < scene.steps.length; k++) {
    const st = scene.steps[k];
    if (st.bind?.obj === objId || st.link?.from === objId || st.link?.to === objId || st.mutate === objId || st.collect.includes(objId))
      return k;
  }
  return 0;
}

/** Quadratic bow between two anchors sampled to a polyline, offset perpendicular by a
 *  hash-stable (not time-based — determinism) amount so parallel name->object arrows fan
 *  out instead of stacking illegibly. */
function bow(a: Pt, b: Pt, seed: string, spread: number): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const side = (hashStr(seed) % 2 === 0 ? 1 : -1) * (0.3 + (hashStr(seed + "x") % 60) / 100);
  const off = spread * side;
  const mx = (a.x + b.x) / 2 - (dy / len) * off;
  const my = (a.y + b.y) / 2 + (dx / len) * off;
  const N = 16;
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * mx + t * t * b.x, y: u * u * a.y + 2 * u * t * my + t * t * b.y });
  }
  return pts;
}

/**
 * Variables as flat "stack" name tags on one side, heap objects as extruded 3-D cards on
 * the other — the flat-vs-block shape difference itself teaches stack-vs-heap. Arrows point
 * from names to the object they currently reference; live refcount pills tick as bindings and
 * inter-object links change; a mutate step flashes the target AND every arrow feeding it (the
 * aliasing-bug moment); objects hit zero live refs and, once an explicit `collect` step fires,
 * fade away — including cyclic garbage kept "alive" only by other doomed objects.
 */
export function paintObjectHeap(ctx: CanvasRenderingContext2D, scene: HeapScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.5;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const prev = stateAt(scene, activeStep - 1);
  const curr = stateAt(scene, activeStep);
  const mutated = activeStep >= 0 ? scene.steps[activeStep].mutate : undefined;

  // --- Layout: names column / row, objects grid on the remaining area. ---
  const m = scene.vars.length;
  const n = scene.objects.length;
  const varBandH = vertical ? Math.min(areaH * 0.16, unit * 2.6) : areaH;
  const varBandW = vertical ? contentW : Math.min(contentW * 0.24, unit * 6.2);
  const objAreaX = vertical ? contentX : contentX + varBandW + unit * 1.1;
  const objAreaY = vertical ? areaY + varBandH + unit * 0.9 : areaY;
  const objAreaW = vertical ? contentW : contentW - varBandW - unit * 1.1;
  const objAreaH = vertical ? areaH - varBandH - unit * 0.9 : areaH;

  const varPos = (i: number): Pt =>
    vertical
      ? { x: contentX + ((i + 0.5) / m) * contentW, y: areaY + varBandH / 2 }
      : { x: contentX + varBandW / 2, y: areaY + ((i + 0.5) / m) * varBandH };

  const cols = vertical ? Math.min(3, n) : Math.min(4, n);
  const rows = Math.ceil(n / cols);
  const cellW = objAreaW / cols;
  const cellH = objAreaH / rows;
  const cardW = Math.min(cellW * 0.78, unit * (vertical ? 6.0 : 5.4));
  const cardH = Math.min(cellH * 0.62, unit * 3.1);
  const objPos = (i: number): Pt => ({
    x: objAreaX + (i % cols + 0.5) * cellW,
    y: objAreaY + (Math.floor(i / cols) + 0.5) * cellH,
  });

  const objIndex = new Map(scene.objects.map((o, i) => [o.id, i] as const));
  const varAnchor = (i: number): Pt => vertical ? { x: varPos(i).x, y: varPos(i).y + varBandH * 0.28 } : { x: varPos(i).x + varBandW * 0.42, y: varPos(i).y };
  const objAnchor = (i: number): Pt => vertical ? { x: objPos(i).x, y: objPos(i).y - cardH * 0.5 } : { x: objPos(i).x - cardW * 0.5, y: objPos(i).y };

  const revealAt = (objId: string) => {
    const k = firstStepOf(scene, objId);
    return beatWindow(env.beats, offset + k, totalBeats).start;
  };

  const drawArrow = (a: Pt, b: Pt, seed: string, color: string, glowColor: string, progress: number, alpha: number, flash: boolean) => {
    if (progress <= 0 || alpha <= 0) return;
    const pts = bow(a, b, seed, unit * 1.1);
    ctx.save();
    ctx.globalAlpha = introIn * alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = unit * (flash ? 0.15 : 0.09);
    ctx.lineCap = "round";
    if (flash) { ctx.shadowColor = glowColor; ctx.shadowBlur = unit * 0.9; }
    const tip = strokePolylineProgress(ctx, pts, progress);
    ctx.shadowBlur = 0;
    if (progress > 0.85) { ctx.fillStyle = color; drawArrowhead(ctx, tip.x, tip.y, tip.angle, unit * 0.32); }
    ctx.restore();
    if (progress >= 1) flowDots(ctx, pts, env, { count: flash ? 3 : 1, speedMs: flash ? 900 : 1800, r: unit * 0.12, color, glow: flash });
  };

  // --- Object -> object links (containers, cyclic references). ---
  scene.objects.forEach((from, fi) => {
    scene.objects.forEach((to, ti) => {
      if (from.id === to.id) return;
      const key = `${from.id}->${to.id}`;
      const wasLinked = prev.links.has(key);
      const isLinked = curr.links.has(key);
      if (!wasLinked && !isLinked) return;
      if (curr.collected.has(from.id)) return;
      const a = objPos(fi), b = objPos(ti);
      const growing = isLinked && !wasLinked;
      const shrinking = !isLinked && wasLinked;
      const progress = growing ? easeOutCubic(clamp01((stepT - 0.15) / 0.6)) : 1;
      const alpha = shrinking ? 1 - easeOutCubic(clamp01(stepT * 1.6)) : 0.85;
      const flash = mutated === to.id || mutated === from.id;
      drawArrow(a, b, key, secondary, secondaryGlow, progress, alpha, flash);
    });
  });

  // --- Name -> object arrows: the rebinding step retracts the old arrow while drawing the new one in. ---
  scene.vars.forEach((v, i) => {
    const before = prev.bindings.get(v.id) ?? null;
    const after = curr.bindings.get(v.id) ?? null;
    const changed = before !== after;
    const a = varAnchor(i);
    if (changed && before) {
      const oi = objIndex.get(before);
      if (oi != null) {
        const alpha = 1 - easeOutCubic(clamp01(stepT * 1.8));
        drawArrow(a, objAnchor(oi), `${v.id}-old`, rgba(accent, 0.7), accentGlow, 1, alpha, false);
      }
    }
    if (after) {
      const oi = objIndex.get(after);
      if (oi != null && !curr.collected.has(after)) {
        const progress = changed ? easeOutCubic(clamp01((stepT - 0.2) / 0.6)) : 1;
        const flash = changed || mutated === after;
        drawArrow(a, objAnchor(oi), v.id, accent, accentGlow, progress, 1, flash);
      }
    }
  });

  // --- Name chips (flat "stack" tags). ---
  scene.vars.forEach((v, i) => {
    const { x, y } = varPos(i);
    const w = vertical ? contentW / m - unit * 0.6 : varBandW - unit * 0.8;
    const h = unit * 1.5;
    const bx = x - w / 2;
    const by = y - h / 2;
    const boundNow = curr.bindings.get(v.id) ?? null;
    ctx.save();
    ctx.globalAlpha = introIn;
    roundRect(ctx, bx, by, w, h, unit * 0.3);
    ctx.fillStyle = boundNow ? rgba(accent, 0.14) : "rgba(148,163,184,0.08)";
    ctx.fill();
    ctx.strokeStyle = boundNow ? accent : "rgba(148,163,184,0.4)";
    ctx.lineWidth = unit * 0.07;
    ctx.setLineDash(boundNow ? [] : [unit * 0.22, unit * 0.18]);
    ctx.stroke();
    ctx.setLineDash([]);
    const px = fitFontSize(ctx, v.name, { maxW: w * 0.86, startPx: unit * 0.68, minPx: unit * 0.42, weight: 700, family: FONT_MONO });
    ctx.font = `700 ${px}px ${FONT_MONO}`;
    ctx.fillStyle = boundNow ? THEME.text : THEME.textFaint;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(v.name, x, y - (boundNow ? h * 0.12 : 0));
    if (!boundNow) {
      ctx.font = `600 ${unit * 0.42}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.textFaint;
      ctx.fillText("None", x, y + h * 0.3);
    }
    ctx.restore();
  });

  // --- Heap object cards (extruded 3-D blocks). ---
  scene.objects.forEach((obj, i) => {
    const t = clamp01((env.p - revealAt(obj.id)) / 0.1);
    if (t <= 0) return;
    const collectedNow = curr.collected.has(obj.id);
    const wasCollected = prev.collected.has(obj.id);
    if (collectedNow && wasCollected) return; // fully gone

    const { x, y } = objPos(i);
    const w = cardW, h = cardH;
    const rc = refcount(obj.id, curr);
    const rcPrev = refcount(obj.id, prev);
    const dying = rc === 0 && !collectedNow;
    const collecting = collectedNow && !wasCollected;
    const collectFade = collecting ? 1 - easeOutCubic(clamp01(stepT * 1.6)) : 1;

    const appear = easeOutBack(t);
    const scale = (0.55 + 0.45 * appear) * (collecting ? 0.4 + 0.6 * collectFade : 1);
    const bx = x - (w * scale) / 2;
    const by = y - (h * scale) / 2;
    const isMutating = mutated === obj.id;
    const face = isMutating ? accent : dying ? THEME.warn : secondary;

    ctx.save();
    ctx.globalAlpha = introIn * clamp01(t * 1.5) * collectFade;
    if (dying) ctx.setLineDash([unit * 0.24, unit * 0.2]);
    isoBox3D(ctx, bx, by, w * scale, h * scale, unit * 0.5, face, isMutating ? accentGlow : dying ? rgba(THEME.warn, 0.4) : undefined);
    ctx.setLineDash([]);

    if (obj.icon) drawIcon(ctx, obj.icon, x, by + h * scale * 0.32, h * scale * 0.4, env, "#eaf3ff");
    const labelY = by + h * scale * (obj.icon ? 0.72 : 0.5);
    const labelPx = fitFontSize(ctx, obj.label, { maxW: w * scale * 0.84, startPx: unit * 0.62, minPx: unit * 0.4, weight: 700 });
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(obj.label, x, labelY);

    if (!obj.mutable) {
      ctx.strokeStyle = rgba("#eaf3ff", 0.5);
      ctx.lineWidth = unit * 0.04;
      roundRect(ctx, bx + unit * 0.14, by + unit * 0.14, w * scale - unit * 0.28, h * scale - unit * 0.28, unit * 0.2);
      ctx.stroke();
    }

    // Refcount pill, popping when the count just changed this step.
    const rcChanged = rc !== rcPrev && activeStep >= 0;
    const rcShown = rcChanged ? Math.round(rcPrev + (rc - rcPrev) * easeOutCubic(clamp01((stepT - 0.35) / 0.5))) : rc;
    const pop = rcChanged ? 1 + 0.35 * Math.sin(Math.PI * clamp01((stepT - 0.35) / 0.5)) : 1;
    const badge = `x${rcShown}`;
    ctx.font = `800 ${unit * 0.52}px ${FONT_MONO}`;
    const bw = ctx.measureText(badge).width + unit * 0.5;
    const badgeX = bx + w * scale - bw * 0.5 - unit * 0.15;
    const badgeY = by - unit * 0.15;
    ctx.save();
    ctx.translate(badgeX, badgeY);
    ctx.scale(pop, pop);
    roundRect(ctx, -bw / 2, -unit * 0.42, bw, unit * 0.84, unit * 0.42);
    ctx.fillStyle = rcShown === 0 ? THEME.warn : rc > rcPrev ? THEME.good : accent;
    ctx.fill();
    ctx.fillStyle = "#08131f";
    ctx.fillText(badge, 0, unit * 0.02);
    ctx.restore();

    if (dying) {
      const p2 = (env.elapsedMs % 1400) / 1400;
      ctx.globalAlpha = introIn * (1 - p2) * 0.5 * collectFade;
      ctx.strokeStyle = THEME.warn;
      ctx.lineWidth = unit * 0.06;
      roundRect(ctx, bx - p2 * unit * 0.3, by - p2 * unit * 0.3, w * scale + p2 * unit * 0.6, h * scale + p2 * unit * 0.6, unit * 0.35);
      ctx.stroke();
    } else if (isMutating || rc > 0) {
      const g = idle(env, isMutating ? 500 : 1800);
      ctx.globalAlpha = introIn * collectFade * (isMutating ? 0.5 + 0.5 * g : 0.18 + 0.1 * g);
      ctx.strokeStyle = isMutating ? accent : secondary;
      ctx.lineWidth = unit * (isMutating ? 0.12 : 0.05);
      roundRect(ctx, bx - unit * 0.12, by - unit * 0.12, w * scale + unit * 0.24, h * scale + unit * 0.24, unit * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  });

  if (activeStep >= 0 && scene.steps[activeStep].note) {
    ctx.save();
    const noteIn = easeOutCubic(clamp01((stepT - 0.1) / 0.5));
    ctx.globalAlpha = introIn * noteIn;
    ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const noteY = vertical ? Math.min(contentY + contentH + unit * 0.2, layout.h - unit * 0.6) : contentY + contentH + unit * 0.1;
    ctx.fillText(scene.steps[activeStep].note!, layout.w / 2, noteY);
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

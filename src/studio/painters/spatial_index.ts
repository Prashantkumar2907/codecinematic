import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  clamp01,
  sub,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  glowRing,
  rgba,
  shade,
} from "./common";
import type { PaintEnv } from "./index";

type SpatialIndexScene = Extract<Scene, { kind: "spatial_index" }>;

/** Region coordinates are authored on a fixed 0..100 square regardless of pixel size. */
const REGION = 100;
/** Recursion ceiling so a cluster of near-duplicate points can't split forever. */
const MAX_DEPTH = 5;

type Pt = { id: string; x: number; y: number; label?: string; order: number; revealP: number };

type QNode = {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  points: Pt[];
  children?: QNode[];
  /** Insertion-order index of the point whose arrival split this node into being; -1 for the root (always present). */
  bornOrder: number;
};

function clampRange(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function childIndexFor(node: QNode, x: number, y: number): number {
  const right = x >= node.x + node.w / 2 ? 1 : 0;
  const bottom = y >= node.y + node.h / 2 ? 1 : 0;
  return bottom * 2 + right;
}

function splitNode(node: QNode, triggerOrder: number, capacity: number, maxDepth: number) {
  const hw = node.w / 2;
  const hh = node.h / 2;
  node.children = [0, 1, 2, 3].map((i) => ({
    x: node.x + (i % 2) * hw,
    y: node.y + (i >= 2 ? 1 : 0) * hh,
    w: hw,
    h: hh,
    depth: node.depth + 1,
    points: [] as Pt[],
    bornOrder: triggerOrder,
  }));
  const old = node.points;
  node.points = [];
  old.forEach((p) => insertPoint(node, p, capacity, maxDepth));
}

function insertPoint(node: QNode, pt: Pt, capacity: number, maxDepth: number) {
  if (node.children) {
    insertPoint(node.children[childIndexFor(node, pt.x, pt.y)], pt, capacity, maxDepth);
    return;
  }
  node.points.push(pt);
  if (node.points.length > capacity && node.depth < maxDepth) splitNode(node, pt.order, capacity, maxDepth);
}

function collectLeaves(node: QNode, out: QNode[]) {
  if (!node.children) {
    out.push(node);
    return;
  }
  node.children.forEach((c) => collectLeaves(c, out));
}

function locateLeaf(node: QNode, x: number, y: number): QNode {
  let cur = node;
  while (cur.children) cur = cur.children[childIndexFor(cur, x, y)];
  return cur;
}

function rectCircleDist(node: QNode, qx: number, qy: number): number {
  const cx = clampRange(qx, node.x, node.x + node.w);
  const cy = clampRange(qy, node.y, node.y + node.h);
  return Math.hypot(qx - cx, qy - cy);
}

/**
 * A square 2-D region that recursively subdivides into quadrants as points are
 * inserted — the general primitive behind quadtrees, geohash buckets, and
 * (approximately) hex-grid indexes like H3: nearby points share a cell, dense
 * areas subdivide further, sparse areas stay coarse. The quadtree is REBUILT
 * every frame from the cumulative, partially-revealed point list via a real
 * capacity-triggered split algorithm — the schema only ever supplies raw
 * points, never hand-authored split geometry, so the picture can't desync
 * from what a real spatial index would produce. A step carrying `query`
 * highlights the cell holding a search point plus every neighbouring cell
 * inside its search radius (the "nearby search" pattern).
 */
export function paintSpatialIndex(ctx: CanvasRenderingContext2D, scene: SpatialIndexScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.5;

  const chipGutter = unit * 1.3; // reserved strip above the arena for the capacity chip, so it never overlaps the title band
  const bandY = contentY + band + chipGutter;
  const bottom = vertical ? Math.min(contentY + contentH, layout.h * 0.92) : contentY + contentH;
  const availH = bottom - bandY;
  const size = Math.min(contentW, availH, unit * 13.5);
  const arenaX = contentX + (contentW - size) / 2;
  const arenaY = bandY + Math.max(0, (availH - size) / 2);
  const toPx = (x: number, y: number) => ({ x: arenaX + (x / REGION) * size, y: arenaY + (y / REGION) * size });

  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  // Replay cumulative points: earlier steps are fully settled, the active
  // step's points pop in one by one across its beat window.
  const capacity = scene.capacity;
  const points: Pt[] = [];
  let order = 0;
  for (let k = 0; k <= activeStep && k < scene.steps.length; k++) {
    const isActiveStep = k === activeStep;
    const pts = scene.steps[k].points;
    pts.forEach((p, i) => {
      let revealP = 1;
      if (isActiveStep) {
        const startAt = (i / Math.max(pts.length, 1)) * 0.55;
        revealP = clamp01((stepT - startAt) / 0.45);
      }
      if (revealP > 0) points.push({ ...p, order, revealP });
      order++;
    });
  }
  const orderToRevealP = new Map(points.map((p) => [p.order, p.revealP] as const));

  const root: QNode = { x: 0, y: 0, w: REGION, h: REGION, depth: 0, points: [], bornOrder: -1 };
  points.forEach((p) => insertPoint(root, p, capacity, MAX_DEPTH));
  const leaves: QNode[] = [];
  collectLeaves(root, leaves);

  // Arena panel.
  ctx.save();
  ctx.globalAlpha = introIn;
  roundRect(ctx, arenaX, arenaY, size, size, unit * 0.3);
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fill();
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = unit * 0.06;
  ctx.stroke();
  ctx.restore();

  // The most recently revealed point still (or just) settling — its cell gets
  // the "current insert" focus ring so viewers can track where the next point lands.
  const lastPoint = points[points.length - 1];
  const focusLeaf = lastPoint ? locateLeaf(root, lastPoint.x, lastPoint.y) : undefined;

  // Recursive leaf cells. The union of leaf borders equals every split line
  // ever made, so drawing only leaves (never intermediate parents) reproduces
  // the whole subdivision automatically — no separate "draw the splits" pass.
  leaves
    .slice()
    .sort((a, b) => a.depth - b.depth)
    .forEach((node) => {
      const popP = node.bornOrder < 0 ? 1 : orderToRevealP.get(node.bornOrder) ?? 1;
      if (popP <= 0) return;
      const pop = easeOutBack(clamp01(popP));
      const scale = 0.55 + 0.45 * Math.max(0, pop);
      const a = toPx(node.x, node.y);
      const b = toPx(node.x + node.w, node.y + node.h);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const w = (b.x - a.x) * scale;
      const h = (b.y - a.y) * scale;
      const isFresh = popP < 1;
      const isFocus = node === focusLeaf;
      ctx.save();
      ctx.globalAlpha = introIn * clamp01(pop);
      if (isFresh) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.7;
      }
      roundRect(ctx, cx - w / 2, cy - h / 2, w, h, unit * 0.1);
      ctx.fillStyle = rgba(accent, 0.05 + node.depth * 0.035);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isFresh ? accent : rgba(accent, 0.32 + node.depth * 0.06);
      ctx.lineWidth = unit * (isFresh ? 0.09 : 0.05);
      ctx.stroke();
      ctx.restore();
      if (isFocus && !isFresh) {
        const breathe = 0.7 + 0.3 * idle(env, 1500);
        ctx.save();
        ctx.globalAlpha = introIn * breathe * 0.8;
        ctx.strokeStyle = accent;
        ctx.lineWidth = unit * 0.1;
        roundRect(ctx, cx - w / 2, cy - h / 2, w, h, unit * 0.12);
        ctx.stroke();
        ctx.restore();
      }
    });

  // Points, dropping in from above with a settle bounce.
  const showLabels = points.length <= 10;
  points.forEach((p) => {
    const appear = easeOutCubic(p.revealP);
    const pop = easeOutBack(p.revealP);
    const { x, y } = toPx(p.x, p.y);
    const dropY = y - (1 - appear) * unit * 1.6;
    const r = unit * 0.26 * Math.max(0.15, pop);
    ctx.save();
    ctx.globalAlpha = introIn * appear;
    if (p.revealP < 1) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
    }
    ctx.beginPath();
    ctx.arc(x, dropY, r, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = unit * 0.05;
    ctx.strokeStyle = shade(accent, 0.4);
    ctx.stroke();
    ctx.restore();
    if (showLabels && p.label) {
      ctx.save();
      ctx.globalAlpha = introIn * appear * 0.9;
      ctx.font = `700 ${unit * 0.5}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(p.label, x, dropY - r - unit * 0.25);
      ctx.restore();
    }
  });

  // Query: highlight the cell holding the search point plus every cell within its radius.
  const activeStepData = activeStep >= 0 && activeStep < scene.steps.length ? scene.steps[activeStep] : undefined;
  if (activeStepData?.query) {
    const q = activeStepData.query;
    const qIn = easeOutCubic(sub(stepT, 0.5, 0.42));
    if (qIn > 0) {
      const qc = toPx(q.x, q.y);
      const rpx = (q.radius / REGION) * size * easeOutCubic(qIn);
      const containing = locateLeaf(root, q.x, q.y);

      leaves.forEach((node) => {
        if (rectCircleDist(node, q.x, q.y) > q.radius) return;
        const a = toPx(node.x, node.y);
        const b = toPx(node.x + node.w, node.y + node.h);
        const isPrimary = node === containing;
        ctx.save();
        ctx.globalAlpha = introIn * qIn * (isPrimary ? 0.34 : 0.18);
        roundRect(ctx, a.x, a.y, b.x - a.x, b.y - a.y, unit * 0.1);
        ctx.fillStyle = isPrimary ? accent : secondary;
        ctx.fill();
        ctx.restore();
      });

      ctx.save();
      ctx.globalAlpha = introIn * qIn * 0.85;
      ctx.strokeStyle = rgba(secondary, 0.9);
      ctx.setLineDash([unit * 0.22, unit * 0.18]);
      ctx.lineWidth = unit * 0.07;
      ctx.beginPath();
      ctx.arc(qc.x, qc.y, rpx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      glowRing(ctx, qc.x, qc.y, unit * 0.35, secondary, env, 1500);

      ctx.save();
      ctx.globalAlpha = introIn * qIn;
      ctx.beginPath();
      ctx.arc(qc.x, qc.y, unit * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = secondary;
      ctx.shadowColor = rgba(secondary, 0.6);
      ctx.shadowBlur = unit * 0.6;
      ctx.fill();
      ctx.restore();
    }
  }

  // Capacity chip — the number that decides when a cell splits.
  ctx.save();
  ctx.globalAlpha = introIn * 0.95;
  const chip = `cap ${capacity}`;
  ctx.font = `800 ${unit * 0.55}px ${FONT_SANS}`;
  const tw = ctx.measureText(chip).width;
  const chipW = tw + unit * 0.8;
  const chipX = arenaX + size - chipW;
  const chipY = arenaY - unit * 1.15;
  roundRect(ctx, chipX, chipY, chipW, unit * 0.95, unit * 0.3);
  ctx.fillStyle = rgba(accent, 0.18);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.5);
  ctx.lineWidth = unit * 0.05;
  ctx.stroke();
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(chip, chipX + chipW / 2, chipY + unit * 0.5);
  ctx.restore();

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  flowDots,
  pointAlongPolyline,
  glowRing,
  smoothPulse,
  hashStr,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type EcosystemScene = Extract<Scene, { kind: "ecosystem_web" }>;
type ENode = EcosystemScene["nodes"][number];
type Pt = { x: number; y: number };

const GHOST_NODE = 0.4;
const GHOST_LINK = 0.16;
/** Fraction of a step's beat spent drawing the newly-revealed link(s) on. */
const DRAW_ON = 0.55;

/** Semantic colour per node kind (mirrors the good/warn convention used across
 *  the painters for "healthy" vs "under stress"), not a subject accent — every
 *  ecosystem web reads producer=green, factor=amber regardless of palette. */
function kindColor(kind: ENode["kind"], accent: string): string {
  return kind === "producer" ? THEME.good : kind === "factor" ? THEME.warn : accent;
}

/** Deterministic unit interval from a hash, so layout never uses Math.random(). */
function hash01(s: string): number {
  return (hashStr(s) % 10000) / 10000;
}

/**
 * Radial "food-web" layout: nodes scattered around an ellipse (angle + radius
 * both hash-jittered per node id) so the map reads organic rather than a rigid
 * ring, while staying perfectly deterministic and stable across re-renders.
 */
function layoutNodes(scene: EcosystemScene, cx: number, cy: number, rx: number, ry: number): Map<string, Pt> {
  const n = scene.nodes.length;
  const map = new Map<string, Pt>();
  scene.nodes.forEach((node, i) => {
    const base = (i / n) * Math.PI * 2 - Math.PI / 2;
    const jitterA = (hash01(scene.id + node.id + "a") - 0.5) * ((Math.PI * 2) / n) * 0.5;
    const jitterR = 0.72 + 0.3 * hash01(scene.id + node.id + "r");
    const angle = base + jitterA;
    map.set(node.id, { x: cx + Math.cos(angle) * rx * jitterR, y: cy + Math.sin(angle) * ry * jitterR });
  });
  return map;
}

/** Sample a slightly-inward-bowed quadratic curve between two points into a
 *  polyline, so chords across the web read as organic strands rather than a
 *  cluttered straight-line mesh. Reusable by flowDots/pointAlongPolyline. */
function bowedPath(a: Pt, b: Pt, cx: number, cy: number, bow: number, samples = 14): Pt[] {
  const mx = (a.x + b.x) / 2 + (cx - (a.x + b.x) / 2) * bow;
  const my = (a.y + b.y) / 2 + (cy - (a.y + b.y) / 2) * bow;
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * mx + t * t * b.x, y: u * u * a.y + 2 * u * t * my + t * t * b.y });
  }
  return pts;
}

function nodeGlyphPath(ctx: CanvasRenderingContext2D, kind: ENode["kind"], x: number, y: number, r: number) {
  ctx.beginPath();
  if (kind === "producer") {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (kind === "factor") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

/**
 * An organic interconnected food/ecosystem web: producers, consumers and
 * environmental factors scattered on a hash-jittered ellipse, linked by
 * "eats" (energy) or "affects" (disruption) edges. The whole web shows as a
 * dim ghost from frame one so its shape reads immediately; each beat draws
 * one or more links on (the endpoints popping in with them) with a travelling
 * energy dot, then settles into a slow continuous flow — the general primitive
 * for food chains, biodiversity webs and "X disrupts Y disrupts Z" causal
 * chains alike (see mindmap.ts for the sibling radial-reveal contract).
 */
export function paintEcosystemWeb(ctx: CanvasRenderingContext2D, scene: EcosystemScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, h } = layout;
  const { accent } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.3;

  // Reserve a thin strip right under the title for the kind legend (only the
  // kinds this web actually uses) so it never overlaps the title or the web.
  const usedKinds = Array.from(new Set(scene.nodes.map((n) => n.kind))) as ENode["kind"][];
  const legendH = usedKinds.length > 1 ? unit * 1.15 : 0;
  const band = titleBand + legendH;

  const areaY = contentY + band;
  let areaH = contentH - band;
  if (vertical) areaH = Math.min(areaH, h * 0.92 - areaY);
  const cx = contentX + contentW / 2;
  const cy = areaY + areaH / 2;
  const rx = contentW * (vertical ? 0.38 : 0.42);
  const ry = areaH * (vertical ? 0.4 : 0.44);

  const pos = layoutNodes(scene, cx, cy, rx, ry);
  const n = scene.nodes.length;
  const arcSpacing = (Math.min(rx, ry) * Math.PI * 2) / Math.max(n, 1);
  const nodeR = Math.max(unit * 0.62, Math.min(unit * 1.15, arcSpacing * 0.34));

  // First step each link is scheduled to draw on; a node's own reveal moment
  // is the earliest of its incident links (isolated nodes default to step 0
  // so a malformed script still renders them rather than leaving a gap).
  const linkStepOf = new Map<string, number>();
  scene.steps.forEach((st, k) => st.reveal.forEach((lid) => { if (!linkStepOf.has(lid)) linkStepOf.set(lid, k); }));
  const nodeStepOf = new Map<string, number>();
  scene.links.forEach((l) => {
    const k = linkStepOf.get(l.id);
    if (k == null) return;
    for (const nid of [l.from, l.to]) {
      const prev = nodeStepOf.get(nid);
      if (prev == null || k < prev) nodeStepOf.set(nid, k);
    }
  });
  scene.nodes.forEach((nd) => { if (!nodeStepOf.has(nd.id)) nodeStepOf.set(nd.id, 0); });

  const appearAt = (k: number): number => {
    if (activeStep < k) return 0;
    if (activeStep > k) return 1;
    return easeOutCubic(clamp01(beatT(env.beats, offset + k, totalBeats, env.p) / DRAW_ON));
  };
  const linkAppear = (id: string): number => {
    const k = linkStepOf.get(id);
    return k == null ? 0 : appearAt(k);
  };
  const nodeAppear = (id: string): number => appearAt(nodeStepOf.get(id) ?? 0);

  // --- links (drawn under nodes): ghost strand always, lit path once its
  // beat lands, travelling dot while drawing on, then a slow idle energy flow.
  scene.links.forEach((link) => {
    const a = pos.get(link.from);
    const b = pos.get(link.to);
    if (!a || !b) return;
    const bow = 0.14 + 0.1 * hash01(scene.id + link.id + "b");
    const pts = bowedPath(a, b, cx, cy, bow);
    const ap = linkAppear(link.id);
    const isAffects = link.type === "affects";
    const lineColor = isAffects ? THEME.warn : accent;

    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = GHOST_LINK * introIn;
    ctx.strokeStyle = "rgba(148,163,184,0.9)";
    ctx.lineWidth = unit * 0.05;
    if (isAffects) ctx.setLineDash([unit * 0.22, unit * 0.2]);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (ap <= 0) return;
    const isActiveLink = linkStepOf.get(link.id) === activeStep;
    const drawN = Math.max(1, Math.round(pts.length * clamp01(ap)));

    ctx.save();
    ctx.globalAlpha = introIn * (0.55 + 0.35 * ap);
    ctx.strokeStyle = rgba(lineColor, isAffects ? 0.75 : 0.85);
    ctx.lineWidth = unit * (isAffects ? 0.09 : 0.12);
    ctx.lineCap = "round";
    if (isAffects) ctx.setLineDash([unit * 0.26, unit * 0.18]);
    if (isActiveLink && ap < 1) {
      ctx.shadowColor = rgba(lineColor, 0.6);
      ctx.shadowBlur = unit * 0.6;
    }
    ctx.beginPath();
    for (let i = 0; i < drawN; i++) (i === 0 ? ctx.moveTo(pts[i].x, pts[i].y) : ctx.lineTo(pts[i].x, pts[i].y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (ap >= 1) {
      flowDots(ctx, pts, env, {
        count: isAffects ? 1 : 2,
        speedMs: isAffects ? 3400 : 1700,
        r: unit * (isAffects ? 0.1 : 0.13),
        color: lineColor,
      });
    } else {
      const tip = pointAlongPolyline(pts, clamp01(ap));
      ctx.save();
      ctx.globalAlpha = introIn;
      ctx.shadowColor = rgba(lineColor, 0.7);
      ctx.shadowBlur = unit * 0.7;
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, unit * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (link.label && ap > 0.7) {
      const mid = pointAlongPolyline(pts, 0.5);
      ctx.save();
      ctx.globalAlpha = introIn * clamp01((ap - 0.7) / 0.3);
      ctx.font = `600 ${unit * 0.52}px ${FONT_SANS}`;
      const tw = ctx.measureText(link.label).width;
      ctx.fillStyle = "rgba(10,16,22,0.82)";
      roundRect(ctx, mid.x - tw / 2 - unit * 0.26, mid.y - unit * 0.42, tw + unit * 0.52, unit * 0.78, unit * 0.2);
      ctx.fill();
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(link.label, mid.x, mid.y);
      ctx.restore();
    }
  });

  // --- nodes on top ---
  scene.nodes.forEach((node, ni) => {
    const p = pos.get(node.id);
    if (!p) return;
    const nodeIn = enterT(env, 340, 100 + ni * 40);
    if (nodeIn <= 0) return;
    const ap = nodeAppear(node.id);
    const isActive = nodeStepOf.get(node.id) === activeStep && ap > 0 && ap < 1;
    const fill = kindColor(node.kind, accent);
    const pop = easeOutBack(clamp01(nodeIn * (ap > 0 ? 1 : 0.85)));
    const breathe = ap >= 1 ? 1 + (smoothPulse(env, 2200 + ni * 130, 1.05) - 1) * (isActive ? 0 : 1) : 1;
    const r = nodeR * (0.55 + 0.45 * pop) * breathe;

    ctx.save();
    ctx.globalAlpha = (ap > 0 ? 0.55 + 0.45 * ap : GHOST_NODE) * introIn * clamp01(nodeIn * 2);
    if (isActive) {
      ctx.shadowColor = rgba(fill, 0.6 + 0.3 * idle(env, 1400));
      ctx.shadowBlur = unit * 0.9;
    }
    nodeGlyphPath(ctx, node.kind, p.x, p.y, r);
    ctx.fillStyle = ap > 0 ? rgba(fill, 0.22) : "rgba(148,163,184,0.08)";
    ctx.fill();
    ctx.shadowBlur = 0;
    nodeGlyphPath(ctx, node.kind, p.x, p.y, r);
    ctx.strokeStyle = ap > 0 ? fill : "rgba(148,163,184,0.4)";
    ctx.lineWidth = ap > 0 ? unit * (isActive ? 0.13 : 0.09) : unit * 0.06;
    ctx.stroke();

    if (isActive) glowRing(ctx, p.x, p.y, r * 1.1, fill, env, 1500);

    if (node.icon) {
      drawIcon(ctx, node.icon, p.x, p.y - r * 0.32, r * 1.15, env, ap > 0 ? THEME.text : THEME.textFaint);
    }
    const labelY = node.icon ? p.y + r * 0.62 : p.y;
    const fontPx = fitFontSize(ctx, node.label, { maxW: r * 2.3, startPx: unit * 0.66, minPx: unit * 0.4, weight: 700 });
    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    ctx.fillStyle = ap > 0 ? THEME.text : THEME.textFaint;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(node.label, p.x, labelY);
    ctx.restore();
  });

  // --- kind legend, drawn in the strip reserved between the title and the
  // web so it colour-codes producer/consumer/factor without ever overlapping.
  const legendLabel: Record<ENode["kind"], string> = { producer: "Producer", consumer: "Consumer", factor: "Factor" };
  if (legendH > 0) {
    ctx.save();
    ctx.globalAlpha = introIn * 0.85;
    ctx.font = `600 ${unit * 0.5}px ${FONT_SANS}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const chipW = usedKinds.map((k) => ctx.measureText(legendLabel[k]).width + unit * 1.1);
    const totalW = chipW.reduce((s, w) => s + w, 0) - unit * 0.3;
    let lx = contentX + (contentW - totalW) / 2;
    const ly = contentY + titleBand + legendH / 2 - unit * 0.15;
    usedKinds.forEach((k, i) => {
      ctx.beginPath();
      ctx.arc(lx + unit * 0.2, ly, unit * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = kindColor(k, accent);
      ctx.fill();
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(legendLabel[k], lx + unit * 0.48, ly + unit * 0.02);
      lx += chipW[i];
    });
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

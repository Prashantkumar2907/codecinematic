import { stratify, tree as d3tree } from "d3-hierarchy";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  lerpColor,
  idle,
  clamp01,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  wrapText,
  beatT,
  activeBeatIndex,
  flowDots,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

const ROOT_TINT = 0.32;
const MID_TINT = 0.22;
const LEAF_TINT = 0.12;
const PULSE_MS = 1500;

type MindmapScene = Extract<Scene, { kind: "mindmap" }>;
type MNode = MindmapScene["nodes"][number];
type Pt = { x: number; y: number };

/**
 * Radial concept map (d3-hierarchy): a central idea with branches curving
 * outward, revealed level by level. Distinct from the top-down `tree` — this is
 * the brainstorm / topic-overview / "everything connected to X" view.
 */
export function paintMindmap(ctx: CanvasRenderingContext2D, scene: MindmapScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.4;

  // --- radial layout via d3-hierarchy -----------------------------------
  const areaY = contentY + band;
  // `h * 0.9` let the lowest branch cross the caption band; safeBottom is 0.69 at 9:16.
  const areaH = Math.max(unit * 4, safeBottom - areaY);
  const cx = contentX + contentW / 2;
  const cy = areaY + areaH / 2;
  // Elliptical mapping: radii normalised to [0,1] by d3, then stretched to the
  // frame (wider in landscape) so nodes spread out and fill it instead of
  // crowding into a small circle.
  const radiusX = contentW * (vertical ? 0.42 : 0.45);
  const radiusY = areaH * (vertical ? 0.43 : 0.46);

  let root;
  try {
    root = stratify<MNode>().id((n) => n.id).parentId((n) => n.parent ?? undefined)(scene.nodes);
  } catch {
    return; // malformed hierarchy — skip rather than throw at render time
  }
  d3tree<MNode>().size([Math.PI * 2, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.8))(root);

  const nodes = root.descendants();

  /** Box size of a node, needed before positions so the first ring can clear the root. */
  const boxOf = (label: string, depth: number) => {
    const maxW = depth === 0 ? unit * 5 : depth === 1 ? unit * 4.2 : unit * 3.6;
    const px = fitFontSize(ctx, label, {
      maxW,
      startPx: depth === 0 ? unit * 0.86 : depth === 1 ? unit * 0.7 : unit * 0.62,
      minPx: unit * 0.5,
      weight: depth === 0 ? 800 : 700,
    });
    ctx.font = `${depth === 0 ? 800 : 700} ${px}px ${FONT_SANS}`;
    const lines = wrapText(ctx, label, maxW).slice(0, 2);
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    return { px, lines, w: tw + unit * 1.4, h: lines.length * px * 1.15 + unit * 1.0 };
  };
  const boxes = new Map(nodes.map((nd) => [nd.id!, boxOf(nd.data.label, nd.depth)]));

  /**
   * The first ring has to start outside the root's own box. d3 hands back a radius of
   * 1/maxDepth for depth 1, which at this ellipse put a depth-1 box straight on top of
   * the root — "Caching" was drawn over "Scalability".
   */
  const rootBox = boxes.get(root.id!)!;
  const firstRing = boxes.get(nodes.find((n) => n.depth === 1)?.id ?? root.id!) ?? rootBox;
  const minR = Math.min(0.6, (rootBox.w / 2 + firstRing.w / 2 + unit * 0.8) / Math.max(1, radiusX));
  const rEff = (r: number) => (r <= 0 ? 0 : minR + (1 - minR) * r);

  // Screen position from (angle=node.x, normalised r=node.y).
  const at = (ang: number, r: number): Pt => ({
    x: cx + Math.cos(ang - Math.PI / 2) * rEff(r) * radiusX,
    y: cy + Math.sin(ang - Math.PI / 2) * rEff(r) * radiusY,
  });
  const posOf = new Map<string, Pt>();
  for (const nd of nodes) posOf.set(nd.id!, at(nd.x ?? 0, nd.y ?? 0));

  /**
   * Radial spacing alone cannot keep boxes apart: two rings that need 300 px of clearance
   * only get the 128 px the ellipse has to give, so a leaf landed on top of its own parent
   * ("Async work" over "Queues"). Push overlapping boxes apart along the line between
   * their centres, then keep every box inside the content band. Deterministic — same
   * inputs, same pixels, which the QA harness and re-renders both depend on.
   */
  const RELAX_PASSES = 12;
  const GAP = unit * 0.35;
  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = posOf.get(nodes[i].id!)!;
        const b = posOf.get(nodes[j].id!)!;
        const ba = boxes.get(nodes[i].id!)!;
        const bb = boxes.get(nodes[j].id!)!;
        const needX = (ba.w + bb.w) / 2 + GAP;
        const needY = (ba.h + bb.h) / 2 + GAP;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overX = needX - Math.abs(dx);
        const overY = needY - Math.abs(dy);
        if (overX <= 0 || overY <= 0) continue;
        moved = true;
        // Separate along the cheaper axis so the map keeps its radial character.
        if (overX / needX < overY / needY) {
          const push = (overX / 2) * (dx >= 0 ? 1 : -1);
          a.x -= push;
          b.x += push;
        } else {
          const push = (overY / 2) * (dy >= 0 ? 1 : -1);
          a.y -= push;
          b.y += push;
        }
      }
    }
    if (!moved) break;
  }
  for (const nd of nodes) {
    const p = posOf.get(nd.id!)!;
    const b = boxes.get(nd.id!)!;
    p.x = Math.min(Math.max(p.x, contentX + b.w / 2), contentX + contentW - b.w / 2);
    p.y = Math.min(Math.max(p.y, areaY + b.h / 2), safeBottom - b.h / 2);
  }

  /** Where a ray leaving `c` toward `to` crosses the node's own box. */
  const edgeToward = (id: string, c: Pt, to: Pt): Pt => {
    const b = boxes.get(id)!;
    const dx = to.x - c.x;
    const dy = to.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    const scale = Math.min(
      Math.abs(dx) > 1e-3 ? b.w / 2 / Math.abs(dx / len) : Infinity,
      Math.abs(dy) > 1e-3 ? b.h / 2 / Math.abs(dy / len) : Infinity
    );
    const s = Math.min(scale, len);
    return { x: c.x + (dx / len) * s, y: c.y + (dy / len) * s };
  };

  // --- reveal timing (same contract as tree) -----------------------------
  const revealStepOf = new Map<string, number>();
  scene.steps.forEach((st, k) => st.reveal.forEach((id) => { if (!revealStepOf.has(id)) revealStepOf.set(id, k); }));
  const appearOf = (id: string): number => {
    const k = revealStepOf.get(id) ?? 0;
    if (activeStep < k) return 0;
    if (activeStep > k) return 1;
    return easeOutCubic(clamp01(beatT(env.beats, offset + k, totalBeats, env.p) * 1.6));
  };

  const tier = (depth: number) => (depth === 0 ? secondary : accent);

  const SAMPLES = 18;
  /**
   * Branch from parent box edge to child box edge: a gentle bow (control point offset
   * perpendicular to the chord) keeps the outward-curving character now that positions
   * are relaxed pixels rather than exact polar coordinates.
   */
  const branch = (parentId: string, childId: string): Pt[] => {
    const a = posOf.get(parentId)!;
    const b = posOf.get(childId)!;
    const from = edgeToward(parentId, a, b);
    const to = edgeToward(childId, b, a);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = len * 0.16;
    const kx = (from.x + to.x) / 2 - (dy / len) * off;
    const ky = (from.y + to.y) / 2 + (dx / len) * off;
    const pts: Pt[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const u = 1 - t;
      pts.push({ x: u * u * from.x + 2 * u * t * kx + t * t * to.x, y: u * u * from.y + 2 * u * t * ky + t * t * to.y });
    }
    return pts;
  };

  // --- links (draw on as the child appears) ------------------------------
  for (const nd of nodes) {
    if (!nd.parent) continue;
    const ap = appearOf(nd.id!);
    if (ap <= 0) continue;
    const pts = branch(nd.parent.id!, nd.id!);
    const drawN = Math.max(1, Math.floor(SAMPLES * clamp01(ap * 1.15)));
    ctx.save();
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = unit * 0.07;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i <= drawN; i++) {
      const p = pts[i];
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Continuous flow along branches from the centre once the map is settled.
  if (activeStep >= scene.steps.length - 1) {
    for (const nd of nodes) {
      if (!nd.parent || nd.parent.depth !== 0) continue;
      if (appearOf(nd.id!) < 1) continue;
      flowDots(ctx, branch(nd.parent.id!, nd.id!), env, { count: 1, speedMs: 2600, r: unit * 0.1, color: accent });
    }
  }

  // --- nodes -------------------------------------------------------------
  for (const nd of nodes) {
    const ap = appearOf(nd.id!);
    if (ap <= 0) continue;
    const p = posOf.get(nd.id!)!;
    const depth = nd.depth;
    const isActive = (revealStepOf.get(nd.id!) ?? 0) === activeStep;
    const pop = easeOutBack(clamp01(ap * 1.3));
    const label = nd.data.label;

    ctx.save();
    ctx.globalAlpha = clamp01(ap * 1.4);
    const edge = tier(depth);
    const { px, lines, w: bw, h: bh } = boxes.get(nd.id!)!;
    const bx = p.x - bw / 2;
    const by = p.y - bh / 2;

    ctx.translate(p.x, p.y);
    ctx.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop);
    ctx.translate(-p.x, -p.y);

    if (isActive) {
      ctx.shadowColor = rgba(edge, 0.5 + 0.3 * idle(env, PULSE_MS));
      ctx.shadowBlur = unit * 0.8;
    }
    // One family of tinted pills, deepest at the centre. Filled nodes used to be solid
    // accent/secondary with near-black text, which read as a different product from
    // every other kind in the same video.
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = lerpColor(THEME.panel, edge, depth === 0 ? ROOT_TINT : depth === 1 ? MID_TINT : LEAF_TINT);
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.strokeStyle = rgba(edge, isActive ? 0.95 : 0.45);
    ctx.lineWidth = unit * (depth === 0 ? 0.1 : 0.07);
    ctx.stroke();

    ctx.fillStyle = THEME.text;
    ctx.font = `${depth === 0 ? 800 : 700} ${px}px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((ln, i) => ctx.fillText(ln, p.x, p.y - ((lines.length - 1) * px * 1.15) / 2 + i * px * 1.15));
    ctx.restore();
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

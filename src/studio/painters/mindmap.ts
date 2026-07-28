import { stratify, tree as d3tree } from "d3-hierarchy";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
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
  const { unit, contentX, contentY, contentW, contentH, vertical, h } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.4;

  // --- radial layout via d3-hierarchy -----------------------------------
  const areaY = contentY + band;
  let areaH = contentH - band;
  if (vertical) areaH = Math.min(areaH, h * 0.9 - areaY);
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

  // Screen position from (angle=node.x, normalised r=node.y).
  const at = (ang: number, r: number): Pt => ({ x: cx + Math.cos(ang - Math.PI / 2) * r * radiusX, y: cy + Math.sin(ang - Math.PI / 2) * r * radiusY });
  const nodes = root.descendants();
  const posOf = new Map<string, Pt>();
  const angOf = new Map<string, number>();
  const radOf = new Map<string, number>();
  for (const nd of nodes) {
    posOf.set(nd.id!, at(nd.x ?? 0, nd.y ?? 0));
    angOf.set(nd.id!, nd.x ?? 0);
    radOf.set(nd.id!, nd.y ?? 0);
  }

  // --- reveal timing (same contract as tree) -----------------------------
  const revealStepOf = new Map<string, number>();
  scene.steps.forEach((st, k) => st.reveal.forEach((id) => { if (!revealStepOf.has(id)) revealStepOf.set(id, k); }));
  const appearOf = (id: string): number => {
    const k = revealStepOf.get(id) ?? 0;
    if (activeStep < k) return 0;
    if (activeStep > k) return 1;
    return easeOutCubic(clamp01(beatT(env.beats, offset + k, totalBeats, env.p) * 1.6));
  };

  const tier = (depth: number) => (depth === 0 ? secondary : depth === 1 ? accent : accent);

  // --- links (curved radial arcs, draw on as the child appears) ----------
  for (const nd of nodes) {
    if (!nd.parent) continue;
    const ap = appearOf(nd.id!);
    if (ap <= 0) continue;
    const pAng = angOf.get(nd.parent.id!)!, pRad = radOf.get(nd.parent.id!)!;
    const cAng = nd.x ?? 0, cRad = nd.y ?? 0;
    const SAMPLES = 18;
    const drawN = Math.max(1, Math.floor(SAMPLES * clamp01(ap * 1.15)));
    ctx.save();
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = unit * 0.07;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i <= drawN; i++) {
      const t = i / SAMPLES;
      const p = at(pAng + (cAng - pAng) * t, pRad + (cRad - pRad) * t);
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
      const pA = angOf.get(nd.parent.id!)!, pR = radOf.get(nd.parent.id!)!;
      const cA = angOf.get(nd.id!)!, cR = radOf.get(nd.id!)!;
      const pts: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(at(pA + (cA - pA) * t, pR + (cR - pR) * t));
      }
      flowDots(ctx, pts, env, { count: 1, speedMs: 2600, r: unit * 0.1, color: accent });
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
    const fill = tier(depth);
    const outline = depth >= 2;
    const maxW = depth === 0 ? unit * 5 : unit * 4.4;
    const px = fitFontSize(ctx, label, { maxW, startPx: depth === 0 ? unit * 0.86 : unit * 0.68, minPx: unit * 0.5, weight: depth === 0 ? 800 : 700 });
    ctx.font = `${depth === 0 ? 800 : 700} ${px}px ${FONT_SANS}`;
    const lines = wrapText(ctx, label, maxW).slice(0, 2);
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = unit * 0.7, padY = unit * 0.5;
    const bw = tw + padX * 2, bh = lines.length * px * 1.15 + padY * 2;
    const bx = p.x - bw / 2, by = p.y - bh / 2;

    ctx.translate(p.x, p.y);
    ctx.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop);
    ctx.translate(-p.x, -p.y);

    if (isActive) { ctx.shadowColor = rgba(outline ? accent : fill, 0.5 + 0.3 * idle(env, 1500)); ctx.shadowBlur = unit * 0.8; }
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    if (outline) {
      ctx.fillStyle = rgba(accent, 0.12);
      ctx.fill();
      ctx.shadowBlur = 0;
      roundRect(ctx, bx, by, bw, bh, bh / 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.07;
      ctx.stroke();
      ctx.fillStyle = THEME.text;
    } else {
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#0b0f14";
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((ln, i) => ctx.fillText(ln, p.x, p.y - ((lines.length - 1) * px * 1.15) / 2 + i * px * 1.15));
    ctx.restore();
  }
  void accentGlow;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

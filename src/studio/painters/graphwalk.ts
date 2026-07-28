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
  roundRect,
  drawSceneTitle,
  strokePolylineProgress,
  pointAlongPolyline,
  fitFontSize,
  beatWindow,
  beatT,
  activeBeatIndex,
  rgba,
  type Layout,
} from "./common";
import type { PaintEnv } from "./index";

type GraphwalkScene = Extract<Scene, { kind: "graphwalk" }>;
type GNode = GraphwalkScene["nodes"][number];
type Pt = { x: number; y: number };

const GHOST_NODE = 0.5;
const GHOST_EDGE = 0.22;
/** Fraction of the step beat spent stroking the exploring edge on. */
const EXPLORE = 0.45;

type NodeLayout = { x: number; y: number; r: number };

/**
 * Nodes carry a single grid point (not a spanning cell), so map the used x/y
 * extent with a uniform scale (aspect preserved like statemachine.ts) and
 * center it in the area below the title.
 */
function layoutNodes(nodes: GNode[], layout: Layout, titleBand: number): { map: Map<string, NodeLayout>; r: number } {
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const maxR = unit * 1.4;
  const areaX = contentX + maxR;
  const areaY = contentY + titleBand + maxR;
  const areaW = contentW - maxR * 2;
  // Vertical: keep the lowest node (plus its index chip) above the caption band.
  const bottom = vertical ? Math.min(contentY + contentH, layout.h * 0.86) : contentY + contentH;
  const areaH = bottom - areaY - maxR;
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const step = Math.min(areaW / spanX, areaH / spanY);
  const r = Math.min(maxR, step * 0.42);
  const usedW = spanX * step;
  const usedH = spanY * step;
  const ox = areaX + (areaW - usedW) / 2;
  const oy = areaY + (areaH - usedH) / 2;
  const map = new Map<string, NodeLayout>();
  for (const n of nodes) {
    map.set(n.id, { x: ox + (n.x - minX) * step, y: oy + (n.y - minY) * step, r });
  }
  return { map, r };
}

function drawWeightChip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, unit: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 ${unit * 0.5}px ${FONT_MONO}`;
  const tw = ctx.measureText(text).width;
  roundRect(ctx, x - tw / 2 - unit * 0.28, y - unit * 0.42, tw + unit * 0.56, unit * 0.84, unit * 0.22);
  ctx.fillStyle = "#0a0e13";
  ctx.fill();
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + unit * 0.18);
  ctx.textAlign = "start";
  ctx.restore();
}

export function paintGraphwalk(ctx: CanvasRenderingContext2D, scene: GraphwalkScene, env: PaintEnv) {
  const { layout } = env;
  const { unit } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const { map } = layoutNodes(scene.nodes, layout, titleBand);

  // Replay steps 0..activeStep for cumulative state.
  const visited = new Set<string>();
  const visitStep = new Map<string, number>();
  const dist = new Map<string, { value: string; prev?: string; changedStep: number }>();
  let pathIds: string[] = [];
  let pathStep = -1;
  for (let k = 0; k <= activeStep; k++) {
    const st = scene.steps[k];
    for (const v of st.visit) {
      if (!visited.has(v)) visitStep.set(v, k);
      visited.add(v);
    }
    for (const d of st.dist) {
      const prev = dist.get(d.node);
      if (!prev) dist.set(d.node, { value: d.value, changedStep: k });
      else if (prev.value !== d.value) dist.set(d.node, { value: d.value, prev: prev.value, changedStep: k });
    }
    if (st.path.length) {
      pathIds = st.path;
      pathStep = k;
    }
  }
  const frontier = new Set<string>(activeStep >= 0 ? scene.steps[activeStep].frontier : []);
  const stepBeatT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  // Frontier edges: for each frontier node, the scene edge to the NEAREST visited node.
  const frontierEdge = new Map<number, { vis: string; fro: string }>();
  for (const f of frontier) {
    let best = -1;
    let bestVis = "";
    let bestD = Infinity;
    scene.edges.forEach((e, i) => {
      let vis: string | null = null;
      if (e.from === f && visited.has(e.to)) vis = e.to;
      else if (e.to === f && visited.has(e.from)) vis = e.from;
      if (!vis) return;
      const a = map.get(vis);
      const b = map.get(f);
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < bestD) {
        bestD = d;
        best = i;
        bestVis = vis;
      }
    });
    if (best >= 0) frontierEdge.set(best, { vis: bestVis, fro: f });
  }

  // Edges under nodes: ghost line always, lit accent when both ends visited,
  // exploring stroke-on for the active frontier edge.
  scene.edges.forEach((e, i) => {
    const a = map.get(e.from);
    const b = map.get(e.to);
    if (!a || !b) return;
    const bothVisited = visited.has(e.from) && visited.has(e.to);
    const fe = frontierEdge.get(i);

    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = GHOST_EDGE * introIn;
    ctx.strokeStyle = "rgba(148,163,184,0.9)";
    ctx.lineWidth = unit * 0.08;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();

    if (bothVisited) {
      ctx.save();
      ctx.globalAlpha = 0.7 * introIn;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.13;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }

    if (fe) {
      const vp = map.get(fe.vis)!;
      const fp = map.get(fe.fro)!;
      const prog = easeOutCubic(clamp01(stepBeatT / EXPLORE));
      const pts = [
        { x: vp.x, y: vp.y },
        { x: fp.x, y: fp.y },
      ];
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.15;
      ctx.lineCap = "round";
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
      strokePolylineProgress(ctx, pts, prog);
      ctx.restore();
      // Traveling bright dot: rides the tip while stroking, then loops idle.
      const f = prog < 1 ? prog : (env.elapsedMs % 1400) / 1400;
      const dot = pointAlongPolyline(pts, f);
      ctx.save();
      ctx.globalAlpha = prog < 1 ? 1 : 0.9 * Math.sin(Math.PI * f);
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9;
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, unit * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });

  // Final path polyline (drawn on when its step lands, then glow-sweeps).
  if (pathStep >= 0 && pathIds.length >= 2) {
    const pts = pathIds.map((id) => map.get(id)).filter((n): n is NodeLayout => !!n).map((n) => ({ x: n.x, y: n.y }));
    if (pts.length >= 2) {
      const prog = pathStep === activeStep ? easeOutCubic(clamp01(stepBeatT * 1.8)) : 1;
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.34;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.9 * introIn;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (1.0 + 0.5 * Math.sin(env.elapsedMs / 1000));
      strokePolylineProgress(ctx, pts, prog);
      ctx.restore();
      if (prog >= 1) {
        const f = (env.elapsedMs % 2000) / 2000;
        const dot = pointAlongPolyline(pts, f);
        ctx.save();
        ctx.globalAlpha = 0.95 * Math.sin(Math.PI * f);
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 1.1;
        ctx.fillStyle = "#eaf6ff";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Weight chips at edge midpoints, above the path so they stay legible.
  for (const e of scene.edges) {
    if (e.weight == null) continue;
    const a = map.get(e.from);
    const b = map.get(e.to);
    if (!a || !b) continue;
    drawWeightChip(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, String(e.weight), unit, introIn * 0.85);
  }

  // Nodes on top.
  scene.nodes.forEach((node, ni) => {
    const nl = map.get(node.id);
    if (!nl) return;
    const nodeIn = enterT(env, 340, 120 + ni * 45);
    if (nodeIn <= 0) return;
    const isVisited = visited.has(node.id);
    const isFrontier = frontier.has(node.id) && !isVisited;

    // Pop only on the step this node is first visited.
    let scale = easeOutBack(nodeIn);
    if (isVisited && visitStep.get(node.id) === activeStep) {
      const vIdx = scene.steps[activeStep].visit.indexOf(node.id);
      const n = Math.max(scene.steps[activeStep].visit.length, 1);
      const local = clamp01((stepBeatT - (vIdx / n) * 0.35) / 0.35);
      scale *= 1 + 0.08 * Math.sin(Math.PI * easeOutBack(local));
    }

    // Frontier: secondary expanding pulse ring.
    if (isFrontier) {
      const ringF = (env.elapsedMs % 1300) / 1300;
      const g = nl.r * (0.08 + 0.5 * easeOutCubic(ringF));
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - ringF) * introIn;
      ctx.strokeStyle = secondary;
      ctx.lineWidth = unit * 0.08;
      ctx.beginPath();
      ctx.arc(nl.x, nl.y, nl.r + g, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = (isVisited ? 1 : isFrontier ? 0.9 : GHOST_NODE) * introIn * clamp01(nodeIn * 2);
    ctx.translate(nl.x, nl.y);
    ctx.scale(scale, scale);
    ctx.translate(-nl.x, -nl.y);

    if (isVisited) {
      ctx.shadowColor = active === offset + (visitStep.get(node.id) ?? -2) ? accentGlow : "transparent";
      ctx.shadowBlur = active === offset + (visitStep.get(node.id) ?? -2) ? unit * 1.0 : 0;
    }
    ctx.beginPath();
    ctx.arc(nl.x, nl.y, nl.r, 0, Math.PI * 2);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (isVisited) {
      ctx.beginPath();
      ctx.arc(nl.x, nl.y, nl.r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(accent, 0.16);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(nl.x, nl.y, nl.r, 0, Math.PI * 2);
    ctx.strokeStyle = isVisited ? accent : isFrontier ? secondary : "rgba(148,163,184,0.45)";
    ctx.lineWidth = isVisited ? unit * 0.12 : isFrontier ? unit * 0.1 : unit * 0.06;
    ctx.stroke();

    const fontPx = fitFontSize(ctx, node.label, { maxW: nl.r * 1.7, startPx: unit * 0.72, minPx: unit * 0.4, weight: 700 });
    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    ctx.fillStyle = isVisited ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(node.label, nl.x, nl.y + fontPx * 0.35);
    ctx.textAlign = "start";
    ctx.restore();
  });

  // Distance chips above nodes.
  for (const node of scene.nodes) {
    const d = dist.get(node.id);
    const nl = map.get(node.id);
    if (!d || !nl) continue;
    const cy = nl.y - nl.r - unit * 0.7;
    const changing = d.changedStep === activeStep;
    const changeT = changing ? clamp01(stepBeatT * 2) : 1;

    if (changing && d.prev) {
      // Old value slides up and fades out.
      ctx.save();
      ctx.globalAlpha = (1 - changeT) * introIn;
      drawDistChip(ctx, nl.x, cy - unit * 0.5 * changeT, d.prev, unit, accent, false);
      ctx.restore();
    }
    const pop = changing ? easeOutBack(changeT) : 1;
    const good = changing && changeT < 0.7;
    ctx.save();
    ctx.globalAlpha = (changing ? changeT : 1) * introIn;
    ctx.translate(nl.x, cy);
    ctx.scale(pop, pop);
    ctx.translate(-nl.x, -cy);
    drawDistChip(ctx, nl.x, cy, d.value, unit, good ? THEME.good : accent, true);
    ctx.restore();
  }
  ctx.textAlign = "start";
}

function drawDistChip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, unit: number, fill: string, glow: boolean) {
  ctx.save();
  ctx.font = `800 ${unit * 0.6}px ${FONT_MONO}`;
  const tw = ctx.measureText(text).width;
  const w = tw + unit * 0.66;
  const h = unit * 0.98;
  if (glow) {
    ctx.shadowColor = rgba(fill, 0.5);
    ctx.shadowBlur = unit * 0.4;
  }
  roundRect(ctx, x - w / 2, y - h / 2, w, h, unit * 0.24);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#06121a";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + unit * 0.22);
  ctx.textAlign = "start";
  ctx.restore();
}

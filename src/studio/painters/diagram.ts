import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  sub,
  clamp01,
  wrapText,
  roundRect,
  drawArrowhead,
  drawSceneTitle,
  strokePolylineProgress,
  beatWindow,
  activeBeatIndex,
  type Layout,
} from "./common";
import type { PaintEnv } from "./index";

type DiagramScene = Extract<Scene, { kind: "diagram" }>;
type Node = DiagramScene["nodes"][number];
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const GRID = 12;

type GridMap = { ox: number; oy: number; cw: number; ch: number };

/**
 * Models rarely use the full 12x12 grid — un-remapped, a diagram drawn in rows
 * 0-6 bunches at the top of a 9:16 frame. Center the used extent and scale it
 * up modestly (never distorting node aspect more than the grid itself does).
 */
function gridMap(nodes: Node[], layout: Layout, titleBand: number): GridMap {
  const areaX = layout.contentX;
  const areaY = layout.contentY + titleBand;
  const areaW = layout.contentW;
  const areaH = layout.contentH - titleBand;
  const cellW = areaW / GRID;
  const cellH = areaH / GRID;
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  const usedW = Math.max(maxX - minX, 1);
  const usedH = Math.max(maxY - minY, 1);
  const f = Math.min(GRID / usedW, GRID / usedH, 1.3);
  const cw = cellW * f;
  const ch = cellH * f;
  return {
    cw,
    ch,
    ox: areaX + (areaW - usedW * cw) / 2 - minX * cw,
    oy: areaY + (areaH - usedH * ch) / 2 - minY * ch,
  };
}

function nodeRect(node: Node, map: GridMap): Rect {
  const pad = Math.min(map.cw, map.ch) * 0.12;
  const x = map.ox + node.x * map.cw + pad;
  const y = map.oy + node.y * map.ch + pad;
  const w = node.w * map.cw - pad * 2;
  const h = node.h * map.ch - pad * 2;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/** Scene-progress fraction at which each node first appears (start of its reveal step's beat). */
function revealTimes(scene: DiagramScene, env: PaintEnv, offset: number, totalBeats: number): Map<string, number> {
  const times = new Map<string, number>();
  scene.steps.forEach((step, k) => {
    const at = beatWindow(env.beats, offset + k, totalBeats).start;
    for (const nodeId of step.reveal) if (!times.has(nodeId)) times.set(nodeId, at);
  });
  const firstAt = beatWindow(env.beats, offset, totalBeats).start;
  for (const node of scene.nodes) if (!times.has(node.id)) times.set(node.id, firstAt);
  return times;
}

function arrowPath(from: Rect, to: Rect): { x: number; y: number }[] {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const start = { x: dx >= 0 ? from.x + from.w : from.x, y: from.cy };
    const end = { x: dx >= 0 ? to.x : to.x + to.w, y: to.cy };
    if (Math.abs(dy) < from.h / 2) return [start, { x: end.x, y: start.y }];
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  const start = { x: from.cx, y: dy >= 0 ? from.y + from.h : from.y };
  const end = { x: to.cx, y: dy >= 0 ? to.y : to.y + to.h };
  if (Math.abs(dx) < from.w / 2) return [start, { x: start.x, y: end.y }];
  const midY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

export function paintDiagram(ctx: CanvasRenderingContext2D, scene: DiagramScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentW, contentY } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env.p, accent) + unit * 0.4;
  const map = gridMap(scene.nodes, layout, titleBand);
  const rects = new Map<string, Rect>();
  for (const node of scene.nodes) rects.set(node.id, nodeRect(node, map));
  const reveals = revealTimes(scene, env, offset, totalBeats);
  const highlights = activeStep >= 0 && !inTail ? new Set(scene.steps[Math.min(activeStep, scene.steps.length - 1)]?.highlight ?? []) : new Set<string>();

  for (const arrow of scene.arrows) {
    const from = rects.get(arrow.from);
    const to = rects.get(arrow.to);
    if (!from || !to) continue;
    const startAt = Math.max(reveals.get(arrow.from) ?? 0, reveals.get(arrow.to) ?? 0) + 0.02;
    const t = easeOutCubic(sub(env.p, startAt, 0.09));
    if (t <= 0) continue;

    const pts = arrowPath(from, to);
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = unit * 0.14;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.3;
    const tip = strokePolylineProgress(ctx, pts, t);
    ctx.shadowBlur = 0;
    if (t > 0.15) drawArrowhead(ctx, tip.x, tip.y, tip.angle, unit * 0.55);

    if (arrow.label && t >= 1) {
      const mid = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[Math.floor(pts.length / 2) - 1];
      const labelIn = sub(env.p, startAt + 0.09, 0.08);
      ctx.globalAlpha = labelIn;
      ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
      const tw = ctx.measureText(arrow.label).width;
      roundRect(ctx, mid.x - tw / 2 - unit * 0.4, mid.y - unit * 0.55, tw + unit * 0.8, unit * 1.1, unit * 0.3);
      ctx.fillStyle = "#0a0e13";
      ctx.fill();
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(arrow.label, mid.x, mid.y + unit * 0.22);
      ctx.textAlign = "start";
    }
    ctx.restore();
  }

  for (const node of scene.nodes) {
    const rect = rects.get(node.id)!;
    const revealAt = reveals.get(node.id) ?? 0;
    const t = sub(env.p, revealAt, 0.1);
    if (t <= 0) {
      // Blueprint ghost: before its reveal the node is faintly present, so an
      // intro beat never plays over an empty frame and reveals still pop.
      const ghostIn = easeOutCubic(sub(env.p, 0, 0.1));
      if (ghostIn <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.14 * ghostIn;
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, unit * 0.45);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,0.7)";
      ctx.lineWidth = unit * 0.05;
      ctx.setLineDash([unit * 0.35, unit * 0.3]);
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, unit * 0.45);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.22 * ghostIn;
      ctx.fillStyle = THEME.textDim;
      const gpx = unit * 0.72;
      ctx.font = `700 ${gpx}px ${FONT_SANS}`;
      const gLines = wrapText(ctx, node.label, rect.w - unit * 0.8).slice(0, 2);
      ctx.textAlign = "center";
      const gLineH = gpx * 1.25;
      const gStartY = rect.cy - ((gLines.length - 1) * gLineH) / 2 + gpx * 0.35;
      gLines.forEach((line, i) => ctx.fillText(line, rect.cx, gStartY + i * gLineH));
      ctx.textAlign = "start";
      ctx.restore();
      continue;
    }
    const pop = easeOutBack(clamp01(t));
    const highlighted = highlights.has(node.id);
    const dimmed = !highlighted && highlights.size > 0;
    const pulse = highlighted ? 1 + 0.015 * Math.sin(env.elapsedMs / 180) : 1;

    ctx.save();
    // Entrance fade only — a revealed node is always fully opaque so arrows
    // never bleed through it and its border never washes out. "Dimmed" is
    // conveyed with muted colours below, not transparency.
    ctx.globalAlpha = clamp01(t * 1.6);
    ctx.translate(rect.cx, rect.cy);
    ctx.scale(pop * pulse, pop * pulse);
    ctx.translate(-rect.cx, -rect.cy);

    if (highlighted) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 1.1;
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = unit * 0.5;
      ctx.shadowOffsetY = 4;
    }
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, unit * 0.45);
    ctx.fillStyle = highlighted || node.accent ? "#0e2433" : dimmed ? "#0b0f15" : THEME.panel;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // Border is always drawn with real, visible contrast — even when dimmed.
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, unit * 0.45);
    ctx.strokeStyle = highlighted
      ? accent
      : node.accent
        ? accentGlow
        : dimmed
          ? "rgba(148,163,184,0.28)"
          : "rgba(148,163,184,0.55)";
    ctx.lineWidth = highlighted ? unit * 0.13 : node.accent ? unit * 0.09 : unit * 0.06;
    ctx.stroke();

    ctx.fillStyle = dimmed ? THEME.textDim : THEME.text;
    let fontPx = unit * 0.78;
    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    let lines = wrapText(ctx, node.label, rect.w - unit * 0.8);
    if (lines.length > 2) {
      fontPx = unit * 0.62;
      ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
      lines = wrapText(ctx, node.label, rect.w - unit * 0.7).slice(0, 2);
    }
    ctx.textAlign = "center";
    const lineH = fontPx * 1.25;
    const startY = rect.cy - ((lines.length - 1) * lineH) / 2 + fontPx * 0.35;
    lines.forEach((line, i) => ctx.fillText(line, rect.cx, startY + i * lineH));
    ctx.restore();
  }
  ctx.textAlign = "start";
}

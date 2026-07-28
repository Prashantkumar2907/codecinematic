import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  sub,
  clamp01,
  enterT,
  idle,
  wrapText,
  roundRect,
  drawArrowhead,
  drawSceneTitle,
  strokePolylineProgress,
  pointAlongPolyline,
  beatWindow,
  beatT,
  activeBeatIndex,
  variantOf,
  type Layout,
} from "./common";
import { drawIcon, isVectorIcon } from "./icons";
import type { PaintEnv } from "./index";

type DiagramScene = Extract<Scene, { kind: "diagram" }>;
type Node = DiagramScene["nodes"][number];
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };
type Pt = { x: number; y: number };
type NodeShape = "rounded" | "pill" | "hex";

const GRID = 12;

const NODE_SHAPES: NodeShape[] = ["rounded", "pill", "hex"];

/** Build a node outline path (no fill/stroke) — family is picked once per scene. */
function nodePath(ctx: CanvasRenderingContext2D, rect: Rect, shape: NodeShape, unit: number) {
  const { x, y, w, h } = rect;
  if (shape === "pill") {
    roundRect(ctx, x, y, w, h, h / 2);
    return;
  }
  if (shape === "hex") {
    const indent = Math.min(h * 0.5, w * 0.28);
    ctx.beginPath();
    ctx.moveTo(x + indent, y);
    ctx.lineTo(x + w - indent, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w - indent, y + h);
    ctx.lineTo(x + indent, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
    return;
  }
  roundRect(ctx, x, y, w, h, unit * 0.45);
}

/** Quadratic bow between two anchors, SAMPLED to a polyline so the draw-on and
 *  flowing-dot animations (which walk polylines) work unchanged on curves. */
function curvedPath(a: Pt, b: Pt): Pt[] {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = len * 0.2; // perpendicular control-point offset at the midpoint
  const cx = mx - (dy / len) * off;
  const cy = my + (dx / len) * off;
  const N = 20;
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y });
  }
  return pts;
}

/** Shift a polyline sideways by d, for the two rails of a "double" arrow. */
function offsetPolyline(pts: Pt[], d: number): Pt[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (-dy / len) * d, y: p.y + (dx / len) * d };
  });
}

type GridMap = { ox: number; oy: number; cw: number; ch: number; rot: boolean; maxYo: number };

/**
 * Rotate a node's grid box 90° so a graph authored wide reads tall (and vice
 * versa). A left→right chain becomes top→bottom: original column x maps to the
 * display row, original row y maps to the display column. Positions rotate;
 * glyphs stay upright (they are drawn from the resulting pixel rect).
 */
function toDisp(x: number, y: number, w: number, h: number, rot: boolean, maxYo: number) {
  if (!rot) return { x, y, w, h };
  return { x: maxYo - (y + h), y: x, w: h, h: w };
}

/** Whether the graph's long axis is opposed to the frame's — the case where a
 *  straight fit leaves big empty margins (wide graph in a 9:16 short). */
function shouldRotate(nodes: Node[], vertical: boolean): boolean {
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  const aspect = Math.max(maxX - minX, 1) / Math.max(maxY - minY, 1);
  return vertical ? aspect >= 1.5 : aspect <= 0.66;
}

/**
 * Models rarely use the full 12x12 grid — un-remapped, a diagram drawn in rows
 * 0-6 bunches at the top of a 9:16 frame. Center the used extent and scale it
 * up modestly (never distorting node aspect more than the grid itself does).
 * When `rot`, node coordinates are rotated first so a wide graph fills a tall
 * frame instead of sitting as a small band in the middle.
 */
function gridMap(nodes: Node[], layout: Layout, titleBand: number, rot: boolean): GridMap {
  const areaX = layout.contentX;
  const areaY = layout.contentY + titleBand;
  const areaW = layout.contentW;
  // Vertical: keep the lowest grid row above the caption band (bottom ~14%).
  let areaH = layout.contentH - titleBand;
  if (layout.vertical) areaH = Math.min(areaH, layout.h * 0.86 - areaY);
  const cellW = areaW / GRID;
  const cellH = areaH / GRID;
  const maxYo = Math.max(...nodes.map((n) => n.y + n.h));
  const disp = nodes.map((n) => toDisp(n.x, n.y, n.w, n.h, rot, maxYo));
  const minX = Math.min(...disp.map((d) => d.x));
  const maxX = Math.max(...disp.map((d) => d.x + d.w));
  const minY = Math.min(...disp.map((d) => d.y));
  const maxY = Math.max(...disp.map((d) => d.y + d.h));
  const usedW = Math.max(maxX - minX, 1);
  const usedH = Math.max(maxY - minY, 1);
  const f = Math.min(GRID / usedW, GRID / usedH, 1.3);
  const cw = cellW * f;
  const ch = cellH * f;
  return {
    cw,
    ch,
    rot,
    maxYo,
    ox: areaX + (areaW - usedW * cw) / 2 - minX * cw,
    oy: areaY + (areaH - usedH * ch) / 2 - minY * ch,
  };
}

function nodeRect(node: Node, map: GridMap): Rect {
  const d = toDisp(node.x, node.y, node.w, node.h, map.rot, map.maxYo);
  const pad = Math.min(map.cw, map.ch) * 0.12;
  const x = map.ox + d.x * map.cw + pad;
  const y = map.oy + d.y * map.ch + pad;
  const w = d.w * map.cw - pad * 2;
  const h = d.h * map.ch - pad * 2;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/**
 * Grid position of every node at scene progress p, applying step "move"
 * animations in order: past beats land on their targets, the active beat
 * glides (eased) toward its target, future beats leave positions untouched.
 * Powers sliding-window pointers, queue shifts and swaps.
 */
function positionsAt(
  scene: DiagramScene,
  env: PaintEnv,
  offset: number,
  totalBeats: number
): Map<string, { x: number; y: number }> {
  const pos = new Map(scene.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  scene.steps.forEach((step, k) => {
    if (!step.move.length) return;
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0) return;
    // Glide within the first ~70% of the beat, then rest at the target.
    const e = easeInOutCubic(clamp01(t * 1.45));
    for (const mv of step.move) {
      const from = pos.get(mv.node);
      if (!from) continue;
      pos.set(mv.node, { x: from.x + (mv.x - from.x) * e, y: from.y + (mv.y - from.y) * e });
    }
  });
  return pos;
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
  const { unit, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  // Node-shape family is a deterministic, purely-visual per-scene flourish.
  const nodeShape = NODE_SHAPES[variantOf(scene.id, NODE_SHAPES.length)];

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const extents: Node[] = [
    ...scene.nodes,
    ...scene.steps.flatMap((st) =>
      st.move.flatMap((mv) => {
        const n = scene.nodes.find((x) => x.id === mv.node);
        return n ? [{ ...n, x: mv.x, y: mv.y }] : [];
      })
    ),
  ];
  const rot = shouldRotate(extents, layout.vertical);
  
  const minX = Math.min(...extents.map((n) => n.x));
  const maxX = Math.max(...extents.map((n) => n.x + n.w));
  const minY = Math.min(...extents.map((n) => n.y));
  const maxY = Math.max(...extents.map((n) => Math.max(n.y + n.h, n.y + 2)));
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  
  const areaX = layout.contentX;
  const areaY = layout.contentY + titleBand;
  const areaW = layout.contentW;
  let areaH = layout.contentH - titleBand;
  if (layout.vertical) areaH = Math.min(areaH, layout.h * 0.86 - areaY);
  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };
  
  const spreadX = vertical ? 3.5 : 5.5;
  const spreadZ = vertical ? 5.5 : 3.5;
  
  const worldPos = (gx: number, gy: number) => {
    const cx = (gx - minX) / rangeX - 0.5;
    const cy = (gy - minY) / rangeY - 0.5;
    return rot ? new THREE.Vector3(cy * spreadX * 2, 0, cx * spreadZ * 2) 
               : new THREE.Vector3(cx * spreadX * 2, 0, cy * spreadZ * 2);
  };

  const key = scene.id + "-diag3d";
  const reveals = revealTimes(scene, env, offset, totalBeats);
  const livePos = positionsAt(scene, env, offset, totalBeats);
  const highlights = activeStep >= 0 && !inTail ? new Set(scene.steps[Math.min(activeStep, scene.steps.length - 1)]?.highlight ?? []) : new Set<string>();
  const ghostIn = easeOutCubic(enterT(env, 420));

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 13 : 10, vertical ? 9 : 7);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, "rgba(148,163,184,0.5)");
    
    const grid = new THREE.GridHelper(Math.max(spreadX, spreadZ) * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);
    
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 4, spreadZ * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models = scene.nodes.map((n) => {
      // Different shapes map to cylinders vs blocks
      const isPill = nodeShape === "pill";
      const isCyl = nodeShape === "hex" || isPill; // hex placeholder as cylinder
      const blockColor = n.accent ? accent : "#1e293b";
      const g = isCyl ? makeCylinder(1.2, 0.5, blockColor, accent) 
                      : makeBlock(2.2 * (n.w/2), 0.5, 2.2 * (n.h/2), blockColor, n.accent ? accentGlow : accent);
      s.add(g);
      return { id: n.id, mesh: g, node: n };
    });

    const update = (elapsedMs: number) => {
      models.forEach(({ id, mesh, node }) => {
        const revealAt = reveals.get(id) ?? 0;
        const t = sub(env.p, revealAt, 0.1);
        const pop = easeOutBack(clamp01(t));
        const highlighted = highlights.has(id);
        const pulse = highlighted ? 1 + 0.018 * idle(env, 1600) : 1;
        
        mesh.scale.setScalar(Math.max(0.001, pop * pulse));
        mesh.visible = ghostIn > 0 || t > 0.01;
        if (t <= 0) {
            mesh.scale.setScalar(Math.max(0.001, 0.9 * ghostIn));
        }
        
        const p = livePos.get(id) ?? node;
        const wp = worldPos(p.x + node.w/2, p.y + node.h/2);
        mesh.position.copy(wp);
        mesh.position.y = (t <= 0 ? -0.4 : 0) + (highlighted ? 0.2 : 0) + Math.sin(elapsedMs / 1500 + p.x) * 0.05;
        
        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.Material;
                mat.transparent = true;
                mat.opacity = t <= 0 ? 0.2 * ghostIn : 1.0;
            }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return;

  const rects = new Map<string, Rect>();
  for (const node of scene.nodes) {
    const p = livePos.get(node.id) ?? node;
    const centerWorld = worldPos(p.x + node.w/2, p.y + node.h/2);
    // Rough 2D extent matching the 3D block
    const p0 = projectToRect(cam, centerWorld.clone().add(new THREE.Vector3(-1.1 * (node.w/2), 0, -1.1 * (node.h/2))), rect);
    const p1 = projectToRect(cam, centerWorld.clone().add(new THREE.Vector3(1.1 * (node.w/2), 0, 1.1 * (node.h/2))), rect);
    
    const rw = Math.abs(p1.x - p0.x);
    const rh = Math.abs(p1.y - p0.y);
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    rects.set(node.id, { x: cx - rw/2, y: cy - rh/2, w: rw, h: rh, cx, cy });
  }

  for (const arrow of scene.arrows) {
    const from = rects.get(arrow.from);
    const to = rects.get(arrow.to);
    if (!from || !to) continue;
    const startAt = Math.max(reveals.get(arrow.from) ?? 0, reveals.get(arrow.to) ?? 0) + 0.02;
    const t = easeOutCubic(sub(env.p, startAt, 0.09));
    if (t <= 0) continue;

    const straight = arrowPath(from, to);
    const pts = arrow.curve ? curvedPath(straight[0], straight[straight.length - 1]) : straight;
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.3;
    let tip: { x: number; y: number; angle: number };
    if (arrow.style === "double") {
      // Two thin parallel rails; the arrowhead lands on the centre line.
      ctx.lineWidth = unit * 0.06;
      strokePolylineProgress(ctx, offsetPolyline(pts, unit * 0.09), t);
      strokePolylineProgress(ctx, offsetPolyline(pts, -unit * 0.09), t);
      const p0 = pointAlongPolyline(pts, t);
      const p1 = pointAlongPolyline(pts, Math.min(1, t + 0.03));
      tip = { x: p0.x, y: p0.y, angle: Math.atan2(p1.y - p0.y, p1.x - p0.x) };
    } else {
      ctx.lineWidth = unit * 0.14;
      if (arrow.style === "dashed") ctx.setLineDash([unit * 0.42, unit * 0.3]);
      tip = strokePolylineProgress(ctx, pts, t);
      ctx.setLineDash([]);
    }
    ctx.shadowBlur = 0;
    if (t > 0.15) drawArrowhead(ctx, tip.x, tip.y, tip.angle, unit * 0.55);

    // Flowing pulse: once the arrow is fully drawn, a glowing dot travels along
    // it on a 1.6s loop — visualises flow (data, blood, water, money, packets).
    // Phase from elapsedMs keeps re-renders identical.
    if (t >= 1) {
      const f = ((env.elapsedMs % 1600) / 1600);
      const dot = pointAlongPolyline(pts, f);
      ctx.save();
      ctx.globalAlpha = 0.9 * Math.sin(Math.PI * f); // fade in/out at the ends
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9;
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, unit * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
      if (ghostIn <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.14 * ghostIn;
      nodePath(ctx, rect, nodeShape, unit);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,0.7)";
      ctx.lineWidth = unit * 0.05;
      ctx.setLineDash([unit * 0.35, unit * 0.3]);
      nodePath(ctx, rect, nodeShape, unit);
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
    const pulse = highlighted ? 1 + 0.018 * idle(env, 1600) : 1;

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
      ctx.shadowBlur = unit * (0.95 + 0.3 * idle(env, 1600));
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = unit * 0.5;
      ctx.shadowOffsetY = 4;
    }
    nodePath(ctx, rect, nodeShape, unit);
    ctx.fillStyle = highlighted || node.accent ? "#0e2433" : dimmed ? "#0b0f15" : THEME.panel;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // Border is always drawn with real, visible contrast — even when dimmed.
    nodePath(ctx, rect, nodeShape, unit);
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
    let fontPx = unit * (vertical ? 0.82 : 0.78);
    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    let lines = wrapText(ctx, node.label, rect.w - unit * 0.8);
    if (lines.length > 2) {
      fontPx = unit * (vertical ? 0.66 : 0.62);
      ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
      lines = wrapText(ctx, node.label, rect.w - unit * 0.7).slice(0, 2);
    }
    ctx.textAlign = "center";
    const lineH = fontPx * 1.25;
    let startY = rect.cy - ((lines.length - 1) * lineH) / 2 + fontPx * 0.35;
    if (node.icon) {
      // Vector concept icon (server/database/…) when recognised, else emoji —
      // both sit above the label as one centred block.
      const iconPx = Math.min(rect.h * 0.46, unit * 1.5);
      const blockH = iconPx * 1.15 + lines.length * lineH;
      const top = rect.cy - blockH / 2;
      if (isVectorIcon(node.icon)) {
        drawIcon(ctx, node.icon, rect.cx, top + iconPx * 0.5, iconPx, env, node.accent ? env.palette.accent : env.palette.secondary);
      } else {
        ctx.font = `${iconPx}px ${FONT_SANS}`;
        ctx.fillText(node.icon, rect.cx, top + iconPx * 0.95);
      }
      ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
      startY = top + iconPx * 1.2 + fontPx * 0.8;
    }
    lines.forEach((line, i) => ctx.fillText(line, rect.cx, startY + i * lineH));
    ctx.restore();
  }

  // Arrow labels go on TOP of everything — drawn inside the arrow pass they
  // were painted over by node boxes whenever the layout was tight.
  for (const arrow of scene.arrows) {
    if (!arrow.label) continue;
    const from = rects.get(arrow.from);
    const to = rects.get(arrow.to);
    if (!from || !to) continue;
    const startAt = Math.max(reveals.get(arrow.from) ?? 0, reveals.get(arrow.to) ?? 0) + 0.02;
    if (sub(env.p, startAt, 0.09) < 1) continue;
    const straight = arrowPath(from, to);
    const pts = arrow.curve ? curvedPath(straight[0], straight[straight.length - 1]) : straight;
    const mid = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[Math.floor(pts.length / 2) - 1];
    const labelIn = sub(env.p, startAt + 0.09, 0.08);
    ctx.save();
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
    ctx.restore();
  }
  ctx.textAlign = "start";
}

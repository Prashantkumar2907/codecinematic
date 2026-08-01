import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  STROKE,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  lerpColor,
  rgba,
  shade,
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
type Area = { x: number; y: number; w: number; h: number };
type NodeShape = "rounded" | "pill" | "hex";

/** Cell growth cap, so a two-node graph becomes readable rather than a billboard. */
const CELL_MAX_UNITS = 4;
/** Gap between neighbouring grid cells, as a fraction of one cell. */
const CELL_PAD = 0.12;
/**
 * How far the roomier axis may stretch past a square fit. A strictly uniform cell
 * keeps node proportions exact but leaves ~38% of the frame width empty, because
 * a graph's grid aspect never matches 16:9 or 9:16; 1.35 fills the frame while
 * keeping an authored 3×2 card recognisably 3:2 rather than a letterbox.
 */
const CELL_ASPECT_MAX = 1.35;

/**
 * The camera must sit ON-AXIS at (0,0,D). `qa/ledger.json` → systemic
 * `2d-layout-round-tripped-through-camera`: under a tilted camera the ground
 * plane maps non-linearly, so a pixel rect projected into world space does not
 * come back to the same pixels — the 2D chrome and the 3D body separate. On-axis,
 * `projectToRect` is affine on any z=const plane, so `mappingAt` below is an
 * exact invertible pixel↔world map. Never bob or lift a slab after placement;
 * the pixel chrome cannot follow it.
 */
const CAM_DIST = 12;
/**
 * Shallow on purpose. The slab's side faces splay away from the optical axis, so
 * a node near the frame edge shows a sliver of its own side — at 0.3 that sliver
 * was ~10 px and read as a misregistered second border.
 */
const SLAB_DEPTH = 0.12;
const EDGE_OPACITY = 0.6;
/** Accent nodes tint their slab face; the accent itself lives on the border. */
const FACE_TINT = 0.22;
/** `THEME.panel` alone is within 4 RGB steps of the background, so an idle card
 *  read as a hole with an outline. Lift it just off the backdrop. */
const IDLE_FACE_LIFT = 0.09;
const DIM_SHADE = -0.35;

const GHOST_IN_MS = 420;
const GHOST_FILL_A = 0.14;
const GHOST_LABEL_A = 0.22;
/** Scene-progress length of a node's entrance, and of an arrow's draw-on. */
const NODE_IN_P = 0.1;
const ARROW_IN_P = 0.09;
const ARROW_DELAY_P = 0.02;
const FLOW_MS = 1600;
const PULSE_MS = 1600;
const HL_PULSE = 0.018;

const ICON_H_FRACTION = 0.4;
const ICON_MAX_UNITS = 1.4;
const LABEL_MAX_LINES = 3;
const FIT_TRIES = 3;
const FIT_FONT_SHRINK = 0.85;
const FIT_ICON_SHRINK = 0.8;

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

type GridMap = { ox: number; oy: number; cw: number; ch: number; rot: boolean };

/**
 * Rotate a node's grid box 90° so a graph authored wide reads tall (and vice
 * versa). A left→right chain becomes top→bottom: original column x maps to the
 * display row, original row y maps to the display column. Positions rotate;
 * glyphs stay upright (they are drawn from the resulting pixel rect).
 *
 * The transpose is deliberately not a clockwise rotation: authored-upper must
 * stay display-LEFT, so the same script reads in the same order in a long and in
 * a short. Mirroring it put `API Server 2` to the left of `API Server 1`.
 */
function toDisp(x: number, y: number, w: number, h: number, rot: boolean) {
  if (!rot) return { x, y, w, h };
  return { x: y, y: x, w: h, h: w };
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
 * The band the graph may occupy. ONE source for both the pixel grid and the 3D
 * viewport rect — they used to be computed separately from the same
 * `layout.h * 0.86` literal, which is how `gridMap` and the live path drifted.
 * `layout.safeBottom` is caption-aware (9:16 → 69% of height, 16:9 → 80%), so
 * the lowest row can no longer land under the burned-in caption or the YouTube UI.
 */
function contentArea(layout: Layout, titleBand: number): Area {
  const y = layout.contentY + titleBand;
  return { x: layout.contentX, y, w: layout.contentW, h: Math.max(layout.unit, layout.safeBottom - y) };
}

/**
 * Fit the graph's used grid extent into `area`. Models rarely use the full grid —
 * un-remapped, a diagram drawn in rows 0-6 bunches at the top of a 9:16 frame —
 * so the used extent is centred and scaled to fill the tighter axis, then the
 * roomier axis is allowed to stretch up to `CELL_ASPECT_MAX` so the frame is used.
 */
function gridMap(nodes: Node[], area: Area, unit: number, rot: boolean): GridMap {
  const disp = nodes.map((n) => toDisp(n.x, n.y, n.w, n.h, rot));
  const minX = Math.min(...disp.map((d) => d.x));
  const maxX = Math.max(...disp.map((d) => d.x + d.w));
  const minY = Math.min(...disp.map((d) => d.y));
  const maxY = Math.max(...disp.map((d) => d.y + d.h));
  const usedW = Math.max(maxX - minX, 1);
  const usedH = Math.max(maxY - minY, 1);
  const fit = Math.min(area.w / usedW, area.h / usedH, unit * CELL_MAX_UNITS);
  const cw = Math.min(area.w / usedW, fit * CELL_ASPECT_MAX);
  const ch = Math.min(area.h / usedH, fit * CELL_ASPECT_MAX);
  return {
    cw,
    ch,
    rot,
    ox: area.x + (area.w - usedW * cw) / 2 - minX * cw,
    oy: area.y + (area.h - usedH * ch) / 2 - minY * ch,
  };
}

/** Pixel rect of a node at grid position (x,y). Cells are padded, so two
 *  neighbouring nodes can never touch — the overlap the projection used to cause. */
function nodeRect(x: number, y: number, w: number, h: number, map: GridMap): Rect {
  const d = toDisp(x, y, w, h, map.rot);
  const pad = Math.min(map.cw, map.ch) * CELL_PAD;
  const rx = map.ox + d.x * map.cw + pad;
  const ry = map.oy + d.y * map.ch + pad;
  const rw = d.w * map.cw - pad * 2;
  const rh = d.h * map.ch - pad * 2;
  return { x: rx, y: ry, w: rw, h: rh, cx: rx + rw / 2, cy: ry + rh / 2 };
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

function arrowPath(from: Rect, to: Rect): Pt[] {
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

/**
 * Anchor for an arrow's label. The midpoint of a route very often sits inside a
 * node — `writes` landed across the word `Database` — so step the chip sideways
 * off the line until it clears every box, alternating sides.
 */
function labelSpot(pts: Pt[], boxes: Rect[], chipW: number, chipH: number, step: number): Pt {
  const clear = (p: Pt) =>
    !boxes.some(
      (r) => Math.abs(p.x - r.cx) < r.w / 2 + chipW / 2 && Math.abs(p.y - r.cy) < r.h / 2 + chipH / 2
    );
  /** Point at fraction f along the route, plus k steps along the local normal. */
  const candidate = (f: number, k: number): Pt => {
    const at = pointAlongPolyline(pts, f);
    const ahead = pointAlongPolyline(pts, Math.min(1, f + 0.05));
    const len = Math.hypot(ahead.x - at.x, ahead.y - at.y) || 1;
    return { x: at.x - ((ahead.y - at.y) / len) * step * k, y: at.y + ((ahead.x - at.x) / len) * step * k };
  };
  // Sliding along the route beats pushing far off it — a chip 2 steps out reads as
  // belonging to nothing. Both are tried before either is given up on.
  for (const f of [0.5, 0.36, 0.64, 0.24, 0.76]) {
    for (const k of [0, 1, -1, 2, -2]) {
      const p = candidate(f, k);
      if (clear(p)) return p;
    }
  }
  return candidate(0.5, 2);
}

type NodeState = {
  visible: boolean;
  cx: number;
  cy: number;
  w: number;
  h: number;
  scale: number;
  opacity: number;
  face: string;
  edge: string;
};

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
  const area = contentArea(layout, titleBand);

  // A "move" target can sit outside the authored node extent, so the grid has to
  // be fitted to both — otherwise a node glides off the edge mid-scene.
  const extents: Node[] = [
    ...scene.nodes,
    ...scene.steps.flatMap((st) =>
      st.move.flatMap((mv) => {
        const n = scene.nodes.find((x) => x.id === mv.node);
        return n ? [{ ...n, x: mv.x, y: mv.y }] : [];
      })
    ),
  ];
  const rot = shouldRotate(extents, vertical);
  const map = gridMap(extents, area, unit, rot);

  const reveals = revealTimes(scene, env, offset, totalBeats);
  const livePos = positionsAt(scene, env, offset, totalBeats);
  const highlights =
    activeStep >= 0 && !inTail
      ? new Set(scene.steps[Math.min(activeStep, scene.steps.length - 1)]?.highlight ?? [])
      : new Set<string>();
  const ghostIn = easeOutCubic(enterT(env, GHOST_IN_MS));

  const rects = new Map<string, Rect>(
    scene.nodes.map((node) => {
      const p = livePos.get(node.id) ?? node;
      return [node.id, nodeRect(p.x, p.y, node.w, node.h, map)];
    })
  );

  const states: NodeState[] = scene.nodes.map((node) => {
    const r = rects.get(node.id)!;
    const t = sub(env.p, reveals.get(node.id) ?? 0, NODE_IN_P);
    const highlighted = highlights.has(node.id);
    const dimmed = !highlighted && highlights.size > 0;
    const pulse = highlighted ? 1 + HL_PULSE * idle(env, PULSE_MS) : 1;
    return {
      visible: t > 0,
      cx: r.cx,
      cy: r.cy,
      w: r.w,
      h: r.h,
      scale: Math.max(0.001, easeOutBack(clamp01(t)) * pulse),
      // The slab shares the card's fade so the accent body can never flash ahead
      // of the chrome that is supposed to cover it.
      opacity: clamp01(t * 1.6),
      face:
        highlighted || node.accent
          ? lerpColor(THEME.panel, accent, FACE_TINT)
          : dimmed
            ? shade(THEME.panel, DIM_SHADE)
            : shade(THEME.panel, IDLE_FACE_LIFT),
      edge: highlighted || node.accent ? accent : THEME.textDim,
    };
  });

  // Un-revealed nodes read as a blueprint, so an intro beat never plays over an
  // empty frame and the real reveal still lands. Drawn before the slabs so a
  // ghost cannot sit on top of a node that has already arrived.
  if (ghostIn > 0) {
    for (const node of scene.nodes) {
      if (sub(env.p, reveals.get(node.id) ?? 0, NODE_IN_P) > 0) continue;
      const rect = rects.get(node.id)!;
      ctx.save();
      ctx.globalAlpha = GHOST_FILL_A * ghostIn;
      nodePath(ctx, rect, nodeShape, unit);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.strokeStyle = rgba(THEME.textDim, 0.7);
      ctx.lineWidth = unit * STROKE.thin;
      ctx.setLineDash([unit * 0.35, unit * 0.3]);
      nodePath(ctx, rect, nodeShape, unit);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = GHOST_LABEL_A * ghostIn;
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
    }
  }

  // Connectors are drawn BEFORE the slabs so a route that passes over a third
  // box is hidden by it, which is the z-order a diagram needs. It also means the
  // node body no longer has to be an opaque 2D fill to cover the line ends.
  for (const arrow of scene.arrows) {
    const from = rects.get(arrow.from);
    const to = rects.get(arrow.to);
    if (!from || !to) continue;
    const startAt = Math.max(reveals.get(arrow.from) ?? 0, reveals.get(arrow.to) ?? 0) + ARROW_DELAY_P;
    const t = easeOutCubic(sub(env.p, startAt, ARROW_IN_P));
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
      ctx.lineWidth = unit * STROKE.base;
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
      const f = (env.elapsedMs % FLOW_MS) / FLOW_MS;
      const dot = pointAlongPolyline(pts, f);
      ctx.save();
      ctx.globalAlpha = 0.9 * Math.sin(Math.PI * f); // fade in/out at the ends
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9;
      ctx.fillStyle = THEME.text;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, unit * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), area);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), area);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), area);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  // Per-node state travels through render3D's `context`. `build` runs once per
  // key, so anything its `update` closure reads from here — positions, highlight
  // sets, entrance progress — would otherwise be frozen at frame 0 for the whole
  // scene (`qa/ledger.json` → systemic `frozen-painter-local-output-array`).
  const build = (): ThreeBundle<{ nodes: NodeState[] }> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 36, area.w / area.h, 0.1, 100);
    camera.position.set(0, 0, CAM_DIST);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, THEME.textDim);

    const m = mappingAt(camera, SLAB_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

    // Unit slabs, scaled per frame from the pixel rect, so a node that MOVES or
    // resizes needs no rebuild and stays registered with its 2D chrome.
    const models = scene.nodes.map(() => {
      const g = makeBlock(1, 1, SLAB_DEPTH, THEME.panel, THEME.textDim);
      s.add(g);
      return g;
    });

    const update = (_elapsedMs: number, data?: { nodes: NodeState[] }) => {
      models.forEach((group, i) => {
        const st = data?.nodes[i];
        group.visible = !!st?.visible;
        if (!st?.visible) return;
        const c = toWorld(st.cx, st.cy);
        group.position.set(c.x, c.y, 0);
        group.scale.set((st.w / m.sx) * st.scale, (st.h / m.sy) * st.scale, 1);
        group.traverse((o) => {
          if (o instanceof THREE.LineSegments) {
            const mat = o.material as THREE.LineBasicMaterial;
            mat.transparent = true;
            mat.opacity = EDGE_OPACITY * st.opacity;
            mat.color.set(st.edge);
          } else if (o instanceof THREE.Mesh) {
            const mat = o.material as THREE.MeshPhysicalMaterial;
            mat.transparent = true;
            mat.opacity = st.opacity;
            mat.color.set(st.face);
            mat.emissive.set(st.face);
          }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, "diag3d-" + scene.id, area, build, env.elapsedMs, { nodes: states }, env);
  // Without WebGL the slabs never composite, so the card body has to be filled
  // in 2D. The pixel layout is authoritative either way, so this is the same
  // scene minus the material — not the blank frame an early return would leave.
  const flat = !cam;

  scene.nodes.forEach((node, i) => {
    const st = states[i];
    if (!st.visible) return;
    const rect = rects.get(node.id)!;
    const highlighted = highlights.has(node.id);
    const dimmed = !highlighted && highlights.size > 0;

    ctx.save();
    ctx.globalAlpha = st.opacity;
    ctx.translate(rect.cx, rect.cy);
    ctx.scale(st.scale, st.scale);
    ctx.translate(-rect.cx, -rect.cy);

    if (flat) {
      nodePath(ctx, rect, nodeShape, unit);
      ctx.fillStyle = st.face;
      ctx.fill();
    }

    if (highlighted) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.95 + 0.3 * idle(env, PULSE_MS));
    }
    nodePath(ctx, rect, nodeShape, unit);
    ctx.strokeStyle = highlighted
      ? accent
      : node.accent
        ? accent
        : dimmed
          ? rgba(THEME.textDim, 0.28)
          : rgba(THEME.textDim, 0.55);
    ctx.lineWidth = unit * (highlighted ? STROKE.bold : node.accent ? STROKE.base : STROKE.thin);
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    ctx.fillStyle = dimmed ? THEME.textDim : THEME.text;
    let fontPx = unit * (vertical ? 0.82 : 0.78);
    let iconPx = node.icon ? Math.min(rect.h * ICON_H_FRACTION, unit * ICON_MAX_UNITS) : 0;
    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    let lines = wrapText(ctx, node.label, rect.w - unit * 0.8).slice(0, LABEL_MAX_LINES);
    // An icon plus a two-line label overflows a short card, and the card height
    // comes from the grid, not from the text — so shrink both until the block fits.
    for (let k = 0; k < FIT_TRIES; k++) {
      const blockH = (iconPx ? iconPx * 1.15 : 0) + lines.length * fontPx * 1.25;
      if (blockH <= rect.h - unit * 0.3) break;
      fontPx *= FIT_FONT_SHRINK;
      iconPx *= FIT_ICON_SHRINK;
      ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
      lines = wrapText(ctx, node.label, rect.w - unit * 0.7).slice(0, LABEL_MAX_LINES);
    }

    ctx.textAlign = "center";
    const lineH = fontPx * 1.25;
    let startY = rect.cy - ((lines.length - 1) * lineH) / 2 + fontPx * 0.35;
    if (iconPx > 0 && node.icon) {
      // Vector concept icon (server/database/…) when recognised, else emoji —
      // both sit above the label as one centred block.
      const blockH = iconPx * 1.15 + lines.length * lineH;
      const top = rect.cy - blockH / 2;
      if (isVectorIcon(node.icon)) {
        drawIcon(ctx, node.icon, rect.cx, top + iconPx * 0.5, iconPx, env, node.accent ? accent : env.palette.secondary);
      } else {
        ctx.font = `${iconPx}px ${FONT_SANS}`;
        ctx.fillText(node.icon, rect.cx, top + iconPx * 0.95);
      }
      ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
      startY = top + iconPx * 1.2 + fontPx * 0.8;
    }
    lines.forEach((line, i) => ctx.fillText(line, rect.cx, startY + i * lineH));
    ctx.textAlign = "start";
    ctx.restore();
  });

  // Arrow labels go on TOP of everything — drawn inside the arrow pass they
  // were painted over by node boxes whenever the layout was tight.
  const boxes = [...rects.values()];
  for (const arrow of scene.arrows) {
    if (!arrow.label) continue;
    const from = rects.get(arrow.from);
    const to = rects.get(arrow.to);
    if (!from || !to) continue;
    const startAt = Math.max(reveals.get(arrow.from) ?? 0, reveals.get(arrow.to) ?? 0) + ARROW_DELAY_P;
    if (sub(env.p, startAt, ARROW_IN_P) < 1) continue;
    const straight = arrowPath(from, to);
    const pts = arrow.curve ? curvedPath(straight[0], straight[straight.length - 1]) : straight;
    ctx.save();
    ctx.globalAlpha = sub(env.p, startAt + ARROW_IN_P, 0.08);
    ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
    const tw = ctx.measureText(arrow.label).width;
    const chipW = tw + unit * 0.8;
    const chipH = unit * 1.1;
    const at = labelSpot(pts, boxes, chipW, chipH, unit * 1.1);
    roundRect(ctx, at.x - chipW / 2, at.y - chipH / 2, chipW, chipH, unit * 0.3);
    ctx.fillStyle = THEME.bgBottom;
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = unit * STROKE.hair;
    ctx.stroke();
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(arrow.label, at.x, at.y + unit * 0.22);
    ctx.restore();
  }
  ctx.textAlign = "start";
}

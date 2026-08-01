import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  GLOW,
  RADIUS,
  STROKE,
  easeOutCubic,
  easeOutBack,
  idle,
  clamp01,
  lerpColor,
  shade,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  wrapText,
  roundedCorners,
  strokePolylineProgress,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import { drawIcon, isVectorIcon } from "./icons";
import type { PaintEnv } from "./index";

type TreeScene = Extract<Scene, { kind: "tree" }>;
type TNode = TreeScene["nodes"][number];
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };
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

const SLAB_DEPTH = 0.12;
const EDGE_OPACITY = 0.6;
const ROOT_TINT = 0.3;
const MID_TINT = 0.22;
const LEAF_LIFT = 0.09;
const NODE_MAX_W_UNITS = 6.0;
const NODE_MAX_H_UNITS = 2.0;
const NODE_H_FRACTION = 0.52;
const COL_GAP_UNITS = 0.5;
const PULSE_MS = 1500;

/**
 * ByteByteGo hierarchy tree: tidy auto-layout (the model gives parent pointers, not
 * coordinates), tiered node colours (root → mid → leaf), rounded elbow connectors that
 * draw on as each level reveals, and line-art concept icons. One step per beat.
 *
 * The layout is PIXEL-space and the slabs are mapped onto it. Nodes used to be placed
 * on a y=0 ground plane and projected through a camera at (0, 12, 8): the perspective
 * made leaf nodes twice the width of the root in a hierarchy where every level matters
 * equally, pushed the leaf row off both frame edges and past the caption band, and left
 * the connectors — drawn between projected ground points — running straight through the
 * node boxes. `qa/ledger.json` → systemic `2d-layout-round-tripped-through-camera`.
 */
export function paintTree(ctx: CanvasRenderingContext2D, scene: TreeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const key = scene.id + "-tree3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.5;

  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const childrenOf = (pid: string | null) => scene.nodes.filter((n) => (n.parent ?? null) === pid);
  const root = scene.nodes.find((n) => n.parent == null) ?? scene.nodes[0];
  const depthOf = (n: TNode): number => {
    let d = 0;
    let cur: TNode | undefined = n;
    while (cur && cur.parent != null) {
      cur = byId.get(cur.parent);
      d++;
      if (d > 20) break;
    }
    return d;
  };

  const gx = new Map<string, number>();
  let leafCol = 0;
  const place = (n: TNode) => {
    const kids = childrenOf(n.id);
    if (!kids.length) {
      gx.set(n.id, leafCol++);
      return;
    }
    kids.forEach(place);
    const xs = kids.map((k) => gx.get(k.id)!);
    gx.set(n.id, (Math.min(...xs) + Math.max(...xs)) / 2);
  };
  place(root);
  const cols = Math.max(1, leafCol);
  const maxDepth = Math.max(0, ...scene.nodes.map(depthOf));

  const revealStepOf = new Map<string, number>();
  scene.steps.forEach((st, k) =>
    st.reveal.forEach((id) => {
      if (!revealStepOf.has(id)) revealStepOf.set(id, k);
    })
  );
  const nodeAppear = (id: string): number => {
    const k = revealStepOf.get(id) ?? 0;
    if (activeStep < k) return 0;
    if (activeStep > k) return 1;
    return easeOutCubic(clamp01(beatT(env.beats, offset + k, totalBeats, env.p) * 1.6));
  };

  const top = contentY + band;
  const availH = Math.max(unit * 4, safeBottom - top);
  const rect = { x: contentX, y: top, w: contentW, h: availH };

  const rowPitch = availH / (maxDepth + 1);
  const colPitch = contentW / cols;
  const nodeW = Math.min(colPitch - unit * COL_GAP_UNITS, unit * NODE_MAX_W_UNITS);
  const nodeH = Math.min(rowPitch * NODE_H_FRACTION, unit * NODE_MAX_H_UNITS);
  const nodeRect = (n: TNode): Rect => {
    const cx = contentX + (gx.get(n.id)! + 0.5) * colPitch;
    const cy = top + (depthOf(n) + 0.5) * rowPitch;
    return { x: cx - nodeW / 2, y: cy - nodeH / 2, w: nodeW, h: nodeH, cx, cy };
  };

  /** Root / mid / leaf read as one family: tinted panels, not three different fills. */
  const tier = (d: number) =>
    d === 0
      ? { face: lerpColor(THEME.panel, secondary, ROOT_TINT), edge: secondary }
      : d < maxDepth
        ? { face: lerpColor(THEME.panel, accent, MID_TINT), edge: accent }
        : { face: shade(THEME.panel, LEAF_LIFT), edge: THEME.textDim };

  const rects = new Map(scene.nodes.map((n) => [n.id, nodeRect(n)]));
  const states: NodeState[] = scene.nodes.map((n) => {
    const r = rects.get(n.id)!;
    const ap = nodeAppear(n.id);
    const t = tier(depthOf(n));
    return {
      visible: ap > 0.01,
      cx: r.cx,
      cy: r.cy,
      w: r.w,
      h: r.h,
      scale: Math.max(0.001, easeOutBack(clamp01(ap * 1.3))),
      opacity: clamp01(ap * 1.4),
      face: t.face,
      edge: t.edge,
    };
  });

  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  const build = (): ThreeBundle<{ nodes: NodeState[] }> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, SLAB_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

    const models = scene.nodes.map(() => {
      const g = makeBlock(1, 1, SLAB_DEPTH, THEME.panel, THEME.textDim);
      s.add(g);
      return g;
    });

    // Every value that moves with the beat arrives through `data`; `build` runs once and
    // its closure is frozen at frame 0.
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

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { nodes: states }, env);
  const flat = !cam;

  // Connectors are pure pixel elbows between the two node boxes, drawn before the slabs
  // composite so a run that passes a sibling is hidden by it. They used to be drawn
  // between projected ground points, which sent them straight through the node boxes.
  for (const n of scene.nodes) {
    if (n.parent == null) continue;
    const parent = byId.get(n.parent);
    if (!parent) continue;
    const ap = nodeAppear(n.id);
    if (ap <= 0) continue;
    const pr = rects.get(parent.id)!;
    const cr = rects.get(n.id)!;
    const midY = (pr.y + pr.h + cr.y) / 2;
    const pts = roundedCorners(
      [
        { x: pr.cx, y: pr.y + pr.h },
        { x: pr.cx, y: midY },
        { x: cr.cx, y: midY },
        { x: cr.cx, y: cr.y },
      ],
      unit * 0.8
    );
    ctx.save();
    ctx.strokeStyle = rgba(THEME.textDim, 0.65);
    ctx.lineWidth = unit * 0.12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokePolylineProgress(ctx, pts, clamp01(ap * 1.2));
    ctx.restore();

    if (ap > 0.15) {
      ctx.save();
      ctx.globalAlpha = clamp01((ap - 0.15) / 0.3);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(pr.cx, pr.y + pr.h, unit * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  scene.nodes.forEach((n, i) => {
    const st = states[i];
    if (!st.visible) return;
    const r = rects.get(n.id)!;
    const d = depthOf(n);
    const t = tier(d);
    const isActive = (revealStepOf.get(n.id) ?? 0) === activeStep;

    ctx.save();
    ctx.globalAlpha = st.opacity;
    ctx.translate(r.cx, r.cy);
    ctx.scale(st.scale, st.scale);
    ctx.translate(-r.cx, -r.cy);

    if (flat) {
      roundRect(ctx, r.x, r.y, r.w, r.h, unit * RADIUS.md);
      ctx.fillStyle = t.face;
      ctx.fill();
    }
    if (isActive) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * GLOW.base * (0.7 + 0.3 * idle(env, PULSE_MS));
    }
    roundRect(ctx, r.x, r.y, r.w, r.h, unit * RADIUS.md);
    ctx.strokeStyle = rgba(t.edge, isActive ? 0.95 : 0.4);
    ctx.lineWidth = unit * (isActive ? STROKE.base : STROKE.thin);
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    let textCX = r.cx;
    let textMaxW = r.w - unit * 0.6;
    if (n.icon) {
      const iconS = Math.min(r.h * 0.5, unit * 1.1);
      if (isVectorIcon(n.icon)) {
        drawIcon(ctx, n.icon, r.x + unit * 0.45 + iconS / 2, r.cy, iconS, env, t.edge);
      } else {
        ctx.font = `${iconS}px ${FONT_SANS}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = THEME.text;
        ctx.fillText(n.icon, r.x + unit * 0.45 + iconS / 2, r.cy);
      }
      const textLeft = r.x + unit * 0.6 + iconS;
      textMaxW = r.x + r.w - unit * 0.4 - textLeft;
      textCX = textLeft + textMaxW / 2;
    }

    const px = fitFontSize(ctx, n.label, { maxW: textMaxW, startPx: unit * 0.75, minPx: unit * 0.5, weight: 700 });
    ctx.font = `700 ${px}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapText(ctx, n.label, textMaxW).slice(0, 2);
    const lh = px * 1.15;
    lines.forEach((ln, li) => ctx.fillText(ln, textCX, r.cy - ((lines.length - 1) * lh) / 2 + li * lh));
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  });
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

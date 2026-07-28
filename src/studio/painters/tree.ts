import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
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
type Pt = { x: number; y: number };
/** Per-frame state handed to the cached 3D bundle: node id -> reveal 0..1. */
type TreeFrame = { appear: Map<string, number> };

/**
 * ByteByteGo hierarchy tree: tidy auto-layout (model gives parent pointers, not
 * coordinates), tiered node colours (root → mid → leaf), rounded elbow
 * connectors that draw on as each level reveals, and line-art concept icons.
 * Reveals one step (usually one depth level) per beat.
 */
export function paintTree(ctx: CanvasRenderingContext2D, scene: TreeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
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
    let d = 0, cur: TNode | undefined = n;
    while (cur && cur.parent != null) { cur = byId.get(cur.parent); d++; if (d > 20) break; }
    return d;
  };

  const gx = new Map<string, number>();
  let leafCol = 0;
  const place = (n: TNode) => {
    const kids = childrenOf(n.id);
    if (!kids.length) { gx.set(n.id, leafCol++); return; }
    kids.forEach(place);
    const xs = kids.map((k) => gx.get(k.id)!);
    gx.set(n.id, (Math.min(...xs) + Math.max(...xs)) / 2);
  };
  place(root);
  const maxCol = Math.max(1, leafCol - 1);
  const maxDepth = Math.max(1, ...scene.nodes.map(depthOf));

  const revealStepOf = new Map<string, number>();
  scene.steps.forEach((st, k) => st.reveal.forEach((id) => { if (!revealStepOf.has(id)) revealStepOf.set(id, k); }));
  const nodeAppear = (id: string): number => {
    const k = revealStepOf.get(id) ?? 0;
    if (activeStep < k) return 0;
    if (activeStep > k) return 1;
    return easeOutCubic(clamp01(beatT(env.beats, offset + k, totalBeats, env.p) * 1.6));
  };

  const rect = { x: contentX, y: contentY + band, w: contentW, h: contentH - band };
  const spreadX = vertical ? 3.0 : 4.5;
  const spreadZ = vertical ? 4.5 : 3.0;

  const worldPos = (n: TNode) => {
    const x = (gx.get(n.id)! / maxCol - 0.5) * spreadX * 2;
    const z = (depthOf(n) / maxDepth - 0.5) * spreadZ * 2;
    return new THREE.Vector3(x, 0, z);
  };

  const tier = (d: number) => (d === 0 ? { fill: secondary, text: "#0b0f14", outline: false } : d === 1 ? { fill: accent, text: "#0b0f14", outline: false } : { fill: accent, text: THEME.text, outline: true });

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 9.5, vertical ? 8 : 6.5);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);
    
    const grid = new THREE.GridHelper(Math.max(spreadX, spreadZ) * 3.5, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
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
      const d = depthOf(n);
      const st = tier(d);
      // Main blocks
      const g = makeBlock(1.8, 0.4, 0.9, st.outline ? "#1e293b" : st.fill, st.outline ? accent : "#eaf3ff");
      const pos = worldPos(n);
      g.position.copy(pos);
      s.add(g);
      return { id: n.id, mesh: g, basePos: pos, depth: d };
    });

    // `build` runs once and its closure freezes at frame 0, so every value that
    // moves with the beat arrives through `data`, never off the captured env.
    const update = (elapsedMs: number, data: TreeFrame) => {
      models.forEach(({ id, mesh, basePos, depth }) => {
        const ap = data.appear.get(id) ?? 0;
        const pop = easeOutBack(clamp01(ap * 1.3));
        mesh.scale.setScalar(Math.max(0.001, pop));
        mesh.visible = ap > 0.01;
        mesh.position.y = basePos.y + Math.sin(elapsedMs / 1300 + depth) * 0.08;
      });
    };
    return { scene: s, camera, update };
  };

  const frame: TreeFrame = { appear: new Map(scene.nodes.map((n) => [n.id, nodeAppear(n.id)])) };
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, frame);
  if (!cam) return;

  const get2D = (n: TNode) => projectToRect(cam, worldPos(n), rect);

  // Connectors
  for (const n of scene.nodes) {
    if (n.parent == null) continue;
    const parent = byId.get(n.parent);
    if (!parent) continue;
    const ap = nodeAppear(n.id);
    if (ap <= 0) continue;
    
    const pc = get2D(parent), cc = get2D(n);
    const from = { x: pc.x, y: pc.y };
    const to = { x: cc.x, y: cc.y };
    const midZ = (worldPos(parent).z + worldPos(n).z) / 2;
    const midWorld = new THREE.Vector3(worldPos(parent).x, 0, midZ);
    const midWorld2 = new THREE.Vector3(worldPos(n).x, 0, midZ);
    const pMid1 = projectToRect(cam, midWorld, rect);
    const pMid2 = projectToRect(cam, midWorld2, rect);

    const pts = roundedCorners([from, pMid1, pMid2, to], unit * 0.8);
    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,0.65)";
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
      ctx.arc(from.x, from.y, unit * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Labels
  for (const n of scene.nodes) {
    const ap = nodeAppear(n.id);
    if (ap <= 0) continue;
    const c = get2D(n);
    const d = depthOf(n);
    const st = tier(d);
    const isActive = (revealStepOf.get(n.id) ?? 0) === activeStep;

    ctx.save();
    ctx.globalAlpha = clamp01(ap * 1.4);
    
    const nodeW = unit * 5.5;
    const nodeH = unit * 2.0;
    const x = c.x - nodeW / 2, y = c.y - nodeH / 2;
    
    if (isActive) {
      ctx.shadowColor = rgba(st.outline ? accent : st.fill, 0.8 + 0.3 * idle(env, 1500));
      ctx.shadowBlur = unit * 0.8;
      // Draw glowing label bg
      roundRect(ctx, x, y, nodeW, nodeH, unit * 0.3);
      ctx.fillStyle = "rgba(10,16,22,0.4)";
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    let textCX = c.x;
    let textMaxW = nodeW - unit * 0.5;
    if (n.icon) {
      const iconS = nodeH * 0.5;
      const iconColor = st.outline ? accent : st.text;
      if (isVectorIcon(n.icon)) drawIcon(ctx, n.icon, x + unit * 0.5 + iconS / 2, c.y, iconS, env, iconColor);
      else { ctx.font = `${iconS}px ${FONT_SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = st.text; ctx.fillText(n.icon, x + unit * 0.5 + iconS / 2, c.y); }
      textCX = x + unit * 0.6 + iconS + (nodeW - (unit * 0.6 + iconS)) / 2 - unit * 0.2;
      textMaxW = nodeW - iconS - unit * 1.4;
    }
    
    const px = fitFontSize(ctx, n.label, { maxW: textMaxW, startPx: unit * 0.75, minPx: unit * 0.5, weight: 700 });
    ctx.font = `700 ${px}px ${FONT_SANS}`;
    ctx.fillStyle = st.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapText(ctx, n.label, textMaxW).slice(0, 2);
    const lh = px * 1.15;
    lines.forEach((ln, li) => ctx.fillText(ln, textCX, c.y - ((lines.length - 1) * lh) / 2 + li * lh));
    ctx.restore();
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

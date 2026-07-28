import * as THREE from "three";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  sub,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  strokePolylineProgress,
  pointAlongPolyline,
  beatT,
  activeBeatIndex,
  rgba,
  type Layout,
} from "./common";
import { render3D, projectToRect, studioLights, type ThreeBundle, color3 } from "./three3d";
import type { PaintEnv } from "./index";

type ConstellationScene = Extract<Scene, { kind: "constellation" }>;
type Point = ConstellationScene["points"][number];

/** Convex hull (monotone chain) for the soft finale shape fill. */
function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts.slice();
  const sorted = [...pts].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function paintConstellation(ctx: CanvasRenderingContext2D, scene: ConstellationScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, w, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length + (scene.finale ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const finaleBeat = scene.finale ? totalBeats - 1 : -1;
  const finaleActive = finaleBeat >= 0 && active >= finaleBeat;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env.p, accent) + unit * 0.4;

  const rect = { x: contentX, y: contentY + titleBand, w: contentW, h: contentH - titleBand };

  const fieldIn = easeOutCubic(enterT(env, 360));
  if (fieldIn <= 0) {
    ctx.textAlign = "start";
    return;
  }

  // Earliest step (relative index) each point is connected in — drives brightness.
  const litStep = new Map<string, number>();
  scene.steps.forEach((step, k) => {
    for (const c of step.connect) {
      if (!litStep.has(c.a)) litStep.set(c.a, k);
      if (!litStep.has(c.b)) litStep.set(c.b, k);
    }
  });

  const minX = Math.min(...scene.points.map((p) => p.x));
  const maxX = Math.max(...scene.points.map((p) => p.x));
  const minY = Math.min(...scene.points.map((p) => p.y));
  const maxY = Math.max(...scene.points.map((p) => p.y));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  const getP3D = (p: Point) => {
    const nx = (p.x - minX) / spanX * 2 - 1;
    const ny = (p.y - minY) / spanY * 2 - 1;
    let h = 0;
    for (let i = 0; i < p.id.length; i++) h = (h << 5) - h + p.id.charCodeAt(i);
    const nz = (Math.abs(h) % 100) / 100 * 2 - 1;
    return new THREE.Vector3(nx * 5, -ny * 3.5, nz * 2);
  };

  const p3ds = new Map(scene.points.map((p) => [p.id, getP3D(p)]));
  
  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 14);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, env.palette.secondary);

    const meshes: { id: string, mesh: THREE.Mesh, basePos: THREE.Vector3 }[] = [];
    
    const geo = new THREE.SphereGeometry(0.3, 32, 32);
    
    scene.points.forEach((p) => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: color3(accent),
        emissive: color3(accent),
        emissiveIntensity: 0.1,
        metalness: 0.3,
        roughness: 0.2,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2,
        transparent: true
      });
      const mesh = new THREE.Mesh(geo, mat);
      const pos = p3ds.get(p.id)!;
      mesh.position.copy(pos);
      s.add(mesh);
      meshes.push({ id: p.id, mesh, basePos: pos });
    });

    const update = (elapsedMs: number, ctxData: { pops: Record<string, number>, activeList: Record<string, boolean> }) => {
      const { pops, activeList } = ctxData;
      const bobTime = elapsedMs / 1000;
      
      const rot = Math.sin(elapsedMs / 3000) * 0.1;
      s.rotation.y = rot;
      
      meshes.forEach((m, idx) => {
        const pop = pops[m.id] ?? 0;
        const isActiveStar = activeList[m.id] ?? false;
        
        m.mesh.scale.setScalar(Math.max(0.001, pop));
        
        const bob = Math.sin(bobTime + idx * 1.3) * 0.2;
        m.mesh.position.y = m.basePos.y + bob;
        
        const mat = m.mesh.material as THREE.MeshPhysicalMaterial;
        mat.emissiveIntensity = isActiveStar ? 0.8 : 0.1;
      });
    };

    return { scene: s, camera, update };
  };

  const pops: Record<string, number> = {};
  const activeList: Record<string, boolean> = {};
  
  scene.points.forEach((point, index) => {
    const litK = litStep.get(point.id);
    const lit = litK !== undefined && active >= offset + litK;
    if (lit) {
      const bornT = beatT(env.beats, offset + litK!, totalBeats, env.p);
      const pop = easeOutBack(clamp01(bornT / 0.35));
      const activeStar = active === offset + litK! && !finaleActive;
      const breathe = finaleActive ? 1 + 0.12 * Math.sin(env.elapsedMs / 800 + index) : 1 + 0.06 * (idle(env, 2600, index * 1.3) - 0.5);
      pops[point.id] = Math.max(0.1, pop) * breathe;
      activeList[point.id] = activeStar || finaleActive;
    } else {
      const twinkle = 0.35 + 0.15 * (0.5 + 0.5 * Math.sin(env.elapsedMs / 600 + index * 1.3));
      pops[point.id] = twinkle * 0.6;
      activeList[point.id] = false;
    }
  });

  const cam = render3D(ctx, scene.id + "-const3d", rect, build, env.elapsedMs, { pops, activeList });
  if (!cam) return;

  const get2DPos = (id: string) => {
    const p3d = p3ds.get(id)!.clone();
    
    // Apply exact same transformations as in 3D update
    const idx = scene.points.findIndex(p => p.id === id);
    const bobTime = env.elapsedMs / 1000;
    const bob = Math.sin(bobTime + idx * 1.3) * 0.2;
    p3d.y += bob;
    
    const rot = Math.sin(env.elapsedMs / 3000) * 0.1;
    const euler = new THREE.Euler(0, rot, 0);
    p3d.applyEuler(euler);
    
    return projectToRect(cam, p3d, rect);
  };

  const posById = new Map(scene.points.map((p) => [p.id, get2DPos(p.id)]));

  // Finale shape fill behind everything.
  if (finaleActive) {
    const litPts = scene.points.filter((p) => litStep.has(p.id)).map((p) => posById.get(p.id)!);
    const hull = convexHull(litPts);
    if (hull.length >= 3) {
      const breathe = 0.06 + 0.03 * (0.5 + 0.5 * Math.sin(env.elapsedMs / 900));
      const fin = easeOutCubic(beatT(env.beats, finaleBeat, totalBeats, env.p));
      ctx.save();
      ctx.globalAlpha = fin;
      ctx.beginPath();
      ctx.moveTo(hull[0].x, hull[0].y);
      for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
      ctx.closePath();
      ctx.fillStyle = rgba(accent, breathe);
      ctx.fill();
      ctx.restore();
    }
  }

  // Connection lines, accumulating across steps.
  scene.steps.forEach((step, k) => {
    const beatIdx = offset + k;
    const t = beatT(env.beats, beatIdx, totalBeats, env.p);
    if (t <= 0) return;
    const isActiveStep = active === beatIdx;
    step.connect.forEach((c, i) => {
      const a = posById.get(c.a);
      const b = posById.get(c.b);
      if (!a || !b) return;
      const drawProg = easeInOutCubic(clamp01((t - i * 0.08) / 0.42));
      if (drawProg <= 0) return;
      const glowing = isActiveStep || finaleActive;
      const finalePulse = finaleActive ? 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(env.elapsedMs / 700 + i)) : 1;
      const idlePulse = !glowing ? 0.7 : 1;
      ctx.save();
      ctx.globalAlpha = (glowing ? 1 : idlePulse) * finalePulse;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * (glowing ? 0.12 : 0.08);
      ctx.lineCap = "round";
      if (glowing) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * (finaleActive ? 0.9 : 0.6);
      }
      strokePolylineProgress(ctx, [a, b], drawProg);
      ctx.restore();
      // Traveling spark along the freshly drawn active line.
      if (isActiveStep && !finaleActive) {
        const f = drawProg < 1 ? drawProg : (env.elapsedMs % 1400) / 1400;
        const sp = pointAlongPolyline([a, b], f);
        ctx.save();
        ctx.globalAlpha = drawProg < 1 ? 1 : 0.9 * Math.sin(Math.PI * f);
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.9;
        ctx.fillStyle = "#eaf6ff";
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, unit * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  });

  // Labels and 2D Glow overlay for stars
  scene.points.forEach((point) => {
    const pos = posById.get(point.id)!;
    const litK = litStep.get(point.id);
    const lit = litK !== undefined && active >= offset + litK;
    
    // Add 2D glow behind active 3D stars
    if (lit) {
        const activeStar = active === offset + litK! && !finaleActive;
        if (activeStar || finaleActive) {
            ctx.save();
            ctx.globalAlpha = fieldIn * 0.4;
            ctx.shadowColor = accentGlow;
            ctx.shadowBlur = unit * 0.9;
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, unit * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    if (point.label) {
      ctx.save();
      ctx.globalAlpha = fieldIn * (lit ? 0.85 : 0.4);
      ctx.font = `600 ${unit * 0.58}px ${FONT_SANS}`;
      ctx.fillStyle = lit ? THEME.text : THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(point.label, pos.x, pos.y - unit * 0.5);
      ctx.textAlign = "start";
      ctx.restore();
    }
  });

  // Finale label stamp.
  if (finaleActive && scene.finale) {
    const ft = beatT(env.beats, finaleBeat, totalBeats, env.p);
    const stamp = easeOutBack(clamp01(sub(ft, 0.15, 0.4)));
    if (stamp > 0) {
      const label = scene.finale.label;
      const cx = w / 2;
      const cy = layout.contentY + titleBand + (layout.contentH - titleBand) - unit * 1.6;
      ctx.save();
      ctx.globalAlpha = clamp01(sub(ft, 0.15, 0.25));
      const maxW = layout.contentW * 0.9;
      ctx.font = `800 ${unit * 1.1}px ${FONT_SANS}`;
      const px = fitFontSize(ctx, label, { maxW: maxW - unit * 1.4, startPx: unit * 1.1, minPx: unit * 0.7, weight: 800 });
      ctx.font = `800 ${px}px ${FONT_SANS}`;
      const tw = ctx.measureText(label).width;
      const chipW = tw + unit * 1.4;
      const chipH = px + unit * 0.9;
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.01, stamp), Math.max(0.01, stamp));
      ctx.translate(-cx, -cy);
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.8;
      roundRect(ctx, cx - chipW / 2, cy - chipH / 2, chipW, chipH, unit * 0.4);
      ctx.fillStyle = "#0e2433";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.08;
      ctx.stroke();
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.fillText(label, cx, cy + px * 0.35);
      ctx.textAlign = "start";
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}

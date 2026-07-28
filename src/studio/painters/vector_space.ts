import * as THREE from "three";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  glowRing,
  rgba,
  shade,
  hashStr,
} from "./common";
import { render3D, projectToRect, studioLights, color3, type ThreeBundle } from "./three3d";
import type { PaintEnv } from "./index";

type VectorSpaceScene = Extract<Scene, { kind: "vector_space" }>;
type Pt = VectorSpaceScene["points"][number];

/** Which step first revealed a point, and its stagger slot within that step's batch. */
type RevealInfo = { step: number; idxInStep: number; countInStep: number };

/** Per-scene live state the cached three.js update() reads every frame — build()'s
 *  closure is created once and can't see beats that haven't happened yet. */
type VSState = {
  revealInfo: Map<string, RevealInfo>;
  activeStep: number;
  stepT: number;
  focusId?: string;
  boundaryOn: boolean;
  distancesOn: Set<number>;
};
const vsState = new Map<string, VSState>();

/** Fraction of a beat a batch of same-step reveals staggers its pop-in across. */
const REVEAL_SPAN = 0.5;

/** 0 (not yet) .. 1 (fully in) reveal progress for a point/item first shown at `info.step`. */
function localReveal(info: RevealInfo, activeStep: number, stepT: number): number {
  if (info.step !== activeStep) return 1;
  const startAt = (info.idxInStep / info.countInStep) * REVEAL_SPAN;
  return clamp01((stepT - startAt) / REVEAL_SPAN);
}

/**
 * A 2-D or 3-D coordinate space plotting data as vectors: word embeddings
 * clustering by meaning, or a classifier's decision boundary separating two
 * classes. Points pop in cluster-by-cluster (colored by `cluster`), an
 * optional line + margin band reads as a decision boundary/SVM margin, and
 * dashed segments read as distances (margins, similarities). `mode:"3d"`
 * renders a real rotating three.js scatter with the same reveal
 * choreography; `mode:"2d"` (and the 3-D fallback when WebGL is unavailable)
 * draws an axis-true 2-D plot. Both axes share ONE scale (never stretched
 * independently) so distances and angles between vectors stay geometrically
 * honest — that honesty is the entire point of a vector-space diagram.
 */
export function paintVectorSpace(ctx: CanvasRenderingContext2D, scene: VectorSpaceScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const key = scene.id;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.5;

  // Replay every step up to the active one: which points/boundary/distances are on screen.
  const revealInfo = new Map<string, RevealInfo>();
  let showBoundary = false;
  let boundaryStep = -1;
  const shownDistances = new Set<number>();
  const distanceStep = new Map<number, number>();
  for (let k = 0; k <= activeStep; k++) {
    const st = scene.steps[k];
    st.reveal.forEach((idv, i) => {
      if (!revealInfo.has(idv)) revealInfo.set(idv, { step: k, idxInStep: i, countInStep: Math.max(st.reveal.length, 1) });
    });
    if (st.showBoundary && !showBoundary) { showBoundary = true; boundaryStep = k; }
    st.showDistances.forEach((di) => {
      if (!shownDistances.has(di)) { shownDistances.add(di); distanceStep.set(di, k); }
    });
  }
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const curStep = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const focusId = curStep?.focus;
  const byId = new Map(scene.points.map((p) => [p.id, p] as const));

  // Cluster order (first-seen) drives color assignment.
  const clusters: string[] = [];
  scene.points.forEach((p) => { if (!clusters.includes(p.cluster)) clusters.push(p.cluster); });
  const clusterHex = (cl: string): string => {
    const i = clusters.indexOf(cl);
    return i === 0 ? accent : i === 1 ? secondary : i % 2 === 0 ? shade(accent, 0.35) : shade(secondary, 0.35);
  };

  // Uniform (aspect-preserving) data-space bounds — see doc comment above for why.
  const xs = scene.points.map((p) => p.x);
  const ys = scene.points.map((p) => p.y);
  if (scene.boundary) { xs.push(scene.boundary.x1, scene.boundary.x2); ys.push(scene.boundary.y1, scene.boundary.y2); }
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const padX = Math.max((maxX - minX) * 0.24, 1.4);
  const padY = Math.max((maxY - minY) * 0.24, 1.4);
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  const dcx = (minX + maxX) / 2, dcy = (minY + maxY) / 2;
  const half = Math.max(maxX - minX, maxY - minY) / 2;
  minX = dcx - half; maxX = dcx + half; minY = dcy - half; maxY = dcy + half;

  // Square plot area centred in the content box — fits both 9:16 and 16:9.
  const bottom = vertical ? Math.min(contentY + contentH, layout.h * 0.93) : contentY + contentH;
  const availH = bottom - contentY - band;
  const side = Math.min(contentW, availH);
  const plotX = contentX + (contentW - side) / 2;
  const plotY = contentY + band + (availH - side) / 2;
  const rect = { x: plotX, y: plotY, w: side, h: side };
  const px = (x: number) => plotX + ((x - minX) / (maxX - minX)) * side;
  const py = (y: number) => plotY + side - ((y - minY) / (maxY - minY)) * side;

  drawAxes(ctx, rect, minX, maxX, minY, maxY, px, py, unit, scene.xLabel, scene.yLabel, introIn);

  if (scene.mode === "3d") {
    vsState.set(key, { revealInfo, activeStep, stepT, focusId, boundaryOn: showBoundary, distancesOn: shownDistances });
    const cam = render3DBranch(ctx, scene, env, key, rect, dcx, dcy, half, clusterHex, accent, secondary);
    if (cam) {
      const worldScale = 3 / half;
      scene.points.forEach((p) => {
        const info = revealInfo.get(p.id);
        if (!info || localReveal(info, activeStep, stepT) <= 0.05) return;
        const world = new THREE.Vector3((p.x - dcx) * worldScale, (p.y - dcy) * worldScale, (p.z ?? 0) * worldScale);
        const sp = projectToRect(cam, world, rect);
        drawLabelChip(ctx, p.label ?? p.cluster, sp.x, sp.y, unit, clusterHex(p.cluster), p.id === focusId);
      });
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
      return;
    }
  }

  // 2-D drawing: native mode:"2d", or the fallback when mode:"3d" has no WebGL.
  if (scene.boundary && showBoundary) {
    const bLocal = boundaryStep === activeStep ? easeOutCubic(clamp01(stepT * 1.4)) : 1;
    drawBoundary(ctx, scene.boundary, rect, px, py, unit, accent, accentGlow, bLocal * introIn);
  }

  scene.distances.forEach((d, i) => {
    if (!shownDistances.has(i)) return;
    const a = byId.get(d.from), b = byId.get(d.to);
    if (!a || !b) return;
    if (!revealInfo.has(a.id) || !revealInfo.has(b.id)) return;
    const dStep = distanceStep.get(i)!;
    const local = dStep === activeStep ? easeOutCubic(clamp01(stepT * 1.4)) : 1;
    drawDistance(ctx, px(a.x), py(a.y), px(b.x), py(b.y), d.label, unit, secondary, local * introIn);
  });

  scene.points.forEach((p) => {
    const info = revealInfo.get(p.id);
    const cx = px(p.x), cy = py(p.y);
    const hex = clusterHex(p.cluster);
    if (!info) {
      const ghostIn = enterT(env, 260, 60 + (hashStr(p.id) % 300));
      if (ghostIn <= 0) return;
      ctx.save();
      ctx.globalAlpha = 0.14 * introIn * easeOutCubic(ghostIn);
      ctx.strokeStyle = "rgba(148,163,184,0.9)";
      ctx.lineWidth = unit * 0.05;
      ctx.setLineDash([unit * 0.2, unit * 0.16]);
      ctx.beginPath();
      ctx.arc(cx, cy, unit * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }
    const local = localReveal(info, activeStep, stepT);
    if (local <= 0) return;
    const pop = info.step === activeStep ? easeOutBack(local) : 1;
    const isFocus = p.id === focusId;
    const breathe = isFocus ? 0.75 + 0.25 * idle(env, 1500) : 1;
    const bob = isFocus ? 0 : Math.sin(env.elapsedMs / 1700 + (hashStr(p.id) % 100)) * unit * 0.05;
    const r = unit * (isFocus ? 0.56 : 0.42) * (0.7 + 0.3 * pop);
    const depthScale = p.z != null ? clamp01(0.75 + p.z * 0.03) : 1;

    ctx.save();
    ctx.globalAlpha = clamp01(local) * introIn;
    if (isFocus) { ctx.shadowColor = accentGlow; ctx.shadowBlur = unit * 0.9 * breathe; }
    ctx.beginPath();
    ctx.arc(cx, cy + bob, r * depthScale, 0, Math.PI * 2);
    ctx.fillStyle = hex;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = unit * 0.06;
    ctx.strokeStyle = THEME.bgBottom;
    ctx.stroke();
    ctx.restore();

    if (isFocus && local > 0.6) glowRing(ctx, cx, cy + bob, r * 1.3, accent, env, 1500);
    const labelText = p.label ?? "";
    if (labelText) drawLabelChip(ctx, labelText, cx, cy + bob, unit, hex, isFocus);
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  px: (x: number) => number,
  py: (y: number) => number,
  unit: number,
  xLabel: string | undefined,
  yLabel: string | undefined,
  introIn: number
) {
  ctx.save();
  ctx.globalAlpha = introIn;
  ctx.strokeStyle = "rgba(148,163,184,0.14)";
  ctx.lineWidth = 1;
  const DIVS = 6;
  for (let i = 1; i < DIVS; i++) {
    const gx = rect.x + (i / DIVS) * rect.w;
    ctx.beginPath(); ctx.moveTo(gx, rect.y); ctx.lineTo(gx, rect.y + rect.h); ctx.stroke();
    const gy = rect.y + (i / DIVS) * rect.h;
    ctx.beginPath(); ctx.moveTo(rect.x, gy); ctx.lineTo(rect.x + rect.w, gy); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(148,163,184,0.4)";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  if (minX <= 0 && maxX >= 0) {
    const x0 = px(0);
    ctx.beginPath(); ctx.moveTo(x0, rect.y); ctx.lineTo(x0, rect.y + rect.h); ctx.stroke();
  }
  if (minY <= 0 && maxY >= 0) {
    const y0 = py(0);
    ctx.beginPath(); ctx.moveTo(rect.x, y0); ctx.lineTo(rect.x + rect.w, y0); ctx.stroke();
  }
  ctx.fillStyle = THEME.textDim;
  ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
  if (xLabel) { ctx.textAlign = "end"; ctx.textBaseline = "top"; ctx.fillText(xLabel, rect.x + rect.w, rect.y + rect.h + unit * 0.3); }
  if (yLabel) {
    // Was drawn horizontally at the box's top-left corner, reading like a
    // second title rather than the vertical axis's meaning. Rotate it
    // alongside the left edge instead, the conventional y-axis-label spot.
    ctx.save();
    ctx.translate(rect.x - unit * 0.35, rect.y + rect.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** Decision-boundary line extended across the plot, with an optional filled+dashed margin band. */
function drawBoundary(
  ctx: CanvasRenderingContext2D,
  b: { x1: number; y1: number; x2: number; y2: number; margin: number },
  rect: { x: number; y: number; w: number; h: number },
  px: (x: number) => number,
  py: (y: number) => number,
  unit: number,
  accent: string,
  accentGlow: string,
  alpha: number
) {
  if (alpha <= 0) return;
  const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const EXT = 60; // data-space extension, comfortably beyond any plotted range
  const a = { x: b.x1 - ux * EXT, y: b.y1 - uy * EXT };
  const c = { x: b.x2 + ux * EXT, y: b.y2 + uy * EXT };

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  if (b.margin > 0) {
    const m = b.margin;
    const p1 = { x: a.x + nx * m, y: a.y + ny * m };
    const p2 = { x: c.x + nx * m, y: c.y + ny * m };
    const p3 = { x: c.x - nx * m, y: c.y - ny * m };
    const p4 = { x: a.x - nx * m, y: a.y - ny * m };
    ctx.beginPath();
    ctx.moveTo(px(p1.x), py(p1.y));
    ctx.lineTo(px(p2.x), py(p2.y));
    ctx.lineTo(px(p3.x), py(p3.y));
    ctx.lineTo(px(p4.x), py(p4.y));
    ctx.closePath();
    ctx.globalAlpha = alpha * 0.14;
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.05;
    ctx.setLineDash([unit * 0.22, unit * 0.18]);
    ctx.beginPath(); ctx.moveTo(px(p1.x), py(p1.y)); ctx.lineTo(px(p2.x), py(p2.y)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px(p4.x), py(p4.y)); ctx.lineTo(px(p3.x), py(p3.y)); ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = accent;
  ctx.lineWidth = unit * 0.12;
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * 0.6;
  ctx.beginPath();
  ctx.moveTo(px(a.x), py(a.y));
  ctx.lineTo(px(c.x), py(c.y));
  ctx.stroke();
  ctx.restore();
}

/** A dashed distance/similarity segment between two already-plotted points, with a label chip. */
function drawDistance(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  label: string | undefined,
  unit: number,
  color: string,
  alpha: number
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  ctx.strokeStyle = color;
  ctx.lineWidth = unit * 0.08;
  ctx.setLineDash([unit * 0.16, unit * 0.14]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (label) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.font = `700 ${unit * 0.56}px ${FONT_MONO}`;
    const tw = ctx.measureText(label).width;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(9,13,18,0.82)";
    roundRect(ctx, mx - tw / 2 - unit * 0.3, my - unit * 0.5, tw + unit * 0.6, unit * 0.9, unit * 0.25);
    ctx.fill();
    ctx.strokeStyle = rgba(color, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx, my);
  }
  ctx.restore();
}

/** Small pinned label chip used for both the 2-D plot and the 3-D projected labels. */
function drawLabelChip(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  unit: number,
  color: string,
  active: boolean
) {
  ctx.save();
  ctx.font = `${active ? 800 : 600} ${unit * 0.58}px ${FONT_SANS}`;
  const tw = ctx.measureText(label).width;
  const padX = unit * 0.4;
  const chipW = tw + padX * 2;
  const chipH = unit * 1.05;
  const bx = x + unit * 0.5;
  const by = y - chipH / 2 - unit * 0.55;
  ctx.fillStyle = "rgba(9,13,18,0.82)";
  roundRect(ctx, bx, by, chipW, chipH, unit * 0.28);
  ctx.fill();
  ctx.globalAlpha = active ? 0.95 : 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = active ? 1.8 : 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, unit * 0.11, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + padX, by + chipH / 2);
  ctx.restore();
}

/** Real three.js scatter: small spheres colored by cluster, orbited by a slowly moving camera.
 *  Falls back to null (caller draws the 2-D plot instead) when WebGL is unavailable. */
function render3DBranch(
  ctx: CanvasRenderingContext2D,
  scene: VectorSpaceScene,
  env: PaintEnv,
  key: string,
  rect: { x: number; y: number; w: number; h: number },
  dcx: number,
  dcy: number,
  half: number,
  clusterHex: (cl: string) => string,
  accent: string,
  secondary: string
): THREE.Camera | null {
  const worldScale = 3 / half;
  const worldPos = (p: Pt) => new THREE.Vector3((p.x - dcx) * worldScale, (p.y - dcy) * worldScale, (p.z ?? 0) * worldScale);

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(env.layout.vertical ? 42 : 36, 1, 0.1, 100);
    camera.position.set(0, 1.6, 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const axisMat = new THREE.LineBasicMaterial({ color: color3(accent), transparent: true, opacity: 0.32 });
    ([
      [new THREE.Vector3(-3.4, 0, 0), new THREE.Vector3(3.4, 0, 0)],
      [new THREE.Vector3(0, -3.4, 0), new THREE.Vector3(0, 3.4, 0)],
      [new THREE.Vector3(0, 0, -3.4), new THREE.Vector3(0, 0, 3.4)],
    ] as const).forEach(([p1, p2]) => {
      s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), axisMat));
    });

    const meshes = scene.points.map((p) => {
      const hex = clusterHex(p.cluster);
      const mat = new THREE.MeshStandardMaterial({
        color: color3(hex),
        emissive: color3(hex),
        emissiveIntensity: 0.35,
        transparent: true,
        roughness: 0.35,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 20), mat);
      mesh.position.copy(worldPos(p));
      s.add(mesh);
      return { mesh, id: p.id };
    });

    // A separating hyperplane (THE kernel-trick payoff shot: points lifted into
    // 3-D become linearly separable by a flat plane) plus optional margin sheets,
    // built once from scene.boundary and toggled by the step that reveals it.
    const boundaryGroup: THREE.Mesh[] = [];
    if (scene.boundary) {
      const b = scene.boundary;
      const a = new THREE.Vector3((b.x1 - dcx) * worldScale, (b.y1 - dcy) * worldScale, 0);
      const c = new THREE.Vector3((b.x2 - dcx) * worldScale, (b.y2 - dcy) * worldScale, 0);
      const dirXY = c.clone().sub(a).setZ(0).normalize();
      const worldZAxis = new THREE.Vector3(0, 0, 1);
      const normal = new THREE.Vector3().crossVectors(dirXY, worldZAxis).normalize();
      const basis = new THREE.Matrix4().makeBasis(dirXY, worldZAxis, normal);
      const mid = a.clone().add(c).multiplyScalar(0.5);
      const mkPlane = (opacity: number, offset: number) => {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(8, 6.8),
          new THREE.MeshBasicMaterial({ color: color3(accent), transparent: true, opacity, side: THREE.DoubleSide })
        );
        mesh.setRotationFromMatrix(basis);
        mesh.position.copy(mid.clone().add(normal.clone().multiplyScalar(offset)));
        s.add(mesh);
        boundaryGroup.push(mesh);
      };
      mkPlane(0.16, 0);
      if (b.margin > 0) {
        const m = b.margin * worldScale;
        mkPlane(0.07, m);
        mkPlane(0.07, -m);
      }
    }

    // One tube per named distance/similarity segment (e.g. "king→queen"), also
    // toggled per step so it appears alongside the narration that names it.
    const byId = new Map(scene.points.map((p) => [p.id, p] as const));
    const distanceMeshes = scene.distances.map((d) => {
      const pa = byId.get(d.from);
      const pb = byId.get(d.to);
      if (!pa || !pb) return null;
      const curve = new THREE.LineCurve3(worldPos(pa), worldPos(pb));
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 8, 0.03, 6, false),
        new THREE.MeshBasicMaterial({ color: color3(secondary), transparent: true, opacity: 0.9 })
      );
      s.add(mesh);
      return mesh;
    });

    const update = (elapsedMs: number) => {
      const orbit = (elapsedMs / 16000) * Math.PI * 2;
      camera.position.set(Math.sin(orbit) * 8, 1.6 + Math.sin(elapsedMs / 9000) * 0.6, Math.cos(orbit) * 8);
      camera.lookAt(0, 0, 0);
      const st = vsState.get(key);
      meshes.forEach(({ mesh, id }) => {
        const info = st?.revealInfo.get(id);
        if (!st || !info) { mesh.visible = false; return; }
        const local = localReveal(info, st.activeStep, st.stepT);
        mesh.visible = local > 0;
        if (local <= 0) return;
        const pop = info.step === st.activeStep ? easeOutBack(local) : 1;
        const isFocus = st.focusId === id;
        const pulse = isFocus ? 1 + 0.2 * Math.sin(elapsedMs / 480) : 1;
        mesh.scale.setScalar(Math.max(0.001, pop * pulse));
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = clamp01(local);
        mat.emissiveIntensity = isFocus ? 0.85 : 0.32;
      });
      const boundaryOn = st?.boundaryOn ?? false;
      boundaryGroup.forEach((mesh) => (mesh.visible = boundaryOn));
      const distancesOn = st?.distancesOn;
      distanceMeshes.forEach((mesh, i) => {
        if (mesh) mesh.visible = distancesOn?.has(i) ?? false;
      });
    };
    return { scene: s, camera, update };
  };

  return render3D(ctx, key, rect, build, env.elapsedMs);
}

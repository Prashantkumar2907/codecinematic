import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  clamp01,
  roundRect,
  drawArrowhead,
  drawSceneTitle,
  strokePolylineProgress,
  pointAlongPolyline,
  fitFontSize,
  beatT,
  activeBeatIndex,
  variantOf,
  rgba,
  type Layout,
} from "./common";
import type { PaintEnv } from "./index";

type StatemachineScene = Extract<Scene, { kind: "statemachine" }>;
type StateNode = StatemachineScene["states"][number];
type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const GRID = 12;
/** Fraction of a step beat spent gliding the token along the edge. */
const ARRIVE = 0.55;
const CURVE_SAMPLES = 20;

type GridMap = { ox: number; oy: number; cw: number; ch: number; rot: boolean; maxYo: number };

/** Rotate a 1×1 state 90° so a wide machine fills a 9:16 frame top→bottom (and a
 *  tall one fills 16:9 left→right) instead of shrinking into a centred band. */
function dispXY(s: StateNode, rot: boolean, maxYo: number): { x: number; y: number } {
  return rot ? { x: maxYo - (s.y + 1), y: s.x } : { x: s.x, y: s.y };
}

function shouldRotate(states: StateNode[], vertical: boolean): boolean {
  const minX = Math.min(...states.map((s) => s.x));
  const maxX = Math.max(...states.map((s) => s.x + 1));
  const minY = Math.min(...states.map((s) => s.y));
  const maxY = Math.max(...states.map((s) => s.y + 1));
  const aspect = Math.max(maxX - minX, 1) / Math.max(maxY - minY, 1);
  return vertical ? aspect >= 1.5 : aspect <= 0.66;
}

function gridMap(states: StateNode[], layout: Layout, titleBand: number, rot: boolean): GridMap {
  const areaX = layout.contentX;
  const areaY = layout.contentY + titleBand;
  const areaW = layout.contentW;
  // Vertical: shave the foot so bottom states clear the caption band.
  const areaH = layout.contentH - titleBand - (layout.vertical ? layout.unit : 0);
  const cellW = areaW / GRID;
  const cellH = areaH / GRID;
  const maxYo = Math.max(...states.map((s) => s.y + 1));
  const d = states.map((s) => dispXY(s, rot, maxYo));
  const minX = Math.min(...d.map((p) => p.x));
  const maxX = Math.max(...d.map((p) => p.x + 1));
  const minY = Math.min(...d.map((p) => p.y));
  const maxY = Math.max(...d.map((p) => p.y + 1));
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

function rectEdgePoint(r: Rect, toward: Pt): Pt {
  const dx = toward.x - r.cx;
  const dy = toward.y - r.cy;
  const s = 1 / Math.max(Math.abs(dx) / (r.w / 2), Math.abs(dy) / (r.h / 2), 1e-6);
  return { x: r.cx + dx * Math.min(s, 1), y: r.cy + dy * Math.min(s, 1) };
}

function curvePts(from: Rect, to: Rect, key: string, unit: number): Pt[] {
  const a = rectEdgePoint(from, { x: to.cx, y: to.cy });
  const b = rectEdgePoint(to, { x: from.cx, y: from.cy });
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const side = variantOf(key, 2) === 0 ? 1 : -1;
  const off = unit * 1.2 * side;
  const c = { x: (a.x + b.x) / 2 + (-dy / len) * off, y: (a.y + b.y) / 2 + (dx / len) * off };
  const pts: Pt[] = [];
  for (let i = 0; i <= CURVE_SAMPLES - 1; i++) {
    const t = i / (CURVE_SAMPLES - 1);
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return pts;
}

/** Self-transition: a small circular hop above the node, out and back to its top edge. */
function loopPts(r: Rect, unit: number): Pt[] {
  const rad = unit * 0.85;
  const cx = r.cx;
  const cy = r.y - rad * 0.75;
  const pts: Pt[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const a = Math.PI / 2 + (i / CURVE_SAMPLES) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  return pts;
}

export function paintStatemachine(ctx: CanvasRenderingContext2D, scene: StatemachineScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentW, vertical } = layout;
  const { accent, accentGlow, accentSoft } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const introIn = easeOutCubic(enterT(env, 400));

  const titleBand = drawSceneTitle(ctx, scene.title, layout, 0.12 * enterT(env, 350), accent) + unit * 0.4;
  const rot = shouldRotate(scene.states, layout.vertical);
  const map = gridMap(scene.states, layout, titleBand, rot);

  const minX = Math.min(...scene.states.map((n) => n.x));
  const maxX = Math.max(...scene.states.map((n) => n.x + 1));
  const minY = Math.min(...scene.states.map((n) => n.y));
  const maxY = Math.max(...scene.states.map((n) => n.y + 1));
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);

  const areaX = layout.contentX;
  const areaY = layout.contentY + titleBand;
  const areaW = layout.contentW;
  const areaH = layout.contentH - titleBand - (layout.vertical ? layout.unit : 0);
  const rect = { x: areaX, y: areaY, w: areaW, h: areaH };

  const spreadX = vertical ? 3.5 : 5.5;
  const spreadZ = vertical ? 5.5 : 3.5;

  const worldPos = (gx: number, gy: number) => {
    const cx = (gx - minX) / rangeX - 0.5;
    const cy = (gy - minY) / rangeY - 0.5;
    return rot ? new THREE.Vector3(cy * spreadX * 2, 0, cx * spreadZ * 2) 
               : new THREE.Vector3(cx * spreadX * 2, 0, cy * spreadZ * 2);
  };

  const key = scene.id + "-sm3d";
  
  const startId = scene.states[0]?.id;
  const stepT = scene.steps.map((_, k) => beatT(env.beats, offset + k, totalBeats, env.p));
  let lastArrived = -1;
  const visited = new Set<string>([startId]);
  stepT.forEach((t, k) => {
    if (t >= ARRIVE) {
      lastArrived = k;
      visited.add(scene.steps[k].go);
    }
  });
  const currentId = lastArrived >= 0 ? scene.steps[lastArrived].go : startId;

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

    const models = scene.states.map((st) => {
      const blockColor = st.accent ? accent : "#1e293b";
      const edgeColor = st.accent ? accentGlow : accent;
      const g = makeBlock(3.0, 0.6, 2.0, blockColor, edgeColor);
      s.add(g);
      return { id: st.id, mesh: g, state: st };
    });

    const update = (elapsedMs: number) => {
      models.forEach(({ id, mesh, state }) => {
        const isCurrent = id === currentId;
        const isVisited = visited.has(id);
        
        let scale = 1;
        scene.steps.forEach((st, k) => {
          if (st.go !== id) return;
          const t = stepT[k];
          if (t >= ARRIVE && t < ARRIVE + 0.3) {
            const popT = clamp01((t - ARRIVE) / 0.3);
            scale = 1 + 0.15 * Math.sin(Math.PI * easeOutCubic(popT));
          }
        });

        const pulse = isCurrent ? 1 + 0.018 * idle(env, 1600) : 1;
        mesh.scale.setScalar(Math.max(0.001, scale * pulse));
        mesh.visible = introIn > 0;
        
        const wp = worldPos(state.x + 0.5, state.y + 0.5);
        mesh.position.copy(wp);
        mesh.position.y = (introIn <= 0 ? -0.4 : 0) + (isCurrent ? 0.2 : 0) + Math.sin(elapsedMs / 1500 + state.x) * 0.05;
        
        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.Material;
                mat.transparent = true;
                mat.opacity = (isVisited ? 1.0 : 0.5) * introIn;
            }
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return;

  const pillH = unit * 1.5;
  const rects = new Map<string, { rect: Rect; fontPx: number }>();
  for (const s of scene.states) {
    const maxW = Math.min(map.cw * 2.2, contentW * 0.42);
    const fontPx = fitFontSize(ctx, s.label, { maxW: maxW - unit, startPx: unit * 0.7, minPx: unit * 0.42, weight: 700 });
    ctx.font = `700 \${fontPx}px \${FONT_SANS}`;
    
    const centerWorld = worldPos(s.x + 0.5, s.y + 0.5);
    const p0 = projectToRect(cam, centerWorld.clone().add(new THREE.Vector3(-1.5, 0, -1.0)), rect);
    const p1 = projectToRect(cam, centerWorld.clone().add(new THREE.Vector3(1.5, 0, 1.0)), rect);
    
    const rw = Math.abs(p1.x - p0.x);
    const rh = Math.abs(p1.y - p0.y);
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    
    rects.set(s.id, { rect: { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh, cx, cy }, fontPx });
  }

  const edgePts = new Map<string, Pt[]>();
  for (const e of scene.edges) {
    const a = rects.get(e.from);
    const b = rects.get(e.to);
    if (!a || !b) continue;
    const key = `\${e.from}>\${e.to}`;
    edgePts.set(key, e.from === e.to ? loopPts(a.rect, unit) : curvePts(a.rect, b.rect, key, unit));
  }

  const walk: { key: string; pts: Pt[]; toId: string }[] = [];
  {
    let curId = startId;
    for (const st of scene.steps) {
      const key = `\${curId}>\${st.go}`;
      let pts = st.go === curId ? loopPts((rects.get(curId) ?? [...rects.values()][0]).rect, unit) : edgePts.get(key);
      if (!pts) {
        const a = (rects.get(curId) ?? [...rects.values()][0]).rect;
        const b = (rects.get(st.go) ?? rects.get(curId) ?? [...rects.values()][0]).rect;
        pts = [{ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }];
      }
      walk.push({ key, pts, toId: st.go });
      curId = st.go;
    }
  }

  const arrivedKeys = new Set<string>();
  stepT.forEach((t, k) => {
    if (t >= ARRIVE) {
      arrivedKeys.add(walk[k].key);
    }
  });

  for (const e of scene.edges) {
    const pts = edgePts.get(`\${e.from}>\${e.to}`);
    if (!pts) continue;
    ctx.save();
    ctx.globalAlpha = 0.22 * introIn;
    ctx.strokeStyle = "rgba(148,163,184,0.9)";
    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.lineWidth = unit * 0.07;
    ctx.lineCap = "round";
    strokePolylineProgress(ctx, pts, 1);
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    drawArrowhead(ctx, last.x, last.y, Math.atan2(last.y - prev.y, last.x - prev.x), unit * 0.38);
    ctx.restore();
  }

  walk.forEach((w, k) => {
    const t = stepT[k];
    if (t <= 0) return;
    const prog = easeInOutCubic(clamp01(t / ARRIVE));
    const isCurrentBeat = active === offset + k;
    ctx.save();
    ctx.globalAlpha = (isCurrentBeat ? 1 : 0.85) * introIn;
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.14;
    ctx.lineCap = "round";
    if (isCurrentBeat) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.45;
    }
    strokePolylineProgress(ctx, w.pts, prog);
    ctx.restore();
  });

  for (const e of scene.edges) {
    if (!e.label) continue;
    const pts = edgePts.get(`\${e.from}>\${e.to}`);
    if (!pts) continue;
    const taken = arrivedKeys.has(`\${e.from}>\${e.to}`);
    const mid = pointAlongPolyline(pts, 0.5);
    ctx.save();
    ctx.globalAlpha = (taken ? 0.9 : 0.4) * introIn;
    ctx.font = `600 \${unit * (vertical ? 0.62 : 0.55)}px \${FONT_SANS}`;
    const tw = ctx.measureText(e.label).width;
    roundRect(ctx, mid.x - tw / 2 - unit * 0.32, mid.y - unit * 0.48, tw + unit * 0.64, unit * 0.96, unit * 0.26);
    ctx.fillStyle = "#0a0e13";
    ctx.fill();
    ctx.strokeStyle = taken ? rgba(accent, 0.6) : THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = taken ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(e.label, mid.x, mid.y + unit * 0.2);
    ctx.restore();
  }

  for (const s of scene.states) {
    const entry = rects.get(s.id);
    if (!entry) continue;
    const { rect, fontPx } = entry;
    const isVisited = visited.has(s.id);
    const isCurrent = s.id === currentId;

    let scale = 1;
    walk.forEach((w, k) => {
      if (w.toId !== s.id) return;
      const t = stepT[k];
      if (t >= ARRIVE && t < ARRIVE + 0.3) {
        const popT = clamp01((t - ARRIVE) / 0.3);
        scale = 1 + 0.07 * Math.sin(Math.PI * easeOutCubic(popT));
      }
    });

    if (isCurrent) {
      const ringF = (env.elapsedMs % 1400) / 1400;
      const g = unit * (0.12 + 0.55 * easeOutCubic(ringF));
      ctx.save();
      ctx.globalAlpha = 0.4 * (1 - ringF) * introIn;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.07;
      roundRect(ctx, rect.x - g, rect.y - g, rect.w + g * 2, rect.h + g * 2, (rect.h + g * 2) / 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = (isVisited ? 1 : 0.5) * introIn;
    ctx.translate(rect.cx, rect.cy);
    ctx.scale(scale, scale);
    ctx.translate(-rect.cx, -rect.cy);
    
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 1.0;
    }
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (isVisited) {
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
      ctx.fillStyle = accentSoft;
      ctx.fill();
    }
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
    ctx.strokeStyle = isCurrent ? accent : isVisited ? rgba(accent, 0.75) : s.accent ? accentGlow : "rgba(148,163,184,0.4)";
    ctx.lineWidth = isCurrent ? unit * 0.13 : isVisited || s.accent ? unit * 0.09 : unit * 0.06;
    ctx.stroke();

    ctx.font = `700 \${fontPx}px \${FONT_SANS}`;
    ctx.fillStyle = isVisited ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(s.label, rect.cx, rect.cy + fontPx * 0.35);
    ctx.restore();
  }
  ctx.textAlign = "start";

  let inTransit = false;
  let tokenPos: Pt = { x: rects.get(startId)?.rect.cx ?? 0, y: rects.get(startId)?.rect.cy ?? 0 };
  let transitPts: Pt[] | null = null;
  let transitGlide = 0;
  for (let k = walk.length - 1; k >= 0; k--) {
    const t = stepT[k];
    if (t > 0) {
      const glide = easeInOutCubic(clamp01(t / ARRIVE));
      tokenPos = pointAlongPolyline(walk[k].pts, glide);
      inTransit = glide < 1;
      transitPts = walk[k].pts;
      transitGlide = glide;
      break;
    }
  }

  if (!inTransit && lastArrived >= 0) {
    const f = (env.elapsedMs % 1600) / 1600;
    const dot = pointAlongPolyline(walk[lastArrived].pts, f);
    ctx.save();
    ctx.globalAlpha = 0.9 * Math.sin(Math.PI * f) * introIn;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.9;
    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, unit * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (inTransit && transitPts) {
    for (let j = 1; j <= 3; j++) {
      const f = transitGlide - j * 0.06;
      if (f <= 0) continue;
      const d = pointAlongPolyline(transitPts, f);
      ctx.save();
      ctx.globalAlpha = (0.45 - j * 0.12) * introIn;
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath();
      ctx.arc(d.x, d.y, unit * (0.24 - j * 0.05), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.save();
  ctx.globalAlpha = introIn;
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * (inTransit ? 1.0 : 0.7 + 0.6 * idle(env, 2000));
  ctx.fillStyle = "#eaf6ff";
  ctx.beginPath();
  ctx.arc(tokenPos.x, tokenPos.y, unit * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(accent, 0.8);
  ctx.lineWidth = unit * 0.06;
  ctx.beginPath();
  ctx.arc(tokenPos.x, tokenPos.y, unit * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

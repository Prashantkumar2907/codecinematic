import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  hashStr,
  shade,
  sub,
  clamp01,
  roundRect,
  drawSceneTitle,
  drawArrowhead,
  strokePolylineProgress,
  pointAlongPolyline,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";
import { createNoise2D } from "simplex-noise";

/** A travelling marker/glow reads as white-hot regardless of subject accent —
 *  same convention as `cipher.ts`'s `INK_BRIGHT`. */
const SPARK = "#eaf6ff";
/** Landmark icon/chip fill — same convention as `cipher.ts`'s `INK_FILL`. */
const INK_FILL = "#0e2433";
const INK_PANEL = THEME.bgBottom;
/** Idle terrain-block face — matches `table.ts`/`bits.ts`/`circuit.ts`'s
 *  idle-face convention rather than a one-off hex. */
const IDLE_FACE = shade(THEME.panel, 0.09);

type TerrainScene = Extract<Scene, { kind: "terrain" }>;
type Feature = TerrainScene["features"][number];
type Pt = { x: number; y: number };

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noiseCache = new Map<string, (x: number, y: number) => number>();
function noiseFor(id: string): (x: number, y: number) => number {
  let n = noiseCache.get(id);
  if (!n) {
    n = createNoise2D(mulberry32(hashStr(id)));
    noiseCache.set(id, n);
  }
  return n;
}

const RIDGE_SAMPLES = 60;
const AT_MAX = 11;
const CITY_HEIGHTS = [0.7, 1.15, 0.9, 1.35];

function smoothRidge(raw: Pt[]): Pt[] {
  if (raw.length < 3) return raw.slice();
  const out: Pt[] = [raw[0]];
  const per = Math.max(2, Math.ceil(RIDGE_SAMPLES / (raw.length - 1)));
  let prev = raw[0];
  for (let j = 1; j < raw.length; j++) {
    const ctrl = raw[j];
    const end = j === raw.length - 1 ? raw[j] : { x: (raw[j].x + raw[j + 1].x) / 2, y: (raw[j].y + raw[j + 1].y) / 2 };
    for (let s = 1; s <= per; s++) {
      const t = s / per;
      const a = 1 - t;
      out.push({
        x: a * a * prev.x + 2 * a * t * ctrl.x + t * t * end.x,
        y: a * a * prev.y + 2 * a * t * ctrl.y + t * t * end.y,
      });
    }
    prev = end;
  }
  return out;
}

function ridgeYAt(ridge: Pt[], x: number): number {
  if (x <= ridge[0].x) return ridge[0].y;
  for (let i = 1; i < ridge.length; i++) {
    if (x <= ridge[i].x) {
      const a = ridge[i - 1];
      const b = ridge[i];
      const f = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * f;
    }
  }
  return ridge[ridge.length - 1].y;
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  feature: Feature,
  fx: number,
  fy: number,
  t: number,
  ridge: Pt[],
  groundBottom: number,
  env: PaintEnv
) {
  const { unit, contentX } = env.layout;
  const { accent, secondary } = env.palette;
  const vin = easeOutCubic(clamp01((t - 0.25) / 0.3));
  if (vin <= 0) return;
  const ms = env.elapsedMs;
  ctx.save();
  ctx.globalAlpha = vin;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (feature.kind) {
    case "peak": {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = unit * 0.08;
      for (let i = 0; i < 3; i++) {
        const hw = unit * (0.28 + i * 0.16);
        const yy = fy + unit * (0.3 + i * 0.26);
        ctx.beginPath();
        ctx.moveTo(fx - hw, yy + unit * 0.14);
        ctx.lineTo(fx, yy);
        ctx.lineTo(fx + hw, yy + unit * 0.14);
        ctx.stroke();
      }
      break;
    }
    case "glacier": {
      const slope = Math.atan2(ridgeYAt(ridge, fx + unit) - ridgeYAt(ridge, fx - unit), unit * 2);
      ctx.save();
      ctx.translate(fx, fy + unit * 0.35);
      ctx.rotate(slope);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(0, 0, unit * 1.1, unit * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = SPARK;
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = vin * (0.3 + 0.7 * Math.abs(Math.sin(ms / 500 + i * 1.7)));
        ctx.beginPath();
        ctx.arc(fx + (i === 0 ? -unit * 0.4 : unit * 0.5), fy + unit * 0.3, unit * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "dam": {
      const wallW = unit * 0.36;
      const wallTop = fy - unit * 1.2;
      ctx.fillStyle = INK_FILL;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.06;
      ctx.fillRect(fx - wallW / 2, wallTop, wallW, fy - wallTop + unit * 0.25);
      ctx.strokeRect(fx - wallW / 2, wallTop, wallW, fy - wallTop + unit * 0.25);
      const uphillLeft = ridgeYAt(ridge, fx - unit * 2) < ridgeYAt(ridge, fx + unit * 2);
      const dir = uphillLeft ? -1 : 1;
      const rise = easeOutCubic(clamp01((t - 0.35) / 0.45));
      const waterY = fy - unit * 1.0 * rise;
      ctx.strokeStyle = rgba(secondary, 0.7);
      ctx.lineWidth = unit * 0.08;
      ctx.beginPath();
      ctx.moveTo(fx + (dir * wallW) / 2, waterY);
      ctx.lineTo(fx + dir * unit * 1.6, waterY);
      ctx.stroke();
      ctx.lineWidth = unit * 0.05;
      ctx.setLineDash([unit * 0.18, unit * 0.22]);
      for (let i = 1; i <= 2; i++) {
        ctx.globalAlpha = vin * 0.35;
        ctx.beginPath();
        ctx.moveTo(fx + (dir * wallW) / 2, waterY + i * unit * 0.28);
        ctx.lineTo(fx + dir * unit * (1.6 - i * 0.35), waterY + i * unit * 0.28);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      break;
    }
    case "city": {
      const bw = unit * 0.36;
      CITY_HEIGHTS.forEach((hh, i) => {
        const bx = fx + (i - 1.5) * unit * 0.46;
        const by = ridgeYAt(ridge, bx);
        ctx.fillStyle = INK_FILL;
        ctx.strokeStyle = rgba(accent, 0.6);
        ctx.lineWidth = unit * 0.04;
        ctx.fillRect(bx - bw / 2, by - unit * hh, bw, unit * hh);
        ctx.strokeRect(bx - bw / 2, by - unit * hh, bw, unit * hh);
      });
      ctx.fillStyle = THEME.warn;
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = vin * (0.35 + 0.65 * Math.abs(Math.sin(ms / 700 + i * 2.1)));
        const bx = fx + (i === 0 ? -0.5 : 0.5) * unit * 0.46;
        ctx.beginPath();
        ctx.arc(bx, ridgeYAt(ridge, bx) - unit * (0.5 + i * 0.3), unit * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "delta": {
      ctx.strokeStyle = rgba(secondary, 0.65);
      ctx.lineWidth = unit * 0.09;
      const arms: Pt[][] = [-1, 0, 1].map((d) => {
        const pts: Pt[] = [];
        for (let s = 0; s <= 8; s++) {
          const f = s / 8;
          pts.push({ x: fx + f * unit * 1.8, y: fy + f * unit * 0.3 + d * f * f * unit * 0.7 });
        }
        return pts;
      });
      for (const arm of arms) {
        ctx.beginPath();
        ctx.moveTo(arm[0].x, arm[0].y);
        for (const pt of arm) ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      ctx.fillStyle = SPARK;
      arms.forEach((arm, i) => {
        const f = (ms / 1800 + i / 3) % 1;
        const dot = pointAlongPolyline(arm, f);
        ctx.globalAlpha = vin * 0.8 * Math.sin(Math.PI * f);
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.08, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case "rain": {
      const cy = fy - unit * 2.3;
      ctx.fillStyle = rgba(THEME.textDim, 0.28);
      ctx.beginPath();
      ctx.arc(fx - unit * 0.35, cy, unit * 0.42, 0, Math.PI * 2);
      ctx.arc(fx + unit * 0.35, cy + unit * 0.08, unit * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(secondary, 0.6);
      ctx.lineWidth = unit * 0.05;
      const fallH = fy - cy - unit * 0.6;
      for (let i = 0; i < 6; i++) {
        const f = (ms / 900 + i * 0.37) % 1;
        const rx = fx - unit * 0.7 + i * unit * 0.28;
        const ry = cy + unit * 0.55 + f * fallH;
        ctx.globalAlpha = vin * 0.7 * (1 - f);
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - unit * 0.06, ry + unit * 0.3);
        ctx.stroke();
      }
      break;
    }
    case "wind": {
      ctx.strokeStyle = rgba(accent, 0.45);
      ctx.fillStyle = rgba(accent, 0.45);
      ctx.lineWidth = unit * 0.07;
      ctx.setLineDash([unit * 0.4, unit * 0.35]);
      ctx.lineDashOffset = -((ms / 25) % (unit * 0.75));
      for (let i = 0; i < 3; i++) {
        const y0 = fy - unit * (0.4 + i * 0.7);
        const pts: Pt[] = [];
        for (let s = 0; s <= 12; s++) {
          const f = s / 12;
          const px = contentX + f * (fx - contentX);
          const lift = Math.pow(f, 2.2) * unit * (1.1 + i * 0.5);
          pts.push({ x: px, y: Math.min(y0, ridgeYAt(ridge, px) - unit * (0.4 + i * 0.5)) + Math.sin(f * 5 + i) * unit * 0.1 - lift * 0.2 });
        }
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const pt of pts) ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        const tip = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        ctx.setLineDash([]);
        drawArrowhead(ctx, tip.x, tip.y, Math.atan2(tip.y - prev.y, tip.x - prev.x), unit * 0.3);
        ctx.setLineDash([unit * 0.4, unit * 0.35]);
      }
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      break;
    }
    case "plate": {
      const by = groundBottom - unit * 0.45;
      ctx.fillStyle = rgba(accent, 0.7);
      ctx.strokeStyle = rgba(accent, 0.7);
      ctx.lineWidth = unit * 0.16;
      ctx.beginPath();
      ctx.moveTo(fx - unit * 2.1, by);
      ctx.lineTo(fx - unit * 0.8, by);
      ctx.stroke();
      drawArrowhead(ctx, fx - unit * 0.7, by, 0, unit * 0.4);
      ctx.beginPath();
      ctx.moveTo(fx + unit * 2.1, by);
      ctx.lineTo(fx + unit * 0.8, by);
      ctx.stroke();
      drawArrowhead(ctx, fx + unit * 0.7, by, Math.PI, unit * 0.4);
      ctx.lineWidth = unit * 0.07;
      for (let i = 0; i < 4; i++) {
        const f = (ms / 1200 + i / 4) % 1;
        const tx = fx + (i - 1.5) * unit * 0.3;
        const ty = by - unit * 0.5 - f * unit * 1.1;
        ctx.globalAlpha = vin * (1 - f) * 0.8;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx, ty - unit * 0.22);
        ctx.stroke();
      }
      break;
    }
    case "volcano": {
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.08;
      ctx.beginPath();
      ctx.moveTo(fx - unit * 0.4, fy);
      ctx.lineTo(fx - unit * 0.14, fy + unit * 0.26);
      ctx.lineTo(fx + unit * 0.14, fy + unit * 0.26);
      ctx.lineTo(fx + unit * 0.4, fy);
      ctx.stroke();
      ctx.fillStyle = THEME.warn;
      ctx.shadowColor = rgba(THEME.warn, 0.6);
      ctx.shadowBlur = unit * 0.5;
      for (let i = 0; i < 3; i++) {
        const f = (ms / 1000 + i / 3) % 1;
        ctx.globalAlpha = vin * (1 - f);
        ctx.beginPath();
        ctx.arc(fx + Math.sin(f * 6 + i * 2) * unit * 0.18, fy + unit * 0.1 - f * unit * 1.5, unit * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      break;
    }
    case "forest": {
      ctx.fillStyle = rgba(THEME.good, 0.55);
      for (let i = 0; i < 5; i++) {
        const tx = fx + (i - 2) * unit * 0.55;
        const ty = ridgeYAt(ridge, tx);
        ctx.beginPath();
        ctx.moveTo(tx, ty - unit * 0.6);
        ctx.lineTo(tx - unit * 0.22, ty);
        ctx.lineTo(tx + unit * 0.22, ty);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

export function paintTerrain(ctx: CanvasRenderingContext2D, scene: TerrainScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.features.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + titleBand;
  const areaH = contentH - titleBand;
  const groundBottom = areaY + areaH;

  const n = scene.profile.length;
  const spreadX = vertical ? 3.5 : 5.5;
  const spreadZ = vertical ? 3.5 : 3.5;
  const maxH3D = 3.0;

  const raw3D: Pt[] = scene.profile.map((elev, i) => ({
    x: (i / (n - 1) - 0.5) * spreadX * 2,
    y: (elev / 10) * maxH3D,
  }));
  const ridge3D = smoothRidge(raw3D);

  const noise = noiseFor(scene.id);
  const rough3D = (pts: Pt[], amp: number) => {
    for (const p of pts) {
      const nx = (p.x + spreadX) / (spreadX * 2 * 0.09);
      p.y += noise(nx, 0) * amp + noise(nx * 3.3, 5.2) * amp * 0.4;
    }
  };
  rough3D(ridge3D, 0.15 * maxH3D);

  const landIn = easeInOutCubic(enterT(env, 460));
  if (landIn <= 0) {
    ctx.textAlign = "start";
    return;
  }

  const rect = { x: contentX, y: areaY, w: contentW, h: areaH };
  const key = scene.id + "-terrain3d";
  
  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 10, vertical ? 10 : 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(spreadX * 3, 14, new THREE.Color(accent), new THREE.Color(THEME.textDim));
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

    const geo = new THREE.PlaneGeometry(spreadX * 2, spreadZ * 2, 60, 20);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let h = ridgeYAt(ridge3D, x);
      const nx = (x + spreadX) / (spreadX * 2 * 0.09);
      const nz = (z + spreadZ) / (spreadZ * 2 * 0.09);
      h += noise(nx, nz) * 0.15 * maxH3D;
      pos.setY(i, h);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(IDLE_FACE),
      emissive: new THREE.Color(IDLE_FACE),
      emissiveIntensity: 0.1,
      metalness: 0.2,
      roughness: 0.5,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    s.add(terrainMesh);

    const featureModels = scene.features.map(f => {
      const fracX = f.at / AT_MAX;
      const x3D = (fracX - 0.5) * spreadX * 2;
      const y3D = ridgeYAt(ridge3D, x3D);
      const block = makeBlock(0.5, 0.5, 0.5, INK_FILL, accent);
      block.position.set(x3D, y3D + 0.25, 0);
      s.add(block);
      return { mesh: block, x: x3D, y: y3D };
    });

    const update = (elapsedMs: number, ctxData: { tVals: number[], landIn: number }) => {
      terrainMesh.position.y = -0.5 + 0.5 * ctxData.landIn;
      (mat as THREE.MeshPhysicalMaterial).opacity = ctxData.landIn;
      
      featureModels.forEach((m, k) => {
        const t = ctxData.tVals[k] || 0;
        const pop = easeOutBack(clamp01(t / 0.25));
        m.mesh.scale.setScalar(Math.max(0.001, pop));
        m.mesh.position.y = m.y + 0.25 + Math.sin(elapsedMs / 1000 + k) * 0.1;
        m.mesh.rotation.y = elapsedMs / 2000 + k;
      });
    };

    return { scene: s, camera, update };
  };

  const tVals = scene.features.map((_, k) => beatT(env.beats, offset + k, totalBeats, env.p));
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { tVals, landIn });
  if (!cam) return;

  const projectedRidge = ridge3D.map(p => projectToRect(cam, new THREE.Vector3(p.x, p.y, 0), rect));

  if (scene.river) {
    let peakI = 0;
    scene.profile.forEach((e, i) => { if (e > scene.profile[peakI]) peakI = i; });
    const startX3D = raw3D[peakI].x;
    const riverPts: Pt[] = [];
    const steps = 30;
    for (let s = 0; s <= steps; s++) {
      const rx = startX3D + ((spreadX * 2 - (startX3D + spreadX)) * s) / steps;
      const ry = ridgeYAt(ridge3D, rx);
      riverPts.push(projectToRect(cam, new THREE.Vector3(rx, ry + 0.05, 0), rect));
    }
    if (riverPts.length > 1) {
      ctx.save();
      ctx.globalAlpha = landIn * 0.7;
      ctx.strokeStyle = secondary;
      ctx.lineCap = "round";
      for (let s = 1; s <= steps; s++) {
        ctx.lineWidth = unit * (0.1 + 0.12 * (s / steps));
        ctx.beginPath();
        ctx.moveTo(riverPts[s - 1].x, riverPts[s - 1].y);
        ctx.lineTo(riverPts[s].x, riverPts[s].y);
        ctx.stroke();
      }
      ctx.fillStyle = SPARK;
      for (let d = 0; d < 3; d++) {
        const f = (env.elapsedMs / 2600 + d / 3) % 1;
        const dot = pointAlongPolyline(riverPts, f);
        ctx.globalAlpha = landIn * 0.85 * Math.sin(Math.PI * f);
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  const chipH = unit * 1.1;
  scene.features.forEach((feature, k) => {
    const t = tVals[k];
    if (t <= 0) return;
    const fracX = feature.at / AT_MAX;
    const x3D = (fracX - 0.5) * spreadX * 2;
    const y3D = ridgeYAt(ridge3D, x3D);
    
    const pt = projectToRect(cam, new THREE.Vector3(x3D, y3D + 0.5, 0), rect);
    const fx = pt.x;
    const fy = pt.y;
    
    const isCurrent = active === offset + k;
    const featAlpha = isCurrent ? 1 : 0.6;

    ctx.save();
    ctx.globalAlpha = featAlpha;

    ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
    const tw = ctx.measureText(feature.label).width;
    const chipW = tw + unit * 0.9;
    const chipX = Math.min(Math.max(fx - chipW / 2, contentX), contentX + contentW - chipW);
    const chipY = areaY + unit * 0.2 + (k % 3) * (chipH + unit * 0.35);
    const leadIn = easeOutCubic(sub(t, 0.22, 0.22));
    if (leadIn > 0) {
      ctx.strokeStyle = rgba(THEME.textDim, 0.4);
      ctx.lineWidth = unit * 0.045;
      strokePolylineProgress(
        ctx,
        [
          { x: fx, y: fy - unit * 1.05 },
          { x: fx, y: chipY + chipH },
        ],
        leadIn
      );
    }
    const chipIn = easeOutCubic(sub(t, 0.34, 0.18));
    if (chipIn > 0) {
      ctx.save();
      ctx.globalAlpha = featAlpha * chipIn;
      if (isCurrent) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.55;
      }
      roundRect(ctx, chipX, chipY, chipW, chipH, unit * 0.32);
      ctx.fillStyle = INK_PANEL;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isCurrent ? rgba(accent, 0.7) : rgba(THEME.textDim, 0.35);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(feature.label, chipX + chipW / 2, chipY + chipH * 0.68);
      ctx.textAlign = "start";
      ctx.restore();
    }

    drawVignette(ctx, feature, fx, fy, t, projectedRidge, groundBottom, env);
    ctx.restore();
  });
  ctx.textAlign = "start";
}
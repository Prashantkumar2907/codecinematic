import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeCylinder, isoCamera, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  enterT,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type RadarScene = Extract<Scene, { kind: "radar" }>;

const RINGS = 4;
const DRAW = 0.65;
const TAU = Math.PI * 2;
// Captions sit in the bottom ~14% of vertical frames; keep the legend above.
const CAPTION_SAFE_Y = 0.86;

export function paintRadar(ctx: CanvasRenderingContext2D, scene: RadarScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, w } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const nEnt = scene.entities.length;
  const totalBeats = offset + nEnt;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const ghostIn = easeOutCubic(enterT(env, 420));
  const entColors = [accent, secondary, THEME.good];

  // drawSceneTitle finishes its fade at p=0.12; feed it absolute time so the title lands in ~360ms.
  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const ah = safeBottom - ay;

  const legendH = vertical ? unit * (1.5 + nEnt * 1.2) : 0;
  const legendW = vertical ? 0 : Math.min(aw * 0.28, unit * 7);
  const webAreaW = aw - legendW;
  const webAreaH = ah - legendH;
  const nAxes = scene.axes.length;
  
  const rect = { x: ax, y: ay, w: webAreaW, h: webAreaH };
  const spreadR = 4.5;
  const angleOf = (j: number) => -Math.PI / 2 + (j / nAxes) * TAU;
  const ptAt3D = (j: number, frac: number) => {
    const a = angleOf(j);
    return new THREE.Vector3(Math.cos(a) * spreadR * frac, 0.2, Math.sin(a) * spreadR * frac);
  };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = isoCamera();
    if (vertical) {
       camera.position.set(8.5, 7.2, 9.5);
    }
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(spreadR * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadR * 4, spreadR * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models: { mesh: THREE.Group, entIdx: number, axisIdx: number, color: string }[] = [];
    
    scene.entities.forEach((ent, k) => {
      const color = entColors[k % entColors.length];
      for (let j = 0; j < nAxes; j++) {
        const g = makeCylinder(0.25, 0.4, color, color);
        s.add(g);
        models.push({ mesh: g, entIdx: k, axisIdx: j, color });
      }
    });

    const update = (elapsedMs: number, ctxData: any) => {
       const { active, offset, totalBeats, p, ghostIn, beats } = ctxData;
       const entIdx = active - offset;
       
       models.forEach(m => {
          const isActive = m.entIdx === entIdx && active < totalBeats;
          const isPast = m.entIdx < entIdx;
          if (!isActive && !isPast) {
             m.mesh.visible = false;
             return;
          }
          const t = beatT(beats, offset + m.entIdx, totalBeats, p);
          const settled = !isActive || t >= 1;
          const stagger = 0.5 / nAxes;
          const vReveal = isPast ? 1 : easeOutBack(clamp01((t - m.axisIdx * stagger) / DRAW));
          const breathe = isActive && settled ? 1 + 0.04 * Math.sin(elapsedMs / 420) : 1;
          
          const val = scene.entities[m.entIdx].values[m.axisIdx];
          const frac = (val / 100) * clamp01(vReveal) * breathe;
          const p3d = ptAt3D(m.axisIdx, frac);
          
          m.mesh.visible = vReveal > 0.01;
          m.mesh.position.copy(p3d);
          const pop = Math.max(0.001, vReveal);
          m.mesh.scale.set(pop, pop, pop);
          
          m.mesh.children.forEach(child => {
             if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = vReveal * 0.9 * ghostIn;
                mat.emissiveIntensity = isActive ? 0.6 : 0.2;
             }
          });
       });
    };
    return { scene: s, camera, update };
  };

  const key = scene.id + "-radar3d";
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { active, offset, totalBeats, p: env.p, ghostIn, beats: env.beats });
  if (!cam) return;

  const ptAt = (j: number, frac: number) => {
     return projectToRect(cam, ptAt3D(j, frac), rect);
  };
  const center2d = projectToRect(cam, new THREE.Vector3(0, 0, 0), rect);

  // ---- Ghost web (grid rings + spokes + axis labels) ----
  ctx.save();
  ctx.globalAlpha = ghostIn;
  ctx.strokeStyle = "rgba(148,163,184,0.18)";
  ctx.lineWidth = unit * 0.04;
  for (let r = 1; r <= RINGS; r++) {
    const frac = r / RINGS;
    ctx.beginPath();
    for (let j = 0; j <= nAxes; j++) {
      const p = ptAt(j % nAxes, frac);
      j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  for (let j = 0; j < nAxes; j++) {
    const p = ptAt(j, 1);
    ctx.beginPath();
    ctx.moveTo(center2d.x, center2d.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  // Rotating radar sweep
  const sweepA = (env.elapsedMs / 4200) * TAU - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(center2d.x, center2d.y);
  for(let a = sweepA - 0.55; a <= sweepA; a += 0.05) {
     const p2d = projectToRect(cam, new THREE.Vector3(Math.cos(a)*spreadR, 0, Math.sin(a)*spreadR), rect);
     ctx.lineTo(p2d.x, p2d.y);
  }
  const e2d = projectToRect(cam, new THREE.Vector3(Math.cos(sweepA)*spreadR, 0, Math.sin(sweepA)*spreadR), rect);
  ctx.lineTo(e2d.x, e2d.y);
  ctx.closePath();
  ctx.fillStyle = rgba(accent, 0.06 * ghostIn);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.45 * ghostIn);
  ctx.lineWidth = unit * 0.08;
  ctx.beginPath();
  ctx.moveTo(center2d.x, center2d.y);
  ctx.lineTo(e2d.x, e2d.y);
  ctx.stroke();

  // Axis labels
  scene.axes.forEach((axis, j) => {
    const a = angleOf(j);
    const p3d = new THREE.Vector3(Math.cos(a) * (spreadR * 1.3), 0, Math.sin(a) * (spreadR * 1.3));
    const p2d = projectToRect(cam, p3d, rect);
    const lx = p2d.x;
    const ly = p2d.y;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const side: -1 | 0 | 1 = Math.abs(c) < 0.35 ? 0 : c > 0 ? 1 : -1;
    const maxW = side === 0 ? unit * 5 : Math.max(unit * 2, (side > 0 ? w - lx : lx) - unit * 0.4);
    const lpx = fitFontSize(ctx, axis, { maxW, startPx: unit * 0.62, minPx: unit * 0.44, weight: 700 });
    ctx.font = `700 ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = side === 0 ? "center" : side > 0 ? "left" : "right";
    ctx.fillText(axis, lx, ly + unit * 0.2);
  });
  ctx.textAlign = "start";
  ctx.restore();

  // ---- Entity polygons ----
  const entIdx = active - offset;
  const drawEntity = (k: number) => {
    const ent = scene.entities[k];
    const color = entColors[k % entColors.length];
    const isActive = k === entIdx && active < totalBeats;
    const isPast = k < entIdx;
    if (!isActive && !isPast) return;

    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    const settled = !isActive || t >= 1;
    const stagger = 0.5 / nAxes;
    const vReveal = (j: number) =>
      isPast ? 1 : easeOutBack(clamp01((t - j * stagger) / DRAW));
    const breathe = isActive && settled ? 1 + 0.04 * Math.sin(env.elapsedMs / 420) : 1;

    const pts = scene.axes.map((_, j) => {
      const frac = (ent.values[j] / 100) * clamp01(vReveal(j)) * breathe;
      return ptAt(j, frac);
    });
    const revealedCount = scene.axes.filter((_, j) => vReveal(j) > 0.01).length;

    ctx.save();
    const baseAlpha = isActive ? 1 : 0.6;
    ctx.globalAlpha = baseAlpha * ghostIn;

    const fillA = isPast ? 0.15 : 0.15 * clamp01((t - 0.4) / 0.35);
    if (revealedCount >= nAxes && fillA > 0) {
      ctx.beginPath();
      pts.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = rgba(color, fillA);
      ctx.fill();
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = isActive ? unit * 0.13 : unit * 0.07;
    ctx.lineJoin = "round";
    if (isActive && !settled) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
    } else if (isActive) {
      ctx.shadowColor = rgba(color, 0.5);
      ctx.shadowBlur = unit * (0.4 + 0.3 * Math.sin(env.elapsedMs / 420));
    }
    ctx.beginPath();
    let started = false;
    for (let j = 0; j < nAxes; j++) {
      if (vReveal(j) <= 0.01) continue;
      const p = pts[j];
      started ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), (started = true));
    }
    if (revealedCount >= nAxes) ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (let j = 0; j < nAxes; j++) {
      const rv = vReveal(j);
      if (rv <= 0.01) continue;
      const p = pts[j];
      if (isActive) {
        ctx.font = `800 ${unit * 0.5}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.text;
        ctx.globalAlpha = baseAlpha * ghostIn * clamp01(rv);
        const a = angleOf(j);
        ctx.textAlign = Math.abs(Math.cos(a)) < 0.35 ? "center" : Math.cos(a) > 0 ? "left" : "right";
        const off = unit * 0.65;
        // Adjust for isometric projection offsets
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.fillText(String(ent.values[j]), p.x + c * off, p.y + s * off - unit * 0.4);
        ctx.globalAlpha = baseAlpha * ghostIn;
        ctx.textAlign = "start";
      }
    }
    ctx.restore();
  };

  // Past first, active last so the active polygon lands on top.
  for (let k = 0; k < nEnt; k++) if (k !== entIdx) drawEntity(k);
  if (entIdx >= 0 && entIdx < nEnt) drawEntity(entIdx);

  // ---- Legend ----
  // Landscape: the legend column sits beside the web, centred on it.
  const rowH = unit * 1.3;
  const webCy = rect.y + rect.h / 2;
  const legX = vertical ? ax + unit * 0.4 : ax + webAreaW + unit * 0.6;
  const legTop = vertical ? ay + webAreaH + unit * 0.6 : webCy - (nEnt * rowH) / 2;
  scene.entities.forEach((ent, k) => {
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    if (t <= 0 && ghostIn <= 0) return;
    const shown = t > 0 || k <= entIdx;
    const isActive = k === entIdx && active < totalBeats;
    const color = entColors[k % entColors.length];
    const rowY = legTop + k * rowH;
    ctx.save();
    ctx.globalAlpha = ghostIn * (shown ? (isActive ? 1 : k < entIdx ? 0.7 : 0.25) : 0.25);
    const chip = unit * 0.5;
    if (isActive) {
      ctx.shadowColor = rgba(color, 0.6);
      ctx.shadowBlur = unit * 0.4;
    }
    roundRect(ctx, legX, rowY, chip, chip, unit * 0.14);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    const lpx = fitFontSize(ctx, ent.label, {
      maxW: (vertical ? aw : legendW) - chip - unit * 1.0,
      startPx: unit * 0.72,
      minPx: unit * 0.5,
      weight: isActive ? 800 : 600,
    });
    ctx.font = `${isActive ? 800 : 600} ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = isActive ? THEME.text : THEME.textDim;
    ctx.textAlign = "start";
    ctx.fillText(ent.label, legX + chip + unit * 0.5, rowY + chip * 0.85);
    ctx.restore();
  });
  ctx.textAlign = "start";
}

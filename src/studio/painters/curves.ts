import * as THREE from "three";
import { render3D, projectToRect, studioLights, type ThreeBundle, color3 } from "./three3d";
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
  drawSceneTitle,
  drawArrowhead,
  strokePolylineProgress,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type CurvesScene = Extract<Scene, { kind: "curves" }>;
type Shape = CurvesScene["curves"][number]["shape"];

const SAMPLES = 60;
const INK_PANEL = "#0a0e13";
const BELL_EDGE = Math.exp(-2.25);

/** Function value in 0..1 for input t in 0..1. */
function fn(shape: Shape, t: number): number {
  switch (shape) {
    case "linear":
      return t;
    case "exp":
      return (Math.exp(3 * t) - 1) / (Math.exp(3) - 1);
    case "log":
      return Math.log(1 + 9 * t) / Math.log(10);
    case "sine":
      return 0.5 + 0.4 * Math.sin(2 * Math.PI * t);
    case "bell":
      return (Math.exp(-Math.pow((t - 0.5) * 3, 2)) - BELL_EDGE) / (1 - BELL_EDGE);
    case "supply":
      return 0.1 + 0.8 * t;
    case "demand":
      return 0.9 - 0.8 * t;
    case "scurve":
      return 1 / (1 + Math.exp(-10 * (t - 0.5)));
    case "ushape":
      return Math.pow(2 * t - 1, 2);
  }
}

const curveColor = (i: number, palette: PaintEnv["palette"]): string =>
  i === 0 ? palette.accent : i === 1 ? palette.secondary : THEME.good;

export function paintCurves(ctx: CanvasRenderingContext2D, scene: CurvesScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.curves.length + (scene.mark ? 1 : 0);
  const markBeat = scene.mark ? totalBeats - 1 : -1;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const frameIn = easeOutCubic(enterT(env, 400));
  const key = scene.id + "-crvs3d";

  const band = drawSceneTitle(ctx, scene.title, layout, 0.12 * enterT(env, 350), accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  // Plot box with margins for axis labels.
  const marginL = unit * 1.8;
  const marginB = unit * 1.8;
  const marginT = unit * 1.0;
  const marginR = unit * 1.2;
  const plotX = contentX + marginL;
  const plotY = areaY + marginT;
  const plotW = contentW - marginL - marginR;
  const plotH = areaH - marginT - marginB;
  const rect = { x: contentX, y: areaY, w: contentW, h: areaH };

  const spreadX = vertical ? 5 : 7.5;
  const spreadY = vertical ? 3.5 : 4.5;
  
  const worldPos = (t: number, yVal: number, zOffset: number) => {
    return new THREE.Vector3((t - 0.5) * spreadX, yVal * spreadY, zOffset);
  };

  const beatFrac = (b: number, p: number) => {
    const win = beatWindow(env.beats, b, totalBeats);
    return { started: p >= win.start, t: clamp01((p - win.start) / Math.max(win.end - win.start, 0.001)) };
  };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(1.5, vertical ? 6 : 5, vertical ? 8 : 7);
    camera.lookAt(0, spreadY / 2, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(Math.max(spreadX * 1.5, 10), 10, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.1;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 2, 10),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.1;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models: { mesh: THREE.Mesh, curveIdx: number, sampleIdx: number, t: number, yVal: number, zOffset: number }[] = [];
    
    scene.curves.forEach((cv, i) => {
        const colorHex = curveColor(i, env.palette);
        const geo = new THREE.SphereGeometry(0.06, 16, 16);
        const mat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(colorHex),
            emissive: new THREE.Color(colorHex),
            emissiveIntensity: 0.2,
            metalness: 0.2,
            roughness: 0.1,
            clearcoat: 1.0,
        });
        const zOffset = (i - (scene.curves.length - 1) / 2) * 0.4;
        for (let k = 0; k <= SAMPLES; k++) {
             const t = k / SAMPLES;
             const yVal = clamp01(fn(cv.shape, t));
             const mesh = new THREE.Mesh(geo, mat);
             mesh.castShadow = true;
             mesh.receiveShadow = true;
             s.add(mesh);
             models.push({ mesh, curveIdx: i, sampleIdx: k, t, yVal, zOffset });
        }
    });

    const update = (elapsedMs: number, ctxData: { gIn: number, p: number, activeIdx: number }) => {
      const { gIn, p, activeIdx } = ctxData;
      models.forEach((m) => {
          const { started, t: beatT } = beatFrac(offset + m.curveIdx, p);
          const drawProg = easeInOutCubic(clamp01(beatT / 0.55));
          
          if (!started || m.t > drawProg) {
              m.mesh.scale.setScalar(0.001);
          } else {
              const isActive = activeIdx === offset + m.curveIdx;
              const bob = Math.sin(elapsedMs / 800 + m.sampleIdx * 0.1) * 0.05;
              m.mesh.position.copy(worldPos(m.t, m.yVal, m.zOffset));
              m.mesh.position.y += bob;
              
              const isTip = Math.abs(m.t - drawProg) < 0.05 && drawProg < 1;
              const s = isTip ? 1.8 : 1.0;
              m.mesh.scale.setScalar(s * gIn);
              
              const mat = m.mesh.material as THREE.MeshPhysicalMaterial;
              mat.transparent = true;
              mat.opacity = gIn * (isActive || activeIdx < offset + m.curveIdx ? 1 : 0.4);
              if (isTip || (drawProg >= 1 && isActive)) {
                 mat.emissiveIntensity = 0.8 + 0.4 * Math.sin(elapsedMs / 200);
              } else {
                 mat.emissiveIntensity = 0.2;
              }
          }
      });
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: frameIn, p: env.p, activeIdx: active });
  if (!cam) return;

  // Axes in 2D projected from 3D coords for perfect overlay
  const origin3D = worldPos(0, 0, 0);
  const xMax3D = worldPos(1, 0, 0);
  const yMax3D = worldPos(0, 1, 0);
  
  const origin2D = projectToRect(cam, origin3D, rect);
  const xMax2D = projectToRect(cam, xMax3D, rect);
  const yMax2D = projectToRect(cam, yMax3D, rect);

  ctx.save();
  ctx.globalAlpha = frameIn;
  ctx.strokeStyle = "rgba(148,163,184,0.55)";
  ctx.fillStyle = "rgba(148,163,184,0.55)";
  ctx.lineWidth = unit * 0.06;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(origin2D.x, origin2D.y);
  ctx.lineTo(xMax2D.x, xMax2D.y);
  ctx.moveTo(origin2D.x, origin2D.y);
  ctx.lineTo(yMax2D.x, yMax2D.y);
  ctx.stroke();
  
  const angleX = Math.atan2(xMax2D.y - origin2D.y, xMax2D.x - origin2D.x);
  const angleY = Math.atan2(yMax2D.y - origin2D.y, yMax2D.x - origin2D.x);
  drawArrowhead(ctx, xMax2D.x, xMax2D.y, angleX, unit * 0.45);
  drawArrowhead(ctx, yMax2D.x, yMax2D.y, angleY, unit * 0.45);
  
  if (scene.xLabel) {
    ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(scene.xLabel, xMax2D.x, xMax2D.y + unit * 1.1);
  }
  if (scene.yLabel) {
    ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "right";
    ctx.fillText(scene.yLabel, yMax2D.x - unit * 0.5, yMax2D.y + unit * 0.2);
  }
  ctx.textAlign = "start";
  ctx.restore();

  // Draw 2D progressive curve strokes over the 3D spheres to connect them smoothly
  scene.curves.forEach((cv, i) => {
    const { started, t } = beatFrac(offset + i, env.p);
    const isActive = active === offset + i;
    const color = curveColor(i, env.palette);
    
    const zOffset = (i - (scene.curves.length - 1) / 2) * 0.4;
    const pts2D: {x: number, y: number}[] = [];
    for(let k=0; k<=SAMPLES; k++){
       const ct = k / SAMPLES;
       const cy = clamp01(fn(cv.shape, ct));
       const wp = worldPos(ct, cy, zOffset);
       const bob = Math.sin(env.elapsedMs / 800 + k * 0.1) * 0.05;
       wp.y += bob;
       pts2D.push(projectToRect(cam, wp, rect));
    }

    if (!started) {
      // Faint dashed ghost of the shape.
      ctx.save();
      ctx.globalAlpha = frameIn * 0.12;
      ctx.strokeStyle = color;
      ctx.lineWidth = unit * 0.08;
      ctx.setLineDash([unit * 0.35, unit * 0.3]);
      ctx.beginPath();
      pts2D.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    const drawProg = easeInOutCubic(clamp01(t / 0.55));

    ctx.save();
    ctx.globalAlpha = frameIn * (isActive || active < offset + i ? 1 : 0.8);
    ctx.strokeStyle = color;
    ctx.lineWidth = unit * 0.12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (isActive) {
      ctx.shadowColor = rgba(color, 0.5);
      ctx.shadowBlur = unit * 0.7;
    }
    const tip = strokePolylineProgress(ctx, pts2D, drawProg);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Label chip near the curve's end.
    if (drawProg > 0.6) {
      const end = pts2D[pts2D.length - 1];
      const chipIn = easeOutCubic(clamp01((drawProg - 0.6) / 0.3));
      ctx.save();
      ctx.globalAlpha = frameIn * chipIn * (isActive || active < offset + i ? 1 : 0.8);
      const chipPx = unit * (vertical ? 0.72 : 0.62);
      const chipH = chipPx * 1.75;
      ctx.font = `700 ${chipPx}px ${FONT_SANS}`;
      const tw = ctx.measureText(cv.label).width;
      const cw = tw + unit * 0.8;
      let chX = end.x - cw;
      chX = Math.min(Math.max(chX, contentX), contentX + contentW - cw);
      const chY = Math.min(Math.max(end.y - chipH / 2, plotY), origin2D.y - chipH - unit * 0.05);
      roundRect(ctx, chX, chY, cw, chipH, unit * 0.3);
      ctx.fillStyle = INK_PANEL;
      ctx.fill();
      roundRect(ctx, chX, chY, cw, chipH, unit * 0.3);
      ctx.strokeStyle = rgba(color, 0.7);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(cv.label, chX + cw / 2, chY + chipH * 0.68);
      ctx.textAlign = "start";
      ctx.restore();
    }
  });

  // Mark / intersection beat.
  if (markBeat >= 0 && scene.mark && active >= markBeat) {
    const { t } = beatFrac(markBeat, env.p);
    const reveal = easeOutCubic(clamp01(t / 0.4));
    let f = scene.mark.x / 100;
    let my: number;
    let color = accent;
    let zOffset = 0;

    if (scene.curves.length >= 2) {
      const inter = intersectionNear(scene.curves[0].shape, scene.curves[1].shape, f);
      f = inter.f;
      my = inter.y;
      color = accent;
    } else {
      my = clamp01(fn(scene.curves[0].shape, f));
      color = curveColor(0, env.palette);
    }
    
    // find nearest point index for bobbing sync
    const k = Math.round(f * SAMPLES);
    const bob = Math.sin(env.elapsedMs / 800 + k * 0.1) * 0.05;
    
    const wMark = worldPos(f, my, zOffset);
    wMark.y += bob;
    const wFloor = worldPos(f, 0, zOffset);
    const wAxisY = worldPos(0, my, zOffset);
    
    const pMark = projectToRect(cam, wMark, rect);
    const pFloor = projectToRect(cam, wFloor, rect);
    const pAxisY = projectToRect(cam, wAxisY, rect);

    // Crosshair dashed drops to both axes
    ctx.save();
    ctx.globalAlpha = frameIn * reveal;
    ctx.strokeStyle = rgba(color, 0.6);
    ctx.lineWidth = unit * 0.06;
    ctx.setLineDash([unit * 0.3, unit * 0.25]);
    ctx.beginPath();
    ctx.moveTo(pMark.x, pMark.y);
    ctx.lineTo(pFloor.x, pFloor.y);
    ctx.moveTo(pMark.x, pMark.y);
    // Project towards Y axis but parallel to floor X
    ctx.lineTo(pAxisY.x, pAxisY.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Burst ring + point
    const pulse = idle(env, 1900, 1);
    ctx.save();
    ctx.globalAlpha = frameIn * reveal;
    ctx.strokeStyle = color;
    ctx.lineWidth = unit * 0.07;
    ctx.beginPath();
    ctx.arc(pMark.x, pMark.y, unit * (0.5 + 0.15 * pulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowColor = rgba(color, 0.7);
    ctx.shadowBlur = unit * (0.6 + 0.4 * pulse);
    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath();
    ctx.arc(pMark.x, pMark.y, unit * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Label chip.
    const chipIn = easeOutCubic(clamp01((t - 0.3) / 0.35));
    if (chipIn > 0) {
      ctx.save();
      ctx.globalAlpha = frameIn * chipIn;
      const markPx = unit * (vertical ? 0.76 : 0.66);
      const markH = markPx * 1.8;
      ctx.font = `700 ${markPx}px ${FONT_SANS}`;
      const tw = ctx.measureText(scene.mark.label).width;
      const cw = tw + unit * 0.9;
      let chX = pMark.x - cw / 2;
      chX = Math.min(Math.max(chX, contentX), contentX + contentW - cw);
      const chY = Math.max(pMark.y - markH - unit * 0.75, plotY);
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.4;
      roundRect(ctx, chX, chY, cw, markH, unit * 0.32);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#06121a";
      ctx.textAlign = "center";
      ctx.fillText(scene.mark.label, chX + cw / 2, chY + markH * 0.68);
      ctx.textAlign = "start";
      ctx.restore();
    }
  }

  ctx.textAlign = "start";
}

/** Sign-change crossing of two curves closest to fraction `near`. */
function intersectionNear(a: Shape, b: Shape, near: number): { f: number; y: number } {
  let best: { f: number; y: number } | null = null;
  let bestDist = Infinity;
  let prevDiff = fn(a, 0) - fn(b, 0);
  for (let i = 1; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const diff = fn(a, t) - fn(b, t);
    if (prevDiff === 0 || diff === 0 || prevDiff * diff < 0) {
      const t0 = (i - 1) / SAMPLES;
      const r = prevDiff === diff ? 0 : prevDiff / (prevDiff - diff);
      const cf = t0 + (r / SAMPLES);
      const cy = clamp01(fn(a, cf));
      const dist = Math.abs(cf - near);
      if (dist < bestDist) {
        bestDist = dist;
        best = { f: cf, y: cy };
      }
    }
    prevDiff = diff;
  }
  if (best) return best;
  // No crossing: fall back to the requested x on curve a.
  return { f: near, y: clamp01(fn(a, near)) };
}

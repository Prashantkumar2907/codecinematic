import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";
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

type GaugeScene = Extract<Scene, { kind: "gauge" }>;

const A_START = 200;
const A_END = -20;
const OVERSHOOT_PAD = 4;
const MINOR_TICKS = 9;
// Captions sit in the bottom ~14% of vertical frames; keep the legend above.
const CAPTION_SAFE_Y = 0.86;
const DANGER = "#f87171";
const TONE_COLORS: Record<GaugeScene["zones"][number]["tone"], string> = {
  good: THEME.good,
  warn: THEME.warn,
  danger: DANGER,
};

export function paintGauge(ctx: CanvasRenderingContext2D, scene: GaugeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.readings.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const ah = safeBottom - ay;

  const r3D = vertical ? 3.5 : 4.5;
  
  const range = Math.max(scene.max - scene.min, 1e-9);
  const v2a = (v: number) => A_START + (A_END - A_START) * clamp01((v - scene.min) / range);
  const rad = (deg: number) => (deg * Math.PI) / 180;

  const u = (scene.unit ?? "").trim();
  const locale = u === "₹" ? "en-IN" : "en-US";
  const wholes =
    Number.isInteger(scene.min) && Number.isInteger(scene.max) && scene.readings.every((rd) => Number.isInteger(rd.value));
  const fmt = (v: number): string => {
    const sign = v < 0 ? "−" : "";
    const abs = Math.abs(v);
    const text = wholes
      ? Math.round(abs).toLocaleString(locale)
      : abs.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (/^[₹$€£]$/.test(u)) return `${sign}${u}${text}`;
    return u ? `${sign}${text}${u.startsWith("%") ? u : ` ${u}`}` : `${sign}${text}`;
  };

  const k = Math.min(active - offset, scene.readings.length - 1);
  const t = k >= 0 ? beatT(env.beats, offset + k, totalBeats, env.p) : 0;
  let needleVal = scene.min;
  if (k >= 0) {
    const fromV = k === 0 ? scene.min : scene.readings[k - 1].value;
    needleVal = fromV + (scene.readings[k].value - fromV) * easeOutBack(clamp01(t * 1.5));
  }
  const rawAngle = A_START + ((A_END - A_START) * (needleVal - scene.min)) / range;
  const tremor = 0.25 * Math.sin(env.elapsedMs / 450);
  const needleAngle = Math.min(A_START + OVERSHOOT_PAD, Math.max(A_END - OVERSHOOT_PAD, rawAngle)) + tremor;

  const zoneOf = (v: number): GaugeScene["zones"][number] | null => {
    let prev = scene.min;
    for (const zn of scene.zones) {
      if (v <= zn.upTo && v >= prev) return zn;
      prev = zn.upTo;
    }
    return null;
  };
  const settled = k < 0 || t > 0.7;
  const restZone = settled ? zoneOf(k >= 0 ? scene.readings[k].value : scene.min) : null;

  const faceIn = easeOutCubic(enterT(env, 400));
  const key = scene.id + "-gauge3d";
  
  const rect = { x: ax, y: ay, w: aw, h: ah };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    // Gauge is round, place it near center
    const gCx = vertical ? 0 : -2;
    const gCz = 0;
    camera.position.set(0, vertical ? 14 : 12, vertical ? 12 : 10);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(14, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    // Track zones
    const trackTube = 0.3;
    let zoneStart = scene.min;
    
    const zoneMeshes: { mesh: THREE.Group, zn: any }[] = [];
    
    scene.zones.forEach((zn) => {
      const tone = TONE_COLORS[zn.tone];
      const aStart = v2a(zoneStart);
      const aEnd = v2a(zn.upTo);
      const arcLen = rad(aStart - aEnd);
      
      const geo = new THREE.TorusGeometry(r3D, trackTube, 16, 48, arcLen);
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(tone),
        emissive: new THREE.Color(tone),
        emissiveIntensity: 0.2,
        metalness: 0.3,
        roughness: 0.2,
        transparent: true,
        opacity: 0.8
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.rotation.z = rad(aEnd);
      
      const group = new THREE.Group();
      group.add(mesh);
      group.rotation.x = -Math.PI / 2;
      group.position.set(gCx, 0, gCz);
      s.add(group);
      
      zoneMeshes.push({ mesh: group, zn });
      zoneStart = zn.upTo;
    });
    
    // Hub
    const hub = makeCylinder(0.6, 0.8, THEME.panel, "#31435a");
    hub.position.set(gCx, 0.1, gCz);
    s.add(hub);

    // Needle
    const needleGroup = new THREE.Group();
    const needleLen = r3D * 0.9;
    const needle = makeBlock(needleLen, 0.2, 0.4, accent, "#ffffff");
    needle.position.set(needleLen / 2, 0.6, 0);
    needleGroup.add(needle);
    needleGroup.position.set(gCx, 0, gCz);
    s.add(needleGroup);
    
    // Ticks
    for (let i = 0; i < MINOR_TICKS; i++) {
        const deg = A_START + ((A_END - A_START) * i) / (MINOR_TICKS - 1);
        const tick = makeBlock(0.4, 0.1, 0.1, "#94a3b8", "#94a3b8");
        const a = rad(deg);
        tick.position.set(gCx + Math.cos(a) * (r3D - 0.6), 0.1, gCz - Math.sin(a) * (r3D - 0.6));
        tick.rotation.y = a;
        s.add(tick);
    }

    const update = (elapsedMs: number, ctxData: { gIn: number, needleAngleRad: number, pulsingZone: any, flash: number }) => {
      const { gIn, needleAngleRad, pulsingZone, flash } = ctxData;
      
      s.scale.setScalar(Math.max(0.001, 0.9 * gIn + 0.1));
      
      needleGroup.rotation.y = needleAngleRad;
      
      zoneMeshes.forEach(({ mesh, zn }) => {
          const child = mesh.children[0] as THREE.Mesh;
          const mat = child.material as THREE.MeshPhysicalMaterial;
          if (zn === pulsingZone) {
              const alpha = 0.35 + 0.15 * (0.5 + 0.5 * Math.sin(elapsedMs / 300));
              mat.opacity = 0.6 + alpha;
              mat.emissiveIntensity = 0.5;
          } else {
              mat.opacity = 0.7;
              mat.emissiveIntensity = 0.2;
          }
      });
      
      const needleMat = (needle.children[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
      if (flash > 0) {
          needleMat.emissiveIntensity = 0.8;
      } else {
          needleMat.emissiveIntensity = 0.2;
      }
    };

    return { scene: s, camera, update };
  };

  const activeBeatLive = k >= 0 && active === offset + k && t < 1;
  const pulsingZone = (restZone?.tone === "danger") ? restZone : null;
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { 
      gIn: faceIn, 
      needleAngleRad: rad(needleAngle),
      pulsingZone,
      flash: activeBeatLive ? 1 : 0
  });
  if (!cam) return;
  
  const gCx = vertical ? 0 : -2;
  const gCz = 0;
  const get2D = (r: number, deg: number, y: number = 0) => projectToRect(cam, new THREE.Vector3(gCx + Math.cos(rad(deg)) * r, y, gCz - Math.sin(rad(deg)) * r), rect);
  const center2D = get2D(0, 0, 0.8);

  ctx.save();
  ctx.globalAlpha = faceIn;

  // Zone labels
  let zoneStart2 = scene.min;
  scene.zones.forEach((zn) => {
    const tone = TONE_COLORS[zn.tone];
    if (zn.label) {
      const mid = (v2a(zoneStart2) + v2a(zn.upTo)) / 2;
      const lp = get2D(r3D + 0.8, mid);
      ctx.font = `600 ${unit * 0.55}px ${FONT_SANS}`;
      ctx.fillStyle = rgba(tone, 0.85);
      ctx.textAlign = "center";
      ctx.fillText(zn.label, lp.x, lp.y + unit * 0.18);
      ctx.textAlign = "start";
    }
    zoneStart2 = zn.upTo;
  });

  // Min/Max labels
  ctx.font = `600 ${unit * 0.58}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "center";
  const minP = get2D(r3D + 1.2, A_START);
  const maxP = get2D(r3D + 1.2, A_END);
  ctx.fillText(fmt(scene.min), minP.x, minP.y + unit * 0.5);
  ctx.fillText(fmt(scene.max), maxP.x, maxP.y + unit * 0.5);
  ctx.textAlign = "start";

  // Big live readout below the hub
  const readoutW = vertical ? aw * 0.6 : aw * 0.4;
  const valText = fmt(needleVal);
  const vpx = fitFontSize(ctx, fmt(scene.max), {
    maxW: readoutW,
    startPx: unit * 1.9,
    minPx: unit * 0.9,
    weight: 800,
    family: FONT_MONO,
  });
  ctx.font = `800 ${vpx}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.fillText(valText, center2D.x, center2D.y + unit * 2.5);
  ctx.textAlign = "start";

  // Label chip
  const chipY = center2D.y + unit * 3.5;
  const drawLabelChip = (label: string, alpha: number) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = faceIn * alpha;
    ctx.font = `600 ${unit * 0.66}px ${FONT_SANS}`;
    const tw = Math.min(ctx.measureText(label).width, readoutW);
    roundRect(ctx, center2D.x - tw / 2 - unit * 0.4, chipY - unit * 0.55, tw + unit * 0.8, unit * 1.1, unit * 0.32);
    ctx.fillStyle = "#0a0e13";
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(label, center2D.x, chipY + unit * 0.23);
    ctx.textAlign = "start";
    ctx.restore();
  };
  if (k >= 0) {
    const labelIn = easeOutCubic(clamp01(t * 3));
    if (k > 0 && labelIn < 1) drawLabelChip(scene.readings[k - 1].label, 1 - labelIn);
    drawLabelChip(scene.readings[k].label, labelIn);
  }
  ctx.restore();

  // Readings legend
  const legX = vertical ? ax : ax + aw * 0.58;
  const legW = vertical ? aw : aw * 0.42;
  const legTop = vertical ? center2D.y + unit * 4.6 : ay + unit * 0.5;
  const legBottom = ay + ah;
  const n = scene.readings.length;
  const rowH = Math.min((legBottom - legTop) / n, unit * (vertical ? 2.4 : 3.0));
  const listY = legTop + Math.max(0, (legBottom - legTop - n * rowH) / 2);
  scene.readings.forEach((rd, i) => {
    const state = offset + i < active || (offset + i === active && beatT(env.beats, offset + i, totalBeats, env.p) >= 1)
      ? "past"
      : offset + i === active
        ? "active"
        : "future";
    const rowY = listY + i * rowH + rowH / 2;
    ctx.save();
    ctx.globalAlpha = faceIn * (state === "active" ? 1 : state === "past" ? 0.7 : 0.28);
    const dotR = unit * 0.22 * (state === "active" ? 1 + 0.12 * Math.sin(env.elapsedMs / 320) : 1);
    if (state === "active") {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
    }
    ctx.beginPath();
    ctx.arc(legX + unit * 0.3, rowY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = state === "future" ? THEME.textFaint : accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    const textX = legX + unit * 0.9;
    ctx.font = `800 ${unit * (vertical ? 0.85 : 0.78)}px ${FONT_MONO}`;
    const vText = fmt(rd.value);
    const vw = ctx.measureText(vText).width;
    ctx.fillStyle = state === "active" ? THEME.text : THEME.textDim;
    ctx.fillText(vText, legX + legW - vw, rowY + unit * 0.26);
    const lpx = fitFontSize(ctx, rd.label, {
      maxW: legW - unit * 1.2 - vw,
      startPx: unit * 0.74,
      minPx: unit * 0.5,
      weight: state === "active" ? 700 : 600,
    });
    ctx.font = `${state === "active" ? 700 : 600} ${lpx}px ${FONT_SANS}`;
    ctx.fillText(rd.label, textX, rowY + unit * 0.24);
    ctx.restore();
  });
  ctx.textAlign = "start";
}

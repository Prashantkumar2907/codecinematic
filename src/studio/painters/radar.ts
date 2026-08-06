import * as THREE from "three";
import { render3D, studioLights, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  enterT,
  revealT,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
  seriesTints,
} from "./common";
import type { PaintEnv } from "./index";

type RadarScene = Extract<Scene, { kind: "radar" }>;

const RINGS = 4;
/** Fraction of a beat spent drawing that entity's polygon. */
const DRAW = 0.65;
const TAU = Math.PI * 2;
/** Axis names ride this multiple of the outer ring, leaving a gutter above a value of 100. */
const LABEL_RING = 1.3;
/**
 * The web is laid out in PIXELS and the 3D nodes are mapped into world space from it.
 * A camera on the +z axis makes that mapping an exact similarity on the z=0 plane, so a
 * node lands on its own vertex; the tilted `isoCamera` this painter used to share squashed
 * the web into an irregular blob and threw two axis labels off the frame.
 */
const CAM_FOV = 32;
const CAM_Z = 12;
const SWEEP_MS = 4200;
const SWEEP_ARC = 0.55;
const WEB_IN_MS = 560;
/** Share of the incoming beat over which emphasis crosses from the previous series. */
const HANDOFF = 0.2;
/** Widest share of the web box one axis-name gutter may claim per side. */
const GUTTER_MAX = 0.24;

type NodeState = { x: number; y: number; r: number; opacity: number; emissive: number };
type RadarCtx = { nodes: (NodeState | null)[] };

export function paintRadar(ctx: CanvasRenderingContext2D, scene: RadarScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, vertical, safeBottom } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const nEnt = scene.entities.length;
  const nAxes = scene.axes.length;
  const totalBeats = offset + nEnt;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const entIdx = active - offset;
  const ghostIn = easeOutCubic(enterT(env, 420));
  const webIn = enterT(env, WEB_IN_MS);
  /** Last-quarter resolve: past polygons and legend rows lift so the comparison closes. */
  const settleIn = easeOutCubic(revealT(env, 0.78, 0.96));
  // Environment ships this kind and its accent sits 58 from THEME.good, inside the
  // 60 threshold at which two polygons read as one colour.
  const entColors = seriesTints(accent, secondary, 3);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;

  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const ah = safeBottom - ay;
  if (ah < unit * 5 || aw < unit * 5) return;

  const rowH = unit * 1.3;
  const legendH = vertical ? unit * 0.6 + nEnt * rowH : 0;
  const legendW = vertical ? 0 : Math.min(aw * 0.26, unit * 6.4);
  const availW = aw - legendW;
  const availH = ah - legendH;

  // ---- Pixel geometry: the outer ring must leave room for the axis names ----
  const axisPx = unit * 0.6;
  ctx.font = `700 ${axisPx}px ${FONT_SANS}`;
  const widest = scene.axes.reduce((m, a) => Math.max(m, ctx.measureText(a).width), 0);
  const gutter = Math.min(widest + unit * 0.5, availW * GUTTER_MAX);
  const R = Math.max(unit * 2, Math.min(availW / 2 - gutter, availH / 2 - axisPx * 1.2) / LABEL_RING);

  // The web is a disc, so the box it needs is exactly ring + gutter — shrink to that and
  // centre the web+legend group, or 16:9 leaves the left third of the frame empty.
  const webW = Math.min(availW, 2 * (R * LABEL_RING + gutter));
  const webH = Math.min(availH, 2 * (R * LABEL_RING + axisPx * 1.2));
  const rect = {
    x: vertical ? ax : ax + (aw - (webW + unit * 0.8 + legendW)) / 2,
    y: ay + (availH - webH) / 2,
    w: webW,
    h: webH,
  };
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  const angleOf = (j: number) => -Math.PI / 2 + (j / nAxes) * TAU;
  const ptAt = (j: number, frac: number) => {
    const a = angleOf(j);
    return { x: cx + Math.cos(a) * R * frac, y: cy + Math.sin(a) * R * frac };
  };
  /** Radius of the outer ring polygon at an arbitrary angle, so the sweep hand stops on it. */
  const ringR = (theta: number) => {
    const step = TAU / nAxes;
    const d = (((theta - angleOf(0)) % step) + step) % step;
    return (R * Math.cos(Math.PI / nAxes)) / Math.cos(d - Math.PI / nAxes);
  };

  // ---- Per-entity reveal, shared by the 2D polygons and the 3D nodes ----
  const stagger = 0.5 / nAxes;
  const activeT = entIdx >= 0 ? beatT(env.beats, offset + entIdx, totalBeats, env.p) : 0;
  const stateOf = (k: number) => {
    const isPast = k < entIdx;
    const t = beatT(env.beats, offset + k, totalBeats, env.p);
    const reveal = (j: number) => (isPast ? 1 : easeOutBack(clamp01((t - j * stagger) / DRAW)));
    // Emphasis hands over across the first fifth of the incoming beat. Switching it on the
    // beat boundary dropped the outgoing series from full to half alpha and deleted its
    // value labels between two adjacent frames, while the incoming one was still at zero.
    const focus = k === entIdx ? 1 : k === entIdx - 1 ? 1 - clamp01(activeT / HANDOFF) : 0;
    return { isPast, t, reveal, focus, shown: k === entIdx || isPast };
  };
  const mix = (from: number, to: number, f: number) => from + (to - from) * f;
  const restAlpha = 0.5 + 0.3 * settleIn;

  const nodes: (NodeState | null)[] = [];
  const worldHalfH = Math.tan((CAM_FOV * Math.PI) / 360) * CAM_Z;
  const pxToWorldX = (2 * worldHalfH * (Math.max(2, Math.round(rect.w)) / Math.max(2, Math.round(rect.h)))) / rect.w;
  const pxToWorldY = (2 * worldHalfH) / rect.h;
  for (let k = 0; k < nEnt; k++) {
    const st = stateOf(k);
    for (let j = 0; j < nAxes; j++) {
      const rv = clamp01(st.reveal(j));
      if (!st.shown || rv <= 0.01) {
        nodes.push(null);
        continue;
      }
      const p = ptAt(j, (scene.entities[k].values[j] / 100) * rv);
      // Nodes fade and grow in place rather than scaling from zero, so the first
      // vertex is already legible ~150ms in instead of being a sub-pixel speck.
      const nodePx = unit * mix(0.21, 0.3, st.focus) * (0.4 + 0.6 * rv);
      nodes.push({
        x: (p.x - cx) * pxToWorldX,
        y: -(p.y - cy) * pxToWorldY,
        r: nodePx * pxToWorldY,
        opacity: clamp01(rv * 1.6) * ghostIn * mix(0.6 + 0.3 * settleIn, 1, st.focus),
        emissive: mix(0.2, 0.55, st.focus),
      });
    }
  }

  const build = (): ThreeBundle<RadarCtx> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 100);
    camera.position.set(0, 0, CAM_Z);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const meshes: THREE.Mesh[] = [];
    for (let k = 0; k < nEnt; k++) {
      const color = entColors[k % entColors.length];
      for (let j = 0; j < nAxes; j++) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 32, 24),
          new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(color),
            emissive: new THREE.Color(color),
            emissiveIntensity: 0.2,
            metalness: 0.25,
            roughness: 0.15,
            clearcoat: 0.8,
            clearcoatRoughness: 0.2,
            transparent: true,
          })
        );
        s.add(mesh);
        meshes.push(mesh);
      }
    }

    const update = (_elapsedMs: number, data: RadarCtx) => {
      meshes.forEach((mesh, i) => {
        const n = data?.nodes[i] ?? null;
        mesh.visible = !!n;
        if (!n) return;
        mesh.position.set(n.x, n.y, 0);
        mesh.scale.setScalar(n.r);
        const mat = mesh.material as THREE.MeshPhysicalMaterial;
        mat.opacity = n.opacity;
        mat.emissiveIntensity = n.emissive;
      });
    };
    return { scene: s, camera, update };
  };

  // ---- Ghost web: rings ping outward, then spokes, then the axis names ----
  ctx.save();
  ctx.lineWidth = unit * 0.045;
  for (let r = 1; r <= RINGS; r++) {
    const ri = easeOutCubic(clamp01((webIn - (r - 1) * 0.14) / 0.58));
    if (ri <= 0.01) continue;
    ctx.strokeStyle = rgba(THEME.textDim, 0.2 * ri);
    ctx.beginPath();
    for (let j = 0; j <= nAxes; j++) {
      const p = ptAt(j % nAxes, (r / RINGS) * ri);
      j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  const spokeIn = easeOutCubic(clamp01((webIn - 0.28) / 0.72));
  if (spokeIn > 0.01) {
    ctx.strokeStyle = rgba(THEME.textDim, 0.16 * spokeIn);
    for (let j = 0; j < nAxes; j++) {
      const p = ptAt(j, spokeIn);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  // Radar sweep: the one thing still moving through a long hold, and it can never
  // leave the disc because it is an arc of radius R around the pixel centre.
  const sweepA = (env.elapsedMs / SWEEP_MS) * TAU - Math.PI / 2;
  const fan = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  fan.addColorStop(0, rgba(accent, 0.13 * ghostIn));
  fan.addColorStop(1, rgba(accent, 0));
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, sweepA - SWEEP_ARC, sweepA);
  ctx.closePath();
  ctx.fillStyle = fan;
  ctx.fill();
  // Chrome grey, not accent: in accent this hand was the same colour as series 1 and
  // read as a stray polygon edge escaping the web.
  ctx.strokeStyle = rgba(THEME.textDim, 0.34 * ghostIn);
  ctx.lineWidth = unit * 0.05;
  const hand = ringR(sweepA);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweepA) * hand, cy + Math.sin(sweepA) * hand);
  ctx.stroke();

  ctx.globalAlpha = ghostIn;
  ctx.fillStyle = THEME.textDim;
  ctx.textBaseline = "middle";
  scene.axes.forEach((axis, j) => {
    const a = angleOf(j);
    const c = Math.cos(a);
    const side: -1 | 0 | 1 = Math.abs(c) < 0.35 ? 0 : c > 0 ? 1 : -1;
    const maxW = side === 0 ? Math.min(webW * 0.5, unit * 6) : gutter - unit * 0.2;
    const px = fitFontSize(ctx, axis, { maxW, startPx: axisPx, minPx: unit * 0.42, weight: 700 });
    ctx.font = `700 ${px}px ${FONT_SANS}`;
    const tw = ctx.measureText(axis).width;
    ctx.textAlign = side === 0 ? "center" : side > 0 ? "left" : "right";
    // Clamp against the web box, so a long axis name shortens its reach instead of bleeding.
    const anchorX = cx + c * R * LABEL_RING;
    const lo = rect.x + (side === 0 ? tw / 2 : side > 0 ? 0 : tw);
    const hi = rect.x + rect.w - (side === 0 ? tw / 2 : side > 0 ? tw : 0);
    const lx = Math.min(Math.max(anchorX, lo), Math.max(lo, hi));
    const ly = Math.min(
      Math.max(cy + Math.sin(a) * R * LABEL_RING, rect.y + px * 0.7),
      rect.y + rect.h - px * 0.7
    );
    ctx.fillText(axis, lx, ly);
  });
  ctx.restore();

  // ---- Entity polygons: past first so the active one lands on top ----
  const drawEntity = (k: number) => {
    const st = stateOf(k);
    if (!st.shown) return;
    const ent = scene.entities[k];
    const color = entColors[k % entColors.length];
    const pts = scene.axes.map((_, j) => ptAt(j, (ent.values[j] / 100) * clamp01(st.reveal(j))));
    const revealed = scene.axes.filter((_, j) => st.reveal(j) > 0.01).length;
    const whole = revealed >= nAxes;

    ctx.save();
    ctx.globalAlpha = mix(restAlpha, 1, st.focus) * ghostIn;

    const fillA = st.isPast
      ? mix(0.1 + 0.06 * settleIn, 0.15, st.focus)
      : 0.15 * clamp01((st.t - 0.4) / 0.35);
    if (whole && fillA > 0) {
      ctx.beginPath();
      pts.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = rgba(color, fillA);
      ctx.fill();
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = unit * mix(0.07 + 0.02 * settleIn, 0.13, st.focus);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (st.focus > 0.02) {
      const done = st.t >= 1;
      ctx.shadowColor = done ? rgba(color, 0.5) : accentGlow;
      const pulse = done ? 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(env.elapsedMs / 700)) : 0.5;
      ctx.shadowBlur = unit * pulse * st.focus;
    }
    ctx.beginPath();
    let started = false;
    for (let j = 0; j < nAxes; j++) {
      if (st.reveal(j) <= 0.01) continue;
      const p = pts[j];
      started ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), (started = true));
    }
    if (whole) ctx.closePath();
    if (started) ctx.stroke();
    ctx.restore();
  };

  for (let k = 0; k < nEnt; k++) if (k !== entIdx) drawEntity(k);
  if (entIdx >= 0 && entIdx < nEnt) drawEntity(entIdx);

  // ---- 3D vertex nodes, mapped from the pixel vertices; 2D discs if WebGL is out ----
  const cam = render3D(ctx, scene.id + "-radar3d", rect, build, env.elapsedMs, { nodes }, env);
  if (!cam) {
    ctx.save();
    nodes.forEach((n, i) => {
      if (!n) return;
      const k = Math.floor(i / nAxes);
      ctx.globalAlpha = n.opacity;
      ctx.fillStyle = entColors[k % entColors.length];
      ctx.beginPath();
      ctx.arc(cx + n.x / pxToWorldX, cy - n.y / pxToWorldY, n.r / pxToWorldY, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
  }

  // ---- Values for the series in focus (both of them mid-handoff) ----
  const drawValues = (k: number) => {
    const st = stateOf(k);
    if (st.focus <= 0.02) return;
    const ent = scene.entities[k];
    ctx.save();
    ctx.font = `800 ${unit * 0.5}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.text;
    ctx.textBaseline = "middle";
    for (let j = 0; j < nAxes; j++) {
      const rv = clamp01(st.reveal(j));
      if (rv <= 0.01) continue;
      const a = angleOf(j);
      const c = Math.cos(a);
      const v = ent.values[j];
      // Other series sit on the same spoke, so a fixed outward offset drops the number
      // straight onto a neighbour's node. Offset toward whichever side has more room;
      // the test uses settled values so the side cannot flip mid-reveal.
      let gapOut = Infinity;
      let gapIn = Infinity;
      scene.entities.forEach((o, m) => {
        if (m === k || !stateOf(m).shown) return;
        const d = ((o.values[j] - v) / 100) * R;
        if (d > 0) gapOut = Math.min(gapOut, d);
        else gapIn = Math.min(gapIn, -d);
      });
      const dir = gapOut >= gapIn ? 1 : -1;
      const p = ptAt(j, (v / 100) * rv);
      ctx.globalAlpha = rv * ghostIn * st.focus;
      ctx.textAlign = Math.abs(c) < 0.35 ? "center" : dir * c > 0 ? "left" : "right";
      ctx.fillText(String(v), p.x + dir * c * unit * 0.72, p.y + dir * Math.sin(a) * unit * 0.72);
    }
    ctx.restore();
  };
  if (entIdx - 1 >= 0) drawValues(entIdx - 1);
  if (entIdx >= 0 && entIdx < nEnt) drawValues(entIdx);

  // ---- Legend: a row per entity, below the web at 9:16 and beside it at 16:9 ----
  const legX = vertical ? ax : rect.x + webW + unit * 0.8;
  const legTop = vertical ? rect.y + webH + unit * 0.6 : cy - (nEnt * rowH) / 2;
  const chip = unit * 0.5;
  scene.entities.forEach((ent, k) => {
    const st = stateOf(k);
    const rowY = legTop + k * rowH;
    ctx.save();
    const lead = st.focus > 0.5;
    ctx.globalAlpha = ghostIn * mix(st.shown ? 0.7 + 0.3 * settleIn : 0.28, 1, st.focus);
    if (st.focus > 0.02) {
      ctx.shadowColor = rgba(entColors[k % entColors.length], 0.6 * st.focus);
      ctx.shadowBlur = unit * 0.4 * st.focus;
    }
    roundRect(ctx, legX, rowY, chip, chip, unit * 0.14);
    ctx.fillStyle = entColors[k % entColors.length];
    ctx.fill();
    ctx.shadowBlur = 0;
    const px = fitFontSize(ctx, ent.label, {
      maxW: (vertical ? aw : legendW) - chip - unit * 1.1,
      startPx: unit * 0.72,
      minPx: unit * 0.48,
      weight: lead ? 800 : 600,
    });
    ctx.font = `${lead ? 800 : 600} ${px}px ${FONT_SANS}`;
    ctx.fillStyle = lead ? THEME.text : THEME.textDim;
    ctx.textAlign = "start";
    ctx.fillText(ent.label, legX + chip + unit * 0.5, rowY + chip * 0.9);
    ctx.restore();
  });
}

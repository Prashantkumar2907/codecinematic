import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  pointAlongPolyline,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
  seriesTints,
  shade,
} from "./common";
import type { PaintEnv } from "./index";

type SankeyScene = Extract<Scene, { kind: "sankey" }>;
type Pt = { x: number; y: number };
type Block = { x: number; y: number; w: number; h: number };
type Ribbon = { top: Pt[]; bot: Pt[]; center: Pt[]; block: Block; tint: string };

const SAMPLES = 24;
const GROW_SPAN = 0.55;
const ARRIVE_AT = 0.75;
const REST_MIN_FRAC = 0.02;
// Captions sit in the bottom ~14% of vertical frames; keep branch blocks above.
const CAPTION_SAFE_Y = 0.86;
// Breathing room reserved between two adjacent branch label/value slots, as a
// fraction of unit. Sized against the nearest-neighbour screen gap so two
// narrow branches converging close together (e.g. two 20% slices side by
// side) shrink their text instead of overlapping it.
const LABEL_GUTTER = 0.35;

function branchTints(accent: string, secondary: string): string[] {
  // Was [accent, secondary, good, warn, "#f472b6", "#22d3ee"] — two hardcoded hex
  // (rubric axis 5) plus the same accent/semantic collision measured across the
  // subject palettes. Economy and Environment both ship this kind.
  return seriesTints(accent, secondary, 6);
}

function sampleCubic(p0: Pt, c1: Pt, c2: Pt, p1: Pt): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const mt = 1 - t;
    pts.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y,
    });
  }
  return pts;
}

const lerpPt = (a: Pt, b: Pt, f: number): Pt => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });

/** Close the band up to fraction e of its samples with a straight cap; returns the cap. */
function bandPath(ctx: CanvasRenderingContext2D, top: Pt[], bot: Pt[], e: number): { capTop: Pt; capBot: Pt } {
  const last = top.length - 1;
  const pos = clamp01(e) * last;
  const idx = Math.min(Math.floor(pos), last - 1);
  const frac = pos - idx;
  const capTop = pos >= last ? top[last] : lerpPt(top[idx], top[idx + 1], frac);
  const capBot = pos >= last ? bot[last] : lerpPt(bot[idx], bot[idx + 1], frac);
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  for (let i = 1; i <= idx; i++) ctx.lineTo(top[i].x, top[i].y);
  ctx.lineTo(capTop.x, capTop.y);
  ctx.lineTo(capBot.x, capBot.y);
  for (let i = idx; i >= 0; i--) ctx.lineTo(bot[i].x, bot[i].y);
  ctx.closePath();
  return { capTop, capBot };
}

function strokeCurve(ctx: CanvasRenderingContext2D, pts: Pt[], e: number, cap: Pt) {
  const last = pts.length - 1;
  const idx = Math.min(Math.floor(clamp01(e) * last), last - 1);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i <= idx; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineTo(cap.x, cap.y);
  ctx.stroke();
}

export function paintSankey(ctx: CanvasRenderingContext2D, scene: SankeyScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.branches.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const lastEnd = beatWindow(env.beats, totalBeats - 1, totalBeats).end;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const ah = safeBottom - ay;
  const n = scene.branches.length;
  const total = scene.source.total;
  const tints = branchTints(accent, secondary);

  const u = (scene.source.unit ?? "").trim();
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (target: number, t: number): string => {
    const v = target * clamp01(t);
    const text = Number.isInteger(target) ? Math.round(v).toLocaleString(locale) : v.toFixed(1);
    if (/^[₹$€£]$/.test(u)) return `${u}${text}`;
    return u ? `${text}${u.startsWith("%") ? u : ` ${u}`}` : text;
  };

  const rect = { x: ax, y: ay, w: aw, h: ah };

  const gap3D = vertical ? 0.7 : 0.5;
  const spread3D = vertical ? 5 : 6;
  const th3D = vertical ? 1.2 : 1.5;
  const blockH = 0.4;
  
  let src3D: { x: number; z: number; w: number; d: number; };
  let branches3D: { x: number; z: number; w: number; d: number; }[] = [];
  
  if (!vertical) {
    src3D = { x: -3.5, z: 0, w: th3D, d: spread3D };
    const availZ = spread3D - gap3D * (n - 1);
    let cumZ = -spread3D / 2;
    scene.branches.forEach(b => {
      const d = (b.value / total) * availZ;
      branches3D.push({ x: 3.5, z: cumZ + d / 2, w: th3D, d });
      cumZ += d + gap3D;
    });
  } else {
    src3D = { x: 0, z: -3.5, w: spread3D, d: th3D };
    const availX = spread3D - gap3D * (n - 1);
    let cumX = -spread3D / 2;
    scene.branches.forEach(b => {
      const w = (b.value / total) * availX;
      branches3D.push({ x: cumX + w / 2, z: 3.5, w, d: th3D });
      cumX += w + gap3D;
    });
  }

  const ghostIn = easeOutCubic(enterT(env, 420));
  const key = scene.id + "-sankey3d";

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 10, vertical ? 10 : 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(12, 12, new THREE.Color(accent), new THREE.Color(shade(THEME.panel, 0.3)));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const srcMesh = makeBlock(src3D.w, blockH, src3D.d, THEME.panel, accent);
    srcMesh.position.set(src3D.x, 0, src3D.z);
    s.add(srcMesh);

    const branchMeshes = branches3D.map((b, i) => {
      const tint = tints[i % tints.length];
      const mesh = makeBlock(b.w, blockH, b.d, THEME.panel, tint);
      mesh.position.set(b.x, 0, b.z);
      s.add(mesh);
      return mesh;
    });
    // Active branch face: same panel tone, darkened, so the pop/glow reads as
    // the highlight rather than a second hardcoded hex fighting the palette.
    const activeFace = shade(THEME.panel, -0.3);

    const update = (elapsedMs: number, ctxData: { gIn: number, times: number[], activeIdx: number }) => {
      const { gIn, times, activeIdx } = ctxData;
      
      srcMesh.visible = gIn > 0;
      srcMesh.scale.setScalar(Math.max(0.001, 0.9 * gIn));
      srcMesh.position.y = Math.sin(elapsedMs / 1200) * 0.05;
      
      branchMeshes.forEach((mesh, i) => {
        const t = times[i];
        const arriveT = Math.max(0, clamp01((t - ARRIVE_AT) / 0.18));
        const pop = easeOutBack(arriveT);
        
        mesh.visible = arriveT > 0;
        if (arriveT > 0) {
            const isActive = activeIdx === offset + i && t < 1;
            const popAmount = isActive ? 0.3 : 0;
            const s = Math.max(0.001, 0.85 + 0.15 * pop);
            mesh.scale.setScalar(s);
            mesh.position.y = Math.sin(elapsedMs / 1200 + i) * 0.05 + popAmount;
            
            mesh.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    const mat = child.material as THREE.MeshPhysicalMaterial;
                    if (isActive) {
                        mat.color.setStyle(activeFace);
                        mat.emissive.setStyle(activeFace);
                    } else {
                        mat.color.setStyle(THEME.panel);
                        mat.emissive.setStyle(THEME.panel);
                    }
                }
            });
        }
      });
    };

    return { scene: s, camera, update };
  };

  const times = scene.branches.map((_, i) => beatT(env.beats, offset + i, totalBeats, env.p));
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: ghostIn, times, activeIdx: active });
  if (!cam) return;

  const get2D = (x: number, z: number, y: number = 0) => projectToRect(cam, new THREE.Vector3(x, y, z), rect);

  // Screen-space gap to the nearest neighbouring branch, per branch — caps how
  // wide a label/value row may grow so close-together branches never collide
  // (measured defect: two adjacent 20% branches overlapped their text at 9:16).
  const branchAxis = branches3D.map((bb) => {
    const p = get2D(bb.x, bb.z, blockH + 0.2);
    return vertical ? p.x : p.y;
  });
  const branchSlotPx = branchAxis.map((v, i) => {
    const left = i > 0 ? Math.abs(v - branchAxis[i - 1]) : Infinity;
    const right = i < n - 1 ? Math.abs(branchAxis[i + 1] - v) : Infinity;
    return Math.min(left, right);
  });

  const ribbons: Ribbon[] = [];
  
  let srcCumZ = -spread3D / 2;
  let srcCumX = -spread3D / 2;
  
  scene.branches.forEach((b, i) => {
    const bb = branches3D[i];
    let top: Pt[], bot: Pt[];
    if (!vertical) {
      const srcD = (b.value / total) * spread3D;
      const z1 = srcCumZ;
      const z2 = srcCumZ + srcD;
      srcCumZ += srcD;
      
      const pSrc1 = get2D(src3D.x + src3D.w/2, z1);
      const pSrc2 = get2D(src3D.x + src3D.w/2, z2);
      const pDst1 = get2D(bb.x - bb.w/2, bb.z - bb.d/2);
      const pDst2 = get2D(bb.x - bb.w/2, bb.z + bb.d/2);
      
      const cx1 = (pSrc1.x + pDst1.x) / 2;
      const cx2 = (pSrc2.x + pDst2.x) / 2;
      
      top = sampleCubic(pSrc1, {x: cx1, y: pSrc1.y}, {x: cx1, y: pDst1.y}, pDst1);
      bot = sampleCubic(pSrc2, {x: cx2, y: pSrc2.y}, {x: cx2, y: pDst2.y}, pDst2);
    } else {
      const srcW = (b.value / total) * spread3D;
      const x1 = srcCumX;
      const x2 = srcCumX + srcW;
      srcCumX += srcW;
      
      const pSrc1 = get2D(x1, src3D.z + src3D.d/2);
      const pSrc2 = get2D(x2, src3D.z + src3D.d/2);
      const pDst1 = get2D(bb.x - bb.w/2, bb.z - bb.d/2);
      const pDst2 = get2D(bb.x + bb.w/2, bb.z - bb.d/2);
      
      const cy1 = (pSrc1.y + pDst1.y) / 2;
      const cy2 = (pSrc2.y + pDst2.y) / 2;
      
      top = sampleCubic(pSrc1, {x: pSrc1.x, y: cy1}, {x: pDst1.x, y: cy1}, pDst1);
      bot = sampleCubic(pSrc2, {x: pSrc2.x, y: cy2}, {x: pDst2.x, y: cy2}, pDst2);
    }
    ribbons.push({ top, bot, center: top.map((p, j) => lerpPt(p, bot[j], 0.5)), block: {x:0, y:0, w:0, h:0}, tint: tints[i % tints.length] });
  });

  // Ribbons drawing
  scene.branches.forEach((b, i) => {
    const t = times[i];
    if (t <= 0) return;
    const rb = ribbons[i];
    const e = easeInOutCubic(clamp01(t / GROW_SPAN));
    const isActive = active === offset + i && t < 1;
    ctx.save();
    const p0 = rb.top[0];
    const p1 = rb.top[rb.top.length - 1];
    const grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    grad.addColorStop(0, rgba(rb.tint, 0.16));
    grad.addColorStop(1, rgba(rb.tint, 0.42));
    const { capTop, capBot } = bandPath(ctx, rb.top, rb.bot, e);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = rgba(rb.tint, 0.35);
    ctx.lineWidth = unit * 0.05;
    strokeCurve(ctx, rb.top, e, capTop);
    strokeCurve(ctx, rb.bot, e, capBot);
    if (isActive && e < 1) {
      ctx.strokeStyle = rb.tint;
      ctx.lineWidth = unit * 0.1;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
      ctx.beginPath();
      ctx.moveTo(capTop.x, capTop.y);
      ctx.lineTo(capBot.x, capBot.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (isActive && e > 0.15) {
      for (let d = 0; d < 2; d++) {
        const f = (((env.elapsedMs % 1400) / 1400) + d * 0.5) % 1;
        const dot = pointAlongPolyline(rb.center, f * e);
        ctx.globalAlpha = 0.85 * Math.sin(Math.PI * f);
        ctx.fillStyle = THEME.text;
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.6;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    if (t >= 1) {
      const f = ((env.elapsedMs / 2400) + i * 0.17) % 1;
      const dot = pointAlongPolyline(rb.center, f);
      ctx.globalAlpha = 0.5 * Math.sin(Math.PI * f);
      ctx.fillStyle = rb.tint;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, unit * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  // Source block text overlay
  ctx.save();
  ctx.globalAlpha = ghostIn;
  const srcCenter = get2D(src3D.x, src3D.z, blockH + 0.2);
  ctx.textAlign = "center";
  const scx = srcCenter.x;
  const scy = srcCenter.y;
  const srcPx = vertical ? aw * 0.35 : aw * 0.15;
  const slpx = fitFontSize(ctx, scene.source.label, { maxW: srcPx, startPx: unit * 0.8, minPx: unit * 0.4, weight: 600 });
  ctx.font = `600 ${slpx}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.fillText(scene.source.label, scx, scy - unit * 0.55);
  const totText = fmt(total, easeOutCubic(enterT(env, 700, 150)));
  const stpx = fitFontSize(ctx, fmt(total, 1), {
    maxW: srcPx,
    startPx: unit * 1.05,
    minPx: unit * 0.55,
    weight: 800,
    family: FONT_MONO,
  });
  ctx.font = `800 ${stpx}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.text;
  ctx.fillText(totText, scx, scy + unit * 0.5);
  ctx.restore();

  // Branch block text overlays
  scene.branches.forEach((b, i) => {
    const t = times[i];
    if (t <= ARRIVE_AT * 0.6) return;
    const pop = easeOutBack(clamp01((t - ARRIVE_AT) / 0.18));
    if (pop <= 0) return;
    const bb = branches3D[i];
    const bCenter = get2D(bb.x, bb.z, blockH + 0.2 + (active === offset + i && t < 1 ? 0.3 : 0));
    
    ctx.save();
    ctx.globalAlpha = clamp01(pop * 1.4);
    ctx.textAlign = "center";
    const bcx = bCenter.x;
    
    const slotPx = Math.max(unit * 1.2, branchSlotPx[i] - unit * LABEL_GUTTER);
    const branchPx = Math.min(vertical ? aw * 0.25 : aw * 0.15, slotPx);
    const lpx = fitFontSize(ctx, b.label, { maxW: branchPx, startPx: unit * 0.75, minPx: unit * 0.45, weight: 700 });
    ctx.font = `700 ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(b.label, bcx, bCenter.y - unit * 0.2);

    const cIn = clamp01((t - (1 - 0.4)) / 0.4);
    if (cIn > 0) {
      const pctText = `${Math.round((b.value / total) * 100)}%`;
      const valText = fmt(b.value, easeOutCubic(cIn));
      ctx.globalAlpha *= easeOutCubic(cIn);
      const rowGap = unit * 0.55 + unit * 0.35;
      const rowSlot = Math.min(vertical ? aw * 0.25 : aw * 0.15, slotPx);
      let pctPx = unit * 0.6;
      let valPx = unit * 0.72;
      ctx.font = `800 ${pctPx}px ${FONT_MONO}`;
      let pw = ctx.measureText(pctText).width;
      ctx.font = `700 ${valPx}px ${FONT_MONO}`;
      let vw = ctx.measureText(valText).width;
      let rowW = pw + rowGap + vw;
      if (rowW > rowSlot) {
        // Shrink both tiers together, keeping their ratio, rather than
        // letting the row overflow into the next branch's slot.
        const scale = Math.max(0.55, rowSlot / rowW);
        pctPx *= scale;
        valPx *= scale;
        ctx.font = `800 ${pctPx}px ${FONT_MONO}`;
        pw = ctx.measureText(pctText).width;
        ctx.font = `700 ${valPx}px ${FONT_MONO}`;
        vw = ctx.measureText(valText).width;
        rowW = pw + rowGap + vw;
      }
      const rowX = bcx - rowW / 2;
      const rowY = bCenter.y + unit * 0.8;

      const tint = tints[i % tints.length];
      roundRect(ctx, rowX - unit * 0.12, rowY - unit * 0.52, pw + unit * 0.55, unit * 0.95, unit * 0.28);
      ctx.fillStyle = rgba(tint, 0.18);
      ctx.fill();
      ctx.textAlign = "start";
      ctx.font = `800 ${pctPx}px ${FONT_MONO}`;
      ctx.fillStyle = tint;
      ctx.fillText(pctText, rowX + unit * 0.15, rowY + unit * 0.18);
      ctx.font = `700 ${valPx}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.text;
      ctx.fillText(valText, rowX + pw + unit * 0.55 + unit * 0.35, rowY + unit * 0.22);
    }
    ctx.textAlign = "start";
    ctx.restore();
  });
}

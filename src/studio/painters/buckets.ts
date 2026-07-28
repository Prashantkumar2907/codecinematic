import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type BucketsScene = Extract<Scene, { kind: "buckets" }>;

const FILL_FRAC = 0.85;
const FULL_EPS = 1e-9;

export function paintBuckets(ctx: CanvasRenderingContext2D, scene: BucketsScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.pours.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, 0.12 * enterT(env, 350), accent) + unit * 0.3;
  const ghostIn = easeOutCubic(enterT(env, 400));
  const key = scene.id + "-bkt3d";

  const wholes =
    scene.buckets.every((b) => Number.isInteger(b.capacity)) && scene.pours.every((p) => Number.isInteger(p.amount));
  const u = scene.unit.trim();
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (v: number): string => {
    const body = wholes
      ? Math.round(v).toLocaleString(locale)
      : v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (/^[₹$€£]$/.test(u)) return `${u}${body}`;
    return u ? `${body} ${u}` : body;
  };

  let poured = 0;
  let flowing = false;
  scene.pours.forEach((pour, k) => {
    const bk = offset + k;
    if (active > bk) {
      poured += pour.amount;
    } else if (active === bk) {
      const t = beatT(env.beats, bk, totalBeats, env.p);
      poured += pour.amount * easeInOutCubic(clamp01(t / FILL_FRAC));
      if (t < 1) flowing = true;
    }
  });

  let rem = poured;
  const fills = scene.buckets.map((b) => {
    const f = Math.min(rem, b.capacity);
    rem = Math.max(0, rem - b.capacity);
    return f;
  });
  let fillingIndex = fills.findIndex((f, i) => f < scene.buckets[i].capacity - FULL_EPS);
  if (fillingIndex === -1) fillingIndex = scene.buckets.length - 1;

  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const ah = contentH - band;
  const topPad = unit * 1.7;
  const labelH = unit * (vertical ? 2.6 : 2.3);
  const areaTop = ay + topPad;
  const baseline = ay + ah - labelH;
  const maxBucketH = Math.max(baseline - areaTop, unit * 4);
  const rect = { x: ax, y: areaTop - unit * 2, w: aw, h: baseline - areaTop + unit * 2 };

  const n = scene.buckets.length;
  const maxCap = Math.max(...scene.buckets.map((b) => b.capacity), 1e-9);
  
  const spreadX = vertical ? 3.5 : 5.5;
  const spreadY = vertical ? 4.5 : 3.5;
  const bucketW3D = (spreadX * 2.0) / n * 0.7;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, 0, vertical ? 15 : 12);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(spreadX * 3, 10, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -spreadY / 2;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 4, spreadY * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -spreadY / 2;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models: { container: THREE.Group, liquid: THREE.Group, bucket: any, i: number, maxH: number }[] = [];

    scene.buckets.forEach((bucket, i) => {
        const x = n === 1 ? 0 : (i / (n - 1) - 0.5) * spreadX * 2;
        const bH = clamp01(bucket.capacity / maxCap) * spreadY * 0.58 + spreadY * 0.42;

        // Container (glass-like)
        const container = makeBlock(bucketW3D, bH, bucketW3D * 0.8, "rgba(148,163,184,0.05)", "rgba(148,163,184,0.4)");
        container.position.set(x, -spreadY / 2 + bH / 2, 0);
        container.children.forEach(c => {
            if (c instanceof THREE.Mesh) {
                const mat = c.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = 0.05; // More transparent glass
                mat.roughness = 0.1;
                mat.metalness = 0.5;
                mat.depthWrite = false; // Fix transparent z-fighting
            }
        });
        s.add(container);

        // Liquid inside
        const liquid = makeBlock(bucketW3D * 0.95, bH * 0.98, bucketW3D * 0.75, accent, THEME.good);
        // Anchor at bottom
        liquid.position.set(x, -spreadY / 2 + 0.05, 0); 
        s.add(liquid);

        models.push({ container, liquid, bucket, i, maxH: bH });
    });

    const update = (elapsedMs: number, ctxData: { gIn: number, fills: number[], fillingIndex: number, flowing: boolean }) => {
      const { gIn, fills, fillingIndex, flowing } = ctxData;
      
      models.forEach(({ container, liquid, i, maxH }) => {
        const full = fills[i] >= scene.buckets[i].capacity - FULL_EPS && fills[i] > 0;
        const isFilling = flowing && i === fillingIndex;
        const fillAmt = clamp01(fills[i] / scene.buckets[i].capacity);
        
        container.visible = gIn > 0;
        container.children.forEach(c => {
            if (c instanceof THREE.Mesh) {
                const mat = c.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = 0.15 * gIn;
            }
        });

        // Highlight container walls if filling
        if (isFilling) {
            container.children.forEach(c => {
                if (c instanceof THREE.LineSegments) {
                    (c.material as THREE.LineBasicMaterial).color.setStyle(accent);
                    (c.material as THREE.LineBasicMaterial).opacity = 0.8;
                }
            });
        } else {
            container.children.forEach(c => {
                if (c instanceof THREE.LineSegments) {
                    (c.material as THREE.LineBasicMaterial).color.setStyle("rgba(148,163,184,0.4)");
                    (c.material as THREE.LineBasicMaterial).opacity = 0.4;
                }
            });
        }

        if (fillAmt > 0) {
            liquid.visible = true;
            liquid.scale.set(1, fillAmt, 1);
            // Since scaling happens from the center, we must shift the position up
            // so the bottom remains anchored at the floor
            const currentH = (maxH * 0.98) * fillAmt;
            liquid.position.y = -spreadY / 2 + 0.05 + currentH / 2;
            
            // Wavy bob effect if filling
            const bob = isFilling ? Math.sin(elapsedMs / 100) * 0.05 : 0;
            liquid.position.y += bob;

            liquid.children.forEach(c => {
                if (c instanceof THREE.Mesh) {
                    const mat = c.material as THREE.MeshPhysicalMaterial;
                    mat.transparent = true;
                    mat.opacity = gIn * 0.9;
                    if (full) {
                        mat.color.setStyle(THEME.good);
                        mat.emissive.setStyle(THEME.good);
                    } else {
                        mat.color.setStyle(accent);
                        mat.emissive.setStyle(accent);
                    }
                }
            });
        } else {
            liquid.visible = false;
        }
      });
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: ghostIn, fills, fillingIndex, flowing });
  if (!cam) return;

  const get2D = (i: number, isTop: boolean) => {
      const x = n === 1 ? 0 : (i / (n - 1) - 0.5) * spreadX * 2;
      const bH = clamp01(scene.buckets[i].capacity / maxCap) * spreadY * 0.58 + spreadY * 0.42;
      const fillAmt = clamp01(fills[i] / scene.buckets[i].capacity);
      const y = isTop ? (-spreadY / 2 + bH) : (-spreadY / 2 + bH * fillAmt);
      return projectToRect(cam, new THREE.Vector3(x, y, 0), rect);
  };
  const get2DBottom = (i: number) => {
      const x = n === 1 ? 0 : (i / (n - 1) - 0.5) * spreadX * 2;
      return projectToRect(cam, new THREE.Vector3(x, -spreadY / 2 - 0.2, 0), rect);
  };

  // 2D overlays
  ctx.save();
  ctx.globalAlpha = ghostIn;

  scene.buckets.forEach((bucket, i) => {
    const isFilling = flowing && i === fillingIndex;
    const has = fills[i] > 0;
    
    // Rate chip
    if (bucket.rate) {
      const topP = get2D(i, true);
      ctx.save();
      ctx.globalAlpha = ghostIn * (isFilling ? 1 : 0.8);
      ctx.font = `800 ${unit * 0.6}px ${FONT_MONO}`;
      const rw = ctx.measureText(bucket.rate).width + unit * 0.6;
      const rx = topP.x - rw / 2;
      const ryc = topP.y - unit * 1.0;
      roundRect(ctx, rx, ryc - unit * 0.5, rw, unit * 1.0, unit * 0.28);
      ctx.fillStyle = "#0a0e13";
      ctx.fill();
      ctx.strokeStyle = rgba(accent, 0.55);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.textAlign = "center";
      ctx.fillText(bucket.rate, topP.x, ryc + unit * 0.22);
      ctx.textAlign = "start";
      ctx.restore();
    }

    // Labels
    const botP = get2DBottom(i);
    ctx.save();
    ctx.globalAlpha = ghostIn * (isFilling ? 1 : has ? 0.9 : 0.55);
    ctx.textAlign = "center";
    const bw2D = contentW / n * 0.8;
    const lpx = fitFontSize(ctx, bucket.label, { maxW: bw2D, startPx: unit * 0.72, minPx: unit * 0.5, weight: 700 });
    ctx.font = `700 ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = isFilling ? THEME.text : THEME.textDim;
    ctx.fillText(bucket.label, botP.x, botP.y + unit * 1.0);
    const amt = fmt(fills[i]);
    ctx.font = `800 ${unit * (vertical ? 0.8 : 0.72)}px ${FONT_MONO}`;
    ctx.fillStyle = has ? (isFilling ? accent : THEME.text) : THEME.textFaint;
    ctx.fillText(amt, botP.x, botP.y + unit * 1.9);
    ctx.textAlign = "start";
    ctx.restore();
  });

  // Overflow 2D waterfall effects
  if (flowing) {
    for (let i = 0; i < fillingIndex; i++) {
      if (fills[i] < scene.buckets[i].capacity - FULL_EPS) continue;
      const fromP = get2D(i, true);
      const toP = get2D(i + 1, false);
      // Offset slightly to represent edge of bucket
      const bw2D = contentW / n * 0.4;
      fromP.x += bw2D;
      
      const midX = (fromP.x + toP.x) / 2;
      ctx.save();
      ctx.globalAlpha = ghostIn * 0.85;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
      ctx.strokeStyle = "#eaf6ff";
      ctx.lineWidth = unit * 0.16;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(fromP.x, fromP.y);
      ctx.quadraticCurveTo(midX, fromP.y - unit * 0.15, toP.x, toP.y);
      ctx.stroke();
      
      for (let d = 0; d < 3; d++) {
        const f = ((env.elapsedMs / 600 + d / 3) % 1);
        const dx = fromP.x + (toP.x - fromP.x) * f;
        const dy = fromP.y + (toP.y - fromP.y) * f * f;
        ctx.globalAlpha = ghostIn * Math.sin(Math.PI * f);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(dx, dy, unit * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    
    // Pour stream into the frontier bucket
    const sP = get2D(fillingIndex, false);
    ctx.save();
    ctx.globalAlpha = ghostIn;
    const sg = ctx.createLinearGradient(0, areaTop - unit * 0.6, 0, sP.y);
    sg.addColorStop(0, rgba(accent, 0.15));
    sg.addColorStop(1, rgba(accent, 0.7));
    ctx.strokeStyle = sg;
    ctx.lineWidth = unit * 0.28;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sP.x, areaTop - unit * 0.6);
    ctx.lineTo(sP.x, sP.y);
    ctx.stroke();
    for (let d = 0; d < 3; d++) {
      const f = (env.elapsedMs / 420 + d / 3) % 1;
      const dy = areaTop - unit * 0.6 + (sP.y - (areaTop - unit * 0.6)) * f;
      ctx.globalAlpha = ghostIn * Math.sin(Math.PI * f);
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath();
      ctx.arc(sP.x + Math.sin(env.elapsedMs / 200 + d) * unit * 0.1, dy, unit * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Running total chip
  const totalText = `${fmt(poured)}`;
  const totPx = unit * (vertical ? 0.9 : 0.82);
  ctx.save();
  ctx.globalAlpha = ghostIn;
  const labelTxt = "Total ";
  ctx.font = `800 ${totPx}px ${FONT_MONO}`;
  const tw = ctx.measureText(totalText).width;
  ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
  const lw = ctx.measureText(labelTxt).width;
  const chipW = lw + tw + unit * 1.2;
  const chipX = ax + aw / 2 - chipW / 2;
  const chipY = ay + unit * 0.15;
  if (flowing) {
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.35 + 0.45 * idle(env, 1700));
  } else if (poured > 0) {
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.15 + 0.25 * idle(env, 2600));
  }
  const chipH = totPx * 1.45;
  roundRect(ctx, chipX, chipY, chipW, chipH, unit * 0.35);
  ctx.fillStyle = "#0a0e13";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(accent, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.fillText(labelTxt, chipX + unit * 0.6, chipY + chipH * 0.66);
  ctx.font = `800 ${totPx}px ${FONT_MONO}`;
  ctx.fillStyle = accent;
  ctx.fillText(totalText, chipX + unit * 0.6 + lw, chipY + chipH * 0.68);
  ctx.textAlign = "start";
  ctx.restore();
  
  ctx.restore();
}

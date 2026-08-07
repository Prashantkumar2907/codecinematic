import * as THREE from "three";
import { render3D, projectToRect, studioLights, isoCamera, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
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
  seriesTints,
} from "./common";
import type { PaintEnv } from "./index";

type ProbabilityScene = Extract<Scene, { kind: "probability" }>;

const POINTER = -Math.PI / 2;
/** Fraction of the tighter frustum half-extent the wheel should fill. */
const FILL_FRACTION = 0.85;
/** A travelling marker/flash reads as white-hot regardless of subject accent
 *  — same convention as `cipher.ts`'s `INK_BRIGHT`. */
const SPARK = "#eaf6ff";
/** Dark text on a bright accent-filled chip — same convention as
 *  `cipher.ts`'s `INK_ON_ACCENT` (also used by `question.ts`). */
const INK_ON_ACCENT = "#06121a";
const SPIN_TURNS = 3;
const SETTLE = 0.85;

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

export function paintProbability(ctx: CanvasRenderingContext2D, scene: ProbabilityScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const nSpins = scene.spins.length;
  const hasVerdict = !!scene.sayVerdict;
  const totalBeats = offset + nSpins + (hasVerdict ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const ghostIn = easeOutCubic(enterT(env, 400));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const ah = contentH - band;

  // Base four by measured separation, then the same four at 0.6 alpha for segments
  // 5-8. The old literal repeated `accent` and `THEME.good` in both halves, so on a
  // subject whose accent IS THEME.good four of the eight segments collapsed to two.
  const segHues = seriesTints(accent, secondary, 4);
  const segTints = [...segHues, ...segHues.map((c) => rgba(c, 0.6))];
  const totalW = scene.segments.reduce((s, g) => s + g.weight, 0) || 1;
  const expected = scene.segments.reduce((s, g) => s + (g.win ? g.weight : 0), 0) / totalW;

  // Base (unrotated) segment angles, laid clockwise from the top.
  let cum = 0;
  const segBase = scene.segments.map((g) => {
    const a0 = POINTER + (cum / totalW) * TAU;
    cum += g.weight;
    const a1 = POINTER + (cum / totalW) * TAU;
    return { a0, a1, mid: (a0 + a1) / 2 };
  });

  // Deterministic cumulative rotation: each spin adds SPIN_TURNS full turns plus
  // the residual needed to bring segments[land].mid under the fixed top pointer.
  const rotAfter: number[] = [];
  let prevRot = 0;
  scene.spins.forEach((sp, k) => {
    const targetMod = norm(POINTER - segBase[sp.land].mid);
    const delta = norm(targetMod - norm(prevRot)) + SPIN_TURNS * TAU;
    prevRot += delta;
    rotAfter[k] = prevRot;
  });

  const spinIdx = active - offset;
  let rotation = 0;
  let liveSpin = -1;
  let liveT = 0;
  if (spinIdx < 0) {
    rotation = 0;
  } else if (spinIdx < nSpins) {
    liveSpin = spinIdx;
    liveT = beatT(env.beats, offset + spinIdx, totalBeats, env.p);
    const from = spinIdx === 0 ? 0 : rotAfter[spinIdx - 1];
    rotation = from + (rotAfter[spinIdx] - from) * easeInOutCubic(clamp01(liveT / SETTLE));
  } else {
    rotation = rotAfter[nSpins - 1];
  }
  // Gentle idle drift only while fully at rest (never mid-spin).
  const atRest = liveSpin < 0 || liveT >= 1;
  if (atRest) rotation += (idle(env, 8800) - 0.5) * 0.04;

  // How many spins have visibly landed (for the tally/actual fraction).
  let landed = 0;
  let wins = 0;
  for (let k = 0; k < nSpins; k++) {
    const bk = offset + k;
    const settled = active > bk || (active === bk && beatT(env.beats, bk, totalBeats, env.p) >= SETTLE);
    if (settled) {
      landed++;
      if (scene.segments[scene.spins[k].land].win) wins++;
    }
  }
  const actual = landed > 0 ? wins / landed : 0;

  // Wheel geometry: left/top slot; tally fills the remaining slot.
  const wheelR = vertical ? Math.min(aw * 0.42, ah * 0.3) : Math.min(ah * 0.42, aw * 0.28);
  const cx = vertical ? ax + aw / 2 : ax + wheelR + unit * 0.6;
  const cy = vertical ? ay + wheelR + unit * 1.4 : ay + ah / 2;

  
  // ---- 3D Wheel ----
  const wheelRectW = vertical ? aw : cx + wheelR + unit * 2 - ax;
  const wheelRectH = vertical ? cy + wheelR + unit * 2 - ay : ah;
  const rect = { x: ax, y: ay, w: wheelRectW, h: wheelRectH };
  
  const radius3D = 3.5;
  const height3D = 0.6;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = isoCamera();
    /**
     * `qa/ledger.json` -> systemic `2d-layout-round-tripped-through-camera`:
     * `isoCamera()`'s position was only ever overridden for `vertical`, so a
     * horizontal `rect` (which here uses the FULL content height, not a
     * square-ish area) fell through to a position tuned for something else
     * entirely — measured concretely: the wheel clipped clean off the left
     * edge on 16:9. Distance along the same iso viewing direction is now
     * solved analytically (same technique as `orbit.ts`) so the wheel fills
     * `FILL_FRACTION` of whichever frustum axis is tighter for this rect.
     */
    const isoDir = (vertical ? new THREE.Vector3(8.5, 7.2, 9.5) : new THREE.Vector3(6.5, 5.2, 7.5)).normalize();
    const aspect = rect.w / rect.h;
    const tanHalfFov = Math.tan((camera.fov * Math.PI) / 360);
    const fitExtent = radius3D + 0.6; // a little headroom for the pointer/labels above the rim
    const dist = fitExtent / (FILL_FRACTION * tanHalfFov * Math.min(1, aspect));
    camera.position.copy(isoDir.multiplyScalar(dist));
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(12, 12, new THREE.Color(accent), new THREE.Color(THEME.textDim));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -height3D/2 - 0.1;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -height3D/2 - 0.1;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius3D * 0.15, radius3D * 0.15, height3D + 0.2, 32),
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(THEME.bgBottom), metalness: 0.8, roughness: 0.2 })
    );
    hub.castShadow = true;
    s.add(hub);

    const models: { mesh: THREE.Group, segIdx: number, baseColor: string, win: boolean }[] = [];
    
    scene.segments.forEach((seg, i) => {
      const base = segTints[i % segTints.length];
      const g = new THREE.Group();
      
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.arc(0, 0, radius3D, 0, (seg.weight / totalW) * TAU, false);
      
      const geo = new THREE.ExtrudeGeometry(shape, { depth: height3D, curveSegments: 32, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.04, bevelThickness: 0.04 });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, -height3D/2, 0);

      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(base),
        emissive: new THREE.Color(base),
        emissiveIntensity: 0.1,
        metalness: 0.2,
        roughness: 0.15,
        clearcoat: 0.8,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })
      );
      mesh.add(edges);
      
      s.add(g);
      models.push({ mesh: g, segIdx: i, baseColor: base, win: seg.win });
    });

    const update = (elapsedMs: number, ctxData: any) => {
      const { rotation, flashIdx, flashT, shimmerWin, ghostIn } = ctxData;
      
      let currentA = rotation;
      models.forEach(m => {
         const a0 = currentA;
         const aLen = (scene.segments[m.segIdx].weight / totalW) * TAU;
         
         m.mesh.rotation.y = -a0;
         
         const isFlash = m.segIdx === flashIdx;
         const flash = isFlash ? flashT : 0;
         const shimmer = m.win ? shimmerWin : 0;
         
         m.mesh.children.forEach(child => {
             if (child instanceof THREE.Mesh) {
                 const mat = child.material as THREE.MeshPhysicalMaterial;
                 mat.transparent = true;
                 mat.opacity = ghostIn * (m.win ? 1 : 0.85);
                 if (flash > 0) {
                     mat.color.setStyle(SPARK);
                     mat.emissive.setStyle(SPARK);
                     mat.emissiveIntensity = 0.5 * flash;
                 } else {
                     mat.color.setStyle(m.baseColor);
                     mat.emissive.setStyle(m.baseColor);
                     mat.emissiveIntensity = m.win ? 0.2 + 0.3 * shimmer : 0.1;
                 }
             }
         });
         currentA += aLen;
      });
    };

    return { scene: s, camera, update };
  };

  const flashIdx = liveSpin >= 0 ? scene.spins[liveSpin].land : -1;
  const flashT = liveSpin >= 0 ? easeOutCubic(clamp01((liveT - SETTLE) / (1 - SETTLE))) : 0;
  const shimmerWin = idle(env, 3100);
  
  const key = scene.id + "-prob3d";
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { rotation, flashIdx, flashT, shimmerWin, ghostIn });
  
  if (!cam) return;

  // Labels and Pointer
  ctx.save();
  ctx.globalAlpha = ghostIn;
  scene.segments.forEach((seg, i) => {
    const mid = segBase[i].mid + rotation;
    const p3d = new THREE.Vector3(Math.cos(mid) * (radius3D * 0.7), height3D/2 + 0.1, Math.sin(mid) * (radius3D * 0.7));
    const p2d = projectToRect(cam, p3d, rect);
    
    const lx = p2d.x;
    const ly = p2d.y;
    const lpx = fitFontSize(ctx, seg.label, { maxW: wheelR * 0.7, startPx: unit * 0.58, minPx: unit * 0.4, weight: 700 });
    ctx.font = `700 ${lpx}px ${FONT_SANS}`;
    ctx.fillStyle = INK_ON_ACCENT;
    ctx.textAlign = "center";
    ctx.fillText(seg.label, lx, ly + lpx * 0.34);
    if (seg.win) {
      ctx.font = `${unit * 0.5}px ${FONT_SANS}`;
      ctx.fillText("★", lx, ly - lpx * 0.7);
    }
    ctx.textAlign = "start";
  });

  // Pointer
  const pPointer3D = new THREE.Vector3(Math.cos(POINTER) * (radius3D + 0.4), height3D/2 + 0.5, Math.sin(POINTER) * (radius3D + 0.4));
  const pointer2d = projectToRect(cam, pPointer3D, rect);
  
  ctx.beginPath();
  ctx.moveTo(pointer2d.x, pointer2d.y + unit * 0.3);
  ctx.lineTo(pointer2d.x - unit * 0.42, pointer2d.y - unit * 0.4);
  ctx.lineTo(pointer2d.x + unit * 0.42, pointer2d.y - unit * 0.4);
  ctx.closePath();
  ctx.fillStyle = SPARK;
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = atRest ? 0 : unit * 0.5;
  ctx.fill();
  ctx.restore();

  // ---- Tally panel ----
  const tx = vertical ? ax : cx + wheelR + unit * 1.0;
  const tw = vertical ? aw : ax + aw - tx;
  const ty = vertical ? cy + wheelR + unit * 1.2 : ay + unit * 0.4;
  const th = vertical ? ay + ah - ty : ah - unit * 0.8;

  // Spin count.
  ctx.save();
  ctx.globalAlpha = ghostIn;
  ctx.font = `800 ${unit * 0.9}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.text;
  const spinsTxt = `${landed} ${landed === 1 ? "spin" : "spins"}`;
  ctx.fillText(spinsTxt, tx, ty + unit * 0.9);
  ctx.restore();

  // Win / lose proportion bar that grows as spins land.
  const barY = ty + unit * 1.7;
  const barH = unit * 1.1;
  ctx.save();
  ctx.globalAlpha = ghostIn;
  roundRect(ctx, tx, barY, tw, barH, barH / 2);
  ctx.fillStyle = rgba(THEME.textDim, 0.1);
  ctx.fill();
  if (landed > 0) {
    const winW = tw * actual;
    const activeTally = liveSpin >= 0 && liveT >= SETTLE;
    if (activeTally) {
      ctx.shadowColor = rgba(THEME.good, 0.5);
      ctx.shadowBlur = unit * (0.15 + 0.5 * idle(env, 1500));
    }
    roundRect(ctx, tx, barY, Math.max(barH, winW), barH, barH / 2);
    ctx.fillStyle = rgba(THEME.good, 0.85);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `800 ${unit * 0.6}px ${FONT_MONO}`;
    ctx.fillStyle = INK_ON_ACCENT;
    ctx.fillText(`${wins}W`, tx + unit * 0.4, barY + barH * 0.68);
    if (landed - wins > 0) {
      ctx.fillStyle = THEME.textDim;
      const loseTxt = `${landed - wins}L`;
      ctx.fillText(loseTxt, tx + tw - ctx.measureText(loseTxt).width - unit * 0.4, barY + barH * 0.68);
    }
  }
  ctx.restore();

  // Expected reference line + actual chip.
  const refY = barY + barH + unit * 1.4;
  ctx.save();
  ctx.globalAlpha = ghostIn;
  const refX = tx + tw * expected;
  ctx.setLineDash([unit * 0.22, unit * 0.22]);
  ctx.strokeStyle = rgba(accent, 0.7);
  ctx.lineWidth = unit * 0.06;
  ctx.beginPath();
  ctx.moveTo(refX, barY - unit * 0.3);
  ctx.lineTo(refX, barY + barH + unit * 0.3);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `700 ${unit * 0.62}px ${FONT_SANS}`;
  ctx.fillStyle = accent;
  ctx.fillText(`expected ${Math.round(expected * 100)}%`, tx, refY + unit * 0.2);
  ctx.font = `800 ${unit * 0.62}px ${FONT_MONO}`;
  ctx.fillStyle = landed > 0 ? THEME.good : THEME.textFaint;
  const actualTxt = `actual ${landed > 0 ? Math.round(actual * 100) : "—"}${landed > 0 ? "%" : ""}`;
  ctx.fillText(actualTxt, tx, refY + unit * 1.2);
  ctx.restore();

  // Verdict stamp.
  if (hasVerdict && scene.verdict) {
    const vBeat = offset + nSpins;
    const vt = active >= vBeat ? beatT(env.beats, vBeat, totalBeats, env.p) : 0;
    if (vt > 0) {
      const pop = easeOutBack(clamp01(vt / 0.35));
      const vy = refY + unit * 2.3;
      ctx.save();
      ctx.globalAlpha = clamp01(vt * 3);
      ctx.font = `800 ${unit * 0.7}px ${FONT_SANS}`;
      const vw2 = Math.min(ctx.measureText(scene.verdict).width + unit * 1.2, tw);
      const vxc = tx + tw / 2;
      ctx.translate(vxc, vy);
      ctx.scale(pop, pop);
      ctx.translate(-vxc, -vy);
      roundRect(ctx, vxc - vw2 / 2, vy - unit * 0.7, vw2, unit * 1.4, unit * 0.4);
      ctx.fillStyle = rgba(accent, 0.16);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.06;
      ctx.stroke();
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      const vpx = fitFontSize(ctx, scene.verdict, { maxW: vw2 - unit * 0.8, startPx: unit * 0.7, minPx: unit * 0.48, weight: 800 });
      ctx.font = `800 ${vpx}px ${FONT_SANS}`;
      ctx.fillText(scene.verdict, vxc, vy + vpx * 0.34);
      ctx.textAlign = "start";
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
  void th;
}

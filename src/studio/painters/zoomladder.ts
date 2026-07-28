import * as THREE from "three";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  clamp01,
  roundRect,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import { render3D, projectToRect, studioLights, type ThreeBundle, makeBlock, color3 } from "./three3d";
import type { PaintEnv } from "./index";

type ZoomladderScene = Extract<Scene, { kind: "zoomladder" }>;

const FACTOR = 6.5;
const FILL_FRAC = 0.72;

export function paintZoomladder(ctx: CanvasRenderingContext2D, scene: ZoomladderScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const n = scene.rungs.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = Math.min(Math.max(active - offset, 0), n - 1);

  const titleBand = scene.title ? drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3 : 0;
  const stageY = contentY + titleBand;
  const stageH = contentH - titleBand;
  const stageCx = contentX + contentW / 2;
  const stageCy = stageY + stageH / 2;
  const stageMin = Math.min(contentW, stageH);
  const S = stageMin * 0.055;
  const rect = { x: contentX, y: stageY, w: contentW, h: stageH };

  // Nesting depth per rung: "out" climbs 0->n-1, "in" reverses so beat 0
  // starts at the outermost rung and dives toward depth 0.
  const depthOf = (step: number) => (scene.direction === "in" ? n - 1 - step : step);
  
  // Three.js 3D space size configuration
  const Z_SPACING = 5;
  const BASE_SIZE = 4;
  
  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    // Camera is moved by update
    studioLights(s, accent, env.palette.secondary);

    const rungs: { mesh: THREE.Group, zBase: number, step: number }[] = [];
    
    scene.rungs.forEach((rung, step) => {
      const d = depthOf(step);
      // Outer scales have smaller d, or larger d?
      // In 2D: inner = smaller half.
      // If we map this to Z depth: smaller Z = further away?
      // Let's just make larger blocks at further positive Z.
      // Or we can just use scale like in 2D, but in 3D:
      const zBase = -d * Z_SPACING;
      // We scale the object so it looks huge when we zoom out
      const sc = Math.pow(FACTOR, d) * 0.15;
      
      const mesh = makeBlock(BASE_SIZE, 0.1, BASE_SIZE, THEME.panel, accent);
      mesh.position.y = -0.5 - d * 0.1; // Stack slightly downwards
      mesh.position.z = zBase;
      mesh.scale.set(sc, 1, sc);
      
      s.add(mesh);
      rungs.push({ mesh, zBase, step });
    });

    const grid = new THREE.GridHelper(50, 50, color3(accent), color3("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -1;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const update = (elapsedMs: number, ctxData: { logZ: number, camZBase: number }) => {
      const { logZ, camZBase } = ctxData;
      
      // We want to simulate the 2D scaling by moving the camera
      // Instead of scaling, we move camera Z and Y
      // logZ is related to zoom level.
      // Let's interpolate camera position based on current activeStep depth
      
      const targetZ = camZBase;
      const camY = 3;
      const camZOffset = 4;
      
      // To simulate zoom, we can move the camera in Z
      camera.position.set(0, camY, targetZ + camZOffset);
      camera.lookAt(0, 0, targetZ - 1);
      
      rungs.forEach((r) => {
        // Bobbing
        const bob = Math.sin(elapsedMs / 1000 + r.step) * 0.1;
        r.mesh.position.y = -0.5 - depthOf(r.step) * 0.2 + bob;
        
        // Highlight active
        const edges = r.mesh.children[1] as THREE.LineSegments;
        if (edges) {
          (edges.material as THREE.LineBasicMaterial).color = color3(r.step === activeStep ? accent : THEME.textDim);
          (edges.material as THREE.LineBasicMaterial).opacity = r.step === activeStep ? 1 : 0.3;
        }
      });
    };
    
    return { scene: s, camera, update };
  };

  const zoomFor = (step: number) => (stageMin * FILL_FRAC) / (2 * S * Math.pow(FACTOR, depthOf(step)));
  const tA = beatT(env.beats, offset + activeStep, totalBeats, env.p);
  const glide = easeInOutCubic(clamp01(tA / 0.62));
  
  const dPrev = depthOf(Math.max(0, activeStep - 1));
  const dCurr = depthOf(activeStep);
  const dInterp = activeStep === 0 ? dCurr : dPrev + (dCurr - dPrev) * glide;
  const camZBase = -dInterp * Z_SPACING;

  const logZ = activeStep === 0
      ? Math.log(zoomFor(0))
      : Math.log(zoomFor(activeStep - 1)) + (Math.log(zoomFor(activeStep)) - Math.log(zoomFor(activeStep - 1))) * glide;

  const cam = render3D(ctx, scene.id + "-zl3d", rect, build, env.elapsedMs, { logZ, camZBase });

  if (!cam) return;

  // 2D Overlay
  const dCamera = depthOf(activeStep);
  
  scene.rungs.forEach((rung, step) => {
    const d = depthOf(step);
    // Only draw 2D labels for rungs that are close to current camera
    if (Math.abs(d - dInterp) > 2) return;
    
    const zBase = -d * Z_SPACING;
    const sc = Math.pow(FACTOR, d) * 0.15;
    
    // Calculate world coordinates for corners
    const worldCenter = new THREE.Vector3(0, -0.5 - d * 0.2, zBase);
    const worldTopLeft = new THREE.Vector3(-BASE_SIZE / 2 * sc, -0.5 - d * 0.2, zBase - BASE_SIZE / 2 * sc);
    
    const ptCenter = projectToRect(cam, worldCenter, rect);
    const ptTopLeft = projectToRect(cam, worldTopLeft, rect);
    
    // Estimate screen radius
    const half = Math.abs(ptCenter.x - ptTopLeft.x);
    const apparent = 2 * half;
    
    if (apparent < unit * 0.5) return;
    const lowRamp = clamp01((apparent - unit * 0.5) / (unit * 0.6));
    const highRamp = clamp01(1 - (apparent - stageMin * 3) / (stageMin * 2));
    const win = lowRamp * highRamp;
    if (win <= 0) return;
    
    const isActive = step === activeStep;
    const stateAlpha = isActive ? 1 : step < activeStep ? 0.55 : 0.4;
    
    ctx.save();
    ctx.globalAlpha = win * stateAlpha;
    
    ctx.textAlign = "center";
    const iconPx = Math.min(half * 0.9, stageMin * 1.4);
    if (iconPx > unit * 0.4) {
      ctx.font = `${iconPx}px ${FONT_SANS}`;
      ctx.fillText(rung.icon ?? rung.label.slice(0, 1).toUpperCase(), ptCenter.x, ptCenter.y + iconPx * 0.3);
    }
    const labelPx = Math.min(Math.max(half * 0.16, unit * 0.3), unit * 1.2);
    if (half > unit * 1.4) {
      ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
      ctx.fillStyle = isActive ? THEME.text : THEME.textDim;
      ctx.fillText(rung.label, ptCenter.x, ptCenter.y + half * 0.78);
    }

    // Scale chip
    if (half > unit * 1.4) {
      const chipPx = Math.min(Math.max(half * 0.12, unit * 0.32), unit * 0.7);
      ctx.font = `600 ${chipPx}px ${FONT_MONO}`;
      const tw = ctx.measureText(rung.scale).width;
      const chipW = tw + chipPx * 1.2;
      const chipHh = chipPx * 1.7;
      const chipX = ptTopLeft.x;
      const chipY = ptTopLeft.y;
      roundRect(ctx, chipX, chipY, chipW, chipHh, chipPx * 0.5);
      ctx.fillStyle = "#0a0e13";
      ctx.fill();
      ctx.strokeStyle = rgba(accent, 0.4);
      ctx.lineWidth = Math.max(1, chipPx * 0.06);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillText(rung.scale, chipX + chipW / 2, chipY + chipHh * 0.68);
    }
    ctx.textAlign = "start";
    ctx.restore();
  });

  // Breadcrumb trail of visited scales across the top of the stage.
  ctx.save();
  ctx.font = `600 ${unit * 0.55}px ${FONT_MONO}`;
  let bx = contentX;
  const by = stageY + unit * 0.35;
  for (let step = 0; step <= activeStep && active >= offset; step++) {
    const tS = beatT(env.beats, offset + step, totalBeats, env.p);
    const popIn = easeOutBack(clamp01(tS / 0.12));
    const tw = ctx.measureText(scene.rungs[step].scale).width;
    const cw = tw + unit * 0.6;
    const ch = unit * 0.95;
    if (bx + cw > contentX + contentW) break;
    ctx.save();
    ctx.globalAlpha = clamp01(tS * 6);
    ctx.translate(bx + cw / 2, by + ch / 2);
    ctx.scale(Math.max(0.01, popIn), Math.max(0.01, popIn));
    ctx.translate(-(bx + cw / 2), -(by + ch / 2));
    roundRect(ctx, bx, by, cw, ch, unit * 0.28);
    ctx.fillStyle = step === activeStep ? "#0e2433" : "#0a0e13";
    ctx.fill();
    ctx.strokeStyle = step === activeStep ? rgba(accent, 0.7) : "rgba(148,163,184,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = step === activeStep ? accent : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(scene.rungs[step].scale, bx + cw / 2, by + ch * 0.7);
    ctx.textAlign = "start";
    ctx.restore();
    bx += cw + unit * 0.15;
    if (step < activeStep) {
      ctx.fillStyle = THEME.textFaint;
      ctx.fillText("›", bx, by + ch * 0.7);
      bx += ctx.measureText("›").width + unit * 0.15;
    }
  }
  ctx.restore();

  // Fixed-size caption panel: the active rung is always readable regardless
  // of where the camera is, crossfading between beats.
  const drawCaption = (step: number, alpha: number) => {
    if (alpha <= 0 || step < 0) return;
    const rung = scene.rungs[step];
    ctx.save();
    ctx.globalAlpha = alpha;
    const capX = contentX + unit * 0.2;
    const capY = stageY + stageH - unit * 2.6;
    const pop = step === activeStep ? easeOutBack(clamp01(tA / 0.2)) : 1;
    ctx.font = `800 ${unit * 1.3 * (0.85 + 0.15 * pop)}px ${FONT_MONO}`;
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.4;
    ctx.fillText(rung.scale, capX, capY + unit * 1.2);
    ctx.shadowBlur = 0;
    ctx.font = `600 ${unit * 0.72}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(rung.label, capX, capY + unit * 2.2);
    ctx.restore();
  };
  if (active >= offset) {
    const fade = easeOutCubic(clamp01(tA / 0.15));
    drawCaption(activeStep - 1, 1 - fade);
    drawCaption(activeStep, fade);
  }
  ctx.textAlign = "start";
}

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
  clampRange,
  roundRect,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba,
  shade,
  STROKE,
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
  // Bounded by safeBottom, not contentH: at 9:16 contentH runs under the burned-in
  // caption and the YouTube UI band, which is where this painter's 43.5% bottom
  // bleed came from (`qa/AUDIT.md`).
  const stageH = Math.min(contentY + contentH, layout.safeBottom) - stageY;
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

    // Derived from the panel colour rather than a literal slate, and via shade()'s
    // `rgb()` (not `rgba()`, which THREE.Color silently renders at full opacity —
    // see the accentSoft bug in `qa/LEDGER.md`). textDim would read far too bright
    // for a background grid.
    // No ground plane and no grid. Together they produced all three artifacts the
    // ledger recorded against this kind: the 0.4-opacity ShadowMaterial darkened a
    // trapezoid whose silhouette read as a "hard black box seam", its near edge was
    // the grey streak across the lower frame, and it was the surface the secondary
    // studio light painted a magenta blob onto. Enlarging it does not help — the
    // camera's far plane is 100, so a bigger plane is simply cut by the far clip in
    // the same place. The nested rung outlines already carry the depth read.

    const update = (elapsedMs: number, ctxData: { logZ: number, camZBase: number }) => {
      const { logZ, camZBase } = ctxData;
      
      // We want to simulate the 2D scaling by moving the camera
      // Instead of scaling, we move camera Z and Y
      // logZ is related to zoom level.
      // Let's interpolate camera position based on current activeStep depth
      
      const targetZ = camZBase;
      const camYOffset = 3;
      const camZOffset = 4;

      // Aim at the ACTIVE slab's own height, not y=0. Slabs sit at
      // `-0.5 - d * 0.2`, so aiming at the origin projected every rung below the
      // rect centre and left the upper half of the stage empty. Both the camera
      // and its target shift together, so the viewing angle is unchanged.
      const dI = -camZBase / Z_SPACING;
      const aimY = -0.5 - dI * 0.2;
      camera.position.set(0, aimY + camYOffset, targetZ + camZOffset);
      camera.lookAt(0, aimY, targetZ - 1);
      
      rungs.forEach((r) => {
        const d = depthOf(r.step);
        const bob = Math.sin(elapsedMs / 1000 + r.step) * 0.1;
        r.mesh.position.y = -0.5 - d * 0.2 + bob;

        // Each step out is FACTOR (6.5x) wider, so the rung one step outside the
        // active one is a ~25-unit slab five units from the camera: it projects as
        // a frame-filling wall, which is what the ledger logged as a "hard black
        // box seam" and what the secondary studio light painted its magenta blob
        // onto. Faded out by apparent size rather than hidden, so nothing pops.
        const wall = clamp01(1 - (d - dI - 0.3) / 0.5);
        r.mesh.visible = wall > 0.01;

        const face = r.mesh.children[0] as THREE.Mesh | undefined;
        const faceMat = face?.material as THREE.MeshPhysicalMaterial | undefined;
        if (faceMat) {
          faceMat.transparent = true;
          faceMat.opacity = wall;
        }
        // `makeBlock` parents the edges to the FACE mesh, not the group, so the
        // old `r.mesh.children[1]` was always undefined and this highlight — the
        // only thing marking which rung is current in 3D — never ran at all.
        const edges = face?.children[0] as THREE.LineSegments | undefined;
        if (edges) {
          const em = edges.material as THREE.LineBasicMaterial;
          em.color = color3(r.step === activeStep ? accent : THEME.textDim);
          em.opacity = (r.step === activeStep ? 1 : 0.3) * wall;
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
    // Neighbours are culled rather than clamped. Clamping them (the first pass at
    // this fix) kept them on frame but stacked them into the breadcrumb row and
    // the caption, trading a containment failure for an overlap failure — both
    // are rubric axis 1. Only the active rung is clamped, because it must stay
    // visible; a neighbour whose centre has left the stage is simply not drawn.
    if (!isActive) {
      const off =
        ptCenter.x < rect.x - unit ||
        ptCenter.x > rect.x + rect.w + unit ||
        ptCenter.y < rect.y - unit ||
        ptCenter.y > rect.y + stageH + unit;
      if (off) return;
    }
    const stateAlpha = isActive ? 1 : step < activeStep ? 0.55 : 0.4;
    
    ctx.save();
    ctx.globalAlpha = win * stateAlpha;
    
    ctx.textAlign = "center";
    // The icon is a glyph, so its ink box is ~1 em square. Capped against the
    // stage (it used to cap at `stageMin * 1.4` — 1336px of glyph on a 1080px
    // frame) and its centre clamped so the box cannot leave the stage even
    // though `ptCenter` is projected through a camera that is mid-zoom.
    // The zoom glide finishes at 62% of the beat and the last rung has nowhere
    // further to travel, so the tail of the scene held four identical frames.
    // A slow push across the WHOLE beat keeps something resolving; it rides the
    // cap rather than the raw projection so it cannot reintroduce the overflow.
    const push = isActive ? 0.97 + 0.06 * easeInOutCubic(clamp01(tA)) : 1;
    const iconPx = Math.min(half * 0.9, Math.min(rect.w, stageH) * 0.52) * push;
    let iconCx = ptCenter.x;
    let iconBaseline = ptCenter.y + iconPx * 0.3;
    if (iconPx > unit * 0.4) {
      iconCx = clampRange(iconCx, rect.x + iconPx * 0.5, rect.x + rect.w - iconPx * 0.5);
      iconBaseline = clampRange(iconBaseline, rect.y + iconPx * 0.8, rect.y + stageH - iconPx * 0.1);
      ctx.font = `${iconPx}px ${FONT_SANS}`;
      ctx.fillText(rung.icon ?? rung.label.slice(0, 1).toUpperCase(), iconCx, iconBaseline);
    }
    // The floating per-rung label is gone. Rungs nest by design, so a label under
    // one glyph necessarily lands on its neighbour's — that is where "Earth" on
    // the city card came from. `drawCaption` below already prints the active
    // rung's scale AND label at a fixed readable position, and the breadcrumb
    // prints the trail, so the floating copy was duplicated information whose
    // only contribution was the collision.

    // Scale chip — active rung only, for the same reason.
    if (half > unit * 1.4 && isActive) {
      const chipPx = Math.min(Math.max(half * 0.12, unit * 0.32), unit * 0.7);
      ctx.font = `600 ${chipPx}px ${FONT_MONO}`;
      const tw = ctx.measureText(rung.scale).width;
      const chipW = tw + chipPx * 1.2;
      const chipHh = chipPx * 1.7;
      // Clamped into the stage: the raw projected corner of a slab under a moving
      // camera put chips half off the left edge and floating in dead space.
      const chipX = clampRange(ptTopLeft.x, rect.x, rect.x + rect.w - chipW);
      const chipY = clampRange(ptTopLeft.y, rect.y, rect.y + stageH - chipHh);
      roundRect(ctx, chipX, chipY, chipW, chipHh, chipPx * 0.5);
      ctx.fillStyle = THEME.bgBottom;
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
    ctx.fillStyle = step === activeStep ? rgba(accent, 0.16) : THEME.bgBottom;
    ctx.fill();
    ctx.strokeStyle = step === activeStep ? rgba(accent, 0.7) : THEME.panelBorder;
    ctx.lineWidth = Math.max(1, unit * STROKE.hair);
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
    // stageH is now safeBottom-bounded, so the two-line panel below capY clears
    // the caption band instead of being drawn under it.
    const capY = stageY + stageH - unit * 2.4;
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

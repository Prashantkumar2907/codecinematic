import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_MONO,
  FONT_SANS,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  enterT,
  idle,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  rgba, shade} from "./common";
import type { PaintEnv } from "./index";

type CallstackScene = Extract<Scene, { kind: "callstack" }>;
type Frame = { label: string; note?: string };

function stackAt(scene: CallstackScene, k: number): Frame[] {
  const st: Frame[] = [];
  const last = Math.min(k, scene.steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const s = scene.steps[i];
    if (s.op === "push") st.push({ label: s.frame ?? "fn()", note: s.note });
    else st.pop();
  }
  return st;
}

const CAM_DIST = 9;
const FRAME_DEPTH = 0.5;
const ROW_GAP_UNITS = 0.22;
const ROW_MAX_H_UNITS = 4.6;
/** Lowest usable baseline as a fraction of frame height (Shorts UI band on 9:16).
 *  0.86 left the stack base and its bottom frame under the YouTube UI. */
const SAFE_BOTTOM_SHORT = 0.75;
/** Push drops in from this many row-heights above; pop flies this many up. */
const PUSH_DROP_ROWS = 2.2;
const POP_FLY_ROWS = 1.8;
/** Slab face, lifted off THEME.panel so the extrusion catches the studio lights. */
const FRAME_FACE_LIFT = 0.16;
const IDLE_EMISSIVE = 0.06;
const TOP_EMISSIVE = 0.24;
/** makeBlock builds its edge wireframe at 0.6 opacity; keep that ratio when fading. */
const EDGE_ALPHA = 0.6;
const LABEL_H_FRAC = 0.42;

function maxDepthOf(scene: CallstackScene): number {
  let depth = 0;
  let max = 0;
  for (const s of scene.steps) {
    depth += s.op === "push" ? 1 : -1;
    depth = Math.max(depth, 0);
    max = Math.max(max, depth);
  }
  return Math.max(max, 1);
}

export function paintCallstack(ctx: CanvasRenderingContext2D, scene: CallstackScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentSoft, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = Math.min(active - offset, scene.steps.length - 1);
  const t = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const frameIn = easeOutCubic(enterT(env, 380));
  const key = scene.id + "-stack3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const maxDepth = maxDepthOf(scene);
  const frameW = contentW * (vertical ? 0.72 : 0.44);
  const fx = contentX + (contentW - frameW) / 2;
  const stackBottom = vertical ? Math.min(areaY + areaH, layout.h * SAFE_BOTTOM_SHORT) : areaY + areaH;
  const baseY = stackBottom - unit * 0.6;
  const stackH = baseY - areaY;
  
  const rect = { x: contentX, y: areaY, w: contentW, h: stackH + unit * 0.6 };

  // Pixel rows are authoritative and the slabs are mapped onto them. World literals
  // under a tilted camera put each frame at a different depth, so the 2D label row and
  // the slab it sits on could not line up.
  const rowGapPx = unit * ROW_GAP_UNITS;
  const rowH = Math.min((stackH - (maxDepth - 1) * rowGapPx) / maxDepth, unit * ROW_MAX_H_UNITS);
  /** Pixel rect of stack level `level` (0 = bottom of the stack). */
  const rowRect = (level: number) => ({
    x: fx,
    y: baseY - (level + 1) * rowH - level * rowGapPx,
    w: frameW,
    h: rowH,
  });

  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };
  
  const step = activeStep >= 0 ? scene.steps[activeStep] : null;
  const cur = stackAt(scene, activeStep);
  const prev = stackAt(scene, activeStep - 1);
  const pushing = step?.op === "push" && cur.length > 0;
  const popping = step?.op === "pop" && prev.length > 0;

  // Per-level state must travel through render3D's context: update() used to read the
  // painter-local cur/prev/pushing/popping, which the build closure captures on frame 0,
  // so the 3D stack was frozen at its first depth for the whole scene.
  const levelStates = Array.from({ length: maxDepth }, (_, level) => {
    let present = false;
    let top = false;
    let liftPx = 0;
    let scale = 1;
    let alpha = 1;
    if (level < cur.length) {
      present = true;
      if (level === cur.length - 1) {
        top = true;
        if (pushing) {
          const pop = easeOutCubic(clamp01(t * 1.5));
          scale = Math.max(0.001, pop);
          liftPx = (1 - pop) * rowH * PUSH_DROP_ROWS;
        }
      }
    } else if (popping && level === prev.length - 1) {
      present = true;
      const fly = easeOutCubic(clamp01(t * 2));
      liftPx = fly * rowH * POP_FLY_ROWS;
      scale = Math.max(0.001, 1 - fly);
      alpha = 1 - fly;
    }
    return { present, top, liftPx, scale, alpha };
  });
  type LevelState = (typeof levelStates)[number];

  const build = (): ThreeBundle<{ levels: LevelState[] }> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, CAM_DIST);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, FRAME_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });
    const idleFace = shade(THEME.panel, FRAME_FACE_LIFT);

    const models = Array.from({ length: maxDepth }, () => {
      const g = makeBlock(frameW / m.sx, rowH / m.sy, FRAME_DEPTH, idleFace, THEME.textDim);
      s.add(g);
      return g;
    });

    const update = (_elapsedMs: number, data: { levels: LevelState[] }) => {
      const gIn = easeOutCubic(enterT(env, 600));
      models.forEach((mesh, level) => {
        const st = data.levels[level];
        mesh.visible = !!st?.present && gIn > 0;
        if (!st?.present) return;

        const box = rowRect(level);
        const c = toWorld(box.x + box.w / 2, box.y + box.h / 2 - st.liftPx);
        mesh.position.set(c.x, c.y, 0);
        mesh.scale.set(st.scale, st.scale, 1);

        mesh.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (!mat) return;
          mat.transparent = true;
          mat.opacity = gIn * st.alpha * (o instanceof THREE.LineSegments ? EDGE_ALPHA : 0.95);
          if (!(o instanceof THREE.Mesh)) return;
          const pm = mat as THREE.MeshPhysicalMaterial;
          // accentSoft is an rgba() string; setStyle drops the alpha and paints full accent.
          const face = st.top ? accent : idleFace;
          pm.color.setStyle(face);
          pm.emissive.setStyle(face);
          pm.emissiveIntensity = st.top ? TOP_EMISSIVE : IDLE_EMISSIVE;
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { levels: levelStates }, env);
  if (!cam) return;

  /** Centre of level `level`'s row — the same pixel rect the slab was mapped onto. */
  const get2D = (level: number) => {
    const box = rowRect(level);
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 - (levelStates[level]?.liftPx ?? 0) };
  };

  ctx.save();
  ctx.globalAlpha = frameIn;
  ctx.fillStyle = accent;
  ctx.fillRect(fx - unit * 0.4, baseY, (frameW + unit * 0.8) * frameIn, unit * 0.12);
  ctx.font = `500 ${unit * 0.55}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.textFaint;
  ctx.fillText("stack", fx + frameW + unit * 0.7, baseY + unit * 0.2);
  ctx.restore();

  const labelPx = Math.min(unit * 0.82, rowH * LABEL_H_FRAC);
  const drawFrameText = (frame: Frame, level: number, alphaMul: number, isTop: boolean) => {
    ctx.save();
    const p = get2D(level);

    // Match the slab's push/pop scale about the same centre, or the label overhangs a
    // slab that has not finished growing.
    const rowScale = levelStates[level]?.scale ?? 1;
    ctx.translate(p.x, p.y);
    ctx.scale(rowScale, rowScale);
    ctx.translate(-p.x, -p.y);
    ctx.globalAlpha = alphaMul;
    if (isTop) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.35 + 0.5 * idle(env, 3800));
    }
    
    // We only draw the text and left accent bar on top of the 3D block
    const textW = frameW * 0.8;
    const textX = p.x - textW / 2;
    const textY = p.y;
    
    ctx.fillStyle = accentSoft;
    ctx.fillRect(textX - unit * 0.8, textY - rowH * 0.34, unit * 0.18, rowH * 0.68);
    ctx.shadowBlur = 0;

    const px = fitFontSize(ctx, frame.label, {
      maxW: textW * (frame.note && !vertical ? 0.52 : 0.82),
      startPx: labelPx,
      minPx: Math.min(unit * 0.75, labelPx),
      weight: 700,
      family: FONT_MONO,
    });
    ctx.font = `700 ${px}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(frame.label, textX - unit * 0.4, textY + px * 0.35);

    if (frame.note) {
      ctx.font = `italic 400 ${px * 0.8}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      if (vertical) {
        ctx.textAlign = "right";
        ctx.fillText(frame.note, textX + textW + unit * 0.6, textY + px * 0.35);
      } else {
        const lw = ctx.measureText(frame.label).width;
        ctx.fillText(frame.note, textX + lw + unit * 0.6, textY + px * 0.35);
      }
    }
    ctx.restore();
  };

  const railX = fx - unit * (vertical ? 1.1 : 1.5);
  ctx.save();
  ctx.globalAlpha = frameIn;
  for (let l = 1; l <= maxDepth; l++) {
    const p = get2D(l - 1);
    const ty = p.y;
    const isCurrent = l === cur.length;
    const isMax = l === maxDepth;
    ctx.strokeStyle = isCurrent ? accent : isMax ? rgba(THEME.warn, 0.4) : THEME.textFaint;
    ctx.lineWidth = isCurrent ? unit * 0.12 : unit * 0.06;
    ctx.beginPath();
    ctx.moveTo(railX - (isCurrent ? unit * 0.32 : unit * 0.2), ty);
    ctx.lineTo(railX + (isCurrent ? unit * 0.32 : unit * 0.2), ty);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < cur.length; i++) {
    const isTop = i === cur.length - 1;
    let alpha = 1;
    if (pushing && isTop) alpha = easeOutCubic(clamp01(t * 1.5));
    drawFrameText(cur[i], i, alpha * frameIn, isTop);
  }
  if (popping && prev.length > 0) {
    const topLevel = prev.length - 1;
    const alpha = 1 - easeOutCubic(clamp01(t * 2));
    if (alpha > 0.01) {
      // Add fake fly offset for 2D text
      ctx.save();
      // The 3D slab already carries the fly-up through liftPx; the 2D row reads the
      // same offset in get2D, so no extra translate.
      drawFrameText(prev[topLevel], topLevel, alpha * frameIn, true);
      ctx.restore();
    }
  }
}

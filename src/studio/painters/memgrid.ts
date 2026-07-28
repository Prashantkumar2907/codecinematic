import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_MONO,
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
  rgba, shade,} from "./common";
import type { PaintEnv } from "./index";

type MemgridScene = Extract<Scene, { kind: "memgrid" }>;

/** Replay steps 0..k: current value per cell plus which step last wrote/freed it. */
function stateAt(scene: MemgridScene, k: number): { values: (string | undefined)[]; wroteAt: number[]; freedAt: number[] } {
  const values = scene.cells.map((c) => c.value);
  const wroteAt = scene.cells.map(() => -1);
  const freedAt = scene.cells.map(() => -1);
  const last = Math.min(k, scene.steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const step = scene.steps[i];
    for (const w of step.write)
      if (w.index < values.length) {
        values[w.index] = w.value;
        wroteAt[w.index] = i;
      }
    for (const f of step.free)
      if (f < values.length) {
        values[f] = undefined;
        freedAt[f] = i;
      }
  }
  return { values, wroteAt, freedAt };
}

const CAM_DIST = 9;
const CELL_DEPTH = 0.5;
const CELL_GAP_UNITS = 0.6;
const CELL_MAX_H_UNITS = 5.0;
const CELL_LIFT_UNITS = 0.28;
const CELL_STAGGER_MS = 40;
/** Slab face, lifted off THEME.panel so the extrusion catches the studio lights. */
const CELL_FACE_LIFT = 0.16;
const IDLE_EMISSIVE = 0.06;
const OCCUPIED_EMISSIVE = 0.16;
const WRITE_EMISSIVE = 0.32;
/** makeBlock builds its edge wireframe at 0.6 opacity; keep that ratio when fading. */
const EDGE_ALPHA = 0.6;
/** Lowest usable baseline as a fraction of frame height (Shorts UI band on 9:16). */
const SAFE_BOTTOM_SHORT = 0.75;
const SAFE_BOTTOM_LONG = 0.94;

function pointerAt(scene: MemgridScene, k: number): { label: string; index: number } | null {
  let ptr: { label: string; index: number } | null = null;
  const last = Math.min(k, scene.steps.length - 1);
  for (let i = 0; i <= last; i++) if (scene.steps[i].pointer) ptr = scene.steps[i].pointer!;
  return ptr;
}

export function paintMemgrid(ctx: CanvasRenderingContext2D, scene: MemgridScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentSoft, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = Math.min(active - offset, scene.steps.length - 1);
  const t = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const key = scene.id + "-mg3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.35;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const n = scene.cells.length;
  const cols = vertical ? 2 : n <= 8 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols);
  
  // The pixel grid is authoritative and the slabs are mapped onto it. Positions used
  // to be world literals under a camera at (0,12,10): cells landed at wildly different
  // depths, so a "uniform" memory grid rendered as six different sizes, and the outer
  // columns hung off both frame edges.
  const areaBottom = Math.min(areaY + areaH, (vertical ? SAFE_BOTTOM_SHORT : SAFE_BOTTOM_LONG) * layout.h);
  const gridH = areaBottom - areaY;
  const gapPx = unit * CELL_GAP_UNITS;
  const cellW = (contentW - (cols - 1) * gapPx) / cols;
  const cellH = Math.min((gridH - (rows - 1) * gapPx) / rows, unit * CELL_MAX_H_UNITS);
  const gridTop = areaY + Math.max(0, (gridH - (rows * cellH + (rows - 1) * gapPx)) / 2);

  /** Pixel rect of cell i, including its active lift, so the slab and the 2D chrome
   *  on it move together. */
  const cellRect = (i: number, lift: number) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      x: contentX + col * (cellW + gapPx),
      y: gridTop + row * (cellH + gapPx) - lift,
      w: cellW,
      h: cellH,
    };
  };

  const rect = { x: contentX, y: areaY, w: contentW, h: gridH };

  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  const cur = stateAt(scene, activeStep);
  const prev = stateAt(scene, activeStep - 1);
  const step = activeStep >= 0 ? scene.steps[activeStep] : null;
  const writes = new Set(step ? step.write.map((w) => w.index) : []);
  const frees = new Set(step ? step.free : []);
  const highlights = new Set(step ? step.highlight : []);

  // Per-frame cell state. It has to travel through render3D's context argument: the
  // update() closure captures frame 0's `writes`/`cur`/`highlights`, so reading them
  // directly froze every slab's colour at the first frame.
  const cellStates = scene.cells.map((_, i) => {
    const writing = writes.has(i);
    const freeing = frees.has(i);
    const value = cur.values[i];
    return {
      appear: easeOutCubic(enterT(env, 320, 120 + i * CELL_STAGGER_MS)),
      writing,
      freeing,
      occupied: value !== undefined || writing || (freeing && prev.values[i] !== undefined),
      lift: highlights.has(i) || writing ? unit * CELL_LIFT_UNITS : 0,
    };
  });
  type CellState = (typeof cellStates)[number];

  const build = (): ThreeBundle<{ cells: CellState[] }> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 42 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, CAM_DIST);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, CELL_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });
    const idleFace = shade(THEME.panel, CELL_FACE_LIFT);

    const models = scene.cells.map(() => {
      const g = makeBlock(cellW / m.sx, cellH / m.sy, CELL_DEPTH, idleFace, accent);
      s.add(g);
      return g;
    });

    const update = (_elapsedMs: number, data: { cells: CellState[] }) => {
      models.forEach((mesh, i) => {
        const st = data.cells[i];
        mesh.visible = !!st && st.appear > 0.01;
        if (!st || !mesh.visible) return;

        const box = cellRect(i, st.lift);
        const c = toWorld(box.x + box.w / 2, box.y + box.h / 2);
        mesh.position.set(c.x, c.y, 0);

        mesh.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (!mat) return;
          mat.transparent = true;
          mat.opacity = st.appear * (o instanceof THREE.LineSegments ? EDGE_ALPHA : 1);
          if (!(o instanceof THREE.Mesh)) return;
          const pm = mat as THREE.MeshPhysicalMaterial;
          // accentSoft/secondary here used to be handed to setStyle as rgba() strings,
          // which drops the alpha and renders the colour at full strength.
          const face = st.writing ? accent : st.occupied ? secondary : idleFace;
          pm.color.setStyle(face);
          pm.emissive.setStyle(face);
          pm.emissiveIntensity = st.writing ? WRITE_EMISSIVE : st.occupied ? OCCUPIED_EMISSIVE : IDLE_EMISSIVE;
        });
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { cells: cellStates }, env);
  if (!cam) return;

  const longestVal = [...scene.cells.map((c) => c.value ?? ""), ...scene.steps.flatMap((s) => s.write.map((w) => w.value))].reduce(
    (a, b) => (b.length > a.length ? b : a),
    "0"
  );
  
  const cell2DW = cellW;
  const cell2DH = cellH;
  
  const vpx = fitFontSize(ctx, longestVal, {
    maxW: cell2DW * 0.72,
    startPx: Math.max(cell2DH * 0.52, unit * 0.75),
    minPx: Math.min(unit * 0.75, cell2DH * 0.55),
    weight: 700,
    family: FONT_MONO,
  });

  for (let i = 0; i < n; i++) {
    const st = cellStates[i];
    const appear = st.appear;
    if (appear <= 0) continue;

    const writing = st.writing;
    const freeing = st.freeing;
    const value = cur.values[i];

    // Same rect the slab was mapped onto — no projection round-trip.
    const box = cellRect(i, st.lift);
    const x = box.x;
    const y = box.y;

    ctx.save();
    ctx.globalAlpha = appear;

    if (highlights.has(i) || (writing && t < 0.6)) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
      // Draw glow behind text
      roundRect(ctx, x + cell2DW * 0.1, y + cell2DH * 0.1, cell2DW * 0.8, cell2DH * 0.8, unit * 0.3);
      ctx.fillStyle = rgba(THEME.bgBottom, 0.4);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (freeing && t < 0.15) {
      ctx.save();
      ctx.globalAlpha = appear * (1 - t / 0.15);
      roundRect(ctx, x, y, cell2DW, cell2DH, unit * 0.3);
      ctx.fillStyle = rgba(THEME.warn, 0.25);
      ctx.fill();
      ctx.restore();
    }

    ctx.font = `500 ${unit * 0.48}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.textFaint;
    // Address in top-left
    ctx.fillText(scene.cells[i].addr, x + unit * 0.4, y + unit * 0.6);

    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2 + vpx * 0.2;
    ctx.textAlign = "center";
    ctx.font = `700 ${vpx}px ${FONT_MONO}`;
    if (writing) {
      if (t < 0.3) {
        if (Math.floor(env.elapsedMs / 230) % 2 === 0) {
          ctx.fillStyle = accent;
          ctx.fillRect(cx - vpx * 0.45, cy, vpx * 0.9, unit * 0.09);
        }
      } else {
        const pop = easeOutBack(clamp01((t - 0.3) / 0.28));
        ctx.save();
        ctx.globalAlpha = appear * clamp01((t - 0.3) * 4);
        ctx.translate(cx, cy - vpx * 0.35);
        ctx.scale(pop, pop);
        ctx.fillStyle = THEME.text;
        ctx.fillText(value ?? "", 0, vpx * 0.35);
        ctx.restore();
      }
    } else if (freeing) {
      const out = clamp01(t * 1.4);
      ctx.save();
      ctx.globalAlpha = appear * (1 - out);
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(prev.values[i] ?? "", cx, cy + easeOutCubic(out) * unit * 0.45);
      ctx.restore();
    } else if (value !== undefined) {
      ctx.fillStyle = THEME.text;
      ctx.fillText(value, cx, cy);
    } else {
      ctx.fillStyle = THEME.textFaint;
      ctx.fillText("·", cx, cy);
    }
    ctx.textAlign = "start";
    ctx.restore();
  }

  const curPtr = pointerAt(scene, activeStep);
  if (curPtr) {
    const prevPtr = pointerAt(scene, activeStep - 1);
    const target = Math.min(curPtr.index, n - 1);
    const from = prevPtr ? Math.min(prevPtr.index, n - 1) : target;
    const isFresh = !prevPtr && !!step?.pointer;
    const moved = step?.pointer !== undefined && from !== target;
    const g = moved ? easeInOutCubic(clamp01(t / 0.4)) : 1;
    const anchor = (i: number) => {
      const b = cellRect(i, cellStates[i]?.lift ?? 0);
      // Inside the bottom of its own cell: the row gap is under an eighth of a cell,
      // so a pin hung below one landed on the next row's address label.
      return { x: b.x + b.w / 2, y: b.y + b.h - unit * 0.75 };
    };
    const a0 = anchor(from);
    const a1 = anchor(target);
    const bob = (idle(env, 3100) - 0.5) * unit * 0.12;
    const cx = a0.x + (a1.x - a0.x) * g;
    const ny = a0.y + (a1.y - a0.y) * g + bob;
    const pop = isFresh ? easeOutBack(clamp01(t * 2.5)) : 1;

    ctx.save();
    ctx.globalAlpha = isFresh ? clamp01(t * 3) : 1;
    ctx.translate(cx, ny);
    ctx.scale(pop, pop);
    ctx.translate(-cx, -ny);
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.5;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(cx, ny - unit * 0.26);
    ctx.lineTo(cx - unit * 0.26, ny);
    ctx.lineTo(cx + unit * 0.26, ny);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 ${unit * 0.58}px ${FONT_MONO}`;
    const tw = ctx.measureText(curPtr.label).width;
    roundRect(ctx, cx - tw / 2 - unit * 0.35, ny - unit * 0.04, tw + unit * 0.7, unit * 0.92, unit * 0.26);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = THEME.bgBottom;
    ctx.textAlign = "center";
    ctx.fillText(curPtr.label, cx, ny + unit * 0.58);
    ctx.restore();
  }
  ctx.textAlign = "start";
}

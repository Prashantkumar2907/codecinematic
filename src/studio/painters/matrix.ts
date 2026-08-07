import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  shade,
  clamp01,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
} from "./common";
import type { PaintEnv } from "./index";

type MatrixScene = Extract<Scene, { kind: "matrix" }>;
type Tone = "accent" | "good" | "warn" | "dim";
type CellState = { value?: string; tone: Tone; setStep: number; setIdx: number; setN: number };
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };
type Ctx = { activeStep: number; stepBeatT: number };

const GAP_UNIT = 0.3;
const MAX_CELL_UNIT = 3.2;
const DEPTH = 0.2;
const IDLE_FACE = shade(THEME.panel, 0.09);

export function paintMatrix(ctx: CanvasRenderingContext2D, scene: MatrixScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const key = scene.id + "-mat3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;

  const { rows, cols } = scene;
  const hasRowLabels = scene.rowLabels.length > 0;
  const hasColLabels = scene.colLabels.length > 0;
  const gutterL = hasRowLabels ? unit * 2.2 : 0;
  const gutterT = hasColLabels ? unit * 1.4 : 0;
  const availW = contentW - gutterL;
  const bottom = vertical ? Math.min(contentY + contentH, layout.h * 0.86) : contentY + contentH;
  const availH = bottom - contentY - band - gutterT;

  const gridX = contentX + gutterL;
  const gridY = contentY + band + gutterT;
  const rect = { x: gridX, y: gridY, w: availW, h: availH };

  /**
   * `qa/ledger.json` -> systemic `2d-layout-round-tripped-through-camera`: cells
   * were sized from a fixed world spread (4.5-5.5 units) under an on-axis camera,
   * while the 2D text was fitted to an INDEPENDENTLY computed pixel size
   * (`contentW/cols*0.8`) that had no relation to the actual projected cell —
   * on a 16:9 frame the real cell projected smaller than that assumption, so
   * the value text ran past its own cell's bottom edge. The grid is now laid
   * out in pixels first and blocks are mapped onto it via `mappingAt`/`toWorld`
   * (same technique as `table.ts`), so the 2D text is always sized to the cell
   * that's actually on screen.
   */
  const gap = unit * GAP_UNIT;
  const cellW = availW / cols;
  const cellH = Math.min(availH / rows, unit * MAX_CELL_UNIT);
  const gridTop = gridY + Math.max(0, (availH - cellH * rows) / 2);
  const cellRect = (c: number, r: number): Rect => {
    const x = gridX + c * cellW + gap / 2;
    const y = gridTop + r * cellH + gap / 2;
    const w = cellW - gap;
    const h = cellH - gap;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  };

  const state = new Map<string, CellState>();
  for (let k = 0; k <= activeStep; k++) {
    const sets = scene.steps[k].set;
    sets.forEach((s, i) => {
      state.set(`${s.r},${s.c}`, { value: s.value, tone: s.tone, setStep: k, setIdx: i, setN: Math.max(sets.length, 1) });
    });
  }
  const stepBeatT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const sweep = activeStep >= 0 ? scene.steps[activeStep].sweep : undefined;

  /** Pixels-per-world-unit and pixel origin on the z=`z` plane, for a camera
   *  sitting ON-AXIS at (0,0,D) — exact, invertible pixel<->world map (same
   *  technique as `table.ts`/`circuit.ts`/`diagram.ts`). */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  const build = (): ThreeBundle<Ctx> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, vertical ? 16 : 14);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

    const models: { mesh: THREE.Group, r: number, c: number, base: THREE.Vector3 }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cr = cellRect(c, r);
        const g = makeBlock(1, 1, 1, IDLE_FACE, THEME.textDim);
        const base = new THREE.Vector3(cr.w / m.sx, cr.h / m.sy, DEPTH);
        g.scale.copy(base);
        const w = toWorld(cr.cx, cr.cy);
        g.position.set(w.x, w.y, 0);
        s.add(g);
        models.push({ mesh: g, r, c, base });
      }
    }

    const update = (_elapsedMs: number, data?: Ctx) => {
      const stepNow = data?.activeStep ?? -1;
      const beatTNow = data?.stepBeatT ?? 0;
      models.forEach(({ mesh, r, c, base }) => {
        const st = state.get(`${r},${c}`);
        if (!st) {
          const ghostIn = enterT(env, 260, 80 + (r + c) * 30);
          mesh.scale.copy(base).multiplyScalar(Math.max(0.001, 0.9 * easeOutCubic(ghostIn)));
          mesh.visible = ghostIn > 0;
          mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshPhysicalMaterial;
              mat.transparent = true;
              mat.opacity = 0.2;
              mat.color.setStyle(IDLE_FACE);
              mat.emissive.setStyle(IDLE_FACE);
            }
          });
          return;
        }

        const isActiveSet = st.setStep === stepNow;
        const startAt = (st.setIdx / st.setN) * 0.4;
        const local = isActiveSet ? clamp01((beatTNow - startAt) / 0.4) : 1;

        if (local <= 0) {
          mesh.scale.copy(base).multiplyScalar(0.9);
          mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshPhysicalMaterial;
              mat.transparent = true;
              mat.opacity = 0.2;
              mat.color.setStyle(IDLE_FACE);
              mat.emissive.setStyle(IDLE_FACE);
            }
          });
          return;
        }

        const appear = easeOutCubic(local);
        const pop = isActiveSet ? easeOutBack(local) : 1;
        mesh.scale.copy(base).multiplyScalar(Math.max(0.001, pop));

        mesh.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshPhysicalMaterial;
            mat.transparent = true;
            mat.opacity = appear * 0.95;
            if (st.tone === "good") {
              mat.color.setStyle(THEME.good);
              mat.emissive.setStyle(THEME.good);
            } else if (st.tone === "warn") {
              mat.color.setStyle(THEME.warn);
              mat.emissive.setStyle(THEME.warn);
            } else if (st.tone === "dim") {
              mat.color.setStyle(IDLE_FACE);
              mat.emissive.setStyle(IDLE_FACE);
            } else {
              mat.color.setStyle(accent);
              mat.emissive.setStyle(accent);
            }
          }
        });
      });
    };
    return { scene: s, camera, update };
  };

  render3D(ctx, key, rect, build, env.elapsedMs, { activeStep, stepBeatT }, env);

  // Labels
  if (hasColLabels || hasRowLabels) {
    ctx.save();
    ctx.globalAlpha = introIn * 0.85;
    ctx.fillStyle = THEME.textDim;
    ctx.font = `600 ${unit * 0.6}px ${FONT_MONO}`;

    if (hasColLabels) {
        ctx.textAlign = "center";
        scene.colLabels.slice(0, cols).forEach((lbl, c) => {
            const cr = cellRect(c, 0);
            ctx.fillText(lbl, cr.cx, cr.y - unit * 0.5);
        });
    }
    if (hasRowLabels) {
        ctx.textAlign = "end";
        scene.rowLabels.slice(0, rows).forEach((lbl, r) => {
            const cr = cellRect(0, r);
            ctx.fillText(lbl, cr.x - unit * 0.5, cr.cy + unit * 0.22);
        });
    }
    ctx.textAlign = "start";
    ctx.restore();
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const st = state.get(`${r},${c}`);
      if (!st) continue;

      const isActiveSet = st.setStep === activeStep;
      const startAt = (st.setIdx / st.setN) * 0.4;
      const local = isActiveSet ? clamp01((stepBeatT - startAt) / 0.4) : 1;
      if (local <= 0) continue;

      const appear = easeOutCubic(local);
      if (st.value != null && st.value !== "") {
        const cr = cellRect(c, r);
        const pop = isActiveSet ? easeOutBack(local) : 1;
        const fontPx = fitFontSize(ctx, st.value, {
          maxW: cr.w * 0.82,
          startPx: cr.h * 0.5,
          minPx: Math.min(unit * 0.75, cr.h * 0.45),
          weight: 800,
          family: FONT_MONO,
        });
        ctx.save();
        ctx.font = `800 ${fontPx * pop}px ${FONT_MONO}`;
        ctx.fillStyle = st.tone === "dim" ? THEME.textDim : THEME.text;
        ctx.globalAlpha = appear * introIn;
        ctx.textAlign = "center";
        ctx.fillText(st.value, cr.cx, cr.cy + fontPx * 0.34);
        ctx.restore();
      }
    }
  }

  // Sweep (2D overlay)
  if (sweep) {
    const t = easeInOutCubic(clamp01(stepBeatT));
    ctx.save();
    ctx.lineCap = "round";
    const grid2DX = gridX;
    const grid2DY = gridTop;
    const grid2DW = cellW * cols;
    const grid2DH = cellH * rows;

    if (sweep.kind === "row" && sweep.index < rows) {
      const y = gridTop + sweep.index * cellH;
      const x = grid2DX + t * grid2DW;
      ctx.globalAlpha = 0.1 * introIn;
      ctx.fillStyle = accent;
      ctx.fillRect(grid2DX, y, Math.max(0, x - grid2DX), cellH);
      ctx.globalAlpha = introIn;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.12;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + cellH);
      ctx.stroke();
    } else if (sweep.kind === "col" && sweep.index < cols) {
      const x = gridX + sweep.index * cellW;
      const y = grid2DY + t * grid2DH;
      ctx.globalAlpha = 0.1 * introIn;
      ctx.fillStyle = accent;
      ctx.fillRect(x, grid2DY, cellW, Math.max(0, y - grid2DY));
      ctx.globalAlpha = introIn;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.12;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + cellW, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.textAlign = "start";
}

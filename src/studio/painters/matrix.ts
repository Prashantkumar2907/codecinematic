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
  idle,
  clamp01,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  rgba,
  type Palette,
} from "./common";
import type { PaintEnv } from "./index";

type MatrixScene = Extract<Scene, { kind: "matrix" }>;
type Tone = "accent" | "good" | "warn" | "dim";
type CellState = { value?: string; tone: Tone; setStep: number; setIdx: number; setN: number };

const GAP_UNIT = 0.3;
const MAX_CELL_UNIT = 3.2;

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
  const gap = unit * GAP_UNIT;
  const availW = contentW - gutterL;
  const bottom = vertical ? Math.min(contentY + contentH, layout.h * 0.86) : contentY + contentH;
  const availH = bottom - contentY - band - gutterT;
  
  const rect = { x: contentX + gutterL, y: contentY + band + gutterT, w: availW, h: availH };

  const spreadX = vertical ? 4.5 : 5.5;
  const spreadY = vertical ? 5.5 : 4.5;
  
  const worldPos = (c: number, r: number) => {
    const x = cols === 1 ? 0 : (c / (cols - 1) - 0.5) * spreadX * 2;
    const y = rows === 1 ? 0 : (0.5 - r / (rows - 1)) * spreadY * 2;
    return new THREE.Vector3(x, y, 0);
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

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, 0, vertical ? 16 : 14);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);
    
    const blockW = (spreadX * 2.0) / cols;
    const blockH = (spreadY * 2.0) / rows;

    const models: { mesh: THREE.Group, r: number, c: number }[] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const g = makeBlock(blockW, blockH, 0.2, "#1e293b", "#31435a");
            g.position.copy(worldPos(c, r));
            s.add(g);
            models.push({ mesh: g, r, c });
        }
    }

    const update = (elapsedMs: number) => {
      models.forEach(({ mesh, r, c }) => {
        const st = state.get(`${r},${c}`);
        if (!st) {
            const ghostIn = enterT(env, 260, 80 + (r + c) * 30);
            mesh.scale.setScalar(Math.max(0.001, 0.9 * easeOutCubic(ghostIn)));
            mesh.visible = ghostIn > 0;
            mesh.position.z = -0.2;
            mesh.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    const mat = child.material as THREE.MeshPhysicalMaterial;
                    mat.transparent = true;
                    mat.opacity = 0.2;
                    mat.color.setStyle("#1e293b");
                    mat.emissive.setStyle("#1e293b");
                }
            });
            return;
        }

        const isActiveSet = st.setStep === activeStep;
        const startAt = (st.setIdx / st.setN) * 0.4;
        const local = isActiveSet ? clamp01((stepBeatT - startAt) / 0.4) : 1;
        
        if (local <= 0) {
            mesh.scale.setScalar(0.9);
            mesh.position.z = -0.2;
            mesh.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    const mat = child.material as THREE.MeshPhysicalMaterial;
                    mat.transparent = true;
                    mat.opacity = 0.2;
                    mat.color.setStyle("#1e293b");
                    mat.emissive.setStyle("#1e293b");
                }
            });
            return;
        }

        const appear = easeOutCubic(local);
        const pop = isActiveSet ? easeOutBack(local) : 1;
        mesh.scale.setScalar(Math.max(0.001, pop));
        mesh.position.z = isActiveSet ? 0.3 * (1 - local) : 0;
        
        // Coloring based on tone
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
                    mat.color.setStyle("#1e293b");
                    mat.emissive.setStyle("#1e293b");
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

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return;

  const get2D = (c: number, r: number) => projectToRect(cam, worldPos(c, r), rect);
  
  // Cell bounds approximation
  const blockW2D = contentW / cols * 0.8;
  const blockH2D = availH / rows * 0.8;

  // Labels
  if (hasColLabels || hasRowLabels) {
    ctx.save();
    ctx.globalAlpha = introIn * 0.85;
    ctx.fillStyle = THEME.textDim;
    ctx.font = `600 ${unit * 0.6}px ${FONT_MONO}`;
    
    if (hasColLabels) {
        ctx.textAlign = "center";
        scene.colLabels.slice(0, cols).forEach((lbl, c) => {
            const p = get2D(c, 0);
            ctx.fillText(lbl, p.x, p.y - blockH2D / 2 - unit * 0.5);
        });
    }
    if (hasRowLabels) {
        ctx.textAlign = "end";
        scene.rowLabels.slice(0, rows).forEach((lbl, r) => {
            const p = get2D(0, r);
            ctx.fillText(lbl, p.x - blockW2D / 2 - unit * 0.5, p.y + unit * 0.22);
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
        const pop = isActiveSet ? easeOutBack(local) : 1;
        const fontPx = fitFontSize(ctx, st.value, {
          maxW: blockW2D * 0.82,
          startPx: blockH2D * 0.5,
          minPx: Math.min(unit * 0.75, blockH2D * 0.45),
          weight: 800,
          family: FONT_MONO,
        });
        const p = get2D(c, r);
        ctx.save();
        ctx.font = `800 ${fontPx * pop}px ${FONT_MONO}`;
        ctx.fillStyle = st.tone === "dim" ? THEME.textDim : THEME.text;
        ctx.globalAlpha = appear * introIn;
        ctx.textAlign = "center";
        ctx.fillText(st.value, p.x, p.y + fontPx * 0.34);
        ctx.restore();
      }
    }
  }

  // Sweep (2D overlay)
  if (sweep) {
    const t = easeInOutCubic(clamp01(stepBeatT));
    ctx.save();
    ctx.lineCap = "round";
    // We approximate the sweep rect based on get2D min/max
    const pTopLeft = get2D(0, 0);
    const pBotRight = get2D(cols - 1, rows - 1);
    const grid2DX = pTopLeft.x - blockW2D / 2;
    const grid2DY = pTopLeft.y - blockH2D / 2;
    const grid2DW = (pBotRight.x + blockW2D / 2) - grid2DX;
    const grid2DH = (pBotRight.y + blockH2D / 2) - grid2DY;
    
    if (sweep.kind === "row" && sweep.index < rows) {
      const pRow = get2D(0, sweep.index);
      const y = pRow.y - blockH2D / 2;
      const x = grid2DX + t * grid2DW;
      ctx.globalAlpha = 0.1 * introIn;
      ctx.fillStyle = accent;
      ctx.fillRect(grid2DX, y, Math.max(0, x - grid2DX), blockH2D);
      ctx.globalAlpha = introIn;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.12;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + blockH2D);
      ctx.stroke();
    } else if (sweep.kind === "col" && sweep.index < cols) {
      const pCol = get2D(sweep.index, 0);
      const x = pCol.x - blockW2D / 2;
      const y = grid2DY + t * grid2DH;
      ctx.globalAlpha = 0.1 * introIn;
      ctx.fillStyle = accent;
      ctx.fillRect(x, grid2DY, blockW2D, Math.max(0, y - grid2DY));
      ctx.globalAlpha = introIn;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.12;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + blockW2D, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.textAlign = "start";
}

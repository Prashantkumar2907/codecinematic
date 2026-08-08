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
  departT,
  applyElevation,
  clearShadow,
  roundRect,
  idle,
} from "./common";
import type { PaintEnv } from "./index";

type MatrixScene = Extract<Scene, { kind: "matrix" }>;
type Tone = "accent" | "good" | "warn" | "dim";
type CellState = { value?: string; tone: Tone; setStep: number; setIdx: number; setN: number };
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const GAP_UNIT = 0.3;
const MAX_CELL_UNIT = 3.2;
const IDLE_FACE = shade(THEME.panel, 0.09);

export function paintMatrix(ctx: CanvasRenderingContext2D, scene: MatrixScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const leave = departT(env, 380);
  if (leave <= 0) return;

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

  const toneColor = (tone: Tone): string =>
    tone === "good" ? THEME.good : tone === "warn" ? THEME.warn : tone === "dim" ? IDLE_FACE : accent;

  // Cells, drawn directly with the exact tone logic the removed three.js
  // material carried — ghost cells at low opacity, set cells popping in with
  // an easeOutBack scale and a tone-coloured fill.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cr = cellRect(c, r);
      const st = state.get(`${r},${c}`);

      ctx.save();
      if (!st) {
        const ghostIn = enterT(env, 260, 80 + (r + c) * 30);
        const scale = Math.max(0.001, 0.9 * easeOutCubic(ghostIn));
        if (ghostIn <= 0) {
          ctx.restore();
          continue;
        }
        ctx.globalAlpha = leave * 0.2;
        ctx.translate(cr.cx, cr.cy);
        ctx.scale(scale, scale);
        ctx.translate(-cr.cx, -cr.cy);
        roundRect(ctx, cr.x, cr.y, cr.w, cr.h, unit * 0.15);
        ctx.fillStyle = IDLE_FACE;
        ctx.fill();
        ctx.restore();
        continue;
      }

      const isActiveSet = st.setStep === activeStep;
      const startAt = (st.setIdx / st.setN) * 0.4;
      const local = isActiveSet ? clamp01((stepBeatT - startAt) / 0.4) : 1;

      if (local <= 0) {
        ctx.globalAlpha = leave * 0.2;
        ctx.translate(cr.cx, cr.cy);
        ctx.scale(0.9, 0.9);
        ctx.translate(-cr.cx, -cr.cy);
        roundRect(ctx, cr.x, cr.y, cr.w, cr.h, unit * 0.15);
        ctx.fillStyle = IDLE_FACE;
        ctx.fill();
        ctx.restore();
        continue;
      }

      const appear = easeOutCubic(local);
      const pop = isActiveSet ? easeOutBack(local) : 1;
      // The most-recently-set cell breathes — a static fill on the one cell the
      // narration is pointing at went still (54%) the moment its own pop settled.
      const isNewest = st.setStep === activeStep;
      const breathe = isNewest ? 0.85 + 0.3 * idle(env, 1800, (r + c) * 0.3) : 1;
      ctx.globalAlpha = leave * appear * 0.95;
      ctx.translate(cr.cx, cr.cy);
      ctx.scale(Math.max(0.001, pop), Math.max(0.001, pop));
      ctx.translate(-cr.cx, -cr.cy);
      applyElevation(ctx, unit, isActiveSet ? "floating" : "raised");
      if (isNewest) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.4 * breathe;
      }
      roundRect(ctx, cr.x, cr.y, cr.w, cr.h, unit * 0.15);
      ctx.fillStyle = toneColor(st.tone);
      ctx.globalAlpha *= breathe;
      ctx.fill();
      clearShadow(ctx);
      ctx.restore();
    }
  }

  // Labels
  if (hasColLabels || hasRowLabels) {
    ctx.save();
    ctx.globalAlpha = introIn * leave * 0.85;
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
        ctx.globalAlpha = appear * introIn * leave;
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
      ctx.globalAlpha = 0.1 * introIn * leave;
      ctx.fillStyle = accent;
      ctx.fillRect(grid2DX, y, Math.max(0, x - grid2DX), cellH);
      ctx.globalAlpha = introIn * leave;
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
      ctx.globalAlpha = 0.1 * introIn * leave;
      ctx.fillStyle = accent;
      ctx.fillRect(x, grid2DY, cellW, Math.max(0, y - grid2DY));
      ctx.globalAlpha = introIn * leave;
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

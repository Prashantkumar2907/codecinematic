import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  drawArrowhead,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type DpScene = Extract<Scene, { kind: "dp_table_fill" }>;

/** Which step first wrote a cell, and the value written. */
type Filled = { value: string; step: number; idxInStep: number; countInStep: number };

const MAX_CELL_UNIT = 3.0;

/**
 * A 2-D Dynamic-Programming table that fills cell by cell. Each beat writes its
 * cells (values popping in), highlights the "current" focus cell, and draws
 * animated dependency arrows from the cells that feed it (top/left for LCS,
 * diagonal for Edit Distance). Unfilled cells hold as dashed ghosts so the whole
 * table shape reads immediately. Works in 9:16 and 16:9 (the grid is centred and
 * cell size is fit to the available box).
 */
export function paintDpTableFill(ctx: CanvasRenderingContext2D, scene: DpScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;

  const { rows, cols } = scene;
  const hasRowLabels = scene.rowLabels.length > 0;
  const hasColLabels = scene.colLabels.length > 0;
  const gutterL = hasRowLabels ? unit * 2.0 : 0;
  const gutterT = hasColLabels ? unit * 1.4 : 0;
  const gap = unit * 0.28;
  const availW = contentW - gutterL;
  const bottom = vertical ? Math.min(contentY + contentH, layout.h * 0.9) : contentY + contentH;
  const availH = bottom - contentY - band - gutterT;
  const cell = Math.max(
    unit * 0.8,
    Math.min((availW - gap * (cols - 1)) / cols, (availH - gap * (rows - 1)) / rows, unit * MAX_CELL_UNIT)
  );
  const gridW = cols * cell + gap * (cols - 1);
  const gridH = rows * cell + gap * (rows - 1);
  const gridX = contentX + gutterL + Math.max(0, (availW - gridW) / 2);
  const gridY = contentY + band + gutterT + Math.max(0, (availH - gridH) / 2);
  const cellX = (c: number) => gridX + c * (cell + gap);
  const cellY = (r: number) => gridY + r * (cell + gap);
  const centre = (r: number, c: number) => ({ x: cellX(c) + cell / 2, y: cellY(r) + cell / 2 });
  const radius = cell * 0.14;

  // Replay writes; latest write for a cell wins.
  const state = new Map<string, Filled>();
  for (let k = 0; k <= activeStep; k++) {
    const cells = scene.steps[k].cells;
    cells.forEach((cellDef, i) => {
      if (cellDef.r < rows && cellDef.c < cols)
        state.set(`${cellDef.r},${cellDef.c}`, { value: cellDef.value, step: k, idxInStep: i, countInStep: Math.max(cells.length, 1) });
    });
  }

  const step = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const focus = step?.focus ?? (step ? step.cells[step.cells.length - 1] : undefined);

  // Column / row labels.
  if (hasColLabels || hasRowLabels) {
    ctx.save();
    ctx.globalAlpha = introIn * 0.9;
    ctx.fillStyle = THEME.textDim;
    ctx.font = `700 ${Math.min(unit * 0.7, cell * 0.42)}px ${FONT_MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    scene.colLabels.slice(0, cols).forEach((lbl, c) => ctx.fillText(lbl, cellX(c) + cell / 2, gridY - gutterT * 0.5));
    ctx.textAlign = "center";
    scene.rowLabels.slice(0, rows).forEach((lbl, r) => ctx.fillText(lbl, gridX - gutterL * 0.5, cellY(r) + cell / 2));
    ctx.restore();
  }

  const drawGhost = (r: number, c: number, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rgba(THEME.textDim, 0.9);
    ctx.lineWidth = unit * 0.05;
    ctx.setLineDash([unit * 0.26, unit * 0.22]);
    roundRect(ctx, cellX(c), cellY(r), cell, cell, radius);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  // Cells.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const st = state.get(`${r},${c}`);
      if (!st) {
        const ghostIn = enterT(env, 260, 80 + (r + c) * 26);
        if (ghostIn > 0) drawGhost(r, c, 0.12 * introIn * easeOutCubic(ghostIn));
        continue;
      }
      const isActiveWrite = st.step === activeStep;
      const startAt = (st.idxInStep / st.countInStep) * 0.45;
      const local = isActiveWrite ? clamp01((stepT - startAt) / 0.45) : 1;
      if (local <= 0) {
        drawGhost(r, c, 0.12 * introIn);
        continue;
      }
      const isFocus = !!focus && focus.r === r && focus.c === c;
      const appear = easeOutCubic(local);
      const x = cellX(c);
      const y = cellY(r);
      const { x: cx, y: cy } = centre(r, c);
      const breathe = isFocus ? 0.75 + 0.25 * idle(env, 1600) : 1;

      ctx.save();
      ctx.globalAlpha = appear * introIn;
      if (isActiveWrite && local < 1) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.8;
      }
      roundRect(ctx, x, y, cell, cell, radius);
      ctx.fillStyle = isFocus ? rgba(accent, 0.2) : rgba(accent, 0.1);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (isActiveWrite && local < 1) {
        roundRect(ctx, x, y, cell, cell, radius);
        ctx.globalAlpha = appear * introIn * (1 - local);
        ctx.fillStyle = rgba(accent, 0.34);
        ctx.fill();
        ctx.globalAlpha = appear * introIn;
      }
      roundRect(ctx, x, y, cell, cell, radius);
      ctx.strokeStyle = isFocus ? accent : rgba(accent, 0.55);
      ctx.globalAlpha = appear * introIn * breathe;
      ctx.lineWidth = unit * (isFocus ? 0.12 : 0.07);
      ctx.stroke();

      const pop = isActiveWrite ? easeOutBack(local) : 1;
      const fontPx = fitFontSize(ctx, st.value, {
        maxW: cell * 0.82,
        startPx: cell * 0.5,
        minPx: Math.min(unit * 0.7, cell * 0.42),
        weight: 800,
        family: FONT_MONO,
      });
      ctx.font = `800 ${fontPx * pop}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.text;
      ctx.globalAlpha = appear * introIn;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(st.value, cx, cy);
      ctx.restore();
    }
  }

  // Dependency arrows from each dep cell into the focus cell.
  if (step && focus && step.deps.length && focus.r < rows && focus.c < cols) {
    const drawT = easeOutCubic(clamp01((stepT - 0.15) / 0.55));
    const tgt = centre(focus.r, focus.c);
    ctx.save();
    step.deps.forEach((d, i) => {
      if (d.r >= rows || d.c >= cols) return;
      const src = centre(d.r, d.c);
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      // Trim to cell edges so the arrow sits between cells, not over glyphs.
      const trim = cell * 0.52;
      const a = { x: src.x + ux * trim, y: src.y + uy * trim };
      const b = { x: tgt.x - ux * trim, y: tgt.y - uy * trim };
      const local = clamp01((drawT - i * 0.08) / 0.6);
      if (local <= 0) return;
      const tip = { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
      ctx.globalAlpha = introIn * (0.55 + 0.45 * local);
      ctx.strokeStyle = secondary;
      ctx.lineWidth = unit * 0.09;
      ctx.lineCap = "round";
      ctx.shadowColor = rgba(secondary, 0.5);
      ctx.shadowBlur = unit * 0.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (local > 0.85) {
        ctx.fillStyle = secondary;
        drawArrowhead(ctx, b.x, b.y, Math.atan2(uy, ux), unit * 0.34);
      }
    });
    ctx.restore();
  }

  // Focus ring pulse.
  if (focus && focus.r < rows && focus.c < cols && stepT > 0.05) {
    const { x, y } = centre(focus.r, focus.c);
    const pr = (env.elapsedMs % 1600) / 1600;
    ctx.save();
    ctx.globalAlpha = introIn * (1 - pr) * 0.6;
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.08;
    roundRect(ctx, x - cell / 2 - pr * cell * 0.3, y - cell / 2 - pr * cell * 0.3, cell + pr * cell * 0.6, cell + pr * cell * 0.6, radius);
    ctx.stroke();
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

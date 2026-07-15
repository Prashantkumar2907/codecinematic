import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, FONT_MONO, easeOutCubic, sub, clamp01, wrapText, roundRect, drawSceneTitle, beatT, activeBeatIndex, rgba } from "./common";
import type { PaintEnv } from "./index";

type TableScene = Extract<Scene, { kind: "table" }>;

/**
 * Data table: the header appears with the title, then each row slides in on its
 * own beat (SQL result sets, JOINs, WHERE filters, side-by-side data). The
 * active row glows; rows flagged `highlight` keep an accent tint; `highlightCol`
 * tints one column throughout (e.g. the key/join column).
 */
export function paintTable(ctx: CanvasRenderingContext2D, scene: TableScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, accentSoft } = env.palette;
  const offset = introBeatCount(scene);
  const nRows = scene.rows.length;
  const totalBeats = offset + nRows;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env.p, accent) + unit * 0.4;
  const nCols = scene.columns.length;

  // Row heights: header a touch taller; whole block sized to content then
  // centered in the area below the title (never overflows the frame).
  const availTop = contentY + band;
  const availH = contentH - band - (scene.caption ? unit * 1.6 : 0);
  const rowH = Math.min((availH) / (nRows + 1.25), unit * (vertical ? 2.6 : 2.2));
  const headH = rowH * 1.15;
  const tableH = headH + nRows * rowH;
  const tableW = contentW;
  const tx = contentX;
  const ty = availTop + Math.max(0, (availH - tableH) / 2);
  const colW = tableW / nCols;

  const frameIn = easeOutCubic(sub(env.p, 0, 0.12));

  // Container.
  ctx.save();
  ctx.globalAlpha = frameIn;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = unit * 0.6;
  ctx.shadowOffsetY = 5;
  roundRect(ctx, tx, ty, tableW, tableH, unit * 0.5);
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();

  // Highlighted column tint (drawn under rows, above panel).
  if (scene.highlightCol !== undefined && scene.highlightCol < nCols) {
    ctx.save();
    ctx.globalAlpha = frameIn * 0.5;
    roundRect(ctx, tx + scene.highlightCol * colW, ty, colW, tableH, unit * 0.2);
    ctx.fillStyle = accentSoft;
    ctx.fill();
    ctx.restore();
  }

  const cellFont = (px: number) => `${px}px ${FONT_MONO}`;
  const fitCell = (text: string, maxW: number, startPx: number) => {
    let px = startPx;
    ctx.font = cellFont(px);
    while (ctx.measureText(text).width > maxW && px > unit * 0.55) {
      px -= 1;
      ctx.font = cellFont(px);
    }
    return px;
  };
  const cellPad = unit * 0.5;
  const baseCellPx = unit * (vertical ? 0.82 : 0.78);

  // Header row.
  ctx.save();
  ctx.globalAlpha = frameIn;
  roundRect(ctx, tx, ty, tableW, headH, unit * 0.5);
  ctx.clip();
  ctx.fillStyle = rgba(accent, 0.16);
  ctx.fillRect(tx, ty, tableW, headH);
  ctx.restore();
  scene.columns.forEach((col, c) => {
    ctx.save();
    ctx.globalAlpha = frameIn;
    const px = fitCell(col, colW - cellPad * 2, baseCellPx);
    ctx.font = `700 ${px}px ${FONT_SANS}`;
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.fillText(col, tx + c * colW + colW / 2, ty + headH / 2 + px * 0.35);
    ctx.restore();
  });

  // Column separators.
  ctx.save();
  ctx.globalAlpha = frameIn * 0.5;
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1;
  for (let c = 1; c < nCols; c++) {
    ctx.beginPath();
    ctx.moveTo(tx + c * colW, ty);
    ctx.lineTo(tx + c * colW, ty + tableH);
    ctx.stroke();
  }
  ctx.restore();

  // Data rows — each reveals on its beat, active row glows.
  scene.rows.forEach((row, r) => {
    const beatIdx = offset + r;
    const t = beatT(env.beats, beatIdx, totalBeats, env.p);
    if (t <= 0) return;
    const appear = easeOutCubic(Math.min(1, t * 3));
    const isCurrent = active === beatIdx;
    const ry = ty + headH + r * rowH;

    ctx.save();
    ctx.globalAlpha = appear;
    ctx.translate((1 - appear) * unit * 1.2, 0);

    // Row background: highlight flag or current beat gets an accent wash.
    if (row.highlight || isCurrent) {
      ctx.fillStyle = isCurrent ? rgba(accent, 0.22) : rgba(accent, 0.12);
      if (isCurrent) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.5;
      }
      ctx.fillRect(tx, ry, tableW, rowH);
      ctx.shadowBlur = 0;
    }
    // Row separator.
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, ry);
    ctx.lineTo(tx + tableW, ry);
    ctx.stroke();

    row.cells.forEach((cell, c) => {
      const px = fitCell(cell, colW - cellPad * 2, baseCellPx);
      ctx.font = cellFont(px);
      ctx.fillStyle = row.highlight || isCurrent ? THEME.text : THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(cell, tx + c * colW + colW / 2, ry + rowH / 2 + px * 0.36);
    });
    ctx.restore();
  });

  // Border on top.
  ctx.save();
  ctx.globalAlpha = frameIn;
  roundRect(ctx, tx, ty, tableW, tableH, unit * 0.5);
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  if (scene.caption) {
    ctx.save();
    ctx.globalAlpha = clamp01(sub(env.p, 0.3, 0.3));
    ctx.font = `500 ${unit * 0.8}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    const cap = wrapText(ctx, scene.caption, contentW * 0.9)[0] ?? scene.caption;
    ctx.fillText(cap, contentX + contentW / 2, ty + tableH + unit * 1.1);
    ctx.restore();
  }
  ctx.textAlign = "start";
}

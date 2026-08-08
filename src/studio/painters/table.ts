import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  GLOW,
  STROKE,
  RADIUS,
  easeOutCubic,
  enterT,
  idle,
  lerpColor,
  shade,
  wrapText,
  roundRect,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
  departT,
  applyElevation,
  clearShadow,
} from "./common";
import type { PaintEnv } from "./index";

type TableScene = Extract<Scene, { kind: "table" }>;
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const GOOD = THEME.good;
/** No palette key expresses "worse than before"; `warn` is a caution yellow, not a
 *  regression red. Kept as a named constant rather than invented per call site. */
const DANGER = "#f87171";

const SLAB_DEPTH = 0.12;
const EDGE_OPACITY = 0.6;
const HEADER_TINT = 0.28;
const CURRENT_TINT = 0.22;
const HIGHLIGHT_TINT = 0.12;
const TONE_TINT = 0.3;
const IDLE_FACE_LIFT = 0.09;
const CELL_PAD_X = 0.16;
const CELL_PAD_Y = 0.14;
const ROW_MAX_UNITS = 3.2;
const PULSE_MS = 2400;
const SHIMMER_MS = 2200;

type CellState = {
  visible: boolean;
  cx: number;
  cy: number;
  w: number;
  h: number;
  scale: number;
  opacity: number;
  face: string;
  edge: string;
};

function diffTone(cell: string): "good" | "danger" | null {
  if (cell.startsWith("+")) return "good";
  if (cell.startsWith("-")) return "danger";
  return null;
}

export function paintTable(ctx: CanvasRenderingContext2D, scene: TableScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const nRows = scene.rows.length;
  const nCols = scene.columns.length;
  const totalBeats = offset + nRows;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const key = scene.id + "-tbl3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;

  const availTop = contentY + band;
  const availH = Math.max(unit * 4, safeBottom - availTop - (scene.caption ? unit * 1.6 : 0));
  const rect = { x: contentX, y: availTop, w: contentW, h: availH };

  /**
   * The grid is laid out in PIXELS and the slabs are mapped onto it. World-space rows
   * spread over a fixed 9 units regardless of row count, so the blocks ended up a third
   * of their own row pitch with the text floating in the gap between them — and a bob
   * plus a per-state z-shift moved each slab after placement, which the 2D text (drawn
   * at z=0) could not follow. `qa/ledger.json` → systemic
   * `2d-layout-round-tripped-through-camera`.
   */
  const gridRows = nRows + 1; // header + body
  const rowH = Math.min(availH / gridRows, unit * ROW_MAX_UNITS);
  const gridTop = availTop + Math.max(0, (availH - rowH * gridRows) / 2);
  const colW = contentW / nCols;
  const padX = colW * CELL_PAD_X;
  const padY = rowH * CELL_PAD_Y;
  /** `r` is 0 for the header row, 1..nRows for the body. */
  const cellRect = (c: number, r: number): Rect => {
    const x = contentX + c * colW + padX / 2;
    const y = gridTop + r * rowH + padY / 2;
    const w = colW - padX;
    const h = rowH - padY;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  };

  const leave = departT(env, 380);
  if (leave <= 0) return;

  const frameIn = easeOutCubic(enterT(env, 380));
  const idleFace = shade(THEME.panel, IDLE_FACE_LIFT);

  const cells: { r: number; c: number; rect: Rect; state: CellState }[] = [];
  for (let c = 0; c < nCols; c++) {
    const r0 = cellRect(c, 0);
    cells.push({
      r: 0,
      c,
      rect: r0,
      state: {
        visible: frameIn > 0.01,
        cx: r0.cx,
        cy: r0.cy,
        w: r0.w,
        h: r0.h,
        scale: Math.max(0.001, frameIn),
        opacity: frameIn,
        face: lerpColor(THEME.panel, secondary, HEADER_TINT),
        edge: secondary,
      },
    });
  }
  for (let r = 0; r < nRows; r++) {
    const beatIdx = offset + r;
    const t = beatT(env.beats, beatIdx, totalBeats, env.p);
    const appear = easeOutCubic(Math.min(1, Math.max(0, t * 3)));
    const isCurrent = active === beatIdx;
    const isHighlighted = scene.rows[r].highlight;
    for (let c = 0; c < nCols; c++) {
      const rc = cellRect(c, r + 1);
      const tone = diffTone(scene.rows[r].cells[c] ?? "");
      // The active row's tint breathes continuously — a static tint left the whole
      // scene motionless for most of each row's hold once its entrance settled,
      // which is the entire visible body of the table for most of the scene.
      const breathe = 0.85 + 0.25 * idle(env, PULSE_MS);
      const face =
        tone === "good"
          ? lerpColor(THEME.panel, GOOD, TONE_TINT)
          : tone === "danger"
            ? lerpColor(THEME.panel, DANGER, TONE_TINT)
            : isCurrent
              ? lerpColor(THEME.panel, accent, CURRENT_TINT * breathe)
              : isHighlighted
                ? lerpColor(THEME.panel, accent, HIGHLIGHT_TINT)
                : idleFace;
      cells.push({
        r: r + 1,
        c,
        rect: rc,
        state: {
          visible: appear > 0.01,
          cx: rc.cx,
          cy: rc.cy,
          w: rc.w,
          h: rc.h,
          scale: Math.max(0.001, appear),
          opacity: appear,
          face,
          edge: tone === "good" ? GOOD : tone === "danger" ? DANGER : isCurrent || isHighlighted ? accent : THEME.textDim,
        },
      });
    }
  }

  // Text is fitted to the cell it is drawn in. It used to be fitted to
  // `contentW / nCols * 0.9`, which is wider than the cell, so long values ran past
  // their own block and off the content edge ("Object.prototype").
  const baseCellPx = unit * (vertical ? 0.85 : 0.78);
  const fitCell = (text: string, maxW: number, mono: boolean) => {
    let px = baseCellPx;
    const font = (p: number) => (mono ? `${p}px ${FONT_MONO}` : `700 ${p}px ${FONT_SANS}`);
    ctx.font = font(px);
    while (ctx.measureText(text).width > maxW && px > unit * 0.5) {
      px -= 1;
      ctx.font = font(px);
    }
    return px;
  };

  cells.forEach(({ r, c, rect: cr, state }) => {
    if (!state.visible) return;
    const isHeader = r === 0;
    const rowIdx = r - 1;
    const text = isHeader ? scene.columns[c] : (scene.rows[rowIdx].cells[c] ?? "");
    const tone = isHeader ? null : diffTone(text);
    const isCurrent = !isHeader && active === offset + rowIdx;
    const isHighlighted = !isHeader && scene.rows[rowIdx].highlight;

    ctx.save();
    ctx.globalAlpha = state.opacity * leave;
    ctx.translate(cr.cx, cr.cy);
    ctx.scale(state.scale, state.scale);
    ctx.translate(-cr.cx, -cr.cy);

    applyElevation(ctx, unit, isCurrent ? "floating" : "raised");
    roundRect(ctx, cr.x, cr.y, cr.w, cr.h, unit * RADIUS.sm);
    ctx.fillStyle = state.face;
    ctx.fill();
    clearShadow(ctx);
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * GLOW.base * (0.7 + 0.3 * idle(env, PULSE_MS));
      roundRect(ctx, cr.x, cr.y, cr.w, cr.h, unit * RADIUS.sm);
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * STROKE.base;
      ctx.stroke();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    const px = fitCell(text, cr.w - unit * 0.5, !isHeader);
    ctx.font = isHeader ? `700 ${px}px ${FONT_SANS}` : `${px}px ${FONT_MONO}`;
    ctx.fillStyle = isHeader
      ? THEME.text
      : tone === "good"
        ? GOOD
        : tone === "danger"
          ? DANGER
          : isHighlighted || isCurrent
            ? THEME.text
            : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(text, cr.cx, cr.cy + px * 0.35);
    ctx.textAlign = "start";
    ctx.restore();
  });

  // A shimmer sweeps across the active row continuously — the per-cell breathing
  // tint alone changes too little of the frame to register as motion once a row
  // has settled, and this is the entire visible body of the table for most of
  // the scene's runtime.
  const activeRow = active - offset;
  // During the intro beat (before any row is "current") sweep the header
  // instead — the header is fully visible from frameIn onward, and otherwise
  // the intro beat is a dead stretch with nothing moving at all.
  if (activeRow < nRows) {
    const rowY = activeRow >= 0 ? gridTop + (activeRow + 1) * rowH : gridTop;
    const phase = (env.elapsedMs % SHIMMER_MS) / SHIMMER_MS;
    const sweepX = contentX + phase * contentW;
    ctx.save();
    ctx.globalAlpha = leave;
    roundRect(ctx, contentX, rowY + padY / 2, contentW, rowH - padY, unit * RADIUS.sm);
    ctx.clip();
    const grad = ctx.createLinearGradient(sweepX - unit * 2, 0, sweepX + unit * 2, 0);
    grad.addColorStop(0, rgba(accent, 0));
    grad.addColorStop(0.5, rgba(accent, 0.16));
    grad.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(contentX, rowY, contentW, rowH);
    ctx.restore();
  }

  if (scene.caption) {
    ctx.save();
    ctx.globalAlpha = easeOutCubic(enterT(env, 420, 650)) * leave;
    ctx.font = `500 ${unit * 0.8}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    const cap = wrapText(ctx, scene.caption, contentW * 0.9)[0] ?? scene.caption;
    ctx.fillText(cap, contentX + contentW / 2, gridTop + rowH * gridRows + unit * 1.1);
    ctx.restore();
  }
  ctx.textAlign = "start";
}

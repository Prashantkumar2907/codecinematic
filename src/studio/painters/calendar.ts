import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  RADIUS,
  STROKE,
  DUR,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  clamp01,
  clampRange,
  lerp,
  lerpColor,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatWindow,
  beatT,
  activeBeatIndex,
  idle,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type CalendarScene = Extract<Scene, { kind: "calendar" }>;
type Mark = CalendarScene["marks"][number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 4x3 at 9:16 keeps a month cell squarish; 12x1 at 16:9 reads as a year ribbon. */
const V_COLS = 4;
const V_ROWS = 3;
const CELL_ASPECT_MAX = 1.05;

const CELL_STEP_MS = 24;
/** `stagger()` cannot be used here: its `stepMs` default is typed to the literal 70. */
const SLOT_STEP_MS = 70;
const TINT_IN_FRAC = 0.3;
const TINT_STEP_FRAC = 0.08;
const SWEEP_FRAC = 0.3;
const BAND_IN_FRAC = 0.12;
const LABEL_IN_FRAC = 0.3;
/** Alpha/weight of a mark that has landed but is no longer being narrated. */
const REST_ENERGY = 0.45;
/** Share of the incoming beat over which the previous mark dims to REST_ENERGY. */
const HANDOFF_FRAC = 0.35;
const GHOST_ALPHA = 0.3;
const GLOW_PERIOD_MS = 1600;
/** Bloom radius of an active chip/band, in units. Its maximum is reserved above
 *  safeBottom, because a shadow is not clipped by the shape it hangs off. */
const GLOW_BASE = 0.4;
const GLOW_SWING = 0.25;
const GLOW_MAX = GLOW_BASE + GLOW_SWING;

const CHIP_H = 1.3;
const CHIP_GAP = 0.4;
const GRID_CHIP_GAP = 0.9;
/** Downward offset a chip enters from — reserved like the glow, or the last chip
 *  strokes into the caption band for the whole of its entrance. */
const CHIP_RISE = 0.35;

const CELL_H_MAX = 2.8;
const RIBBON_H_FRAC = 0.22;
const LANE_H_MAX = 3;
/** Top strip of a lane, reserved for a label too wide to ride inside its band.
 *  Lane-local, so such a label can never reach the ribbon or the lane above. */
const LANE_GUTTER = 0.9;
const LANE_GUTTER_FRAC = 0.3;
const BAND_PAD = 0.15;
/** Half the boldest stroke, so nothing centred on the last row bleeds past safeBottom. */
const SAFE_PAD = STROKE.bold / 2;

function toneColor(tone: Mark["tone"], accent: string, secondary: string): string {
  switch (tone) {
    case "accent":
      return accent;
    case "secondary":
      return secondary;
    case "good":
      return THEME.good;
    case "warn":
      return THEME.warn;
  }
}

/** Greedy lane assignment so overlapping marks stack instead of colliding. */
function assignLanes(marks: Mark[]): number[] {
  const laneEnd: number[] = []; // last occupied month per lane
  const lanes: number[] = [];
  marks.forEach((m) => {
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] >= m.from) lane++;
    laneEnd[lane] = m.to;
    lanes.push(lane);
  });
  return lanes;
}

type CellTint = { color: string; energy: number; reveal: number };

export function paintCalendar(ctx: CanvasRenderingContext2D, scene: CalendarScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical } = layout;
  const { accent, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const nMarks = scene.marks.length;
  const totalBeats = offset + nMarks;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeMark = active - offset;
  const glow = idle(env, GLOW_PERIOD_MS);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaTop = contentY + band;
  const usableBottom = safeBottom - unit * SAFE_PAD;
  const usableH = Math.max(unit * 6, usableBottom - areaTop);

  const markT = (k: number) => beatT(env.beats, offset + k, totalBeats, env.p);
  const markStarted = (k: number) => env.p >= beatWindow(env.beats, offset + k, totalBeats).start;

  /** 1 while narrated, easing down to REST_ENERGY as the next mark takes over. */
  const energy = (k: number) => {
    if (k === activeMark) return 1;
    if (k === activeMark - 1) return lerp(1, REST_ENERGY, easeInOutCubic(clamp01(markT(activeMark) / HANDOFF_FRAC)));
    return REST_ENERGY;
  };

  /** Brightest mark covering `month`, with its own eased per-cell reveal. */
  const monthTint = (month: number): CellTint | null => {
    let best: CellTint | null = null;
    for (let k = 0; k < nMarks; k++) {
      const mark = scene.marks[k];
      if (month < mark.from || month > mark.to) continue;
      if (!markStarted(k)) continue;
      const reveal = easeOutCubic(clamp01((markT(k) - (month - mark.from) * TINT_STEP_FRAC) / TINT_IN_FRAC));
      if (reveal <= 0) continue;
      const e = energy(k);
      if (!best || e >= best.energy) best = { color: toneColor(mark.tone, accent, secondary), energy: e, reveal };
    }
    return best;
  };

  /** One month cell: panel base staggered in, tint crossfaded on top of it. */
  const drawCell = (month: number, x: number, y: number, w: number, h: number, labelPx: number) => {
    const idx = month - 1;
    const grow = easeOutCubic(enterT(env, DUR.fast, idx * CELL_STEP_MS));
    if (grow <= 0) return;
    const tint = monthTint(month);
    const radius = unit * RADIUS.md;
    ctx.save();
    ctx.globalAlpha = grow;
    ctx.translate(0, (1 - grow) * unit * 0.3);
    roundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    if (tint) {
      roundRect(ctx, x, y, w, h, radius);
      ctx.fillStyle = rgba(tint.color, (0.15 + 0.25 * tint.energy) * tint.reveal);
      ctx.fill();
    }
    // Complementary alphas: one border's worth of ink at every moment, so the
    // tinted stroke never doubles over the panel stroke as a darker seam.
    const rv = tint ? tint.reveal : 0;
    if (rv < 1) {
      roundRect(ctx, x, y, w, h, radius);
      ctx.globalAlpha = grow * (1 - rv);
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = unit * STROKE.hair;
      ctx.stroke();
    }
    if (tint) {
      roundRect(ctx, x, y, w, h, radius);
      ctx.globalAlpha = grow * rv;
      ctx.strokeStyle = rgba(tint.color, 0.4 + 0.5 * tint.energy);
      ctx.lineWidth = unit * lerp(STROKE.thin, STROKE.base, tint.energy);
      ctx.stroke();
    }
    ctx.globalAlpha = grow;
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = tint ? lerpColor(THEME.textDim, THEME.text, tint.reveal) : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(MONTHS[idx], x + w / 2, y + h / 2 + labelPx * 0.35);
    ctx.restore();
  };

  if (vertical) {
    // Month grid, then one label chip per mark stacked beneath it. Chip slots are
    // reserved for every mark from frame 0 so the grid never shifts as they land.
    const cellGap = unit * 0.3;
    const chipH = unit * CHIP_H;
    const chipGap = unit * CHIP_GAP;
    const gridChipGap = unit * GRID_CHIP_GAP;
    const chipsH = nMarks * chipH + (nMarks - 1) * chipGap;
    const cellW = (contentW - cellGap * (V_COLS - 1)) / V_COLS;
    // The entrance dip and the active chip's bloom both hang below the last chip,
    // so the whole stack is laid out inside a band that already excludes them.
    const stackH = usableH - unit * (CHIP_RISE + GLOW_MAX);
    const gridBudget = stackH - chipsH - gridChipGap;
    const cellH = Math.max(
      unit * 1.2,
      Math.min((gridBudget - cellGap * (V_ROWS - 1)) / V_ROWS, cellW * CELL_ASPECT_MAX)
    );
    const gridH = cellH * V_ROWS + cellGap * (V_ROWS - 1);
    const gridTop = areaTop + Math.max(0, (stackH - (gridH + gridChipGap + chipsH)) / 2);
    const labelPx = Math.min(unit * 1.2, cellW * 0.32, cellH * 0.4);

    for (let month = 1; month <= 12; month++) {
      const idx = month - 1;
      const r = Math.floor(idx / V_COLS);
      const c = idx % V_COLS;
      drawCell(
        month,
        contentX + c * (cellW + cellGap),
        gridTop + r * (cellH + cellGap),
        cellW,
        cellH,
        labelPx
      );
    }

    const chipTop = gridTop + gridH + gridChipGap;
    const rangePx = Math.min(unit * 0.6, chipH * 0.42);
    scene.marks.forEach((mark, k) => {
      const slotY = chipTop + k * (chipH + chipGap);
      const color = toneColor(mark.tone, accent, secondary);
      const started = markStarted(k);
      const t = markT(k);
      const appear = started ? easeOutCubic(clamp01(t / LABEL_IN_FRAC)) : 0;
      const e = energy(k);

      ctx.font = `600 ${rangePx}px ${FONT_SANS}`;
      const rangeLabel = `${MONTHS[mark.from - 1]}–${MONTHS[mark.to - 1]}`;
      const rangeW = ctx.measureText(rangeLabel).width;
      const labelMaxW = contentW - rangeW - unit * 3;
      const px = fitFontSize(ctx, mark.label, { maxW: labelMaxW, startPx: unit * 0.85, minPx: unit * 0.5, weight: 700 });
      ctx.font = `700 ${px}px ${FONT_SANS}`;
      const labelW = ctx.measureText(mark.label).width;
      const chipW = Math.min(contentW, labelW + rangeW + unit * 2.4);
      const chipX = contentX + (contentW - chipW) / 2;

      // Empty slot: shows where the mark will land instead of leaving a void, and
      // fades out UNDER the arriving chip so the row is never blank for a frame.
      if (appear < 1) {
        const gi = easeOutCubic(enterT(env, DUR.base, DUR.fast + k * SLOT_STEP_MS));
        if (gi > 0) {
          ctx.save();
          ctx.globalAlpha = GHOST_ALPHA * gi * (1 - appear);
          roundRect(ctx, chipX, slotY, chipW, chipH, chipH / 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = unit * STROKE.hair;
          ctx.setLineDash([unit * 0.3, unit * 0.25]);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (!started) return;

      ctx.save();
      ctx.globalAlpha = appear * lerp(0.8, 1, e);
      ctx.translate(0, (1 - appear) * unit * CHIP_RISE);
      if (e >= 1) {
        ctx.shadowColor = rgba(color, 0.5);
        ctx.shadowBlur = unit * (GLOW_BASE + GLOW_SWING * glow);
      }
      roundRect(ctx, chipX, slotY, chipW, chipH, chipH / 2);
      ctx.fillStyle = rgba(color, lerp(0.14, 0.22, e));
      ctx.fill();
      ctx.shadowBlur = 0;
      roundRect(ctx, chipX, slotY, chipW, chipH, chipH / 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = unit * lerp(STROKE.thin, STROKE.base, e);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.font = `700 ${px}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.fillText(mark.label, chipX + unit * 0.7, slotY + chipH / 2 + px * 0.35);
      ctx.textAlign = "right";
      ctx.font = `600 ${rangePx}px ${FONT_SANS}`;
      ctx.fillStyle = color;
      ctx.fillText(rangeLabel, chipX + chipW - unit * 0.7, slotY + chipH / 2 + rangePx * 0.35);
      ctx.restore();
    });
    ctx.textAlign = "start";
    return;
  }

  // Horizontal: a 12-cell year ribbon with gantt lanes beneath it. The pair is
  // centred as one block so there is no hole between the ribbon and the lanes.
  const cellGap = unit * 0.25;
  const nCells = 12;
  const cellW = (contentW - cellGap * (nCells - 1)) / nCells;
  const cellH = Math.min(unit * CELL_H_MAX, cellW * CELL_ASPECT_MAX, usableH * RIBBON_H_FRAC);
  const ribbonGap = unit * 0.6;
  const cellX = (month: number) => contentX + (month - 1) * (cellW + cellGap);

  const lanes = assignLanes(scene.marks);
  const nLanes = Math.max(...lanes, 0) + 1;
  // The active band's bloom is reserved out of the stack, not clipped by it.
  const stackH = usableH - unit * GLOW_MAX;
  const laneH = Math.min((stackH - cellH - ribbonGap) / nLanes, unit * LANE_H_MAX);
  const gutter = Math.min(unit * LANE_GUTTER, laneH * LANE_GUTTER_FRAC);
  const bandH = Math.max(unit * 0.5, laneH - gutter - unit * BAND_PAD);
  const groupH = cellH + ribbonGap + nLanes * laneH;
  const cellTop = areaTop + Math.max(0, (stackH - groupH) / 2);
  const laneTop = cellTop + cellH + ribbonGap;
  const labelPx = Math.min(unit * 0.95, cellW * 0.42);

  for (let month = 1; month <= 12; month++) {
    drawCell(month, cellX(month), cellTop, cellW, cellH, labelPx);
  }

  scene.marks.forEach((mark, k) => {
    const started = markStarted(k);
    const t = started ? markT(k) : 0;
    const lane = lanes[k];
    const y = laneTop + lane * laneH + gutter;
    const h = bandH;
    const x0 = cellX(mark.from);
    const fullW = cellX(mark.to) + cellW - x0;
    const color = toneColor(mark.tone, accent, secondary);
    // easeOutCubic, not easeInOutCubic: an ease-in start held the band under ~10px
    // wide for ~6 frames, which reads as an orphan tick rather than a wipe.
    const sweep = started ? easeOutCubic(clamp01(t / SWEEP_FRAC)) : 0;

    // Ghost band: the slot the mark will sweep into, staggered in from frame 0 and
    // faded out UNDER the sweep, so the slot never blinks empty for a frame.
    if (sweep < 1) {
      const gi = easeOutCubic(enterT(env, DUR.base, DUR.fast + k * SLOT_STEP_MS));
      if (gi > 0) {
        ctx.save();
        ctx.globalAlpha = GHOST_ALPHA * gi * (1 - sweep);
        roundRect(ctx, x0, y, fullW, h, h / 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = unit * STROKE.hair;
        ctx.setLineDash([unit * 0.3, unit * 0.25]);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (!started || t <= 0) return;

    const e = energy(k);
    // The band wipes out of its own left edge. Its width is NOT floored at its
    // height: that floor rendered a detached dot at x0 on the mark's first frames.
    const w = fullW * sweep;
    const bandIn = easeOutCubic(clamp01(t / BAND_IN_FRAC));
    const bh = h * lerp(0.5, 1, bandIn);
    const by = y + (h - bh) / 2;

    ctx.save();
    ctx.globalAlpha = lerp(0.85, 1, e);

    // No leader line back up to the ribbon: the band is already column-aligned with
    // the months it covers AND those cells carry its tone, so a hairline across the
    // gap added nothing and crossed whatever sat in the lane gutter.
    if (e >= 1) {
      ctx.shadowColor = rgba(color, 0.5);
      ctx.shadowBlur = unit * (GLOW_BASE + GLOW_SWING * glow);
    }
    ctx.globalAlpha *= bandIn;
    roundRect(ctx, x0, by, w, bh, bh / 2);
    const grad = ctx.createLinearGradient(x0, 0, x0 + fullW, 0);
    grad.addColorStop(0, rgba(color, 0.85));
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Shimmer sweep on the active band.
    if (e >= 1 && sweep >= 1) {
      ctx.save();
      roundRect(ctx, x0, y, fullW, h, h / 2);
      ctx.clip();
      const f = idle(env, 4000, -Math.PI / 2);
      const sx = x0 + (fullW + unit * 2) * f - unit;
      const sg = ctx.createLinearGradient(sx - unit, 0, sx + unit, 0);
      sg.addColorStop(0, rgba(THEME.text, 0));
      sg.addColorStop(0.5, rgba(THEME.text, 0.28));
      sg.addColorStop(1, rgba(THEME.text, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(sx - unit, y, unit * 2, h);
      ctx.restore();
    }

    // Label riding on the band. It is drawn in the background colour, so it may
    // only appear once the sweep has laid the band down under all of it.
    const labelIn = easeOutBack(clamp01((t - SWEEP_FRAC) / LABEL_IN_FRAC));
    if (labelIn > 0) {
      ctx.globalAlpha = lerp(0.85, 1, e) * clamp01(labelIn);
      const px = fitFontSize(ctx, mark.label, { maxW: fullW - unit * 0.8, startPx: h * 0.6, minPx: unit * 0.45, weight: 700 });
      ctx.font = `700 ${px}px ${FONT_SANS}`;
      ctx.textAlign = "center";
      if (ctx.measureText(mark.label).width <= fullW - unit * 0.6) {
        ctx.fillStyle = THEME.bgBottom;
        ctx.fillText(mark.label, x0 + fullW / 2, y + h / 2 + px * 0.35);
      } else {
        // Too wide even shrunk — a one-month band is only `cellW` across. It goes in
        // this lane's own gutter, which no other element may occupy.
        const overPx = fitFontSize(ctx, mark.label, {
          maxW: contentW,
          startPx: gutter * 0.72,
          minPx: gutter * 0.4,
          weight: 700,
        });
        ctx.font = `700 ${overPx}px ${FONT_SANS}`;
        const half = ctx.measureText(mark.label).width / 2;
        ctx.fillStyle = THEME.text;
        ctx.fillText(
          mark.label,
          clampRange(x0 + fullW / 2, contentX + half, contentX + contentW - half),
          y - unit * BAND_PAD
        );
      }
    }
    ctx.restore();
  });
  ctx.textAlign = "start";
}

import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  DUR,
  RADIUS,
  STROKE,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  clamp01,
  clampRange,
  sub,
  rgba,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  stagger,
} from "./common";
import type { PaintEnv } from "./index";

type PictogramScene = Extract<Scene, { kind: "pictogram" }>;
type Seat = { x: number; y: number; angle: number };
type Box = { x: number; y: number; w: number; h: number };
type ArcMeta = { cx: number; baseY: number; r0: number; rMax: number; gapR: number };

/** drawPerson's silhouette, in multiples of its `s` argument. Every icon size derives from a cell
 *  through these two numbers, so a cell that fits the box cannot produce a glyph that does not. */
const GLYPH_W = 0.72;
const GLYPH_H = 1.42;
/** Share of a cell the glyph may occupy; the remainder is the gutter that keeps icons countable. */
const CELL_FILL_X = 0.8;
const CELL_FILL_Y = 0.86;
/** A pictogram is only worth drawing if the reader can count it. When the total is a whole number
 *  of decades, every row must hold a whole number of decades too, so the column count is restricted
 *  to multiples of DECADE_COLS and the largest of those wins. Restricting to multiples rather than
 *  to ten itself is what keeps 16:9 usable: at 1920x1080 a hard ten-wide block fills 373px of a
 *  1274px box, while 20x5 is both decade-countable and the largest glyph the box can hold at all. */
const DECADE_COLS = 10;
/** Extra gap between decades, in multiples of the glyph size. The normal gutter is 0.18·s, so this
 *  is the only thing that makes a 20-wide row read as two tens instead of one twenty. */
const DECADE_GAP = 0.5;
const ARC_FIT = 0.9;
const CHORD_FILL = 0.86;
const RING_FILL = 0.9;
const GHOST_ALPHA = 0.17;
/** Budget for the whole empty-field cascade. Per-icon DUR.step would take 7s across 100 icons. */
const GHOST_CASCADE_MS = 280;
const WAVE_SPAN = 0.55;
const POP_LEN = 0.2;
/** A group's wave: last glyph starts at 0.55 and pops for 0.2, so the count is final at 0.75. */
const WAVE_DONE = WAVE_SPAN + POP_LEN;
const LIFT = 0.22;
const POP_FROM = 0.72;
/** Share of the scene left after the last group's wave that the closing pulse spends. */
const SETTLE_SPAN = 0.6;
const SETTLE_MIN_SPAN = 0.08;
/** Gap between side-by-side legend columns. A right-aligned count sitting 0.5u from the next
 *  column's dot reads as that column's label, which inverts every number on the card. */
const LEGEND_GUTTER = 1.2;

/** Below this RGB distance two groups read as one colour. Business & Startups' accent measures 20
 *  from THEME.warn; the widest gap this has to preserve is Environment's 58 from THEME.good. */
const TINT_MIN_DIST = 60;
/** `groups` is capped at 4 by the schema, and FALLBACK_TINTS is 4 long, so a tint always exists:
 *  at most two fallbacks can be knocked out, by accent and by secondary. */
const FALLBACK_TINTS = [THEME.good, THEME.warn, THEME.danger, THEME.text];

function rgbDist(a: string, b: string): number {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const dr = ((na >> 16) & 255) - ((nb >> 16) & 255);
  const dg = ((na >> 8) & 255) - ((nb >> 8) & 255);
  const db = (na & 255) - (nb & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Subject accents and the semantic THEME tokens are drawn from the same colour ranges — Money &
 * Finance's accent IS `THEME.good`, and Environment's sits 58 from it — so a fixed
 * [accent, secondary, good, warn] list hands two groups the same colour on two of the six kits
 * that use this kind. Take the first fallbacks that are far enough from what is already in use.
 */
function groupTints(accent: string, secondary: string): string[] {
  const tints = [accent, secondary];
  for (const cand of FALLBACK_TINTS) {
    if (tints.length >= FALLBACK_TINTS.length) break;
    if (tints.every((t) => rgbDist(t, cand) >= TINT_MIN_DIST)) tints.push(cand);
  }
  return tints;
}

/** Head + rounded-shoulders body, one fillStyle, total height ≈ s·GLYPH_H, centered on (cx, cy). */
function drawPerson(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const headR = s * 0.32;
  const bodyW = s * GLYPH_W;
  const bodyH = s * 0.78;
  const top = cy - (headR * 2 + bodyH - s * 0.04) / 2;
  ctx.beginPath();
  ctx.arc(cx, top + headR, headR, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, cx - bodyW / 2, top + headR * 2 - s * 0.04, bodyW, bodyH, s * 0.36);
  ctx.fill();
}

/**
 * Row-major grid, sized by choosing the column count that yields the largest glyph the box can
 * hold — out of the decade-countable column counts when the total is a whole number of decades.
 * Pitch is the glyph's own footprint rather than the cell, so a box far wider than the block needs
 * leaves a centred margin instead of stretching the gutters. Because `s` is the min of a row-width
 * term and a per-row height term, `blockW <= box.w` and `rows * pitchY <= box.h` hold for every
 * candidate: a grid that is chosen cannot be a grid that overflows.
 */
function gridLayout(total: number, box: Box): { seats: Seat[]; s: number } {
  const decadeOnly = total % DECADE_COLS === 0 && total > DECADE_COLS;
  /** Decade breaks inside a row of `n`, in multiples of s. Zero unless the grid is decade-ruled. */
  const gapsIn = (n: number) => (decadeOnly ? Math.max(0, Math.ceil(n / DECADE_COLS) - 1) : 0);
  /** A row of `n` glyphs in multiples of s, gaps included — the exact quantity `s` is solved from. */
  const spanOf = (n: number) => (n * GLYPH_W) / CELL_FILL_X + gapsIn(n) * DECADE_GAP;
  const sizeFor = (c: number) =>
    Math.min(box.w / spanOf(c), ((box.h / Math.ceil(total / c)) * CELL_FILL_Y) / GLYPH_H);

  const step = decadeOnly ? DECADE_COLS : 1;
  let cols = step;
  let s = sizeFor(step);
  for (let c = step * 2; c <= total; c += step) {
    const cand = sizeFor(c);
    if (cand > s) {
      s = cand;
      cols = c;
    }
  }
  const rows = Math.ceil(total / cols);
  const pitchX = (s * GLYPH_W) / CELL_FILL_X;
  const pitchY = (s * GLYPH_H) / CELL_FILL_Y;
  const gap = s * DECADE_GAP;
  const blockW = s * spanOf(cols);
  const originX = box.x + (box.w - blockW) / 2;
  const originY = box.y + (box.h - rows * pitchY) / 2;
  const seats: Seat[] = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, total - row * cols);
    const rowX = originX + (blockW - s * spanOf(inRow)) / 2;
    const col = i - row * cols;
    seats.push({
      x: rowX + col * pitchX + gapsIn(col + 1) * gap + pitchX / 2,
      y: originY + (row + 0.5) * pitchY,
      angle: 0,
    });
  }
  return { seats, s };
}

/** Hemicycle seats, fill order swept by angle left→right so parties block up like a parliament. */
function arcLayout(total: number, box: Box): { seats: Seat[]; s: number } & ArcMeta {
  const rings = total <= 40 ? 3 : total <= 70 ? 4 : 5;
  const rMax = Math.min(box.w / 2, box.h) * ARC_FIT;
  const r0 = rMax * 0.45;
  const gapR = (rMax - r0) / (rings - 1);
  const radii = Array.from({ length: rings }, (_, i) => r0 + gapR * i);
  const wSum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((rr) => Math.max(1, Math.round((total * rr) / wSum)));
  let guard = 0;
  let diff = total - counts.reduce((a, b) => a + b, 0);
  while (diff !== 0 && guard++ < 64) {
    const i = rings - 1 - (guard % rings);
    counts[i] = Math.max(1, counts[i] + Math.sign(diff));
    diff = total - counts.reduce((a, b) => a + b, 0);
  }
  let minChord = Infinity;
  radii.forEach((rr, ri) => {
    minChord = Math.min(minChord, (Math.PI * rr) / counts[ri]);
  });
  // The last two terms hold the outermost ring's glyph inside the box: the arc already spends
  // ARC_FIT of the smaller half-extent, so what is left has to cover half a glyph.
  const s = Math.max(
    1,
    Math.min(
      (minChord * CHORD_FILL) / GLYPH_W,
      (gapR * RING_FILL) / GLYPH_H,
      ((box.w / 2 - rMax) * 2) / GLYPH_W,
      (box.h - rMax) / GLYPH_H
    )
  );
  const cx = box.x + box.w / 2;
  const baseY = box.y + (box.h + rMax) / 2;
  const seats: Seat[] = [];
  radii.forEach((rr, ri) => {
    const m = counts[ri];
    for (let j = 0; j < m; j++) {
      const angle = 180 - ((j + 0.5) / m) * 180;
      const a = (angle * Math.PI) / 180;
      seats.push({ x: cx + Math.cos(a) * rr, y: baseY - Math.sin(a) * rr, angle });
    }
  });
  seats.sort((a, b) => b.angle - a.angle);
  return { seats: seats.slice(0, total), s, cx, baseY, r0, rMax, gapR };
}

export function paintPictogram(ctx: CanvasRenderingContext2D, scene: PictogramScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, vertical, safeBottom } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.groups.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const lastWin = beatWindow(env.beats, totalBeats - 1, totalBeats);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const ah = safeBottom - ay;
  if (ah < unit * 4) return;

  const starts: number[] = [];
  const counts: number[] = [];
  let cum = 0;
  scene.groups.forEach((g) => {
    const c = Math.max(0, Math.min(g.count, scene.total - cum));
    starts.push(cum);
    counts.push(c);
    cum += c;
  });
  const rest = scene.total - cum;

  const legendRight = !vertical;
  const legendEntries = scene.groups.length + (rest > 0 ? 1 : 0);
  const legendCols = vertical ? Math.min(2, legendEntries) : 1;
  const legendRows = Math.ceil(legendEntries / legendCols);
  const rowPitch = unit * 1.55;
  const legendH = legendRight ? 0 : legendRows * rowPitch + unit * 0.5;
  const legendW = legendRight ? aw * 0.27 : 0;
  const box: Box = {
    x: ax,
    y: ay,
    w: aw - (legendRight ? legendW + unit * 0.8 : 0),
    h: ah - legendH,
  };

  let seats: Seat[];
  let s: number;
  let arcMeta: ArcMeta | null = null;
  if (scene.mode === "arc") {
    const built = arcLayout(scene.total, box);
    seats = built.seats;
    s = built.s;
    arcMeta = { cx: built.cx, baseY: built.baseY, r0: built.r0, rMax: built.rMax, gapR: built.gapR };
  } else {
    const built = gridLayout(scene.total, box);
    seats = built.seats;
    s = built.s;
  }

  const groupOf = new Array<number>(seats.length).fill(-1);
  counts.forEach((c, gi) => {
    for (let k = 0; k < c; k++) {
      const i = starts[gi] + k;
      if (i < groupOf.length) groupOf[i] = gi;
    }
  });

  const tints = groupTints(accent, secondary);
  const groupTimes = scene.groups.map((_, i) => beatT(env.beats, offset + i, totalBeats, env.p));
  // The settle keys off the last group's WAVE finishing, not off its beat ending: a beat window
  // ends at or near p=1, so anchoring at `lastEnd + 0.04` put the whole pulse past the end of the
  // scene and neither it nor the breathe that follows it ever ran.
  const settleFrom = lastWin.start + (lastWin.end - lastWin.start) * WAVE_DONE;
  const finalT = sub(env.p, settleFrom, Math.max(SETTLE_MIN_SPAN, (1 - settleFrom) * SETTLE_SPAN));
  const finalPulse = Math.sin(Math.PI * finalT);
  let largest = 0;
  counts.forEach((c, i) => {
    if (c > counts[largest]) largest = i;
  });

  const ghostFill = rgba(THEME.textDim, GHOST_ALPHA);
  const cascadeStep = GHOST_CASCADE_MS / Math.max(1, seats.length - 1);
  const fieldIn = easeOutCubic(enterT(env, DUR.base));

  ctx.save();
  seats.forEach((seat, i) => {
    const inT = easeOutCubic(enterT(env, DUR.fast, stagger(i, seats.length, cascadeStep)));
    if (inT <= 0) return;
    const gi = groupOf[i];
    let pr = 0;
    if (gi >= 0 && counts[gi] > 0) {
      const j = i - starts[gi];
      pr = clamp01((groupTimes[gi] - (j / counts[gi]) * WAVE_SPAN) / POP_LEN);
    }
    if (pr < 1) {
      ctx.globalAlpha = inT * (1 - pr);
      ctx.fillStyle = ghostFill;
      drawPerson(ctx, seat.x, seat.y, s * (0.86 + 0.14 * inT));
    }
    if (pr <= 0) return;
    // Rises on a sine so it leaves and returns to rest at zero velocity — a conditional offset
    // reads as a one-frame jump both ways. The seat is inside the box by construction but the lift
    // is not: at 16:9 the arc's top ring rose 17px above box.y, into the title's gap. Cap it there.
    const liftedY = Math.max(seat.y - Math.sin(Math.PI * pr) * s * LIFT, box.y + (s * GLYPH_H) / 2);
    const breathe = gi === largest ? 1 - 0.08 * finalT * (1 - idle(env, 2600)) : 1;
    const pulse = gi === largest ? 1 + 0.05 * finalPulse : 1;
    ctx.globalAlpha = inT * pr * breathe;
    ctx.fillStyle = tints[gi % tints.length];
    drawPerson(ctx, seat.x, liftedY, s * (POP_FROM + (1 - POP_FROM) * easeOutBack(pr)) * pulse);
  });
  ctx.restore();

  if (arcMeta && scene.majorityAt !== undefined) {
    const seatIdx = clampRange(scene.majorityAt - 1, 0, seats.length - 1);
    const angle = seats[seatIdx]?.angle ?? 90;
    const a = (angle * Math.PI) / 180;
    const { cx, baseY, r0, rMax, gapR } = arcMeta;
    const inner = Math.max(0, r0 - gapR * 0.45);
    const outer = rMax + gapR * 0.5;
    let crossGroup = -1;
    counts.forEach((c, gi) => {
      if (crossGroup < 0 && starts[gi] < scene.majorityAt! && starts[gi] + c >= scene.majorityAt!) crossGroup = gi;
    });
    let flash = 0;
    let crossed = false;
    if (crossGroup >= 0 && counts[crossGroup] > 0) {
      const jCross = scene.majorityAt - starts[crossGroup] - 1;
      const tCross = (jCross / counts[crossGroup]) * WAVE_SPAN + POP_LEN;
      const fl = (groupTimes[crossGroup] - tCross) / 0.45;
      if (fl >= 1) crossed = true;
      else if (fl > 0) flash = Math.abs(Math.sin(fl * Math.PI * 2));
    }
    const lw = unit * (STROKE.base + 0.05 * flash);
    // A stroke centred on safeBottom still lays half its width into the caption band.
    const yLo = contentY + lw / 2;
    const yHi = safeBottom - lw / 2;
    const xLo = contentX + lw / 2;
    const xHi = contentX + contentW - lw / 2;
    ctx.save();
    ctx.strokeStyle = crossed || flash > 0 ? accent : THEME.textDim;
    ctx.globalAlpha = fieldIn * (crossed ? 0.55 : 0.3 + 0.7 * flash);
    ctx.lineWidth = lw;
    if (flash > 0) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * flash;
    }
    ctx.beginPath();
    ctx.moveTo(clampRange(cx + Math.cos(a) * inner, xLo, xHi), clampRange(baseY - Math.sin(a) * inner, yLo, yHi));
    ctx.lineTo(clampRange(cx + Math.cos(a) * outer, xLo, xHi), clampRange(baseY - Math.sin(a) * outer, yLo, yHi));
    ctx.stroke();
    ctx.shadowBlur = 0;

    const pillH = unit * 0.92;
    ctx.font = `700 ${unit * 0.55}px ${FONT_SANS}`;
    const full = "majority";
    const fullW = ctx.measureText(full).width + unit * 0.56;
    const fits = fullW + lw <= contentW;
    const flagText = fits ? full : String(scene.majorityAt);
    const pillW = ctx.measureText(flagText).width + unit * 0.56;
    const flagX = clampRange(
      cx + Math.cos(a) * (outer + gapR * 0.7),
      contentX + pillW / 2 + lw / 2,
      contentX + contentW - pillW / 2 - lw / 2
    );
    const pillTop = clampRange(
      baseY - Math.sin(a) * (outer + gapR * 0.7) - pillH,
      contentY + lw / 2,
      safeBottom - pillH - lw / 2
    );
    roundRect(ctx, flagX - pillW / 2, pillTop, pillW, pillH, unit * RADIUS.sm);
    ctx.fillStyle = rgba(THEME.bgBottom, 0.92);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = crossed || flash > 0 ? accent : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(flagText, flagX, pillTop + pillH * 0.72);
    ctx.restore();
  }

  const legendPitch = legendRight ? Math.min(unit * 2.1, ah / Math.max(legendEntries, 1)) : rowPitch;
  const legendTop = legendRight
    ? ay + Math.max(0, (ah - legendEntries * legendPitch) / 2)
    : ay + box.h + unit * 0.5;

  const drawLegendRow = (
    idx: number,
    tint: string,
    label: string,
    valueText: string,
    alpha: number,
    isActive: boolean,
    dim: boolean
  ) => {
    let ex: number;
    let ey: number;
    let ew: number;
    if (legendRight) {
      ew = legendW;
      ex = ax + aw - legendW;
      ey = legendTop + idx * legendPitch + legendPitch * 0.5;
    } else {
      const colW = aw / legendCols;
      ew = colW - unit * LEGEND_GUTTER;
      ex = ax + (idx % legendCols) * colW;
      ey = legendTop + Math.floor(idx / legendCols) * rowPitch + rowPitch * 0.5;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    const dotR = unit * 0.26 * (isActive ? 1 + 0.14 * idle(env, 600) : 1);
    if (isActive) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
    }
    ctx.beginPath();
    ctx.arc(ex + unit * 0.3, ey, dotR, 0, Math.PI * 2);
    ctx.fillStyle = tint;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `800 ${unit * 0.85}px ${FONT_MONO}`;
    const cw = ctx.measureText(valueText).width;
    ctx.fillStyle = isActive ? THEME.text : dim ? THEME.textFaint : THEME.textDim;
    ctx.fillText(valueText, ex + ew - cw, ey + unit * 0.2);
    const lpx = fitFontSize(ctx, label, {
      maxW: Math.max(unit, ew - unit * 1.3 - cw),
      startPx: unit * 0.72,
      minPx: unit * 0.44,
      weight: isActive ? 700 : 600,
    });
    ctx.font = `${isActive ? 700 : 600} ${lpx}px ${FONT_SANS}`;
    ctx.fillText(label, ex + unit * 0.85, ey + unit * 0.2);
    ctx.restore();
  };

  scene.groups.forEach((g, gi) => {
    const t = groupTimes[gi];
    const isActive = active === offset + gi && t < 1;
    const shown = Math.round(counts[gi] * clamp01(t / WAVE_DONE));
    drawLegendRow(
      gi,
      t <= 0 ? THEME.textFaint : tints[gi % tints.length],
      g.label,
      String(t <= 0 ? counts[gi] : shown),
      fieldIn * (t <= 0 ? 0.35 : isActive ? 1 : 0.78),
      isActive,
      false
    );
  });
  if (rest > 0) {
    drawLegendRow(scene.groups.length, THEME.textFaint, "others", String(rest), fieldIn * 0.35, false, true);
  }
}

import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  clamp01,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatWindow,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type CalendarScene = Extract<Scene, { kind: "calendar" }>;
type Mark = CalendarScene["marks"][number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

export function paintCalendar(ctx: CanvasRenderingContext2D, scene: CalendarScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary } = env.palette;
  const ms = env.elapsedMs;
  const offset = introBeatCount(scene);
  const nMarks = scene.marks.length;
  const totalBeats = offset + nMarks;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const ghostIn = easeOutCubic(enterT(env, 340));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaTop = contentY + band;
  const areaH = contentH - band;

  const markT = (k: number) => beatT(env.beats, offset + k, totalBeats, env.p);
  const markStarted = (k: number) => env.p >= beatWindow(env.beats, offset + k, totalBeats).start;

  if (vertical) {
    // 2 rows x 6 cols; tint the month cells + a floating label chip.
    const cols = 6;
    const rows = 2;
    const cellGap = unit * 0.3;
    const gridH = Math.min(areaH * 0.6, unit * 8);
    const cellW = (contentW - cellGap * (cols - 1)) / cols;
    const cellH = (gridH - cellGap) / rows;
    const gridTop = areaTop + unit * 0.3;
    const cellRect = (month: number) => {
      const idx = month - 1;
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      return { x: contentX + c * (cellW + cellGap), y: gridTop + r * (cellH + cellGap), w: cellW, h: cellH };
    };

    // Per-month tint: brightest active mark covering it, else last landed mark.
    for (let month = 1; month <= 12; month++) {
      const rect = cellRect(month);
      let tint: string | null = null;
      let strength = 0;
      scene.marks.forEach((mark, k) => {
        if (month < mark.from || month > mark.to) return;
        if (!markStarted(k)) return;
        const isCur = active === offset + k;
        const s = isCur ? 1 : 0.5;
        if (s >= strength) {
          strength = s;
          tint = toneColor(mark.tone, accent, secondary);
        }
      });
      const gi = ghostIn;
      ctx.save();
      ctx.globalAlpha = gi;
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, unit * 0.3);
      if (tint) {
        ctx.fillStyle = rgba(tint, 0.15 + 0.25 * strength);
        ctx.fill();
        roundRect(ctx, rect.x, rect.y, rect.w, rect.h, unit * 0.3);
        ctx.strokeStyle = rgba(tint, 0.4 + 0.5 * strength);
        ctx.lineWidth = strength >= 1 ? unit * 0.07 : unit * 0.04;
      } else {
        ctx.fillStyle = THEME.panel;
        ctx.fill();
        roundRect(ctx, rect.x, rect.y, rect.w, rect.h, unit * 0.3);
        ctx.strokeStyle = THEME.panelBorder;
        ctx.lineWidth = 1;
      }
      ctx.stroke();
      ctx.font = `700 ${unit * 0.85}px ${FONT_SANS}`;
      ctx.fillStyle = tint ? THEME.text : THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(MONTHS[month - 1], rect.x + rect.w / 2, rect.y + rect.h / 2 + unit * 0.3);
      ctx.textAlign = "start";
      ctx.restore();
    }

    // Active / landed mark label chips below the grid, stacked.
    const chipTop = gridTop + gridH + unit * 0.6;
    let stackY = chipTop;
    scene.marks.forEach((mark, k) => {
      if (!markStarted(k)) return;
      const isCur = active === offset + k;
      const t = markT(k);
      const appear = easeOutCubic(clamp01(t / 0.3));
      const color = toneColor(mark.tone, accent, secondary);
      ctx.save();
      ctx.globalAlpha = isCur ? appear : 0.75;
      const chipH = unit * 1.3;
      const px = fitFontSize(ctx, mark.label, { maxW: contentW - unit * 3, startPx: unit * 0.8, minPx: unit * 0.5, weight: 700 });
      ctx.font = `700 ${px}px ${FONT_SANS}`;
      const rangeLabel = `${MONTHS[mark.from - 1]}–${MONTHS[mark.to - 1]}`;
      ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
      const rangeW = ctx.measureText(rangeLabel).width;
      ctx.font = `700 ${px}px ${FONT_SANS}`;
      const labelW = ctx.measureText(mark.label).width;
      const chipW = Math.min(contentW, labelW + rangeW + unit * 2.4);
      const chipX = contentX + (contentW - chipW) / 2;
      if (isCur) {
        ctx.shadowColor = rgba(color, 0.5);
        ctx.shadowBlur = unit * (0.4 + 0.2 * Math.abs(Math.sin(ms / 400)));
      }
      roundRect(ctx, chipX, stackY, chipW, chipH, chipH / 2);
      ctx.fillStyle = rgba(color, isCur ? 0.22 : 0.14);
      ctx.fill();
      ctx.shadowBlur = 0;
      roundRect(ctx, chipX, stackY, chipW, chipH, chipH / 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = isCur ? unit * 0.06 : unit * 0.035;
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.font = `700 ${px}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.fillText(mark.label, chipX + unit * 0.7, stackY + chipH / 2 + px * 0.35);
      ctx.textAlign = "right";
      ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
      ctx.fillStyle = color;
      ctx.fillText(rangeLabel, chipX + chipW - unit * 0.7, stackY + chipH / 2 + unit * 0.22);
      ctx.textAlign = "start";
      ctx.restore();
      stackY += chipH + unit * 0.4;
    });
    ctx.textAlign = "start";
    return;
  }

  // Horizontal: 1 row of 12 cells + gantt lanes beneath.
  const cellGap = unit * 0.25;
  const nCells = 12;
  const cellW = (contentW - cellGap * (nCells - 1)) / nCells;
  const cellH = Math.min(unit * 2.2, areaH * 0.3);
  const cellTop = areaTop;
  const cellX = (month: number) => contentX + (month - 1) * (cellW + cellGap);

  const lanes = assignLanes(scene.marks);
  const nLanes = Math.max(...lanes, 0) + 1;
  const ganttTop = cellTop + cellH + unit * 0.5;
  const ganttH = areaTop + areaH - ganttTop - unit * 0.3;
  const laneH = Math.min(ganttH / Math.max(nLanes, 1), unit * 2.0);
  const laneTop = ganttTop + Math.max(0, (ganttH - nLanes * laneH) / 2);

  // Which months are covered by an active/landed mark, for cell tinting.
  const monthTint = (month: number): { color: string; strength: number } | null => {
    let best: { color: string; strength: number } | null = null;
    scene.marks.forEach((mark, k) => {
      if (month < mark.from || month > mark.to) return;
      if (!markStarted(k)) return;
      const isCur = active === offset + k;
      const sweep = clamp01((easeInOutCubic(clamp01(markT(k) / 0.45)) * (mark.to - mark.from + 1)) );
      const reached = month - mark.from < sweep + 0.01 || markT(k) >= 0.45;
      if (!reached) return;
      const strength = isCur ? 1 : 0.45;
      if (!best || strength >= best.strength) best = { color: toneColor(mark.tone, accent, secondary), strength };
    });
    return best;
  };

  // Month cells.
  for (let month = 1; month <= 12; month++) {
    const x = cellX(month);
    const tint = monthTint(month);
    const gi = ghostIn;
    ctx.save();
    ctx.globalAlpha = gi;
    roundRect(ctx, x, cellTop, cellW, cellH, unit * 0.28);
    if (tint) {
      ctx.fillStyle = rgba(tint.color, 0.12 + 0.2 * tint.strength);
      ctx.fill();
      roundRect(ctx, x, cellTop, cellW, cellH, unit * 0.28);
      ctx.strokeStyle = rgba(tint.color, 0.4 + 0.5 * tint.strength);
      ctx.lineWidth = tint.strength >= 1 ? unit * 0.06 : unit * 0.04;
    } else {
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      roundRect(ctx, x, cellTop, cellW, cellH, unit * 0.28);
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.font = `700 ${Math.min(unit * 0.8, cellW * 0.42)}px ${FONT_SANS}`;
    ctx.fillStyle = tint ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(MONTHS[month - 1], x + cellW / 2, cellTop + cellH / 2 + unit * 0.28);
    ctx.textAlign = "start";
    ctx.restore();
  }

  // Gantt bands.
  scene.marks.forEach((mark, k) => {
    const t = markT(k);
    const lane = lanes[k];
    const y = laneTop + lane * laneH + laneH * 0.12;
    const h = laneH * 0.76;
    const x0 = cellX(mark.from);
    const x1 = cellX(mark.to) + cellW;
    const fullW = x1 - x0;

    if (t <= 0) {
      // Ghost band outline.
      const gi = ghostIn;
      if (gi <= 0) return;
      ctx.save();
      ctx.globalAlpha = 0.18 * gi;
      roundRect(ctx, x0, y, fullW, h, h / 2);
      ctx.strokeStyle = rgba(toneColor(mark.tone, accent, secondary), 0.8);
      ctx.lineWidth = unit * 0.04;
      ctx.setLineDash([unit * 0.3, unit * 0.25]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    const isCur = active === offset + k;
    const sweep = easeInOutCubic(clamp01(t / 0.45));
    const w = fullW * sweep;
    const color = toneColor(mark.tone, accent, secondary);

    ctx.save();
    ctx.globalAlpha = isCur ? 1 : 0.85;
    if (isCur) {
      ctx.shadowColor = rgba(color, 0.5);
      ctx.shadowBlur = unit * (0.4 + 0.25 * Math.abs(Math.sin(ms / 420)));
    }
    roundRect(ctx, x0, y, Math.max(w, h), h, h / 2);
    const grad = ctx.createLinearGradient(x0, 0, x0 + fullW, 0);
    grad.addColorStop(0, rgba(color, 0.85));
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Shimmer sweep on the active band.
    if (isCur && sweep >= 1) {
      ctx.save();
      roundRect(ctx, x0, y, fullW, h, h / 2);
      ctx.clip();
      const f = (ms % 2000) / 2000;
      const sx = x0 + (fullW + unit * 2) * f - unit;
      const sg = ctx.createLinearGradient(sx - unit, 0, sx + unit, 0);
      sg.addColorStop(0, "rgba(255,255,255,0)");
      sg.addColorStop(0.5, "rgba(255,255,255,0.28)");
      sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(sx - unit, y, unit * 2, h);
      ctx.restore();
    }

    // Label riding on the band.
    const labelIn = easeOutBack(clamp01((t - 0.2) / 0.3));
    if (labelIn > 0) {
      ctx.globalAlpha = (isCur ? 1 : 0.85) * clamp01(labelIn);
      const px = fitFontSize(ctx, mark.label, { maxW: fullW - unit * 0.8, startPx: h * 0.6, minPx: unit * 0.45, weight: 700 });
      ctx.font = `700 ${px}px ${FONT_SANS}`;
      ctx.fillStyle = "#06121a";
      ctx.textAlign = "center";
      const tw = ctx.measureText(mark.label).width;
      if (tw <= fullW - unit * 0.6) {
        ctx.fillText(mark.label, x0 + fullW / 2, y + h / 2 + px * 0.35);
      } else {
        // Too wide for the band — sit the label just above it.
        ctx.fillStyle = THEME.text;
        ctx.fillText(mark.label, x0 + fullW / 2, y - unit * 0.2);
      }
      ctx.textAlign = "start";
    }
    ctx.restore();
  });
  ctx.textAlign = "start";
}

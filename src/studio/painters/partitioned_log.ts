import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  drawArrowhead,
  pointAlongPolyline,
  strokePolylineProgress,
  flowDots,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type PLScene = Extract<Scene, { kind: "partitioned_log" }>;
type Step = PLScene["steps"][number];
type Pt = { x: number; y: number };
type ConsumerPos = { partitionId: string; offset: number };

const CELL_GAP_UNIT = 0.24;
const MAX_CELL_UNIT = 2.3;
const MIN_CELL_UNIT = 0.85;
const MARKER_BAND_UNIT = 1.5;
const ROW_GAP_UNIT = 0.6;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Sample a quadratic bezier a->ctrl->b into a polyline for arc-shaped rebalance moves. */
function bezierPts(a: Pt, ctrl: Pt, b: Pt, n = 20): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x, y: u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y });
  }
  return pts;
}

/** Records appended to each partition, replayed through step index k (inclusive). */
function recordsAt(scene: PLScene, k: number): Map<string, string[]> {
  const recs = new Map<string, string[]>(scene.partitions.map((p) => [p.id, [] as string[]]));
  const last = Math.min(k, scene.steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const st = scene.steps[i];
    if (st.op === "append" && st.partitionId) {
      const arr = recs.get(st.partitionId);
      if (arr) arr.push(st.value?.trim() || `r${arr.length}`);
    }
  }
  return recs;
}

/** Each consumer's (partition, offset) after replaying advance/rebalance ops through step k. */
function consumerStateAt(scene: PLScene, k: number): Map<string, ConsumerPos> {
  const pos = new Map<string, ConsumerPos>(scene.consumers.map((c) => [c.id, { partitionId: c.partitionId, offset: c.offset }]));
  const last = Math.min(k, scene.steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const st = scene.steps[i];
    if (st.op === "advance" && st.consumerId && st.toOffset != null) {
      const p = pos.get(st.consumerId);
      if (p) pos.set(st.consumerId, { partitionId: p.partitionId, offset: st.toOffset });
    } else if (st.op === "rebalance" && st.consumerId && st.toPartitionId) {
      pos.set(st.consumerId, { partitionId: st.toPartitionId, offset: st.toOffset ?? 0 });
    }
  }
  return pos;
}

/** Rebalance motion eases in, visibly HANGS mid-arc (the stop-the-world pause), then completes. */
function rebalanceEase(t: number): number {
  if (t < 0.35) return easeOutCubic(t / 0.35) * 0.45;
  if (t < 0.68) return 0.45 + ((t - 0.35) / 0.33) * 0.06;
  return 0.51 + easeInOutCubic((t - 0.68) / 0.32) * 0.49;
}

/**
 * Kafka-style append-only log: partitions[] are horizontal lanes of record
 * cells; producers append at the tail (pop-in with an incoming flow dot),
 * consumers are flag markers that either slide along a lane (advance, i.e.
 * offset commit) or arc between lanes (rebalance, with a visible mid-flight
 * pause + banner — the SLA-breaking freeze). Ghost cells (including one
 * trailing "log keeps growing" cell) hold the full lane shape from frame one.
 */
export function paintPartitionedLog(ctx: CanvasRenderingContext2D, scene: PLScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const step: Step | undefined = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const n = scene.partitions.length;
  const pIndex = new Map(scene.partitions.map((p, i) => [p.id, i] as const));

  // Grid sizing: fit the longest lane (+1 trailing "keeps growing" ghost) into contentW,
  // and n lanes (each cell row + a marker band above it) into contentH.
  const finalRecords = recordsAt(scene, scene.steps.length);
  const maxCount = Math.max(1, ...scene.partitions.map((p) => finalRecords.get(p.id)?.length ?? 0));
  const cols = maxCount + 1;
  const gutterL = vertical ? unit * 1.9 : unit * 2.6;
  const cellGap = unit * CELL_GAP_UNIT;
  const availW = contentW - gutterL;
  const widthCell = (availW - cellGap * (cols - 1)) / cols;
  const markerBandH = unit * MARKER_BAND_UNIT;
  const rowGap = unit * ROW_GAP_UNIT;
  const heightCell = (areaH - n * markerBandH - (n - 1) * rowGap) / n;
  const cellSize = Math.max(unit * MIN_CELL_UNIT, Math.min(widthCell, heightCell, unit * MAX_CELL_UNIT));

  const gridW = cols * cellSize + cellGap * (cols - 1);
  const gridX = contentX + gutterL + Math.max(0, (availW - gridW) / 2);
  const totalGridH = n * (markerBandH + cellSize) + (n - 1) * rowGap;
  let gridY = areaY + Math.max(0, (areaH - totalGridH) / 2);
  if (vertical) gridY = Math.max(Math.min(gridY, layout.h * 0.88 - totalGridH), areaY);

  const cellX = (c: number) => gridX + c * (cellSize + cellGap);
  const laneTop = (i: number) => gridY + i * (markerBandH + cellSize + rowGap);
  const cellRowY = (i: number) => laneTop(i) + markerBandH;
  const cellCenter = (i: number, c: number): Pt => ({ x: cellX(c) + cellSize / 2, y: cellRowY(i) + cellSize / 2 });
  const radius = cellSize * 0.16;

  const curRecords = recordsAt(scene, activeStep);
  const prevRecords = recordsAt(scene, activeStep - 1);
  const curPos = consumerStateAt(scene, activeStep);
  const prevPos = consumerStateAt(scene, activeStep - 1);

  const appendTargetId = step?.op === "append" ? step.partitionId : undefined;
  const isRebalancing = step?.op === "rebalance";
  const rebalancingConsumerId = isRebalancing ? step.consumerId : undefined;
  const advancingConsumerId = step?.op === "advance" ? step.consumerId : undefined;

  const spotlight = new Set<string>();
  if (appendTargetId) spotlight.add(appendTargetId);
  if (step?.op === "rebalance" && step.toPartitionId) spotlight.add(step.toPartitionId);
  if (advancingConsumerId) {
    const p = curPos.get(advancingConsumerId);
    if (p) spotlight.add(p.partitionId);
  }

  // --- Lanes: label chip + cell row (ghosts, settled records, the in-progress append). ---
  scene.partitions.forEach((part, i) => {
    const laneIn = easeOutCubic(enterT(env, 340, i * 70));
    if (laneIn <= 0) return;
    const rowY = cellRowY(i);
    const isSpot = spotlight.has(part.id);

    // Partition label chip.
    ctx.save();
    ctx.globalAlpha = introIn * laneIn;
    const chipW = gutterL - unit * 0.4;
    const chipH = Math.min(cellSize * 0.62, unit * 1.1);
    const chipX = contentX;
    const chipY = rowY + cellSize / 2 - chipH / 2;
    roundRect(ctx, chipX, chipY, chipW, chipH, chipH * 0.3);
    ctx.fillStyle = isSpot ? rgba(accent, 0.22) : THEME.panel;
    ctx.fill();
    ctx.strokeStyle = isSpot ? accent : "rgba(148,163,184,0.4)";
    ctx.lineWidth = isSpot ? unit * 0.09 : unit * 0.05;
    ctx.stroke();
    const labelPx = fitFontSize(ctx, part.label, { maxW: chipW * 0.86, startPx: unit * 0.58, minPx: unit * 0.4, weight: 700, family: FONT_MONO });
    ctx.font = `700 ${labelPx}px ${FONT_MONO}`;
    ctx.fillStyle = isSpot ? accent : THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(part.label, chipX + chipW / 2, chipY + chipH / 2);
    ctx.restore();

    const recs = curRecords.get(part.id) ?? [];
    const prevRecs = prevRecords.get(part.id) ?? [];
    const justAppended = appendTargetId === part.id && recs.length > prevRecs.length;

    for (let c = 0; c < cols; c++) {
      const x = cellX(c);
      const isTrailingGhost = c === maxCount; // the permanent "log keeps growing" slot
      const has = c < recs.length && !(justAppended && c === recs.length - 1);
      const isWriting = justAppended && c === recs.length - 1;

      if (isTrailingGhost || (!has && !isWriting)) {
        const ghostIn = easeOutCubic(enterT(env, 260, 120 + i * 70 + c * 30));
        if (ghostIn <= 0) continue;
        ctx.save();
        ctx.globalAlpha = introIn * laneIn * 0.16 * ghostIn;
        ctx.strokeStyle = "rgba(148,163,184,0.9)";
        ctx.lineWidth = unit * 0.05;
        ctx.setLineDash([unit * 0.24, unit * 0.2]);
        roundRect(ctx, x, rowY, cellSize, cellSize, radius);
        ctx.stroke();
        ctx.setLineDash([]);
        if (isTrailingGhost) {
          ctx.globalAlpha = introIn * laneIn * 0.4 * ghostIn;
          ctx.strokeStyle = "rgba(148,163,184,0.8)";
          drawArrowhead(ctx, x + cellSize * 0.66, rowY + cellSize / 2, 0, cellSize * 0.14);
        }
        ctx.restore();
        continue;
      }

      const value = isWriting ? recs[recs.length - 1] : recs[c];
      const local = isWriting ? clamp01(stepT / 0.5) : 1;
      const pop = isWriting ? easeOutBack(local) : 1;
      const fresh = isWriting && local >= 1;

      // Incoming producer flow dot riding into the cell during the first part of the append.
      if (isWriting && stepT < 0.45) {
        const from: Pt = { x: contentX + unit * 0.2, y: rowY + cellSize / 2 };
        const to = cellCenter(i, c);
        const p = lerp(from, to, easeOutCubic(clamp01(stepT / 0.4)));
        ctx.save();
        ctx.globalAlpha = introIn * laneIn * (1 - clamp01(stepT / 0.4) * 0.6);
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.5;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, unit * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = introIn * laneIn * clamp01(local * 1.4 + (isWriting ? 0 : 1));
      if (isWriting && local < 1) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.8;
      }
      roundRect(ctx, x, rowY, cellSize, cellSize, radius);
      ctx.fillStyle = fresh ? rgba(accent, 0.24 - 0.12 * idle(env, 1600)) : rgba(accent, 0.12);
      ctx.fill();
      ctx.shadowBlur = 0;
      roundRect(ctx, x, rowY, cellSize, cellSize, radius);
      ctx.strokeStyle = isWriting ? accent : rgba(accent, 0.55);
      ctx.lineWidth = unit * (isWriting ? 0.11 : 0.06);
      ctx.stroke();

      if (value != null) {
        const fontPx = fitFontSize(ctx, value, { maxW: cellSize * 0.8, startPx: cellSize * 0.42, minPx: Math.min(unit * 0.55, cellSize * 0.34), weight: 800, family: FONT_MONO });
        ctx.save();
        ctx.translate(cellX(c) + cellSize / 2, rowY + cellSize / 2);
        ctx.scale(pop, pop);
        ctx.font = `800 ${fontPx}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }
  });

  // --- Consumer flag markers: static, sliding (advance), or arcing (rebalance). ---
  const usedX = new Map<number, Set<number>>();
  const dedupeX = (laneI: number, x: number): number => {
    const set = usedX.get(laneI) ?? new Set<number>();
    let dx = x;
    let bump = 0;
    while (set.has(Math.round(dx))) {
      bump += 1;
      dx = x + bump * unit * 0.5;
    }
    set.add(Math.round(dx));
    usedX.set(laneI, set);
    return dx;
  };

  const drawFlag = (anchor: Pt, label: string, lagText: string | undefined, color: string, alpha: number, scale: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(anchor.x, anchor.y);
    ctx.scale(scale, scale);
    ctx.shadowColor = rgba(color, 0.5);
    ctx.shadowBlur = unit * 0.35;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-unit * 0.22, -unit * 0.32);
    ctx.lineTo(unit * 0.22, -unit * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `700 ${unit * 0.52}px ${FONT_SANS}`;
    const text = lagText ? `${label} · ${lagText}` : label;
    const tw = ctx.measureText(text).width;
    const chipW = tw + unit * 0.7;
    const chipH = unit * 0.92;
    roundRect(ctx, -chipW / 2, -unit * 0.32 - chipH, chipW, chipH, chipH * 0.32);
    ctx.fillStyle = "#0e2433";
    ctx.fill();
    ctx.strokeStyle = rgba(color, 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, -unit * 0.32 - chipH / 2);
    ctx.restore();
  };

  const pauseDim = isRebalancing ? (stepT < 0.82 ? 0.4 : 0.4 + 0.6 * easeOutCubic(clamp01((stepT - 0.82) / 0.18))) : 1;

  scene.consumers.forEach((c) => {
    const settled = curPos.get(c.id) ?? { partitionId: c.partitionId, offset: c.offset };
    const li = pIndex.get(settled.partitionId);
    if (li == null) return;
    const laneIn = easeOutCubic(enterT(env, 340, li * 70 + 120));
    if (laneIn <= 0) return;
    const recs = curRecords.get(settled.partitionId) ?? [];
    const lag = Math.max(0, recs.length - 1 - settled.offset);

    if (c.id === rebalancingConsumerId && step?.op === "rebalance" && step.toPartitionId) {
      const fromPos = prevPos.get(c.id) ?? { partitionId: c.partitionId, offset: c.offset };
      const fromLi = pIndex.get(fromPos.partitionId) ?? li;
      const fromCol = Math.min(fromPos.offset, cols - 1);
      const toCol = Math.min(settled.offset, cols - 1);
      const a: Pt = { x: cellX(fromCol) + cellSize / 2, y: cellRowY(fromLi) - unit * 0.1 };
      const b: Pt = { x: cellX(toCol) + cellSize / 2, y: cellRowY(li) - unit * 0.1 };
      const bulge = (fromLi === li ? unit * 1.6 : unit * 1.1) * (li >= fromLi ? 1 : -1);
      const ctrl: Pt = { x: (a.x + b.x) / 2 + unit * 1.9, y: (a.y + b.y) / 2 + bulge * 0.15 };
      const arc = bezierPts(a, ctrl, b, 24);
      const t = rebalanceEase(stepT);

      ctx.save();
      ctx.globalAlpha = introIn * laneIn * 0.8;
      ctx.strokeStyle = rgba(THEME.warn, 0.7);
      ctx.lineWidth = unit * 0.06;
      ctx.setLineDash([unit * 0.2, unit * 0.16]);
      strokePolylineProgress(ctx, arc, t);
      ctx.setLineDash([]);
      ctx.restore();
      if (t > 0.02) flowDots(ctx, arc.slice(0, Math.max(2, Math.round(t * arc.length))), env, { count: 2, speedMs: 700, r: unit * 0.11, color: THEME.warn });

      const pos = pointAlongPolyline(arc, t);
      const holding = stepT >= 0.35 && stepT < 0.68;
      const wobble = holding ? Math.sin(env.elapsedMs / 160) * unit * 0.05 : 0;
      drawFlag({ x: dedupeX(li, pos.x) + wobble, y: pos.y }, c.label, `lag ${lag}`, holding ? THEME.warn : accent, introIn * laneIn, holding ? 1.06 : 1);
      return;
    }

    let x = cellCenter(li, Math.min(settled.offset, cols - 1)).x;
    let scale = 1;
    if (c.id === advancingConsumerId && step?.op === "advance") {
      const fromCol = Math.min((prevPos.get(c.id) ?? settled).offset, cols - 1);
      const toCol = Math.min(settled.offset, cols - 1);
      const t = easeInOutCubic(clamp01(stepT));
      x = cellX(fromCol) + (cellX(toCol) - cellX(fromCol)) * t + cellSize / 2;
      scale = 1 + Math.sin(t * Math.PI) * 0.12;
    }
    const bob = (idle(env, 2200, li * 1.3) - 0.5) * unit * 0.06;
    const anchor: Pt = { x: dedupeX(li, x), y: cellRowY(li) - unit * 0.1 + bob };
    const dim = c.id === rebalancingConsumerId ? 1 : pauseDim;
    drawFlag(anchor, c.label, `lag ${lag}`, accent, introIn * laneIn * dim, scale);
  });

  // Rebalance banner — the visible "pause" that makes this failure mode legible.
  if (isRebalancing) {
    const bannerAlpha = Math.sin(clamp01(stepT) * Math.PI) * introIn;
    if (bannerAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = bannerAlpha;
      ctx.font = `800 ${unit * 0.62}px ${FONT_SANS}`;
      const text = "rebalancing — consumption paused";
      const tw = ctx.measureText(text).width;
      const bx = contentX + contentW / 2;
      const by = areaY + unit * 0.1;
      roundRect(ctx, bx - tw / 2 - unit * 0.6, by, tw + unit * 1.2, unit * 1.1, unit * 0.3);
      ctx.fillStyle = rgba(THEME.warn, 0.16);
      ctx.fill();
      ctx.strokeStyle = rgba(THEME.warn, 0.7);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = THEME.warn;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, bx, by + unit * 0.55);
      ctx.restore();
    }
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

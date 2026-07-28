import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  isoBox3D,
  flowDots,
  hashStr,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type LsmScene = Extract<Scene, { kind: "lsm_compaction" }>;
type Step = LsmScene["steps"][number];
type MemKey = { key: string; tomb: boolean };
type FileCard = { id: string; keys: string[]; tombstones: number };
type LsmState = { memtable: MemKey[]; levels: FileCard[][] };
type Pt = { x: number; y: number };

const CAP_PER_ROW = 6;

function clampLevel(l: number, n: number): number {
  return Math.max(0, Math.min(l, n - 1));
}

/** Pure state transition — the memtable/level layout after one step. Replayed
 *  from scratch every frame (cheap: <=14 steps) so rendering stays deterministic. */
function applyStep(state: LsmState, step: Step, i: number): LsmState {
  if (step.op === "write") {
    if (!step.key) return state;
    return { memtable: [...state.memtable, { key: step.key, tomb: step.tombstone }], levels: state.levels };
  }
  if (step.op === "flush") {
    const lvl = clampLevel(step.toLevel ?? step.fromLevel ?? 0, state.levels.length);
    const keys = state.memtable.map((m) => m.key);
    const tombstones = state.memtable.filter((m) => m.tomb).length;
    const card: FileCard = { id: step.resultId || `f${i}`, keys, tombstones };
    return { memtable: [], levels: state.levels.map((row, L) => (L === lvl ? [...row, card] : row)) };
  }
  // compact: remove the merged source files from wherever they live, append the
  // merged result to the target level. Leveled (fromLevel!==toLevel) and
  // size-tiered (fromLevel===toLevel) compaction are the same operation here.
  const to = clampLevel(step.toLevel ?? (step.fromLevel ?? 0) + 1, state.levels.length);
  const removeIds = new Set(step.fileIds);
  const filtered = state.levels.map((row) => row.filter((f) => !removeIds.has(f.id)));
  const card: FileCard = { id: step.resultId || `f${i}`, keys: step.keys, tombstones: 0 };
  return { memtable: state.memtable, levels: filtered.map((row, L) => (L === to ? [...row, card] : row)) };
}

function replayThrough(scene: LsmScene, count: number): LsmState {
  let st: LsmState = { memtable: [], levels: Array.from({ length: scene.levelCount }, () => [] as FileCard[]) };
  for (let i = 0; i < count; i++) st = applyStep(st, scene.steps[i], i);
  return st;
}

/**
 * LSM-tree write path: an in-memory memtable filling with keys, flushing to an
 * immutable L0 SSTable, and background compaction merging overlapping files
 * (dropping tombstones) into the next level. Generalises size-tiered and
 * leveled compaction — the schema just says which files merge into which
 * level; this painter doesn't assume a strategy.
 */
export function paintLsmCompaction(ctx: CanvasRenderingContext2D, scene: LsmScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const step = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const before = replayThrough(scene, Math.max(0, activeStep));

  const memH = Math.min(unit * 2.7, areaH * 0.26);
  const gapY = unit * 0.5;
  const levelsY = areaY + memH + gapY;
  const levelsH = Math.max(unit * 2, areaY + areaH - levelsY);
  const rowH = levelsH / scene.levelCount;

  const drawKeyChip = (cx: number, cy: number, w: number, h: number, label: string, tomb: boolean, alpha: number, glow: boolean) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.55;
    }
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, unit * 0.18);
    ctx.fillStyle = tomb ? rgba(THEME.warn, 0.16) : rgba(accent, 0.16);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = tomb ? THEME.warn : accent;
    ctx.lineWidth = unit * 0.055;
    ctx.stroke();
    const px = fitFontSize(ctx, label, { maxW: w * 0.82, startPx: unit * 0.56, minPx: unit * 0.36, weight: 700, family: FONT_MONO });
    ctx.font = `700 ${px}px ${FONT_MONO}`;
    ctx.fillStyle = tomb ? THEME.warn : THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy);
    if (tomb) {
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.34, cy);
      ctx.lineTo(cx + w * 0.34, cy);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawGhostSlot = (cx: number, cy: number, w: number, h: number, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(148,163,184,0.5)";
    ctx.setLineDash([unit * 0.16, unit * 0.14]);
    ctx.lineWidth = unit * 0.04;
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, unit * 0.18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  // --- Memtable panel -------------------------------------------------
  const memX = contentX;
  const memY = areaY;
  const memW = contentW;
  const memIn = easeOutCubic(enterT(env, 420, 40));
  ctx.save();
  ctx.globalAlpha = introIn * memIn;
  roundRect(ctx, memX, memY, memW, memH, unit * 0.35);
  ctx.fillStyle = rgba(secondary, 0.07);
  ctx.fill();
  ctx.strokeStyle = rgba(secondary, 0.55);
  ctx.lineWidth = unit * 0.05;
  ctx.stroke();
  ctx.font = `800 ${unit * 0.55}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("MEMTABLE", memX + unit * 0.45, memY + unit * 0.75);
  ctx.restore();

  const writeStep = step && step.op === "write" && step.key ? step : undefined;
  const isWriteActive = !!writeStep;
  const isFlushActive = step?.op === "flush";
  const cap = scene.memtableCapacity;
  const slotGap = unit * 0.26;
  const slotAreaX = memX + unit * 0.45;
  const slotAreaW = memW - unit * 0.9;
  const slotW = Math.min((slotAreaW - slotGap * (cap - 1)) / cap, unit * 2.1);
  const slotH = memH - unit * 1.25;
  const slotCy = memY + unit * 0.9 + slotH / 2;
  const settled = before.memtable;
  const totalMemCount = settled.length + (isWriteActive ? 1 : 0);
  const overflowMem = totalMemCount > cap;
  const memAlpha = introIn * memIn * (isFlushActive ? 1 - easeOutCubic(stepT) : 1);
  const memCenter: Pt = { x: memX + memW / 2, y: memY + memH / 2 };

  for (let j = 0; j < cap; j++) {
    const cx = slotAreaX + j * (slotW + slotGap) + slotW / 2;
    if (overflowMem && j === cap - 1) {
      drawKeyChip(cx, slotCy, slotW, slotH, `+${totalMemCount - (cap - 1)}`, false, memAlpha, false);
      continue;
    }
    if (j < settled.length) {
      drawKeyChip(cx, slotCy, slotW, slotH, settled[j].key, settled[j].tomb, memAlpha, false);
    } else if (j === settled.length && writeStep) {
      const local = easeOutBack(clamp01(stepT * 1.3));
      const dropIn = clamp01(stepT * 3);
      const fromY = slotCy - slotH * 1.6 * (1 - dropIn);
      drawKeyChip(cx, fromY, slotW * (0.6 + 0.4 * local), slotH * (0.6 + 0.4 * local), writeStep.key!, writeStep.tombstone, introIn * dropIn, true);
    } else {
      drawGhostSlot(cx, slotCy, slotW, slotH, 0.14 * introIn * memIn);
    }
  }

  // --- Level rows -------------------------------------------------
  const removeIds = step?.op === "compact" ? new Set(step.fileIds) : new Set<string>();
  const compactTo = step?.op === "compact" ? clampLevel(step.toLevel ?? (step.fromLevel ?? 0) + 1, scene.levelCount) : -1;
  const flushTo = step?.op === "flush" ? clampLevel(step.toLevel ?? step.fromLevel ?? 0, scene.levelCount) : -1;

  let flushTarget: Pt | null = null;
  const compactSources: Pt[] = [];
  let compactTarget: Pt | null = null;

  for (let L = 0; L < scene.levelCount; L++) {
    const rowY = levelsY + L * rowH;
    const rowIn = easeOutCubic(enterT(env, 380, 100 + L * 60));
    ctx.save();
    ctx.globalAlpha = introIn * rowIn;
    ctx.font = `800 ${unit * 0.55}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "start";
    ctx.textBaseline = "middle";
    ctx.fillText(`L${L}`, contentX, rowY + rowH / 2);
    ctx.restore();

    const gutterL = unit * 1.3;
    const rowX = contentX + gutterL;
    const rowW = contentW - gutterL;
    const cardsBefore = before.levels[L] ?? [];
    const isTargetHere = (isFlushActive && flushTo === L) || (step?.op === "compact" && compactTo === L);
    const totalSlots = cardsBefore.length + (isTargetHere ? 1 : 0);
    const overflow = totalSlots > CAP_PER_ROW;
    const shown = overflow ? CAP_PER_ROW : Math.max(totalSlots, 1);
    const gap = unit * 0.3;
    const cardW = Math.max(unit * 1.3, Math.min((rowW - gap * (shown - 1)) / shown, unit * 2.5));
    const cardH = Math.min(rowH * 0.68, unit * 2.0);
    const cardCy = rowY + rowH / 2;
    const centerAt = (i: number) => rowX + i * (cardW + gap) + cardW / 2;

    const drawCard = (i: number, card: FileCard, alpha: number, scale: number, glow: boolean) => {
      const cx = centerAt(i);
      const cy = cardCy;
      const w = cardW * scale;
      const h = cardH * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      isoBox3D(ctx, cx - w / 2, cy - h / 2, w, h, unit * 0.28, secondary, glow ? accentGlow : undefined);
      const idPx = Math.min(unit * 0.5, h * 0.26);
      ctx.font = `700 ${idPx}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(card.id, cx, cy - h * 0.12);
      const preview = card.keys.length ? card.keys.slice(0, 2).join(",") + (card.keys.length > 2 ? "…" : "") : "—";
      ctx.font = `600 ${Math.min(unit * 0.38, h * 0.2)}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(preview, cx, cy + h * 0.22);
      if (card.tombstones > 0) {
        const badge = `×${card.tombstones}`;
        ctx.font = `800 ${unit * 0.4}px ${FONT_SANS}`;
        const bw = ctx.measureText(badge).width;
        const bx = cx + w / 2 - bw / 2 - unit * 0.15;
        const by = cy - h / 2 - unit * 0.1;
        ctx.fillStyle = THEME.warn;
        roundRect(ctx, bx - bw / 2 - unit * 0.12, by - unit * 0.32, bw + unit * 0.24, unit * 0.56, unit * 0.2);
        ctx.fill();
        ctx.fillStyle = "#1a1204";
        ctx.fillText(badge, bx, by - unit * 0.03);
      }
      ctx.restore();
    };

    cardsBefore.forEach((card, i) => {
      if (overflow && i >= shown - 1) return; // folded into the "+N" badge
      if (removeIds.has(card.id)) {
        const local = easeOutCubic(stepT);
        const pt = { x: centerAt(i), y: cardCy };
        compactSources.push(pt);
        drawCard(i, card, introIn * rowIn * (1 - local), 1 - 0.25 * local, false);
        return;
      }
      const isNewest = i === cardsBefore.length - 1 && !isTargetHere;
      const breathe = isNewest ? 0.92 + 0.08 * idle(env, 2000) : 1;
      drawCard(i, card, introIn * rowIn, breathe, false);
    });
    if (overflow) {
      const badgeIdx = shown - 1;
      drawKeyChip(centerAt(badgeIdx), cardCy, cardW, cardH, `+${totalSlots - badgeIdx}`, false, introIn * rowIn, false);
    }

    if (isTargetHere && step && (!overflow || cardsBefore.length < shown - 1)) {
      const idx = cardsBefore.length;
      const growT = easeOutBack(clamp01(stepT));
      let incoming: FileCard;
      if (step.op === "flush" && flushTo === L) {
        incoming = {
          id: step.resultId || `L${L}`,
          keys: before.memtable.map((m) => m.key),
          tombstones: before.memtable.filter((m) => m.tomb).length,
        };
      } else if (step.op === "compact" && compactTo === L) {
        incoming = { id: step.resultId || `L${L}`, keys: step.keys, tombstones: 0 };
      } else {
        incoming = { id: `L${L}`, keys: [], tombstones: 0 };
      }
      const pt = { x: centerAt(idx), y: cardCy };
      if (flushTo === L) flushTarget = pt;
      if (compactTo === L) compactTarget = pt;
      drawCard(idx, incoming, introIn * clamp01(stepT * 2), 0.5 + 0.5 * growT, stepT < 1);
    }
  }

  // --- Connecting flow: memtable -> new SSTable, or merging files -> result --
  if (isFlushActive && flushTarget && stepT > 0.02) {
    const pts: Pt[] = [memCenter, flushTarget];
    ctx.save();
    ctx.globalAlpha = introIn * (0.5 + 0.4 * (1 - stepT));
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = unit * 0.06;
    ctx.setLineDash([unit * 0.22, unit * 0.18]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    flowDots(ctx, pts, env, { count: 3, speedMs: 900, r: unit * 0.12, color: accent });
  }

  if (step?.op === "compact" && compactTarget) {
    const target = compactTarget;
    compactSources.forEach((src) => {
      ctx.save();
      ctx.globalAlpha = introIn * (0.35 + 0.35 * (1 - stepT));
      ctx.strokeStyle = rgba(accent, 0.45);
      ctx.lineWidth = unit * 0.055;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.restore();
      flowDots(ctx, [src, target], env, { count: 2, speedMs: 800, r: unit * 0.1, color: accent });
    });

    // Tombstones dropped during the merge: a few fading marks near the result.
    const dropped = Math.min(step.droppedTombstones, 4);
    if (dropped > 0) {
      const pulse = Math.sin(clamp01(stepT) * Math.PI);
      for (let i = 0; i < dropped; i++) {
        const h = hashStr(`${scene.id}#${activeStep}#${i}`);
        const ox = ((h % 100) / 100 - 0.5) * unit * 2.2;
        const oy = ((Math.floor(h / 100) % 100) / 100 - 0.5) * unit * 1.4 - unit * 0.6 * clamp01(stepT);
        ctx.save();
        ctx.globalAlpha = pulse * 0.85 * introIn;
        ctx.font = `700 ${unit * 0.55}px ${FONT_SANS}`;
        ctx.fillStyle = THEME.warn;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("×", target.x + ox, target.y + oy);
        ctx.restore();
      }
    }
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

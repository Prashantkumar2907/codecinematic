import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  shade,
  rgba,
  drawSceneTitle,
  fitFontSize,
  wrapText,
  beatT,
  activeBeatIndex,
  roundedCorners,
  glowRing,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type JigsawScene = Extract<Scene, { kind: "jigsaw_puzzle" }>;

type Pt = { x: number; y: number };
/** Middle-edge feature: 0 flat, +1 tab (bulges outward), -1 blank (notch inward). */
type Knob = -1 | 0 | 1;

const LABEL_LIGHT = "#f2f7ff";

/**
 * Points along one axis-aligned edge from `from`→`to` with an optional jigsaw
 * knob at its midpoint. `outX/outY` is the edge's OUTWARD normal; a tab (knob=1)
 * bulges along it, a blank (knob=-1) bites inward the same depth — so an
 * adjacent piece's tab nests exactly into this piece's blank. Excludes `from`,
 * includes `to`.
 */
function edgePoints(from: Pt, to: Pt, knob: Knob, outX: number, outY: number, hw: number, dp: number): Pt[] {
  if (knob === 0) return [to];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const d = dp * knob;
  const n1 = { x: mx - ux * hw, y: my - uy * hw };
  const n2 = { x: mx + ux * hw, y: my + uy * hw };
  const t1 = { x: n1.x + outX * d, y: n1.y + outY * d };
  const t2 = { x: n2.x + outX * d, y: n2.y + outY * d };
  return [n1, t1, t2, n2, to];
}

/** Clockwise jigsaw outline for a rect, with per-edge knobs. */
function pieceOutline(
  x: number,
  y: number,
  w: number,
  h: number,
  knobs: { top: Knob; right: Knob; bottom: Knob; left: Knob },
  hw: number,
  dp: number
): Pt[] {
  const TL = { x, y };
  const TR = { x: x + w, y };
  const BR = { x: x + w, y: y + h };
  const BL = { x, y: y + h };
  const v: Pt[] = [TL];
  v.push(...edgePoints(TL, TR, knobs.top, 0, -1, hw, dp));
  v.push(...edgePoints(TR, BR, knobs.right, 1, 0, hw, dp));
  v.push(...edgePoints(BR, BL, knobs.bottom, 0, 1, hw, dp));
  v.push(...edgePoints(BL, TL, knobs.left, -1, 0, hw, dp));
  v.pop(); // drop the closing TL duplicate
  return v;
}

/** Round every corner of a CLOSED polygon (roundedCorners leaves the two ends sharp). */
function roundClosed(pts: Pt[], r: number): Pt[] {
  if (pts.length < 3) return pts;
  const ext = [pts[pts.length - 1], ...pts, pts[0]];
  const rounded = roundedCorners(ext, r);
  return rounded.slice(1, rounded.length - 1);
}

function tracePoly(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/**
 * Abstract concepts as interlocking jigsaw pieces. Each piece reveals on its
 * beat, sliding in from an alternating side and snapping (easeOutBack) into a
 * home slot whose tab/blank mate exactly with its neighbour — the visual claim
 * that two protocols/policies are COMPLEMENTARY halves of one whole. A piece
 * with `fits:false` slides toward its slot but never seats: it hovers just off
 * the empty (still-dashed) slot and rattles, showing the mismatch. Lays a
 * left→right row in 16:9 and a top→bottom stack in 9:16.
 */
export function paintJigsawPuzzle(ctx: CanvasRenderingContext2D, scene: JigsawScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary } = env.palette;
  const horizontal = !vertical;
  const n = scene.pieces.length;

  const offset = introBeatCount(scene);
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeIdx = active - offset;
  const stepT = activeIdx >= 0 ? beatT(env.beats, offset + activeIdx, totalBeats, env.p) : 0;
  const groupIn = easeOutCubic(enterT(env, 420));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.5;
  const areaX = contentX;
  const areaY = contentY + band;
  const areaW = contentW;
  const areaH = contentH - band;

  // Baseline (knob-free) rect for each piece; tabs nest into neighbour blanks so
  // consecutive baselines simply touch. Sized to fit the available box per axis.
  let pw: number;
  let ph: number;
  if (horizontal) {
    pw = Math.min((areaW * 0.94) / n, unit * 7.5);
    ph = Math.min(areaH * 0.72, unit * 7, pw * 1.2);
  } else {
    ph = Math.min((areaH * 0.94) / n, unit * 5.6);
    pw = Math.min(areaW * 0.82, unit * 9.5, ph * 1.7);
  }
  const puzzleW = horizontal ? n * pw : pw;
  const puzzleH = horizontal ? ph : n * ph;
  const startX = areaX + (areaW - puzzleW) / 2;
  const startY = areaY + (areaH - puzzleH) / 2;

  const homeRect = (i: number) => (horizontal ? { x: startX + i * pw, y: startY } : { x: startX, y: startY + i * ph });
  const knobDim = Math.min(pw, ph);
  const hw = knobDim * 0.15;
  const dp = knobDim * 0.17;
  const corner = knobDim * 0.06;

  const knobsFor = (i: number): { top: Knob; right: Knob; bottom: Knob; left: Knob } => {
    if (horizontal) return { top: 0, bottom: 0, right: i < n - 1 ? 1 : 0, left: i > 0 ? -1 : 0 };
    return { left: 0, right: 0, bottom: i < n - 1 ? 1 : 0, top: i > 0 ? -1 : 0 };
  };

  // Perpendicular entry axis + the axis a stuck piece rattles along.
  const perp: Pt = horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const rattle: Pt = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const slideDist = (horizontal ? areaH : areaW) * 0.85;
  // A non-fitting piece hovers this far off its slot on rest — clamped to the
  // room actually available above/below (or left/right) the row so a large
  // piece (few pieces => big pw/ph) can't hover off the row into the title.
  const headroomA = horizontal ? startY - areaY : startX - areaX;
  const headroomB = horizontal ? areaY + areaH - (startY + ph) : areaX + areaW - (startX + pw);
  const restGap = Math.max(unit * 0.4, Math.min((horizontal ? ph : pw) * 0.44, headroomA, headroomB));

  const drawGhost = (i: number, alpha: number) => {
    const { x, y } = homeRect(i);
    const poly = roundClosed(pieceOutline(x, y, pw, ph, knobsFor(i), hw, dp), corner);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(148,163,184,0.9)";
    ctx.lineWidth = unit * 0.05;
    ctx.setLineDash([unit * 0.4, unit * 0.32]);
    tracePoly(ctx, poly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  const drawPiece = (i: number, off: Pt, alpha: number, faceHex: string, glow: string | null) => {
    const { x, y } = homeRect(i);
    const px = x + off.x;
    const py = y + off.y;
    const poly = roundClosed(pieceOutline(px, py, pw, ph, knobsFor(i), hw, dp), corner);
    const cx = px + pw / 2;
    const cy = py + ph / 2;

    ctx.save();
    ctx.globalAlpha = groupIn * alpha;
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = knobDim * 0.45;
    }
    tracePoly(ctx, poly);
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, shade(faceHex, 0.12));
    g.addColorStop(1, shade(faceHex, -0.16));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    tracePoly(ctx, poly);
    ctx.strokeStyle = glow ?? shade(faceHex, 0.34);
    ctx.lineWidth = unit * (glow ? 0.11 : 0.07);
    ctx.stroke();
    // Inner sheen line for a little dimensionality.
    ctx.globalAlpha = groupIn * alpha * 0.5;
    ctx.strokeStyle = rgba("#ffffff", 0.16);
    ctx.lineWidth = unit * 0.04;
    ctx.stroke();

    const piece = scene.pieces[i];
    const hasSub = !!piece.sub;
    let ty = cy;
    if (piece.icon) {
      drawIcon(ctx, piece.icon, cx, cy - ph * 0.24, ph * 0.3, env, LABEL_LIGHT);
      ty = cy + ph * 0.04;
    }
    ctx.globalAlpha = groupIn * alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxW = pw * 0.82;
    const labelPx = fitFontSize(ctx, piece.label, { maxW, startPx: knobDim * 0.34, minPx: knobDim * 0.2, weight: 800 });
    ctx.font = `800 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = LABEL_LIGHT;
    const lines = ctx.measureText(piece.label).width > maxW ? wrapText(ctx, piece.label, maxW).slice(0, 2) : [piece.label];
    lines.forEach((ln, k) => ctx.fillText(ln, cx, ty + (k - (lines.length - 1) / 2) * labelPx * 1.14));
    if (hasSub) {
      const subPx = fitFontSize(ctx, piece.sub as string, { maxW, startPx: knobDim * 0.18, minPx: knobDim * 0.11, weight: 600 });
      ctx.font = `600 ${subPx}px ${FONT_SANS}`;
      ctx.fillStyle = rgba("#ffffff", 0.72);
      ctx.fillText(piece.sub as string, cx, ty + lines.length * labelPx * 0.72 + knobDim * 0.16);
    }
    ctx.restore();
  };

  // Slots/ghosts first so pieces sit on top of them.
  for (let i = 0; i < n; i++) {
    const revealed = i < activeIdx || (i === activeIdx && scene.pieces[i].fits && stepT > 0.85);
    if (!revealed) {
      const ghostIn = enterT(env, 320, 120 + i * 90);
      if (ghostIn > 0) drawGhost(i, 0.16 * groupIn * easeOutCubic(ghostIn));
    } else if (!scene.pieces[i].fits) {
      drawGhost(i, 0.16 * groupIn); // stays visibly empty next to the rattling piece
    }
  }

  // Pieces, oldest first (later pieces' blanks let earlier tabs show through).
  for (let i = 0; i <= activeIdx; i++) {
    const piece = scene.pieces[i];
    const isActive = i === activeIdx;
    const t = isActive ? clamp01(stepT) : 1;
    if (t <= 0) continue;
    const appear = isActive ? clamp01(stepT * 2.2) : 1;
    const entrySign = i % 2 === 0 ? -1 : 1;

    let off: Pt;
    let glow: string | null = null;
    let faceHex: string;
    if (piece.fits) {
      faceHex = i % 2 === 0 ? accent : secondary;
      const e = isActive ? easeOutBack(clamp01(stepT * 1.15)) : 1;
      const k = 1 - e; // eased 1→0 (with a slight overshoot past 0 for a snap)
      off = { x: perp.x * entrySign * slideDist * k, y: perp.y * entrySign * slideDist * k };
      if (isActive && stepT > 0.6) {
        const flash = clamp01((stepT - 0.6) / 0.25) * (1 - clamp01((stepT - 0.85) / 0.15));
        glow = rgba(accent, 0.35 + 0.5 * flash);
      } else if (i === activeIdx) {
        glow = rgba(accent, 0.3 + 0.3 * idle(env, 1600));
      }
    } else {
      faceHex = THEME.warn;
      const e = isActive ? easeOutCubic(clamp01(stepT * 1.3)) : 1;
      const cur = slideDist + (restGap - slideDist) * e; // far → hovering just off the slot
      const settled = isActive ? clamp01((stepT - 0.5) * 2) : 1;
      const shake = Math.sin(env.elapsedMs / 68) * knobDim * 0.06 * settled;
      off = {
        x: perp.x * entrySign * cur + rattle.x * shake,
        y: perp.y * entrySign * cur + rattle.y * shake,
      };
      glow = rgba(THEME.warn, 0.32 + 0.28 * idle(env, 900));
    }
    drawPiece(i, off, appear, faceHex, glow);

    // Pulsing joint where a freshly-seated fitting piece meets its neighbour.
    if (piece.fits && i > 0 && scene.pieces[i - 1].fits) {
      const seat = isActive ? clamp01((stepT - 0.8) / 0.2) : 1;
      if (seat > 0) {
        const { x, y } = homeRect(i);
        const jx = horizontal ? x : x + pw / 2;
        const jy = horizontal ? y + ph / 2 : y;
        ctx.save();
        ctx.globalAlpha = groupIn * seat;
        glowRing(ctx, jx, jy, knobDim * 0.16, accent, env, 1500);
        ctx.restore();
      }
    }
  }

  // "Not-fit" marker: a warn cross on the empty seam of the rattling piece.
  if (activeIdx >= 0 && !scene.pieces[activeIdx].fits && stepT > 0.55) {
    const { x, y } = homeRect(activeIdx);
    const mx = horizontal ? (activeIdx === 0 ? x + pw : x) : x + pw / 2;
    const my = horizontal ? y + ph / 2 : activeIdx === 0 ? y + ph : y;
    const r = knobDim * 0.16;
    const puls = 0.6 + 0.4 * idle(env, 700);
    ctx.save();
    ctx.globalAlpha = groupIn * clamp01((stepT - 0.55) / 0.2) * puls;
    ctx.strokeStyle = THEME.warn;
    ctx.lineWidth = unit * 0.12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(mx - r, my - r);
    ctx.lineTo(mx + r, my + r);
    ctx.moveTo(mx + r, my - r);
    ctx.lineTo(mx - r, my + r);
    ctx.stroke();
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

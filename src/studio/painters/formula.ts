import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  enterT,
  idle,
  sub,
  clamp01,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatWindow,
  activeBeatIndex,
  rgba,
  shade,
  lerpColor,
  STROKE,
  RADIUS,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

const IDLE_FACE_LIFT = 0.09;
const ACTIVE_TINT = 0.24;

type FormulaScene = Extract<Scene, { kind: "formula" }>;

const INK_PANEL = THEME.bgBottom;

/** Count-up of a numeric result; keeps a trailing non-numeric suffix intact. */
function fmtCount(target: string, t: number): string {
  const m = target.match(/^(-?\d[\d,]*\.?\d*)(.*)$/);
  if (!m) return target;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(num)) return target;
  const suffix = m[2];
  const v = num * t;
  const shown = Number.isInteger(num) ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
  return `${shown}${suffix}`;
}

export function paintFormula(ctx: CanvasRenderingContext2D, scene: FormulaScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.terms.length + (scene.sayResult ? 1 : 0);
  const resultBeat = scene.sayResult ? totalBeats - 1 : -1;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const leave = departT(env, 380);
  if (leave <= 0) return;
  const frameIn = easeOutCubic(enterT(env, 400)) * leave;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.5;
  const areaY = contentY + band;
  // `contentH` put the result line at ~85% of frame height, under the burned-in caption.
  const areaH = Math.max(unit * 4, layout.safeBottom - areaY);

  // Full equation as a token list: lhs symbol, "=", then op+symbol per term.
  const tokens: { text: string; kind: "lhs" | "eq" | "op" | "term"; termIndex?: number }[] = [
    { text: scene.lhs.symbol, kind: "lhs" },
    { text: "=", kind: "eq" },
  ];
  scene.terms.forEach((t, i) => {
    if (t.op) tokens.push({ text: t.op, kind: "op", termIndex: i });
    tokens.push({ text: t.symbol, kind: "term", termIndex: i });
  });

  const termBeatFrac = (i: number) => {
    const win = beatWindow(env.beats, offset + i, totalBeats);
    return { started: env.p >= win.start, t: clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001)) };
  };

  const nBlocks = tokens.filter(tk => tk.kind === "lhs" || tk.kind === "term").length;
  const rect = { x: contentX, y: areaY, w: contentW, h: areaH * 0.7 };
  /**
   * Tiles are a PIXEL row and the slabs are mapped onto it. They used to be spread in
   * world space and viewed from (0, 12, 10), so each tile rendered a different size and
   * every symbol — placed at the projected centre plus a pixel offset — floated above
   * the tile it names instead of sitting on it.
   * `qa/ledger.json` → systemic `2d-layout-round-tripped-through-camera`.
   */
  const tilePitch = contentW / Math.max(nBlocks, 1);
  const tileW = Math.min(tilePitch - unit * 0.4, unit * 5.2);
  const tileH = Math.min(tileW * 0.9, areaH * 0.3);
  const rowCY = areaY + areaH * 0.42;
  const tileRect = (i: number) => ({
    x: contentX + i * tilePitch + (tilePitch - tileW) / 2,
    y: rowCY - tileH / 2,
    w: tileW,
    h: tileH,
    cx: contentX + (i + 0.5) * tilePitch,
    cy: rowCY,
  });

  /**
   * No 3D layer. Each term's tile was a slab placed from a pixel rect on an even pitch,
   * but the symbols are laid out by TEXT FLOW (measured glyph widths, operators
   * interpolated between terms), so the two were never the same row: the tiles sat about
   * half a tile to the right of the symbols they belong to. The tile is decorative — a
   * panel behind a glyph — so it is drawn in 2D at the glyph's own position, where it
   * cannot drift.
   */

  const eqText = tokens.map((tk) => tk.text).join(" ");
  const eqPx = fitFontSize(ctx, eqText, {
    maxW: contentW * 0.94,
    startPx: vertical ? unit * 1.9 : unit * 2.3,
    minPx: unit * 1.0,
    weight: 800,
  });

  const eqPulse = 1 + 0.06 * (idle(env, 2500) - 0.5);

  ctx.textAlign = "center";
  
  let bIdx = 0;
  const blockPositions: { x: number, y: number, kind: string, termIndex?: number }[] = [];
  
  tokens.forEach((tk) => {
    if (tk.kind === "lhs" || tk.kind === "term") {
        const tr = tileRect(bIdx);
        let isActive = false;
        if (tk.kind === "term" && tk.termIndex !== undefined) {
           isActive = active === offset + tk.termIndex;
        } else if (tk.kind === "lhs") {
           isActive = resultBeat >= 0 && active >= resultBeat;
        }
        // On the tile, not above it: the old offset lifted the symbol a full 1.5u off a
        // projected centre that was already in the wrong place.
        const pop = isActive ? unit * 0.35 : 0;
        blockPositions.push({ x: tr.cx, y: tr.cy - pop, kind: tk.kind, termIndex: tk.termIndex });
        bIdx++;
    }
  });

  // Widths first, positions second. An operator has to be placed in the GAP between the
  // two panels beside it, and the panel is as wide as its glyph — interpolating between
  // panel CENTRES put the "x" inside the much wider (1+r)^n panel.
  ctx.font = `800 ${eqPx}px ${FONT_SANS}`;
  const widths: number[] = tokens.map((tk) => ctx.measureText(tk.text).width);
  const blockTokenIdx: number[] = [];
  tokens.forEach((tk, ti) => {
    if (tk.kind === "lhs" || tk.kind === "term") blockTokenIdx.push(ti);
  });
  const panelPadX = unit * 0.55;
  const xs: number[] = [];
  let blockIter = 0;

  tokens.forEach((tk, ti) => {
    const w = widths[ti];
    if (tk.kind === "lhs" || tk.kind === "term") {
      xs.push(blockPositions[blockIter].x - w / 2);
      blockIter++;
    } else if (blockIter > 0 && blockIter < blockPositions.length) {
      const leftTi = blockTokenIdx[blockIter - 1];
      const rightTi = blockTokenIdx[blockIter];
      const leftEdge = blockPositions[blockIter - 1].x + widths[leftTi] / 2 + panelPadX;
      const rightEdge = blockPositions[blockIter].x - widths[rightTi] / 2 - panelPadX;
      xs.push((leftEdge + rightEdge) / 2 - w / 2);
    } else {
      xs.push(contentX + contentW / 2);
    }
  });

  tokens.forEach((tk, ti) => {
    const w = widths[ti];
    const cx = xs[ti] + w / 2;
    // For operators, use the interpolated position.
    let cy = rect.y + rect.h / 2; // Default for eq/op
    if (tk.kind === "lhs" || tk.kind === "term") {
        const bPos = blockPositions.find(bp => bp.kind === tk.kind && bp.termIndex === tk.termIndex);
        if (bPos) {
           cy = bPos.y - unit * 1.0;
        }
    } else {
        // interpolate Y as well for op/eq based on surrounding blocks
        if (tk.kind === "eq" && blockPositions.length > 1) {
             const p1 = blockPositions[0];
             const p2 = blockPositions[1];
             cy = (p1.y + p2.y) / 2 - unit * 1.0;
        } else if (tk.kind === "op" && tk.termIndex !== undefined) {
             const p2 = blockPositions.find(bp => bp.kind === "term" && bp.termIndex === tk.termIndex);
             const p1Index = blockPositions.findIndex(bp => bp.kind === "term" && bp.termIndex === tk.termIndex) - 1;
             if (p2 && p1Index >= 0) {
                 const p1 = blockPositions[p1Index];
                 cy = (p1.y + p2.y) / 2 - unit * 1.0;
             }
        }
    }

    if (tk.kind === "lhs" || tk.kind === "term") {
      // The panel, drawn where the glyph actually is.
      const isActive =
        tk.kind === "term" && tk.termIndex !== undefined
          ? active === offset + tk.termIndex
          : resultBeat >= 0 && active >= resultBeat;
      const padX = panelPadX;
      const padY = unit * 0.45;
      const pw = w + padX * 2;
      const ph = eqPx * 1.25 + padY * 2;
      ctx.save();
      ctx.globalAlpha = frameIn;
      roundRect(ctx, cx - pw / 2, cy - ph / 2, pw, ph, unit * RADIUS.sm);
      ctx.fillStyle = isActive ? lerpColor(THEME.panel, accent, ACTIVE_TINT) : shade(THEME.panel, IDLE_FACE_LIFT);
      ctx.fill();
      roundRect(ctx, cx - pw / 2, cy - ph / 2, pw, ph, unit * RADIUS.sm);
      ctx.strokeStyle = rgba(isActive ? accent : THEME.textDim, isActive ? 0.9 : 0.35);
      ctx.lineWidth = unit * (isActive ? STROKE.base : STROKE.thin);
      ctx.stroke();
      ctx.restore();
    }

    if (tk.kind === "lhs" || tk.kind === "eq") {
      const scale = tk.kind === "eq" ? eqPulse : 1;
      const onResult = resultBeat >= 0 && active >= resultBeat;
      ctx.save();
      ctx.globalAlpha = frameIn;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      ctx.font = `800 ${eqPx}px ${FONT_SANS}`;
      if (tk.kind === "lhs" && onResult) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.6;
      }
      ctx.fillStyle = tk.kind === "lhs" ? THEME.text : THEME.textDim;
      ctx.fillText(tk.text, cx, cy + eqPx * 0.35);
      ctx.shadowBlur = 0;
      ctx.restore();
      if (tk.kind === "lhs" && onResult) {
        ctx.save();
        ctx.globalAlpha = frameIn * easeOutCubic(sub(env.p, beatWindow(env.beats, resultBeat, totalBeats).start, 0.2));
        ctx.strokeStyle = accent;
        ctx.lineWidth = unit * 0.12;
        ctx.beginPath();
        ctx.moveTo(xs[ti], cy + eqPx * 0.55);
        ctx.lineTo(xs[ti] + w, cy + eqPx * 0.55);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    if (tk.kind === "op") {
       ctx.save();
       ctx.globalAlpha = frameIn;
       ctx.font = `800 ${eqPx}px ${FONT_SANS}`;
       ctx.fillStyle = THEME.textDim;
       ctx.fillText(tk.text, cx, cy + eqPx * 0.35);
       ctx.restore();
       return;
    }

    const i = tk.termIndex!;
    const { started, t } = termBeatFrac(i);
    const isActive = active === offset + i;
    if (!started) {
      // Ghost placeholder: dim symbol + dashed underline so the shape shows.
      ctx.save();
      ctx.globalAlpha = frameIn * 0.32;
      ctx.font = `800 ${eqPx}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textFaint;
      ctx.fillText(tk.text, cx, cy + eqPx * 0.35);
      ctx.strokeStyle = rgba(THEME.textDim, 0.35);
      ctx.lineWidth = unit * 0.06;
      ctx.setLineDash([unit * 0.3, unit * 0.25]);
      ctx.beginPath();
      ctx.moveTo(xs[ti], cy + eqPx * 0.5);
      ctx.lineTo(xs[ti] + w, cy + eqPx * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }
    // Slide up from below + overshoot settle.
    const e = easeOutBack(clamp01(t / 0.42));
    const breathe = isActive ? 1 + 0.04 * (idle(env, 1900, i) - 0.5) : 1;
    ctx.save();
    ctx.globalAlpha = frameIn * clamp01(t * 2.2);
    ctx.translate(cx, cy);
    ctx.scale(e * breathe, e * breathe);
    ctx.translate(-cx, -cy);
    ctx.font = `800 ${eqPx}px ${FONT_SANS}`;
    if (isActive) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
      ctx.fillStyle = accent;
    } else {
      ctx.fillStyle = THEME.text;
    }
    ctx.fillText(tk.text, cx, cy + eqPx * 0.35);
    ctx.shadowBlur = 0;
    ctx.restore();
  });
  ctx.textAlign = "start";

  // Active term's gloss chip (only the active one, to stay clean).
  const activeTermIndex = active - offset;
  if (activeTermIndex >= 0 && activeTermIndex < scene.terms.length) {
    const term = scene.terms[activeTermIndex];
    const { t } = termBeatFrac(activeTermIndex);
    // Find the token x for this term's symbol.
    const symTok = tokens.findIndex((tk) => tk.kind === "term" && tk.termIndex === activeTermIndex);
    const w = widths[symTok];
    const anchorX = xs[symTok] + w / 2;
    const bPos = blockPositions.find(bp => bp.kind === "term" && bp.termIndex === activeTermIndex);
    const topY = bPos ? bPos.y + unit * 1.5 : rect.y + rect.h / 2 + eqPx * 0.6;
    drawGloss(ctx, `${term.symbol} — ${term.gloss}`, anchorX, topY, layout, easeOutCubic(sub(t, 0.25, 0.3)), frameIn, env, {
      accent,
      accentGlow,
    });
  }

  // Result line.
  if (resultBeat >= 0 && active >= resultBeat) {
    const win = beatWindow(env.beats, resultBeat, totalBeats);
    const rt = clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001));
    const hasValues = scene.terms.every((tm) => tm.value && tm.value.trim());
    const lineY = areaY + areaH - unit * 2;
    ctx.save();
    ctx.globalAlpha = frameIn * easeOutCubic(clamp01(rt / 0.3));
    ctx.textAlign = "center";
    if (hasValues && scene.resultValue) {
      const subst = scene.terms.map((tm, i) => (i === 0 ? tm.value! : `${tm.op || "·"} ${tm.value!}`)).join(" ");
      const rpx = fitFontSize(ctx, `${subst} = ${scene.resultValue}`, {
        maxW: contentW * 0.9,
        startPx: eqPx * 0.78,
        minPx: unit * 0.75,
        weight: 700,
      });
      ctx.font = `700 ${rpx}px ${FONT_SANS}`;
      const counted = fmtCount(scene.resultValue, easeOutCubic(clamp01((rt - 0.15) / 0.6)));
      // Substitution dim, counting result bright.
      const substW = ctx.measureText(`${subst} = `).width;
      const resW = ctx.measureText(counted).width;
      const lx = contentX + contentW / 2 - (substW + resW) / 2;
      ctx.textAlign = "start";
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`${subst} = `, lx, lineY);
      ctx.fillStyle = accent;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
      ctx.fillText(counted, lx + substW, lineY);
    } else if (scene.resultValue) {
      const rpx = fitFontSize(ctx, scene.resultValue, { maxW: contentW * 0.9, startPx: eqPx * 0.8, minPx: unit * 0.8, weight: 800 });
      ctx.font = `800 ${rpx}px ${FONT_SANS}`;
      ctx.fillStyle = accent;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.6;
      ctx.fillText(fmtCount(scene.resultValue, easeOutCubic(clamp01((rt - 0.15) / 0.6))), contentX + contentW / 2, lineY);
    }
    ctx.restore();
    ctx.textAlign = "start";
  }

  ctx.textAlign = "start";
}

function drawGloss(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  topY: number,
  layout: PaintEnv["layout"],
  reveal: number,
  frameIn: number,
  env: PaintEnv,
  colors: { accent: string; accentGlow: string }
) {
  if (reveal <= 0) return;
  const { unit, contentX, contentW } = layout;
  const breathe = 1 + 0.06 * (idle(env, 2100) - 0.5);
  ctx.save();
  ctx.font = `600 ${unit * (layout.vertical ? 0.74 : 0.66)}px ${FONT_SANS}`;
  const tw = Math.min(ctx.measureText(text).width, contentW * 0.85);
  const cw = tw + unit * 1.0;
  const chH = unit * 1.25;
  const tickH = unit * 0.9;
  const chY = topY + tickH;
  let chX = anchorX - cw / 2;
  chX = Math.min(Math.max(chX, contentX), contentX + contentW - cw);
  // Leader tick from the term down to the chip.
  ctx.globalAlpha = frameIn * reveal;
  ctx.strokeStyle = rgba(colors.accent, 0.5);
  ctx.lineWidth = unit * 0.05;
  ctx.beginPath();
  ctx.moveTo(anchorX, topY);
  ctx.lineTo(anchorX, chY);
  ctx.stroke();
  ctx.save();
  ctx.translate(anchorX, (chY + topY) / 2);
  ctx.scale(breathe, breathe);
  ctx.translate(-anchorX, -(chY + topY) / 2);
  ctx.shadowColor = colors.accentGlow;
  ctx.shadowBlur = unit * 0.4;
  roundRect(ctx, chX, chY, cw, chH, unit * 0.32);
  ctx.fillStyle = INK_PANEL;
  ctx.fill();
  ctx.shadowBlur = 0;
  roundRect(ctx, chX, chY, cw, chH, unit * 0.32);
  ctx.strokeStyle = rgba(colors.accent, 0.6);
  ctx.lineWidth = unit * STROKE.thin;
  ctx.stroke();
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  const clipped = clipToWidth(ctx, text, tw);
  ctx.fillText(clipped, chX + cw / 2, chY + chH * 0.66);
  ctx.textAlign = "start";
  ctx.restore();
  ctx.restore();
}

function clipToWidth(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

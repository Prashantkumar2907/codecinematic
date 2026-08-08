import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  STROKE,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  sub,
  clamp01,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
  seriesTints,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

type RaceScene = Extract<Scene, { kind: "race" }>;

const CURRENCY_RE = /^[₹$€£]$/;

/** Floor on a non-zero bar, in units. Values here span 6 decades (the sorting
 *  demo runs 33 -> 1,000,000 against one global max), so without a floor an early
 *  checkpoint scales to sub-pixel and reads as "no data" rather than "almost none".
 *  Kept deliberately small: a floor wide enough to be comfortable also makes two
 *  values 15x apart render identical, so it buys presence, not comparison — the
 *  value labels carry the magnitude at that end of the scale. */
const MIN_BAR_UNITS = 0.22;

const LANE_IN_MS = 380;
const LANE_STAGGER_MS = 90;
/** Gutter caps as a fraction of contentW; fonts shrink to fit inside them. */
const LABEL_GUTTER_MAX = 0.34;
const VALUE_GUTTER_MAX = 0.28;

export function paintRace(ctx: CanvasRenderingContext2D, scene: RaceScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, vertical, safeBottom } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  // Not the literal [accent, secondary, good, warn, danger]: Money & Finance's accent
  // IS THEME.good byte-identical and Business & Startups' secondary IS THEME.danger,
  // and both subjects ship this kind — two racers were drawn in one colour.
  const tints = seriesTints(accent, secondary, 5);
  const offset = introBeatCount(scene);
  const ncp = scene.checkpoints.length;
  const totalBeats = offset + ncp;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const lastEnd = beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const inTail = env.p >= lastEnd;
  const ghostIn = easeOutCubic(enterT(env, 420));
  const leave = departT(env, 380);
  if (leave <= 0) return;

  // drawSceneTitle finishes its fade at p=0.12; feed it absolute time so the title lands in ~360ms.
  let band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;

  // Interpolated race state: values and lane ranks glide from checkpoint j-1
  // to checkpoint j over the first 60% of beat j.
  const jRaw = active - offset;
  const ghost = jRaw < 0;
  const j = Math.min(Math.max(jRaw, 0), ncp - 1);
  const t = ghost ? 0 : beatT(env.beats, offset + j, totalBeats, env.p);
  const mv = ghost ? 0 : easeInOutCubic(clamp01(t / 0.6));
  const prevVals = scene.checkpoints[Math.max(j - 1, 0)].values;
  const curVals = scene.checkpoints[j].values;
  const vals = scene.racers.map((_, i) => prevVals[i] + (curVals[i] - prevVals[i]) * mv);
  const ranksOf = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v || a.i - b.i);
    const ranks = new Array<number>(values.length).fill(0);
    order.forEach((o, r) => (ranks[o.i] = r));
    return ranks;
  };
  const prevRanks = ranksOf(prevVals);
  const curRanks = ranksOf(curVals);
  const leader = vals.indexOf(Math.max(...vals));
  const nRacers = scene.racers.length;
  const ysRank = scene.racers.map((_, i) => prevRanks[i] + (curRanks[i] - prevRanks[i]) * mv);

  const allInt = scene.checkpoints.every((c) => c.values.every((v) => Number.isInteger(v)));
  const u = scene.unit?.trim() ?? "";
  const locale = u === "₹" ? "en-IN" : "en-US";
  const fmt = (v: number): string => {
    const body = allInt ? Math.round(v).toLocaleString(locale) : v.toFixed(1);
    if (CURRENCY_RE.test(u)) return `${u}${body}`;
    return u ? (u.startsWith("%") ? `${body}${u}` : `${body} ${u}`) : body;
  };
  const ellipsize = (text: string, maxW: number): string => {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    return `${s}…`;
  };

  // "when" chip row (vertical) sits under the title and consumes band height.
  if (vertical) {
    const rowY = contentY + band + unit * 0.2;
    let px = unit * 0.62;
    ctx.font = `700 ${px}px ${FONT_MONO}`;
    const pad = unit * 0.7;
    const gap = unit * 0.35;
    let widths = scene.checkpoints.map((c) => ctx.measureText(c.when).width + pad);
    let total = widths.reduce((a, b) => a + b, 0) + gap * (ncp - 1);
    if (total > contentW) {
      px *= (contentW / total) * 0.95;
      ctx.font = `700 ${px}px ${FONT_MONO}`;
      widths = scene.checkpoints.map((c) => ctx.measureText(c.when).width + pad);
      total = widths.reduce((a, b) => a + b, 0) + gap * (ncp - 1);
    }
    const chipH = px * 1.9;
    let x = contentX + (contentW - total) / 2;
    scene.checkpoints.forEach((c, k) => {
      const isCur = !ghost && k === j;
      const alpha = ghost ? (k === 0 ? 0.5 : 0.3) * ghostIn : isCur ? 1 : k < j ? 0.7 : 0.3;
      ctx.save();
      ctx.globalAlpha = alpha * leave;
      if (isCur) {
        const pop = easeOutBack(clamp01(t / 0.25));
        ctx.translate(x + widths[k] / 2, rowY + chipH / 2);
        ctx.scale(pop, pop);
        ctx.translate(-(x + widths[k] / 2), -(rowY + chipH / 2));
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.4;
      }
      roundRect(ctx, x, rowY, widths[k], chipH, chipH / 2);
      ctx.fillStyle = isCur ? accent : THEME.panel;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (!isCur) {
        ctx.strokeStyle = THEME.panelBorder;
        ctx.lineWidth = unit * STROKE.hair;
        ctx.stroke();
      }
      ctx.font = `700 ${px}px ${FONT_MONO}`;
      ctx.fillStyle = isCur ? THEME.bgBottom : THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(c.when, x + widths[k] / 2, rowY + chipH / 2 + px * 0.36);
      ctx.textAlign = "start";
      ctx.restore();
      x += widths[k] + gap;
    });
    band += chipH + unit * 0.6;
  }

  // Big dim "when" (horizontal): oversized mono watermark in the title band's
  // right half, old slides up + fades while the new one pops. Drawn before the
  // lanes so bars and labels always sit on top of it.
  if (!vertical) {
    const bigY = contentY + unit * 2.1;
    const rightX = contentX + contentW;
    const wIn = ghost ? 1 : easeOutCubic(clamp01(t / 0.25));
    ctx.save();
    ctx.textAlign = "right";
    ctx.font = `800 ${unit * 2.4}px ${FONT_MONO}`;
    if (!ghost && j > 0 && wIn < 1) {
      ctx.globalAlpha = 0.18 * (1 - wIn) * leave;
      ctx.fillStyle = THEME.text;
      ctx.fillText(scene.checkpoints[j - 1].when, rightX, bigY - unit * 0.9 * wIn);
    }
    const pop = ghost ? 1 : 0.86 + 0.14 * easeOutBack(wIn);
    const when = scene.checkpoints[j].when;
    ctx.save();
    ctx.globalAlpha = 0.18 * (ghost ? ghostIn : 1) * leave;
    ctx.translate(rightX, bigY);
    ctx.scale(pop, pop);
    ctx.translate(-rightX, -bigY);
    ctx.fillStyle = THEME.text;
    ctx.fillText(when, rightX, bigY);
    ctx.restore();
    // Small crisp chip to the big number's left, in the same top-right band.
    const bigW = ctx.measureText(when).width * pop;
    ctx.globalAlpha = (ghost ? 0.6 * ghostIn : 1) * leave;
    ctx.font = `700 ${unit * 0.62}px ${FONT_MONO}`;
    const cw = ctx.measureText(when).width + unit * 0.7;
    const chipX = Math.max(contentX, rightX - bigW - unit * 0.8 - cw);
    const chipY = bigY - unit * 1.35;
    roundRect(ctx, chipX, chipY, cw, unit * 1.0, unit * 0.3);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = unit * STROKE.thin;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    ctx.fillText(when, chipX + cw / 2, chipY + unit * 0.72);
    ctx.restore();
  }

  // ---- Pixel-authoritative columns. The value column is the hard constraint
  // (schema allows values to 1e12, i.e. "1,000,000,000,000 ops"), so it is fitted
  // first; the label column takes what is left.
  const crownW = unit * 1.2;
  const crownSlot = crownW + unit * 0.35;
  const valueTexts = scene.checkpoints.flatMap((c) => c.values.map((v) => fmt(v)));
  const valueStart = unit * 0.86;
  ctx.font = `700 ${valueStart}px ${FONT_MONO}`;
  const widestValue = valueTexts.reduce((a, b) => (ctx.measureText(b).width > ctx.measureText(a).width ? b : a), valueTexts[0] ?? "");
  const valuePx = fitFontSize(ctx, widestValue, {
    maxW: Math.max(unit, contentW * (vertical ? 0.36 : VALUE_GUTTER_MAX) - crownSlot),
    startPx: valueStart,
    minPx: unit * 0.5,
    weight: 700,
    family: FONT_MONO,
  });
  ctx.font = `700 ${valuePx}px ${FONT_MONO}`;
  const valueW = ctx.measureText(widestValue).width;

  const iconPx = unit * 0.9;
  const hasIcon = scene.racers.some((r) => !!r.icon);
  const iconSlot = hasIcon ? iconPx * 1.2 + unit * 0.3 : 0;
  // Vertical stacks label+value on one row above the bar, so the label competes
  // with the value for the full content width; horizontal gives it its own column.
  const labelCap = vertical
    ? contentW - crownSlot - valueW - unit * 0.8 - iconSlot
    : contentW * LABEL_GUTTER_MAX - iconSlot - unit * 0.45;
  const labelStart = unit * 0.85;
  ctx.font = `700 ${labelStart}px ${FONT_SANS}`;
  const widestLabel = scene.racers.reduce(
    (a, r) => (ctx.measureText(r.label).width > ctx.measureText(a).width ? r.label : a),
    scene.racers[0]?.label ?? ""
  );
  const labelFloor = Math.max(unit * 0.8, labelCap);
  const labelPx = fitFontSize(ctx, widestLabel, {
    maxW: labelFloor,
    startPx: labelStart,
    minPx: unit * 0.5,
    weight: 700,
    family: FONT_SANS,
  });
  ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
  const labelW = Math.min(ctx.measureText(widestLabel).width, labelFloor);

  const trackX0 = vertical ? contentX : contentX + iconSlot + labelW + unit * 0.5;
  const trackX1 = vertical ? contentX + contentW : contentX + contentW - crownSlot - valueW - unit * 0.5;
  const trackW = Math.max(unit, trackX1 - trackX0);
  const valueRight = contentX + contentW - crownSlot;

  const listTop = contentY + band;
  const availH = Math.max(unit * 3, safeBottom - listTop);
  const laneH = availH / nRacers;
  const barThick = Math.min(laneH * (vertical ? 0.34 : 0.5), unit * 2.4);
  const rowGap = unit * 0.25;
  const textRowH = vertical ? Math.max(labelPx, valuePx) * 1.25 : 0;
  const groupH = textRowH + (vertical ? rowGap : 0) + barThick;

  const gmax = Math.max(...scene.checkpoints.flatMap((c) => c.values), 1e-9);
  const laneIn = (i: number) => easeOutCubic(clamp01((env.elapsedMs - LANE_STAGGER_MS * i) / LANE_IN_MS));
  const bright = ghost ? 0.55 * ghostIn : jRaw === 0 ? 0.55 + 0.45 * easeOutCubic(clamp01(t / 0.3)) : 1;
  const leadPulse = 0.35 + 0.25 * idle(env, 2200);

  // Per-racer pixel geometry. Everything downstream — rails, 3D slabs, labels,
  // values, crown — reads these, so they cannot disagree.
  // The rail's hair stroke is centred on the bar's edge, so the floor keeps its
  // outer half above safeBottom rather than straddling the caption band.
  const railHalfStroke = (unit * STROKE.hair) / 2;
  const groupFloor = Math.max(listTop, safeBottom - groupH - railHalfStroke);
  const minBarLen = unit * MIN_BAR_UNITS;
  const lanes = scene.racers.map((_, i) => {
    const groupTop = Math.min(Math.max(listTop + laneH * (ysRank[i] + 0.5) - groupH / 2, listTop), groupFloor);
    const barCy = groupTop + textRowH + (vertical ? rowGap : 0) + barThick / 2;
    const textBase = vertical ? groupTop + textRowH / 2 + Math.max(labelPx, valuePx) * 0.35 : barCy + labelPx * 0.34;
    const frac = clamp01(vals[i] / gmax);
    return {
      barCy,
      textBase,
      valueBase: vertical ? textBase : barCy + valuePx * 0.34,
      len: (frac > 0 ? Math.max(trackW * frac, Math.min(minBarLen, trackW)) : 0) * laneIn(i),
      alpha: clamp01(laneIn(i) * bright),
      lead: i === leader && !ghost ? 1 : 0,
    };
  });

  // Start gate + lane rails, behind the bars.
  ctx.save();
  ctx.globalAlpha = clamp01(ghostIn) * leave;
  ctx.fillStyle = rgba(accent, 0.28);
  ctx.fillRect(trackX0 - unit * 0.025, listTop + unit * 0.1, unit * 0.05, availH - unit * 0.2);
  ctx.restore();
  lanes.forEach((lane) => {
    ctx.save();
    ctx.globalAlpha = lane.alpha * 0.9 * leave;
    roundRect(ctx, trackX0, lane.barCy - barThick / 2, trackW, barThick, barThick * 0.26);
    ctx.fillStyle = rgba(accent, 0.05);
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = unit * STROKE.hair;
    ctx.stroke();
    ctx.restore();
  });

  // ---- Bars, filled directly in 2D — the leader glows via the same pulse the
  // removed 3D layer drove through emissiveIntensity.
  lanes.forEach((lane, i) => {
    // Once a checkpoint settles, the bars stop moving for the rest of the beat —
    // the leader's fill breathes so the frame keeps something visibly alive, not
    // just its edge glow (too little area to register on its own).
    const breathe = lane.lead > 0 ? 0.62 + 0.48 * idle(env, 2200, i) : 1;
    ctx.save();
    ctx.globalAlpha = lane.alpha * leave * breathe;
    if (lane.lead > 0) {
      ctx.shadowColor = rgba(tints[i % tints.length], 0.6);
      ctx.shadowBlur = unit * 0.5 * leadPulse;
    }
    roundRect(ctx, trackX0, lane.barCy - barThick / 2, lane.len, barThick, barThick * 0.26);
    ctx.fillStyle = tints[i % tints.length];
    ctx.fill();
    ctx.restore();
  });

  // ---- Labels, values, crown. Leader last so its glow sits on top.
  const drawOrder = scene.racers.map((_, i) => i).sort((a, b) => curRanks[b] - curRanks[a] || b - a);
  for (const i of drawOrder) {
    const racer = scene.racers[i];
    const lane = lanes[i];
    const isLeader = lane.lead > 0;

    ctx.save();
    ctx.globalAlpha = lane.alpha * leave;

    let lx = contentX;
    if (racer.icon) {
      ctx.font = `${iconPx}px ${FONT_SANS}`;
      ctx.textAlign = "left";
      ctx.fillStyle = THEME.text;
      ctx.fillText(racer.icon, lx, lane.textBase);
      lx += iconSlot;
    }
    ctx.font = `${isLeader ? 800 : 600} ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = isLeader ? THEME.text : THEME.textDim;
    ctx.textAlign = "left";
    ctx.fillText(ellipsize(racer.label, labelFloor), lx, lane.textBase);

    ctx.font = `${isLeader ? 800 : 700} ${valuePx}px ${FONT_MONO}`;
    ctx.fillStyle = isLeader ? THEME.text : THEME.textDim;
    ctx.textAlign = "right";
    ctx.fillText(fmt(vals[i]), valueRight, lane.valueBase);
    ctx.textAlign = "start";

    if (inTail && isLeader) {
      const pop = easeOutBack(clamp01(sub(env.p, lastEnd, 0.04)));
      const cwx = contentX + contentW - crownW / 2;
      const cwy = lane.valueBase - valuePx * 0.34 + Math.sin(env.elapsedMs / 400) * unit * 0.05;
      ctx.save();
      ctx.translate(cwx, cwy);
      ctx.scale(pop, pop);
      ctx.translate(-cwx, -cwy);
      roundRect(ctx, cwx - crownW / 2, cwy - unit * 0.4, crownW, unit * 0.8, unit * 0.25);
      ctx.fillStyle = rgba(THEME.warn, 0.18);
      ctx.fill();
      ctx.strokeStyle = THEME.warn;
      ctx.lineWidth = unit * STROKE.base;
      ctx.stroke();
      ctx.fillStyle = THEME.warn;
      ctx.font = `800 ${unit * 0.5}px ${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("▲", cwx, cwy + unit * 0.18);
      ctx.textAlign = "start";
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.textAlign = "start";
}

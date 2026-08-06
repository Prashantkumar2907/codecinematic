import * as THREE from "three";
import { render3D, studioLights, makeBlock, type ThreeBundle } from "./three3d";
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
} from "./common";
import type { PaintEnv } from "./index";

type RaceScene = Extract<Scene, { kind: "race" }>;

const CURRENCY_RE = /^[₹$€£]$/;

/**
 * The camera is deliberately ON-AXIS at (0, 0, CAM_DIST) and is never moved,
 * rotated or scaled. The bar lengths, lane centres and every text column are laid
 * out in PIXELS first; `worldX`/`worldY` below convert those pixels into world
 * units for the 3D slabs. An off-axis (isometric) camera made that conversion
 * impossible, which is what the previous version did: it invented a world span of
 * ±5.5 and projected it back out for the labels, so a full-length bar's tip landed
 * at x=1796 of an 1857-wide content box and its value label ran to ~2120px on a
 * 1920px frame (2.2% right bleed), while at 9:16 the second racer's row projected
 * to x=-404 and was off-frame entirely.
 */
const CAM_FOV = 32;
const CAM_DIST = 12;
/** Slab depth as a fraction of bar thickness. Boxes sit at z<=0 with the front
 *  face exactly on the focus plane, so perspective can only shrink them inward.
 *  Depth is additionally capped at the bar's own length: the back face projects
 *  toward the frame centre, so a slab deeper than it is long renders a silhouette
 *  wider than the value it encodes (a 1%-of-track bar measured 25px of overhang
 *  on a 10px bar at 9:16 — 3.5x overstated). */
const DEPTH_RATIO = 0.85;
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

type BarState = {
  x: number;
  y: number;
  len: number;
  thick: number;
  alpha: number;
  lead: number;
};

export function paintRace(ctx: CanvasRenderingContext2D, scene: RaceScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, vertical, safeBottom } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const tints = [accent, secondary, THEME.good, THEME.warn, THEME.danger];
  const offset = introBeatCount(scene);
  const ncp = scene.checkpoints.length;
  const totalBeats = offset + ncp;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const lastEnd = beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const inTail = env.p >= lastEnd;
  const ghostIn = easeOutCubic(enterT(env, 420));

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
      ctx.globalAlpha = alpha;
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
      ctx.globalAlpha = 0.18 * (1 - wIn);
      ctx.fillStyle = THEME.text;
      ctx.fillText(scene.checkpoints[j - 1].when, rightX, bigY - unit * 0.9 * wIn);
    }
    const pop = ghost ? 1 : 0.86 + 0.14 * easeOutBack(wIn);
    const when = scene.checkpoints[j].when;
    ctx.save();
    ctx.globalAlpha = 0.18 * (ghost ? ghostIn : 1);
    ctx.translate(rightX, bigY);
    ctx.scale(pop, pop);
    ctx.translate(-rightX, -bigY);
    ctx.fillStyle = THEME.text;
    ctx.fillText(when, rightX, bigY);
    ctx.restore();
    // Small crisp chip to the big number's left, in the same top-right band.
    const bigW = ctx.measureText(when).width * pop;
    ctx.globalAlpha = ghost ? 0.6 * ghostIn : 1;
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
  const rect = { x: contentX, y: listTop, w: contentW, h: availH };
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
  ctx.globalAlpha = clamp01(ghostIn);
  ctx.fillStyle = rgba(accent, 0.28);
  ctx.fillRect(trackX0 - unit * 0.025, listTop + unit * 0.1, unit * 0.05, availH - unit * 0.2);
  ctx.restore();
  lanes.forEach((lane) => {
    ctx.save();
    ctx.globalAlpha = lane.alpha * 0.9;
    roundRect(ctx, trackX0, lane.barCy - barThick / 2, trackW, barThick, barThick * 0.26);
    ctx.fillStyle = rgba(accent, 0.05);
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = unit * STROKE.hair;
    ctx.stroke();
    ctx.restore();
  });

  // ---- 3D slabs. Pixels -> world for an on-axis camera: one uniform scale.
  const k = (2 * Math.tan((CAM_FOV * Math.PI) / 360) * CAM_DIST) / rect.h;
  const worldX = (px: number) => (px - (rect.x + rect.w / 2)) * k;
  const worldY = (py: number) => (rect.y + rect.h / 2 - py) * k;
  const bars: BarState[] = lanes.map((lane) => ({
    x: worldX(trackX0 + lane.len / 2),
    y: worldY(lane.barCy),
    len: lane.len * k,
    thick: barThick * k,
    alpha: lane.alpha,
    lead: lane.lead ? leadPulse : 0.1,
  }));

  const build = (): ThreeBundle<{ bars: BarState[] }> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 100);
    camera.position.set(0, 0, CAM_DIST);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const models = scene.racers.map((_, i) => {
      const tint = tints[i % tints.length];
      const g = makeBlock(1, 1, 1, tint, tint);
      g.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat) mat.transparent = true;
      });
      s.add(g);
      return g;
    });

    const update = (_elapsedMs: number, data?: { bars: BarState[] }) => {
      const state = data?.bars ?? [];
      models.forEach((g, i) => {
        const b = state[i];
        if (!b) {
          g.visible = false;
          return;
        }
        g.visible = b.alpha > 0.01 && b.len > 1e-4;
        const depth = Math.max(1e-3, Math.min(b.thick * DEPTH_RATIO, b.len));
        g.scale.set(Math.max(1e-3, b.len), Math.max(1e-3, b.thick), depth);
        // Front face lands exactly on the focus plane, so perspective can only
        // pull the rest of the slab inward from the pixel rect it was built for.
        g.position.set(b.x, b.y, -depth / 2);
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          const mat = mesh.material as THREE.MeshPhysicalMaterial | undefined;
          if (!mat) return;
          if (mesh.isMesh) {
            mat.opacity = b.alpha * 0.95;
            mat.emissiveIntensity = b.lead;
          } else {
            mat.opacity = b.alpha * 0.55;
          }
        });
      });
    };

    return { scene: s, camera, update };
  };

  // Every per-frame value travels in `{ bars }`; build()'s closure reads nothing
  // that changes, so it cannot freeze at frame 0.
  const cam = render3D(ctx, `${scene.id}-race3d`, rect, build, env.elapsedMs, { bars });

  // Flat fallback when WebGL is unavailable: same pixel rects the slabs occupy.
  if (!cam) {
    lanes.forEach((lane, i) => {
      ctx.save();
      ctx.globalAlpha = lane.alpha;
      roundRect(ctx, trackX0, lane.barCy - barThick / 2, lane.len, barThick, barThick * 0.26);
      ctx.fillStyle = tints[i % tints.length];
      ctx.fill();
      ctx.restore();
    });
  }

  // ---- Labels, values, crown. Leader last so its glow sits on top.
  const drawOrder = scene.racers.map((_, i) => i).sort((a, b) => curRanks[b] - curRanks[a] || b - a);
  for (const i of drawOrder) {
    const racer = scene.racers[i];
    const lane = lanes[i];
    const isLeader = lane.lead > 0;

    ctx.save();
    ctx.globalAlpha = lane.alpha;

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

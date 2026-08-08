import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  sub,
  clamp01,
  clampRange,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  strokePolylineProgress,
  pointAlongPolyline,
  beatT,
  activeBeatIndex,
  rgba,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

type ConstellationScene = Extract<Scene, { kind: "constellation" }>;
type Point = ConstellationScene["points"][number];

/**
 * Camera. On-axis at (0,0,CAM_DIST) and never rotated, scaled or bobbed as a
 * group: the star positions are a PIXEL layout round-tripped through this
 * frustum, and the connector lines, glows, labels and hull are 2D chrome that
 * can only follow the stars while the camera transform is this one identity.
 */
const CAM_FOV_DEG = 40;
const CAM_DIST = 14;
/** Frustum half-height at the origin — the whole px↔world conversion. */
const FRUSTUM_HALF_H = Math.tan((CAM_FOV_DEG * Math.PI) / 360) * CAM_DIST;

const TAU = Math.PI * 2;

/**
 * Star glyphs are self-luminous, not shiny marbles. At emissive 0.12 the lit
 * spheres rendered darker than the accent-coloured line joining them and than
 * the still-unlit stars, so the brightest thing on a star map was the gap
 * between the stars. Emissive carries the body colour; the lights only shape it.
 */
const STAR_EMISSIVE_IDLE = 0.5;
const STAR_EMISSIVE_ACTIVE = 0.95;

const STAR_R_UNITS = 0.42;
const STAR_BOB_UNITS = 0.09;
const BOB_MS = 1000;
const FIELD_MARGIN_UNITS = 0.5;
const LABEL_GAP_UNITS = 0.34;
/** Cap height + descender allowance for a label sitting above its star. */
const LABEL_BOX_UNITS = 0.9;
const LABEL_MAX_W_FRAC = 0.34;

const FIELD_IN_MS = 360;
const STAR_STAGGER_MS = 70;
/** An unconnected star must still read as a star, not as sensor dust. */
const UNLIT_SCALE = 0.5;
const TWINKLE_MS = 600;
/** Fraction of a star's own beat spent growing to full size. */
const STAR_POP_SPAN = 0.35;
const LINE_STAGGER = 0.08;
const LINE_DRAW_SPAN = 0.42;
const SPARK_LOOP_MS = 1400;

const FINALE_CHIP_FONT_UNITS = 1.0;
const FINALE_CHIP_PAD_UNITS = 0.75;
const FINALE_CHIP_GLOW_UNITS = 0.35;
/** Chip centre above safeBottom. Must clear half the chip at easeOutBack's 1.1
 *  overshoot plus the glow, or the stamp bleeds into the caption band. */
const FINALE_CHIP_UNITS = 1.45;
const STAMP_OVERSHOOT = 1.1;
/** Field height surrendered to the chip: centre offset + overshot half + glow. */
const FINALE_BAND_UNITS =
  FINALE_CHIP_UNITS +
  (STAMP_OVERSHOOT * (FINALE_CHIP_FONT_UNITS + FINALE_CHIP_PAD_UNITS)) / 2 +
  FINALE_CHIP_GLOW_UNITS;

/**
 * A constellation has to stay recognisable, so the field keeps the point data's
 * own aspect ratio up to this much anisotropy — mapping each axis to the full
 * extent independently stretched Orion into a different shape at each aspect.
 * At 1.5 a tall pattern measured 440x335px inside a 1794x514px 16:9 field box,
 * i.e. 4% of the frame; 2.0 is the most slack that still reads as the same
 * figure at both aspects.
 */
const FIELD_MAX_STRETCH = 2.0;

/** Deterministic 0..1 from a point id. Star fields are the classic place to
 *  reach for a random jitter; a painter must be a pure function of its inputs,
 *  so every per-star phase comes from here. */
function hash01(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h << 5) - h + id.charCodeAt(i);
  return (Math.abs(h) % 1000) / 1000;
}

/** Convex hull (monotone chain) for the soft finale shape fill. */
function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts.slice();
  const sorted = [...pts].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function paintConstellation(ctx: CanvasRenderingContext2D, scene: ConstellationScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, w, contentX, contentY, contentW, safeBottom } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length + (scene.finale ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const finaleBeat = scene.finale ? totalBeats - 1 : -1;
  const finaleActive = finaleBeat >= 0 && active >= finaleBeat;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;

  // The field stops at safeBottom, not at contentY+contentH: at 9:16 the content
  // box runs 463px past the burned-in caption band, which is where the bottom
  // stars and the finale chip used to land.
  const fieldTop = contentY + titleBand;
  const finaleBand = scene.finale ? unit * FINALE_BAND_UNITS : 0;
  const rect = {
    x: contentX,
    y: fieldTop,
    w: contentW,
    h: Math.max(unit * 4, safeBottom - finaleBand - fieldTop),
  };

  const fieldIn = easeOutCubic(enterT(env, FIELD_IN_MS));
  const leave = departT(env, 380);
  if (fieldIn <= 0 || leave <= 0) {
    ctx.textAlign = "start";
    return;
  }

  // Earliest step (relative index) each point is connected in — drives brightness.
  const litStep = new Map<string, number>();
  scene.steps.forEach((step, k) => {
    for (const c of step.connect) {
      if (!litStep.has(c.a)) litStep.set(c.a, k);
      if (!litStep.has(c.b)) litStep.set(c.b, k);
    }
  });

  const xs = scene.points.map((p) => p.x);
  const ys = scene.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const dataCX = (minX + maxX) / 2;
  const dataCY = (minY + maxY) / 2;

  // px↔world, then a world box every star provably fits inside. Everything below
  // is derived from `rect`, so it holds identically at 9:16 and 16:9.
  const pxPerWorld = rect.h / (2 * FRUSTUM_HALF_H);
  const halfW = FRUSTUM_HALF_H * (rect.w / rect.h);
  const starPx = unit * STAR_R_UNITS;
  const starWorldR = starPx / pxPerWorld;
  const bobWorld = (unit * STAR_BOB_UNITS) / pxPerWorld;
  const hasLabels = scene.points.some((p) => p.label);
  const labelWorld = hasLabels ? (unit * (LABEL_GAP_UNITS + LABEL_BOX_UNITS)) / pxPerWorld : 0;
  const inset = starWorldR + bobWorld + (unit * FIELD_MARGIN_UNITS) / pxPerWorld;

  const usableHalfX = Math.max(0, halfW - inset);
  const usableTop = Math.max(0, FRUSTUM_HALF_H - inset - labelWorld);
  const usableBottom = -Math.max(0, FRUSTUM_HALF_H - inset);
  const fieldCY = (usableTop + usableBottom) / 2;
  const usableHalfY = (usableTop - usableBottom) / 2;

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const fitX = spanX > 0 ? usableHalfX / (spanX / 2) : Infinity;
  const fitY = spanY > 0 ? usableHalfY / (spanY / 2) : Infinity;
  const fit = Math.min(fitX, fitY);
  const uniform = Number.isFinite(fit) ? fit : 1;
  const scaleX = Math.min(fitX, uniform * FIELD_MAX_STRETCH);
  const scaleY = Math.min(fitY, uniform * FIELD_MAX_STRETCH);

  // z is flat on purpose: every star sits on the same plane, so the on-axis
  // camera this file used to route through is an exact uniform pixel<->world
  // scale — `projectPx` below is that scale applied directly, with no camera
  // or projection math left to desync from the 2D chrome drawn on top of it.
  const worldOf = (p: Point) => ({ x: (p.x - dataCX) * scaleX, y: fieldCY - (p.y - dataCY) * scaleY });
  const projectPx = (wx: number, wy: number) => ({
    x: rect.x + rect.w / 2 + wx * pxPerWorld,
    y: rect.y + rect.h / 2 - wy * pxPerWorld,
  });

  const p3ds = new Map(scene.points.map((p) => [p.id, worldOf(p)]));
  /** Per-star phase so the field twinkles out of lockstep without a clock read. */
  const phaseOf = (id: string) => hash01(id) * TAU;

  const pops: Record<string, number> = {};
  const activeList: Record<string, boolean> = {};
  const arriveById = new Map<string, number>();

  scene.points.forEach((point, index) => {
    // Staggered so the field assembles instead of appearing whole on one tick.
    const arrive = easeOutCubic(enterT(env, FIELD_IN_MS, index * STAR_STAGGER_MS));
    const phase = phaseOf(point.id);
    arriveById.set(point.id, arrive);
    const litK = litStep.get(point.id);
    const lit = litK !== undefined && active >= offset + litK;
    if (lit) {
      const bornT = clamp01(beatT(env.beats, offset + litK!, totalBeats, env.p) / STAR_POP_SPAN);
      const grow = UNLIT_SCALE + (1 - UNLIT_SCALE) * easeOutBack(bornT);
      const activeStar = active === offset + litK! && !finaleActive;
      const breathe = finaleActive
        ? 1 + 0.12 * Math.sin(env.elapsedMs / 800 + phase)
        : 1 + 0.06 * (idle(env, 2600, phase) - 0.5);
      pops[point.id] = grow * breathe * arrive;
      activeList[point.id] = activeStar || finaleActive;
    } else {
      const twinkle = UNLIT_SCALE * (0.85 + 0.15 * Math.sin(env.elapsedMs / TWINKLE_MS + phase));
      pops[point.id] = twinkle * arrive;
      activeList[point.id] = false;
    }
  });

  const posById = new Map<string, { x: number; y: number }>();
  scene.points.forEach((p) => {
    const v = p3ds.get(p.id)!;
    posById.set(p.id, projectPx(v.x, v.y + Math.sin(env.elapsedMs / BOB_MS + phaseOf(p.id)) * bobWorld));
  });

  /** On-screen radius of a star's glyph, so lines can stop at its rim. Exact
   *  because the field is flat: the mesh scale IS `pops` and z is 0. */
  const radiusPx = (id: string) => starPx * (pops[id] ?? 0);

  // Finale shape fill behind everything.
  if (finaleActive) {
    const litPts = scene.points.filter((p) => litStep.has(p.id)).map((p) => posById.get(p.id)!);
    const hull = convexHull(litPts);
    if (hull.length >= 3) {
      const breathe = 0.06 + 0.03 * (0.5 + 0.5 * Math.sin(env.elapsedMs / 900));
      const fin = easeOutCubic(beatT(env.beats, finaleBeat, totalBeats, env.p));
      ctx.save();
      ctx.globalAlpha = fin * leave;
      ctx.beginPath();
      ctx.moveTo(hull[0].x, hull[0].y);
      for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
      ctx.closePath();
      ctx.fillStyle = rgba(accent, breathe);
      ctx.fill();
      ctx.restore();
    }
  }

  // Connection lines, accumulating across steps.
  scene.steps.forEach((step, k) => {
    const beatIdx = offset + k;
    const t = beatT(env.beats, beatIdx, totalBeats, env.p);
    if (t <= 0) return;
    const isActiveStep = active === beatIdx;
    step.connect.forEach((c, i) => {
      const a = posById.get(c.a);
      const b = posById.get(c.b);
      if (!a || !b) return;
      const drawProg = easeInOutCubic(clamp01((t - i * LINE_STAGGER) / LINE_DRAW_SPAN));
      if (drawProg <= 0) return;
      // Terminate at the star rims: the 3D glyphs are composited under this
      // layer, so a centre-to-centre line draws straight across both of them.
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ra = radiusPx(c.a);
      const rb = radiusPx(c.b);
      if (len <= ra + rb) return;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const from = { x: a.x + ux * ra, y: a.y + uy * ra };
      const to = { x: b.x - ux * rb, y: b.y - uy * rb };
      const glowing = isActiveStep || finaleActive;
      const finalePulse = finaleActive ? 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(env.elapsedMs / 700 + i)) : 1;
      const idlePulse = !glowing ? 0.7 : 1;
      ctx.save();
      ctx.globalAlpha = (glowing ? 1 : idlePulse) * finalePulse * leave;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * (glowing ? 0.12 : 0.08);
      ctx.lineCap = "round";
      if (glowing) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * (finaleActive ? 0.9 : 0.6);
      }
      strokePolylineProgress(ctx, [from, to], drawProg);
      ctx.restore();
      // Traveling spark along the freshly drawn active line.
      if (isActiveStep && !finaleActive) {
        const f = drawProg < 1 ? drawProg : (env.elapsedMs % SPARK_LOOP_MS) / SPARK_LOOP_MS;
        const sp = pointAlongPolyline([from, to], f);
        ctx.save();
        ctx.globalAlpha = (drawProg < 1 ? 1 : 0.9 * Math.sin(Math.PI * f)) * leave;
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.9;
        ctx.fillStyle = THEME.text;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, unit * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  });

  // Star bodies, glow and label. Drawn directly in 2D as a self-luminous
  // radial-gradient disc — the field is flat (z=0), so this is an exact
  // replacement for the removed emissive sphere, not an approximation of it.
  scene.points.forEach((point) => {
    const pos = posById.get(point.id)!;
    const arrive = arriveById.get(point.id) ?? 0;
    const litK = litStep.get(point.id);
    const lit = litK !== undefined && active >= offset + litK;
    const r = radiusPx(point.id);
    if (r > 0.01) {
      const activeStar = lit && active === offset + litK! && !finaleActive;
      const emissive = !lit ? 0.28 : activeStar || finaleActive ? STAR_EMISSIVE_ACTIVE : STAR_EMISSIVE_IDLE;
      ctx.save();
      ctx.globalAlpha = arrive * leave;
      if (lit) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * (0.25 + 0.5 * emissive);
      }
      const grad = ctx.createRadialGradient(pos.x - r * 0.3, pos.y - r * 0.3, 0, pos.x, pos.y, r);
      grad.addColorStop(0, rgba(THEME.text, 0.5 + 0.5 * emissive));
      grad.addColorStop(0.5, rgba(accent, lit ? 0.6 + 0.4 * emissive : 0.35));
      grad.addColorStop(1, lit ? accent : rgba(THEME.textDim, 0.5));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (lit) {
      const activeStar = active === offset + litK! && !finaleActive;
      if (activeStar || finaleActive) {
        ctx.save();
        ctx.globalAlpha = arrive * 0.4 * leave;
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.9;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (point.label) {
      ctx.save();
      ctx.globalAlpha = arrive * (lit ? 0.9 : 0.55) * leave;
      const px = fitFontSize(ctx, point.label, {
        maxW: contentW * LABEL_MAX_W_FRAC,
        startPx: unit * 0.58,
        minPx: unit * 0.4,
        weight: 600,
      });
      ctx.font = `600 ${px}px ${FONT_SANS}`;
      // A label is the containment risk, not the star: it is centred on a star
      // that may sit near the frame edge, so clamp by its measured half-width.
      const half = ctx.measureText(point.label).width / 2;
      const lx = clampRange(pos.x, contentX + half, contentX + contentW - half);
      const above = pos.y - r - unit * LABEL_GAP_UNITS;
      const ly = above - px * 0.8 < rect.y ? pos.y + r + unit * LABEL_GAP_UNITS + px * 0.8 : above;
      ctx.fillStyle = lit ? THEME.text : THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(point.label, lx, Math.min(ly, safeBottom - unit * 0.2));
      ctx.textAlign = "start";
      ctx.restore();
    }
  });

  // Finale label stamp, parked just above the caption band.
  if (finaleActive && scene.finale) {
    const ft = beatT(env.beats, finaleBeat, totalBeats, env.p);
    const stamp = easeOutBack(clamp01(sub(ft, 0.15, 0.4)));
    if (stamp > 0) {
      const label = scene.finale.label;
      const cx = w / 2;
      const cy = safeBottom - unit * FINALE_CHIP_UNITS;
      ctx.save();
      ctx.globalAlpha = clamp01(sub(ft, 0.15, 0.25)) * leave;
      const maxW = contentW * 0.9;
      const px = fitFontSize(ctx, label, {
        maxW: maxW - unit * 1.4,
        startPx: unit * FINALE_CHIP_FONT_UNITS,
        minPx: unit * 0.7,
        weight: 800,
      });
      ctx.font = `800 ${px}px ${FONT_SANS}`;
      const tw = ctx.measureText(label).width;
      const chipW = tw + unit * 1.4;
      const chipH = px + unit * FINALE_CHIP_PAD_UNITS;
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.01, stamp), Math.max(0.01, stamp));
      ctx.translate(-cx, -cy);
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * FINALE_CHIP_GLOW_UNITS;
      roundRect(ctx, cx - chipW / 2, cy - chipH / 2, chipW, chipH, unit * 0.4);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.08;
      ctx.stroke();
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.fillText(label, cx, cy + px * 0.35);
      ctx.textAlign = "start";
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}

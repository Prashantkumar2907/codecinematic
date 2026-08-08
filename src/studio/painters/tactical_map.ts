import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  drawArrowhead,
  isoBox3D,
  flowDots,
  strokePolylineProgress,
  hashStr,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type TacticalMapScene = Extract<Scene, { kind: "tactical_map" }>;
type Unit = TacticalMapScene["units"][number];

const GRID = 12;
/** Dark ink on a bright accent-tone badge — same convention as cipher.ts's `INK_ON_ACCENT`. */
const INK_ON_ACCENT = "#06121a";

type Pt = { x: number; y: number };

/**
 * A strategic battle map: two armies (side a = accent, side b = secondary)
 * deploy as extruded troop blocks over an abstract terrain backdrop (contour
 * lines + an optional river). Each narration beat is either a MOVE — units slide
 * to new grid positions trailing flanking arrows — or a CLASH — a shockwave burst
 * where the lines meet. Positions are grid coords (0..12) mapped into a centred
 * square map so it reads in both 16:9 and 9:16. Fully deterministic from
 * elapsedMs; terrain is seeded from scene.id so every battle looks distinct.
 */
export function paintTacticalMap(ctx: CanvasRenderingContext2D, scene: TacticalMapScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, secondary, accentGlow, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  // Centred square map so grid coords keep aspect in both orientations.
  const mapSize = Math.min(contentW, areaH);
  const mapX = contentX + (contentW - mapSize) / 2;
  const mapY = areaY + Math.max(0, (areaH - mapSize) / 2);
  const cell = mapSize / GRID;
  const toPx = (gx: number, gy: number): Pt => ({ x: mapX + gx * cell, y: mapY + gy * cell });
  const sideHex = (s: Unit["side"]) => (s === "a" ? accent : secondary);
  const sideGlow = (s: Unit["side"]) => (s === "a" ? accentGlow : secondaryGlow);

  const mapIn = easeOutBack(clamp01(enterT(env, 520) * 1.05));
  drawTerrain(ctx, scene, mapX, mapY, mapSize, cell, unit, env, accent, secondary, mapIn * introIn);

  // Replay maneuvers: running positions + completed-move trail arrows.
  const byId = new Map(scene.units.map((u) => [u.id, u] as const));
  const running = new Map<string, Pt>(scene.units.map((u) => [u.id, { x: u.x, y: u.y }]));
  const trails: { from: Pt; to: Pt; side: Unit["side"] }[] = [];
  const activeArrows: { from: Pt; to: Pt; side: Unit["side"] }[] = [];
  const moveEase = easeInOutCubic(clamp01(stepT));

  for (let k = 0; k <= activeStep; k++) {
    const isActive = k === activeStep;
    for (const mv of scene.steps[k].moves) {
      const from = running.get(mv.unit);
      if (!from) continue;
      const to = { x: mv.toX, y: mv.toY };
      const side = byId.get(mv.unit)?.side ?? "a";
      if (isActive) {
        activeArrows.push({ from: { ...from }, to, side });
        running.set(mv.unit, { x: from.x + (to.x - from.x) * moveEase, y: from.y + (to.y - from.y) * moveEase });
      } else {
        trails.push({ from: { ...from }, to, side });
        running.set(mv.unit, to);
      }
    }
  }

  // Faint trails of past moves so the flow of the battle reads at a glance.
  trails.forEach((t) => drawArrow(ctx, toPx(t.from.x, t.from.y), toPx(t.to.x, t.to.y), unit, sideHex(t.side), 0.28 * introIn, 1, env, false));

  // Active flanking arrows draw on with the beat.
  const isClash = activeStep >= 0 && scene.steps[activeStep].kind === "clash";
  if (!isClash) {
    activeArrows.forEach((a) =>
      drawArrow(ctx, toPx(a.from.x, a.from.y), toPx(a.to.x, a.to.y), unit, sideHex(a.side), introIn, easeOutCubic(clamp01(stepT * 1.15)), env, true)
    );
  }

  // Troop blocks.
  const blockW = Math.min(cell * 1.9, unit * 2.6);
  const blockH = Math.min(cell * 1.3, unit * 1.7);
  const depth = unit * 0.4;
  scene.units.forEach((u, i) => {
    const pos = running.get(u.id)!;
    const raw = toPx(pos.x, pos.y);
    // A unit positioned near the grid edge (e.g. a reserve held back at the
    // map's border) would otherwise render its block half outside the map
    // panel — clamp the block's centre so it always stays fully inside.
    // isoBox3D's depth extrusion extends the visible right/bottom edge past
    // w/h, so that reach must be reserved too, not just the block's own size.
    const edgeGap = unit * 0.15;
    const x = Math.max(mapX + blockW / 2, Math.min(mapX + mapSize - blockW / 2 - depth - edgeGap, raw.x));
    const y = Math.max(mapY + blockH / 2, Math.min(mapY + mapSize - blockH / 2 - depth * 0.55 - edgeGap, raw.y));
    const appear = easeOutBack(clamp01(enterT(env, 460, 120 + i * 70) * 1.05));
    if (appear <= 0) return;
    const movingNow = !isClash && activeStep >= 0 && scene.steps[activeStep].moves.some((m) => m.unit === u.id);
    const bob = movingNow ? 0 : Math.sin(env.elapsedMs / 1500 + i) * unit * 0.05;
    const face = sideHex(u.side);
    const w = blockW * appear;
    const hgt = blockH * appear;
    const bx = x - w / 2;
    const by = y - hgt / 2 + bob;

    ctx.save();
    ctx.globalAlpha = introIn;
    isoBox3D(ctx, bx, by, w, hgt, depth, face, movingNow ? sideGlow(u.side) : undefined, unit * 0.22);

    // Strength pips along the block top edge.
    const pips = Math.min(u.strength, 6);
    ctx.fillStyle = INK_ON_ACCENT;
    for (let p = 0; p < pips; p++) {
      const px = bx + w * ((p + 0.5) / pips);
      ctx.beginPath();
      ctx.arc(px, by + hgt * 0.24, Math.max(1.3, unit * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }

    const labelPx = fitFontSize(ctx, u.label, { maxW: w * 0.86, startPx: unit * 0.62, minPx: unit * 0.42, weight: 800 });
    ctx.font = `800 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(u.label, x, by + hgt * 0.66);
    ctx.restore();
  });

  // Clash burst where the lines meet.
  if (isClash) {
    const c = scene.steps[activeStep].clashAt ?? centroid(scene, running);
    drawClash(ctx, toPx(c.x, c.y), unit, stepT, env, accent, secondary, introIn);
  }

  // Side legend chips.
  drawLegend(ctx, scene, mapX, mapY, mapSize, unit, accent, secondary, introIn);

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function centroid(scene: TacticalMapScene, running: Map<string, { x: number; y: number }>): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  scene.units.forEach((u) => {
    const p = running.get(u.id)!;
    sx += p.x;
    sy += p.y;
  });
  const n = Math.max(scene.units.length, 1);
  return { x: sx / n, y: sy / n };
}

/** Abstract terrain: map panel, seeded contour lines, optional river/fort. */
function drawTerrain(
  ctx: CanvasRenderingContext2D,
  scene: TacticalMapScene,
  mapX: number,
  mapY: number,
  size: number,
  cell: number,
  unit: number,
  env: { elapsedMs: number },
  accent: string,
  secondary: string,
  alpha: number
) {
  if (alpha <= 0) return;
  const seed = hashStr(scene.id);
  ctx.save();
  ctx.globalAlpha = alpha;

  // Map panel.
  roundRect(ctx, mapX, mapY, size, size, unit * 0.6);
  const g = ctx.createLinearGradient(mapX, mapY, mapX, mapY + size);
  g.addColorStop(0, "rgba(18,26,34,0.72)");
  g.addColorStop(1, "rgba(10,15,21,0.72)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.28);
  ctx.lineWidth = unit * 0.06;
  ctx.stroke();

  // Clip so terrain never bleeds past the map edge.
  ctx.save();
  roundRect(ctx, mapX, mapY, size, size, unit * 0.6);
  ctx.clip();

  // Elevation contour lines (wavy, seeded phases).
  ctx.lineWidth = Math.max(1, unit * 0.045);
  const rows = 7;
  for (let r = 1; r < rows; r++) {
    const baseY = mapY + (size * r) / rows;
    const ph = ((seed >> r) % 100) / 100;
    const amp = size * 0.03 * (1 + (r % 3) * 0.4);
    ctx.beginPath();
    for (let sx = 0; sx <= size; sx += size / 40) {
      const yy = baseY + Math.sin((sx / size) * Math.PI * 3 + ph * 6.28 + r) * amp;
      sx === 0 ? ctx.moveTo(mapX + sx, yy) : ctx.lineTo(mapX + sx, yy);
    }
    ctx.strokeStyle = rgba(accent, 0.07 + 0.03 * ((r + 1) % 2));
    ctx.stroke();
  }

  if (scene.terrain === "river") {
    const drift = Math.sin(env.elapsedMs / 5000) * size * 0.01;
    const river: Pt[] = [];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const rx = mapX + size * (0.22 + 0.5 * t + 0.12 * Math.sin(t * 6.28 + (seed % 10)));
      const ry = mapY + size * t + drift;
      river.push({ x: rx, y: ry });
    }
    ctx.lineCap = "round";
    ctx.lineWidth = unit * 0.55;
    ctx.strokeStyle = rgba(secondary, 0.22);
    strokeLine(ctx, river);
    ctx.lineWidth = unit * 0.22;
    ctx.strokeStyle = rgba(secondary, 0.45);
    strokeLine(ctx, river);
    flowDots(ctx, river, env, { count: 3, speedMs: 4200, r: unit * 0.12, color: rgba(secondary, 0.8) });
  } else if (scene.terrain === "fort") {
    const cx = mapX + size / 2;
    const cy = mapY + size / 2;
    const spikes = 8;
    const rOut = size * 0.16;
    const rIn = size * 0.11;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const ang = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? rOut : rIn;
      const px = cx + Math.cos(ang) * rr;
      const py = cy + Math.sin(ang) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = rgba(accent, 0.08);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.4);
    ctx.lineWidth = unit * 0.09;
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function strokeLine(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();
}

/** A flanking movement arrow: curved shaft + head, with optional flow packets. */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  unit: number,
  color: string,
  alpha: number,
  progress: number,
  env: { elapsedMs: number },
  flow: boolean
) {
  if (alpha <= 0 || progress <= 0) return;
  // Bow the shaft perpendicular for the sweeping "flanking" read.
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bow = len * 0.18;
  const ctrl = { x: mx + nx * bow, y: my + ny * bow };
  const pts: Pt[] = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    pts.push({
      x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y,
    });
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = unit * 0.16;
  ctx.lineCap = "round";
  ctx.setLineDash([unit * 0.5, unit * 0.34]);
  const tip = strokePolylineProgress(ctx, pts, progress);
  ctx.setLineDash([]);
  if (progress > 0.9) {
    ctx.fillStyle = color;
    drawArrowhead(ctx, to.x, to.y, Math.atan2(to.y - pts[N - 1].y, to.x - pts[N - 1].x), unit * 0.5);
  } else {
    ctx.fillStyle = color;
    drawArrowhead(ctx, tip.x, tip.y, tip.angle, unit * 0.42);
  }
  if (flow && progress > 0.5) flowDots(ctx, pts, env, { count: 2, speedMs: 1300, r: unit * 0.12, color });
  ctx.restore();
}

/** Expanding shockwave + spark starburst at a clash point. */
function drawClash(
  ctx: CanvasRenderingContext2D,
  c: Pt,
  unit: number,
  stepT: number,
  env: { elapsedMs: number },
  accent: string,
  secondary: string,
  introIn: number
) {
  const grow = easeOutCubic(clamp01(stepT * 1.4));
  ctx.save();
  ctx.globalAlpha = introIn;
  // Two expanding rings, phase-offset, looping for continued life.
  for (let i = 0; i < 2; i++) {
    const ph = ((env.elapsedMs / 900 + i * 0.5) % 1);
    const rr = unit * (0.6 + ph * 3.2) * (0.4 + 0.6 * grow);
    ctx.beginPath();
    ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(i === 0 ? accent : secondary, (1 - ph) * 0.6 * grow);
    ctx.lineWidth = unit * 0.12;
    ctx.stroke();
  }
  // Spark starburst.
  const spokes = 10;
  const flick = 0.7 + 0.3 * idle(env, 260);
  for (let i = 0; i < spokes; i++) {
    const ang = (i / spokes) * Math.PI * 2 + env.elapsedMs / 3000;
    const r0 = unit * 0.5 * grow;
    const r1 = unit * (1.4 + (i % 2) * 0.5) * grow * flick;
    ctx.beginPath();
    ctx.moveTo(c.x + Math.cos(ang) * r0, c.y + Math.sin(ang) * r0);
    ctx.lineTo(c.x + Math.cos(ang) * r1, c.y + Math.sin(ang) * r1);
    ctx.strokeStyle = rgba(i % 2 === 0 ? accent : secondary, 0.85 * grow);
    ctx.lineWidth = unit * (i % 2 === 0 ? 0.14 : 0.09);
    ctx.lineCap = "round";
    ctx.stroke();
  }
  // Hot core.
  ctx.beginPath();
  ctx.arc(c.x, c.y, unit * 0.4 * grow * (0.9 + 0.1 * flick), 0, Math.PI * 2);
  ctx.fillStyle = rgba("#ffffff", 0.85 * grow);
  ctx.shadowColor = accent;
  ctx.shadowBlur = unit * grow;
  ctx.fill();
  ctx.restore();
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  scene: TacticalMapScene,
  mapX: number,
  mapY: number,
  size: number,
  unit: number,
  accent: string,
  secondary: string,
  introIn: number
) {
  const items = [
    { label: scene.sideALabel, color: accent },
    { label: scene.sideBLabel, color: secondary },
  ];
  ctx.save();
  ctx.globalAlpha = introIn;
  ctx.font = `700 ${unit * 0.6}px ${FONT_SANS}`;
  ctx.textBaseline = "middle";
  let ly = mapY + unit * 0.9;
  items.forEach((it) => {
    const tw = ctx.measureText(it.label).width;
    const chipW = tw + unit * 1.5;
    const lx = mapX + size - chipW - unit * 0.5;
    ctx.fillStyle = rgba(THEME.bgBottom, 0.72);
    roundRect(ctx, lx, ly - unit * 0.5, chipW, unit, unit * 0.3);
    ctx.fill();
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.arc(lx + unit * 0.55, ly, unit * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "start";
    ctx.fillText(it.label, lx + unit * 0.95, ly);
    ly += unit * 1.25;
  });
  ctx.restore();
}

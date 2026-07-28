import { createNoise2D } from "simplex-noise";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
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
  glowRing,
  hashStr,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type FluidflowScene = Extract<Scene, { kind: "fluidflow" }>;

const GRID = 12;
const PARTICLE_COUNT = 120;

/** Minimal seeded PRNG so the shared noise field is built once, identically, every run. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** One noise field shared by every fluidflow instance. A fixed constant seed
 *  (never scene- or Date-derived) keeps painting pure: same elapsedMs always
 *  bends the same streamline the same way. */
const flowNoise = createNoise2D(mulberry32(0x9e3779b9));

type Pt = { x: number; y: number };

/**
 * A particle system for continuous physical flow — ocean currents, wind belts,
 * weather fronts, river/drainage networks. Each `source` continuously emits a
 * stream of short particle-streaks along its `flowDeg` heading; a shared
 * simplex-noise field (sampled at the particle's own position plus a slow
 * elapsedMs drift) bends every streamline into an organic meander instead of a
 * straight ray, and the same field drives a sparse grid of faint direction
 * ticks so the whole current reads at a glance. Steps reveal sources/sinks one
 * at a time and glow whichever is the current beat's focus. One source with a
 * single heading reads as a single current (Gulf Stream → London); several
 * sources at one origin with different headings read as radial drainage
 * (Amarkantak feeding rivers in every direction). The map is a centred square
 * so it holds its shape in both 16:9 and 9:16.
 */
export function paintFluidflow(ctx: CanvasRenderingContext2D, scene: FluidflowScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  // Centred square map (same trick as tactical_map): grid coords keep their
  // aspect ratio whether the frame is 16:9 or 9:16.
  const mapSize = Math.min(contentW, areaH);
  const mapX = contentX + (contentW - mapSize) / 2;
  const mapY = areaY + Math.max(0, (areaH - mapSize) / 2);
  const cell = mapSize / GRID;
  const toPx = (gx: number, gy: number): Pt => ({ x: mapX + gx * cell, y: mapY + gy * cell });

  const mapIn = easeOutBack(clamp01(enterT(env, 520) * 1.05));
  ctx.save();
  ctx.globalAlpha = mapIn * introIn;
  roundRect(ctx, mapX, mapY, mapSize, mapSize, unit * 0.6);
  const bgGrad = ctx.createLinearGradient(mapX, mapY, mapX, mapY + mapSize);
  bgGrad.addColorStop(0, "rgba(16,24,32,0.68)");
  bgGrad.addColorStop(1, "rgba(9,14,20,0.68)");
  ctx.fillStyle = bgGrad;
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.26);
  ctx.lineWidth = unit * 0.06;
  ctx.stroke();
  ctx.restore();

  // Cumulative reveal: once a step names a source/sink it stays on the map;
  // the CURRENT step's highlight (falling back to its own reveal) is the one
  // that glows and actively emits this beat.
  const revealedSrc = new Set<string>();
  const revealedSink = new Set<string>();
  for (let k = 0; k <= activeStep; k++) {
    scene.steps[k].reveal.forEach((sid) => revealedSrc.add(sid));
    scene.steps[k].revealSinks.forEach((sid) => revealedSink.add(sid));
  }
  const curStep = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const activeHighlight = new Set<string>(curStep ? (curStep.highlight.length ? curStep.highlight : curStep.reveal) : []);

  const nFreq = 2.1 / mapSize;
  const timeFreq = 0.00011;

  // --- Field ticks: short direction hairs bent by the same noise field the
  // particles use, brighter near a revealed source, so the current reads as
  // one continuous field rather than isolated dots. ---
  if (revealedSrc.size > 0) {
    const ticks = layout.vertical ? 7 : 9;
    ctx.save();
    ctx.lineCap = "round";
    for (let gx = 0; gx < ticks; gx++) {
      for (let gy = 0; gy < ticks; gy++) {
        const px = mapX + ((gx + 0.5) / ticks) * mapSize;
        const py = mapY + ((gy + 0.5) / ticks) * mapSize;
        let bestIdx = -1;
        let bestDist = Infinity;
        scene.sources.forEach((s, idx) => {
          if (!revealedSrc.has(s.id)) return;
          const sp = toPx(s.x, s.y);
          const d = Math.hypot(sp.x - px, sp.y - py);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = idx;
          }
        });
        if (bestIdx < 0) continue;
        const src = scene.sources[bestIdx];
        const bend = flowNoise(px * nFreq, py * nFreq + env.elapsedMs * timeFreq) * 0.7;
        const angle = (src.flowDeg * Math.PI) / 180 + bend;
        const len = cell * 0.28;
        const falloff = clamp01(1 - bestDist / (mapSize * 0.85));
        if (falloff <= 0) continue;
        ctx.globalAlpha = introIn * (0.04 + falloff * 0.2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = unit * 0.045;
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(angle) * len * 0.5, py - Math.sin(angle) * len * 0.5);
        ctx.lineTo(px + Math.cos(angle) * len * 0.5, py + Math.sin(angle) * len * 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- Particles: a continuous looping stream per revealed source. ---
  const margin = mapSize * 0.14;
  ctx.save();
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const srcIdx = hashStr(`${scene.id}#p${i}`) % scene.sources.length;
    const src = scene.sources[srcIdx];
    if (!revealedSrc.has(src.id)) continue;
    const isHot = activeHighlight.has(src.id);

    const seed = hashStr(`${scene.id}#seed${i}`);
    const lifeMs = 4200 + (seed % 2600);
    const phase = (seed % 9973) / 9973;
    const age = (env.elapsedMs + phase * lifeMs) % lifeMs;
    const t01 = age / lifeMs;

    const dirRad = (src.flowDeg * Math.PI) / 180;
    const ux = Math.cos(dirRad);
    const uy = Math.sin(dirRad);
    const perpx = -uy;
    const perpy = ux;
    const srcPx = toPx(src.x, src.y);
    // Shorter than before (was 1.5x): sources sit near the map edge already,
    // so a longer path spent most of its brightest (mid-life) stretch beyond
    // the frame, where a large noise amplitude read as a tangled scribble
    // rather than a current. This keeps the visible, brightest portion of the
    // streamline inside the map and the bend gentle.
    const pathLen = mapSize * 1.1;

    // Bend is sampled purely from PHYSICAL position (no per-particle phase
    // offset into the noise field): nearby particles then sample nearly the
    // same field value and bend the same way, so they read as beads strung
    // along one coherent current instead of each scribbling its own path.
    const sample = (t: number): Pt => {
      const travel = t * pathLen;
      const bx = srcPx.x + ux * travel;
      const by = srcPx.y + uy * travel;
      const nVal = flowNoise(bx * nFreq, by * nFreq + env.elapsedMs * timeFreq);
      const amp = Math.min(travel * 0.14, mapSize * 0.09);
      return { x: bx + perpx * nVal * amp, y: by + perpy * nVal * amp };
    };

    const head = sample(t01);
    const tail = sample(Math.max(0, t01 - 0.028));

    const edgeFade = clamp01(
      Math.min(
        (head.x - (mapX - margin)) / margin,
        (mapX + mapSize + margin - head.x) / margin,
        (head.y - (mapY - margin)) / margin,
        (mapY + mapSize + margin - head.y) / margin
      )
    );
    const lifeFade = Math.sin(clamp01(t01) * Math.PI);
    const alpha = introIn * edgeFade * lifeFade * (isHot ? 0.95 : 0.5);
    if (alpha <= 0.01) continue;

    const color = isHot ? accent : secondary;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = unit * (isHot ? 0.11 : 0.07);
    ctx.lineCap = "round";
    if (isHot) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
    }
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(head.x, head.y, unit * (isHot ? 0.09 : 0.06), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();

  // --- Sink markers (destinations): dashed ghost until revealed, then a pin. ---
  scene.sinks.forEach((sink, i) => {
    const p = toPx(sink.x, sink.y);
    const ghostIn = enterT(env, 260, 80 + i * 40);
    if (!revealedSink.has(sink.id)) {
      if (ghostIn <= 0) return;
      drawGhost(ctx, p, unit * 0.3, 0.16 * introIn * easeOutCubic(ghostIn));
      return;
    }
    const appear = easeOutBack(clamp01(enterT(env, 420, 60 + i * 90) * 1.05));
    drawSinkPin(ctx, p, sink.label, appear, introIn, unit, secondary);
  });

  // --- Source markers: dashed ghost until revealed, then a glowing origin pin. ---
  scene.sources.forEach((src, i) => {
    const p = toPx(src.x, src.y);
    const ghostIn = enterT(env, 260, 60 + i * 40);
    if (!revealedSrc.has(src.id)) {
      if (ghostIn <= 0) return;
      drawGhost(ctx, p, unit * 0.34, 0.16 * introIn * easeOutCubic(ghostIn));
      return;
    }
    const isHot = activeHighlight.has(src.id);
    const appear = easeOutBack(clamp01(enterT(env, 420, 40 + i * 90) * 1.05));
    const breathe = isHot ? 0.75 + 0.25 * idle(env, 1400) : 1;
    drawSourcePin(ctx, p, src.label, src.icon, appear, introIn * breathe, unit, accent, isHot);
    if (isHot) glowRing(ctx, p.x, p.y, unit * 0.42, accent, env, 1500);
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawGhost(ctx: CanvasRenderingContext2D, p: Pt, r: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.setLineDash([r * 0.7, r * 0.6]);
  ctx.strokeStyle = THEME.textDim;
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function labelChip(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, unit: number, accent: string, bold: boolean) {
  ctx.save();
  const weight = bold ? 800 : 600;
  const maxW = unit * 6.5;
  const px = fitFontSize(ctx, label, { maxW, startPx: unit * 0.6, minPx: unit * 0.42, weight });
  ctx.font = `${weight} ${px}px ${FONT_SANS}`;
  const tw = Math.min(ctx.measureText(label).width, maxW);
  const padX = unit * 0.4;
  const chipW = tw + padX * 2;
  const chipH = unit * 0.9;
  const bx = x + unit * 0.45;
  const by = y - chipH / 2;
  ctx.fillStyle = "rgba(9,13,18,0.78)";
  roundRect(ctx, bx, by, chipW, chipH, unit * 0.24);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, bold ? 0.85 : 0.4);
  ctx.lineWidth = bold ? 1.6 : 1;
  ctx.stroke();
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + padX, by + chipH / 2);
  ctx.restore();
}

function drawSourcePin(
  ctx: CanvasRenderingContext2D,
  p: Pt,
  label: string,
  emoji: string | undefined,
  appear: number,
  alpha: number,
  unit: number,
  accent: string,
  isHot: boolean
) {
  const r = unit * (isHot ? 0.34 : 0.26) * appear;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (isHot) {
    ctx.shadowColor = accent;
    ctx.shadowBlur = unit * 0.7;
  }
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.7, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(accent, 0.5);
  ctx.lineWidth = unit * 0.05;
  ctx.stroke();
  if (emoji) {
    ctx.font = `${unit * 0.7}px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, p.x, p.y - unit * 1.05);
  }
  labelChip(ctx, label, p.x + r, p.y, unit, accent, isHot);
  ctx.restore();
}

function drawSinkPin(ctx: CanvasRenderingContext2D, p: Pt, label: string, appear: number, alpha: number, unit: number, secondary: string) {
  const s = unit * 0.5 * appear;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y + s * 0.6);
  ctx.lineTo(p.x - s * 0.5, p.y - s * 0.4);
  ctx.lineTo(p.x + s * 0.5, p.y - s * 0.4);
  ctx.closePath();
  ctx.fillStyle = rgba(secondary, 0.85);
  ctx.fill();
  ctx.strokeStyle = secondary;
  ctx.lineWidth = unit * 0.05;
  ctx.stroke();
  labelChip(ctx, label, p.x + s * 0.6, p.y - s * 0.2, unit, secondary, false);
  ctx.restore();
}

import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  sub,
  clamp01,
  roundRect,
  drawSceneTitle,
  strokePolylineProgress,
  flowDots,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
  type Layout,
} from "./common";
import type { PaintEnv } from "./index";

type BlueprintScene = Extract<Scene, { kind: "architecture_blueprint" }>;
type Part = BlueprintScene["parts"][number];
type ShapeName = Part["shape"];
type Rect = { x: number; y: number; w: number; h: number };

const GRID = 12;
const DIM_ALPHA = 0.38;

type GridMap = { ox: number; oy: number; cw: number; ch: number };

/** Center the used grid extent below the title (parts may overlap on purpose). */
function gridMap(parts: Part[], layout: Layout, titleBand: number): GridMap {
  const areaX = layout.contentX;
  const areaY = layout.contentY + titleBand;
  const areaW = layout.contentW;
  const areaH = layout.contentH - titleBand;
  const cellW = areaW / GRID;
  const cellH = areaH / GRID;
  const minX = Math.min(...parts.map((p) => p.x));
  const maxX = Math.max(...parts.map((p) => p.x + p.w));
  const minY = Math.min(...parts.map((p) => p.y));
  const maxY = Math.max(...parts.map((p) => p.y + p.h));
  const usedW = Math.max(maxX - minX, 1);
  const usedH = Math.max(maxY - minY, 1);
  const f = Math.min((GRID * cellW) / (usedW * cellW), (GRID * cellH) / (usedH * cellH), 1.25);
  const cw = cellW * f;
  const ch = cellH * f;
  return {
    cw,
    ch,
    ox: areaX + (areaW - usedW * cw) / 2 - minX * cw,
    oy: areaY + (areaH - usedH * ch) / 2 - minY * ch,
  };
}

function partRect(part: Part, map: GridMap): Rect {
  return { x: map.ox + part.x * map.cw, y: map.oy + part.y * map.ch, w: part.w * map.cw, h: part.h * map.ch };
}

/** Closed rectangle perimeter as a polyline (for draw-on stroking). */
function rectPerimeter(r: Rect): { x: number; y: number }[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
    { x: r.x, y: r.y },
  ];
}

/** Diagonal wall poché — thin hatch lines clipped to the rect. */
function hatch(ctx: CanvasRenderingContext2D, r: Rect, gap: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  const span = r.w + r.h;
  for (let d = -r.h; d < span; d += gap) {
    ctx.beginPath();
    ctx.moveTo(r.x + d, r.y);
    ctx.lineTo(r.x + d - r.h, r.y + r.h);
    ctx.stroke();
  }
  ctx.restore();
}

/** Two center points along a road/corridor's long axis (for a dashed spine + traffic). */
function roadSpine(r: Rect): { a: { x: number; y: number }; b: { x: number; y: number } } {
  const horizontal = r.w >= r.h;
  return horizontal
    ? { a: { x: r.x, y: r.y + r.h / 2 }, b: { x: r.x + r.w, y: r.y + r.h / 2 } }
    : { a: { x: r.x + r.w / 2, y: r.y }, b: { x: r.x + r.w / 2, y: r.y + r.h } };
}

/** Draw-on the top-down OUTLINE of one part; `prog` (0-1) grows the stroke. */
function drawOutline(ctx: CanvasRenderingContext2D, shape: ShapeName, r: Rect, prog: number, unit: number) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  switch (shape) {
    case "wall":
    case "room":
    case "court":
      strokePolylineProgress(ctx, rectPerimeter(r), prog);
      break;
    case "road": {
      const horizontal = r.w >= r.h;
      const e1 = horizontal
        ? [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }]
        : [{ x: r.x, y: r.y }, { x: r.x, y: r.y + r.h }];
      const e2 = horizontal
        ? [{ x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h }]
        : [{ x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }];
      strokePolylineProgress(ctx, e1, prog);
      strokePolylineProgress(ctx, e2, prog);
      break;
    }
    case "gate": {
      // Two jambs + a quarter-circle door swing that sweeps open.
      const jw = Math.min(r.w * 0.16, unit * 0.5);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x, r.y + r.h);
      ctx.moveTo(r.x + r.w, r.y);
      ctx.lineTo(r.x + r.w, r.y + r.h);
      ctx.stroke();
      const swingR = Math.min(r.w - jw, r.h) * 0.9;
      ctx.beginPath();
      ctx.arc(r.x + jw * 0.5, r.y + r.h, swingR, -Math.PI / 2, -Math.PI / 2 + (Math.PI / 2) * clamp01(prog));
      ctx.stroke();
      const leaf = clamp01(prog);
      const ang = -Math.PI / 2 + (Math.PI / 2) * leaf;
      ctx.beginPath();
      ctx.moveTo(r.x + jw * 0.5, r.y + r.h);
      ctx.lineTo(r.x + jw * 0.5 + Math.cos(ang) * swingR, r.y + r.h + Math.sin(ang) * swingR);
      ctx.stroke();
      break;
    }
    case "dome":
    case "minaret": {
      const rad = Math.min(r.w, r.h) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(prog));
      ctx.stroke();
      break;
    }
  }
}

/** Interior detail lines (poché, centrelines, ticks) — faded in after the outline. */
function drawDetails(
  ctx: CanvasRenderingContext2D,
  shape: ShapeName,
  r: Rect,
  unit: number,
  env: PaintEnv,
  accent: string
) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  switch (shape) {
    case "wall": {
      ctx.save();
      ctx.lineWidth = unit * 0.045;
      ctx.globalAlpha *= 0.6;
      hatch(ctx, r, unit * 0.5);
      ctx.restore();
      break;
    }
    case "room": {
      // Corner registration ticks + a door gap on the longest edge.
      const t = Math.min(r.w, r.h) * 0.18;
      const corners: [number, number, number, number][] = [
        [r.x, r.y, 1, 1],
        [r.x + r.w, r.y, -1, 1],
        [r.x, r.y + r.h, 1, -1],
        [r.x + r.w, r.y + r.h, -1, -1],
      ];
      ctx.save();
      ctx.lineWidth = unit * 0.05;
      corners.forEach(([px, py, sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(px + sx * t, py);
        ctx.lineTo(px, py);
        ctx.lineTo(px, py + sy * t);
        ctx.stroke();
      });
      ctx.restore();
      break;
    }
    case "court": {
      // Open-air courtyard: faint dotted planting grid + a central water marker.
      ctx.save();
      ctx.globalAlpha *= 0.5;
      ctx.fillStyle = accent;
      const step = Math.max(unit * 0.9, Math.min(r.w, r.h) / 5);
      for (let gx = r.x + step; gx < r.x + r.w; gx += step)
        for (let gy = r.y + step; gy < r.y + r.h; gy += step) {
          ctx.beginPath();
          ctx.arc(gx, gy, unit * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.restore();
      const pulse = 0.6 + 0.4 * idle(env, 2200);
      ctx.save();
      ctx.globalAlpha *= pulse;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(r.w, r.h) * 0.14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "road": {
      const { a, b } = roadSpine(r);
      ctx.save();
      ctx.globalAlpha *= 0.7;
      ctx.setLineDash([unit * 0.4, unit * 0.34]);
      ctx.lineWidth = unit * 0.05;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      break;
    }
    case "dome": {
      const rad = Math.min(r.w, r.h) / 2;
      ctx.save();
      ctx.globalAlpha *= 0.75;
      for (const f of [0.66, 0.33]) {
        ctx.beginPath();
        ctx.arc(cx, cy, rad * f, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * rad * 0.33, cy + Math.sin(ang) * rad * 0.33);
        ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
        ctx.stroke();
      }
      const g = 0.4 + 0.6 * idle(env, 2600);
      ctx.globalAlpha *= g;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "minaret": {
      const rad = Math.min(r.w, r.h) / 2;
      ctx.save();
      ctx.globalAlpha *= 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - rad, cy);
      ctx.lineTo(cx + rad, cy);
      ctx.moveTo(cx, cy - rad);
      ctx.lineTo(cx, cy + rad);
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
}

/** Beat index (relative to steps) at which each part first reveals; default step 0. */
function revealSteps(scene: BlueprintScene): Map<string, number> {
  const steps = new Map<string, number>();
  scene.steps.forEach((step, k) => {
    for (const id of step.reveal) if (!steps.has(id)) steps.set(id, k);
  });
  for (const part of scene.parts) if (!steps.has(part.id)) steps.set(part.id, 0);
  return steps;
}

/** Small north compass — a blueprint-sheet signature, static in the corner. */
function drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, accent: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.85);
  ctx.lineTo(x - s * 0.3, y + s * 0.2);
  ctx.lineTo(x, y);
  ctx.lineTo(x + s * 0.3, y + s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.font = `700 ${s * 0.7}px ${FONT_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", x, y - s * 1.4);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

/**
 * A top-down architectural blueprint: walls, rooms, courtyards, roads, gates,
 * domes and minarets are inked onto faint blueprint grid paper, one group per
 * narration beat, each stroke drawing itself on. Revealed parts pick up idle
 * life (traffic flowing along roads, a breathing courtyard fountain, a pulsing
 * dome oculus); the active beat's parts glow and pop out label chips with leader
 * lines. Generalises grid-city plans, mosque floorplans and tomb-garden layouts.
 * The used grid extent is centred and scaled to fit either 16:9 or 9:16.
 */
export function paintArchitectureBlueprint(ctx: CanvasRenderingContext2D, scene: BlueprintScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaX = contentX;
  const areaY = contentY + titleBand;
  const areaW = contentW;
  const areaH = contentH - titleBand;
  const map = gridMap(scene.parts, layout, titleBand);
  const reveals = revealSteps(scene);

  const gridIn = easeOutCubic(enterT(env, 380));

  // Blueprint sheet: faint grid + a double border frame.
  ctx.save();
  ctx.globalAlpha = gridIn;
  ctx.strokeStyle = rgba(accent, 0.06);
  ctx.lineWidth = 1;
  const gStep = unit * 1.2;
  for (let gx = areaX; gx <= areaX + areaW + 0.5; gx += gStep) {
    ctx.beginPath();
    ctx.moveTo(gx, areaY);
    ctx.lineTo(gx, areaY + areaH);
    ctx.stroke();
  }
  for (let gy = areaY; gy <= areaY + areaH + 0.5; gy += gStep) {
    ctx.beginPath();
    ctx.moveTo(areaX, gy);
    ctx.lineTo(areaX + areaW, gy);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(accent, 0.18);
  ctx.lineWidth = unit * 0.06;
  ctx.strokeRect(areaX, areaY, areaW, areaH);
  ctx.strokeStyle = rgba(accent, 0.1);
  ctx.lineWidth = 1;
  ctx.strokeRect(areaX + unit * 0.28, areaY + unit * 0.28, areaW - unit * 0.56, areaH - unit * 0.56);
  ctx.restore();

  drawCompass(ctx, areaX + areaW - unit * 1.3, areaY + unit * 1.4, unit * 0.72, accent, gridIn);

  const highlights =
    activeStep >= 0 && !inTail
      ? new Set(scene.steps[Math.min(activeStep, scene.steps.length - 1)]?.highlight ?? [])
      : new Set<string>();

  for (const part of scene.parts) {
    const r = partRect(part, map);
    const stepK = reveals.get(part.id) ?? 0;
    const t = beatT(env.beats, offset + stepK, totalBeats, env.p);

    if (t <= 0) {
      // Dashed ghost so the full plan teases from the first frame.
      if (gridIn <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.1 * gridIn;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.055;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([unit * 0.3, unit * 0.3]);
      drawOutline(ctx, part.shape, r, 1, unit);
      ctx.setLineDash([]);
      ctx.restore();
      continue;
    }

    const drawProg = easeInOutCubic(clamp01(t / 0.5));
    const detailIn = easeOutCubic(clamp01((t - 0.35) / 0.4));
    const highlighted = highlights.has(part.id);
    const dimmed = !highlighted && highlights.size > 0;
    const alpha = clamp01(t * 3) * (highlighted ? 1 : dimmed ? DIM_ALPHA : 0.85);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = accent;
    ctx.lineWidth = highlighted ? unit * 0.13 : unit * 0.09;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (highlighted) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.7 + 0.32 * idle(env, 1700));
    }
    drawOutline(ctx, part.shape, r, drawProg, unit);
    ctx.shadowBlur = 0;
    if (detailIn > 0) {
      ctx.globalAlpha = alpha * detailIn;
      ctx.lineWidth = highlighted ? unit * 0.075 : unit * 0.055;
      drawDetails(ctx, part.shape, r, unit, env, accent);
    }
    ctx.restore();

    // Traffic flowing along revealed roads.
    if (part.shape === "road" && detailIn > 0.4 && !dimmed) {
      const { a, b } = roadSpine(r);
      flowDots(ctx, [a, b], env, { count: 2, speedMs: 2200, r: unit * 0.12, color: accent });
    }

    // Shimmer crawl over the active highlighted outline.
    if (highlighted && !inTail && drawProg >= 1) {
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = "#eaf6ff";
      ctx.lineWidth = unit * 0.05;
      ctx.setLineDash([unit * 0.5, unit * 0.9]);
      ctx.lineDashOffset = -((env.elapsedMs / 40) % (unit * 1.4));
      drawOutline(ctx, part.shape, r, 1, unit);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // Label chips with leader lines for the active step's highlighted parts.
  if (activeStep >= 0 && activeStep < scene.steps.length && !inTail) {
    const tA = beatT(env.beats, offset + activeStep, totalBeats, env.p);
    const labelled = scene.steps[activeStep].highlight
      .map((id) => scene.parts.find((pt) => pt.id === id))
      .filter((pt): pt is Part => !!pt && !!pt.label);
    labelled.forEach((part, i) => {
      const r = partRect(part, map);
      const cxP = r.x + r.w / 2;
      const cyP = r.y + r.h / 2;
      ctx.save();
      ctx.font = `600 ${unit * 0.62}px ${FONT_SANS}`;
      const tw = ctx.measureText(part.label!).width;
      const chipW = tw + unit * 0.9;
      const chipH = unit * 1.1;
      const side = i % 2;
      let chipX: number;
      let chipY: number;
      let fromPt: { x: number; y: number };
      let toPt: { x: number; y: number };
      if (vertical) {
        chipX = Math.min(Math.max(cxP - chipW / 2, contentX), contentX + contentW - chipW);
        chipY = side === 0 ? Math.max(r.y - unit * 1.9, areaY) : Math.min(r.y + r.h + unit * 0.8, areaY + areaH - chipH);
        fromPt = side === 0 ? { x: cxP, y: r.y } : { x: cxP, y: r.y + r.h };
        toPt = { x: chipX + chipW / 2, y: side === 0 ? chipY + chipH : chipY };
      } else {
        chipX = side === 0 ? contentX : contentX + contentW - chipW;
        chipY = Math.min(Math.max(cyP - chipH / 2, areaY), areaY + areaH - chipH);
        fromPt = side === 0 ? { x: r.x, y: cyP } : { x: r.x + r.w, y: cyP };
        toPt = { x: side === 0 ? chipX + chipW : chipX, y: chipY + chipH / 2 };
      }
      const leadIn = easeOutCubic(sub(tA, 0.05 + i * 0.05, 0.25));
      if (leadIn > 0) {
        ctx.strokeStyle = rgba(accent, 0.5);
        ctx.lineWidth = unit * 0.045;
        strokePolylineProgress(ctx, [fromPt, toPt], leadIn);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(fromPt.x, fromPt.y, unit * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      const chipIn = easeOutCubic(sub(tA, 0.18 + i * 0.05, 0.18));
      if (chipIn > 0) {
        ctx.globalAlpha = chipIn;
        roundRect(ctx, chipX, chipY, chipW, chipH, unit * 0.32);
        ctx.fillStyle = "#0a0e13";
        ctx.fill();
        ctx.strokeStyle = rgba(accent, 0.55);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "center";
        ctx.fillText(part.label!, chipX + chipW / 2, chipY + chipH * 0.68);
        ctx.textAlign = "start";
      }
      ctx.restore();
    });
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

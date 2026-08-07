import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  easeInOutCubic,
  clamp01,
  enterT,
  idle,
  hashStr,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  rgba,
  shade,
  type Layout,
} from "./common";
import type { PaintEnv } from "./index";

type CanvasRevealScene = Extract<Scene, { kind: "canvas_reveal" }>;
type Region = CanvasRevealScene["regions"][number];

/** Regions place shapes on this fixed grid (mirrors schema.ts's GRID=12), so
 *  x/y/w/h read the same way as schematic.ts's blueprint parts. */
const CANVAS_GRID = 12;
/** Portrait-ish frame so it reads as a hung painting in both 16:9 and 9:16. */
const FRAME_ASPECT = 0.86;
const MAX_ZOOM = 3.4;
/** Fraction of a region's bounding box left as breathing room once zoomed in. */
const ZOOM_PAD = 1.85;
/** Camera travel finishes by this fraction of the beat; the rest is a hold. */
const TRAVEL_FRAC = 0.7;
/** A region's paint finishes appearing by this fraction of its reveal beat. */
const PAINT_IN_FRAC = 0.6;

type Rect = { x: number; y: number; w: number; h: number };
type Cam = { scale: number; cx: number; cy: number };

/** Fit a portrait frame into the available box, centred, leaving room below for the swatch strip. */
function frameRectFor(layout: Layout, band: number, swatchBandH: number): Rect {
  const areaY = layout.contentY + band;
  const areaH = layout.contentH - band - swatchBandH;
  const wByH = areaH * FRAME_ASPECT;
  const w = Math.min(layout.contentW, wByH);
  const h = w / FRAME_ASPECT;
  return { x: layout.contentX + (layout.contentW - w) / 2, y: areaY + Math.max(0, (areaH - h) / 2), w, h };
}

/** Region geometry in frame-pixel space (pre-camera), from its 12x12 grid placement. */
function regionRect(region: Region, frame: Rect): Rect {
  return {
    x: frame.x + (region.x / CANVAS_GRID) * frame.w,
    y: frame.y + (region.y / CANVAS_GRID) * frame.h,
    w: (region.w / CANVAS_GRID) * frame.w,
    h: (region.h / CANVAS_GRID) * frame.h,
  };
}

/** Camera framing a region (or the whole canvas when id is undefined). */
function camFor(id: string | undefined, regions: Region[], frame: Rect): Cam {
  const rest: Cam = { scale: 1, cx: frame.x + frame.w / 2, cy: frame.y + frame.h / 2 };
  if (!id) return rest;
  const region = regions.find((r) => r.id === id);
  if (!region) return rest;
  const r = regionRect(region, frame);
  const scale = Math.max(1, Math.min(frame.w / (r.w * ZOOM_PAD), frame.h / (r.h * ZOOM_PAD), MAX_ZOOM));
  return { scale, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

/** Deterministic per-region "brush" jitter so shapes don't look mechanically identical. */
function jitterFor(sceneId: string, regionId: string) {
  const rot = ((hashStr(`${sceneId}|${regionId}|rot`) % 1000) / 1000 - 0.5) * 0.5;
  const wob = (hashStr(`${sceneId}|${regionId}|wob`) % 1000) / 1000;
  const flip = hashStr(`${sceneId}|${regionId}|flip`) % 2 === 0 ? 1 : -1;
  return { rot, wob, flip };
}

export function paintCanvasReveal(ctx: CanvasRenderingContext2D, scene: CanvasRevealScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentW } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  // Reserved strips BELOW the frame, stacked caption-then-swatches, both inside contentH.
  const captionBandH = scene.artLabel ? unit * 1.3 : 0;
  const swatchBandH = scene.swatches.length > 0 ? unit * 2.15 : 0;
  const frame = frameRectFor(layout, band, captionBandH + swatchBandH);
  const frameCx = frame.x + frame.w / 2;
  const frameCy = frame.y + frame.h / 2;

  const frameEnter = easeOutBack(enterT(env, 520, 100));
  const frameScale = 0.82 + 0.18 * clamp01(frameEnter);

  // Which step is focusing which region right now, and what came before it (for camera travel).
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const focusId = activeStep >= 0 ? scene.steps[activeStep].focus : undefined;
  const prevFocusId = activeStep >= 1 ? scene.steps[activeStep - 1].focus : undefined;

  // First step index (if any) that focused each region — drives its paint-in.
  const revealedAt = new Map<string, number>();
  for (let k = 0; k <= activeStep; k++) {
    const f = scene.steps[k]?.focus;
    if (f && !revealedAt.has(f)) revealedAt.set(f, k);
  }
  const revealedSwatches = new Set<number>();
  let lastSwatchIndex: number | undefined;
  for (let k = 0; k <= activeStep; k++) {
    const s = scene.steps[k]?.swatchIndex;
    if (s != null) {
      revealedSwatches.add(s);
      lastSwatchIndex = s;
    }
  }

  const prevCam = camFor(prevFocusId, scene.regions, frame);
  const nextCam = camFor(focusId, scene.regions, frame);
  const travel = activeStep < 0 ? 0 : easeInOutCubic(clamp01(stepT / TRAVEL_FRAC));
  const atRest = activeStep < 0 || (travel >= 0.999 && focusId === undefined);
  const breathe = atRest ? 1 + 0.012 * (idle(env, 3600) - 0.5) * 2 : 1;
  const camScale = (prevCam.scale + (nextCam.scale - prevCam.scale) * travel) * breathe;
  const camCx = prevCam.cx + (nextCam.cx - prevCam.cx) * travel;
  const camCy = prevCam.cy + (nextCam.cy - prevCam.cy) * travel;

  // --- Frame + clipped, zoomed canvas content -------------------------------------------------
  ctx.save();
  ctx.globalAlpha = introIn;
  ctx.translate(frameCx, frameCy);
  ctx.scale(frameScale, frameScale);
  ctx.translate(-frameCx, -frameCy);

  roundRect(ctx, frame.x, frame.y, frame.w, frame.h, unit * 0.3);
  ctx.save();
  ctx.clip();

  // Canvas ground colour with a soft vignette (the "base pigment" the motifs sit on).
  const g = ctx.createLinearGradient(frame.x, frame.y, frame.x, frame.y + frame.h);
  g.addColorStop(0, shade(scene.canvasColor, 0.08));
  g.addColorStop(1, shade(scene.canvasColor, -0.14));
  ctx.fillStyle = g;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  ctx.fillStyle = "rgba(0,0,0,0.05)";
  for (let i = 0; i < 40; i++) {
    const fx = frame.x + ((i * 197) % 991) / 991 * frame.w;
    const fy = frame.y + ((i * 331) % 977) / 977 * frame.h;
    ctx.beginPath();
    ctx.arc(fx, fy, i % 4 === 0 ? unit * 0.05 : unit * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.translate(frameCx, frameCy);
  ctx.scale(camScale, camScale);
  ctx.translate(-camCx, -camCy);

  scene.regions.forEach((region) => {
    const rect = regionRect(region, frame);
    const idxOf = revealedAt.get(region.id);
    let local = 0;
    if (idxOf != null) local = idxOf === activeStep ? clamp01(stepT / PAINT_IN_FRAC) : 1;
    if (local <= 0) return;
    const isActivePaint = idxOf === activeStep && local < 1;
    const isFocused = region.id === focusId && travel > 0.5;
    const appear = easeOutBack(local);
    const alpha = easeOutCubic(local);
    const { x, y, w, h } = rect;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const { rot, wob, flip } = jitterFor(scene.id, region.id);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (isActivePaint) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = (unit * 0.9) / camScale;
    }
    ctx.translate(cx, cy);
    ctx.scale(0.55 + 0.45 * appear, 0.55 + 0.45 * appear);
    ctx.rotate(rot);
    ctx.fillStyle = rgba(region.color, 0.88);
    ctx.strokeStyle = shade(region.color, -0.35);
    ctx.lineWidth = (unit * 0.06) / camScale;

    if (region.shape === "rect") {
      roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.16);
      ctx.fill();
      ctx.stroke();
    } else if (region.shape === "triangle") {
      const apexUp = flip > 0;
      ctx.beginPath();
      ctx.moveTo(0, apexUp ? -h / 2 : h / 2);
      ctx.lineTo(-w / 2, apexUp ? h / 2 : -h / 2);
      ctx.lineTo(w / 2, apexUp ? h / 2 : -h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      const pts = 9;
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const wobble = 1 + 0.14 * Math.sin(a * 3 + wob * Math.PI * 2);
        const px = Math.cos(a) * (w / 2) * wobble;
        const py = Math.sin(a) * (h / 2) * wobble;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    if (isFocused) {
      const pulse = 0.55 + 0.45 * idle(env, 1400);
      ctx.save();
      ctx.globalAlpha = alpha * pulse;
      ctx.strokeStyle = accent;
      ctx.lineWidth = (unit * 0.11) / camScale;
      const pad = unit * 0.32;
      roundRect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, unit * 0.22);
      ctx.stroke();
      ctx.restore();
    }
  });

  ctx.restore(); // undo clip (camera transform still active until outer restore)
  ctx.restore(); // undo frame-entrance transform

  // --- Frame chrome: viewfinder corners + border, always crisp on screen -------------------
  ctx.save();
  ctx.globalAlpha = introIn;
  ctx.translate(frameCx, frameCy);
  ctx.scale(frameScale, frameScale);
  ctx.translate(-frameCx, -frameCy);
  roundRect(ctx, frame.x, frame.y, frame.w, frame.h, unit * 0.3);
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = unit * 0.12;
  ctx.stroke();
  const bracket = Math.min(frame.w, frame.h) * 0.09;
  ctx.strokeStyle = accent;
  ctx.lineWidth = unit * 0.09;
  ctx.lineCap = "round";
  [
    [frame.x, frame.y, 1, 1],
    [frame.x + frame.w, frame.y, -1, 1],
    [frame.x, frame.y + frame.h, 1, -1],
    [frame.x + frame.w, frame.y + frame.h, -1, -1],
  ].forEach(([bx, by, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(bx, by + bracket * dy);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + bracket * dx, by);
    ctx.stroke();
  });
  ctx.restore();

  // Museum-placard caption for the whole piece, in its own reserved strip below the frame.
  if (scene.artLabel) {
    ctx.save();
    ctx.globalAlpha = introIn * 0.92;
    const captionPx = fitFontSize(ctx, scene.artLabel, { maxW: frame.w - unit * 1.2, startPx: unit * 0.55, minPx: unit * 0.36, weight: 700 });
    ctx.font = `700 ${captionPx}px ${FONT_SANS}`;
    const tw = ctx.measureText(scene.artLabel).width;
    const px = frame.x + unit * 0.4;
    const capH = unit * 0.9;
    const capY = frame.y + frame.h + unit * 0.25;
    ctx.fillStyle = rgba(THEME.bgBottom, 0.72);
    roundRect(ctx, px - unit * 0.3, capY, tw + unit * 0.6, capH, unit * 0.22);
    ctx.fill();
    ctx.fillStyle = THEME.textDim;
    ctx.textBaseline = "middle";
    ctx.fillText(scene.artLabel, px, capY + capH / 2);
    ctx.restore();
  }

  // Callout naming the focused motif, floating above the frame.
  if (focusId) {
    const region = scene.regions.find((r) => r.id === focusId);
    const labelIn = easeOutCubic(clamp01((stepT - 0.3) / 0.4));
    if (region && labelIn > 0) {
      ctx.save();
      ctx.globalAlpha = introIn * labelIn;
      const labelPx = fitFontSize(ctx, region.label, { maxW: frame.w * 0.8, startPx: unit * 0.85, minPx: unit * 0.55, weight: 800 });
      ctx.font = `800 ${labelPx}px ${FONT_SANS}`;
      const tw = ctx.measureText(region.label).width;
      const cx = frameCx;
      const cy = frame.y - unit * 0.7;
      ctx.fillStyle = rgba(region.color, 0.92);
      roundRect(ctx, cx - tw / 2 - unit * 0.4, cy - unit * 0.5, tw + unit * 0.8, unit * 1.0, unit * 0.3);
      ctx.fill();
      ctx.fillStyle = shade(region.color, 0.55);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(region.label, cx, cy);
      ctx.restore();
    }
  }

  // --- Palette swatch strip below the frame ---------------------------------------------------
  if (scene.swatches.length > 0) {
    const chipW = Math.min(unit * 2.3, (contentW - unit * 0.6 * (scene.swatches.length - 1)) / scene.swatches.length);
    const chipH = unit * 1.0;
    const totalW = chipW * scene.swatches.length + unit * 0.6 * (scene.swatches.length - 1);
    let sx = contentX + (contentW - totalW) / 2;
    const sy = frame.y + frame.h + captionBandH + unit * 0.2;
    scene.swatches.forEach((sw, i) => {
      const revealed = revealedSwatches.has(i);
      const chipIn = enterT(env, 320, 60 + i * 90);
      const isNewest = revealed && i === lastSwatchIndex;
      const pop = revealed ? easeOutBack(clamp01(chipIn)) : 0;
      if (pop > 0) {
        ctx.save();
        ctx.globalAlpha = introIn * clamp01(pop);
        const glow = isNewest ? 0.5 + 0.5 * idle(env, 1300) : 0;
        if (glow > 0) {
          ctx.shadowColor = accentGlow;
          ctx.shadowBlur = unit * 0.5 * glow;
        }
        roundRect(ctx, sx, sy, chipW, chipH, unit * 0.18);
        ctx.fillStyle = sw.hex;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = shade(sw.hex, -0.3);
        ctx.lineWidth = unit * 0.05;
        ctx.stroke();
        // Capped to this chip's own slot (its width plus a little of its
        // trailing gap) — `chipW * 1.7` let a long label overflow straight
        // into the next chip's label with chips this close together
        // (measured: "Tandul white" running into "Rice-husk black").
        const labelPx = fitFontSize(ctx, sw.label, { maxW: chipW + unit * 0.4, startPx: unit * 0.42, minPx: unit * 0.28, weight: 700, family: FONT_MONO });
        ctx.font = `700 ${labelPx}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.textDim;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(sw.label, sx + chipW / 2, sy + chipH + unit * 0.42);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 0.14 * introIn;
        ctx.strokeStyle = secondary;
        ctx.lineWidth = unit * 0.04;
        ctx.setLineDash([unit * 0.16, unit * 0.14]);
        roundRect(ctx, sx, sy, chipW, chipH, unit * 0.18);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      sx += chipW + unit * 0.6;
    });
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

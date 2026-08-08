import { introBeatCount, SKYLINE_BUILDINGS, type Scene } from "../schema";
import {
  THEME,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  enterT,
  clamp01,
  roundRect,
  drawSceneTitle,
  beatWindow,
  beatT,
  activeBeatIndex,
  rgba,
  hashStr,
  shade,
  departT,
} from "./common";
import type { PaintEnv } from "./index";

type SkylineScene = Extract<Scene, { kind: "skyline" }>;
type BuildingKind = (typeof SKYLINE_BUILDINGS)[number];

type Placed = {
  kind: BuildingKind;
  hUnits: number;
  era: number;
  withinEra: number;
  slotX: number; // left of slot
  slotW: number;
  seed: number;
};

/** Round-columned silhouette (mill/tower/dome/temple) vs a boxy one (hut/house/skyscraper/landmark). */
const ROUND_KINDS: ReadonlySet<BuildingKind> = new Set(["mill", "tower", "dome", "temple"]);
const BUILDING_FILL = 0.72;
const MAX_H_FRAC = 0.85;
/** THEME.panel sits within a few RGB steps of the background; lift a building's
 *  face off it so a flat 2D fill reads as a solid silhouette without shading. */
const FACE_LIFT = 0.14;
const FACE_LIFT_ACTIVE = 0.24;

export function paintSkyline(ctx: CanvasRenderingContext2D, scene: SkylineScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const nEras = scene.eras.length;
  const totalBeats = offset + nEras;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const ghostIn = easeOutCubic(enterT(env, 360));
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;

  // Era "when" chip band under the title.
  const chipRowY = contentY + band;
  const chipRowH = unit * 1.4;
  const areaTop = chipRowY + chipRowH + unit * 0.4;
  const groundY = contentY + contentH - unit * (vertical ? 1.4 : 1.0);

  const placed: Placed[] = [];
  scene.eras.forEach((era, ei) => {
    era.buildings.forEach((b, bi) => {
      placed.push({ kind: b.kind, hUnits: b.h, era: ei, withinEra: bi, slotX: 0, slotW: 0, seed: 0 });
    });
  });
  const N = Math.max(placed.length, 1);
  const slotW = contentW / N;
  placed.forEach((pl, i) => {
    pl.slotX = contentX + i * slotW;
    pl.slotW = slotW;
    pl.seed = hashStr(`${scene.id}:${i}:${pl.kind}`);
  });

  const eraFrac = nEras > 1 ? clamp01((active - offset) / (nEras - 1)) : 0;
  const skyGlow = ctx.createLinearGradient(0, areaTop, 0, groundY);
  skyGlow.addColorStop(0, rgba(secondary, 0.05 + 0.09 * eraFrac));
  skyGlow.addColorStop(1, rgba(accent, 0.02 + 0.05 * eraFrac));
  ctx.save();
  ctx.globalAlpha = easeOutCubic(enterT(env, 520)) * leave;
  ctx.fillStyle = skyGlow;
  ctx.fillRect(contentX, areaTop, contentW, groundY - areaTop);
  ctx.restore();

  const maxHpx = (groundY - areaTop) * MAX_H_FRAC;

  // Buildings, drawn directly in 2D — a flat silhouette skyline growing from the
  // ground line, rather than a camera-viewed 3D block city. Each rises with the
  // era it belongs to; the current era's buildings glow and bob gently.
  placed.forEach((pl) => {
    const beat = offset + pl.era;
    const bt = beatT(env.beats, beat, totalBeats, env.p);
    const cx = pl.slotX + pl.slotW / 2;
    const w = pl.slotW * BUILDING_FILL;
    const fullH = (pl.hUnits / 10) * maxHpx;
    const round = ROUND_KINDS.has(pl.kind);
    const isCurrentEra = active === beat;

    let scaleY = 0.001;
    let visible = false;
    let alpha = 1;
    if (env.p < beatWindow(env.beats, beat, totalBeats).start) {
      visible = env.p > 0 || ghostIn > 0;
      scaleY = 0.1 * (env.p > 0 ? 1 : ghostIn);
      alpha = 0.3;
    } else if (bt > 0) {
      const stagger = pl.withinEra * 0.08;
      const rise = easeOutBack(clamp01((bt - stagger) / 0.4));
      if (rise > 0) {
        visible = true;
        scaleY = rise;
      }
    }
    if (!visible) return;

    const bob = isCurrentEra && scaleY >= 1 ? unit * 0.12 * Math.abs(Math.sin(env.elapsedMs / 700 + pl.seed)) : 0;

    ctx.save();
    ctx.globalAlpha = alpha * leave;
    ctx.translate(cx, groundY - bob);
    ctx.scale(1, Math.max(0.001, scaleY));
    ctx.translate(-cx, -(groundY - bob));

    if (isCurrentEra && scaleY >= 1) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.5 + 0.3 * (bob / (unit * 0.12)));
    }
    ctx.fillStyle = shade(THEME.panel, isCurrentEra && scaleY >= 1 ? FACE_LIFT_ACTIVE : FACE_LIFT);
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, unit * 0.05);

    const top = groundY - bob - fullH;
    if (round) {
      const r = w / 2;
      ctx.beginPath();
      ctx.moveTo(cx - r, groundY - bob);
      ctx.lineTo(cx - r, top + r);
      ctx.arc(cx, top + r, r, Math.PI, 0);
      ctx.lineTo(cx + r, groundY - bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (pl.kind === "dome") {
        const dr = r * 0.6;
        ctx.beginPath();
        ctx.arc(cx, top + r - dr * 0.7, dr, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (pl.kind === "temple") {
        const tw = w * 0.45;
        const th = fullH * 0.12;
        roundRect(ctx, cx - tw / 2, top - th, tw, th, th * 0.3);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      roundRect(ctx, cx - w / 2, top, w, fullH, Math.min(unit * 0.2, w * 0.15));
      ctx.fill();
      ctx.stroke();
      if (pl.kind === "skyscraper") {
        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.lineTo(cx, top - fullH * 0.16);
        ctx.lineWidth = Math.max(1, unit * 0.045);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  });

  const landIn = easeOutCubic(enterT(env, 420));
  ctx.save();
  ctx.globalAlpha = landIn * leave;
  ctx.strokeStyle = rgba(accent, 0.6);
  ctx.lineWidth = unit * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(contentX, groundY);
  ctx.lineTo(contentX + contentW, groundY);
  ctx.stroke();
  ctx.restore();

  // Era "when" chip (+ optional stat), crossfading per beat.
  const eraIdx = active >= offset ? active - offset : -1;

  scene.eras.forEach((era, ei) => {
    const beat = offset + ei;
    const t = beatT(env.beats, beat, totalBeats, env.p);
    const isCur = ei === eraIdx;
    if (!isCur && !(ei < eraIdx)) {
      if (t <= 0) return;
    }
    if (!isCur) return;

    // Calculate center of buildings in this era
    let eraTotalX = 0;
    let eraCount = 0;
    placed.forEach((pl) => {
      if (pl.era === ei) {
        eraTotalX += pl.slotX + pl.slotW / 2;
        eraCount++;
      }
    });
    const avgX = eraCount > 0 ? eraTotalX / eraCount : contentX + contentW / 2;

    const pop = easeOutBack(clamp01(t / 0.25));
    ctx.save();
    ctx.globalAlpha = clamp01(t * 4) * leave;
    ctx.font = `800 ${unit * 0.72}px ${FONT_MONO}`;
    const whenW = ctx.measureText(era.when).width;
    let totalW = whenW + unit * 1.2;
    let statW = 0;
    if (era.stat) {
      ctx.font = `700 ${unit * 0.66}px ${FONT_MONO}`;
      statW = ctx.measureText(era.stat).width + unit * 1.0;
      totalW += statW + unit * 0.4;
    }

    let chipCx = avgX - totalW / 2;
    // Keep in bounds
    chipCx = Math.max(contentX, Math.min(contentX + contentW - totalW, chipCx));

    ctx.translate(chipCx + totalW / 2, chipRowY + chipRowH / 2);
    ctx.scale(pop, pop);
    ctx.translate(-(chipCx + totalW / 2), -(chipRowY + chipRowH / 2));
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.4;
    roundRect(ctx, chipCx, chipRowY, whenW + unit * 1.2, chipRowH, chipRowH / 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `800 ${unit * 0.72}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.bgBottom;
    ctx.textAlign = "center";
    ctx.fillText(era.when, chipCx + (whenW + unit * 1.2) / 2, chipRowY + chipRowH / 2 + unit * 0.26);
    if (era.stat) {
      const sx = chipCx + whenW + unit * 1.2 + unit * 0.4;
      roundRect(ctx, sx, chipRowY, statW, chipRowH, chipRowH / 2);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.strokeStyle = rgba(secondary, 0.6);
      ctx.lineWidth = unit * 0.05;
      ctx.stroke();
      ctx.font = `700 ${unit * 0.66}px ${FONT_MONO}`;
      ctx.fillStyle = secondary;
      ctx.fillText(era.stat, sx + statW / 2, chipRowY + chipRowH / 2 + unit * 0.24);
    }
    ctx.textAlign = "start";
    ctx.restore();
  });
  ctx.textAlign = "start";
}

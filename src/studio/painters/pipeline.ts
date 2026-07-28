import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  easeInOutCubic,
  sub,
  clamp01,
  enterT,
  fitFontSize,
  roundRect,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type PipelineScene = Extract<Scene, { kind: "pipeline" }>;
type Pt = { x: number; y: number };

const lerp = (a: Pt, b: Pt, f: number): Pt => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });

export function paintPipeline(ctx: CanvasRenderingContext2D, scene: PipelineScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const n = scene.stations.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const ghostIn = easeOutCubic(enterT(env, 420));

  const titleBand = drawSceneTitle(ctx, scene.title, layout, Math.max(env.p, enterT(env, 380) * 0.12), accent) + unit * 0.4;
  // Vertical: keep the last station above the caption band (bottom ~14%).
  let availH = contentH - titleBand;
  if (vertical) availH = Math.min(availH, layout.h * 0.86 - (contentY + titleBand));

  let trackA: Pt, trackB: Pt, startPos: Pt, axis: Pt, spacing: number;
  const stationPos: Pt[] = [];
  if (!vertical) {
    const trackY = contentY + titleBand + availH * 0.52;
    trackA = { x: contentX, y: trackY };
    trackB = { x: contentX + contentW, y: trackY };
    const lead = Math.min(contentW * 0.14, unit * 4);
    spacing = (contentW - lead) / n;
    for (let k = 0; k < n; k++) stationPos.push({ x: contentX + lead + spacing * (k + 0.5), y: trackY });
    startPos = { x: contentX + unit * 1.4, y: trackY };
    axis = { x: 1, y: 0 };
  } else {
    const trackX = contentX + contentW / 2;
    trackA = { x: trackX, y: contentY + titleBand };
    trackB = { x: trackX, y: contentY + titleBand + availH };
    const lead = Math.min(availH * 0.14, unit * 3.5);
    spacing = (availH - lead) / n;
    for (let k = 0; k < n; k++) stationPos.push({ x: trackX, y: contentY + titleBand + lead + spacing * (k + 0.5) });
    startPos = { x: trackX, y: contentY + titleBand + unit * 1.0 };
    axis = { x: 0, y: 1 };
  }
  const nudge = Math.min(unit * 1.6, spacing * 0.3);
  const restPos = (k: number): Pt =>
    k < 0 ? startPos : { x: stationPos[k].x + axis.x * nudge, y: stationPos[k].y + axis.y * nudge };

  // Conveyor: solid rail + dashes that crawl in the travel direction.
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(148,163,184,0.18)";
  ctx.lineWidth = unit * 0.12;
  ctx.beginPath();
  ctx.moveTo(trackA.x, trackA.y);
  ctx.lineTo(trackB.x, trackB.y);
  ctx.stroke();
  const dashPeriod = unit * 1.1;
  ctx.strokeStyle = rgba(accent, 0.45);
  ctx.lineWidth = unit * 0.09;
  ctx.setLineDash([unit * 0.55, unit * 0.55]);
  ctx.lineDashOffset = -((env.elapsedMs / 30) % dashPeriod);
  ctx.beginPath();
  ctx.moveTo(trackA.x, trackA.y);
  ctx.lineTo(trackB.x, trackB.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.restore();

  // Item state: which station it is at, its position, current label + morph scale.
  const j = Math.min(active - offset, n - 1);
  const t = j >= 0 ? beatT(env.beats, offset + j, totalBeats, env.p) : 0;
  let pos = startPos;
  let label = scene.item.label;
  let sy = 1;
  if (j >= 0) {
    const from = restPos(j - 1);
    const to = stationPos[j];
    if (t < 0.45) pos = lerp(from, to, easeInOutCubic(t / 0.45));
    else if (t < 0.75) pos = to;
    else pos = { x: to.x + axis.x * nudge * easeOutCubic((t - 0.75) / 0.25), y: to.y + axis.y * nudge * easeOutCubic((t - 0.75) / 0.25) };
    label = t < 0.68 ? (j === 0 ? scene.item.label : scene.stations[j - 1].out) : scene.stations[j].out;
    if (t >= 0.6 && t < 0.68) sy = 1 - (t - 0.6) / 0.08;
    else if (t >= 0.68 && t < 0.8) sy = easeOutBack((t - 0.68) / 0.12);
  }

  scene.stations.forEach((station, k) => {
    const sp = stationPos[k];
    const st = beatT(env.beats, offset + k, totalBeats, env.p);
    const isActive = active === offset + k && !inTail;
    const isPast = active > offset + k || inTail;
    const alpha = st <= 0 ? 0.35 * ghostIn : isActive ? 1 : isPast ? 0.5 : 0.35;
    if (alpha <= 0) return;
    const itemInside = isActive && t >= 0.45 && t < 0.8;

    ctx.save();
    ctx.globalAlpha = alpha;
    const border = isActive ? accent : "rgba(148,163,184,0.5)";

    let roofX: number, roofY: number, roofW: number, roofH: number;
    let legBottom: number;
    if (!vertical) {
      // Substantial "machine" boxes that fill the frame instead of tiny roofs.
      roofW = Math.min(spacing * 0.84, unit * 5.6);
      roofH = Math.min(availH * 0.3, unit * 2.4);
      roofX = sp.x - roofW / 2;
      roofY = sp.y - roofH - unit * 1.7;
      legBottom = sp.y + unit * 1.2;
    } else {
      roofW = Math.min(unit * 6.0, contentW * 0.46);
      roofH = Math.min(spacing * 0.5, unit * 2.2);
      roofX = sp.x - roofW / 2;
      roofY = sp.y - roofH - unit * 0.9;
      legBottom = sp.y + unit * 1.0;
    }
    ctx.strokeStyle = border;
    ctx.lineWidth = unit * 0.16;
    ctx.lineCap = "round";
    for (const px of [roofX + unit * 0.5, roofX + roofW - unit * 0.5]) {
      ctx.beginPath();
      ctx.moveTo(px, roofY + roofH);
      ctx.lineTo(px, legBottom);
      ctx.stroke();
    }

    if (itemInside) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.7 + 0.25 * Math.sin(env.elapsedMs / 300));
    }
    roundRect(ctx, roofX, roofY, roofW, roofH, unit * 0.35);
    ctx.fillStyle = isActive ? "#0e2433" : THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, roofX, roofY, roofW, roofH, unit * 0.35);
    ctx.strokeStyle = border;
    ctx.lineWidth = isActive ? unit * 0.1 : unit * 0.06;
    ctx.stroke();

    ctx.textAlign = "center";
    if (station.icon) {
      ctx.font = `${roofH * 0.62}px ${FONT_SANS}`;
      ctx.fillText(station.icon, sp.x, roofY + roofH * 0.72);
    } else {
      ctx.font = `700 ${roofH * 0.55}px ${FONT_MONO}`;
      ctx.fillStyle = accent;
      ctx.fillText(String(k + 1), sp.x, roofY + roofH * 0.7);
    }
    ctx.fillStyle = isActive ? THEME.text : THEME.textDim;
    if (!vertical) {
      const px = fitFontSize(ctx, station.label, { maxW: spacing * 0.9, startPx: unit * 0.72, minPx: unit * 0.5, weight: 600 });
      ctx.font = `600 ${px}px ${FONT_SANS}`;
      ctx.fillText(station.label, sp.x, roofY + roofH + unit * 0.72);
    } else {
      ctx.textAlign = "left";
      const lx = sp.x + roofW / 2 + unit * 0.5;
      const maxW = contentX + contentW - lx - unit * 0.2;
      const px = fitFontSize(ctx, station.label, { maxW, startPx: unit * 0.8, minPx: unit * 0.55, weight: 600 });
      ctx.font = `600 ${px}px ${FONT_SANS}`;
      ctx.fillText(station.label, lx, sp.y + px * 0.35);
      ctx.textAlign = "center";
    }

    if (isPast) {
      ctx.globalAlpha = Math.min(1, alpha * 1.8);
      ctx.fillStyle = THEME.good;
      ctx.beginPath();
      ctx.arc(roofX + roofW - unit * 0.12, roofY + unit * 0.05, unit * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = "start";
    ctx.restore();
  });

  // Trailing ghost dots while the item glides.
  if (j >= 0 && t > 0.03 && t < 0.45) {
    const from = restPos(j - 1);
    const to = stationPos[j];
    [
      { lag: 0.06, a: 0.3 },
      { lag: 0.12, a: 0.15 },
    ].forEach(({ lag, a }) => {
      const gp = lerp(from, to, easeInOutCubic(clamp01((t - lag) / 0.45)));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(gp.x, gp.y, unit * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // The item pill, on top of everything.
  const pillPx = unit * (vertical ? 0.78 : 0.7);
  ctx.save();
  ctx.font = `700 ${pillPx}px ${FONT_SANS}`;
  const tw = ctx.measureText(label).width;
  const iconPad = scene.item.icon ? unit * 1.05 : 0;
  const pillW = tw + iconPad + unit * 1.0;
  const pillH = unit * 1.4;
  ctx.translate(pos.x, pos.y);
  ctx.scale(1, Math.max(sy, 0.02));
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * 0.6;
  roundRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
  ctx.fillStyle = "#0a0e13";
  ctx.fill();
  ctx.shadowBlur = 0;
  roundRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = unit * 0.1;
  ctx.stroke();
  let lx = -pillW / 2 + unit * 0.5;
  if (scene.item.icon) {
    ctx.font = `${unit * 0.8}px ${FONT_SANS}`;
    ctx.fillText(scene.item.icon, lx, unit * 0.28);
    lx += iconPad;
  }
  ctx.font = `700 ${pillPx}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.fillText(label, lx, unit * 0.25);
  ctx.restore();

  // Sparkles orbiting the item while it is being transformed inside a station.
  if (j >= 0 && t >= 0.45 && t < 0.8) {
    const win = Math.sin(Math.PI * sub(t, 0.45, 0.35));
    for (let d = 0; d < 3; d++) {
      const a = env.elapsedMs / 300 + (d * Math.PI * 2) / 3;
      ctx.save();
      ctx.globalAlpha = 0.9 * win;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7;
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath();
      ctx.arc(pos.x + Math.cos(a) * unit * 0.9, pos.y + Math.sin(a) * unit * 0.9, unit * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}

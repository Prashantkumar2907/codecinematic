import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  clamp01,
  enterT,
  idle,
  smoothPulse,
  roundRect,
  shade,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type FlamegraphScene = Extract<Scene, { kind: "flamegraph" }>;
type Bar = FlamegraphScene["bars"][number];
type Tone = "normal" | "warn" | "good";

function toneOf(bar: Bar, warnAtMs?: number): Tone {
  if (bar.tone) return bar.tone;
  if (warnAtMs != null && bar.durMs >= warnAtMs) return "warn";
  return "normal";
}

function toneColor(tone: Tone, accent: string): string {
  if (tone === "warn") return THEME.warn;
  if (tone === "good") return THEME.good;
  return accent;
}

/**
 * Stacked horizontal time bars for profiling views: either a "flame" layout
 * (rows = call-stack depth, siblings share a row, callees nest below — the
 * DevTools Performance-panel read on a blocking main-thread task or a wasted
 * React re-render tree) or a "waterfall" layout (rows = one per request, top
 * to bottom in authored order — the Network-panel read on parallel vs
 * sequential fetches). Bars grow in left-to-right one per beat; a bar whose
 * duration meets `warnAtMs` (or is explicitly tagged) tints as a blocking/slow
 * bar. In waterfall mode, a row whose depth increases from the row above is
 * read as "waits on" the previous row, and gets a dashed staircase connector
 * with the idle gap called out — the classic waterfall-vs-parallel picture.
 */
export function paintFlamegraph(ctx: CanvasRenderingContext2D, scene: FlamegraphScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow } = env.palette;
  const n = scene.bars.length;
  const offset = introBeatCount(scene);
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeIdx = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.5;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const stepT = activeIdx >= 0 ? beatT(env.beats, offset + activeIdx, totalBeats, env.p) : 0;
  const revealed = activeIdx < 0 ? 0 : activeIdx + easeOutCubic(clamp01(stepT * 1.5));

  const isFlame = scene.mode === "flame";
  const rows = isFlame ? Math.max(...scene.bars.map((b) => b.depth), 0) + 1 : Math.max(n, 1);

  const gutterT = unit * 1.15;
  const rowGap = unit * 0.26;
  const trackY = areaY + gutterT;
  const trackH = Math.max(unit * 2, areaH - gutterT);
  const rowH = Math.max(unit * 0.5, Math.min((trackH - rowGap * (rows - 1)) / rows, unit * 2.3));
  const gridH = rows * rowH + rowGap * (rows - 1);
  const trackTop = trackY + Math.max(0, (trackH - gridH) / 2);
  const trackX = contentX;
  const trackW = contentW;

  const xAt = (ms: number) => trackX + clamp01(ms / scene.totalMs) * trackW;
  const wAt = (ms: number) => clamp01(ms / scene.totalMs) * trackW;
  const rowY = (r: number) => trackTop + r * (rowH + rowGap);

  // Time axis: gridlines + tick labels above the track.
  const ticks = 5;
  ctx.save();
  ctx.globalAlpha = introIn * 0.6;
  ctx.font = `600 ${unit * 0.48}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "center";
  for (let i = 0; i <= ticks; i++) {
    const ms = (scene.totalMs / ticks) * i;
    const x = xAt(ms);
    ctx.strokeStyle = "rgba(148,163,184,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, trackY - unit * 0.1);
    ctx.lineTo(x, trackTop + gridH);
    ctx.stroke();
    ctx.fillText(`${Math.round(ms)}${scene.unitLabel}`, x, areaY + gutterT * 0.62);
  }
  ctx.textAlign = "start";
  ctx.restore();

  // Bars — replay 0..activeIdx fully drawn; the active one grows in over stepT.
  const anchors: { x: number; y: number }[] = [];
  scene.bars.forEach((bar, i) => {
    const row = isFlame ? bar.depth : i;
    const y = rowY(row);
    anchors[i] = { x: xAt(bar.startMs + bar.durMs), y: y + rowH / 2 };
    const local = clamp01(revealed - i);
    if (local <= 0) return;

    const isActive = i === activeIdx;
    const appear = easeOutCubic(local);
    const x = xAt(bar.startMs);
    const w = Math.max(unit * 0.1, wAt(bar.durMs) * appear);
    const tone = toneOf(bar, scene.warnAtMs);
    const color = toneColor(tone, accent);
    const r = Math.min(rowH * 0.3, unit * 0.28);
    const fillColor = isFlame && bar.depth > 0 ? shade(color, -Math.min(bar.depth, 6) * 0.05) : color;

    ctx.save();
    const fade = introIn * clamp01(local * 1.4);
    ctx.globalAlpha = fade * 0.85;
    if (isActive && local < 1) {
      ctx.shadowColor = rgba(color, 0.55);
      ctx.shadowBlur = unit * 0.6;
    }
    roundRect(ctx, x, y, w, rowH, r);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.shadowBlur = 0;

    const breathe = isActive ? 0.7 + 0.3 * idle(env, 1500) : 1;
    ctx.globalAlpha = fade * breathe;
    ctx.strokeStyle = color;
    ctx.lineWidth = unit * (isActive ? 0.1 : 0.06);
    ctx.stroke();

    if (tone === "warn") {
      const pulse = smoothPulse(env, 1000, 1.12);
      ctx.globalAlpha = fade * 0.5 * (2.1 - pulse);
      ctx.strokeStyle = THEME.warn;
      ctx.lineWidth = unit * 0.04;
      roundRect(ctx, x - unit * 0.05, y - unit * 0.05, w + unit * 0.1, rowH + unit * 0.1, r);
      ctx.stroke();
    }

    ctx.globalAlpha = fade;
    ctx.textBaseline = "middle";
    const padX = unit * 0.26;
    const durText = `${Math.round(bar.durMs)}${scene.unitLabel}`;
    if (w > unit * 2.1) {
      const labelPx = fitFontSize(ctx, bar.label, {
        maxW: w - padX * 2 - unit * 1.5,
        startPx: Math.min(rowH * 0.4, unit * 0.6),
        minPx: unit * 0.4,
        weight: 700,
      });
      ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "start";
      ctx.fillText(bar.label, x + padX, y + rowH / 2);
      if (w > unit * 4 && appear >= 0.98) {
        ctx.font = `600 ${Math.min(unit * 0.48, rowH * 0.34)}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.textDim;
        ctx.textAlign = "end";
        ctx.fillText(durText, x + w - padX, y + rowH / 2);
      }
    } else if (appear >= 0.98) {
      ctx.font = `600 ${unit * 0.52}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "start";
      ctx.fillText(bar.label, x + w + unit * 0.3, y + rowH / 2);
    }
    ctx.textAlign = "start";
    ctx.restore();
  });

  // Waterfall staircase: a depth increase from the row above reads as "waits
  // on" that row — draw a dashed elbow and call out the idle gap.
  if (!isFlame) {
    for (let i = 1; i < n; i++) {
      if (scene.bars[i].depth <= scene.bars[i - 1].depth) continue;
      const aLocal = clamp01(revealed - (i - 1));
      const bLocal = clamp01(revealed - i);
      if (aLocal <= 0 || bLocal <= 0) continue;
      const a = anchors[i - 1];
      const bx = xAt(scene.bars[i].startMs);
      const by = rowY(i) + rowH / 2;
      const gapMs = scene.bars[i].startMs - (scene.bars[i - 1].startMs + scene.bars[i - 1].durMs);
      ctx.save();
      ctx.globalAlpha = introIn * Math.min(aLocal, bLocal) * 0.55;
      ctx.strokeStyle = THEME.textFaint;
      ctx.lineWidth = unit * 0.05;
      ctx.setLineDash([unit * 0.16, unit * 0.14]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(bx, a.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      if (gapMs > 0 && Math.min(aLocal, bLocal) > 0.6) {
        ctx.font = `600 ${unit * 0.46}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.textDim;
        ctx.textAlign = "center";
        ctx.fillText(`wait ${Math.round(gapMs)}${scene.unitLabel}`, (a.x + bx) / 2, a.y - unit * 0.28);
        ctx.textAlign = "start";
      }
      ctx.restore();
    }
  }

  // Execution cursor: a glowing line at the leading edge of the bar currently
  // playing, so the timeline reads as something happening, not a static chart.
  if (activeIdx >= 0 && activeIdx < n) {
    const bar = scene.bars[activeIdx];
    const grow = easeOutCubic(clamp01(stepT * 1.5));
    if (grow < 1) {
      const cursorX = xAt(bar.startMs) + wAt(bar.durMs) * grow;
      const row = isFlame ? bar.depth : activeIdx;
      const y0 = rowY(row) - unit * 0.14;
      const y1 = rowY(row) + rowH + unit * 0.14;
      ctx.save();
      ctx.globalAlpha = introIn * (0.55 + 0.45 * idle(env, 900));
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.05;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
      ctx.beginPath();
      ctx.moveTo(cursorX, y0);
      ctx.lineTo(cursorX, y1);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  smoothPulse,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type TraceScene = Extract<Scene, { kind: "telemetry_trace" }>;
type Span = TraceScene["spans"][number];

const MAX_DEPTH_GUARD = 20;
const ICON: Record<Span["kind"], string> = {
  gateway: "api",
  service: "server",
  db: "database",
  cache: "cache",
  queue: "queue",
  external: "cloud",
};

/**
 * A distributed-trace waterfall: one root span (the gateway) fans out into
 * child spans (downstream services/DBs/caches) that can run sequentially or
 * in parallel. A left "tree" rail shows the parent→child call structure via
 * indentation + bracket guides (who-called-whom); the right side is a real
 * time axis where each span's horizontal bar starts/ends at its true offset,
 * so parallel children visibly overlap and sequential ones visibly queue.
 * Spans draw in left-to-right, one per beat. An optional trailing `verdict`
 * beat (e.g. a sampling decision) glows the whole trace green/kept or dims it
 * amber/dropped with a one-line reason banner.
 */
export function paintTelemetryTrace(ctx: CanvasRenderingContext2D, scene: TraceScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const n = scene.spans.length;
  const hasVerdict = !!scene.verdict;
  const offset = introBeatCount(scene);
  const totalBeats = offset + n + (hasVerdict ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeIdx = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.5;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const spanStepT = activeIdx >= 0 && activeIdx < n ? beatT(env.beats, offset + activeIdx, totalBeats, env.p) : 0;
  const revealed = activeIdx < 0 ? 0 : Math.min(n, activeIdx + easeOutCubic(clamp01(spanStepT * 1.5)));
  const verdictIdx = n;
  const verdictActive = hasVerdict && activeIdx >= verdictIdx;
  const verdictT = verdictActive ? beatT(env.beats, offset + verdictIdx, totalBeats, env.p) : 0;

  // Parent lookup + depth (bounded recursion so a malformed/cyclic parentId
  // chain can never hang the painter — it just bottoms out at depth 0).
  const idxOf = new Map(scene.spans.map((s, i) => [s.id, i] as const));
  const depthOf = new Map<string, number>();
  const depthFor = (id: string, guard = 0): number => {
    const cached = depthOf.get(id);
    if (cached !== undefined) return cached;
    const s = scene.spans[idxOf.get(id) ?? -1];
    if (guard > MAX_DEPTH_GUARD || !s || !s.parentId || s.parentId === id || !idxOf.has(s.parentId)) {
      depthOf.set(id, 0);
      return 0;
    }
    const d = depthFor(s.parentId, guard + 1) + 1;
    depthOf.set(id, d);
    return d;
  };
  scene.spans.forEach((s) => depthFor(s.id));
  const childrenOf = new Map<string, number[]>();
  scene.spans.forEach((s, i) => {
    if (s.parentId && idxOf.has(s.parentId)) {
      const arr = childrenOf.get(s.parentId) ?? [];
      arr.push(i);
      childrenOf.set(s.parentId, arr);
    }
  });
  const maxDepth = Math.max(0, ...scene.spans.map((s) => depthOf.get(s.id) ?? 0));

  // Tree rail (left, indentation guides) vs time track (right, real ms axis).
  const treeFrac = vertical ? 0.4 : Math.min(0.32, 0.14 + maxDepth * 0.045);
  const treeW = Math.min(contentW * treeFrac, unit * 9);
  const treeX = contentX;
  const trackX = contentX + treeW + unit * 0.5;
  const trackW = Math.max(unit * 3, contentW - treeW - unit * 0.5);
  const indentUnit = Math.min(unit * 0.62, (treeW - unit * 1.4) / Math.max(maxDepth, 1) / 1.4);

  const gutterT = unit * 1.1;
  const rowGap = unit * 0.22;
  const trackTop0 = areaY + gutterT;
  const trackAvailH = Math.max(unit * 2, areaH - gutterT - (hasVerdict ? unit * 1.7 : 0));
  const rowH = Math.max(unit * 0.55, Math.min((trackAvailH - rowGap * (n - 1)) / n, unit * 2.0));
  const gridH = n * rowH + rowGap * (n - 1);
  const trackTop = trackTop0 + Math.max(0, (trackAvailH - gridH) / 2);
  const rowY = (i: number) => trackTop + i * (rowH + rowGap);
  const iconX = (depth: number) => treeX + depth * indentUnit + indentUnit * 0.5;

  const xAt = (ms: number) => trackX + clamp01(ms / scene.totalMs) * trackW;
  const wAt = (ms: number) => clamp01(ms / scene.totalMs) * trackW;

  // Time axis ticks over the track only (the tree rail stays label space).
  const ticks = vertical ? 3 : 5;
  ctx.save();
  ctx.globalAlpha = introIn * 0.55;
  ctx.font = `600 ${unit * 0.44}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "center";
  for (let i = 0; i <= ticks; i++) {
    const ms = (scene.totalMs / ticks) * i;
    const x = xAt(ms);
    ctx.strokeStyle = rgba(THEME.textDim, 0.13);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, trackTop0 - unit * 0.1);
    ctx.lineTo(x, trackTop + gridH);
    ctx.stroke();
    ctx.fillText(`${Math.round(ms)}${scene.unitLabel}`, x, areaY + gutterT * 0.62);
  }
  ctx.textAlign = "start";
  ctx.restore();

  // Fade toward the verdict once it starts narrating: kept spans stay lit,
  // dropped spans desaturate to read as "this trace didn't make the cut".
  const verdictFade = verdictActive ? easeOutCubic(clamp01(verdictT * 1.4)) : 0;
  const dropDim = hasVerdict && scene.verdict!.outcome === "drop" ? verdictFade : 0;
  const keepGlow = hasVerdict && scene.verdict!.outcome === "keep" ? verdictFade : 0;

  // Tree-rail bracket guides: a vertical line from a parent's icon down through
  // its children's rows, with a short horizontal tick into each child icon —
  // the "who forked off whom" read, independent of the time axis.
  scene.spans.forEach((span, i) => {
    const kids = childrenOf.get(span.id);
    if (!kids || kids.length === 0) return;
    const pLocal = clamp01(revealed - i);
    if (pLocal <= 0) return;
    const d = depthOf.get(span.id) ?? 0;
    const gx = iconX(d) + indentUnit * 0.42;
    const rows = kids.filter((k) => clamp01(revealed - k) > 0);
    if (rows.length === 0) return;
    const yTop = rowY(i);
    const yBottom = rows.reduce((m, k) => Math.max(m, rowY(k)), yTop);
    ctx.save();
    ctx.globalAlpha = introIn * pLocal * 0.45 * (1 - dropDim * 0.6);
    ctx.strokeStyle = THEME.textFaint;
    ctx.lineWidth = unit * 0.045;
    ctx.beginPath();
    ctx.moveTo(gx, yTop + rowH * 0.5);
    ctx.lineTo(gx, yBottom + rowH * 0.5);
    ctx.stroke();
    rows.forEach((k) => {
      const kLocal = clamp01(revealed - k);
      ctx.globalAlpha = introIn * Math.min(pLocal, kLocal) * 0.45 * (1 - dropDim * 0.6);
      ctx.beginPath();
      ctx.moveTo(gx, rowY(k) + rowH * 0.5);
      ctx.lineTo(iconX(d + 1) - indentUnit * 0.28, rowY(k) + rowH * 0.5);
      ctx.stroke();
    });
    ctx.restore();
  });

  // Rows: icon + service label on the rail, real-time bar on the track.
  scene.spans.forEach((span, i) => {
    const local = clamp01(revealed - i);
    if (local <= 0) return;
    const isActiveRow = i === activeIdx;
    const appear = easeOutCubic(local);
    const y = rowY(i);
    const depth = depthOf.get(span.id) ?? 0;
    const isError = span.status === "error";
    const baseColor = isError ? THEME.warn : accent;
    const color = dropDim > 0 ? THEME.textFaint : baseColor;

    const bx = xAt(span.startMs);
    const bw = Math.max(unit * 0.1, wAt(span.durMs) * appear);
    const r = Math.min(rowH * 0.3, unit * 0.24);

    ctx.save();
    const fade = introIn * clamp01(local * 1.4) * (1 - dropDim * 0.7) * (1 + keepGlow * 0.1);
    ctx.globalAlpha = fade * 0.88;
    if (isActiveRow && local < 1) {
      ctx.shadowColor = rgba(baseColor, 0.55);
      ctx.shadowBlur = unit * 0.6;
    } else if (keepGlow > 0.3) {
      ctx.shadowColor = rgba(THEME.good, 0.5 * keepGlow);
      ctx.shadowBlur = unit * 0.5;
    }
    roundRect(ctx, bx, y, bw, rowH, r);
    // The "kept" glow shouldn't erase an error span's warn colour — that span
    // is very likely THE reason the trace was kept, so it must stay visually
    // distinct from the healthy spans turning green around it.
    ctx.fillStyle = keepGlow > 0.3 && !isError ? THEME.good : color;
    ctx.fill();
    ctx.shadowBlur = 0;

    const breathe = isActiveRow ? 0.7 + 0.3 * idle(env, 1500) : 1;
    ctx.globalAlpha = fade * breathe;
    ctx.strokeStyle = keepGlow > 0.3 && !isError ? THEME.good : color;
    ctx.lineWidth = unit * (isActiveRow ? 0.1 : 0.06);
    ctx.stroke();

    if (isError && dropDim === 0) {
      const pulse = smoothPulse(env, 1000, 1.12);
      ctx.globalAlpha = fade * 0.5 * (2.1 - pulse);
      ctx.strokeStyle = THEME.warn;
      ctx.lineWidth = unit * 0.04;
      roundRect(ctx, bx - unit * 0.05, y - unit * 0.05, bw + unit * 0.1, rowH + unit * 0.1, r);
      ctx.stroke();
    }

    // Duration label once the bar has room.
    if (bw > unit * 1.6 && appear >= 0.98) {
      ctx.globalAlpha = fade;
      ctx.font = `600 ${Math.min(unit * 0.46, rowH * 0.36)}px ${FONT_MONO}`;
      ctx.fillStyle = rgba(THEME.bgBottom, 0.85);
      ctx.textAlign = "start";
      ctx.textBaseline = "middle";
      ctx.fillText(`${Math.round(span.durMs)}${scene.unitLabel}`, bx + unit * 0.2, y + rowH / 2);
    }
    ctx.restore();

    // Rail: icon + service name, indented by call-tree depth.
    const ix = iconX(depth);
    ctx.save();
    ctx.globalAlpha = introIn * clamp01(local * 1.4) * (1 - dropDim * 0.6);
    const bob = isActiveRow ? Math.sin(env.elapsedMs / 1200) * unit * 0.04 : 0;
    drawIcon(ctx, ICON[span.kind], ix, y + rowH / 2 + bob, rowH * (0.62 + 0.1 * (isActiveRow ? easeOutBack(local) - 1 : 0)), env, dropDim > 0.5 ? THEME.textFaint : baseColor);
    const labelX = ix + indentUnit * 0.72 + unit * 0.15;
    const labelMaxW = Math.max(unit * 1.2, treeX + treeW - labelX - unit * 0.15);
    const labelPx = fitFontSize(ctx, span.service, {
      maxW: labelMaxW,
      startPx: Math.min(rowH * 0.42, unit * 0.6),
      minPx: unit * 0.34,
      weight: 700,
    });
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = dropDim > 0 ? THEME.textFaint : THEME.text;
    ctx.textAlign = "start";
    ctx.textBaseline = "middle";
    ctx.fillText(span.service, labelX, y + rowH / 2);
    ctx.restore();
  });

  // Live cursor at the leading edge of the span currently narrating.
  if (activeIdx >= 0 && activeIdx < n && spanStepT < 1) {
    const span = scene.spans[activeIdx];
    const grow = easeOutCubic(clamp01(spanStepT * 1.5));
    const cursorX = xAt(span.startMs) + wAt(span.durMs) * grow;
    const y0 = rowY(activeIdx) - unit * 0.14;
    const y1 = rowY(activeIdx) + rowH + unit * 0.14;
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

  // Verdict banner: slides up once its beat starts, stating the sampling/SLA
  // decision that the just-drawn trace earned.
  if (hasVerdict && verdictFade > 0) {
    const v = scene.verdict!;
    const tone = v.outcome === "keep" ? THEME.good : THEME.warn;
    const bannerH = unit * 1.5;
    const slide = easeOutCubic(clamp01(verdictT * 1.3));
    const by = contentY + contentH - bannerH * slide;
    ctx.save();
    ctx.globalAlpha = introIn * slide;
    roundRect(ctx, contentX, by, contentW, bannerH, unit * 0.35);
    ctx.fillStyle = rgba(THEME.bgBottom, 0.86);
    ctx.fill();
    ctx.lineWidth = unit * 0.1;
    ctx.strokeStyle = tone;
    ctx.shadowColor = rgba(tone, 0.45 + 0.2 * idle(env, 1400));
    ctx.shadowBlur = unit * 0.6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    const stamp = v.outcome === "keep" ? "KEPT" : "DROPPED";
    const stampPx = Math.min(unit * 0.85, bannerH * 0.4);
    ctx.font = `800 ${stampPx}px ${FONT_SANS}`;
    ctx.fillStyle = tone;
    ctx.textAlign = "start";
    ctx.textBaseline = "middle";
    ctx.fillText(stamp, contentX + unit * 0.55, by + bannerH * 0.36);
    ctx.font = `600 ${Math.min(unit * 0.56, bannerH * 0.28)}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    const reasonMaxW = contentW - unit * 1.1;
    const reasonPx = fitFontSize(ctx, v.reason, { maxW: reasonMaxW, startPx: Math.min(unit * 0.56, bannerH * 0.28), minPx: unit * 0.4, weight: 600 });
    ctx.font = `600 ${reasonPx}px ${FONT_SANS}`;
    ctx.fillText(v.reason, contentX + unit * 0.55, by + bannerH * 0.72);
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

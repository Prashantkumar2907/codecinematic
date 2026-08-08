import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  lerpColor,
  clamp01,
  wrapText,
  roundRect,
  drawArrowhead,
  drawSceneTitle,
  strokePolylineProgress,
  pointAlongPolyline,
  fitFontSize,
  beatWindow,
  beatT,
  activeBeatIndex,
  departT,
  rgba,
  type Layout,
} from "./common";
import type { PaintEnv } from "./index";

type DecisionScene = Extract<Scene, { kind: "decision" }>;
type DecisionNode = DecisionScene["nodes"][number];
type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const GRID = 12;
/** Fraction of a step beat spent drawing the walked edge. */
const ARRIVE = 0.5;
const CURVE_SAMPLES = 20;
const GHOST_NODE = 0.35;
const GHOST_EDGE = 0.2;
const REJECTED = 0.15;
/** A travelling marker/tail head reads as white-hot regardless of subject
 *  accent — same convention as `cipher.ts`'s `INK_BRIGHT`. */
const SPARK = "#eaf6ff";
const INK_PANEL = THEME.bgBottom;

type GridMap = { ox: number; oy: number; cw: number; ch: number; rot: boolean; maxYo: number };

/** Rotate a 1×1 node's grid coords 90° so a wide flow reads top→bottom in 9:16
 *  (and a tall flow reads left→right in 16:9) — fills the frame instead of a
 *  small centred cluster. */
function dispXY(n: DecisionNode, rot: boolean, maxYo: number): { x: number; y: number } {
  return rot ? { x: maxYo - (n.y + 1), y: n.x } : { x: n.x, y: n.y };
}

function shouldRotate(nodes: DecisionNode[], vertical: boolean): boolean {
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + 1));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + 1));
  const aspect = Math.max(maxX - minX, 1) / Math.max(maxY - minY, 1);
  return vertical ? aspect >= 1.5 : aspect <= 0.66;
}

function gridMap(nodes: DecisionNode[], layout: Layout, titleBand: number, rot: boolean): GridMap {
  const areaX = layout.contentX;
  const areaY = layout.contentY + titleBand;
  const areaW = layout.contentW;
  // Vertical: shave the foot so bottom nodes clear the caption band.
  const areaH = layout.contentH - titleBand - (layout.vertical ? layout.unit : 0);
  const cellW = areaW / GRID;
  const cellH = areaH / GRID;
  const maxYo = Math.max(...nodes.map((n) => n.y + 1));
  const d = nodes.map((n) => dispXY(n, rot, maxYo));
  const minX = Math.min(...d.map((p) => p.x));
  const maxX = Math.max(...d.map((p) => p.x + 1));
  const minY = Math.min(...d.map((p) => p.y));
  const maxY = Math.max(...d.map((p) => p.y + 1));
  const usedW = Math.max(maxX - minX, 1);
  const usedH = Math.max(maxY - minY, 1);
  const f = Math.min(GRID / usedW, GRID / usedH, 1.3);
  const cw = cellW * f;
  const ch = cellH * f;
  return {
    cw,
    ch,
    rot,
    maxYo,
    ox: areaX + (areaW - usedW * cw) / 2 - minX * cw,
    oy: areaY + (areaH - usedH * ch) / 2 - minY * ch,
  };
}

function boundaryPoint(r: Rect, diamond: boolean, toward: Pt): Pt {
  const dx = toward.x - r.cx;
  const dy = toward.y - r.cy;
  const hw = r.w / 2;
  const hh = r.h / 2;
  const d = diamond ? Math.abs(dx) / hw + Math.abs(dy) / hh : Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  const s = 1 / Math.max(d, 1e-6);
  return { x: r.cx + dx * Math.min(s, 1), y: r.cy + dy * Math.min(s, 1) };
}

function diamondPath(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.beginPath();
  ctx.moveTo(r.cx, r.y);
  ctx.lineTo(r.x + r.w, r.cy);
  ctx.lineTo(r.cx, r.y + r.h);
  ctx.lineTo(r.x, r.cy);
  ctx.closePath();
}

export function paintDecision(ctx: CanvasRenderingContext2D, scene: DecisionScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, vertical } = layout;
  const { accent, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const leave = departT(env, 380);
  if (leave <= 0) return;
  // Multiplied into the shared entrance factor every alpha site already reads.
  const introIn = easeOutCubic(enterT(env, 400)) * leave;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const rot = shouldRotate(scene.nodes, layout.vertical);
  const map = gridMap(scene.nodes, layout, titleBand, rot);

  const nodeById = new Map(scene.nodes.map((n) => [n.id, n]));
  const rects = new Map<string, Rect>();
  for (const n of scene.nodes) {
    const isQ = n.shape === "question";
    const w = isQ ? Math.min(unit * 7, map.cw * 3.4) : Math.min(unit * 5.6, map.cw * 3.0);
    const h = isQ ? Math.min(unit * 4.0, map.ch * 2.6) : Math.min(unit * 2.1, map.ch * 1.6);
    const d = dispXY(n, map.rot, map.maxYo);
    const cx = map.ox + (d.x + 0.5) * map.cw;
    const cy = map.oy + (d.y + 0.5) * map.ch;
    rects.set(n.id, { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy });
  }

  const edgePts = new Map<string, Pt[]>();
  for (const e of scene.edges) {
    const a = rects.get(e.from);
    const b = rects.get(e.to);
    if (!a || !b || e.from === e.to) continue;
    const key = `${e.from}>${e.to}`;
    const p0 = boundaryPoint(a, nodeById.get(e.from)?.shape === "question", { x: b.cx, y: b.cy });
    const p1 = boundaryPoint(b, nodeById.get(e.to)?.shape === "question", { x: a.cx, y: a.cy });
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    // One canonical curve direction under the phase's one-look-per-kind
    // decision — the old per-edge coin flip added no information.
    const off = unit * 0.8;
    const c = { x: (p0.x + p1.x) / 2 + (-dy / len) * off, y: (p0.y + p1.y) / 2 + (dx / len) * off };
    const pts: Pt[] = [];
    for (let i = 0; i <= CURVE_SAMPLES - 1; i++) {
      const t = i / (CURVE_SAMPLES - 1);
      const u = 1 - t;
      pts.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y });
    }
    edgePts.set(key, pts);
  }

  const startId = scene.nodes[0].id;
  const walk: { key: string; pts: Pt[]; toId: string; fromId: string }[] = [];
  {
    let curId = startId;
    for (const st of scene.steps) {
      const key = `${curId}>${st.go}`;
      let pts = edgePts.get(key);
      if (!pts) {
        const a = rects.get(curId) ?? { cx: 0, cy: 0, x: 0, y: 0, w: 0, h: 0 };
        const b = rects.get(st.go) ?? a;
        pts = [{ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }];
      }
      walk.push({ key, pts, toId: st.go, fromId: curId });
      curId = st.go;
    }
  }
  const stepT = walk.map((_, k) => beatT(env.beats, offset + k, totalBeats, env.p));

  const pathNodes = new Set([startId, ...walk.map((w) => w.toId)]);
  const takenKeys = new Set(walk.map((w) => w.key));
  // "Not this way": beat index at which each non-taken sibling edge / dead-end
  // node starts easing down. Replayed once, deterministic.
  const rejEdges = new Map<string, number>();
  const rejNodes = new Map<string, number>();
  walk.forEach((w, k) => {
    for (const e of scene.edges) {
      if (e.from !== w.fromId || e.to === w.toId) continue;
      const key = `${e.from}>${e.to}`;
      if (!takenKeys.has(key) && !rejEdges.has(key)) rejEdges.set(key, k);
      if (!pathNodes.has(e.to) && !rejNodes.has(e.to)) rejNodes.set(e.to, k);
    }
  });

  const reachedT = new Map<string, number>();
  reachedT.set(startId, 1);
  walk.forEach((w, k) => {
    const t = stepT[k];
    const appear = clamp01((t - ARRIVE) / 0.2);
    if (appear > 0) reachedT.set(w.toId, Math.max(reachedT.get(w.toId) ?? 0, appear));
  });

  for (const e of scene.edges) {
    const key = `${e.from}>${e.to}`;
    const pts = edgePts.get(key);
    if (!pts) continue;
    const rejBeat = rejEdges.get(key);
    let alpha = GHOST_EDGE;
    if (rejBeat !== undefined) {
      alpha = GHOST_EDGE - (GHOST_EDGE - REJECTED) * easeOutCubic(beatT(env.beats, offset + rejBeat, totalBeats, env.p));
    }
    ctx.save();
    ctx.globalAlpha = alpha * introIn;
    ctx.strokeStyle = rgba(THEME.textDim, 0.9);
    ctx.fillStyle = rgba(THEME.textDim, 0.9);
    ctx.lineWidth = unit * 0.07;
    ctx.lineCap = "round";
    strokePolylineProgress(ctx, pts, 1);
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    drawArrowhead(ctx, last.x, last.y, Math.atan2(last.y - prev.y, last.x - prev.x), unit * 0.38);
    ctx.restore();
  }

  walk.forEach((w, k) => {
    const t = stepT[k];
    if (t <= 0) return;
    const prog = easeInOutCubic(clamp01(t / ARRIVE));
    const isCurrentBeat = active === offset + k;
    ctx.save();
    ctx.globalAlpha = (isCurrentBeat ? 1 : 0.85) * introIn;
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.16;
    ctx.lineCap = "round";
    if (isCurrentBeat) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
    }
    const tip = strokePolylineProgress(ctx, w.pts, prog);
    if (prog > 0 && prog < 1) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9;
      ctx.fillStyle = SPARK;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, unit * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  for (const e of scene.edges) {
    if (!e.label) continue;
    const key = `${e.from}>${e.to}`;
    const pts = edgePts.get(key);
    if (!pts) continue;
    const taken = takenKeys.has(key) && walk.some((w, k) => w.key === key && stepT[k] > 0);
    const rejBeat = rejEdges.get(key);
    let alpha = 0.45;
    if (taken) alpha = 0.9;
    else if (rejBeat !== undefined) {
      alpha = 0.45 - 0.3 * easeOutCubic(beatT(env.beats, offset + rejBeat, totalBeats, env.p));
    }
    const at = pointAlongPolyline(pts, 0.22);
    ctx.save();
    ctx.globalAlpha = alpha * introIn;
    ctx.font = `600 ${unit * (vertical ? 0.62 : 0.55)}px ${FONT_SANS}`;
    const tw = ctx.measureText(e.label).width;
    roundRect(ctx, at.x - tw / 2 - unit * 0.3, at.y - unit * 0.46, tw + unit * 0.6, unit * 0.92, unit * 0.24);
    ctx.fillStyle = INK_PANEL;
    ctx.fill();
    ctx.strokeStyle = taken ? rgba(accent, 0.6) : THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = taken ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(e.label, at.x, at.y + unit * 0.2);
    ctx.restore();
  }

  const lastArrived = stepT.reduce((acc, t, k) => (t >= ARRIVE ? k : acc), -1);
  const currentId = lastArrived >= 0 ? walk[lastArrived].toId : startId;

  for (const n of scene.nodes) {
    const r = rects.get(n.id);
    if (!r) continue;
    const isQ = n.shape === "question";
    const reach = reachedT.get(n.id) ?? 0;
    const rejBeat = rejNodes.get(n.id);
    const isCurrent = n.id === currentId;
    let alpha = GHOST_NODE + (1 - GHOST_NODE) * reach;
    if (reach <= 0 && rejBeat !== undefined) {
      alpha = GHOST_NODE - (GHOST_NODE - REJECTED) * easeOutCubic(beatT(env.beats, offset + rejBeat, totalBeats, env.p));
    }

    // Arrival pop 1 -> ~1.07 -> 1.
    let scale = 1;
    let arriveT = 0;
    walk.forEach((w, k) => {
      if (w.toId !== n.id) return;
      const t = stepT[k];
      if (t >= ARRIVE) arriveT = Math.max(arriveT, t);
      if (t >= ARRIVE && t < ARRIVE + 0.3) {
        scale = 1 + 0.07 * Math.sin(Math.PI * easeOutCubic(clamp01((t - ARRIVE) / 0.3)));
      }
    });

    ctx.save();
    ctx.globalAlpha = alpha * introIn;
    ctx.translate(r.cx, r.cy);
    ctx.scale(scale, scale);
    ctx.translate(-r.cx, -r.cy);

    const breathe = isCurrent ? 0.06 * (idle(env, 2400) - 0.5) : 0;
    if (isCurrent && reach > 0) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.8 + 10 * breathe);
    }
    const outcomeWarm = !isQ && reach > 0;
    if (isQ) {
      diamondPath(ctx, r);
      ctx.fillStyle = reach > 0 ? lerpColor(THEME.panel, accent, 0.25) : THEME.panel;
      ctx.fill();
      ctx.shadowBlur = 0;
      diamondPath(ctx, r);
      ctx.strokeStyle = reach > 0 ? accent : rgba(THEME.textDim, 0.45);
      ctx.lineWidth = reach > 0 ? unit * (0.11 + breathe) : unit * 0.06;
      ctx.lineJoin = "round";
      ctx.stroke();
    } else {
      roundRect(ctx, r.x, r.y, r.w, r.h, unit * 0.4);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (outcomeWarm) {
        roundRect(ctx, r.x, r.y, r.w, r.h, unit * 0.4);
        ctx.fillStyle = rgba(THEME.good, 0.14 * reach);
        ctx.fill();
      }
      roundRect(ctx, r.x, r.y, r.w, r.h, unit * 0.4);
      ctx.strokeStyle = rgba(THEME.good, reach > 0 ? 0.9 : 0.45);
      ctx.lineWidth = reach > 0 ? unit * (0.1 + breathe) : unit * 0.06;
      ctx.stroke();
    }

    ctx.textAlign = "center";
    if (isQ) {
      let px = unit * 0.6;
      let lines: string[] = [];
      for (const f of [0.6, 0.52, 0.45, 0.4]) {
        px = unit * f;
        ctx.font = `700 ${px}px ${FONT_SANS}`;
        lines = wrapText(ctx, n.label, r.w * 0.62);
        if (lines.length <= 3 && lines.length * px * 1.25 <= r.h * 0.72) break;
      }
      lines = lines.slice(0, 3);
      const lineH = px * 1.25;
      const startY = r.cy - ((lines.length - 1) * lineH) / 2 + px * 0.35;
      ctx.fillStyle = reach > 0 ? THEME.text : THEME.textDim;
      lines.forEach((line, li) => ctx.fillText(line, r.cx, startY + li * lineH));
    } else {
      const weight = outcomeWarm ? 800 : 700;
      const px = fitFontSize(ctx, n.label, { maxW: r.w - unit * 0.8, startPx: unit * 0.66, minPx: unit * 0.42, weight });
      ctx.font = `${weight} ${px}px ${FONT_SANS}`;
      ctx.fillStyle = reach > 0 ? THEME.text : THEME.textDim;
      ctx.fillText(n.label, r.cx, r.cy + px * 0.35);
    }
    ctx.restore();

    // Outcome arrival ring burst: two staggered expanding circles.
    if (!isQ) {
      walk.forEach((w, k) => {
        if (w.toId !== n.id) return;
        const t = stepT[k];
        for (let j = 0; j < 2; j++) {
          const rt = clamp01((t - ARRIVE - j * 0.08) / 0.3);
          if (rt <= 0 || rt >= 1) continue;
          ctx.save();
          ctx.globalAlpha = 0.6 * (1 - rt) * introIn;
          ctx.strokeStyle = rgba(THEME.good, 0.9);
          ctx.lineWidth = unit * 0.08;
          ctx.beginPath();
          ctx.arc(r.cx, r.cy, unit * (0.6 + 2.4 * easeOutCubic(rt)) + j * unit * 0.2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      });
    }
  }
  ctx.textAlign = "start";

  // Tail: a bright segment sweeps the full walked chain on a 2s loop.
  if (inTail && walk.length > 0) {
    const chain: Pt[] = walk.flatMap((w) => w.pts);
    const f = (env.elapsedMs % 2000) / 2000;
    const seg: Pt[] = [];
    for (let i = 0; i <= 8; i++) seg.push(pointAlongPolyline(chain, Math.max(f - 0.07 + (i / 8) * 0.07, 0)));
    ctx.save();
    ctx.globalAlpha = 0.55 * Math.sin(Math.PI * f) * introIn;
    ctx.strokeStyle = SPARK;
    ctx.lineWidth = unit * 0.2;
    ctx.lineCap = "round";
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.9;
    ctx.beginPath();
    ctx.moveTo(seg[0].x, seg[0].y);
    for (const pt of seg) ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.restore();
  }
}

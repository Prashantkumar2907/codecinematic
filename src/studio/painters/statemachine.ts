import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeInOutCubic,
  enterT,
  idle,
  clamp01,
  roundRect,
  drawArrowhead,
  drawSceneTitle,
  strokePolylineProgress,
  pointAlongPolyline,
  fitFontSize,
  beatT,
  activeBeatIndex,
  departT,
  rgba,
  type Layout,
  shade,
  RADIUS,
  lerpColor,
} from "./common";
import type { PaintEnv } from "./index";

type StatemachineScene = Extract<Scene, { kind: "statemachine" }>;
const SLAB_DEPTH = 0.12;
const CELL_MAX_UNITS = 7.0;
const CELL_ASPECT_MAX = 1.35;
const STATE_PAD = 0.1;
const ACCENT_TINT = 0.22;
const IDLE_FACE_LIFT = 0.09;

type StateNode = StatemachineScene["states"][number];
type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number; cx: number; cy: number };

const GRID = 12;
/** Fraction of a step beat spent gliding the token along the edge. */
const ARRIVE = 0.55;
const CURVE_SAMPLES = 20;

type GridMap = { ox: number; oy: number; cw: number; ch: number; rot: boolean; maxYo: number };

/** Rotate a 1×1 state 90° so a wide machine fills a 9:16 frame top→bottom (and a
 *  tall one fills 16:9 left→right) instead of shrinking into a centred band. */
function dispXY(s: StateNode, rot: boolean, maxYo: number): { x: number; y: number } {
  return rot ? { x: maxYo - (s.y + 1), y: s.x } : { x: s.x, y: s.y };
}

function shouldRotate(states: StateNode[], vertical: boolean): boolean {
  const minX = Math.min(...states.map((s) => s.x));
  const maxX = Math.max(...states.map((s) => s.x + 1));
  const minY = Math.min(...states.map((s) => s.y));
  const maxY = Math.max(...states.map((s) => s.y + 1));
  const aspect = Math.max(maxX - minX, 1) / Math.max(maxY - minY, 1);
  return vertical ? aspect >= 1.5 : aspect <= 0.66;
}

function gridMap(states: StateNode[], layout: Layout, titleBand: number, rot: boolean): GridMap {
  const areaX = layout.contentX;
  const areaY = layout.contentY + titleBand;
  const areaW = layout.contentW;
  // The caption band, not a one-unit shave: the bottom state used to run to 90% of
  // frame height in 9:16, well under the burned-in caption. Also reserves the
  // current-state ring's max outward growth (unit*0.67) so a bottom-row state's
  // pulse can never cross safeBottom — measured -10.5px at p=0.6 without this.
  const areaH = Math.max(layout.unit * 4, layout.safeBottom - areaY - layout.unit * 0.7);
  const cellW = areaW / GRID;
  const cellH = areaH / GRID;
  const maxYo = Math.max(...states.map((s) => s.y + 1));
  const d = states.map((s) => dispXY(s, rot, maxYo));
  const minX = Math.min(...d.map((p) => p.x));
  const maxX = Math.max(...d.map((p) => p.x + 1));
  const minY = Math.min(...d.map((p) => p.y));
  const maxY = Math.max(...d.map((p) => p.y + 1));
  const usedW = Math.max(maxX - minX, 1);
  const usedH = Math.max(maxY - minY, 1);
  // Fit the used extent to the area, then let the roomier axis stretch a little. The
  // old `min(GRID/usedW, GRID/usedH, 1.3)` cap sized cells from the 12x12 grid rather
  // than from the states actually present, so a three-state chain rendered as pills
  // ~74px wide with their labels spilling out of them.
  void cellW;
  void cellH;
  const fit = Math.min(areaW / usedW, areaH / usedH, layout.unit * CELL_MAX_UNITS);
  const cw = Math.min(areaW / usedW, fit * CELL_ASPECT_MAX);
  const ch = Math.min(areaH / usedH, fit * CELL_ASPECT_MAX);
  return {
    cw,
    ch,
    rot,
    maxYo,
    ox: areaX + (areaW - usedW * cw) / 2 - minX * cw,
    oy: areaY + (areaH - usedH * ch) / 2 - minY * ch,
  };
}

function rectEdgePoint(r: Rect, toward: Pt): Pt {
  const dx = toward.x - r.cx;
  const dy = toward.y - r.cy;
  const s = 1 / Math.max(Math.abs(dx) / (r.w / 2), Math.abs(dy) / (r.h / 2), 1e-6);
  return { x: r.cx + dx * Math.min(s, 1), y: r.cy + dy * Math.min(s, 1) };
}

function curvePts(from: Rect, to: Rect, unit: number): Pt[] {
  const a = rectEdgePoint(from, { x: to.cx, y: to.cy });
  const b = rectEdgePoint(to, { x: from.cx, y: from.cy });
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // One canonical curve direction under the phase's one-look-per-kind decision —
  // the old per-edge coin flip added no information, both directions read the same.
  const off = unit * 1.2;
  const c = { x: (a.x + b.x) / 2 + (-dy / len) * off, y: (a.y + b.y) / 2 + (dx / len) * off };
  const pts: Pt[] = [];
  for (let i = 0; i <= CURVE_SAMPLES - 1; i++) {
    const t = i / (CURVE_SAMPLES - 1);
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return pts;
}

/** Self-transition: a small circular hop above the node, out and back to its top edge. */
function loopPts(r: Rect, unit: number): Pt[] {
  const rad = unit * 0.85;
  const cx = r.cx;
  const cy = r.y - rad * 0.75;
  const pts: Pt[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const a = Math.PI / 2 + (i / CURVE_SAMPLES) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  return pts;
}

export function paintStatemachine(ctx: CanvasRenderingContext2D, scene: StatemachineScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentW, vertical } = layout;
  const { accent, accentGlow, accentSoft } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const leave = departT(env, 380);
  if (leave <= 0) return;
  // Multiplied into the one entrance factor every alpha site already reads —
  // every fade site in this file inherits departure without touching each one.
  const introIn = easeOutCubic(enterT(env, 400)) * leave;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const rot = shouldRotate(scene.states, layout.vertical);
  const map = gridMap(scene.states, layout, titleBand, rot);

  /**
   * Pixel rect of a state. The rects used to be the bounding box of two corners
   * projected through a camera at (0, 13, 9): under that perspective a state near the
   * bottom of the chart rendered visibly LARGER than one at the top, in a diagram where
   * every state is equal, and the 2D pill never matched the slab behind it.
   * `qa/ledger.json` -> systemic `2d-layout-round-tripped-through-camera`.
   */
  const stateRect = (st: StateNode) => {
    const d = dispXY(st, map.rot, map.maxYo);
    const pad = Math.min(map.cw, map.ch) * STATE_PAD;
    const x = map.ox + d.x * map.cw + pad;
    const y = map.oy + d.y * map.ch + pad;
    const w = map.cw - pad * 2;
    const h = map.ch - pad * 2;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  };

  const startId = scene.states[0]?.id;
  const stepT = scene.steps.map((_, k) => beatT(env.beats, offset + k, totalBeats, env.p));
  let lastArrived = -1;
  const visited = new Set<string>([startId]);
  stepT.forEach((t, k) => {
    if (t >= ARRIVE) {
      lastArrived = k;
      visited.add(scene.steps[k].go);
    }
  });
  const currentId = lastArrived >= 0 ? scene.steps[lastArrived].go : startId;

  const rects = new Map<string, { rect: Rect; fontPx: number }>();
  for (const s of scene.states) {
    // Bounded by the pill, not by the grid cell times 2.2: the label was fitted to a
    // width the state does not have and ran outside its own outline.
    const pillW = stateRect(s).w;
    const fontPx = fitFontSize(ctx, s.label, { maxW: pillW - unit * 0.6, startPx: unit * 0.7, minPx: unit * 0.34, weight: 700 });
    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    
    rects.set(s.id, { rect: stateRect(s), fontPx });
  }

  const edgePts = new Map<string, Pt[]>();
  for (const e of scene.edges) {
    const a = rects.get(e.from);
    const b = rects.get(e.to);
    if (!a || !b) continue;
    const key = `${e.from}>${e.to}`;
    edgePts.set(key, e.from === e.to ? loopPts(a.rect, unit) : curvePts(a.rect, b.rect, unit));
  }

  const walk: { key: string; pts: Pt[]; toId: string }[] = [];
  {
    let curId = startId;
    for (const st of scene.steps) {
      const key = `${curId}>${st.go}`;
      let pts = st.go === curId ? loopPts((rects.get(curId) ?? [...rects.values()][0]).rect, unit) : edgePts.get(key);
      if (!pts) {
        const a = (rects.get(curId) ?? [...rects.values()][0]).rect;
        const b = (rects.get(st.go) ?? rects.get(curId) ?? [...rects.values()][0]).rect;
        pts = [{ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }];
      }
      walk.push({ key, pts, toId: st.go });
      curId = st.go;
    }
  }

  const arrivedKeys = new Set<string>();
  stepT.forEach((t, k) => {
    if (t >= ARRIVE) {
      arrivedKeys.add(walk[k].key);
    }
  });

  for (const e of scene.edges) {
    const pts = edgePts.get(`${e.from}>${e.to}`);
    if (!pts) continue;
    ctx.save();
    ctx.globalAlpha = 0.22 * introIn;
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
    ctx.lineWidth = unit * 0.14;
    ctx.lineCap = "round";
    if (isCurrentBeat) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.45;
    }
    strokePolylineProgress(ctx, w.pts, prog);
    ctx.restore();
  });

  for (const e of scene.edges) {
    if (!e.label) continue;
    const pts = edgePts.get(`${e.from}>${e.to}`);
    if (!pts) continue;
    const taken = arrivedKeys.has(`${e.from}>${e.to}`);
    const mid = pointAlongPolyline(pts, 0.5);
    ctx.save();
    ctx.globalAlpha = (taken ? 0.9 : 0.4) * introIn;
    ctx.font = `600 ${unit * (vertical ? 0.62 : 0.55)}px ${FONT_SANS}`;
    const tw = ctx.measureText(e.label).width;
    roundRect(ctx, mid.x - tw / 2 - unit * 0.32, mid.y - unit * 0.48, tw + unit * 0.64, unit * 0.96, unit * 0.26);
    ctx.fillStyle = THEME.bgBottom;
    ctx.fill();
    ctx.strokeStyle = taken ? rgba(accent, 0.6) : THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = taken ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(e.label, mid.x, mid.y + unit * 0.2);
    ctx.restore();
  }

  for (const s of scene.states) {
    const entry = rects.get(s.id);
    if (!entry) continue;
    const { rect, fontPx } = entry;
    const isVisited = visited.has(s.id);
    const isCurrent = s.id === currentId;

    let scale = 1;
    walk.forEach((w, k) => {
      if (w.toId !== s.id) return;
      const t = stepT[k];
      if (t >= ARRIVE && t < ARRIVE + 0.3) {
        const popT = clamp01((t - ARRIVE) / 0.3);
        scale = 1 + 0.07 * Math.sin(Math.PI * easeOutCubic(popT));
      }
    });

    if (isCurrent) {
      const ringF = (env.elapsedMs % 1400) / 1400;
      const g = unit * (0.12 + 0.55 * easeOutCubic(ringF));
      ctx.save();
      ctx.globalAlpha = 0.4 * (1 - ringF) * introIn;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.07;
      roundRect(ctx, rect.x - g, rect.y - g, rect.w + g * 2, rect.h + g * 2, unit * RADIUS.md);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = (isVisited ? 1 : 0.5) * introIn;
    ctx.translate(rect.cx, rect.cy);
    ctx.scale(scale, scale);
    ctx.translate(-rect.cx, -rect.cy);
    
    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 1.0;
    }
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, unit * RADIUS.md);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (isVisited) {
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, unit * RADIUS.md);
      ctx.fillStyle = accentSoft;
      ctx.fill();
    }
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, unit * RADIUS.md);
    ctx.strokeStyle = isCurrent ? accent : isVisited ? rgba(accent, 0.75) : s.accent ? rgba(accent, 0.55) : rgba(THEME.textDim, 0.4);
    ctx.lineWidth = isCurrent ? unit * 0.13 : isVisited || s.accent ? unit * 0.09 : unit * 0.06;
    ctx.stroke();

    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    ctx.fillStyle = isVisited ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(s.label, rect.cx, rect.cy + fontPx * 0.35);
    ctx.restore();
  }
  ctx.textAlign = "start";

  let inTransit = false;
  let tokenPos: Pt = { x: rects.get(startId)?.rect.cx ?? 0, y: rects.get(startId)?.rect.cy ?? 0 };
  let transitPts: Pt[] | null = null;
  let transitGlide = 0;
  for (let k = walk.length - 1; k >= 0; k--) {
    const t = stepT[k];
    if (t > 0) {
      const glide = easeInOutCubic(clamp01(t / ARRIVE));
      tokenPos = pointAlongPolyline(walk[k].pts, glide);
      inTransit = glide < 1;
      transitPts = walk[k].pts;
      transitGlide = glide;
      break;
    }
  }

  /** True when a travelling dot has entered a state box — it belongs behind the label,
   *  not on top of it. "CLOSED" was rendering as "CL(o)ED" and "SYN-SENT" as "SYN(o)ENT". */
  const insideAnyState = (px: number, py: number) =>
    [...rects.values()].some(
      ({ rect: r }) => Math.abs(px - r.cx) < r.w / 2 - unit * 0.2 && Math.abs(py - r.cy) < r.h / 2 - unit * 0.2
    );

  if (!inTransit && lastArrived >= 0) {
    const f = (env.elapsedMs % 1600) / 1600;
    const dot = pointAlongPolyline(walk[lastArrived].pts, f);
    if (!insideAnyState(dot.x, dot.y)) {
    ctx.save();
    ctx.globalAlpha = 0.9 * Math.sin(Math.PI * f) * introIn;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.9;
    ctx.fillStyle = THEME.text;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, unit * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    }
  }

  if (inTransit && transitPts) {
    for (let j = 1; j <= 3; j++) {
      const f = transitGlide - j * 0.06;
      if (f <= 0) continue;
      const d = pointAlongPolyline(transitPts, f);
      if (insideAnyState(d.x, d.y)) continue;
      ctx.save();
      ctx.globalAlpha = (0.45 - j * 0.12) * introIn;
      ctx.fillStyle = THEME.text;
      ctx.beginPath();
      ctx.arc(d.x, d.y, unit * (0.24 - j * 0.05), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // The token is absorbed by the state it has arrived at. Drawn unconditionally it sat
  // on top of the state's own label — "CLOSED" rendered as "CL(o)ED".
  if (!insideAnyState(tokenPos.x, tokenPos.y)) {
  ctx.save();
  ctx.globalAlpha = introIn;
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * (inTransit ? 1.0 : 0.7 + 0.6 * idle(env, 2000));
  ctx.fillStyle = THEME.text;
  ctx.beginPath();
  ctx.arc(tokenPos.x, tokenPos.y, unit * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(accent, 0.8);
  ctx.lineWidth = unit * 0.06;
  ctx.beginPath();
  ctx.arc(tokenPos.x, tokenPos.y, unit * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  }
}

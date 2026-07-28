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
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  drawArrowhead,
  flowDots,
  smoothPulse,
  hashStr,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type HashRingScene = Extract<Scene, { kind: "hash_ring" }>;
type RingNode = HashRingScene["nodes"][number];
type RingKey = HashRingScene["keys"][number];

/** Fraction of the limiting content dimension spent on the ring radius (the rest is the label margin). */
const RING_RADIUS_FACTOR = 0.5;
const LABEL_MARGIN_UNIT = 2.0;
/** Cap on drawn virtual-node tick marks per node — `tokens` can be declared in the hundreds (e.g. 256). */
const MAX_TOKEN_DOTS = 20;
const ARC_WIDTH_UNIT = 0.16;

function nodeAngleOf(scene: HashRingScene, node: RingNode): number {
  return node.angle ?? hashStr(`${scene.id}:node:${node.id}`) % 360;
}

function keyAngleOf(scene: HashRingScene, key: RingKey): number {
  return key.angle ?? hashStr(`${scene.id}:key:${key.id}`) % 360;
}

/** 0deg = top (12 o'clock), increasing clockwise — matches the canvas convention directly. */
function canvasAngle(deg: number): number {
  return ((deg - 90) * Math.PI) / 180;
}

function pointOnRing(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const a = canvasAngle(deg);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Clockwise angular distance from `from` to `to`, always in [0, 360). */
function forwardDelta(from: number, to: number): number {
  return (((to - from) % 360) + 360) % 360;
}

/** The node reached first walking clockwise from `deg` — the consistent-hashing owner rule. */
function ownerOf(deg: number, active: { id: string; deg: number }[]): string | null {
  if (!active.length) return null;
  let best = active[0];
  let bestDelta = forwardDelta(deg, best.deg);
  for (let i = 1; i < active.length; i++) {
    const d = forwardDelta(deg, active[i].deg);
    if (d < bestDelta) {
      best = active[i];
      bestDelta = d;
    }
  }
  return best.id;
}

type RingState = { active: Set<string>; owner: Map<string, string> };

/**
 * Replay steps 0..uptoStep to get which nodes are up and who currently owns
 * each placed key. Re-deriving ownership from scratch after every add/remove
 * (rather than incrementally patching one entry) is what makes "only the keys
 * between the change and its clockwise neighbour move" fall out for free —
 * that minimal reshuffle IS the concept this scene teaches.
 */
function computeState(scene: HashRingScene, nodeAngles: Map<string, number>, uptoStep: number): RingState {
  const active = new Set<string>();
  const owner = new Map<string, string>();
  const recomputeOwners = () => {
    const activeList = scene.nodes.filter((n) => active.has(n.id)).map((n) => ({ id: n.id, deg: nodeAngles.get(n.id)! }));
    owner.forEach((_, keyId) => {
      const key = scene.keys.find((k) => k.id === keyId);
      if (!key) return;
      const o = ownerOf(keyAngleOf(scene, key), activeList);
      if (o) owner.set(keyId, o);
    });
  };
  for (let k = 0; k <= uptoStep && k < scene.steps.length; k++) {
    const st = scene.steps[k];
    if (st.action === "addNode" && st.nodeId) {
      active.add(st.nodeId);
      recomputeOwners();
    } else if (st.action === "removeNode" && st.nodeId) {
      active.delete(st.nodeId);
      recomputeOwners();
    } else if (st.action === "placeKey" && st.keyId) {
      const key = scene.keys.find((k) => k.id === st.keyId);
      if (key) {
        const activeList = scene.nodes.filter((n) => active.has(n.id)).map((n) => ({ id: n.id, deg: nodeAngles.get(n.id)! }));
        const o = ownerOf(keyAngleOf(scene, key), activeList);
        if (o) owner.set(st.keyId, o);
      }
    }
  }
  return { active, owner };
}

/**
 * A consistent-hashing ring: nodes and keys sit at deterministic angles on a
 * circle, and a key belongs to the first node reached walking clockwise. Beats
 * add/remove nodes or place a key; ownership is recomputed from scratch each
 * time so only the genuinely affected keys' arcs redraw — everyone else's
 * mapping visibly holds still, which is the whole point of the ring over a
 * plain mod-N hash. Virtual nodes (`tokens`) show as a scattered tick cloud
 * plus a ×N badge.
 */
export function paintHashRing(ctx: CanvasRenderingContext2D, scene: HashRingScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const activeIdx = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = activeIdx - offset;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const introIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent, { centered: true }) + unit * 0.5;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const nodeAngles = new Map(scene.nodes.map((n) => [n.id, nodeAngleOf(scene, n)] as const));
  const prevState = computeState(scene, nodeAngles, activeStep - 1);
  const currState = computeState(scene, nodeAngles, activeStep);
  const thisAction = activeStep >= 0 ? scene.steps[activeStep] : undefined;

  // A circle needs no left/right-vs-top/bottom axis swap for 9:16 — centring
  // it in contentX/Y/W/H and sizing off the tighter dimension already adapts.
  const cx = contentX + contentW / 2;
  const cy = areaY + areaH / 2;
  const R = Math.max(unit * 3, Math.min(contentW, areaH) * RING_RADIUS_FACTOR - unit * LABEL_MARGIN_UNIT);

  // Base ring — visible immediately so the whole shape reads before any node lands.
  ctx.save();
  ctx.globalAlpha = introIn * 0.5;
  ctx.strokeStyle = rgba(accent, 0.35);
  ctx.lineWidth = unit * 0.06;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const nodeInfo = scene.nodes.map((n) => {
    const deg = nodeAngles.get(n.id)!;
    const isAddTarget = !!(thisAction && thisAction.action === "addNode" && thisAction.nodeId === n.id);
    const isRemoveTarget = !!(thisAction && thisAction.action === "removeNode" && thisAction.nodeId === n.id);
    let appear: number;
    if (isAddTarget) appear = easeOutBack(clamp01(stepT * 1.2));
    else if (isRemoveTarget) appear = 1 - easeOutCubic(stepT);
    else appear = currState.active.has(n.id) || prevState.active.has(n.id) ? 1 : 0;
    return { n, deg, appear, isTarget: isAddTarget || isRemoveTarget };
  });

  // Virtual-node token clouds, drawn under everything else.
  nodeInfo.forEach(({ n, appear }) => {
    if (appear <= 0.01 || n.tokens <= 1) return;
    const count = Math.min(n.tokens, MAX_TOKEN_DOTS);
    ctx.save();
    ctx.globalAlpha = introIn * appear * 0.4;
    ctx.fillStyle = secondary;
    for (let i = 0; i < count; i++) {
      const deg = hashStr(`${scene.id}:vt:${n.id}:${i}`) % 360;
      const p = pointOnRing(cx, cy, R, deg);
      ctx.beginPath();
      ctx.arc(p.x, p.y, unit * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  // Keys: a dot at the hash position, plus the clockwise arc to its current owner.
  scene.keys.forEach((key) => {
    const fullOwner = currState.owner.get(key.id);
    const prevOwner = prevState.owner.get(key.id);
    if (!fullOwner && !prevOwner) return;
    const fullOwnerDeg = fullOwner ? nodeAngles.get(fullOwner) : undefined;
    const prevOwnerDeg = prevOwner ? nodeAngles.get(prevOwner) : undefined;
    const keyDeg = keyAngleOf(scene, key);
    const placedThisStep = !!(thisAction && thisAction.action === "placeKey" && thisAction.keyId === key.id);
    const reassigned = !placedThisStep && prevOwner != null && fullOwner != null && prevOwner !== fullOwner && prevOwnerDeg != null;

    let deltaFrom = 0;
    let deltaTo = 0;
    let animT = 1;
    let flash = 0;
    if (placedThisStep && fullOwnerDeg != null) {
      deltaTo = forwardDelta(keyDeg, fullOwnerDeg);
      animT = easeOutCubic(clamp01((stepT - 0.1) / 0.7));
      flash = 1 - animT;
    } else if (reassigned && fullOwnerDeg != null && prevOwnerDeg != null) {
      // The arc's far end slides from the old owner to the new one: it SHRINKS
      // when a node is added between the key and its old owner, and GROWS when
      // its owner is removed and the key falls through to the next one.
      deltaFrom = forwardDelta(keyDeg, prevOwnerDeg);
      deltaTo = forwardDelta(keyDeg, fullOwnerDeg);
      animT = easeInOutCubic(stepT);
      flash = Math.sin(animT * Math.PI);
    } else if (fullOwnerDeg != null) {
      deltaTo = forwardDelta(keyDeg, fullOwnerDeg);
      deltaFrom = deltaTo;
    } else return;

    const delta = deltaFrom + (deltaTo - deltaFrom) * animT;
    const arcColor = flash > 0.05 ? secondary : accent;
    const arcGlow = flash > 0.05 ? secondaryGlow : accentGlow;
    const keyAlpha = introIn * (placedThisStep ? clamp01(stepT * 3) : 1);

    if (delta > 2) {
      ctx.save();
      ctx.globalAlpha = keyAlpha * (0.6 + 0.4 * flash);
      ctx.strokeStyle = rgba(arcColor, 0.8);
      ctx.lineWidth = unit * ARC_WIDTH_UNIT;
      ctx.lineCap = "round";
      ctx.shadowColor = arcGlow;
      ctx.shadowBlur = unit * (0.3 + flash * 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, R, canvasAngle(keyDeg), canvasAngle(keyDeg + delta), false);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      const tip = pointOnRing(cx, cy, R, keyDeg + delta);
      ctx.save();
      ctx.globalAlpha = keyAlpha;
      ctx.fillStyle = arcColor;
      drawArrowhead(ctx, tip.x, tip.y, canvasAngle(keyDeg + delta) + Math.PI / 2, unit * 0.26);
      ctx.restore();

      if (delta > 8) {
        const samples = 8;
        const pts = Array.from({ length: samples + 1 }, (_, i) => pointOnRing(cx, cy, R, keyDeg + (delta * i) / samples));
        flowDots(ctx, pts, env, { count: 2, speedMs: 1400, r: unit * 0.1, color: arcColor });
      }
    }

    const keyR = R * 0.66;
    const kp = pointOnRing(cx, cy, keyR, keyDeg);
    const pop = placedThisStep ? easeOutBack(clamp01(stepT * 1.4)) : 1;
    ctx.save();
    ctx.globalAlpha = keyAlpha;
    ctx.beginPath();
    ctx.arc(kp.x, kp.y, unit * 0.24 * pop, 0, Math.PI * 2);
    ctx.fillStyle = THEME.text;
    ctx.fill();
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = unit * 0.06;
    ctx.stroke();
    ctx.font = `700 ${unit * 0.42}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(key.label, kp.x, kp.y - unit * 0.5);
    ctx.restore();
  });

  // Nodes on top: server glyph + label + optional virtual-node badge, glowing while active this beat.
  nodeInfo.forEach(({ n, deg, appear, isTarget }) => {
    if (appear <= 0.01) return;
    const p = pointOnRing(cx, cy, R, deg);
    const ownsKeyThisStep = !!(
      thisAction &&
      thisAction.action === "placeKey" &&
      thisAction.keyId &&
      currState.owner.get(thisAction.keyId) === n.id
    );
    const glowNow = isTarget || ownsKeyThisStep;
    const size = unit * 1.15 * (0.6 + 0.4 * appear);

    ctx.save();
    ctx.globalAlpha = introIn * clamp01(appear);
    if (glowNow) {
      const pulse = smoothPulse(env, 1100, 1.12);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.72 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = rgba(accent, 0.16);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.strokeStyle = glowNow ? accent : rgba(accent, 0.6);
    ctx.lineWidth = unit * (glowNow ? 0.12 : 0.07);
    ctx.stroke();
    drawIcon(ctx, "server", p.x, p.y, size * 0.92, env, glowNow ? accent : "#eaf3ff");

    const labelPos = pointOnRing(cx, cy, R + unit * 1.3, deg);
    const labelPx = fitFontSize(ctx, n.label, { maxW: unit * 4.2, startPx: unit * 0.68, minPx: unit * 0.46, weight: 800 });
    ctx.font = `800 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    // A centred label only clears the icon for a near-vertical outward
    // direction (top/bottom of the ring): its horizontal spread is symmetric
    // around the anchor, so on the ring's left/right flanks — where "outward"
    // IS horizontal — half the text falls back onto the icon. Grow the label
    // away from the node instead: left-align when outward points right,
    // right-align when it points left.
    const cosOut = (p.x - cx) / R;
    ctx.textAlign = cosOut > 0.35 ? "left" : cosOut < -0.35 ? "right" : "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n.label, labelPos.x, labelPos.y);

    if (n.tokens > 1) {
      const badge = `×${n.tokens}`;
      ctx.font = `800 ${unit * 0.5}px ${FONT_MONO}`;
      const tw = ctx.measureText(badge).width;
      const by = labelPos.y + unit * 0.85;
      ctx.fillStyle = secondary;
      roundRect(ctx, labelPos.x - tw / 2 - unit * 0.35, by - unit * 0.42, tw + unit * 0.7, unit * 0.8, unit * 0.25);
      ctx.fill();
      ctx.fillStyle = "#08131f";
      ctx.fillText(badge, labelPos.x, by);
    }
    ctx.restore();
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

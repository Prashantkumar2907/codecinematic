import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  departT,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  flowDots,
  rgba,
  type Layout,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type TopologyScene = Extract<Scene, { kind: "topology" }>;
type TNode = TopologyScene["nodes"][number];
type NodeKind = TNode["kind"];
type Pt = { x: number; y: number };
type NodeLayout = { x: number; y: number; r: number; device: boolean };

/** Devices forward frames (drawn as cards); endpoints originate/consume (circles). */
const IS_DEVICE: Record<NodeKind, boolean> = {
  hub: true,
  switch: true,
  router: true,
  host: false,
  node: false,
};

/** Dark ink on a bright accent-tone badge — same convention as cipher.ts's `INK_ON_ACCENT`. */
const INK_ON_ACCENT = "#06121a";

const KIND_TAG: Record<NodeKind, string> = {
  hub: "HUB",
  switch: "SWITCH",
  router: "ROUTER",
  host: "HOST",
  node: "NODE",
};

/**
 * A network topology diagram: hubs, switches, routers and end hosts / P2P peers
 * wired by links. Each beat lights one focus device and (optionally) emits a
 * frame — the teaching contrast is the emit MODE: `all` ripples the frame to
 * EVERY neighbour (a hub's broadcast domain, the "secret" leak), while `one`
 * forwards to a single target (a switch's unicast, a Chord finger hop). The
 * whole topology is laid out uniformly (aspect preserved) and centred, so it
 * reads in both 16:9 and 9:16.
 */
export function paintTopology(ctx: CanvasRenderingContext2D, scene: TopologyScene, env: PaintEnv) {
  const { layout } = env;
  const { unit } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const leave = departT(env, 380);
  if (leave <= 0) return;
  const introIn = easeOutCubic(enterT(env, 380)) * leave;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const map = layoutNodes(scene.nodes, layout, band);
  const byId = new Map(scene.nodes.map((n) => [n.id, n] as const));

  // Adjacency for broadcast / unicast routing.
  const neighbours = new Map<string, string[]>();
  scene.nodes.forEach((n) => neighbours.set(n.id, []));
  scene.links.forEach((l) => {
    neighbours.get(l.from)?.push(l.to);
    neighbours.get(l.to)?.push(l.from);
  });

  // Cumulative: which nodes have been the focus so far (pods placed / hops taken).
  const marked = new Set<string>();
  for (let k = 0; k < activeStep; k++) marked.add(scene.steps[k].focus);

  const step = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const focusId = step?.focus;
  const emit = step?.emit ?? "none";
  const emitColor = emit === "all" ? secondary : accent;
  const emitGlow = emit === "all" ? secondaryGlow : accentGlow;

  // Receivers of the active frame: everyone on the wire (hub) vs one target (switch).
  const receivers = new Set<string>();
  const activeLinks = new Set<number>();
  if (focusId && emit !== "none") {
    if (emit === "all") {
      (neighbours.get(focusId) ?? []).forEach((r) => receivers.add(r));
    } else if (step?.target) {
      receivers.add(step.target);
    }
    scene.links.forEach((l, i) => {
      const other = l.from === focusId ? l.to : l.to === focusId ? l.from : null;
      if (other && receivers.has(other)) activeLinks.add(i);
    });
  }
  const rxT = clamp01((stepT - 0.35) / 0.4); // reception ramp

  // ---- Links (behind nodes). Ghost always; lit + packets on the active frame.
  scene.links.forEach((l, i) => {
    const a = map.get(l.from);
    const b = map.get(l.to);
    if (!a || !b) return;
    const linkIn = enterT(env, 320, 140);
    if (linkIn <= 0) return;
    const [pa, pb] = trim(a, b);
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.28 * introIn * easeOutCubic(linkIn);
    ctx.strokeStyle = rgba(THEME.textDim, 0.9);
    ctx.lineWidth = unit * 0.09;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.restore();

    if (activeLinks.has(i) && stepT > 0.05) {
      const grow = easeOutCubic(clamp01(stepT / 0.55));
      const end = { x: pa.x + (pb.x - pa.x) * grow, y: pa.y + (pb.y - pa.y) * grow };
      ctx.save();
      ctx.strokeStyle = emitColor;
      ctx.lineWidth = unit * 0.14;
      ctx.lineCap = "round";
      ctx.shadowColor = emitGlow;
      ctx.shadowBlur = unit * 0.5;
      ctx.globalAlpha = introIn;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
      if (grow > 0.3) flowDots(ctx, [pa, pb], env, { count: 2, speedMs: 1100, r: unit * 0.16, color: emitColor });
    }
  });

  // Virtual unicast wire when the target is not a direct neighbour (multi-hop finger).
  if (emit === "one" && focusId && step?.target && activeLinks.size === 0) {
    const a = map.get(focusId);
    const b = map.get(step.target);
    if (a && b) {
      const [pa, pb] = trim(a, b);
      ctx.save();
      ctx.setLineDash([unit * 0.4, unit * 0.34]);
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.11;
      ctx.lineCap = "round";
      ctx.globalAlpha = introIn * easeOutCubic(clamp01(stepT / 0.5)) * 0.8;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.4;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if (stepT > 0.15) flowDots(ctx, [pa, pb], env, { count: 2, speedMs: 1000, r: unit * 0.16, color: accent });
    }
  }

  // ---- Broadcast ripple from the focus (only the "reach everyone" case ripples).
  if (focusId && emit === "all" && stepT > 0.05) {
    const f = map.get(focusId);
    if (f) {
      const spanR = rippleReach(f, receivers, map);
      for (let k = 0; k < 2; k++) {
        const ph = ((env.elapsedMs / 1500 + k * 0.5) % 1);
        const rr = f.r + ph * spanR;
        ctx.save();
        ctx.globalAlpha = introIn * (1 - ph) * 0.5 * easeOutCubic(clamp01(stepT / 0.3));
        ctx.strokeStyle = secondary;
        ctx.lineWidth = unit * 0.1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ---- Nodes.
  scene.nodes.forEach((node, ni) => {
    const nl = map.get(node.id);
    if (!nl) return;
    const nodeIn = enterT(env, 340, 120 + ni * 45);
    if (nodeIn <= 0) return;
    const isFocus = node.id === focusId;
    const isReceiver = receivers.has(node.id);
    const wasMarked = marked.has(node.id);
    const recT = isReceiver ? rxT : 0;
    const lit = isFocus || wasMarked || recT > 0.05;

    // A small always-on idle breathing on every node (phase-offset per node)
    // keeps the whole topology visibly alive during the intro beat, before
    // any step has a focus and the stronger isFocus/isReceiver pulses kick in.
    let scale = easeOutBack(clamp01(nodeIn * 1.2)) * (1 + 0.035 * Math.sin(env.elapsedMs / 1300 + ni * 1.1));
    if (isFocus) scale *= 1 + 0.05 * Math.sin(env.elapsedMs / 900) * easeOutCubic(clamp01(stepT * 2));
    if (isReceiver) scale *= 1 + 0.08 * Math.sin(Math.PI * recT);

    ctx.save();
    ctx.globalAlpha = introIn * clamp01(nodeIn * 2);
    ctx.translate(nl.x, nl.y);
    ctx.scale(scale, scale);
    ctx.translate(-nl.x, -nl.y);

    const border = isFocus ? emitColor : isReceiver ? rgba(emitColor, 0.5 + 0.5 * recT) : wasMarked ? accent : rgba(THEME.textDim, 0.5);
    const glyphColor = lit ? THEME.text : "#aeb9c8";

    if (nl.device) {
      const w = nl.r * 2.5;
      const h = nl.r * 1.7;
      const bx = nl.x - w / 2;
      const by = nl.y - h / 2;
      if (isFocus) {
        ctx.shadowColor = emitGlow;
        ctx.shadowBlur = unit * 1.0;
      }
      roundRect(ctx, bx, by, w, h, unit * 0.3);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (lit) {
        roundRect(ctx, bx, by, w, h, unit * 0.3);
        ctx.fillStyle = rgba(isFocus ? emitColor : accent, 0.14);
        ctx.fill();
      }
      roundRect(ctx, bx, by, w, h, unit * 0.3);
      ctx.strokeStyle = border;
      ctx.lineWidth = unit * (isFocus ? 0.14 : 0.08);
      ctx.stroke();
      drawGlyph(ctx, node.kind, nl.x, by + h * 0.42, h * 0.72, env, glyphColor);
      // Kind tag above the card — the hub-vs-switch tell.
      ctx.font = `800 ${unit * 0.46}px ${FONT_MONO}`;
      ctx.fillStyle = lit ? border : THEME.textFaint;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(KIND_TAG[node.kind], nl.x, by - unit * 0.28);
    } else {
      if (isFocus || isReceiver) {
        ctx.shadowColor = isFocus ? emitGlow : rgba(emitColor, 0.5);
        ctx.shadowBlur = unit * (isFocus ? 1.0 : 0.7 * recT);
      }
      ctx.beginPath();
      ctx.arc(nl.x, nl.y, nl.r, 0, Math.PI * 2);
      ctx.fillStyle = THEME.panel;
      ctx.fill();
      ctx.shadowBlur = 0;
      if (lit) {
        ctx.beginPath();
        ctx.arc(nl.x, nl.y, nl.r, 0, Math.PI * 2);
        ctx.fillStyle = rgba(isFocus ? emitColor : accent, 0.14);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(nl.x, nl.y, nl.r, 0, Math.PI * 2);
      ctx.strokeStyle = border;
      ctx.lineWidth = unit * (isFocus ? 0.13 : 0.08);
      ctx.stroke();
      drawGlyph(ctx, node.kind, nl.x, nl.y, nl.r * 1.4, env, glyphColor);
    }

    // Marked badge: a filled dot for nodes already visited (pod placed / hop taken).
    if (wasMarked && !isFocus) {
      const bx = nl.x + (nl.device ? nl.r * 1.25 : nl.r * 0.72);
      const by = nl.y - (nl.device ? nl.r * 0.85 : nl.r * 0.72);
      ctx.beginPath();
      ctx.arc(bx, by, unit * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    }
    ctx.restore();

    // Label below the shape.
    const ly = nl.y + (nl.device ? nl.r * 1.05 : nl.r) + unit * 0.72;
    const labelPx = fitFontSize(ctx, node.label, { maxW: nl.r * 3.2, startPx: unit * 0.62, minPx: unit * 0.4, weight: 700 });
    ctx.save();
    ctx.globalAlpha = introIn * clamp01(nodeIn * 2);
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = lit ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(node.label, nl.x, ly);
    ctx.restore();
  });

  // ---- Focus caption pill: names the mode (BROADCAST vs UNICAST) — the lesson.
  if (focusId && emit !== "none" && stepT > 0.08) {
    const f = map.get(focusId);
    if (f) {
      const text = emit === "all" ? "BROADCAST → ALL" : "UNICAST → 1";
      // A device card's kind tag sits just above its top edge (unit*0.28 clear
      // plus glyph height), so the caption's own gap (unit*1.35, minus half its
      // own height) left it only ~0.2 unit of clearance — its shadowBlur then
      // bled straight onto the tag text. Push it further up.
      const py = f.y - (f.device ? f.r * 0.85 : f.r) - unit * 1.7;
      const appear = easeOutBack(clamp01((stepT - 0.08) / 0.3));
      ctx.save();
      ctx.globalAlpha = introIn * clamp01(appear);
      ctx.font = `800 ${unit * 0.52}px ${FONT_SANS}`;
      const tw = ctx.measureText(text).width;
      const w = tw + unit * 0.9;
      const h = unit * 1.0;
      ctx.translate(f.x, py);
      ctx.scale(appear, appear);
      ctx.shadowColor = emitGlow;
      ctx.shadowBlur = unit * 0.6;
      roundRect(ctx, -w / 2, -h / 2, w, h, unit * 0.3);
      ctx.fillStyle = emitColor;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = INK_ON_ACCENT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, unit * 0.02);
      ctx.restore();
    }
  }

  // Idle focus ring.
  if (focusId) {
    const f = map.get(focusId);
    if (f) {
      const pr = (env.elapsedMs % 1700) / 1700;
      const base = f.device ? f.r * 1.5 : f.r;
      ctx.save();
      ctx.globalAlpha = introIn * (1 - pr) * 0.55;
      ctx.strokeStyle = emitColor;
      ctx.lineWidth = unit * 0.09;
      ctx.beginPath();
      ctx.arc(f.x, f.y, base + unit * 0.2 + pr * base * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/** Uniform (aspect-preserved) layout of grid nodes, centred below the title. */
function layoutNodes(nodes: TNode[], layout: Layout, band: number): Map<string, NodeLayout> {
  const { unit, contentX, contentY, contentW, contentH, safeBottom } = layout;
  const maxR = unit * 1.6;
  const areaX = contentX + maxR;
  const areaY = contentY + band + maxR;
  const areaW = contentW - maxR * 2;
  const bottom = Math.min(contentY + contentH, safeBottom) - unit * 0.3;
  const areaH = bottom - areaY - maxR - unit;
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const stepPx = Math.min(areaW / spanX, areaH / spanY);
  const r = Math.min(maxR, Math.max(unit * 0.9, stepPx * 0.34));
  const usedW = spanX * stepPx;
  const usedH = spanY * stepPx;
  const ox = areaX + (areaW - usedW) / 2;
  const oy = areaY + (areaH - usedH) / 2;
  const out = new Map<string, NodeLayout>();
  for (const n of nodes) {
    out.set(n.id, {
      x: ox + (n.x - minX) * stepPx,
      y: oy + (n.y - minY) * stepPx,
      r,
      device: IS_DEVICE[n.kind],
    });
  }
  return out;
}

/** Trim a link to the visual edges of its two endpoints. */
function trim(a: NodeLayout, b: NodeLayout): [Pt, Pt] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ra = a.device ? a.r * 1.15 : a.r;
  const rb = b.device ? b.r * 1.15 : b.r;
  return [
    { x: a.x + ux * ra, y: a.y + uy * ra },
    { x: b.x - ux * rb, y: b.y - uy * rb },
  ];
}

/** Radius the broadcast ripple must reach to touch the farthest receiver. */
function rippleReach(f: NodeLayout, receivers: Set<string>, map: Map<string, NodeLayout>): number {
  let max = f.r * 3;
  receivers.forEach((id) => {
    const n = map.get(id);
    if (n) max = Math.max(max, Math.hypot(n.x - f.x, n.y - f.y) + n.r);
  });
  return max;
}

/** Per-kind device/endpoint glyph. Hubs fan to every port; switches forward one. */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  kind: NodeKind,
  cx: number,
  cy: number,
  size: number,
  env: Pick<PaintEnv, "elapsedMs" | "palette">,
  color: string
) {
  if (kind === "router") return void drawIcon(ctx, "network", cx, cy, size, env, color);
  if (kind === "host") return void drawIcon(ctx, "client", cx, cy, size, env, color);
  if (kind === "node") return void drawIcon(ctx, "server", cx, cy, size, env, color);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (kind === "hub") {
    // Central bus repeating to EVERY port — the "everyone hears it" glyph.
    const r = size * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const inR = r * 1.4;
      const outR = size * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inR, cy + Math.sin(a) * inR);
      ctx.lineTo(cx + Math.cos(a) * outR, cy + Math.sin(a) * outR);
      ctx.stroke();
      const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(env.elapsedMs / 500 + i));
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * outR, cy + Math.sin(a) * outR, size * 0.035, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else {
    // switch: a port faceplate; one forwarding hop lit — selective, not broadcast.
    const w = size * 0.7;
    const h = size * 0.32;
    const x = cx - w / 2;
    const y = cy - h / 2;
    roundRect(ctx, x, y, w, h, size * 0.06);
    ctx.stroke();
    const ports = 4;
    const pw = w * 0.15;
    const gap = (w - ports * pw) / (ports + 1);
    const lit = Math.floor((env.elapsedMs / 900) % ports);
    for (let i = 0; i < ports; i++) {
      const px = x + gap + i * (pw + gap);
      ctx.save();
      ctx.globalAlpha = i === lit ? 1 : 0.4;
      roundRect(ctx, px, y + h * 0.58, pw, h * 0.3, size * 0.02);
      ctx.stroke();
      ctx.restore();
    }
    // Directed forwarding arc from the first port to the lit one.
    const srcX = x + gap + pw / 2;
    const dstX = x + gap + lit * (pw + gap) + pw / 2;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(srcX, y + h * 0.4);
    ctx.quadraticCurveTo((srcX + dstX) / 2, y - h * 0.2, dstX, y + h * 0.4);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

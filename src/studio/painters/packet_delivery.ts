import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  isoBox3D,
  flowDots,
  glowRing,
  pointAlongPolyline,
  shade,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type PacketDeliveryScene = Extract<Scene, { kind: "packet_delivery" }>;
type Hop = PacketDeliveryScene["hops"][number];
type Step = PacketDeliveryScene["steps"][number];

/** Hop kind → vector-icon name understood by drawIcon. */
const HOP_ICON: Record<Hop["kind"], string> = {
  host: "client",
  router: "network",
  proxy: "api",
  firewall: "shield",
};

type Pt = { x: number; y: number };

/** Envelope face/tone hex per action (all hex so shade() can derive faces). */
function toneOf(action: Step["action"], accent: string, secondary: string): string {
  switch (action) {
    case "drop":
      return THEME.warn;
    case "retransmit":
    case "ack":
      return THEME.good;
    case "inspect":
      return secondary;
    default:
      return accent;
  }
}

const CAPTION: Record<Step["action"], string> = {
  send: "SEND",
  drop: "PACKET LOST",
  retransmit: "RETRANSMIT",
  inspect: "INSPECT",
  ack: "ACK",
};

/**
 * A network packet drawn as a literal envelope travelling hop-to-hop across a row
 * of hosts/routers/proxies/firewalls. Each beat is one step: the envelope is sent,
 * lost mid-flight (falls + fades), retransmitted (a fresh envelope), inspected at
 * a proxy/firewall (the flap opens, contents can be rewritten), or acknowledged
 * (an envelope travels back). Generalises TCP loss/retransmit, ARP spoofing, and
 * the HTTP→WebSocket upgrade. Horizontal row in 16:9, vertical column in 9:16.
 */
export function paintPacketDelivery(ctx: CanvasRenderingContext2D, scene: PacketDeliveryScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const hops = scene.hops;
  const n = hops.length;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.5;
  const areaY = contentY + band;
  const areaH = contentH - band;

  // Hop geometry laid along the main axis (left→right / top→bottom).
  const depth = unit * 0.5;
  const gapMain = vertical ? areaH / n : contentW / n;
  const cardW = vertical ? Math.min(contentW * 0.5, unit * 7.4) : Math.min(gapMain * 0.66, unit * 5.6);
  const cardH = vertical ? Math.min(gapMain * 0.5, unit * 2.8) : Math.min(areaH * 0.34, unit * 3.6);
  const pos = (i: number): Pt => {
    const t = (i + 0.5) / n;
    return vertical
      ? { x: contentX + contentW / 2, y: areaY + t * areaH }
      : { x: contentX + t * contentW, y: areaY + areaH * 0.52 };
  };
  const nearEdge = (from: Pt, to: Pt): Pt =>
    vertical
      ? { x: from.x, y: from.y + Math.sign(to.y - from.y) * (cardH / 2) }
      : { x: from.x + Math.sign(to.x - from.x) * (cardW / 2), y: from.y };

  const idxOf = new Map(hops.map((h, i) => [h.id, i] as const));

  // --- Connectors between adjacent hops (drawn in the gaps, behind cards). ---
  for (let i = 0; i < n - 1; i++) {
    const a = pos(i);
    const b = pos(i + 1);
    const a2 = nearEdge(a, b);
    const b2 = nearEdge(b, a);
    ctx.save();
    ctx.globalAlpha = introIn * 0.55;
    ctx.strokeStyle = rgba(accent, 0.4);
    ctx.lineWidth = unit * 0.08;
    ctx.lineCap = "round";
    ctx.setLineDash([unit * 0.34, unit * 0.28]);
    ctx.beginPath();
    ctx.moveTo(a2.x, a2.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    if (activeStep < 0) flowDots(ctx, [a2, b2], env, { count: 2, speedMs: 2200, r: unit * 0.12, color: accent });
  }

  // --- Hop cards (staggered entrance; the whole topology shows up front). ---
  hops.forEach((hop, i) => {
    const appear = easeOutBack(clamp01(enterT(env, 420, 120 + i * 90)));
    if (appear <= 0) return;
    const { x, y } = pos(i);
    const scale = 0.7 + 0.3 * clamp01(appear);
    const w = cardW * scale;
    const hgt = cardH * scale;
    const bx = x - w / 2;
    const by = y - hgt / 2;
    const isEndpoint = hop.kind === "host";
    const face = isEndpoint ? accent : secondary;
    const touched = activeStep >= 0 && stepTouches(scene.steps[activeStep], hop.id);

    ctx.save();
    ctx.globalAlpha = clamp01(appear);
    isoBox3D(ctx, bx, by, w, hgt, depth, face, touched ? accentGlow : undefined);
    const bob = touched ? Math.sin(env.elapsedMs / 1200) * unit * 0.05 : 0;
    drawIcon(ctx, HOP_ICON[hop.kind], x, by + hgt * 0.38 + bob, hgt * 0.46, env, "#eaf3ff");
    const labelPx = fitFontSize(ctx, hop.label, { maxW: w * 0.88, startPx: unit * 0.74, minPx: unit * 0.5, weight: 700 });
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(hop.label, x, by + hgt * 0.8);
    if (touched) {
      const g = 0.4 + 0.6 * idle(env, 1500);
      ctx.globalAlpha = clamp01(appear) * g * 0.7;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.09;
      roundRect(ctx, bx - unit * 0.18, by - unit * 0.18, w + unit * 0.36, hgt + unit * 0.36, unit * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  });

  // --- Active step: animate the envelope. ---
  if (activeStep >= 0 && introIn > 0.4) {
    const step = scene.steps[activeStep];
    const stepT = beatT(env.beats, offset + activeStep, totalBeats, env.p);
    const fromI = clampIdx(idxOf.get(step.from), n);
    const toI = clampIdx(idxOf.get(step.to), n);
    const tone = toneOf(step.action, accent, secondary);
    const ew = unit * (vertical ? 2.4 : 2.1);
    const payloadAfter = step.payloadAfter;
    let payloadNow = step.payload;

    // Point the envelope should occupy this frame + its open/alpha/lost state.
    let ep: Pt = pos(fromI);
    let openT = 0;
    let alpha = 1;
    let lost = 0;
    let atI = -1;

    if (step.action === "ack") {
      const path = hopCenters(toI, fromI, pos);
      ep = pointAlongPolyline(path, easeInOutCubic(stepT));
    } else if (step.action === "inspect") {
      atI = inspectAt(step, hops, fromI, toI, idxOf);
      const p1 = hopCenters(fromI, atI, pos);
      const p2 = hopCenters(atI, toI, pos);
      if (stepT < 0.35) {
        ep = pointAlongPolyline(p1, easeInOutCubic(stepT / 0.35));
      } else if (stepT < 0.72) {
        ep = pos(atI);
        openT = clamp01((stepT - 0.35) / 0.2);
        if (payloadAfter && stepT > 0.55) payloadNow = payloadAfter;
      } else {
        ep = pointAlongPolyline(p2, easeInOutCubic((stepT - 0.72) / 0.28));
        openT = 1 - clamp01((stepT - 0.72) / 0.18);
        if (payloadAfter) payloadNow = payloadAfter;
      }
    } else if (step.action === "drop") {
      atI = dropAt(step, fromI, toI, idxOf, n);
      const p1 = hopCenters(fromI, atI, pos);
      if (stepT < 0.55) {
        ep = pointAlongPolyline(p1, easeInOutCubic(stepT / 0.55));
      } else {
        const fall = clamp01((stepT - 0.55) / 0.45);
        const fallE = fall * fall * fall;
        const base = pos(atI);
        ep = { x: base.x + Math.sin(fall * 9) * unit * 0.3, y: base.y + fallE * unit * 3.4 };
        alpha = 1 - fall;
        lost = fall;
      }
    } else {
      // send / retransmit
      const path = hopCenters(fromI, toI, pos);
      ep = pointAlongPolyline(path, easeInOutCubic(stepT));
    }

    // Inspecting hop pulse.
    if (atI >= 0 && step.action === "inspect" && openT > 0.05) {
      glowRing(ctx, pos(atI).x, pos(atI).y, cardW * 0.42, secondary, env, 1400);
    }

    // Envelope, its payload pill, and its action caption all render at a fixed
    // clearance above the hop row — otherwise the envelope sits exactly on top
    // of a hop card at rest and collides with the card's own icon/label.
    const envY = ep.y - cardH * 0.85;

    // Envelope.
    ctx.save();
    ctx.globalAlpha = introIn * alpha;
    const rot = lost > 0 ? lost * 0.5 : 0;
    ctx.translate(ep.x, envY);
    if (rot) ctx.rotate(rot);
    drawEnvelope(ctx, 0, 0, ew, openT, tone, step.action === "retransmit" || step.action === "ack");
    ctx.restore();

    // Payload pill under the envelope.
    if (payloadNow && alpha > 0.2) {
      ctx.save();
      ctx.globalAlpha = introIn * alpha;
      ctx.font = `700 ${unit * 0.62}px ${FONT_MONO}`;
      const tw = ctx.measureText(payloadNow).width;
      const py = envY + ew * 0.5 + unit * 0.55;
      ctx.fillStyle = "rgba(8,14,20,0.82)";
      roundRect(ctx, ep.x - tw / 2 - unit * 0.4, py - unit * 0.5, tw + unit * 0.8, unit * 1.0, unit * 0.3);
      ctx.fill();
      ctx.strokeStyle = rgba(tone, 0.6);
      ctx.lineWidth = unit * 0.05;
      roundRect(ctx, ep.x - tw / 2 - unit * 0.4, py - unit * 0.5, tw + unit * 0.8, unit * 1.0, unit * 0.3);
      ctx.stroke();
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(payloadNow, ep.x, py);
      ctx.restore();
    }

    // Action caption above the envelope.
    ctx.save();
    ctx.globalAlpha = introIn * (0.5 + 0.5 * clamp01(alpha + 0.3));
    ctx.font = `800 ${unit * 0.66}px ${FONT_SANS}`;
    ctx.fillStyle = tone;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const badge = lost > 0.3 ? "✕ " + CAPTION[step.action] : CAPTION[step.action];
    ctx.fillText(badge, ep.x, envY - ew * 0.5 - unit * 0.5);
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/** Center points of hops from index a to b inclusive (either direction). */
function hopCenters(a: number, b: number, pos: (i: number) => Pt): Pt[] {
  const out: Pt[] = [];
  const dir = a <= b ? 1 : -1;
  for (let i = a; ; i += dir) {
    out.push(pos(i));
    if (i === b) break;
  }
  return out;
}

function clampIdx(i: number | undefined, n: number): number {
  if (i == null) return 0;
  return Math.max(0, Math.min(n - 1, i));
}

/** True if a step's from/to/at references this hop id (for card highlight). */
function stepTouches(step: Step, hopId: string): boolean {
  return step.from === hopId || step.to === hopId || step.at === hopId;
}

/** Hop index where an inspect opens: explicit `at`, else first proxy/firewall
 *  between endpoints, else the midpoint. */
function inspectAt(step: Step, hops: Hop[], fromI: number, toI: number, idxOf: Map<string, number>): number {
  if (step.at != null && idxOf.has(step.at)) return idxOf.get(step.at)!;
  const lo = Math.min(fromI, toI);
  const hi = Math.max(fromI, toI);
  for (let i = lo + 1; i < hi; i++) if (hops[i].kind === "proxy" || hops[i].kind === "firewall") return i;
  return Math.round((fromI + toI) / 2);
}

/** Hop index where a drop happens: explicit `at`, else the midpoint. */
function dropAt(step: Step, fromI: number, toI: number, idxOf: Map<string, number>, n: number): number {
  if (step.at != null && idxOf.has(step.at)) return clampIdx(idxOf.get(step.at), n);
  return Math.round((fromI + toI) / 2);
}

/** A literal envelope centred at (ex,ey): rounded body, seams, and a flap that
 *  rotates open (openT 0→1) to reveal a letter — the "inspect / modify" moment. */
function drawEnvelope(ctx: CanvasRenderingContext2D, ex: number, ey: number, ew: number, openT: number, faceHex: string, glow: boolean) {
  const eh = ew * 0.64;
  const x = ex - ew / 2;
  const y = ey - eh / 2;
  ctx.save();
  if (glow) {
    ctx.shadowColor = rgba(faceHex, 0.6);
    ctx.shadowBlur = ew * 0.42;
  }
  const g = ctx.createLinearGradient(0, y, 0, y + eh);
  g.addColorStop(0, shade(faceHex, 0.14));
  g.addColorStop(1, shade(faceHex, -0.22));
  roundRect(ctx, x, y, ew, eh, ew * 0.08);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.5, ew * 0.03);
  ctx.strokeStyle = shade(faceHex, 0.32);
  ctx.stroke();

  // Letter rising out when the flap opens.
  if (openT > 0.02) {
    const lw = ew * 0.74;
    const lh = eh * 0.86;
    const lx = ex - lw / 2;
    const ly = y - lh * 0.55 * openT + eh * 0.06;
    ctx.save();
    ctx.globalAlpha = openT;
    roundRect(ctx, lx, ly, lw, lh, ew * 0.04);
    ctx.fillStyle = "#f3f6fb";
    ctx.fill();
    ctx.strokeStyle = rgba(faceHex, 0.5);
    ctx.lineWidth = Math.max(1, ew * 0.02);
    ctx.stroke();
    ctx.strokeStyle = "rgba(11,16,22,0.45)";
    ctx.lineWidth = Math.max(1, ew * 0.018);
    for (let i = 0; i < 3; i++) {
      const yy = ly + lh * (0.28 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(lx + lw * 0.16, yy);
      ctx.lineTo(lx + lw * (0.84 - i * 0.16), yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Bottom seams (fade as it opens).
  ctx.save();
  ctx.globalAlpha = (1 - openT) * 0.5;
  ctx.strokeStyle = shade(faceHex, 0.34);
  ctx.lineWidth = Math.max(1, ew * 0.02);
  ctx.beginPath();
  ctx.moveTo(x, y + eh);
  ctx.lineTo(ex, ey);
  ctx.moveTo(x + ew, y + eh);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.restore();

  // Flap: apex at the body centre when closed, lifted above the top when open.
  const apex = ey - openT * eh * 0.95;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, apex);
  ctx.lineTo(x + ew, y);
  ctx.closePath();
  ctx.fillStyle = shade(faceHex, openT > 0.3 ? 0.02 : 0.2);
  ctx.fill();
  ctx.strokeStyle = shade(faceHex, 0.34);
  ctx.lineWidth = Math.max(1.5, ew * 0.03);
  ctx.stroke();
  ctx.restore();
}

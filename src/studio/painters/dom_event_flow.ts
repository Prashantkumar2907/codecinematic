import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_MONO,
  easeOutCubic,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  drawArrowhead,
  pointAlongPolyline,
  strokePolylineProgress,
  glowRing,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type DomEventFlowScene = Extract<Scene, { kind: "dom_event_flow" }>;
type NodeDef = DomEventFlowScene["nodes"][number];
type Pt = { x: number; y: number };

/** Fixed diagonal the pulse travels along — same angle at every depth because
 *  all nested boxes share one center, so a single ray from the center crosses
 *  every box's border exactly once (capture in, bubble back out). */
const CAPTURE_THETA = (34 * Math.PI) / 180;
/** A different diagonal for portal connectors so they never overlap the capture ray. */
const PORTAL_THETA = (-58 * Math.PI) / 180;

function borderPoint(cx: number, cy: number, halfW: number, halfH: number, theta: number): Pt {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const tx = ct !== 0 ? Math.abs(halfW / ct) : Infinity;
  const ty = st !== 0 ? Math.abs(halfH / st) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + t * ct, y: cy + t * st };
}

/** Walk parent pointers from `targetId` up to the root, returning [root, ..., target]. */
function chainToTarget(nodes: NodeDef[], targetId: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const seen = new Set<string>();
  const path: string[] = [];
  let cur: string | undefined = targetId;
  while (cur && byId.has(cur) && !seen.has(cur)) {
    path.push(cur);
    seen.add(cur);
    cur = byId.get(cur)!.parent;
  }
  return path.reverse();
}

/**
 * The browser DOM as concentric nested rounded boxes (document > body > ... >
 * target). One diagonal ray from the shared center crosses every box's border
 * once, so that single ray IS the event's path: a pulse rides it inward
 * (capture) to the target, then back outward (bubble), beat by beat. Boxes
 * start as dashed ghosts and solidify the instant the pulse first reaches
 * them, so the whole tree shape reads immediately (dp_table_fill's ghost-cell
 * trick) while the traveling dot teaches capture/target/bubble order. An
 * optional `delegateAt` node gets a permanent "listener" badge that lights up
 * on every pass — event delegation. Optional `portal:true` nodes render as a
 * satellite box outside the nest, dash-connected to their logical parent —
 * a DOM node rendered outside its parent's box, i.e. a React portal. A
 * `synthetic` flag rides a "SyntheticEvent" tag alongside the pulse.
 */
export function paintDomEventFlow(ctx: CanvasRenderingContext2D, scene: DomEventFlowScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.5;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const byId = new Map(scene.nodes.map((nd) => [nd.id, nd] as const));
  const chainIds = chainToTarget(scene.nodes, scene.targetId);
  const n = Math.max(chainIds.length, 1);
  const portalNodes = scene.nodes.filter((nd) => nd.portal && chainIds.indexOf(nd.id) < 0);
  const hasPortal = portalNodes.length > 0;

  // Figure box: a square-ish region centred below the title, leaving a side
  // (16:9) or bottom (9:16) strip for any portal satellites.
  const portalReserve = hasPortal ? (vertical ? areaH * 0.24 : contentW * 0.28) : 0;
  const figW = (vertical ? contentW : contentW - portalReserve) * 0.88;
  const figH = (vertical ? areaH - portalReserve : areaH) * 0.86;
  const figCx = vertical ? contentX + contentW / 2 : contentX + (contentW - portalReserve) / 2;
  const figCy = vertical ? areaY + (areaH - portalReserve) / 2 : areaY + areaH / 2;

  // Concentric boxes, largest (root, i=0) to smallest (target, i=n-1), all
  // sharing one center — so depth alone determines size.
  const rects = Array.from({ length: n }, (_, i) => {
    const frac = n > 1 ? i / (n - 1) : 0;
    const scale = Math.max(0.24, 1 - frac * 0.66);
    const w = figW * scale;
    const h = figH * scale;
    return { x: figCx - w / 2, y: figCy - h / 2, w, h };
  });
  const capturePts: Pt[] = rects.map((r, i) =>
    i === n - 1 ? { x: figCx, y: figCy } : borderPoint(figCx, figCy, r.w / 2, r.h / 2, CAPTURE_THETA)
  );
  const bubblePts: Pt[] = [...capturePts].reverse();

  // Each authored step maps to a scalar S: [0,1] walks the capture ray
  // inward by chain depth, (1,2] walks the same ray back outward on bubble.
  const milestoneS = scene.steps.map((st) => {
    let i = chainIds.indexOf(st.nodeId);
    if (i < 0) i = n - 1;
    const frac = n > 1 ? i / (n - 1) : 0;
    return st.phase === "bubble" ? 1 + (1 - frac) : frac;
  });
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const prevS = activeStep > 0 ? milestoneS[activeStep - 1] : 0;
  const curS = activeStep >= 0 ? milestoneS[activeStep] : 0;
  const currentS = activeStep >= 0 ? prevS + (curS - prevS) * easeOutCubic(clamp01(stepT)) : 0;
  const captureProgress = Math.min(currentS, 1);
  const bubbleProgress = Math.max(0, currentS - 1);
  const bubbling = currentS > 1;
  const rawDepth = bubbling ? (2 - currentS) * (n - 1) : currentS * (n - 1);
  const curDepth = Math.min(n - 1, Math.max(0, Math.round(rawDepth)));
  const phaseNow: "capture" | "target" | "bubble" = bubbling ? "bubble" : currentS >= (n > 1 ? 1 - 0.03 : 0) ? "target" : "capture";

  // Nested boxes: dashed ghost until the pulse first reaches that depth, then
  // solid + labelled. Draw outer→inner so inner boxes sit visually on top.
  for (let i = 0; i < n; i++) {
    const node = byId.get(chainIds[i]);
    if (!node) continue;
    const r = rects[i];
    const visited = n > 1 ? captureProgress * (n - 1) >= i - 0.02 : currentS > 0.001;
    const isCurrent = i === curDepth && Math.abs(rawDepth - i) < 0.55;
    const radius = Math.min(r.w, r.h) * 0.12;

    if (!visited) {
      const ghostIn = enterT(env, 260, 60 + i * 70);
      if (ghostIn <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.16 * introIn * easeOutCubic(ghostIn);
      ctx.strokeStyle = "rgba(148,163,184,0.9)";
      ctx.lineWidth = unit * 0.05;
      ctx.setLineDash([unit * 0.26, unit * 0.22]);
      roundRect(ctx, r.x, r.y, r.w, r.h, radius);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      continue;
    }

    ctx.save();
    ctx.globalAlpha = introIn;
    roundRect(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.fillStyle = rgba(accent, 0.04 + (i / Math.max(n - 1, 1)) * 0.06);
    ctx.fill();
    if (isCurrent) {
      ctx.shadowColor = phaseNow === "bubble" ? secondaryGlow : accentGlow;
      ctx.shadowBlur = unit * 0.55;
    }
    ctx.lineWidth = isCurrent ? unit * 0.12 : unit * 0.055;
    ctx.strokeStyle = isCurrent ? (phaseNow === "bubble" ? secondary : accent) : rgba(accent, 0.5);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const label = `<${node.label}>`;
    let textX = r.x + unit * 0.4;
    const textY = r.y + unit * 0.32;
    if (node.icon) {
      drawIcon(ctx, node.icon, textX + unit * 0.36, textY + unit * 0.4, unit * 0.7, env, accent);
      textX += unit * 0.85;
    }
    const labelPx = fitFontSize(ctx, label, {
      maxW: Math.max(unit * 1.2, r.x + r.w - textX - unit * 0.2),
      startPx: Math.min(unit * 0.68, r.h * 0.3),
      minPx: unit * 0.4,
      weight: 700,
      family: FONT_MONO,
    });
    ctx.font = `700 ${labelPx}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.text;
    ctx.globalAlpha = introIn * (isCurrent ? 1 : 0.82);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(label, textX, textY);

    if (isCurrent) {
      const pr = (env.elapsedMs % 1500) / 1500;
      ctx.globalAlpha = introIn * (1 - pr) * 0.55;
      ctx.strokeStyle = phaseNow === "bubble" ? secondary : accent;
      ctx.lineWidth = unit * 0.07;
      roundRect(ctx, r.x - pr * unit * 0.4, r.y - pr * unit * 0.4, r.w + pr * unit * 0.8, r.h + pr * unit * 0.8, radius);
      ctx.stroke();
    }
    ctx.restore();

    // The single delegated listener: a permanent corner badge that flashes on every pass.
    if (scene.delegateAt === node.id) {
      const passing = isCurrent;
      const bx = r.x + r.w - unit * 0.15;
      const by = r.y - unit * 0.15;
      ctx.save();
      ctx.globalAlpha = introIn * (0.55 + 0.45 * idle(env, 1600));
      const label2 = "listener";
      ctx.font = `800 ${unit * 0.46}px ${FONT_MONO}`;
      const tw = ctx.measureText(label2).width;
      ctx.fillStyle = passing ? accent : rgba(accent, 0.65);
      roundRect(ctx, bx - tw - unit * 0.6, by - unit * 0.05, tw + unit * 0.65, unit * 0.78, unit * 0.28);
      ctx.fill();
      if (passing) {
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.5;
      }
      ctx.fillStyle = "#08131f";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label2, bx - tw - unit * 0.32, by + unit * 0.34);
      ctx.restore();
    }

    // Target chip: where the event actually originates.
    if (i === n - 1) {
      ctx.save();
      ctx.globalAlpha = introIn * 0.95;
      const chip = scene.eventLabel;
      ctx.font = `800 ${unit * 0.5}px ${FONT_MONO}`;
      const tw = ctx.measureText(chip).width;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h + unit * 0.62;
      ctx.fillStyle = "rgba(9,13,18,0.85)";
      roundRect(ctx, cx - tw / 2 - unit * 0.35, cy - unit * 0.4, tw + unit * 0.7, unit * 0.82, unit * 0.3);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(chip, cx, cy);
      ctx.restore();
    }
  }

  // The path IS the diagonal ray: draw-on capture segment, then draw-on
  // bubble segment once the pulse turns around at the target.
  ctx.save();
  ctx.lineCap = "round";
  ctx.globalAlpha = introIn;
  ctx.strokeStyle = accent;
  ctx.lineWidth = unit * 0.09;
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * 0.4;
  strokePolylineProgress(ctx, capturePts, captureProgress);
  if (bubbleProgress > 0) {
    ctx.strokeStyle = secondary;
    ctx.shadowColor = secondaryGlow;
    strokePolylineProgress(ctx, bubblePts, bubbleProgress);
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  if (activeStep >= 0) {
    const pulsePos = bubbleProgress > 0 ? pointAlongPolyline(bubblePts, bubbleProgress) : pointAlongPolyline(capturePts, captureProgress);
    const travelAngle = phaseNow === "bubble" ? CAPTURE_THETA : CAPTURE_THETA + Math.PI;
    const pulseColor = phaseNow === "bubble" ? secondary : accent;
    ctx.save();
    ctx.globalAlpha = introIn;
    glowRing(ctx, pulsePos.x, pulsePos.y, unit * 0.3, pulseColor, env, 1400);
    ctx.shadowColor = pulseColor;
    ctx.shadowBlur = unit * 0.7;
    ctx.fillStyle = pulseColor;
    ctx.beginPath();
    ctx.arc(pulsePos.x, pulsePos.y, unit * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    drawArrowhead(ctx, pulsePos.x, pulsePos.y, travelAngle, unit * 0.32);

    if (scene.synthetic) {
      const tag = "SyntheticEvent";
      ctx.font = `700 ${unit * 0.42}px ${FONT_MONO}`;
      const tw = ctx.measureText(tag).width;
      const tx = pulsePos.x + unit * 0.5;
      const ty = pulsePos.y - unit * 0.75;
      ctx.fillStyle = "rgba(9,13,18,0.88)";
      roundRect(ctx, tx - unit * 0.2, ty - unit * 0.4, tw + unit * 0.4, unit * 0.78, unit * 0.22);
      ctx.fill();
      ctx.strokeStyle = rgba(pulseColor, 0.8);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(tag, tx, ty);
    }
    ctx.restore();
  }

  // Phase status pill, top-right of the figure, so the current phase always reads at a glance.
  ctx.save();
  ctx.globalAlpha = introIn * 0.95;
  const statusText = `${scene.eventLabel} · ${phaseNow}`;
  ctx.font = `700 ${unit * 0.52}px ${FONT_MONO}`;
  const stw = ctx.measureText(statusText).width;
  const sx = vertical ? figCx : contentX + contentW - stw - unit * 1.1;
  const sy = areaY + unit * 0.1;
  ctx.fillStyle = "rgba(9,13,18,0.8)";
  roundRect(ctx, sx - unit * 0.4, sy, stw + unit * 0.8, unit * 0.9, unit * 0.28);
  ctx.fill();
  ctx.strokeStyle = rgba(phaseNow === "bubble" ? secondary : accent, 0.7);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = phaseNow === "bubble" ? secondary : accent;
  ctx.textAlign = vertical ? "center" : "left";
  ctx.textBaseline = "middle";
  ctx.fillText(statusText, vertical ? sx : sx, sy + unit * 0.45);
  ctx.restore();

  // Portal satellites: nodes that render outside their logical parent's box.
  portalNodes.forEach((nd, j) => {
    const parentIdx = nd.parent ? chainIds.indexOf(nd.parent) : -1;
    const parentRect = parentIdx >= 0 ? rects[parentIdx] : rects[0];
    const anchor = borderPoint(figCx, figCy, parentRect.w / 2, parentRect.h / 2, PORTAL_THETA);
    const spread = (j - (portalNodes.length - 1) / 2) * unit * 3.0;
    const satCx = vertical ? figCx + spread : figCx + figW / 2 + unit * 3.1;
    const satCy = vertical ? figCy + figH / 2 + unit * 2.3 : figCy + spread;
    const satW = unit * 3.3;
    const satH = unit * 1.7;
    const portalIn = enterT(env, 320, 200 + j * 90);
    if (portalIn <= 0) return;

    ctx.save();
    ctx.globalAlpha = introIn * easeOutCubic(portalIn) * 0.85;
    ctx.strokeStyle = rgba(secondary, 0.6);
    ctx.lineWidth = unit * 0.06;
    ctx.setLineDash([unit * 0.24, unit * 0.2]);
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(satCx, satCy);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(satCy - anchor.y, satCx - anchor.x);
    ctx.fillStyle = rgba(secondary, 0.8);
    drawArrowhead(ctx, satCx - (satW / 2) * Math.cos(ang), satCy - (satW / 2) * Math.sin(ang), ang, unit * 0.24);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = introIn * easeOutCubic(portalIn);
    roundRect(ctx, satCx - satW / 2, satCy - satH / 2, satW, satH, unit * 0.3);
    ctx.fillStyle = rgba(secondary, 0.12);
    ctx.fill();
    ctx.strokeStyle = secondary;
    ctx.lineWidth = unit * 0.06;
    ctx.setLineDash([unit * 0.22, unit * 0.16]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (nd.icon) drawIcon(ctx, nd.icon, satCx - satW * 0.28, satCy, unit * 0.6, env, secondary);
    ctx.font = `700 ${Math.min(unit * 0.5, satH * 0.34)}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`<${nd.label}>`, satCx, satCy - unit * 0.28);
    ctx.font = `800 ${unit * 0.36}px ${FONT_MONO}`;
    ctx.fillStyle = secondary;
    ctx.fillText("PORTAL", satCx, satCy + unit * 0.32);
    ctx.restore();
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

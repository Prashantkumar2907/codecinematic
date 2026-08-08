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
  departT,
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  wrapText,
  roundedCorners,
  pointAlongPolyline,
  beatT,
  activeBeatIndex,
  glowRing,
  rgba,
} from "./common";
import { drawIcon, isVectorIcon } from "./icons";
import type { PaintEnv } from "./index";

type VdomDiffScene = Extract<Scene, { kind: "vdom_diff" }>;
type VNode = VdomDiffScene["nodes"][number];
type Pt = { x: number; y: number };

/** Dark ink on a bright accent-tone/tier fill — same convention as cipher.ts's `INK_ON_ACCENT`. */
const INK_ON_ACCENT = "#06121a";

type NodeStat = { appearAt: number; appearKind: "render" | "add"; removeAt: number | null; updateSteps: number[] };

/**
 * Component / Virtual-DOM tree (ByteByteGo tidy auto-layout, same engine as
 * tree.ts). Each beat's step can `render` (plain mount), `add`/`remove`/`update`
 * (diff a node green/red/yellow for that beat, with a +/-/~ badge), and/or
 * `drill` a small "props" token from an ancestor down through every intermediate
 * node to a descendant — the visual for prop-drilling / lifting state up.
 * Generalizes: initial-mount diffing, Fiber re-render walks, and prop drilling.
 */
export function paintVdomDiff(ctx: CanvasRenderingContext2D, scene: VdomDiffScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, w, safeBottom } = layout;
  const { accent, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const step = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const titleBand = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true });
  const chips: { label: string; color: string }[] = [];
  if (scene.steps.some((s) => s.add.length)) chips.push({ label: "Added", color: THEME.good });
  if (scene.steps.some((s) => s.remove.length)) chips.push({ label: "Removed", color: THEME.danger });
  if (scene.steps.some((s) => s.update.length)) chips.push({ label: "Updated", color: THEME.warn });
  const band = titleBand + unit * (chips.length ? 1.35 : 0.5);

  // --- structure -------------------------------------------------------------
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const childrenOf = (pid: string | null) => scene.nodes.filter((n) => (n.parent ?? null) === pid);
  const root = scene.nodes.find((n) => n.parent == null) ?? scene.nodes[0];
  const depthOf = (n: VNode): number => {
    let d = 0, cur: VNode | undefined = n;
    while (cur && cur.parent != null) { cur = byId.get(cur.parent); d++; if (d > 20) break; }
    return d;
  };

  // Tidy layout: leaves get sequential columns; parents centre over children.
  const gx = new Map<string, number>();
  let leafCol = 0;
  const place = (n: VNode) => {
    const kids = childrenOf(n.id);
    if (!kids.length) { gx.set(n.id, leafCol++); return; }
    kids.forEach(place);
    const xs = kids.map((k) => gx.get(k.id)!);
    gx.set(n.id, (Math.min(...xs) + Math.max(...xs)) / 2);
  };
  place(root);
  const maxCol = Math.max(1, leafCol - 1);
  const maxDepth = Math.max(1, ...scene.nodes.map(depthOf));

  // --- replay render/add/remove/update across 0..activeStep -------------------
  const stat = new Map<string, NodeStat>();
  scene.nodes.forEach((n) => stat.set(n.id, { appearAt: Infinity, appearKind: "render", removeAt: null, updateSteps: [] }));
  scene.steps.forEach((s, k) => {
    const addSet = new Set(s.add);
    [...s.render, ...s.add].forEach((id) => {
      const st = stat.get(id);
      if (!st) return;
      if (k < st.appearAt) { st.appearAt = k; st.appearKind = addSet.has(id) ? "add" : "render"; }
      else if (k === st.appearAt && addSet.has(id)) st.appearKind = "add";
    });
    s.update.forEach((id) => stat.get(id)?.updateSteps.push(k));
    s.remove.forEach((id) => { const st = stat.get(id); if (st && st.removeAt == null) st.removeAt = k; });
  });
  stat.forEach((st) => { if (st.appearAt === Infinity) st.appearAt = 0; }); // never mentioned -> visible from the start

  const appearT = (id: string) => {
    const k = stat.get(id)!.appearAt;
    if (activeStep < k) return 0;
    if (activeStep > k) return 1;
    return easeOutCubic(clamp01(beatT(env.beats, offset + k, totalBeats, env.p) * 1.6));
  };
  const removeT = (id: string) => {
    const st = stat.get(id)!;
    if (st.removeAt == null) return 0;
    if (activeStep < st.removeAt) return 0;
    if (activeStep > st.removeAt) return 1;
    return easeOutCubic(clamp01(beatT(env.beats, offset + st.removeAt, totalBeats, env.p) * 1.3));
  };
  const alphaOf = (id: string) => appearT(id) * (1 - removeT(id));
  const isActiveNow = (id: string) => {
    const st = stat.get(id)!;
    return st.appearAt === activeStep || st.removeAt === activeStep || st.updateSteps.includes(activeStep) ||
      (!!step?.drill && (step.drill.from === id || step.drill.to === id));
  };
  const tintOf = (id: string): string | null => {
    const st = stat.get(id)!;
    if (st.removeAt === activeStep) return THEME.danger;
    if (st.appearAt === activeStep && st.appearKind === "add") return THEME.good;
    if (st.updateSteps.includes(activeStep)) return THEME.warn;
    return null;
  };
  const badgeOf = (id: string): string | null => {
    const st = stat.get(id)!;
    if (st.removeAt === activeStep) return "−";
    if (st.appearAt === activeStep && st.appearKind === "add") return "+";
    if (st.updateSteps.includes(activeStep)) return "~";
    return null;
  };

  // --- geometry ----------------------------------------------------------
  const areaX = contentX;
  const areaY = contentY + band;
  const areaW = contentW;
  // Extra margin beyond the usual unit*0.3: an active node's glow shadowBlur
  // (up to unit*0.85) extends past its own box and isn't accounted for by
  // the tree-layout math, which otherwise places the deepest row exactly at
  // areaY+areaH (measured -32.9px intrusion at unit*0.3 alone).
  const areaH = Math.min(contentY + contentH, safeBottom) - unit * 1.1 - areaY;

  const cols = maxCol + 1;
  const colGap = areaW / cols;
  const nodeW = Math.min(colGap * 0.84, unit * 6.4);
  const nodeH = Math.min(unit * 2.05, (areaH / (maxDepth + 1)) * 0.6);
  const levelGap = (areaH - nodeH) / Math.max(1, maxDepth);

  const center = (n: VNode): Pt => ({
    x: areaX + nodeW / 2 + (gx.get(n.id)! / maxCol) * (areaW - nodeW),
    y: areaY + nodeH / 2 + depthOf(n) * levelGap,
  });

  // Tier styling for nodes with no active diff tint this beat.
  const tier = (d: number) => (d === 0 ? { fill: secondary, text: INK_ON_ACCENT, outline: false } : d === 1 ? { fill: accent, text: INK_ON_ACCENT, outline: false } : { fill: accent, text: THEME.text, outline: true });

  // --- legend chips (only for kinds this scene actually uses) ----------------
  if (chips.length) {
    const legendIn = easeOutCubic(enterT(env, 380, 160));
    ctx.save();
    ctx.globalAlpha = legendIn * leave;
    ctx.font = `700 ${unit * 0.52}px ${FONT_SANS}`;
    const gapW = unit * 0.5;
    const widths = chips.map((c) => ctx.measureText(c.label).width + unit * 0.55);
    const total = widths.reduce((a, b) => a + b, 0) + gapW * (chips.length - 1);
    let cx = w / 2 - total / 2;
    const cy = contentY + titleBand + unit * 0.55;
    chips.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(cx + unit * 0.18, cy, unit * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "start";
      ctx.textBaseline = "middle";
      ctx.fillText(c.label, cx + unit * 0.45, cy);
      cx += widths[i] + gapW;
    });
    ctx.restore();
  }

  // --- connectors (drawn behind nodes) ----------------------------------------
  for (const n of scene.nodes) {
    if (n.parent == null) continue;
    const parent = byId.get(n.parent);
    if (!parent) continue;
    const edgeAlpha = Math.min(alphaOf(n.id), appearT(parent.id));
    if (edgeAlpha <= 0.005) continue;
    const pc = center(parent), cc = center(n);
    const from = { x: pc.x, y: pc.y + nodeH / 2 };
    const to = { x: cc.x, y: cc.y - nodeH / 2 };
    const midY = (from.y + to.y) / 2;
    const pts = roundedCorners([from, { x: from.x, y: midY }, { x: to.x, y: midY }, to], Math.min(unit * 0.6, levelGap * 0.35));
    const tint = tintOf(n.id);
    ctx.save();
    ctx.globalAlpha = edgeAlpha * leave;
    ctx.strokeStyle = tint ? rgba(tint, 0.7) : rgba(THEME.textDim, 0.75);
    ctx.lineWidth = tint ? unit * 0.1 : unit * 0.06;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
  }

  // --- prop-drill token: travels from an ancestor down through every node on
  //     the path to the descendant, so intermediates visibly "just relay" it ---
  if (step?.drill) {
    const path = ancestorPath(byId, step.drill.from, step.drill.to) ?? [step.drill.from, step.drill.to];
    const pts = path.map((id) => byId.get(id)).filter((n): n is VNode => !!n).map(center);
    if (pts.length >= 2) {
      const route = roundedCorners(pts, unit * 0.5);
      ctx.save();
      ctx.globalAlpha = (0.5 + 0.35 * idle(env, 1300)) * leave;
      ctx.strokeStyle = rgba(secondary, 0.6);
      ctx.lineWidth = unit * 0.1;
      ctx.setLineDash([unit * 0.24, unit * 0.2]);
      ctx.beginPath();
      ctx.moveTo(route[0].x, route[0].y);
      route.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      const travel = easeInOutCubic(clamp01(stepT * 1.1));
      const pos = pointAlongPolyline(pts, travel);
      const pillW = unit * 2.1, pillH = unit * 0.85;
      // pointAlongPolyline(pts, 1) is exactly the destination node's centre —
      // the same spot its own label renders. Without a fade, the pill sits
      // fully opaque on top of that label for the last stretch of the beat
      // (confirmed visually: "props" overlapping "Item: Milk"). The arrival
      // glow ring below already marks the destination, so fade the pill out
      // as it completes the journey instead of leaving it parked on the label.
      const arrivalFade = 1 - easeOutCubic(clamp01((travel - 0.82) / 0.18));
      ctx.save();
      ctx.globalAlpha = clamp01(stepT * 3) * arrivalFade * leave;
      ctx.shadowColor = rgba(secondary, 0.6);
      ctx.shadowBlur = unit * 0.7;
      roundRect(ctx, pos.x - pillW / 2, pos.y - pillH / 2, pillW, pillH, pillH / 2);
      ctx.fillStyle = secondary;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `800 ${unit * 0.48}px ${FONT_MONO}`;
      ctx.fillStyle = INK_ON_ACCENT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("props", pos.x, pos.y);
      ctx.restore();

      glowRing(ctx, pts[0].x, pts[0].y, nodeW * 0.32, secondary, env, 1600);
      glowRing(ctx, pts[pts.length - 1].x, pts[pts.length - 1].y, nodeW * 0.32, accent, env, 1600);
    }
  }

  // --- nodes -------------------------------------------------------------
  for (const n of scene.nodes) {
    const alpha = alphaOf(n.id);
    if (alpha <= 0.005) {
      // Before step 0 begins, every node is invisible — the intro beat's
      // narration plays over a fully blank canvas (2/5, dead 25%). A faint
      // marching-ants preview of the tree shape gives that beat real motion
      // instead of nothing at all; once step 0 starts, this never applies
      // again (a later remove/pruned node correctly stays gone, not "ghosted").
      if (activeStep < 0) {
        const c2 = center(n);
        const gx2 = c2.x - nodeW / 2, gy2 = c2.y - nodeH / 2;
        const pulse = idle(env, 1500, depthOf(n) * 0.5 + (gx.get(n.id) ?? 0) * 0.3);
        ctx.save();
        // A soft wash spanning the FULL node box, not just its hairline
        // outline: a thin dash alone measured fine on one aspect but not the
        // other (same downsample-weighting gap as codediff's pending lines).
        ctx.globalAlpha = leave;
        ctx.fillStyle = rgba(THEME.textDim, 0.04 + 0.05 * pulse);
        roundRect(ctx, gx2, gy2, nodeW, nodeH, unit * 0.35);
        ctx.fill();
        ctx.globalAlpha = 0.16 * leave;
        ctx.strokeStyle = rgba(THEME.textDim, 0.9);
        ctx.lineWidth = unit * 0.05;
        ctx.setLineDash([unit * 0.24, unit * 0.2]);
        ctx.lineDashOffset = -((env.elapsedMs / 45) % (unit * 0.44));
        roundRect(ctx, gx2, gy2, nodeW, nodeH, unit * 0.35);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      continue;
    }
    const c = center(n);
    const d = depthOf(n);
    const tierSt = tier(d);
    const tint = tintOf(n.id);
    const aIn = appearT(n.id);
    const rOut = removeT(n.id);
    const pop = easeOutBack(clamp01(aIn * 1.3));
    const isActive = isActiveNow(n.id);
    const shake = tint === THEME.danger ? Math.sin(env.elapsedMs / 40) * unit * 0.05 * rOut : 0;
    // A small always-on idle breathing on every settled node (phase-offset
    // per node) keeps the whole tree visibly alive during the intro beat,
    // before any render/add/remove/update highlights a node (2/5, dead 25%
    // without it).
    const breathe = 1 + 0.014 * idle(env, 1800, d * 0.5 + (gx.get(n.id) ?? 0) * 0.3);

    ctx.save();
    ctx.globalAlpha = alpha * leave;
    ctx.translate(c.x + shake, c.y);
    ctx.scale((0.9 + 0.1 * pop) * breathe, (0.9 + 0.1 * pop) * breathe);
    ctx.translate(-c.x, -c.y);

    const x = c.x - nodeW / 2, y = c.y - nodeH / 2;
    if (isActive) {
      ctx.shadowColor = rgba(tint ?? accent, 0.55 + 0.3 * idle(env, 1400));
      ctx.shadowBlur = unit * 0.85;
    }
    roundRect(ctx, x, y, nodeW, nodeH, unit * 0.35);
    if (tint) {
      ctx.fillStyle = rgba(tint, 0.22);
      ctx.fill();
      ctx.shadowBlur = 0;
      roundRect(ctx, x, y, nodeW, nodeH, unit * 0.35);
      ctx.strokeStyle = tint;
      ctx.lineWidth = unit * 0.09;
      ctx.stroke();
    } else if (tierSt.outline) {
      ctx.fillStyle = rgba(accent, 0.1);
      ctx.fill();
      ctx.shadowBlur = 0;
      roundRect(ctx, x, y, nodeW, nodeH, unit * 0.35);
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.07;
      ctx.stroke();
    } else {
      ctx.fillStyle = tierSt.fill;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Icon (optional) to the left of the label; label fit + wrap to 2 lines.
    let textCX = c.x;
    let textMaxW = nodeW - unit * 0.9;
    if (n.icon) {
      const iconS = nodeH * 0.58;
      const iconColor = tint ?? (tierSt.outline ? accent : tierSt.text);
      if (isVectorIcon(n.icon)) drawIcon(ctx, n.icon, x + unit * 0.45 + iconS / 2, c.y, iconS, env, iconColor);
      else {
        ctx.font = `${iconS}px ${FONT_SANS}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = iconColor;
        ctx.fillText(n.icon, x + unit * 0.45 + iconS / 2, c.y);
      }
      textCX = x + unit * 0.55 + iconS + (nodeW - (unit * 0.55 + iconS)) / 2 - unit * 0.15;
      textMaxW = nodeW - iconS - unit * 1.2;
    }
    const px = fitFontSize(ctx, n.label, { maxW: textMaxW, startPx: unit * 0.8, minPx: unit * 0.5, weight: 700 });
    ctx.font = `700 ${px}px ${FONT_SANS}`;
    ctx.fillStyle = tint ? THEME.text : tierSt.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapText(ctx, n.label, textMaxW).slice(0, 2);
    const lh = px * 1.14;
    lines.forEach((ln, li) => ctx.fillText(ln, textCX, c.y - ((lines.length - 1) * lh) / 2 + li * lh));

    // Diff badge (+/-/~) pinned to the top-right corner while this beat's change is live.
    const badge = badgeOf(n.id);
    if (badge) {
      const bs = unit * 0.6;
      const bx = x + nodeW - bs * 0.5;
      const by = y - bs * 0.15;
      ctx.beginPath();
      ctx.arc(bx, by, bs / 2, 0, Math.PI * 2);
      ctx.fillStyle = tint ?? accent;
      ctx.fill();
      ctx.font = `800 ${bs * 0.68}px ${FONT_MONO}`;
      ctx.fillStyle = INK_ON_ACCENT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badge, bx, by + bs * 0.02);
    }
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/** Walk up from `to` until `from` is hit (assumes `from` is an ancestor); returns
 *  the downward path [from, ..., to], or null if `from` isn't on `to`'s ancestor chain. */
function ancestorPath(byId: Map<string, { id: string; parent?: string | null }>, fromId: string, toId: string): string[] | null {
  const chain: string[] = [];
  let cur = byId.get(toId);
  let guard = 0;
  while (cur && guard++ < 24) {
    chain.push(cur.id);
    if (cur.id === fromId) {
      chain.reverse();
      return chain;
    }
    cur = cur.parent != null ? byId.get(cur.parent) : undefined;
  }
  return null;
}

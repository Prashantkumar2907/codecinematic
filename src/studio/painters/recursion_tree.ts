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
  roundRect,
  drawSceneTitle,
  fitFontSize,
  wrapText,
  roundedCorners,
  strokePolylineProgress,
  drawArrowhead,
  flowDots,
  glowRing,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type RecursionTreeScene = Extract<Scene, { kind: "recursion_tree" }>;
type RNode = RecursionTreeScene["nodes"][number];
type Pt = { x: number; y: number };
type NodeState = "pruned" | "accepted" | "active" | "onstack" | "closed";
type Frame = { id: string; alpha: number; popping: boolean };

/** Universal fail/prune red — not subject-tinted, same convention as server_rack's CRASH const. */
const PRUNE_RED = "#ef4444";
const STACK_LABEL_MAX = 10;

/** Points along a quadratic bezier, for the curved "call returns" arrow. */
function quadPoints(p0: Pt, c: Pt, p1: Pt, n = 14): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y });
  }
  return pts;
}

/**
 * A backtracking recursion/DFS tree that grows and shrinks with the call
 * stack: nodes pop in as `expand` fires (a recursive call is made), failed
 * branches get a red X and fade on `prune` (fail fast, no children explored),
 * a full valid leaf gets a green check on `accept`, and a curved return arrow
 * plus a literal call-stack panel show the unwind on `backtrack` (the call
 * returns to its parent). `accept` is a separate author-controlled event
 * (not inferred from "no children") because a dead-end leaf in general
 * backtracking is common and must NOT read as a found solution. Tree layout
 * is the tidy parent-pointer auto-layout from tree.ts; the call-stack panel
 * is new — it slots one frame per recursion depth so the current path reads
 * as a real stack, not just a highlighted tree branch.
 */
export function paintRecursionTree(ctx: CanvasRenderingContext2D, scene: RecursionTreeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, h } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.5;

  // ---- structure: parent pointers -> children map, tidy column layout -------
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const childIds = new Map<string, string[]>();
  scene.nodes.forEach((n) => {
    if (n.parent == null) return;
    childIds.set(n.parent, [...(childIds.get(n.parent) ?? []), n.id]);
  });
  const childrenOf = (id: string) => childIds.get(id) ?? [];
  const root = scene.nodes.find((n) => n.parent == null) ?? scene.nodes[0];
  const depthOf = (n: RNode): number => {
    let d = 0;
    let cur: RNode | undefined = n;
    while (cur && cur.parent != null) {
      cur = byId.get(cur.parent);
      d++;
      if (d > 20) break;
    }
    return d;
  };

  const gx = new Map<string, number>();
  let leafCol = 0;
  const place = (id: string) => {
    const kids = childrenOf(id);
    if (!kids.length) {
      gx.set(id, leafCol++);
      return;
    }
    kids.forEach(place);
    const xs = kids.map((k) => gx.get(k)!);
    gx.set(id, (Math.min(...xs) + Math.max(...xs)) / 2);
  };
  place(root.id);
  const maxCol = Math.max(1, leafCol - 1);
  const maxDepth = Math.max(1, ...scene.nodes.map(depthOf));

  // ---- event timing: first step each id appears in expand/prune/accept/backtrack ----
  const expandStepOf = new Map<string, number>();
  const pruneStepOf = new Map<string, number>();
  const acceptStepOf = new Map<string, number>();
  const backtrackStepOf = new Map<string, number>();
  scene.steps.forEach((st, k) => {
    st.expand.forEach((id) => { if (!expandStepOf.has(id)) expandStepOf.set(id, k); });
    st.prune.forEach((id) => { if (!pruneStepOf.has(id)) pruneStepOf.set(id, k); });
    st.accept.forEach((id) => { if (!acceptStepOf.has(id)) acceptStepOf.set(id, k); });
    st.backtrack.forEach((id) => { if (!backtrackStepOf.has(id)) backtrackStepOf.set(id, k); });
  });
  // A pruned call also unwinds immediately (fail-fast) even if not separately listed as a backtrack.
  const closedStepOf = (id: string): number | undefined => {
    const a = backtrackStepOf.get(id);
    const b = pruneStepOf.get(id);
    if (a == null) return b;
    if (b == null) return a;
    return Math.min(a, b);
  };

  const progressAt = (k: number | undefined, rate = 1.4): number => {
    if (k == null) return 0;
    if (activeStep < k) return 0;
    if (activeStep > k) return 1;
    return clamp01(beatT(env.beats, offset + k, totalBeats, env.p) * rate);
  };
  const appearOf = (id: string) => easeOutCubic(progressAt(expandStepOf.get(id) ?? 0, 1.6));
  const pruneOf = (id: string) => progressAt(pruneStepOf.get(id));
  const acceptOf = (id: string) => progressAt(acceptStepOf.get(id));
  const closedOf = (id: string) => progressAt(closedStepOf(id));

  // ---- call stack: root always on it; expand pushes, prune/backtrack pop ----
  const stackAt = (uptoStep: number): string[] => {
    const stack: string[] = [root.id];
    for (let k = 0; k <= uptoStep; k++) {
      const st = scene.steps[k];
      if (!st) break;
      st.expand.forEach((id) => { if (!stack.includes(id)) stack.push(id); });
      const closed = new Set([...st.backtrack, ...st.prune]);
      for (let i = stack.length - 1; i >= 0; i--) if (closed.has(stack[i])) stack.splice(i, 1);
    }
    return stack;
  };
  const currStack = activeStep >= 0 ? stackAt(activeStep) : [];
  const prevStack = activeStep >= 1 ? stackAt(activeStep - 1) : [];
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const activeTopId = currStack[currStack.length - 1];

  const stateOf = (id: string): NodeState => {
    if (pruneOf(id) > 0) return "pruned";
    if (acceptOf(id) > 0) return "accepted";
    if (id === activeTopId) return "active";
    if (currStack.includes(id)) return "onstack";
    return "closed";
  };

  // ---- geometry: tree area + a call-stack panel alongside it -----------------
  const panelW = vertical ? contentW : Math.min(contentW * 0.24, unit * 4.6);
  const panelH = vertical ? Math.min(contentH * 0.2, unit * 3.0) : contentH - band;
  const treeX = contentX;
  const treeY = contentY + band;
  const treeW = vertical ? contentW : contentW - panelW - unit * 0.9;
  let treeH = vertical ? contentH - band - panelH - unit * 1.1 : contentH - band;
  if (vertical) treeH = Math.min(treeH, h * 0.88 - treeY);

  const cols = maxCol + 1;
  const nodeW = Math.min((treeW / cols) * 0.82, unit * 4.0);
  const nodeH = Math.min(unit * 1.6, (treeH / (maxDepth + 1)) * 0.58);
  const levelGap = (treeH - nodeH) / Math.max(1, maxDepth);
  const centerOf = (n: RNode): Pt => ({
    x: treeX + nodeW / 2 + (gx.get(n.id)! / maxCol) * (treeW - nodeW),
    y: treeY + nodeH / 2 + depthOf(n) * levelGap,
  });

  // ---- base connectors (draw on as the child appears) ------------------------
  for (const n of scene.nodes) {
    if (n.parent == null) continue;
    const parent = byId.get(n.parent);
    if (!parent) continue;
    const ap = appearOf(n.id);
    if (ap <= 0) continue;
    const pc = centerOf(parent);
    const cc = centerOf(n);
    const from = { x: pc.x, y: pc.y + nodeH / 2 };
    const to = { x: cc.x, y: cc.y - nodeH / 2 };
    const midY = (from.y + to.y) / 2;
    const pts = roundedCorners([from, { x: from.x, y: midY }, { x: to.x, y: midY }, to], Math.min(unit * 0.45, levelGap * 0.35));
    const closed = closedOf(n.id);
    ctx.save();
    ctx.globalAlpha = introIn * (1 - closed * 0.55);
    ctx.strokeStyle =
      pruneOf(n.id) > 0 ? rgba(PRUNE_RED, 0.7) : acceptOf(n.id) > 0 ? rgba(THEME.good, 0.6) : rgba(THEME.textDim, 0.8);
    ctx.lineWidth = unit * 0.06;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokePolylineProgress(ctx, pts, clamp01(ap * 1.2));
    ctx.restore();
  }

  // ---- active-path highlight: the branch currently being explored -----------
  for (let i = 0; i < currStack.length - 1; i++) {
    const a = byId.get(currStack[i]);
    const b = byId.get(currStack[i + 1]);
    if (!a || !b) continue;
    const pa = centerOf(a);
    const pb = centerOf(b);
    const from = { x: pa.x, y: pa.y + nodeH / 2 };
    const to = { x: pb.x, y: pb.y - nodeH / 2 };
    const midY = (from.y + to.y) / 2;
    const pts = roundedCorners([from, { x: from.x, y: midY }, { x: to.x, y: midY }, to], Math.min(unit * 0.45, levelGap * 0.35));
    ctx.save();
    ctx.globalAlpha = introIn * 0.85;
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.09;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.5;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
    flowDots(ctx, [from, to], env, { count: 2, speedMs: 1100, r: unit * 0.11, color: accent });
  }

  // ---- backtrack unwind: a curved return arrow child -> parent this beat ----
  for (const n of scene.nodes) {
    if (closedStepOf(n.id) !== activeStep || n.parent == null) continue;
    const parent = byId.get(n.parent);
    if (!parent) continue;
    const t = clamp01(stepT * 1.3);
    if (t <= 0) continue;
    const cc = centerOf(n);
    const pc = centerOf(parent);
    const bulge = unit * 1.4;
    const start = { x: cc.x + nodeW * 0.52, y: cc.y };
    const end = { x: pc.x + nodeW * 0.52, y: pc.y };
    const ctrl = { x: Math.max(start.x, end.x) + bulge, y: (start.y + end.y) / 2 };
    const pts = quadPoints(start, ctrl, end, 16);
    const isPrune = pruneOf(n.id) > 0;
    const col = isPrune ? PRUNE_RED : secondary;
    ctx.save();
    ctx.globalAlpha = introIn * easeOutCubic(t);
    ctx.strokeStyle = col;
    ctx.lineWidth = unit * 0.08;
    ctx.lineCap = "round";
    ctx.shadowColor = rgba(col, 0.55);
    ctx.shadowBlur = unit * 0.5;
    const tip = strokePolylineProgress(ctx, pts, clamp01(t * 1.15));
    ctx.shadowBlur = 0;
    if (t > 0.7) {
      ctx.fillStyle = col;
      drawArrowhead(ctx, tip.x, tip.y, tip.angle, unit * 0.3);
    }
    ctx.restore();
  }

  // ---- nodes ------------------------------------------------------------------
  for (const n of scene.nodes) {
    const ap = appearOf(n.id);
    if (ap <= 0) continue;
    const c = centerOf(n);
    const prune = pruneOf(n.id);
    const accept = acceptOf(n.id);
    const state = stateOf(n.id);
    const pop = easeOutBack(clamp01(ap * 1.3));
    const scale = 0.72 + 0.28 * pop;
    const w = nodeW * scale;
    const hgt = nodeH * scale;
    const x = c.x - w / 2;
    const y = c.y - hgt / 2;

    const style =
      state === "pruned"
        ? { fill: rgba(PRUNE_RED, 0.14), border: PRUNE_RED, text: THEME.textDim }
        : state === "accepted"
        ? { fill: rgba(THEME.good, 0.18), border: THEME.good, text: THEME.text }
        : state === "active"
        ? { fill: rgba(accent, 0.24), border: accent, text: THEME.text }
        : state === "onstack"
        ? { fill: rgba(accent, 0.1), border: rgba(accent, 0.55), text: THEME.text }
        : { fill: THEME.panel, border: rgba(THEME.textDim, 0.35), text: THEME.textDim };

    const settledAlpha = state === "pruned" ? 0.45 + 0.5 * prune : state === "closed" ? 0.8 : 1;
    ctx.save();
    ctx.globalAlpha = introIn * clamp01(ap * 1.4) * settledAlpha;
    if (state === "active") {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * (0.5 + 0.3 * idle(env, 1400));
    } else if (state === "accepted") {
      ctx.shadowColor = rgba(THEME.good, 0.4);
      ctx.shadowBlur = unit * 0.5;
    }
    roundRect(ctx, x, y, w, hgt, unit * 0.32);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, x, y, w, hgt, unit * 0.32);
    ctx.strokeStyle = style.border;
    ctx.lineWidth = unit * (state === "active" || state === "accepted" ? 0.11 : 0.07);
    ctx.stroke();

    const px = fitFontSize(ctx, n.label, { maxW: w * 0.86, startPx: unit * 0.7, minPx: unit * 0.44, weight: 700, family: FONT_MONO });
    ctx.font = `700 ${px}px ${FONT_MONO}`;
    ctx.fillStyle = style.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapText(ctx, n.label, w * 0.86).slice(0, 2);
    const lh = px * 1.15;
    lines.forEach((ln, li) => ctx.fillText(ln, c.x, c.y - ((lines.length - 1) * lh) / 2 + li * lh));

    if (prune > 0) {
      const xt = easeOutCubic(prune);
      ctx.save();
      ctx.globalAlpha = introIn * clamp01(ap * 1.4) * xt;
      ctx.strokeStyle = PRUNE_RED;
      ctx.lineWidth = unit * 0.13;
      ctx.lineCap = "round";
      const pad = w * 0.22;
      ctx.beginPath();
      ctx.moveTo(x + pad, y + pad);
      ctx.lineTo(x + w - pad, y + hgt - pad);
      ctx.moveTo(x + w - pad, y + pad);
      ctx.lineTo(x + pad, y + hgt - pad);
      ctx.stroke();
      ctx.restore();
    }
    if (accept > 0) {
      const at = easeOutCubic(accept);
      const g = 0.6 + 0.4 * idle(env, 1700);
      ctx.save();
      ctx.globalAlpha = introIn * at * g;
      ctx.fillStyle = THEME.good;
      ctx.beginPath();
      ctx.arc(x + w - unit * 0.3, y + unit * 0.3, unit * 0.26 * at, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#06210f";
      ctx.lineWidth = unit * 0.06;
      ctx.beginPath();
      ctx.moveTo(x + w - unit * 0.41, y + unit * 0.31);
      ctx.lineTo(x + w - unit * 0.32, y + unit * 0.4);
      ctx.lineTo(x + w - unit * 0.19, y + unit * 0.21);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // glowRing grows its radius up to 2.5x over its cycle, so a base radius
    // scaled to the FULL card size (as opposed to half) ballooned the ring
    // far past the card — enough to swallow the scene title when the active
    // node sits near the top of the tree. A modest base keeps the halo close.
    if (state === "active") glowRing(ctx, c.x, c.y, Math.max(w, hgt) * 0.34, accent, env, 1500);
  }

  // ---- call-stack panel: one slot per recursion depth, frames pop in/out ----
  const frameAt = (d: number): Frame | null => {
    const curId = currStack.find((id) => depthOf(byId.get(id)!) === d);
    const prevId = prevStack.find((id) => depthOf(byId.get(id)!) === d);
    if (curId) return { id: curId, alpha: curId === prevId ? 1 : easeOutCubic(clamp01(stepT * 1.4)), popping: false };
    if (prevId) return { id: prevId, alpha: 1 - easeOutCubic(clamp01(stepT * 1.4)), popping: true };
    return null;
  };
  const drawFrame = (fx: number, fy: number, fw: number, fh: number, frame: Frame) => {
    const node = byId.get(frame.id);
    if (!node) return;
    const top = frame.id === activeTopId && !frame.popping;
    ctx.save();
    ctx.globalAlpha = introIn * frame.alpha;
    if (top) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.55;
    }
    roundRect(ctx, fx, fy, fw, fh, unit * 0.2);
    ctx.fillStyle = top ? rgba(accent, 0.22) : rgba(accent, 0.09);
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, fx, fy, fw, fh, unit * 0.2);
    ctx.strokeStyle = top ? accent : rgba(accent, 0.4);
    ctx.lineWidth = unit * (top ? 0.08 : 0.05);
    ctx.stroke();
    const label = node.label.length > STACK_LABEL_MAX ? node.label.slice(0, STACK_LABEL_MAX - 1) + "…" : node.label;
    const px = fitFontSize(ctx, label, { maxW: fw * 0.84, startPx: unit * 0.52, minPx: unit * 0.32, weight: 700, family: FONT_MONO });
    ctx.font = `700 ${px}px ${FONT_MONO}`;
    ctx.fillStyle = top ? THEME.text : THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, fx + fw / 2, fy + fh / 2);
    ctx.restore();
  };

  const slots = maxDepth + 1;
  ctx.save();
  ctx.globalAlpha = introIn * 0.8;
  ctx.font = `700 ${unit * 0.48}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = vertical ? "start" : "center";
  if (vertical) ctx.fillText("CALL STACK", treeX, treeY + treeH + unit * 0.55);
  else ctx.fillText("CALL STACK", treeX + treeW + unit * 0.9 + panelW / 2, treeY - unit * 0.3);
  ctx.restore();

  if (!vertical) {
    const panelX = treeX + treeW + unit * 0.9;
    const frameH = Math.min((panelH / slots) * 0.7, unit * 1.15);
    const frameGap = slots > 1 ? (panelH - frameH * slots) / (slots - 1) : 0;
    for (let d = 0; d < slots; d++) {
      const frame = frameAt(d);
      if (!frame) continue;
      const fy = treeY + panelH - (d + 1) * frameH - d * frameGap;
      drawFrame(panelX, fy, panelW, frameH, frame);
    }
  } else {
    const panelY = treeY + treeH + unit * 0.85;
    const frameW = Math.min((contentW / slots) * 0.72, unit * 2.1);
    const frameGap = slots > 1 ? (contentW - frameW * slots) / (slots - 1) : 0;
    for (let d = 0; d < slots; d++) {
      const frame = frameAt(d);
      if (!frame) continue;
      const fx = treeX + d * (frameW + frameGap);
      drawFrame(fx, panelY, frameW, Math.min(panelH, unit * 1.5), frame);
    }
  }

  // ---- per-beat note caption (why a branch was pruned, etc.) ----------------
  const note = activeStep >= 0 ? scene.steps[activeStep]?.note : undefined;
  if (note) {
    const noteIn = easeOutCubic(clamp01(stepT * 2));
    ctx.save();
    ctx.globalAlpha = introIn * noteIn * 0.9;
    ctx.font = `600 ${unit * 0.5}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const capY = vertical ? treeY + treeH + unit * 0.4 : contentY + contentH - unit * 0.15;
    ctx.fillText(note, treeX + treeW / 2, capY);
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

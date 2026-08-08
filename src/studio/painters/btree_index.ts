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
  idle,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  drawArrowhead,
  pointAlongPolyline,
  roundedCorners,
  flowDots,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type BtreeScene = Extract<Scene, { kind: "btree_index" }>;
type BNode = BtreeScene["nodes"][number];
type Pt = { x: number; y: number };

/** Sequential-reveal timing: the i-th of `n` items starts at i*gap and takes ~2.2*gap. */
function cascade(stepT: number, i: number, n: number): number {
  const gap = Math.min(0.22, 0.82 / Math.max(1, n));
  return easeOutCubic(clamp01((stepT - i * gap) / (gap * 2.2)));
}

/**
 * A B-Tree / B+Tree index: multi-key nodes (root -> internal -> leaves) laid
 * out with the same tidy parent-over-children placement as tree.ts, but each
 * node is a mini row of key cells instead of a single label. Leaf nodes are
 * additionally linked left-to-right with arrows (the B+Tree leaf chain).
 * Steps are either a "descend" (root->leaf lookup path lights up node by node,
 * with a token riding the connectors and the matched key glowing at the end)
 * or a "scan" (a run of leaves sweeps highlighted while flow-dots ride the
 * chain arrows) — covering lookup tracing AND range-scan explainers with one
 * data-driven primitive.
 */
export function paintBtreeIndex(ctx: CanvasRenderingContext2D, scene: BtreeScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical, safeBottom } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const leave = departT(env, 380);
  if (leave <= 0) return;
  const introIn = easeOutCubic(enterT(env, 380)) * leave;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.5;

  // --- structure -----------------------------------------------------------
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  const childrenOf = (pid: string | null) => scene.nodes.filter((n) => (n.parent ?? null) === pid);
  const root = scene.nodes.find((n) => n.parent == null) ?? scene.nodes[0];
  const isLeafNode = (n: BNode) => n.leaf || childrenOf(n.id).length === 0;
  const depthOf = (n: BNode): number => {
    let d = 0;
    let cur: BNode | undefined = n;
    while (cur && cur.parent != null) {
      cur = byId.get(cur.parent);
      d++;
      if (d > 20) break;
    }
    return d;
  };
  const pathToRoot = (id: string): BNode[] => {
    const path: BNode[] = [];
    let cur = byId.get(id);
    while (cur) {
      path.unshift(cur);
      cur = cur.parent != null ? byId.get(cur.parent) : undefined;
    }
    return path;
  };

  // Tidy layout: leaves get sequential columns, parents centre over children.
  const gx = new Map<string, number>();
  let leafCol = 0;
  const place = (n: BNode) => {
    const kids = childrenOf(n.id);
    if (!kids.length) {
      gx.set(n.id, leafCol++);
      return;
    }
    kids.forEach(place);
    const xs = kids.map((k) => gx.get(k.id)!);
    gx.set(n.id, (Math.min(...xs) + Math.max(...xs)) / 2);
  };
  place(root);
  const maxCol = Math.max(1, leafCol - 1);
  const maxDepth = Math.max(1, ...scene.nodes.map(depthOf));

  // Leaf chain order: explicit scene.leafChain, else left-to-right by column.
  const leaves = scene.nodes.filter(isLeafNode).slice().sort((a, b) => gx.get(a.id)! - gx.get(b.id)!);
  const chainIds = scene.leafChain.length ? scene.leafChain.filter((id) => byId.has(id)) : leaves.map((n) => n.id);

  // --- geometry --------------------------------------------------------------
  const areaX = contentX;
  const areaY = contentY + band;
  const areaW = contentW;
  const areaH = Math.min(contentY + contentH, safeBottom) - unit * 0.3 - areaY;

  const cols = maxCol + 1;
  const colGap = areaW / cols;
  const maxKeysAny = Math.max(1, ...scene.nodes.map((n) => n.keys.length));
  const cellW = Math.min(unit * 1.25, (colGap * 0.86) / maxKeysAny);
  const padX = unit * 0.34;
  const nodeWFor = (n: BNode) => Math.min(colGap * 0.92, n.keys.length * cellW + padX * 2);
  const baseNodeW = Math.max(unit * 3, ...scene.nodes.map((n) => nodeWFor(n)));
  const nodeH = Math.min(unit * 2.0, (areaH / (maxDepth + 1)) * 0.58);
  const levelGap = (areaH - nodeH) / Math.max(1, maxDepth);

  const center = (n: BNode): Pt => ({
    x: areaX + baseNodeW / 2 + (gx.get(n.id)! / maxCol) * (areaW - baseNodeW),
    y: areaY + nodeH / 2 + depthOf(n) * levelGap,
  });

  // Per-child pointer slot: children spread evenly along the parent's bottom edge.
  const pointerX = (parent: BNode, child: BNode): number => {
    const kids = childrenOf(parent.id).slice().sort((a, b) => gx.get(a.id)! - gx.get(b.id)!);
    const i = Math.max(0, kids.findIndex((k) => k.id === child.id));
    const w = nodeWFor(parent);
    const pc = center(parent);
    return pc.x - w / 2 + ((i + 0.5) / Math.max(1, kids.length)) * w;
  };

  // Entrance: nodes pop in staggered by depth so the whole shape reads fast.
  const nodeIn = (n: BNode) => easeOutBack(clamp01(enterT(env, 420, 90 + depthOf(n) * 120)));

  // --- replay steps to build settled (fully completed) highlight state -------
  const settledNodes = new Set<string>();
  const settledLeaves = new Set<string>();
  const settledSegs = new Set<string>(); // `${fromLeaf}->${toLeaf}` chain segments
  for (let k = 0; k < Math.max(0, activeStep); k++) {
    const st = scene.steps[k];
    if (st.mode === "scan") {
      const startIdx = chainIds.indexOf(st.target);
      if (startIdx >= 0) {
        for (let i = 0; i < st.scanCount && startIdx + i < chainIds.length; i++) {
          settledLeaves.add(chainIds[startIdx + i]);
          if (i > 0) settledSegs.add(`${chainIds[startIdx + i - 1]}->${chainIds[startIdx + i]}`);
        }
      }
    } else {
      pathToRoot(st.target).forEach((n) => settledNodes.add(n.id));
    }
  }

  const step = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  // Live (this-beat) highlight amounts, keyed by node id / leaf pair.
  const activeNodeLocal = new Map<string, number>();
  const activeSegLocal = new Map<string, number>();
  let matchedNodeId: string | undefined;
  let matchedKeyIdx = -1;
  let travelPts: Pt[] | undefined;
  let travelLocal = 0;

  if (step) {
    if (step.mode === "descend") {
      const path = pathToRoot(step.target);
      path.forEach((n, i) => activeNodeLocal.set(n.id, cascade(stepT, i, path.length)));
      if (path.length > 1) {
        const segIdx = clamp01(stepT) * (path.length - 1);
        const segI = Math.min(path.length - 2, Math.floor(segIdx));
        const a = pointerX(path[segI], path[segI + 1]);
        const from = { x: a, y: center(path[segI]).y + nodeH / 2 };
        const to = { x: center(path[segI + 1]).x, y: center(path[segI + 1]).y - nodeH / 2 };
        travelPts = [from, to];
        travelLocal = clamp01(segIdx - segI);
      }
      const targetNode = byId.get(step.target);
      const last = path.length ? cascade(stepT, path.length - 1, path.length) : 0;
      if (targetNode && last > 0.6) {
        matchedNodeId = step.target;
        matchedKeyIdx = Math.min(step.keyIndex, targetNode.keys.length - 1);
      }
    } else {
      const startIdx = chainIds.indexOf(step.target);
      if (startIdx >= 0) {
        const n = Math.min(step.scanCount, chainIds.length - startIdx);
        for (let i = 0; i < n; i++) {
          const local = cascade(stepT, i, n);
          activeNodeLocal.set(chainIds[startIdx + i], local);
          if (i > 0) activeSegLocal.set(`${chainIds[startIdx + i - 1]}->${chainIds[startIdx + i]}`, local);
        }
        if (n > 0) {
          matchedNodeId = step.target;
          matchedKeyIdx = Math.min(step.keyIndex, byId.get(step.target)!.keys.length - 1);
        }
      }
    }
  }

  const highlightOf = (id: string) => Math.max(settledNodes.has(id) || settledLeaves.has(id) ? 0.65 : 0, activeNodeLocal.get(id) ?? 0);
  const segHighlightOf = (a: string, b: string) => Math.max(settledSegs.has(`${a}->${b}`) ? 0.6 : 0, activeSegLocal.get(`${a}->${b}`) ?? 0);

  // --- parent -> child connectors (structural, brighten when on a path) ------
  for (const n of scene.nodes) {
    if (n.parent == null) continue;
    const parent = byId.get(n.parent);
    if (!parent) continue;
    const inp = Math.min(nodeIn(n), nodeIn(parent));
    if (inp <= 0) continue;
    const px = pointerX(parent, n);
    const from = { x: px, y: center(parent).y + nodeH / 2 };
    const to = { x: center(n).x, y: center(n).y - nodeH / 2 };
    const midY = (from.y + to.y) / 2;
    const pts = roundedCorners([from, { x: from.x, y: midY }, { x: to.x, y: midY }, to], Math.min(unit * 0.6, levelGap * 0.35));
    const hl = highlightOf(n.id);
    ctx.save();
    ctx.globalAlpha = introIn * inp * (0.32 + 0.5 * hl);
    ctx.strokeStyle = hl > 0.1 ? accent : rgba(THEME.textDim, 0.7);
    ctx.lineWidth = unit * (0.06 + 0.05 * hl);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = introIn * inp * 0.9;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(px, from.y, unit * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Traveling token descending the active connector segment.
  if (travelPts) {
    const pt = pointAlongPolyline(travelPts, travelLocal);
    ctx.save();
    ctx.globalAlpha = introIn;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.9;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, unit * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- leaf chain arrows (always present, brighten during a scan) -----------
  for (let i = 1; i < chainIds.length; i++) {
    const a = byId.get(chainIds[i - 1]);
    const b = byId.get(chainIds[i]);
    if (!a || !b) continue;
    const inp = Math.min(nodeIn(a), nodeIn(b));
    if (inp <= 0) continue;
    const ca = center(a);
    const cb = center(b);
    const y = ca.y;
    const from = { x: ca.x + nodeWFor(a) / 2, y };
    const to = { x: cb.x - nodeWFor(b) / 2, y };
    const hl = segHighlightOf(a.id, b.id);
    ctx.save();
    ctx.globalAlpha = introIn * inp * (0.35 + 0.5 * hl);
    ctx.strokeStyle = hl > 0.1 ? secondary : rgba(THEME.textDim, 0.55);
    ctx.lineWidth = unit * (0.055 + 0.05 * hl);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.fillStyle = hl > 0.1 ? secondary : rgba(THEME.textDim, 0.55);
    drawArrowhead(ctx, to.x, to.y, 0, unit * 0.22);
    ctx.restore();
    if (hl > 0.15) flowDots(ctx, [from, to], env, { count: 2, speedMs: 1100, r: unit * 0.13, color: secondary });
  }

  // --- nodes -----------------------------------------------------------------
  for (const n of scene.nodes) {
    const inp = nodeIn(n);
    if (inp <= 0) continue;
    const leaf = isLeafNode(n);
    const d = depthOf(n);
    const hl = highlightOf(n.id);
    const c = center(n);
    const w = nodeWFor(n);
    const hgt = nodeH;
    const x = c.x - w / 2;
    const y = c.y - hgt / 2;
    const isRoot = d === 0;
    const face = isRoot ? secondary : accent;

    ctx.save();
    ctx.globalAlpha = clamp01(inp * 1.3) * leave;
    ctx.translate(c.x, c.y);
    // A small always-on idle breathing on every node (phase-offset per node)
    // keeps the whole tree visibly alive during the intro beat, before any
    // step highlights a path (2/5, dead 24-25% without it).
    const pop = (0.92 + 0.08 * inp) * (1 + 0.012 * idle(env, 1700, d * 0.5 + gx.get(n.id)! * 0.3));
    ctx.scale(pop, pop);
    ctx.translate(-c.x, -c.y);

    const breathe = hl > 0.75 ? 0.7 + 0.3 * idle(env, 1500) : 1;
    if (hl > 0.1) {
      ctx.shadowColor = rgba(accent, 0.55 * breathe);
      ctx.shadowBlur = unit * (0.5 + 0.6 * hl);
    }
    roundRect(ctx, x, y, w, hgt, unit * 0.32);
    if (leaf) {
      ctx.fillStyle = rgba(face, 0.14 + 0.12 * hl);
      ctx.fill();
    } else {
      const g = ctx.createLinearGradient(0, y, 0, y + hgt);
      g.addColorStop(0, rgba(face, isRoot ? 0.32 : 0.1));
      g.addColorStop(1, rgba(face, isRoot ? 0.2 : 0.05));
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    roundRect(ctx, x, y, w, hgt, unit * 0.32);
    ctx.strokeStyle = hl > 0.1 ? accent : rgba(face, 0.6);
    ctx.lineWidth = unit * (hl > 0.1 ? 0.11 : 0.07);
    ctx.stroke();

    // Key cells.
    const kw = w / n.keys.length;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w, hgt, unit * 0.32);
    ctx.clip();
    for (let i = 1; i < n.keys.length; i++) {
      ctx.strokeStyle = rgba(THEME.text, 0.16);
      ctx.lineWidth = unit * 0.035;
      ctx.beginPath();
      ctx.moveTo(x + i * kw, y + hgt * 0.14);
      ctx.lineTo(x + i * kw, y + hgt * 0.86);
      ctx.stroke();
    }
    ctx.restore();

    n.keys.forEach((key, i) => {
      const kx = x + i * kw + kw / 2;
      const isMatched = n.id === matchedNodeId && i === matchedKeyIdx;
      if (isMatched) {
        const g2 = 0.6 + 0.4 * idle(env, 900);
        ctx.save();
        ctx.globalAlpha = g2 * clamp01(inp * 1.3) * leave;
        ctx.fillStyle = rgba(accent, 0.42);
        roundRect(ctx, x + i * kw + kw * 0.08, y + hgt * 0.14, kw * 0.84, hgt * 0.72, unit * 0.16);
        ctx.fill();
        ctx.restore();
      }
      const fontPx = fitFontSize(ctx, key, {
        maxW: kw * 0.82,
        startPx: hgt * 0.4,
        minPx: unit * 0.42,
        weight: 800,
        family: FONT_MONO,
      });
      ctx.font = `800 ${fontPx}px ${FONT_MONO}`;
      ctx.fillStyle = THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(key, kx, c.y);
    });

    // Leaf/index badge tag above the node.
    ctx.font = `700 ${unit * 0.42}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textFaint;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(isRoot ? "ROOT" : leaf ? "LEAF" : "INDEX", c.x, y - unit * 0.18);

    if (hl > 0.75) {
      ctx.globalAlpha = clamp01(inp) * (1 - 0.5 * (1 - breathe)) * leave;
      ctx.strokeStyle = accent;
      ctx.lineWidth = unit * 0.06;
      roundRect(ctx, x - unit * 0.16, y - unit * 0.16, w + unit * 0.32, hgt + unit * 0.32, unit * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

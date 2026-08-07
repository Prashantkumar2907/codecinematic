import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  strokePolylineProgress,
  pointAlongPolyline,
  glowRing,
  rgba,
  hashStr,
} from "./common";
import type { PaintEnv } from "./index";

type CommitDagScene = Extract<Scene, { kind: "commit_dag" }>;
type Pt = { x: number; y: number };
type RefState = { at: string };
type Chip = { label: string; role: "ref" | "head-attached" | "head-detached" };

/** Perpendicular stack offset per chip level, above the commit dot it names. */
const CHIP_GAP_UNIT = 0.92;
/** Reserved band above the lane grid for stacked ref/HEAD chips + the note badge. */
const CHIP_MARGIN_UNIT = 3.2;

function sampleBezier(a: Pt, b: Pt, c1: Pt, c2: Pt, n = 14): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return pts;
}

/** Straight when parent/child share a lane; a git-log-style S-curve otherwise. */
function edgePoints(a: Pt, b: Pt, vertical: boolean): Pt[] {
  if (vertical) {
    if (Math.abs(a.x - b.x) < 1) return [a, b];
    const midY = (a.y + b.y) / 2;
    return sampleBezier(a, b, { x: a.x, y: midY }, { x: b.x, y: midY });
  }
  if (Math.abs(a.y - b.y) < 1) return [a, b];
  const midX = (a.x + b.x) / 2;
  return sampleBezier(a, b, { x: midX, y: a.y }, { x: midX, y: b.y });
}

function strokePts(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, lw: number, alpha: number, dashed: boolean) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (dashed) ctx.setLineDash([lw * 2.2, lw * 1.7]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);
  ctx.restore();
}

/** Deterministic accent/secondary split so distinct branch names read as distinct colours. */
function refColor(name: string, accent: string, secondary: string): string {
  return hashStr(name) % 2 === 0 ? accent : secondary;
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  text: string,
  unit: number,
  fill: string,
  alpha: number,
  scale: number,
  bold: boolean
) {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.font = `${bold ? 800 : 700} ${unit * 0.5}px ${FONT_SANS}`;
  const tw = ctx.measureText(text).width;
  const w = tw + unit * 0.7;
  const h = unit * 0.92;
  if (bold) {
    ctx.shadowColor = rgba(fill, 0.55);
    ctx.shadowBlur = unit * 0.45;
  }
  roundRect(ctx, -w / 2, -h / 2, w, h, unit * 0.22);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#06121a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, unit * 0.02);
  ctx.restore();
}

export function paintCommitDag(ctx: CanvasRenderingContext2D, scene: CommitDagScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentW, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = layout.contentY + band;

  // Commits lay along a single time axis (array order); lanes sit on the
  // perpendicular axis — horizontal timeline in 16:9, vertical in 9:16 (mirrors sysarch's pos()).
  const n = scene.commits.length;
  const idxOf = new Map(scene.commits.map((c, i) => [c.id, i] as const));
  const lanes = Math.max(0, ...scene.commits.map((c) => c.lane)) + 1;
  const chipMargin = unit * CHIP_MARGIN_UNIT;
  const bottom = vertical ? Math.min(layout.contentY + layout.contentH, layout.h * 0.9) : layout.contentY + layout.contentH;
  const areaX = contentX;
  const laneAreaY = areaY + chipMargin;
  const mainLen = vertical ? Math.max(unit * 2, bottom - laneAreaY) : contentW;
  const laneLen = vertical ? contentW : Math.max(unit * 2, bottom - laneAreaY);
  const laneStep = laneLen / (lanes + 1);
  const r = Math.min(unit * 0.5, (mainLen / Math.max(n, 1)) * 0.34, laneStep * 0.32);

  const pos = (ci: number, lane: number): Pt => {
    const t = (ci + 0.5) / n;
    return vertical
      ? { x: areaX + laneStep * (lane + 1), y: laneAreaY + t * mainLen }
      : { x: areaX + t * mainLen, y: laneAreaY + laneStep * (lane + 1) };
  };

  // --- Replay steps 0..activeStep for cumulative state, snapshotting the
  // state just BEFORE the active step so its own moves can be lerped in. ---
  const revealedSet = new Set<string>();
  const revealStepOf = new Map<string, number>();
  const fadeSet = new Set<string>();
  const refs = new Map<string, RefState>();
  const refChangedAt = new Map<string, number>();
  let headTarget: string | undefined;
  let headChangedAt = -1;
  let prevRefsSnapshot: Map<string, RefState> | null = null;
  let prevHeadSnapshot: string | undefined;

  for (let k = 0; k <= activeStep; k++) {
    if (k === activeStep) {
      prevRefsSnapshot = new Map(refs);
      prevHeadSnapshot = headTarget;
    }
    const st = scene.steps[k];
    st.reveal.forEach((rid) => {
      if (!revealStepOf.has(rid)) revealStepOf.set(rid, k);
      revealedSet.add(rid);
    });
    st.fade.forEach((fid) => fadeSet.add(fid));
    if (st.newRef) {
      refs.set(st.newRef.name, { at: st.newRef.at });
      refChangedAt.set(st.newRef.name, k);
    }
    if (st.moveRef) {
      refs.set(st.moveRef.ref, { at: st.moveRef.to });
      refChangedAt.set(st.moveRef.ref, k);
    }
    if (st.head != null) {
      headTarget = st.head;
      headChangedAt = k;
    }
  }
  const currentNote = activeStep >= 0 ? scene.steps[activeStep].note : undefined;
  const headIsRef = headTarget != null && refs.has(headTarget);
  const headCommitId = headTarget == null ? undefined : headIsRef ? refs.get(headTarget)!.at : headTarget;

  // --- Ghost + lit + fading edges (parent -> commit), curved when lanes differ. ---
  scene.commits.forEach((c, ci) => {
    const cp = pos(ci, c.lane);
    c.parents.forEach((pid) => {
      const pi = idxOf.get(pid);
      if (pi == null) return;
      const parent = scene.commits[pi];
      const pp = pos(pi, parent.lane);
      const pts = edgePoints(pp, cp, vertical);
      const bothRevealed = revealedSet.has(c.id) && revealedSet.has(pid);
      const faded = fadeSet.has(c.id) || fadeSet.has(pid);

      strokePts(ctx, pts, rgba(THEME.textDim, 0.9), unit * 0.07, 0.16 * introIn, false);
      if (bothRevealed && !faded) strokePts(ctx, pts, accent, unit * 0.12, 0.75 * introIn, false);
      else if (bothRevealed && faded) strokePts(ctx, pts, rgba(THEME.textDim, 0.75), unit * 0.09, 0.4 * introIn, true);

      if (bothRevealed && revealStepOf.get(c.id) === activeStep) {
        const prog = easeOutCubic(clamp01(stepT * 1.6));
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = unit * 0.16;
        ctx.lineCap = "round";
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.5;
        strokePolylineProgress(ctx, pts, prog);
        ctx.restore();
        const f = prog < 1 ? prog : (env.elapsedMs % 1200) / 1200;
        const dot = pointAlongPolyline(pts, f);
        ctx.save();
        ctx.globalAlpha = prog < 1 ? 1 : 0.85 * Math.sin(Math.PI * f);
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.7;
        ctx.fillStyle = "#eaf6ff";
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, unit * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  });

  // --- Commit dots: faint dashed ghost pre-reveal, pop-in on first reveal, dim once orphaned. ---
  scene.commits.forEach((c, ci) => {
    const cp = pos(ci, c.lane);
    const ghostIn = enterT(env, 260, 60 + ci * 22);
    if (!revealedSet.has(c.id)) {
      if (ghostIn <= 0) return;
      ctx.save();
      ctx.globalAlpha = 0.18 * introIn * easeOutCubic(ghostIn);
      ctx.strokeStyle = rgba(THEME.textDim, 0.9);
      ctx.lineWidth = unit * 0.06;
      ctx.setLineDash([unit * 0.18, unit * 0.16]);
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }
    const isFaded = fadeSet.has(c.id);
    const isHeadCommit = headCommitId === c.id;
    const revStep = revealStepOf.get(c.id) ?? -2;
    const isActiveReveal = revStep === activeStep;
    const local = isActiveReveal ? clamp01(stepT * 1.6) : 1;
    const pop = isActiveReveal ? easeOutBack(local) : 1;

    ctx.save();
    ctx.globalAlpha = introIn * (isFaded ? 0.42 : 1) * (isActiveReveal ? clamp01(local * 1.3) : 1);
    ctx.translate(cp.x, cp.y);
    ctx.scale(pop, pop);
    ctx.translate(-cp.x, -cp.y);

    if (isHeadCommit) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.9;
    }
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isFaded ? rgba(THEME.textDim, 0.16) : rgba(accent, 0.18);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = isFaded ? rgba(THEME.textDim, 0.55) : accent;
    ctx.lineWidth = isHeadCommit ? unit * 0.16 : unit * 0.11;
    ctx.stroke();
    if (c.parents.length === 2) {
      // Merge commit: a second, slightly larger ring reads as "two parents joined here".
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, r * 1.35, 0, Math.PI * 2);
      ctx.strokeStyle = isFaded ? rgba(THEME.textDim, 0.35) : rgba(accent, 0.5);
      ctx.lineWidth = unit * 0.055;
      ctx.stroke();
    }

    const labelPx = fitFontSize(ctx, c.label, { maxW: laneStep * 0.92, startPx: unit * 0.5, minPx: unit * 0.3, weight: 700, family: FONT_MONO });
    ctx.font = `700 ${labelPx}px ${FONT_MONO}`;
    const labelY = cp.y + r + unit * 0.22;
    const labelW = ctx.measureText(c.label).width;
    // Same-lane commits share an x, so the parent->child edge runs straight through
    // this spot in vertical layouts; a halo keeps the id readable over the line.
    roundRect(ctx, cp.x - labelW / 2 - unit * 0.12, labelY - unit * 0.06, labelW + unit * 0.24, labelPx + unit * 0.16, unit * 0.08);
    ctx.fillStyle = rgba(THEME.bgBottom, 0.7);
    ctx.fill();
    ctx.fillStyle = isFaded ? THEME.textFaint : THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(c.label, cp.x, labelY);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  });

  if (headCommitId != null && stepT > 0.02) {
    const hi = idxOf.get(headCommitId);
    if (hi != null) {
      const hp = pos(hi, scene.commits[hi].lane);
      glowRing(ctx, hp.x, hp.y, r * 1.2, headIsRef ? accent : THEME.warn, env, 1700);
    }
  }

  // --- Ref / HEAD chips, stacked above the commit each one names. ---
  const chipsAt = new Map<string, Chip[]>();
  for (const [name, v] of refs) {
    const arr = chipsAt.get(v.at) ?? [];
    arr.push({ label: name, role: "ref" });
    chipsAt.set(v.at, arr);
  }
  if (headTarget != null && headCommitId != null) {
    const arr = chipsAt.get(headCommitId) ?? [];
    arr.push({ label: "HEAD", role: headIsRef ? "head-attached" : "head-detached" });
    chipsAt.set(headCommitId, arr);
  }

  const chipGap = unit * CHIP_GAP_UNIT;
  for (const [commitId, chips] of chipsAt) {
    const ci = idxOf.get(commitId);
    if (ci == null) continue;
    const c = scene.commits[ci];
    const base = pos(ci, c.lane);
    const topY = base.y - unit * 0.9 - (chips.length - 1) * chipGap;
    strokePts(ctx, [base, { x: base.x, y: topY + unit * 0.5 }], rgba(THEME.textDim, 0.55), unit * 0.05, 0.5 * introIn, false);

    chips.forEach((chip, level) => {
      const finalPt: Pt = { x: base.x, y: base.y - unit * 0.9 - level * chipGap };
      let renderPt = finalPt;
      let alpha = introIn;
      let scale = 1;
      let fill: string;
      let bold = false;

      if (chip.role === "ref") {
        fill = refColor(chip.label, accent, secondary);
        if (refChangedAt.get(chip.label) === activeStep) {
          const t = easeOutCubic(clamp01(stepT * 1.4));
          const isNew = !prevRefsSnapshot?.has(chip.label);
          if (isNew) {
            alpha = introIn * clamp01(stepT * 2.2);
            scale = easeOutBack(t);
          } else {
            const prevAt = prevRefsSnapshot!.get(chip.label)!.at;
            const prevI = idxOf.get(prevAt);
            if (prevI != null) {
              const pp = pos(prevI, scene.commits[prevI].lane);
              const prevPt: Pt = { x: pp.x, y: pp.y - unit * 0.9 };
              renderPt = { x: prevPt.x + (finalPt.x - prevPt.x) * t, y: prevPt.y + (finalPt.y - prevPt.y) * t };
            }
          }
        }
      } else {
        bold = true;
        fill = chip.role === "head-attached" ? accent : THEME.warn;
        const bob = Math.sin(env.elapsedMs / 900 + level) * unit * 0.05;
        if (headChangedAt === activeStep) {
          const t = easeOutCubic(clamp01(stepT * 1.4));
          const prevResolved = prevHeadSnapshot == null ? undefined : prevRefsSnapshot?.get(prevHeadSnapshot)?.at ?? prevHeadSnapshot;
          const prevI = prevResolved ? idxOf.get(prevResolved) : undefined;
          if (prevI != null) {
            const pp = pos(prevI, scene.commits[prevI].lane);
            const prevPt: Pt = { x: pp.x, y: pp.y - unit * 0.9 };
            renderPt = { x: prevPt.x + (finalPt.x - prevPt.x) * t, y: prevPt.y + (finalPt.y - prevPt.y) * t + bob };
          } else {
            alpha = introIn * clamp01(stepT * 2.2);
            scale = easeOutBack(t);
            renderPt = { x: finalPt.x, y: finalPt.y + bob };
          }
        } else {
          renderPt = { x: finalPt.x, y: finalPt.y + bob };
        }
      }
      drawChip(ctx, renderPt.x, renderPt.y, chip.label, unit, fill, alpha, scale, bold);
    });
  }

  // --- Note badge (mode caption) for the active beat only. ---
  if (currentNote) {
    const noteIn = easeOutCubic(clamp01(stepT * 2.2));
    ctx.save();
    ctx.globalAlpha = introIn * noteIn;
    ctx.font = `800 ${unit * 0.5}px ${FONT_SANS}`;
    const label = currentNote.toUpperCase();
    const tw = ctx.measureText(label).width;
    const w = tw + unit * 1.0;
    const h = unit * 1.0;
    const nx = layout.contentX + layout.contentW / 2;
    const ny = areaY + unit * 0.55;
    roundRect(ctx, nx - w / 2, ny - h / 2, w, h, unit * 0.3);
    ctx.fillStyle = rgba(secondary, 0.16);
    ctx.fill();
    ctx.strokeStyle = secondary;
    ctx.lineWidth = unit * 0.055;
    ctx.stroke();
    ctx.fillStyle = secondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, nx, ny + unit * 0.02);
    ctx.restore();
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

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
  beatT,
  activeBeatIndex,
  drawArrowhead,
  flowDots,
  glowRing,
  strokePolylineProgress,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type ConsensusQuorumScene = Extract<Scene, { kind: "consensus_quorum" }>;
type Step = ConsensusQuorumScene["steps"][number];
type Tone = "idle" | "acked" | "commit" | "fail";

/** Established codebase red for a "fail" tone (matches gauge.ts / threads.ts / table.ts). */
const DANGER = "#f87171";

/** 0deg = top (12 o'clock), clockwise — matches hash_ring.ts's canvas convention. */
function canvasAngle(deg: number): number {
  return ((deg - 90) * Math.PI) / 180;
}
function pointOnRing(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const a = canvasAngle(deg);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function trimToward(p: { x: number; y: number }, toward: { x: number; y: number }, dist: number) {
  const dx = toward.x - p.x, dy = toward.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * dist, y: p.y + (dy / len) * dist };
}

/** Cluster state replayed through step `uptoStep` (inclusive): who has acked
 *  since the last reset, how many rounds have elapsed, and the last node/kind
 *  that acted — so the currently active beat can pick up exactly where the
 *  previous one left off (e.g. an "ack" beat still knows who is proposing). */
type QuorumState = { acked: Set<string>; lastFrom?: string; lastKind?: Step["kind"] };

function computeState(scene: ConsensusQuorumScene, uptoStep: number): QuorumState {
  const acked = new Set<string>();
  let lastFrom: string | undefined;
  let lastKind: Step["kind"] | undefined;
  for (let k = 0; k <= uptoStep && k < scene.steps.length; k++) {
    const st = scene.steps[k];
    if (st.kind === "reset") acked.clear();
    if (st.kind === "ack") st.ackFrom.forEach((id) => acked.add(id));
    if (st.from) lastFrom = st.from;
    lastKind = st.kind;
  }
  return { acked, lastFrom, lastKind };
}

function toneColor(tone: Tone, accent: string, secondary: string): string {
  return tone === "commit" ? THEME.good : tone === "fail" ? DANGER : tone === "acked" ? accent : secondary;
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  label: string,
  tone: Tone,
  isLeader: boolean,
  isActive: boolean,
  env: PaintEnv,
  unit: number,
  accent: string,
  secondary: string,
  phase: number
) {
  const color = toneColor(tone, accent, secondary);
  const breathe = tone !== "idle" ? 0.92 + 0.08 * idle(env, 1700, phase) : 1;
  ctx.save();
  if (isActive) {
    ctx.shadowColor = rgba(color, 0.7);
    ctx.shadowBlur = unit * 0.9 * (0.55 + 0.45 * idle(env, 900));
  }
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.001, r * breathe), 0, Math.PI * 2);
  ctx.fillStyle = rgba(color, tone === "idle" ? 0.14 : 0.26);
  ctx.fill();
  ctx.lineWidth = unit * (isLeader ? 0.11 : 0.07);
  ctx.strokeStyle = tone === "idle" ? rgba(color, 0.55) : color;
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (isLeader) {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.55);
    ctx.lineTo(x - r * 0.42, y - r * 1.12);
    ctx.lineTo(x + r * 0.42, y - r * 1.12);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
  }
  if (r > 2) {
    const fontPx = fitFontSize(ctx, label, { maxW: r * 1.5, startPx: r * 0.86, minPx: r * 0.4, weight: 800, family: FONT_MONO });
    ctx.font = `800 ${fontPx}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y + fontPx * 0.02);
  }
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  local: number,
  color: string,
  glow: string,
  unit: number,
  nodeR: number,
  env: PaintEnv
) {
  if (local <= 0) return;
  const trimA = trimToward(a, b, nodeR * 1.25);
  const trimB = trimToward(b, a, nodeR * 1.25);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = unit * 0.09;
  ctx.lineCap = "round";
  ctx.shadowColor = glow;
  ctx.shadowBlur = unit * 0.5;
  const tip = strokePolylineProgress(ctx, [trimA, trimB], local);
  ctx.shadowBlur = 0;
  if (local > 0.94) {
    ctx.fillStyle = color;
    drawArrowhead(ctx, tip.x, tip.y, tip.angle, unit * 0.24);
  }
  ctx.restore();
  if (local > 0.5) flowDots(ctx, [trimA, trimB], env, { count: 1, speedMs: 850, r: unit * 0.11, color });
}

/**
 * A cluster reaching distributed consensus: nodes sit on a ring, one flagged
 * `role:"leader"` (leader or 2PC coordinator). Each beat is a step: "propose"
 * fans arrows out from the broadcaster to the ring, "ack" answers back one
 * follower at a time while a segmented quorum meter below fills, "commit"
 * turns the whole cluster green once the threshold is crossed, "fail" turns
 * it red when it isn't (split vote, a stalled 2PC coordinator), and "reset"
 * drains the meter to start a fresh round/term. Generalizes Raft leader
 * election (propose→ack→fail "split vote"→reset→propose→ack→commit) and
 * Two-Phase Commit (propose "PREPARE"→ack→commit "COMMIT" or fail "BLOCKED").
 */
export function paintConsensusQuorum(ctx: CanvasRenderingContext2D, scene: ConsensusQuorumScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.5;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const n = scene.nodes.length;
  const quorum = Math.min(n, Math.max(2, scene.quorumSize ?? Math.floor(n / 2) + 1));
  const idxOf = new Map(scene.nodes.map((node, i) => [node.id, i] as const));

  const prior = computeState(scene, activeStep - 1);
  const step = activeStep >= 0 && activeStep < scene.steps.length ? scene.steps[activeStep] : undefined;
  const kindNow = step?.kind ?? prior.lastKind;
  const currentFrom = step?.from ?? prior.lastFrom ?? scene.nodes.find((nd) => nd.role === "leader")?.id ?? scene.nodes[0]?.id;
  const fromIdx = currentFrom ? idxOf.get(currentFrom) : undefined;

  // A circle needs no left/right-vs-top/bottom axis swap for 9:16 — centring
  // it in contentX/Y/W/H and sizing off the tighter dimension already adapts.
  const meterBlockH = unit * 3.7;
  const ringAreaH = Math.max(unit * 4.2, areaH - meterBlockH);
  const cx = contentX + contentW / 2;
  const cy = areaY + ringAreaH / 2;
  const R = Math.max(unit * 2.1, Math.min(contentW, ringAreaH) * 0.42 - unit * 0.9);
  const nodeR = Math.max(unit * 0.6, Math.min(unit * 1.15, R * Math.sin(Math.PI / n) * 0.85));
  const posOf = (i: number) => pointOnRing(cx, cy, R, (i * 360) / n);

  // Base ring outline — reads immediately, before any beat plays.
  ctx.save();
  ctx.globalAlpha = introIn * 0.3;
  ctx.strokeStyle = rgba(accent, 0.4);
  ctx.lineWidth = unit * 0.045;
  ctx.setLineDash([unit * 0.14, unit * 0.22]);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Cumulative ack set (discrete — drives node tone + the integer label) and
  // a smooth animated fill (drives the meter bar width) for the active beat.
  const acked = new Set(prior.acked);
  let fillAnim = prior.acked.size;
  if (step?.kind === "ack" && step.ackFrom.length) {
    const items = step.ackFrom.filter((id) => idxOf.has(id) && !prior.acked.has(id));
    items.forEach((id, j) => {
      const startAt = (j / items.length) * 0.55;
      const local = clamp01((stepT - startAt) / 0.4);
      if (local >= 1) acked.add(id);
      fillAnim += local;
    });
  } else if (step?.kind === "reset") {
    fillAnim = prior.acked.size * (1 - easeOutCubic(stepT));
    acked.clear();
  } else if (kindNow === "commit") {
    // Quorum means the CANDIDATE plus however many followers actually acked —
    // not every node. Forcing the full ring to "acked" (as this used to do)
    // hid exactly the point of quorum: a node that never voted (e.g. one
    // still down or partitioned) shouldn't read as having agreed.
    fillAnim = Math.min(n, prior.acked.size + 1);
  }

  let noteText = "";
  for (let k = 0; k <= activeStep && k < scene.steps.length; k++) if (scene.steps[k].note) noteText = scene.steps[k].note!;

  // Nodes.
  ctx.save();
  ctx.globalAlpha = introIn;
  scene.nodes.forEach((nd, i) => {
    const p = posOf(i);
    const isLeader = nd.role === "leader";
    const isActive = fromIdx === i && kindNow !== "reset" && kindNow !== undefined;
    let tone: Tone = acked.has(nd.id) ? "acked" : "idle";
    // Only the candidate itself and the nodes that actually acked switch to
    // the "commit" celebration tone — a node that never voted stays idle,
    // same as it would look mid-election, so quorum still reads as "enough",
    // not "everyone".
    if (kindNow === "commit") tone = isLeader || acked.has(nd.id) ? "commit" : "idle";
    else if (kindNow === "fail") tone = "fail";
    const pop = easeOutBack(enterT(env, 420, 90 + i * 40));
    const r = nodeR * (0.55 + 0.45 * pop);
    drawNode(ctx, p.x, p.y, r, nd.label, tone, isLeader, isActive, env, unit, accent, secondary, i);
    if (tone === "commit" || tone === "fail" || isActive) {
      glowRing(ctx, p.x, p.y, r, toneColor(tone, accent, secondary), env, 1500 + i * 60);
    }
  });

  // Propose: arrows fan out from the broadcaster to every other node.
  if (step?.kind === "propose" && fromIdx != null) {
    const a = posOf(fromIdx);
    const local = easeOutCubic(clamp01(stepT * 1.25));
    scene.nodes.forEach((nd, i) => {
      if (i === fromIdx) return;
      drawArrow(ctx, a, posOf(i), local, accent, accentGlow, unit, nodeR, env);
    });
  }

  // Ack: each follower answers back to the broadcaster, staggered one by one.
  if (step?.kind === "ack" && fromIdx != null && step.ackFrom.length) {
    const b = posOf(fromIdx);
    const items = step.ackFrom.filter((id) => idxOf.has(id));
    items.forEach((id, j) => {
      const i = idxOf.get(id)!;
      const startAt = (j / items.length) * 0.55;
      const local = easeOutCubic(clamp01((stepT - startAt) / 0.4));
      drawArrow(ctx, posOf(i), b, local, secondary, secondaryGlow, unit, nodeR, env);
    });
  }
  ctx.restore();

  // Quorum meter: one segment per node, a threshold marker after the
  // `quorum`-th segment, and a phase chip carrying the latest step's note.
  const meterTop = areaY + ringAreaH;
  const meterTone = kindNow === "commit" ? THEME.good : kindNow === "fail" ? DANGER : accent;
  const meterW = Math.min(contentW * 0.88, unit * 13.5);
  const meterX = cx - meterW / 2;
  const gap = unit * 0.16;
  const segW = (meterW - gap * (n - 1)) / n;
  const segH = unit * 1.1;
  const meterY = meterTop + unit * 1.65;

  ctx.save();
  ctx.globalAlpha = introIn;
  if (noteText) {
    ctx.font = `700 ${unit * 0.6}px ${FONT_SANS}`;
    const tw = ctx.measureText(noteText).width;
    const chipCY = meterTop + unit * 0.7;
    ctx.fillStyle = rgba(meterTone, 0.16);
    roundRect(ctx, cx - tw / 2 - unit * 0.5, chipCY - unit * 0.5, tw + unit, unit * 1.0, unit * 0.5);
    ctx.fill();
    ctx.strokeStyle = rgba(meterTone, 0.6);
    ctx.lineWidth = unit * 0.05;
    roundRect(ctx, cx - tw / 2 - unit * 0.5, chipCY - unit * 0.5, tw + unit, unit * 1.0, unit * 0.5);
    ctx.stroke();
    ctx.fillStyle = meterTone;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(noteText, cx, chipCY);
  }

  for (let i = 0; i < n; i++) {
    const sx = meterX + i * (segW + gap);
    roundRect(ctx, sx, meterY, segW, segH, unit * 0.16);
    ctx.fillStyle = rgba(meterTone, 0.12);
    ctx.fill();
    const frac = clamp01(fillAnim - i);
    if (frac > 0) {
      ctx.save();
      roundRect(ctx, sx, meterY, segW, segH, unit * 0.16);
      ctx.clip();
      ctx.fillStyle = rgba(meterTone, 0.85);
      ctx.fillRect(sx, meterY, segW * frac, segH);
      ctx.restore();
    }
    ctx.strokeStyle = rgba(meterTone, 0.55);
    ctx.lineWidth = unit * 0.05;
    roundRect(ctx, sx, meterY, segW, segH, unit * 0.16);
    ctx.stroke();
    if (i === quorum - 1) {
      const mx = sx + segW + gap / 2;
      ctx.save();
      ctx.globalAlpha *= 0.7;
      ctx.strokeStyle = THEME.text;
      ctx.setLineDash([unit * 0.08, unit * 0.1]);
      ctx.lineWidth = unit * 0.05;
      ctx.beginPath();
      ctx.moveTo(mx, meterY - unit * 0.2);
      ctx.lineTo(mx, meterY + segH + unit * 0.2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // acked only holds the FOLLOWERS who voted — it never includes the
  // candidate's own implicit vote — so the commit label must add 1, not
  // report a hardcoded n/n regardless of how many nodes actually acked.
  const label =
    kindNow === "commit"
      ? `Quorum reached — ${Math.min(n, acked.size + 1)}/${n}`
      : kindNow === "fail"
      ? `Short of quorum — ${prior.acked.size}/${n} (need ${quorum})`
      : `${acked.size}/${n} acked · need ${quorum}`;
  ctx.font = `700 ${unit * 0.6}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, cx, meterY + segH + unit * 0.95);
  ctx.restore();

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

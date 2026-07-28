import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  easeInOutCubic,
  clamp01,
  sub,
  enterT,
  idle,
  drawSceneTitle,
  fitFontSize,
  wrapText,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type EventLoopScene = Extract<Scene, { kind: "event_loop" }>;
type Task = EventLoopScene["tasks"][number];
type Status = "ready" | "running" | "waiting" | "done";

/**
 * Replay steps 0..uptoStep (inclusive) to get each task's cumulative status.
 * Each task keeps one fixed home angle for its whole life (ready/waiting/done
 * only change its RADIUS, never its angle) so simultaneously-waiting tasks
 * never collide or need re-slotting.
 */
function replay(scene: EventLoopScene, uptoStep: number): Map<string, Status> {
  const state = new Map<string, Status>();
  scene.tasks.forEach((t) => state.set(t.id, "ready"));
  for (let k = 0; k <= uptoStep && k < scene.steps.length; k++) {
    const step = scene.steps[k];
    if (!state.has(step.taskId)) continue;
    if (step.action === "run") {
      for (const [id, s] of state) if (s === "running") state.set(id, "ready");
      state.set(step.taskId, "running");
    } else if (step.action === "await") {
      state.set(step.taskId, "waiting");
    } else if (step.action === "resume") {
      state.set(step.taskId, "ready");
    } else if (step.action === "done") {
      state.set(step.taskId, "done");
    }
  }
  return state;
}

const DEFAULT_DETAIL: Record<EventLoopScene["steps"][number]["action"], string> = {
  run: "running",
  await: "suspended — awaiting I/O",
  resume: "I/O ready — back in queue",
  done: "completed",
};

/**
 * The asyncio-style single-thread event loop: one hub in the centre hands
 * control to task chips arranged on a ready ring; a task that awaits I/O
 * slides out to a dashed waiting arc (still "alive", just parked) while the
 * one glowing token — the single thread of control — returns to the hub or
 * moves on to the next ready task. `blocking` steps freeze the hub's spin to
 * show a synchronous call starving every other task of that one thread.
 */
export function paintEventLoop(ctx: CanvasRenderingContext2D, scene: EventLoopScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const n = scene.tasks.length;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.4;
  let availH = contentH - band;
  if (vertical) availH = Math.min(availH, layout.h * 0.86 - (contentY + band));
  const cx = contentX + contentW / 2;
  const cy = contentY + band + availH / 2;

  const hubR = unit * (vertical ? 1.5 : 1.7);
  let readyR = Math.min(contentW, availH) * 0.34;
  if (vertical) readyR = Math.min(readyR, contentW / 2 - unit * 3.4);
  // Keep the ring clear of the hub's caption + detail text stacked below it.
  readyR = Math.max(readyR, hubR + unit * 3.3);
  const chipR = unit * (vertical ? 1.0 : 1.05);
  // Reserve room for a waiting task's own chip + its label, which sit beyond
  // waitR — otherwise a task parked at the very top of the arc pushes its
  // label past the content box into the scene title.
  const outerCap = Math.min(contentW, availH) / 2 - unit * 0.6 - chipR - unit * 1.5;
  // Clamp with min(), not just max(): the readyR+2.1 floor below can itself
  // exceed outerCap on a compact frame, which previously let waitR (and
  // anything drawn at it) breach the safe boundary regardless of the cap.
  const waitR = Math.min(outerCap, Math.max(readyR + unit * 2.1, Math.min(readyR * 1.6, outerCap)));
  const angleOf = (k: number) => -Math.PI / 2 + k * ((Math.PI * 2) / n);

  const step = activeStep >= 0 && activeStep < scene.steps.length ? scene.steps[activeStep] : undefined;
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const stateNow = replay(scene, activeStep);
  const statePrev = replay(scene, activeStep - 1);

  // Is the loop starved right now (a blocking step is mid-flight or just landed)?
  const blockingHold = !!step && step.blocking && (step.action === "run" || step.action === "await") && activeStep >= 0;
  const spin = blockingHold ? 0 : env.elapsedMs / 1600;

  // Hub — the hand-off point of the single thread.
  ctx.save();
  ctx.globalAlpha = introIn;
  if (blockingHold) ctx.shadowColor = rgba(THEME.warn, 0.55);
  else ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * (blockingHold ? 1.1 : 0.8) * (0.7 + 0.3 * idle(env, 1400));
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fillStyle = "#0e2433";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = blockingHold ? THEME.warn : accent;
  ctx.lineWidth = unit * 0.12;
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin * Math.PI * 2);
  drawIcon(ctx, "gear", 0, 0, hubR * 1.15, env, blockingHold ? THEME.warn : "#eaf6ff");
  ctx.restore();
  ctx.restore();

  // Hub caption: the loop's own label, plus the active step's detail below.
  ctx.save();
  ctx.globalAlpha = introIn * 0.9;
  ctx.font = `700 ${unit * (vertical ? 0.62 : 0.6)}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "center";
  ctx.fillText(scene.loopLabel, cx, cy + hubR + unit * 0.85);
  ctx.restore();

  const detail = step ? step.detail ?? DEFAULT_DETAIL[step.action] : undefined;
  if (detail) {
    const fadeIn = easeOutCubic(sub(stepT, 0.05, 0.25));
    ctx.save();
    ctx.globalAlpha = introIn * fadeIn * (blockingHold ? 1 : 0.95);
    ctx.font = `600 ${unit * (vertical ? 0.66 : 0.64)}px ${FONT_SANS}`;
    ctx.fillStyle = blockingHold ? THEME.warn : THEME.text;
    ctx.textAlign = "center";
    const lines = wrapText(ctx, detail, Math.min(readyR * 1.5, contentW * 0.7)).slice(0, 2);
    const lh = unit * 0.82;
    lines.forEach((l, i) => ctx.fillText(l, cx, cy + hubR + unit * 1.65 + i * lh));
    ctx.restore();
  }

  // Waiting arc guide (dashed) — where suspended tasks park.
  ctx.save();
  ctx.globalAlpha = introIn * 0.16;
  ctx.strokeStyle = THEME.textDim;
  ctx.lineWidth = unit * 0.05;
  ctx.setLineDash([unit * 0.28, unit * 0.26]);
  ctx.beginPath();
  ctx.arc(cx, cy, waitR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const posFor = (status: Status, k: number) => {
    const a = angleOf(k);
    const r = status === "waiting" ? waitR : readyR;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a };
  };

  const drawChip = (task: Task, pos: { x: number; y: number; a: number }, status: Status, heat: "none" | "hot" | "warn") => {
    ctx.save();
    ctx.globalAlpha = introIn;
    const dashed = status === "waiting";
    const hotColor = heat === "warn" ? THEME.warn : accent;
    if (heat !== "none") {
      ctx.shadowColor = heat === "warn" ? rgba(THEME.warn, 0.6) : accentGlow;
      ctx.shadowBlur = unit * 0.9;
    }
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, chipR, 0, Math.PI * 2);
    ctx.fillStyle = heat !== "none" ? "#123249" : status === "done" ? "rgba(20,26,32,0.5)" : THEME.panel;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = heat !== "none" ? hotColor : status === "waiting" ? rgba(secondary, 0.75) : status === "done" ? "rgba(148,163,184,0.35)" : "rgba(148,163,184,0.55)";
    ctx.lineWidth = heat !== "none" ? unit * 0.11 : unit * 0.06;
    if (dashed) ctx.setLineDash([unit * 0.2, unit * 0.18]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (task.icon) {
      ctx.font = `${chipR * 1.05}px ${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.globalAlpha = introIn * (status === "done" ? 0.5 : 1);
      ctx.fillText(task.icon, pos.x, pos.y + chipR * 0.36);
    } else {
      ctx.fillStyle = heat !== "none" ? hotColor : status === "waiting" ? secondary : "rgba(200,210,222,0.8)";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, unit * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    if (status === "done") {
      ctx.globalAlpha = introIn;
      ctx.strokeStyle = THEME.good;
      ctx.lineWidth = unit * 0.1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pos.x - chipR * 0.4, pos.y + chipR * 0.05);
      ctx.lineTo(pos.x - chipR * 0.1, pos.y + chipR * 0.32);
      ctx.lineTo(pos.x + chipR * 0.42, pos.y - chipR * 0.32);
      ctx.stroke();
    }
    ctx.restore();

    // Label chip below/around the node.
    const dist = chipR + unit * 0.55;
    const c = Math.cos(pos.a);
    const s = Math.sin(pos.a);
    const lx = pos.x + c * dist;
    const ly = pos.y + s * dist;
    const side: -1 | 0 | 1 = Math.abs(c) < 0.35 ? 0 : c > 0 ? 1 : -1;
    ctx.save();
    ctx.globalAlpha = introIn * (status === "done" ? 0.55 : 0.95);
    const px = fitFontSize(ctx, task.label, { maxW: unit * 5, startPx: unit * 0.62, minPx: unit * 0.5, weight: 700 });
    ctx.font = `700 ${px}px ${FONT_SANS}`;
    ctx.fillStyle = status === "waiting" ? THEME.textDim : THEME.text;
    ctx.textAlign = side === 1 ? "left" : side === -1 ? "right" : "center";
    ctx.textBaseline = "middle";
    ctx.fillText(task.label, lx + (side === 1 ? unit * 0.15 : side === -1 ? -unit * 0.15 : 0), ly);
    ctx.restore();
  };

  // Each task morphs radius (ready<->waiting<->done) along its fixed home
  // angle when the active beat's step targets it; draw waiting (outermost)
  // first, then ready/done, then the running task last so it stays on top.
  const zOrder: Status[] = ["waiting", "ready", "done", "running"];
  const visualStatus = new Map<string, { pos: { x: number; y: number; a: number }; status: Status; pop: number; heat: "none" | "hot" | "warn" }>();
  scene.tasks.forEach((task, k) => {
    const now = stateNow.get(task.id)!;
    const was = statePrev.get(task.id)!;
    const transitioning = activeStep >= 0 && was !== now;
    const morph = transitioning ? easeInOutCubic(clamp01(stepT / 0.7)) : 1;
    const from = posFor(transitioning ? was : now, k);
    const to = posFor(now, k);
    const pos = { x: from.x + (to.x - from.x) * morph, y: from.y + (to.y - from.y) * morph, a: to.a };
    const status = transitioning && morph < 1 ? was : now;
    const pop = transitioning ? 0.92 + 0.08 * easeOutBack(clamp01(morph * 1.3)) : 1;
    const isRunningNow = now === "running" && (!transitioning || morph > 0.5);
    const heat: "none" | "hot" | "warn" = isRunningNow ? (blockingHold ? "warn" : "hot") : "none";
    visualStatus.set(task.id, { pos, status, pop, heat });
  });
  for (const wantStatus of zOrder) {
    scene.tasks.forEach((task) => {
      const v = visualStatus.get(task.id)!;
      const drawAs = v.status === "running" ? "ready" : v.status;
      if (drawAs !== wantStatus) return;
      ctx.save();
      ctx.translate(v.pos.x, v.pos.y);
      ctx.scale(v.pop, v.pop);
      ctx.translate(-v.pos.x, -v.pos.y);
      drawChip(task, v.pos, drawAs, v.heat);
      ctx.restore();
    });
  }

  // The single travelling token: hub <-> whichever task is running.
  const runningTask = scene.tasks.find((t) => stateNow.get(t.id) === "running");
  const wasRunningTask = scene.tasks.find((t) => statePrev.get(t.id) === "running");
  const tokenHome = (t: Task | undefined) => {
    if (!t) return { x: cx, y: cy };
    const k = scene.tasks.indexOf(t);
    return posFor("ready", k);
  };
  let tokenPos = { x: cx, y: cy };
  const tokenAlpha = introIn;
  if (step && (step.action === "run" || step.action === "await" || step.action === "done")) {
    if (step.action === "run") {
      const target = tokenHome(runningTask);
      const t = easeOutCubic(clamp01(stepT / 0.6));
      tokenPos = { x: cx + (target.x - cx) * t, y: cy + (target.y - cy) * t };
    } else {
      const src = tokenHome(wasRunningTask ?? runningTask);
      const t = easeOutCubic(clamp01(stepT / 0.55));
      tokenPos = { x: src.x + (cx - src.x) * t, y: src.y + (cy - src.y) * t };
    }
  } else if (runningTask) {
    tokenPos = tokenHome(runningTask);
  }
  const tokenBob = Math.sin(env.elapsedMs / 480) * unit * 0.05;
  if (blockingHold) tokenPos = tokenHome(runningTask);
  ctx.save();
  ctx.globalAlpha = tokenAlpha;
  ctx.shadowColor = blockingHold ? rgba(THEME.warn, 0.8) : accentGlow;
  ctx.shadowBlur = unit * 1.1;
  ctx.fillStyle = blockingHold ? THEME.warn : "#eaf6ff";
  ctx.beginPath();
  ctx.arc(tokenPos.x, tokenPos.y + (runningTask ? tokenBob : 0), unit * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Blocked warning ping around every starved ready task.
  if (blockingHold) {
    scene.tasks.forEach((task, k) => {
      if (stateNow.get(task.id) !== "ready") return;
      const p = posFor("ready", k);
      const pr = (env.elapsedMs % 1400) / 1400;
      ctx.save();
      ctx.globalAlpha = introIn * (1 - pr) * 0.45;
      ctx.strokeStyle = THEME.warn;
      ctx.lineWidth = unit * 0.06;
      ctx.beginPath();
      ctx.arc(p.x, p.y, chipR * (1 + pr * 0.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

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
  isoBox3D,
  glowRing,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type ControlLoopScene = Extract<Scene, { kind: "control_loop" }>;
type Item = ControlLoopScene["items"][number];

/** THEME has no error color (only `good`/`warn`) — established codebase red for drift (matches server_rack.ts / codediff.ts). */
const DRIFT = "#f87171";

/** Per-item live state as of a given step index: the actual value shown and
 *  whether it currently matches desired (in sync) or has drifted. */
type ItemState = { value: string; drift: boolean };

function replayStates(scene: ControlLoopScene, uptoStepInclusive: number): Map<string, ItemState> {
  const map = new Map<string, ItemState>();
  scene.items.forEach((it) => map.set(it.id, { value: it.desiredValue, drift: false }));
  for (let k = 0; k <= uptoStepInclusive; k++) {
    const step = scene.steps[k];
    if (!step) continue;
    map.set(step.itemId, { value: step.actualValue, drift: step.action === "drift" });
  }
  return map;
}

/**
 * The declarative reconciliation loop (Kubernetes controllers, Terraform/CFN
 * drift detection): a Desired-State list (left) and the live Actual-State list
 * (right) flank a controller node whose gear keeps turning — it never stops
 * watching. Each beat is one loop iteration: either the actual side DRIFTS away
 * from desired (card flashes red, a packet flows actual→controller) or the
 * controller RECONCILES it back (packet flows controller→actual, card settles
 * green). A continuous ring around the controller reads OBSERVE → DIFF → ACT
 * on loop, independent of beats, because reconciliation never truly stops.
 */
export function paintControlLoop(ctx: CanvasRenderingContext2D, scene: ControlLoopScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary } = env.palette;
  const good = THEME.good;

  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;
  const n = scene.items.length;

  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const prevStates = replayStates(scene, activeStep - 1);
  const currStates = replayStates(scene, activeStep);
  const activeItemId = activeStep >= 0 ? scene.steps[activeStep]?.itemId : undefined;
  const activeAction = activeStep >= 0 ? scene.steps[activeStep]?.action : undefined;

  // Three parallel bands: desired (left/top) | controller (center) | actual (right/bottom).
  const colGap = unit * 0.6;
  const colW = vertical ? contentW : (contentW - colGap * 2) * 0.34;
  const midW = vertical ? contentW * 0.7 : (contentW - colGap * 2) * 0.32;
  const desiredX = contentX;
  const controllerX = vertical ? contentX + (contentW - midW) / 2 : contentX + colW + colGap;
  const actualX = vertical ? contentX : contentX + colW + colGap + midW + colGap;

  const desiredY = areaY;
  const desiredH = vertical ? areaH * 0.3 : areaH;
  const controllerY = vertical ? areaY + areaH * 0.32 : areaY;
  const controllerH = vertical ? areaH * 0.36 : areaH;
  const actualY = vertical ? areaY + areaH * 0.7 : areaY;
  const actualH = vertical ? areaH * 0.3 : areaH;

  const rowGap = unit * 0.32;
  const rowH = Math.max(unit * 1.1, Math.min(unit * 2.1, (Math.min(desiredH, actualH) - rowGap * (n - 1)) / n));
  const rowsBlockH = rowH * n + rowGap * (n - 1);
  const desiredY0 = desiredY + (desiredH - rowsBlockH) / 2;
  const actualY0 = actualY + (actualH - rowsBlockH) / 2;

  const cx = controllerX + midW / 2;
  const cy = controllerY + controllerH / 2;
  const controllerR = Math.min(midW, controllerH) * (vertical ? 0.22 : 0.26);

  // ---- column headers ------------------------------------------------------
  ctx.save();
  ctx.globalAlpha = introIn * 0.85;
  ctx.font = `800 ${unit * 0.62}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = vertical ? "center" : "start";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("DESIRED STATE", (vertical ? desiredX + colW / 2 : desiredX), desiredY0 - unit * 0.35);
  ctx.textAlign = vertical ? "center" : "end";
  ctx.fillText("ACTUAL STATE", (vertical ? actualX + colW / 2 : actualX + colW), actualY0 - unit * 0.35);
  ctx.restore();

  // ---- item rows: desired (static, ground truth) ---------------------------
  scene.items.forEach((item, i) => {
    const y = desiredY0 + i * (rowH + rowGap);
    const rowIn = easeOutCubic(enterT(env, 340, 60 + i * 70));
    if (rowIn <= 0) return;
    drawItemCard(ctx, {
      x: desiredX,
      y,
      w: colW,
      h: rowH,
      unit,
      env,
      item,
      value: item.desiredValue,
      face: secondary,
      glow: undefined,
      active: item.id === activeItemId,
      alpha: introIn * rowIn,
      valuePop: 1,
    });
  });

  // ---- item rows: actual (live, drifts / reconciles) ------------------------
  scene.items.forEach((item, i) => {
    const y = actualY0 + i * (rowH + rowGap);
    const rowIn = easeOutCubic(enterT(env, 340, 100 + i * 70));
    if (rowIn <= 0) return;
    const isActive = item.id === activeItemId;
    const prev = prevStates.get(item.id) ?? { value: item.desiredValue, drift: false };
    const curr = currStates.get(item.id) ?? { value: item.desiredValue, drift: false };
    // The active row's value/color flip partway through its beat window;
    // every other row just shows its already-settled state.
    const flip = isActive ? clamp01((stepT - 0.4) / 0.35) : 1;
    const shown = flip < 1 ? prev : curr;
    const face = shown.drift ? DRIFT : good;
    const pop = isActive && flip > 0 && flip < 0.35 ? easeOutBack(clamp01(flip / 0.35)) : 1;
    drawItemCard(ctx, {
      x: actualX,
      y,
      w: colW,
      h: rowH,
      unit,
      env,
      item,
      value: shown.value,
      face,
      glow: isActive ? rgba(face, 0.55) : undefined,
      active: isActive,
      alpha: introIn * rowIn,
      valuePop: pop,
    });
  });

  // ---- connector beams between active desired/actual row and the controller
  if (activeStep >= 0 && activeItemId) {
    const i = scene.items.findIndex((it) => it.id === activeItemId);
    if (i >= 0) {
      const dY = desiredY0 + i * (rowH + rowGap) + rowH / 2;
      const aY = actualY0 + i * (rowH + rowGap) + rowH / 2;
      const dPt = vertical ? { x: desiredX + colW / 2, y: desiredY0 + i * (rowH + rowGap) + rowH } : { x: desiredX + colW, y: dY };
      const aPt = vertical ? { x: actualX + colW / 2, y: actualY0 + i * (rowH + rowGap) } : { x: actualX, y: aY };
      const toward = activeAction === "drift"; // packet flows actual -> controller (observe)
      const from = toward ? aPt : { x: cx, y: cy };
      const to = toward ? { x: cx, y: cy } : aPt;
      const beamColor = activeAction === "drift" ? DRIFT : good;
      const beamT = easeOutCubic(clamp01(stepT / 0.6));
      ctx.save();
      ctx.globalAlpha = introIn * 0.5;
      ctx.strokeStyle = rgba(beamColor, 0.5);
      ctx.lineWidth = unit * 0.07;
      ctx.setLineDash([unit * 0.24, unit * 0.2]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Always show a faint desired->controller reference beam too.
      ctx.globalAlpha = introIn * 0.28;
      ctx.strokeStyle = rgba(secondary, 0.5);
      ctx.beginPath();
      ctx.moveTo(dPt.x, dPt.y);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.restore();

      const f = (env.elapsedMs / 900) % 1;
      const px = from.x + (to.x - from.x) * f;
      const py = from.y + (to.y - from.y) * f;
      ctx.save();
      ctx.globalAlpha = introIn * beamT * Math.sin(clamp01(f) * Math.PI);
      ctx.fillStyle = beamColor;
      ctx.shadowColor = beamColor;
      ctx.shadowBlur = unit * 0.5;
      ctx.beginPath();
      ctx.arc(px, py, unit * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---- controller node: gear + perpetual OBSERVE/DIFF/ACT ring --------------
  drawController(ctx, {
    cx,
    cy,
    r: controllerR,
    unit,
    env,
    label: scene.controllerLabel,
    accent,
    active: activeAction,
    alpha: introIn,
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawItemCard(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    unit: number;
    env: PaintEnv;
    item: Item;
    value: string;
    face: string;
    glow?: string;
    active: boolean;
    alpha: number;
    valuePop: number;
  }
) {
  const { x, y, w, h, unit, env, item, value, face, glow, active, alpha, valuePop } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  const breathe = active ? 0.85 + 0.15 * idle(env, 1500) : 1;
  isoBox3D(ctx, x, y, w, h, unit * 0.22, face, glow, unit * 0.22);
  const iconSize = h * 0.6;
  const iconCx = x + iconSize * 0.62;
  const iconCy = y + h / 2;
  if (item.icon) {
    drawIcon(ctx, item.icon, iconCx, iconCy, iconSize, env, "#0b1016");
  }
  const textX = x + (item.icon ? iconSize * 1.15 : unit * 0.4);
  const maxW = w - (textX - x) - unit * 0.35;
  const labelPx = fitFontSize(ctx, item.label, { maxW, startPx: unit * 0.58, minPx: unit * 0.4, weight: 700 });
  ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
  ctx.fillStyle = "#0b1016";
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(item.label, textX, y + h * 0.42);
  const valuePx = fitFontSize(ctx, value, { maxW, startPx: unit * 0.62, minPx: unit * 0.4, weight: 800, family: FONT_MONO });
  ctx.font = `800 ${valuePx * (0.9 + 0.1 * valuePop)}px ${FONT_MONO}`;
  ctx.fillStyle = "rgba(6,10,14,0.72)";
  ctx.fillText(value, textX, y + h * 0.76);
  if (active) {
    ctx.globalAlpha = alpha * breathe * 0.8;
    ctx.strokeStyle = face;
    ctx.lineWidth = unit * 0.06;
    roundRect(ctx, x - unit * 0.08, y - unit * 0.08, w + unit * 0.16, h + unit * 0.16, unit * 0.26);
    ctx.stroke();
  }
  ctx.restore();
}

const LOOP_PHASES = ["OBSERVE", "DIFF", "ACT"] as const;

function drawController(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    r: number;
    unit: number;
    env: PaintEnv;
    label: string;
    accent: string;
    active?: "drift" | "reconcile";
    alpha: number;
  }
) {
  const { cx, cy, r, unit, env, label, accent, active, alpha } = opts;
  const ringColor = active === "drift" ? "#f87171" : active === "reconcile" ? THEME.good : accent;
  const period = 3600;
  const phaseIdx = Math.floor((env.elapsedMs / period) * 3) % 3;

  ctx.save();
  ctx.globalAlpha = alpha;

  // The perpetual loop ring — three arcs (observe/diff/act), one lit at a time.
  const gap = 0.09;
  const arcLen = Math.PI * 2 / 3 - gap;
  for (let i = 0; i < 3; i++) {
    const start = -Math.PI / 2 + (i * Math.PI * 2) / 3 + gap / 2;
    const lit = i === phaseIdx;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.55, start, start + arcLen);
    ctx.strokeStyle = lit ? ringColor : rgba(accent, 0.28);
    ctx.lineWidth = unit * (lit ? 0.14 : 0.08);
    if (lit) {
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = unit * 0.6;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // A traveling head dot that never stops circling — the loop runs forever.
  const travel = (env.elapsedMs / period) % 1;
  const ang = -Math.PI / 2 + travel * Math.PI * 2;
  const hx = cx + Math.cos(ang) * r * 1.55;
  const hy = cy + Math.sin(ang) * r * 1.55;
  ctx.fillStyle = ringColor;
  ctx.shadowColor = ringColor;
  ctx.shadowBlur = unit * 0.5;
  ctx.beginPath();
  ctx.arc(hx, hy, unit * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (active) glowRing(ctx, cx, cy, r * 1.1, ringColor, env, 1400);

  // Controller hub.
  isoBox3D(ctx, cx - r, cy - r, r * 2, r * 2, unit * 0.24, accent, active ? ringColor : undefined, r * 0.3);
  drawIcon(ctx, "gear", cx, cy - r * 0.18, r * 1.15, env, "#eaf3ff");

  ctx.font = `800 ${unit * 0.56}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, cx, cy + r * 0.92);

  ctx.font = `700 ${unit * 0.44}px ${FONT_MONO}`;
  ctx.fillStyle = ringColor;
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillText(LOOP_PHASES[phaseIdx], cx, cy + r * 1.8);

  ctx.restore();
}

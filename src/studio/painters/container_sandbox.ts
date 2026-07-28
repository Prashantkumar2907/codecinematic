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
  rgba,
  flowDots,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type SandboxScene = Extract<Scene, { kind: "container_sandbox" }>;
type Resource = SandboxScene["resources"][number];

/** Namespace kind -> vector-icon name understood by drawIcon. */
const RESOURCE_ICON: Record<Resource["kind"], string> = {
  pid: "cpu",
  net: "network",
  mount: "harddrive",
  user: "shield",
  ipc: "message",
  hostname: "dns",
};

const MIN_BOX_SCALE = 0.42;
const CHIP_LABEL_MIN_UNIT = 1.5;

/**
 * Linux namespaces & cgroups as one primitive: a host area exposes its
 * resources (pids/net/mounts/...) as flat chips; a process card sits inside
 * an isoBox3D "sandbox" that SHRINKS as `isolate` steps hide resources from
 * it (greyed-out chip + slash + severed connector = "can no longer see"). A
 * `limit` step drives a cgroup meter toward a target usage%, glowing warn
 * when it crosses the cap ("throttled") — the point that namespaces (what you
 * can see) and cgroups (how much you can use) are two separate mechanisms.
 * A resource flagged `shared` keeps a dashed, still-flowing link to a faint
 * "sibling" process card even after isolation — the pod-shares-localhost
 * case: co-located containers keep one namespace shared while others split.
 */
export function paintContainerSandbox(ctx: CanvasRenderingContext2D, scene: SandboxScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;

  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const step = activeStep >= 0 ? scene.steps[activeStep] : undefined;
  const isolateActive = !!step && step.kind === "isolate";
  const limitActive = !!step && step.kind === "limit";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.5;
  const hostX = contentX;
  const hostY = contentY + band;
  const hostW = contentW;
  const hostH = contentH - band;

  // Host frame — the kernel/machine boundary everything else lives inside.
  const hostIn = easeOutCubic(enterT(env, 420, 30));
  ctx.save();
  ctx.globalAlpha = hostIn * 0.9;
  roundRect(ctx, hostX, hostY, hostW, hostH, unit * 0.6);
  ctx.strokeStyle = rgba(accent, 0.32);
  ctx.lineWidth = unit * 0.07;
  ctx.setLineDash([unit * 0.5, unit * 0.35]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `700 ${unit * 0.55}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.textDim;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("HOST KERNEL", hostX + unit * 0.5, hostY + unit * 0.7);
  ctx.restore();

  // Zone geometry — chips / process / meter stacked top-to-bottom, which
  // reads correctly in both 16:9 and 9:16 without branching on `vertical`.
  const hasMeter = !!scene.cgroupLimit;
  const chipH = Math.min(hostH * 0.16, unit * 2.1);
  const meterH = hasMeter ? Math.min(hostH * 0.12, unit * 1.4) : 0;
  const meterGap = hasMeter ? unit * 0.9 : unit * 0.2;
  const chipCenterY = hostY + unit * 1.5 + chipH / 2;
  const meterTop = hostY + hostH - unit * 0.9 - meterH;
  const procTop = chipCenterY + chipH / 2 + unit * 1.0;
  const procBottom = meterTop - meterGap;
  const procCenterY = (procTop + procBottom) / 2;
  const procMaxH = Math.max(unit * 2.6, procBottom - procTop);

  // Resource chips.
  const n = scene.resources.length;
  const chipW = Math.max(unit * 1.1, Math.min((hostW / n) * 0.74, unit * 2.3));
  const chipGap = (hostW - chipW * n) / (n + 1);
  const chipCx = (i: number) => hostX + chipGap * (i + 1) + chipW * (i + 0.5);

  // First isolate-step that hides each resource id (once hidden, stays hidden).
  const hiddenSince = new Map<string, number>();
  for (let k = 0; k <= activeStep; k++) {
    const s = scene.steps[k];
    if (s.kind !== "isolate") continue;
    s.hide.forEach((rid) => {
      if (!hiddenSince.has(rid)) hiddenSince.set(rid, k);
    });
  }
  const hiddenAlpha = (rid: string) => {
    const at = hiddenSince.get(rid);
    if (at == null) return 0;
    if (at < activeStep) return 1;
    if (at === activeStep) return easeOutCubic(clamp01(stepT / 0.65));
    return 0;
  };

  const chipCX: number[] = [];
  scene.resources.forEach((r, i) => {
    const cx = chipCx(i);
    chipCX.push(cx);
    const revealIn = easeOutCubic(enterT(env, 320, 60 + i * 55));
    if (revealIn <= 0) return;
    const hAlpha = hiddenAlpha(r.id);
    const x = cx - chipW / 2;
    const y = chipCenterY - chipH / 2;
    ctx.save();
    ctx.globalAlpha = introIn * revealIn;
    roundRect(ctx, x, y, chipW, chipH, unit * 0.26);
    ctx.fillStyle = rgba(accent, 0.06 + 0.08 * (1 - hAlpha));
    ctx.fill();
    ctx.strokeStyle = hAlpha > 0.5 ? "rgba(148,163,184,0.4)" : rgba(accent, 0.55);
    ctx.lineWidth = unit * 0.055;
    ctx.stroke();
    const iconColor = hAlpha > 0.5 ? THEME.textFaint : accent;
    drawIcon(ctx, RESOURCE_ICON[r.kind], cx, y + chipH * 0.4, chipH * 0.5, env, iconColor);
    if (chipW >= unit * CHIP_LABEL_MIN_UNIT) {
      const lblPx = fitFontSize(ctx, r.label, { maxW: chipW * 0.86, startPx: unit * 0.48, minPx: unit * 0.32, weight: 700 });
      ctx.font = `700 ${lblPx}px ${FONT_SANS}`;
      ctx.fillStyle = hAlpha > 0.5 ? THEME.textDim : THEME.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(r.label, cx, y + chipH * 0.85);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
    if (hAlpha > 0.05) {
      ctx.globalAlpha = introIn * revealIn * hAlpha * 0.85;
      ctx.strokeStyle = THEME.warn;
      ctx.lineWidth = unit * 0.065;
      ctx.beginPath();
      ctx.moveTo(x + chipW * 0.18, y + chipH * 0.82);
      ctx.lineTo(x + chipW * 0.82, y + chipH * 0.18);
      ctx.stroke();
    }
    ctx.restore();
  });

  // The shrinking sandbox: box width/height fall toward MIN_BOX_SCALE as the
  // average hidden-fraction across resources rises — "the more the namespace
  // hides, the tighter the box" is the whole visual argument of the scene.
  const shrinkFrac = scene.resources.reduce((sum, r) => sum + hiddenAlpha(r.id), 0) / Math.max(n, 1);
  const boxScale = 1 - shrinkFrac * (1 - MIN_BOX_SCALE);
  const fullBoxW = Math.min(hostW * 0.5, unit * 7.2);
  const fullBoxH = Math.min(procMaxH * 0.86, unit * 4.4);
  const popMul = 0.85 + 0.15 * easeOutBack(clamp01(enterT(env, 420, 160)));
  const boxW = fullBoxW * boxScale * popMul;
  const boxH = fullBoxH * boxScale * popMul;
  const cx = hostX + hostW / 2;
  const cy = procCenterY;
  const boxIn = easeOutCubic(enterT(env, 420, 160));
  const depth = unit * 0.5;

  // Connectors chip -> box, fading out as a resource is cut from view.
  scene.resources.forEach((r, i) => {
    const revealIn = easeOutCubic(enterT(env, 320, 60 + i * 55));
    if (revealIn <= 0) return;
    const hAlpha = hiddenAlpha(r.id);
    ctx.save();
    ctx.globalAlpha = introIn * boxIn * revealIn * (1 - hAlpha) * 0.55;
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = unit * 0.05;
    ctx.beginPath();
    ctx.moveTo(chipCX[i], chipCenterY + chipH / 2);
    ctx.lineTo(cx, cy - boxH / 2);
    ctx.stroke();
    ctx.restore();
  });

  // Sibling process ghost — resources flagged `shared` (e.g. the net
  // namespace two containers in one pod keep) stay linked even as the box
  // shrinks around everything else, growing in step with the isolation.
  const sharedResources = scene.resources.filter((r) => r.shared);
  if (sharedResources.length > 0 && shrinkFrac > 0.02) {
    const sibAlpha = shrinkFrac;
    const sibW = boxW * 0.6;
    const sibH = boxH * 0.6;
    const sibCx = Math.min(cx + fullBoxW * 0.6, hostX + hostW - sibW / 2 - unit * 0.3);
    const sibCy = cy - boxH * 0.52;
    ctx.save();
    ctx.globalAlpha = introIn * boxIn * sibAlpha * 0.5;
    isoBox3D(ctx, sibCx - sibW / 2, sibCy - sibH / 2, sibW, sibH, depth * 0.6, secondary);
    drawIcon(ctx, "server", sibCx, sibCy - sibH * 0.08, sibH * 0.4, env, "#eaf3ff");
    ctx.font = `700 ${unit * 0.4}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("sibling", sibCx, sibCy + sibH * 0.32);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();

    sharedResources.forEach((r) => {
      const idx = scene.resources.findIndex((x) => x.id === r.id);
      if (idx < 0) return;
      const from = { x: chipCX[idx], y: chipCenterY + chipH / 2 };
      const to = { x: sibCx, y: sibCy + sibH * 0.42 };
      ctx.save();
      ctx.globalAlpha = introIn * boxIn * sibAlpha * 0.8;
      ctx.strokeStyle = rgba(accent, 0.6);
      ctx.lineWidth = unit * 0.055;
      ctx.setLineDash([unit * 0.22, unit * 0.16]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if (sibAlpha > 0.35) flowDots(ctx, [from, to], env, { count: 2, speedMs: 1400, r: unit * 0.12, color: accent });
    });
  }

  // The sandbox box itself, on top of everything so far.
  ctx.save();
  ctx.globalAlpha = introIn * boxIn;
  const glow = isolateActive ? accentGlow : limitActive ? secondaryGlow : undefined;
  isoBox3D(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, depth, accent, glow);
  const bob = isolateActive || limitActive ? Math.sin(env.elapsedMs / 1200) * unit * 0.05 : 0;
  drawIcon(ctx, "server", cx, cy - boxH * 0.16 + bob, boxH * 0.4, env, "#eaf3ff");
  const labelPx = fitFontSize(ctx, scene.processLabel, { maxW: boxW * 0.82, startPx: unit * 0.8, minPx: unit * 0.46, weight: 800 });
  ctx.font = `800 ${labelPx}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(scene.processLabel, cx, cy + boxH * 0.22);
  const visibleCount = scene.resources.filter((r) => hiddenAlpha(r.id) < 0.5).length;
  ctx.font = `600 ${Math.min(unit * 0.42, boxH * 0.1)}px ${FONT_MONO}`;
  ctx.fillStyle = THEME.textDim;
  // boxH*0.4 left almost no clearance before the box's own bottom edge
  // (half-height = boxH*0.5), so the caption clipped against the border.
  ctx.fillText(`sees ${visibleCount}/${n}`, cx, cy + boxH * 0.33);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.restore();

  // Action pill naming the mechanism currently in play.
  if (step) {
    const pillIn = easeOutCubic(clamp01(stepT * 3));
    const label = step.kind === "isolate" ? "NAMESPACE · isolate" : "CGROUP · limit";
    const pillColor = step.kind === "isolate" ? accent : secondary;
    ctx.save();
    ctx.globalAlpha = introIn * pillIn;
    ctx.font = `800 ${unit * 0.48}px ${FONT_SANS}`;
    const tw = ctx.measureText(label).width;
    const ph = unit * 0.46 * 1.8;
    const py = cy - boxH / 2 - unit * 1.0;
    roundRect(ctx, cx - tw / 2 - unit * 0.5, py - ph / 2, tw + unit, ph, ph * 0.5);
    ctx.fillStyle = rgba(pillColor, 0.22);
    ctx.fill();
    ctx.strokeStyle = pillColor;
    ctx.lineWidth = unit * 0.045;
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, py + unit * 0.03);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  if (isolateActive) {
    const pr = (env.elapsedMs % 1400) / 1400;
    ctx.save();
    ctx.globalAlpha = introIn * (1 - pr) * 0.55;
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.08;
    roundRect(ctx, cx - boxW / 2 - pr * unit * 0.4, cy - boxH / 2 - pr * unit * 0.4, boxW + pr * unit * 0.8, boxH + pr * unit * 0.8, unit * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // Cgroup meter — a hard resource cap independent of what the namespace hides.
  if (scene.cgroupLimit) {
    const meterIn = easeOutCubic(enterT(env, 380, 200));
    const meterX = hostX + hostW * 0.14;
    const meterW = hostW * 0.72;
    let usageTarget = 0;
    let usageStart = 0;
    let usageStepIdx = -1;
    for (let k = 0; k <= activeStep; k++) {
      const s = scene.steps[k];
      if (s.kind === "limit" && s.usagePct != null) {
        usageStart = usageTarget;
        usageTarget = s.usagePct;
        usageStepIdx = k;
      }
    }
    const usage =
      usageStepIdx < 0
        ? 0
        : usageStepIdx === activeStep
          ? usageStart + (usageTarget - usageStart) * easeOutCubic(clamp01(stepT))
          : usageTarget;
    const cap = scene.cgroupLimit.capPct;
    const overCap = usage > cap + 0.5;

    ctx.save();
    ctx.globalAlpha = introIn * meterIn;
    roundRect(ctx, meterX, meterTop, meterW, meterH, meterH * 0.4);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.3);
    ctx.lineWidth = unit * 0.045;
    ctx.stroke();

    const fillW = Math.max(meterH * 0.4, clamp01(usage / 100) * meterW);
    if (overCap) {
      ctx.shadowColor = THEME.warn;
      ctx.shadowBlur = unit * (0.5 + 0.4 * idle(env, 700));
    }
    roundRect(ctx, meterX, meterTop, fillW, meterH, meterH * 0.4);
    ctx.fillStyle = overCap ? THEME.warn : THEME.good;
    ctx.fill();
    ctx.shadowBlur = 0;

    const capX = meterX + clamp01(cap / 100) * meterW;
    ctx.strokeStyle = THEME.text;
    ctx.lineWidth = unit * 0.06;
    ctx.beginPath();
    ctx.moveTo(capX, meterTop - unit * 0.15);
    ctx.lineTo(capX, meterTop + meterH + unit * 0.15);
    ctx.stroke();

    ctx.font = `700 ${unit * 0.42}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "start";
    ctx.fillText(`${scene.cgroupLimit.label} cap ${cap}%`, meterX, meterTop - unit * 0.32);
    ctx.textAlign = "end";
    ctx.fillStyle = overCap ? THEME.warn : THEME.textDim;
    ctx.fillText(`${Math.round(usage)}%${overCap ? " THROTTLED" : ""}`, meterX + meterW, meterTop - unit * 0.32);
    ctx.textAlign = "start";
    ctx.restore();

    if (limitActive) {
      const pr = (env.elapsedMs % 1400) / 1400;
      ctx.save();
      ctx.globalAlpha = introIn * (1 - pr) * 0.5;
      ctx.strokeStyle = secondary;
      ctx.lineWidth = unit * 0.06;
      roundRect(ctx, meterX - pr * unit * 0.3, meterTop - pr * unit * 0.3, meterW + pr * unit * 0.6, meterH + pr * unit * 0.6, meterH * 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

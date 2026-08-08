import * as THREE from "three";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatT,
  activeBeatIndex,
  flowDots,
  glowRing,
  drawArrowhead,
  rgba,
} from "./common";
import { render3D, projectToRect, studioLights, makeBlock, color3, type ThreeBundle } from "./three3d";
import type { PaintEnv } from "./index";

type ServerRackScene = Extract<Scene, { kind: "server_rack" }>;
type BladeStatus = "healthy" | "crashed" | "empty";

/** Per-scene beat state the cached three.js `update` reads each frame (build()
 *  runs once, so the live blade grid is passed through this side channel). */
type RackVS = {
  status: BladeStatus[][];
  leader?: { r: number; c: number };
  active?: { op: string; rackIdx: number; slots: number[]; to?: { r: number; c: number } };
  opT: number;
};
const rackState = new Map<string, RackVS>();

// Semantic colours: healthy/leader come from the subject palette; a crash reads
// red and an empty slot reads recessed-dark regardless of subject.
const CRASH = "#ef4444";
const EMPTY_FACE = "#1b222c";
const SHELL_FACE = "#12171f";
const EDGE = THEME.text;

// World-unit rack geometry (shared by build + label/overlay projection).
const BLADE_H = 0.34;
const BLADE_GAP = 0.1;
const RACK_D = 1.0;
const BLADE_D = 0.66;
const FRONT_Z = RACK_D / 2 - BLADE_D / 2 - 0.02;
const LED_Z = FRONT_Z + BLADE_D / 2 + 0.05;

const stackHeight = (slots: number) => slots * (BLADE_H + BLADE_GAP) - BLADE_GAP;
const shellHeight = (slots: number) => stackHeight(slots) + 0.5;
const slotY = (slot: number, slots: number) => stackHeight(slots) / 2 - BLADE_H / 2 - slot * (BLADE_H + BLADE_GAP);

/**
 * A physical data-center rendered in REAL 3-D (three.js): a row of server racks,
 * each holding blades with blinking indicator LEDs. Each beat mutates individual
 * blades — a blade crashes (goes dark and catches fire), a new blade scales in,
 * leadership fails over to a healthy blade in another rack, or a monitor probes a
 * suspected node. Racks sharing a `group` are wrapped in a dashed isolation
 * boundary (container networks / regions). Falls back to 2-D rack cards with LED
 * dots when WebGL is unavailable.
 *
 * Generalizes: failure detectors (probe → crash), container isolation (grouped
 * racks), and a globally consistent database (a leader replica that fails over).
 */
export function paintServerRack(ctx: CanvasRenderingContext2D, scene: ServerRackScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const key = scene.id;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true }) + unit * 0.4;

  // --- Replay the blade grid up to the active step (latest write wins). ---
  const rackIdx = new Map(scene.racks.map((r, i) => [r.id, i] as const));
  const status: BladeStatus[][] = scene.racks.map((r) => {
    const act = r.active ?? r.slots;
    return Array.from({ length: r.slots }, (_, sl): BladeStatus => (sl < act ? "healthy" : "empty"));
  });
  let leader: { r: number; c: number } | undefined;

  const applyStep = (step: ServerRackScene["steps"][number]): number[] => {
    const ri = rackIdx.get(step.rack);
    if (ri == null) return [];
    const touched: number[] = [];
    const healthySlots = () => status[ri].map((s, i) => (s === "healthy" ? i : -1)).filter((i) => i >= 0);
    switch (step.op) {
      case "crash": {
        const targets = step.slot != null ? [step.slot] : healthySlots();
        targets.forEach((sl) => {
          if (sl < status[ri].length) {
            status[ri][sl] = "crashed";
            touched.push(sl);
          }
        });
        break;
      }
      case "recover": {
        const targets = step.slot != null ? [step.slot] : status[ri].map((s, i) => (s === "crashed" ? i : -1)).filter((i) => i >= 0);
        targets.forEach((sl) => {
          status[ri][sl] = "healthy";
          touched.push(sl);
        });
        break;
      }
      case "scale": {
        let sl = step.slot ?? status[ri].findIndex((s) => s === "empty");
        if (sl < 0) sl = status[ri].length - 1;
        status[ri][sl] = "healthy";
        touched.push(sl);
        break;
      }
      case "lead": {
        const sl = step.slot ?? status[ri].findIndex((s) => s !== "crashed");
        if (sl >= 0) {
          if (status[ri][sl] === "empty") status[ri][sl] = "healthy";
          leader = { r: ri, c: sl };
          touched.push(sl);
        }
        break;
      }
      case "failover": {
        const sl = step.slot ?? (leader && leader.r === ri ? leader.c : status[ri].findIndex((s) => s === "healthy"));
        if (sl != null && sl >= 0 && sl < status[ri].length) {
          status[ri][sl] = "crashed";
          touched.push(sl);
        }
        if (step.to) {
          const tr = rackIdx.get(step.to.rack);
          if (tr != null && step.to.slot < status[tr].length) {
            if (status[tr][step.to.slot] === "empty") status[tr][step.to.slot] = "healthy";
            leader = { r: tr, c: step.to.slot };
          }
        }
        break;
      }
      case "probe": {
        const targets = step.slot != null ? [step.slot] : healthySlots().slice(0, 1);
        targets.forEach((sl) => touched.push(sl));
        break;
      }
    }
    return touched;
  };

  let activeInfo: RackVS["active"];
  for (let k = 0; k <= activeStep; k++) {
    const step = scene.steps[k];
    const touched = applyStep(step);
    if (k === activeStep) {
      const ri = rackIdx.get(step.rack);
      const to = step.to ? (() => { const tr = rackIdx.get(step.to!.rack); return tr != null ? { r: tr, c: step.to!.slot } : undefined; })() : undefined;
      if (ri != null) activeInfo = { op: step.op, rackIdx: ri, slots: touched, to };
    }
  }
  const stepT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  rackState.set(key, { status, leader, active: activeInfo, opT: stepT });

  const n = scene.racks.length;
  const maxSlots = Math.max(...scene.racks.map((r) => r.slots));
  const maxShellH = shellHeight(maxSlots);
  const rackW = vertical ? 1.15 : 1.35;
  const stride = rackW + (vertical ? 0.55 : 0.78);
  const spread = ((n - 1) * stride) / 2;
  const rackXAt = (i: number) => -spread + i * stride;

  const rect = { x: contentX, y: contentY + band * 0.35, w: contentW, h: contentH - band * 0.35 };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 40 : 33, 1, 0.1, 100);
    const dir = (vertical ? new THREE.Vector3(0.32, 0.34, 1) : new THREE.Vector3(0.55, 0.42, 1)).normalize();
    const dist = vertical ? 7.6 + Math.max(n * 1.0, maxShellH) : 6.6 + Math.max(n * 0.85, maxShellH * 1.05);
    camera.position.copy(dir.multiplyScalar(dist));
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(Math.max(spread * 3, 8), 16, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.24;
    grid.position.y = -maxShellH / 2 - 0.35;
    s.add(grid);

    const shells: THREE.Group[] = [];
    const bladeMeshes: THREE.Group[][] = [];
    scene.racks.forEach((r, ri) => {
      const shell = makeBlock(rackW, shellHeight(r.slots), RACK_D, SHELL_FACE, "#2b3648");
      shell.position.set(rackXAt(ri), 0, 0);
      s.add(shell);
      shells.push(shell);

      const arr: THREE.Group[] = [];
      for (let sl = 0; sl < r.slots; sl++) {
        const g = makeBlock(rackW * 0.82, BLADE_H, BLADE_D, accent, EDGE);
        g.position.set(rackXAt(ri), slotY(sl, r.slots), FRONT_Z);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), new THREE.MeshBasicMaterial({ color: color3(accent) }));
        led.position.set(-rackW * 0.3, 0, BLADE_D / 2 + 0.04);
        g.add(led);
        g.userData.led = led;
        s.add(g);
        arr.push(g);
      }
      bladeMeshes.push(arr);
    });

    const update = (elapsedMs: number) => {
      const st = rackState.get(key);
      shells.forEach((sh, ri) => {
        const t = easeOutCubic(clamp01((elapsedMs - ri * 70) / 420));
        sh.scale.set(1, Math.max(0.001, t), 1);
      });
      bladeMeshes.forEach((arr, ri) =>
        arr.forEach((g, sl) => {
          const s0: BladeStatus = st?.status[ri]?.[sl] ?? "healthy";
          const isLeader = !!st?.leader && st.leader.r === ri && st.leader.c === sl && s0 === "healthy";
          const phase = ri * 2.1 + sl * 1.3;
          const blink = 0.5 + 0.5 * Math.sin(elapsedMs / 650 + phase);
          const pulse = 0.5 + 0.5 * Math.sin(elapsedMs / 900);
          const isTarget = !!st?.active && st.active.rackIdx === ri && st.active.slots.includes(sl);
          const boost = isTarget && (st!.active!.op === "crash" || st!.active!.op === "failover") ? 0.9 * st!.opT : 0;

          let colHex = accent;
          let emissI = 0.2;
          let ledHex = accent;
          let ledB = 0.5;
          let ledVis = true;
          if (s0 === "empty") {
            colHex = EMPTY_FACE;
            emissI = 0.03;
            ledVis = false;
            ledB = 0;
          } else if (s0 === "crashed") {
            const fl = 0.35 + 0.65 * Math.abs(Math.sin(elapsedMs / 110 + phase));
            colHex = CRASH;
            emissI = (0.2 + 0.6 * fl) * (1 + boost);
            ledHex = CRASH;
            ledB = fl * 0.7;
            ledVis = fl > 0.55;
          } else if (isLeader) {
            colHex = secondary;
            emissI = 0.4 + 0.25 * pulse;
            ledHex = secondary;
            ledB = 0.7 + 0.3 * pulse;
          } else {
            emissI = 0.22 + 0.22 * blink;
            ledB = 0.35 + 0.6 * blink;
          }

          const mesh = g.children[0] as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.color.copy(color3(colHex).multiplyScalar(s0 === "empty" ? 0.5 : 0.6));
          mat.emissive.copy(color3(colHex));
          mat.emissiveIntensity = emissI;
          const led = g.userData.led as THREE.Mesh;
          (led.material as THREE.MeshBasicMaterial).color.copy(color3(ledHex).multiplyScalar(clamp01(ledB)));
          led.visible = ledVis;

          const boot = easeOutBack(clamp01((elapsedMs - ri * 70 - sl * 45) / 460));
          const sy = st?.active?.op === "scale" && isTarget ? easeOutBack(clamp01(st.opT * 1.25)) : boot;
          g.scale.set(1, Math.max(0.001, sy), 1);
        })
      );
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs);

  if (cam) {
    drawOverlay(ctx, scene, cam, rect, env, { status, leader, active: activeInfo, opT: stepT }, { rackW, rackXAt, maxShellH }, rackIdx);
  } else {
    drawFallback(ctx, scene, rect, env, { status, leader, active: activeInfo, opT: stepT }, rackIdx);
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

const bladeWorld = (scene: ServerRackScene, rackXAt: (i: number) => number, ri: number, sl: number, yOff: number) =>
  new THREE.Vector3(rackXAt(ri), slotY(sl, scene.racks[ri].slots) + yOff, LED_Z);

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  scene: ServerRackScene,
  cam: THREE.Camera,
  rect: { x: number; y: number; w: number; h: number },
  env: PaintEnv,
  vs: RackVS,
  geom: { rackW: number; rackXAt: (i: number) => number; maxShellH: number },
  rackIdx: Map<string, number>
) {
  const { unit } = env.layout;
  const { accent, secondary } = env.palette;
  const { rackW, rackXAt } = geom;
  const introIn = easeOutCubic(enterT(env, 460));

  // Group isolation boundaries (container networks / regions).
  const groups = new Map<string, number[]>();
  scene.racks.forEach((r, i) => {
    if (r.group) groups.set(r.group, [...(groups.get(r.group) ?? []), i]);
  });
  // Each member's label must clear the group's boundary — the boundary is one
  // shared screen-space envelope over the group, but a rack's own label point
  // is projected independently, and camera perspective means the two don't
  // stay in a fixed vertical relationship across different rack X positions
  // (an off-center rack's label can end up projected inside the boundary).
  const groupBoundaryBottom = new Map<number, number>();
  groups.forEach((members, name) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    members.forEach((ri) => {
      const slots = scene.racks[ri].slots;
      [
        new THREE.Vector3(rackXAt(ri) - rackW * 0.6, shellHeight(slots) / 2, RACK_D / 2),
        new THREE.Vector3(rackXAt(ri) + rackW * 0.6, -shellHeight(slots) / 2, RACK_D / 2),
      ].forEach((w) => {
        const p = projectToRect(cam, w, rect);
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      });
    });
    const isHot = vs.active != null && members.includes(vs.active.rackIdx);
    const pad = unit * 0.7;
    ctx.save();
    ctx.globalAlpha = introIn * (isHot ? 0.9 : 0.5);
    ctx.strokeStyle = rgba(secondary, isHot ? 0.9 : 0.5);
    ctx.lineWidth = unit * (isHot ? 0.11 : 0.07);
    ctx.setLineDash([unit * 0.5, unit * 0.34]);
    roundRect(ctx, minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2, unit * 0.6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `700 ${unit * 0.6}px ${FONT_SANS}`;
    ctx.fillStyle = secondary;
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(name, minX - pad + unit * 0.2, minY - pad - unit * 0.28);
    ctx.restore();
    members.forEach((ri) => groupBoundaryBottom.set(ri, maxY + pad));
  });

  // Rack labels under each cabinet.
  scene.racks.forEach((r, ri) => {
    const p = projectToRect(cam, new THREE.Vector3(rackXAt(ri), -shellHeight(r.slots) / 2 - 0.15, RACK_D / 2), rect);
    const boundaryY = groupBoundaryBottom.get(ri);
    const py = boundaryY != null ? Math.max(p.y, boundaryY + unit * 0.3) : p.y;
    drawChip(ctx, r.label, p.x, py, unit, accent, false, introIn);
  });

  // Persistent leader crown.
  if (vs.leader) {
    const p = projectToRect(cam, bladeWorld(scene, rackXAt, vs.leader.r, vs.leader.c, BLADE_H * 0.9), rect);
    glowRing(ctx, p.x, p.y, unit * 0.5, secondary, env, 1400);
    drawCrown(ctx, p.x, p.y, unit * 0.7, secondary, introIn);
  }

  // Active-step accents.
  const a = vs.active;
  if (a) {
    if (a.op === "crash" || a.op === "failover") {
      a.slots.forEach((sl) => {
        const p = bladeWorld(scene, rackXAt, a.rackIdx, sl, BLADE_H * 0.55);
        const sp = projectToRect(cam, p, rect);
        drawFlames(ctx, sp.x, sp.y, unit * 1.3, easeOutCubic(clamp01(vs.opT * 1.4)), env.elapsedMs, sl * 1.7);
      });
    }
    if (a.op === "failover" && a.to && a.slots.length) {
      const from = projectToRect(cam, bladeWorld(scene, rackXAt, a.rackIdx, a.slots[0], 0), rect);
      const to = projectToRect(cam, bladeWorld(scene, rackXAt, a.to.r, a.to.c, 0), rect);
      const grow = easeOutCubic(clamp01(vs.opT * 1.3));
      const end = { x: from.x + (to.x - from.x) * grow, y: from.y + (to.y - from.y) * grow };
      ctx.save();
      ctx.globalAlpha = introIn;
      ctx.strokeStyle = rgba(secondary, 0.8);
      ctx.lineWidth = unit * 0.1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      if (grow > 0.9) {
        ctx.fillStyle = secondary;
        drawArrowhead(ctx, to.x, to.y, Math.atan2(to.y - from.y, to.x - from.x), unit * 0.4);
      }
      ctx.restore();
      if (grow > 0.15) flowDots(ctx, [from, end], env, { count: 2, speedMs: 1200, r: unit * 0.16, color: secondary });
    }
    if (a.op === "probe") {
      a.slots.forEach((sl) => {
        const p = projectToRect(cam, bladeWorld(scene, rackXAt, a.rackIdx, sl, 0), rect);
        glowRing(ctx, p.x, p.y, unit * 0.55, accent, env, 900);
        glowRing(ctx, p.x, p.y, unit * 0.55, accent, env, 900 * 1.7);
      });
    }
    const noteStep = activeStepOf(scene, vs, rackIdx);
    if (noteStep?.note && a.slots.length) {
      const p = projectToRect(cam, bladeWorld(scene, rackXAt, a.rackIdx, a.slots[0], BLADE_H * 0.9), rect);
      drawChip(ctx, noteStep.note, p.x + unit * 0.6, p.y, unit, a.op === "probe" ? accent : secondary, true, introIn);
    }
  }
}

function drawChip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, unit: number, accent: string, active: boolean, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${active ? 800 : 600} ${unit * 0.62}px ${FONT_SANS}`;
  const tw = ctx.measureText(text).width;
  const padX = unit * 0.42;
  const chipW = tw + padX * 2;
  const chipH = unit * 1.15;
  const bx = x - chipW / 2;
  const by = y;
  ctx.fillStyle = rgba(THEME.bgBottom, 0.82);
  roundRect(ctx, bx, by, chipW, chipH, unit * 0.3);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, active ? 0.95 : 0.45);
  ctx.lineWidth = active ? 2 : 1;
  ctx.stroke();
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, by + chipH / 2);
  ctx.restore();
}

function drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  const w = size;
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w / 2, y - size * 0.42);
  ctx.lineTo(x - w / 4, y - size * 0.18);
  ctx.lineTo(x, y - size * 0.5);
  ctx.lineTo(x + w / 4, y - size * 0.18);
  ctx.lineTo(x + w / 2, y - size * 0.42);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFlames(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, t: number, elapsedMs: number, phase: number) {
  if (t <= 0) return;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const fl = 0.5 + 0.5 * Math.sin(elapsedMs / 90 + i * 1.7 + phase);
    const hgt = size * (0.9 + 0.55 * fl) * t;
    const fx = x + (i - 1) * size * 0.32;
    const grad = ctx.createLinearGradient(fx, y, fx, y - hgt);
    grad.addColorStop(0, rgba("#facc15", 0.9));
    grad.addColorStop(0.5, rgba("#f97316", 0.78));
    grad.addColorStop(1, rgba("#ef4444", 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(fx - size * 0.24, y);
    ctx.quadraticCurveTo(fx - size * 0.14, y - hgt * 0.5, fx, y - hgt);
    ctx.quadraticCurveTo(fx + size * 0.14, y - hgt * 0.5, fx + size * 0.24, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawFallback(
  ctx: CanvasRenderingContext2D,
  scene: ServerRackScene,
  rect: { x: number; y: number; w: number; h: number },
  env: PaintEnv,
  vs: RackVS,
  rackIdx: Map<string, number>
) {
  const { unit } = env.layout;
  const { accent, secondary } = env.palette;
  const introIn = easeOutCubic(enterT(env, 460));
  const n = scene.racks.length;

  const gap = unit * 1.1;
  const cardW = Math.min((rect.w - gap * (n - 1)) / n, unit * 7.5);
  const totalW = cardW * n + gap * (n - 1);
  const startX = rect.x + (rect.w - totalW) / 2;
  const maxSlots = Math.max(...scene.racks.map((r) => r.slots));
  const bladeH = Math.min(unit * 1.1, (rect.h * 0.66) / maxSlots);
  const bladeGap = bladeH * 0.28;

  const cardCenter = (ri: number) => {
    const slots = scene.racks[ri].slots;
    const cardH = slots * (bladeH + bladeGap) + unit * 1.8;
    const cx = startX + ri * (cardW + gap) + cardW / 2;
    const cy = rect.y + rect.h / 2;
    return { cx, cy, cardH };
  };
  const bladeRect = (ri: number, sl: number) => {
    const { cx, cy, cardH } = cardCenter(ri);
    const stackTop = cy - cardH / 2 + unit * 1.4;
    return { x: cx - cardW * 0.42, y: stackTop + sl * (bladeH + bladeGap), w: cardW * 0.84, h: bladeH };
  };

  // Group isolation boundaries.
  const groups = new Map<string, number[]>();
  scene.racks.forEach((r, i) => {
    if (r.group) groups.set(r.group, [...(groups.get(r.group) ?? []), i]);
  });
  groups.forEach((members, name) => {
    const first = cardCenter(members[0]);
    const last = cardCenter(members[members.length - 1]);
    const maxH = Math.max(...members.map((m) => cardCenter(m).cardH));
    const pad = unit * 0.6;
    const bx = startX + members[0] * (cardW + gap) - pad;
    const by = first.cy - maxH / 2 - pad;
    const bw = last.cx + cardW / 2 - (first.cx - cardW / 2) + pad * 2;
    const isHot = vs.active != null && members.includes(vs.active.rackIdx);
    ctx.save();
    ctx.globalAlpha = introIn * (isHot ? 0.9 : 0.5);
    ctx.strokeStyle = rgba(secondary, isHot ? 0.9 : 0.5);
    ctx.lineWidth = unit * (isHot ? 0.1 : 0.06);
    ctx.setLineDash([unit * 0.5, unit * 0.34]);
    roundRect(ctx, bx, by, bw, maxH + pad * 2, unit * 0.6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `700 ${unit * 0.6}px ${FONT_SANS}`;
    ctx.fillStyle = secondary;
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(name, bx + unit * 0.2, by - unit * 0.3);
    ctx.restore();
  });

  scene.racks.forEach((r, ri) => {
    const { cx, cy, cardH } = cardCenter(ri);
    const isHot = vs.active?.rackIdx === ri;
    ctx.save();
    ctx.globalAlpha = introIn;
    roundRect(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH, unit * 0.5);
    ctx.fillStyle = rgba(SHELL_FACE, 0.95);
    ctx.fill();
    ctx.strokeStyle = isHot ? accent : rgba(accent, 0.4);
    ctx.lineWidth = isHot ? 2 : 1.2;
    ctx.stroke();
    ctx.restore();

    // Rack label.
    ctx.save();
    ctx.globalAlpha = introIn;
    const labelPx = fitFontSize(ctx, r.label, { maxW: cardW * 0.86, startPx: unit * 0.78, minPx: unit * 0.5, weight: 700 });
    ctx.font = `700 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(r.label, cx, cy - cardH / 2 + unit * 1.0);
    ctx.restore();

    for (let sl = 0; sl < r.slots; sl++) {
      const b = bladeRect(ri, sl);
      const s0 = vs.status[ri][sl];
      const isLeader = !!vs.leader && vs.leader.r === ri && vs.leader.c === sl && s0 === "healthy";
      const phase = ri * 2.1 + sl * 1.3;
      const blink = 0.5 + 0.5 * Math.sin(env.elapsedMs / 650 + phase);
      const boot = easeOutBack(clamp01((env.elapsedMs - ri * 70 - sl * 45) / 460));
      const isTarget = vs.active?.rackIdx === ri && vs.active.slots.includes(sl);
      const sc = vs.active?.op === "scale" && isTarget ? easeOutBack(clamp01(vs.opT * 1.25)) : boot;
      if (sc <= 0.01) continue;

      let face = accent, ledOn = true, ledCol = accent;
      if (s0 === "empty") { face = EMPTY_FACE; ledOn = false; }
      else if (s0 === "crashed") {
        const fl = 0.35 + 0.65 * Math.abs(Math.sin(env.elapsedMs / 110 + phase));
        face = CRASH; ledCol = CRASH; ledOn = fl > 0.55;
      } else if (isLeader) { face = secondary; ledCol = secondary; }

      ctx.save();
      ctx.globalAlpha = introIn * clamp01(sc);
      const bh = b.h * clamp01(sc);
      const by = b.y + (b.h - bh) / 2;
      roundRect(ctx, b.x, by, b.w, bh, unit * 0.14);
      ctx.fillStyle = s0 === "empty" ? rgba(EMPTY_FACE, 0.9) : rgba(face, s0 === "crashed" ? 0.28 : 0.2);
      ctx.fill();
      ctx.strokeStyle = s0 === "empty" ? rgba(THEME.textDim, 0.3) : rgba(face, 0.8);
      if (s0 === "empty") ctx.setLineDash([unit * 0.2, unit * 0.18]);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
      // vent slits
      if (s0 !== "empty") {
        ctx.strokeStyle = rgba(face, 0.4);
        ctx.lineWidth = 1;
        for (let v = 0; v < 3; v++) {
          const vx = b.x + b.w * 0.4 + v * unit * 0.22;
          ctx.beginPath();
          ctx.moveTo(vx, by + bh * 0.32);
          ctx.lineTo(vx, by + bh * 0.68);
          ctx.stroke();
        }
      }
      // LED
      if (ledOn) {
        ctx.beginPath();
        ctx.arc(b.x + unit * 0.4, by + bh / 2, unit * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = ledCol;
        ctx.shadowColor = ledCol;
        ctx.shadowBlur = (s0 === "crashed" ? unit * 0.5 : unit * (0.2 + 0.4 * blink));
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();

      if (isLeader) drawCrown(ctx, b.x + b.w + unit * 0.35, by + bh / 2 + unit * 0.35, unit * 0.6, secondary, introIn);
      if (isTarget && (vs.active?.op === "crash" || vs.active?.op === "failover"))
        drawFlames(ctx, b.x + b.w / 2, by, unit * 1.1, easeOutCubic(clamp01(vs.opT * 1.4)), env.elapsedMs, phase);
      if (isTarget && vs.active?.op === "probe") glowRing(ctx, b.x + b.w / 2, by + bh / 2, unit * 0.5, accent, env, 900);
    }
  });

  // Failover arrow between cards.
  const a = vs.active;
  if (a?.op === "failover" && a.to && a.slots.length) {
    const from = bladeRect(a.rackIdx, a.slots[0]);
    const to = bladeRect(a.to.r, a.to.c);
    const p0 = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    const p1 = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
    const grow = easeOutCubic(clamp01(vs.opT * 1.3));
    const end = { x: p0.x + (p1.x - p0.x) * grow, y: p0.y + (p1.y - p0.y) * grow };
    ctx.save();
    ctx.globalAlpha = introIn;
    ctx.strokeStyle = rgba(secondary, 0.8);
    ctx.lineWidth = unit * 0.1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    if (grow > 0.9) {
      ctx.fillStyle = secondary;
      drawArrowhead(ctx, p1.x, p1.y, Math.atan2(p1.y - p0.y, p1.x - p0.x), unit * 0.4);
    }
    ctx.restore();
    if (grow > 0.15) flowDots(ctx, [p0, end], env, { count: 2, speedMs: 1200, r: unit * 0.15, color: secondary });
  }

  // Active-step note badge.
  const noteStep = activeStepOf(scene, vs, rackIdx);
  if (noteStep?.note && a?.slots.length) {
    const b = bladeRect(a.rackIdx, a.slots[0]);
    drawChip(ctx, noteStep.note, b.x + b.w + unit * 1.4, b.y - unit * 0.2, unit, a.op === "probe" ? accent : secondary, true, introIn);
  }
}

/** The scene step whose applied mutation matches the current active state. */
function activeStepOf(scene: ServerRackScene, vs: RackVS, rackIdx: Map<string, number>): ServerRackScene["steps"][number] | undefined {
  if (!vs.active) return undefined;
  for (let i = scene.steps.length - 1; i >= 0; i--) {
    const st = scene.steps[i];
    if (rackIdx.get(st.rack) === vs.active.rackIdx && st.op === vs.active.op) return st;
  }
  return undefined;
}

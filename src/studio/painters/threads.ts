import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  enterT,
  shade,
  clamp01,
  roundRect,
  drawSceneTitle,
  fitFontSize,
  beatWindow,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type ThreadsScene = Extract<Scene, { kind: "threads" }>;
type Task = ThreadsScene["tasks"][number];

const PAST_ALPHA = 0.7;
const MIN_TIME_SPAN = 12;
/** Idle block face — matches `table.ts`/`bits.ts`/`circuit.ts`'s idle-face
 *  convention rather than a one-off hex. */
const IDLE_FACE = shade(THEME.panel, 0.09);
/** A "wait" task reads as an inert dark-glass slab, distinct from the
 *  idle-face tone used for not-yet-revealed tasks. */
const WAIT_FACE = "#0f172a";
const WAIT_LINE = "#475569";
/** Lane-label / marker chip fill — same convention as `cipher.ts`'s
 *  `INK_FILL`. */
const INK_FILL = "#0e2433";

function hatchBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, unit: number, color: string) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = unit * 0.06;
  const gap = unit * 0.5;
  for (let i = -h; i < w + h; i += gap) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function paintThreads(ctx: CanvasRenderingContext2D, scene: ThreadsScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = active - offset;
  const introIn = easeOutCubic(enterT(env, 380));
  const key = scene.id + "-thr3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  
  const nLanes = scene.lanes.length;
  const labelW = vertical ? unit * 3.2 : unit * 3.8;
  const trackX0 = contentX + labelW;
  const trackW = contentW - labelW;
  const laneAreaY = contentY + band;
  const laneBottom = vertical ? Math.min(contentY + contentH, layout.h * 0.86) : contentY + contentH;
  const laneAreaH = laneBottom - laneAreaY;
  
  const laneGap = unit * (vertical ? 1.2 : 0.9);
  const laneH = (laneAreaH - laneGap * (nLanes - 1)) / nLanes;
  const laneTop = (i: number) => laneAreaY + i * (laneH + laneGap);
  const laneCenter = (i: number) => laneTop(i) + laneH / 2;
  const fenceTop = laneTop(0) - unit * 0.4;
  const fenceBottom = laneTop(nLanes - 1) + laneH + unit * 0.2;

  const timeSpan = Math.max(...scene.tasks.map((t) => t.start + t.len), MIN_TIME_SPAN);

  const revealStep = new Map<string, number>();
  scene.steps.forEach((st, k) => st.reveal.forEach((id) => { if (!revealStep.has(id)) revealStep.set(id, k); }));
  for (const t of scene.tasks) if (!revealStep.has(t.id)) revealStep.set(t.id, 0);

  const stepBeatT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const clashNow = new Set<string>(activeStep >= 0 ? scene.steps[activeStep].clash : []);

  /**
   * `qa/ledger.json` -> systemic `2d-layout-round-tripped-through-camera`,
   * with a second-order symptom: `worldPos` mapped a task's start/len across
   * the FULL `-spreadX..spreadX` range regardless of `labelW` — the gutter
   * reserved for the "Thread A"/"Thread B" chips — so the earliest tasks
   * projected under the same screen X as the lane labels and rendered on
   * top of them (measured: "Thread A" and the "read" task label unreadable
   * on top of each other). Tasks are now placed in pixels first, inside the
   * SAME `trackX0..trackX0+trackW` band the lane-label gutter math already
   * carves out, via an on-axis camera + `mappingAt`/`toWorld`.
   */
  const rect = { x: contentX, y: laneAreaY, w: contentW, h: laneAreaH };
  const DEPTH = 0.5;
  const pixelPos = (start: number, len: number, lane: number): { x: number; y: number } => ({
    x: trackX0 + ((start + len / 2) / timeSpan) * trackW,
    y: laneCenter(Math.min(lane, nLanes - 1)),
  });
  const pixelW = (len: number) => (len / timeSpan) * trackW;

  /** Pixels-per-world-unit and pixel origin on the z=`z` plane, for a camera
   *  sitting ON-AXIS at (0,0,D) — exact, invertible pixel<->world map (same
   *  technique as `table.ts`/`circuit.ts`/`diagram.ts`). */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, vertical ? 15 : 12);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

    const models: { mesh: THREE.Group, task: Task, base: THREE.Vector3, baseWorld: { x: number; y: number } }[] = [];

    // Lane markers, one per lane, spanning the full track width in pixels.
    for (let i = 0; i < nLanes; i++) {
        const cy = laneCenter(i);
        const wLeft = toWorld(trackX0, cy);
        const wRight = toWorld(trackX0 + trackW, cy);
        const lineGeo = new THREE.BoxGeometry(wRight.x - wLeft.x, 0.05, 0.05);
        const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(THEME.textDim), transparent: true, opacity: 0.1 });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set((wLeft.x + wRight.x) / 2, wLeft.y, 0);
        s.add(line);
    }

    scene.tasks.forEach((task) => {
        const lane = Math.min(task.lane, nLanes - 1);
        const wPx = pixelW(task.len) * 0.95;
        const hPx = Math.min(laneH * 0.72, unit * 2.2);
        const base = new THREE.Vector3(wPx / m.sx, hPx / m.sy, DEPTH);
        const g = makeBlock(1, 1, 1, IDLE_FACE, THEME.textDim);
        g.scale.copy(base);
        const p = pixelPos(task.start, task.len, lane);
        const w = toWorld(p.x, p.y);
        g.position.set(w.x, w.y, 0);
        s.add(g);
        models.push({ mesh: g, task, base, baseWorld: w });
    });

    const update = (_elapsedMs: number, ctxData: { gIn: number, aStep: number, sBeatT: number, clash: Set<string> }) => {
      const { gIn, aStep, sBeatT, clash } = ctxData;

      models.forEach(({ mesh, task, base, baseWorld }) => {
        const rStep = revealStep.get(task.id) ?? 0;
        const visible = rStep <= aStep;

        const local = rStep === aStep ? sBeatT : 1;
        const grow = visible ? easeOutCubic(clamp01(local / 0.4)) : 0;
        const appear = visible ? easeOutCubic(clamp01(local / 0.35)) : 0;

        mesh.visible = appear > 0;

        // Scale from left to right: pivot is center, so shift X by the
        // shrunk half-width (in WORLD units, matching `base.x`).
        const maxScale = Math.max(0.01, grow);
        mesh.scale.set(base.x * maxScale, base.y, base.z);
        mesh.position.set(baseWorld.x - (base.x / 2) * (1 - maxScale), baseWorld.y, 0);

        const isCurrent = rStep === aStep;
        const isClash = clash.has(task.id);

        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial | THREE.LineBasicMaterial;
                mat.transparent = true;
                if (mat instanceof THREE.MeshPhysicalMaterial) {
                    mat.opacity = appear * gIn * (isCurrent ? 1 : PAST_ALPHA);
                    if (task.kind === "wait") {
                        mat.color.setStyle(WAIT_FACE);
                        mat.emissive.setStyle(WAIT_FACE);
                        mat.emissiveIntensity = 0;
                        mat.transmission = 0.5;
                    } else if (task.kind === "crit") {
                        mat.color.setStyle(THEME.warn);
                        mat.emissive.setStyle(THEME.warn);
                        mat.emissiveIntensity = isCurrent || isClash ? 0.3 : 0.1;
                    } else {
                        mat.color.setStyle(accent);
                        mat.emissive.setStyle(accent);
                        mat.emissiveIntensity = isCurrent || isClash ? 0.3 : 0.1;
                    }
                } else if (mat instanceof THREE.LineBasicMaterial) {
                    mat.opacity = appear * gIn * 0.6;
                    mat.color.setStyle(task.kind === "crit" ? THEME.warn : (task.kind === "wait" ? WAIT_LINE : accent));
                }
            }
        });
      });
    };

    return { scene: s, camera, update };
  };

  const ctxData = { gIn: introIn, aStep: activeStep, sBeatT: stepBeatT, clash: clashNow };
  render3D(ctx, key, rect, build, env.elapsedMs, ctxData);

  const get2D = (start: number, len: number, lane: number) => pixelPos(start, len, lane);

  // 2D Overlays

  // Lane labels
  for (let i = 0; i < nLanes; i++) {
    const laneIn = easeOutCubic(enterT(env, 320, 80 + i * 70));
    if (laneIn <= 0) continue;

    const cy = laneCenter(i);

    ctx.save();
    ctx.globalAlpha = introIn * laneIn;

    const lbl = scene.lanes[i].label;
    const chipW = labelW - unit * 0.7;
    const chipH = Math.min(laneH * 0.7, unit * 1.7);
    roundRect(ctx, contentX, cy - chipH / 2, chipW, chipH, unit * 0.3);
    ctx.fillStyle = INK_FILL;
    ctx.fill();
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    const fontPx = fitFontSize(ctx, lbl, { maxW: chipW - unit * 0.5, startPx: unit * 0.7, minPx: unit * 0.42, weight: 700, family: FONT_MONO });
    ctx.font = `700 ${fontPx}px ${FONT_MONO}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(lbl, contentX + chipW / 2, cy + fontPx * 0.34);
    ctx.textAlign = "start";
    ctx.restore();
  }

  // Task labels and overlays
  for (const task of scene.tasks) {
    const rStep = revealStep.get(task.id) ?? 0;
    if (rStep > activeStep) continue;
    const lane = Math.min(task.lane, nLanes - 1);
    const isActiveReveal = rStep === activeStep && stepBeatT < 1;
    const local = rStep === activeStep ? stepBeatT : 1;
    const grow = easeOutCubic(clamp01(local / 0.4));
    if (grow <= 0) continue;
    const appear = easeOutCubic(clamp01(local / 0.35));

    const p3 = get2D(task.start, task.len, lane);
    const fullW = pixelW(task.len);
    const w = fullW * grow;
    const x = trackX0 + (task.start / timeSpan) * trackW;
    // Y is centered
    const y = p3.y - (unit * 1.0);
    const blockH = unit * 2.0;

    const isCurrent = rStep === activeStep;
    const isClash = clashNow.has(task.id);

    ctx.save();
    ctx.globalAlpha = appear * introIn * (isCurrent ? 1 : PAST_ALPHA);

    // Active-reveal shimmer sweep (2D overlay part)
    if (isActiveReveal && task.kind !== "wait") {
      ctx.save();
      roundRect(ctx, x, y, w, blockH, unit * 0.2);
      ctx.clip();
      const sx = x + ((env.elapsedMs / 700) % 1) * Math.max(w, 1);
      const sh = ctx.createLinearGradient(sx - unit, 0, sx + unit, 0);
      sh.addColorStop(0, rgba(accent, 0));
      sh.addColorStop(0.5, "rgba(255,255,255,0.22)");
      sh.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = sh;
      ctx.fillRect(sx - unit, y, unit * 2, blockH);
      ctx.restore();
    }

    if (w > unit * 2) {
      const pad = unit * 0.5;
      const fontPx = fitFontSize(ctx, task.label, { maxW: w - pad * 2, startPx: unit * 0.7, minPx: unit * 0.42, weight: 700 });
      ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
      if (ctx.measureText(task.label).width <= w - pad * 2) {
        ctx.fillStyle = task.kind === "run" ? "#ffffff" : THEME.text; // Better contrast on 3D blocks
        if (task.kind === "wait") ctx.fillStyle = THEME.textDim;
        ctx.textAlign = "center";
        ctx.fillText(task.label, x + w / 2, p3.y + fontPx * 0.34);
        ctx.textAlign = "start";
      }
    }
    
    if (isClash) {
      const ringF = (stepBeatT * 2) % 1;
      const g = unit * (0.1 + 0.7 * easeOutCubic(ringF));
      ctx.save();
      ctx.globalAlpha = 0.7 * (1 - ringF) * introIn;
      ctx.strokeStyle = THEME.danger;
      ctx.lineWidth = unit * 0.1;
      roundRect(ctx, x - g, y - g, w + g * 2, blockH + g * 2, unit * 0.2 + g);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  if (clashNow.size >= 2) {
    const tasks = scene.tasks.filter((t) => clashNow.has(t.id));
    const oStart = Math.max(...tasks.map((t) => t.start));
    const oEnd = Math.min(...tasks.map((t) => t.start + t.len));
    if (oEnd > oStart) {
      const l1 = Math.min(tasks[0].lane, nLanes - 1);
      const l2 = Math.min(tasks[1].lane, nLanes - 1);
      const p1 = get2D(oStart, oEnd - oStart, l1);
      const p2 = get2D(oStart, oEnd - oStart, l2);
      
      const bx = (p1.x + p2.x) / 2;
      const by = (p1.y + p2.y) / 2;
      const burst = 0.6 + 0.4 * Math.sin(env.elapsedMs / 120);
      ctx.save();
      ctx.globalAlpha = introIn * burst;
      ctx.fillStyle = THEME.danger;
      ctx.shadowColor = rgba(THEME.danger, 0.7);
      ctx.shadowBlur = unit * 1.0;
      ctx.font = `900 ${unit * 1.3}px ${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("⚡", bx, by + unit * 0.45);
      ctx.textAlign = "start";
      ctx.restore();
    }
  }

  // Markers
  scene.steps.forEach((st, k) => {
    if (!st.marker || k > activeStep) return;
    const isCurrent = k === activeStep;
    const drawT = isCurrent ? easeOutCubic(clamp01(beatT(env.beats, offset + k, totalBeats, env.p) * 2)) : 1;
    
    const mx = trackX0 + (st.marker.at / timeSpan) * trackW;
    const myTop = fenceTop;
    const myBot = fenceBottom;

    const yEnd = myTop + (myBot - myTop) * drawT;
    ctx.save();
    ctx.globalAlpha = introIn * (isCurrent ? 1 : 0.55);
    ctx.strokeStyle = THEME.warn;
    ctx.lineWidth = unit * 0.07;
    ctx.setLineDash([unit * 0.4, unit * 0.3]);
    ctx.beginPath();
    ctx.moveTo(mx, myTop);
    ctx.lineTo(mx, yEnd);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Label chip at top — clamped so a marker near either end of the track
    // can't hang its chip off the frame.
    ctx.font = `700 ${unit * 0.55}px ${FONT_MONO}`;
    const tw = ctx.measureText(st.marker.label).width;
    const chipW = tw + unit * 0.6;
    const chipCx = Math.max(contentX + chipW / 2, Math.min(contentX + contentW - chipW / 2, mx));
    roundRect(ctx, chipCx - chipW / 2, myTop - unit * 1.1, chipW, unit * 0.9, unit * 0.22);
    ctx.fillStyle = INK_FILL;
    ctx.fill();
    ctx.strokeStyle = rgba(THEME.warn, 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.warn;
    ctx.textAlign = "center";
    ctx.fillText(st.marker.label, chipCx, myTop - unit * 0.45);
    ctx.textAlign = "start";
    ctx.restore();
  });

  ctx.textAlign = "start";
}
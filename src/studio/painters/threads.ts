import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutCubic,
  enterT,
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

const DANGER = "#f87171";
const PAST_ALPHA = 0.7;
const MIN_TIME_SPAN = 12;

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
  const timeX = (t: number) => trackX0 + (t / timeSpan) * trackW;

  const revealStep = new Map<string, number>();
  scene.steps.forEach((st, k) => st.reveal.forEach((id) => { if (!revealStep.has(id)) revealStep.set(id, k); }));
  for (const t of scene.tasks) if (!revealStep.has(t.id)) revealStep.set(t.id, 0);

  const stepBeatT = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const clashNow = new Set<string>(activeStep >= 0 ? scene.steps[activeStep].clash : []);
  
  // 3D setup
  const rect = { x: contentX, y: laneAreaY, w: contentW, h: laneAreaH };
  const spreadX = 8.5;
  const spreadZ = 3.5;
  
  const worldPos = (start: number, len: number, lane: number) => {
    // start 0..timeSpan maps to -spreadX..spreadX
    const cx = (start + len / 2) / timeSpan; // 0..1
    const x = (cx - 0.5) * spreadX * 2;
    const z = nLanes === 1 ? 0 : (lane / (nLanes - 1) - 0.5) * spreadZ * 2;
    return new THREE.Vector3(x, 0, z);
  };
  const worldW = (len: number) => (len / timeSpan) * spreadX * 2;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 10, vertical ? 10 : 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(Math.max(spreadX, spreadZ) * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 4, Math.max(spreadX, spreadZ) * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models: { mesh: THREE.Group, task: Task }[] = [];
    
    // Lane markers in 3D
    for (let i = 0; i < nLanes; i++) {
        const lineGeo = new THREE.BoxGeometry(spreadX * 2.2, 0.05, 0.05);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.1 });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.z = nLanes === 1 ? 0 : (i / (nLanes - 1) - 0.5) * spreadZ * 2;
        line.position.y = -0.4;
        s.add(line);
    }
    
    scene.tasks.forEach((task) => {
        const w = worldW(task.len);
        const lane = Math.min(task.lane, nLanes - 1);
        const g = makeBlock(w * 0.95, 0.4, 1.0, "#1e293b", "#31435a");
        g.position.copy(worldPos(task.start, task.len, lane));
        s.add(g);
        models.push({ mesh: g, task });
    });

    const update = (elapsedMs: number, ctxData: { gIn: number, aStep: number, sBeatT: number, clash: Set<string> }) => {
      const { gIn, aStep, sBeatT, clash } = ctxData;
      
      models.forEach(({ mesh, task }) => {
        const rStep = revealStep.get(task.id) ?? 0;
        const visible = rStep <= aStep;
        
        const local = rStep === aStep ? sBeatT : 1;
        const grow = visible ? easeOutCubic(clamp01(local / 0.4)) : 0;
        const appear = visible ? easeOutCubic(clamp01(local / 0.35)) : 0;
        
        mesh.visible = appear > 0;
        
        const baseP = worldPos(task.start, task.len, Math.min(task.lane, nLanes - 1));
        
        // Scale from left to right like 2D
        const w = worldW(task.len);
        // Pivot is center, so to scale from left, shift X
        const maxScale = Math.max(0.01, grow);
        mesh.scale.set(maxScale, 1, 1);
        mesh.position.x = baseP.x - (w / 2) * (1 - maxScale);
        
        const isCurrent = rStep === aStep;
        const isClash = clash.has(task.id);
        
        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial | THREE.LineBasicMaterial;
                mat.transparent = true;
                if (mat instanceof THREE.MeshPhysicalMaterial) {
                    mat.opacity = appear * gIn * (isCurrent ? 1 : PAST_ALPHA);
                    if (task.kind === "wait") {
                        mat.color.setStyle("#0f172a");
                        mat.emissive.setStyle("#0f172a");
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
                    mat.color.setStyle(task.kind === "crit" ? THEME.warn : (task.kind === "wait" ? "#475569" : accent));
                }
            }
        });
      });
    };

    return { scene: s, camera, update };
  };

  const ctxData = { gIn: introIn, aStep: activeStep, sBeatT: stepBeatT, clash: clashNow };
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, ctxData);
  if (!cam) return;

  const get2D = (start: number, len: number, lane: number) => projectToRect(cam, worldPos(start, len, lane), rect);

  // 2D Overlays

  // Lane labels
  for (let i = 0; i < nLanes; i++) {
    const laneIn = easeOutCubic(enterT(env, 320, 80 + i * 70));
    if (laneIn <= 0) continue;
    
    // We map the lane center from 3D to get accurate Y
    const p3 = projectToRect(cam, new THREE.Vector3(0, 0, nLanes === 1 ? 0 : (i / (nLanes - 1) - 0.5) * spreadZ * 2), rect);
    const cy = p3.y;
    
    ctx.save();
    ctx.globalAlpha = introIn * laneIn;

    const lbl = scene.lanes[i].label;
    const chipW = labelW - unit * 0.7;
    const chipH = Math.min(laneH * 0.7, unit * 1.7);
    roundRect(ctx, contentX, cy - chipH / 2, chipW, chipH, unit * 0.3);
    ctx.fillStyle = "#0e2433";
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
    // Approximate screen width
    const pLeft = projectToRect(cam, worldPos(task.start, 0, lane), rect);
    const pRight = projectToRect(cam, worldPos(task.start + task.len, 0, lane), rect);
    const fullW = pRight.x - pLeft.x;
    const w = fullW * grow;
    const x = pLeft.x;
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
      ctx.strokeStyle = DANGER;
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
      ctx.fillStyle = DANGER;
      ctx.shadowColor = rgba(DANGER, 0.7);
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
    
    // Project top and bottom points
    const pTop = projectToRect(cam, new THREE.Vector3((st.marker.at / timeSpan - 0.5) * spreadX * 2, 0, -spreadZ - 0.5), rect);
    const pBot = projectToRect(cam, new THREE.Vector3((st.marker.at / timeSpan - 0.5) * spreadX * 2, 0, spreadZ + 0.5), rect);
    
    const mx = pTop.x;
    const myTop = pTop.y;
    const myBot = pBot.y;
    
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
    
    // Label chip at top.
    ctx.font = `700 ${unit * 0.55}px ${FONT_MONO}`;
    const tw = ctx.measureText(st.marker.label).width;
    roundRect(ctx, mx - tw / 2 - unit * 0.3, myTop - unit * 1.1, tw + unit * 0.6, unit * 0.9, unit * 0.22);
    ctx.fillStyle = "#0e2433";
    ctx.fill();
    ctx.strokeStyle = rgba(THEME.warn, 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.warn;
    ctx.textAlign = "center";
    ctx.fillText(st.marker.label, mx, myTop - unit * 0.45);
    ctx.textAlign = "start";
    ctx.restore();
  });

  ctx.textAlign = "start";
}
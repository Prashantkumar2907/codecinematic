import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, makeCylinder, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  clamp01,
  sub,
  roundRect,
  fitFontSize,
  drawSceneTitle,
  beatT,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type PictogramScene = Extract<Scene, { kind: "pictogram" }>;
type Seat = { x: number; y: number; angle: number };

const GHOST_FILL = "rgba(148,163,184,0.14)";
const WAVE_SPAN = 0.55;
const POP_LEN = 0.2;
// A group's wave (last glyph starts at 0.55, pops for 0.2) completes at t=0.75.
const WAVE_DONE = WAVE_SPAN + POP_LEN;
// Captions sit in the bottom ~14% of vertical frames; keep the legend above.
const CAPTION_SAFE_Y = 0.86;

function groupTints(accent: string, secondary: string): string[] {
  return [accent, secondary, THEME.good, THEME.warn];
}

/** Head + rounded-shoulders body, one fillStyle, total height ≈ s·1.42, centered on (cx, cy). */
function drawPerson(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const headR = s * 0.32;
  const bodyW = s * 0.72;
  const bodyH = s * 0.78;
  const top = cy - (headR * 2 + bodyH - s * 0.04) / 2;
  ctx.beginPath();
  ctx.arc(cx, top + headR, headR, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, cx - bodyW / 2, top + headR * 2 - s * 0.04, bodyW, bodyH, s * 0.36);
  ctx.fill();
}

function gridSeats(total: number, gx: number, gy: number, gw: number, gh: number): { seats: Seat[]; s: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt((total * gw) / Math.max(gh, 1))));
  const rows = Math.ceil(total / cols);
  const cellW = gw / cols;
  const cellH = gh / rows;
  const s = Math.min((cellW * 0.8) / 0.72, (cellH * 0.88) / 1.42);
  const seats: Seat[] = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, total - row * cols);
    const rowX = gx + (gw - inRow * cellW) / 2;
    const col = i - row * cols;
    seats.push({ x: rowX + (col + 0.5) * cellW, y: gy + (row + 0.5) * cellH, angle: 0 });
  }
  return { seats, s };
}

/** Hemicycle seats, fill order swept by angle left→right so parties block up like a parliament. */
function arcSeats(total: number, cx: number, baseY: number, rMax: number): { seats: Seat[]; s: number; gapR: number } {
  const rows = total <= 40 ? 3 : total <= 70 ? 4 : 5;
  const r0 = rMax * 0.45;
  const gapR = (rMax - r0) / (rows - 1);
  const radii = Array.from({ length: rows }, (_, i) => r0 + gapR * i);
  const wSum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((rr) => Math.max(1, Math.round((total * rr) / wSum)));
  let guard = 0;
  let diff = total - counts.reduce((a, b) => a + b, 0);
  while (diff !== 0 && guard++ < 64) {
    const i = rows - 1 - (guard % rows);
    counts[i] = Math.max(1, counts[i] + Math.sign(diff));
    diff = total - counts.reduce((a, b) => a + b, 0);
  }
  const seats: Seat[] = [];
  let minChord = Infinity;
  radii.forEach((rr, ri) => {
    const m = counts[ri];
    minChord = Math.min(minChord, (Math.PI * rr) / m);
    for (let j = 0; j < m; j++) {
      const angle = 180 - ((j + 0.5) / m) * 180;
      const a = (angle * Math.PI) / 180;
      seats.push({ x: cx + Math.cos(a) * rr, y: baseY - Math.sin(a) * rr, angle });
    }
  });
  seats.sort((a, b) => b.angle - a.angle);
  return { seats, s: Math.min(gapR, minChord) * 0.62, gapR };
}

type Seat3D = { x: number; z: number; angle: number; };

function gridSeats3D(total: number, spreadW: number, spreadD: number): { seats: Seat3D[]; s: number } {
    const cols = Math.max(1, Math.ceil(Math.sqrt((total * spreadW) / Math.max(spreadD, 1))));
    const rows = Math.ceil(total / cols);
    const cellW = spreadW / cols;
    const cellD = spreadD / rows;
    const s = Math.min(cellW * 0.8, cellD * 0.8);
    const seats: Seat3D[] = [];
    const gx = -spreadW / 2;
    const gz = -spreadD / 2;
    for (let i = 0; i < total; i++) {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, total - row * cols);
        const rowX = gx + (spreadW - inRow * cellW) / 2;
        const col = i - row * cols;
        seats.push({ x: rowX + (col + 0.5) * cellW, z: gz + (row + 0.5) * cellD, angle: 0 });
    }
    return { seats, s };
}

function arcSeats3D(total: number, spread: number): { seats: Seat3D[]; s: number; rMax: number; gapR: number } {
    const rows = total <= 40 ? 3 : total <= 70 ? 4 : 5;
    const rMax = spread / 2;
    const r0 = rMax * 0.45;
    const gapR = (rMax - r0) / (rows - 1);
    const radii = Array.from({ length: rows }, (_, i) => r0 + gapR * i);
    const wSum = radii.reduce((a, b) => a + b, 0);
    const counts = radii.map((rr) => Math.max(1, Math.round((total * rr) / wSum)));
    let guard = 0;
    let diff = total - counts.reduce((a, b) => a + b, 0);
    while (diff !== 0 && guard++ < 64) {
        const i = rows - 1 - (guard % rows);
        counts[i] = Math.max(1, counts[i] + Math.sign(diff));
        diff = total - counts.reduce((a, b) => a + b, 0);
    }
    const seats: Seat3D[] = [];
    let minChord = Infinity;
    radii.forEach((rr, ri) => {
        const m = counts[ri];
        minChord = Math.min(minChord, (Math.PI * rr) / m);
        for (let j = 0; j < m; j++) {
            const angle = 180 - ((j + 0.5) / m) * 180;
            const a = (angle * Math.PI) / 180;
            seats.push({ x: Math.cos(a) * rr, z: rMax/2 - Math.sin(a) * rr, angle });
        }
    });
    seats.sort((a, b) => b.angle - a.angle);
    return { seats, s: Math.min(gapR, minChord) * 0.62, rMax, gapR };
}

export function paintPictogram(ctx: CanvasRenderingContext2D, scene: PictogramScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.groups.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const lastEnd = beatWindow(env.beats, totalBeats - 1, totalBeats).end;

  const band = drawSceneTitle(ctx, scene.title, layout, enterT(env, 360) * 0.12, accent) + unit * 0.3;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const safeBottom = vertical ? Math.min(contentY + contentH, layout.h * CAPTION_SAFE_Y) : contentY + contentH;
  const ah = safeBottom - ay;

  const legendRight = !vertical;
  const legendRows = vertical ? (scene.groups.length > 2 ? 2 : 1) : scene.groups.length;
  const legendH = vertical ? legendRows * unit * 1.7 + unit * 0.4 : 0;
  const legendW = legendRight ? aw * 0.26 : 0;
  const gx = ax;
  const gy = ay;
  const gw = aw - (legendRight ? legendW + unit * 0.6 : 0);
  const gh = ah - legendH;

  const rect = { x: gx, y: gy, w: gw, h: gh };

  const spreadW = vertical ? 6 : 8;
  const spreadD = vertical ? 8 : 6;
  
  let seats: Seat3D[];
  let glyphS: number;
  let arcMeta: { rMax: number; gapR: number } | null = null;
  
  if (scene.mode === "arc") {
    const built = arcSeats3D(scene.total, spreadW);
    seats = built.seats;
    glyphS = built.s;
    arcMeta = { rMax: built.rMax, gapR: built.gapR };
  } else {
    const built = gridSeats3D(scene.total, spreadW, spreadD);
    seats = built.seats;
    glyphS = built.s;
  }

  const tints = groupTints(accent, secondary);
  const starts: number[] = [];
  let cum = 0;
  scene.groups.forEach((g) => {
    starts.push(cum);
    cum += g.count;
  });
  const filledTotal = cum;

  const ghostIn = easeOutCubic(enterT(env, 420));
  const key = scene.id + "-pictogram3d";

  const blockRadius = glyphS * 0.4;
  const blockH = 0.4;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 10, vertical ? 10 : 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(Math.max(spreadW, spreadD) * 1.5, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadW * 2, spreadD * 2),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const seatMeshes: THREE.Group[] = [];
    
    seats.forEach((seat, i) => {
      // Find which group this seat belongs to
      let gi = -1;
      for (let g = 0; g < scene.groups.length; g++) {
          if (i >= starts[g] && i < starts[g] + scene.groups[g].count) {
              gi = g; break;
          }
      }
      
      const isFilled = gi >= 0;
      const tint = isFilled ? tints[gi % tints.length] : THEME.panel;
      
      const mesh = makeCylinder(blockRadius, blockH, isFilled ? "#1e293b" : THEME.panel, tint);
      mesh.position.set(seat.x, 0, seat.z);
      s.add(mesh);
      seatMeshes.push(mesh);
    });

    const update = (elapsedMs: number, ctxData: { gIn: number, groupTimes: number[], activeIdx: number, finalPulseScale: number }) => {
      const { gIn, groupTimes, activeIdx, finalPulseScale } = ctxData;
      
      seats.forEach((seat, i) => {
          let gi = -1;
          for (let g = 0; g < scene.groups.length; g++) {
              if (i >= starts[g] && i < starts[g] + scene.groups[g].count) {
                  gi = g; break;
              }
          }
          
          const mesh = seatMeshes[i];
          const isFilled = gi >= 0;
          
          mesh.visible = gIn > 0;
          
          if (!isFilled) {
              mesh.scale.setScalar(Math.max(0.001, 0.9 * gIn));
              mesh.position.y = Math.sin(elapsedMs / 1200 + i) * 0.03;
              const mat = (mesh.children[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
              mat.transparent = true;
              mat.opacity = 0.14 * gIn;
              mat.emissiveIntensity = 0;
              return;
          }
          
          const groupCount = scene.groups[gi].count;
          const t = groupTimes[gi];
          const isActive = activeIdx === offset + gi && t < 1;
          
          const j = i - starts[gi];
          const pr = clamp01((t - (j / groupCount) * WAVE_SPAN) / POP_LEN);
          
          if (pr <= 0) {
              // Not yet appeared, but ghost might be visible
              mesh.scale.setScalar(Math.max(0.001, 0.9 * gIn));
              mesh.position.y = Math.sin(elapsedMs / 1200 + i) * 0.03;
              const mat = (mesh.children[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
              mat.transparent = true;
              mat.opacity = 0.14 * gIn;
              mat.emissiveIntensity = 0;
          } else {
              const shimmer = isActive && pr >= 1 ? 0.86 + 0.14 * Math.sin(elapsedMs / 320 + j * 0.55) : 1;
              const popScale = (0.7 + 0.3 * easeOutBack(pr));
              
              mesh.scale.setScalar(Math.max(0.001, popScale * finalPulseScale));
              
              const popY = (isActive && pr < 1) ? 0.4 : 0;
              mesh.position.y = Math.sin(elapsedMs / 1200 + i) * 0.05 + popY;
              
              mesh.children.forEach(child => {
                  if (child instanceof THREE.Mesh) {
                      const mat = child.material as THREE.MeshPhysicalMaterial;
                      mat.transparent = true;
                      mat.opacity = pr * shimmer;
                      if (isActive && pr < 1) {
                          mat.color.setStyle(THEME.warn);
                          mat.emissive.setStyle(THEME.warn);
                          mat.emissiveIntensity = 0.5;
                      } else {
                          mat.color.setStyle("#1e293b");
                          mat.emissive.setStyle("#1e293b");
                          mat.emissiveIntensity = 0.1;
                      }
                  }
              });
          }
      });
    };

    return { scene: s, camera, update };
  };

  let largest = 0;
  scene.groups.forEach((g, i) => {
    if (g.count > scene.groups[largest].count) largest = i;
  });
  const finalPulseT = sub(env.p, lastEnd + 0.04, 0.3);
  const finalPulse = finalPulseT > 0 && finalPulseT < 1 ? Math.sin(Math.PI * finalPulseT) : 0;
  const settledBreathe = finalPulseT >= 1 ? 0.012 * idle(env, 2600) : 0;
  const finalPulseScale = 1 + 0.05 * finalPulse + settledBreathe;

  const groupTimes = scene.groups.map((_, i) => beatT(env.beats, offset + i, totalBeats, env.p));
  
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { 
      gIn: ghostIn, 
      groupTimes, 
      activeIdx: active,
      finalPulseScale
  });
  if (!cam) return;

  const get2D = (x: number, z: number, y: number = 0) => projectToRect(cam, new THREE.Vector3(x, y, z), rect);

  // Majority line
  if (scene.mode === "arc" && arcMeta && scene.majorityAt !== undefined) {
    const seatIdx = Math.min(Math.max(scene.majorityAt - 1, 0), scene.total - 1);
    const angle = seats[seatIdx]?.angle ?? 90;
    const a = (angle * Math.PI) / 180;
    const { rMax, gapR } = arcMeta;
    const inner = rMax * 0.45 - gapR * 0.4;
    const outer = rMax + gapR * 0.6;
    let crossGroup = -1;
    scene.groups.forEach((g, gi) => {
      if (crossGroup < 0 && starts[gi] < scene.majorityAt! && starts[gi] + g.count >= scene.majorityAt!) crossGroup = gi;
    });
    let flash = 0;
    let crossed = false;
    if (crossGroup >= 0) {
      const t = groupTimes[crossGroup];
      const jCross = scene.majorityAt - starts[crossGroup] - 1;
      const tCross = (jCross / scene.groups[crossGroup].count) * WAVE_SPAN + POP_LEN;
      const fl = (t - tCross) / 0.45;
      if (fl >= 1) crossed = true;
      else if (fl > 0) flash = Math.abs(Math.sin(fl * Math.PI * 2));
    }
    
    // Convert 3D inner/outer to 2D
    const p1 = get2D(Math.cos(a) * inner, rMax/2 - Math.sin(a) * inner);
    const p2 = get2D(Math.cos(a) * outer, rMax/2 - Math.sin(a) * outer);
    
    ctx.save();
    ctx.strokeStyle = crossed || flash > 0 ? accent : THEME.textDim;
    ctx.globalAlpha = ghostIn * (crossed ? 0.55 : 0.3 + 0.7 * flash);
    ctx.lineWidth = unit * (0.09 + 0.06 * flash);
    if (flash > 0) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * flash;
    }
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = `700 ${unit * 0.55}px ${FONT_SANS}`;
    const full = "majority";
    const flagP = get2D(Math.cos(a) * (outer + 0.8), rMax/2 - Math.sin(a) * (outer + 0.8));
    const flagX = flagP.x;
    const flagY = flagP.y;
    const fullW = ctx.measureText(full).width + unit * 0.6;
    const fits = flagX - fullW / 2 > contentX && flagX + fullW / 2 < contentX + contentW && flagY - unit * 0.9 > contentY;
    const flagText = fits ? full : String(scene.majorityAt);
    const fw = ctx.measureText(flagText).width;
    roundRect(ctx, flagX - fw / 2 - unit * 0.28, flagY - unit * 0.92, fw + unit * 0.56, unit * 0.92, unit * 0.26);
    ctx.fillStyle = "#0a0e13";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = crossed || flash > 0 ? accent : THEME.textDim;
    ctx.textAlign = "center";
    ctx.fillText(flagText, flagX, flagY - unit * 0.28);
    ctx.textAlign = "start";
    ctx.restore();
  }

  // Legend
  scene.groups.forEach((g, gi) => {
    const t = groupTimes[gi];
    const isActive = active === offset + gi && t < 1;
    const tint = tints[gi % tints.length];
    const shown = Math.round(g.count * clamp01(t / WAVE_DONE));
    const alpha = ghostIn * (t <= 0 ? 0.3 : isActive ? 1 : 0.75);
    let ex: number;
    let ey: number;
    let ew: number;
    if (legendRight) {
      ew = legendW;
      ex = ax + aw - legendW;
      const colH = scene.groups.length * unit * 2.6;
      ey = ay + Math.max(0, (ah - colH) / 2) + gi * unit * 2.6 + unit * 0.9;
    } else {
      const cols = Math.min(2, scene.groups.length);
      ew = aw / cols - unit * 0.4;
      ex = ax + (gi % cols) * (aw / cols);
      ey = ay + gh + unit * 0.7 + Math.floor(gi / cols) * unit * 1.7;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    const dotR = unit * 0.26 * (isActive ? 1 + 0.14 * Math.sin(env.elapsedMs / 300) : 1);
    if (isActive) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.5;
    }
    ctx.beginPath();
    ctx.arc(ex + unit * 0.3, ey, dotR, 0, Math.PI * 2);
    ctx.fillStyle = t <= 0 ? THEME.textFaint : tint;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `800 ${unit * 0.85}px ${FONT_MONO}`;
    const cText = String(t <= 0 ? g.count : shown);
    const cw = ctx.measureText(cText).width;
    ctx.fillStyle = isActive ? THEME.text : THEME.textDim;
    ctx.fillText(cText, ex + ew - cw, ey + unit * 0.28);
    const lpx = fitFontSize(ctx, g.label, {
      maxW: ew - unit * 1.2 - cw,
      startPx: unit * 0.72,
      minPx: unit * 0.48,
      weight: isActive ? 700 : 600,
    });
    ctx.font = `${isActive ? 700 : 600} ${lpx}px ${FONT_SANS}`;
    ctx.fillText(g.label, ex + unit * 0.85, ey + unit * 0.26);
    ctx.restore();
  });

  const rest = scene.total - filledTotal;
  if (rest > 0 && legendRight) {
    ctx.save();
    ctx.globalAlpha = ghostIn * 0.4;
    ctx.font = `600 ${unit * 0.6}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textFaint;
    ctx.fillText(`+${rest} others`, ax + aw - legendW + unit * 0.85, ay + ah - unit * 0.3);
    ctx.restore();
  }
  ctx.textAlign = "start";
}

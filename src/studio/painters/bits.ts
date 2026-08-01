import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_MONO,
  FONT_SANS,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  clamp01,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  drawArrowhead,
  beatT,
  activeBeatIndex,
  rgba,
  shade,
  lerpColor,
  STROKE,
} from "./common";
import type { PaintEnv } from "./index";

const SLAB_DEPTH = 0.12;
const GRID_WORLD = 26;
const IDLE_FACE_LIFT = 0.09;
const SET_TINT = 0.24;

type BitsScene = Extract<Scene, { kind: "bits" }>;

/** Operand string right-aligned into the register width: pad-left zeros, drop excess high bits. */
function padBits(value: string | undefined, width: number): number[] {
  const s = (value ?? "").slice(-width).padStart(width, "0");
  return Array.from(s, (c) => (c === "1" ? 1 : 0));
}

/** Register contents (MSB first) after replaying ops 0..k from all zeros. */
function regAt(scene: BitsScene, k: number): number[] {
  let reg: number[] = new Array(scene.width).fill(0);
  const last = Math.min(k, scene.steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const st = scene.steps[i];
    const v = padBits(st.value, scene.width);
    switch (st.op) {
      case "set":
        reg = v;
        break;
      case "and":
        reg = reg.map((b, j) => b & v[j]);
        break;
      case "or":
        reg = reg.map((b, j) => b | v[j]);
        break;
      case "xor":
        reg = reg.map((b, j) => b ^ v[j]);
        break;
      case "not":
        reg = reg.map((b) => 1 - b);
        break;
      case "shl":
        reg = [...reg.slice(1), 0];
        break;
      case "shr":
        reg = [0, ...reg.slice(0, reg.length - 1)];
        break;
    }
  }
  return reg;
}

const decOf = (reg: number[]) => reg.reduce((a, b) => a * 2 + b, 0);

export function paintBits(ctx: CanvasRenderingContext2D, scene: BitsScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentSoft, accentGlow, secondary } = env.palette;
  const width = scene.width;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStep = Math.min(active - offset, scene.steps.length - 1);
  const t = activeStep >= 0 ? beatT(env.beats, offset + activeStep, totalBeats, env.p) : 0;
  const frameIn = easeOutCubic(enterT(env, 360));
  const key = scene.id + "-bits3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.35;
  const ax = contentX;
  const ay = contentY + band;
  const aw = contentW;
  const ah = Math.max(unit * 4, layout.safeBottom - ay);

  const step = activeStep >= 0 ? scene.steps[activeStep] : null;
  const prev = regAt(scene, activeStep - 1);
  const next = regAt(scene, activeStep);
  const ghost = activeStep < 0;

  const op = step?.op;
  const isLogic = op === "and" || op === "or" || op === "xor";
  const isShift = op === "shl" || op === "shr";
  const operand = isLogic || op === "not" ? padBits(step?.value, width) : [];

  const rect = { x: ax, y: ay, w: aw, h: ah };
  
  /**
   * Cells are a PIXEL row and the slabs are mapped onto it. They used to be spread over
   * 17 world units and viewed from (0, 12, 10): at 9:16 that put four of the eight bits
   * of a byte off the right edge, rendered the near cells wider than the far ones, and
   * left every place-value label sliding away from the cell it belongs to.
   * `qa/ledger.json` → systemic `2d-layout-round-tripped-through-camera`.
   */
  const cellPitch = aw / Math.max(width, 1);
  const cellW = cellPitch - Math.min(unit * 0.3, cellPitch * 0.14);
  const cellH = Math.min(cellW * 1.45, ah * 0.42);
  const rowCY = ay + ah * 0.46;
  const cellRect = (i: number) => ({
    x: ax + i * cellPitch + (cellPitch - cellW) / 2,
    y: rowCY - cellH / 2,
    w: cellW,
    h: cellH,
    cx: ax + (i + 0.5) * cellPitch,
    cy: rowCY,
  });

  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);
    const m = mappingAt(camera, SLAB_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(GRID_WORLD, 14, new THREE.Color(accent), new THREE.Color(shade(THEME.panel, 0.22)));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_WORLD, GRID_WORLD),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const models: { mesh: THREE.Group, i: number }[] = [];
    for (let i = 0; i < width; i++) {
        const g = makeBlock(1, 1, SLAB_DEPTH, shade(THEME.panel, IDLE_FACE_LIFT), THEME.textDim);
        s.add(g);
        models.push({ mesh: g, i });
    }

    const update = (elapsedMs: number, ctxData: { gIn: number, t: number, ghost: boolean, op: any, prev: number[], next: number[], isLogic: boolean, isShift: boolean }) => {
      const { gIn, t, ghost, op, prev, next, isLogic, isShift } = ctxData;
      
      models.forEach(({ mesh, i }) => {
        mesh.visible = gIn > 0;
        
        let bit = 0;
        let scale = 1;
        let flash = 0;
        let flipAmount = 1;
        const cellPx = cellRect(i);
        const cellWorld = toWorld(cellPx.cx, cellPx.cy);
        
        const shimmerAt = (i: number) => {
            const w = Math.sin(elapsedMs / 1200 - i * 0.55);
            return Math.max(0, w) * Math.max(0, w);
        };
        
        if (ghost) {
            bit = 0;
            flash = shimmerAt(i) * 0.5;
        } else if (op === "set") {
            const delay = (i / width) * 0.5;
            const f = clamp01((t - delay) / 0.22);
            if (f <= 0) {
                bit = prev[i];
                flash = shimmerAt(i) * 0.5;
            } else {
                bit = next[i];
                scale = 0.5 + 0.5 * easeOutBack(f);
                if (prev[i] !== next[i] && t < delay + 0.5) flash = 1.0 - clamp01((t - delay - 0.22) / 0.28);
            }
        } else if (isLogic || op === "not") {
            const flipStart = isLogic ? 0.25 + (i / width) * 0.5 : 0.2 + i * 0.02;
            const f = clamp01((t - flipStart) / (isLogic ? 0.16 : 0.25));
            bit = f < 0.5 ? prev[i] : next[i];
            const changed = prev[i] !== next[i];
            flipAmount = Math.abs(Math.cos(Math.PI * f));
            if (changed && f >= 0.5) flash = 1.0 - clamp01((f - 0.5) / 0.5);
            if (f <= 0) flash = shimmerAt(i) * 0.5;
        } else if (isShift) {
            const s = easeInOutCubic(clamp01((t - 0.25) / 0.5));
            const dir = op === "shl" ? -1 : 1;
            if (s <= 0) {
                bit = prev[i];
                flash = shimmerAt(i) * 0.5;
            } else if (s >= 1) {
                bit = next[i];
                if (prev[i] !== next[i] && t < 0.9) flash = 1.0 - clamp01((t - 0.75) / 0.15);
            } else {
                bit = 0; // The moving ones will be drawn in 2D
                mesh.visible = false; // Hide 3D blocks during shift animation (we handle in 2D)
            }
        } else {
            bit = next[i];
            flash = shimmerAt(i) * 0.5;
        }
        
        // Scaled FROM the pixel cell, and never moved afterwards: the old per-frame bob
        // slid each slab out from under the digit drawn on it.
        const sw = (cellPx.w / m.sx) * scale * gIn;
        const sh = (cellPx.h / m.sy) * scale * gIn;
        const flipX = flipAmount;
        mesh.scale.set(Math.max(0.001, sw * flipX), Math.max(0.001, sh), 1);
        mesh.position.set(cellWorld.x, cellWorld.y, 0);

        mesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const mat = child.material as THREE.MeshPhysicalMaterial;
                mat.transparent = true;
                mat.opacity = gIn * (ghost ? 0.4 : 0.9);
                if (flash > 0) {
                    // The idle shimmer used THEME.warn, so three cells at a time rendered
                    // caution-yellow — the rubric reserves warn for caution, and a byte
                    // sitting still looked like an error state.
                    const lit = lerpColor(THEME.panel, accent, SET_TINT + 0.3 * flash);
                    mat.color.setStyle(lit);
                    mat.emissive.setStyle(lit);
                    mat.emissiveIntensity = 0.5 * flash;
                } else {
                    // accentSoft is an rgba string; THREE.Color drops the alpha, so a set bit rendered
                    // at FULL accent instead of the intended tint.
                    const c = ghost ? shade(THEME.panel, -0.2) : bit ? lerpColor(THEME.panel, accent, SET_TINT) : shade(THEME.panel, IDLE_FACE_LIFT);
                    mat.color.setStyle(c);
                    mat.emissive.setStyle(c);
                    mat.emissiveIntensity = 0.1;
                }
            }
        });
      });
    };

    return { scene: s, camera, update };
  };

  const ctxData = { gIn: frameIn, t, ghost, op, prev, next, isLogic, isShift };
  const cam = render3D(ctx, key, rect, build, env.elapsedMs, ctxData);
  if (!cam) return;

  const get2D = (i: number) => ({ x: cellRect(i).cx, y: cellRect(i).cy });
  
  const showPow = width <= 8;
  const opSide = unit * 1.5;

  // 2D Overlays
  for (let i = 0; i < width; i++) {
    const p = get2D(i);
    // No bob: the 2D digit used a pixel sine while the slab used a world one, so the
    // two drifted apart every frame.
    const cy = p.y;
    
    // Draw Bit Values
    let bit = next[i];
    let hideDigit = false;
    let s = 0;
    if (isShift) {
        s = easeInOutCubic(clamp01((t - 0.25) / 0.5));
        if (s > 0 && s < 1) hideDigit = true;
    }
    if (ghost) bit = 0;
    else if (op === "set") {
        const delay = (i / width) * 0.5;
        const f = clamp01((t - delay) / 0.22);
        if (f <= 0) bit = prev[i];
    } else if (isLogic || op === "not") {
        const flipStart = isLogic ? 0.25 + (i / width) * 0.5 : 0.2 + i * 0.02;
        const f = clamp01((t - flipStart) / (isLogic ? 0.16 : 0.25));
        if (f < 0.5) bit = prev[i];
    }
    
    if (!hideDigit) {
        ctx.save();
        ctx.globalAlpha = frameIn * (ghost ? 0.5 : 1.0);
        ctx.font = `700 ${unit * 1.4}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.text; // We can improve coloring based on flash if needed
        ctx.textAlign = "center";
        ctx.fillText(String(bit), p.x, cy + unit * 0.5);
        ctx.restore();
    }
    
    // Power labels
    if (showPow) {
        ctx.save();
        ctx.globalAlpha = frameIn;
        ctx.font = `500 ${unit * 0.42}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.textFaint;
        ctx.textAlign = "center";
        ctx.fillText(String(2 ** (width - 1 - i)), p.x, cy + unit * 3.0);
        ctx.textAlign = "start";
        ctx.restore();
    }
  }
  
  // Shift animation overlays
  if (isShift) {
    const s = easeInOutCubic(clamp01((t - 0.25) / 0.5));
    const dir = op === "shl" ? -1 : 1;
    if (s > 0 && s < 1) {
        const stride = (get2D(1).x - get2D(0).x) * dir;
        ctx.save();
        for (let i = 0; i < width; i++) {
            const falling = op === "shl" ? i === 0 : i === width - 1;
            const gx = get2D(i).x + stride * s;
            const p = get2D(i);
            const bob = Math.sin(env.elapsedMs / 1200 + i) * unit * 1.5;
            const cy = p.y - bob;
            
            ctx.globalAlpha = (falling ? 1 - s : 1) * frameIn;
            ctx.font = `700 ${unit * 1.4}px ${FONT_MONO}`;
            ctx.fillStyle = prev[i] ? THEME.text : THEME.textDim;
            ctx.textAlign = "center";
            ctx.fillText(String(prev[i]), gx, cy + unit * 0.5);
        }
        const inFrom = op === "shl" ? get2D(width - 1).x + Math.abs(get2D(1).x - get2D(0).x) * (1 - s) : get2D(0).x - Math.abs(get2D(1).x - get2D(0).x) * (1 - s);
        ctx.globalAlpha = s * frameIn;
        ctx.font = `700 ${unit * 1.4}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText("0", inFrom, get2D(0).y - Math.sin(env.elapsedMs / 1200) * unit * 1.5 + unit * 0.5);
        ctx.textAlign = "start";
        ctx.restore();
    }
    const arrowAlpha = Math.min(clamp01(t / 0.12), clamp01((1 - t) / 0.12));
    if (arrowAlpha > 0) {
      const ay = get2D(0).y - unit * 2.5;
      const spanCx = (get2D(0).x + get2D(width - 1).x) / 2;
      const half = Math.min(Math.abs(get2D(width - 1).x - get2D(0).x) * 0.22, unit * 3);
      ctx.save();
      ctx.globalAlpha = arrowAlpha * 0.55 * frameIn;
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = unit * 0.1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(spanCx - half * dir, ay);
      ctx.lineTo(spanCx + half * dir, ay);
      ctx.stroke();
      drawArrowhead(ctx, spanCx + half * dir, ay, dir > 0 ? 0 : Math.PI, unit * 0.5);
      ctx.restore();
    }
  }

  // Operand Row
  if (isLogic) {
      const opIn = easeOutCubic(clamp01(t / 0.25));
      const fade = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
      const oy = get2D(0).y - unit * 3.5 - (1 - opIn) * unit * 2.2;
      ctx.save();
      ctx.globalAlpha = opIn * fade * frameIn;
      for (let i = 0; i < width; i++) {
        const ox = get2D(i).x;
        roundRect(ctx, ox - opSide / 2, oy - opSide / 2, opSide, opSide, opSide * 0.16);
        ctx.fillStyle = THEME.panel;
        ctx.fill();
        roundRect(ctx, ox - opSide / 2, oy - opSide / 2, opSide, opSide, opSide * 0.16);
        ctx.strokeStyle = THEME.panelBorder;
        ctx.lineWidth = opSide * 0.03;
        ctx.stroke();
        const px = opSide * 0.52;
        ctx.font = `700 ${px}px ${FONT_MONO}`;
        ctx.fillStyle = operand[i] ? THEME.text : THEME.textDim;
        ctx.textAlign = "center";
        ctx.fillText(String(operand[i]), ox, oy + px * 0.35);
        ctx.textAlign = "start";
      }
      const chipPop = easeOutBack(clamp01((t - 0.1) / 0.2));
      if (chipPop > 0) {
        const label = (op ?? "").toUpperCase();
        const chipCy = oy - unit * 1.5;
        ctx.font = `800 ${unit * 0.62}px ${FONT_SANS}`;
        const tw = ctx.measureText(label).width;
        const chipCx = ax + aw / 2;
        ctx.translate(chipCx, chipCy);
        ctx.scale(chipPop, chipPop);
        ctx.translate(-chipCx, -chipCy);
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.4;
        roundRect(ctx, chipCx - tw / 2 - unit * 0.4, chipCy - unit * 0.55, tw + unit * 0.8, unit * 1.1, unit * 0.3);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = shade(THEME.panel, -0.35);
        ctx.textAlign = "center";
        ctx.fillText(label, chipCx, chipCy + unit * 0.22);
        ctx.textAlign = "start";
      }
      ctx.restore();
  }

  const decChipY = get2D(0).y + (showPow ? unit * 4.5 : unit * 3.5);

  const drawReadout = (dec: number, alpha: number, dy: number) => {
    if (alpha <= 0) return;
    const text = `= ${dec}`;
    ctx.save();
    ctx.globalAlpha = alpha * frameIn;
    ctx.font = `700 ${unit * 0.8}px ${FONT_MONO}`;
    const tw = ctx.measureText(text).width;
    const cx = ax + aw / 2;
    const cy = decChipY + unit * 0.65 + dy;
    roundRect(ctx, cx - tw / 2 - unit * 0.55, cy - unit * 0.65, tw + unit * 1.1, unit * 1.3, unit * 0.35);
    ctx.fillStyle = THEME.bgBottom;
    ctx.fill();
    roundRect(ctx, cx - tw / 2 - unit * 0.55, cy - unit * 0.65, tw + unit * 1.1, unit * 1.3, unit * 0.35);
    ctx.strokeStyle = THEME.panelBorder;
    ctx.lineWidth = unit * STROKE.hair;
    ctx.stroke();
    if (!ghost) {
      roundRect(ctx, cx - tw / 2 - unit * 0.55, cy - unit * 0.65, tw + unit * 1.1, unit * 1.3, unit * 0.35);
      ctx.strokeStyle = rgba(accent, 0.14 + 0.12 * idle(env, 2000));
      ctx.lineWidth = unit * STROKE.thin;
      ctx.stroke();
    }
    ctx.fillStyle = ghost ? THEME.textDim : THEME.text;
    ctx.textAlign = "center";
    ctx.fillText(text, cx, cy + unit * 0.28);
    ctx.textAlign = "start";
    ctx.restore();
  };
  const changedDec = activeStep >= 0 && decOf(prev) !== decOf(next);
  if (changedDec && t < 0.65) {
    const fadeOut = clamp01((t - 0.38) / 0.14);
    const fadeIn = clamp01((t - 0.5) / 0.15);
    drawReadout(decOf(prev), 1 - fadeOut, -fadeOut * unit * 0.5);
    drawReadout(decOf(next), fadeIn, (1 - easeOutCubic(fadeIn)) * unit * 0.5);
  } else {
    drawReadout(decOf(next), 1, 0);
  }

  if (step?.note) {
    const noteAlpha = Math.min(clamp01(t / 0.12), clamp01((1 - t) / 0.12));
    if (noteAlpha > 0) {
      const ny = get2D(0).y - unit * 6.5;
      ctx.save();
      ctx.globalAlpha = noteAlpha * frameIn;
      ctx.font = `600 ${unit * 0.58}px ${FONT_SANS}`;
      const tw = ctx.measureText(step.note).width;
      const cx = ax + aw / 2;
      roundRect(ctx, cx - tw / 2 - unit * 0.4, ny - unit * 0.55, tw + unit * 0.8, unit * 1.1, unit * 0.3);
      ctx.fillStyle = THEME.bgBottom;
      ctx.fill();
      roundRect(ctx, cx - tw / 2 - unit * 0.4, ny - unit * 0.55, tw + unit * 0.8, unit * 1.1, unit * 0.3);
      ctx.strokeStyle = THEME.panelBorder;
      ctx.lineWidth = unit * STROKE.hair;
      ctx.stroke();
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(step.note, cx, ny + unit * 0.2);
      ctx.textAlign = "start";
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
}
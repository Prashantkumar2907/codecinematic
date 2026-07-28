import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_MONO,
  FONT_SANS,
  easeOutCubic,
  easeOutBack,
  enterT,
  clamp01,
  roundRect,
  drawSceneTitle,
  beatWindow,
  activeBeatIndex,
  rgba,
} from "./common";
import type { PaintEnv } from "./index";

type CipherScene = Extract<Scene, { kind: "cipher" }>;

const HEX = "0123456789abcdef";
const HASH_LEN = 8;
const HASH_LABEL = "SHA-256";
const INK_PANEL = "#0a0e13";
const INK_FILL = "#0e2433";
const INK_BRIGHT = "#eaf6ff";
const INK_ON_ACCENT = "#06121a";

const shiftChar = (c: string, s: number): string =>
  c === " " ? " " : String.fromCharCode(((c.charCodeAt(0) - 65 + s) % 26) + 65);

function digestHex(text: string, seed: number): string {
  let out = "";
  for (let i = 0; i < HASH_LEN; i++) {
    const c = text.charCodeAt(i % text.length);
    out += HEX[((c + seed) * (i + 7)) % 16];
  }
  return out;
}

export function paintCipher(ctx: CanvasRenderingContext2D, scene: CipherScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const frameIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);
  const key = scene.id + "-ciph3d";

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const chars = Array.from(scene.text);
  const n = chars.length;
  const rect = { x: contentX, y: areaY, w: contentW, h: areaH };

  const isHash = scene.mode === "hash";

  const spreadX = 8.0;
  const spreadZ = isHash ? 4.0 : 3.0;

  const worldPos = (i: number, row: number, total: number) => {
    const x = total === 1 ? 0 : (i / (total - 1) - 0.5) * spreadX * 2;
    const z = row * spreadZ;
    return new THREE.Vector3(x, 0, z);
  };
  
  const boxW = 5.0;
  const boxD = 2.5;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 45 : 36, 1, 0.1, 100);
    camera.position.set(0, vertical ? 12 : 10, vertical ? 10 : 8);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(spreadX * 3, 14, new THREE.Color(accent), new THREE.Color("#31435a"));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -0.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(spreadX * 4, spreadX * 4),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.5;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const topBlocks: { mesh: THREE.Group, i: number, c: string }[] = [];
    const botBlocks: { mesh: THREE.Group, i: number }[] = [];
    let hashBox: THREE.Group | null = null;
    
    const blockW = (spreadX * 2.0) / Math.max(n, 1) * 0.6;
    const blockD = blockW;

    for (let i = 0; i < n; i++) {
        const c = chars[i];
        if (c !== " ") {
            const g = makeBlock(blockW, 0.4, blockD, "#1e293b", "#31435a");
            g.position.copy(worldPos(i, isHash ? -1 : -0.5, n));
            s.add(g);
            topBlocks.push({ mesh: g, i, c });
        }
    }
    
    if (isHash) {
        hashBox = makeBlock(boxW, 1.2, boxD, "#0f172a", accent);
        hashBox.position.copy(worldPos(0, 0, 1));
        s.add(hashBox);
        
        const outW = (spreadX * 2.0) / HASH_LEN * 0.6;
        for (let i = 0; i < HASH_LEN; i++) {
            const g = makeBlock(outW, 0.4, outW, "#0e2433", accent);
            g.position.copy(worldPos(i, 1, HASH_LEN));
            s.add(g);
            botBlocks.push({ mesh: g, i });
        }
    } else {
        for (let i = 0; i < n; i++) {
            const c = chars[i];
            if (c !== " ") {
                const g = makeBlock(blockW, 0.4, blockD, "#0e2433", accent);
                g.position.copy(worldPos(i, 0.5, n));
                s.add(g);
                botBlocks.push({ mesh: g, i });
            }
        }
    }

    const update = (elapsedMs: number, ctxData: any) => {
        const { gIn, stRev, outputRevealed, digestScales, avalancheFlashing, isMixing } = ctxData;
        
        topBlocks.forEach(({ mesh, i, c }) => {
            mesh.visible = gIn > 0;
            const bob = Math.sin(elapsedMs / 1200 + i) * 0.05;
            const p = worldPos(i, isHash ? -1 : -0.5, n);
            mesh.position.set(p.x, p.y + bob, p.z);
            mesh.scale.setScalar(Math.max(0.01, gIn));
            
            let anim = false;
            let rev = 0;
            if (stRev && stRev[i]) {
                anim = stRev[i].anim;
                rev = stRev[i].rev;
            }
            const flash = anim ? 1 : 0;
            
            mesh.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    const mat = child.material as THREE.MeshPhysicalMaterial;
                    mat.transparent = true;
                    mat.opacity = gIn * 0.9;
                    if (flash > 0 || avalancheFlashing?.[i]) {
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
        });
        
        if (isHash && hashBox) {
            hashBox.visible = gIn > 0;
            const bob = Math.sin(elapsedMs / 900) * 0.05;
            hashBox.position.y = bob;
            hashBox.scale.setScalar(Math.max(0.01, gIn));
            hashBox.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    const mat = child.material as THREE.MeshPhysicalMaterial;
                    mat.transparent = true;
                    mat.opacity = gIn * 0.9;
                    mat.emissiveIntensity = isMixing ? 0.4 : 0.1;
                }
            });
        }
        
        botBlocks.forEach(({ mesh, i }) => {
            if (!isHash) {
                const rev = stRev?.[i]?.rev ?? 0;
                mesh.visible = rev > 0 && gIn > 0;
                if (mesh.visible) {
                    const pop = easeOutBack(clamp01(rev));
                    mesh.scale.setScalar(Math.max(0.01, pop * gIn));
                    const bob = Math.sin(elapsedMs / 1200 + i) * 0.05;
                    const p = worldPos(i, 0.5, n);
                    mesh.position.set(p.x, p.y + bob, p.z);
                }
            } else {
                mesh.visible = outputRevealed && digestScales[i] > 0;
                if (mesh.visible) {
                    const scale = digestScales[i];
                    mesh.scale.set(Math.max(0.01, scale * gIn), Math.max(0.01, gIn), Math.max(0.01, gIn));
                    const bob = Math.sin(elapsedMs / 1200 + i) * 0.05;
                    const p = worldPos(i, 1, HASH_LEN);
                    mesh.position.set(p.x, p.y + bob, p.z);
                    
                    mesh.children.forEach(child => {
                        if (child instanceof THREE.Mesh) {
                            const mat = child.material as THREE.MeshPhysicalMaterial;
                            mat.transparent = true;
                            mat.opacity = gIn * 0.9;
                            if (avalancheFlashing?.[i]) {
                                mat.color.setStyle(THEME.warn);
                                mat.emissive.setStyle(THEME.warn);
                                mat.emissiveIntensity = 0.5;
                            } else {
                                mat.color.setStyle("#0e2433");
                                mat.emissive.setStyle("#0e2433");
                                mat.emissiveIntensity = 0.1;
                            }
                        }
                    });
                }
            }
        });
    };

    return { scene: s, camera, update };
  };

  const get2D = (i: number, row: number, total: number, cam: THREE.Camera) => projectToRect(cam, worldPos(i, row, total), rect);

  if (scene.mode === "shift") {
      const shift = scene.shift ?? 0;
      const letterBeat: (number | null)[] = chars.map(() => null);
      const groupOrder: number[] = chars.map(() => 0);
      const groupSize: Record<number, number> = {};
      let prev = 0;
      scene.steps.forEach((st, k) => {
        if (st.op === "map" && st.upTo != null) {
          const u = Math.min(st.upTo, n);
          let g = 0;
          for (let i = prev; i < u; i++) {
            letterBeat[i] = offset + k;
            groupOrder[i] = g++;
          }
          if (u > prev) groupSize[offset + k] = u - prev;
          prev = Math.max(prev, u);
        }
      });
      const letterState = (i: number): { rev: number; anim: boolean } => {
        const b = letterBeat[i];
        if (b == null) return { rev: 0, anim: false };
        const win = beatWindow(env.beats, b, totalBeats);
        if (env.p < win.start) return { rev: 0, anim: false };
        const bt = clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001));
        const cnt = groupSize[b] ?? 1;
        const startFrac = cnt > 1 ? (groupOrder[i] / (cnt + 0.5)) * 0.55 : 0;
        const t = clamp01((bt - startFrac) / 0.38);
        return { rev: t, anim: t > 0 && t < 1 };
      };
      
      const stRev = chars.map((_, i) => letterState(i));
      const cam = render3D(ctx, key, rect, build, env.elapsedMs, { gIn: frameIn, stRev });
      if (!cam) return;
      
      const label = `SHIFT +${shift}`;
      ctx.save();
      ctx.globalAlpha = frameIn;
      ctx.font = `800 ${unit * 0.62}px ${FONT_SANS}`;
      const tw = ctx.measureText(label).width;
      const cw = tw + unit * 1.1;
      const chipX = contentX + contentW / 2 - cw / 2;
      const chipY = areaY;
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.4;
      roundRect(ctx, chipX, chipY, cw, unit * 1.2, unit * 0.35);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = INK_ON_ACCENT;
      ctx.textAlign = "center";
      ctx.fillText(label, chipX + cw / 2, chipY + unit * 0.82);
      ctx.textAlign = "start";
      ctx.restore();
      
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        if (c === " ") continue;
        const p1 = get2D(i, -0.5, n, cam);
        const p2 = get2D(i, 0.5, n, cam);
        const bob = Math.sin(env.elapsedMs / 1200 + i) * unit * 1.5;
        const state = letterState(i);
        
        ctx.save();
        ctx.globalAlpha = frameIn;
        ctx.font = `700 ${unit * 1.2}px ${FONT_MONO}`;
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "center";
        ctx.fillText(c, p1.x, p1.y - bob + unit * 0.4);
        
        if (state.rev > 0) {
            ctx.globalAlpha = frameIn * clamp01(state.rev * 1.6);
            ctx.fillStyle = INK_BRIGHT;
            ctx.fillText(shiftChar(c, shift), p2.x, p2.y - bob + unit * 0.4);
        }
        ctx.restore();
        
        if (state.anim) {
          const from = { x: p1.x, y: p1.y - bob + unit * 1.0 };
          const to = { x: p2.x, y: p2.y - bob - unit * 1.5 };
          const midX = from.x + unit * 1.5;
          const pts = quadSamples(from, { x: midX, y: (from.y + to.y) / 2 }, to, 14);
          ctx.save();
          ctx.strokeStyle = accent;
          ctx.lineWidth = unit * 0.09;
          ctx.lineCap = "round";
          ctx.shadowColor = accentGlow;
          ctx.shadowBlur = unit * 0.4;
          strokeUpTo(ctx, pts, easeOutCubic(state.rev));
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }
      
  } else {
      let outputRevealed = false;
      let digestBeat = -1;
      let avalancheBeat = -1;
      let inputBeat = -1;
      scene.steps.forEach((st, k) => {
        const b = offset + k;
        if (b > active) return;
        if (st.op === "digest") { outputRevealed = true; digestBeat = b; }
        if (st.op === "avalanche") avalancheBeat = b;
        if (st.op === "input") inputBeat = b;
      });
      const avalanche = avalancheBeat >= 0;
      const changedIdx = 0;

      const activeStep = active - offset;
      const activeOp = activeStep >= 0 && activeStep < scene.steps.length ? scene.steps[activeStep].op : null;
      const mixing = activeOp === "mix";
      
      const digestScales: number[] = [];
      const avaHex = Array.from(digestHex(scene.text, 1));
      const baseHex = Array.from(digestHex(scene.text, 0));
      const avalancheFlashing: boolean[] = [];
      const currentHex: string[] = [];

      for (let i = 0; i < HASH_LEN; i++) {
        let scale = 1;
        if (digestBeat >= 0) {
          const win = beatWindow(env.beats, digestBeat, totalBeats);
          const bt = clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001));
          const delay = (i / HASH_LEN) * 0.55;
          const t = clamp01((bt - delay) / 0.35);
          if (env.p < win.start) scale = 0;
          else scale = easeOutBack(t);
        } else {
            scale = 0;
        }
        
        let ch = baseHex[i];
        let flashing = false;
        if (avalanche) {
          const win = beatWindow(env.beats, avalancheBeat, totalBeats);
          const bt = clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001));
          const delay = (i / HASH_LEN) * 0.4;
          const f = clamp01((bt - delay) / 0.32);
          if (env.p < win.start) ch = baseHex[i];
          else {
            ch = f < 0.5 ? baseHex[i] : avaHex[i];
            scale = Math.abs(Math.cos(Math.PI * f));
            flashing = f > 0 && f < 1 && baseHex[i] !== avaHex[i];
          }
        }
        digestScales.push(scale);
        avalancheFlashing.push(flashing);
        currentHex.push(ch);
      }
      
      const cam = render3D(ctx, key, rect, build, env.elapsedMs, { 
          gIn: frameIn, 
          outputRevealed, 
          digestScales, 
          avalancheFlashing, 
          isMixing: mixing 
      });
      if (!cam) return;
      
      // Input Row
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        if (c === " ") continue;
        const flip = avalanche && i === changedIdx;
        const shown = flip ? shiftChar(c, 1) : c;
        const p1 = get2D(i, -1, n, cam);
        const bob = Math.sin(env.elapsedMs / 1200 + i) * unit * 1.5;
        
        ctx.save();
        ctx.globalAlpha = frameIn;
        ctx.font = `700 ${unit * 1.2}px ${FONT_MONO}`;
        ctx.fillStyle = flip ? "#fecaca" : THEME.text;
        ctx.textAlign = "center";
        ctx.fillText(shown, p1.x, p1.y - bob + unit * 0.4);
        ctx.restore();
      }
      
      if (inputBeat >= 0) {
        const win = beatWindow(env.beats, inputBeat, totalBeats);
        const bt = clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001));
        if (bt > 0 && bt < 1) {
          const pTop = get2D(Math.floor(n/2), -1, n, cam);
          const pBot = get2D(0, 0, 1, cam);
          const cy = pTop.y + (pBot.y - pTop.y) * easeOutCubic(bt);
          ctx.save();
          ctx.globalAlpha = frameIn * Math.sin(Math.PI * bt);
          ctx.shadowColor = accentGlow;
          ctx.shadowBlur = unit * 0.9;
          ctx.fillStyle = INK_BRIGHT;
          ctx.beginPath();
          ctx.arc(pTop.x, cy, unit * 0.28, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      
      // Box overlay
      const pBox = get2D(0, 0, 1, cam);
      const bob = Math.sin(env.elapsedMs / 900) * unit * 1.5;
      const cy = pBox.y - bob;
      ctx.save();
      ctx.globalAlpha = frameIn;
      ctx.font = `800 ${unit * 0.72}px ${FONT_SANS}`;
      const lw = ctx.measureText(HASH_LABEL).width + unit * 0.9;
      ctx.fillStyle = rgba(secondary, 0.9);
      roundRect(ctx, pBox.x - lw / 2, cy - unit * 1.8, lw, unit * 1.2, unit * 0.4);
      ctx.fill();
      ctx.fillStyle = INK_ON_ACCENT;
      ctx.textAlign = "center";
      ctx.fillText(HASH_LABEL, pBox.x, cy - unit * 0.9);
      
      const interval = mixing ? 55 : 170;
      ctx.font = `700 ${unit * 1.0}px ${FONT_MONO}`;
      for (let r = 0; r < 2; r++) {
        for (let cI = 0; cI < 4; cI++) {
          const gx = pBox.x - unit * 2.5 + (cI / 3) * unit * 5.0;
          const gy = cy + unit * 0.5 + (r - 0.5) * unit * 1.5;
          const idx = Math.floor(env.elapsedMs / interval + r * 5 + cI * 3) % 16;
          ctx.globalAlpha = frameIn * (mixing ? 0.7 : 0.3);
          ctx.fillStyle = mixing ? accent : THEME.textDim;
          ctx.fillText(HEX[idx], gx, gy);
        }
      }
      ctx.restore();
      
      // Output hex
      for (let i = 0; i < HASH_LEN; i++) {
        if (!outputRevealed || digestScales[i] <= 0) continue;
        const p = get2D(i, 1, HASH_LEN, cam);
        const yBob = Math.sin(env.elapsedMs / 1200 + i) * unit * 1.5;
        
        ctx.save();
        ctx.globalAlpha = frameIn * clamp01(digestScales[i] * 1.6);
        ctx.font = `700 ${unit * 1.0}px ${FONT_MONO}`;
        ctx.fillStyle = avalancheFlashing[i] ? "#fecaca" : INK_BRIGHT;
        ctx.textAlign = "center";
        ctx.fillText(currentHex[i], p.x, p.y - yBob + unit * 0.35);
        ctx.restore();
      }
  }

  ctx.textAlign = "start";
}

function quadSamples(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  n: number
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    });
  }
  return pts;
}

function strokeUpTo(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], f: number) {
  if (pts.length < 2 || f <= 0) return;
  const total = pts.length - 1;
  const upto = clamp01(f) * total;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    if (i <= upto) {
      ctx.lineTo(pts[i].x, pts[i].y);
    } else {
      const frac = upto - (i - 1);
      ctx.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * frac, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * frac);
      break;
    }
  }
  ctx.stroke();
}

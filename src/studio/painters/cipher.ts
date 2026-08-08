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
  departT,
  shade,
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
const INK_PANEL = THEME.bgBottom;
const INK_FILL = "#0e2433";
const INK_BRIGHT = "#eaf6ff";
const INK_ON_ACCENT = "#06121a";
/** Idle (unlit) letter-tile face — matches `table.ts`/`bits.ts`/`circuit.ts`'s
 *  idle-face convention rather than a one-off hex. */
const IDLE_FACE = shade(THEME.panel, 0.09);
/** Shallow on purpose (mirrors `circuit.ts`/`diagram.ts`): world thickness for
 *  the tile bevel, never mapped to pixels itself. */
const DEPTH = 0.16;
/** A pale tint of `THEME.danger`, legible as body text on the dark tiles —
 *  derived from the semantic token rather than a one-off hex. */
const DANGER_TEXT = shade(THEME.danger, 0.6);

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
  const { unit, contentX, contentY, contentW, contentH, vertical, safeBottom } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.steps.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const leave = departT(env, 380);
  if (leave <= 0) return;
  const frameIn = easeOutCubic(enterT(env, 380)) * leave;
  const key = scene.id + "-ciph3d";

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.4;
  const areaY = contentY + band;
  const areaH = contentH - band;

  const chars = Array.from(scene.text);
  const n = chars.length;
  const rect = { x: contentX, y: areaY, w: contentW, h: areaH };

  const isHash = scene.mode === "hash";

  /**
   * The systemic rework this painter was left waiting for (`qa/ledger.json` ->
   * `2d-layout-round-tripped-through-camera`): rows sat at literal world Z
   * under a camera elevated to (0,12,10)/(0,10,8), so the hardcoded spans
   * above were tuned for one `rect` and drifted (measured: short 2.6% left
   * bleed) the moment the caption-aware `contentH` changed its aspect. Rows
   * are now laid out in PIXELS first — `pixelPos` maps a row/column straight
   * into `rect` — and blocks are mapped onto that via an on-axis camera +
   * `mappingAt`/`toWorld` (same technique as `table.ts`/`circuit.ts`).
   */
  const rowMin = isHash ? -1 : -0.5;
  const rowMax = isHash ? 1 : 0.5;
  const marginSide = unit * 1.4;
  const marginTop = unit * (scene.mode === "shift" ? 2.3 : 1.0);
  const marginBottom = unit * 1.1;
  const gridX = contentX + marginSide;
  const gridW = Math.max(unit * 4, contentW - marginSide * 2);
  const gridTop = areaY + marginTop;
  // Bounded by safeBottom, not just areaH: at 9:16 contentH runs under the
  // caption band, and the output row's bob + baseline offset need margin
  // beyond that to never intrude (measured 0.5px clearance before this).
  const gridBottomMax = Math.min(areaY + areaH, safeBottom) - unit * 1.3;
  const gridH = Math.max(unit * 4, Math.min(areaH - marginTop - marginBottom, gridBottomMax - gridTop));
  const colX = (i: number, total: number) => (total === 1 ? gridX + gridW / 2 : gridX + (i / (total - 1)) * gridW);
  const rowY = (row: number) => gridTop + ((row - rowMin) / (rowMax - rowMin)) * gridH;
  const pixelPos = (i: number, row: number, total: number): { x: number; y: number } => ({ x: colX(i, total), y: rowY(row) });
  const BOB_PX = unit * 0.4;
  const bobFor = (i: number, elapsedMs: number, periodMs = 1200) => Math.sin(elapsedMs / periodMs + i) * BOB_PX;

  const boxW = Math.min(gridW * 0.42, unit * 11);
  // Fixed, not boxW-proportional: it must fit two rows of unit-sized scrambling
  // hex text regardless of how wide/narrow the box ends up.
  const boxH = unit * 3.2;

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
    const setFootprint = (g: THREE.Group, wPx: number, dPx: number): THREE.Vector3 => {
      const base = new THREE.Vector3(wPx / m.sx, dPx / m.sy, DEPTH);
      g.scale.copy(base);
      return base;
    };
    const place = (g: THREE.Group, i: number, row: number, total: number) => {
      const p = pixelPos(i, row, total);
      const w = toWorld(p.x, p.y);
      g.position.set(w.x, w.y, 0);
    };
    /** Re-place a mesh each frame at its pixel slot minus the shared bob, so
     *  the 3D block and its independently-drawn 2D text stay together — both
     *  read the same `bobFor(i, elapsedMs)`, never a mesh-local world bob. */
    const placeBobbed = (g: THREE.Group, i: number, row: number, total: number, elapsedMs: number, periodMs = 1200) => {
      const p = pixelPos(i, row, total);
      const w = toWorld(p.x, p.y - bobFor(i, elapsedMs, periodMs));
      g.position.set(w.x, w.y, 0);
    };

    const topBlocks: { mesh: THREE.Group, i: number, c: string, base: THREE.Vector3 }[] = [];
    const botBlocks: { mesh: THREE.Group, i: number, base: THREE.Vector3 }[] = [];
    let hashBox: THREE.Group | null = null;
    let hashBoxBase = new THREE.Vector3(1, 1, 1);

    const blockPx = Math.min((gridW / Math.max(n, 1)) * 0.6, unit * 3);

    for (let i = 0; i < n; i++) {
        const c = chars[i];
        if (c !== " ") {
            const g = makeBlock(1, 1, 1, IDLE_FACE, THEME.textDim);
            const base = setFootprint(g, blockPx, blockPx);
            place(g, i, isHash ? -1 : -0.5, n);
            s.add(g);
            topBlocks.push({ mesh: g, i, c, base });
        }
    }

    if (isHash) {
        hashBox = makeBlock(1, 1, 1, THEME.panel, accent);
        hashBoxBase = new THREE.Vector3(boxW / m.sx, boxH / m.sy, DEPTH);
        hashBox.scale.copy(hashBoxBase);
        place(hashBox, 0, 0, 1);
        s.add(hashBox);

        const outPx = Math.min((gridW / HASH_LEN) * 0.6, unit * 3);
        for (let i = 0; i < HASH_LEN; i++) {
            const g = makeBlock(1, 1, 1, INK_FILL, accent);
            const base = setFootprint(g, outPx, outPx);
            place(g, i, 1, HASH_LEN);
            s.add(g);
            botBlocks.push({ mesh: g, i, base });
        }
    } else {
        for (let i = 0; i < n; i++) {
            const c = chars[i];
            if (c !== " ") {
                const g = makeBlock(1, 1, 1, INK_FILL, accent);
                const base = setFootprint(g, blockPx, blockPx);
                place(g, i, 0.5, n);
                s.add(g);
                botBlocks.push({ mesh: g, i, base });
            }
        }
    }

    const update = (elapsedMs: number, ctxData: any) => {
        const { gIn, stRev, outputRevealed, digestScales, avalancheFlashing, isMixing } = ctxData;

        topBlocks.forEach(({ mesh, i, base }) => {
            mesh.visible = gIn > 0.01;
            placeBobbed(mesh, i, isHash ? -1 : -0.5, n, elapsedMs);
            mesh.scale.copy(base).multiplyScalar(Math.max(0.01, gIn));

            const anim = !!stRev?.[i]?.anim;
            const flashOn = anim || !!avalancheFlashing?.[i];

            mesh.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    const mat = child.material as THREE.MeshPhysicalMaterial;
                    mat.transparent = true;
                    mat.opacity = gIn * 0.9;
                    const face = flashOn ? THEME.warn : IDLE_FACE;
                    mat.color.setStyle(face);
                    mat.emissive.setStyle(face);
                    mat.emissiveIntensity = flashOn ? 0.5 : 0.1;
                }
            });
        });

        if (isHash && hashBox) {
            hashBox.visible = gIn > 0.01;
            placeBobbed(hashBox, 0, 0, 1, elapsedMs, 900);
            hashBox.scale.copy(hashBoxBase).multiplyScalar(Math.max(0.01, gIn));
            hashBox.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    const mat = child.material as THREE.MeshPhysicalMaterial;
                    mat.transparent = true;
                    mat.opacity = gIn * 0.9;
                    mat.emissiveIntensity = isMixing ? 0.4 : 0.1;
                }
            });
        }

        botBlocks.forEach(({ mesh, i, base }) => {
            if (!isHash) {
                const rev = stRev?.[i]?.rev ?? 0;
                mesh.visible = rev > 0 && gIn > 0.01;
                if (mesh.visible) {
                    const pop = easeOutBack(clamp01(rev));
                    placeBobbed(mesh, i, 0.5, n, elapsedMs);
                    mesh.scale.copy(base).multiplyScalar(Math.max(0.01, pop * gIn));
                }
            } else {
                mesh.visible = outputRevealed && digestScales[i] > 0;
                if (mesh.visible) {
                    const scale = digestScales[i];
                    placeBobbed(mesh, i, 1, HASH_LEN, elapsedMs);
                    mesh.scale.set(base.x * Math.max(0.01, scale * gIn), base.y * Math.max(0.01, gIn), base.z * Math.max(0.01, gIn));

                    mesh.children.forEach(child => {
                        if (child instanceof THREE.Mesh) {
                            const mat = child.material as THREE.MeshPhysicalMaterial;
                            mat.transparent = true;
                            mat.opacity = gIn * 0.9;
                            const face = avalancheFlashing?.[i] ? THEME.warn : INK_FILL;
                            mat.color.setStyle(face);
                            mat.emissive.setStyle(face);
                            mat.emissiveIntensity = avalancheFlashing?.[i] ? 0.5 : 0.1;
                        }
                    });
                }
            }
        });
    };

    return { scene: s, camera, update };
  };

  if (scene.mode === "shift") {
      const shift = scene.shift ?? 0;
      const letterBeat: (number | null)[] = chars.map(() => null);
      const groupOrder: number[] = chars.map(() => 0);
      const groupSize: Record<number, number> = {};
      let prev = 0;
      scene.steps.forEach((st, k) => {
        // Unrelated bug found while verifying the layout fix against the only
        // `mode: "shift"` fixture (`s2-cipher`): its reveal step is authored as
        // `op: "input"` ("we push the plaintext through, letter by letter"),
        // but only `op: "map"` built `letterBeat` — so no letter ever revealed,
        // regardless of playback progress. Both ops legitimately mean "reveal
        // up to `upTo` letters" for shift mode; the schema's shared `op` enum
        // just doesn't reserve one exclusively for it.
        if ((st.op === "map" || st.op === "input") && st.upTo != null) {
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
      render3D(ctx, key, rect, build, env.elapsedMs, { gIn: frameIn, stRev });

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
        const p1 = pixelPos(i, -0.5, n);
        const p2 = pixelPos(i, 0.5, n);
        const bob = bobFor(i, env.elapsedMs);
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
      
      render3D(ctx, key, rect, build, env.elapsedMs, {
          gIn: frameIn,
          outputRevealed,
          digestScales,
          avalancheFlashing,
          isMixing: mixing
      });

      // Input Row
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        if (c === " ") continue;
        const flip = avalanche && i === changedIdx;
        const shown = flip ? shiftChar(c, 1) : c;
        const p1 = pixelPos(i, -1, n);
        const bob = bobFor(i, env.elapsedMs);

        ctx.save();
        ctx.globalAlpha = frameIn;
        ctx.font = `700 ${unit * 1.2}px ${FONT_MONO}`;
        ctx.fillStyle = flip ? DANGER_TEXT : THEME.text;
        ctx.textAlign = "center";
        ctx.fillText(shown, p1.x, p1.y - bob + unit * 0.4);
        ctx.restore();
      }

      if (inputBeat >= 0) {
        const win = beatWindow(env.beats, inputBeat, totalBeats);
        const bt = clamp01((env.p - win.start) / Math.max(win.end - win.start, 0.001));
        if (bt > 0 && bt < 1) {
          const pTop = pixelPos(Math.floor(n/2), -1, n);
          const pBot = pixelPos(0, 0, 1);
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
      const pBox = pixelPos(0, 0, 1);
      const bob = bobFor(0, env.elapsedMs, 900);
      const cy = pBox.y - bob;
      ctx.save();
      ctx.globalAlpha = frameIn;
      ctx.font = `800 ${unit * 0.72}px ${FONT_SANS}`;
      const lw = ctx.measureText(HASH_LABEL).width + unit * 0.9;
      ctx.fillStyle = rgba(secondary, 0.9);
      roundRect(ctx, pBox.x - lw / 2, cy - boxH / 2 - unit * 1.5, lw, unit * 1.2, unit * 0.4);
      ctx.fill();
      ctx.fillStyle = INK_ON_ACCENT;
      ctx.textAlign = "center";
      ctx.fillText(HASH_LABEL, pBox.x, cy - boxH / 2 - unit * 0.6);

      const interval = mixing ? 55 : 170;
      ctx.font = `700 ${unit * 1.0}px ${FONT_MONO}`;
      const digitHalfSpan = boxW * 0.42;
      for (let r = 0; r < 2; r++) {
        for (let cI = 0; cI < 4; cI++) {
          const gx = pBox.x - digitHalfSpan + (cI / 3) * digitHalfSpan * 2;
          const gy = cy + (r - 0.5) * boxH * 0.5;
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
        const p = pixelPos(i, 1, HASH_LEN);
        const yBob = bobFor(i, env.elapsedMs);
        
        ctx.save();
        ctx.globalAlpha = frameIn * clamp01(digestScales[i] * 1.6);
        ctx.font = `700 ${unit * 1.0}px ${FONT_MONO}`;
        ctx.fillStyle = avalancheFlashing[i] ? DANGER_TEXT : INK_BRIGHT;
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

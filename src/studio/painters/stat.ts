import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle, isoCamera } from "./three3d";
import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, enterT, idle, wrapText, rgba, shade, variantOf } from "./common";
import type { PaintEnv } from "./index";

type StatScene = Extract<Scene, { kind: "stat" }>;

const DIGIT = /[0-9]/;

/** Odometer reel timing; the label waits on these so it never lands on spinning digits. */
const ODO_DELAY_MS = 120;
const ODO_STAGGER_MS = 90;
const ODO_ROLL_MS = 650;

/** Fraction of the camera frustum the platform may span before it is clamped. */
const BLOCK_FILL = 0.9;
/** How far the base plate overhangs the glass panel, in world units. */
const BASE_OVERHANG = 0.4;

/** Widest glyph among 0-9 at the current font, so digit columns don't jitter. */
function maxDigitWidth(ctx: CanvasRenderingContext2D): number {
  let mw = 0;
  for (let d = 0; d < 10; d++) mw = Math.max(mw, ctx.measureText(String(d)).width);
  return mw;
}

/** Total width of `value` when every digit occupies a fixed-width odometer cell. */
function valueWidth(ctx: CanvasRenderingContext2D, value: string, digitW: number): number {
  let total = 0;
  for (const ch of value) total += DIGIT.test(ch) ? digitW : ctx.measureText(ch).width;
  return total;
}

/**
 * Draw `value` with each digit rolling like an odometer reel to its final digit
 * (staggered left→right, easeOutCubic) while non-digit glyphs pop/fade in. At
 * roll progress 1 every reel lands exactly on its target so the frame is crisp.
 */
function drawOdometer(
  ctx: CanvasRenderingContext2D,
  env: PaintEnv,
  value: string,
  leftEdge: number,
  baseline: number,
  vpx: number,
  digitW: number,
  color: string
) {
  const cellH = vpx * 1.05;
  const clipTop = baseline - vpx * 0.82;
  let x = leftEdge;
  let digitIdx = 0;
  ctx.fillStyle = color;
  for (const ch of value) {
    if (DIGIT.test(ch)) {
      const d = Number(ch);
      const r = easeOutCubic(enterT(env, ODO_ROLL_MS, ODO_DELAY_MS + digitIdx * ODO_STAGGER_MS));
      const pos = (2 * 10 + d) * r; // two full spins, then settle on d
      const frac = pos - Math.floor(pos);
      const base = ((Math.floor(pos) % 10) + 10) % 10;
      const colCx = x + digitW / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - vpx * 0.05, clipTop, digitW + vpx * 0.1, cellH);
      ctx.clip();
      ctx.textAlign = "center";
      ctx.fillText(String(base), colCx, baseline - frac * cellH);
      ctx.fillText(String((base + 1) % 10), colCx, baseline - frac * cellH + cellH);
      ctx.restore();
      x += digitW;
      digitIdx++;
    } else {
      const pop = easeOutCubic(enterT(env, 400, 100));
      ctx.save();
      ctx.textAlign = "left";
      ctx.globalAlpha = pop;
      ctx.fillText(ch, x, baseline + (1 - pop) * vpx * 0.16);
      ctx.restore();
      x += ctx.measureText(ch).width;
    }
  }
}

/**
 * One big number made visceral. Digits ODOMETER-ROLL into place; two seeded
 * layouts (0 centered-huge, 1 left-aligned-with-context) keep stat scenes from
 * all looking identical across a video.
 */
export function paintStat(ctx: CanvasRenderingContext2D, scene: StatScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentX, contentW, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const variant = variantOf(scene.id, 2);
  const leftLayout = variant === 1;

  // Fit the value using the fixed-width digit metric the odometer actually uses.
  const maxW = (leftLayout && !vertical ? contentW * 0.52 : contentW) * 0.92;
  let vpx = unit * 7;
  const minPx = unit * 3;
  for (; vpx > minPx; vpx -= 2) {
    ctx.font = `900 ${vpx}px ${FONT_SANS}`;
    if (valueWidth(ctx, scene.value, maxDigitWidth(ctx)) <= maxW) break;
  }
  ctx.font = `900 ${vpx}px ${FONT_SANS}`;
  const digitW = maxDigitWidth(ctx);
  const totalW = valueWidth(ctx, scene.value, digitW);

  const cy = h * 0.4;
  const key = scene.id + "-stat3d";
  const rect = { x: 0, y: 0, w, h };

  // Position our 3D panel depending on the layout mode
  const vPos = new THREE.Vector3(0, 0.2, 0);
  if (leftLayout && !vertical) {
    vPos.set(-1.8, 0.2, 0);
  } else if (leftLayout && vertical) {
    vPos.set(0, 0.8, 0);
  }

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = isoCamera();
    studioLights(s, accent, secondary);

    const group = new THREE.Group();
    group.position.copy(vPos);
    s.add(group);

    // Platform Base on the ground. The width must come from the frustum: isoCamera
    // is fixed, so its half-width is 3.21*aspect — only 1.81 at 9:16, where a
    // hardcoded 5.8 put the slab 60% wider than anything the camera can see.
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.length();
    const halfW = halfH * (rect.w / rect.h);
    const blockW = Math.min(
      leftLayout && !vertical ? 4.2 : 5.8,
      2 * halfW * BLOCK_FILL - BASE_OVERHANG
    );
    const blockH = 3.2;
    const base = makeBlock(blockW + BASE_OVERHANG, 0.2, 1.2, shade(accent, -0.78), accent);
    base.position.y = -blockH / 2 - 0.1;
    group.add(base);

    // Thick Glossy Glass Panel
    const block = makeBlock(blockW, blockH, 0.3, secondary, accent);
    group.add(block);

    // Grid Floor
    const grid = new THREE.GridHelper(18, 14, new THREE.Color(accent), new THREE.Color(shade(accent, -0.62)));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.15;
    grid.position.y = -1.8;
    s.add(grid);

    // Shadow Catcher
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 15),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.8;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const update = (elapsedMs: number) => {
      const gIn = easeOutCubic(enterT(env, 500));
      const popVal = easeOutBack(enterT(env, 450, 60));
      const scale = 0.7 + 0.3 * popVal;

      group.scale.setScalar(Math.max(0.001, scale * gIn));
      group.position.y = vPos.y + Math.sin(elapsedMs / 1500) * 0.12;
      group.rotation.y = Math.sin(elapsedMs / 2000) * 0.05;

      block.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.Material).transparent = true;
          (child.material as THREE.Material).opacity = gIn * 0.85;
        }
      });
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, {}, env);
  if (!cam) return;

  const bobY = Math.sin(env.elapsedMs / 1500) * 0.12;
  const baseP = projectToRect(cam, new THREE.Vector3(vPos.x, vPos.y + bobY, vPos.z), rect);
  const floatY = baseP.y;

  const pop = easeOutBack(enterT(env, 450, 60));
  const s = 0.7 + 0.3 * pop;
  ctx.save();
  ctx.globalAlpha = enterT(env, 300, 60);
  ctx.translate(baseP.x, floatY - vpx * 0.08); // Center odometer on the glass panel
  ctx.scale(s, s);
  ctx.font = `900 ${vpx}px ${FONT_SANS}`;
  ctx.shadowColor = accentGlow;
  const breathe = idle(env, 2600);
  ctx.shadowBlur = unit * (1.15 + 0.35 * breathe);
  const leftEdge = -totalW / 2;
  drawOdometer(ctx, env, scene.value, leftEdge, vpx * 0.34, vpx, digitW, accent);
  ctx.restore();

  // Label. It must wait for the reels: at a fixed 320ms it faded in over digits
  // that keep spinning until ~950ms, so the two overlapped for most of a second.
  const digitCount = [...scene.value].filter((c) => DIGIT.test(c)).length;
  const odoSettleMs = ODO_DELAY_MS + Math.max(0, digitCount - 1) * ODO_STAGGER_MS + ODO_ROLL_MS;
  const labelIn = easeOutCubic(enterT(env, 380, odoSettleMs - 150));
  ctx.save();
  ctx.globalAlpha = labelIn;
  ctx.font = `700 ${unit * 1.5}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  const labelLines = wrapText(ctx, scene.label, (leftLayout && !vertical ? contentW * 0.52 : contentW) * 0.92);
  if (leftLayout) {
    ctx.textAlign = "left";
    const ly = floatY + unit * 2.8;
    labelLines.forEach((line, i) => ctx.fillText(line, contentX, ly + i * unit * 1.7));
  } else {
    ctx.textAlign = "center";
    const ly = floatY + unit * 3.5;
    labelLines.forEach((line, i) => ctx.fillText(line, w / 2, ly + i * unit * 1.7));
  }
  ctx.restore();

  // Context: below in centered layout, to the right in wide left layout.
  if (scene.context) {
    ctx.save();
    ctx.globalAlpha = easeOutCubic(enterT(env, 380, odoSettleMs + 120));
    ctx.font = `500 ${unit * 0.95}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    if (leftLayout && !vertical) {
      ctx.textAlign = "left";
      const cxr = w * 0.58;
      const cLines = wrapText(ctx, scene.context, w * 0.36);
      const blockH = cLines.length * unit * 1.35;
      const cyc = floatY - blockH / 2;
      // Accent rail marks the context column apart from the value.
      ctx.fillStyle = rgba(accent, 0.5);
      ctx.fillRect(cxr - unit * 0.5, cyc - unit * 0.6, unit * 0.1, blockH + unit * 0.4);
      ctx.fillStyle = THEME.textDim;
      cLines.forEach((line, i) => ctx.fillText(line, cxr, cyc + i * unit * 1.35));
    } else if (leftLayout) {
      ctx.textAlign = "left";
      const cyc = floatY + unit * 2.8 + labelLines.length * unit * 1.7 + unit * 1.4;
      wrapText(ctx, scene.context, contentW * 0.9).forEach((line, i) =>
        ctx.fillText(line, contentX, cyc + i * unit * 1.35)
      );
    } else {
      ctx.textAlign = "center";
      // Must follow the label's actual line count — a fixed 6.0 offset overlapped
      // the context onto the label's second line.
      const cyc = floatY + unit * 3.5 + labelLines.length * unit * 1.7 + unit * 1.1;
      wrapText(ctx, scene.context, contentW * 0.85).forEach((line, i) =>
        ctx.fillText(line, w / 2, cyc + i * unit * 1.35)
      );
    }
    ctx.restore();
  }
  ctx.textAlign = "start";
}

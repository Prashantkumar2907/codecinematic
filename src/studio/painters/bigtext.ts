import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, enterT, idle, clamp01, rgba, variantOf, shade } from "./common";
import type { PaintEnv } from "./index";
import type { Palette } from "./common";

type BigtextScene = Extract<Scene, { kind: "bigtext" }>;

/** Peak overshoot of the variant-4 stamp, before it is clamped to what fits the frame. */
const STAMP_OVERSHOOT = 0.8;
/** Widest fraction of the canvas the stamp may occupy at peak scale. */
const STAMP_SAFE_W = 0.94;
/** On 9:16 the bottom quarter is covered by the YouTube Shorts UI (CLAUDE_PROMPT.md:207). */
const SHORTS_SAFE_BOTTOM = 0.75;
/** Breathing gap above that band, in layout units, so nothing sits on the boundary. */
const SHORTS_SAFE_GAP = 0.6;
/** Vertical anchor of the centred variants (2, 3, 4). */
const CENTRED_ANCHOR = 0.44;
/** Chromatic-split offset at full strength, in layout units. */
const GLITCH_SPREAD = 0.5;
/** Opacity of the chromatic ghost at full strength; it rides over the real text. */
const GHOST_ALPHA = 0.55;
const PULSE_PERIOD_MS = 3000;
const PULSE_LEN_MS = 150;
const PULSE_GLITCH_SCALE = 0.3;
const PULSE_JITTER_MS = 130;
/** Variant 2's per-character rise, in multiples of the headline size. Must stay under
 *  the icon's 1.05 offset or the glyphs cascade straight through the icon. */
const CASCADE_RISE = 0.9;

type StyledWord = {
  text: string;
  type: "normal" | "accent" | "secondary";
};

/**
 * Parses markdown-like text to identify word-level styling tags:
 * **text** for accent color, __text__ for secondary color.
 * Supports multi-word blocks of the same format.
 */
function tokenizeFormattedText(text: string): StyledWord[] {
  const words = text.split(/\s+/);
  let currentType: "normal" | "accent" | "secondary" = "normal";
  const result: StyledWord[] = [];

  for (const word of words) {
    let type = currentType;
    let cleanWord = word;

    // Check for formatting start tags
    if (cleanWord.startsWith("**")) {
      currentType = "accent";
      type = "accent";
      cleanWord = cleanWord.slice(2);
    } else if (cleanWord.startsWith("__")) {
      currentType = "secondary";
      type = "secondary";
      cleanWord = cleanWord.slice(2);
    }

    // Check for formatting end tags
    let endsWithAccent = false;
    let endsWithSecondary = false;
    if (cleanWord.endsWith("**")) {
      endsWithAccent = true;
      cleanWord = cleanWord.slice(0, -2);
    } else if (cleanWord.endsWith("__")) {
      endsWithSecondary = true;
      cleanWord = cleanWord.slice(0, -2);
    }

    result.push({ text: cleanWord, type });

    if (endsWithAccent || endsWithSecondary) {
      currentType = "normal";
    }
  }
  return result;
}

/** Measures the total width of an array of styled words when drawn on a single line. */
function measureStyledWords(ctx: CanvasRenderingContext2D, words: StyledWord[]): number {
  if (words.length === 0) return 0;
  let width = 0;
  for (let i = 0; i < words.length; i++) {
    width += ctx.measureText(words[i].text + (i < words.length - 1 ? " " : "")).width;
  }
  return width;
}

/** Wraps styled words to fit within a maximum width. */
function wrapStyledWords(ctx: CanvasRenderingContext2D, words: StyledWord[], maxW: number): StyledWord[][] {
  const lines: StyledWord[][] = [];
  let currentLine: StyledWord[] = [];

  for (const word of words) {
    const candidate = [...currentLine, word];
    if (measureStyledWords(ctx, candidate) <= maxW || currentLine.length === 0) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = [word];
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Fits a multiline layout of styled words into a bounding box by finding
 * the largest font size (binary search) that keeps height <= maxH and wraps beautifully.
 */
function fitMultilineFontSize(
  ctx: CanvasRenderingContext2D,
  words: StyledWord[],
  opts: { maxW: number; maxH: number; startPx: number; minPx: number; weight?: number; family?: string }
): { px: number; lines: StyledWord[][] } {
  const { maxW, maxH, startPx, minPx, weight = 900, family = FONT_SANS } = opts;
  let low = minPx;
  let high = startPx;
  let optimalPx = minPx;
  let optimalLines: StyledWord[][] = [];

  while (low <= high) {
    const mid = Math.floor((low + high) / 2) & ~1; // Ensure even sizes for cleaner canvas render
    ctx.font = `${weight} ${mid}px ${family}`;
    const wrapped = wrapStyledWords(ctx, words, maxW);
    const lineH = mid * 1.14;
    const totalH = wrapped.length * lineH;

    if (totalH <= maxH) {
      optimalPx = mid;
      optimalLines = wrapped;
      low = mid + 2;
    } else {
      high = mid - 2;
    }
  }

  if (optimalLines.length === 0) {
    ctx.font = `${weight} ${minPx}px ${family}`;
    optimalLines = wrapStyledWords(ctx, words, maxW);
  }
  return { px: optimalPx, lines: optimalLines };
}

/** Helper for deterministic djb2 hash. */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Soft spring-like overshoot easing for premium liquid feel */
function easeSpring(t: number): number {
  const c4 = (2 * Math.PI) / 2.2;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -8 * t) * Math.sin((t * 8 - 0.75) * c4) + 1;
}


/** Draws a line of styled words but as a single solid color (used for chromatic aberration) */
function drawStyledLineSolid(
  ctx: CanvasRenderingContext2D,
  line: StyledWord[],
  x: number,
  y: number,
  px: number,
  color: string,
  weight: number | string = 900
) {
  ctx.save();
  ctx.font = `${weight} ${px}px ${FONT_SANS}`;
  ctx.textAlign = "start";
  ctx.fillStyle = color;
  let curX = x;
  for (let i = 0; i < line.length; i++) {
    const word = line[i];
    ctx.fillText(word.text, curX, y);
    curX += ctx.measureText(word.text + (i < line.length - 1 ? " " : "")).width;
  }
  ctx.restore();
}

/** Draws a line of styled words as a glowing neon outline */
function drawStyledLineOutline(
  ctx: CanvasRenderingContext2D,
  line: StyledWord[],
  x: number,
  y: number,
  px: number,
  palette: Palette,
  lineWidth: number,
  weight: number | string = 900
) {
  ctx.save();
  ctx.font = `${weight} ${px}px ${FONT_SANS}`;
  ctx.textAlign = "start";
  ctx.lineWidth = lineWidth;
  let curX = x;
  for (let i = 0; i < line.length; i++) {
    const word = line[i];
    if (word.type === "secondary") {
       ctx.strokeStyle = palette.secondary;
       ctx.shadowColor = palette.secondaryGlow;
    } else if (word.type === "accent") {
       ctx.strokeStyle = palette.accent;
       ctx.shadowColor = palette.accentGlow;
    } else {
       ctx.strokeStyle = "#ffffff";
       ctx.shadowColor = "rgba(255,255,255,0.4)";
    }
    ctx.shadowBlur = px * 0.15;
    ctx.strokeText(word.text, curX, y);
    curX += ctx.measureText(word.text + (i < line.length - 1 ? " " : "")).width;
  }
  ctx.restore();
}

/** Draws an organic, breathing nebula background aura with bokeh particles. */
function drawBackgroundAura(
  ctx: CanvasRenderingContext2D,
  sceneId: string,
  elapsedMs: number,
  w: number,
  h: number,
  unit: number,
  palette: Palette,
  glowIn: number
) {
  const seed = hashStr(sceneId);
  ctx.save();
  
  const breath = Math.sin(elapsedMs * 0.0005);
  const breath2 = Math.cos(elapsedMs * 0.0007);
  
  const grad1 = ctx.createRadialGradient(
    w * 0.5 + breath * w * 0.2, h * 0.4 + breath2 * h * 0.2, 0,
    w * 0.5 + breath * w * 0.2, h * 0.4 + breath2 * h * 0.2, Math.max(w, h) * 0.7
  );
  grad1.addColorStop(0, rgba(palette.accent, (0.08 + 0.03 * breath) * glowIn));
  grad1.addColorStop(1, rgba(palette.accent, 0));
  ctx.fillStyle = grad1;
  ctx.fillRect(0, 0, w, h);

  const grad2 = ctx.createRadialGradient(
    w * 0.3 - breath2 * w * 0.3, h * 0.6 - breath * h * 0.2, 0,
    w * 0.3 - breath2 * w * 0.3, h * 0.6 - breath * h * 0.2, Math.max(w, h) * 0.6
  );
  grad2.addColorStop(0, rgba(palette.secondary, (0.06 - 0.02 * breath2) * glowIn));
  grad2.addColorStop(1, rgba(palette.secondary, 0));
  ctx.fillStyle = grad2;
  ctx.globalCompositeOperation = "screen";
  ctx.fillRect(0, 0, w, h);
  
  ctx.globalCompositeOperation = "source-over";

  const particleCount = 18;
  for (let i = 0; i < particleCount; i++) {
    const xSeed = hashStr(sceneId + "p_x_" + i);
    const ySeed = hashStr(sceneId + "p_y_" + i);
    const sizeSeed = hashStr(sceneId + "p_s_" + i);
    const baseX = ((xSeed % 100) / 100) * w;
    const baseY = ((ySeed % 100) / 100) * h;
    const size = (sizeSeed % 5) + unit * 0.16;
    const driftX = Math.sin(elapsedMs * 0.0003 + i) * unit * 0.7;
    const driftY = Math.cos(elapsedMs * 0.0004 + i) * unit * 0.7;
    const alpha = (0.05 + 0.035 * Math.sin(elapsedMs * 0.0008 + i)) * clamp01(elapsedMs / 450) * glowIn;

    const pColor = i % 3 === 0 ? palette.secondary : palette.accent;
    ctx.fillStyle = rgba(pColor, alpha);
    ctx.shadowColor = rgba(pColor, alpha * 2);
    ctx.shadowBlur = size * 0.6;
    ctx.beginPath();
    ctx.arc(baseX + driftX, baseY + driftY, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}


/** Draws a line of styled words starting at `x` with premium vertical gradients and drop shadows. */
function drawStyledLine(
  ctx: CanvasRenderingContext2D,
  line: StyledWord[],
  x: number,
  y: number,
  px: number,
  palette: Palette,
  themeTextColor: string,
  weight: number | string = 900
) {
  ctx.save();
  ctx.font = `${weight} ${px}px ${FONT_SANS}`;
  ctx.textAlign = "start";
  let curX = x;

  // Modern soft text shadow for depth
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowOffsetY = px * 0.05;
  ctx.shadowBlur = px * 0.1;

  for (let i = 0; i < line.length; i++) {
    const word = line[i];
    const wordW = ctx.measureText(word.text).width;

    // Subtle premium top-to-bottom metallic gradient
    const grad = ctx.createLinearGradient(curX, y - px * 0.76, curX, y + px * 0.08);

    if (word.type === "accent") {
      grad.addColorStop(0, palette.accent);
      grad.addColorStop(1, shade(palette.accent, -0.15));
      ctx.fillStyle = grad;

      // Glow backdrop shadow for highlighted text
      ctx.save();
      ctx.shadowColor = rgba(palette.accent, 0.6);
      ctx.shadowBlur = px * 0.14;
      ctx.fillText(word.text, curX, y);
      ctx.restore();
    } else if (word.type === "secondary") {
      grad.addColorStop(0, palette.secondary);
      grad.addColorStop(1, shade(palette.secondary, -0.15));
      ctx.fillStyle = grad;

      // Glow backdrop shadow for secondary highlighted text
      ctx.save();
      ctx.shadowColor = rgba(palette.secondary, 0.6);
      ctx.shadowBlur = px * 0.14;
      ctx.fillText(word.text, curX, y);
      ctx.restore();
    } else {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#d1d5db"); // Elegant silver gradient
      ctx.fillStyle = grad;
      ctx.fillText(word.text, curX, y);
    }

    curX += ctx.measureText(word.text + (i < line.length - 1 ? " " : "")).width;
  }
  ctx.restore();
}

/** Draws a premium pulsing period dot at the end of the line. */
function drawPulsingEndDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  elapsedMs: number,
  color: string
) {
  const dotPulse = 1.0 + 0.18 * Math.sin(elapsedMs * 0.005);
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = rgba(color, 0.65);
  ctx.shadowBlur = px * 0.12;
  ctx.beginPath();
  ctx.arc(x, y, px * 0.07 * dotPulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Four deterministic entrance styles (seeded by scene id) so title cards
 * don't all look alike:
 * 0: Kinetic Cascade (staggered scaling lines with organic bounce)
 * 1: Word-by-word Masked Slide-up (gorgeous cinematic reveal)
 * 2: Editorial Left (expanding bar, lines sliding out from behind the bar)
 * 3: Bottom-third Headline under a top kicker with staggered elements
 */
export function paintBigtext(ctx: CanvasRenderingContext2D, scene: BigtextScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentX, contentW, vertical } = layout;
  const { accent, accentGlow, secondary, bgGlow } = env.palette;
  const variant: number = variantOf(scene.id, 5);
  const key = scene.id + "-bigtext3d";

  // Parse text content with markdown-like style support
  const mainWords = tokenizeFormattedText(scene.text);
  const subWords = scene.sub ? tokenizeFormattedText(scene.sub) : [];

  // Determine ideal multiline font size
  const maxW = contentW * 0.92;
  const maxH = h * (variant === 1 ? 0.35 : 0.44);
  const { px, lines } = fitMultilineFontSize(ctx, mainWords, {
    maxW,
    maxH,
    startPx: unit * 3.4,
    minPx: unit * 1.6,
    weight: 900,
  });
  ctx.font = `900 ${px}px ${FONT_SANS}`;
  const lineH = px * 1.14;

  

  // --- 3D Background & Glass Block Setup ---
  const rect = { x: 0, y: 0, w, h };
  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, vertical ? 14 : 11);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const group = new THREE.Group();
    s.add(group);

    const blockW = vertical ? 7.5 : 10;
    const blockH = vertical ? 5 : 4;
    const block = makeBlock(blockW, blockH, 0.2, THEME.panel, accent);
    group.add(block);

    const spreadX = vertical ? 4.0 : 6.0;
    const spreadY = vertical ? 6.0 : 4.0;
    // Grid lines are a darkened accent rather than a fixed slate, so the 3D floor
    // follows the subject palette like everything else.
    const grid = new THREE.GridHelper(
      Math.max(spreadX, spreadY) * 3,
      12,
      new THREE.Color(accent),
      new THREE.Color(shade(accent, -0.62))
    );
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    grid.position.y = -3.5;
    s.add(grid);

    const update = (elapsedMs: number) => {
      const gIn = easeOutCubic(enterT(env, 600));
      const pop = easeOutBack(enterT(env, 500));
      
      group.scale.setScalar(Math.max(0.001, pop));
      group.position.y = Math.sin(elapsedMs / 1500) * 0.15;
      group.rotation.x = Math.sin(elapsedMs / 2000) * 0.04;
      group.rotation.y = Math.cos(elapsedMs / 1800) * 0.04;

      block.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
              (child.material as THREE.Material).transparent = true;
              (child.material as THREE.Material).opacity = gIn * 0.85;
          }
      });
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return;

  const get2D = () => projectToRect(cam, new THREE.Vector3(0, Math.sin(env.elapsedMs / 1500) * 0.15, 0.1), rect);
  const baseP = get2D();
  
  const offsetX = baseP.x - w / 2;
  const offsetY = baseP.y - h / 2;

  // Every branch below must restore this before returning — a leaked save keeps
  // this translate alive into the next frame, and since offsetY tracks a sine it
  // integrates: variants 0 and 1 walked the whole frame ~600 px off-screen over a
  // few seconds and never came back.
  ctx.save();
  ctx.translate(offsetX, offsetY);

  // Gentle float/drift to keep the scene active
  const driftX = Math.sin(env.elapsedMs * 0.001) * unit * 0.06;
  const driftY = Math.cos(env.elapsedMs * 0.0012) * unit * 0.06;

  const glowIn = easeOutCubic(enterT(env, 600));
  // Animated background bokeh particles and nebula aura
  drawBackgroundAura(ctx, scene.id, env.elapsedMs, w, h, unit, env.palette, glowIn);

  // Subtext layout - set correct font for wrapping measurement
  const subPx = px * 0.45;
  const subLineH = subPx * 1.25;
  ctx.font = `600 ${subPx}px ${FONT_SANS}`;
  const subWrapped = scene.sub ? wrapStyledWords(ctx, subWords, maxW - (variant === 0 ? unit * 1.1 : 0)) : [];

  // Restore main text font for standard rendering
  ctx.font = `900 ${px}px ${FONT_SANS}`;

  // ==================== VARIANT 1 (Bottom Third) ====================
  if (variant === 1) {
    const kickerY = h * (vertical ? 0.16 : 0.18);
    const kIn = easeOutCubic(enterT(env, 320));
    ctx.save();
    ctx.textAlign = "center";
    if (scene.icon) {
      const iconIn = easeSpring(enterT(env, 450));
      ctx.globalAlpha = clamp01(iconIn);
      ctx.font = `${unit * 2.0}px ${FONT_SANS}`;
      ctx.fillText(scene.icon, w / 2 + driftX, kickerY + driftY);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = accent;
    const kw = unit * 3.2 * kIn;
    ctx.fillRect(w / 2 - kw / 2 + driftX, kickerY + unit * 0.9 + driftY, kw, unit * 0.22);
    ctx.restore();

    const bottomAnchor = h * 0.6;
    const firstBase = bottomAnchor - (lines.length - 1) * lineH;
    ctx.save();
    ctx.translate(driftX, driftY);
    lines.forEach((line, i) => {
      const tIn = easeSpring(enterT(env, 460, 120 + i * 110));
      ctx.save();
      ctx.globalAlpha = clamp01(enterT(env, 320, 120 + i * 110));
      const lineW = measureStyledWords(ctx, line);
      const startX = w / 2 - lineW / 2;
      const startY = firstBase + i * lineH;
      drawStyledLine(ctx, line, startX, startY + (1 - tIn) * unit * 1.5, px, env.palette, THEME.text);
      ctx.restore();
    });

    if (scene.sub) {
      const subIn = enterT(env, 420, 560);
      const subEase = easeOutCubic(subIn);
      ctx.globalAlpha = subIn;
      ctx.font = `600 ${subPx}px ${FONT_SANS}`;
      const subStartY = bottomAnchor + px * 0.6 + unit * 1.0;
      subWrapped.forEach((line, i) => {
        const lineW = measureStyledWords(ctx, line);
        drawStyledLine(
          ctx,
          line,
          w / 2 - lineW / 2,
          subStartY + i * subLineH + (1 - subEase) * unit * 0.5,
          subPx,
          env.palette,
          THEME.textDim,
          600
        );
      });
    }
    ctx.restore();
    ctx.restore(); // the outer save at the top of the painter
    return;
  }

  // ==================== VARIANT 0 (Editorial Left) ====================
  if (variant === 0) {
    const blockTop = h * 0.42 - ((lines.length - 1) * lineH) / 2;
    const textX = contentX + unit * 1.1;
    const barIn = easeOutCubic(enterT(env, 320));
    ctx.save();
    ctx.translate(driftX, driftY);

    if (scene.icon) {
      const iconIn = easeSpring(enterT(env, 450));
      const float = (idle(env, 2600) - 0.5) * unit * 0.12 * clamp01(iconIn);
      ctx.globalAlpha = clamp01(iconIn);
      ctx.font = `${unit * 2.2}px ${FONT_SANS}`;
      ctx.fillText(scene.icon, textX, blockTop - px * 1.15 + float);
      ctx.globalAlpha = 1;
    }

    // Left vertical accent bar. barIn must scale the WHOLE height: multiplying only
    // the px*1.1 term left (lines-1)*lineH of bar on screen at full opacity on the
    // very first frame, before any text — a pop-in, and the loudest thing in frame 0.
    ctx.save();
    ctx.globalAlpha = barIn;
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.5;
    ctx.fillRect(contentX, blockTop - px * 0.85, unit * 0.28, ((lines.length - 1) * lineH + px * 1.1) * barIn);
    ctx.restore();

    // Staggered lines slide out from behind the vertical bar (using clipping path)
    lines.forEach((line, i) => {
      const tIn = easeSpring(enterT(env, 500, 100 + i * 120));
      ctx.save();
      // Mask starting at the right of the bar
      ctx.beginPath();
      ctx.rect(textX, blockTop + i * lineH - px * 1.1, w, lineH * 1.4);
      ctx.clip();

      const slideX = textX + (1 - tIn) * unit * 1.8;
      ctx.globalAlpha = clamp01(tIn);
      drawStyledLine(ctx, line, slideX, blockTop + i * lineH, px, env.palette, THEME.text);
      ctx.restore();
    });

    if (scene.sub) {
      const subIn = enterT(env, 420, 550);
      const subEase = easeOutCubic(subIn);
      ctx.globalAlpha = subIn;
      const subStartY = blockTop + (lines.length - 1) * lineH + px * 0.6 + unit * 1.0;
      subWrapped.forEach((line, i) => {
        drawStyledLine(
          ctx,
          line,
          textX,
          subStartY + i * subLineH + (1 - subEase) * unit * 0.5,
          subPx,
          env.palette,
          THEME.textDim,
          600
        );
      });
    }
    ctx.restore();
    ctx.restore(); // the outer save at the top of the painter
    return;
  }

  // Common setups for Centered Variants (2, 3, 4)
  ctx.save();
  
  let shakeX = 0;
  let shakeY = 0;
  if (variant === 4) {
    const tIn = enterT(env, 350);
    if (tIn >= 1.0 && env.elapsedMs < 350 + 300) {
       const shakeP = 1 - (env.elapsedMs - 350) / 300;
       shakeX = Math.sin(env.elapsedMs * 0.1) * unit * 0.4 * shakeP;
       shakeY = Math.cos(env.elapsedMs * 0.12) * unit * 0.4 * shakeP;
    }
  }
  
  const startY = (-(lines.length - 1) * lineH) / 2;

  // The centred variants anchor at 0.44h and grow downward, which drops the sub
  // block under the Shorts caption strip on 9:16. Lift the whole composition by
  // exactly the overhang rather than moving the anchor for both aspects.
  const subBlockBottom =
    CENTRED_ANCHOR * h +
    startY +
    lines.length * lineH +
    px * 0.1 +
    unit * 1.0 +
    Math.max(subWrapped.length - 1, 0) * subLineH;
  // 0.75h - gap is below the caption band (which starts at 0.70h on a Short).
  const safeLimit = layout.safeBottom - unit * SHORTS_SAFE_GAP;
  const safeLift = vertical && scene.sub ? Math.max(0, subBlockBottom - safeLimit) : 0;

  // Apply the base float, shake, and center the canvas
  ctx.translate(w / 2 + driftX + shakeX, CENTRED_ANCHOR * h - safeLift + driftY + shakeY);

  if (scene.icon) {
    const iconIn = easeSpring(enterT(env, 550));
    const float = (idle(env, 2600) - 0.5) * unit * 0.12 * clamp01(iconIn);
    // Anchor the scale at the icon's own slot. Scaling about the composition
    // origin makes a small iconIn multiply the slot's y toward centre, so the
    // icon flies up through the headline instead of popping in place.
    ctx.save();
    ctx.globalAlpha = clamp01(enterT(env, 320));
    ctx.translate(0, startY - px * 1.05 + float);
    ctx.scale(Math.max(0.01, iconIn), Math.max(0.01, iconIn));
    ctx.font = `${unit * 2.6}px ${FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(scene.icon, 0, 0);
    ctx.restore();
  }

  // ==================== VARIANT 2 (Stamp with Shockwave & Cinematic Idle) ====================
  if (variant === 4) {
    const tIn = enterT(env, 350);
    const stampT = easeOutCubic(tIn);
    // Clamp the overshoot to what still fits: the type is already fitted to 92% of
    // contentW, so a fixed 1.8x start slices the widest line off both canvas edges.
    const widestLine = lines.reduce((m, line) => Math.max(m, measureStyledWords(ctx, line)), 1);
    const overshoot = clamp01(Math.min(STAMP_OVERSHOOT, (w * STAMP_SAFE_W) / widestLine - 1));
    const scale = 1.0 + (1 - stampT) * overshoot;
    const isLanded = tIn >= 1.0;

    if (isLanded) {
       const waveP = clamp01((env.elapsedMs - 350) / 600);
       const waveScale = easeOutCubic(waveP) * w * 0.8;
       ctx.save();
       ctx.globalAlpha = (1 - waveP) * 0.6;
       ctx.strokeStyle = env.palette.accent;
       ctx.lineWidth = unit * 0.2;
       ctx.beginPath();
       ctx.arc(0, 0, waveScale, 0, Math.PI * 2);
       ctx.stroke();
       ctx.restore();
       
       ctx.save();
       const sparkCount = 12;
       for(let s=0; s<sparkCount; s++) {
           const angle = (Math.PI * 2 / sparkCount) * s;
           const sparkD = easeOutCubic(waveP) * w * 0.4 * (0.8 + 0.4 * Math.sin(s * 99));
           ctx.globalAlpha = (1 - waveP) * 0.8;
           ctx.fillStyle = env.palette.accent;
           ctx.beginPath();
           ctx.arc(Math.cos(angle) * sparkD, Math.sin(angle) * sparkD, unit * 0.15, 0, Math.PI * 2);
           ctx.fill();
       }
       ctx.restore();
    }

    ctx.save();
    // Continuous cinematic slow push (Ken Burns) and subtle breathing after landing
    const idleZoom = isLanded ? 1.0 + 0.04 * (1 - Math.exp(-(env.elapsedMs - 350) * 0.0002)) : 1.0;
    const idleBreath = isLanded ? 1.0 + 0.015 * Math.sin(env.elapsedMs * 0.002) : 1.0;
    
    ctx.scale(scale * idleZoom * idleBreath, scale * idleZoom * idleBreath);
    const bodyAlpha = clamp01(tIn * 1.5);
    ctx.globalAlpha = bodyAlpha;

    const maxGlitch = unit * GLITCH_SPREAD;
    const glitch = (1 - stampT) * maxGlitch;

    // Periodic holographic pulse (every ~3 seconds, glitches for 150ms). Jitter comes
    // from a deterministic oscillator: Math.random() would make the same frame render
    // differently on every pass, which the recorder and this QA harness both rely on.
    const isPulse = isLanded && env.elapsedMs % PULSE_PERIOD_MS > PULSE_PERIOD_MS - PULSE_LEN_MS;
    const pulseGlitch = isPulse ? maxGlitch * PULSE_GLITCH_SCALE * idle(env, PULSE_JITTER_MS) : 0;
    const gAmount = Math.max(glitch, pulseGlitch);

    lines.forEach((line, i) => {
      const lineW = measureStyledWords(ctx, line);

      // Lines gently float relative to each other when idle
      const idleY = isLanded ? Math.sin(env.elapsedMs * 0.0015 + i) * unit * 0.03 : 0;
      const ly = startY + i * lineH + idleY;
      const lx = -lineW / 2;

      // The styled text is always drawn; the chromatic split rides on top and fades
      // out with gAmount. Swapping between the two (the previous if/else) meant no
      // real text existed for the first 350ms and the colour arrived in one frame.
      drawStyledLine(ctx, line, lx, ly, px, env.palette, THEME.text);

      if (gAmount > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = bodyAlpha * clamp01(gAmount / maxGlitch) * GHOST_ALPHA;
        drawStyledLineSolid(ctx, line, lx - gAmount, ly, px, env.palette.secondary);
        drawStyledLineSolid(ctx, line, lx + gAmount, ly, px, env.palette.accent);
        ctx.restore();
      }
    });
    ctx.restore();
  }
  // ==================== VARIANT 3 (Outline to Solid Fill) ====================
  else if (variant === 3) {
    ctx.save();
    const idleZoom = 1.0 + 0.04 * (1 - Math.exp(-env.elapsedMs * 0.0002));
    ctx.scale(idleZoom, idleZoom);

    lines.forEach((line, i) => {
      const lineW = measureStyledWords(ctx, line);
      const idleY = Math.sin(env.elapsedMs * 0.0015 + i) * unit * 0.04;
      const ly = startY + i * lineH + idleY;
      const lx = -lineW / 2;
      
      const tIn = clamp01(enterT(env, 800, i * 150));
      const outlineT = clamp01(tIn * 2);
      const fillT = clamp01((tIn - 0.5) * 2);
      
      if (outlineT > 0) {
        ctx.save();
        ctx.globalAlpha = outlineT * (1 - fillT);
        drawStyledLineOutline(ctx, line, lx, ly, px, env.palette, Math.max(1, unit * 0.08));
        ctx.restore();
      }
      
      if (fillT > 0) {
         ctx.save();
         ctx.beginPath();
         const waveH = lineH * 1.5 * fillT;
         ctx.rect(-w, ly + px * 0.2 - waveH, w * 2, waveH);
         ctx.clip();
         drawStyledLine(ctx, line, lx, ly, px, env.palette, THEME.text);
         ctx.restore();
      }
    });
    ctx.restore();
  }
  // ==================== VARIANT 2 (Letter-Cascade) ====================
  else if (variant === 2) {
    let globalCharIndex = 0;
    
    ctx.save();
    const idleZoom = 1.0 + 0.04 * (1 - Math.exp(-env.elapsedMs * 0.0002));
    ctx.scale(idleZoom, idleZoom);

    lines.forEach((line, i) => {
      const lineW = measureStyledWords(ctx, line);
      const ly = startY + i * lineH;
      let curX = -lineW / 2;
      
      for (let wi = 0; wi < line.length; wi++) {
        const word = line[wi];
        const text = word.text;
        const spaceW = (wi < line.length - 1) ? ctx.measureText(" ").width : 0;
        
        for (let ci = 0; ci < text.length; ci++) {
          const char = text[ci];
          const charBaseX = curX + ctx.measureText(text.substring(0, ci)).width;
          const charW = ctx.measureText(char).width;
          
          const tIn = easeSpring(enterT(env, 400, globalCharIndex * 25));
          if (tIn > 0) {
            ctx.save();
            ctx.globalAlpha = clamp01(tIn);
            
            const yOff = (1 - tIn) * -px * CASCADE_RISE;
            const rot = (1 - tIn) * -0.25;
            
            // Subtle per-character idle wave
            const isLanded = tIn >= 1.0;
            const idleCharY = isLanded ? Math.sin(env.elapsedMs * 0.002 + globalCharIndex * 0.5) * unit * 0.04 : 0;
            
            ctx.translate(charBaseX + charW / 2, ly + yOff + idleCharY);
            ctx.rotate(rot);
            ctx.translate(-(charBaseX + charW / 2), -ly);
            
            drawStyledLine(ctx, [{ text: char, type: word.type }], charBaseX, ly, px, env.palette, THEME.text);
            ctx.restore();
          }
          globalCharIndex++;
        }
        curX += ctx.measureText(text).width + spaceW;
      }
    });
    ctx.restore();
  }
  // Subtext for Centered Variants (2, 3, 4)
  if (scene.sub) {
    const subIn = enterT(env, 420, 600);
    const subEase = easeOutCubic(subIn);
    ctx.globalAlpha = subIn;
    ctx.font = `600 ${subPx}px ${FONT_SANS}`;
    const subStartY = startY + lines.length * lineH + px * 0.1 + unit * 1.0;
    subWrapped.forEach((line, i) => {
      const lineW = measureStyledWords(ctx, line);
      drawStyledLine(
        ctx,
        line,
        -lineW / 2,
        subStartY + i * subLineH + (1 - subEase) * unit * 0.5,
        subPx,
        env.palette,
        THEME.textDim,
        600
      );
    });
  }
  ctx.restore();
  ctx.restore();
}

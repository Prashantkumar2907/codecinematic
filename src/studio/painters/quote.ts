import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, frustumHalfExtent, type ThreeBundle } from "./three3d";
import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, enterT, idle, clamp01, wrapText, rgba, variantOf, shade } from "./common";
import type { PaintEnv } from "./index";

/** Fraction of the camera frustum the glass block may span. */
const BLOCK_FILL = 0.92;

type QuoteScene = Extract<Scene, { kind: "quote" }>;

export function paintQuote(ctx: CanvasRenderingContext2D, scene: QuoteScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const variant = variantOf(scene.id, 3);
  const leftBar = variant === 1;
  const fullBleed = variant === 2;
  const key = scene.id + "-quote3d";

  const glowIn = easeOutCubic(enterT(env, 600));
  const maxW = contentW * (leftBar ? 0.82 : fullBleed ? 0.9 : 0.86);
  const leftEdge = contentX + unit * 1.4;
  const startY = h * (leftBar ? 0.32 : 0.34);
  const maxBottom = h * (vertical ? 0.82 : 0.88);

  let qpx = unit * (fullBleed ? 1.7 : 1.35);
  ctx.font = `italic 600 ${qpx}px Georgia, ${FONT_SANS}`;
  let lines = wrapText(ctx, scene.text, maxW);
  let lineH = qpx * 1.44;
  if (startY + lines.length * lineH + unit * 2.4 > maxBottom) {
    qpx = unit * (vertical ? 1.05 : 1.0);
    ctx.font = `italic 600 ${qpx}px Georgia, ${FONT_SANS}`;
    lines = wrapText(ctx, scene.text, maxW);
    lineH = qpx * 1.44;
  }

  const rect = { x: 0, y: 0, w, h };
  
  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, vertical ? 14 : 11);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const group = new THREE.Group();
    s.add(group);

    // 3D Glass Block behind the quote. Clamped to the frustum: a literal 6 at 9:16
    // is half-width 3.0 against a visible 2.87, so it hung off both edges.
    const { halfW, halfH } = frustumHalfExtent(camera, rect);
    const blockW = Math.min(vertical ? 6 : 9, 2 * halfW * BLOCK_FILL);
    const blockH = Math.min(vertical ? 4.5 : 3.5, 2 * halfH * BLOCK_FILL);
    const block = makeBlock(blockW, blockH, 0.2, secondary, accent);
    group.add(block);

    // Floor grid & shadow
    const spreadX = vertical ? 4.0 : 6.0;
    const spreadY = vertical ? 6.0 : 4.0;
    const grid = new THREE.GridHelper(Math.max(spreadX, spreadY) * 3, 12, new THREE.Color(accent), new THREE.Color(shade(accent, -0.62)));
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
  
  // Now we draw the 2D text overlay, offset by baseP so it tracks the 3D block
  const offsetX = baseP.x - w / 2;
  const offsetY = baseP.y - h / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);

  // Opening quotemark
  const markIn = easeOutBack(enterT(env, 420));
  if (fullBleed) {
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.15 * clamp01(markIn);
    ctx.font = `900 ${unit * 11}px Georgia, ${FONT_SANS}`;
    ctx.fillStyle = accent;
    ctx.fillText("“", w / 2, h * 0.52);
  } else if (leftBar) {
    ctx.textAlign = "left";
    ctx.globalAlpha = clamp01(markIn);
    ctx.font = `900 ${unit * 2.6}px Georgia, ${FONT_SANS}`;
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.6;
    ctx.fillText("“", leftEdge, startY - qpx * 0.4);
  } else {
    ctx.textAlign = "center";
    ctx.globalAlpha = clamp01(markIn);
    ctx.font = `900 ${unit * 4.4}px Georgia, ${FONT_SANS}`;
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.8;
    ctx.fillText("“", w / 2, startY - unit * 0.5);
  }

  // Words rise in
  const totalWords = lines.reduce((acc, l) => acc + l.split(" ").length, 0);
  const perWordMs = Math.min(90, 1500 / Math.max(totalWords, 1));
  let wordIndex = 0;

  ctx.textAlign = "start";
  ctx.font = `italic 600 ${qpx}px Georgia, ${FONT_SANS}`;
  lines.forEach((line, li) => {
    const words = line.split(" ");
    const lineW = ctx.measureText(line).width;
    let x = leftBar ? leftEdge : w / 2 - lineW / 2;
    const y = startY + li * lineH;
    for (const word of words) {
      const wIn = easeOutCubic(enterT(env, 200, 300 + wordIndex * perWordMs));
      ctx.globalAlpha = wIn;
      ctx.fillStyle = THEME.text;
      ctx.fillText(word, x, y + (1 - wIn) * unit * 0.5);
      x += ctx.measureText(word + " ").width;
      wordIndex++;
    }
  });

  const tailY = startY + lines.length * lineH;
  const wordsDoneMs = 300 + totalWords * perWordMs + 150;
  const ruleIn = easeOutCubic(enterT(env, 380, wordsDoneMs));

  if (leftBar) {
    const barTop = startY - qpx;
    const barBottom = tailY + unit * 0.4;
    const barGrow = easeOutCubic(enterT(env, 500));
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.5;
    ctx.fillRect(contentX, barTop, unit * 0.28, (barBottom - barTop) * barGrow);
    ctx.shadowBlur = 0;
    if (scene.author) {
      ctx.globalAlpha = easeOutCubic(enterT(env, 380, wordsDoneMs + 150));
      ctx.font = `700 ${unit * 0.95}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "left";
      ctx.fillText(`— ${scene.author}`, leftEdge, tailY + unit * 1.6);
    }
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(w / 2 - unit * 2.6 * ruleIn, tailY + unit * 0.3, unit * 5.2 * ruleIn, unit * 0.18);
    if (scene.author) {
      ctx.globalAlpha = easeOutCubic(enterT(env, 380, wordsDoneMs + 150));
      ctx.font = `700 ${unit * 0.95}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = "center";
      ctx.fillText(`— ${scene.author}`, w / 2, tailY + unit * 1.7);
    }
  }
  ctx.restore();
}

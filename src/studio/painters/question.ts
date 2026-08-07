import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, enterT, idle, sub, clamp01, wrapText, roundRect, rgba, variantOf, shade ,
  revealT,
} from "./common";
import type { PaintEnv } from "./index";

/** How far the 2D layer may follow the projected 3D panel, in layout units. */
const MAX_PARALLAX_UNITS = 1.5;
/** On 9:16 the bottom quarter is covered by the YouTube Shorts UI (CLAUDE_PROMPT.md:207). */
const SHORTS_SAFE_BOTTOM = 0.75;

type QuestionScene = Extract<Scene, { kind: "question" }>;

/**
 * Seeded composition (scene id): 0 centered mark + question, 1 lower-third card
 * with a compact top mark, 2 spotlight with a watermark question mark. The mark
 * pop, line cascade, and CTA reveal are shared across all three.
 */
export function paintQuestion(ctx: CanvasRenderingContext2D, scene: QuestionScene, env: PaintEnv) {
  const { layout } = env;
  const { w, h, unit, contentW } = layout;
  const { accent, accentSoft, accentGlow, secondary } = env.palette;
  const variant = variantOf(scene.id, 3);

  const markIn = easeOutBack(enterT(env, 450));

  // Layout calculations
  ctx.save();
  ctx.font = `800 ${unit * 1.5}px ${FONT_SANS}`;
  const lines = wrapText(ctx, scene.text, contentW * (variant === 1 ? 0.82 : 0.9));
  ctx.restore();

  const lineH = unit * 2.0;
  const startY = h * (variant === 1 ? 0.5 : 0.42);
  const cardTop = startY - unit * 1.8;
  const cardW = contentW * (variant === 1 ? 0.92 : 0.95);

  let cardH = lines.length * lineH + unit * 2.5;
  if (scene.hint) {
    ctx.save();
    ctx.font = `500 ${unit * 0.95}px ${FONT_SANS}`;
    const hintLines = wrapText(ctx, `Hint: ${scene.hint}`, contentW * 0.85);
    cardH += hintLines.length * unit * 1.4 + unit * 1.0;
    ctx.restore();
  }

  const rect = { x: w / 2 - cardW / 2, y: cardTop, w: cardW, h: cardH };
  const key = scene.id + "-question3d";

  const cardIn = variant === 1 ? easeOutCubic(enterT(env, 420, 150)) : easeOutCubic(enterT(env, 450));

  // Projected tracking targets
  let projectedPanelCenter = { x: w / 2, y: cardTop + cardH / 2 };
  let projectedMarkCenter = { x: w / 2, y: h * (variant === 1 ? 0.16 : 0.24) };

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(layout.vertical ? 42 : 34, 1, 0.1, 100);
    camera.position.set(6.5, 4.8, 8.5);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const grid = new THREE.GridHelper(16, 12, new THREE.Color(accent), new THREE.Color(shade(accent, -0.62)));
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.15;
    grid.position.y = -3.5;
    s.add(grid);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -3.51;
    shadowPlane.receiveShadow = true;
    s.add(shadowPlane);

    const group = new THREE.Group();
    s.add(group);

    // Thick glossy backboard panel
    const panel3DW = layout.vertical ? 5.2 : 7.2;
    const panel3DH = rect.h / rect.w * panel3DW;
    const panelBlock = makeBlock(panel3DW, panel3DH, 0.25, shade(accent, -0.86), accent);
    group.add(panelBlock);

    // Question mark block
    const markBlock = makeBlock(1.4, 1.4, 0.22, accentSoft, accent);
    group.add(markBlock);

    const update = (elapsedMs: number, data: { markIn: number; cardIn: number }) => {
      const { markIn: mIn, cardIn: cIn } = data;

      group.scale.setScalar(1);
      
      // Idle float & rotation
      group.position.y = Math.sin(elapsedMs / 1600) * 0.12;
      group.rotation.x = Math.sin(elapsedMs / 2000) * 0.02;
      group.rotation.y = Math.cos(elapsedMs / 1800) * 0.02;

      panelBlock.scale.setScalar(Math.max(0.001, cIn));

      if (variant === 2) {
        markBlock.visible = false;
      } else {
        markBlock.visible = true;
        const compact = variant === 1;
        const baseMarkY = compact ? panel3DH / 2 + 0.6 : panel3DH / 2 + 1.2;
        const bob = Math.sin(elapsedMs / 1000) * 0.08;
        markBlock.position.set(0, baseMarkY + bob, 0.2);
        markBlock.rotation.y = Math.sin(elapsedMs / 1200) * 0.2;
        markBlock.scale.setScalar(Math.max(0.001, mIn));
      }

      // Export projected positions
      const pWorld = panelBlock.getWorldPosition(new THREE.Vector3());
      projectedPanelCenter = projectToRect(camera, pWorld, rect);

      const mWorld = markBlock.getWorldPosition(new THREE.Vector3());
      projectedMarkCenter = projectToRect(camera, mWorld, rect);
    };

    return { scene: s, camera, update };
  };

  // Radial Spotlight background for Variant 2
  if (variant === 2) {
    const spot = ctx.createRadialGradient(w / 2, h * 0.44, 0, w / 2, h * 0.44, Math.min(w, h) * 0.55);
    spot.addColorStop(0, rgba(accent, 0.16 * easeOutCubic(enterT(env, 600))));
    spot.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.08 * clamp01(markIn);
    ctx.font = `900 ${unit * 11}px ${FONT_SANS}`;
    ctx.fillStyle = accent;
    ctx.fillText("?", w / 2, h * 0.56);
    ctx.restore();
  }

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { markIn, cardIn });
  if (!cam) return;

  // ── Question Mark Overlay ───────────────────────────────
  if (variant !== 2) {
    const compact = variant === 1;
    const pulse = 1 + 0.03 * Math.sin(env.elapsedMs / 320);
    ctx.save();
    ctx.textAlign = "center";
    ctx.translate(projectedMarkCenter.x, projectedMarkCenter.y);
    if (!compact) {
      const ringPhase = (env.elapsedMs % 2200) / 2200;
      for (const off of [0, 0.5]) {
        const rp = (ringPhase + off) % 1;
        ctx.beginPath();
        ctx.arc(0, 0, unit * (1.6 + rp * 3.2), 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.35 * (1 - rp) * markIn;
        ctx.lineWidth = unit * 0.09;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.scale(pulse * (compact ? 0.55 : 1), pulse * (compact ? 0.55 : 1));
    const wob = 0.06 * Math.sin(env.elapsedMs / 700);
    ctx.rotate(wob);
    ctx.font = `900 ${unit * 4.4}px ${FONT_SANS}`;
    ctx.fillStyle = accentSoft;
    ctx.fillText("?", 0, unit * 0.3);
    ctx.font = `900 ${unit * 3.2}px ${FONT_SANS}`;
    ctx.fillStyle = accent;
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.8;
    ctx.fillText("?", 0, 0);
    ctx.restore();
  }

  // Translate 2D context to track the floating 3D background panel
  const origPanelCX = w / 2;
  const origPanelCY = cardTop + cardH / 2;
  // Parallax nudge only. Unclamped, this offset is the full projection error of an
  // off-axis iso camera, and it dragged the entire 2D layer off-frame at 16:9 —
  // heading clipped at x=0, CTA sliced by the bottom edge.
  const maxNudge = unit * MAX_PARALLAX_UNITS;
  const nudge = (d: number) => Math.max(-maxNudge, Math.min(maxNudge, d));
  const offsetX = nudge(projectedPanelCenter.x - origPanelCX);
  const offsetY = nudge(projectedPanelCenter.y - origPanelCY);

  ctx.save();
  ctx.translate(offsetX, offsetY);

  // Colored top tab for Variant 1
  if (variant === 1) {
    ctx.save();
    ctx.globalAlpha = cardIn;
    ctx.fillStyle = accent;
    roundRect(ctx, w / 2 - cardW / 2, cardTop, unit * 3, unit * 0.22, unit * 0.11);
    ctx.fill();
    ctx.restore();
  }

  // Question Lines Cascade
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `800 ${unit * 1.5}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  lines.forEach((line, i) => {
    const tIn = easeOutCubic(enterT(env, 350, 250 + i * 120));
    ctx.globalAlpha = tIn;
    ctx.fillText(line, w / 2, startY + i * lineH + (1 - tIn) * unit * 0.9);
  });
  ctx.restore();

  // Hint Lines
  let cursor = startY + lines.length * lineH + unit * (variant === 1 ? 1.3 : 0.6);
  if (scene.hint) {
    ctx.save();
    // Duration-aware: the hint should land after the question has been read.
    ctx.globalAlpha = easeOutCubic(Math.max(revealT(env, 0.4, 0.58), enterT(env, 350, 700) * 0.3));
    ctx.font = `500 ${unit * 0.95}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "center";
    const hintLines = wrapText(ctx, `Hint: ${scene.hint}`, contentW * 0.85);
    hintLines.forEach((line, i) => ctx.fillText(line, w / 2, cursor + i * unit * 1.4));
    cursor += hintLines.length * unit * 1.4 + unit * 0.8;
    ctx.restore();
  }

  // Call-To-Action (CTA) comment bubble at the bottom
  const ctaT = Math.max(sub(env.p, 0.5, 0.25), enterT(env, 450, 1800));
  const ctaIn = easeOutBack(ctaT);
  if (ctaIn > 0) {
    const label = "Comment your answer 👇";
    ctx.save();
    ctx.font = `700 ${unit * 1.05}px ${FONT_SANS}`;
    const tw = ctx.measureText(label).width;
    const padX = unit * 1.2;
    const bw = tw + padX * 2;
    const bh = unit * 2.2;
    const bx = w / 2 - bw / 2;
    const bob = (idle(env, 2400) - 0.5) * unit * 0.2 * clamp01(ctaT);
    // 0.86h put the CTA under the Shorts caption strip; keep it above the band and
    // leave room for the clamped parallax nudge on top.
    // 0.75h/0.94h both sit BELOW the caption band; layout.safeBottom is the real
    // boundary and already accounts for the burned-in caption on both aspects.
    // `bob` is added AFTER the clamp, so it can carry the pill back across the
    // line it was just clamped to — measured 3.9px over. Its amplitude is half of
    // `unit * 0.2`, so reserve that in the floor as well as the parallax nudge.
    const ctaFloor = layout.safeBottom - bh - maxNudge - unit * 0.1;
    const by = Math.min(Math.max(cursor + unit * 0.8, h * 0.68), ctaFloor) + bob;

    ctx.globalAlpha = Math.min(1, ctaIn);
    ctx.translate(w / 2, by + bh / 2);
    ctx.scale(ctaIn, ctaIn);
    ctx.translate(-w / 2, -(by + bh / 2));
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * 0.9;
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#06121a";
    ctx.textAlign = "center";
    ctx.fillText(label, w / 2, by + bh * 0.66);
    ctx.restore();
  }

  ctx.restore();
}

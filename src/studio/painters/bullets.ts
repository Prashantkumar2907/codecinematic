import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, enterT, idle, clamp01, wrapText, fitFontSize, roundRect, beatT, beatWindow, activeBeatIndex, variantOf, flowDots, rgba } from "./common";
import type { PaintEnv } from "./index";

type BulletsScene = Extract<Scene, { kind: "bullets" }>;

const DIM_ALPHA = 0.55;
/** On 9:16 the bottom quarter is covered by the YouTube Shorts UI (CLAUDE_PROMPT.md:207). */
const SHORTS_SAFE_BOTTOM = 0.75;
/** Breathing gap above that band, in layout units. */
const SHORTS_SAFE_GAP = 0.8;
/** Tallest a row may get before the list stops stretching and centres instead. */
const MAX_ROW_PITCH = 4.0;
/** Panel height in three.js world units; width is derived so it spans the content box. */
const PANEL_H = 1.5;
/** Fraction of the frustum width a panel fills, leaving a hairline of breathing room. */
const PANEL_FILL = 0.98;
/** Clearance between the outermost panel edge and the frustum edge, in world units. */
const PANEL_EDGE_GAP = 0.15;
/** Horizontal padding inside a panel, as a fraction of its projected width. */
const PANEL_PAD = 0.045;

export function paintBullets(ctx: CanvasRenderingContext2D, scene: BulletsScene, env: PaintEnv) {
  const { layout } = env;
  const { h, unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, secondary, accentGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.items.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeStart = active >= 0 ? beatWindow(env.beats, active, totalBeats).start : 0;
  const dimE = easeOutCubic(clamp01(((env.p - activeStart) * env.durationMs) / 220));
  const key = scene.id + "-bul3d";

  const titleIn = easeOutCubic(enterT(env, 380));
  ctx.save();
  ctx.globalAlpha = titleIn;
  ctx.translate((1 - titleIn) * -unit, 0);
  ctx.font = `800 ${unit * 1.7}px ${FONT_SANS}`;
  ctx.fillStyle = THEME.text;
  const titleLines = wrapText(ctx, scene.title, contentW);
  titleLines.forEach((line, i) => ctx.fillText(line, contentX, contentY + unit * 1.6 + i * unit * 2.1));
  const titleBottom = contentY + unit * 1.6 + titleLines.length * unit * 2.1;
  ctx.fillStyle = accent;
  ctx.fillRect(contentX, titleBottom - unit * 0.5, unit * 3.4 * titleIn, unit * 0.22);
  ctx.restore();

  const n = scene.items.length;
  const listTop = titleBottom + unit * (vertical ? 1.6 : 1.0);
  // 0.86h put the last two of four bullets under the Shorts caption strip — half
  // the scene's content was invisible on the platform it is mainly made for.
  const listBottom = vertical
    ? Math.min(contentY + contentH, h * SHORTS_SAFE_BOTTOM - unit * SHORTS_SAFE_GAP)
    : contentY + contentH;
  // Stop stretching once rows are far enough apart, then centre what is left, so a
  // two-item list does not scatter its bullets across the whole frame.
  const available = listBottom - listTop;
  const listH = Math.min(available, n * unit * MAX_ROW_PITCH);

  const rect = { x: contentX, y: listTop + (available - listH) / 2, w: contentW, h: listH };
  const camFov = vertical ? 45 : 36;
  const camZ = vertical ? 14 : 11;
  const halfH = Math.tan((camFov * Math.PI) / 360) * camZ;
  // Derived, not hardcoded: the old 4.0 exceeded 16:9's frustum half-height of 3.57,
  // so the first and last panels rendered outside the rect and got sliced.
  const spreadY = Math.max(0, halfH - PANEL_H / 2 - PANEL_EDGE_GAP);
  // Panels were a fixed 8.5 wide, which left them centred and narrower than the
  // content box while the title sat flush left. Derive the width from the frustum
  // instead so the list lines up with the title at either aspect.
  const PANEL_W = 2 * Math.tan((camFov * Math.PI) / 360) * camZ * (rect.w / rect.h) * PANEL_FILL;
  
  const posY = (i: number) => n === 1 ? 0 : spreadY - (i / (n - 1)) * spreadY * 2;

  const build = (): ThreeBundle => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(camFov, 1, 0.1, 100);
    // Centred, not x=2: the offset camera sheared every panel and pushed the whole
    // list right of the title it belongs to.
    camera.position.set(0, 0, camZ);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const models = scene.items.map((item, i) => {
      // Create a glass-like panel for each bullet
      const g = makeBlock(PANEL_W, PANEL_H, 0.15, secondary, accent);
      g.position.set(0, posY(i), 0);
      s.add(g);
      return g;
    });

    const update = (elapsedMs: number) => {
      models.forEach((m, i) => {
        const beatIdx = offset + i;
        const msB = (env.p - beatWindow(env.beats, beatIdx, totalBeats).start) * env.durationMs;
        const appear = easeOutCubic(clamp01(msB / 320));
        const pop = easeOutBack(clamp01(msB / 320));
        const t = beatT(env.beats, beatIdx, totalBeats, env.p);
        
        const isCurrent = active === beatIdx;
        const alpha = isCurrent ? 1 : 1 - (1 - DIM_ALPHA) * dimE;

        if (t <= 0) {
            m.visible = false;
        } else {
            m.visible = true;
            m.scale.setScalar(Math.max(0.001, pop));
            m.position.x = (1 - appear) * 2.0; // Slide in from right slightly
            // Bob effect
            m.position.y = posY(i) + Math.sin(elapsedMs / 1000 + i) * 0.05;
            
            // Highlight current panel by bringing it slightly forward
            m.position.z = isCurrent ? 0.5 : 0;
            // Dim materials via opacity if not current
            m.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    (child.material as THREE.Material).transparent = true;
                    (child.material as THREE.Material).opacity = alpha * 0.9;
                }
            });
        }
      });
    };
    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, null, env);
  if (!cam) return;

  scene.items.forEach((item, i) => {
    const beatIdx = offset + i;
    const t = beatT(env.beats, beatIdx, totalBeats, env.p);
    if (t <= 0) return;

    const msB = (env.p - beatWindow(env.beats, beatIdx, totalBeats).start) * env.durationMs;
    const appear = easeOutCubic(clamp01(msB / 320));
    const isCurrent = active === beatIdx;
    const alpha = isCurrent ? 1 : 1 - (1 - DIM_ALPHA) * dimE;

    const baseWorld = new THREE.Vector3(0, posY(i), isCurrent ? 0.5 : 0);
    const baseP = projectToRect(cam, baseWorld, rect);

    ctx.save();
    ctx.globalAlpha = appear * alpha;

    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * 0.7 * (0.75 + 0.25 * idle(env, 2200));
    }
    
    // Panel edges in pixels, so the label can never spill past the panel it sits on.
    const panelZ = isCurrent ? 0.5 : 0;
    const left = projectToRect(cam, new THREE.Vector3(-PANEL_W / 2, posY(i), panelZ), rect).x;
    const right = projectToRect(cam, new THREE.Vector3(PANEL_W / 2, posY(i), panelZ), rect).x;
    const pad = (right - left) * PANEL_PAD;

    const markR = unit * 0.3;
    const markX = left + pad + markR;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(markX, baseP.y, markR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // One fitted line rather than a 2-line wrap: the panel is a fixed height, so a
    // second line lands outside it.
    const weight = isCurrent ? 600 : 500;
    const textX = markX + markR + pad;
    const px = fitFontSize(ctx, item.text, {
      maxW: right - pad - textX,
      startPx: unit * 1.1,
      minPx: unit * 0.72,
      weight,
    });
    ctx.font = `${weight} ${px}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textBaseline = "middle";
    ctx.fillText(item.text, textX, baseP.y);
    ctx.restore();
  });
}

import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, frustumHalfExtent, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, clamp01, wrapText, roundRect, fitFontSize, beatT, activeBeatIndex, enterT, idle, shade } from "./common";
import type { PaintEnv } from "./index";

type VocabScene = Extract<Scene, { kind: "vocab" }>;

/** Lowest usable baseline as a fraction of frame height. On 9:16 the bottom band
 *  is covered by the Shorts UI, so example text may not enter it. */
const SAFE_BOTTOM_SHORT = 0.75;
const SAFE_BOTTOM_LONG = 0.94;

/** Card width as a fraction of the visible frustum width, so 9:16 and 16:9 both
 *  fit — a world-space literal only ever fits one aspect (see three3d.ts:139). */
const CARD_W_FRAC = 0.94;
/** Vertical gap between cards as a fraction of the row pitch. */
const CARD_GAP_FRAC = 0.28;
const CARD_DEPTH = 0.5;
/** Camera: front-on with a small rise, so a card's projected front face is an
 *  axis-aligned rectangle and its text can be centred on it exactly. */
const CAM_RISE = 1.1;
const CAM_DIST = 9;
/** Entrance scale. A positional slide is not usable here: the card is already
 *  CARD_W_FRAC of the frustum, so any translation pushes it off frame mid-entrance
 *  and drags its text with it. Scaling about the card's own centre cannot. */
const CARD_ENTER_SCALE = 0.9;
/** Idle bob amplitude as a fraction of row pitch. */
const BOB_FRAC = 0.035;
/** Forward nudge of the active card, in world units. */
const ACTIVE_Z = 0.22;
/** Opacity of an example that is not the active beat. */
const ROW_DIM_ALPHA = 0.72;
const TEXT_PAD_FRAC = 0.06;
/** Fraction of a card's entrance that passes before its text starts fading in. */
const TEXT_LAG = 0.3;
/** Card face: THEME.panel alone renders as flat near-black at this exposure, so
 *  the extrusion reads as a 2D outline. Lifted just enough to catch the lights. */
const CARD_FACE = shade(THEME.panel, 0.18);
/** Active-card emissive. Kept low so the accent-tinted target word inside the
 *  text still contrasts against the face it sits on. */
const ACTIVE_EMISSIVE = 0.11;
const ACTIVE_EMISSIVE_PULSE = 0.06;

/** Draw one line left-to-right, tinting occurrences of the target word. */
function drawHighlightedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  word: string,
  baseColor: string,
  accentColor: string
) {
  const lower = line.toLowerCase();
  const wl = word.toLowerCase();
  let cx = x;
  let idx = 0;
  while (idx < line.length) {
    const found = wl ? lower.indexOf(wl, idx) : -1;
    if (found === -1) {
      ctx.fillStyle = baseColor;
      ctx.fillText(line.slice(idx), cx, y);
      return;
    }
    if (found > idx) {
      const before = line.slice(idx, found);
      ctx.fillStyle = baseColor;
      ctx.fillText(before, cx, y);
      cx += ctx.measureText(before).width;
    }
    const match = line.slice(found, found + wl.length);
    ctx.fillStyle = accentColor;
    ctx.fillText(match, cx, y);
    cx += ctx.measureText(match).width;
    idx = found + wl.length;
  }
}

/** English-vocabulary flashcard: word + pronunciation + meaning, then usage examples. */
export function paintVocab(ctx: CanvasRenderingContext2D, scene: VocabScene, env: PaintEnv) {
  const { layout } = env;
  const { w, unit, contentX, contentY, contentW, vertical } = layout;
  const { accent, accentGlow, accentSoft, secondary } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + scene.examples.length;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const cx = w / 2;

  const wordIn = easeOutBack(enterT(env, 440));
  ctx.save();
  ctx.textAlign = "center";
  ctx.globalAlpha = clamp01(enterT(env, 300));
  ctx.translate(cx, contentY + unit * 1.9);
  ctx.scale(0.8 + 0.2 * wordIn, 0.8 + 0.2 * wordIn);
  const wpx = fitFontSize(ctx, scene.word, { maxW: contentW * 0.9, startPx: unit * 3.2, minPx: unit * 1.6, weight: 900 });
  ctx.font = `900 ${wpx}px ${FONT_SANS}`;
  ctx.fillStyle = accent;
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = unit * 0.8 * (0.82 + 0.18 * idle(env, 2600));
  ctx.fillText(scene.word, 0, 0);
  ctx.restore();

  const metaAlpha = clamp01(enterT(env, 320, 150));
  ctx.save();
  ctx.globalAlpha = metaAlpha;
  ctx.textAlign = "center";
  const chipFont = `700 ${unit * 0.65}px ${FONT_SANS}`;
  const pronFont = `italic 500 ${unit * 0.95}px ${FONT_SANS}`;
  const pos = scene.pos ? scene.pos.toUpperCase() : "";
  ctx.font = chipFont;
  const chipW = pos ? ctx.measureText(pos).width + unit * 1.0 : 0;
  ctx.font = pronFont;
  const pronW = scene.pron ? ctx.measureText(scene.pron).width : 0;
  const gapW = pos && scene.pron ? unit * 0.7 : 0;
  const rowY = contentY + unit * 3.3;
  let rowX = cx - (chipW + gapW + pronW) / 2;
  if (pos) {
    roundRect(ctx, rowX, rowY - unit * 0.75, chipW, unit * 1.1, unit * 0.35);
    ctx.fillStyle = accentSoft;
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = chipFont;
    ctx.textAlign = "center";
    ctx.fillText(pos, rowX + chipW / 2, rowY - unit * 0.02);
    rowX += chipW + gapW;
  }
  if (scene.pron) {
    ctx.font = pronFont;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = "left";
    ctx.fillText(scene.pron, rowX, rowY);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = clamp01(enterT(env, 320, 260));
  ctx.textAlign = "center";
  let mpx = unit * 1.15;
  ctx.font = `600 ${mpx}px ${FONT_SANS}`;
  const meaningText = scene.synonym ? `${scene.meaning}  ·  syn. ${scene.synonym}` : scene.meaning;
  let mLines = wrapText(ctx, meaningText, contentW * 0.9);
  if (mLines.length > 2) {
    mpx = unit * 0.98;
    ctx.font = `600 ${mpx}px ${FONT_SANS}`;
    mLines = wrapText(ctx, meaningText, contentW * 0.9);
  }
  ctx.fillStyle = THEME.text;
  const mTop = contentY + unit * 5.1;
  const mLineH = mpx * 1.32;
  mLines.forEach((line, i) => ctx.fillText(line, cx, mTop + i * mLineH));
  ctx.restore();
  ctx.textAlign = "start";

  // The example stack fills everything between the measured meaning and the safe
  // bottom. Centring it in the leftover space instead left a dead void on 9:16.
  const availTop = mTop + mLines.length * mLineH + unit * 1.0;
  const safeBottom = (vertical ? SAFE_BOTTOM_SHORT : SAFE_BOTTOM_LONG) * layout.h;
  const nEx = scene.examples.length;

  const key = scene.id + "-vocab3d";
  const rect = { x: contentX, y: availTop, w: contentW, h: Math.max(unit * 5, safeBottom - availTop) };

  const ghostIn = easeOutCubic(enterT(env, 360));

  const contextData = {
    examples: scene.examples.map((ex, i) => {
      const t = beatT(env.beats, offset + i, totalBeats, env.p);
      const appear = easeOutCubic(Math.min(1, t * 3));
      const isCurrent = active === offset + i;
      return { t, appear, isCurrent };
    }),
    ghostIn,
  };

  /** Card sizing derived from the live frustum, so both aspects fit by construction. */
  const cardMetrics = (camera: THREE.PerspectiveCamera) => {
    const { halfW, halfH } = frustumHalfExtent(camera, rect);
    const pitch = (halfH * 2) / nEx;
    return { cardW: halfW * 2 * CARD_W_FRAC, cardH: pitch * (1 - CARD_GAP_FRAC), pitch };
  };

  /** Single source of truth for where a card is, so the 3D mesh and the 2D text
   *  on top of it can never drift apart. */
  const cardCenter = (i: number, pitch: number, elapsedMs: number) => {
    const bob = Math.sin(elapsedMs / 1600 + i * 0.9) * pitch * BOB_FRAC;
    const y = ((nEx - 1) / 2 - i) * pitch + bob;
    return new THREE.Vector3(0, y, contextData.examples[i]?.isCurrent ? ACTIVE_Z : 0);
  };

  const build = (): ThreeBundle<typeof contextData> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 32 : 26, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, CAM_RISE, CAM_DIST);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const { cardW, cardH } = cardMetrics(camera);
    const models = scene.examples.map(() => {
      const g = makeBlock(cardW, cardH, CARD_DEPTH, CARD_FACE, accent);
      s.add(g);
      return g;
    });

    const update = (elapsedMs: number, data: typeof contextData) => {
      const { pitch } = cardMetrics(camera);
      models.forEach((mesh, i) => {
        const item = data.examples[i];
        if (!item || item.appear <= 0) {
          mesh.visible = false;
          return;
        }
        mesh.visible = true;
        mesh.position.copy(cardCenter(i, pitch, elapsedMs));
        const s = CARD_ENTER_SCALE + (1 - CARD_ENTER_SCALE) * item.appear;
        mesh.scale.set(s, s, 1);

        mesh.children.forEach((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const mat = child.material as THREE.MeshPhysicalMaterial;
          mat.transparent = true;
          mat.opacity = 0.92 * item.appear;
          if (item.isCurrent) {
            mat.emissive.setStyle(accent);
            mat.emissiveIntensity = ACTIVE_EMISSIVE + ACTIVE_EMISSIVE_PULSE * idle(env, 1400);
          } else {
            mat.emissive.setStyle(CARD_FACE);
            mat.emissiveIntensity = 0.06;
          }
        });
      });
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, contextData, env);
  if (!cam || !(cam instanceof THREE.PerspectiveCamera)) return;

  const { cardW, cardH, pitch } = cardMetrics(cam);
  /** Screen-space box of card i's front face. Exact for this front-on camera:
   *  the projected front face is axis-aligned, so two corners define it. */
  const cardBox = (i: number) => {
    const c = cardCenter(i, pitch, env.elapsedMs);
    const front = CARD_DEPTH / 2;
    const mid = projectToRect(cam, new THREE.Vector3(c.x, c.y, c.z + front), rect);
    const corner = projectToRect(cam, new THREE.Vector3(c.x - cardW / 2, c.y + cardH / 2, c.z + front), rect);
    return { cx: mid.x, cy: mid.y, w: (mid.x - corner.x) * 2, h: (mid.y - corner.y) * 2 };
  };

  scene.examples.forEach((ex, i) => {
    const item = contextData.examples[i];
    if (!item) return;
    const { t, appear, isCurrent } = item;

    if (t <= 0) {
      if (ghostIn > 0) {
        const box = cardBox(i);
        ctx.save();
        ctx.globalAlpha = 0.16 * ghostIn;
        roundRect(ctx, box.cx - box.w / 2, box.cy - box.h / 2, box.w, box.h, unit * 0.4);
        ctx.strokeStyle = accent;
        ctx.lineWidth = unit * 0.05;
        ctx.setLineDash([unit * 0.3, unit * 0.28]);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    const box = cardBox(i);
    // Text trails its card rather than arriving on the same tick.
    const textIn = easeOutCubic(clamp01((appear - TEXT_LAG) / (1 - TEXT_LAG)));
    ctx.save();
    ctx.globalAlpha = textIn * (isCurrent ? 1 : ROW_DIM_ALPHA);
    const textW = box.w * (1 - TEXT_PAD_FRAC * 2);
    // Type scale follows the card, not `unit`, because the card shrinks as the
    // example count grows. fitFontSize measures one line, so the budget is two
    // card widths — the size at which the text wraps to at most two lines.
    const px = fitFontSize(ctx, ex.text, {
      maxW: textW * 2,
      startPx: Math.min(unit * 0.92, box.h * 0.34),
      minPx: unit * 0.5,
      weight: 500,
    });
    ctx.font = `500 ${px}px ${FONT_SANS}`;
    const lines = wrapText(ctx, ex.text, textW).slice(0, 2);
    const lineH = px * 1.28;
    const firstBaseline = box.cy + px * 0.36 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, li) =>
      drawHighlightedLine(ctx, line, box.cx - textW / 2, firstBaseline + li * lineH, scene.word, THEME.text, accent)
    );
    ctx.restore();
  });
}

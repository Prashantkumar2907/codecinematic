import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, frustumHalfExtent, type ThreeBundle } from "./three3d";
import type { Scene } from "../schema";
import { THEME, FONT_SANS, easeOutBack, easeOutCubic, enterT, idle, clamp01, wrapText, roundRect, beatT, beatWindow, rgba, shade, variantOf } from "./common";
import type { PaintEnv } from "./index";

type MythfactScene = Extract<Scene, { kind: "mythfact" }>;

const DANGER = "#f87171";

/** Lowest usable baseline as a fraction of frame height; the 9:16 bottom band is
 *  covered by the Shorts UI. Matches bullets.ts / bigtext.ts / question.ts. */
const SAFE_BOTTOM_SHORT = 0.75;
/** Fraction of the visible frustum the card pair fills. */
const FILL = 0.94;
/** Gap between the two cards as a fraction of the span they share. */
const GAP_FRAC = 0.1;
const CARD_DEPTH = 0.5;
/** Card faces are darkened this far toward black. studioLights' key light is the
 *  card's own colour at 1.5 intensity, so a lightly-shaded face renders as flat
 *  mid-saturation and white text on it loses contrast. */
const CARD_FACE_DARKEN = -0.86;
/** Camera: front-on with a small rise, so a card's projected front face is an
 *  axis-aligned rectangle and its chrome can be placed on it exactly. */
const CAM_RISE = 0.6;
const CAM_DIST = 9;
/** Entrance scale. A card already fills FILL of the frustum, so an easeOutBack
 *  overshoot past 1 would push it off frame and drag its text with it. */
const CARD_ENTER_SCALE = 0.9;
/** The myth card's share of the stack in the emphasis variant (payoff dominates). */
const EMPHASIS_MYTH_FRAC = 0.4;
const MYTH_EMISSIVE_IDLE = 0.06;
const MYTH_EMISSIVE_BUST = 0.18;
const MYTH_EMISSIVE_PULSE = 0.1;
const FACT_EMISSIVE = 0.08;
const FACT_EMISSIVE_PULSE = 0.1;
/** How long the myth slab takes to go from idle to busted colour. */
const BUST_RAMP_MS = 320;
const BUST_SHAKE_MS = 350;
/** How far the busted myth card recedes, as a fraction of its own opacity. */
const MYTH_BUST_FADE = 0.22;
const MYTH_TEXT_FADE = 0.18;
/** Text block: chip band above the first baseline, line step, wrap ceiling. */
const CHIP_BAND = 2.3;
const LINE_STEP = 1.34;
const MAX_LINES = 5;
const MIN_FONT_UNITS = 0.72;

type Rect = { x: number; y: number; w: number; h: number };

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string, unit: number) {
  ctx.font = `800 ${unit * 0.68}px ${FONT_SANS}`;
  const tw = ctx.measureText(label).width;
  roundRect(ctx, x, y - unit * 0.78, tw + unit * 1.1, unit * 1.15, unit * 0.35);
  ctx.fillStyle = rgba(color, 0.16);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(label, x + unit * 0.55, y);
}

/**
 * Beat 0: the myth card appears. Beat 1: a ❌ stamps it and the fact card
 * reveals. Composition is seeded (scene id): 0 equal stacked cards,
 * 1 split side-by-side (horizontal; vertical falls back to stacked),
 * 2 emphasis stack where the payoff fact card dominates.
 */
export function paintMythfact(ctx: CanvasRenderingContext2D, scene: MythfactScene, env: PaintEnv) {
  const { layout } = env;
  const { h, unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const variant = variantOf(scene.id, 3);
  const split = !vertical && variant === 1;
  const emphasis = variant === 2;

  const t1 = beatT(env.beats, 1, 2, env.p);
  // Bust choreography runs on absolute ms into beat 1 — beat-fraction timing
  // dragged the stamp/strike out over seconds when the fact narration was long.
  const ms1 = t1 > 0 ? (env.p - beatWindow(env.beats, 1, 2).start) * env.durationMs : 0;
  const busted = t1 > 0;

  const mythIn = easeOutCubic(enterT(env, 380));
  const factIn = easeOutCubic(clamp01((ms1 - 120) / 420));
  const bustRamp = busted ? easeOutCubic(clamp01(ms1 / BUST_RAMP_MS)) : 0;

  const usableH = (vertical ? Math.min(contentY + contentH, h * SAFE_BOTTOM_SHORT) : contentY + contentH) - contentY;
  const key = scene.id + "-mythfact3d";
  const rect = { x: contentX, y: contentY, w: contentW, h: usableH };

  /** Card geometry from the live frustum, so both aspects fit by construction and
   *  the `emphasis` variant reaches the blocks instead of only the text rects. */
  const metrics = (camera: THREE.PerspectiveCamera) => {
    const { halfW, halfH } = frustumHalfExtent(camera, rect);
    const spanW = halfW * 2 * FILL;
    const spanH = halfH * 2 * FILL;
    if (split) {
      const gap = spanW * GAP_FRAC;
      const cw = (spanW - gap) / 2;
      return {
        myth: { x: -(cw + gap) / 2, y: 0, w: cw, h: spanH },
        fact: { x: (cw + gap) / 2, y: 0, w: cw, h: spanH },
      };
    }
    const gap = spanH * GAP_FRAC;
    const mh = (spanH - gap) * (emphasis ? EMPHASIS_MYTH_FRAC : 0.5);
    const fh = spanH - gap - mh;
    return {
      myth: { x: 0, y: spanH / 2 - mh / 2, w: spanW, h: mh },
      fact: { x: 0, y: -spanH / 2 + fh / 2, w: spanW, h: fh },
    };
  };

  // Both the mesh and the 2D chrome read their offsets from here, so the card and
  // the text on it cannot drift apart.
  const mythShake = busted && ms1 < BUST_SHAKE_MS ? Math.sin((ms1 / BUST_SHAKE_MS) * 28) * 0.12 * (1 - ms1 / BUST_SHAKE_MS) : 0;
  const bobOf = (elapsedMs: number, phase: number) => Math.sin(elapsedMs / 1400 + phase) * 0.05;

  const contextData = { mythIn, factIn, bustRamp };

  const build = (): ThreeBundle<typeof contextData> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(vertical ? 34 : 26, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, CAM_RISE, CAM_DIST);
    camera.lookAt(0, 0, 0);
    studioLights(s, DANGER, THEME.good);

    const g = metrics(camera);
    const mythBlock = makeBlock(g.myth.w, g.myth.h, CARD_DEPTH, shade(DANGER, CARD_FACE_DARKEN), DANGER);
    const factBlock = makeBlock(g.fact.w, g.fact.h, CARD_DEPTH, shade(THEME.good, CARD_FACE_DARKEN), THEME.good);
    s.add(mythBlock);
    s.add(factBlock);

    const enterScale = (t: number) => CARD_ENTER_SCALE + (1 - CARD_ENTER_SCALE) * t;
    const faces = (block: THREE.Group, fn: (mat: THREE.MeshPhysicalMaterial) => void) =>
      block.children.forEach((child) => {
        if (child instanceof THREE.Mesh) fn(child.material as THREE.MeshPhysicalMaterial);
      });

    const update = (elapsedMs: number, data: typeof contextData) => {
      const live = metrics(camera);

      mythBlock.visible = data.mythIn > 0;
      if (mythBlock.visible) {
        mythBlock.position.set(live.myth.x + mythShake, live.myth.y + bobOf(elapsedMs, 0), 0);
        const sc = enterScale(data.mythIn);
        mythBlock.scale.set(sc, sc, 1);
        faces(mythBlock, (mat) => {
          mat.transparent = true;
          mat.opacity = data.mythIn * (1 - MYTH_BUST_FADE * data.bustRamp);
          mat.emissive.setStyle(DANGER);
          // Ramped, not switched: flipping on the `busted` boolean turned the slab
          // from near-black to full red inside one 33ms frame.
          mat.emissiveIntensity =
            MYTH_EMISSIVE_IDLE +
            (MYTH_EMISSIVE_BUST - MYTH_EMISSIVE_IDLE) * data.bustRamp +
            MYTH_EMISSIVE_PULSE * data.bustRamp * idle(env, 900);
        });
      }

      factBlock.visible = data.factIn > 0;
      if (factBlock.visible) {
        factBlock.position.set(live.fact.x, live.fact.y + bobOf(elapsedMs, 2), 0);
        const sc = enterScale(data.factIn);
        factBlock.scale.set(sc, sc, 1);
        faces(factBlock, (mat) => {
          mat.transparent = true;
          mat.opacity = data.factIn;
          mat.emissive.setStyle(THEME.good);
          mat.emissiveIntensity = FACT_EMISSIVE + FACT_EMISSIVE_PULSE * idle(env, 1200);
        });
      }
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, contextData, env);
  if (!cam || !(cam instanceof THREE.PerspectiveCamera)) return;

  const geo = metrics(cam);
  /** Screen-space box of a card's front face. Exact for this front-on camera:
   *  the projected face is axis-aligned, so one corner and the centre define it. */
  const faceBox = (g: { x: number; y: number; w: number; h: number }, dx: number, dy: number) => {
    const front = CARD_DEPTH / 2;
    const mid = projectToRect(cam, new THREE.Vector3(g.x + dx, g.y + dy, front), rect);
    const corner = projectToRect(cam, new THREE.Vector3(g.x + dx - g.w / 2, g.y + dy + g.h / 2, front), rect);
    return { x: corner.x, y: corner.y, w: (mid.x - corner.x) * 2, h: (mid.y - corner.y) * 2 };
  };
  const mythR = faceBox(geo.myth, mythShake, bobOf(env.elapsedMs, 0));
  const factR = faceBox(geo.fact, 0, bobOf(env.elapsedMs, 2));

  // Type scale is fitted to the SMALLER of the two cards so both read at the same
  // size. fitFontSize only measures one line, so the fit has to be iterative: the
  // constraint is the wrapped line count against the card's projected height.
  const padX = unit;
  const textW = Math.min(mythR.w, factR.w) - padX * 2;
  const boxH = Math.min(mythR.h, factR.h);
  let fontPx = unit * 1.15;
  let mLines = [scene.myth];
  let fLines = [scene.fact];
  for (;;) {
    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    mLines = wrapText(ctx, scene.myth, textW).slice(0, MAX_LINES);
    fLines = wrapText(ctx, scene.fact, textW).slice(0, MAX_LINES);
    const step = fontPx * LINE_STEP;
    const need = unit * CHIP_BAND + fontPx + (Math.max(mLines.length, fLines.length) - 1) * step;
    if (need <= boxH - unit * 0.5 || fontPx <= unit * MIN_FONT_UNITS) break;
    fontPx -= unit * 0.05;
  }
  const lineStep = fontPx * LINE_STEP;

  /** Vertically centre chip + text as one group inside the card. */
  const groupTop = (box: { y: number; h: number }, lines: number) => {
    const groupH = unit * CHIP_BAND + fontPx + (lines - 1) * lineStep + fontPx * 0.25;
    return box.y + Math.max(unit * 0.4, (box.h - groupH) / 2);
  };

  // ── Myth card ──────────────────────────────────────────────────────────────────
  if (mythIn > 0) {
    const top = groupTop(mythR, mLines.length);
    ctx.save();
    ctx.globalAlpha = mythIn * (1 - MYTH_TEXT_FADE * bustRamp);

    chip(ctx, mythR.x + padX, top + unit, "MYTH", DANGER, unit);

    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    const firstBaseline = top + unit * CHIP_BAND + fontPx;
    mLines.forEach((line, i) => ctx.fillText(line, mythR.x + padX, firstBaseline + i * lineStep));

    if (busted) {
      // The strike spans the TEXT, not the card: running it to the card edge left
      // a red line hanging in empty space past the last word.
      const strike = easeOutCubic(clamp01(ms1 / 400));
      const struckW = Math.max(...mLines.map((line) => ctx.measureText(line).width));
      ctx.strokeStyle = rgba(DANGER, 0.8);
      ctx.lineWidth = unit * 0.12;
      const sy = firstBaseline + ((mLines.length - 1) * lineStep) / 2 - fontPx * 0.33;
      ctx.beginPath();
      ctx.moveTo(mythR.x + padX, sy);
      ctx.lineTo(mythR.x + padX + struckW * strike, sy);
      ctx.stroke();
    }
    ctx.restore();

    // ❌ badge: red ring seals in, then the cross strokes draw on.
    if (busted) {
      const stampIn = easeOutBack(clamp01(ms1 / 380));
      const r = unit * 0.85;
      ctx.save();
      ctx.translate(mythR.x + mythR.w - unit * 1.9, top + unit);
      ctx.rotate(-0.12 * (1 - clamp01(ms1 / 400)));
      ctx.scale(Math.max(0.01, stampIn), Math.max(0.01, stampIn));
      ctx.shadowColor = rgba(DANGER, 0.55);
      ctx.shadowBlur = unit * 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(DANGER, 0.16);
      ctx.fill();
      ctx.strokeStyle = DANGER;
      ctx.lineWidth = unit * 0.14;
      ctx.stroke();
      ctx.shadowBlur = 0;
      const draw = clamp01((ms1 - 260) / 320);
      const a = r * 0.48;
      ctx.lineWidth = unit * 0.22;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-a, -a);
      ctx.lineTo(-a + 2 * a * Math.min(1, draw * 2), -a + 2 * a * Math.min(1, draw * 2));
      ctx.stroke();
      if (draw > 0.5) {
        const d2 = (draw - 0.5) * 2;
        ctx.beginPath();
        ctx.moveTo(a, -a);
        ctx.lineTo(a - 2 * a * d2, -a + 2 * a * d2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Fact card ──────────────────────────────────────────────────────────────────
  if (factIn > 0) {
    const top = groupTop(factR, fLines.length);
    ctx.save();
    ctx.globalAlpha = factIn;

    chip(ctx, factR.x + padX, top + unit, "FACT", THEME.good, unit);

    // ✓ badge: green disc pops, then the tick draws on stroke by stroke.
    const checkIn = easeOutBack(clamp01((ms1 - 300) / 380));
    if (checkIn > 0) {
      const r = unit * 0.85;
      ctx.save();
      ctx.translate(factR.x + factR.w - unit * 1.9, top + unit);
      ctx.scale(Math.max(0.01, checkIn), Math.max(0.01, checkIn));
      ctx.shadowColor = rgba(THEME.good, 0.6);
      ctx.shadowBlur = unit * 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = THEME.good;
      ctx.fill();
      ctx.shadowBlur = 0;
      const draw = clamp01((ms1 - 480) / 350);
      if (draw > 0) {
        ctx.strokeStyle = THEME.bgBottom;
        ctx.lineWidth = unit * 0.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const p1 = { x: -r * 0.45, y: r * 0.05 };
        const p2 = { x: -r * 0.1, y: r * 0.42 };
        const p3 = { x: r * 0.5, y: -r * 0.35 };
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        if (draw < 0.45) {
          const f = draw / 0.45;
          ctx.lineTo(p1.x + (p2.x - p1.x) * f, p1.y + (p2.y - p1.y) * f);
        } else {
          ctx.lineTo(p2.x, p2.y);
          const f = (draw - 0.45) / 0.55;
          ctx.lineTo(p2.x + (p3.x - p2.x) * f, p2.y + (p3.y - p2.y) * f);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.font = `700 ${fontPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    const firstBaseline = top + unit * CHIP_BAND + fontPx;
    fLines.forEach((line, i) => ctx.fillText(line, factR.x + padX, firstBaseline + i * lineStep));
    ctx.restore();
  }
}

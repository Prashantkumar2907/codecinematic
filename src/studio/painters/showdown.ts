import * as THREE from "three";
import { render3D, projectToRect, studioLights, makeBlock, type ThreeBundle } from "./three3d";
import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  FONT_MONO,
  GLOW,
  STROKE,
  RADIUS,
  DUR,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  stagger,
  sub,
  lerp,
  lerpColor,
  shade,
  clamp01,
  roundRect,
  wrapText,
  fitFontSize,
  drawSceneTitle,
  beatWindow,
  beatT,
  activeBeatIndex,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type ShowdownScene = Extract<Scene, { kind: "showdown" }>;

/**
 * The pixel layout is authoritative: the camera is on-axis, so `projectToRect`
 * is affine on a z=const plane and every slab is sized and placed FROM the rect
 * its 2D chrome is drawn in.
 *
 * It used to lay the fighters out in pixels, map them LINEARLY onto a ±5.5-unit
 * ground plane and project them back through a camera at (0,10,7). A tilted
 * perspective does not round-trip, and the 9:16 frustum is only ~2.23 units
 * wide, so both labels, both score digits and the crown were drawn outside the
 * frame (`qa/AUDIT.md`: left 4.3%) — systemic
 * `2d-layout-round-tripped-through-camera`. Nothing may move a slab after
 * placement; the pixel chrome cannot follow it.
 */
const SLAB_DEPTH = 0.12;
/**
 * A box silhouette is square, so its corners poke outside the rounded border its
 * chrome draws — visible as four nubs and a second, offset outline around every
 * card. Insetting the slab by `radius * (1 - 1/sqrt2)` lands each corner exactly
 * on the arc, and `makeBlock`'s own wireframe is hidden so each element carries
 * exactly one outline.
 */
const CORNER_COVER = 1 - Math.SQRT1_2;
const CARD_RADIUS = RADIUS.md;
const ROW_RADIUS = RADIUS.sm;
const FACE_TINT = 0.22;
/** `THEME.panel` is within 4 RGB steps of the background; lift an idle slab off it. */
const IDLE_FACE_LIFT = 0.09;
const CAM_FOV = 40;
const CAM_DIST = 10;

/**
 * Every emphasis multiplier is <= 1, so a slab can never grow past the pixel rect
 * it was laid out in: the victor holds its size while the others shrink. A >1
 * "pop" would push the left card past `contentX` at 9:16, which is how the
 * original lost its labels off the frame.
 */
const SCALE_IN = 0.94;
const SCALE_IDLE = 0.96;
const SCALE_DEFEATED = 0.9;
const ROW_SCALE_IDLE = 0.97;
const BREATHE = 0.015;
const TEXT_SCALE_IN = 0.94;

const CARD_IN_MS = 460;
const ROW_IN_MS = 560;
const VS_IN_MS = 520;
const PULSE_MS = 1900;

/** Height held clear above the cards so the victor's crown can never reach the title. */
const CROWN_LANE_UNITS = 1.5;
const CROWN = "👑";
const CARD_H_UNITS = 5.2;
const CARD_H_UNITS_WIDE = 3.6;
const CARD_H_ZONE_MAX = 0.34;
/** A 16:9 content box is ~40 units wide; an 18-unit fighter card reads as a wall. */
const CARD_W_MAX_UNITS = 11;
const VS_GAP_UNITS = 2.8;
const VS_GAP_UNITS_WIDE = 3.2;
const VS_R_UNITS = 0.95;
const ROWS_GAP_UNITS = 0.9;
const ROW_PITCH_MAX_UNITS = 3.0;
const ROW_PITCH_MAX_UNITS_WIDE = 2.1;
const ROW_FILL = 0.88;
/** Below this a row cannot hold two type tiers, so the note is dropped rather than overlapped. */
const NOTE_MIN_ROW_UNITS = 1.5;
const GHOST_ALPHA = 0.32;
const LEAN_UNITS = 0.5;
const LEAN_ENGAGED = 1;
const LEAN_TIE = 0.5;
const LEAN_IDLE = 0.35;

const VERDICT_FONT_UNITS = 0.85;
const VERDICT_LINE_UNITS = 1.15;
const VERDICT_PAD_UNITS = 0.6;
const VERDICT_GAP_UNITS = 0.7;
const VERDICT_MAX_LINES = 2;
/**
 * Half of `STROKE.thin` sits outside the box path, so a box whose bottom edge IS
 * `safeBottom` strokes across it and into the burned-in caption. Reserving a full
 * stroke width keeps the drawn geometry above the line with an antialias margin.
 * The box's `GLOW.soft` bloom still reaches ~22px lower, and that is deliberate:
 * measured, it lifts the caption band by 5/255 luminance, while reserving the whole
 * blur radius here would shrink the 16:9 row band enough to cut the criterion font
 * by ~23%.
 */
const VERDICT_EDGE_UNITS = STROKE.thin;
/** Where a verdict with no beat of its own starts, as scene progress. */
const VERDICT_P = 0.8;

type Slab = {
  visible: boolean;
  cx: number;
  cy: number;
  /** Drawn size of the element; the slab itself is inset by `CORNER_COVER`. */
  w: number;
  h: number;
  radius: number;
  opacity: number;
  face: string;
};

export function paintShowdown(ctx: CanvasRenderingContext2D, scene: ShowdownScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical, w } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const nRounds = scene.rounds.length;
  const verdictBeat = scene.sayVerdict ? offset + nRounds : -1;
  const totalBeats = offset + nRounds + (scene.sayVerdict ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true });

  // ─── pixel layout ──────────────────────────────────────────────────────────
  const crownLane = verdictBeat >= 0 ? unit * CROWN_LANE_UNITS : 0;
  const cardsTop = contentY + band + unit * 0.3 + crownLane;

  ctx.font = `800 ${unit * VERDICT_FONT_UNITS}px ${FONT_SANS}`;
  const verdictLines = scene.verdict ? wrapText(ctx, scene.verdict, contentW * 0.82).slice(0, VERDICT_MAX_LINES) : [];
  const verdictBoxH = verdictLines.length
    ? unit * (VERDICT_PAD_UNITS * 2 + VERDICT_LINE_UNITS * verdictLines.length)
    : 0;
  // The band ends at safeBottom, never at contentH: the verdict used to land at 78%
  // of frame height in 9:16, i.e. under the burned-in caption.
  const verdictBottom = safeBottom - unit * VERDICT_EDGE_UNITS;
  const verdictZone = verdictLines.length
    ? verdictBoxH + unit * (VERDICT_GAP_UNITS + VERDICT_EDGE_UNITS)
    : 0;

  const zoneH = Math.max(unit * 6, safeBottom - cardsTop - verdictZone);
  const cardH = Math.min(unit * (vertical ? CARD_H_UNITS : CARD_H_UNITS_WIDE), zoneH * CARD_H_ZONE_MAX);
  const vsGap = unit * (vertical ? VS_GAP_UNITS : VS_GAP_UNITS_WIDE);
  const cardW = Math.min((contentW - vsGap) / 2, unit * CARD_W_MAX_UNITS);
  // The rows share the fighters' span, so a row's winner mark sits under the card
  // it scores for instead of floating out at the content edge.
  const blockW = cardW * 2 + vsGap;
  const blockX = contentX + (contentW - blockW) / 2;
  const leftX = blockX;
  const rightX = blockX + blockW - cardW;
  const cardCy = cardsTop + cardH / 2;

  const rowsZoneTop = cardsTop + cardH + unit * ROWS_GAP_UNITS;
  const rowsZoneH = Math.max(unit, safeBottom - verdictZone - rowsZoneTop);
  const rowPitch = Math.min(
    rowsZoneH / nRounds,
    unit * (vertical ? ROW_PITCH_MAX_UNITS : ROW_PITCH_MAX_UNITS_WIDE)
  );
  const rowH = rowPitch * ROW_FILL;
  // Centred in its band, so a short list leaves equal air above and below instead
  // of crowding under the cards with 40% of the frame empty beneath it.
  const rowsTop = rowsZoneTop + (rowsZoneH - rowPitch * nRounds) / 2;
  const rowCy = (k: number) => rowsTop + k * rowPitch + rowPitch / 2;

  // ─── scores ────────────────────────────────────────────────────────────────
  const roundLanded = (k: number): number => {
    const bw = beatWindow(env.beats, offset + k, totalBeats);
    const span = Math.max(bw.end - bw.start, 0.001);
    return clamp01((env.p - (bw.start + 0.35 * span)) / (0.25 * span));
  };
  let leftScore = 0;
  let rightScore = 0;
  scene.rounds.forEach((r, k) => {
    if (roundLanded(k) >= 1) {
      if (r.winner === "left") leftScore++;
      else if (r.winner === "right") rightScore++;
    }
  });

  const verdictActive = verdictBeat >= 0 && active >= verdictBeat;
  const verdictT =
    verdictBeat >= 0 ? easeOutCubic(clamp01(beatT(env.beats, verdictBeat, totalBeats, env.p) * 2.2)) : 0;
  const leftWins = leftScore > rightScore;
  const rightWins = rightScore > leftScore;

  const activeRound = active >= offset && active < offset + nRounds ? active - offset : -1;
  const clashE =
    activeRound >= 0
      ? easeOutCubic(clamp01((beatT(env.beats, offset + activeRound, totalBeats, env.p) - 0.15) / 0.35))
      : 0;
  const activeWinner = activeRound >= 0 ? scene.rounds[activeRound].winner : null;

  // ─── per-frame state, derived once and shared by slab and chrome ───────────
  const sides = (["left", "right"] as const).map((side, i) => {
    const isLeft = side === "left";
    const isVictor = verdictActive && (isLeft ? leftWins : rightWins);
    const isDefeated = verdictActive && (isLeft ? rightWins : leftWins);
    const engaged = activeWinner === side;
    const appear = easeOutCubic(enterT(env, CARD_IN_MS, stagger(i, 2, DUR.step)));
    const leaning = engaged ? LEAN_ENGAGED : activeWinner === "tie" ? LEAN_TIE : LEAN_IDLE;
    // Both sides lean INWARD, so the clash can never carry a card off the frame.
    const lean = clashE * (isLeft ? 1 : -1) * unit * LEAN_UNITS * leaning;
    const emphasis = isVictor || engaged ? 1 : isDefeated ? SCALE_DEFEATED : SCALE_IDLE;
    const breathe = 1 - BREATHE * idle(env, PULSE_MS, isLeft ? 0 : Math.PI);
    const color = isLeft ? accent : secondary;
    return {
      side,
      isLeft,
      info: isLeft ? scene.left : scene.right,
      color,
      glow: isLeft ? accentGlow : secondaryGlow,
      score: isLeft ? leftScore : rightScore,
      isVictor,
      isDefeated,
      hot: isVictor || engaged,
      appear,
      scale: emphasis * lerp(SCALE_IN, 1, appear) * breathe,
      opacity: appear * (isDefeated ? 1 - 0.45 * verdictT : 1),
      cx: (isLeft ? leftX : rightX) + cardW / 2 + lean,
      face: isVictor || engaged ? lerpColor(THEME.panel, color, FACE_TINT) : shade(THEME.panel, IDLE_FACE_LIFT),
    };
  });

  const rows = scene.rounds.map((r, k) => {
    const beat = offset + k;
    const bt = beatT(env.beats, beat, totalBeats, env.p);
    const isCurrent = active === beat;
    const arrive = easeOutCubic(enterT(env, ROW_IN_MS, stagger(k, nRounds, DUR.step)));
    // Rows pre-exist as dim placeholders so the criterion list reads as a
    // scorecard from the first frame, then light up on their own beat.
    const lit = bt > 0 ? easeOutCubic(clamp01(bt * 3)) : 0;
    return {
      round: r,
      isCurrent,
      lit,
      landed: roundLanded(k),
      opacity: arrive * lerp(GHOST_ALPHA, 1, lit),
      scale: lerp(ROW_SCALE_IDLE, 1, isCurrent ? 1 : lit) * lerp(SCALE_IN, 1, arrive),
      face: isCurrent ? lerpColor(THEME.panel, accent, FACE_TINT) : shade(THEME.panel, IDLE_FACE_LIFT),
      edge: isCurrent ? accent : THEME.textDim,
      cy: rowCy(k),
    };
  });

  const cardSlabs: Slab[] = sides.map((s) => ({
    visible: s.appear > 0,
    cx: s.cx,
    cy: cardCy,
    w: cardW * s.scale,
    h: cardH * s.scale,
    radius: unit * CARD_RADIUS,
    opacity: s.opacity,
    face: s.face,
  }));
  const rowSlabs: Slab[] = rows.map((st) => ({
    visible: st.opacity > 0,
    cx: blockX + blockW / 2,
    cy: st.cy,
    w: blockW * st.scale,
    h: rowH * st.scale,
    radius: unit * ROW_RADIUS,
    opacity: st.opacity,
    face: st.face,
  }));

  // ─── 3D layer ──────────────────────────────────────────────────────────────
  const rect = {
    x: blockX,
    y: cardsTop,
    w: blockW,
    h: Math.max(unit, rowsTop + rowPitch * nRounds - cardsTop),
  };

  /** Pixels-per-world-unit and the pixel origin on the z=`z` plane. */
  const mappingAt = (camera: THREE.Camera, z: number) => {
    const o = projectToRect(camera, new THREE.Vector3(0, 0, z), rect);
    const ux = projectToRect(camera, new THREE.Vector3(1, 0, z), rect);
    const uy = projectToRect(camera, new THREE.Vector3(0, 1, z), rect);
    return { o, sx: ux.x - o.x, sy: o.y - uy.y };
  };

  const key = scene.id + "-showdown3d";

  // Per-slab state travels through render3D's `context`: `build` runs once per key,
  // so `update` reading `active`/`env.p` from this scope froze the whole scorecard
  // at frame 0.
  const build = (): ThreeBundle<{ cards: Slab[]; rows: Slab[] }> => {
    const s = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAM_FOV, rect.w / rect.h, 0.1, 100);
    camera.position.set(0, 0, CAM_DIST);
    camera.lookAt(0, 0, 0);
    studioLights(s, accent, secondary);

    const m = mappingAt(camera, SLAB_DEPTH / 2);
    const toWorld = (px: number, py: number) => ({ x: (px - m.o.x) / m.sx, y: (m.o.y - py) / m.sy });

    // Unit slabs scaled per frame from the pixel rect, so a layout change needs no
    // rebuild and the slab is always exactly the card or row it belongs to.
    const mk = () => {
      const g = makeBlock(1, 1, SLAB_DEPTH, THEME.panel, THEME.textDim);
      // The ground plane and grid are gone (both horizontal, so an on-axis camera
      // saw them edge-on as two lit bands), which leaves nothing to receive a
      // shadow — and the shadow camera's default frustum does not reach the slabs
      // at the edges of a 16:9 rect anyway.
      g.traverse((o) => {
        o.castShadow = false;
        o.receiveShadow = false;
        if (o instanceof THREE.LineSegments) o.visible = false;
      });
      s.add(g);
      return g;
    };
    const cards = [mk(), mk()];
    const rowBlocks = scene.rounds.map(() => mk());

    const place = (g: THREE.Group, st: Slab | undefined) => {
      g.visible = !!st?.visible;
      if (!st?.visible) return;
      const inset = st.radius * CORNER_COVER * 2;
      const c = toWorld(st.cx, st.cy);
      g.position.set(c.x, c.y, 0);
      g.scale.set(Math.max(0.001, st.w - inset) / m.sx, Math.max(0.001, st.h - inset) / m.sy, 1);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mat = o.material as THREE.MeshPhysicalMaterial;
          mat.transparent = true;
          mat.opacity = st.opacity;
          mat.color.set(st.face);
          mat.emissive.set(st.face);
        }
      });
    };

    const update = (_elapsedMs: number, data?: { cards: Slab[]; rows: Slab[] }) => {
      cards.forEach((g, i) => place(g, data?.cards[i]));
      rowBlocks.forEach((g, i) => place(g, data?.rows[i]));
    };

    return { scene: s, camera, update };
  };

  const cam = render3D(ctx, key, rect, build, env.elapsedMs, { cards: cardSlabs, rows: rowSlabs }, env);
  // Without WebGL the slabs never composite. Every rect is pixel-space either way,
  // so fill the bodies in 2D rather than shipping outlines on the bare background.
  const flat = !cam;

  // ─── fighters ──────────────────────────────────────────────────────────────
  sides.forEach((s, i) => {
    const slab = cardSlabs[i];
    if (!slab.visible) return;
    const cw = slab.w;
    const ch = slab.h;
    const x0 = s.cx - cw / 2;
    const y0 = cardCy - ch / 2;

    ctx.save();
    ctx.globalAlpha = s.opacity;
    if (flat) {
      roundRect(ctx, x0, y0, cw, ch, slab.radius);
      ctx.fillStyle = s.face;
      ctx.fill();
    }
    if (s.hot) {
      ctx.shadowColor = s.glow;
      ctx.shadowBlur = unit * GLOW.base * (0.7 + 0.4 * idle(env, PULSE_MS));
    }
    roundRect(ctx, x0, y0, cw, ch, slab.radius);
    ctx.strokeStyle = rgba(s.color, s.isDefeated ? 0.3 : s.hot ? 0.95 : 0.45);
    ctx.lineWidth = unit * (s.hot ? STROKE.base : STROKE.thin);
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    const iconPop = easeOutCubic(clamp01(s.appear * 1.6));
    if (s.info.icon && iconPop > 0.02) {
      const iconS = Math.min(unit * 1.4, ch * 0.3);
      ctx.save();
      ctx.globalAlpha = s.opacity * iconPop;
      drawIcon(ctx, s.info.icon, s.cx, y0 + ch * 0.26, iconS * iconPop, env, s.color);
      ctx.restore();
    }

    ctx.textAlign = "center";
    const labelCap = Math.min(unit, ch * 0.2);
    const labelPx = fitFontSize(ctx, s.info.label, {
      maxW: cw - unit * 0.9,
      startPx: labelCap,
      minPx: Math.min(unit * 0.55, labelCap),
      weight: 800,
    });
    ctx.font = `800 ${labelPx}px ${FONT_SANS}`;
    ctx.fillStyle = s.isDefeated ? THEME.textDim : THEME.text;
    ctx.fillText(s.info.label, s.cx, y0 + ch * 0.62);

    const scorePx = Math.min(unit * 1.15, ch * 0.26);
    const scoreY = y0 + ch * 0.94;
    const scorePop = 1 + 0.2 * easeOutBack(clamp01(activeWinner === s.side ? clashE : 0));
    ctx.save();
    ctx.translate(s.cx, scoreY - scorePx * 0.35);
    ctx.scale(scorePop, scorePop);
    ctx.font = `900 ${scorePx}px ${FONT_MONO}`;
    ctx.fillStyle = s.color;
    ctx.fillText(String(s.score), 0, scorePx * 0.35);
    ctx.restore();
    ctx.restore();

    if (s.isVictor && crownLane > 0) {
      const crownT = easeOutBack(clamp01(verdictT * 1.4));
      const crownS = Math.min(unit * 1.2, crownLane * 0.9);
      ctx.save();
      ctx.globalAlpha = clamp01(verdictT * 2);
      ctx.translate(s.cx, cardsTop - crownLane * 0.45);
      const sc = Math.max(0.01, crownT) * (1 + 0.05 * (idle(env, PULSE_MS) - 0.5));
      ctx.scale(sc, sc);
      ctx.font = `${crownS}px ${FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(CROWN, 0, 0);
      ctx.restore();
    }
  });

  // ─── VS badge ──────────────────────────────────────────────────────────────
  const vsIn = easeOutBack(enterT(env, VS_IN_MS));
  if (vsIn > 0) {
    const vsR = unit * VS_R_UNITS;
    const pulse = 1 + 0.06 * (idle(env, PULSE_MS) - 0.5);
    ctx.save();
    ctx.translate(blockX + blockW / 2, cardCy);
    ctx.scale(vsIn * pulse, vsIn * pulse);
    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * GLOW.soft;
    ctx.beginPath();
    ctx.arc(0, 0, vsR, 0, Math.PI * 2);
    ctx.fillStyle = shade(THEME.panel, -0.4);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * STROKE.base;
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.font = `900 italic ${vsR * 0.82}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VS", 0, 0);
    ctx.restore();
  }

  // ─── scorecard rows ────────────────────────────────────────────────────────
  rows.forEach((st, k) => {
    const slab = rowSlabs[k];
    if (!slab.visible) return;
    const r = st.round;
    const rw = slab.w;
    const rh = slab.h;
    const x0 = blockX + blockW / 2 - rw / 2;
    const y0 = st.cy - rh / 2;
    const pillR = Math.min(rh * 0.34, unit * 0.55);
    const laneW = unit * 0.5 + pillR * 2 + unit * 0.3;

    ctx.save();
    ctx.globalAlpha = st.opacity;
    if (flat) {
      roundRect(ctx, x0, y0, rw, rh, slab.radius);
      ctx.fillStyle = st.face;
      ctx.fill();
    }
    roundRect(ctx, x0, y0, rw, rh, slab.radius);
    ctx.strokeStyle = rgba(st.isCurrent ? accent : THEME.textDim, st.isCurrent ? 0.85 : 0.35);
    ctx.lineWidth = unit * (st.isCurrent ? STROKE.base : STROKE.thin);
    ctx.stroke();

    const showNote = !!r.note && rh >= unit * NOTE_MIN_ROW_UNITS;
    const critCap = Math.min(unit * 0.9, rh * (showNote ? 0.46 : 0.56));
    const critPx = fitFontSize(ctx, r.criterion, {
      maxW: rw - laneW * 2,
      startPx: critCap,
      minPx: Math.min(unit * 0.5, critCap),
      weight: 700,
    });
    const textScale = lerp(TEXT_SCALE_IN, 1, st.lit);
    ctx.translate(x0 + rw / 2, st.cy);
    ctx.scale(textScale, textScale);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${critPx}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.fillText(r.criterion, 0, showNote ? -rh * 0.06 : critPx * 0.36);
    if (showNote && r.note) {
      const notePx = Math.min(unit * 0.55, rh * 0.28);
      ctx.font = `500 ${notePx}px ${FONT_SANS}`;
      ctx.fillStyle = THEME.textDim;
      const noteLine = wrapText(ctx, r.note, rw - laneW * 2)[0] ?? r.note;
      ctx.fillText(noteLine, 0, rh * 0.34);
    }
    ctx.restore();

    if (st.landed <= 0) return;

    const markScale = Math.max(0.01, easeOutBack(st.landed));
    const drawMark = (side: "left" | "right", glyph: string, tone: string, strong: boolean) => {
      const px = side === "left" ? x0 + unit * 0.5 + pillR : x0 + rw - unit * 0.5 - pillR;
      ctx.save();
      ctx.globalAlpha = st.opacity * (strong ? 1 : 0.65);
      ctx.translate(px, st.cy);
      ctx.scale(markScale, markScale);
      ctx.beginPath();
      ctx.arc(0, 0, pillR, 0, Math.PI * 2);
      ctx.fillStyle = rgba(tone, strong ? 0.9 : 0.22);
      ctx.fill();
      ctx.font = `800 ${pillR * 1.05}px ${FONT_SANS}`;
      ctx.fillStyle = strong ? THEME.bgBottom : THEME.textDim;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, 0, 0);
      ctx.restore();
    };
    if (r.winner === "tie") {
      // A tie belongs to both sides; centring one mark would print it over the criterion.
      drawMark("left", "=", THEME.textDim, false);
      drawMark("right", "=", THEME.textDim, false);
    } else {
      const isLeft = r.winner === "left";
      drawMark(r.winner, "✓", isLeft ? accent : secondary, true);

      if (st.landed < 1) {
        const from = { x: isLeft ? x0 + unit * 0.5 + pillR : x0 + rw - unit * 0.5 - pillR, y: st.cy };
        const target = sides[isLeft ? 0 : 1];
        const to = { x: target.cx, y: cardCy + cardH * 0.3 };
        const e = easeOutCubic(st.landed);
        ctx.save();
        ctx.globalAlpha = st.opacity * (1 - st.landed * 0.4);
        ctx.font = `900 ${Math.min(unit * 0.85, rh * 0.7)}px ${FONT_MONO}`;
        ctx.fillStyle = target.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("+1", lerp(from.x, to.x, e), lerp(from.y, to.y, e));
        ctx.restore();
      }
    }
  });

  // ─── verdict ───────────────────────────────────────────────────────────────
  if (verdictLines.length && (verdictBeat < 0 ? env.p > VERDICT_P : verdictActive)) {
    const t = verdictBeat < 0 ? easeOutCubic(sub(env.p, VERDICT_P, 0.15)) : verdictT;
    if (t > 0) {
      const isDraw = leftScore === rightScore;
      const tone = isDraw ? THEME.warn : leftWins ? accent : secondary;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.font = `800 ${unit * VERDICT_FONT_UNITS}px ${FONT_SANS}`;
      const textW = Math.max(...verdictLines.map((l) => ctx.measureText(l).width));
      const boxW = Math.min(contentW, textW + unit * 3);
      const boxY = verdictBottom - verdictBoxH;
      const pop = lerp(TEXT_SCALE_IN, 1, easeOutCubic(t));
      ctx.translate(w / 2, boxY + verdictBoxH / 2);
      ctx.scale(pop, pop);

      ctx.shadowColor = rgba(isDraw ? THEME.warn : tone, 0.35);
      ctx.shadowBlur = unit * GLOW.soft * (0.6 + 0.4 * idle(env, PULSE_MS));
      roundRect(ctx, -boxW / 2, -verdictBoxH / 2, boxW, verdictBoxH, unit * CARD_RADIUS);
      ctx.fillStyle = rgba(tone, 0.16);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.strokeStyle = rgba(tone, 0.8);
      ctx.lineWidth = unit * STROKE.thin;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isDraw ? THEME.warn : THEME.text;
      const lineH = unit * VERDICT_LINE_UNITS;
      verdictLines.forEach((line, i) =>
        ctx.fillText(line, 0, (i - (verdictLines.length - 1) / 2) * lineH)
      );
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

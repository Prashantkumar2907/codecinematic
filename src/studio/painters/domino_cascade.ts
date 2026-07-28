import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  clamp01,
  sub,
  enterT,
  idle,
  roundRect,
  drawSceneTitle,
  drawArrowhead,
  fitFontSize,
  wrapText,
  beatT,
  beatWindow,
  activeBeatIndex,
  isoBox3D,
  glowRing,
  rgba,
} from "./common";
import { drawIcon } from "./icons";
import type { PaintEnv } from "./index";

type DominoScene = Extract<Scene, { kind: "domino_cascade" }>;
type Tile = { x: number; y: number; w: number; h: number; pivotX: number; pivotY: number };

const DEG = Math.PI / 180;
const FALL_ANGLE = 80;
const PRE_TILT = 9;
const CONTACT_FRAC = 0.42;
const INK = "#06121a";

/**
 * A row (16:9) or column (9:16) of standing domino tiles that topple one into
 * the next: each tile rotates about the base corner nearest its neighbour,
 * racing to FALL_ANGLE partway through its OWN narration beat (striking the
 * next tile, which shows a small anticipatory nudge before its own beat even
 * starts), then settles with a decaying impact wobble and stays down. This is
 * the general visual grammar for any compounding cause-effect chain — a wage
 * rise that feeds back into prices, a killed node that cascades into a retry
 * storm, a page fault that starves the CPU into more page faults.
 */
export function paintDominoCascade(ctx: CanvasRenderingContext2D, scene: DominoScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH, vertical } = layout;
  const { accent, accentGlow, secondary } = env.palette;
  const n = scene.dominoes.length;
  const offset = introBeatCount(scene);
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const activeIdx = active - offset;
  const inTail = env.p >= beatWindow(env.beats, totalBeats - 1, totalBeats).end;
  const introIn = easeOutCubic(enterT(env, 380));
  const titleP = Math.max(env.p, enterT(env, 420) * 0.12);

  const band = drawSceneTitle(ctx, scene.title, layout, titleP, accent) + unit * 0.5;
  const areaY = contentY + band;
  let areaH = contentH - band;
  if (vertical) areaH = Math.min(areaH, layout.h * 0.86 - areaY);

  // Tile geometry at rest (angle 0): standing tall perpendicular to the row
  // axis, base pinned to a shared floor (horizontal) or wall (vertical) line
  // so every tile falls "forward" — toward larger index — along that axis.
  const tiles: Tile[] = [];
  let floorX1: number, floorY1: number, floorX2: number, floorY2: number;
  let captionAt: (i: number) => { x: number; y: number; align: CanvasTextAlign };
  let capMaxW: number;

  if (!vertical) {
    const gapMain = contentW / n;
    const THICK = Math.min(unit * 1.05, gapMain * 0.38);
    const LEN = Math.min(areaH * 0.56, unit * 4.4);
    const floorY = areaY + areaH * 0.64;
    for (let i = 0; i < n; i++) {
      const cx = contentX + (i + 0.5) * gapMain;
      const x = cx - THICK / 2;
      const y = floorY - LEN;
      tiles.push({ x, y, w: THICK, h: LEN, pivotX: x + THICK, pivotY: floorY });
    }
    floorX1 = tiles[0].x - gapMain * 0.35;
    floorX2 = tiles[n - 1].x + THICK + gapMain * 0.35;
    floorY1 = floorY2 = floorY;
    captionAt = (i) => ({ x: tiles[i].x + THICK / 2, y: floorY + unit * 1.05, align: "center" as CanvasTextAlign });
    capMaxW = Math.max(unit * 2.2, gapMain - unit * 0.4);
  } else {
    const gapMain = areaH / n;
    const THICK = Math.min(unit * 1.05, gapMain * 0.42);
    const LEN = Math.min(contentW * 0.48, unit * 4.4);
    const wallX = contentX + contentW * 0.3;
    for (let i = 0; i < n; i++) {
      const cy = areaY + (i + 0.5) * gapMain;
      const y = cy - THICK / 2;
      tiles.push({ x: wallX, y, w: LEN, h: THICK, pivotX: wallX, pivotY: y + THICK });
    }
    floorY1 = tiles[0].y - gapMain * 0.35;
    floorY2 = tiles[n - 1].y + THICK + gapMain * 0.35;
    floorX1 = floorX2 = wallX;
    captionAt = (i) => ({ x: wallX + LEN + unit * 0.7, y: tiles[i].y + THICK / 2, align: "start" as CanvasTextAlign });
    capMaxW = Math.max(unit * 2.4, contentX + contentW - (wallX + LEN) - unit * 0.9);
  }

  // Fall angle for tile i: 0 while untouched, a small anticipatory nudge once
  // the previous tile nears contact, a fast topple to FALL_ANGLE during its
  // own beat, then a decaying impact wobble that settles into a permanent lean.
  const angleFor = (i: number): number => {
    const tOwn = beatT(env.beats, offset + i, totalBeats, env.p);
    if (tOwn <= 0) {
      if (i === 0) return 0;
      const tPrev = beatT(env.beats, offset + i - 1, totalBeats, env.p);
      const nudge = clamp01((tPrev - (CONTACT_FRAC - 0.12)) / 0.12);
      return PRE_TILT * easeOutCubic(nudge);
    }
    if (tOwn < CONTACT_FRAC) {
      const start = i === 0 ? 0 : PRE_TILT;
      return start + (FALL_ANGLE - start) * easeOutCubic(tOwn / CONTACT_FRAC);
    }
    const settleT = clamp01((tOwn - CONTACT_FRAC) / (1 - CONTACT_FRAC));
    const wobble = Math.sin(settleT * Math.PI * 2.4) * 3.2 * Math.exp(-settleT * 5);
    return FALL_ANGLE + wobble;
  };

  // Floor / wall guide line.
  ctx.save();
  ctx.globalAlpha = introIn * 0.35;
  ctx.strokeStyle = rgba(accent, 0.6);
  ctx.lineWidth = unit * 0.09;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(floorX1, floorY1);
  ctx.lineTo(floorX2, floorY2);
  ctx.stroke();
  ctx.restore();

  // Trigger cue: a small pulsing arrow nudging the first domino before it falls.
  const t0 = beatT(env.beats, offset, totalBeats, env.p);
  const pushIn = enterT(env, 400, 120) * clamp01(1 - t0 / 0.3);
  if (pushIn > 0) {
    const bump = idle(env, 700) * unit * 0.12;
    const px = !vertical ? tiles[0].x - unit * 0.75 - bump : tiles[0].x + tiles[0].w / 2;
    const py = !vertical ? tiles[0].y + tiles[0].h * 0.5 : tiles[0].y - unit * 0.75 - bump;
    const ang = !vertical ? 0 : Math.PI / 2;
    ctx.save();
    ctx.globalAlpha = introIn * pushIn * 0.85;
    ctx.fillStyle = accent;
    drawArrowhead(ctx, px, py, ang, unit * 0.42);
    ctx.restore();
  }

  scene.dominoes.forEach((domino, i) => {
    const tile = tiles[i];
    const angle = angleFor(i);
    const tOwn = beatT(env.beats, offset + i, totalBeats, env.p);
    const solid = tOwn > 0 || angle > 0.05;
    const enter = enterT(env, 300, 60 + i * 40);

    if (!solid) {
      if (enter <= 0) return;
      ctx.save();
      ctx.globalAlpha = 0.14 * introIn * easeOutCubic(enter);
      ctx.strokeStyle = rgba(THEME.textDim, 0.85);
      ctx.lineWidth = unit * 0.05;
      ctx.setLineDash([unit * 0.24, unit * 0.2]);
      roundRect(ctx, tile.x, tile.y, tile.w, tile.h, Math.min(tile.w, tile.h) * 0.2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    const isActive = i === activeIdx;
    const face = isActive ? accent : secondary;

    ctx.save();
    ctx.globalAlpha = introIn;
    ctx.translate(tile.pivotX, tile.pivotY);
    ctx.rotate(angle * DEG);
    ctx.translate(-tile.pivotX, -tile.pivotY);

    isoBox3D(
      ctx,
      tile.x,
      tile.y,
      tile.w,
      tile.h,
      unit * 0.32,
      face,
      isActive ? accentGlow : undefined,
      Math.min(tile.w, tile.h) * 0.22
    );

    // Divider + pip marks so the tile reads as a domino, not a plain card.
    const midX = tile.x + tile.w / 2;
    const midY = tile.y + tile.h / 2;
    ctx.strokeStyle = rgba(INK, 0.4);
    ctx.lineWidth = unit * 0.035;
    ctx.beginPath();
    if (!vertical) {
      ctx.moveTo(tile.x + unit * 0.1, midY);
      ctx.lineTo(tile.x + tile.w - unit * 0.1, midY);
    } else {
      ctx.moveTo(midX, tile.y + unit * 0.1);
      ctx.lineTo(midX, tile.y + tile.h - unit * 0.1);
    }
    ctx.stroke();

    // Near-pivot half always gets a pip; far half gets the icon (or a second
    // pip when the domino has none), matching where its own beat's icon set is.
    const nearPt = !vertical ? { x: midX, y: tile.y + tile.h * 0.76 } : { x: tile.x + tile.w * 0.24, y: midY };
    const farPt = !vertical ? { x: midX, y: tile.y + tile.h * 0.3 } : { x: tile.x + tile.w * 0.72, y: midY };
    const pipR = Math.min(tile.w, tile.h) * 0.11;
    ctx.fillStyle = rgba(INK, 0.35);
    ctx.beginPath();
    ctx.arc(nearPt.x, nearPt.y, pipR, 0, Math.PI * 2);
    ctx.fill();

    if (domino.icon) {
      const iconSize = Math.min(tile.w, tile.h) * 0.85;
      drawIcon(ctx, domino.icon, farPt.x, farPt.y, iconSize, env, "#eaf3ff");
    } else {
      ctx.beginPath();
      ctx.arc(farPt.x, farPt.y, pipR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Impact spark where this tile strikes the next.
    if (i < n - 1) {
      const rt = sub(tOwn, CONTACT_FRAC - 0.1, 0.3);
      if (rt > 0 && rt < 1) {
        ctx.save();
        ctx.globalAlpha = introIn * (1 - rt) * 0.85;
        ctx.strokeStyle = accent;
        ctx.lineWidth = unit * 0.1;
        ctx.shadowColor = accentGlow;
        ctx.shadowBlur = unit * 0.6;
        ctx.beginPath();
        ctx.arc(tile.pivotX, tile.pivotY, unit * 0.3 + unit * 0.85 * easeOutCubic(rt), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Caption stays unrotated so it is legible through the whole fall.
    const capIn = easeOutCubic(clamp01(angle / 10));
    if (capIn > 0) {
      const anchor = captionAt(i);
      const maxW = capMaxW;
      ctx.save();
      ctx.globalAlpha = introIn * capIn;
      const px = fitFontSize(ctx, domino.label, { maxW, startPx: unit * 0.7, minPx: unit * 0.42, weight: 700 });
      ctx.font = `700 ${px}px ${FONT_SANS}`;
      ctx.fillStyle = isActive ? accent : THEME.text;
      ctx.textAlign = anchor.align;
      ctx.textBaseline = "middle";
      const lines = wrapText(ctx, domino.label, maxW).slice(0, 2);
      const lineH = px * 1.2;
      lines.forEach((line, li) => ctx.fillText(line, anchor.x, anchor.y + (li - (lines.length - 1) / 2) * lineH));
      ctx.restore();
    }

    // Final payoff: the last tile keeps a soft breathing glow once fully down.
    if (i === n - 1 && inTail) {
      ctx.save();
      ctx.globalAlpha = introIn * (0.4 + 0.3 * idle(env, 1600));
      glowRing(ctx, tile.pivotX, tile.pivotY, Math.min(tile.w, tile.h) * 0.9, accent, env, 1600);
      ctx.restore();
    }
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

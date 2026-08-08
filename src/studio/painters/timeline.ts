import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  easeOutCubic,
  enterT,
  wrapText,
  drawSceneTitle,
  beatT,
  activeBeatIndex,
  lerpColor,
  shade,
  DUR,
  GLOW,
  departT,
  roundRect,
  applyElevation,
  clearShadow,
  RADIUS,
} from "./common";
import type { PaintEnv } from "./index";

type TimelineScene = Extract<Scene, { kind: "timeline" }>;

const CURRENT_TINT = 0.22;
const BOB_UNITS = 0.14;
const SPINE_ALPHA = 0.3;

type Pt = { x: number; y: number };

export function paintTimeline(ctx: CanvasRenderingContext2D, scene: TimelineScene, env: PaintEnv) {
  const isHorizontal = (scene.orient ?? "vertical") === "horizontal" && !env.layout.vertical;
  const { layout } = env;
  const { unit, contentX, contentY, contentW, contentH } = layout;
  const { accent, accentGlow } = env.palette;
  const panelFill = THEME.panel;
  const panelEdge = shade(THEME.panel, 0.22);
  const offset = introBeatCount(scene);
  const n = scene.events.length;
  const totalBeats = offset + n;
  const active = activeBeatIndex(env.beats, totalBeats, env.p);

  const leave = departT(env, 380);
  if (leave <= 0) return;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent) + unit * 0.3;
  const areaTop = contentY + band;
  const areaH = contentH - band;

  // Clamp to the caption-safe band. Without this the last event lands under the
  // burned-in caption at 9:16.
  const rect = { x: contentX, y: areaTop, w: contentW, h: Math.max(unit, Math.min(areaH, layout.safeBottom - areaTop)) };
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const spreadX = rect.w * 0.42;
  const spreadY = rect.h * 0.4;

  /** Pixel position of event i's spine point, no bob. */
  const spinePos = (i: number): Pt =>
    isHorizontal
      ? { x: cx + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spreadX * 2), y: cy }
      : { x: cx, y: cy + (n === 1 ? 0 : (0.5 - i / (n - 1)) * spreadY * 2) };

  /** ONE idle bob shared by the card and its label, on the axis perpendicular to
   *  the spine, so the two can never drift apart the way separately-computed
   *  offsets used to. */
  const bobbedPos = (i: number, elapsedMs: number): Pt => {
    const p = spinePos(i);
    const bob = Math.sin(elapsedMs / 1200 + i * 0.5) * unit * BOB_UNITS;
    return isHorizontal ? { x: p.x, y: p.y + bob } : { x: p.x + bob, y: p.y };
  };

  const blockW = isHorizontal ? ((spreadX * 2) / n) * 0.82 : rect.w * 0.86;
  const blockH = isHorizontal ? unit * 2.4 : ((spreadY * 2) / n) * 0.82;

  const frameIn = easeOutCubic(enterT(env, DUR.base));

  // Connecting spine.
  ctx.save();
  ctx.globalAlpha = frameIn * SPINE_ALPHA * leave;
  ctx.strokeStyle = accent;
  ctx.lineWidth = unit * 0.06;
  ctx.beginPath();
  scene.events.forEach((_e, i) => {
    const p = spinePos(i);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();

  scene.events.forEach((e, i) => {
    const beatIdx = offset + i;
    const t = beatT(env.beats, beatIdx, totalBeats, env.p);
    if (t <= 0) return;

    const appear = easeOutCubic(Math.min(1, Math.max(0, t * 3)));
    const isCurrent = active === beatIdx;
    const at = bobbedPos(i, env.elapsedMs);
    const face = isCurrent ? lerpColor(panelFill, accent, CURRENT_TINT) : panelFill;

    ctx.save();
    ctx.globalAlpha = appear * leave;
    ctx.translate(at.x, at.y);
    ctx.scale(Math.max(0.001, appear), Math.max(0.001, appear));
    ctx.translate(-at.x, -at.y);

    if (isCurrent) {
      ctx.shadowColor = accentGlow;
      ctx.shadowBlur = unit * GLOW.soft;
    }
    applyElevation(ctx, unit, isCurrent ? "floating" : "raised");
    roundRect(ctx, at.x - blockW / 2, at.y - blockH / 2, blockW, blockH, unit * RADIUS.md);
    ctx.fillStyle = face;
    ctx.fill();
    clearShadow(ctx);
    roundRect(ctx, at.x - blockW / 2, at.y - blockH / 2, blockW, blockH, unit * RADIUS.md);
    ctx.strokeStyle = panelEdge;
    ctx.lineWidth = unit * 0.03;
    ctx.stroke();

    const halfW = blockW / 2;
    const cardCx = at.x;
    const cardCy = at.y;

    ctx.textAlign = isHorizontal ? "center" : "right";
    ctx.font = `800 ${unit * (isHorizontal ? 0.72 : 0.8)}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? accent : THEME.textDim;
    if (isHorizontal) {
      ctx.fillText(e.when, cardCx, cardCy + unit * 2.2);
    } else {
      ctx.fillText(e.when, cardCx - halfW * 0.42, cardCy + unit * 0.28);
    }

    ctx.textAlign = isHorizontal ? "center" : "start";
    ctx.font = `${isCurrent ? 700 : 500} ${unit * (isHorizontal ? 0.72 : 0.88)}px ${FONT_SANS}`;
    ctx.fillStyle = isCurrent ? THEME.text : THEME.textDim;

    const labelX = isHorizontal ? cardCx : cardCx - halfW * 0.34;
    const maxW = isHorizontal ? (contentW / n) * 0.9 : Math.max(unit * 4, halfW * 1.34 - unit * 0.5);
    const lines = wrapText(ctx, e.label, maxW).slice(0, 3);

    const baseY = isHorizontal ? cardCy - unit * 1.2 : cardCy + unit * 0.32 - (lines.length - 1) * unit * 0.62;
    lines.forEach((line, li) => {
      ctx.fillText(line, labelX, baseY + li * unit * 1.1 * (isHorizontal ? 0.8 : 1));
    });
    ctx.restore();
  });
  ctx.textAlign = "start";
}

import { introBeatCount, type Scene } from "../schema";
import {
  THEME,
  FONT_SANS,
  GLOW,
  STROKE,
  easeOutBack,
  easeOutCubic,
  enterT,
  idle,
  sub,
  clamp01,
  lerpColor,
  shade,
  wrapText,
  roundRect,
  drawSceneTitle,
  beatWindow,
  beatT,
  activeBeatIndex,
  departT,
  applyElevation,
  clearShadow,
  rgba,
} from "./common";
import { drawIcon, isVectorIcon } from "./icons";
import type { PaintEnv } from "./index";

type CompareScene = Extract<Scene, { kind: "compare" }>;

const DIM_ALPHA = 0.85;
const PANEL_RADIUS_UNITS = 0.7;
const BAR_H_UNITS = 0.34;
const PULSE_MS = 1600;
const ITEM_LINE_UNITS = 1.35;
const ITEM_GAP_UNITS = 0.7;
/** Icon + side title share one fixed-size line; 3.4 reserves half a line more than
 *  the title needs, which is the difference between 4 items fitting a 9:16 panel
 *  and one being dropped. */
const ITEMS_TOP_UNITS = 2.8;
const ITEM_TAIL_UNITS = 0.4;
const ITEM_FONT_UNITS = 0.95;
const ITEM_MAX_LINES = 2;
/** Floor on the item-block squeeze so a 4-item list stays legible at phone size
 *  rather than being clamped away entirely. */
const ITEM_FIT_MIN = 0.72;

export function paintCompare(ctx: CanvasRenderingContext2D, scene: CompareScene, env: PaintEnv) {
  const { layout } = env;
  const { unit, contentX, contentY, contentW, safeBottom, vertical, w } = layout;
  const { accent, accentGlow, secondary, secondaryGlow } = env.palette;
  const offset = introBeatCount(scene);
  const totalBeats = offset + 2 + (scene.sayVerdict ? 1 : 0);
  const active = activeBeatIndex(env.beats, totalBeats, env.p);
  const verdictBeat = scene.sayVerdict ? offset + 2 : -1;

  // One canonical layout: stacked at 9:16, side-by-side at 16:9. The previous third
  // "divider" variant added a dashed spine that carried no distinction the
  // colour-coded highlight bar didn't already give — collapsed under the phase's
  // one-look-per-kind decision.
  const leave = departT(env, 380);
  if (leave <= 0) return;

  const band = drawSceneTitle(ctx, scene.title, layout, env, accent, { centered: true });
  const panelsTop = contentY + band + unit * 0.3;
  const verdictBand = scene.verdict ? unit * 4.0 : unit * 0.5;
  const gap = unit * (vertical ? 1.6 : 2.2);

  const stacked = vertical;
  const pw = stacked ? contentW : (contentW - gap) / 2;
  const availH = Math.max(unit * 4, safeBottom - panelsTop - verdictBand);

  /** Height of the item block alone, at full size — the part that can be squeezed. */
  const itemsH = (items: string[]): number => {
    ctx.font = `500 ${unit * ITEM_FONT_UNITS}px ${FONT_SANS}`;
    let h = 0;
    for (const item of items) {
      const lines = Math.min(wrapText(ctx, item, pw - unit * 2.8).length, ITEM_MAX_LINES);
      h += unit * ITEM_LINE_UNITS * lines + unit * ITEM_GAP_UNITS;
    }
    return h + unit * ITEM_TAIL_UNITS;
  };

  const items = Math.max(itemsH(scene.left.items), itemsH(scene.right.items));
  const need = unit * ITEMS_TOP_UNITS + items;
  const ph = stacked ? Math.min(need, (availH - gap) / 2) : Math.min(need, availH);
  const blockH = stacked ? ph * 2 + gap : ph;
  const blockTop = panelsTop + Math.max(0, (availH - blockH) / 2);
  const fit = Math.max(ITEM_FIT_MIN, Math.min(1, (ph - unit * ITEMS_TOP_UNITS) / items));

  const panels = [
    { side: scene.left, x: contentX, y: blockTop, dir: -1, color: accent, glow: accentGlow, beatIdx: offset },
    {
      side: scene.right,
      x: stacked ? contentX : contentX + pw + gap,
      y: stacked ? blockTop + ph + gap : blockTop,
      dir: 1,
      color: secondary,
      glow: secondaryGlow,
      beatIdx: offset + 1,
    },
  ];

  const states = panels.map(({ x, y, dir, color, beatIdx }) => {
    const bt = beatT(env.beats, beatIdx, totalBeats, env.p);
    const appear = easeOutCubic(Math.min(1, bt * 2.5));
    const isCurrent = active === beatIdx;
    const alpha = isCurrent || (active >= verdictBeat && verdictBeat > 0) ? 1 : active > beatIdx ? DIM_ALPHA : 1;
    const scale = 0.95 + 0.05 * easeOutBack(Math.min(1, bt * 2.5));
    const slidePx = dir * (1 - appear) * unit * 1.6;
    return {
      bt,
      appear,
      isCurrent,
      alpha,
      scale,
      slidePx,
      visible: bt > 0,
      opacity: appear * alpha,
      face: isCurrent ? lerpColor(THEME.panel, color, 0.2) : shade(THEME.panel, 0.09),
    };
  });

  ctx.globalAlpha = leave;

  panels.forEach(({ side, x, y, dir, color, glow }, idx) => {
    const st = states[idx];
    if (!st.visible) {
      const ghostIn = easeOutCubic(enterT(env, 400));
      if (ghostIn > 0) {
        ctx.save();
        ctx.globalAlpha *= 0.18 * ghostIn;
        roundRect(ctx, x, y, pw, ph, unit * PANEL_RADIUS_UNITS);
        ctx.strokeStyle = color;
        ctx.lineWidth = unit * STROKE.thin;
        ctx.setLineDash([unit * 0.35, unit * 0.3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `800 ${unit * 1.05}px ${FONT_SANS}`;
        ctx.fillStyle = color;
        ctx.fillText(side.title, x + unit, y + unit * 1.5);
        ctx.restore();
      }
      return;
    }

    ctx.save();
    ctx.globalAlpha *= st.opacity;
    ctx.translate(x + pw / 2 + st.slidePx * st.scale, y + ph / 2);
    ctx.scale(st.scale, st.scale);
    ctx.translate(-(x + pw / 2), -(y + ph / 2));

    applyElevation(ctx, unit, st.isCurrent ? "floating" : "raised");
    roundRect(ctx, x, y, pw, ph, unit * PANEL_RADIUS_UNITS);
    ctx.fillStyle = st.face;
    ctx.fill();
    clearShadow(ctx);

    // The active side gets a real highlight, pulsing gently on the idle beat.
    if (st.isCurrent) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = unit * GLOW.base * (0.8 + 0.3 * idle(env, PULSE_MS));
    }
    roundRect(ctx, x, y, pw, ph, unit * PANEL_RADIUS_UNITS);
    ctx.strokeStyle = rgba(color, st.isCurrent ? 0.9 : 0.35);
    ctx.lineWidth = unit * (st.isCurrent ? STROKE.base : STROKE.thin);
    ctx.stroke();
    clearShadow(ctx);

    ctx.save();
    roundRect(ctx, x, y, pw, ph, unit * PANEL_RADIUS_UNITS);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, pw, unit * BAR_H_UNITS);
    ctx.restore();

    let titleX = x + unit * 1.0;
    if (side.icon) {
      const iconPop = easeOutBack(clamp01((st.bt - 0.1) * 3));
      const popS = Math.max(0, iconPop);

      if (isVectorIcon(side.icon)) {
        const iconS = unit * 1.5;
        ctx.save();
        ctx.translate(titleX + iconS / 2, y + unit * 1.1);
        ctx.scale(popS, popS);
        drawIcon(ctx, side.icon, 0, 0, iconS, env, color);
        ctx.restore();
        titleX += iconS + unit * 0.4;
      } else {
        ctx.font = `${unit * 1.3}px ${FONT_SANS}`;
        const tW = ctx.measureText(side.icon).width;
        ctx.save();
        ctx.translate(titleX + tW / 2, y + unit * 1.15);
        ctx.scale(popS, popS);
        ctx.fillText(side.icon, -tW / 2, unit * 0.45);
        ctx.restore();
        titleX += tW + unit * 0.45;
      }
    }
    ctx.font = `800 ${unit * 1.15}px ${FONT_SANS}`;
    ctx.fillStyle = color;
    ctx.fillText(side.title, titleX, y + unit * 1.6);

    const itemFont = unit * ITEM_FONT_UNITS * fit;
    const itemLineH = unit * ITEM_LINE_UNITS * fit;
    ctx.font = `500 ${itemFont}px ${FONT_SANS}`;
    let iy = y + unit * ITEMS_TOP_UNITS;
    const itemsBottom = y + ph - unit * 0.5;
    side.items.forEach((item, i) => {
      const it = clamp01(st.bt * side.items.length - i * 0.5);
      if (it <= 0) return;
      const lines = wrapText(ctx, item, pw - unit * 2.8).slice(0, ITEM_MAX_LINES);
      if (iy + itemLineH * (lines.length - 1) > itemsBottom) return;
      const ease = easeOutCubic(it);
      const slide = (1 - ease) * unit * 1.4 * dir;
      const pop = easeOutBack(clamp01(it * 1.6));
      const lift = (1 - pop) * unit * 0.8;

      ctx.save();
      ctx.translate(slide, lift);
      ctx.globalAlpha *= ease;
      const popSize = Math.max(0.01, pop);
      const bx = x + unit * 1.2;
      const by = iy - unit * 0.32;

      ctx.fillStyle = rgba(color, 0.25);
      ctx.beginPath();
      ctx.arc(bx, by, unit * 0.26 * popSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx, by, unit * 0.14 * popSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = THEME.text;
      lines.forEach((line, li) => ctx.fillText(line, x + unit * 1.9, iy + li * itemLineH));
      ctx.restore();
      iy += itemLineH * lines.length + unit * ITEM_GAP_UNITS * fit;
    });
    ctx.restore();
  });

  const rightWin = beatWindow(env.beats, offset + 1, totalBeats);
  const vsIn = easeOutBack(sub(env.p, rightWin.start, 0.1));
  if (vsIn > 0) {
    const vx = stacked ? contentX + contentW / 2 : contentX + pw + gap / 2;
    const vy = stacked ? blockTop + ph + gap / 2 : blockTop + ph / 2;
    const vsPulse = 1 + 0.05 * Math.sin(idle(env, 1900) * Math.PI * 2);
    ctx.save();
    ctx.translate(vx, vy);
    ctx.scale(vsIn * vsPulse, vsIn * vsPulse);

    const badgeGrad = ctx.createLinearGradient(0, -unit * 1.05, 0, unit * 1.05);
    badgeGrad.addColorStop(0, rgba(accent, 0.25));
    badgeGrad.addColorStop(1, shade(THEME.panel, -0.4));

    ctx.shadowColor = accentGlow;
    ctx.shadowBlur = unit * (0.8 + 0.4 * Math.sin(idle(env, 2100) * Math.PI));
    ctx.beginPath();
    ctx.arc(0, 0, unit * 1.15, 0, Math.PI * 2);
    ctx.fillStyle = badgeGrad;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = unit * 0.12;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, unit * 0.92, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(accent, 0.4);
    ctx.lineWidth = unit * STROKE.hair;
    ctx.stroke();

    ctx.font = `900 italic ${unit * 0.75}px ${FONT_SANS}`;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    ctx.fillText("VS", 0, unit * 0.26);
    ctx.restore();
  }

  if (scene.verdict) {
    const t = scene.sayVerdict
      ? easeOutCubic(Math.min(1, beatT(env.beats, verdictBeat, totalBeats, env.p) * 3))
      : easeOutCubic(sub(env.p, 0.78, 0.15));
    if (t > 0) {
      const vPop = easeOutBack(t);
      ctx.save();
      ctx.globalAlpha *= t;
      ctx.textAlign = "center";
      ctx.font = `700 ${unit * 0.95}px ${FONT_SANS}`;

      const ty = safeBottom - unit * 1.1;
      const lines = wrapText(ctx, scene.verdict, contentW * 0.9);
      const lineH = unit * 1.3;
      const totalH = lines.length * lineH;
      const startY = ty - (lines.length - 1) * lineH;

      ctx.translate(w / 2, startY + totalH / 2 - lineH * 0.4);
      ctx.scale(0.85 + 0.15 * vPop, 0.85 + 0.15 * vPop);
      ctx.translate(-w / 2, -(startY + totalH / 2 - lineH * 0.4));

      const label = (line: string, i: number) => (i === 0 ? `✓ ${line}` : line);
      const maxW = Math.max(...lines.map((l, i) => ctx.measureText(label(l, i)).width));
      const padX = unit * 1.5;
      const padY = unit * 0.8;

      applyElevation(ctx, unit, "raised");
      ctx.fillStyle = rgba(THEME.good, 0.1);
      ctx.strokeStyle = rgba(THEME.good, 0.3);
      ctx.lineWidth = unit * STROKE.thin;
      roundRect(ctx, w / 2 - maxW / 2 - padX, startY - lineH * 0.8 - padY / 2, maxW + padX * 2, totalH + padY * 1.5, unit * 0.8);
      ctx.fill();
      ctx.stroke();
      clearShadow(ctx);

      ctx.fillStyle = THEME.good;
      ctx.shadowColor = rgba(THEME.good, 0.5);
      ctx.shadowBlur = unit * (0.2 + 0.4 * idle(env, 2400));
      lines.forEach((line, i) => ctx.fillText(label(line, i), w / 2, startY + i * lineH));
      clearShadow(ctx);
      ctx.restore();
    }
  }
  ctx.textAlign = "start";
  ctx.globalAlpha = 1;
}
